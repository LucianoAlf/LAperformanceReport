// SOL-110 — LEGENDA QUE CHEGA DEPOIS DA FOTO (CG 29/09/2026 14:36).
// A foto chegou SEM legenda; 12 s depois o MESMO autor mandou "PG parcela 09/26
// Aluno: … LA CG R$457,95" como mensagem separada, enquanto a foto ainda era
// interpretada (~34 s). O card saiu sem a legenda ("não achei pelo pagador").
// Reproduz a entrega real (dois handle() concorrentes, interpretação lenta) e os
// vizinhos: legenda depois do card incompleto, depois de mídia recusada, outro
// autor, fora da janela de 60 s, e texto velho de conversa (SOL-110b).
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_CANARIO = '';
process.env.SOL_CAIXA_TOOLS_CANARIO = '';
const mod = require('./_alvo.cjs');

const CHAT = '5521900000000-1544200000@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEGENDA = 'PG parcela 09/26 Aluno: Fulana Beltrana de Souza LA CG R$457,95';
const OCR = 'Comprovante de transferência\nPix enviado\nValor R$ 457,95\nPagador SICRANO PAI DA SILVA\nID da transação E1234567890';
const FATURA = { canonical_fatura_id: '0a000000-0000-4000-8000-000000000110', aluno_id: 101, tipo_fatura: 'parcela',
  descricao: 'Parcela 09/2026 do curso de Canto', competencia: '2026-09-01', numero_parcela: 9,
  total_parcelas_contrato: 12, status: 'aberta', data_vencimento: '2026-09-10', vencida: false,
  dias_atraso: 0, valor_da_parcela: 457.95, valor_hoje: 457.95 };

function novo(o = {}) {
  const enviadas = []; const logs = []; const interpretacoes = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    ocrFn: o.ocrFn || (async () => { await sleep(50); return { text: OCR, status: 'ok', file_bytes: 91001 }; }),
    visaoFn: async () => null,
    // interpretação lenta, como em produção (~34 s); não inventa aluno sem texto humano
    interpretarFn: async (t) => {
      interpretacoes.push(t);
      await sleep(o.interpretarMs == null ? 600 : o.interpretarMs);
      return { categoria: 'parcela', aluno: null, competencia: null, forma: 'pix' };
    },
    canonicaFn: async (_u, nome) => (/fulana/i.test(String(nome || ''))
      ? { ok: true, aluno_nome: 'Fulana Beltrana de Souza', motivo_escolha: 'valor_exato', fatura: { ...FATURA } }
      : { ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => ({ ok: false }),
    pagadorFn: async () => ({ ok: false }),
    responsavelFn: async () => null,
    identificarAlunoNovoFn: async () => ({ ok: false }),
    faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe CG' }),
    resolverEnvelopeFn: async () => ({ ok: false, motivo: 'v4_desligada' }),
    rotearV4Fn: async () => null,
    listarPreviewsAbertosFn: async () => [],
    chequesFn: null,
    lancarFn: async (p) => ({ ok: true, movimentacao_id: 'MOV-1', valor: p.valor, forma: p.forma }),
    log: (x) => logs.push(x),
  });
  return { h, enviadas, logs, interpretacoes };
}
const AUTOR = '5521911112222';
const ev = (id, extra, quem = AUTOR) => ({ chatId: CHAT, senderId: quem + '@s.whatsapp.net', senderPhone: quem,
  messageId: id, hasMedia: false, ...extra });
