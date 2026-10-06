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
  const liga = (env, arq) => (env != null && env !== '' ? env === '1' : arq === true);
  return {
    modo: String(process.env.SOL_CHEQUES_MODO || c.modo || 'off').toLowerCase(),
    sombraJid: process.env.SOL_CHEQUES_SOMBRA_JID || c.sombra_jid || null,
    modelo: process.env.SOL_CHEQUES_VISAO_MODELO || c.modelo || 'gemini-3.8-flash',
    // CONVERSA SOBRE O LOTE PELO AGENTE (06/10/2026). Ligado: o que a equipe fala
    // sobre o lote aberto vai ao agente, que age pelas ferramentas `cheques_*`;
    // desligado: o atalho antigo ("3 é da Fulana" citando a lista) segue valendo.
    agente: liga(process.env.SOL_CHEQUES_AGENTE, c.agente),
    // 1 cheque → N faturas DENTRO do card do lote exige a migration
    // 20261006200000 (validador do lote aceita `fatura_ids`). Desligado, o cheque
    // de irmãos sai num card próprio (lançamento simples já aceita `fatura_ids`).
    loteMultiFatura: liga(process.env.SOL_CHEQUES_LOTE_MULTI_FATURA, c.lote_multi_fatura),
    // Arquivo onde o lote aberto sobrevive a reinício da ponte (06/10/2026). Sem
    // ele, o lote vive só em memória (comportamento antigo).
    estadoArquivo: process.env.SOL_CHEQUES_ESTADO_ARQUIVO || c.estado_arquivo || null,
  };
}

