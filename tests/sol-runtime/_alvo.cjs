// Onde mora o artefato do caixa, para a suíte inteira.
//
// 🔴 POR QUE ISTO EXISTE (09/09/2026). 35 dos 38 testes faziam
//    `require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs')`
//    — o caminho do RUNTIME na VPS. Consequências, as duas ruins:
//
//      1. em checkout limpo eles nem carregam (`Cannot find module`), então
//         "a suíte passou" queria dizer "a suíte passou na máquina de quem tem
//         a VPS montada";
//      2. quando rodavam, testavam o arquivo VIVO — inclusive patch aplicado à
//         mão e nunca versionado. Teste que lê o runtime não pode reprovar o
//         runtime.
//
//    O Alfredo pegou a ponta disso no commit 02b849eb (a guarda existia só no
//    script de patch). A raiz era esta.
//
// Ordem de resolução: `SOL_CAIXA_CJS` (para apontar ao runtime de propósito,
// em auditoria) e, sem ela, o artefato CANÔNICO do repositório.
const path = require('path');
const ALVO = process.env.SOL_CAIXA_CJS
  || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-financeiro.cjs');
module.exports = require(ALVO);
module.exports.__alvo = ALVO;

// Os outros dois artefatos do runtime que a suíte alcança. Foram trazidos para
// o repositório em 09/09/2026 pelo mesmo motivo: três testes só carregavam na
// VPS, então o vermelho deles era invisível em qualquer outra máquina.
const _res = (env, ...rel) => process.env[env] || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', ...rel);
module.exports.aberturaFechamento = () => require(_res('SOL_CAIXA_ABERTURA_CJS', 'caixa-abertura-fechamento.cjs'));
module.exports.groupEngagement    = () => require(_res('SOL_GROUP_ENGAGEMENT_CJS', 'group-engagement.cjs'));

// PULAR É HONESTO; REPROVAR POR FALTA DE CREDENCIAL, NÃO.
//
// Três testes da suíte chamam as RPCs de VERDADE (casador, canônica,
// responsável) em vez de mocká-las — são testes de integração legítimos. Sem
// credencial eles falhavam com "esperava 697, veio undefined", o que parece
// defeito do código e não é. Um vermelho que mente é pior que um teste que não
// roda: ensina a ignorar a suíte.
//
// `carregarEnv()` lê arquivos de ambiente que só existem na VPS — por isso a
// checagem é essa, e não `process.env`.
module.exports.exigeCredenciais = (nome) => {
  let key = null;
  try { key = module.exports.carregarEnv && module.exports.carregarEnv().key; } catch { key = null; }
  if (key) return true;
  console.log(`⏭  ${nome}: PULADO — precisa das credenciais do Supabase (roda na la-hq).`);
  process.exit(0);
};
