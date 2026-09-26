#!/usr/bin/env node
'use strict';

// FINANCEIRO da Barra, 26/09/2026 17:30–17:37 — o passaporte do Bento (R$ 550,
// UMA fatura no Emusys) entrou TRÊS vezes no caixa, e a Sol repetiu "Ainda falta
// uma divisão verificável por aluno" nove vezes. Quatro defeitos, reproduzidos
// aqui com o handler REAL (sendFn/lancarFn fakes, nada vai ao WhatsApp nem ao
// caixa):
//
// 1. DOIS PDFs mandados juntos (R$ 499 e R$ 550) viraram UM evento: o lote de
//    mídia juntou os dois, o OCR leu só o primeiro, e o par foi tratado como
//    "pagamento de vários alunos" -> revisão manual.
// 2. Com essa revisão aberta, QUALQUER mensagem de QUALQUER pessoa ("Sim",
//    "Botar agora", "Falta mais algum?") era lida como tentativa de divisão, a
//    Sol respondia "Ainda falta uma divisão…" e renovava o prazo da revisão.
// 3. O "pode" não tinha trava para a revisão manual: o "Pode" do Luciano (dado
//    ao fechamento) lançou a revisão como "Passaporte R$ 550" SEM aluno.
// 4. O aviso "Já tem uma entrada de R$ 550 hoje… É outro pagamento?" era só
//    texto: um "pode" seco lançou o Bento de novo.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_LOTE_MS = '150';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const mod = require('./_alvo.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const KAILANE = '5521900000011';
const LUCIANO = '5521900000012';

