import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Roda a funcao REAL, transpilada por esbuild (mesmo padrao de
// tests/bolsistaEBandaForaDosKpis.test.mjs) -- nao confere texto do arquivo.
async function carregarHelper() {
  const { code } = await esbuild.transform(read('src/lib/clipboard.ts'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clip-')), 'clipboard.mjs');
  fs.writeFileSync(arquivo, code, 'utf8');
  return import(`${pathToFileURL(arquivo).href}?v=${Math.random()}`);
}

// Ambiente de browser minimo: o suficiente para o helper rodar sem jsdom.
function definirGlobal(nome, valor) {
  Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });
}

function montarAmbiente({ comClipboardApi, execCommandCopia, roubarFoco }) {
  const eventos = { execCommandChamado: false, clipboardChamado: false, ordem: [] };
  let textoCopiado = null;
  let focado = null;

  const criarTextarea = () => {
    const el = {
      value: '',
      style: {},
      selectionStart: 0,
      selectionEnd: 0,
      setAttribute() {},
      focus() { focado = el; if (roubarFoco) focado = { fora: true }; },
      select() { el.selectionStart = 0; el.selectionEnd = el.value.length; },
      setSelectionRange(inicio, fim) { el.selectionStart = inicio; el.selectionEnd = fim; },
      isConnected: true,
      closest: () => null,
    };
    return el;
  };

  const corpo = { appendChild() {}, removeChild() {}, contains: () => true };

  definirGlobal('document', {
    body: corpo,
    createElement: criarTextarea,
    getSelection: () => null,
    execCommand() {
      eventos.execCommandChamado = true;
      eventos.ordem.push('execCommand');
      // O navegador devolve true mesmo sem copiar quando o foco foi roubado.
      if (execCommandCopia && focado && !focado.fora) textoCopiado = 'via-execCommand';
      return true;
    },
    get activeElement() { return focado; },
    querySelector: () => null,
  });

  // globalThis.navigator e somente leitura no Node 22: precisa de defineProperty.
  definirGlobal('navigator', {
    platform: 'Win32',
    ...(comClipboardApi
      ? {
          clipboard: {
            async writeText(texto) {
              eventos.clipboardChamado = true;
              eventos.ordem.push('clipboard');
              textoCopiado = texto;
            },
          },
        }
      : {}),
  });

  definirGlobal('window', { isSecureContext: comClipboardApi });

  return { eventos, lidoDoClipboard: () => textoCopiado };
}

function limparAmbiente() {
  for (const nome of ['document', 'navigator', 'window']) {
    Object.defineProperty(globalThis, nome, { value: undefined, configurable: true, writable: true });
  }
}

test('em browser normal usa a Clipboard API, que nao depende de foco', async () => {
  const { eventos, lidoDoClipboard } = montarAmbiente({
    comClipboardApi: true,
    execCommandCopia: false,
    roubarFoco: true, // focus trap do Radix ativo
  });
  try {
    const { copyTextToClipboard } = await carregarHelper();
    const resultado = await copyTextToClipboard('RELATORIO MENSAL');
    assert.equal(resultado.ok, true);
    assert.equal(resultado.method, 'clipboard');
    assert.equal(lidoDoClipboard(), 'RELATORIO MENSAL');
    assert.equal(eventos.ordem[0], 'clipboard', 'a API moderna precisa vir primeiro onde existe');
  } finally {
    limparAmbiente();
  }
});

// Regressao de 2026-09-02: dentro de um Dialog do Radix o focus trap devolve o
// foco durante a copia, e execCommand retorna true SEM copiar. Reportar sucesso
// nesse caso e o bug: o usuario ve "Relatorio copiado!" e cola o conteudo antigo.
test('nao reporta sucesso quando o execCommand nao copiou de verdade', async () => {
  const { lidoDoClipboard } = montarAmbiente({
    comClipboardApi: false, // sem API moderna, so resta o caminho antigo
    execCommandCopia: true,
    roubarFoco: true,
  });
  try {
    const { copyTextToClipboard } = await carregarHelper();
    const resultado = await copyTextToClipboard('RELATORIO MENSAL');
    assert.equal(lidoDoClipboard(), null, 'o cenario simula uma copia que nao aconteceu');
    assert.equal(resultado.ok, false, 'helper nao pode dizer que copiou quando o foco foi roubado');
  } finally {
    limparAmbiente();
  }
});

// A correcao de 2026-08-01 continua valendo: em browser incorporado (WebView)
// a Clipboard API costuma nao existir, e uma tentativa assincrona negada antes
// do execCommand consome a ativacao do clique.
test('sem Clipboard API cai no execCommand, sem await antes que consuma o clique', async () => {
  const { eventos, lidoDoClipboard } = montarAmbiente({
    comClipboardApi: false,
    execCommandCopia: true,
    roubarFoco: false,
  });
  try {
    const { copyTextToClipboard } = await carregarHelper();
    const resultado = await copyTextToClipboard('RELATORIO MENSAL');
    assert.equal(resultado.ok, true);
    assert.equal(resultado.method, 'execCommand');
    assert.equal(eventos.ordem[0], 'execCommand', 'nada pode rodar antes do fallback sincrono');
    assert.equal(lidoDoClipboard(), 'via-execCommand');
  } finally {
    limparAmbiente();
  }
});

test('texto vazio nao tenta copiar', async () => {
  montarAmbiente({ comClipboardApi: true, execCommandCopia: true, roubarFoco: false });
  try {
    const { copyTextToClipboard } = await carregarHelper();
    const resultado = await copyTextToClipboard('');
    assert.equal(resultado.ok, false);
  } finally {
    limparAmbiente();
  }
});

test('modal gerencial seleciona o texto visivel quando nenhuma copia e permitida', () => {
  const modal = read('src/components/App/Administrativo/ModalRelatorio.tsx');

  assert.match(modal, /const textoRelatorioRef\s*=\s*React\.useRef/);
  assert.match(modal, /textoRelatorioRef\.current\?\.select\(\)/);
  assert.match(modal, /<Textarea[\s\S]*?ref=\{textoRelatorioRef\}/);
});
