// Reproduz a cascata de 25/08 no grupo de CG e prova que ela não se repete.
//
// 🔴 A causa foi um texto meu: a guarda de pendência oferecia "*não* para descartar" e o
// runtime nunca tratou "não". A pendência ficava órfã, e a próxima legenda era lida como
// correção dela — o card da Aurora saiu com o valor do comprovante do Rafael (R$ 300,00).
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

function novo() {
  const enviadas = []; const ids = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ texto: 'MARCOS LAZARO SANTO R$ 300,00', status: 'ok' }),
    visaoFn: async () => ({ valor: 300, forma: 'pix', pagador_nome: 'Marcos Lazaro Santo' }),
    interpretarFn: async () => ({ categoria: 'passaporte', aluno: null, competencia: null, forma: 'pix' }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhonatan Vicente' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    log: (o) => logs.push(o),
  });
  return { h, enviadas, ids, logs };
}

(async () => {
  const falhas = [];

  // ── unitário dos dois helpers, que é onde a regra mora ──
  const casos = [
    ['casarNao', 'Não', true], ['casarNao', 'nao pode', true], ['casarNao', 'cancela', true],
    ['casarNao', 'nao e a parcela, e passaporte', false],   // isso é CORREÇÃO, não descarte
    ['casarNao', 'Sol, o aluno é o Rafael', false],
    ['ehConversaSemComando', 'Certinho', true], ['ehConversaSemComando', 'valeu 🙏', true],
    ['ehConversaSemComando', 'Sol o valor está incorreto. O valor correto é de R$457,06', false],
    ['ehConversaSemComando', 'pode', false],
  ];
  for (const [fn, txt, esperado] of casos) {
    const got = !!mod[fn](txt);
    if (got !== esperado) falhas.push(`${fn}("${txt}") = ${got}, esperava ${esperado}`);
  }
  console.log(`unitário: ${casos.length - falhas.length}/${casos.length}`);

  // ── a cascata real ──
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: '5521995697704', messageId: 'C1',
    body: 'PG Passaporte (Pix) R$300,00', hasMedia: true, mediaType: 'image', mediaPath: '/tmp/x.jpg' });
  const idCard = A.ids[A.ids.length - 1];

  // o "Não" que ninguém tratava
  const rNao = await A.h.handle({ chatId: CHAT, senderPhone: '5521995697704', messageId: 'C2',
    body: 'Não', hasMedia: false, quotedMessageId: idCard });
  console.log('descarte:', rNao && rNao.acao, '|', String(A.enviadas[A.enviadas.length - 1] || '').slice(0, 70));
  if (!rNao || rNao.acao !== 'preview_descartado') {
    falhas.push('"Não" não descartou — a pendência ficaria órfã, como em 25/08');
  }
  if (A.h.temPendencia && A.h.temPendencia(CHAT)) {
    falhas.push('pendência continuou viva depois do descarte');
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — "não" descarta e conversa não vira comando');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
