import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decidirEnvioAgradecimento,
  JANELA_FRESCOR_MS,
  TETO_DIARIO_AGRADECIMENTO,
} from '../supabase/functions/_shared/pesquisa-evasao-agradecimento.ts';

const AGORA = new Date('2026-09-02T15:00:00Z');

const base = {
  automacaoAtiva: true,
  classificacao: { agradecer: true, motivo_nao_agradecer: null },
  jaAgradecido: false,
  analiseEncerradaEm: '2026-09-02T14:30:00Z', // 30 min atras
  enviadosHoje: 0,
};

test('envia quando todos os portoes passam', () => {
  assert.deepEqual(decidirEnvioAgradecimento(base, AGORA), { acao: 'enviar' });
});

// --- Portao 1: kill switch -------------------------------------------------

test('kill switch desligado impede o envio', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, automacaoAtiva: false }, AGORA),
    { acao: 'nao_enviar', motivo: 'automacao_desligada' },
  );
});

// --- Portao 2: fail-closed sem classificacao -------------------------------

test('sem classificacao NAO envia (fail-closed)', () => {
  // O veredito do classificador e a unica fonte da decisao. Se ele nao rodou
  // (falha da OpenAI, log nao gravado), o silencio e a resposta certa: mandar
  // sem ninguem ter julgado o texto e o oposto do desenho.
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, classificacao: null }, AGORA),
    { acao: 'nao_enviar', motivo: 'sem_classificacao' },
  );
});

// --- Portao 3: os 4 portoes do classificador -------------------------------

for (const motivo of [
  'nao_e_resposta',
  'confianca_insuficiente',
  'contem_pergunta',
  'pede_atendimento',
]) {
  test(`classificador reprovou por ${motivo} -- nao envia e preserva o motivo`, () => {
    assert.deepEqual(
      decidirEnvioAgradecimento(
        { ...base, classificacao: { agradecer: false, motivo_nao_agradecer: motivo } },
        AGORA,
      ),
      { acao: 'nao_enviar', motivo: `classificador:${motivo}` },
    );
  });
}

test('classificador reprovou sem dizer o motivo ainda barra', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, classificacao: { agradecer: false, motivo_nao_agradecer: null } },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'classificador:motivo_ausente' },
  );
});

// --- Portao 4: idempotencia ------------------------------------------------

test('nao agradece duas vezes a mesma analise', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, jaAgradecido: true }, AGORA),
    { acao: 'nao_enviar', motivo: 'ja_agradecido' },
  );
});

// --- Portao 5: janela de frescor -------------------------------------------

test('resposta antiga NAO recebe agradecimento atrasado', () => {
  // Caso real que motivou a guarda: a resposta do Heitor e de 31/08. Ao
  // destravar aquela analise (LAPE-4), sem esta janela sairia um "obrigada
  // pelo seu retorno" tres dias depois, referente a uma conversa encerrada.
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, analiseEncerradaEm: '2026-08-31T10:38:00Z' },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'fora_da_janela' },
  );
});

test('a janela e medida do fechamento da analise e vale ate o limite', () => {
  const noLimite = new Date(AGORA.getTime() - JANELA_FRESCOR_MS + 1000);
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, analiseEncerradaEm: noLimite.toISOString() }, AGORA),
    { acao: 'enviar' },
  );

  const passouUmSegundo = new Date(AGORA.getTime() - JANELA_FRESCOR_MS - 1000);
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, analiseEncerradaEm: passouUmSegundo.toISOString() }, AGORA),
    { acao: 'nao_enviar', motivo: 'fora_da_janela' },
  );
});

test('analise sem data de fechamento NAO envia', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, analiseEncerradaEm: null }, AGORA),
    { acao: 'nao_enviar', motivo: 'sem_data_de_fechamento' },
  );
});

test('data de fechamento no futuro NAO envia', () => {
  // Relogio torto ou dado corrompido: a janela viraria "sempre dentro".
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, analiseEncerradaEm: '2026-09-02T16:00:00Z' },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'fechamento_no_futuro' },
  );
});

test('data de fechamento ilegivel NAO envia', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, analiseEncerradaEm: 'ontem' }, AGORA),
    { acao: 'nao_enviar', motivo: 'sem_data_de_fechamento' },
  );
});

// --- Portao 6: teto diario -------------------------------------------------

test('teto diario corta o envio', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, enviadosHoje: TETO_DIARIO_AGRADECIMENTO }, AGORA),
    { acao: 'nao_enviar', motivo: 'teto_diario' },
  );
});

test('um abaixo do teto ainda envia', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, enviadosHoje: TETO_DIARIO_AGRADECIMENTO - 1 },
      AGORA,
    ),
    { acao: 'enviar' },
  );
});

test('o teto e baixo de proposito -- 3 por dia', () => {
  // Com 6-12 respostas/mes o teto nunca estorva o uso real; ele existe para
  // que um reprocessamento em lote custe 3 mensagens, nao a base inteira.
  assert.equal(TETO_DIARIO_AGRADECIMENTO, 3);
});

// --- Ordem dos portoes -----------------------------------------------------

test('kill switch vence qualquer outro motivo', () => {
  // Quem desliga a automacao precisa ler "desligada" no log, nao "teto diario".
  assert.deepEqual(
    decidirEnvioAgradecimento(
      {
        automacaoAtiva: false,
        classificacao: { agradecer: false, motivo_nao_agradecer: 'contem_pergunta' },
        jaAgradecido: true,
        analiseEncerradaEm: null,
        enviadosHoje: 99,
      },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'automacao_desligada' },
  );
});

test('idempotencia vence janela e teto', () => {
  // Ja agradecido e fato consumado; reportar "teto" esconderia que a mensagem
  // ja saiu, que e a informacao que importa em auditoria.
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, jaAgradecido: true, analiseEncerradaEm: null, enviadosHoje: 99 },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'ja_agradecido' },
  );
});
