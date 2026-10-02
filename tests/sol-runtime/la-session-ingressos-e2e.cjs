#!/usr/bin/env node
'use strict';

// Recreio, 02/10/2026: "2 ingressos LA Session Felipe Alves" (R$ 40 cada)
// virou lojinha e o artista virou aluno. Ingresso e receita de evento: categoria
// venda, sem aluno, com quantidade/preco no card e total conferido antes do pode.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const falhas = [];
const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

function novo(overrides = {}) {
  const enviadas = []; const lancamentos = []; const logs = [];
  let seq = 0; let interpretacoes = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'COMPROVANTE PIX\nVALOR PAGO R$ 80,00\n02/10/2026', status: 'ok', file_bytes: 88000 }),
    visaoFn: async () => null,
    interpretarFn: async () => { interpretacoes++; return { categoria: 'lojinha', aluno: 'Felipe Alves', forma: 'pix' }; },
    identidadeFn: async () => ({ identificado: true, nome: 'Operadora Teste' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    lancarFn: async (p) => { lancamentos.push(p); return { ok: true, movimentacao_id: 'MOV1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, lancamentos, logs, get interpretacoes() { return interpretacoes; } };
}

(async () => {
  const info = mod.detectarVendaIngressoEvento('2 ingressos LA Session Felipe Alves');
  checar(info && info.quantidade === 2, 'deveria ler 2 ingressos');
  checar(info && info.valor_esperado === 80, '2 x R$ 40 deveria fechar R$ 80');
  checar(info && info.categoria === 'venda', 'ingresso deveria ser categoria venda');

  // Foto/comprovante: reproduz o episodio real. O deterministico vence o palpite
  // errado do interpretador e nem precisa chama-lo.
  {
    const A = novo();
    const r = await A.h.handle({ chatId: CHAT, senderPhone: '5521990000001', messageId: 'F1',
      body: '2 ingressos LA Session Felipe Alves', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
    checar(r.acao === 'preview_venda_ingresso', `foto deveria abrir preview de ingresso; veio ${JSON.stringify(r)}`);
    checar(A.interpretacoes === 0, 'evento deterministico nao deveria chamar o LLM que confundiu artista com aluno');
    const card = String(A.enviadas.at(-1) || '');
    checar(/R\$\s*80,00/.test(card), 'card deveria mostrar R$ 80,00');
    checar(/2 ingresso\(s\)/i.test(card), 'card deveria mostrar 2 ingressos');
    checar(/LA Session.*Felipe Alves/i.test(card), 'card deveria nomear o evento/artista');
    checar(/sem aluno espec[ií]fico/i.test(card), 'card deveria declarar que evento nao tem aluno');
    checar(/Categoria: venda/i.test(card), 'card deveria usar categoria venda');
    const pend = A.h._pendentes.get(CHAT)[0];
    checar(pend && pend.aluno == null, 'Felipe Alves nao pode virar aluno');
    checar(pend && pend.descricao === 'Venda - 2 ingresso(s) - LA Session — Felipe Alves', `descricao errada: ${pend && pend.descricao}`);
    checar(A.lancamentos.length === 0, 'nao pode gravar antes do pode');
    const rp = await A.h.handle({ chatId: CHAT, senderPhone: '5521990000001', messageId: 'P1',
      body: 'pode', hasMedia: false, quotedMessageId: pend.previewId });
    checar(rp.acao === 'lancado', `pode deveria lancar; veio ${JSON.stringify(rp)}`);
    checar(A.lancamentos.length === 1, 'deveria gravar uma unica venda');
    checar(A.lancamentos[0] && Number(A.lancamentos[0].valor) === 80, 'valor gravado deveria ser 80');
    checar(A.lancamentos[0] && A.lancamentos[0].categoria === 'venda', 'categoria gravada deveria ser venda');
    checar(A.lancamentos[0] && A.lancamentos[0].aluno == null, 'venda de evento deve ser sem aluno');
  }

  // Texto puro tambem funciona: o contrato conhecido calcula 2 x 40 e ainda
  // exige card + pode.
  {
    const B = novo();
    const r = await B.h.handle({ chatId: CHAT, senderPhone: '5521990000002', messageId: 'T1',
      body: '2 ingressos LA Session Felipe Alves pix', hasMedia: false });
    checar(r.acao === 'preview_venda_ingresso', `texto deveria abrir preview; veio ${JSON.stringify(r)}`);
    checar(/R\$\s*80,00/.test(String(B.enviadas.at(-1) || '')), 'texto deveria calcular 2 x 40 = 80');
    checar(B.lancamentos.length === 0, 'texto nao pode gravar antes do pode');
  }

  // Total divergente falha fechado: nao cria card aprovavel.
  {
    const C = novo({ ocrFn: async () => ({ text: 'COMPROVANTE PIX\nVALOR PAGO R$ 70,00', status: 'ok', file_bytes: 70000 }) });
    const r = await C.h.handle({ chatId: CHAT, senderPhone: '5521990000003', messageId: 'F2',
      body: '2 ingressos LA Session Felipe Alves', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix70.jpg'] });
    checar(r.acao === 'venda_ingresso_total_diverge', `R$70 deveria falhar fechado; veio ${JSON.stringify(r)}`);
    checar((C.h._pendentes.get(CHAT) || []).length === 0, 'total divergente nao pode deixar card aberto');
    checar(C.lancamentos.length === 0, 'total divergente nao pode gravar');
  }

  // Nao regride: mensalidade com nome Felipe Alves nao e ingresso.
  checar(mod.detectarVendaIngressoEvento('parcela 10/2026 aluno Felipe Alves R$ 400 pix') === null,
    'parcela do aluno Felipe Alves nao pode virar evento');

  if (falhas.length) {
    console.error('VERMELHO LA Session ingressos:\n  - ' + falhas.join('\n  - '));
    process.exit(1);
  }
  console.log('VERDE LA Session ingressos: foto, texto, 2x40, categoria venda, sem aluno e fail-closed');
})().catch((e) => { console.error('ERRO:', e && e.stack); process.exit(1); });
