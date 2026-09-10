'use strict';

// Gate de conversa em grupo. Caixa continua observando comprovantes e
// confirmações determinísticas; este módulo só decide quando a conversa geral
// pode seguir para o agente. A janela pertence a quem chamou a Sol, nunca ao
// grupo inteiro.

function normalizarTexto(valor = '') {
  return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function chaveIdentidade(valor = '') {
  return String(valor || '').replace(/:.*@/, '@').replace(/@.*/, '').replace(/\D/g, '');
}

function pareceChamarSol(texto = '') {
  const n = normalizarTexto(texto);
  return /^sol\s*$/.test(n)
    || /(^|[^a-z0-9])@sol\b/.test(n)
    || /(^|[^a-z0-9])sol\s*[,!?:]/.test(n)
    || /^sol\s+(me|nos|voce|vc|pode|poderia|consegue|ve|olha|manda|traz|qual|quais|quanto|quantos|quando|como|onde|porque|por que|preciso|faz|faca|ajuda|verifica|confere|checa|lista|mostra|tem|para|responde|responder|ta|esta)\b/.test(n)
    || /^pode\s*(?:[,!?:]|\s+ai)?\s+sol\b/.test(n)
    || /(^|[^a-z0-9])(oi|ola|opa|bom dia|boa tarde|boa noite|fala|e ai|ei)\s+sol\b/.test(n);
}

function mencionaSol(texto, mentionedIds, identidadesProprias) {
  const proprias = new Set(Array.from(identidadesProprias || [], chaveIdentidade).filter(Boolean));
  for (const id of mentionedIds || []) {
    const chave = chaveIdentidade(id);
    if (chave && proprias.has(chave)) return true;
  }
  return pareceChamarSol(texto);
}

function encerraTurnoDaSol(texto = '') {
  const n = normalizarTexto(texto);
  // Despedidas de fim de expediente entram aqui: em 29/08 "Fechado pessoal" e
  // "Bom final de semana" foram parar no LLM, que respondeu VAZIO, e o fallback
  // do gateway postou "(Response formatting failed, plain text:)" no grupo 2x.
  return /(obrigad[ao]|valeu|vlw|tchau|ate mais|ate logo|resolvido|ta resolvido|nao precisa|nao sera necessario|nao e mais necessario|pode sair|pode ir|encerrar|encerra|dispensad[ao]|bom (final|fim) de semana|boa semana|bom descanso|ate segunda|ate amanha|bom feriado)/.test(n);
}

// Agradecimento e' um subconjunto de encerraTurnoDaSol: encerra o turno IGUAL, mas
// merece um "de nada" antes do silencio. "tchau"/"resolvido"/"nao precisa" nao entram —
// ali calar e' a resposta certa.
function ehAgradecimento(texto = '') {
  const n = normalizarTexto(texto);
  return /(^|[^a-z])(obrigad[ao]|obg|brigad[ao]|valeu|vlw|agradec)/.test(n);
}

function falaDirecionadaAHumano(texto, mentionedIds, identidadesProprias) {
  const proprias = new Set(Array.from(identidadesProprias || [], chaveIdentidade).filter(Boolean));
  if ((mentionedIds || []).some((id) => {
    const chave = chaveIdentidade(id);
    return chave && !proprias.has(chave);
  })) return true;
  const n = normalizarTexto(texto);
  if (pareceChamarSol(n)) return false;
  return /^(alf|luciano|anne|ana|rose|joao|pedro|pessoal|galera|gente|meninas|meninos|time|equipe)\s*[,!:]/.test(n);
}

function createGroupEngagementPolicy({ gruposQueRespondem, janelaMs }) {
  const grupos = gruposQueRespondem instanceof Set ? gruposQueRespondem : new Set(gruposQueRespondem || []);
  const ativoAte = new Map();
  function abrirJanela({ chatId, senderId = '', motivo = 'unknown', agora = Date.now() }) {
    if (!chatId) return null;
    const rec = { until: agora + janelaMs, senderId: String(senderId || '') };
    ativoAte.set(chatId, rec);
    return { ...rec, motivo };
  }
  function fecharJanela(chatId) { ativoAte.delete(chatId); }
  function decidir({ chatId, texto, mentionedIds, identidadesProprias, senderId = '', agora = Date.now() }) {
    if (!grupos.has(chatId)) { fecharJanela(chatId); return { responder: false, motivo: 'grupo_so_registra' }; }
    if (encerraTurnoDaSol(texto)) {
      fecharJanela(chatId);
      // ⚠️ 'cortesia' NAO reabre a janela e NAO chama o LLM: e uma linha curta e fixa,
      // enviada pela bridge. Quem agradece e leva vacuo acha que o sistema travou
      // (Vitoria/Recreio 25/08). So vale quando o agradecimento e dirigido a Sol —
      // "obrigada Ana" no meio do grupo continua sem resposta.
      // ⚠️ mencionaSol() exige PONTUACAO depois do nome ("sol," / "sol!") ou o nome no
      // inicio. "Obrigada sol 😊" tem o nome solto no fim e nao casava — justamente a
      // forma mais natural de agradecer. Para cortesia basta o nome aparecer como
      // palavra, em qualquer posicao, ou a janela estar ativa para quem escreveu.
      const _n = normalizarTexto(texto);
      const _citaSol = /(^|[^a-z0-9])sol([^a-z0-9]|$)/.test(_n)
        || mencionaSol(texto, mentionedIds, identidadesProprias);
      const _janelaEraDele = (() => {
        const r = ativoAte.get(chatId);
        return !!(r && r.until > agora && (!r.senderId || !senderId || r.senderId === String(senderId)));
      })();
      const _cortesia = ehAgradecimento(texto) && (_citaSol || _janelaEraDele);
      return { responder: false, motivo: 'turno_encerrado', cortesia: _cortesia };
    }
    if (mencionaSol(texto, mentionedIds, identidadesProprias)) {
      abrirJanela({ chatId, senderId, motivo: 'chamada', agora });
      return { responder: true, motivo: 'chamada' };
    }
    const rec = ativoAte.get(chatId);
    if (!rec || rec.until <= agora) { fecharJanela(chatId); return { responder: false, motivo: 'standby' }; }
    if (rec.senderId && senderId && rec.senderId !== String(senderId)) return { responder: false, motivo: 'janela_de_outro_remetente' };
    if (falaDirecionadaAHumano(texto, mentionedIds, identidadesProprias)) return { responder: false, motivo: 'janela_ignorada_fala_humana' };
    abrirJanela({ chatId, senderId: rec.senderId || senderId, motivo: 'continuacao', agora });
    return { responder: true, motivo: 'janela_ativa' };
  }
  return { abrirJanela, fecharJanela, decidir, ativoAte };
}

module.exports = { createGroupEngagementPolicy, ehAgradecimento, encerraTurnoDaSol, pareceChamarSol };
