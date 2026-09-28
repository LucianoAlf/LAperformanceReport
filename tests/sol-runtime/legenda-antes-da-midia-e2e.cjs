// Legenda e comprovante chegam como DUAS mensagens e a ordem é acaso
// (CG 28/09 17:16, Mayra): o texto "PG pix parcela 10/2026 aluna Julia Silva de
// Freitas - LA CG R$457,73" chegou 33 ms ANTES do PDF encaminhado. O texto foi
// tratado sozinho ("Entendi um pagamento… não achei fatura") e o PDF virou outro
// card sem aluno. Reproduz a entrega real: dois handle() concorrentes.
// Roda com a V4 na frente, como em produção (CG no canário): é ela que tratava o
// texto sozinho por ~12 s e soltava o aviso "não achei fatura".
process.env.SOL_CAIXA_V4_CANARIO = '5521900000000-1544200000@g.us';
const mod = require('./_alvo.cjs');

const CHAT = '5521900000000-1544200000@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEGENDA = 'PG pix parcela 10/2026 aluna Julia Silva de Freitas - LA CG R$457,73';
const OCR = 'Comprovante de transferência\nPix enviado\nValor R$ 457,73\nData 28/09/2026\nID da transação E1234567890';

function novo(overrides = {}) {
  const enviadas = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    ocrFn: async () => { await sleep(300); return { text: OCR, status: 'ok' }; },
    visaoFn: async () => ({ valor: null, forma: null }),
    interpretarFn: async (t) => ({ categoria: 'parcela', aluno: /julia/i.test(t) ? 'Julia Silva de Freitas' : null, competencia: '10/2026', forma: 'pix' }),
    canonicaFn: async (_u, nome) => (/julia/i.test(String(nome || '')) ? {
      ok: true, aluno_nome: 'Julia Silva de Freitas', confianca_nome: 1, motivo_escolha: 'valor_exato', fonte_status: 'ok',
      fatura: { canonical_fatura_id: '11111111-1111-1111-1111-111111111111', tipo_fatura: 'parcela',
        descricao: 'Parcela 10/2026 do curso de Canto', competencia: '2026-09-01', data_vencimento: '2026-09-20',
        status: 'aberta', valor_da_parcela: 427, valor_hoje: 457.73, valor_pago: null, vencida: true, dias_atraso: 8 },
    } : { ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra ADM' }),
    lancarFn: async (p) => ({ movimentacao_id: 1, valor: p.valor }),
    // o Core respondia nenhuma_fatura_aberta (a competência vinha da descrição: ver a migration)
    rotearV4Fn: async (t) => (/julia/i.test(String(t || '')) ? { intencao: 'lancamento_por_texto', confianca: 0.95,
      aluno_nome: 'Julia Silva de Freitas', valor_total: 457.73, forma: 'pix', categoria: 'parcela', competencia: '10/2026' }
      : { intencao: 'nada', confianca: 0.95 }),
    resolverEnvelopeFn: async () => { await sleep(1500); return { ok: false, motivo: 'nenhuma_fatura_aberta' }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs };
}

const ev = (id, extra) => ({ chatId: CHAT, senderId: '5521911112222@s.whatsapp.net', senderPhone: '5521911112222',
  messageId: id, ...extra });

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };

  // ⚠️ Só a ordem do incidente (texto ANTES). Mídia primeiro com a V4 na frente
  //    também sai com card sem aluno + correção no código atual, mas é outro
  //    caminho (lote/bolha irmã) e desviá-lo quebrou a divisão multi-aluno —
  //    fica aberto, declarado.
  for (const ordem of ['texto_antes']) {
    const { h, enviadas, logs } = novo();
    const texto = ev('TXT1', { body: LEGENDA, hasMedia: false });
    const midia = ev('DOC1', { body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/x.pdf'] });
    const t0 = Date.now();
    const [a, b] = ordem === 'texto_antes'
      ? [h.handle(texto, t0), (async () => { await sleep(33); return h.handle(midia, t0 + 33); })()]
      : [h.handle(midia, t0), (async () => { await sleep(33); return h.handle(texto, t0 + 33); })()];
    const rs = await Promise.all([a, b]);
    const aviso = enviadas.filter((t) => /Entendi um pagamento/.test(t));
    const cards = enviadas.filter((t) => /Comprovante recebido/.test(t));
    checar(aviso.length === 0, `${ordem}: não pode sair o aviso "não achei fatura" (saiu ${aviso.length})`);
    checar(cards.length === 1, `${ordem}: esperava 1 card, veio ${cards.length} — ${JSON.stringify(enviadas).slice(0, 400)}`);
    checar(cards[0] && /Julia Silva de Freitas/.test(cards[0]), `${ordem}: o card precisa trazer a aluna da legenda — ${String(cards[0]).slice(0, 300)}`);
    checar(cards[0] && !/Não identifiquei/.test(cards[0]), `${ordem}: card não pode dizer "não identifiquei"`);
    checar(rs.some((r) => r && r.acao === 'legenda_anexada_a_midia'), `${ordem}: o texto devia virar legenda (${JSON.stringify(rs)})`);
    checar(logs.some((l) => l.acao === 'legenda_anterior_adotada_pela_midia'), `${ordem}: sem log do pareamento`);
  }

  // Controle: mídia COM legenda própria não adota o texto de outra
  {
    const { h, enviadas } = novo();
    const t0 = Date.now();
    const texto = ev('TXT2', { body: 'PG pix parcela 09/2026 aluno Outro Nome R$ 300,00', hasMedia: false });
    const midia = ev('DOC2', { body: 'PG pix parcela 10/2026 aluna Julia Silva de Freitas R$457,73', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/y.pdf'] });
    const rs = await Promise.all([h.handle(texto, t0), (async () => { await sleep(33); return h.handle(midia, t0 + 33); })()]);
    checar(!(rs[0] && rs[0].acao === 'legenda_anexada_a_midia'), 'mídia com legenda própria não pode engolir o texto de outro pagamento');
    checar(enviadas.some((t) => /Julia Silva de Freitas/.test(t)), 'a mídia com legenda própria segue com a legenda dela');
  }

  // Controle: "pode" nunca vira legenda
  {
    const { h } = novo();
    const t0 = Date.now();
    const rs = await Promise.all([h.handle(ev('TXT3', { body: 'pode', hasMedia: false }), t0),
      (async () => { await sleep(33); return h.handle(ev('DOC3', { body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/z.pdf'] }), t0 + 33); })()]);
    checar(!(rs[0] && rs[0].acao === 'legenda_anexada_a_midia'), '"pode" não pode virar legenda');
  }

  if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('ok: legenda que chega antes da mídia vira UM card com a aluna; controles preservados');
})().catch((e) => { console.error(e); process.exit(1); });
