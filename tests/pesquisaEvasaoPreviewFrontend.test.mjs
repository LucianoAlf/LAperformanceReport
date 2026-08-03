import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tabPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);
const modalPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx',
);
const editorPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/EditorMensagemPesquisaEvasao.tsx',
);
const typesPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);
const edgePath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/index.ts',
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
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
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

function codigoExecutavel(source, { preservarStrings = true } = {}) {
  return tokenizarTypeScript(source)
    .map((token) => {
      if (token.type !== 'string') return token.value;
      return preservarStrings ? JSON.stringify(token.value) : 'STRING';
    })
    .join(' ');
}

function objetosComAcao(source, acao) {
  const tokens = tokenizarTypeScript(source);
  const resultados = [];

  for (let i = 0; i < tokens.length - 3; i += 1) {
    if (
      tokens[i].value !== 'acao' ||
      tokens[i + 1].value !== ':' ||
      tokens[i + 2].type !== 'string' ||
      tokens[i + 2].value !== acao
    ) {
      continue;
    }

    let inicio = i;
    let nivel = 0;
    while (inicio >= 0) {
      if (tokens[inicio].value === '}') nivel += 1;
      if (tokens[inicio].value === '{') {
        if (nivel === 0) break;
        nivel -= 1;
      }
      inicio -= 1;
    }
    if (inicio < 0) continue;

    const propriedades = [];
    nivel = 0;
    for (let cursor = inicio + 1; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.value === '{') {
        nivel += 1;
        continue;
      }
      if (token.value === '}') {
        if (nivel === 0) {
          resultados.push(propriedades);
          break;
        }
        nivel -= 1;
        continue;
      }
      if (
        nivel === 0 &&
        token.type === 'identifier' &&
        tokens[cursor + 1]?.value === ':' &&
        ['{', ','].includes(tokens[cursor - 1]?.value)
      ) {
        propriedades.push(token.value);
      }
    }
  }

  return resultados;
}

test('cria os artefatos tipados da previsualizacao obrigatoria', () => {
  assert.equal(existsSync(modalPath), true, 'modal de preview ausente');
  assert.equal(existsSync(editorPath), true, 'editor da mensagem ausente');
  assert.equal(existsSync(typesPath), true, 'contrato TypeScript do preview ausente');
});

test('editor explicita a edicao, conta Unicode e mostra a aparencia no WhatsApp', () => {
  const editorSource = readOptional(editorPath);
  const editor = codigoExecutavel(editorSource);

  assert.match(editor, /< Textarea\b/);
  assert.match(editor, /value = \{ mensagem \}/);
  assert.match(editor, /onMensagemChange \( event \. target \. value \)/);
  assert.match(editorSource, /Você pode ajustar o texto antes de enviar\./);
  assert.match(editor, /Array \. from \( mensagem \) \. length/);
  assert.match(editorSource, /2\.000 caracteres/);
  assert.match(editor, /mensagem !== mensagemOriginal/);
  assert.match(editorSource, /Texto editado/);
  assert.match(editor, /mensagem \. trim \( \) \. length === 0/);
  assert.match(editor, /Math \. max \( 0 , totalCaracteres - 2_000 \)/);
  assert.match(editor, /role = "alert"/);
  assert.match(editor, /aria - describedby/);
  assert.match(editorSource, /Como aparecerá no WhatsApp/);
  assert.match(editor, /< PreviewWhatsAppFormatado\b/);
  assert.match(editor, /disabled = \{ desabilitado \}/);
  assert.doesNotMatch(editorSource, /maxLength\s*=/);
  assert.doesNotMatch(editorSource, /dangerouslySetInnerHTML/);
});