// Número de cheque digitado pela equipe × lido: "SA000170", "170" e "000170" são o
// mesmo cheque (prefixo de série e zeros à esquerda não contam).
function numeroEquivalente(a, b) {
  const x = digitos(a).replace(/^0+/, ''); const y = digitos(b).replace(/^0+/, '');
  return !!x && x === y;
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
    // O que cada fonte leu, separado: é contra isto que a confirmação humana é
    // conferida (cheques_confirmar_leitura). Nunca a CMC-7 inteira.
    leituras: {
      numero_impresso: digitos(raw && raw.numero) || null,
      numero_cmc7: cmc.numero || null,
      cmc7_valida: !!cmc.ok,
      valor_numerico: valor > 0 ? Math.round(valor * 100) / 100 : null,
      valor_extenso: ext,
    },
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
// 🔴 VALOR DA PARCELA NA DATA DO CHEQUE, NÃO DE HOJE (CG 06/10/2026). Famílias pagam
//    todo mês com cheque pré-datado para o dia do vencimento, no valor COM o desconto
//    de pontualidade (R$ 387 de uma parcela de R$ 447). O malote chega ao grupo dias
//    depois; com a régua de "hoje" a parcela já estava vencida (R$ 447) e a Sol
//    recusava um cheque certo. A data de referência é o bom-para ou a data do
//    depósito (a que vier), nunca depois de hoje.
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
function dataRefCheque(ch, hoje) {
  const r = ch && (ISO_DIA.test(String(ch.bom_para || '')) ? ch.bom_para : (ISO_DIA.test(String(ch.dataRef || '')) ? ch.dataRef : null));
  return r && r < hoje ? r : hoje;
}
// Só a data do cheque ATÉ o vencimento muda o valor (vale o desconto). Cheque de
// depois do vencimento segue a régua de hoje (vencida, com multa/juros), como antes.
function valorParaCheque(f, ref, hoje, valorCheque = null) {
  const venc = f && f.data_vencimento ? String(f.data_vencimento).slice(0, 10) : null;
  const naData = ref && ref < hoje && venc && ref <= venc ? valorDoBanco(f, ref) : null;
  const deHoje = valorDoBanco(f, hoje);
  // O cheque pode ter vindo com o valor de hoje (com multa) — vale também.
  if (naData && valorCheque != null && deHoje && Math.abs(Number(deHoje.valor) - Number(valorCheque)) <= 0.01
      && Math.abs(Number(naData.valor) - Number(valorCheque)) > 0.01) return deHoje;
  return naData || deHoje;
}
// Parcela já paga em cheque só casa com o cheque do malote se foi registrada perto
// da data dele: as dos meses anteriores (mesmo valor, mesmo pré-datado) são de
// malotes que já passaram e empatavam com a certa ("mais de uma parcela", CG 06/10).
const JANELA_PAGA_EM_CHEQUE_DIAS = 20;
function pagaLongeDoCheque(fatura, ref) {
  if (!fatura || String(fatura.status || '').toLowerCase() !== 'paga') return false;
  const d = fatura.data_pagamento ? String(fatura.data_pagamento).slice(0, 10) : null;
  return !!(d && ref && dias(d, ref) > JANELA_PAGA_EM_CHEQUE_DIAS);
}
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
//   conferencia  — a equipe disse que esse cheque é só para conferir (não lança).
function decidirCheque(it, fatura, jaLigada, hoje = hojeBRT()) {
  if (it.soConferencia) return 'conferencia';
  if (!it.cheque.confiavel) return 'leitura';
  if (it.chequeNoCaixa) return 'ja_no_caixa';
  if (Array.isArray(it.multi) && it.multi.length) return decidirMulti(it, hoje);
  if (!it.escolha.fatura || !fatura) return 'sem_parcela';
  if (jaLigada) return 'ja_no_caixa';
  const situ = situacaoDaFatura(fatura, it.formaConfirmada);
  if (situ) return situ;
  const vb = valorParaCheque(fatura, dataRefCheque(it.cheque, hoje), hoje, it.cheque.valor);
  it.valorBanco = vb;
  if (!vb || !(vb.valor > 0) || Math.abs(vb.valor - Number(it.cheque.valor)) > 0.01) return 'valor';
  return 'lancar';
}

// Parcela que não pode receber este cheque: cancelada / paga por outra forma
// (retirar) ou paga sem forma registrada (forma_indefinida). null = pode.
// 🔴 PAGA SEM FORMA NÃO É "PAGA EM CHEQUE" (auditoria D4, 29/09). Baixa manual ou
//    payload antigo deixam a forma vazia; se foi Pix/cartão, o cheque tem de voltar
//    ao cliente, e lançá-lo dobraria a receita. Sem forma, a equipe confirma.
function situacaoDaFatura(fatura, formaConfirmada) {
  if (fatura.status === 'cancelada') return 'retirar';
  if (fatura.status === 'paga' && String(fatura.forma || '').trim() && !/cheque/i.test(fatura.forma)) return 'retirar';
  if (fatura.status === 'paga' && !String(fatura.forma || '').trim()) {
    if (formaConfirmada && formaConfirmada !== 'cheque') return 'retirar';
    if (formaConfirmada !== 'cheque') return 'forma_indefinida';
  }
  return null;
}

// 🔴 UM CHEQUE, VÁRIAS PARCELAS (Recreio 06/10: um cheque de irmãos pagando as duas
//    mensalidades). Cada parcela passa pela mesma régua do cheque de uma parcela, e a
//    SOMA dos valores do banco tem de bater no centavo com o cheque.
function decidirMulti(it, hoje) {
  let soma = 0;
  for (const m of it.multi) {
    if (!m.fatura) return 'sem_parcela';
    if (m.jaLigada) return 'ja_no_caixa';
    const situ = situacaoDaFatura(m.fatura, it.formaConfirmada);
    if (situ) return situ;
    m.valorBanco = valorParaCheque(m.fatura, dataRefCheque(it.cheque, hoje), hoje);
    if (!m.valorBanco || !(m.valorBanco.valor > 0)) return 'valor';
    soma += m.valorBanco.valor;
  }
  return Math.abs(r2(soma) - Number(it.cheque.valor)) > 0.01 ? 'valor' : 'lancar';
}

const complementoCheque = (it) => `cheque ${BANCOS[it.cheque.banco] || 'banco ' + it.cheque.banco} nº ${it.cheque.numero}`;

// O cheque no formato do caixa. UM cheque = UMA movimentação: com várias parcelas
// (irmãos), a movimentação é uma só, do valor do cheque, ligada às N faturas
// (`fatura_ids` → caixa_movimentacao_faturas). Duas movimentações com o mesmo número
// quebrariam o Super Folha: ele casa o depósito por número E valor (06/10/2026).
function itemDoCaixa(it) {
  if (Array.isArray(it.multi) && it.multi.length) {
    const fs0 = it.multi.map((m) => m.fatura);
    const alunos = [...new Set(it.multi.map((m) => m.cand.aluno_nome).filter(Boolean))];
    const resp = [...new Set(it.multi.map((m) => m.cand.responsavel_nome).filter(Boolean))];
    const comps = fs0.map((f) => f.competencia).filter(Boolean).sort();
    return {
      aluno_nome: alunos[0] || null, alunos, responsavel_financeiro: resp.length === 1 ? resp[0] : null,
      valor: Number(it.cheque.valor), categoria: categoriaDaFatura(fs0[0].descricao),
      competencia: mmYYYY(comps[comps.length - 1]), canonical_fatura_id: null,
      fatura_ids: fs0.map((f) => f.id),
      faturas: fs0.map((f) => ({ canonical_fatura_id: f.id, descricao: f.descricao, competencia: f.competencia, status: f.status })),
      descricao: it.multi.map((m) => `${m.fatura.descricao || 'Parcela'} - ${m.cand.aluno_nome || ''}`.trim()).join(' · ').slice(0, 240),
      sem_vinculo_fatura: false, declarado_pelo_humano: false,
      complemento_descricao: complementoCheque(it),
      cheque_numero: it.cheque.numero || null,
      cheque_banco: it.cheque.banco || null,
      cheque_bom_para: it.cheque.bom_para || null,
      cheque_data_ref: dataRefCheque(it.cheque, hojeBRT()),
    };
  }
  const f = it.fatura; const esc = it.escolha.fatura;
  return {
    aluno_nome: esc.aluno_nome, responsavel_financeiro: esc.responsavel_nome || null,
    valor: Number(it.cheque.valor), categoria: categoriaDaFatura(f.descricao),
    competencia: mmYYYY(f.competencia), canonical_fatura_id: f.id, descricao: f.descricao || null,
    fatura: { canonical_fatura_id: f.id, descricao: f.descricao, competencia: f.competencia, status: f.status,
      data_pagamento: f.data_pagamento, valor_pago: f.valor_pago },
    sem_vinculo_fatura: false, declarado_pelo_humano: false,
    complemento_descricao: complementoCheque(it),
    // Estruturado para o Super Folha (27/09): as colunas cheque_* da
    // movimentação substituem o parse da descrição; ela fica só de reserva.
    cheque_numero: it.cheque.numero || null,
    cheque_banco: it.cheque.banco || null,
    cheque_bom_para: it.cheque.bom_para || null,
    cheque_data_ref: dataRefCheque(it.cheque, hojeBRT()),
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
  const multi = Array.isArray(it.multi) && it.multi.length ? it.multi : null;
  if (multi) {
    l.push(`🎓 Alunos: ${[...new Set(multi.map((m) => m.cand.aluno_nome).filter(Boolean))].join(' e ')}`);
    const resp = [...new Set(multi.map((m) => m.cand.responsavel_nome).filter(Boolean))];
    if (resp.length) l.push(`👤 Resp. financeiro: ${resp.join(' / ')}`);
    for (const m of multi) {
      l.push(`📄 ${m.fatura ? m.fatura.descricao : 'Parcela'} (${m.cand.aluno_nome || '?'})${m.valorBanco && m.valorBanco.valor ? ' — ' + fmtBRL(m.valorBanco.valor) : ''}`);
    }
  } else {
    if (esc && esc.aluno_nome) l.push(`🎓 Aluno: ${esc.aluno_nome}`);
    if (esc && esc.responsavel_nome) l.push(`👤 Resp. financeiro: ${esc.responsavel_nome}`);
    if (f && f.descricao) l.push(`📄 ${f.descricao}`);
  }
  if (ch.confirmadoPor) l.push(`👁️ Número e valor conferidos por ${ch.confirmadoPor}`);
  if (it.atribuidoPor) l.push(`🗣️ Dono informado por ${it.atribuidoPor}`);
  const d = it.decisao;
  if (d === 'lancar' && multi) {
    l.push(`💳 Um cheque só para ${multi.length} parcelas — soma ${fmtBRL(ch.valor)} — ✅ confere`);
  } else if (d === 'conferencia') {
    l.push('📋 Só para conferência — não vai para o caixa.');
  } else if (d === 'lancar') {
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
  } else if (d === 'valor' && multi) {
    const soma = r2(multi.reduce((s, m) => s + Number((m.valorBanco && m.valorBanco.valor) || 0), 0));
    l.push(`⚠️ O cheque é de ${fmtBRL(ch.valor)} e as parcelas somam ${fmtBRL(soma)} hoje no Emusys — confere antes.`);
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
    const lt = ch.leituras || {};
    const vi = [];
    if (lt.numero_impresso && lt.numero_cmc7 && !numeroEquivalente(lt.numero_impresso, lt.numero_cmc7)) {
      vi.push(`nº ${lt.numero_impresso} no papel e ${lt.numero_cmc7} na linha de baixo`);
    }
    if (lt.valor_numerico && lt.valor_extenso && Math.abs(lt.valor_numerico - lt.valor_extenso) >= 0.01) {
      vi.push(`${fmtBRL(lt.valor_numerico)} em número e ${fmtBRL(lt.valor_extenso)} por extenso`);
    }
    if (vi.length) l.push(`   Li ${vi.join('; ')}.`);
    l.push('   Me confirma o número e o valor que estão no cheque.');
  } else {
    const sug = it.escolha.suspeitos || [];
    if (Array.isArray(it.conflito) && it.conflito.length) l.push(`🔎 Este cheque e o cheque ${it.conflito.join(' e o ')} apontam para a mesma parcela — me diz qual é qual.`);
    else if (it.escolha.motivo === 'empate') l.push('🔎 Achei mais de uma parcela possível para esse emitente.');
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
  { chave: 'conferencia', titulo: '📋 *SÓ CONFERÊNCIA*', decisoes: ['conferencia'] },
];

// A mensagem do lote É o card: com cheque ✅, o "pode" citando ESTA mensagem lança
// os ✅ no caixa do dia; "3 é da Fulana" citando ESTA mensagem resolve um ❓.
// Hierarquia: cabeçalho → placar → uma seção por destino → um bloco por cheque.
// `agente`: a conversa sobre o lote vai ao agente (texto livre, sem fórmula).
function montarMensagem({ unidadeNome, loteData, itens, sombra = false, cabecalho = null, indices = null, avisos = [], agente = false, separados = null }) {
  const total = itens.reduce((s, it) => s + (Number(it.cheque.valor) || 0), 0);
  // `indices` preserva o número do cheque no lote quando a mensagem mostra só parte dele.
  const porSecao = SECOES.map((s) => ({ ...s, itens: itens.map((it, i) => ({ it, i: indices ? indices[i] : i })).filter((x) => s.decisoes.includes(x.it.decisao)) }));
  // `separados`: ✅ que saem num card próprio (o "pode" deste card não os lança).
  const lanc = porSecao[0].itens.filter((x) => !(separados && separados.has(x.i)));
  const totalLanc = lanc.reduce((s, x) => s + Number(x.it.cheque.valor), 0);
  const partes = [];
  if (sombra) partes.push('🧪 *SOMBRA* — nada foi postado no grupo e nada foi lançado.');
  partes.push([
    cabecalho || `🧾 *Lote de cheques — ${unidadeNome}*`,
    `📅 Depósito de ${ddmm(loteData)} · ${itens.length} cheque${itens.length === 1 ? '' : 's'} · ${fmtBRL(total)}`,
  ].join('\n'));
  const placar = [];
  const ok = porSecao[0].itens;
  if (ok.length) placar.push(`✅ ${ok.length} ${ok.length === 1 ? 'vai' : 'vão'} para o caixa — ${fmtBRL(ok.reduce((s, x) => s + Number(x.it.cheque.valor), 0))}`);
  if (porSecao[1].itens.length) placar.push(`⚠️ ${porSecao[1].itens.length} para retirar do malote`);
  if (porSecao[2].itens.length) placar.push(`❓ ${porSecao[2].itens.length} precisa${porSecao[2].itens.length === 1 ? '' : 'm'} de você`);
  if (porSecao[3].itens.length) placar.push(`📋 ${porSecao[3].itens.length} só para conferência`);
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
  if (!sombra && agente && porSecao[2].itens.length) {
    fim.push('❓ Para os que precisam de você, me conta citando esta mensagem, do seu jeito: de quem é cada cheque (pode ser mais de um aluno), o número e o valor certos, ou se é só para conferir.');
  } else if (!sombra && porSecao[2].itens.some((x) => x.it.decisao === 'sem_parcela')) {
    fim.push(`❓ Para os demais, responde citando esta mensagem: *${porSecao[2].itens.find((x) => x.it.decisao === 'sem_parcela').i + 1} é da Fulana*.`);
  }
  if (!sombra && !agente && porSecao[2].itens.some((x) => x.it.decisao === 'forma_indefinida')) {
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
// O LOTE vive mais que o CARD (06/10/2026). O card é um preview V3 e vence em 30 min
// (o banco recusa aprovação mais velha); o lote — leitura, decisões e o que a equipe
// já resolveu — vive o expediente. Conversa citando o lote vale enquanto ele vive, e
// o card é republicado a partir dele quando vence.
const LOTE_VIVO_MS = 14 * 3600 * 1000;

function sha256Arquivo(arquivo) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'); } catch (_) { return null; }
}

function criarCheques({ carregarEnv, sendFn, log = () => {}, lerLoteFn = lerLote, rpcFn = null, consultaFn = null, agoraFn = () => Date.now(), albumMs: albumMsOpt = null } = {}) {
  // chatId -> [{ msgIds, itens, loteData, sigla, unidadeNome, ts, origem, hash,
  //              estado: 'lendo'|'lido', pendenteCard: {chaves, ts}, cards: [{id, chaves, ts}] }]
  const lotes = new Map();
  // Ganchos do caixa (ligarCaixa): quem sabe se um card ainda aceita "pode".
  const caixa = { cardAberto: null, ocr: null };

  // 🔴 O LOTE SOBREVIVE A REINÍCIO (06/10/2026, Recreio/CG). O lote morava só em
  // memória: um deploy reiniciou a ponte e a Vitória, citando o card, ouviu "não há
  // lote aberto". Agora o estado dos lotes lidos vai para um arquivo do usuário sol
  // (0600) a cada mudança (verificado a cada 5 s) e volta no início. O documento do
  // emitente nunca é gravado (já virou hash antes; o replacer garante).
  const _repEstado = (k, v) => (k === 'documento' ? undefined : (v instanceof Set ? { __set: [...v] } : v));
  const _revEstado = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.__set) && Object.keys(v).length === 1 ? new Set(v.__set) : v);
  let _estadoSalvo = null;
  function salvarEstado() {
    const arq = configuracao().estadoArquivo;
    if (!arq) return false;
    try {
      const ag = agoraFn(); const obj = {};
      for (const [chat, arr] of lotes) {
        const vivos = (arr || []).filter((l) => l && l.estado === 'lido' && !l.descartado && ag - l.ts < LOTE_VIVO_MS);
        if (vivos.length) obj[chat] = vivos;
      }
      const txt = JSON.stringify({ v: 1, lotes: obj }, _repEstado);
      if (txt === _estadoSalvo) return false;
      const tmp = `${arq}.tmp`;
      fs.writeFileSync(tmp, txt, { mode: 0o600 });
      fs.renameSync(tmp, arq);
      _estadoSalvo = txt;
      return true;
    } catch (e) { log({ acao: 'cheques_estado_salvar_erro', erro: String(e && e.message) }); return false; }
  }
  (function carregarEstado() {
    const arq = configuracao().estadoArquivo;
    if (!arq) return;
    try {
      const d = JSON.parse(fs.readFileSync(arq, 'utf8'), _revEstado);
      const ag = agoraFn(); let n = 0;
      for (const [chat, arr] of Object.entries((d && d.lotes) || {})) {
        const vivos = (Array.isArray(arr) ? arr : []).filter((l) => l && ag - l.ts < LOTE_VIVO_MS);
        if (vivos.length) { lotes.set(chat, vivos); n += vivos.length; }
      }
      log({ acao: 'cheques_estado_carregado', lotes: n });
    } catch (e) { if (!e || e.code !== 'ENOENT') log({ acao: 'cheques_estado_carregar_erro', erro: String(e && e.message) }); }
  })();
  const _timerEstado = setInterval(salvarEstado, 5000);
  if (_timerEstado.unref) _timerEstado.unref();

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
  async function faturasPorIds(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return { ok: true, porId: new Map(), ligadas: new Set() };
    const lista = unicos.join(',');
    const fats = await consulta(`emusys_faturas?select=id,emusys_fatura_id,descricao,status,valor_pago,valor_original,desconto_fixo,desconto_condicional,competencia,data_pagamento,data_vencimento,forma:payload->>forma_pagamento_transacao&id=in.(${lista})`);
    const links = await consulta(`vw_caixa_movimentacao_fatura_links?select=fatura_id&fatura_id=in.(${lista})`);
    if (!Array.isArray(fats) || !Array.isArray(links)) return { ok: false };
    return { ok: true, porId: new Map(fats.map((f) => [f.id, f])), ligadas: new Set(links.map((l) => l.fatura_id)) };
  }

  async function carregarFaturas(itens) {
    const ids = [];
    for (const it of itens) {
      if (it.escolha.fatura) ids.push(it.escolha.fatura.la_report_fatura_id);
      for (const m of it.multi || []) ids.push(m.cand.la_report_fatura_id);
    }
    const r = await faturasPorIds(ids);
    if (!r.ok) return { ok: false };
    for (const it of itens) {
      const id = it.escolha.fatura && it.escolha.fatura.la_report_fatura_id;
      it.fatura = id ? r.porId.get(id) || null : null;
      it.jaLigada = !!(id && r.ligadas.has(id));
      for (const m of it.multi || []) {
        m.fatura = r.porId.get(m.cand.la_report_fatura_id) || null;
        m.jaLigada = r.ligadas.has(m.cand.la_report_fatura_id);
      }
    }
    return { ok: true };
  }

  // Combinações de parcelas que pagam o cheque: UMA parcela de cada grupo (um grupo
  // por aluno), faturas distintas, a soma dos valores do banco fechando no centavo.
  // Só parcela que pode receber cheque entra (não cancelada, não paga por outra
  // forma, não ligada ao caixa). `competencia` ("MM/AAAA") restringe; `mesmoMes`
  // exige o mesmo mês em todas (a combinação automática da família).
  function combinacoes(grupos, valor, { competencia = null, mesmoMes = false, hoje, ref = null } = {}) {
    const elegivel = (x) => x.fatura && !x.jaLigada && situacaoDaFatura(x.fatura, 'cheque') == null && !pagaLongeDoCheque(x.fatura, ref || hoje);
    const gs = grupos.map((g) => g.filter(elegivel)
      .filter((x) => !competencia || mmYYYY(x.fatura.competencia) === competencia));
    if (gs.some((g) => !g.length)) return [];
    const out = [];
    const passo = (k, acc, soma) => {
      if (out.length > 50) return;
      if (k === gs.length) {
        if (Math.abs(r2(soma) - Number(valor)) <= 0.01) out.push(acc.slice());
        return;
      }
      for (const x of gs[k]) {
        if (acc.some((a) => a.fatura.id === x.fatura.id)) continue;
        if (mesmoMes && acc.length && mmYYYY(acc[0].fatura.competencia) !== mmYYYY(x.fatura.competencia)) continue;
        const vb = valorParaCheque(x.fatura, ref || hoje, hoje);
        if (!vb || !(vb.valor > 0)) continue;
        acc.push(x); passo(k + 1, acc, soma + vb.valor); acc.pop();
      }
    };
    passo(0, [], 0);
    return out;
  }

  // Entre várias combinações, a de parcelas mais perto do bom-para/data do lote —
  // só se for ESTRITAMENTE a mais perto (mesma régua de escolherFatura).
  function maisProxima(combos, ref) {
    const dist = (c) => Math.max(...c.map((x) => {
      const d = x.fatura.status === 'paga' ? x.fatura.data_pagamento : x.fatura.data_vencimento;
      return d ? dias(String(d).slice(0, 10), ref) : Infinity;
    }));
    const ord = combos.map((c) => ({ c, d: dist(c) })).sort((a, b) => a.d - b.d);
    if (ord.length === 1 || (ord.length > 1 && ord[0].d < ord[1].d && ord[0].d <= 45)) return ord[0].c;
    return null;
  }

  // 🔴 IRMÃOS NUM CHEQUE SÓ, SEM PERGUNTAR (Recreio 06/10, cheque de R$ 800 da mãe de
  //    dois alunos: a Sol disse "mais de uma parcela possível"). Emitente RESOLVIDO
  //    (documento ou nome) com parcelas de 2+ alunos empatadas: se existir UMA ÚNICA
  //    combinação de uma parcela por aluno, no mesmo mês, cuja soma fecha com o cheque,
  //    é ela. Mais de uma, ou nenhuma: continua ❓ — a Sol nunca escolhe entre duas.
  async function tentarFamilia(it, loteData, hoje) {
    if (!it.cheque.confiavel || !it.res || !it.res.emitente || !it.res.emitente.resolvido) return false;
    if (it.escolha.motivo !== 'empate') return false;
    const cands = (it.res.candidatas || []).filter((c) => c.la_report_fatura_id && c.aluno_nome);
    const porAluno = new Map();
    for (const c of cands) { const k = norm(c.aluno_nome); if (!porAluno.has(k)) porAluno.set(k, []); porAluno.get(k).push(c); }
    if (porAluno.size < 2 || porAluno.size > 4) return false;
    const r = await faturasPorIds(cands.map((c) => c.la_report_fatura_id));
    if (!r.ok) return false;
    const comFatura = (c) => ({ cand: c, fatura: r.porId.get(c.la_report_fatura_id) || null, jaLigada: r.ligadas.has(c.la_report_fatura_id) });
    const alunos = [...porAluno.values()];
    const todas = [];
    // Todos os subconjuntos de 2+ alunos (no máximo 4 alunos → 11 subconjuntos).
    for (let mask = 1; mask < (1 << alunos.length); mask += 1) {
      const sel = alunos.filter((_, i) => mask & (1 << i));
      if (sel.length < 2) continue;
      todas.push(...combinacoes(sel.map((g) => g.map(comFatura)), it.cheque.valor, { mesmoMes: true, hoje, ref: dataRefCheque(it.cheque, hoje) }));
    }
    // Irmãos pagam o MESMO valor todo mês: out+nov+dez fecham igual. Vale a mesma
    // régua da parcela única — a do mês ESTRITAMENTE mais perto do bom-para/lote
    // (medido com dado real em 06/10: sem isto, nunca havia combinação única).
    const escolhida = todas.length === 1 ? todas[0] : (todas.length > 1 ? maisProxima(todas, it.cheque.bom_para || loteData) : null);
    if (!escolhida) return false;
    it.multi = escolhida.map((x) => ({ cand: x.cand, fatura: x.fatura, jaLigada: x.jaLigada }));
    it.escolha = { fatura: escolhida[0].cand, motivo: 'familia_combinada', suspeitos: [] };
    return true;
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
    const idsDe = (it) => (Array.isArray(it.multi) && it.multi.length ? it.multi.map((m) => m.fatura && m.fatura.id) : [it.fatura && it.fatura.id]).filter(Boolean);
    const cont = new Map();
    for (const it of itens) it.conflito = null;
    for (const it of itens) if (it.decisao === 'lancar') for (const id of idsDe(it)) cont.set(id, (cont.get(id) || 0) + 1);
    const emConflito = itens.filter((it) => it.decisao === 'lancar' && idsDe(it).some((id) => cont.get(id) > 1));
    for (const it of emConflito) {
      it.conflito = emConflito.filter((x) => x !== it && idsDe(x).some((id) => idsDe(it).includes(id))).map((x) => itens.indexOf(x) + 1);
    }
    for (const it of emConflito) it.decisao = 'sem_parcela';
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

  // Lote ainda em conversa: lido, não descartado, do expediente, e com algo por
  // fazer (card vivo, ✅ esperando card, ou ❓ esperando a equipe).
  const PENDENTES_DE_GENTE = new Set(['sem_parcela', 'forma_indefinida', 'valor', 'leitura', 'lancar']);
  function loteVivo(l) {
    if (!l || l.descartado || l.estado !== 'lido' || agoraFn() - l.ts >= LOTE_VIVO_MS) return false;
    // Tudo marcado "só conferência" não mata o lote (Recreio 06/10: a Sol respondeu
    // "não há lote aberto" logo depois de marcar a conferência que a pessoa pediu).
    return (l.itens || []).some((it) => PENDENTES_DE_GENTE.has(it.decisao) || it.soConferencia);
  }
  function cardVivo(chatId, l) { return (l.cards || []).some((c) => cardAberto(chatId, c)); }

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
      if (cheque.documento) {
        try { docHash = await rpc('sol_cheque_documento_hash_v1', { p_documento: cheque.documento }); } catch (_) { docHash = null; }
        if (typeof docHash !== 'string' || !/^[0-9a-f]{64}$/.test(docHash)) docHash = null;
      }
      delete cheque.documento; // o documento em claro não sai daqui
      // Cheque de leitura NÃO provada também é resolvido (06/10): a decisão segue
      // ❓ "leitura", mas a família e as parcelas candidatas ficam prontas para
      // quando a equipe confirmar número e valor — sem reler o PDF.
      let res = null;
      if (cheque.valor > 0 || docHash || cheque.emitente_nome) {
        try {
          res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: unidadeId, p_emitente_nome: cheque.emitente_nome,
            p_valor: cheque.valor, p_bom_para: cheque.bom_para || loteData || null, p_emitente_documento_hash: docHash });
        } catch (_) { res = null; }
      }
      cheque.dataRef = loteData || null;
      itens[idx] = { cheque, docHash, res, escolha: escolherFatura(res, cheque, loteData), fatura: null, jaLigada: false, decisao: null, trilha: [] };
    };
    await Promise.all([0, 1, 2, 3].map(async () => { while (prox < lido.cheques.length) { const k = prox; prox += 1; await umCheque(k); } }));
    const hoje = hojeBRT(agoraFn());
    for (const it of itens) await tentarFamilia(it, loteData, hoje);
    const fat = await carregarFaturas(itens);
    if (!fat.ok) return { ok: false, motivo: 'fonte_faturas_indisponivel' };
    const noCx = await marcarNoCaixa(itens, unidadeId);
    if (!noCx.ok) return { ok: false, motivo: 'fonte_caixa_indisponivel' };
    // Os abertos são lidos DEPOIS da leitura (20–90 s): outro envio pode ter
    // aberto card enquanto este lia.
    for (const it of itens) it.cheque.dataRef = loteData || null;
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
      // 🔴 O CARD "SAIU DA JANELA" E A EQUIPE REENVIOU O PDF (CG 06/10, 3 envios no
      //    Recreio). O mesmo arquivo de hoje NÃO é relido (20–90 s de visão e o card
      //    inteiro repostado): a Sol confere o caixa de novo e republica o card do
      //    lote com tudo o que a equipe já resolveu na conversa.
      const conhecido = (lotes.get(event.chatId) || []).find((l) => l.hash === hash && loteVivo(l));
      if (conhecido) {
        for (const a of arquivos) { try { fs.unlinkSync(a); } catch (_) { /* a ponte também limpa */ } }
        apagar(arquivos);
        log({ acao: 'cheques_lote_reenviado_republica', chatId: event.chatId });
        return { tratou: true, acao: 'cheques_lote_republicado', republicar: conhecido,
          aviso: `🧾 Esse malote eu já li hoje às ${hhmm(conhecido.ts)} — não li de novo. Segue o card atualizado:` };
      }
    }
    const lote = { msgIds: [], itens: [], loteData: null, sigla: null, unidadeNome: grupo.nome, unidadeId: grupo.unidade_id, ts: agoraFn(),
      origem: event.messageId, hash, estado: 'lendo', cards: [], pendenteCard: null };
    if (!sombra) {
      const arr0 = (lotes.get(event.chatId) || []).filter((x) => agoraFn() - x.ts < LOTE_VIVO_MS);
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
    if (sombra) {
      const texto = montarMensagem({ unidadeNome: grupo.nome, loteData: r.loteData, itens: r.itens, sombra, avisos });
      if (cfg.sombraJid) await sendFn(cfg.sombraJid, texto);
      log({ acao: 'cheques_lote_sombra', unidade: r.sigla, itens: r.itens.length });
      return { tratou: true, acao: 'cheques_lote_sombra' };
    }
    Object.assign(lote, { itens: r.itens, loteData: r.loteData, sigla: r.sigla });
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
    const c = cartaoDoLote(lote, { avisos });
    if (c.chaves.size) lote.pendenteCard = { chaves: c.chaves, ts: agoraFn() };
    // Sem cheque lançável, a mensagem é só a lista: o módulo publica. Com cheque
    // lançável, o CAIXA publica esta mesma mensagem como card (preview V3), e
    // devolve o id por `vincularMensagem` para as respostas sobre o lote.
    if (!c.itensCaixa.length && !c.extras.length) {
      const id = await sendFn(event.chatId, c.texto);
      if (id) lote.msgIds.push(id);
      return { tratou: true, acao: 'cheques_lote_sem_lancavel' };
    }
    return { tratou: true, acao: 'cheques_lote_lido', itensCaixa: c.itensCaixa, texto: c.texto, extras: c.extras, lote };
  }

  // O card do lote a partir do ESTADO (leitura + o que a equipe já resolveu). Usado
  // na 1ª publicação e em toda republicação (ferramenta, reenvio do PDF, card vencido).
  //   itensCaixa/texto — o card principal (2+ itens = lote; 1 = simples);
  //   extras           — cheque de várias parcelas fora do lote, quando o banco ainda
  //                      não tem a migration do lote com `fatura_ids` (card próprio,
  //                      lançamento simples, que já liga as N faturas).
  function cartaoDoLote(lote, { avisos = [], cabecalho = null } = {}) {
    const cfg = configuracao();
    const lanc = lote.itens.map((it, i) => ({ it, i })).filter((x) => x.it.decisao === 'lancar');
    const separar = (x) => !cfg.loteMultiFatura && Array.isArray(x.it.multi) && x.it.multi.length
      && lanc.length > 1;
    const principais = lanc.filter((x) => !separar(x));
    const separados = lanc.filter(separar);
    const avisosFim = separados.map((x) => `➕ O cheque ${x.i + 1} paga ${x.it.multi.length} parcelas e vai num card separado, logo abaixo — responde *pode* nele também.`);
    const texto = montarMensagem({ unidadeNome: lote.unidadeNome, loteData: lote.loteData, itens: lote.itens, avisos: [...avisos, ...avisosFim],
      agente: cfg.agente, cabecalho, separados: new Set(separados.map((x) => x.i)) });
    const extras = separados.map((x) => ({
      itens: [itemDoCaixa(x.it)],
      chaves: new Set([chaveCheque(x.it.cheque)]),
      texto: montarMensagem({ unidadeNome: lote.unidadeNome, loteData: lote.loteData, itens: [x.it], indices: [x.i], agente: cfg.agente,
        cabecalho: `🧾 *Cheque ${x.i + 1} — um cheque para ${x.it.multi.length} parcelas — ${lote.unidadeNome}*` }),
    }));
    return { texto, itensCaixa: principais.map((x) => itemDoCaixa(x.it)),
      chaves: new Set(principais.map((x) => chaveCheque(x.it.cheque))), extras };
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
      // 🔴 "PODE" NUM CARD QUE JÁ VENCEU (CG 06/10: "o card saiu da janela" e a
      //    equipe reenviou o PDF). O preview V3 vence em 30 min e o banco recusa a
      //    aprovação; antes a Sol dizia "não havia card aguardando". Agora o card é
      //    republicado do estado do lote (sem reler) e o "pode" vai no novo — este
      //    "pode" não lança nada: aprovação é sempre do card que a pessoa VIU.
      if (temCard && ctl === 'pode' && !cardVivo(event.chatId, lote) && !lote.pendenteCard && loteVivo(lote)) {
        log({ acao: 'cheques_card_vencido_republica', chatId: event.chatId });
        return { tratou: true, acao: 'cheques_card_republicado', republicar: lote,
          aviso: '⏱️ Aquele card passou de 30 minutos e venceu — *nada foi lançado*. Este é o card atualizado: responde *pode* citando ele.' };
      }
      // "não" citando o card: o caixa descarta o card, e o LOTE sai de cena junto —
      // nem conversa, nem republicação por um "pode" posterior (bateria B-CHQ-04).
      if (temCard && ctl === 'nao') { lote.descartado = true; log({ acao: 'cheques_lote_descartado', chatId: event.chatId }); }
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
    // 🔴 AGENTE LIGADO: NADA DE ATALHO POR REGEX (06/10/2026). Com `agente`, a ponte
    //    manda a conversa sobre o lote ao agente ANTES de chegar aqui; se mesmo assim
    //    uma fala chegar (lote já fechado, rota antiga), o atalho "N é da Fulana" NÃO
    //    tenta adivinhar — ele foi o que respondeu "não entendi" à equipe de CG. A
    //    fala segue o caminho comum (a ponte não manda resposta genérica a quem cita
    //    lote; se a pessoa chamou a Sol, o agente responde com as consultas).
    //    Desligado o agente, o atalho abaixo é o fallback.
    if (configuracao().agente) {
      log({ acao: 'cheques_resposta_sem_atalho', chatId: event.chatId });
      return null;
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
        p_valor: it.cheque.valor, p_bom_para: it.cheque.bom_para || it.cheque.dataRef || null, p_emitente_documento_hash: null });
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
  // `chaves` explícitas: card extra do mesmo lote (cheque de várias parcelas).
  function vincularMensagem(lote, msgId, chaves = null) {
    if (lote && msgId && Array.isArray(lote.msgIds)) lote.msgIds.push(msgId);
    if (lote && msgId && chaves) {
      (lote.cards = lote.cards || []).push({ id: msgId, chaves, ts: agoraFn() });
    } else if (lote && msgId && lote.pendenteCard) {
      (lote.cards = lote.cards || []).push({ id: msgId, chaves: lote.pendenteCard.chaves, ts: agoraFn() });
      lote.pendenteCard = null;
    }
  }

  // O "pode" de um card de cheque gravou: os cheques dele saem da conversa.
  function registrarLancamento(chatId, previewId) {
    for (const l of lotes.get(chatId) || []) {
      const card = (l.cards || []).find((c) => c.id === previewId);
      if (!card) continue;
      for (const it of l.itens || []) {
        if (card.chaves.has(chaveCheque(it.cheque)) && it.decisao === 'lancar') {
          it.decisao = 'ja_no_caixa'; it.chequeNoCaixa = { data: hojeBRT(agoraFn()) };
        }
      }
      log({ acao: 'cheques_lote_lancamento_registrado', chatId });
    }
  }

  // ======================================================================
  // CONVERSA SOBRE O LOTE → AGENTE (06/10/2026, pedido do Alf: "quando a equipe
  // falar com ela, ela entenda e corrija; não fique com esse monte de regex").
  //
  // O que aconteceu: em CG a equipe respondeu ao card "Sol, o Cheque 2 é da X, o 5 é
  // do Y, o 6 é da Z" e levou "Não entendi essa — responde aluno: Nome Completo";
  // no Recreio a equipe digitou a lista inteira (número, valor, aluno) e a Sol não
  // a usou; um cheque de irmãos virou "mais de uma parcela possível". O atalho de
  // regex só entendia "N é da Fulana" citando a lista.
  //
  // Agora: o AGENTE interpreta a fala (qualquer formato) e age pelas ferramentas
  // `cheques_*`, no mesmo trilho das ferramentas do caixa (MCP → /caixa/tool →
  // executor na ponte). O CÓDIGO valida tudo o que importa — a parcela existe e é
  // daquele aluno pelo resolvedor do banco, a soma fecha no centavo, o número e o
  // valor confirmados são os que a visão leu (papel, CMC-7 ou extenso), o nome
  // aparece na fala da pessoa — e republica o card. Escrever no caixa continua
  // exigindo o "pode" humano citando o card (cofre V3). A leitura do PDF e a
  // decisão por fatura continuam determinísticas.
  // ======================================================================

  // Lote citado (qualquer mensagem do lote) ou, sem citação, o mais recente vivo.
  function loteDaConversa(chatId, quotedId = null) {
    const arr = (lotes.get(chatId) || []).filter((l) => loteVivo(l));
    if (quotedId) {
      const citado = arr.find((l) => (l.msgIds || []).includes(quotedId) || l.origem === quotedId);
      if (citado) return { lote: citado, citou: true };
    }
    return arr.length ? { lote: arr[arr.length - 1], citou: false } : null;
  }

  // A fala menciona o número de um cheque do lote (a lista digitada pela equipe).
  // Comparação de NÚMEROS, não leitura de frase: quem entende a frase é o agente.
  function falaCitaChequeDoLote(texto, lote) {
    const nums = String(texto || '').match(/\d{4,}/g) || [];
    return lote.itens.some((it) => nums.some((n) => [it.cheque.numero, it.cheque.leituras && it.cheque.leituras.numero_impresso,
      it.cheque.leituras && it.cheque.leituras.numero_cmc7].some((x) => x && numeroEquivalente(n, x))));
  }

  function resumoParaAgente(chatId, lote) {
    const cont = {};
    for (const it of lote.itens) cont[it.decisao] = (cont[it.decisao] || 0) + 1;
    const ab = (lote.cards || []).filter((c) => cardAberto(chatId, c));
    const partes = [`${lote.unidadeNome}`, `${lote.itens.length} cheques do depósito de ${ddmm(lote.loteData)}`];
    if (cont.lancar) partes.push(`${cont.lancar} prontos para o caixa (${ab.length ? 'card aberto' : 'card vencido — a ferramenta republica'})`);
    const voce = ['sem_parcela', 'forma_indefinida', 'valor', 'leitura'].reduce((s, d) => s + (cont[d] || 0), 0);
    if (voce) partes.push(`${voce} esperando a equipe`);
    return `${partes.join(' · ')}. Antes de responder sobre cheques, chame cheques_lote_estado.`;
  }

  // Decide se ESTA mensagem de texto é conversa sobre o lote (vai ao agente). Síncrono
  // e sem rede: a ponte pergunta antes de escolher a rota. "pode"/"não" NUNCA vêm
  // para cá: aprovação e descarte continuam no trilho determinístico.
  function conversa(event, { chamouASol = false } = {}) {
    const cfg = configuracao();
    if (cfg.modo !== 'grupo' || !cfg.agente) return null;
    if (!event || event.hasMedia || !String(event.body || '').trim()) return null;
    if (controleDaResposta(event.body)) return null;
    if (duvidas.size && (duvidas.get(event.chatId) || []).some((d) => d.ids.includes(event.quotedMessageId))) return null;
    const achado = loteDaConversa(event.chatId, event.quotedMessageId || null);
    if (!achado) return null;
    if (!achado.citou && !chamouASol && !falaCitaChequeDoLote(event.body, achado.lote)) return null;
    return { citou: achado.citou, resumo: resumoParaAgente(event.chatId, achado.lote) };
  }

  // Confere de novo no banco o que muda sozinho (fatura paga, cheque que entrou no
  // caixa por outro card) e redecide. Sem visão: nada é relido.
  async function redecidir(chatId, lote) {
    const fat = await carregarFaturas(lote.itens);
    if (!fat.ok) return { ok: false, motivo: 'fonte_faturas_indisponivel' };
    const noCx = await marcarNoCaixa(lote.itens, lote.unidadeId);
    if (!noCx.ok) return { ok: false, motivo: 'fonte_caixa_indisponivel' };
    for (const it of lote.itens) if (!it.cheque.dataRef) it.cheque.dataRef = lote.loteData || null;
    decidirTodos(lote.itens, abertosDoChat(chatId, lote));
    return { ok: true };
  }

  const ROTULO_DECISAO = {
    lancar: 'pronto para o caixa (falta o "pode" no card)', retirar: 'retirar do malote (parcela cancelada ou paga de outra forma)',
    ja_no_caixa: 'já está no caixa', valor: 'valor não bate com a parcela', sem_parcela: 'não sei de quem é',
    leitura: 'leitura não confirmada (número/valor)', forma_indefinida: 'parcela paga sem forma registrada',
    repetido: 'repetido no arquivo', ja_em_card: 'já está em outro card aberto', conferencia: 'só conferência',
  };

  function estadoParaAgente(chatId, lote) {
    const ab = (lote.cards || []).filter((c) => cardAberto(chatId, c));
    return {
      unidade: lote.unidadeNome, deposito: ddmm(lote.loteData), lido_as: hhmm(lote.ts),
      card: ab.length ? { aberto: true, desde: hhmm(ab[ab.length - 1].ts) } : { aberto: false },
      cheques: lote.itens.map((it, i) => {
        const ch = it.cheque; const lt = ch.leituras || {};
        const multi = Array.isArray(it.multi) && it.multi.length ? it.multi : null;
        const parcelas = multi
          ? multi.map((m) => ({ aluno: m.cand.aluno_nome, descricao: m.fatura && m.fatura.descricao, competencia: m.fatura && mmYYYY(m.fatura.competencia),
            valor_hoje: m.valorBanco && m.valorBanco.valor }))
          : (it.fatura ? [{ aluno: it.escolha.fatura && it.escolha.fatura.aluno_nome, descricao: it.fatura.descricao, competencia: mmYYYY(it.fatura.competencia),
            status: it.fatura.status, valor_hoje: (it.valorBanco && it.valorBanco.valor) || (valorDoBanco(it.fatura) || {}).valor || null }] : []);
        return {
          cheque: i + 1, situacao: it.decisao,
          situacao_explicada: Array.isArray(it.conflito) && it.conflito.length
            ? `aponta para a mesma parcela que o cheque ${it.conflito.join(' e ')} — pergunte qual é qual`
            : (ROTULO_DECISAO[it.decisao] || it.decisao),
          valor: ch.valor, banco: BANCOS[ch.banco] || ch.banco, numero: ch.numero, bom_para: ch.bom_para ? ddmm(ch.bom_para) : null,
          emitente: ch.emitente_nome ? nomeBonito(ch.emitente_nome) : null,
          leitura: ch.confiavel ? 'confirmada' : { problemas: ch.problemas, numero_no_papel: lt.numero_impresso, numero_na_linha_de_baixo: lt.numero_cmc7,
            valor_em_numero: lt.valor_numerico, valor_por_extenso: lt.valor_extenso },
          responsavel: multi ? null : (it.escolha.fatura && it.escolha.fatura.responsavel_nome) || null,
          parcelas,
          familia_sugerida: (it.escolha.suspeitos || []).map((s) => s.rotulo || s),
          conferido_por: ch.confirmadoPor || null, dono_informado_por: it.atribuidoPor || null,
        };
      }),
    };
  }

  function acharCheque(lote, ref) {
    if (ref && ref.cheque != null && String(ref.cheque).trim() !== '') {
      const n = Number(String(ref.cheque).replace(/\D/g, ''));
      return n >= 1 && n <= lote.itens.length ? { it: lote.itens[n - 1], n } : null;
    }
    const alvo = ref && (ref.numero_cheque || ref.numero);
    if (!alvo) return null;
    const achados = lote.itens.map((it, i) => ({ it, n: i + 1 })).filter((x) => {
      const lt = x.it.cheque.leituras || {};
      return [x.it.cheque.numero, lt.numero_impresso, lt.numero_cmc7].some((v) => v && numeroEquivalente(alvo, v));
    });
    return achados.length === 1 ? achados[0] : null;
  }

  // O nome que a ferramenta recebeu tem de estar na fala da pessoa (o modelo não
  // inventa aluno), ou ser da família que o próprio banco sugeriu para o cheque.
  const palavras = (s) => norm(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !CONECTIVOS.has(w));
  function nomeNaFala(nome, texto, it) {
    const fala = new Set(palavras(texto));
    if (palavras(nome).some((w) => fala.has(w))) return true;
    const fam = (it.escolha.suspeitos || []).map((s) => s.rotulo || s).join(' ');
    return palavras(nome).length > 0 && palavras(nome).every((w) => new Set(palavras(fam)).has(w));
  }
  // Valor e número que a ferramenta recebeu têm de estar escritos na fala.
  function valorNaFala(valor, texto) {
    const alvo = Math.round(Number(valor) * 100);
    const toks = String(texto || '').match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) || [];
    return toks.some((t) => {
      const v = /,/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : /\.\d{3}$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t);
      return Math.round(v * 100) === alvo;
    });
  }
  const numeroNaFala = (numero, texto) => (String(texto || '').match(/\d{3,}/g) || []).some((t) => numeroEquivalente(t, numero));

  const recusaCheque = (n, motivo, humano, extra = {}) => ({ cheque: n, ok: false, motivo, motivo_humano: humano, ...extra });

  // cheques_confirmar_leitura: número/valor que a equipe olhou no cheque, quando a
  // prova da leitura (CMC-7 × papel, número × extenso) falhou. Só aceita o que uma
  // das leituras da visão também viu — a pessoa escolhe entre o que foi lido, não
  // cria um número novo. Registra quem conferiu.
  async function confirmarLeitura(lote, itensArg, { quem, textoOriginal }) {
    const out = [];
    for (const ref of itensArg || []) {
      const achado = acharCheque(lote, ref);
      if (!achado) { out.push(recusaCheque(ref && ref.cheque, 'cheque_nao_encontrado', 'não achei esse cheque no lote (confira o número do cheque na lista)')); continue; }
      const { it, n } = achado; const ch = it.cheque; const lt = ch.leituras || {};
      // Cheque marcado como REPETIDO (a leitura deu o mesmo banco+número de outro
      // cheque do lote — CG 06/10, cheque 6 = cheque 3). A visão não tem como
      // provar outro número; vale o número que a pessoa escreveu, se for diferente
      // do cheque com que colidiu e de todos os outros do lote. Fica registrado quem
      // informou, e o card ainda pede o "pode".
      if (it.decisao === 'repetido' && ref.numero != null) {
        const numH = digitos(String(ref.numero)).padStart(6, '0').slice(-6);
        if (!numeroNaFala(String(ref.numero), textoOriginal)) { out.push(recusaCheque(n, 'numero_fora_da_fala', 'o número não está escrito na mensagem da pessoa')); continue; }
        const colide = lote.itens.some((x) => x !== it && chaveCheque(x.cheque) === chaveCheque({ banco: ch.banco, numero: numH }));
        if (!numH || /^0+$/.test(numH) || colide) { out.push(recusaCheque(n, 'numero_repetido', `o número ${ref.numero} também é de outro cheque do lote — confere no papel`)); continue; }
        ch.numero = numH; ch.confirmadoPor = quem || 'equipe'; ch.numeroInformado = true;
        it.trilha.push({ acao: 'numero_informado', por: ch.confirmadoPor, ts: agoraFn() });
        try {
          it.res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: lote.unidadeId, p_emitente_nome: ch.emitente_nome,
            p_valor: ch.valor, p_bom_para: ch.bom_para || ch.dataRef || null, p_emitente_documento_hash: it.docHash || null });
        } catch (_) { it.res = null; }
        if (!it.atribuidoPor) { it.multi = null; it.escolha = escolherFatura(it.res, ch, lote.loteData); await tentarFamilia(it, lote.loteData, hojeBRT(agoraFn())); }
        out.push({ cheque: n, ok: true, aviso: `número do cheque ${n} registrado como ${numH}, informado pela equipe` });
        continue;
      }
      if (ch.confiavel && !ch.confirmadoPor) { out.push({ cheque: n, ok: true, ja_estava_confirmada: true }); continue; }
      const numero = ref.numero != null ? String(ref.numero) : null;
      const valor = ref.valor != null && ref.valor !== '' ? Number(ref.valor) : null;
      if (numero == null && lt.numero_impresso && lt.numero_cmc7 && !numeroEquivalente(lt.numero_impresso, lt.numero_cmc7)) {
        out.push(recusaCheque(n, 'numero_obrigatorio', `preciso que confirmem o número do cheque ${n} (li ${lt.numero_impresso} no papel e ${lt.numero_cmc7} na linha de baixo)`)); continue;
      }
      if (numero != null && !numeroNaFala(numero, textoOriginal)) { out.push(recusaCheque(n, 'numero_fora_da_fala', 'o número não está escrito na mensagem da pessoa')); continue; }
      if (numero != null && ![lt.numero_impresso, lt.numero_cmc7].some((x) => x && numeroEquivalente(numero, x))) {
        out.push(recusaCheque(n, 'numero_nao_lido', `o número ${numero} não bate com nada que eu li no cheque ${n} — melhor mandar uma foto mais nítida dele`)); continue;
      }
      const valorDivergente = lt.valor_numerico && lt.valor_extenso && Math.abs(lt.valor_numerico - lt.valor_extenso) >= 0.01;
      if (valor == null && (valorDivergente || !lt.valor_numerico)) {
        out.push(recusaCheque(n, 'valor_obrigatorio', `preciso que confirmem o valor do cheque ${n}`)); continue;
      }
      if (valor != null && !valorNaFala(valor, textoOriginal)) { out.push(recusaCheque(n, 'valor_fora_da_fala', 'o valor não está escrito na mensagem da pessoa')); continue; }
      if (valor != null && ![lt.valor_numerico, lt.valor_extenso].some((x) => x && Math.abs(x - valor) < 0.01)) {
        out.push(recusaCheque(n, 'valor_nao_lido', `o valor ${fmtBRL(valor)} não bate com o que li no cheque ${n} — confere de novo`)); continue;
      }
      const numFinal = numero != null ? numero : (lt.numero_cmc7 || lt.numero_impresso);
      ch.numero = digitos(numFinal).padStart(6, '0').slice(-6);
      ch.valor = valor != null ? Math.round(valor * 100) / 100 : lt.valor_numerico;
      ch.confiavel = true; ch.problemas = []; ch.confirmadoPor = quem || 'equipe';
      it.trilha.push({ acao: 'leitura_confirmada', por: ch.confirmadoPor, ts: agoraFn() });
      // A parcela é procurada de novo com o valor confirmado (o documento já virou hash).
      try {
        it.res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: lote.unidadeId, p_emitente_nome: ch.emitente_nome,
          p_valor: ch.valor, p_bom_para: ch.bom_para || ch.dataRef || null, p_emitente_documento_hash: it.docHash || null });
      } catch (_) { it.res = null; }
      if (!it.atribuidoPor) {
        it.multi = null;
        it.escolha = escolherFatura(it.res, ch, lote.loteData);
        await tentarFamilia(it, lote.loteData, hojeBRT(agoraFn()));
      }
      out.push({ cheque: n, ok: true });
    }
    return out;
  }

  // cheques_atribuir: de quem é o cheque — 1 aluno ou N (irmãos, um cheque só), e,
  // se a parcela foi paga sem forma registrada, se foi com este cheque. O nome vai
  // ao MESMO resolvedor do banco; a parcela só é aceita se a soma fechar no centavo.
  async function atribuir(lote, itensArg, { quem, textoOriginal }) {
    const out = [];
    const hoje = hojeBRT(agoraFn());
    for (const ref of itensArg || []) {
      const achado = acharCheque(lote, ref);
      if (!achado) { out.push(recusaCheque(ref && ref.cheque, 'cheque_nao_encontrado', 'não achei esse cheque no lote')); continue; }
      const { it, n } = achado; const ch = it.cheque;
      if (ref.forma_paga) {
        const f = norm(ref.forma_paga);
        it.formaConfirmada = /cheque/.test(f) ? 'cheque' : (/cart/.test(f) ? 'cartão' : f.replace(/[^a-z]/g, '') || null);
        it.trilha.push({ acao: 'forma_confirmada', forma: it.formaConfirmada, por: quem, ts: agoraFn() });
      }
      const alunos = (Array.isArray(ref.alunos) ? ref.alunos : (ref.aluno ? [ref.aluno] : [])).map((x) => String(x || '').trim()).filter(Boolean);
      if (!alunos.length) {
        out.push(ref.forma_paga ? { cheque: n, ok: true } : recusaCheque(n, 'aluno_obrigatorio', 'faltou dizer de quem é o cheque')); continue;
      }
      if (it.decisao === 'repetido') {
        const k = chaveCheque(ch); const prim = lote.itens.findIndex((x) => x !== it && x.cheque.confiavel && chaveCheque(x.cheque) === k);
        out.push(recusaCheque(n, 'cheque_repetido', `o cheque ${n} é o mesmo cheque ${prim >= 0 ? prim + 1 : ''} (mesmo banco e número) — aparece duas vezes no arquivo e conto uma vez só; se forem dois cheques diferentes, peça o número que está no papel deste cheque e use cheques_confirmar_leitura com ele`)); continue;
      }
      if (it.decisao === 'ja_no_caixa') { out.push(recusaCheque(n, 'ja_no_caixa', `o cheque ${n} já está no caixa`)); continue; }
      if (!ch.confiavel) {
        out.push(recusaCheque(n, 'leitura_nao_confirmada', `antes preciso que confirmem o número e o valor do cheque ${n} (use cheques_confirmar_leitura com o que a pessoa escreveu)`)); continue;
      }
      if (alunos.length > 4) { out.push(recusaCheque(n, 'alunos_demais', 'no máximo 4 alunos por cheque')); continue; }
      const fora = alunos.filter((a) => !nomeNaFala(a, textoOriginal, it));
      if (fora.length) { out.push(recusaCheque(n, 'aluno_fora_da_fala', `o nome "${fora[0]}" não aparece na mensagem da pessoa — use o nome como ela escreveu`)); continue; }
      const grupos = []; let falhou = null;
      for (const nome of alunos) {
        let res = null;
        try {
          // SEM p_valor: o resolvedor devolve só as 8 melhores, e com valor as parcelas
          // JÁ PAGAS do mesmo valor (meses anteriores) empatam e empurram a aberta para
          // fora da lista (medido com dado real em 06/10). Quem confere o valor aqui é
          // a combinação (soma no centavo), não o score.
          res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: lote.unidadeId, p_emitente_nome: nome,
            p_valor: null, p_bom_para: ch.bom_para || ch.dataRef || null, p_emitente_documento_hash: null });
        } catch (_) { res = null; }
        if (!res || res.ok === false) { falhou = recusaCheque(n, 'fonte_indisponivel', 'não consegui consultar o cadastro agora; tenta de novo em instantes'); break; }
        let cands = (res.candidatas || []).filter((c) => c.la_report_fatura_id);
        // Nome de responsável traz a família inteira: fica o aluno que o nome cita, se houver.
        const doAluno = cands.filter((c) => palavras(c.aluno_nome).some((w) => palavras(nome).includes(w)));
        if (doAluno.length) cands = doAluno;
        if (!cands.length) { falhou = recusaCheque(n, 'aluno_sem_parcela', `não achei parcela de "${nome}" no cadastro desta unidade — confere o nome completo`); break; }
        grupos.push(cands);
      }
      if (falhou) { out.push(falhou); continue; }
      const fr = await faturasPorIds(grupos.flat().map((c) => c.la_report_fatura_id));
      if (!fr.ok) { out.push(recusaCheque(n, 'fonte_indisponivel', 'não consegui conferir as faturas agora; tenta de novo em instantes')); continue; }
      const comFatura = (c) => ({ cand: c, fatura: fr.porId.get(c.la_report_fatura_id) || null, jaLigada: fr.ligadas.has(c.la_report_fatura_id) });
      const gruposF = grupos.map((g) => g.map(comFatura));
      const competencia = ref.competencia && /^\d{1,2}\/\d{4}$/.test(String(ref.competencia).trim())
        ? String(ref.competencia).trim().padStart(7, '0') : null;
      const refCh = dataRefCheque(ch, hoje);
      let combos = combinacoes(gruposF, ch.valor, { competencia, hoje, ref: refCh });
      // O mês que a pessoa disse não fecha com o valor (CG 06/10: "parcela 10/2026",
      // mas o cheque de R$ 387 era a 09/2026 já paga no Emusys com cheque
      // pré-datado; a 10/2026 está em aberto e vencida, R$ 447). Procura nos outros
      // meses do MESMO aluno e AVISA a troca — quem confirma é o "pode" no card.
      let mesTrocado = null;
      if (!combos.length && competencia) {
        combos = combinacoes(gruposF, ch.valor, { hoje, ref: refCh });
        if (combos.length) mesTrocado = competencia;
      }
      let escolhida = combos.length === 1 ? combos[0] : (combos.length > 1 ? maisProxima(combos, ch.bom_para || lote.loteData) : null);
      if (!escolhida) {
        if (combos.length > 1) {
          const opcoes = combos.slice(0, 4).map((c) => c.map((x) => `${x.fatura.descricao} (${x.cand.aluno_nome})`).join(' + '));
          out.push(recusaCheque(n, 'mais_de_uma_parcela', `tem mais de uma parcela que fecha com ${fmtBRL(ch.valor)} — pergunte qual mês`, { opcoes })); continue;
        }
        const abertas = gruposF.flat().filter((x) => x.fatura).slice(0, 6).map((x) => {
          const v = valorDoBanco(x.fatura, hoje);
          return `${x.fatura.descricao} (${x.cand.aluno_nome}) — ${v && v.valor ? fmtBRL(v.valor) : '?'}${x.jaLigada ? ', já no caixa' : ''}${situacaoDaFatura(x.fatura, 'cheque') ? ', ' + ROTULO_DECISAO[situacaoDaFatura(x.fatura, 'cheque')] : ''}`;
        });
        out.push(recusaCheque(n, 'soma_nao_fecha', `nenhuma combinação de parcelas ${alunos.length > 1 ? 'desses alunos ' : 'desse aluno '}fecha com o cheque de ${fmtBRL(ch.valor)}`, { parcelas_encontradas: abertas }));
        continue;
      }
      if (escolhida.length === 1) { it.multi = null; it.escolha = { fatura: escolhida[0].cand, motivo: 'humano', suspeitos: [] }; }
      else { it.multi = escolhida.map((x) => ({ cand: x.cand, fatura: x.fatura, jaLigada: x.jaLigada })); it.escolha = { fatura: escolhida[0].cand, motivo: 'humano_multi', suspeitos: [] }; }
      it.soConferencia = false;
      it.atribuidoPor = quem || 'equipe';
      it.trilha.push({ acao: 'dono_informado', alunos, por: it.atribuidoPor, ts: agoraFn() });
      const _r = { cheque: n, ok: true, parcelas: escolhida.map((x) => `${x.fatura.descricao} (${x.cand.aluno_nome})`) };
      if (mesTrocado) {
        const f0 = escolhida[0].fatura; const pagaEmCheque = String(f0.status || '').toLowerCase() === 'paga';
        _r.aviso = `o mês dito foi ${mesTrocado}, mas a parcela que fecha com ${fmtBRL(ch.valor)} é ${escolhida.map((x) => x.fatura.descricao).join(' + ')}`
          + (pagaEmCheque ? ' (já registrada no Emusys como paga com cheque)' : '')
          + ' — diga isso à pessoa; o card mostra a parcela e o "pode" confirma';
        it.trilha.push({ acao: 'mes_trocado', dito: mesTrocado, por: it.atribuidoPor, ts: agoraFn() });
      }
      out.push(_r);
    }
    return out;
  }

  // cheques_marcar_conferencia: "esse é só para conferir, não lança". Sem lista de
  // cheques = o lote inteiro.
  function marcarConferencia(lote, refs, { quem }) {
    const alvo = Array.isArray(refs) && refs.length ? refs.map((r) => acharCheque(lote, typeof r === 'object' ? r : { cheque: r })) : lote.itens.map((it, i) => ({ it, n: i + 1 }));
    const out = [];
    for (const a of alvo) {
      if (!a) { out.push(recusaCheque(null, 'cheque_nao_encontrado', 'não achei esse cheque no lote')); continue; }
      if (a.it.decisao === 'ja_no_caixa') { out.push(recusaCheque(a.n, 'ja_no_caixa', `o cheque ${a.n} já está no caixa — só um estorno tira de lá`)); continue; }
      a.it.soConferencia = true;
      a.it.trilha.push({ acao: 'so_conferencia', por: quem || 'equipe', ts: agoraFn() });
      out.push({ cheque: a.n, ok: true });
    }
    return out;
  }

  // Porta única das ferramentas `cheques_*` (o caixa chama; ver ferramentaCheques no
  // caixa-financeiro). Muta o ESTADO do lote e diz se o card precisa ser republicado.
  async function ferramenta(acao, { chatId, quotedId = null, args = {}, quem = null, textoOriginal = '' }) {
    const cfg = configuracao();
    if (cfg.modo !== 'grupo') return { ok: false, motivo: 'cheques_desligado' };
    if (!cfg.agente) return { ok: false, motivo: 'cheques_agente_desligado' };
    const achado = loteDaConversa(chatId, quotedId);
    if (!achado) return { ok: false, motivo: 'sem_lote_aberto' };
    const lote = achado.lote;
    const r0 = await redecidir(chatId, lote);
    if (!r0.ok) return { ok: false, motivo: r0.motivo };
    if (acao === 'estado') return { ok: true, lote, estado: estadoParaAgente(chatId, lote) };
    let resultados;
    if (acao === 'confirmar_leitura') resultados = await confirmarLeitura(lote, args.itens, { quem, textoOriginal });
    else if (acao === 'atribuir') resultados = await atribuir(lote, args.itens, { quem, textoOriginal });
    else if (acao === 'conferencia') resultados = marcarConferencia(lote, args.cheques, { quem });
    else return { ok: false, motivo: 'acao_desconhecida' };
    const mudou = resultados.some((x) => x.ok && !x.ja_estava_confirmada);
    if (mudou) {
      const r1 = await redecidir(chatId, lote);
      if (!r1.ok) return { ok: false, motivo: r1.motivo, resultados };
    }
    // O pedido foi aceito, mas o cheque pode não ter ficado pronto (ex.: outro cheque
    // aponta para a mesma parcela). O agente precisa saber o resultado FINAL.
    for (const x of resultados) {
      const it = x.ok && x.cheque ? lote.itens[x.cheque - 1] : null;
      if (!it) continue;
      x.situacao_final = it.decisao;
      if (it.decisao !== 'lancar' && acao !== 'conferencia') {
        x.aviso = Array.isArray(it.conflito) && it.conflito.length
          ? `o cheque ${x.cheque} e o cheque ${it.conflito.join(' e ')} apontam para a mesma parcela; nenhum entra até a equipe dizer qual é qual`
          : `o cheque ${x.cheque} ainda não está pronto: ${ROTULO_DECISAO[it.decisao] || it.decisao}`;
      }
    }
    log({ acao: 'cheques_ferramenta', ferramenta: acao, chatId, ok: resultados.filter((x) => x.ok).length,
      recusados: resultados.filter((x) => !x.ok).map((x) => x.motivo), decisoes: lote.itens.map((it) => it.decisao) });
    return { ok: true, lote, mudou, resultados, estado: estadoParaAgente(chatId, lote) };
  }

  // O caixa vai republicar o card deste lote: os cards antigos morrem aqui (o caixa
  // fecha o preview V3 deles) e o próximo nasce do estado atual.
  function cardsDoLote(lote) { return (lote.cards || []).map((c) => c.id); }
  function esquecerCards(lote) { lote.cards = []; lote.pendenteCard = null; }

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

  // A mensagem citada é de um lote de cheques (vivo ou não)? A ponte usa para não
  // responder "não entendi / para abrir o caixa…" a quem fala do lote.
  function citaLote(chatId, quotedId) {
    if (!quotedId) return false;
    return (lotes.get(chatId) || []).some((l) => (l.msgIds || []).includes(quotedId) || l.origem === quotedId);
  }

  return { tratarMidia, tratarResposta, processarArquivo, vincularMensagem, barrarNoPode, ligarCaixa,
    conversa, ferramenta, cartaoDoLote, cardsDoLote, esquecerCards, registrarLancamento, citaLote, redecidir,
    _lotes: lotes, _salvarEstado: salvarEstado };
}

module.exports = {
  criarCheques, pareceLoteCheques, dataDoLote, dvMod10, lerCmc7, extensoParaNumero, numeroEquivalente, configuracao,
  normalizarCheque, escolherFatura, decidirCheque, valorDoBanco, itemDoCaixa, categoriaDaFatura, montarMensagem,
  blocoCheque, nomeBonito, nomeOriginal, chaveCheque, sinalChequeNoTexto, UNIDADE_SIGLA,
};
