#!/usr/bin/env node
// SOL-144 (CG, 29/09/2026): Alf perguntou ao Jhon "ela tem parcela atrasada?"
// citando a foto humana que originou o card. A guarda do bridge confundia
// `origem` com mensagem da Sol e interrompia a conversa com "Nao entendi".
const fs = require('fs');
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const enviados = [];
let seq = 0;

const h = mod.criarHandlerFinanceiro({
  grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' } },
  sendFn: async (_chat, texto) => { enviados.push(texto); return 'SOL-' + (++seq); },
  ocrFn: async () => ({ text: 'R$ 450,00', status: 'ok' }),
  visaoFn: async () => ({ valor: 450, forma: 'dinheiro' }),
  interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Fulana Beltrana de Souza', competencia: '10/2026', forma: 'dinheiro' }),
  canonicaFn: async () => ({ ok: false, motivo: 'nenhuma_fatura_na_competencia' }),
  casarFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
  identidadeFn: async () => ({ identificado: true, nome: 'Equipe' }),
  duplicataFn: async () => ({ ja_lancado: false }),
  log: () => {},
});

(async () => {
  const origem = 'COMPROVANTE-HUMANO';
  await h.handle({ chatId: CHAT, senderPhone: '5521900000001', senderId: 'A@lid',
    messageId: origem, body: 'PG parcela 10/26\nAluno: Fulana Beltrana de Souza\nR$450 dinheiro',
    hasMedia: true, mediaType: 'image', mediaUrls: ['/bateria/sol-144.jpg'] });

  const pend = (h._pendentes.get(CHAT) || [])[0];
  if (!pend || !pend.previewId) throw new Error('precondicao: card pendente nao foi criado');
  if (!h.citaAlgumaPendencia(CHAT, origem)) throw new Error('precondicao: origem deixou de pertencer a pendencia');
  if (h.citaCardPendenteDaSol(CHAT, origem)) throw new Error('origem humana ainda foi tratada como card da Sol');
  if (!h.citaCardPendenteDaSol(CHAT, pend.previewId)) throw new Error('preview da Sol deixou de ser reconhecido');

  const bridge = fs.readFileSync(require('path').join(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  if (!bridge.includes('_fh.citaCardPendenteDaSol(chatId, event.quotedMessageId)')) {
    throw new Error('bridge nao usa a citacao estrita de card da Sol');
  }
  if (/const _citouCard =[\s\S]{0,180}_fh\.citaAlgumaPendencia\(/.test(bridge)) {
    throw new Error('bridge ainda usa a relacao ampla com o comprovante humano');
  }

  console.log('RESULTADO: PASSOU — comprovante humano nao chama a Sol; card da Sol continua chamando');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