test('modal reinicia o texto por preview e bloqueia confirmacao invalida', () => {
  const modal = codigoExecutavel(readOptional(modalPath));

  assert.match(modal, /useState \( preview \?\. mensagem \?\? "" \)/);
  assert.match(
    modal,
    /useEffect \( \( \) => \{ if \( ! aberto \|\| ! preview \) return ; setMensagemFinal \( preview \. mensagem \)/,
  );
  assert.match(modal, /preview \?\. preview_id/);
  assert.match(modal, /< EditorMensagemPesquisaEvasao\b/);
  assert.match(modal, /onConfirmar \( mensagemFinal \)/);
  assert.match(modal, /mensagemFinal \. trim \( \) \. length === 0/);
  assert.match(modal, /Array \. from \( mensagemFinal \) \. length > 2_000/);
  assert.match(
    modal,
    /disabled = \{ confirmando \|\| expirado \|\| mensagemInvalida \}/,
  );
});

test('tipo do preview espelha exatamente os campos retornados pelo servidor', () => {
  const types = codigoExecutavel(readOptional(typesPath));
  const preview = types.match(
    /export interface PesquisaEvasaoPreview \{([\s\S]*?)\}/,
  )?.[1] ?? '';

  const propriedades = [...preview.matchAll(
    /\b([a-z_]+)\s*(?:\?)?\s*:/g,
  )].map((match) => match[1]);

  assert.deepEqual(propriedades, [
    'preview_id',
    'expira_em',
    'aluno',
    'destinatario',
    'destinatario_tipo',
    'telefone_mascarado',
    'unidade',
    'curso',
    'professor',
    'assinatura',
    'mensagem',
    'modo_teste',
    'alertas',
  ]);
  assert.match(
    preview,
    /destinatario_tipo\s*:\s*"aluno"\s*\|\s*"responsavel"\s*\|\s*"teste"/,
  );
  assert.match(preview, /curso\s*:\s*string\s*\|\s*null/);
  assert.match(preview, /professor\s*:\s*string\s*\|\s*null/);
  assert.match(preview, /alertas\s*:\s*string\s*\[\s*\]/);
});

test('requests de preview e confirmacao usam allowlists diferentes e exatas', () => {
  const tab = readOptional(tabPath);
  const previews = objetosComAcao(tab, 'previsualizar');
  const confirmacoes = objetosComAcao(tab, 'confirmar');

  assert.equal(previews.length, 1, 'deve existir um unico request de preview');
  assert.equal(
    confirmacoes.length,
    1,
    'somente a confirmacao explicita pode criar request confirmar',
  );

  for (const propriedades of previews) {
    assert.deepEqual(
      [...new Set(propriedades)].sort(),
      ['acao', 'evasao_id', 'modo_teste', 'telefone_teste'].sort(),
    );
  }
  for (const propriedades of confirmacoes) {
    assert.deepEqual(
      [...new Set(propriedades)].sort(),
      ['acao', 'preview_id'].sort(),
      'confirmacao deve enviar exatamente { acao, preview_id }',
    );
  }

  const estrutural = codigoExecutavel(tab, { preservarStrings: false });
  assert.doesNotMatch(estrutural, /\boperador\s*:/);
  assert.doesNotMatch(estrutural, /\bmensagem\s*:/);
  assert.doesNotMatch(estrutural, /\btelefone_override\s*:/);
});

test('modal Radix acessivel foca o titulo e comunica a irreversibilidade', () => {
  const modal = codigoExecutavel(readOptional(modalPath));

  assert.match(modal, /< Dialog\b/);
  assert.match(modal, /< DialogContent\b/);
  assert.match(modal, /aria - labelledby = "pesquisa-evasao-preview-titulo"/);
  assert.match(modal, /aria - describedby = "pesquisa-evasao-preview-descricao"/);
  assert.match(
    modal,
    /< DialogTitle[\s\S]*id = "pesquisa-evasao-preview-titulo"[\s\S]*tabIndex = \{ - 1 \}/,
  );
  assert.match(modal, /onOpenAutoFocus = \{/);
  assert.match(modal, /preventDefault \( \)/);
  assert.match(modal, /tituloRef \. current \?\. focus \( \)/);
  assert.match(readOptional(modalPath), /Essa ação não pode ser desfeita/i);
  assert.match(modal, /< DialogClose[\s\S]*>[\s\S]*Cancelar/);
});

test('modal mostra metadados, mensagem, alertas e confirmacao operacional', () => {
  const modalSource = readOptional(modalPath);
  const modal = codigoExecutavel(modalSource);

  for (const campo of [
    'aluno',
    'destinatario',
    'destinatario_tipo',
    'telefone_mascarado',
    'unidade',
    'curso',
    'professor',
    'assinatura',
    'mensagem',
    'modo_teste',
    'alertas',
  ]) {
    assert.match(modal, new RegExp(`preview \\. ${campo}\\b`));
  }
  assert.match(modal, /< EditorMensagemPesquisaEvasao\b/);
  assert.match(modal, /Confirmar envio como \{ preview \. assinatura \}/);
  assert.match(
    modal,
    /disabled = \{ confirmando \|\| expirado \|\| mensagemInvalida \}/,
  );
  assert.match(modal, /Loader2[\s\S]*animate-spin/);
  assert.ok(
    modalSource.indexOf('preview.alertas') <
      modalSource.indexOf('Confirmar envio como'),
    'alertas precisam aparecer antes da acao irreversivel',
  );
});

test('expiracao usa expira_em real, limpa timer e impede confirmar', () => {
  const modal = codigoExecutavel(readOptional(modalPath));

  assert.match(modal, /Date \. parse \( preview \. expira_em \)/);
  assert.match(modal, /Date \. now \( \)/);
  assert.match(modal, /window \. setInterval \(/);
  assert.match(modal, /window \. clearInterval \(/);
  assert.match(modal, /return \( \) => window \. clearInterval \(/);
  assert.match(
    modal,
    /if \( expirado \|\| confirmando \|\| mensagemInvalida \) return/,
  );
  assert.match(readOptional(modalPath), /Prévia expirada/i);
  assert.match(readOptional(modalPath), /gere uma nova prévia/i);
});

test('modo teste e legados TESTE ficam inequivocos e sem acoes operacionais', () => {
  const modal = codigoExecutavel(readOptional(modalPath));
  const tab = codigoExecutavel(readOptional(tabPath));
  const interpretador = tab.match(
    /function interpretarPesquisaStatus[\s\S]*?(?=function ehRegistro)/,
  )?.[0] ?? '';

  assert.match(readOptional(modalPath), /TESTE — não será enviado ao aluno/);
  assert.match(modal, /bg-yellow-/);
  assert.match(modal, /Telefone de teste/);
  assert.match(modal, /preview \. telefone_mascarado/);

  assert.match(interpretador, /startsWith \( prefixoTeste \)/);
  assert.match(interpretador, /slice \( prefixoTeste \. length \)/);
  assert.doesNotMatch(interpretador, /\bmodoTeste\b/);
  assert.match(tab, /registroTeste &&/);
  assert.match(readOptional(tabPath), /registroTeste[\s\S]*TESTE/);
  assert.match(
    tab,
    /! registroTeste && \[ "pendente" , "falha_envio" , "sem_whatsapp" \] \. includes \( statusBase \)/,
  );
  assert.match(
    tab,
    /! registroTeste && statusBase === "respondido"/,
  );
  assert.match(tab, /\{ ! registroTeste && expandido === evadido \. pesquisa_id/);
});

test('fluxo trata erros HTTP e so recarrega apos enviado confirmado', () => {
  const tab = codigoExecutavel(readOptional(tabPath));
  const confirmar = tab.match(
    /const confirmarEnvio = async \( \) => \{[\s\S]*?(?=const alterarModalPreview)/,
  )?.[0] ?? '';

  assert.match(tab, /error \. context instanceof Response/);
  assert.match(tab, /error \. context \. clone \( \) \. json \( \)/);
  assert.match(tab, /payload \. error/);
  assert.match(tab, /payload \. message/);
  assert.doesNotMatch(tab, /catch \( error : any \)/);
  assert.match(tab, /confirmandoRef \. current = true/);
  assert.match(tab, /if \( ! confirmandoRef \. current \) carregarDados \( \)/);

  assert.match(confirmar, /envio_status === "enviado"/);
  assert.match(confirmar, /await carregarDados \( \)/);
  assert.equal(
    (confirmar.match(/await carregarDados \( \)/g) ?? []).length,
    1,
    'confirmacao nao deve recarregar em estado incerto, bloqueado ou falho',
  );
  assert.equal(
    (confirmar.match(/functions \. invoke \(/g) ?? []).length,
    1,
    'confirmacao nao pode disparar nova chamada de recuperacao/retry',
  );
  assert.match(confirmar, /captura_resposta_preparada === false/);
  assert.match(confirmar, /toast \. warning \(/);
});

test('aviso de captura despreparada aparece somente em envio real', () => {
  const tab = codigoExecutavel(readOptional(tabPath));
  const confirmar = tab.match(
    /const confirmarEnvio = async \( \) => \{[\s\S]*?(?=const alterarModalPreview)/,
  )?.[0] ?? '';

  assert.match(
    confirmar,
    /resposta \. modo_teste !== true && resposta \. captura_resposta_preparada === false/,
    'teste nao prepara captura de resposta e nao deve produzir alerta operacional',
  );
});

test('confirmacao bloqueia X Escape outside e preserva o preview', () => {
  const tab = codigoExecutavel(readOptional(tabPath));
  const modal = codigoExecutavel(readOptional(modalPath));
  const alterarModal = tab.match(
    /const alterarModalPreview = \( aberto : boolean \) => \{[\s\S]*?\} ;/,
  )?.[0] ?? '';

  assert.match(
    alterarModal,
    /if \( ! aberto && confirmandoRef \. current \) return/,
    'onOpenChange nao pode fechar nem limpar o preview durante a confirmacao',
  );
  assert.match(
    modal,
    /if \( ! proximoAberto && confirmando \) return/,
    'o modal deve rejeitar pedidos de fechamento, inclusive o X',
  );
  assert.match(modal, /onOpenChange = \{ alterarAberto \}/);
  assert.match(
    modal,
    /onEscapeKeyDown = \{ \( event \) => \{ if \( confirmando \) event \. preventDefault \( \)/,
  );
  assert.match(
    modal,
    /onPointerDownOutside = \{ \( event \) => \{ if \( confirmando \) event \. preventDefault \( \)/,
  );
});

test('previsualizacao usa trava sincrona e desabilita todos os envios', () => {
  const tab = codigoExecutavel(readOptional(tabPath));
  const previsualizar = tab.match(
    /const previsualizarPesquisa = async \( evasaoId : number \) => \{[\s\S]*?(?=const confirmarEnvio)/,
  )?.[0] ?? '';

  assert.match(tab, /const previsualizandoRef = useRef \( false \)/);
  assert.match(
    previsualizar,
    /if \( previsualizandoRef \. current \|\| confirmandoRef \. current \) return/,
    'a trava deve impedir dois requests antes do proximo render',
  );
  assert.match(previsualizar, /previsualizandoRef \. current = true/);
  assert.match(previsualizar, /previsualizandoRef \. current = false/);
  assert.match(
    tab,
    /disabled = \{ previsualizando !== null \|\| confirmando \}/,
    'todos os botoes devem ficar desabilitados enquanto qualquer preview estiver em curso',
  );
});

test('Edge devolve unidade legivel e snapshots de curso/professor sem telefone aberto', () => {
  const edge = codigoExecutavel(readOptional(edgePath));
  const respostaPreview = edge.match(
    /return responderJson \( \{[\s\S]*?preview_id : preview \. id[\s\S]*?\} \) ;/,
  )?.[0] ?? '';

  assert.match(edge, /from \( "unidades" \)/);
  assert.match(respostaPreview, /unidade : unidadeNome/);
  assert.match(respostaPreview, /curso : cursoNome/);
  assert.match(respostaPreview, /professor : professorNome/);
  assert.match(respostaPreview, /telefone_mascarado : mascararTelefone \(/);
  assert.doesNotMatch(respostaPreview, /telefone_destino|destino \. telefone\s*[,}]/);
});
