'use strict';

// VENDA DE INGRESSO DE EVENTO (02/10/2026, pedido do Alf). Trilho próprio, sem aluno.
//
// O que os dados mostraram antes deste módulo existir (estudo read-only, 02/10):
//   • Ingresso NUNCA tinha entrado no caixa da Sol. Os do Isac Jamba (set/2026) e do
//     LA Session (01-02/10) caíram em "nada", "outro/aluno_nao_encontrado" ou em
//     LOJINHA com o artista tratado como aluno (o card de 02/10 18:21).
//   • No Emusys, ingresso aparece como fatura avulsa ("Ingresso Isac Jamba - PISTA"
//     R$ 40, "VIP" R$ 55-65, "L.A Session #4 PISTA" R$ 55-65), com SETOR e LOTE, e
//     às vezes com desconto ("2 ingressos" por R$ 97). Preço muda; evento muda.
//   • A lojinha tem os MESMOS valores: caderno R$ 100, camisa R$ 80, capotraste e
//     afinador R$ 40, corda R$ 55-120. Por isso o VALOR NUNCA CLASSIFICA: R$ 80
//     é 2 ingressos de R$ 40 e também uma camisa.
//
// Regras (desenho aprovado pelo Alf):
//   1. Ingresso só nasce de sinal EXPLÍCITO escrito pela pessoa: "ingresso(s)",
//      "meia-entrada", "bilheteria", nome/alias de evento configurado, setor
//      ("Pista", "VIP"). Nunca do OCR, nunca do valor, nunca do palpite do LLM.
//   2. Produto de lojinha citado vence alias/setor (vai para a lojinha). Com a
//      palavra "ingresso" E um produto juntos, a Sol PERGUNTA.
//   3. Parcela/mensalidade/passaporte/matrícula vencem alias/setor ("parcela do
//      aluno Felipe Alves" não é show). Com "ingresso" junto, a Sol PERGUNTA.
//   4. "venda" sem item nem ingresso → pergunta "ingresso ou lojinha?".
//   5. Só DEPOIS de saber que é ingresso o valor calcula a quantidade, pelo preço
//      do lote vigente. Valor que não fecha continua sendo ingresso, sem quantidade.
//
// O PREÇO NÃO MORA NO CÓDIGO. Evento, aliases, setores e lote vêm de um JSON de
// configuração fora do artefato (ver `ingressos-eventos.example.json`), relido a
// cada mudança de mtime: trocar o lote é editar o arquivo, sem deploy nem restart.
// Arquivo ausente ou inválido → nenhum evento configurado: o ingresso continua
// reconhecido, só sem quantidade (fail-closed para preço, nunca para dinheiro).

const fs = require('fs');
const path = require('path');

