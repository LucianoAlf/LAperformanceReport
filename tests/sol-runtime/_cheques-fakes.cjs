'use strict';

// Fakes do malote de cheques (29/09/2026) — dados INVENTADOS, nenhum cheque,
// nome ou documento real. Simula o "banco" que o módulo consulta:
//   • emusys_faturas (espelho), vw_caixa_movimentacao_fatura_links;
//   • caixa_movimentacoes com cheque_numero/cheque_banco — alimentado pelos
//     próprios lançamentos do handler (lote e simples), para o 2º "pode" ver o 1º;
//   • estornos ("ESTORNO de <id> …").
// Usado por cheques-malote-v3-e2e.cjs e pela bateria (tipo cheque/malote).

const fs = require('fs');
const os = require('os');
const path = require('path');
const RUNTIME = path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime');
const chq = require(path.join(RUNTIME, 'caixa-cheques.cjs'));

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// CMC-7 válido (3 DVs) a partir dos campos.
function cmc7(banco, ag, comp, num, tip, conta) {
  const c1 = banco + ag; const c2 = comp + num + tip;
  return c1 + chq.dvMod10(c2) + c2 + chq.dvMod10(c1) + conta + chq.dvMod10(conta);
}

const UNIDADES = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = { 20: 'vinte', 30: 'trinta', 40: 'quarenta', 50: 'cinquenta', 60: 'sessenta', 70: 'setenta', 80: 'oitenta', 90: 'noventa' };
const CENTENAS = { 100: 'cento', 200: 'duzentos', 300: 'trezentos', 400: 'quatrocentos', 500: 'quinhentos', 600: 'seiscentos',
  700: 'setecentos', 800: 'oitocentos', 900: 'novecentos' };
function ate999(n) {
  if (n === 100) return 'cem';
  const p = [];
  if (n >= 100) { p.push(CENTENAS[Math.floor(n / 100) * 100]); n %= 100; }
  if (n >= 20) { p.push(DEZENAS[Math.floor(n / 10) * 10]); n %= 10; if (n) p.push(UNIDADES[n]); } else if (n) p.push(UNIDADES[n]);
  return p.join(' e ');
}
function extenso(v) {
  const r = Math.floor(v); const c = Math.round((v - r) * 100);
  let s = r >= 1000 ? `${Math.floor(r / 1000) === 1 ? '' : ate999(Math.floor(r / 1000)) + ' '}mil${r % 1000 ? ' e ' + ate999(r % 1000) : ''}` : ate999(r);
  s = s.trim() + ' reais';
  if (c) s += ' e ' + ate999(c) + ' centavos';
  return s;
}

// Cheque "lido pela visão": número k → banco/agência/conta sintéticos, CMC-7 válido.
function chequeLido(k, { valor = 367, emitente = `EMITENTE ${k}`, banco = '237', bom_para = null, ...extra } = {}) {
  const num = String(100000 + k).slice(-6);
  const conta = String(5000000000 + k).slice(-10);
  const c = cmc7(banco, '1234', '018', num, '5', conta);
  return { banco, agencia: '1234', numero: num, cmc7: c, valor, valor_extenso: extenso(valor), emitente_nome: emitente,
    emitente_documento: null, bom_para, ...extra };
}

function faturaPadrao(id, extra = {}) {
  return { id, status: 'paga', forma: 'Cheque', valor_pago: '367.00', valor_original: '367.00', desconto_fixo: '0',
    desconto_condicional: '0', descricao: 'Parcela 09/2026 do curso de Violão', competencia: '2026-09-01',
    data_pagamento: '2026-09-20', data_vencimento: '2026-09-10', ...extra };
}

// Banco falso. `resolver`: emitente -> { fatura: n, aluno } | 'desconhecido'.
function criarBancoFalso({ faturas = {}, links = [], resolver = {}, movimentos = [], falhaCaixa = false } = {}) {
  const db = { faturas, links: new Set(links), movimentos: movimentos.slice(), estornos: [], consultas: [], resolvidos: [] };
  const cand = (n, extra = {}) => ({ emusys_fatura_id: n, la_report_fatura_id: U(n), score: 0.9, status: 'paga',
    valor_original: 367, valor_pago: 367, data_pagamento: '2026-09-20', data_vencimento: '2026-09-10',
    aluno_nome: 'Aluno Teste ' + n, responsavel_nome: 'Resp Teste ' + n, ...extra });
  db.rpcFn = async (nome, args) => {
    if (nome === 'sol_cheque_documento_hash_v1') return 'a'.repeat(64);
    const e = String(args.p_emitente_nome || '');
    db.resolvidos.push(e);
    const r = resolver[e];
    if (r && r !== 'desconhecido') {
      return { ok: true, emitente: { resolvido: true }, candidatas: [cand(r.fatura, { aluno_nome: r.aluno || 'Aluno Teste ' + r.fatura })] };
    }
    const m = e.match(/^EMITENTE (\d+)$/);
    if (m && r !== 'desconhecido') return { ok: true, emitente: { resolvido: true }, candidatas: [cand(Number(m[1]))] };
    return { ok: true, emitente: { resolvido: false }, candidatas: [] };
  };
  db.consultaFn = async (caminho) => {
    db.consultas.push(caminho);
    const ids = ((caminho.match(/in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
    if (caminho.startsWith('emusys_faturas')) return ids.map((id) => db.faturas[id] || faturaPadrao(id));
    if (caminho.startsWith('vw_caixa_movimentacao_fatura_links')) {
      const lig = new Set([...db.links, ...db.movimentos.map((m) => m.fatura_id).filter(Boolean)]);
      return ids.filter((id) => lig.has(id)).map((id) => ({ fatura_id: id }));
    }
    if (caminho.startsWith('caixa_movimentacoes')) {
      if (falhaCaixa) return null;
      if (/categoria=eq\.estorno/.test(caminho)) return db.estornos.map((id) => ({ descricao: `ESTORNO de ${id} - x - Motivo: teste` }));
      return db.movimentos.filter((m) => m.cheque_numero && ids.includes(m.cheque_numero));
    }
    return null;
  };
  db.gravar = (p, itens) => {
    for (const it of itens) {
      db.movimentos.push({ id: U(900000 + db.movimentos.length), tipo: 'entrada', cheque_numero: it.cheque_numero || null,
        cheque_banco: it.cheque_banco || null, data_movimento: '2026-09-29', valor: it.valor, fatura_id: it.canonical_fatura_id || it.fatura_id || null });
    }
  };
  return db;
}

function arquivoTemp(conteudo, nome = '4_CH_-_20SETEMBRO2026_-_C.GRANDE_.pdf') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-chq-teste-'));
  const p = path.join(dir, 'doc_0123456789ab_' + nome);
  fs.writeFileSync(p, conteudo);
  return p;
}

module.exports = { U, cmc7, extenso, chequeLido, faturaPadrao, criarBancoFalso, arquivoTemp, chq, RUNTIME };
