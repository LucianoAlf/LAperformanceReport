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
//   4. confere no Super Folha (`conferir`, não grava) pela edge
//      `sol-cheques-super-folha`, que guarda o segredo — a VPS não o tem;
//   5. responde cheque a cheque (✅ depositar · ⚠️ retirar do malote · ❓ confirmar).
//   6. com "pode" citando a mensagem do lote, `registrar`.
//
// ⚠️ NADA vai para o caixa do dia (decisão do contrato): a unidade já lança o
//    recebimento no Emusys quando recebe o cheque; lançar aqui duplicaria.
// ⚠️ CPF/CNPJ nunca em claro fora da memória do processo: vira HMAC no banco
//    (`sol_cheque_documento_hash_v1`) e só o hash segue. Nunca vai para log.
// ⚠️ O PDF e as imagens renderizadas são apagados depois da leitura.
// ⚠️ Modos (arquivo cheques.json ao lado deste, ou env): off | sombra | grupo.
//    sombra = faz tudo até o `conferir` e manda o resultado SÓ para o destino de
//    sombra (DM), nada no grupo e nada gravado no Super Folha.

const fs = require('fs');
const path = require('path');
const https = require('https');
const cp = require('child_process');
const os = require('os');

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
// como ❓ e fica FORA do Super Folha (número errado ligaria o depósito errado).
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

// ------------------------------------------------------------ mensagem

const CIRC = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

function montarMensagem({ unidadeNome, loteData, itens, sombra = false }) {
  const [a, m, d] = String(loteData).split('-');
  const linhas = [];
  if (sombra) linhas.push('🧪 *SOMBRA* — isto NÃO foi postado no grupo e nada foi gravado.');
  linhas.push(`🧾 Li ${itens.length} cheque${itens.length === 1 ? '' : 's'} do lote de ${d}/${m} (${unidadeNome}):`);
  itens.forEach((it, i) => {
    const ch = it.cheque;
    const banco = BANCOS[ch.banco] || (ch.banco ? 'banco ' + ch.banco : 'banco ?');
    const quem = (it.parcela && it.parcela.aluno_nome) || (it.escolha.fatura && it.escolha.fatura.aluno_nome);
    let l = `${CIRC[i] || (i + 1) + ')'} ${ch.valor ? fmtBRL(ch.valor) : 'R$ ?'} · ${banco} nº ${ch.numero} · ${ch.emitente_nome || 'emitente ?'}`;
    if (quem) l += ` · aluno ${quem}`;
    const comp = it.parcela && (it.parcela.competencia || it.parcela.vencimento);
    if (comp) l += ` · ${String(comp).slice(0, 7)}`;
    if (!ch.confiavel) {
      l += `\n   ❓ não confiei na leitura: ${ch.problemas.join('; ')}. Confere o nº e o valor?`;
    } else if (it.acao === 'depositar') {
      l += ' ✅ depositar';
    } else if (it.acao === 'retirar_do_malote') {
      l += ' ⚠️ *retirar do malote*';
    } else {
      l += ' ❓ confirmar';
    }
    for (const av of (it.avisos || [])) if (av && av.texto) l += `\n   · ${av.texto}`;
    if (ch.confiavel && !it.escolha.fatura && it.escolha.suspeitos.length) {
      l += `\n   · de quem é? Pode ser da família de: ${it.escolha.suspeitos.map((s) => s.rotulo || s).join('; ')}`;
    } else if (ch.confiavel && !it.escolha.fatura && it.escolha.motivo === 'emitente_desconhecido') {
      l += '\n   · de quem é? Não achei o emitente no cadastro.';
    }
    linhas.push(l);
  });
  if (!sombra) linhas.push('👉 Posso registrar o lote? Responde *pode* citando esta mensagem.');
  return linhas.join('\n');
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

// PDF → PNG por página (200 dpi, até 6 páginas). Imagem passa direto.
function paginasDoArquivo(arquivo) {
  if (!/\.pdf$/i.test(arquivo)) return { paginas: [arquivo], tmp: null };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-chq-'));
  cp.spawnSync('/usr/bin/pdftoppm', ['-r', '200', '-png', '-f', '1', '-l', '6', arquivo, path.join(tmp, 'p')], { timeout: 60000 });
  const paginas = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(tmp, f));
  return { paginas, tmp };
}

async function lerLote(arquivo, modelo) {
  const { paginas, tmp } = paginasDoArquivo(arquivo);
  try {
    const todos = [];
    for (const p of paginas) {
      let r = await lerImagemVisao(p, modelo);
      if (!r.ok) r = await lerImagemVisao(p, modelo); // uma nova tentativa: JSON truncado acontece
      if (!r.ok) return { ok: false, motivo: r.motivo };
      todos.push(...r.cheques);
    }
    return { ok: true, cheques: todos, paginas: paginas.length };
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* melhor esforço */ } }
  }
}