const foto = (id, quem) => ev(id, { body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/' + id + '.jpg'] }, quem);
const cards = (env) => env.filter((t) => /Comprovante recebido/.test(t));

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };

  // 1) O incidente: a legenda chega DURANTE a interpretação da foto.
  {
    const { h, enviadas, logs } = novo();
    const t0 = Date.now();
    const rs = await Promise.all([
      h.handle(foto('F1'), t0),
      (async () => { await sleep(1200); return h.handle(ev('T1', { body: LEGENDA }), t0 + 12000); })(),
    ]);
    const cs = cards(enviadas);
    checar(cs.length === 1, `em voo: esperava 1 card, vieram ${cs.length} — ${JSON.stringify(enviadas).slice(0, 500)}`);
    checar(cs[0] && /Fulana Beltrana de Souza/.test(cs[0]), 'em voo: o card precisa trazer a aluna da legenda');
    checar(cs[0] && /457,95/.test(cs[0]), 'em voo: valor da legenda');
    checar(rs[1] && rs[1].acao === 'legenda_tardia_anexada_a_midia', `em voo: o texto vira legenda (${JSON.stringify(rs[1])})`);
    checar(logs.some((l) => l.acao === 'midia_adiada_legenda_tardia'), 'em voo: o card sem legenda não pode sair');
    checar((h._pendentes.get(CHAT) || []).length === 1, 'em voo: um card aberto');
  }

  // 1b) A legenda chega enquanto o OCR ainda lê: entra ANTES da interpretação (sem reavaliar).
  {
    const { h, enviadas, logs, interpretacoes } = novo({
      ocrFn: async () => { await sleep(1500); return { text: OCR, status: 'ok' }; } });
    const t0 = Date.now();
    await Promise.all([
      h.handle(foto('F1b'), t0),
      (async () => { await sleep(1100); return h.handle(ev('T1b', { body: LEGENDA }), t0 + 11000); })(),
    ]);
    checar(cards(enviadas).length === 1 && /Fulana/.test(cards(enviadas)[0]), 'ocr lento: 1 card com a aluna');
    checar(logs.some((l) => l.acao === 'legenda_tardia_lida_antes_da_interpretacao'), 'ocr lento: legenda lida antes de interpretar');
    checar(interpretacoes.length === 1, `ocr lento: uma interpretação só (${interpretacoes.length})`);
  }

  // 2) A legenda chega logo DEPOIS do card incompleto: o autor completando o próprio
  //    card segue o caminho de correção de sempre, que remonta o MESMO card (um só).
  {
    const { h, enviadas, logs } = novo({ interpretarMs: 10 });
    const t0 = Date.now();
    await h.handle(foto('F2'), t0);
    checar(cards(enviadas).length === 1 && !/Fulana/.test(cards(enviadas)[0]), 'depois: o 1º card sai sem aluno');
    await h.handle(ev('T2', { body: LEGENDA }), t0 + 20000);
    const abertos = h._pendentes.get(CHAT) || [];
    checar(abertos.length === 1, `depois: um card aberto (${abertos.length})`);
    checar(abertos[0] && /Fulana/.test(abertos[0].aluno || ''), 'depois: o card aberto tem a aluna da legenda');
    checar(!logs.some((l) => l.acao === 'midia_reavaliada_legenda_tardia'), 'depois: sem reavaliação (é correção do card)');
  }

  // 3) Mídia recusada (ilegível) + legenda do mesmo autor em 20 s: reavalia.
  {
    const { h, enviadas } = novo({ interpretarMs: 10, ocrFn: async () => ({ text: '', status: 'tesseract_error' }) });
    const t0 = Date.now();
    const r0 = await h.handle(foto('F3'), t0);
    checar(r0 && r0.acao === 'midia_recusada', 'recusada: 1º passo recusa');
    await h.handle(ev('T3', { body: LEGENDA }), t0 + 20000);
    checar(cards(enviadas).length === 1 && /Fulana/.test(cards(enviadas)[0]), `recusada: a legenda completa a mídia — ${JSON.stringify(enviadas).slice(0, 300)}`);
  }

  // 5) Controle: texto de OUTRO autor não é legenda da foto.
  {
    const { h, logs } = novo();
    const t0 = Date.now();
    const rs = await Promise.all([
      h.handle(foto('F5'), t0),
      (async () => { await sleep(1200); return h.handle(ev('T5', { body: LEGENDA }, '5521933334444'), t0 + 12000); })(),
    ]);
    checar(!(rs[1] && rs[1].acao === 'legenda_tardia_anexada_a_midia'), 'outro autor: não vira legenda');
    checar(!logs.some((l) => l.acao === 'midia_adiada_legenda_tardia'), 'outro autor: a mídia não espera');
  }

  // 6) Controle: depois de 60 s não é mais legenda.
  {
    const { h, logs } = novo({ interpretarMs: 10 });
    const t0 = Date.now();
    await h.handle(foto('F6'), t0);
    await h.handle(ev('T6', { body: LEGENDA }), t0 + 75000);
    checar(!logs.some((l) => l.acao === 'midia_reavaliada_legenda_tardia'), '75 s: não reavalia');
  }

  // 7) SOL-110b: texto de conversa 90 s ANTES não vira legenda da foto sem legenda.
  {
    const { h, enviadas } = novo({ interpretarMs: 10 });
    const t0 = Date.now();
    await h.handle(ev('T7', { body: 'Sol, a Fulana Beltrana de Souza já pagou ontem, desconsidera' }), t0);
    await h.handle(foto('F7'), t0 + 90000);
    checar(!cards(enviadas).some((t) => /Fulana/.test(t)), 'texto velho: não vira aluno do card');
  }

  if (falhas.length) { falhas.forEach((f) => console.log('✗ ' + f)); process.exit(1); }
  console.log('✓ legenda tardia (SOL-110): 7 cenários');
})().catch((e) => { console.error('✗ Error:', e && e.stack); process.exit(1); });
