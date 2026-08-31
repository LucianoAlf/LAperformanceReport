#!/usr/bin/env node
// REABERTURA DO CAIXA — a ferramenta existia no banco desde a V3 e NUNCA teve
// o fio ligado ao WhatsApp (Arthur/Barra 31/08 19:53: "Pode abrir novamente"
// caiu em 'nada', vazou para o agente LLM, que so tem rota de LEITURA — "o
// banco bloqueou a operacao"). O shadow V4 tambem disse 'nada': a intencao nem
// existia no mapa dele. Gap dos dois lados, registrado no placar.
//
// 1) abf: pedidoReabrir + tratarPedidoDiretoReabertura — comando operacional
//    claro de membro autorizado executa DIRETO via sol_caixa_reabrir_caixa_v1
//    (a RPC ja exige autorizacao, so reabre o dia corrente, tira snapshot
//    completo e audita; reabrir nao mexe em saldo).
// 2) bridge: gancho ao lado do fechamento direto.
// 3) roteador V4: intencao reabrir_caixa entra no mapa (shadow aprende junto).
//
// uso: node _patch-reabertura-caixa-31ago.cjs <abf.cjs> <bridge.js> <caixa-financeiro.cjs>
const fs = require('fs');

const [alvoAbf, alvoBridge, alvoFin] = process.argv.slice(2);
if (!alvoAbf || !alvoBridge || !alvoFin) {
  console.error('uso: node _patch-reabertura-caixa-31ago.cjs <abf.cjs> <bridge.js> <caixa-financeiro.cjs>');
  process.exit(2);
}

function trocarEm(arquivo, de, para, rotulo, esperado = 1) {
  let s = fs.readFileSync(arquivo, 'utf8');
  const n = s.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  fs.writeFileSync(arquivo, s.split(de).join(para), 'utf8');
  console.log(`  ok  ${rotulo}`);
}

// ── 1) abf: comando + executor ───────────────────────────────────────────────
trocarEm(alvoAbf,
  `// Espelha o *FECHAMENTO DE CAIXA* do LA Report.`,
  `// Reabrir o caixa FECHADO do dia. So aceita pedido EXPLICITO de reabertura
// (novamente/de novo/reabre) — "abre o caixa" seco continua sendo a abertura
// da manha, outro fluxo.
function pedidoReabrir(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\\bpode\\s+ser\\b/i.test(t)) return false;
  if (/\\b(?:re)?abrir?\\b[^.!?]{0,20}\\bcaixa\\b[^.!?]{0,20}\\b(?:novamente|de novo|outra vez)\\b/i.test(t)) return true;
  if (/\\bcaixa\\b[^.!?]{0,20}\\b(?:re)?abrir?\\b[^.!?]{0,15}\\b(?:novamente|de novo|outra vez)\\b/i.test(t)) return true;
  if (/\\breabr(?:e|a|ir)\\b[^.!?]{0,20}\\bcaixa\\b/i.test(t)) return true;
  if (/\\b(?:pode|consegue|consegues|da pra|dá pra)\\s+(?:re)?abrir\\s+(?:o\\s+caixa\\s+)?(?:novamente|de novo)\\b/i.test(t)) return true;
  return false;
}

// A ferramenta (sol_caixa_reabrir_caixa_v1 + caixa_reaberturas_log) existia
// desde a V3 e nunca teve o fio ligado — em 31/08 o "Pode abrir novamente" do
// Arthur vazou para o agente LLM (rota de leitura) e morreu em "o banco
// bloqueou". Comando claro de membro autorizado executa DIRETO: a RPC exige
// autorizacao, so reabre o dia corrente, tira snapshot e audita.
async function tratarPedidoDiretoReabertura(event, { grupo, sendFn, log = () => {}, rpcFn = chamarRpc }) {
  const chatId = event.chatId;
  if (event.hasMedia) return false;
  if (!grupo || !grupo.unidade_id) return false;
  if (!pedidoReabrir(event.body)) return false;

  const senderNum = String(event.senderPhone || event.senderId || '').replace(/@.*/, '').replace(/\\D/g, '');
  let quem = event.senderName || senderNum;
  try {
    const fin = require('./caixa-financeiro.cjs');
    const ident = await fin.identificarPessoa(event.senderPhone, grupo.unidade_id);
    quem = fin.nomeParaCarimbo(ident, event);
  } catch (e) { /* best-effort: mantem o pushName */ }

  let r;
  try {
    r = await rpcFn('sol_caixa_reabrir_caixa_v1', { p_payload: {
      unidade_id: grupo.unidade_id,
      motivo: 'Reabertura pedida no grupo oficial por ' + quem,
      ator_numero: senderNum, ator_papel: 'grupo',
      autorizado_por: quem, grupo_jid: chatId, chat_id: chatId,
    } });
  } catch (e) {
    await sendFn(chatId, '⚠️ Não consegui reabrir agora. Tenta de novo em instantes.');
    log({ acao: 'reabertura_erro', erro: String(e.message || e).slice(0, 200) });
    return true;
  }
  if (r && r.ok && r.reaberto) {
    await sendFn(chatId, \`Caixa da \${_cap(String(grupo.nome || ''))} reaberto ✅ — saldo inicial \${brl(r.saldo_inicial)} mantido, lançamentos preservados. Pode mandar.\\n_\${quem} autorizou · reabertura registrada com snapshot._\`);
    log({ acao: 'caixa_reaberto', caixa: r.caixa_diario_id, por: quem });
    return true;
  }
  if (r && r.ok && r.ja_aberto) {
    await sendFn(chatId, 'O caixa já está aberto ✅ — pode lançar.');
    log({ acao: 'reabertura_ja_aberto' });
    return true;
  }
  const motivo = r && r.motivo;
  const humano = {
    caixa_inexistente_no_dia: 'o caixa de hoje ainda não foi aberto — a abertura sai no fluxo da manhã.',
    reabrir_nao_autorizado: \`não encontrei autorização de \${quem} para reabrir o caixa desta unidade.\`,
    reabertura_so_do_dia_corrente: 'só consigo reabrir o caixa do dia corrente; dia anterior é operação manual com a diretoria.',
  }[motivo] || \`não consegui (\${motivo || 'erro desconhecido'}).\`;
  await sendFn(chatId, \`⚠️ Não reabri: \${humano}\`);
  log({ acao: 'reabertura_recusada', motivo });
  return true;
}

// Espelha o *FECHAMENTO DE CAIXA* do LA Report.`,
  'abf pedidoReabrir + tratarPedidoDiretoReabertura');

