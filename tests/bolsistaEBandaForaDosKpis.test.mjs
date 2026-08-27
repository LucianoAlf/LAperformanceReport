// Evasão/churn não contam banda nem bolsista.
//
// CASO (Jhon, ADM CG, 26/08/2026): "reparei hoje no Report que na parte de evasões
// está contabilizando bandas e bolsistas. No número de evasões".
//
// A regra é antiga (docs/REGRAS-DE-NEGOCIO.md §3.5, §3.6 e §3.7) e o filtro de
// atividade extra existe desde 16/06 (commit d1ae5052). Dois defeitos a furavam:
//
//  1. O filtro era aplicado ao `resumo` calculado no fetch, mas NÃO à lista que a
//     tela renderiza — a aba Cancelamentos saía de `movimentacoes` cru. Ficou
//     invisível até agosto/26, quando as ADMs encerraram os ciclos de banda em
//     lote (15 saídas de banda no mês, contra 0-6 nos meses anteriores).
//  2. Bolsista nunca foi filtrado em lugar nenhum. O churn ficava incoerente:
//     `evasoes / alunos_pagantes`, com bolsista no numerador e fora do denominador.
//
// Este teste roda a função REAL (transpilada por esbuild) — não confere texto.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/atividadesExtras.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'atx-')), 'atividadesExtras.mjs');
  writeFileSync(arquivo, code, 'utf8');
  return import(pathToFileURL(arquivo).href);
})();

const { isBolsistaOuBandaMatricula, contaNosKpis, filtrarRetencaoCanonica } = lib;

const bandaPorCurso = {
  tipo: 'evasao',
  cursos: { nome: 'Minha Banda Para Sempre', is_projeto_banda: true },
  alunos: { tipo_matricula_id: 5 },
};
const bolsistaEmCursoRegular = {
  tipo: 'evasao',
  cursos: { nome: 'Musicalização para Bebês', is_projeto_banda: false },
  alunos: { tipo_matricula_id: 3 },
};
const regular = {
  tipo: 'evasao',
  cursos: { nome: 'Bateria', is_projeto_banda: false },
  alunos: { tipo_matricula_id: 1 },
};

test('banda e bolsista ficam fora do KPI de evasao', () => {
  // Casos reais de CG/ago-26 que apareceram na lista do Jhon.
  assert.equal(contaNosKpis(bandaPorCurso), false, 'Ayres/Gustavo/Ester — Minha Banda');
  assert.equal(contaNosKpis(bolsistaEmCursoRegular), false, 'Saulo — BOLSISTA_INT em curso regular');
  assert.equal(contaNosKpis(regular), true, 'evasao regular continua contando');
});

test('bolsista em curso REGULAR e o caso que o filtro por curso nao pegava', () => {
  // Era o furo #2: `is_atividade_extra_curso` responde "este CURSO é banda/coral?"
  // e Musicalização para Bebês não é. Só o tipo de matrícula denuncia.
  assert.equal(lib.isAtividadeExtraAcademica(bolsistaEmCursoRegular), false);
  assert.equal(isBolsistaOuBandaMatricula(bolsistaEmCursoRegular), true);
});

test('os tres codigos fora do churn sao exatamente os da REGRAS-DE-NEGOCIO §3.6', () => {
  // BOLSISTA_INT=3, BOLSISTA_PARC=4, BANDA=5 (conferido em tipos_matricula).
  for (const id of [3, 4, 5]) {
    assert.equal(isBolsistaOuBandaMatricula({ alunos: { tipo_matricula_id: id } }), true, `id ${id}`);
  }
  // REGULAR=1, SEGUNDO_CURSO=2, TRANSFERENCIA=6 contam.
  for (const id of [1, 2, 6]) {
    assert.equal(isBolsistaOuBandaMatricula({ alunos: { tipo_matricula_id: id } }), false, `id ${id}`);
  }
  // Aceita também o código textual, quando a query traz o join.
  assert.equal(isBolsistaOuBandaMatricula({ alunos: { tipos_matricula: { codigo: 'BOLSISTA_PARC' } } }), true);
  assert.equal(isBolsistaOuBandaMatricula({ alunos: { tipos_matricula: { codigo: 'REGULAR' } } }), false);
});

test('FAIL-OPEN: sem saber o tipo, a saida CONTA', () => {
  // 40 movimentações de 2026 não têm aluno_id (lançamento manual antigo). Fechar
  // aqui sumiria com evasão REAL em silêncio — pior do que o defeito corrigido.
  assert.equal(isBolsistaOuBandaMatricula({ tipo: 'evasao' }), false);
  assert.equal(isBolsistaOuBandaMatricula({ tipo: 'evasao', alunos: null }), false);
  assert.equal(contaNosKpis({ tipo: 'evasao', alunos: null, cursos: null }), true);
});

test('curso do ALUNO vale quando a movimentacao nao tem curso', () => {
  // 6 nao_renovacoes de CG/ago-26 vieram com curso_id NULL na movimentação.
  assert.equal(
    contaNosKpis({ tipo: 'nao_renovacao', cursos: null, alunos: { cursos: { nome: 'Power Kids', is_projeto_banda: true } } }),
    false,
  );
});

