// Regras da aba Contratos no celular (LAPE-32).
//
// A tela do computador responde "quais contratos vencem na janela X" com nove
// colunas; no balcão a pergunta é "quem eu chamo para renovar, e em que ordem".
// O que este teste trava são as decisões que separam uma coisa da outra — e as
// armadilhas que já morderam este repo antes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Compila com esbuild em vez de importar direto: `node --test` nao resolve os
// imports sem extensao de `numeroDaConversa.ts`, e alterar aquele modulo
// compartilhado so para este teste rodar seria conserto pelo lado errado. Assim
// o que roda aqui e o codigo real, com as dependencias reais.
const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: ['src/lib/contratosMobile.ts'],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'contratos-')), 'contratosMobile.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const {
  diasParaVencer,
  faixaDeUrgencia,
  agruparPorUrgencia,
  contatoDeRenovacao,
  sinaisDoContrato,
  rotuloFaturasVencidas,
  ORDEM_FAIXAS,
} = lib;

// ─────────────────────────── critério ───────────────────────────

test('🔴 o critério escolhe a COLUNA, não "a que estiver preenchida"', () => {
  // Em 78% dos contratos ativos a última aula e a última fatura caem em meses
  // diferentes. Ler a coluna errada devolve outra lista, silenciosamente.
  const c = { dias_ate_vencimento: 3, dias_ate_venc_fatura: 47 };
  assert.equal(diasParaVencer(c, 'aula'), 3);
  assert.equal(diasParaVencer(c, 'fatura'), 47);
});

test('contrato sem parcelas tem dias de fatura NULL — nunca zero', () => {
  // `nr_faturas = 0` não tem vencimento financeiro a medir. Tratar como 0
  // colocaria o contrato na faixa mais urgente sem nenhum fato por trás.
  const semParcela = { dias_ate_vencimento: 12, dias_ate_venc_fatura: null };
  assert.equal(diasParaVencer(semParcela, 'fatura'), null);
  assert.equal(faixaDeUrgencia(diasParaVencer(semParcela, 'fatura')), 'sem_data');
});

// ─────────────────────────── urgência ───────────────────────────

test('🔴 contrato JÁ VENCIDO não cai no mesmo balde de "até 7 dias"', () => {
  // O recorte "Este mês" lista o que termina na competência, então no fim do
  // mês inclui data já passada. É o caso mais urgente que existe.
  assert.equal(faixaDeUrgencia(-1), 'vencido');
  assert.equal(faixaDeUrgencia(-30), 'vencido');
  assert.equal(faixaDeUrgencia(0), 'esta_semana');
});

test('as faixas cobrem o intervalo inteiro, sem buraco entre elas', () => {
  const vistas = new Set();
  for (let d = -5; d <= 120; d++) vistas.add(faixaDeUrgencia(d));
  assert.ok(vistas.has('vencido'));
  assert.ok(vistas.has('esta_semana'));
  assert.ok(vistas.has('duas_semanas'));
  assert.ok(vistas.has('este_mes'));
  assert.ok(vistas.has('depois'));
  // as bordas exatas
  assert.equal(faixaDeUrgencia(7), 'esta_semana');
  assert.equal(faixaDeUrgencia(8), 'duas_semanas');
  assert.equal(faixaDeUrgencia(14), 'duas_semanas');
  assert.equal(faixaDeUrgencia(15), 'este_mes');
  assert.equal(faixaDeUrgencia(30), 'este_mes');
  assert.equal(faixaDeUrgencia(31), 'depois');
});

test('🔴 faixa VAZIA não vira bloco — cabeçalho sobre nada afirma problema que não existe', () => {
  const contratos = [
    { dias_ate_vencimento: 20 },
    { dias_ate_vencimento: 25 },
  ];
  const blocos = agruparPorUrgencia(contratos, 'aula');
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].faixa, 'este_mes');
  assert.deepEqual(blocos.map((b) => b.faixa), ['este_mes']);
});