trocarEm(alvoAbf,
  `  afirmativo, negativoFechamento, pedidoDiretoFechar, chamarRpc, tratarConfirmacao,
  tratarPedidoDiretoFechamento, postarAbertura, postarFechamento,`,
  `  afirmativo, negativoFechamento, pedidoDiretoFechar, chamarRpc, tratarConfirmacao,
  tratarPedidoDiretoFechamento, pedidoReabrir, tratarPedidoDiretoReabertura,
  postarAbertura, postarFechamento,`,
  'abf exports');

// ── 2) bridge: gancho ao lado do fechamento direto ───────────────────────────
trocarEm(alvoBridge,
  `              const _direto = await _abf.tratarPedidoDiretoFechamento(event, { grupo: _grupoCaixa, sendFn: _sf, log: _caixaLog });
              if (_direto) { typingStop(chatId); _caixaLog({ step: 'abf_fechamento_direto' }); continue; }`,
  `              const _direto = await _abf.tratarPedidoDiretoFechamento(event, { grupo: _grupoCaixa, sendFn: _sf, log: _caixaLog });
              if (_direto) { typingStop(chatId); _caixaLog({ step: 'abf_fechamento_direto' }); continue; }
              // Reabertura do caixa fechado do dia (31/08: "Pode abrir novamente"
              // vazava para o LLM de leitura e morria em "banco bloqueou").
              const _reab = _abf.tratarPedidoDiretoReabertura
                ? await _abf.tratarPedidoDiretoReabertura(event, { grupo: _grupoCaixa, sendFn: _sf, log: _caixaLog })
                : false;
              if (_reab) { typingStop(chatId); _caixaLog({ step: 'abf_reabertura_direta' }); continue; }`,
  'bridge gancho reabertura');

// ── 3) roteador V4: intencao no mapa ─────────────────────────────────────────
trocarEm(alvoFin,
  `'{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|corrigir_lancamento_gravado|estornar_lancamento|consulta_caixa|conversa|nada",'`,
  `'{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|corrigir_lancamento_gravado|estornar_lancamento|reabrir_caixa|abrir_caixa|fechar_caixa|consulta_caixa|conversa|nada",'`,
  'roteador V4 intencoes de caixa');

trocarEm(alvoFin,
  `      + '"saida_dinheiro" quando relatam despesa/retirada paga do caixa. "consulta_caixa" para perguntas (resumo, quanto entrou, etc). '`,
  `      + '"saida_dinheiro" quando relatam despesa/retirada paga do caixa. "consulta_caixa" para perguntas (resumo, quanto entrou, etc). '
      + '"reabrir_caixa" quando pedem para abrir NOVAMENTE um caixa fechado ("pode abrir novamente", "reabre o caixa"). '`,
  'roteador V4 regra reabrir');

console.log('\\npatches aplicados');
