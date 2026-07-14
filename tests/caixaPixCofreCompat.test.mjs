import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importarTypeScript(caminho, sufixo = '') {
  const fonte = `${readFileSync(caminho, 'utf8')}\n${sufixo}`;
  const javascript = ts.transpileModule(fonte, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

async function carregarFormatadorFrontend() {
  return importarTypeScript(path.join(repoRoot, 'src/lib/caixaFinanceiro.ts'));
}

async function carregarFormatadorEdge() {
  const caminho = path.join(repoRoot, 'supabase/functions/caixa-financeiro-whatsapp/index.ts');
  const fonte = readFileSync(caminho, 'utf8');
  const inicio = fonte.indexOf('function n(');
  const fim = fonte.indexOf('function toCreds(');

  assert.ok(inicio >= 0 && fim > inicio, 'funcoes puras do relatorio nao foram encontradas na edge');

  const trecho = fonte.slice(inicio, fim);
  const javascript = ts.transpileModule(
    `${trecho}\nexport { resumoCaixa, formatarRelatorioCaixaWhatsApp };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const caixaDia06 = {
  data_caixa: '2026-07-06',
  saldo_inicial_cofre: 1612.8,
};

const movimentosDia06 = [
  {
    id: 'pix-385',
    ambiente: 'cofre',
    tipo: 'entrada',
    forma_pagamento: 'pix',
    descricao: 'Parcela da aluna Marcela dos Santos Leite',
    valor: 385,
  },
  {
    id: 'pix-460',
    ambiente: 'cofre',
    tipo: 'entrada',
    forma_pagamento: 'pix',
    descricao: 'Parcela Esther Araujo',
    valor: 460,
  },
  {
    id: 'pix-747',
    ambiente: 'cofre',
    tipo: 'entrada',
    forma_pagamento: 'pix',
    descricao: 'Parcela do aluno Athos e Joao dia 3/7',
    valor: 747,
  },
];

test('preview reconhece Pix legado no cofre sem alterar o saldo fisico', async () => {
  const { calcularResumoCaixa, formatarRelatorioCaixaWhatsApp } = await carregarFormatadorFrontend();
  const resumo = calcularResumoCaixa(caixaDia06, movimentosDia06);
  const texto = formatarRelatorioCaixaWhatsApp({
    caixa: caixaDia06,
    movimentos: movimentosDia06,
    unidadeNome: 'Barra',
    unidadeCodigo: 'BARRA',
    conferidoPor: 'Arthur',
  });

  assert.equal(resumo.vendasPix, 1592);
  assert.equal(resumo.saldoFinalCalculado, 1612.8);
  assert.match(texto, /Pix: R\$\s?1\.592,00/);
  assert.match(texto, /Marcela dos Santos Leite/);
  assert.match(texto, /Esther Araujo/);
  assert.match(texto, /Athos e Joao/);
  assert.match(texto, /06\/07\/2026/);
});

test('envio real do WhatsApp usa a mesma regra do preview', async () => {
  const { resumoCaixa, formatarRelatorioCaixaWhatsApp } = await carregarFormatadorEdge();
  const resumo = resumoCaixa(caixaDia06, movimentosDia06);
  const texto = formatarRelatorioCaixaWhatsApp({
    caixa: caixaDia06,
    movimentos: movimentosDia06,
    unidadeNome: 'Barra',
    unidadeCodigo: 'BARRA',
    conferidoPor: 'Arthur',
  });

  assert.equal(resumo.vendasPix, 1592);
  assert.equal(resumo.saldoFinalCalculado, 1612.8);
  assert.match(texto, /Pix: R\$\s?1\.592,00/);
  assert.match(texto, /Marcela dos Santos Leite/);
  assert.match(texto, /Esther Araujo/);
  assert.match(texto, /Athos e Joao/);
});

test('banco e formulario impedem novos pagamentos nao fisicos no cofre', () => {
  const migrationPath = path.join(
    repoRoot,
    'supabase/migrations/20260714152202_normalizar_caixa_cofre_nao_dinheiro.sql',
  );
  const form = readFileSync(
    path.join(repoRoot, 'src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx'),
    'utf8',
  );

  assert.ok(existsSync(migrationPath), 'migration de normalizacao ainda nao existe');
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /update\s+public\.caixa_movimentacoes[\s\S]*ambiente\s*=\s*'venda'/i);
  assert.match(migration, /check\s*\(\s*ambiente\s*<>\s*'cofre'\s+or\s+forma_pagamento\s*=\s*'dinheiro'\s*\)/i);
  assert.match(form, /ambiente\s*===\s*'cofre'\s*&&\s*formaPagamento\s*!==\s*'dinheiro'/);
});