const VALORES = (t) => (String(t || '').match(/R\$\s*[\d.]+(?:,\d{2})?/g) || [])
  .map((v) => Number(v.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.')));

function criar({ duplicata = null } = {}) {
  const enviadas = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    ocrFn: async (p) => ({ text: String(p).includes('550') ? 'Comprovante Valor do pagamento R$ 550,00 Data do pagamento 26/09/2026' : 'Comprovante Valor do pagamento R$ 499,00 Data do pagamento 25/09/2026', status: 'ok', file_bytes: 1000 }),
    visaoFn: async () => null,
    // O modelo lê o TEXTO que recebe: com as duas legendas coladas, ele lista duas pessoas.
    interpretarFn: async (texto) => {
      const v = VALORES(texto);
      const pag = [];
      if (/bento/i.test(texto)) pag.push({ aluno: 'Bento Margarit Braga', valor: 550 });
      if (/henrique/i.test(texto)) pag.push({ aluno: 'Henrique Serpa', valor: 499 });
      return { categoria: 'passaporte', aluno: pag.length === 1 ? pag[0].aluno : null, competencia: null,
        forma: 'cartao', pagamentos: pag.length >= 2 ? pag : [] , _v: v };
    },
    interpretarMultiFn: async () => null,
    identidadeFn: async () => ({ identificado: true, nome: 'Kailane' }),
    duplicataFn: async (_u, valor, aluno) => (duplicata && aluno && Math.abs(Number(valor) - duplicata.valor) < 0.01
      && String(aluno).toLowerCase().startsWith(duplicata.primeiroNome)
      ? { ok: true, ja_lancado: true, itens: [{ valor: duplicata.valor, hora: '08:56', descricao: 'Passaporte - Bento Margarit Braga', forma: 'cartao' }] }
      : { ok: true, ja_lancado: false, itens: [] }),
    responsavelFn: async () => ({ ok: false }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    pagadorFn: async () => ({ ok: false }),
    identificarAlunoNovoFn: async () => null,
    faturasMesFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-' + lancados.length, valor: Number(p.valor), forma: p.forma }; },
    log: () => {},
  });
  return { h, enviadas, lancados };
}

const falhas = [];
const ok = (c, m) => { if (!c) falhas.push(m); };
const ev = (o) => ({ chatId: CHAT, senderPhone: KAILANE, senderId: KAILANE + '@lid', hasMedia: false, ...o });

(async () => {
  // ---- 1+3: dois PDFs juntos, depois "pode" seco -------------------------------
  {
    const { h, enviadas, lancados } = criar();
    const [r1, r2] = await Promise.all([
      h.handle(ev({ messageId: 'PDF499', body: 'Passaporte Henrique Serpa R$ 499,00', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/499.pdf'] })),
      h.handle(ev({ messageId: 'PDF550', body: 'PASSAPORTE R$550,00 2x Bento', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/550.pdf'] })),
    ]);
    const acoes = [r1 && r1.acao, r2 && r2.acao];
    console.log('1. dois PDFs:', acoes.join(' | '));
    ok(!acoes.includes('manual_review_multi_student'), '1: dois PDFs viraram revisão "vários alunos": ' + acoes);
    ok(acoes.filter((a) => /^preview/.test(String(a))).length === 2, '1: esperava DOIS cards, um por PDF: ' + acoes);
    ok(!enviadas.some((t) => /mais de um aluno/i.test(t)), '1: Sol disse "mais de um aluno" para dois comprovantes');
    ok(lancados.length === 0, '1: nada deveria ter sido lançado ainda');
  }

  // ---- 2+3: revisão manual aberta não sequestra a conversa, e o "pode" não a lança ----
  {
    const { h, enviadas, lancados } = criar();
    const r = await h.handle(ev({ messageId: 'MULTI1', body: 'mensalidade dos alunos João Silva e Pedro Silva R$ 700,00', hasMedia: true, mediaType: 'image', mediaUrls: ['/tmp/700.jpg'] }));
    console.log('2. comprovante de dois alunos:', r && r.acao);
    ok(r && r.acao === 'manual_review_multi_student', '2: pré-condição — esperava revisão manual, veio ' + (r && r.acao));
    const antes = enviadas.length;
    for (const [quem, txt] of [[KAILANE, 'Sim'], [KAILANE, 'Botar agora'], [LUCIANO, 'Falta mais algum?'], [LUCIANO, 'Sol, fecha o caixa de hoje']]) {
      await h.handle(ev({ messageId: 'T' + txt, senderPhone: quem, senderId: quem + '@lid', body: txt }));
    }
    const repetidas = enviadas.slice(antes).filter((t) => /Ainda falta uma divis/i.test(t)).length;
    console.log('2. "Ainda falta…" repetido:', repetidas);
    ok(repetidas === 0, `2: conversa comum virou cobrança de divisão ${repetidas}x`);

    const rp = await h.handle(ev({ messageId: 'PODE-LUCIANO', senderPhone: LUCIANO, senderId: LUCIANO + '@lid', body: 'Pode' }));
    console.log('3. "Pode" com só a revisão aberta:', rp && rp.acao);
    ok(lancados.length === 0, '3: "pode" lançou a revisão manual como recebimento: ' + JSON.stringify(lancados[0] || {}));

    // o complemento legítimo continua funcionando: quem mandou, com a divisão
    const rc = await h.handle(ev({ messageId: 'DIV1', body: 'João Silva — R$ 350\nPedro Silva — R$ 350' }));
    console.log('2b. divisão de quem mandou:', rc && rc.acao);
    ok(rc && rc.acao !== 'nada', '2b: a divisão legítima deixou de ser reconhecida');
  }

  // ---- 4: duplicidade do mesmo aluno exige confirmação explícita --------------
  {
    const { h, enviadas, lancados } = criar({ duplicata: { valor: 550, primeiroNome: 'bento' } });
    const r = await h.handle(ev({ messageId: 'PDF550B', body: 'Passaporte Bento Margarit Braga R$ 550,00 cartão', hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/550.pdf'] }));
    const card = r && r.previewId;
    console.log('4. card com duplicidade:', r && r.acao);
    ok(/É outro pagamento/i.test(enviadas.join('\n')), '4: pré-condição — card deveria avisar a duplicidade');
    await h.handle(ev({ messageId: 'PODE-DUP', body: 'Pode', quotedMessageId: card }));
    ok(lancados.length === 0, '4: "pode" seco lançou pagamento que já está no caixa');
    ok(enviadas.some((t) => /outro pagamento/i.test(t) && /não lancei|Não lancei/i.test(t)), '4: recusa deveria explicar como confirmar');
    await h.handle(ev({ messageId: 'PODE-OUTRO', body: 'pode, é outro pagamento', quotedMessageId: card }));
    ok(lancados.length === 1, '4b: confirmação explícita não lançou');
  }

  if (falhas.length) { console.log('\nRESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