test('os blocos saem do mais urgente para o menos', () => {
  const contratos = [
    { dias_ate_vencimento: 45 },
    { dias_ate_vencimento: -2 },
    { dias_ate_vencimento: 20 },
    { dias_ate_vencimento: 3 },
    { dias_ate_vencimento: 10 },
  ];
  const blocos = agruparPorUrgencia(contratos, 'aula');
  assert.deepEqual(
    blocos.map((b) => b.faixa),
    ['vencido', 'esta_semana', 'duas_semanas', 'este_mes', 'depois'],
  );
  // e a ordem declarada é a que o agrupador usa
  const posicao = (f) => ORDEM_FAIXAS.indexOf(f);
  for (let i = 1; i < blocos.length; i++) {
    assert.ok(posicao(blocos[i].faixa) > posicao(blocos[i - 1].faixa));
  }
});

test('🔴 a ordem DENTRO do bloco é preservada — o banco já ordenou', () => {
  // A lista chega com `.order(COLUNA_ORDEM[criterio])`. Reordenar aqui seria uma
  // segunda resposta para "qual vem primeiro" — a família das duplicatas.
  const contratos = [
    { dias_ate_vencimento: 2, aluno_nome: 'Ana' },
    { dias_ate_vencimento: 5, aluno_nome: 'Bruno' },
    { dias_ate_vencimento: 6, aluno_nome: 'Carla' },
  ];
  const [bloco] = agruparPorUrgencia(contratos, 'aula');
  assert.deepEqual(bloco.itens.map((c) => c.aluno_nome), ['Ana', 'Bruno', 'Carla']);
});

// ─────────────────────────── contato ───────────────────────────

test('🔴 o número sai da fonte única, na ordem whatsapp → telefone', () => {
  // A mesma ordem da edge `enviar-mensagem-admin` e da RPC
  // `admin_conversa_usar_numero_do_cadastro_v1`. Invertê-la faria a tela
  // prometer um número e o link abrir outro.
  const comOsDois = contatoDeRenovacao({ whatsapp: '21987654321', telefone: '2133334444' });
  assert.equal(comOsDois.numeroCadastrado, '21987654321');
  assert.equal(comOsDois.numeroDiscavel, '5521987654321');

  const soTelefone = contatoDeRenovacao({ whatsapp: null, telefone: '2133334444' });
  assert.equal(soTelefone.numeroCadastrado, '2133334444');
});

test('🔴 número incompleto NÃO vira link quebrado', () => {
  // `normalizarTelefone` recusa menos de 10 dígitos. Uma das cinco cópias
  // espalhadas pelo app faz `'55' + digitos` sem checar, e abre o WhatsApp em
  // branco.
  assert.equal(contatoDeRenovacao({ telefone: '1234' }), null);
  assert.equal(contatoDeRenovacao({ telefone: '', whatsapp: '' }), null);
  assert.equal(contatoDeRenovacao({}), null);
});

test('o número já com DDI não ganha outro 55 na frente', () => {
  const c = contatoDeRenovacao({ whatsapp: '5521987654321' });
  assert.equal(c.numeroDiscavel, '5521987654321');
  assert.equal(c.linkWhatsApp, 'https://wa.me/5521987654321');
});

test('telefone com máscara vira link discável', () => {
  // 446 cadastros ativos guardam o telefone com máscara (medido em 12/09).
  const c = contatoDeRenovacao({ whatsapp: '(21) 98765-4321' });
  assert.equal(c.numeroDiscavel, '5521987654321');
  // e o exibido continua sendo o do cadastro, que é o que a pessoa reconhece
  assert.equal(c.numeroCadastrado, '(21) 98765-4321');
});

// ─────────────────────────── sinais ───────────────────────────

