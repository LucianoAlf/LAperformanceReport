// SOL-103 — RESPOSTA "de 10/2026 a 09/2027" NO CARD DE QUITAÇÃO (29/09/2026).
// O card de quitação deduz o período pela 1ª parcela e ensina: "se for outro
// período, me diz: *de 09/2026 a 08/2027*". A resposta nesse formato caía no
// caminho de VÁRIAS COMPETÊNCIAS: lida como duas parcelas (10/2026 e 09/2027), o
// card era invalidado e era preciso reenviar o comprovante.
// Prova (handler real, fakes de E/S): a resposta vira o PERÍODO, as faturas do
// novo período são resolvidas, o MESMO card é remontado (um só aberto) e o "pode"
// grava fatura_ids do período informado. Controles: período implausível pede de
// novo; outra pessoa sem citar não mexe no card.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V4_CANARIO = '';
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const AUTOR = '5521900000009';
const OUTRA = '5521900000008';
const MATRICULA = 2733001;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// 13 parcelas de 09/2026 a 09/2027 (R$ 397 líquido), uma matrícula.
const FATURAS = [];
for (let i = 0; i < 13; i += 1) {
  const m = ((8 + i) % 12) + 1; const a = 2026 + Math.floor((8 + i) / 12);
  const mm = `${String(m).padStart(2, '0')}/${a}`;
  FATURAS.push({ id: uuid(70100 + i), competencia: `${a}-${String(m).padStart(2, '0')}-01`, status: 'aberta',
    descricao: `Parcela ${mm} do curso de Canto`, valor_original: 397, desconto_fixo: 0,
    desconto_condicional: 0, emusys_matricula_id: MATRICULA });
}
const IDS_10_A_09 = FATURAS.slice(1, 13).map((f) => f.id);

function fixture() {
  const enviadas = []; const ids = []; const lancados = []; const periodos = []; let seq = 0;
  const sel = mod.selecionarFaturasQuitacao;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'Comprovante Pix R$ 4.764,00', status: 'ok', file_bytes: 76001 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Fulana Beltrana de Souza', forma: 'pix' }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    responsavelFn: async () => null,
    canonicaFn: async () => ({ ok: true, aluno_nome: 'Fulana Beltrana de Souza', motivo_escolha: 'valor_exato',
      fatura: { canonical_fatura_id: FATURAS[0].id, aluno_id: 101, tipo_fatura: 'parcela',
        descricao: 'Parcela 09/2026 do curso de Canto', competencia: '2026-09-01', status: 'aberta',
        valor_da_parcela: 397, numero_parcela: 9, total_parcelas_contrato: 12 } }),
    casarFn: async () => null, pagadorFn: async () => ({ ok: false }), faturasMesFn: async () => null,
    faturasQuitacaoFn: async (_u, alunoId, q) => {
      periodos.push(`${q.inicio}-${q.fim}`);
      return { ...sel(FATURAS, new Set(), { inicio: q.inicio, fim: q.fim, matriculaPreferida: MATRICULA }), aluno_id: alunoId };
    },
    listarPreviewsAbertosFn: async () => [], rotearV4Fn: async () => null, chequesFn: null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-1', valor: Number(p.valor), forma: p.forma }; },
    log: () => {},
  });
  return { h, enviadas, ids, lancados, periodos };
}
const ev = (id, body, extra = {}, quem = AUTOR) => ({ chatId: CHAT, senderPhone: quem, senderId: quem + '@c.us',
  messageId: id, body, hasMedia: false, ...extra });
const LEGENDA = 'PG pix quitação 12 parcelas aluna Fulana Beltrana de Souza R$4.764,00';

(async () => {
  const falhas = [];
  const ok = (c, m) => { if (!c) falhas.push(m); };

  // A) caminho feliz
  {
    const { h, enviadas, ids, lancados, periodos } = fixture();
    await h.handle(ev('Q1', LEGENDA, { hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/q1.jpg'] }));
    ok(/09\/2026 a 08\/2027/.test(enviadas[0] || ''), `A0: card propõe 09/2026 a 08/2027 — ${String(enviadas[0]).slice(0, 300)}`);
    const r = await h.handle(ev('Q2', 'de 10/2026 a 09/2027', { quotedMessageId: ids[0] }));
    ok(r && r.acao === 'quitacao_periodo_corrigido', `A1: resposta vira período (${JSON.stringify(r)})`);
    const card = enviadas[enviadas.length - 1] || '';
    ok(/Meses: \*10\/2026 a 09\/2027\*/.test(card), `A2: card remontado com o período — ${card.slice(0, 400)}`);
    ok(/Vou vincular \*12 faturas\*/.test(card), 'A3: as 12 faturas do novo período');
    ok(!/Deduzi pela 1ª parcela/.test(card), 'A4: não diz mais que deduziu');
    ok(!enviadas.some((t) => /parcelas \*10\/2026 e 09\/2027\*/.test(t)), 'A5: não lê como duas parcelas');
    ok(periodos.includes('10/2026-09/2027'), `A6: faturas resolvidas para o período informado (${periodos})`);
    const abertos = h._pendentes.get(CHAT) || [];
    ok(abertos.length === 1 && abertos[0].quitacao.inicio === '10/2026' && abertos[0].quitacao.competencias.length === 12,
      'A7: um card aberto, com a lista de competências do período');
    await h.handle(ev('Q3', 'pode', { quotedMessageId: ids[ids.length - 1] }));
    const p = lancados[0];
    ok(p && Array.isArray(p.fatura_ids) && p.fatura_ids.length === 12
      && p.fatura_ids.every((id) => IDS_10_A_09.includes(id)), `A8: pode grava as faturas de 10/2026 a 09/2027 — ${p && JSON.stringify(p.fatura_ids)}`);
    ok(p && /Parcelas 10\/2026 a 09\/2027/.test(String(p.descricao || '')), `A9: descrição — ${p && p.descricao}`);
  }

  // B) período implausível: pede de novo, card continua
  {
    const { h, enviadas, ids } = fixture();
    await h.handle(ev('Q1', LEGENDA, { hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/q1.jpg'] }));
    const r = await h.handle(ev('Q2', 'de 10/2026 a 09/2029', { quotedMessageId: ids[0] }));
    ok(r && r.acao === 'quitacao_periodo_invalido', `B1: ${JSON.stringify(r)}`);
    ok((h._pendentes.get(CHAT) || []).length === 1, 'B2: card continua aberto');
    ok(/não fecha uma quitação/.test(enviadas[enviadas.length - 1]), 'B3: explica');
  }

  // C) outra pessoa, sem citar e sem chamar a Sol: não mexe
  {
    const { h } = fixture();
    await h.handle(ev('Q1', LEGENDA, { hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/q1.jpg'] }));
    const r = await h.handle(ev('Q2', 'de 10/2026 a 09/2027', {}, OUTRA));
    ok(!(r && /quitacao_periodo/.test(String(r.acao))), `C1: conversa de outra pessoa não corrige (${JSON.stringify(r)})`);
    ok((h._pendentes.get(CHAT) || [])[0].quitacao.inicio === '09/2026', 'C2: período intacto');
  }

  if (falhas.length) { console.log('RESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('RESULTADO: OK — período da quitação pela resposta (SOL-103)');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