const CAMINHO_PADRAO = path.join(__dirname, 'ingressos-eventos.json');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Forma de comparação de nomes: "L.A Session" e "LA Session" são o mesmo evento.
function chave(s) {
  return norm(s).replace(/[.'’`]/g, '').replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function contemTermo(textoChave, termoChave) {
  if (!termoChave) return false;
  return (' ' + textoChave + ' ').includes(' ' + termoChave + ' ');
}

// ---------------------------------------------------------------- configuração

function _hojeSP(agora = Date.now()) {
  // Data civil de São Paulo (UTC-3, sem horário de verão desde 2019).
  return new Date(Number(agora) - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
const _DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarConfigIngressos(obj) {
  const erros = [];
  const eventos = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, erros: ['raiz_nao_e_objeto'], eventos };
  }
  if (obj.schema_version !== 1) erros.push('schema_version_deve_ser_1');
  if (!Array.isArray(obj.eventos)) erros.push('eventos_deve_ser_lista');
  const ids = new Set();
  const preco = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10000);
  (Array.isArray(obj.eventos) ? obj.eventos : []).forEach((e, i) => {
    const onde = `eventos[${i}]`;
    if (!e || typeof e !== 'object') { erros.push(`${onde}_invalido`); return; }
    const id = String(e.id || '').trim();
    const nome = String(e.nome || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,60}$/.test(id)) erros.push(`${onde}.id_invalido`);
    else if (ids.has(id)) erros.push(`${onde}.id_duplicado`);
    ids.add(id);
    if (nome.length < 3) erros.push(`${onde}.nome_curto`);
    const aliases = Array.isArray(e.aliases) ? e.aliases.map(chave).filter((a) => a.length >= 4) : [];
    if (!aliases.length) erros.push(`${onde}.aliases_vazios`);
    if (e.ate != null && !_DATA_RE.test(String(e.ate))) erros.push(`${onde}.ate_invalido`);
    const lotes = Array.isArray(e.lotes) ? e.lotes : [];
    lotes.forEach((l, j) => {
      if (!l || !preco(l.preco)) erros.push(`${onde}.lotes[${j}].preco_invalido`);
      if (l && l.a_partir_de != null && !_DATA_RE.test(String(l.a_partir_de))) erros.push(`${onde}.lotes[${j}].a_partir_de_invalido`);
    });
    const setores = Array.isArray(e.setores) ? e.setores : [];
    setores.forEach((s, j) => {
      if (!s || String(s.nome || '').trim().length < 2) erros.push(`${onde}.setores[${j}].nome_invalido`);
      if (s && s.preco != null && !preco(s.preco)) erros.push(`${onde}.setores[${j}].preco_invalido`);
    });
    eventos.push({
      id, nome, aliases,
      ativo: e.ativo !== false,
      ate: e.ate ? String(e.ate) : null,
      unidades: Array.isArray(e.unidades) ? e.unidades.map((u) => String(u).trim()).filter(Boolean) : [],
      lotes: lotes.filter((l) => l && preco(l.preco)).map((l) => ({
        nome: String(l.nome || '').trim() || null, preco: l.preco, a_partir_de: l.a_partir_de ? String(l.a_partir_de) : null })),
      setores: setores.filter((s) => s && String(s.nome || '').trim().length >= 2).map((s) => ({
        nome: String(s.nome).trim(),
        aliases: [s.nome].concat(Array.isArray(s.aliases) ? s.aliases : []).map(chave).filter(Boolean),
        preco: preco(s.preco) ? s.preco : null })),
    });
  });
  return { ok: erros.length === 0, erros, eventos: erros.length ? [] : eventos };
}

// Cache por caminho; relê só quando mtime/tamanho mudam.
const _cache = new Map();
function carregarConfigIngressos({ caminho = process.env.SOL_CAIXA_INGRESSOS_CONFIG || CAMINHO_PADRAO, log = null } = {}) {
  let st = null;
  try { st = fs.statSync(caminho); } catch (_) {
    const c = _cache.get(caminho);
    if (!c || c.assinatura !== 'ausente') {
      _cache.set(caminho, { assinatura: 'ausente', cfg: { ok: false, eventos: [], erros: ['arquivo_ausente'], fonte: caminho } });
      if (log) log({ acao: 'ingressos_config_ausente' });
    }
    return _cache.get(caminho).cfg;
  }
  const assinatura = `${st.mtimeMs}:${st.size}`;
  const c = _cache.get(caminho);
  if (c && c.assinatura === assinatura) return c.cfg;
  let cfg;
  try {
    const v = validarConfigIngressos(JSON.parse(fs.readFileSync(caminho, 'utf8')));
    cfg = { ok: v.ok, eventos: v.eventos, erros: v.erros, fonte: caminho };
  } catch (e) {
    cfg = { ok: false, eventos: [], erros: ['json_invalido'], fonte: caminho };
  }
  _cache.set(caminho, { assinatura, cfg });
  if (log) {
    log(cfg.ok
      ? { acao: 'ingressos_config_carregada', eventos: cfg.eventos.length }
      : { acao: 'ingressos_config_invalida', erros: cfg.erros.slice(0, 5) });
  }
  return cfg;
}

function eventosAtivos(cfg, { unidade = null, agora = Date.now() } = {}) {
  const hoje = _hojeSP(agora);
  const uId = unidade && unidade.id ? String(unidade.id) : null;
  const uNome = unidade && unidade.nome ? chave(unidade.nome) : null;
  return ((cfg && cfg.eventos) || []).filter((e) => {
    if (!e.ativo) return false;
    if (e.ate && e.ate < hoje) return false;
    if (e.unidades.length && !e.unidades.some((u) => u === uId || chave(u) === uNome)) return false;
    return true;
  });
}

