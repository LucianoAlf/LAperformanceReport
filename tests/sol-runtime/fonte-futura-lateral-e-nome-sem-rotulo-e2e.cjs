// Dois defeitos do mesmo card (Jhon/CG, 26/09/2026, Daniel Mynssem Mendes, R$ 397):
//
// 1. "PG parcela 09/26" travou com "não consegui confirmar a fatura na fonte
//    oficial" e todo "pode" foi recusado. A RPC canônica respondia
//    `fonte_competencia_futura_indisponivel`: o mês SEGUINTE só sincroniza 1x
//    por dia com 30 min de validade, então fica "velho" quase o dia todo. Com a
//    competência DECLARADA anterior ao mês seguinte, isso é lateral: a RPC
//    explícita por competência responde com fonte fresca.
// 2. "Os dados estão corretos sol" virou o ALUNO do card (sem rótulo, sem casar
//    com aluno nenhum), a correção zerou a trava de fonte e o "pode" gravou
//    "Parcela 09/2026 - estão corretos sol" sem fatura.
//
// Prova com o handler REAL (sendFn/lancarFn fakes; nada vai ao WhatsApp nem ao caixa).
// As competências saem da data de HOJE (BRT), para o teste não apodrecer.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521900000007';
const FATURA = 'ee6e306e-2a5c-4c59-ab2c-785bbd7bff72';

const brt = new Date(Date.now() - 3 * 3600 * 1000);
const mm = (d) => String(d.getUTCMonth() + 1).padStart(2, '0');
const ATUAL = `${mm(brt)}/${brt.getUTCFullYear()}`;
const ATUAL_CURTA = `${mm(brt)}/${String(brt.getUTCFullYear()).slice(2)}`;
const prox = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + 1, 1));
const PROXIMA = `${mm(prox)}/${prox.getUTCFullYear()}`;

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

function fixture() {
  const enviadas = []; const lancados = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ texto: '', status: 'texto_vazio' }),
    visaoFn: async () => null,
    interpretarFn: async (txt) => ({ categoria: 'parcela', aluno: 'Daniel Mynssem Mendes',
      competencia: (String(txt || '').match(/\d{2}\/\d{2,4}/) || [null])[0], forma: 'pix' }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    responsavelFn: async (_u, n) => (/daniel/i.test(String(n))
      ? { ok: true, aluno_nome: 'Daniel Mynssem Mendes', responsavel_nome: 'Liliane Mynssem de Souza' }
      : { ok: false }),
    // A fonte canônica exatamente como estava: mês seguinte "stale".
    canonicaFn: async (_u, nome) => (/daniel/i.test(String(nome))
      ? { ok: false, motivo: 'fonte_competencia_futura_indisponivel', aluno_nome: 'Daniel Mynssem Mendes', status_fonte: 'stale' }
      : { ok: false, motivo: 'aluno_nao_encontrado' }),
    // A RPC explícita por competência, como respondeu no banco real.
    casarFn: async (_u, nome, _v, comp) => {
      if (!/daniel/i.test(String(nome))) return { ok: false, motivo: 'aluno_nao_encontrado' };
      if (comp && !String(comp).startsWith(ATUAL.slice(0, 2))) return { ok: true, aluno_id: 1661, aluno_nome: 'Daniel Mynssem Mendes', parcela: null, motivo: 'sem_parcela_aberta' };
      return { ok: true, ambiguo: false, aluno_id: 1661, aluno_nome: 'Daniel Mynssem Mendes', confianca_nome: 1,
        parcela: { aluno_id: 1661, fatura_id: FATURA, descricao: `Parcela ${ATUAL} do curso de Bateria`,
          competencia: ATUAL, valor: 397, valor_bate: true, status: 'aberta', vencimento: '20/' + ATUAL.slice(0, 2) } };
    },
    pagadorFn: async () => ({ ok: false }),
    faturasMesFn: async () => null,
    classificarCorrecaoFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-' + lancados.length, valor: Number(p.valor), forma: p.forma }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, lancados, logs };
}
const comprovante = (comp, id) => ({
  chatId: CHAT, senderPhone: JHON, messageId: id, hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
  body: `PG parcela ${comp}\nAluno: Daniel Mynssem Mendes\nLA CG - R$397,00`,
});

(async () => {
  // A. competência atual declarada: sai com a fatura, "pode" lança vinculado
  const A = fixture();
  await A.h.handle(comprovante(ATUAL_CURTA, 'A1'));
  const cardA = A.enviadas.join('\n');
  ok(!/Não consegui confirmar a fatura na fonte oficial/i.test(cardA), `A1: card ainda travou na fonte:\n${cardA.slice(0, 500)}`);
  ok(A.logs.some((l) => l.acao === 'canonica_futura_lateral'), 'A2: não reconheceu a indisponibilidade como lateral');
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'A2', body: 'Pode', hasMedia: false });
  ok(rA && rA.acao === 'lancado', `A3: pode não lançou -> ${rA && rA.acao}`);
  ok(A.lancados[0] && A.lancados[0].fatura_id === FATURA, `A4: lançou sem a fatura -> ${A.lancados[0] && A.lancados[0].fatura_id}`);
  ok(A.lancados[0] && /Daniel Mynssem Mendes/.test(String(A.lancados[0].descricao || '')), `A5: descrição -> ${A.lancados[0] && A.lancados[0].descricao}`);

  // B. competência SEGUINTE declarada: continua travado (a guarda de 17/09 existe por isso)
  const B = fixture();
  await B.h.handle(comprovante(PROXIMA, 'B1'));
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'B2', body: 'Pode', hasMedia: false });
  ok(rB && rB.acao !== 'lancado' && B.lancados.length === 0, `B1: mês seguinte destravou -> ${rB && rB.acao}`);

  // C. "Os dados estão corretos sol" com o card travado: não vira nome e NÃO destrava
  const C = fixture();
  await C.h.handle(comprovante(PROXIMA, 'C1'));
  const rC = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C2', body: 'Os dados estão corretos sol', hasMedia: false,
    quotedMessageId: 'MSG1' }); // no grupo o Jhon respondeu CITANDO o card
  ok(!(rC && rC.acao === 'preview_aluno_corrigido'), `C1: frase virou aluno -> ${JSON.stringify(rC)}`);
  ok(C.logs.some((l) => l.acao === 'nome_tardio_sem_rotulo_nao_confirmado'), 'C2: não registrou a recusa do "nome"');
  const rC3 = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C3', body: 'Pode', hasMedia: false });
  ok(rC3 && rC3.acao !== 'lancado' && C.lancados.length === 0, `C3: a frase destravou o pode -> ${rC3 && rC3.acao}`);
  ok(!C.enviadas.some((t) => /estão corretos sol/i.test(t)), 'C4: a frase apareceu no card como aluno');

  // D. rótulo explícito continua valendo (aluno sem cadastro ainda)
  const D = fixture();
  await D.h.handle({ ...comprovante(ATUAL_CURTA, 'D1'), body: `PG parcela ${ATUAL_CURTA} - LA CG - R$397,00` });
  const rD = await D.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D2', body: 'Aluno: Fulano Inexistente da Silva', hasMedia: false });
  ok(rD && rD.acao === 'preview_aluno_corrigido', `D1: rótulo explícito deixou de valer -> ${JSON.stringify(rD)}`);

  if (falhas.length) { console.log('RESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('RESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
