#!/usr/bin/env node
/**
 * Guarda financeira da V4 — mata os dois falsos positivos comprovados.
 *
 * 🔴 A EVIDÊNCIA (shadow 08-09/09, rotulado à mão). Das 33 oportunidades
 *    acionáveis, 5 são falso positivo e 8 ambíguos. Dois padrões explicam quase
 *    todos, e os dois moveriam dinheiro se a V4 executasse:
 *
 *    (a) COLAGEM DO RELATÓRIO DE RECEBIMENTOS — 3 de 5 falsos positivos.
 *        "*Recebimentos em aberto CG* 🚩⚠️ *EMLA* 04/09/2026 PIX RECEBIDO…"
 *        virou `lancamento_multi_aluno` 0.92 e `lancamento_por_texto` 0.65/0.60.
 *        É o incidente de 31/08 ("texto colado no grupo da Sol é entrada de
 *        comando"), que o legado já barra com `_ehDitadoDeCaixa` e a V4 não.
 *
 *    (b) "Conferido✅" COMO APROVAÇÃO — 3 vezes em dois dias, 0.85.
 *        A casa decidiu que dinheiro só se move com "pode" explícito.
 *
 * ⚠️ ISTO NÃO CONTRADIZ O AI-FIRST, e a distinção importa: o modelo continua
 *    entendendo a conversa e escolhendo a ferramenta. O que ele não pode é
 *    **criar autorização**. Autorizar é ato humano com forma declarada;
 *    conferir a forma é mecânico. Regex aqui é validação POSTERIOR à escolha,
 *    nunca descoberta de intenção — que é exatamente a fronteira que o Luciano
 *    definiu.
 *
 * ⚠️ A guarda NÃO decide o que é lançamento. Ela só responde "esta intenção
 *    financeira pode prosseguir com este texto?". Quem entende continua sendo
 *    o modelo; quem resolve fatura continua sendo a RPC.
 *
 * ⚠️ Discriminador da colagem é ESTRUTURA, não vocabulário: várias linhas com
 *    marca de extrato (data + "PIX RECEBIDO"/"R$ …=") ou cabeçalho de relatório.
 *    Vetar a palavra "recebido" mataria legenda legítima.
 */
const fs = require('fs');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const carimbo = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
fs.writeFileSync(`${ALVO}.bak-${carimbo}-antes-guarda-v4`, fs.readFileSync(ALVO, 'utf8'));

let src = fs.readFileSync(ALVO, 'utf8');
function troca(nome, alvo, novo, esperado = 1) {
  const n = src.split(alvo).length - 1;
  if (n !== esperado) {
    console.error(`🔴 ${nome}: ancora ${n}x, esperava ${esperado} — ABORTADO`);
    process.exit(1);
  }
  src = src.split(alvo).join(novo);
  console.log('  ok:', nome);
}

troca('guardaFinanceiraV4',
  '// V4 FASE 1 — ROTEADOR EM SHADOW',
  `// GUARDA FINANCEIRA DA V4 (09/09/2026) — ver o patch versionado no repo.
//
// Responde uma pergunta só: "esta intencao financeira pode prosseguir com este
// texto?". Nao descobre intencao (isso e do modelo) e nao resolve fatura (isso
// e da RPC). E o portao entre entender e AUTORIZAR.
const _INTENCOES_FINANCEIRAS = new Set([
  'lancamento_por_texto', 'lancamento_multi_aluno', 'saida_dinheiro',
  'saida_caixa', 'corrigir_lancamento_gravado', 'aprovar',
]);

// "pode" ANCORADO no comeco — mesma regra do token frouxo do legado (31/08).
// ⚠️ Tolera o markdown do WhatsApp: o REPLAY pegou "*pode, pix*" sendo barrado,
//    e isso e aprovacao legitima com asterisco de negrito na frente. O teste
//    unitario passou 19/19 sem ver isso; so o corpus real mostrou.
// ⚠️ Aceita tambem "pode <verbo>" em mensagem curta, para "e outro pagamento,
//    pode lancar". Prosa longa continua fora — foi ela que aprovou por engano
//    em 31/08.
const _PODE_EXPLICITO = /^[\\s*_~]*(?:pode|podi)\\b/i;
const _PODE_CURTO = /\\bpode\\s+(?:lan[cç]ar|dar\\s+baixa|registrar|gravar)\\b/i;

// Marca de EXTRATO colado. 🔴 O discriminador e QUANTOS PAGAMENTOS, nao quantas
// marcas: o replay mostrou que UMA linha de extrato ("*KIDS* 03/09 PIX RECEBIDO
// 07895543725 R$367,00= PIX Parcela 09/2026 de Carlos") e ditado LEGITIMO — a
// Rose cola a linha daquele pagamento para a Sol lancar. Contar marcas barrava
// esses casos, porque a mesma linha ja tem data + PIX RECEBIDO + "R$…=" = 3.
const _PAGAMENTO_NO_EXTRATO = /PIX\\s+RECEBIDO\\s+\\d{6,}|R\\$\\s*[\\d.,]+\\s*=/gi;
// ⚠️ SO o cabecalho de relatorio. Tirei \`*EMLA*\` e \`*KIDS*\` daqui depois do
//    replay: eles sao ROTULO DE UNIDADE, nao marca de extrato, e apareciam em
//    ditado legitimo ("*KIDS* 03/09 PIX RECEBIDO … R$367,00= Parcela de Carlos"),
//    que e a Rose colando UM pagamento para lancar. Barrar por eles matava o
//    caso bom — que e como toda guarda boa vira guarda ruim.
const _CABECALHO_RELATORIO = /\\*?\\s*Recebimentos?\\s+em\\s+aberto/i;

function guardaFinanceiraV4(decisao) {
  const intencao = String((decisao && decisao.intencao) || '');
  const texto = String((decisao && decisao.texto) || '');
  if (!_INTENCOES_FINANCEIRAS.has(intencao)) return { permitido: true };

  // (b) aprovacao exige o gesto declarado. Confianca NAO substitui — dinheiro
  //     nao se move por probabilidade.
  if (intencao === 'aprovar'
      && !_PODE_EXPLICITO.test(texto)
      && !(texto.length <= 40 && _PODE_CURTO.test(texto))) {
    return { permitido: false, motivo: 'aprovacao_sem_pode' };
  }

  // (a) extrato colado nao e ditado de caixa. Exige 2+ marcas OU o cabecalho:
  //     uma data solta aparece em legenda legitima ("parcela 09/2026").
  // 2+ PAGAMENTOS distintos = extrato; 1 = a pessoa colou a linha daquele
  // pagamento, que e uso normal e virou lancamento certo 2x no corpus.
  const pagamentos = (texto.match(_PAGAMENTO_NO_EXTRATO) || []).length;
  if (_CABECALHO_RELATORIO.test(texto) || pagamentos >= 3) {
    return { permitido: false, motivo: 'relatorio_colado' };
  }
  return { permitido: true };
}

// V4 FASE 1 — ROTEADOR EM SHADOW`);

troca('exporta a guarda',
  '  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, extrairItensNomeValor, casarParcela,',
  '  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, extrairItensNomeValor, casarParcela,\n  guardaFinanceiraV4,');

fs.writeFileSync(ALVO, src);
console.log('aplicado');