function loteVigente(evento, agora = Date.now()) {
  const hoje = _hojeSP(agora);
  const validos = (evento.lotes || []).filter((l) => !l.a_partir_de || l.a_partir_de <= hoje);
  if (!validos.length) return null;
  // O último a começar é o vigente; sem data, vale a ordem do arquivo.
  return validos.slice().sort((a, b) => String(a.a_partir_de || '').localeCompare(String(b.a_partir_de || ''))).pop();
}

// ---------------------------------------------------------------- classificação

const ING_FORTE_RE = /\b(ingressos?|meia[\s-]?entradas?|bilheteria)\b/;
const SETOR_RE = /\b(pista|vip|camarote|plateia|arquibancada|mezanino)\b/;
const PAG_ALUNO_RE = /\b(parcelas?|mensalidades?|passaportes?|matriculas?)\b|\b(0?[1-9]|1[0-2])\/20\d{2}\b/;
const VENDA_RE = /\bvend(?:a|as|i|emos|eu|eram|ido|ida|idos|idas)\b/;
const RESP_LOJINHA_RE = /\b(lojinha|loja|produto)\b/;

const _NUM_PALAVRA = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10 };
function quantidadeDeclarada(texto) {
  const n = norm(texto);
  const m = n.match(/(?:^|[^\d#])(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:ingressos?|entradas?|meias?[\s-]?entradas?)\b/);
  if (!m) return null;
  const q = /^\d+$/.test(m[1]) ? Number(m[1]) : _NUM_PALAVRA[m[1]];
  return Number.isInteger(q) && q >= 1 && q <= 200 ? q : null;
}

// Rótulo do evento NÃO configurado: o que a pessoa escreveu depois de "ingresso".
// "2 ingressos Isac Jamba - Pista 80 pix" → "Isac Jamba - Pista".
function limparRotulo(s) {
  const r = String(s || '')
    .replace(/\br\$\s*[\d.,]+.*$/i, '')
    .replace(/\b(no|na|via|em|pelo|pela)?\s*\b(pix|dinheiro|esp[eé]cie|cart[aã]o|cr[eé]dito|d[eé]bito|transfer[eê]ncia|ted|doc)\b.*$/i, '')
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:reais)?\s*$/i, '')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (r.length < 3 || /^\d+$/.test(r)) return null;
  return r.slice(0, 60);
}
function rotuloLivre(texto) {
  const raw = String(texto || '').split(/[\n·|]/).find((l) => /ingress/i.test(l)) || '';
  const m = raw.match(/ingressos?\s*(?:(?:d[aoe]s?|para|pro|pra|no|na)\s+(?:(?:o|a)\s+)?)?(.*)$/i);
  return m ? limparRotulo(m[1]) : null;
}

/**
 * Decide a NATUREZA de uma venda a partir do texto humano (legenda/ditado).
 * Retorna { tipo: 'ingresso', ... } | { tipo: 'perguntar', motivo } | null (segue o fluxo de sempre).
 *
 * deps: detectarProduto(texto) → objeto|null (o detector da lojinha, injetado para
 *       não duplicar a lista de produtos); saidaExplicita(texto) → categoria|null.
 */
function classificarNaturezaVenda(texto, { config = null, unidade = null, agora = Date.now(),
  resposta = null, detectarProduto = () => null, saidaExplicita = () => null } = {}) {
  const raw = String(texto || '').trim();
  if (!raw) return null;
  if (saidaExplicita(raw)) return null;
  const n = norm(raw);
  const k = chave(raw);
  const ativos = eventosAtivos(config, { unidade, agora });
  const evento = ativos.find((e) => e.aliases.some((a) => contemTermo(k, a))) || null;
  // Produto é procurado SEM o nome do evento: "Show do Corda Bamba" não é corda.
  let semEvento = raw;
  if (evento) {
    for (const a of evento.aliases) {
      const re = new RegExp(a.split(' ').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.\'’`-]*'), 'ig');
      semEvento = semEvento.replace(re, ' ');
    }
  }
  const produto = detectarProduto(semEvento);
  const forte = ING_FORTE_RE.test(n);
  const setorTxt = (n.match(SETOR_RE) || [])[1] || null;
  const pagAluno = PAG_ALUNO_RE.test(n);

  // Resposta à pergunta "ingresso ou lojinha?": a resposta decide, sem perguntar de novo.
  if (resposta != null) {
    const r = norm(resposta);
    if (ING_FORTE_RE.test(r)) return montarIngresso({ raw, k, evento, setorTxt, agora, rotuloDe: rotuloLivre(resposta) || rotuloLivre(raw) });
    return null;
  }

  if (forte) {
    if (produto) return { tipo: 'perguntar', motivo: 'ingresso_e_produto' };
    if (pagAluno) return { tipo: 'perguntar', motivo: 'ingresso_e_parcela' };
    return montarIngresso({ raw, k, evento, setorTxt, agora, rotuloDe: rotuloLivre(raw) });
  }
  if (evento || setorTxt) {
    // Alias/setor sozinhos são sinal mais fraco que produto e que pagamento de aluno.
    if (produto || pagAluno) return null;
    return montarIngresso({ raw, k, evento, setorTxt, agora, rotuloDe: evento ? null : limparRotulo(raw.split(/[\n·|]/)[0]) });
  }
  if (VENDA_RE.test(n) && !produto && !pagAluno && !/\b(lojinha|loja)\b/.test(n)) {
    return { tipo: 'perguntar', motivo: 'venda_sem_item' };
  }
  return null;
}

