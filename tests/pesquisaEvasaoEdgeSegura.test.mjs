import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
const configPath = resolve(repoRoot, 'supabase/config.toml');
const claimMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql',
);
const fixturePath = resolve(
  repoRoot,
  'tests/fixtures/pesquisa_evasao_claim_pg17.sql',
);

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

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

test('artefatos da Edge segura e do claim existem', () => {
  for (const path of [edgePath, providerPath, claimMigrationPath, fixturePath]) {
    assert.equal(existsSync(path), true, `arquivo ausente: ${path}`);
  }
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
  assert.ok(rpcs.includes('usuario_tem_permissao_estrita'));
  assert.ok(!rpcs.includes('criar_pesquisa_evasao'));
});

test('preview usa configuracao fail-closed, snapshot canonico, hash e dez minutos', () => {
  const edge = codigoExecutavel(readOptional(edgePath));

  assert.match(edge, /pesquisa_evasao_templates/);
  assert.match(edge, /templates \. length !== 1/);
  assert.match(edge, /pesquisa_evasao_assinaturas/);
  assert.match(edge, /resolverDestinoPesquisa \(/);
  assert.match(edge, /telefoneSnapshot : movimentacao \. telefone_snapshot/);
  assert.match(edge, /renderizarMensagem \(/);
  assert.match(edge, /hashPreview \(/);
  assert.match(edge, /pesquisa_evasao_previews/);
  assert.match(edge, /10 \* 60 \* 1000/);
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

test('confirmacao usa ownership e escopo persistidos antes do claim', () => {
  const edge = codigoExecutavel(readOptional(edgePath));

  assert.match(edge, /autenticarUsuarioAtivoUnico \(/);
  assert.match(edge, /auth_user_id/);
  assert.match(edge, /unidade_id , modo_teste/);
  assert.match(edge, /autorizarIdentidadeComPreviewPersistida \(/);
  assert.match(edge, /claim_pesquisa_evasao_preview/);
  assert.match(edge, /mensagem_renderizada/);
  assert.doesNotMatch(edge, /confirmar[\s\S]*resolverAssinaturaAtivaParaNovaPreview/);
});

test('provider nao promete idempotencia ausente e separa sucesso, falha e ambiguidade', () => {
  const provider = codigoExecutavel(readOptional(providerPath));

  assert.match(provider, /falha_conhecida/);
  assert.match(provider, /incerto/);
  assert.match(provider, /sucesso/);
  assert.match(provider, /uazapi/);
  assert.match(provider, /waha/);
  assert.doesNotMatch(
    provider,
    /(?:uazapi|waha)[\s\S]{0,80}return true/i,
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

  assert.match(
    sql,
    /create\s+unique\s+index[\s\S]*pesquisa_evasao_templates[\s\S]*publico[\s\S]*where\s+ativo/i,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.registrar_resultado_pesquisa_evasao_envio/i,
  );
  assert.match(sql, /p_resultado[\s\S]*'enviado'[\s\S]*'falhou'[\s\S]*'incerto'/i);
  assert.match(sql, /provider_message_id/i);
  assert.match(sql, /envio_erro_sanitizado/i);
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
    ]
  ) {
    assert.match(fixture, new RegExp(evidencia, 'i'));
  }
  assert.match(fixture, /dblink_send_query/i);
  assert.match(fixture, /pesquisa_evasao\.fixture_guard/i);
});

test(
  'fixture executavel passa em PostgreSQL 17 isolado',
  { skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER },
  () => {
    const result = spawnSync(
      'docker',
      [
        'exec',
        process.env.PESQUISA_EVASAO_PG17_CONTAINER,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        "set pesquisa_evasao.fixture_guard = 'isolated_pg17'",
        '-f',
        '/workspace/tests/fixtures/pesquisa_evasao_claim_pg17.sql',
      ],
      { encoding: 'utf8' },
    );

    assert.equal(
      result.status,
      0,
      `fixture PG17 falhou\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
    assert.match(result.stdout, /PESQUISA_EVASAO_CLAIM_PG17_OK/);
  },
);