test('bolsista e banda saem de TODOS os tipos, inclusive renovacao', () => {
  // Regra do Alf (27/08): "nao conta em nada, em nada [...] senao isso infla o
  // programa deles". E inflava: as renovacoes de banda/bolsista levavam CG/jul-26
  // de 77,8% para 81,8%, cruzando a meta de 80% por cima.
  const linhas = [
    { tipo: 'renovacao', alunos: { tipo_matricula_id: 3 } },
    { tipo: 'evasao', alunos: { tipo_matricula_id: 3 } },
    { tipo: 'nao_renovacao', alunos: { tipo_matricula_id: 4 } },
    { tipo: 'aviso_previo', alunos: { tipo_matricula_id: 3 } },
    { tipo: 'renovacao', cursos: { is_projeto_banda: true } },
    { tipo: 'renovacao', alunos: { tipo_matricula_id: 1 } },
  ];
  const resultado = filtrarRetencaoCanonica(linhas).map(l => l.tipo);
  assert.deepEqual(resultado, ['renovacao'], 'so sobra a renovacao do aluno REGULAR');
});

test('uma regra so: nao existe mais filtro fraco para renovacao', () => {
  // A separacao "saida x renovacao" caiu em 27/08. Reintroduzir um segundo filtro
  // e como o numero volta a divergir entre telas.
  assert.equal(lib.filtrarEvasoesCanonicas, undefined, 'alias antigo nao deve voltar');
  assert.equal(lib.filtrarMovimentacoesRetencaoKpi, undefined, 'alias antigo nao deve voltar');
});

// ── as telas precisam APLICAR o filtro; foi exatamente isso que faltou ──────────
test('as telas de retencao aplicam o filtro na lista que renderizam', () => {
  const admin = readFileSync('src/components/App/Administrativo/AdministrativoPage.tsx', 'utf8');
  // Tudo deriva de uma base ja filtrada — inclusive renovacao.
  assert.match(admin, /const movimentacoesCanonicas = filtrarRetencaoCanonica\(movimentacoes\)/);
  assert.match(admin, /const renovacoesDaCompetencia = movimentacoesCanonicas\./);
  assert.doesNotMatch(admin, /const evasoes = movimentacoes\.filter/);
  assert.doesNotMatch(admin, /const renovacoesDaCompetencia = movimentacoes\.filter/);

  const gestao = readFileSync('src/components/GestaoMensal/TabGestao.tsx', 'utf8');
  assert.match(gestao, /filtrarRetencaoCanonica\(movimentacoesRetencaoEnriquecidas\)/);

  const planilha = readFileSync('src/components/App/Retencao/PlanilhaRetencao.tsx', 'utf8');
  assert.match(planilha, /filtrarRetencaoCanonica\(evasoesRes\.data\)/);
  assert.match(planilha, /filtrarRetencaoCanonica\(renovacoesRes\.data\)/);

  const modal = readFileSync('src/components/App/Administrativo/ModalRelatorio.tsx', 'utf8');
  assert.match(modal, /movEnriquecidasCanonicas = filtrarRetencaoCanonica\(movimentacoesEnriquecidas\)/);

  const fideliza = readFileSync('src/lib/fidelizaCanonico.ts', 'utf8');
  assert.match(fideliza, /\.filter\(contaNosKpis\)/);

  const historicos = readFileSync('src/hooks/useDadosHistoricos.ts', 'utf8');
  assert.match(historicos, /filtrarRetencaoCanonica\(movimentosRenovacao\)/);

  // A edge do relatorio de WhatsApp tem copia local da regra — precisa acompanhar.
  const edge = readFileSync('supabase/functions/relatorio-admin-whatsapp/index.ts', 'utf8');
  assert.match(edge, /isBolsistaOuBandaMatricula/);
});

test('o banco carrega a mesma regra, e nao reescrita a mao', () => {
  const migration = readFileSync(
    'supabase/migrations/20260827120000_evasoes_excluem_banda_e_bolsista.sql',
    'utf8',
  );
  assert.match(migration, /movimentacao_conta_no_churn_v1/);
  const migration2 = readFileSync(
    'supabase/migrations/20260827160000_bolsista_e_banda_fora_de_todos_os_kpis.sql',
    'utf8',
  );
  // O helper por id passa a delegar: um lugar so decide, 17 consumidores herdam.
  assert.match(migration2, /movimentacao_conta_nos_kpis_v1/);
  assert.match(migration2, /create or replace function public\.is_movimentacao_admin_retencao_valida/i);
  assert.match(migration2, /drop function if exists public\.movimentacao_conta_no_churn_v1/i);
  assert.match(migration, /'BOLSISTA_INT',\s*'BOLSISTA_PARC',\s*'BANDA'/);
  // Guarda de âncora: sem ela o replace poderia aplicar um corpo não revisado.
  assert.match(migration, /esperava 1 ocorrencia/);
  // Recriar função reabre EXECUTE para anon neste projeto.
  assert.match(migration, /revoke execute on function public\.get_kpis_alunos_canonicos_base_p01q[\s\S]{0,80}from anon/);
  assert.doesNotMatch(migration, /create or replace function public\.is_atividade_extra_curso/i);
});