function montarIngresso({ raw, k, evento, setorTxt, agora, rotuloDe }) {
  let setor = null;
  if (evento && evento.setores.length) setor = evento.setores.find((s) => s.aliases.some((a) => contemTermo(k, a))) || null;
  // Setor escrito que o evento configurado não conhece: o preço do lote pode não
  // ser o dele (VIP ≠ pista). Rótulo sim, quantidade não.
  const setorDesconhecido = !!(evento && setorTxt && !setor);
  const lote = evento && !setorDesconhecido ? loteVigente(evento, agora) : null;
  const preco = setor && setor.preco ? setor.preco : (lote ? lote.preco : null);
  let rotulo = evento ? evento.nome : (rotuloDe || null);
  const setorNome = setor ? setor.nome : (setorTxt ? setorTxt.charAt(0).toUpperCase() + setorTxt.slice(1) : null);
  if (evento && setorNome) rotulo += ` (${setorNome})`;
  return {
    tipo: 'ingresso',
    evento_id: evento ? evento.id : null,
    evento: rotulo,
    setor: setorNome,
    preco_unitario: preco,
    lote: setor && setor.preco ? null : (lote ? lote.nome : null),
    quantidade_declarada: quantidadeDeclarada(raw),
  };
}

// Valor em texto puro para ingresso: R$/rótulo primeiro; sem eles, UM número solto
// depois de tirar a quantidade ("2 ingressos") e o número do evento ("#4").
function valorTextoIngresso(texto, { candidatosMonetariosBR, extrairValor }) {
  const v = extrairValor(texto);
  if (v) return v;
  const limpo = String(texto || '')
    .replace(/(?:^|\s)(\d{1,3})\s+(?:ingressos?|entradas?)\b/gi, ' ingressos')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ');
  const soltos = candidatosMonetariosBR(limpo, { incluirSoltos: true });
  return soltos.length === 1 ? soltos[0].valor : null;
}

/**
 * Quantidade, descrição e linhas do card, a partir da natureza + valor conferido.
 */
