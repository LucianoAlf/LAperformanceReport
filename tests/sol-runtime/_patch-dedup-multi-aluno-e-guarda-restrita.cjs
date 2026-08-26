#!/usr/bin/env node
// (1) Reenvio do mesmo comprovante nao pode criar uma SEGUNDA pendencia ambigua.
// (2) A guarda "nao vaza pro LLM" so fala quando a mensagem plausivelmente e' PRA a Sol.
//
// CASO REAL (Arthur/Barra, 26/08 13:34-13:49):
//   13:34  comprovante 1 (imagem+legenda "Parcela Joaquim candido e Thomas Amadeu")
//          -> OCR trava 45s, cai no fallback de visao, cria pendencia MANUAL #1
//   13:36  Sol: "Entendi a divisao, mas ainda nao consegui confirmar todas as faturas..."
//   13:38  Arthur reenvia o MESMO comprovante (achou que nao tinha pegado)
//          -> cria pendencia MANUAL #2, MESMO valor (789,50)
//   13:38  Arthur manda "789,50 (394,75+394,75)" -> corretamente recusado (so total, sem nomes)
//   13:39  Sol pede: "Manda os dois assim: Nome - R$ valor"
//   13:40  Arthur manda EXATAMENTE isso: "Joaquim Candido - R$ 394,75 / Thomas Amadeu - R$ 394,75"
//          -> **NADA ACONTECE**. Por que: com 2 pendencias MANUAL e a mensagem NAO sendo
//          uma citacao (quote) de nenhum card, `alvoManual` fica NULL (o codigo so
//          resolve quando ha exatamente 1 candidata) e o bloco inteiro de correcao e
//          PULADO -- nunca chega a chamar o interpretador de nomes. Handler devolve 'nada'.
//   13:40  a guarda de ontem ("nao vaza pro LLM") intercepta o 'nada' e manda
//          "Nao entendi essa... tem lancamento em aberto"
//   13:42  Luciano escreve "Vou ver o que aconteceu ok?" (mensagem PRA OUTRO HUMANO,
//          nada a ver com a Sol) -> a guarda dispara DE NOVO, porque ela so olha
//          "_r.acao === 'nada' && temPendencia(chatId)" -- sem checar se a mensagem
//          tinha QUALQUER relacao com a Sol ou a pendencia. Isso e regressao: uma
//          pendencia travada passa a "envenenar" a conversa inteira do grupo.
//
// CORRECAO EM DUAS CAMADAS:
//   A) raiz: reenvio do mesmo comprovante (mesmo valor, janela curta) SUBSTITUI a
//      pendencia anterior em vez de empilhar uma segunda -- nunca mais chega a 2
//      candidatas pelo motivo mais comum (OCR lento, gente reenvia por ansiedade).
//   B) blindagem: a guarda so fala quando a mensagem PARECE ser pra Sol (menciona
//      "Sol" -- reaproveita pareceChamarSol, ja usado no gate de engajamento) OU
//      cita um card pendente. Mensagem que nao faz nem uma coisa nem outra segue
//      o fluxo normal do grupo -- exatamente como seria SEM nenhuma pendencia aberta.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-dedup-multi-aluno-e-guarda-restrita.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. dedup: reenvio do mesmo comprovante substitui, nao empilha ───────────────────
trocar(
  `  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, intent, agora, origemMessageId }) {
    const arr = limparVelhos(event.chatId, agora);
    const colocarEmRevisao = async (motivo, extra = {}) => {
      const pendencia = {
        tipoOperacao: 'manual_review_multi_student', unidade_id: grupo.unidade_id, nome: grupo.nome,
        multiTexto: textoFonte, valor: intent && intent.valor_total || extra.valor || null,
        forma: intent && intent.forma || extra.forma || null, categoria: intent && intent.categoria || extra.categoria || null,
        origem: origemMessageId || event.messageId, idemKey: \`\${event.chatId}:\${origemMessageId || event.messageId}:multi\`,
        ts: agora, motivoMulti: motivo,
      };
      arr.push(pendencia); pendentes.set(event.chatId, arr);
      return pendencia;
    };`,
  `  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, intent, agora, origemMessageId }) {
    const arr = limparVelhos(event.chatId, agora);
    // Janela de reenvio: OCR lento (frequente, ~45s de timeout) leva a equipe a mandar o
    // MESMO comprovante de novo. Sem isto, cada reenvio empilha outra pendencia MANUAL
    // com o mesmo valor -- e a correcao seguinte, sem citar um card especifico, fica sem
    // como saber qual delas corrigir (2 candidatas = nenhuma escolhida, mensagem cai no
    // vazio). 15 min cobre o padrao real observado (2 reenvios em ~4 min).
    const DEDUP_MULTI_JANELA_MS = 15 * 60 * 1000;
    const colocarEmRevisao = async (motivo, extra = {}) => {
      const pendencia = {
        tipoOperacao: 'manual_review_multi_student', unidade_id: grupo.unidade_id, nome: grupo.nome,
        multiTexto: textoFonte, valor: intent && intent.valor_total || extra.valor || null,
        forma: intent && intent.forma || extra.forma || null, categoria: intent && intent.categoria || extra.categoria || null,
        origem: origemMessageId || event.messageId, idemKey: \`\${event.chatId}:\${origemMessageId || event.messageId}:multi\`,
        ts: agora, motivoMulti: motivo,
      };
      const duplicada = pendencia.valor != null && arr.find((p) =>
        p.tipoOperacao === 'manual_review_multi_student'
        && (agora - p.ts) < DEDUP_MULTI_JANELA_MS
        && p.valor != null && Math.abs(Number(p.valor) - Number(pendencia.valor)) < 0.01);
      if (duplicada) {
        log({ acao: 'manual_review_multi_student_dedup', chatId: event.chatId, valor: pendencia.valor });
        arr.splice(arr.indexOf(duplicada), 1, pendencia);
      } else {
        arr.push(pendencia);
      }
      pendentes.set(event.chatId, arr);
      return pendencia;
    };`,
  'dedup no colocarEmRevisao');

// ── 2. expoe se uma citacao aponta pra alguma pendencia viva (qualquer tipo) ─────────
trocar(
  `  return { handle, temPendencia, _pendentes: pendentes };`,
  `  // A guarda de "nao vaza pro LLM" (bridge) precisa saber se a mensagem CITA um card
  // pendente, para so falar quando a mensagem plausivelmente e' pra Sol -- sem isto ela
  // interceptava QUALQUER mensagem nao reconhecida no grupo, inclusive assunto entre
  // humanos (caso Luciano/Barra 26/08: "Vou ver o que aconteceu ok?").
  function citaAlgumaPendencia(chatId, quotedMessageId, agora = Date.now()) {
    if (!quotedMessageId) return false;
    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId || p.origem === quotedMessageId);
  }

  return { handle, temPendencia, citaAlgumaPendencia, _pendentes: pendentes };`,
  'exporta citaAlgumaPendencia');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
