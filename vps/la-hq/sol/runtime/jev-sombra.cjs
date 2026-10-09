'use strict';
// Jev em SOMBRA na Sol (08/10/2026, Alf: "troca para OpenRouter").
//
// O Jev (typesafe/jev-1.13, OpenRouter /api/alpha/decisions) lê cada mensagem de
// TEXTO dos grupos do caixa e diz o que ela é para a Sol, com a confiança. Em
// sombra ele só REGISTRA: não muda rota, não responde, não lança. O registro sai
// ao lado do que o caminho de hoje fez (`legado`), para comparar antes de ligar.
//
// Teste offline (08/10, 200 mensagens reais rotuladas): 100% nos "pode",
// correções e lançamentos novos; erra conversa entre colegas, mas com confiança
// >= 0,9 acertou 99%. Por isso: nunca é trava única do "pode" (o card citado e a
// trava do banco continuam valendo), e abaixo do limiar vale o caminho de hoje.
//
// Dado que sai: só a fala e o trecho citado, com telefone mascarado. Nada de
// mídia, telefone do remetente ou id de grupo. Falha/demora = registra e segue.
const fs = require('fs');
const path = require('path');

const URL = 'https://openrouter.ai/api/alpha/decisions';
const MODELO = 'typesafe/jev-1.13';

const CRITERIOS = {
  aprovar: 'Autoriza a Sol a lançar/confirmar o card dela: "pode", "pode lançar", "ok pode", inclusive com erro de digitação ("Ppde", "Lode").',
  correcao: 'Corrige ou completa um card/lote da Sol: diz o aluno certo, a parcela/mês, o curso, a divisão entre alunos, o valor ou a forma, ou a quem pertence um cheque.',
  explicacao: 'Explica por que o valor pago é diferente da fatura (desconto autorizado, sem juros, acordo, última parcela), para a Sol registrar o motivo.',
  registro_novo: 'Descreve um pagamento novo para lançar (ex.: "PG pix parcela 10/2026 aluna Fulana - R$ 387,00"), sem responder a um card.',
  pedido_a_sol: 'Pede uma informação ou ação à Sol (relatório, inadimplentes, saldo) ou chama a Sol.',
  recusar: 'Diz à Sol para NÃO lançar ou rejeita o card dela.',
  conversa: 'Conversa entre as pessoas da equipe, agradecimento, cumprimento, risada, ou assunto que não pede nada à Sol.',
};

