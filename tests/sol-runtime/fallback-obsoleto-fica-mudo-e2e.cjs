#!/usr/bin/env node
// SOL-145 (CG, 29/09/2026): "Lode" iniciou o fallback com um card aberto.
// Durante os 34s do classificador, o "pode" lançou e encerrou o card. Mesmo
// assim a guarda antiga respondeu "Não entendi" depois, em cima do "kkkk" da
// equipe. O fallback precisa validar a MESMA geração de pendências ao voltar.
const fs = require('fs');
const path = require('path');
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const enviados = [];
const logs = [];
let liberarClassificador;
const classificadorPendente = new Promise((resolve) => { liberarClassificador = resolve; });

const h = mod.criarHandlerFinanceiro({
  grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: 'cg', nome: 'Campo Grande' } },
  sendFn: async (_chat, texto) => { enviados.push(texto); return 'SOL-' + enviados.length; },
  classificarCorrecaoFn: async () => classificadorPendente,
  log: (o) => logs.push(o),
});

(async () => {
  const agora = Date.now();
  h._pendentes.set(CHAT, [{
    previewId: 'CARD-ADRIANA', origem: 'COMPROVANTE-ADRIANA', ts: agora,
    tipoOperacao: 'entrada', valor: 450, forma: 'dinheiro', categoria: 'parcela',
    aluno: 'Adriana Christine da Silva', competencia: '10/2026',
  }]);

  const antes = h.tokenEstadoPendencias(CHAT);
  if (!antes) throw new Error('precondicao: token do card ativo ficou vazio');

  const fallback = h.tratarNaoEntendida({
    chatId: CHAT, senderPhone: '5521900000001', messageId: 'LODE',
    quotedMessageId: 'CARD-ADRIANA', body: 'Lode', hasMedia: false,
  });

  // Simula o "pode" concorrente consumindo o card enquanto o LLM classifica.
  await Promise.resolve();
  h._pendentes.set(CHAT, []);
  liberarClassificador({ intencao: 'corrigir_aluno', aluno_nome: 'Lode' });
  const resultado = await fallback;

  if (!resultado || resultado.acao !== 'fallback_llm_obsoleto' || !resultado.tratou) {
    throw new Error('fallback obsoleto nao foi consumido em silencio: ' + JSON.stringify(resultado));
  }
  if (enviados.length) throw new Error('fallback obsoleto falou no grupo: ' + enviados.join(' | '));
  if (!logs.some((l) => l.acao === 'fallback_llm_estado_obsoleto')) {
    throw new Error('faltou evidencia de estado obsoleto no log');
  }

  const bridge = fs.readFileSync(path.join(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  if (!bridge.includes('fallback_llm_estado_obsoleto_bridge')) {
    throw new Error('bridge nao tem a segunda validacao antes do texto de guarda');
  }
  if (!bridge.includes('_tokenPendenciasDepois === _tokenPendenciasAntes')) {
    throw new Error('bridge nao compara a mesma geracao de pendencias');
  }

  console.log('RESULTADO: PASSOU — fallback atrasado fica mudo quando o card muda ou termina');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
