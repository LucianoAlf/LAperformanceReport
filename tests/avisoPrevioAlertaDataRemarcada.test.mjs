/**
 * O lembrete diario da Sol precisa dizer o que fazer quando a data de saida
 * foi remarcada no Emusys.
 *
 * Motivo: o webhook `matricula_aviso_previo_editado` esta no catalogo da API
 * desde 03/08/2026 e, em 41 avisos recebidos, NUNCA foi entregue — e nao ha
 * endpoint de pull que exponha o aviso previo. Entao a data daqui pode estar
 * velha sem nenhum sinal. Em 10/09/2026 a Perola Reis (CG) era cobrada como
 * "venceu 07/09" enquanto o Emusys ja dizia 14/09.
 *
 * ⚠️ Este teste e ESTRUTURAL: confere o texto e a guarda no fonte do script,
 * nao executa o envio (montar() consulta a API do Emusys por aluno). O que ele
 * garante e que a linha existe e que esta condicionada aos vencidos.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const fonte = fs.readFileSync(
  new URL('../vps/la-hq/sol/scripts/send-aviso-previo-sol.py', import.meta.url),
  'utf8',
);

test('o rodape ensina a corrigir a data no LA Report', () => {
  assert.match(fonte, /Mudou a data no Emusys\?/);
  assert.match(fonte, /Administrativo → Avisos Prévios/);
});

test('a instrucao so sai quando ha secao de vencidos', () => {
  // Quem encerra amanha ainda tem aula hoje: pedir conferencia de data ali
  // seria ruido, e ruido ensina a ignorar o canal.
  const trecho = fonte.slice(fonte.indexOf('rodape = []'), fonte.indexOf('texto = cabecalho'));
  const guarda = /if atrasados:[\s\S]*?rodape\.append\('_Mudou a data no Emusys\?/;
  assert.match(trecho, guarda);
});

test('a instrucao vem depois do "concluir no Emusys", nao antes', () => {
  // A acao do dia continua sendo concluir a matricula; a correcao de data e
  // a excecao. Inverter a ordem troca o que a recepcao le primeiro.
  const concluir = fonte.indexOf("'*➡️ Concluir a matrícula no Emusys*'");
  const corrigir = fonte.indexOf("'_Mudou a data no Emusys?");
  assert.ok(concluir > 0 && corrigir > 0);
  assert.ok(concluir < corrigir);
});

test('usa italico, nunca asterisco solto', () => {
  // O script ja documenta: um `*` solto pareia com o asterisco do rodape e
  // deixa um trecho da lista em negrito por acidente.
  const linha = fonte.slice(fonte.indexOf("'_Mudou a data no Emusys?"));
  const ateFechar = linha.slice(0, linha.indexOf('\n', linha.indexOf('🙏')));
  assert.doesNotMatch(ateFechar, /\*/);
});