const FONE = /(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;
const limpa = (s, n) => String(s || '').replace(FONE, '[tel]').replace(/@\d{6,}/g, '@[tel]').slice(0, n);

function estado(fala, citada, unidade, ultimaSol = null) {
  let s = `Mensagem no grupo financeiro${unidade ? ` da unidade ${unidade}` : ''} da LA Music, onde a Sol (assistente do caixa) monta cards de lançamento: "${limpa(fala, 1200)}"`;
  if (citada) s += `\nA mensagem está respondendo a: "${limpa(citada, 600)}"`;
  s += ultimaSol && ultimaSol.texto
    ? `\nContexto: há ${ultimaSol.min} min a Sol mandou neste grupo: "${limpa(ultimaSol.texto, 300)}"`
    : '\nContexto: a Sol não mandou nada neste grupo nos últimos 15 minutos.';
  return s;
}

// Filtro em código, antes do Jev (custo zero; teste v2 de 08/10): fala que chama
// um colega pelo nome no começo ou no fim, ou marca alguém por @, sem citar card
// da Sol e sem falar "Sol", é conversa entre a equipe.
const NOMES = '(luciano|alf|mayra|vit[oó]ria|vi|tutu|rose|f[eê]|fefe|fef[eê]|ana|kailane|anne|jeremias|jereh|eduarda|duda|daiana|susan|jhon|jhonatan|john|arthur|clayton|hugo|galo|yuri|meninas|pessoal|gente)';
// 09/10: o nome precisa vir seguido de pontuação ("Mayra, ..."), não de espaço:
// "Ana Mel - R$ 137,00" é aluna, não colega (a Ana da equipe virava falso filtro).
const CHAMA_COLEGA = new RegExp(`(^\\s*(oi|olá|ola|bom dia|boa tarde|boa noite)?[\\s,!]*@?${NOMES}\\s*[,!:?])|(^\\s*@?${NOMES}\\s*$)|(,\\s*${NOMES}\\s*[.!?]*\\s*$)`, 'i');
function conversaDeColega(fala, citaCardDaSol) {
  if (citaCardDaSol || /\bsol\b/i.test(fala)) return false;
  return CHAMA_COLEGA.test(fala) || /@\d{6,}|@\[tel\]/.test(fala);
}
// Trava de fala curta: até 5 palavras sem número, sem citar card e sem card
// aberto, não vira pedido de gravação. "pode" curto segue como "pode" (quem
// decide se lança é o card citado + a trava do banco, nunca o Jev).
const PODE_CURTO = /^\s*(p[oa]?[dl]e|ppde|lode)\b[\s,!.]*(lan[cç]ar)?(\s*sol)?[\s!.]*$/i;
function aplicarTrava(fala, escolha, { citaCardDaSol, cardAberto }) {
  const curta = fala.split(/\s+/).filter(Boolean).length <= 5 && !/\d/.test(fala);
  if (!curta || citaCardDaSol) return escolha;
  if (escolha === 'aprovar') return PODE_CURTO.test(fala) ? escolha : 'conversa';
  // registro_novo fica de fora (08/10, teste v2): "Parcela Kailane Marcos" é legenda
  // curta sem número e a trava a comia; criar card não grava nada sem o "pode".
  if (!cardAberto && ['correcao', 'recusar', 'explicacao'].includes(escolha)) return 'conversa';
  return escolha;
}

function lerChave(dir) {
  if (process.env.SOL_JEV_OPENROUTER_KEY) return process.env.SOL_JEV_OPENROUTER_KEY.trim();
  try {
    const m = /^SOL_JEV_OPENROUTER_KEY=(.*)$/m.exec(fs.readFileSync(path.join(dir, '.jev.env'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch (_) { return ''; }
}

function lerConfig(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'jev.json'), 'utf8')) || {}; } catch (_) { return {}; }
}

function criarJevSombra({ dir, fetchImpl = fetch, agora = () => Date.now(), timeoutMs = 2500 } = {}) {
  const arquivo = path.join(dir, 'jev-sombra.jsonl');
  function gravar(linha) {
    try { fs.appendFileSync(arquivo, JSON.stringify(linha) + '\n', { mode: 0o600 }); } catch (_) { /* melhor esforço */ }
  }
  async function decidir({ fala, citada, unidade, ultimaSol }) {
    const chave = lerChave(dir);
    if (!chave) return { erro: 'sem_chave' };
    const controle = new AbortController();
    const t = setTimeout(() => controle.abort(), timeoutMs);
    const t0 = agora();
    try {
      const resp = await fetchImpl(URL, {
        method: 'POST', signal: controle.signal,
        // X-Title separa o gasto da Sol e da Maria na tela de uso (a chave é a mesma).
        headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json', 'X-Title': 'Sol', 'HTTP-Referer': 'https://lamusic.com.br/sol' },
        body: JSON.stringify({ model: MODELO, state: estado(fala, citada, unidade, ultimaSol),
          questions: { intencao: { type: 'choice', instructions: 'O que esta mensagem é, do ponto de vista da Sol?', criteria: CRITERIOS } } }),
      });
      const ms = agora() - t0;
      if (!resp.ok) return { erro: `http_${resp.status}`, ms };
      const j = await resp.json();
      const a = j && j.answers && j.answers.intencao;
      if (!a || !a.choice) return { erro: 'sem_resposta', ms };
      return { escolha: a.choice, confianca: typeof a.confidence === 'number' ? a.confidence : null, ms,
        custo: j.usage && typeof j.usage.cost === 'number' ? j.usage.cost : null };
    } catch (e) {
      return { erro: e && e.name === 'AbortError' ? 'timeout' : 'falha', ms: agora() - t0 };
    } finally { clearTimeout(t); }
  }
  // Chamado DEPOIS do caminho de hoje; nunca bloqueia nem lança erro.
  async function observar({ event, unidade, legado, citaCardDaSol = false, cardAberto = false, ultimaSol = null }) {
    try {
      if (!lerConfig(dir).sombra) return null;
      if (!event || event.hasMedia) return null;
      const fala = String(event.body || '').trim();
      if (!fala) return null;
      const base = { ts: new Date(agora()).toISOString(), messageId: event.messageId || null, unidade: unidade || null,
        texto: limpa(fala, 300), citou: !!event.quotedMessageId, cita_card_sol: !!citaCardDaSol, card_aberto: !!cardAberto,
        ctx_sol: !!(ultimaSol && ultimaSol.texto), provedor: 'openrouter', legado: legado && legado.acao ? legado.acao : null };
      let linha;
      if (conversaDeColega(fala, citaCardDaSol)) {
        linha = { ...base, via: 'filtro', escolha: 'conversa', final: 'conversa' };
      } else {
        const r = await decidir({ fala, citada: event.quotedPreview || '', unidade, ultimaSol });
        const final = r.escolha ? aplicarTrava(fala, r.escolha, { citaCardDaSol, cardAberto }) : null;
        linha = { ...base, via: 'jev', ...r, final, trava: !!(final && final !== r.escolha) };
      }
      gravar(linha);
      return linha;
    } catch (_) { return null; }
  }
  return { observar, decidir, _estado: estado };
}

module.exports = { criarJevSombra, CRITERIOS, _estado: estado, _conversaDeColega: conversaDeColega, _aplicarTrava: aplicarTrava };
