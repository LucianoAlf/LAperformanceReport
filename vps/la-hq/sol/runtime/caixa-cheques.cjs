'use strict';

// LOTE DE CHEQUES PARA DEPÓSITO (26/09/2026, pedido do Alf; contrato do Super Folha
// em Docs/handoffs/2026-09-26-sol-cheques-lote-deposito.md, repo folha-pagamento-la).
//
// A unidade posta no grupo do financeiro o PDF do lote ("2 CH - 20SETEMBRO2026 -
// C.GRANDE"). A Sol:
//   1. lê cada cheque por VISÃO (o PDF é escaneado: pdftotext devolve nada);
//   2. PROVA a leitura por código: os 3 dígitos verificadores da linha CMC-7 e a
//      concordância CMC-7 × banco/agência/número impressos; valor numérico ×
//      valor por extenso. Leitura que não se prova vira ❓, nunca palpite;
//   3. acha a parcela: `sol_cheque_resolver_fatura_v1` (emitente → pessoa → fatura);
//   4. decide cheque a cheque com a fatura REAL (espelho do Emusys) e os vínculos
//      do caixa: ✅ vai para o caixa · ⚠️ retirar do malote · ❓ não entra;
//   5. os ✅ entram no CAIXA DA SOL do dia, pelo card de sempre (forma cheque,
//      "pode", cofre V3): 2+ cheques = um lote; 1 cheque = lançamento simples.
//
// 🔴 DECISÃO DO ALF (26/09): o cheque entra no caixa da Sol do LA Report; o Super
//    Folha já puxa o caixa da Sol (export-caixa-movimentacoes). A Sol NÃO chama o
//    Super Folha. O número do cheque vai na descrição (complemento_descricao) —
//    é por ele que o Super Folha liga o depósito e a devolução do banco.
// ⚠️ Fatura já ligada a lançamento do caixa NÃO entra de novo (a duplicidade da
//    Barra de 26/09 foi exatamente isso).
// ⚠️ CPF/CNPJ nunca em claro fora da memória do processo: vira HMAC no banco
//    (`sol_cheque_documento_hash_v1`) e só o hash segue. Nunca vai para log.
// ⚠️ O PDF e as imagens renderizadas são apagados depois da leitura.
// ⚠️ Modos (arquivo cheques.json ao lado deste, ou env): off | sombra | grupo.
//    sombra = lê, prova e decide, e manda o resultado SÓ para o destino de sombra
//    (DM): nada no grupo, nenhum card, nada no caixa.

const fs = require('fs');
const path = require('path');
const https = require('https');
const cp = require('child_process');
const os = require('os');
const crypto = require('crypto');

const UNIDADE_SIGLA = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'cg',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'rec',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'bar',
};
const BANCOS = {
  '001': 'Banco do Brasil', '033': 'Santander', '041': 'Banrisul', '070': 'BRB', '077': 'Inter',
  '104': 'Caixa', '212': 'Original', '237': 'Bradesco', '260': 'Nubank', '336': 'C6',
  '341': 'Itaú', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob',
};
const ZEN_ENV = '/home/sol/.hermes/profiles/sol/caixa-ingestao/.secrets/zen.env';
const CONFIG = path.join(__dirname, 'cheques.json');
const MESES = { jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5,
  jun: 6, junho: 6, jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12 };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const fmtBRL = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function configuracao() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) || {}; } catch (_) { c = {}; }
  return {
    modo: String(process.env.SOL_CHEQUES_MODO || c.modo || 'off').toLowerCase(),
    sombraJid: process.env.SOL_CHEQUES_SOMBRA_JID || c.sombra_jid || null,
    modelo: process.env.SOL_CHEQUES_VISAO_MODELO || c.modelo || 'gemini-3.8-flash',
  };
}

// ---------------------------------------------------------------- reconhecimento

// Nome do arquivo como a ponte grava: doc_<hex>_<nome-original-sanitizado>.
function nomeOriginal(caminho) {
  return path.basename(String(caminho || '')).replace(/^doc_[0-9a-f]{12}_/i, '');
}

// Lote de cheques = arquivo "N CH - ..." OU legenda que fala de cheques para
// depósito/malote. ⚠️ "pagamento em cheque" solto NÃO é lote: é comprovante.
function pareceLoteCheques({ body, mediaUrls } = {}) {
  const leg = norm(body);
  const arq = norm(nomeOriginal(Array.isArray(mediaUrls) ? mediaUrls[0] : ''));
  if (/(^|[^a-z0-9])\d{0,3}[\s_-]*ch([^a-z]|$)/.test(arq) || /cheques?/.test(arq)) return true;
  if (/^\s*\d+\s*(ch|cheques?)\b/.test(leg)) return true;
  return /\bcheques?\b/.test(leg) && /\b(deposit|malote|lote)/.test(leg);
}

function ehImagem(event, arquivo) {
  return /^image/i.test(String(event && event.mediaType || '')) || /\.(jpe?g|png|webp|heic)$/i.test(String(arquivo || ''));
}

// Texto (OCR) de uma foto com cara de cheque. 'forte' = linha CMC-7 (8·10·12
// dígitos) ou dois marcadores impressos do cheque; 'fraco' = um marcador ou a
// palavra "cheque" (fora de "cheque especial", que aparece em print de banco).
function sinalChequeNoTexto(texto) {
  const bruto = String(texto || '');
  const t = norm(bruto).replace(/cheques?\s+especial/g, ' ');
  const cmc7 = /\d{7,8}\D{1,4}\d{9,10}\D{1,4}\d{11,12}/.test(bruto.replace(/[ \t]+/g, ' '));
  const marcadores = [/por este cheque/, /a quantia de/, /(ou a|a) sua ordem|ou a ordem/, /\bbom para\b/, /\bcompe\b/]
    .filter((re) => re.test(t)).length;
  if (cmc7 || marcadores >= 2) return 'forte';
  if (marcadores === 1 || /\bcheques?\b/.test(t)) return 'fraco';
  return null;
}

// "20SETEMBRO2026", "20SETEMBRO206" (erro de digitação real), "20AGO2026", "dia 20/09".
function dataDoLote(texto, agora = Date.now()) {
  const brt = new Date(agora - 3 * 3600 * 1000);
  const anoAtual = brt.getUTCFullYear();
  const t = norm(texto).replace(/_/g, ' ');
  let m = t.match(/(\d{1,2})\s*(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*(\d{2,4})?/);
  let dia; let mes; let ano = anoAtual;
  if (m) {
    dia = Number(m[1]); mes = MESES[m[2]];
    const a = m[3] ? Number(m[3]) : null;
    if (a && a >= 2000 && a <= 2100) ano = a;
    else if (a && a < 100) ano = 2000 + a;
  } else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    dia = Number(m[1]); mes = Number(m[2]);
    if (m[3]) ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  }
  if (!dia || !mes || dia > 31 || mes > 12) return brt.toISOString().slice(0, 10);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ------------------------------------------------------------------- CMC-7

// Módulo 10, pesos 2,1 a partir da direita (soma dos dígitos do produto).
function dvMod10(s) {
  const d = digitos(s);
  let soma = 0;
  for (let i = d.length - 1, p = 2; i >= 0; i -= 1, p = p === 2 ? 1 : 2) {
    const x = Number(d[i]) * p;
    soma += x > 9 ? x - 9 : x;
  }
  return String((10 - (soma % 10)) % 10);
}

// 30 dígitos: [banco3 agencia4 DV2] [comp3 numero6 tipif1] [DV1 conta10 DV3].
// DV2 valida o campo 2, DV1 o banco+agência, DV3 a conta (conferido contra dois
// cheques reais em 26/09: os seis dígitos batem).
function lerCmc7(bruto) {
  const d = digitos(bruto);
  if (d.length !== 30) return { ok: false, motivo: d.length ? 'cmc7_tamanho' : 'cmc7_ausente' };
  const c1 = d.slice(0, 8); const c2 = d.slice(8, 18); const c3 = d.slice(18);
  const r = {
    banco: c1.slice(0, 3), agencia: c1.slice(3, 7), numero: c2.slice(3, 9), compensacao: c2.slice(0, 3),
    conta: c3.slice(1, 11),
  };
  const ok = dvMod10(c2) === c1[7] && dvMod10(c1.slice(0, 7)) === c3[0] && dvMod10(c3.slice(1, 11)) === c3[11];
  return ok ? { ok: true, ...r } : { ok: false, motivo: 'cmc7_digito_verificador', ...r };
}

// ------------------------------------------------------------ valor por extenso

const UN = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300,
  trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600,
  seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900 };

function inteiroPorExtenso(palavras) {
  let total = 0; let grupo = 0; let viu = false;
  for (const w of palavras) {
    if (w === 'e' || !w) continue;
    if (w === 'mil') { total += (grupo || 1) * 1000; grupo = 0; viu = true; continue; }
    if (w === 'milhao' || w === 'milhoes') { total += (grupo || 1) * 1e6; grupo = 0; viu = true; continue; }
    if (!(w in UN)) return null;
    grupo += UN[w]; viu = true;
  }
  return viu ? total + grupo : null;
}

