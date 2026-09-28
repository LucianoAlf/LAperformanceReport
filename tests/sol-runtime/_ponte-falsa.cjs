'use strict';

// Ponte falsa para os testes do MCP: hospeda o EXECUTOR REAL
// (runtime/caixa-tool-executor.cjs) atrás de POST /caixa/tool, com runtime e
// abertura/fechamento falsos. Assim os testes percorrem a cadeia de verdade:
// MCP → HTTP → executor → handler.
const path = require('path');

const executorPath = path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-tool-executor.cjs');

function criarPonteFalsa({ runtime, abf, grupos, onSend, obterGovernanca = null }) {
  const exMod = require(executorPath);
  let handler = null;
  let seq = 0;
  const enviar = async (chatId, texto) => { if (onSend) onSend(chatId, texto); return `MSG-${++seq}`; };
  const executor = exMod.criarExecutorCaixaTool({
    obterHandler: async () => {
      if (!handler) {
        handler = require(runtime).criarHandlerFinanceiro({
          grupos,
          sendFn: async (c, t) => { exMod.registrarEnvio(t); return enviar(c, t); },
          log: (e) => exMod.registrarEvento(e),
        });
      }
      return handler;
    },
    obterAbf: async () => require(abf),
    obterGovernanca,
    grupos,
    enviar,
    fecharEpisodio: async () => ({ ok: true }),
  });
  return async function tratar(req, res, body) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(await executor.executar(JSON.parse(body || '{}'))));
  };
}

module.exports = { criarPonteFalsa };
