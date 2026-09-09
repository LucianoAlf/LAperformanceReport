#!/usr/bin/env node
/**
 * Por que o caminho de "aluno com vários cursos" NÃO rodou no caso da Vitória?
 *
 * 🔴 O FATO. Em 09/09/2026 a Fernanda mandou o comprovante de R$ 1.378,00 da
 *    Vitória da Silva Nobre. A RPC `sol_caixa_resolver_composto_aluno_v1`,
 *    chamada à mão com exatamente esses dados, devolve `ok:true` com as DUAS
 *    parcelas de R$ 689 e soma 1.378 — a resposta certa estava disponível.
 *    Mas o log daquele turno não tem `composto_mes_result`: o portão
 *
 *        if (aluno && valor && competenciaComposto && querParcela && !multiplas)
 *
 *    não deixou a chamada acontecer. No caso do Davi (mesmo dia, CG) deixou.
 *
 * Este arquivo roda as funções REAIS do runtime que está no ar sobre a legenda
 * real e imprime cada termo do portão, para o "não sei por quê" virar
 * "foi este termo".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const fonte = fs.readFileSync(ALVO, 'utf8');
const mod = { exports: {} };
const ctx = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(ctx);
vm.runInContext(fonte, ctx, { filename: ALVO });

const pega = (nome) => {
  try { return vm.runInContext(`typeof ${nome} === "function" ? ${nome} : null`, ctx); }
  catch { return null; }
};

const extrairCompetenciaTexto = pega('extrairCompetenciaTexto');
const pagamentoMultiplo = pega('pagamentoMultiplo');
const alunoFromCaption = pega('_alunoFromCaption');
const alunoRotulado = pega('_alunoRotulado');
const nomePlausivel = pega('nomePlausivel');
const bodyLimpo = pega('bodyLimpo');

const CASOS = [
  {
    quem: 'Fernanda · Recreio · 09:53 — NÃO rodou o composto',
    legenda: 'Parcela do mês de Setembro da aluna Vitória da Silva Nobre - R$1.378,00',
    // o OCR do comprovante PIX que acompanhou a legenda
    ocr: 'ID da transacao 91246s15918e719a Destino Nome ESCOLA DE MUSICA L.A KIDS LTDA '
       + 'CNPJ 32134891000165 Chave Pix 32134891000165 Origem Nome Marcos Vinicius '
       + 'Conceicao da Silva Instituicao NU PAGAMENTOS IP CPF ...204.617-..',
    valor: 1378,
  },
  {
    quem: 'Mayra · CG · 11:25 — RODOU o composto (partes=4)',
    legenda: 'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro '
           + '(4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro (R$432,00) - LA CG R$1722,00',
    ocr: 'Comprovante de transferencia 04 SET 2026 14:43:44 Valor R$ 1.722,00 '
       + 'Tipo de transferencia Pix Destino Nome ESCOLA DE MUSICA L A CNPJ 19672908000170',
    valor: 1722,
  },
];

console.log('PORTÃO DO PAGAMENTO COMPOSTO — termo a termo, com o código que está no ar\n');

for (const c of CASOS) {
  const competenciaHumana = extrairCompetenciaTexto(c.legenda);
  const rotulo = alunoRotulado ? alunoRotulado(c.legenda) : null;
  const daLegenda = alunoFromCaption ? alunoFromCaption(c.legenda) : null;
  const aluno = rotulo || daLegenda;
  const alunoOk = nomePlausivel ? nomePlausivel(aluno) : !!aluno;
  const textoMultiplas = (bodyLimpo ? bodyLimpo(c.legenda) : c.legenda) + ' ' + c.ocr;
  const multiplas = pagamentoMultiplo ? pagamentoMultiplo(textoMultiplas) : null;

  const passa = !!(alunoOk && c.valor && competenciaHumana && !multiplas);

  console.log(`### ${c.quem}`);
  console.log(`    legenda: ${c.legenda.slice(0, 96)}`);
  console.log(`    aluno              = ${JSON.stringify(aluno)}  (plausivel=${alunoOk})`);
  console.log(`    competenciaHumana  = ${JSON.stringify(competenciaHumana)}`);
  console.log(`    valor              = ${c.valor}`);
  console.log(`    multiplas          = ${multiplas}   ${multiplas ? '🔴 <-- ESTE FECHA O PORTAO' : ''}`);
  console.log(`    => portao ${passa ? 'ABRE (chama a RPC do composto)' : '🔴 FECHA (nem tenta)'}\n`);
}