function extensoParaNumero(texto) {
  const t = norm(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const [antes, depois] = t.split(/\breais?\b/);
  const reais = inteiroPorExtenso(antes.split(' ').filter(Boolean));
  if (reais == null) return null;
  let cent = 0;
  const m = (depois || '').match(/(.*)\bcentavos?\b/);
  if (m) {
    const c = inteiroPorExtenso(m[1].split(' ').filter(Boolean));
    if (c == null || c > 99) return null;
    cent = c;
  }
  return Math.round((reais + cent / 100) * 100) / 100;
}

// ------------------------------------------------------------ cheque normalizado

// Junta o que o modelo leu com o que o código consegue PROVAR. `confiavel` só é
// verdade com CMC-7 válido E concordante com o impresso; sem isso o cheque vai
// como ❓ e fica FORA do caixa (número errado ligaria o depósito errado).
function normalizarCheque(raw) {
  const problemas = [];
  const cmc = lerCmc7(raw && raw.cmc7);
  const numImpresso = digitos(raw && raw.numero).replace(/^0+/, '');
  const bancoImp = digitos(raw && raw.banco).padStart(3, '0').slice(-3);
  const agImp = digitos(raw && raw.agencia).slice(-4);
  let confiavel = false;
  if (!cmc.ok) problemas.push(cmc.motivo === 'cmc7_ausente' ? 'não consegui ler a linha CMC-7' : 'a linha CMC-7 não confere');
  else {
    const diverge = [];
    if (numImpresso && cmc.numero.replace(/^0+/, '') !== numImpresso) diverge.push('número');
    if (bancoImp && bancoImp !== '000' && cmc.banco !== bancoImp) diverge.push('banco');
    if (agImp && cmc.agencia !== agImp.padStart(4, '0')) diverge.push('agência');
    if (diverge.length) problemas.push(`CMC-7 e o impresso divergem (${diverge.join(', ')})`);
    else confiavel = true;
  }
  const valor = Number(raw && raw.valor);
  const ext = extensoParaNumero(raw && raw.valor_extenso);
  if (!(valor > 0)) { problemas.push('valor não lido'); confiavel = false; }
  else if (ext != null && Math.abs(ext - valor) >= 0.01) {
    problemas.push(`valor numérico ${fmtBRL(valor)} e por extenso ${fmtBRL(ext)} não batem`);
    confiavel = false;
  }
  const bom = raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.bom_para || '')) ? raw.bom_para : null;
  return {
    confiavel,
    problemas,
    banco: cmc.banco || bancoImp || null,
    agencia: cmc.agencia || agImp || null,
    numero: (cmc.numero || digitos(raw && raw.numero)).padStart(6, '0').slice(-6),
    conta_final: cmc.conta ? cmc.conta.slice(-4) : (digitos(raw && raw.conta).slice(-4) || null),
    valor: valor > 0 ? Math.round(valor * 100) / 100 : null,
    bom_para: bom,
    emitente_nome: raw && raw.emitente_nome ? String(raw.emitente_nome).trim() : null,
    documento: digitos(raw && raw.emitente_documento) || null, // só em memória; vira hash
  };
}

// ------------------------------------------------------------ escolha da parcela

const dias = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
// Identidade do cheque: banco + número (a CMC-7 prova os dois).
const chaveCheque = (c) => `${String(c && c.banco || '').padStart(3, '0')}|${String(c && c.numero || '')}`;
const hojeBRT = (agora = Date.now()) => new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
const hhmm = (ms) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(11, 16);

// Suspeitos para o grupo responder "de quem é?". SÓ ordena a sugestão — nunca
// decide: quem tem sobrenome em comum com o emitente vem primeiro (no teste real,
// o cheque de "Mauricio C. Vieira" era da família Vieira, e a lista por valor
// punha na frente um estranho).
function suspeitosDe(cands, emitente) {
  const sobren = new Set(norm(emitente).split(/\s+/).filter((w) => w.length >= 4).slice(1));
  const comum = (c) => norm(`${c.responsavel_nome || ''} ${c.aluno_nome || ''}`).split(/\s+/).some((w) => sobren.has(w));
  const vistos = new Set(); const out = [];
  const ord = cands.map((c, i) => ({ c, i, k: comum(c) ? 0 : 1 })).sort((x, y) => x.k - y.k || x.i - y.i);
  for (const { c } of ord) {
    const rotulo = c.responsavel_nome && c.aluno_nome && norm(c.responsavel_nome) !== norm(c.aluno_nome)
      ? `${c.responsavel_nome} (aluno ${c.aluno_nome})` : (c.responsavel_nome || c.aluno_nome);
    if (!rotulo || vistos.has(rotulo)) continue;
    vistos.add(rotulo);
    out.push({ rotulo, fatura: c.emusys_fatura_id != null ? Number(c.emusys_fatura_id) : null });
    if (out.length >= 3) break;
  }
  return out;
}

// Regra combinada com o agente do LA Report (26/09): destacada → manda; empate de
// candidatas do MESMO emitente → a de data mais próxima do bom-para/lote, e só se
// for estritamente a mais próxima; emitente desconhecido → sem fatura, com os
// nomes das candidatas como suspeitos para o grupo responder.
function escolherFatura(res, cheque, loteData) {
  if (!res || res.ok === false) return { fatura: null, motivo: 'resolver_indisponivel', suspeitos: [] };
  const cands = Array.isArray(res.candidatas) ? res.candidatas : [];
  const resolvido = !!(res.emitente && res.emitente.resolvido);
  const nomes = suspeitosDe(cands, cheque.emitente_nome);
  if (!resolvido) return { fatura: null, motivo: 'emitente_desconhecido', suspeitos: nomes };
  if (!cands.length) return { fatura: null, motivo: 'sem_candidata', suspeitos: [] };
  const [a, b] = cands;
  if (!b || Number(a.score) - Number(b.score) >= 0.1) return { fatura: a, motivo: 'destacada', suspeitos: [] };
  const ref = cheque.bom_para || loteData;
  const valorDe = (c) => Number(c.status === 'paga' && c.valor_pago != null ? c.valor_pago : c.valor_original);
  const empatadas = cands.filter((c) => Number(a.score) - Number(c.score) < 0.1
    && (cheque.valor == null || Math.abs(valorDe(c) - cheque.valor) <= 1));
  const dist = (c) => {
    const d = c.status === 'paga' ? c.data_pagamento : c.data_vencimento;
    return d ? dias(d, ref) : Infinity;
  };
  const ord = empatadas.map((c) => ({ c, d: dist(c) })).sort((x, y) => x.d - y.d);
  if (ord.length && ord[0].d <= 45 && (ord.length === 1 || ord[0].d < ord[1].d)) {
    return { fatura: ord[0].c, motivo: 'mais_proxima', suspeitos: [] };
  }
  return { fatura: null, motivo: 'empate', suspeitos: nomes };
}

// ------------------------------------------------------------ decisão por cheque

// Categoria do caixa a partir da descrição da fatura — a MESMA leitura que o
// validador do lote faz pelo tipo (parcela exige tipo parcela; passaporte/matrícula
// exigem taxa). 'outro' não é conferido pelo validador.
function categoriaDaFatura(desc) {
  const d = norm(desc);
  if (/^parcela\b/.test(d)) return 'parcela';
  if (/taxa de matricula|passaporte/.test(d)) return 'passaporte';
  return 'outro';
}
const mmYYYY = (iso) => (iso && /^\d{4}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

// 🔴 A MESMA RÉGUA DO "pode" (auditoria D3, 29/09). O validador do lote
//    (`sol_caixa_validar_multi_aluno_snapshot_v1`) aceita o item só se o valor for
//    `valor_pago` (paga) ou `valor_hoje` (aberta), e `valor_hoje` vem de
//    `calcular_valores_fatura_financeiro_v1` (migration 20260817081504):
//      • aberta, vencimento < hoje: (original − desconto fixo) + 2% de multa
//        + 1% ao mês de mora pró-rata (cada parcela arredondada a 2 casas) —
//        o desconto CONDICIONAL se perde;
//      • aberta em dia: original − fixo − condicional;
//      • paga: valor_pago (sem ele, o valor com desconto — o coalesce do validador).
//    O card usava sempre "com desconto": dizia ✅ e o "pode" recusava o lote
//    INTEIRO (snapshot_valor_fatura_mudou). Card que o "pode" não grava não sai.
//    ⚠️ Paridade com o SQL conferida por SELECT (ver descrição do PR); se a função
//       do banco mudar, esta muda junto.
const r2 = (x) => Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9) / 100;
function valorDoBanco(f, hoje = hojeBRT()) {
  if (!f) return null;
  const orig = Number(f.valor_original || 0); const fixo = Number(f.desconto_fixo || 0); const cond = Number(f.desconto_condicional || 0);
  const comDesconto = r2(Math.max(orig - fixo - cond, 0));
  const semCondicional = r2(Math.max(orig - fixo, 0));
  const st = String(f.status || '').trim().toLowerCase();
  let v; let vencida = false; let multa = 0; let mora = 0;
  if (st === 'paga') v = f.valor_pago != null && f.valor_pago !== '' ? Number(f.valor_pago) : comDesconto;
  else if (st === 'aberta' && f.data_vencimento && String(f.data_vencimento).slice(0, 10) < hoje) {
    const diasAtraso = Math.max(Math.round((Date.parse(hoje) - Date.parse(String(f.data_vencimento).slice(0, 10))) / 86400000), 0);
    multa = r2(semCondicional * 0.02);
    mora = r2(semCondicional * 0.01 * diasAtraso / 30);
    v = r2(semCondicional + multa + mora); vencida = true;
  } else v = comDesconto;
  return { valor: v > 0 ? v : null, vencida, comDesconto, semCondicional, multa, mora };
}

