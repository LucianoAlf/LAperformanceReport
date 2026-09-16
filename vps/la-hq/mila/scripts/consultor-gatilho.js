#!/usr/bin/env node
'use strict';

/**
 * Gatilho do MODO CONSULTOR — a Mila só fala quando é chamada.
 * ---------------------------------------------------------------------------
 * Até 24/08/2026 qualquer mensagem de consultor autorizado numa inbox de
 * consultor acordava a Mila. Foi assim que, em 21/08, a Anne colou no chat a
 * divulgação do Julina Rock Fest e recebeu de volta "Que legal o Julina Rock
 * Fest! Como posso ajudar com isso, Anne?" -- ninguém tinha falado com ela.
 *
 * Aqui a regra é a de qualquer pessoa numa sala: ela responde quando é
 * chamada pelo nome, e continua na conversa por um tempo depois disso sem
 * exigir que repitam o nome a cada frase. Passado esse tempo em silêncio, ela
 * volta a esperar ser chamada.
 *
 * ⚠️ O que ela NÃO responde, ela GUARDA. Silêncio não pode virar amnésia: se a
 * consultora cola um comunicado e dois minutos depois pergunta "Mila, e o
 * horário disso?", a Mila precisa saber do que é "disso". As mensagens não
 * dirigidas a ela entram no prompt da próxima vez que for chamada, rotuladas
 * como contexto -- e sem custar uma execução do Hermes cada uma, que é o preço
 * que se pagaria para gravá-las na sessão dela.
 *
 * Este módulo é PURO: não lê arquivo, não lê relógio, não lê env. Quem cuida
 * de IO é o bridge. É o que torna a regra testável sem subir servidor.
 */

const MIN = 60 * 1000;

/** Defaults em minutos/quantidade. O bridge sobrepõe pelo ambiente. */
const PADROES = {
  /** Depois de responder, ela segue na conversa por este tempo sem ser
   *  chamada de novo. 30 min cobre a ida e volta de um atendimento sem deixar
   *  a porta aberta pelo resto do dia. */
  janelaMin: 30,
  /** Por quanto tempo uma mensagem não respondida ainda serve de contexto.
   *  Maior que a janela de propósito: a pergunta que se refere a um comunicado
   *  costuma vir bem depois dele. */
  contextoMin: 360,
  /** Tetos do bloco de contexto, para um consultor que despeja 40 mensagens
   *  não empurrar o resto do prompt para fora. */
  contextoMaxItens: 10,
  contextoMaxChars: 2000,
};

/** Tira acento e caixa para o nome casar escrito de qualquer jeito. */
function achatar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * A mensagem chama a Mila pelo nome?
 *
 * ⚠️ Fronteira de palavra à mão, e não `\b`: em "milagre" ou "familia" o `\b`
 * do JavaScript casaria o pedaço "mila" e a Mila responderia a uma frase que
 * não é sobre ela. A fronteira aqui exige que o que vem antes e depois não
 * seja letra nem número -- então "Mila," , "@mila", "(mila?)" e "MILA" contam,
 * "milagre" e "camila" não.
 */
function chamada(texto) {
  return /(^|[^a-z0-9])@?mila([^a-z0-9]|$)/.test(achatar(texto));
}

/** Estado vazio de um consultor. */
const estadoZero = () => ({ janela_ate: 0, pendentes: [] });

/** Descarta o que envelheceu e apara pelos tetos, do mais antigo para o mais
 *  novo: numa fila cheia, a mensagem que interessa é a última. */
function podar(pendentes, agora, op) {
  const piso = agora - op.contextoMin * MIN;
  // O estado vem de um JSON em disco: um arquivo truncado ou editado à mão não
  // pode virar exceção dentro do webhook -- aí o consultor ficaria sem resposta
  // nenhuma, que é pior que responder demais.
  let vivos = (Array.isArray(pendentes) ? pendentes : [])
    .filter((p) => p && Number.isFinite(p.ts) && p.ts > piso && p.texto);
  if (vivos.length > op.contextoMaxItens) vivos = vivos.slice(-op.contextoMaxItens);
  let total = vivos.reduce((s, p) => s + p.texto.length, 0);
  while (vivos.length > 1 && total > op.contextoMaxChars) {
    total -= vivos[0].texto.length;
    vivos.shift();
  }
  return vivos;
}

/**
 * Decide se a Mila responde, e o que ela leva de contexto.
 *
 * @returns {{responder:boolean, motivo:string, contexto:Array, estado:object}}
 *   `motivo` entra no log: é por ele que se audita, depois, se ela ficou
 *   calada quando devia falar.
 */
function avaliar({ texto, agora, estado, opcoes }) {
  const op = { ...PADROES, ...(opcoes || {}) };
  const anterior = estado && typeof estado === 'object' ? estado : estadoZero();
  const pendentes = podar(anterior.pendentes, agora, op);

  const porNome = chamada(texto);
  const janelaAberta = Number(anterior.janela_ate || 0) > agora;

  if (porNome || janelaAberta) {
    return {
      responder: true,
      motivo: porNome ? 'chamada_pelo_nome' : 'janela_aberta',
      contexto: pendentes,
      // A janela reabre inteira a cada troca: o que a fecha é o silêncio, não
      // o relógio contado desde a primeira frase.
      estado: { janela_ate: agora + op.janelaMin * MIN, pendentes: [] },
    };
  }

  return {
    responder: false,
    motivo: 'sem_gatilho',
    contexto: [],
    estado: {
      janela_ate: Number(anterior.janela_ate || 0),
      pendentes: podar([...pendentes, { ts: agora, texto: String(texto) }], agora, op),
    },
  };
}

/** Hora em BRT, que é como a equipe fala de horário. */
function horaBRT(ts) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts)).replace(',', '');
  } catch (_) {
    return '';
  }
}

/**
 * O bloco de contexto do prompt. Vazio quando não há o que contar -- um
 * cabeçalho seguido de nada faria a Mila procurar mensagem que não existe.
 *
 * O rótulo é explícito ("não são pedidos") porque sem ele o modelo trata a
 * lista como fila de tarefas e responde uma a uma: seria o mesmo defeito de
 * volta, só que atrasado.
 */
function blocoContexto(itens) {
  if (!itens || !itens.length) return '';
  const linhas = itens.map((p) => `- [${horaBRT(p.ts)}] ${p.texto}`).join('\n');
  return `Mensagens anteriores deste consultor que você NÃO respondeu `
    + `(contexto, não são pedidos):\n${linhas}\n`;
}

module.exports = {
  PADROES, MIN,
  chamada, avaliar, blocoContexto, estadoZero,
  _internos: { achatar, podar, horaBRT },
};