function criarCheques({ carregarEnv, sendFn, log = () => {}, lerLoteFn = lerLote, rpcFn = null, superFolhaFn = null, agoraFn = () => Date.now() } = {}) {
  const lotes = new Map(); // chatId -> [{ msgId, itens, loteData, unidade, ts }]

  async function rpc(nome, args) {
    if (rpcFn) return rpcFn(nome, args);
    const { url, key } = carregarEnv();
    const r = await postJson(`${url}/rest/v1/rpc/${nome}`, args, { apikey: key, Authorization: `Bearer ${key}` }, 30000);
    return r.status >= 200 && r.status < 300 ? r.body : null;
  }
  async function superFolha(pedido) {
    if (superFolhaFn) return superFolhaFn(pedido);
    const { url, key } = carregarEnv();
    const r = await postJson(`${url}/functions/v1/sol-cheques-super-folha`, pedido, { apikey: key, Authorization: `Bearer ${key}` }, 60000);
    return r.body || { success: false, error: 'sem_resposta', status: r.status };
  }

  function payloadCheque(it, sigla, loteData, extra = {}) {
    const ch = it.cheque; const f = it.escolha.fatura;
    const p = { unidade: sigla, banco: ch.banco, agencia: ch.agencia, conta_final: ch.conta_final, numero: ch.numero,
      valor: ch.valor, bom_para: ch.bom_para, emitente_nome: ch.emitente_nome, lote_data: loteData, ...extra };
    if (it.docHash) p.emitente_documento_hash = it.docHash;
    if (f && f.emusys_fatura_id != null) p.emusys_fatura_id = Number(f.emusys_fatura_id);
    else if (f && f.la_report_fatura_id) p.la_report_fatura_id = f.la_report_fatura_id;
    return p;
  }

  // Lê + prova + resolve + confere. Nunca grava. Devolve os itens e o texto.
  async function processarArquivo({ arquivo, unidadeId, unidadeNome, textoLote, modelo }) {
    const sigla = UNIDADE_SIGLA[unidadeId];
    if (!sigla) return { ok: false, motivo: 'unidade_desconhecida' };
    const loteData = dataDoLote(textoLote, agoraFn());
    const lido = await lerLoteFn(arquivo, modelo);
    if (!lido.ok) return { ok: false, motivo: lido.motivo || 'leitura_falhou' };
    if (!lido.cheques.length) return { ok: false, motivo: 'nenhum_cheque_lido' };
    const itens = [];
    for (const raw of lido.cheques) {
      const cheque = normalizarCheque(raw);
      let docHash = null;
      if (cheque.documento) {
        try { docHash = await rpc('sol_cheque_documento_hash_v1', { p_documento: cheque.documento }); } catch (_) { docHash = null; }
        if (typeof docHash !== 'string' || !/^[0-9a-f]{64}$/.test(docHash)) docHash = null;
      }
      delete cheque.documento; // o documento em claro não sai daqui
      let res = null;
      try {
        res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: unidadeId, p_emitente_nome: cheque.emitente_nome,
          p_valor: cheque.valor, p_bom_para: cheque.bom_para, p_emitente_documento_hash: docHash });
      } catch (_) { res = null; }
      itens.push({ cheque, docHash, escolha: escolherFatura(res, cheque, loteData), acao: null, avisos: [], parcela: null });
    }
    // Parcela já casada com um cheque do lote não é suspeita de outro cheque.
    const casadas = new Set(itens.map((it) => it.escolha.fatura && Number(it.escolha.fatura.emusys_fatura_id)).filter(Boolean));
    for (const it of itens) {
      it.escolha.suspeitos = it.escolha.suspeitos.filter((s) => !(s && s.fatura && casadas.has(s.fatura)));
    }
    const confiaveis = itens.filter((it) => it.cheque.confiavel);
    let conferencia = null;
    if (confiaveis.length) {
      conferencia = await superFolha({ acao: 'conferir', cheques: confiaveis.map((it) => payloadCheque(it, sigla, loteData)) });
      const lista = conferencia && conferencia.success && Array.isArray(conferencia.cheques) ? conferencia.cheques : [];
      confiaveis.forEach((it, i) => {
        const c = lista.find((x) => Number(x.indice) === i + 1) || lista[i] || null;
        it.acao = c ? c.acao : 'confirmar';
        it.avisos = c && Array.isArray(c.avisos) ? c.avisos : (c ? [] : [{ codigo: 'sf_indisponivel', texto: 'não consegui conferir no Super Folha agora' }]);
        it.parcela = c ? c.parcela || null : null;
      });
    }
    log({ acao: 'cheques_lote_conferido', unidade: sigla, lidos: itens.length, confiaveis: confiaveis.length,
      sf_ok: !!(conferencia && conferencia.success), acoes: itens.map((it) => it.acao || 'nao_confiavel') });
    return { ok: true, itens, loteData, sigla, unidadeNome, conferencia };
  }

  // Hook do caixa: devolve { tratou, acao } ou null (não é lote / módulo desligado).
  async function tratarMidia(event, grupo) {
    if (!event || !event.hasMedia || event._sintetico) return null;
    if (!pareceLoteCheques(event)) return null;
    const cfg = configuracao();
    if (cfg.modo !== 'sombra' && cfg.modo !== 'grupo') return null;
    const arquivo = Array.isArray(event.mediaUrls) ? event.mediaUrls[0] : null;
    if (!arquivo || !fs.existsSync(arquivo)) return null;
    const textoLote = `${event.body || ''} ${nomeOriginal(arquivo)}`;
    let r;
    try {
      r = await processarArquivo({ arquivo, unidadeId: grupo.unidade_id, unidadeNome: grupo.nome, textoLote, modelo: cfg.modelo });
    } finally {
      try { fs.unlinkSync(arquivo); } catch (_) { /* a ponte também limpa */ }
    }
    const sombra = cfg.modo === 'sombra';
    if (!r.ok) {
      const txt = `🧾 Recebi um lote de cheques, mas não consegui ler (${r.motivo}). Confere na mão, por favor.`;
      if (sombra) { if (cfg.sombraJid) await sendFn(cfg.sombraJid, '🧪 *SOMBRA* — ' + grupo.nome + '\n' + txt); }
      else await sendFn(event.chatId, txt);
      log({ acao: 'cheques_lote_falhou', motivo: r.motivo, modo: cfg.modo });
      return { tratou: true, acao: 'cheques_lote_falhou' };
    }
    const texto = montarMensagem({ unidadeNome: grupo.nome, loteData: r.loteData, itens: r.itens, sombra });
    if (sombra) {
      if (cfg.sombraJid) await sendFn(cfg.sombraJid, texto);
      log({ acao: 'cheques_lote_sombra', unidade: r.sigla, itens: r.itens.length });
      return { tratou: true, acao: 'cheques_lote_sombra' };
    }
    const msgId = await sendFn(event.chatId, texto);
    const arr = (lotes.get(event.chatId) || []).filter((x) => agoraFn() - x.ts < 6 * 3600 * 1000);
    arr.push({ msgId, msgIds: [msgId], itens: r.itens, loteData: r.loteData, sigla: r.sigla, unidadeNome: grupo.nome, ts: agoraFn(), origem: event.messageId });
    lotes.set(event.chatId, arr);
    return { tratou: true, acao: 'cheques_lote_conferido' };
  }

  // Resposta ao ❓ citando o lote: "1 é da Natalia" / "é da Natalia Vieira".
  // O nome respondido volta à MESMA RPC (caminho 'nome'), e só aquele cheque é
  // conferido de novo. Nome que não resolve de forma única não vira escolha.
  async function tratarIdentificacao(event, lote, unidadeId) {
    const txt = String(event.body || '').trim();
    const pend = lote.itens.map((it, i) => ({ it, i })).filter((x) => x.it.cheque.confiavel && !x.it.escolha.fatura);
    if (!pend.length) return null;
    let alvo = null; let resto = txt;
    const mIdx = txt.match(/^\s*(?:cheque\s*)?(\d{1,2}|[①②③④⑤⑥⑦⑧⑨⑩])\s*[-:–)]?\s*/i);
    if (mIdx) {
      const n = /\d/.test(mIdx[1]) ? Number(mIdx[1]) : CIRC.indexOf(mIdx[1]) + 1;
      alvo = pend.find((x) => x.i + 1 === n) || null;
      resto = txt.slice(mIdx[0].length);
      if (!alvo) return null;
    } else if (pend.length === 1) alvo = pend[0];
    else return null;
    const nome = resto.replace(/^(e|é|eh)\s+(d[aoe]s?|de)\s+/i, '').replace(/^(d[aoe]s?)\s+/i, '').replace(/[.!?]+$/, '').trim();
    if (nome.length < 3 || /\d/.test(nome)) return null;
    const it = alvo.it;
    let res = null;
    try {
      res = await rpc('sol_cheque_resolver_fatura_v1', { p_unidade_id: unidadeId, p_emitente_nome: nome,
        p_valor: it.cheque.valor, p_bom_para: it.cheque.bom_para, p_emitente_documento_hash: null });
    } catch (_) { res = null; }
    const esc = escolherFatura(res, it.cheque, lote.loteData);
    if (!esc.fatura) {
      await sendFn(event.chatId, `❓ Não consegui achar uma parcela única de "${nome}" para o cheque ${CIRC[alvo.i] || alvo.i + 1}. Manda o nome completo do aluno.`);
      return { tratou: true, acao: 'cheques_identificacao_sem_parcela' };
    }
    it.escolha = esc;
    const c = await superFolha({ acao: 'conferir', cheques: [payloadCheque(it, lote.sigla, lote.loteData)] });
    const r0 = c && c.success && Array.isArray(c.cheques) ? c.cheques[0] : null;
    it.acao = r0 ? r0.acao : 'confirmar';
    it.avisos = r0 && Array.isArray(r0.avisos) ? r0.avisos : [];
    it.parcela = r0 ? r0.parcela || null : null;
    const linha = montarMensagem({ unidadeNome: lote.unidadeNome || '', loteData: lote.loteData, itens: [it] }).split('\n').slice(1, -1).join('\n')
      .replace(/^①/, CIRC[alvo.i] || String(alvo.i + 1));
    await sendFn(event.chatId, 'Atualizei:\n' + linha + '\n👉 Quando estiver tudo certo, responde *pode* citando a mensagem do lote.');
    log({ acao: 'cheques_identificacao', indice: alvo.i + 1, sf_acao: it.acao });
    return { tratou: true, acao: 'cheques_identificacao' };
  }

  // Resposta CITANDO a mensagem do lote: "pode" → registrar; senão, pode ser a
  // identificação de um ❓. Sem citação não é do lote: "pode" seco pertence ao
  // caixa de comprovantes, e texto solto é conversa.
  async function tratarResposta(event, { casarPode, autorizadoPorFn, unidadeId } = {}) {
    if (!event || event.hasMedia || !event.quotedMessageId) return null;
    const arr = lotes.get(event.chatId) || [];
    const lote = arr.find((x) => x.msgId === event.quotedMessageId || x.origem === event.quotedMessageId
      || (Array.isArray(x.msgIds) && x.msgIds.includes(event.quotedMessageId)));
    if (!lote) return null;
    const conf = casarPode ? casarPode(event.body, { respondeuPreview: true }) : { pode: /^\s*pode\b/i.test(String(event.body || '')) };
    if (!conf || !conf.pode) return tratarIdentificacao(event, lote, unidadeId);
    const registraveis = lote.itens.filter((it) => it.cheque.confiavel);
    if (!registraveis.length) {
      await sendFn(event.chatId, '⚠️ Nenhum cheque desse lote teve a leitura confirmada; não registrei nada.');
      return { tratou: true, acao: 'cheques_nada_registravel' };
    }
    const cheques = registraveis.map((it) => payloadCheque(it, lote.sigla, lote.loteData,
      { situacao: it.acao === 'retirar_do_malote' ? 'retirado' : 'a_depositar' }));
    const r = await superFolha({ acao: 'registrar', cheques,
      ator: { tipo: 'sol', ref: String(event.messageId || ''), autorizado_por: (autorizadoPorFn && await autorizadoPorFn()) || 'grupo' } });
    if (!r || !r.success) {
      await sendFn(event.chatId, `⚠️ Não consegui registrar o lote no Super Folha (${(r && r.error) || 'sem resposta'}). Nada foi gravado.`);
      log({ acao: 'cheques_registrar_falhou', erro: r && r.error });
      return { tratou: true, acao: 'cheques_registrar_falhou' };
    }
    lotes.set(event.chatId, arr.filter((x) => x !== lote));
    const gravados = (r.cheques || []).filter((c) => c.gravado !== false).length;
    await sendFn(event.chatId, `✅ Registrei ${gravados} cheque${gravados === 1 ? '' : 's'} do lote de ${lote.loteData.slice(8)}/${lote.loteData.slice(5, 7)} no Super Folha${r.ligados_ao_banco ? ` (${r.ligados_ao_banco} já ligado${r.ligados_ao_banco === 1 ? '' : 's'} ao depósito no banco)` : ''}. _Nada foi lançado no caixa._`);
    log({ acao: 'cheques_registrados', gravados, ligados_ao_banco: r.ligados_ao_banco || 0 });
    return { tratou: true, acao: 'cheques_registrados' };
  }

  return { tratarMidia, tratarResposta, processarArquivo, superFolha, payloadCheque };
}

module.exports = {
  criarCheques, pareceLoteCheques, dataDoLote, dvMod10, lerCmc7, extensoParaNumero,
  normalizarCheque, escolherFatura, montarMensagem, nomeOriginal, UNIDADE_SIGLA,
};