// O que fazer com cada cheque, com a fatura REAL na mão. Só `lancar` vira card.
//   lancar       — fatura paga em cheque (a unidade registrou ao receber) ou em
//                  aberto, com o valor batendo;
//   retirar      — a parcela foi paga de OUTRA forma (Pix, cartão) ou cancelada:
//                  o cheque tem de voltar ao cliente, não ao banco;
//   ja_no_caixa  — a fatura já está ligada a um lançamento do caixa: lançar de
//                  novo seria a duplicidade da Barra de 26/09;
//   valor        — o cheque não bate com a parcela;
//   sem_parcela  — não sei de quem é (ou empate);
//   leitura      — a leitura não foi provada.
//   ja_no_caixa  — também quando o CHEQUE (banco + número) já está no caixa.
function decidirCheque(it, fatura, jaLigada, hoje = hojeBRT()) {
  if (!it.cheque.confiavel) return 'leitura';
  if (it.chequeNoCaixa) return 'ja_no_caixa';
  if (!it.escolha.fatura || !fatura) return 'sem_parcela';
  if (jaLigada) return 'ja_no_caixa';
  if (fatura.status === 'cancelada') return 'retirar';
  if (fatura.status === 'paga' && String(fatura.forma || '').trim() && !/cheque/i.test(fatura.forma)) return 'retirar';
  // 🔴 PAGA SEM FORMA NÃO É "PAGA EM CHEQUE" (auditoria D4, 29/09). Baixa manual ou
  //    payload antigo deixam a forma vazia; se foi Pix/cartão, o cheque tem de voltar
  //    ao cliente, e lançá-lo dobraria a receita. Sem forma, a equipe confirma
  //    ("N foi cheque" / "N foi pix", citando a lista).
  if (fatura.status === 'paga' && !String(fatura.forma || '').trim()) {
    if (it.formaConfirmada && it.formaConfirmada !== 'cheque') return 'retirar';
    if (it.formaConfirmada !== 'cheque') return 'forma_indefinida';
  }
  const vb = valorDoBanco(fatura, hoje);
  it.valorBanco = vb;
  if (!vb || !(vb.valor > 0) || Math.abs(vb.valor - Number(it.cheque.valor)) > 0.01) return 'valor';
  return 'lancar';
}

// Item no formato que o caixa da Sol já lança (o mesmo que o resolvedor de
// pagamentos devolve para o lote de Pix). `complemento_descricao` leva o número
// do cheque até a movimentação: é por ele que o Super Folha liga o depósito.
function itemDoCaixa(it) {
  const f = it.fatura; const esc = it.escolha.fatura;
  return {
    aluno_nome: esc.aluno_nome, responsavel_financeiro: esc.responsavel_nome || null,
    valor: Number(it.cheque.valor), categoria: categoriaDaFatura(f.descricao),
    competencia: mmYYYY(f.competencia), canonical_fatura_id: f.id, descricao: f.descricao || null,
    fatura: { canonical_fatura_id: f.id, descricao: f.descricao, competencia: f.competencia, status: f.status,
      data_pagamento: f.data_pagamento, valor_pago: f.valor_pago },
    sem_vinculo_fatura: false, declarado_pelo_humano: false,
    complemento_descricao: `cheque ${BANCOS[it.cheque.banco] || 'banco ' + it.cheque.banco} nº ${it.cheque.numero}`,
    // Estruturado para o Super Folha (27/09): as colunas cheque_* da
    // movimentação substituem o parse da descrição; ela fica só de reserva.
    cheque_numero: it.cheque.numero || null,
    cheque_banco: it.cheque.banco || null,
    cheque_bom_para: it.cheque.bom_para || null,
  };
}

// ------------------------------------------------------------ mensagem

const CIRC = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const ddmm = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '');
const SEP = '━━━━━━━━━━━━━━';

// Nome impresso no cheque vem em CAIXA ALTA ("MAURICIO CARDOZO VIEIRA"); no card
// ele aparece como nome de gente. Conectivos ficam minúsculos. Nome que já vem
// com minúsculas é mantido como está (é o cadastro, não o cheque).
const CONECTIVOS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
function nomeBonito(nome) {
  const s = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(' ')
    .map((w, i) => (i > 0 && CONECTIVOS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

// O valor que o "pode" vai exigir (a régua do banco, valorDoBanco).
function valorEsperado(f, it = null) {
  const vb = (it && it.valorBanco) || valorDoBanco(f);
  return vb && vb.valor > 0 ? vb.valor : null;
}

// UM cheque = UM bloco, uma informação por linha — o mesmo vocabulário do card de
// comprovante da Sol (aluno, resp. financeiro, fatura). O número "Cheque N" é a
// ORDEM de leitura e não muda entre seções: é por ele que a equipe responde
// "3 é da Fulana".
function blocoCheque(it, i) {
  const ch = it.cheque;
  const esc = it.escolha.fatura;
  const f = it.fatura;
  const banco = BANCOS[ch.banco] || (ch.banco ? 'Banco ' + ch.banco : 'Banco ?');
  const l = [`*Cheque ${i + 1}* — ${ch.valor ? fmtBRL(ch.valor) : 'R$ ?'}`];
  l.push(`🏦 ${banco} · nº ${ch.numero}${ch.bom_para ? ` · bom para ${ddmm(ch.bom_para)}` : ''}`);
  l.push(`✍️ Emitente: ${ch.emitente_nome ? nomeBonito(ch.emitente_nome) : 'não consegui ler'}`);
  if (esc && esc.aluno_nome) l.push(`🎓 Aluno: ${esc.aluno_nome}`);
  if (esc && esc.responsavel_nome) l.push(`👤 Resp. financeiro: ${esc.responsavel_nome}`);
  if (f && f.descricao) l.push(`📄 ${f.descricao}`);
  const d = it.decisao;
  if (d === 'lancar') {
    const vb = it.valorBanco || valorDoBanco(f);
    l.push(f && f.status === 'paga'
      ? `💳 Paga no Emusys${f.data_pagamento ? ' em ' + ddmm(f.data_pagamento) : ''}${f.forma ? ' · ' + f.forma : (it.formaConfirmada === 'cheque' ? ' · em cheque (confirmado pela equipe)' : '')} — ✅ confere`
      : vb && vb.vencida
        ? `💳 Em aberto no Emusys, vencida em ${ddmm(f.data_vencimento)} — valor de hoje ${fmtBRL(vb.valor)} (com multa/juros) — ✅ confere`
        : '💳 Em aberto no Emusys — ✅ valor confere');
  } else if (d === 'retirar') {
    l.push(f && f.status === 'cancelada'
      ? '↩️ Essa parcela foi *cancelada* no Emusys — devolver o cheque ao cliente.'
      : `↩️ Essa parcela já foi paga${f && (f.forma || it.formaConfirmada) ? ' por *' + (f.forma || it.formaConfirmada) + '*' : ''}${f && f.data_pagamento ? ' em ' + ddmm(f.data_pagamento) : ''} — devolver o cheque ao cliente.`);
  } else if (d === 'ja_no_caixa') {
    l.push(it.chequeNoCaixa
      ? `🚫 Esse cheque já está no caixa${it.chequeNoCaixa.data ? ' (lançado em ' + ddmm(it.chequeNoCaixa.data) + ')' : ''} — não lanço de novo.`
      : '🚫 Essa parcela já está lançada no caixa — não lanço de novo.');
  } else if (d === 'forma_indefinida') {
    l.push(`❔ Paga no Emusys${f && f.data_pagamento ? ' em ' + ddmm(f.data_pagamento) : ''}, mas *sem forma de pagamento registrada* — não dá para afirmar que foi com este cheque.`);
    l.push(`   Se foi com ele, responde citando esta mensagem: *${i + 1} foi cheque*. Se foi Pix/cartão: *${i + 1} foi pix* (aí o cheque volta ao cliente).`);
  } else if (d === 'ja_em_card') {
    l.push(`🔁 Esse cheque já está no card aberto${it.cardAberto && it.cardAberto.ts ? ' das ' + hhmm(it.cardAberto.ts) : ''} — responde *pode* naquele card; aqui ele não entra.`);
  } else if (d === 'repetido') {
    l.push('🔁 Esse cheque apareceu duas vezes neste arquivo — conto só uma.');
  } else if (d === 'valor') {
    const vb = it.valorBanco || valorDoBanco(f);
    const esp = valorEsperado(f, it);
    const dif = esp && ch.valor ? r2(Number(ch.valor) - esp) : null;
    const difTxt = dif ? ` — diferença de ${fmtBRL(Math.abs(dif))} ${dif < 0 ? 'a menos' : 'a mais'} no cheque` : '';
    if (vb && vb.vencida) {
      l.push(`⚠️ Parcela *vencida* em ${ddmm(f.data_vencimento)}: hoje ela vale ${fmtBRL(esp)} no Emusys`
        + ` (${fmtBRL(vb.semCondicional)} sem o desconto de pontualidade + ${fmtBRL(r2(vb.multa + vb.mora))} de multa/juros).`);
      l.push(`   O cheque é de ${fmtBRL(ch.valor)}${difTxt}${Math.abs(Number(ch.valor) - vb.comDesconto) < 0.01 ? ' (é o valor com desconto, de antes do vencimento)' : ''}. Não entra no caixa sem conferir.`);
    } else {
      l.push(`⚠️ O cheque é de ${fmtBRL(ch.valor)}${esp ? ` e a parcela é de ${fmtBRL(esp)}${difTxt}` : ' e não bate com a parcela'} — confere antes.`);
    }
  } else if (d === 'leitura') {
    l.push(`📷 Não consegui confirmar a leitura: ${ch.problemas.join('; ')}.`);
    l.push('   Confere o número e o valor no cheque.');
  } else {
    const sug = it.escolha.suspeitos || [];
    if (it.escolha.motivo === 'empate') l.push('🔎 Achei mais de uma parcela possível para esse emitente.');
    else l.push('🔎 Não achei esse emitente no cadastro.');
    if (sug.length) {
      l.push('   Pode ser da família de:');
      for (const s of sug) l.push(`   • ${s.rotulo || s}`);
    }
  }
  return l.join('\n');
}

const SECOES = [
  { chave: 'caixa', titulo: '✅ *VAI PARA O CAIXA*', decisoes: ['lancar'] },
  { chave: 'malote', titulo: '⚠️ *RETIRAR DO MALOTE*', decisoes: ['retirar'] },
  { chave: 'voce', titulo: '❓ *PRECISA DE VOCÊ*', decisoes: ['sem_parcela', 'forma_indefinida', 'valor', 'leitura', 'ja_no_caixa', 'ja_em_card', 'repetido'] },
];

// A mensagem do lote É o card: com cheque ✅, o "pode" citando ESTA mensagem lança
// os ✅ no caixa do dia; "3 é da Fulana" citando ESTA mensagem resolve um ❓.
// Hierarquia: cabeçalho → placar → uma seção por destino → um bloco por cheque.
function montarMensagem({ unidadeNome, loteData, itens, sombra = false, cabecalho = null, indices = null, avisos = [] }) {
  const total = itens.reduce((s, it) => s + (Number(it.cheque.valor) || 0), 0);
  // `indices` preserva o número do cheque no lote quando a mensagem mostra só parte dele.
  const porSecao = SECOES.map((s) => ({ ...s, itens: itens.map((it, i) => ({ it, i: indices ? indices[i] : i })).filter((x) => s.decisoes.includes(x.it.decisao)) }));
  const lanc = porSecao[0].itens;
  const totalLanc = lanc.reduce((s, x) => s + Number(x.it.cheque.valor), 0);
  const partes = [];
  if (sombra) partes.push('🧪 *SOMBRA* — nada foi postado no grupo e nada foi lançado.');
  partes.push([
    cabecalho || `🧾 *Lote de cheques — ${unidadeNome}*`,
    `📅 Depósito de ${ddmm(loteData)} · ${itens.length} cheque${itens.length === 1 ? '' : 's'} · ${fmtBRL(total)}`,
  ].join('\n'));
  const placar = [];
  if (lanc.length) placar.push(`✅ ${lanc.length} ${lanc.length === 1 ? 'vai' : 'vão'} para o caixa — ${fmtBRL(totalLanc)}`);
  if (porSecao[1].itens.length) placar.push(`⚠️ ${porSecao[1].itens.length} para retirar do malote`);
  if (porSecao[2].itens.length) placar.push(`❓ ${porSecao[2].itens.length} precisa${porSecao[2].itens.length === 1 ? '' : 'm'} de você`);
  if (placar.length) partes.push(placar.join('\n'));
  if (avisos && avisos.length) partes.push(avisos.join('\n'));
  for (const s of porSecao) {
    if (!s.itens.length) continue;
    partes.push(`${SEP}\n${s.titulo}\n\n${s.itens.map((x) => blocoCheque(x.it, x.i)).join('\n\n')}`);
  }
  const fim = [];
  if (lanc.length) {
    fim.push(sombra
      ? `👉 No grupo eu perguntaria: *Posso lançar ${fmtBRL(totalLanc)} (${lanc.length} cheque${lanc.length === 1 ? '' : 's'}) no caixa de hoje?*`
      : `👉 *Posso lançar ${fmtBRL(totalLanc)} (${lanc.length} cheque${lanc.length === 1 ? '' : 's'}) no caixa de hoje?* Responde *pode* citando esta mensagem.`);
  }
  if (!sombra && porSecao[2].itens.some((x) => x.it.decisao === 'sem_parcela')) {
    fim.push(`❓ Para os demais, responde citando esta mensagem: *${porSecao[2].itens.find((x) => x.it.decisao === 'sem_parcela').i + 1} é da Fulana*.`);
  }
  if (!sombra && porSecao[2].itens.some((x) => x.it.decisao === 'forma_indefinida')) {
    fim.push(`❔ Parcela paga sem forma registrada: responde citando esta mensagem *${porSecao[2].itens.find((x) => x.it.decisao === 'forma_indefinida').i + 1} foi cheque* (ou *foi pix*).`);
  }
  if (fim.length) partes.push(`${SEP}\n${fim.join('\n')}`);
  return partes.join('\n\n');
}

// ------------------------------------------------------------ E/S

function chaveZen() {
  if (process.env.OPENCODE_ZEN_API_KEY) return process.env.OPENCODE_ZEN_API_KEY;
  try { const m = fs.readFileSync(ZEN_ENV, 'utf8').match(/OPENCODE_ZEN_API_KEY=(.+)/); return m ? m[1].trim().replace(/^"|"$/g, '') : null; } catch (_) { return null; }
}

function postJson(url, body, headers, timeout = 90000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    let u; try { u = new URL(url); } catch (_) { return resolve({ status: 0, body: null }); }
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.setTimeout(timeout, () => req.destroy());
    req.write(data); req.end();
  });
}

const PROMPT = [
  'Esta imagem e a copia de um lote de CHEQUES bancarios brasileiros para deposito. Para CADA cheque, na ordem em que aparecem (de cima para baixo), extraia os campos abaixo. Responda SOMENTE um JSON valido, sem markdown:',
  '{"cheques":[{"banco":"codigo do banco, 3 digitos","agencia":"4 digitos","conta":"numero da conta impresso, so digitos","numero":"numero do cheque impresso no topo, so digitos","cmc7":"a linha de caracteres magneticos impressa no rodape do cheque, so os digitos, na ordem, sem espacos","valor":0.00,"valor_extenso":"o valor escrito por extenso, transcrito","emitente_nome":"nome IMPRESSO do titular da conta (perto da assinatura)","emitente_documento":"CPF ou CNPJ impresso do titular, so digitos, ou null","beneficiario":"nome escrito a mao depois de a / ou a sua ordem","data_emissao":"AAAA-MM-DD","bom_para":"AAAA-MM-DD somente se estiver escrito bom para ou pre-datado; senao null"}]}',
  'Leia o valor numerico e o valor por extenso separadamente e com cuidado. Se nao tiver certeza de um campo, use null. Se nao houver cheque na imagem, responda {"cheques":[]}.',
].join('\n');

function extrairJson(texto) {
  const t = String(texto || '').replace(/```(?:json)?/g, '');
  const i = t.indexOf('{'); const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch (_) { return null; }
}

async function lerImagemVisao(imgPath, modelo) {
  const chave = chaveZen();
  if (!chave) return { ok: false, motivo: 'sem_chave_visao' };
  const b64 = fs.readFileSync(imgPath).toString('base64');
  const mime = /\.jpe?g$/i.test(imgPath) ? 'image/jpeg' : 'image/png';
  const r = await postJson(`https://opencode.ai/zen/v1/models/${modelo}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
    generationConfig: { temperature: 0 },
  }, { Authorization: 'Bearer ' + chave, 'x-goog-api-key': chave, 'User-Agent': 'sol-caixa/1.0' }, 120000);
  const partes = r.body && r.body.candidates && r.body.candidates[0] && r.body.candidates[0].content
    && r.body.candidates[0].content.parts;
  const texto = Array.isArray(partes) ? partes.map((p) => p.text || '').join('') : '';
  const j = extrairJson(texto);
  if (!j || !Array.isArray(j.cheques)) return { ok: false, motivo: 'visao_sem_json', status: r.status };
  return { ok: true, cheques: j.cheques };
}

