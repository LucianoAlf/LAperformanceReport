// Reproduz a sequência exata do Arthur/Barra (26/08, 13:34-13:49) e prova que os dois
// defeitos foram fechados: (1) reenvio do comprovante não cria uma segunda pendência
// ambígua; (2) a guarda "não vaza pro LLM" não fala em cima de mensagem que não é pra Sol.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');
const groupEngagement = require('/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/group-engagement.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';

function parseNomeValor(texto) {
  const linhas = String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const itens = [];
  for (const l of linhas) {
    const m = l.match(/^([A-Za-zÀ-ÿ ]+?)\s*[-·]\s*R?\$?\s*([\d.,]+)/);
    if (m) itens.push({ aluno_nome: m[1].trim(), valor: Number(m[2].replace(/\./g, '').replace(',', '.')), categoria: 'passaporte' });
  }
  return itens;
}

function novo() {
  const enviadas = []; let seq = 0;
  let chamadasInterpretarCorrecao = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'M' + (++seq); },
    // valor do comprovante: o mesmo nas duas "fotos", como no caso real (Arthur reenviou
    // o MESMO comprovante — mesmo valor 789,50 nas duas tentativas)
    ocrFn: async () => ({ text: '', status: 'texto_vazio' }),
    visaoFn: async () => ({ valor: 789.50, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: null, forma: 'pix' }),
    interpretarMultiFn: async (texto) => {
      const t = String(texto || '');
      const comValor = parseNomeValor(t);
      if (comValor.length >= 2) {
        chamadasInterpretarCorrecao++;
        return { itens: comValor, valor_total: 789.50, forma: 'pix', categoria: 'passaporte' };
      }
      // só a legenda da imagem: reconhece os 2 nomes, mas sem valor por aluno —
      // é o que a Sol de fato tem quando só vê "Parcela Joaquim candido e Thomas Amadeu"
      const m = t.match(/parcela\s+(.+?)\s+e\s+(.+)/i);
      if (m) return { itens: [{ aluno_nome: m[1].trim() }, { aluno_nome: m[2].trim() }], valor_total: null, categoria: 'passaporte' };
      return null;
    },
    // 1ª tentativa de resolver (sem valor por aluno) falha por ambiguidade — igual ao real
    resolverMultiFn: async ({ itens }) => {
      const temValorPorItem = itens.every((i) => i.valor != null && i.valor > 0);
      if (!temValorPorItem) return { ok: false, motivo: 'alocacao_nao_derivavel' };
      return { ok: true, itens: itens.map((i) => ({ ...i, aluno_id: 1, canonical_fatura_id: 'fake-uuid' })) };
    },
    identidadeFn: async () => ({ identificado: true, nome: 'Arthur' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    log: () => {},
  });
  return {
    handle: (e) => h.handle(e), citaAlgumaPendencia: h.citaAlgumaPendencia, temPendencia: h.temPendencia,
    pendentesInternas: () => h._pendentes.get(CHAT) || [],
    chamadasInterpretarCorrecao: () => chamadasInterpretarCorrecao,
    enviadas,
  };
}

(async () => {
  const falhas = [];
  const H = novo();

  // 1ª foto do comprovante — cria pendência MANUAL #1
  await H.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'IMG1',
    body: 'Parcela Joaquim candido e Thomas Amadeu', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://x1.jpg'] });

  // reenvio da MESMA foto (OCR travou, Arthur reenvia) — ANTES DO FIX criava pendência #2
  await H.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'IMG2',
    body: 'Parcela Joaquim candido e Thomas Amadeu', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://x1.jpg'] });

  const qtdPendencias = H.pendentesInternas().filter((p) => p.tipoOperacao === 'manual_review_multi_student').length;
  console.log('pendências manuais após 2 envios do mesmo comprovante:', qtdPendencias);
  if (qtdPendencias !== 1) falhas.push(`esperava 1 pendência (dedup), achei ${qtdPendencias}`);

  // total sem nomes — deve continuar recusado (comportamento correto, sem mudança)
  const rTotal = await H.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'TXT1',
    body: '789,50 (394,75+394,75)', hasMedia: false });
  console.log('total sem nomes:', rTotal && rTotal.acao);

  // a correção EXATA que a Sol pediu — deve chegar ao interpretador e resolver
  const rCorr = await H.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'TXT2',
    body: 'Joaquim Cândido - R$ 394,75\nThomas Amadeu · R$ 394,75', hasMedia: false });
  console.log('correção com nome+valor:', rCorr && rCorr.acao, '| interpretador chamado:', H.chamadasInterpretarCorrecao(), 'vez(es)');
  if (H.chamadasInterpretarCorrecao() === 0) {
    falhas.push('a correção nunca chegou a chamar o interpretador — alvoManual continua null (dedup não resolveu)');
  }
  if (!rCorr || rCorr.acao === 'nada') {
    falhas.push('correção "Nome - R$ valor" ainda cai em "nada"');
  }

  // mensagem de OUTRO assunto, de OUTRA pessoa, sem citar nada e sem mencionar Sol
  const asideText = 'Vou ver o que aconteceu ok?';
  const pareceProSol = groupEngagement.pareceChamarSol(asideText);
  const citouCard = H.citaAlgumaPendencia(CHAT, undefined);
  console.log('aside "Vou ver o que aconteceu ok?" — pareceProSol:', pareceProSol, '| citouCard:', citouCard);
  if (pareceProSol || citouCard) falhas.push('mensagem não-relacionada seria tratada como dirigida à Sol');

  // mensagem que MENCIONA a Sol deve continuar disparando a guarda normalmente
  if (!groupEngagement.pareceChamarSol('Sol, o aluno é o Rafael')) {
    falhas.push('mensagem que MENCIONA "Sol" deveria continuar sendo reconhecida');
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — reenvio não duplica pendência, e a guarda só fala quando é pra Sol');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
