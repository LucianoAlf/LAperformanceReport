// O BUMERANGUE: a decisão determinística que transforma "me chama em janeiro"
// numa retomada agendada.
//
// Duas regras puras são cobertas aqui:
//   · `decidirRetomada` (contract.ts do extrator) — quem entra e quem não entra;
//   · a coerência do mapa: `retomar_depois` NÃO pode virar sinal do radar.
//
// Este teste roda a função REAL (transpilada por esbuild) — não confere texto.
// A régua de prazo (`fn_resolver_prazo_retomada`) é SQL e está coberta pelo
// ensaio contra o banco registrado no PR #336; aqui fica a parte que roda fora.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const contrato = await (async () => {
  const fonte = readFileSync('supabase/functions/extrair-sinais-conversa/contract.ts', 'utf8');
  const { code } = await esbuild.transform(fonte, { loader: 'ts', format: 'esm' });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'retom-')), 'contract.mjs');
  writeFileSync(arquivo, code, 'utf8');
  return import(pathToFileURL(arquivo).href);
})();

const { decidirRetomada, decidirSinal } = contrato;

const base = {
  tipo: 'retomar_depois',
  precisa_resposta: false,
  confianca: 'alta',
  resumo: 'o lead adiou a decisao para janeiro',
  trecho_chave: 'agora ta apertado, me chama em janeiro que a gente resolve',
  prazo_texto: 'em janeiro',
};

test('lead que adiou com intencao vira retomada', () => {
  assert.deepEqual(decidirRetomada(base, 'lead'), { registrar: true, motivo_descarte: null });
});

// ⚠️ Aluno dizendo "me chama mes que vem" e assunto de RETENCAO, nao de agenda
// comercial. Tratar como retomada tiraria o caso da fila de quem cuida disso.
test('so vale para lead — aluno e ex-aluno ficam fora', () => {
  assert.equal(decidirRetomada(base, 'aluno').registrar, false);
  assert.equal(decidirRetomada(base, 'aluno').motivo_descarte, 'retomada_so_para_lead:aluno');
  assert.equal(decidirRetomada(base, 'ex_aluno').registrar, false);
  assert.equal(decidirRetomada(base, null).motivo_descarte, 'retomada_so_para_lead:desconhecido');
});

// ⚠️ Lembrete errado daqui a 3 meses e PIOR que lembrete nenhum: a consultora
// nao tera contexto para desconfiar dele.
test('confianca baixa nao entra', () => {
  const r = decidirRetomada({ ...base, confianca: 'baixa' }, 'lead');
  assert.deepEqual(r, { registrar: false, motivo_descarte: 'confianca_baixa' });
});

test('confianca media entra — o custo de perder e maior que o de agendar a mais', () => {
  assert.equal(decidirRetomada({ ...base, confianca: 'media' }, 'lead').registrar, true);
});

// 🔴 A frase e o que aparece para ela no dia. Sem frase o lembrete vira
// "retomar contato com fulano", que ela ignora — e a coluna e NOT NULL.
test('sem frase nao registra', () => {
  assert.equal(decidirRetomada({ ...base, trecho_chave: '' }, 'lead').motivo_descarte, 'sem_frase');
  assert.equal(decidirRetomada({ ...base, trecho_chave: 'ok' }, 'lead').motivo_descarte, 'sem_frase');
});

test('outro tipo nunca vira retomada', () => {
  for (const tipo of ['cancelamento_declarado', 'dificuldade_financeira', 'cortesia', 'outro']) {
    const r = decidirRetomada({ ...base, tipo }, 'lead');
    assert.equal(r.registrar, false, `${tipo} nao pode virar retomada`);
    assert.equal(r.motivo_descarte, `tipo_nao_e_retomada:${tipo}`);
  }
});

// ⚠️ A retomada NAO pode ocupar a pauta: sinal do radar significa "aja AGORA", e
// uma retomada de janeiro ficaria meses na fila ensinando a equipe a ignora-la.
test('retomar_depois NAO vira sinal do radar', () => {
  const d = decidirSinal(base);
  assert.equal(d.emitir, false);
  assert.equal(d.regra_codigo, null);
  assert.equal(d.motivo_descarte, 'tipo_sem_regra:retomar_depois');
});

// A retomada e decidida ANTES do descarte por `!emitir` no index.ts. Se um dia
// alguem mapear `retomar_depois` para uma regra, este teste cai e obriga a
// revisar o roteamento — que e o ponto.
test('prazo vago continua sendo retomada: quem recusa a data e o banco', () => {
  const vago = { ...base, prazo_texto: 'depois das ferias' };
  assert.equal(decidirRetomada(vago, 'lead').registrar, true);
});
