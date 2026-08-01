import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/index.ts',
);
const providerPath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/provider.ts',
);
const flowPath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/flow.ts',
);
const configPath = resolve(repoRoot, 'supabase/config.toml');
const claimMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql',
);
const fixturePath = resolve(
  repoRoot,
  'tests/fixtures/pesquisa_evasao_claim_pg17.sql',
);
const fixtureRunnerPath = resolve(
  repoRoot,
  'tests/helpers/runPesquisaEvasaoPg17Fixture.mjs',
);

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('edge bloqueia publico quando a data de nascimento nao e segura', () => {
  const edge = readOptional(edgePath);

  assert.match(edge, /resolverPublicoPesquisa\(aluno\.data_nascimento\)/);
  assert.doesNotMatch(edge, /function\s+alunoEhMenor\s*\(/);
  assert.match(
    edge,
    /DATA_NASCIMENTO_AUSENTE[\s\S]*ErroHttp\(422,[\s\S]*Data de nascimento nao cadastrada/,
  );
  assert.match(
    edge,
    /DATA_NASCIMENTO_INVALIDA[\s\S]*ErroHttp\(422,[\s\S]*Data de nascimento invalida/,
  );
});

test('edge resolve artigo e preposicao no servidor', () => {
  const edge = readOptional(edgePath);

  assert.match(
    edge,
    /import\s*\{[\s\S]*alunoComPreposicao[\s\S]*assinaturaComArtigo[\s\S]*\}\s*from\s*["']\.\/tratamentoGramatical\.ts["']/,
  );
  assert.match(
    edge,
    /assinatura_com_artigo:\s*assinaturaComArtigo\(assinatura\.assinaturaNome\)/,
  );
  assert.match(
    edge,
    /aluno_com_preposicao:\s*alunoComPreposicao\(\s*primeiroNome\(movimentacao\.aluno_nome\)/,
  );
});

function tokenizarTypeScript(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const atual = source[i];
    const proximo = source[i + 1];

    if (/\s/.test(atual)) {
      i += 1;
      continue;
    }

    if (atual === '/' && proximo === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (atual === '/' && proximo === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    if (atual === "'" || atual === '"' || atual === '`') {
      const delimitador = atual;
      let valor = '';
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          valor += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (source[i] === delimitador) {
          i += 1;
          break;
        }
        valor += source[i];
        i += 1;
      }
      tokens.push({ type: 'string', value: valor });
      continue;
    }

    if (/[A-Za-z_$]/.test(atual)) {
      let valor = atual;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) {
        valor += source[i];
        i += 1;
      }
      tokens.push({ type: 'identifier', value: valor });
      continue;
    }

    if (/[0-9]/.test(atual)) {
      let valor = atual;
      i += 1;
      while (i < source.length && /[0-9._]/.test(source[i])) {
        valor += source[i];
        i += 1;
      }
      tokens.push({ type: 'number', value: valor });
      continue;
    }

    const operador = [
      '===',
      '!==',
      '>>>',
      '=>',
      '==',
      '!=',
      '<=',
      '>=',
      '&&',
      '||',
      '??',
      '?.',
      '++',
      '--',
      '**',
    ].find((candidato) => source.startsWith(candidato, i));
    if (operador) {
      tokens.push({ type: 'punctuation', value: operador });
      i += operador.length;
      continue;
    }

    tokens.push({ type: 'punctuation', value: atual });
    i += 1;
  }

  return tokens;
}

function codigoExecutavel(source) {
  return tokenizarTypeScript(source)
    .map((token) => token.type === 'string'
      ? JSON.stringify(token.value)
      : token.value)
    .join(' ');
}

function chamadasComPrimeiroArgumentoString(source, metodo) {
  const tokens = tokenizarTypeScript(source);
  const chamadas = [];

  for (let i = 0; i < tokens.length - 3; i += 1) {
    if (
      tokens[i].value === '.' &&
      tokens[i + 1].value === metodo &&
      tokens[i + 2].value === '(' &&
      tokens[i + 3].type === 'string'
    ) {
      chamadas.push({
        argumento: tokens[i + 3].value,
        indice: i,
        tokens,
      });
    }
  }

  return chamadas;
}

function mutacoesSupabase(source) {
  const mutacoes = [];
  for (const chamada of chamadasComPrimeiroArgumentoString(source, 'from')) {
    const limite = Math.min(chamada.tokens.length, chamada.indice + 100);
    for (let i = chamada.indice + 4; i < limite - 1; i += 1) {
      if (
        chamada.tokens[i].value === '.' &&
        ['insert', 'update', 'upsert', 'delete'].includes(
          chamada.tokens[i + 1].value,
        )
      ) {
        mutacoes.push({
          tabela: chamada.argumento,
          operacao: chamada.tokens[i + 1].value,
        });
        break;
      }
      if (chamada.tokens[i].value === ';') break;
    }
  }
  return mutacoes;
}

function removerComentariosSql(source) {
  let output = '';
  let i = 0;
  let aspas = false;
  let dollarTag = null;

  while (i < source.length) {
    if (dollarTag) {
      if (source.startsWith(dollarTag, i)) {
        output += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        output += source[i];
        i += 1;
      }
      continue;
    }

    if (aspas) {
      output += source[i];
      if (source[i] === "'" && source[i + 1] === "'") {
        output += source[i + 1];
        i += 2;
      } else if (source[i] === "'") {
        aspas = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    const tag = source.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
    if (tag) {
      dollarTag = tag;
      output += tag;
      i += tag.length;
      continue;
    }

    if (source[i] === "'") {
      aspas = true;
      output += source[i];
      i += 1;
      continue;
    }

    if (source[i] === '-' && source[i + 1] === '-') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      output += '\n';
      continue;
    }

    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      output += ' ';
      continue;
    }

    output += source[i];
    i += 1;
  }

  return output;
}

test('artefatos da Edge segura, claim e runner destrutivo existem', () => {
  for (
    const path of [
      edgePath,
      providerPath,
      flowPath,
      claimMigrationPath,
      fixturePath,
    ]
  ) {
    assert.equal(existsSync(path), true, `arquivo ausente: ${path}`);
  }
  assert.equal(
    existsSync(fixtureRunnerPath),
    true,
    `runner seguro ausente: ${fixtureRunnerPath}`,
  );
  const runner = readOptional(fixtureRunnerPath);
  assert.match(runner, /randomBytes/i);
  assert.match(runner, /pesquisa_evasao_fixture_/i);
  assert.match(runner, /postgres:17/i);
  assert.match(runner, /server_version_num/i);
  assert.match(runner, /dropdb[\s\S]*--force/i);
  assert.match(runner, /um GUC isolado jamais pode autorizar/i);
});

test('config exige JWT no gateway para enviar-pesquisa-evasao', () => {
  const config = readOptional(configPath).replace(/#.*$/gm, '');
  assert.match(
    config,
    /\[functions\.enviar-pesquisa-evasao\]\s*verify_jwt\s*=\s*true\b/i,
  );
});

test('Edge aceita somente POST/OPTIONS, autentica token real e valida o request V2', () => {
  const edge = codigoExecutavel(readOptional(edgePath));

  assert.match(edge, /req \. method === "OPTIONS"/);
  assert.match(edge, /req \. method !== "POST"/);
  assert.match(edge, /headers \. get \( "Authorization" \)/);
  assert.match(edge, /auth \. getUser \(/);
  assert.match(edge, /validarRequest \(/);
  assert.match(edge, /request \. acao === "previsualizar"/);
  assert.match(edge, /request \. acao === "confirmar"/);
  assert.doesNotMatch(edge, /operador\s*=\s*"sistema"/i);
  assert.doesNotMatch(edge, /telefone_override/i);
});

test('Edge nao muta fontes canonicas nem faz upsert direto do cabecalho', () => {
  const edgeSource = readOptional(edgePath);
  const proibidas = mutacoesSupabase(edgeSource).filter(({ tabela }) =>
    ['alunos', 'movimentacoes_admin', 'pesquisa_evasao'].includes(tabela)
  );
  assert.deepEqual(proibidas, []);

  const rpcs = chamadasComPrimeiroArgumentoString(edgeSource, 'rpc')
    .map(({ argumento }) => argumento);
  assert.ok(rpcs.includes('claim_pesquisa_evasao_preview'));
  assert.ok(rpcs.includes('registrar_resultado_pesquisa_evasao_envio'));
  assert.ok(rpcs.includes('is_movimentacao_admin_retencao_valida'));
  assert.ok(!rpcs.some((rpc) => /permissao_estrita/i.test(rpc)));
  assert.ok(!rpcs.includes('criar_pesquisa_evasao'));
});

test('preview usa configuracao fail-closed, snapshot canonico, hash e dez minutos', () => {
  const edge = codigoExecutavel(readOptional(edgePath));
  const guardSlot = edge.match(
    /async function exigirSlotDisponivelParaPreview[\s\S]*?async function previsualizar/,
  )?.[0] ?? '';
  const previsualizacao = edge.match(
    /async function previsualizar[\s\S]*?async function confirmar/,
  )?.[0] ?? '';

  assert.match(edge, /pesquisa_evasao_templates/);
  assert.match(edge, /templates \. length !== 1/);
  assert.match(edge, /pesquisa_evasao_assinaturas/);
  assert.match(edge, /resolverDestinoPesquisaPorPublico \(/);
  assert.match(edge, /telefoneSnapshot : movimentacao \. telefone_snapshot/);
  assert.match(edge, /telefoneResponsavel : aluno \. responsavel_telefone/);
  assert.match(edge, /renderizarMensagem \(/);
  assert.match(edge, /hashPreview \(/);
  assert.match(edge, /pesquisa_evasao_previews/);
  assert.match(edge, /10 \* 60 \* 1000/);
  assert.match(guardSlot, /from \( "pesquisa_evasao" \)/);
  assert.match(guardSlot, /eq \( "evasao_id" , evasaoId \)/);
  assert.match(guardSlot, /eq \( "modo_teste" , modoTeste \)/);
  assert.match(
    guardSlot,
    /in \( "envio_status" , \[ "enviando" , "incerto" \] \)/,
  );
  assert.match(
    guardSlot,
    /if \( modoTeste \)[\s\S]*eq \( "telefone_destino_snapshot" , telefoneDestino \)/,
    'slot de teste deve incluir telefone; producao nao pode compartilhar esse filtro',
  );
  assert.match(
    previsualizacao,
    /exigirSlotDisponivelParaPreview \(/,
    'preview normal deve bloquear slot logico ativo antes de persistir',
  );
  assert.ok(
    previsualizacao.indexOf('exigirSlotDisponivelParaPreview') <
      previsualizacao.indexOf('. insert ('),
    'guard do slot precisa ocorrer antes do INSERT da preview',
  );
  for (
    const campo of [
      'preview_id',
      'expira_em',
      'aluno',
      'destinatario',
      'destinatario_tipo',
      'telefone_mascarado',
      'assinatura',
      'mensagem',
      'modo_teste',
      'alertas',
    ]
  ) {
    assert.match(edge, new RegExp(`\\b${campo}\\b`));
  }
});

test('confirmacao usa ownership persistido antes do claim sem RBAC por unidade', () => {
  const edgeSource = readOptional(edgePath);
  const edge = codigoExecutavel(edgeSource);
  const inicioConfirmacao = edge.indexOf('async function confirmar (');
  const confirmacao = edge.slice(
    inicioConfirmacao,
    edge.indexOf('serve (', inicioConfirmacao),
  );
  assert.ok(inicioConfirmacao >= 0, 'funcao confirmar ausente');

  assert.match(edge, /autenticarUsuarioAtivoUnico \(/);
  assert.match(edge, /auth_user_id/);
  assert.match(confirmacao, /previewPersistida \. auth_user_id !== identidade \. authUserId/);
  assert.match(edge, /claim_pesquisa_evasao_preview/);
  assert.match(edge, /mensagem_renderizada/);
  assert.doesNotMatch(edge, /autorizarIdentidadeComPreviewPersistida|permissao_estrita/i);
  assert.doesNotMatch(confirmacao, /resolverAssinaturaAtivaParaNovaPreview/);
  assert.match(edge, /confirmar_resultado_pesquisa_evasao_envio/);
  assert.match(edge, /classificacao \. providerMessageId/);
  assert.match(edge, /captura_resposta_preparada/);
  assert.match(edge, /warning/);
  assert.equal(
    (edge.match(/enviarAoProvider \(/g) ?? []).length,
    2,
    'deve existir somente a definicao e uma unica chamada de dispatch',
  );
});

test('provider nao promete idempotencia ausente e separa sucesso, falha e ambiguidade', () => {
  const provider = codigoExecutavel(readOptional(providerPath));
  const edge = codigoExecutavel(readOptional(edgePath));

  assert.match(provider, /falha_conhecida/);
  assert.match(provider, /incerto/);
  assert.match(provider, /sucesso/);
  assert.match(provider, /uazapi/);
  assert.match(provider, /waha/);
  assert.doesNotMatch(
    provider,
    /(?:uazapi|waha)[\s\S]{0,80}return true/i,
  );
  assert.match(provider, /AbortSignal \. timeout \(/);
  assert.match(provider, /fetchProviderComTimeout \(/);
  assert.match(edge, /enviarMensagemComCredenciaisExatas \(/);
  assert.match(edge, /from \( "whatsapp_caixas" \)/);
  assert.match(edge, /eq \( "id" , caixaId \)/);
  assert.match(edge, /eq \( "ativo" , true \)/);
  assert.match(edge, /ErroConfiguracaoProvider/);
  assert.doesNotMatch(edge, /getWhatsAppCredentials/);
  for (const campo of [
    'uazapi_url',
    'uazapi_token',
    'waha_url',
    'waha_session',
  ]) {
    assert.match(provider, new RegExp(campo));
  }
  assert.doesNotMatch(
    edge,
    /response = await fetch \(/,
    'dispatch nao pode ignorar o timeout explicito',
  );
});

test('claim SQL e service-only, serializa slots e nunca reenvia estado ambiguo', () => {
  const sql = removerComentariosSql(readOptional(claimMigrationPath));
  const claim = sql.match(
    /create\s+or\s+replace\s+function\s+public\.claim_pesquisa_evasao_preview\b[\s\S]*?\$function\$;/i,
  )?.[0] ?? '';

  assert.ok(claim, 'funcao claim_pesquisa_evasao_preview ausente');
  assert.match(claim, /security\s+definer/i);
  assert.match(claim, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(claim, /auth\.role\s*\(\s*\)[\s\S]*service_role/i);
  assert.match(claim, /for\s+update/i);
  assert.match(claim, /pg_advisory_xact_lock/i);
  assert.match(claim, /consumido_em/i);
  assert.match(claim, /expira_em/i);
  assert.match(claim, /idempotency_key/i);
  assert.match(claim, /deve_despachar/i);
  assert.match(claim, /modo_teste\s*=\s*false/i);
  assert.match(claim, /modo_teste\s*=\s*true/i);
  assert.match(claim, /envio_status\s+in\s*\(\s*'enviando'\s*,\s*'incerto'/i);
  assert.match(claim, /envio_status\s*=\s*'incerto'/i);
  assert.match(
    claim,
    /envio_status\s+in\s*\(\s*'nao_enviado'\s*,\s*'falhou'\s*\)[\s\S]*resposta_status\s*=\s*'sem_resposta'[\s\S]*status\s+in\s*\(\s*'pendente'\s*,\s*'falha_envio'\s*,\s*'sem_whatsapp'\s*\)/i,
    'reuso produtivo precisa de allowlist completa de estado reenviavel',
  );
  for (const campo of ['aluno_id', 'data_evasao_snapshot', 'caixa_id']) {
    assert.match(
      claim,
      new RegExp(`v_preview\\.${campo}\\s+is\\s+null`, 'i'),
      `claim deve validar ${campo} antes de consumir a preview`,
    );
  }
  assert.match(
    claim,
    /envio_status_tentativa\s*=\s*'bloqueado'/i,
    'preview perdedora precisa terminar bloqueada',
  );
  assert.match(
    claim,
    /pesquisa_evasao_claim_snapshot\s*\(\s*v_existente\.id\s*,\s*false\s*,\s*v_preview\.id/i,
    'claim perdedora deve retornar o proprio snapshot historico',
  );

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.claim_pesquisa_evasao_preview\s*\(\s*uuid\s*,\s*uuid\s*\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*mila_acesso_restrito\s*,\s*sol_acesso_restrito\s*,\s*fabio_agent\s*,\s*lia_acesso_restrito/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.claim_pesquisa_evasao_preview\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to\s+service_role/i,
  );
  assert.doesNotMatch(sql, /alter\s+default\s+privileges/i);
});

test('migration governa template unico e transicoes reconciliaveis', () => {
  const sql = removerComentariosSql(readOptional(claimMigrationPath));
  const edgeSource = codigoExecutavel(readOptional(edgePath));

  assert.match(
    sql,
    /create\s+unique\s+index[\s\S]*pesquisa_evasao_templates[\s\S]*publico[\s\S]*where\s+ativo/i,
  );
  assert.match(
    sql,
    /drop\s+index\s+if\s+exists\s+public\.pesquisa_evasao_templates_publico_ativo_uidx/i,
    'reaplicacao deve reparar indice homonimo antes de recria-lo',
  );
  assert.doesNotMatch(
    sql,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+pesquisa_evasao_templates_publico_ativo_uidx/i,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.registrar_resultado_pesquisa_evasao_envio\s*\(\s*p_pesquisa_id\s+uuid\s*,\s*p_preview_id\s+uuid\s*,\s*p_idempotency_key\s+uuid\s*,\s*p_auth_user_id\s+uuid\s*,\s*p_resultado\s+text\s*,\s*p_provider_message_id\s+text\s*,\s*p_erro_sanitizado\s+text\s*\)/i,
  );
  assert.match(
    sql,
    /drop\s+function[\s\S]*registrar_resultado_pesquisa_evasao_envio\s*\(\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*text\s*,\s*text\s*\)/i,
    'a assinatura antiga precisa ser removida explicitamente',
  );
  assert.match(
    sql,
    /from\s+public\.pesquisa_evasao_previews[\s\S]*pp\.id\s*=\s*p_preview_id[\s\S]*pp\.idempotency_key\s*=\s*p_idempotency_key[\s\S]*pp\.auth_user_id\s*=\s*p_auth_user_id[\s\S]*for\s+update[\s\S]*from\s+public\.pesquisa_evasao[\s\S]*pe\.id\s*=\s*p_pesquisa_id[\s\S]*pe\.preview_id\s*=\s*p_preview_id[\s\S]*pe\.idempotency_key\s*=\s*p_idempotency_key[\s\S]*for\s+update/i,
    'resultado deve travar a tentativa exata antes do cabecalho exato',
  );
  assert.match(
    edgeSource,
    /p_preview_id\s*:\s*claim\s*\.\s*preview_id[\s\S]*p_idempotency_key\s*:\s*claim\s*\.\s*idempotency_key/i,
    'Edge deve registrar o resultado com a identidade integral do claim',
  );
  assert.match(sql, /p_resultado[\s\S]*'enviado'[\s\S]*'falhou'[\s\S]*'incerto'/i);
  assert.match(sql, /provider_message_id/i);
  assert.match(sql, /envio_erro_sanitizado/i);
  for (
    const campo of [
      'envio_status_tentativa',
      'provider_message_id_tentativa',
      'envio_erro_sanitizado_tentativa',
      'envio_iniciado_em',
      'envio_finalizado_em',
    ]
  ) {
    assert.match(
      sql,
      new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${campo}\\b`, 'i'),
      `${campo} precisa compor o snapshot historico da tentativa`,
    );
  }
  assert.match(
    sql,
    /update\s+public\.pesquisa_evasao_previews[\s\S]*envio_status_tentativa/i,
    'resultado precisa atualizar atomicamente a preview atual',
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.confirmar_resultado_pesquisa_evasao_envio[\s\S]*pp\.id\s*=\s*p_preview_id[\s\S]*pp\.idempotency_key\s*=\s*p_idempotency_key[\s\S]*pp\.auth_user_id\s*=\s*p_auth_user_id[\s\S]*pp\.envio_status_tentativa\s*=\s*'enviado'[\s\S]*pp\.provider_message_id_tentativa\s*=\s*p_provider_message_id[\s\S]*pe\.envio_status\s*=\s*'enviado'[\s\S]*pe\.provider_message_id\s*=\s*p_provider_message_id/i,
    'releitura pos-timeout deve confirmar atomicamente a tentativa exata',
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.confirmar_resultado_pesquisa_evasao_envio[\s\S]*grant\s+execute[\s\S]*confirmar_resultado_pesquisa_evasao_envio[\s\S]*to\s+service_role/i,
    'releitura pos-timeout deve permanecer service-only',
  );
});

test('fixture PG17 cobre replay, ownership, expiracao, orfa, slots, stale e concorrencia', () => {
  const fixture = removerComentariosSql(readOptional(fixturePath));
  for (
    const evidencia of [
      'replay',
      'autor_errado',
      'expirada',
      'consumida_orfa',
      'producao_vs_teste',
      'concorrencia',
      'stale',
      'reconciliacao',
      'failed_retry_replay',
      'slot_race_terminal',
      'historico_tentativa',
      'orfa_sqlstate_mensagem',
      'reaplicacao',
      'terminal_legado',
      'snapshot_invariantes',
      'resultado_stale',
      'replay_resultado_sem_deadlock',
      'confirmacao_pos_timeout',
      'indice_homonimo_corrompido',
    ]
  ) {
    assert.match(fixture, new RegExp(evidencia, 'i'));
  }
  assert.match(fixture, /dblink_send_query/i);
  assert.match(fixture, /pesquisa_evasao\.fixture_sentinel/i);
  assert.match(fixture, /fixture_safety\.sentinel/i);
  assert.match(fixture, /server_version_num/i);
  assert.match(fixture, /current_database\s*\(\s*\)/i);
});

test(
  'fixture executavel passa em PostgreSQL 17 isolado',
  { skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER },
  async () => {
    const { runPesquisaEvasaoPg17Fixture } = await import(
      './helpers/runPesquisaEvasaoPg17Fixture.mjs'
    );
    const result = runPesquisaEvasaoPg17Fixture({
      container: process.env.PESQUISA_EVASAO_PG17_CONTAINER,
    });
    assert.match(result.stdout, /PESQUISA_EVASAO_CLAIM_PG17_OK/);
  },
);