function resolverIngresso(nat, valor, { fmtBRL }) {
  const P = Number(nat.preco_unitario) || null;
  const V = Number(valor) || null;
  const decl = nat.quantidade_declarada || null;
  let quantidade = null; let fecha = false; let esperado = null;
  if (P && V) {
    if (decl) {
      esperado = Math.round(decl * P * 100) / 100;
      quantidade = decl;
      fecha = Math.abs(esperado - V) < 0.005;
    } else {
      const k = V / P;
      if (Math.abs(k - Math.round(k)) < 1e-9 && Math.round(k) >= 1 && Math.round(k) <= 200) {
        quantidade = Math.round(k); fecha = true;
      }
    }
  } else if (decl) {
    quantidade = decl;
  }
  const partes = ['Venda de ingresso'];
  if (nat.evento) partes.push(nat.evento);
  if (quantidade && P && fecha) partes.push(`${quantidade} × ${fmtBRL(P)}`);
  else if (quantidade) partes.push(`${quantidade} ingresso${quantidade > 1 ? 's' : ''}`);
  const descricao = partes.join(' – ');

  const linhas = [];
  linhas.push(nat.evento ? `Evento: ${nat.evento}` : '❓ Evento não identificado — se quiser, me diz qual');
  const sufLote = nat.lote ? ` (${nat.lote})` : '';
  if (quantidade && P && fecha) {
    linhas.push(`${quantidade} × ${fmtBRL(P)}${sufLote}`);
  } else if (quantidade && P && !fecha) {
    linhas.push(`Quantidade: ${quantidade}`);
    linhas.push(`⚠️ ${quantidade} × ${fmtBRL(P)}${sufLote} daria ${fmtBRL(esperado)}, mas o valor é ${fmtBRL(V)} — confere (desconto? outro lote?).`);
  } else if (quantidade) {
    linhas.push(`Quantidade: ${quantidade}`);
  } else if (P && V) {
    linhas.push(`Quantidade: não deduzi — ${fmtBRL(V)} não fecha com ${fmtBRL(P)}${sufLote} por ingresso`);
  }
  linhas.push('Sem aluno — venda para fora ✓');
  return { quantidade, fecha, esperado, descricao, linhas };
}

function textoPerguntaNatureza(motivo, { valor = null, forma = null, fmtBRL }) {
  const v = valor ? `*${fmtBRL(valor)}*${forma ? ' no ' + forma : ''}` : 'Esse pagamento';
  if (motivo === 'sem_contexto') {
    return `🤔 Vi ${v} sem contexto. É *venda de ingresso*, *da lojinha* ou *pagamento de aluno*? `
      + 'Manda de novo numa linha, por exemplo: *2 ingressos LA Session R$ 80 pix* · *venda de corda R$ 60 pix* · '
      + '*parcela 10/2026 aluno Fulano R$ 400 pix*. Nada foi lançado.';
  }
  if (motivo === 'ingresso_e_parcela') {
    return `🤔 ${v === 'Esse pagamento' ? v : 'Esse ' + v} fala de ingresso e de parcela/passaporte. `
      + 'É *venda de ingresso* ou *pagamento de aluno*? Responde citando esta mensagem: *ingresso* ou *aluno*. Nada foi lançado.';
  }
  return `🤔 ${v === 'Esse pagamento' ? 'Essa venda' : 'Esse ' + v} é *venda de ingresso* ou *da lojinha*? `
    + 'Responde citando esta mensagem: *ingresso* (e o evento, se souber) ou *lojinha* (e o produto). '
    + 'Se for outra coisa, diz o que é. Nada foi lançado.';
}

// A mensagem é SÓ um valor (e talvez a forma)? "80 pix", "R$ 80,00 dinheiro".
function ehSoValorEForma(texto) {
  const n = norm(texto).replace(/[.!]+$/, '');
  return /^(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*(?:reais)?\s*(?:(?:no|na|via|em|de)\s+)?(?:pix|dinheiro|especie|cartao(?:\s+de)?(?:\s+(?:credito|debito))?|credito|debito|transferencia)?$/.test(n);
}

// Resposta à pergunta "ingresso ou lojinha?". Citando a pergunta, qualquer frase curta
// vale (inclusive "é de aluno", "é de banda"). Sem citar, só o mesmo autor e só com
// ingresso/lojinha escrito — senão o próximo caso dele ("parcela 10/2026 aluno X")
// seria sequestrado como resposta.
function ehRespostaNatureza(texto, { citou = false } = {}) {
  const n = norm(texto);
  if (!n || n.length > (citou ? 120 : 60)) return false;
  if (/r\$|\breais\b|\d+,\d{2}\b/.test(n)) return false;
  if (citou) return true;
  return ING_FORTE_RE.test(n) || RESP_LOJINHA_RE.test(n);
}

module.exports = {
  CAMINHO_PADRAO,
  carregarConfigIngressos, validarConfigIngressos, eventosAtivos, loteVigente,
  classificarNaturezaVenda, quantidadeDeclarada, rotuloLivre, valorTextoIngresso,
  resolverIngresso, textoPerguntaNatureza, ehSoValorEForma, ehRespostaNatureza,
  _norm: norm, _chave: chave,
};
