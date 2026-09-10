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

// --- Portao 4c: alguem ja falou com a pessoa depois da resposta -------------
//
// Cenario levantado pelo Hugo (10/09/2026): a Jessy ve a resposta na Caixa e
// agradece na mao ANTES de o robo agradecer. Os portoes acima nao alcancam --
// todos leem `automacao_log`, que e o registro do que o ROBO mandou; a resposta
// dela vai para `admin_mensagens` e nunca chega a `pesquisa_evasao_mensagens`
// (medido: as 25 saidas de la sao 21 repescagens + 4 agradecimentos, zero
// manuais). A janela de risco e de ~16 min -- medida em producao entre a
// chegada da resposta e o envio: 15,5 · 15,6 · 15,8 · 18,3.
//
// A pergunta e "saiu alguma mensagem NOSSA depois da resposta?", nunca "um
// humano agradeceu?". Duas razoes medidas:
//   1. `admin_mensagens.remetente='admin'` NAO quer dizer humano -- o robo da
//      pesquisa de 1a aula grava como admin/`Fabi`, e ha `Notificacao
//      (automatico)` e `Boas-vindas (automatico)` no mesmo balde. A tabela nao
//      tem coluna de autor, entao "foi humano?" so se responde por lista de
//      nomes, que envelhece mal.
//   2. Julgar se o texto foi um agradecimento seria classificar texto de novo,
//      com o mesmo risco de errar que o classificador ja tem.
// De quebra cobre o caso oposto: a Jessy responde "vou verificar isso com a
// coordenacao" e o robo emenda um "muito obrigada mesmo!" por cima.

test('nao agradece quando alguem ja respondeu a pessoa depois da resposta', () => {
  assert.deepEqual(
    decidirEnvioAgradecimento({ ...base, alguemJaRespondeuDepois: true }, AGORA),
    { acao: 'nao_enviar', motivo: 'alguem_ja_respondeu' },
  );
});

test('o portao de terceiros vem DEPOIS dos de idempotencia', () => {
  // Quando os dois valem, o log tem de dizer que a mensagem ja saiu por nossa
  // conta -- e o fato mais forte, e o unico que explica por que nao vai sair de
  // novo nunca mais. "alguem_ja_respondeu" sugeriria uma condicao passageira.
  assert.deepEqual(
    decidirEnvioAgradecimento(
      { ...base, jaAgradecidoNestaPesquisa: true, alguemJaRespondeuDepois: true },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'ja_agradecido_nesta_pesquisa' },
  );
});

test('o portao de terceiros barra ANTES da janela e do teto', () => {
  // Mesmo motivo do portao da pesquisa: relatar "fora_da_janela" faria quem le
  // o log concluir que ninguem falou com a pessoa, quando alguem falou.
  assert.deepEqual(
    decidirEnvioAgradecimento(
      {
        ...base,
        alguemJaRespondeuDepois: true,
        analiseEncerradaEm: '2026-08-31T10:38:00Z',
        enviadosHoje: TETO_DIARIO_AGRADECIMENTO,
      },
      AGORA,
    ),
    { acao: 'nao_enviar', motivo: 'alguem_ja_respondeu' },
  );
});

test('estado sem o campo de terceiros continua enviando (compatibilidade)', () => {
  // Mesma razao do campo anterior: chamador desatualizado nao pode desligar o
  // agradecimento inteiro em silencio.
  const semCampo = { ...base };
  delete semCampo.alguemJaRespondeuDepois;
  assert.deepEqual(decidirEnvioAgradecimento(semCampo, AGORA), { acao: 'enviar' });
});