test('🔴 o sinal de inadimplência sai do BOOLEANO, não da contagem', () => {
  // `faturas_vencidas_abertas` é piso: `emusys_faturas` só cobre de jun/2026.
  // O contrato pode estar inadimplente com a contagem em 0.
  assert.deepEqual(sinaisDoContrato({ inadimplente: true, faturas_vencidas_abertas: 0, aluno_id: 1 }), ['inadimplente']);
  assert.deepEqual(sinaisDoContrato({ inadimplente: false, faturas_vencidas_abertas: 2, aluno_id: 1 }), []);
  // null é "não sei", nunca "está em dia"
  assert.deepEqual(sinaisDoContrato({ inadimplente: null, aluno_id: 1 }), []);
});

test('matrícula sem cadastro local é sinalizada — sem cadastro não há telefone', () => {
  const sinais = sinaisDoContrato({ aluno_id: null, aluno_nome: null });
  assert.ok(sinais.includes('sem_cadastro_local'));
  assert.equal(contatoDeRenovacao({ aluno_id: null, telefone: null, whatsapp: null }), null);
});

test('pagamento à vista muda a conversa de renovação', () => {
  assert.ok(sinaisDoContrato({ nr_faturas: 1, nr_aulas_futuras: 8, aluno_id: 1 }).includes('pagamento_a_vista'));
  // 1 parcela com 1 aula restante é fim de contrato normal, não à vista
  assert.ok(!sinaisDoContrato({ nr_faturas: 1, nr_aulas_futuras: 1, aluno_id: 1 }).includes('pagamento_a_vista'));
  assert.ok(!sinaisDoContrato({ nr_faturas: 12, nr_aulas_futuras: 8, aluno_id: 1 }).includes('pagamento_a_vista'));
});

test('🔴 a contagem de faturas é exibida como PISO, com "≥"', () => {
  assert.equal(rotuloFaturasVencidas({ faturas_vencidas_abertas: 2 }), '≥ 2 faturas vencidas');
  assert.equal(rotuloFaturasVencidas({ faturas_vencidas_abertas: 1 }), '≥ 1 fatura vencida');
  assert.equal(rotuloFaturasVencidas({ faturas_vencidas_abertas: 0 }), null);
  assert.equal(rotuloFaturasVencidas({}), null);
});

// ─────────────────────────── DRY ───────────────────────────

test('🔴 esta lib NÃO é a sexta implementação de link de WhatsApp', () => {
  const fonte = readFileSync(join(RAIZ, 'src/lib/contratosMobile.ts'), 'utf8');
  // Existem 5 lugares montando `wa.me` no app com normalizações próprias.
  // A regra do número tem de vir das fontes únicas, não ser reescrita aqui.
  assert.match(fonte, /from '\.\/normalizarTelefone'/, 'a normalização deixou de vir da fonte única');
  assert.match(fonte, /from '\.\/numeroDaConversa'/, 'a escolha whatsapp→telefone deixou de vir da fonte única');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    semComentarios,
    /replace\(\/\\D\/g/,
    'a lib voltou a limpar dígitos por conta própria em vez de usar normalizarTelefone',
  );
  assert.doesNotMatch(
    semComentarios,
    /'55'\s*\+|`55\$\{/,
    'a lib voltou a prefixar o DDI à mão',
  );
});

test('🔴 nenhum limiar de "poucas aulas" foi inventado', () => {
  // Qual número conta como poucas não foi medido. Inventá-lo faria a tela
  // afirmar uma urgência que ninguém apurou.
  const fonte = readFileSync(join(RAIZ, 'src/lib/contratosMobile.ts'), 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(semComentarios, /nr_aulas_futuras\s*[<>]=?\s*[2-9]/, 'apareceu limiar de aulas restantes');
  // a única comparação legítima é a do pagamento à vista, contra 1
  const comparacoes = semComentarios.match(/nr_aulas_futuras[^;]*?[<>]/g) ?? [];
  assert.ok(comparacoes.length <= 1, `esperava no máximo 1 comparação de aulas, achei ${comparacoes.length}`);
});