// PDF → PNG por página (200 dpi, até 20 páginas: lote de 10-15 cheques ocupa
// 4-8 páginas). Imagem passa direto.
function paginasDoArquivo(arquivo) {
  if (!/\.pdf$/i.test(arquivo)) return { paginas: [arquivo], tmp: null };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-chq-'));
  cp.spawnSync('/usr/bin/pdftoppm', ['-r', '200', '-png', '-f', '1', '-l', '20', arquivo, path.join(tmp, 'p')], { timeout: 60000 });
  const paginas = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(tmp, f));
  return { paginas, tmp };
}

async function lerLote(arquivo, modelo) {
  const { paginas, tmp } = paginasDoArquivo(arquivo);
  try {
    // 3 páginas por vez (lote de 15 cheques ≈ 5-8 páginas ≈ 13 s cada); a ORDEM
    // dos cheques é a das páginas, porque é ela que numera "Cheque N" no card.
    const porPagina = new Array(paginas.length);
    let proxima = 0; let falha = null;
    async function trabalhador() {
      while (proxima < paginas.length && !falha) {
        const k = proxima; proxima += 1;
        let r = await lerImagemVisao(paginas[k], modelo);
        if (!r.ok) r = await lerImagemVisao(paginas[k], modelo); // uma nova tentativa: JSON truncado acontece
        if (!r.ok) { falha = r.motivo || 'visao_falhou'; return; }
        porPagina[k] = r.cheques;
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    if (falha) return { ok: false, motivo: falha };
    return { ok: true, cheques: porPagina.flat(), paginas: paginas.length };
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* melhor esforço */ } }
  }
}

// Resposta que é DECISÃO sobre o card, nunca nome: 'nao' | 'pode' | null.
// A primeira palavra manda ("ok, pode", "sim", "não", "cancela", "pode lançar").
const CTL_NAO = /^(nao|n|cancela|cancelar|cancelado|descarta|descartar|ignora|ignorar|esquece|esquecer|deixa|errado|errada)$/;
const CTL_PODE = /^(pode|sim|ok|okay|isso|certo|confirmo|confirma|confirmado|autorizo|autorizado|lanca|lancar|beleza|blz|perfeito|manda|aprovado|aprova|s)$/;
function controleDaResposta(texto) {
  const n = norm(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  const w = n.split(' ')[0];
  if (CTL_NAO.test(w)) return 'nao';
  if (CTL_PODE.test(w)) return 'pode';
  return null;
}

const JANELA_CARD_MS = 30 * 60 * 1000;   // a mesma janela do card no caixa
const LEITURA_MAX_MS = 10 * 60 * 1000;   // leitura de lote que passou disso travou
const AGUARDA_CARD_MS = 2 * 60 * 1000;   // entre "li" e o caixa publicar o card

function sha256Arquivo(arquivo) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'); } catch (_) { return null; }
}

