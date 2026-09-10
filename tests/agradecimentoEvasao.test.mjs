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

// --- Portao 4b: um agradecimento por PESQUISA, nao por analise -------------
//
// Medido em producao (10/09/2026): o Renan foi agradecido as 11:02 e respondeu
// "Muito obrigado 🙏🏾" as 11:10. Isso abriu a analise VERSAO 2 -- e a chave de
// idempotencia carrega a versao, entao `jaAgradecido` (portao 4) nao alcanca a
// v2. So nao saiu um segundo "muito obrigada mesmo!" porque a mensagem era
// `indeterminado` e nao fechou analise; com um texto substantivo ("esqueci de
// falar: o professor foi excelente") a v2 teria fechado, o classificador teria
// aprovado, e o ex-aluno receberia a MESMA frase 25 minutos depois.
//
// Decisao do Hugo (10/09): nunca um segundo agradecimento automatico na mesma
// pesquisa. Feedback que chega depois merece resposta humana da Jessy, e a
// pesquisa segue aparecendo na fila dela.

test('nao agradece de novo quando outra analise da MESMA pesquisa ja foi agradecida', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, jaAgradecidoNestaPesquisa: true }, AGORA),
    { acao: 'nao_enviar', motivo: 'ja_agradecido_nesta_pesquisa' },
  );
});

test('a idempotencia da versao e reportada antes do portao da pesquisa', () => {
  // Quando os dois valem, o log precisa dizer "esta versao ja saiu" -- e o fato
  // mais especifico, e o que responde "por que este caso nao rodou de novo?".
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, jaAgradecido: true, jaAgradecidoNestaPesquisa: true },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'ja_agradecido' },
  );
});

test('o portao da pesquisa barra ANTES da janela e do teto', () => {
  // Sem isso, uma pesquisa ja agradecida cujo envio caiu fora da janela seria
  // relatada como "fora_da_janela" -- e quem le o log concluiria que o caso
  // ainda esta para acontecer, quando ja aconteceu.
  assert.deepEqual(
    decidirEnvioAgradecimento(
      {
        ...base,
        jaAgradecidoNestaPesquisa: true,
        analiseEncerradaEm: '2026-08-31T10:38:00Z',
        enviadosHoje: TETO_DIARIO_AGRADECIMENTO,
      },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'ja_agradecido_nesta_pesquisa' },
  );
});

test('estado sem o campo novo continua enviando (compatibilidade)', () => {
  // Chamador que ainda nao passa o campo nao pode virar fail-closed silencioso:
  // isso desligaria o agradecimento inteiro em vez de so evitar o duplicado.
  const semCampo = { ...base };
  delete semCampo.jaAgradecidoNestaPesquisa;
  assert.deepEqual(decidirEnvioAgradecimento(semCampo, AGORA), { acao: 'enviar' });
});
