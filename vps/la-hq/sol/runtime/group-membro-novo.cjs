'use strict';

// Alerta de MEMBRO NOVO nos grupos financeiros oficiais (28/09/2026, pedido do
// Alfredo). Desde a migration 20260928200000, estar num grupo financeiro oficial
// basta para pedir à Sol abrir/fechar o caixa e lançar dinheiro (política
// `autoriza_qualquer_membro`). Entrar no grupo passou a ser PERMISSÃO FINANCEIRA,
// então o Alf precisa saber de cada entrada. Só avisa — não remove, não bloqueia.
//
// Módulo puro (sem Baileys): a ponte entrega o evento `group-participants.update`
// e as funções de envio/identidade; o teste exercita tudo sem WhatsApp.

function digitos(x) { return String(x || '').replace(/@.*/, '').replace(/\D/g, ''); }

function formatarTelefone(d) {
  const t = String(d || '');
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : (t ? '+' + t : 'número não identificado');
}

// Baileys entrega participantes como string (jid) ou objeto ({ id, phoneNumber }).
function jidDoParticipante(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.phoneNumber || p.id || p.jid || null;
}

function criarAlertaMembroNovo({ gruposFinanceiros, destino, enviar, resolverTelefone, nomeDe, log, janelaDedupMs = 10 * 60 * 1000 }) {
  const _log = typeof log === 'function' ? log : () => {};
  const vistos = new Map(); // "grupo|telefone" -> ts (Baileys repete o evento às vezes)

  async function tratar(update, agora = Date.now()) {
    if (!update || update.action !== 'add') return { acao: 'ignorado', motivo: 'nao_e_entrada' };
    const grupos = typeof gruposFinanceiros === 'function' ? gruposFinanceiros() : (gruposFinanceiros || {});
    const grupo = grupos[update.id];
    if (!grupo) return { acao: 'ignorado', motivo: 'grupo_nao_financeiro' };
    const telDe = (jid) => {
      if (!jid) return null;
      const r = resolverTelefone ? resolverTelefone(jid) : null;
      return digitos(r || (String(jid).endsWith('@lid') ? '' : jid)) || null;
    };
    const autorTel = telDe(update.author);
    const enviados = [];
    for (const p of (Array.isArray(update.participants) ? update.participants : [])) {
      const jid = jidDoParticipante(p);
      const tel = telDe(jid);
      const chave = `${update.id}|${tel || jid}`;
      if (vistos.has(chave) && agora - vistos.get(chave) < janelaDedupMs) continue;
      vistos.set(chave, agora);
      let nome = null; let autorNome = null;
      try { nome = tel && nomeDe ? await nomeDe(tel, grupo) : null; } catch (e) { nome = null; }
      try { autorNome = autorTel && nomeDe ? await nomeDe(autorTel, grupo) : null; } catch (e) { autorNome = null; }
      const quem = nome ? `*${nome}* (${formatarTelefone(tel)})` : `${formatarTelefone(tel)} _(não cadastrado na governança)_`;
      const porQuem = autorTel ? ` por ${autorNome || formatarTelefone(autorTel)}` : '';
      const texto = `🔔 *Entrou alguém no grupo financeiro — ${grupo.nome || 'unidade'}*\n\n`
        + `• Quem: ${quem}\n• Adicionado${porQuem || ' (sem registro de quem adicionou)'}\n\n`
        + '⚠️ Quem está no grupo financeiro pode pedir à Sol para *abrir/fechar o caixa* e *lançar*. '
        + 'Se não era para ter essa permissão, remova do grupo.';
      _log({ step: 'grupo_financeiro_membro_novo', unidade: grupo.nome || null, cadastrado: !!nome, com_autor: !!autorTel });
      if (!destino) { _log({ step: 'grupo_financeiro_membro_novo_sem_destino' }); continue; }
      try { await enviar(destino, texto); enviados.push(tel || jid); }
      catch (e) { _log({ step: 'grupo_financeiro_membro_novo_envio_erro', msg: String(e && e.message) }); }
    }
    return { acao: enviados.length ? 'avisado' : 'sem_envio', avisados: enviados.length };
  }

  return { tratar };
}

module.exports = { criarAlertaMembroNovo, formatarTelefone, jidDoParticipante };