function criarCheques({ carregarEnv, sendFn, log = () => {}, lerLoteFn = lerLote, rpcFn = null, consultaFn = null, agoraFn = () => Date.now(), albumMs: albumMsOpt = null } = {}) {
  // chatId -> [{ msgIds, itens, loteData, sigla, unidadeNome, ts, origem, hash,
  //              estado: 'lendo'|'lido', pendenteCard: {chaves, ts}, cards: [{id, chaves, ts}] }]
  const lotes = new Map();
  // Ganchos do caixa (ligarCaixa): quem sabe se um card ainda aceita "pode".
  const caixa = { cardAberto: null, ocr: null };

  async function rpc(nome, args) {
    if (rpcFn) return rpcFn(nome, args);
    const { url, key } = carregarEnv();
    const r = await postJson(`${url}/rest/v1/rpc/${nome}`, args, { apikey: key, Authorization: `Bearer ${key}` }, 30000);
    return r.status >= 200 && r.status < 300 ? r.body : null;
  }
  // Leitura REST com a service key (a mesma que o caixa usa em toda RPC).
  async function consulta(caminho) {
    if (consultaFn) return consultaFn(caminho);
    const { url, key } = carregarEnv();
    return new Promise((resolve) => {
      let u; try { u = new URL(`${url}/rest/v1/${caminho}`); } catch (_) { return resolve(null); }
      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        headers: { apikey: key, Authorization: `Bearer ${key}` } }, (res) => {
        let t = ''; res.on('data', (c) => { t += c; });
        res.on('end', () => { try { resolve(res.statusCode < 300 ? JSON.parse(t) : null); } catch (_) { resolve(null); } });
      });
      req.on('error', () => resolve(null)); req.setTimeout(20000, () => req.destroy()); req.end();
    });
  }

  // Fatura real + se já está ligada a algum lançamento do caixa. Falha de leitura
  // NÃO vira "pode lançar": sem os dados, o lote inteiro é recusado.
  async function carregarFaturas(itens) {
    const ids = [...new Set(itens.map((it) => it.escolha.fatura && it.escolha.fatura.la_report_fatura_id).filter(Boolean))];
    if (!ids.length) return { ok: true };
    const lista = ids.join(',');
    const fats = await consulta(`emusys_faturas?select=id,emusys_fatura_id,descricao,status,valor_pago,valor_original,desconto_fixo,desconto_condicional,competencia,data_pagamento,data_vencimento,forma:payload->>forma_pagamento_transacao&id=in.(${lista})`);
    const links = await consulta(`vw_caixa_movimentacao_fatura_links?select=fatura_id&fatura_id=in.(${lista})`);
    if (!Array.isArray(fats) || !Array.isArray(links)) return { ok: false };
    const porId = new Map(fats.map((f) => [f.id, f]));
    const ligadas = new Set(links.map((l) => l.fatura_id));
    for (const it of itens) {
      const id = it.escolha.fatura && it.escolha.fatura.la_report_fatura_id;
      it.fatura = id ? porId.get(id) || null : null;
      it.jaLigada = !!(id && ligadas.has(id));
    }
    return { ok: true };
  }

  // 🔴 O MESMO CHEQUE NÃO ENTRA DUAS VEZES (29/09/2026, auditoria D1). Número +
  //    banco já gravados no caixa desta unidade (e não estornados) = o cheque já
  //    entrou. Falha de leitura NÃO vira "pode lançar": devolve ok:false.
  //    ⚠️ O estorno da Sol cria a movimentação inversa com descrição
  //    "ESTORNO de <id> …" e sem as colunas cheque_*; é por ela que o original
  //    estornado deixa de contar.
  async function chequesNoCaixa(unidadeId, cheques) {
    const alvo = cheques.filter((c) => c && c.numero && c.banco);
    if (!alvo.length) return { ok: true, achados: [] };
    if (!unidadeId) return { ok: false };
    const nums = [...new Set(alvo.map((c) => String(c.numero)))];
    const movs = await consulta(`caixa_movimentacoes?select=id,cheque_numero,cheque_banco,data_movimento,valor&unidade_id=eq.${unidadeId}&tipo=eq.entrada&cheque_numero=in.(${nums.join(',')})`);
    if (!Array.isArray(movs)) return { ok: false };
    const chave = (b, n) => `${String(b || '').padStart(3, '0')}|${String(n || '')}`;
    const pedidos = new Set(alvo.map((c) => chave(c.banco, c.numero)));
    let achados = movs.filter((m) => pedidos.has(chave(m.cheque_banco, m.cheque_numero)));
    if (achados.length) {
      const ou = achados.map((m) => `descricao.like.${encodeURIComponent(`ESTORNO de ${m.id}*`)}`).join(',');
      const est = await consulta(`caixa_movimentacoes?select=descricao&unidade_id=eq.${unidadeId}&categoria=eq.estorno&or=(${ou})`);
      if (!Array.isArray(est)) return { ok: false };
      const estornados = new Set(est.map((e) => (String(e.descricao || '').match(/^ESTORNO de ([0-9a-f-]{8,})/i) || [])[1]).filter(Boolean));
      achados = achados.filter((m) => !estornados.has(String(m.id)));
    }
    return { ok: true, achados: achados.map((m) => ({ numero: m.cheque_numero, banco: String(m.cheque_banco || '').padStart(3, '0'), data: m.data_movimento || null, valor: m.valor })) };
  }

  async function marcarNoCaixa(itens, unidadeId) {
    const prov = itens.filter((it) => it.cheque.confiavel);
    const r = await chequesNoCaixa(unidadeId, prov.map((it) => it.cheque));
    if (!r.ok) return { ok: false };
    for (const it of prov) {
      const a = r.achados.find((x) => x.banco === String(it.cheque.banco).padStart(3, '0') && x.numero === it.cheque.numero);
      if (a) it.chequeNoCaixa = { data: a.data };
    }
    return { ok: true };
  }

  function decidirTodos(itens, abertos = []) {
    const hoje = hojeBRT(agoraFn());
    // Parcela casada com um cheque do lote não é suspeita de outro cheque.
    const casadas = new Set(itens.map((it) => it.escolha.fatura && Number(it.escolha.fatura.emusys_fatura_id)).filter(Boolean));
    for (const it of itens) {
      it.escolha.suspeitos = it.escolha.suspeitos.filter((s) => !(s && s.fatura && casadas.has(s.fatura)));
      it.decisao = decidirCheque(it, it.fatura, it.jaLigada, hoje);
    }
    // O mesmo cheque (banco + número) duas vezes no lote (página repetida no
    // scan): só o primeiro conta — antes da regra da parcela, senão os dois caíam.
    const vistos = new Set();
    for (const it of itens) {
      if (!it.cheque.confiavel) continue;
      const k = chaveCheque(it.cheque);
      if (vistos.has(k)) it.decisao = 'repetido';
      vistos.add(k);
    }
    // Dois cheques na mesma parcela: nenhum dos dois entra sozinho.
    const cont = new Map();
    for (const it of itens) if (it.decisao === 'lancar') cont.set(it.fatura.id, (cont.get(it.fatura.id) || 0) + 1);
    for (const it of itens) if (it.decisao === 'lancar' && cont.get(it.fatura.id) > 1) it.decisao = 'sem_parcela';
    // Cheque que já está num card ABERTO (outro envio do mesmo malote) não vai para
    // um segundo card: dois "pode" lançariam o mesmo cheque duas vezes.
    for (const it of itens) {
      if (it.decisao !== 'lancar') continue;
      const dono = abertos.find((a) => a.chaves.has(chaveCheque(it.cheque)));
      if (dono) { it.decisao = 'ja_em_card'; it.cardAberto = { ts: dono.ts }; }
    }
  }

  // ---- lotes abertos (D1) -------------------------------------------------
  // Um lote está "aberto" enquanto é lido ou enquanto o card dele pode receber
  // "pode". Quem sabe do card é o caixa (`ligarCaixa`); sem ele (CLI, teste
  // isolado), vale a janela do card (30 min).
  function cardAberto(chatId, card) {
    if (caixa.cardAberto) return !!caixa.cardAberto(chatId, card.id);
    return agoraFn() - card.ts < JANELA_CARD_MS;
  }
  function abertosDoChat(chatId, exceto = null) {
    const agora = agoraFn();
    const out = [];
    for (const l of lotes.get(chatId) || []) {
      if (l === exceto || l.descartado) continue;
      if (l.estado === 'lendo' && agora - l.ts < LEITURA_MAX_MS) out.push({ lote: l, ts: l.ts, chaves: new Set(), lendo: true });
      if (l.pendenteCard && agora - l.pendenteCard.ts < AGUARDA_CARD_MS) out.push({ lote: l, ts: l.pendenteCard.ts, chaves: l.pendenteCard.chaves });
      for (const c of l.cards || []) if (cardAberto(chatId, c)) out.push({ lote: l, ts: c.ts, chaves: c.chaves, cardId: c.id });
    }
    return out;
  }

  // Lê + prova + resolve + decide. Nunca escreve.
  // `arquivos` (várias fotos de um álbum) vira UM lote, na ordem de chegada.
  async function processarArquivo({ arquivo, arquivos = null, unidadeId, unidadeNome, textoLote, modelo, abertos = [] }) {
    const sigla = UNIDADE_SIGLA[unidadeId];
    if (!sigla) return { ok: false, motivo: 'unidade_desconhecida' };
    const loteData = dataDoLote(textoLote, agoraFn());
    const lista = Array.isArray(arquivos) && arquivos.length ? arquivos : [arquivo];
    const lido = { ok: true, cheques: [] };
    const semCheque = [];
    for (let k = 0; k < lista.length; k += 1) {
      const r = await lerLoteFn(lista[k], modelo);
      if (!r.ok) return { ok: false, motivo: r.motivo || 'leitura_falhou' };
      if (!r.cheques.length) semCheque.push(k + 1);
      lido.cheques.push(...r.cheques);
    }
    if (!lido.cheques.length) return { ok: false, motivo: 'nenhum_cheque_lido' };
    const itens = new Array(lido.cheques.length);
    let prox = 0;
    const umCheque = async (idx) => {
      const raw = lido.cheques[idx];
      const cheque = normalizarCheque(raw);
      let docHash = null;
      if (cheque.documento && cheque.confiavel) {
        try { docHash = await rpc('sol_cheque_documento_hash_v1', { p_documento: cheque.documento }); } catch (_) { docHash = null; }
        if (typeof docHash !== 'string' || !/^[0-9a-f]{64}$/.test(docHash)) docHash = null;
      }
      delete cheque.documento; // o documento em claro não sai daqui
      let res = null;
      if (cheque.confiavel) {
        try {
          res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: unidadeId, p_emitente_nome: cheque.emitente_nome,
            p_valor: cheque.valor, p_bom_para: cheque.bom_para, p_emitente_documento_hash: docHash });
        } catch (_) { res = null; }
      }
      itens[idx] = { cheque, escolha: escolherFatura(res, cheque, loteData), fatura: null, jaLigada: false, decisao: null };
    };
    await Promise.all([0, 1, 2, 3].map(async () => { while (prox < lido.cheques.length) { const k = prox; prox += 1; await umCheque(k); } }));
    const fat = await carregarFaturas(itens);
    if (!fat.ok) return { ok: false, motivo: 'fonte_faturas_indisponivel' };
    const noCx = await marcarNoCaixa(itens, unidadeId);
    if (!noCx.ok) return { ok: false, motivo: 'fonte_caixa_indisponivel' };
    // Os abertos são lidos DEPOIS da leitura (20–90 s): outro envio pode ter
    // aberto card enquanto este lia.
    decidirTodos(itens, typeof abertos === 'function' ? abertos() : abertos);
    log({ acao: 'cheques_lote_decidido', unidade: sigla, lidos: itens.length, decisoes: itens.map((it) => it.decisao) });
    return { ok: true, itens, loteData, sigla, unidadeNome, semCheque: lista.length > 1 ? semCheque : [] };
  }

  // ---- foto de cheque sem legenda e álbum (D6 da auditoria, caso Recreio 21/09) ----
  // A foto do WhatsApp não tem nome de arquivo e, no álbum, só a 1ª leva legenda.
  // • legenda de malote OU texto da foto com cara FORTE de cheque (linha CMC-7, ou
  //   "pague por este cheque" + "a quantia de"/"à sua ordem") → fluxo de cheques;
  // • cara FRACA (só a palavra "cheque", ou um marcador) → PERGUNTA, sem lançar;
  // • nada → segue o caminho de comprovante de sempre.
  // Fotos do mesmo autor em sequência (álbum) viram UM lote: espera `albumMs` sem
  // foto nova. Nada disso lança: o lançamento continua sendo o card + "pode".
  const albumMs = Number(process.env.SOL_CHEQUES_ALBUM_MS || albumMsOpt || 12000);
  const albuns = new Map();  // chat|autor -> { arquivos, inicio, ultimo, fechado }
  const duvidas = new Map(); // chatId -> [{ ids, arquivos, evento, grupo, ts, autor }]
  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sol-chq-foto-'));
  function guardarCopia(arquivo) {
    const dst = path.join(tmpDir(), path.basename(arquivo));
    fs.copyFileSync(arquivo, dst);
    try { fs.unlinkSync(arquivo); } catch (_) { /* a ponte também limpa */ }
    return dst;
  }
  const apagar = (arqs) => { for (const a of arqs || []) { try { fs.rmSync(path.dirname(a).includes('sol-chq-foto-') ? path.dirname(a) : a, { recursive: true, force: true }); } catch (_) { /* melhor esforço */ } } };
  const autorDe = (event) => `${event.chatId}|${event.senderPhone || event.senderId || ''}`;
  function albumAberto(k) {
    const a = albuns.get(k);
    return a && !a.fechado && Date.now() - a.ultimo < albumMs ? a : null;
  }
  function duvidaDoAutor(event) {
    const k = autorDe(event);
    return (duvidas.get(event.chatId) || []).find((d) => d.autor === k && !d.resolvida && Date.now() - d.ultimo < albumMs) || null;
  }
  function limparDuvidas(chatId) {
    const vivas = [];
    for (const d of duvidas.get(chatId) || []) {
      if (!d.resolvida && agoraFn() - d.ts < 2 * 3600 * 1000) vivas.push(d); else if (!d.resolvida) apagar(d.arquivos);
    }
    duvidas.set(chatId, vivas);
    return vivas;
  }
  async function esperarAlbum(a) {
    while (Date.now() - a.ultimo < albumMs && Date.now() - a.inicio < 60000) {
      await new Promise((r) => setTimeout(r, Math.min(250, Math.max(10, albumMs - (Date.now() - a.ultimo)))));
    }
    a.fechado = true;
  }

  // Hook do caixa. Devolve null (não é lote / desligado) ou
  // { tratou, acao, itensCaixa? } — com itensCaixa o CAIXA abre o card de sempre.
  async function tratarMidia(event, grupo) {
    if (!event || !event.hasMedia || event._sintetico || event._chequesNao) return null;
    const cfg = configuracao();
    if (cfg.modo !== 'sombra' && cfg.modo !== 'grupo') return null;
    const arquivo = Array.isArray(event.mediaUrls) ? event.mediaUrls[0] : null;
    if (!arquivo || !fs.existsSync(arquivo)) return null;
    const sombra = cfg.modo === 'sombra';
    const imagem = ehImagem(event, arquivo);
    const kAutor = autorDe(event);
    if (imagem && !sombra) {
      // Irmã de álbum de cheques (ou de foto em dúvida) do mesmo autor: entra junto.
      const alb = albumAberto(kAutor);
      if (alb) { alb.arquivos.push(guardarCopia(arquivo)); alb.ultimo = Date.now(); return { tratou: true, acao: 'cheques_album_agrupado' }; }
      const duv = duvidaDoAutor(event);
      if (duv) { duv.arquivos.push(guardarCopia(arquivo)); duv.ultimo = Date.now(); duv.ids.push(event.messageId); return { tratou: true, acao: 'cheques_foto_duvida_agrupada' }; }
    }
    let porFoto = false;
    if (!pareceLoteCheques(event)) {
      if (!imagem || !caixa.ocr) return null;
      let texto = '';
      try { const o = await caixa.ocr(arquivo, { detailed: true }); texto = typeof o === 'string' ? o : String((o && o.text) || ''); } catch (_) { texto = ''; }
      const sinal = sinalChequeNoTexto(texto);
      if (!sinal) return null;
      if (sombra) { log({ acao: 'cheques_foto_detectada_sombra', chatId: event.chatId, sinal }); return null; }
      if (!fs.existsSync(arquivo)) return null;
      // Durante o OCR outra foto do autor pode ter aberto álbum/dúvida.
      const alb = albumAberto(kAutor);
      if (alb) { alb.arquivos.push(guardarCopia(arquivo)); alb.ultimo = Date.now(); return { tratou: true, acao: 'cheques_album_agrupado' }; }
      const duv0 = duvidaDoAutor(event);
      if (duv0) { duv0.arquivos.push(guardarCopia(arquivo)); duv0.ultimo = Date.now(); duv0.ids.push(event.messageId); return { tratou: true, acao: 'cheques_foto_duvida_agrupada' }; }
      if (sinal === 'fraco') {
        const d = { ids: [event.messageId], arquivos: [guardarCopia(arquivo)], grupo: { unidade_id: grupo.unidade_id, nome: grupo.nome },
          evento: { chatId: event.chatId, messageId: event.messageId, senderPhone: event.senderPhone || null, senderId: event.senderId || null,
            body: event.body || '', mediaType: event.mediaType || 'image', timestamp: event.timestamp || null, hasMedia: true },
          ts: agoraFn(), ultimo: Date.now(), autor: kAutor, resolvida: false };
        const vivas = limparDuvidas(event.chatId); vivas.push(d); duvidas.set(event.chatId, vivas);
        const q = await sendFn(event.chatId, '📷 Essa foto parece de *cheque*. É do malote/depósito? Responde citando esta mensagem: *malote* (eu leio o cheque e monto o card) ou *comprovante* (sigo como comprovante de pagamento). Nada foi lançado.');
        if (q) d.ids.push(q);
        log({ acao: 'cheques_foto_duvida', chatId: event.chatId });
        return { tratou: true, acao: 'cheques_foto_duvida' };
      }
      porFoto = true;
    }
    if (imagem && !sombra) {
      // Foto (com legenda de malote ou com cara forte de cheque): abre o álbum e
      // espera as irmãs antes de ler — um álbum = um lote = um card.
      const alb = { arquivos: [guardarCopia(arquivo)], inicio: Date.now(), ultimo: Date.now(), fechado: false };
      albuns.set(kAutor, alb);
      await esperarAlbum(alb);
      if (albuns.get(kAutor) === alb) albuns.delete(kAutor);
      log({ acao: 'cheques_album_fechado', chatId: event.chatId, fotos: alb.arquivos.length, por_foto: porFoto });
      return processarLote(event, grupo, alb.arquivos, cfg);
    }
    return processarLote(event, grupo, [arquivo], cfg);
  }

  // Lê um malote (PDF, foto ou álbum) e devolve o que o caixa precisa.
  async function processarLote(event, grupo, arquivos, cfg) {
    const arquivo = arquivos[0];
    const textoLote = `${event.body || ''} ${nomeOriginal(arquivo)}`;
    const sombra = cfg.modo === 'sombra';
    // 🔴 MESMO MALOTE DE NOVO (auditoria D1, 29/09). A leitura leva 20–90 s e a
    //    equipe reposta; outra pessoa posta o mesmo PDF. Cada envio abria um card
    //    com os mesmos ✅ e dois "pode" lançavam tudo em dobro. Agora:
    //    • mesmo ARQUIVO (sha256) com lote aberto → nem lê de novo, aponta o card;
    //    • mesmo CHEQUE (banco + número) num card aberto → ❓ neste envio;
    //    • cheque já gravado no caixa → ❓ (e o "pode" também confere: barrarNoPode).
    const hashes = arquivos.map(sha256Arquivo);
    const hash = hashes.every(Boolean) ? (hashes.length === 1 ? hashes[0] : crypto.createHash('sha256').update(hashes.join('|')).digest('hex')) : null;
    if (!sombra && hash) {
      const igual = abertosDoChat(event.chatId).find((a) => a.lote.hash === hash);
      if (igual) {
        for (const a of arquivos) { try { fs.unlinkSync(a); } catch (_) { /* a ponte também limpa */ } }
        apagar(arquivos);
        await sendFn(event.chatId, igual.lendo
          ? '🧾 Esse malote já está sendo lido — o card sai em instantes. Não abri outro.'
          : `🧾 Esse malote já está no card aberto das ${hhmm(igual.ts)}. Não abri outro card: responde *pode* citando aquele.`);
        log({ acao: 'cheques_lote_repetido', chatId: event.chatId, lendo: !!igual.lendo });
        return { tratou: true, acao: 'cheques_lote_repetido' };
      }
    }
    const lote = { msgIds: [], itens: [], loteData: null, sigla: null, unidadeNome: grupo.nome, ts: agoraFn(),
      origem: event.messageId, hash, estado: 'lendo', cards: [], pendenteCard: null };
    if (!sombra) {
      const arr0 = (lotes.get(event.chatId) || []).filter((x) => agoraFn() - x.ts < 6 * 3600 * 1000);
      arr0.push(lote);
      lotes.set(event.chatId, arr0);
    }
    let r;
    try {
      r = await processarArquivo({ arquivo, arquivos, unidadeId: grupo.unidade_id, unidadeNome: grupo.nome, textoLote, modelo: cfg.modelo,
        abertos: () => abertosDoChat(event.chatId, lote) });
    } finally {
      lote.estado = 'lido';
      for (const a of arquivos) { try { fs.unlinkSync(a); } catch (_) { /* a ponte também limpa */ } }
      apagar(arquivos);
    }
    if (!r.ok) {
      lote.descartado = true;
      const txt = `🧾 Recebi um lote de cheques, mas não consegui ler (${r.motivo}). Confere na mão, por favor.`;
      if (sombra) { if (cfg.sombraJid) await sendFn(cfg.sombraJid, '🧪 *SOMBRA* — ' + grupo.nome + '\n' + txt); }
      else await sendFn(event.chatId, txt);
      log({ acao: 'cheques_lote_falhou', motivo: r.motivo, modo: cfg.modo });
      return { tratou: true, acao: 'cheques_lote_falhou' };
    }
    const avisos = (r.semCheque || []).map((k) => `📷 Na foto ${k} não achei cheque — se for comprovante, reenvia com a legenda.`);
    if (arquivos.length > 1) avisos.unshift(`📷 Li ${arquivos.length} fotos como um malote só.`);
    const texto = montarMensagem({ unidadeNome: grupo.nome, loteData: r.loteData, itens: r.itens, sombra, avisos });
    if (sombra) {
      if (cfg.sombraJid) await sendFn(cfg.sombraJid, texto);
      log({ acao: 'cheques_lote_sombra', unidade: r.sigla, itens: r.itens.length });
      return { tratou: true, acao: 'cheques_lote_sombra' };
    }
    Object.assign(lote, { itens: r.itens, loteData: r.loteData, sigla: r.sigla });
    const lancaveis = r.itens.filter((it) => it.decisao === 'lancar');
    const itensCaixa = lancaveis.map(itemDoCaixa);
    // Tudo o que é confiável já está num card aberto: é o mesmo malote (outro
    // arquivo, mesmos cheques). Não repete a lista inteira nem abre card.
    const confiaveis = r.itens.filter((it) => it.cheque.confiavel);
    if (confiaveis.length && confiaveis.every((it) => it.decisao === 'ja_em_card')) {
      lote.descartado = true;
      const ts = confiaveis[0].cardAberto && confiaveis[0].cardAberto.ts;
      await sendFn(event.chatId, `🧾 Esses ${confiaveis.length} cheque${confiaveis.length === 1 ? '' : 's'} já estão no card aberto${ts ? ' das ' + hhmm(ts) : ''}. Não abri outro card: responde *pode* citando aquele.`);
      log({ acao: 'cheques_lote_repetido', chatId: event.chatId, por: 'cheques', itens: confiaveis.length });
      return { tratou: true, acao: 'cheques_lote_repetido' };
    }
    if (lancaveis.length) lote.pendenteCard = { chaves: new Set(lancaveis.map((it) => chaveCheque(it.cheque))), ts: agoraFn() };
    // Sem cheque lançável, a mensagem é só a lista: o módulo publica. Com cheque
    // lançável, o CAIXA publica esta mesma mensagem como card (preview V3), e
    // devolve o id por `vincularMensagem` para as respostas "N é da Fulana".
    if (!itensCaixa.length) {
      const id = await sendFn(event.chatId, texto);
      if (id) lote.msgIds.push(id);
      return { tratou: true, acao: 'cheques_lote_sem_lancavel' };
    }
    return { tratou: true, acao: 'cheques_lote_lido', itensCaixa, texto, lote };
  }

  // Resposta CITANDO a lista do lote: "1 é da Natalia". O nome volta à MESMA RPC
  // (caminho 'nome'); se agora o cheque vira `lancar`, o caixa abre o card dele.
  async function tratarResposta(event, { unidadeId } = {}) {
    if (!event || event.hasMedia || !event.quotedMessageId) return null;
    // Resposta à pergunta "essa foto é de cheque?" (ou citando a própria foto).
    const duv = limparDuvidas(event.chatId).find((d) => d.ids.includes(event.quotedMessageId));
    if (duv) {
      const t = norm(event.body).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const ehMalote = /\b(malote|deposito|cheques?)\b/.test(t) || controleDaResposta(t) === 'pode';
      const ehComprovante = /\bcomprovante\b/.test(t) || controleDaResposta(t) === 'nao';
      if (ehMalote === ehComprovante) {
        await sendFn(event.chatId, 'Não entendi: responde *malote* (é cheque do depósito) ou *comprovante* citando a minha pergunta.');
        return { tratou: true, acao: 'cheques_foto_duvida_repergunta' };
      }
      duv.resolvida = true;
      const cfg = configuracao();
      if (ehMalote) {
        log({ acao: 'cheques_foto_confirmada', chatId: event.chatId, fotos: duv.arquivos.length });
        return processarLote({ ...duv.evento, body: 'malote' }, duv.grupo, duv.arquivos, cfg);
      }
      log({ acao: 'cheques_foto_nao_e_cheque', chatId: event.chatId, fotos: duv.arquivos.length });
      if (duv.arquivos.length === 1) {
        // Volta ao caminho de comprovante de sempre, com a mesma foto.
        return { tratou: true, acao: 'cheques_foto_nao_e_cheque',
          reprocessar: { ...duv.evento, mediaUrls: [duv.arquivos[0]], _chequesNao: true } };
      }
      apagar(duv.arquivos);
      await sendFn(event.chatId, 'Ok, não trato como cheque. Como eram várias fotos, reenvia cada comprovante com a legenda (ex.: *comprovante pix R$ 300 - Fulano*).');
      return { tratou: true, acao: 'cheques_foto_nao_e_cheque' };
    }
    const arr = lotes.get(event.chatId) || [];
    const lote = arr.find((x) => (Array.isArray(x.msgIds) && x.msgIds.includes(event.quotedMessageId)) || x.origem === event.quotedMessageId);
    if (!lote) return null;
    const txt = String(event.body || '').trim();
    const temCard = (lote.cards || []).length > 0 || !!lote.pendenteCard;
    // 🔴 DECISÃO NÃO É NOME (auditoria D2, 29/09). "não", "cancela", "sim",
    //    "ok, pode" citando o card viravam nome de aluno quando havia 1 cheque ❓:
    //    o "não" não descartava, o "sim" não aprovava e a equipe achava que sim.
    //    • com card: a decisão vai ao CAIXA (ele aprova ou descarta o card citado);
    //    • sem card (lista só com ⚠️/❓): nada a aprovar — o módulo responde,
    //      e o "não" não cai na regra "a única pendência do chat" do caixa.
    const ctl = controleDaResposta(txt);
    if (ctl) {
      // "cancela/descarta…" citando card o caixa lê como pedido de ESTORNO de um
      // lançamento ("preciso saber qual lançamento") — o card fica vivo e a equipe
      // acha que cancelou. Aqui a Sol pergunta; o "não" citando o card descarta.
      if (temCard && ctl === 'nao' && !/^(nao|n)$/.test(norm(txt).replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0])) {
        await sendFn(event.chatId, 'Quer descartar esse card de cheques? Responde *não* citando o card e eu descarto — nada foi lançado.');
        log({ acao: 'cheques_cancelar_pergunta', chatId: event.chatId });
        return { tratou: true, acao: 'cheques_cancelar_pergunta' };
      }
      if (temCard) return null;
      if (ctl === 'nao') {
        lote.descartado = true;
        await sendFn(event.chatId, 'Ok. Esse lote não tem nenhum cheque indo para o caixa, então não há card para descartar — nada foi lançado.');
        log({ acao: 'cheques_lote_descartado_sem_card', chatId: event.chatId });
        return { tratou: true, acao: 'cheques_lote_descartado_sem_card' };
      }
      await sendFn(event.chatId, 'Esse lote não tem cheque pronto para o caixa, então não há o que aprovar — nada foi lançado. Para um ❓, responde citando a lista: *N é da Fulana*.');
      log({ acao: 'cheques_pode_sem_card', chatId: event.chatId });
      return { tratou: true, acao: 'cheques_pode_sem_card' };
    }
    // "3 foi cheque" / "3 foi pix" citando a lista: confirma a forma de uma parcela
    // paga sem forma registrada (D4). Só vale para cheque em 'forma_indefinida'.
    const mForma = txt.match(/^\s*(?:cheque\s*)?(\d{1,2})\s*[-:–)]?\s*(?:foi|e|é|eh|era)?\s*(?:pag[oa]\s*)?(?:em|no|na|de|por|via|com)?\s*(cheque|pix|cart[aã]o|dinheiro|transfer[eê]ncia|boleto|d[eé]bito|cr[eé]dito)\b/i);
    if (mForma) {
      const n = Number(mForma[1]);
      const it = lote.itens[n - 1];
      if (!it || it.decisao !== 'forma_indefinida') {
        await sendFn(event.chatId, `O cheque ${n} não está esperando confirmação de forma. Nada mudou.`);
        return { tratou: true, acao: 'cheques_forma_indice_invalido' };
      }
      it.formaConfirmada = /cheque/i.test(mForma[2]) ? 'cheque' : norm(mForma[2]).replace(/^cart.*/, 'cartão');
      it.decisao = decidirCheque(it, it.fatura, it.jaLigada, hojeBRT(agoraFn()));
      if (it.decisao === 'lancar' && lote.itens.some((x) => x !== it && x.decisao === 'lancar' && x.fatura && x.fatura.id === it.fatura.id)) it.decisao = 'sem_parcela';
      log({ acao: 'cheques_forma_confirmada', indice: n, forma: it.formaConfirmada, decisao: it.decisao });
      const textoAtual = montarMensagem({ unidadeNome: lote.unidadeNome, loteData: lote.loteData, itens: [it], indices: [n - 1],
        cabecalho: `🧾 *Cheque ${n} — forma confirmada — ${lote.unidadeNome}*` });
      if (it.decisao === 'lancar') {
        lote.pendenteCard = { chaves: new Set([chaveCheque(it.cheque)]), ts: agoraFn() };
        return { tratou: true, acao: 'cheques_forma_confirmada', itensCaixa: [itemDoCaixa(it)], texto: textoAtual, lote };
      }
      const msg = await sendFn(event.chatId, textoAtual);
      if (msg) lote.msgIds.push(msg);
      return { tratou: true, acao: 'cheques_forma_confirmada' };
    }
    const pend = lote.itens.map((it, i) => ({ it, i })).filter((x) => x.it.decisao === 'sem_parcela' && x.it.cheque.confiavel);
    let alvo = null; let resto = txt; let rotulado = false;
    const mIdx = txt.match(/^\s*(?:cheque\s*)?(\d{1,2}|[①②③④⑤⑥⑦⑧⑨⑩])\s*[-:–)]?\s*/i);
    if (mIdx) {
      const n = /\d/.test(mIdx[1]) ? Number(mIdx[1]) : CIRC.indexOf(mIdx[1]) + 1;
      resto = txt.slice(mIdx[0].length);
      if (!(n >= 1 && n <= lote.itens.length)) return null;
      alvo = pend.find((x) => x.i + 1 === n) || null;
      if (!alvo) {
        // Índice explícito de cheque que não espera nome: responder, não deixar o
        // caixa ler a frase como correção do card inteiro.
        await sendFn(event.chatId, `O cheque ${n} não está esperando identificação${lote.itens[n - 1] && lote.itens[n - 1].decisao === 'lancar' ? ' — ele já está no card' : ''}. Nada mudou.`);
        return { tratou: true, acao: 'cheques_identificacao_indice_invalido' };
      }
    } else if (pend.length === 1) alvo = pend[0];
    else return null;
    if (!pend.length) return null;
    const semRotulo = resto.replace(/^(e|é|eh)\s+/i, '');
    rotulado = semRotulo !== resto || /^(d[aoe]s?)\s+/i.test(semRotulo);
    const nome = semRotulo.replace(/^(d[aoe]s?)\s+/i, '').replace(/[.!?]+$/, '').trim();
    // Sem índice e sem "é da/do", só vale texto que PAREÇA nome (duas palavras de letras).
    if (!mIdx && !rotulado && !/^[a-zà-ú'’-]{2,}(\s+[a-zà-ú'’-]{2,})+$/i.test(nome)) return null;
    if (nome.length < 3 || /\d/.test(nome) || controleDaResposta(nome)) return null;
    const it = alvo.it;
    let res = null;
    try {
      res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: unidadeId, p_emitente_nome: nome,
        p_valor: it.cheque.valor, p_bom_para: it.cheque.bom_para, p_emitente_documento_hash: null });
    } catch (_) { res = null; }
    const esc = escolherFatura(res, it.cheque, lote.loteData);
    if (!esc.fatura) {
      await sendFn(event.chatId, `❓ Não achei uma parcela única de "${nome}" para o cheque ${alvo.i + 1}. Manda o nome completo do aluno.`);
      return { tratou: true, acao: 'cheques_identificacao_sem_parcela' };
    }
    it.escolha = esc;
    const fat = await carregarFaturas([it]);
    if (!fat.ok) {
      await sendFn(event.chatId, '⚠️ Achei a parcela, mas não consegui conferir a fatura agora. Tenta de novo em instantes.');
      return { tratou: true, acao: 'cheques_identificacao_fonte' };
    }
    it.decisao = decidirCheque(it, it.fatura, it.jaLigada, hojeBRT(agoraFn()));
    if (it.decisao === 'lancar' && lote.itens.some((x) => x !== it && x.decisao === 'lancar' && x.fatura && x.fatura.id === it.fatura.id)) it.decisao = 'sem_parcela';
    log({ acao: 'cheques_identificacao', indice: alvo.i + 1, decisao: it.decisao });
    const textoAtual = montarMensagem({ unidadeNome: lote.unidadeNome, loteData: lote.loteData, itens: [it], indices: [alvo.i],
      cabecalho: `🧾 *Cheque ${alvo.i + 1} identificado — ${lote.unidadeNome}*` });
    if (it.decisao === 'lancar') {
      lote.pendenteCard = { chaves: new Set([chaveCheque(it.cheque)]), ts: agoraFn() };
      return { tratou: true, acao: 'cheques_identificacao', itensCaixa: [itemDoCaixa(it)], texto: textoAtual, lote };
    }
    const msg = await sendFn(event.chatId, textoAtual);
    if (msg) lote.msgIds.push(msg);
    return { tratou: true, acao: 'cheques_identificacao' };
  }

  // O caixa publicou a mensagem do lote como card: guarda o id para as respostas.
  // A partir daqui os cheques do card contam como "em card aberto" enquanto o caixa
  // disser que o card vive (D1).
  function vincularMensagem(lote, msgId) {
    if (lote && msgId && Array.isArray(lote.msgIds)) lote.msgIds.push(msgId);
    if (lote && msgId && lote.pendenteCard) {
      (lote.cards = lote.cards || []).push({ id: msgId, chaves: lote.pendenteCard.chaves, ts: agoraFn() });
      lote.pendenteCard = null;
    }
  }

  // 🔴 "pode" em card de cheque: número + banco já no caixa barra o lançamento
  //    (lote ou simples), com mensagem clara. É a segunda barreira do D1: vale
  //    mesmo que dois cards do mesmo cheque tenham escapado da primeira. A trava
  //    definitiva é no banco (supabase/migration-drafts/…trava_cheque…, gate humano).
  //    Devolve null (segue o "pode") ou { acao } (já respondeu, não lança).
  async function barrarNoPode(alvo, chatId) {
    if (!alvo || String(alvo.forma || '').toLowerCase() !== 'cheque') return null;
    const itens = Array.isArray(alvo.itens) && alvo.itens.length ? alvo.itens : [alvo];
    const ch = itens.filter((i) => i && i.cheque_numero && i.cheque_banco).map((i) => ({ numero: String(i.cheque_numero), banco: String(i.cheque_banco) }));
    if (!ch.length) return null;
    let r = null;
    try { r = await chequesNoCaixa(alvo.unidade_id, ch); } catch (_) { r = null; }
    if (!r || !r.ok) {
      await sendFn(chatId, '⚠️ Não lancei: não consegui conferir agora se esses cheques já estão no caixa. Nada foi lançado; responde *pode* de novo em instantes.');
      log({ acao: 'pode_cheque_conferencia_indisponivel', chatId });
      return { acao: 'pode_cheque_conferencia_indisponivel' };
    }
    if (!r.achados.length) return null;
    const lista = r.achados.map((a) => `• ${BANCOS[a.banco] || 'Banco ' + a.banco} nº ${a.numero}${a.data ? ' — lançado em ' + ddmm(a.data) : ''}`).join('\n');
    await sendFn(chatId, `⚠️ Não lancei: ${r.achados.length === 1 ? 'este cheque já está' : 'estes cheques já estão'} no caixa:\n${lista}\n`
      + '_Nada deste card foi lançado — o mesmo cheque não entra duas vezes._ Se algum foi estornado e precisa entrar de novo, reenvia o malote sem os que já entraram.');
    log({ acao: 'pode_bloqueado_cheque_duplicado', chatId, cheques: r.achados.length });
    return { acao: 'pode_bloqueado_cheque_duplicado' };
  }

  function ligarCaixa({ cardAberto, ocr } = {}) {
    if (typeof cardAberto === 'function') caixa.cardAberto = cardAberto;
    if (typeof ocr === 'function') caixa.ocr = ocr;
  }

  return { tratarMidia, tratarResposta, processarArquivo, vincularMensagem, barrarNoPode, ligarCaixa };
}

module.exports = {
  criarCheques, pareceLoteCheques, dataDoLote, dvMod10, lerCmc7, extensoParaNumero,
  normalizarCheque, escolherFatura, decidirCheque, valorDoBanco, itemDoCaixa, categoriaDaFatura, montarMensagem,
  blocoCheque, nomeBonito, nomeOriginal, chaveCheque, sinalChequeNoTexto, UNIDADE_SIGLA,
};
