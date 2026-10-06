'use strict';
/*
 * Sol Caixa — Fatia 1 (caminho A: determinístico no bridge).
 * Comprovante cai no grupo financeiro -> monta preview "posso lançar?".
 * Membro do grupo responde "pode" -> chama a RPC guardada -> "lancei ✅".
 * O LLM NUNCA entra no caminho do dinheiro. Funções puras testáveis + handler.
 */
const fs = require('fs');
const https = require('https');
// Lote de cheques para depósito (26/09/2026). Módulo à parte, de propósito: não
// lança nada no caixa. Arquivo ausente não pode derrubar o caixa de comprovantes.
let _chequesLib = null;
try { _chequesLib = require('./caixa-cheques.cjs'); } catch (_) { _chequesLib = null; }
// Venda de ingresso (02/10/2026): trilho próprio, config de evento/lote fora do código.
// Sem o módulo a Sol não reconhece ingresso — falha fechada, o resto do caixa segue.
let _ingressosLib = null;
try { _ingressosLib = require('./caixa-ingressos.cjs'); } catch (_) { _ingressosLib = null; }
const crypto = require('crypto');
const { execFile } = require('child_process');

const ENV_CANDIDATES = [
  '/opt/LA-Organizer/.env',                       // (Sol nao le; ok)
  '/home/sol/.openclaw/gateway.systemd.env',      // fonte real (SUPABASE_SERVICE_KEY)
];

const FIN_KW = /(pix|comprovante|pago|paguei|parcela|passaporte|lojinha|venda|corda|palheta|baqueta|capotraste|afinador|cabo|transfer|dep[óo]sito|boleto|recibo|matr[íi]cula|mensalidade|pagamento)/i;
const MONEY = /r\$\s*[\d.,]+/i;
const FORMA_KW = /\b(pix|dinheiro|cart[ãa]o|cheque|transfer[êe]ncia)\b/i;

// ---- funções puras -------------------------------------------------------

// ── LEITOR MONETÁRIO pt-BR, ÚNICO E DETERMINÍSTICO (02/10/2026, Recreio 14:50) ──
// Retirada para depósito, legenda "Valor: 1.000 - dinheiro", comprovante
// Banco24Horas com "QTDE NOTAS: 020". O card saiu R$ 2,00: (1) "Valor: 1.000"
// sem "R$" não era reconhecido como dinheiro humano, então a legenda nem
// competia; (2) o OCR leu a quantidade de cédulas como "R$ 02" e o leitor
// aceitava "02" como dinheiro; (3) o modo "solto" lia "1.000" como 1 e
// "1 mil" como 1 — o mesmo erro esperava no "pode, 1.000".
// Contrato: um token só vira valor se a gramática dele for INEQUÍVOCA.
//   1.234.567,89 · 1.000 · 1234,5 · 1234,56 · 1234.56 · 1,234.56 · 1234
// Ambíguo ("1.0", "1,000", "1.000.00", "02", "020") devolve null — quem chama
// pergunta em vez de chutar.
function _centavosBR(inteiro, decimal) {
  const i = Number(inteiro);
  const d = decimal ? Number(String(decimal).padEnd(2, '0')) : 0;
  const v = Math.round(i * 100 + d) / 100;
  return Number.isFinite(v) && v > 0 && v < 1e9 ? v : null;
}
function lerNumeroMonetarioBR(bruto) {
  const s = String(bruto == null ? '' : bruto).replace(/\s+/g, '');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/))) return _centavosBR(m[1].replace(/\./g, ''), m[2]);
  if ((m = s.match(/^(\d{1,3}(?:,\d{3})+)\.(\d{2})$/))) return _centavosBR(m[1].replace(/,/g, ''), m[2]);
  if ((m = s.match(/^(\d+),(\d{1,2})$/))) return _centavosBR(m[1], m[2]);
  if ((m = s.match(/^(\d+)\.(\d{2})$/))) return _centavosBR(m[1], m[2]);
  // Inteiro com zero à esquerda é código/quantidade ("020" cédulas), nunca dinheiro.
  if ((m = s.match(/^(\d+)$/))) return /^0\d/.test(m[1]) ? null : _centavosBR(m[1], null);
  return null;
}

function parseBRMoney(s) {
  if (s === null || s === undefined) return null;
  // Só tira moldura (R$, espaço, pontuação de frase nas pontas); o miolo passa
  // inteiro pela gramática estrita.
  const t = String(s).replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  return lerNumeroMonetarioBR(t);
}

// Candidatos a dinheiro num texto, cada um com o SINAL que o marca como dinheiro:
//   rotulo_rs  "Valor pago: R$ 405,00"     rs     "R$ 1.000" / "R$ 1 mil"
//   reais      "60 reais" / "mil reais"    mil    "1 mil" / "1,5 mil" / "1 mil e 500"
//   rotulo     "Valor: 1.000"              solto  número sem sinal (só se pedido)
// Um token ambíguo ocupa a posição e não vira candidato em nenhum sinal.
const _NUM_BR = '\\d[\\d.,]*\\d|\\d';
const _SINAIS_MONETARIOS = [
  ['rotulo_rs', new RegExp('\\bvalor(?:\\s+(?:da\\s+conta|do\\s+pix|pago|total|da\\s+transa[çc][ãa]o|recebido))?\\s*[:\\-]?\\s*r\\$\\s*(' + _NUM_BR + ')(\\s*mil\\b)?', 'gid')],
  ['rs', new RegExp('r\\$\\s*(' + _NUM_BR + ')(\\s*mil\\b(?:\\s+e\\s+(\\d{1,3})(?![\\d.,]))?)?', 'gid')],
  ['reais', new RegExp('(?<![\\d.,])(' + _NUM_BR + ')(\\s*mil)?\\s*(?:reais|real)\\b', 'gid')],
  ['mil', new RegExp('(?<![\\d.,])(' + _NUM_BR + ')(\\s*mil\\b(?:\\s+e\\s+(\\d{1,3})(?![\\d.,]))?)', 'gid')],
  ['rotulo', new RegExp('\\bvalor(?:\\s+(?:total|pago|recebido))?\\s*(?:[:=\\-]|\\b(?:foi|é|eh|de)\\b)\\s*(' + _NUM_BR + ')(?![\\d/%]|\\s*x\\b)', 'gid')],
];
const _SOLTO_MONETARIO = new RegExp('(?<![\\d.,/:])(' + _NUM_BR + ')(?![\\d/%:]|\\s*x\\b)', 'gd');
function candidatosMonetariosBR(texto, { incluirSoltos = false } = {}) {
  const t = String(texto || '');
  const out = [];
  const ocupado = new Set();
  const regs = incluirSoltos ? _SINAIS_MONETARIOS.concat([['solto', _SOLTO_MONETARIO]]) : _SINAIS_MONETARIOS;
  for (const [sinal, re] of regs) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const idx = m.indices[1][0];
      if (ocupado.has(idx)) continue;
      ocupado.add(idx);
      const base = lerNumeroMonetarioBR(m[1]);
      if (base == null) continue;
      const ehMil = !!(m[2] && /mil/i.test(m[2]));
      const extra = ehMil && m[3] ? Number(m[3]) : 0;
      const valor = ehMil ? _centavosBR(String(Math.round(base * 1000 + extra)), null) : base;
      if (valor) out.push({ valor, idx, sinal, bruto: m[0].trim() });
    }
  }
  const milSo = /(?<![\d.,]\s*)\bmil\s+reais\b/gi;
  let mm;
  while ((mm = milSo.exec(t)) !== null) {
    if (!ocupado.has(mm.index)) { ocupado.add(mm.index); out.push({ valor: 1000, idx: mm.index, sinal: 'reais', bruto: mm[0] }); }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// 🔴 NÚMERO QUE VEM DE MODELO NÃO É TEXTO BRASILEIRO (28/09/2026, Recreio).
// O roteador devolve JSON: `"valor_total": 402.5`. `parseBRMoney(String(402.5))`
// lê "402.5" com o ponto como MILHAR e devolve 4025 — e a guarda de valor recusava
// o comprovante certo ("o valor total que li não confere"). Todo valor cujo
// centavo termina em zero cai nisso (402,50 → 402.5 no JSON). O caso que o
// cabeçalho da guarda atribuía ao modelo ("R$ 2.034,90 virou 20.349") era ESTE
// defeito: "2034.9" → 20349. Número de JSON é número; texto "402.50" é decimal;
// só o resto ("1.500", "402,50", "R$ 1.397,00") passa pelo leitor brasileiro.
function valorDoModelo(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  const s = String(v).trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  return parseBRMoney(s);
}


// Prioridade dos sinais: o rótulo do comprovante ("Valor pago R$ X") vence o
// primeiro R$ (tarifa, R$ 0,00); "R$" vence "reais"/"mil"/"Valor:"; número
// solto só quando o chamador pede (resposta curta a "me manda o valor").
const _PRIORIDADE_SINAL = ['rotulo_rs', 'rs', 'reais', 'mil', 'rotulo', 'solto'];
function extrairValor(text, { allowBare = false } = {}) {
  if (!text) return null;
  const cands = candidatosMonetariosBR(text, { incluirSoltos: allowBare });
  for (const sinal of _PRIORIDADE_SINAL) {
    const c = cands.find((x) => x.sinal === sinal);
    if (c) return c.valor;
  }
  return null;
}

function valoresMonetarios(texto) {
  return candidatosMonetariosBR(texto)
    .filter((c) => c.sinal === 'rs' || c.sinal === 'rotulo_rs')
    .map((c) => ({ valor: c.valor, idx: c.idx }));
}

// ARBITRAGEM LEGENDA × COMPROVANTE. O humano declarou um valor e a imagem
// mostra outro: ninguém chuta. Única exceção, por invariante e não por exemplo:
// o OCR perdeu a vírgula decimal (o inteiro lido é exatamente o valor humano em
// centavos: "387,00" → 38700). Comprovante sozinho com leitura de baixa
// confiança também vira pergunta.
// `declarados` = todos os valores que a pessoa escreveu. Legenda com itens e
// total ("A R$ 1.290 · B R$ 432 · total R$ 1.722") não conflita quando o
// comprovante bate com um deles ou com a soma: aí o valor principal segue o
// de sempre e os fluxos de composto/multi decidem a divisão.
function arbitrarValorComprovante({ humano, declarados = [], comprovante, comprovanteBaixaConfianca = false } = {}) {
  const r2 = (v) => (Number(v) > 0 && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
  const h = r2(humano);
  const c = r2(comprovante);
  if (h && c) {
    const cc = Math.round(c * 100);
    if (Math.round(h * 100) === cc) return { valor: h, motivo: 'concordam', conflito: null };
    if (Number.isInteger(c) && c === Math.round(h * 100)) return { valor: h, motivo: 'ocr_perdeu_virgula', conflito: null };
    const decl = (Array.isArray(declarados) ? declarados : []).map(r2).filter(Boolean).map((v) => Math.round(v * 100));
    if (decl.length >= 2 && (decl.includes(cc) || decl.reduce((a, b) => a + b, 0) === cc)) {
      return { valor: h, motivo: 'comprovante_bate_com_valor_declarado', conflito: null };
    }
    return { valor: null, motivo: 'conflito_legenda_comprovante', conflito: { legenda: h, comprovante: c } };
  }
  if (h) return { valor: h, motivo: 'so_legenda', conflito: null };
  if (c && comprovanteBaixaConfianca) return { valor: null, motivo: 'comprovante_baixa_confianca', conflito: null, baixaConfianca: true };
  if (c) return { valor: c, motivo: 'so_comprovante', conflito: null };
  return { valor: null, motivo: 'sem_valor', conflito: null };
}

function extrairSomaAditivaPagamento(texto) {
  const t = String(texto || '');
  if (!t || !/\+/.test(t)) return null;
  if (/=/.test(t)) return null;
  const valores = valoresMonetarios(t);
  if (valores.length < 2) return null;
  const soma = valores.reduce((s, m) => s + Number(m.valor || 0), 0);
  return soma > 0 ? { total: Number(soma.toFixed(2)), partes: valores.map((m) => m.valor) } : null;
}

// Multi-aluno é uma intenção de negócio, não uma variação de pagamento composto.
// Esta função só roteia para o fluxo seguro; ela nunca escolhe aluno, valor ou fatura.
// A LINHA "Nome — R$ valor" TEM UMA REGRA SO. Ela e' lida em dois lugares (o
// detector, que decide se e' multi, e o parser, que extrai os itens); ate 05/09
// eram duas copias da mesma regex, com o mesmo defeito nas duas.
//   · APOSTROFO E PONTO entram no nome: Sant'Anna, D'Angelo, Jr. — recusa-los
//     derrubou 2 dos 3 alunos do lote da Vitoria (Recreio 05/09).
//   · O TRACO E' OPCIONAL quando o valor traz "R$". A equipe escreve "Marcio
//     Sant'Anna R$395,00"; exigir o travessao que a Sol ENSINA e' exigir um
//     caractere que nao existe no teclado do celular.
//   · Sem traco o "R$" e' OBRIGATORIO — e' ele que marca a fronteira e impede
//     que "Parcela 3 12 395,00" vire nome de aluno.
const _TOKEN_NOME_SOL = "[a-zà-ÿA-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý.'’]+";
const _RE_LINHA_NOME_VALOR = new RegExp(
  "^\\s*(" + _TOKEN_NOME_SOL + "(?:\\s+" + _TOKEN_NOME_SOL + "){1,4})" +
  "\\s*(?:[-–—]\\s*(?:r\\$\\s*)?|r\\$\\s*)(\\d[\\d.,]*)\\s*$", "i");
// Rotulo de operacao no inicio da linha nunca e' nome de gente. Sem isto,
// "Passaporte do Canto R$400" viraria um "aluno" chamado Passaporte do Canto.
const _RE_NAO_E_NOME_NA_LINHA = /^(?:parcelas?|passaportes?|taxas?|total|subtotal|valor(?:es)?|matr[ií]culas?|mensalidades?|pagamentos?|recebidos?|entradas?|sa[ií]das?|descontos?|multa|juros)\b/i;
// Devolve { nome, valor } quando a linha e' "Nome — R$ valor"; senao null.
// 🔴 A ADM escreve contexto antes da lista: "parcelas de setembro, alunos,
//    Lúcia Lai Keun Dang Silva - R$385,00". A guarda de rotulo barrava a linha
//    inteira e o aluno SUMIA — 2 itens de 3, soma divergente, e a Sol pedindo a
//    divisão que ja estava na tela (Recreio, 08/09, 17 minutos de ida e volta).
// ⚠️ So corta em virgula seguida de LETRA: a virgula do centavo ("385,00")
//    deixaria "00" como nome. E linha sem virgula ("Passaporte do Canto -
//    R$400") continua barrada, que e a razao de a guarda existir.
function _tentaDepoisDoContexto(linha) {
  const t = String(linha || '');
  const cortes = [];
  const re = /,(?=\s*[A-Za-zÀ-ÿ])/g;
  let m;
  while ((m = re.exec(t)) !== null) cortes.push(m.index);
  if (!cortes.length) return null;
  const cauda = t.slice(cortes[cortes.length - 1] + 1);
  const mm = cauda.match(_RE_LINHA_NOME_VALOR);
  if (!mm) return null;
  const nome = mm[1].replace(/\s+/g, ' ').trim();
  if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) return null;   // rótulo de novo: desiste
  return { nome, bruto: mm[2] };
}
function _linhaNomeValorSol(linha) {
  const m = String(linha || '').match(_RE_LINHA_NOME_VALOR);
  // ⚠️ DOIS caminhos levam a cauda, e a 1a versao deste patch so cobria um.
  //    A linha real NEM CASOU o formato: "parcelas de setembro, alunos, Lucia
  //    Lai Keun Dang Silva" tem 9 palavras e o nome aceita no maximo 5. Entao
  //    tentar a cauda so quando a guarda de rotulo dispara nao resolvia nada —
  //    a prova com o codigo real mostrou isso antes de eu subir.
  let nome; let bruto;
  if (!m) {
    const alt = _tentaDepoisDoContexto(linha);
    if (!alt) return null;
    nome = alt.nome; bruto = alt.bruto;
  } else {
    nome = m[1].replace(/\s+/g, ' ').trim();
    bruto = m[2];
    if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) {
      const alt = _tentaDepoisDoContexto(linha);
      if (!alt) return null;
      nome = alt.nome; bruto = alt.bruto;
    }
  }
  const valor = parseBRMoney(bruto);
  if (!valor || valor <= 0) return null;
  return { nome, valor };
}

// 🔴 Multi-aluno so nasce do que o HUMANO escreveu — nunca do OCR (dois
// falsos positivos reais em 28 e 29/08). O modelo le legenda+OCR juntos, entao
// aqui conferimos que cada nome que ele listou aparece de fato na LEGENDA.
// Basta o primeiro nome bater: a legenda costuma abreviar ("Davi Guilherme"
// para "Davi Guilherme de Souza Chaves Ribeiro").
function pagamentosNaLegenda(pagamentos, legenda) {
  const leg = _normConf(legenda || '');
  if (!leg || !Array.isArray(pagamentos) || pagamentos.length < 2) return [];
  return pagamentos.filter((p) => {
    const nome = _normConf(p && p.aluno);
    if (!nome) return false;
    const primeiro = nome.split(/\s+/)[0];
    return primeiro.length >= 3 && leg.includes(primeiro);
  });
}

// 🔴 29/09/2026 (Recreio): "a parcela dos cursos bateria e piano" de UMA aluna virou
//    "mais de um aluno" — o detector lia "bateria e piano" como dois nomes. Nome de curso/
//    instrumento ligado por "e" é UMA pessoa com dois cursos (o Report guarda uma linha
//    por curso; 150 alunos ativos têm 2+). As frases de curso saem ANTES da detecção.
const _INSTR_CURSO = '(?:bateria|piano|teclado|violao|viola|guitarra|contrabaixo|baixo|canto|tecnica vocal|violino|violoncelo|cello|ukulele|cavaquinho|flauta|saxofone|sax|trompete|musicalizacao|percussao|harpa|acordeon|sanfona|producao musical|teoria musical)';
const _CURSO_FRASE_RE = new RegExp(`\\b(?:cursos?|aulas?)\\s+(?:(?:de|do|da)\\s+)?${_INSTR_CURSO}(?:\\s*(?:,|\\be\\b|\\+|&)\\s*(?:(?:de|do|da)\\s+)?${_INSTR_CURSO})*\\b`, 'g');
const _INSTR_PAR_RE = new RegExp(`\\b${_INSTR_CURSO}\\s*(?:\\be\\b|\\+|&)\\s*${_INSTR_CURSO}\\b`, 'g');
function _semFrasesDeCurso(t) {
  return String(t || '').replace(_CURSO_FRASE_RE, ' curso ').replace(_INSTR_PAR_RE, ' cursos ')
    .replace(/\bcursos?(?:\s*(?:,|\be\b|\+|&)\s*cursos?)+\b/g, ' cursos ')
    .replace(/\s+/g, ' ').trim();
}

function detectarContextoMultiAluno(texto) {
  const t0 = _normConf(texto);
  if (!t0) return false;
  const t = _semFrasesDeCurso(t0);
  // Mais de um curso citado e nenhuma marca de mais de uma PESSOA: "R$ 500 cada" é por curso.
  const variosCursos = t !== t0 && /\bcursos\b|\bcurso\b[^\n]{0,40}\bcurso\b/.test(t);

  // NOMES_LIGADOS: dois (ou mais) NOMES PROPRIOS ligados por "e" / "+" / "&".
  // Exige 2+ palavras alfabeticas de CADA lado -- e' o que separa
  //   "Daniel Da Hora Marinho e Arthur Da Hora Marinho"   (2 pessoas)
  // de
  //   "Parcela 07/26 + 08/26 aluno Arthur Martins"        (o "+" liga DATAS)
  //   "Joao Pedro de Almeida e Souza"                     (sobrenome com "e")
  const nomesLigados = /\b[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\s*(?:\be\b|\+|&)\s*[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\b/.test(t);

  // "350,00 cada" / "cada um": valor POR CABECA so existe com 2+ pessoas.
  const valorPorCabeca = !variosCursos && /\b\d{2,4}(?:[.,]\d{2})?\s*(?:reais\s*)?cada\b|\bcada\s+um\b/.test(t);

  const pluralidade = /\b(?:dois|2|ambos|mais de um|varios|varias)\s+alun(?:o|os|a|as)\b|\balunos\b|\bpassaportes\b/.test(t);
  const nomesEmConjunto = /\balunos?\b[\s:\-]+[^\n]{3,120}\s+\be\s+[^\n]{3,120}/.test(t)
    || /\b(?:joao|maria|pedro|ana)\b[^\n]{0,80}\s+\be\s+[^\n]{3,80}/.test(t);
  // A legenda operacional costuma vir no singular ("Passaporte de Joao e
  // Pedro"), mas descreve duas pessoas. Esse e' contexto forte de lote: a
  // regra so roteia para revisao/intent multi e jamais escolhe uma delas.
  const categoriaComDoisNomes = /\b(?:passaportes?|taxas?\s+de\s+matriculas?|matriculas?|parcelas?|mensalidades?|pagamentos?)\s+(?:de|do|da|dos|das)\s+[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}?\s+e\s+[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}?(?=\s*(?:[-–—]|r\$|$))/.test(t);

  // O FORMATO QUE A PROPRIA SOL ENSINA ("João — R$ 360 / Pedro — R$ 360"):
  // duas ou mais linhas "Nome — R$ valor". Em 01/09 o Jhon mandou exatamente
  // assim e o detector nao reconhecia — o fluxo caiu no single e ignorou o
  // segundo aluno e o total do PIX. A linha da unidade ("LA CG - R$...") nao
  // conta como pessoa.
  const linhasNomeValor = (String(texto || '').split(/\n/)
    .map(_linhaNomeValorSol)
    .filter((x) => x && !new RegExp(_UNIDADE_TAG.source, 'i').test(x.nome))
  ).length >= 2;

  return linhasNomeValor
    || categoriaComDoisNomes
    || nomesLigados
    || valorPorCabeca
    || (pluralidade && (nomesEmConjunto || /\b(?:dois|2|ambos|mais de um)\b/.test(t)));
}

function validarIntencaoMultiAluno(raw, valorComprovante, defaults = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, motivo: 'intencao_ausente' };
  const itensRaw = Array.isArray(raw.itens) ? raw.itens : [];
  // O valor do comprovante vem do OCR/visão e é a evidência financeira
  // observada. A interpretação livre só pode completar campos textuais;
  // nunca pode substituir esse total (ex.: 720 virar 20 por erro de LLM).
  const total = Number(valorComprovante || raw.valor_total || 0);
  const categoriaPadrao = String(raw.categoria || defaults.categoria || '').toLowerCase() || null;
  const forma = String(raw.forma || defaults.forma || '').toLowerCase() || null;
  const competenciaPadrao = raw.competencia || defaults.competencia || null;
  if (itensRaw.length < 2) return { ok: false, motivo: 'dois_itens_obrigatorios', total, forma, categoria: categoriaPadrao };
  const itens = itensRaw.map((item) => ({
    aluno_nome: tituloNome(item && (item.aluno_nome || item.aluno || '')),
    valor: item && item.valor != null && item.valor !== '' ? Number(item.valor) : null,
    competencia: item && item.competencia || competenciaPadrao || null,
    categoria: String(item && item.categoria || categoriaPadrao || '').toLowerCase() || null,
  }));
  if (!total || !itens.every((i) => nomePlausivel(i.aluno_nome) && i.categoria)) {
    return { ok: false, motivo: 'itens_incompletos', total, forma, categoria: categoriaPadrao, itens };
  }
  // Sem alocação explícita, o banco é a única fonte que pode completar os
  // valores: cada aluno precisa ter uma fatura canônica inequívoca e a soma
  // precisa fechar com o comprovante. Não dividimos total no bridge.
  const itensComValor = itens.filter((i) => i.valor != null && i.valor > 0);
  if (itensComValor.length > 0 && itensComValor.length !== itens.length) {
    return { ok: false, motivo: 'alocacao_parcial', total, forma, categoria: categoriaPadrao, itens };
  }
  if (itensComValor.length === 0) {
    return { ok: true, tipo_recebimento: 'multi_aluno', valor_total: total, forma, categoria: categoriaPadrao, itens,
      alocacao: 'derivar_da_fatura_canonica' };
  }
  const soma = Number(itens.reduce((s, i) => s + i.valor, 0).toFixed(2));
  if (Math.abs(soma - total) > 0.01) return { ok: false, motivo: 'soma_divergente', total, soma, forma, categoria: categoriaPadrao, itens };
  return { ok: true, tipo_recebimento: 'multi_aluno', valor_total: total, forma, categoria: categoriaPadrao, itens, soma_itens: soma,
    alocacao: 'informada' };
}

// O formato que a Sol ENSINA ("Nome — R$ valor" por linha) e' protocolo, nao
// conversa: parseavel sem LLM. Linha da unidade ("LA CG - R$1.722,00") vira o
// TOTAL declarado. Em 01/09 18:28 a divisao completa do Jhon caiu na parede
// porque o interpretador LLM estourou 30s — latencia decidindo dinheiro.
function extrairItensNomeValor(texto) {
  const unidadeRe = new RegExp(_UNIDADE_TAG.source, 'i');
  const itens = []; let totalDeclarado = null;
  for (const l of String(texto || '').split(/\n/)) {
    const m = _linhaNomeValorSol(l);
    if (!m) continue;
    if (unidadeRe.test(m.nome)) { totalDeclarado = m.valor; continue; }
    if (!nomePlausivel(m.nome)) continue;
    itens.push({ aluno_nome: m.nome, valor: m.valor });
  }
  return { itens, totalDeclarado };
}

const PRODUTO_LOJINHA_RE = /\b(lojinha|loja|cordas?|palhetas?|baquetas?|capotraste|afinador(?:es)?|cabos?|correia|encordoamento|livro|apostila|camisetas?|camisas?|cadernos?|bolsas?)\b/i;
function detectarLojinhaProduto(texto) {
  const t = String(texto || '');
  if (/passaporte|taxa\s+de\s+matr[íi]cula/i.test(t)) return null;
  if (!PRODUTO_LOJINHA_RE.test(t)) return null;
  let item = null;
  // Item específico antes de "corda": "caderno de cordas" é caderno, não corda.
  {
    const mItem = t.match(/\b(palheta|baqueta|capotraste|afinador|cabo|correia|encordoamento|livro|apostila|camiseta|camisa|caderno|bolsa)(?:\s+de\s+([a-zA-ZÀ-ÿ]+))?/i);
    if (mItem) item = tituloNome(mItem[1] + (mItem[2] ? ' de ' + mItem[2] : ''));
    // "caderno teclas" (Barra 06/10): o "de" some no ditado, o instrumento não.
    const mSemDe = mItem && !mItem[2] && t.match(/\b(caderno|livro|apostila)\s+(teclas|teclado|piano|guitarra|bateria|baixo|canto|ukulele|partitura|cifras?)\b/i);
    if (mSemDe) item = tituloNome(mSemDe[1] + ' de ' + mSemDe[2]);
  }
  if (!item) {
    const mCorda = t.match(/\bcorda(?:s)?(?:\s+de\s+([a-zA-ZÀ-ÿ]+))?/i);
    if (mCorda) item = 'Corda' + (mCorda[1] ? ' de ' + tituloNome(mCorda[1]) : '');
  }
  if (!item && !/\b(lojinha|loja)\b/i.test(t)) return null;
  return { categoria: 'lojinha', item: item || 'Produto de lojinha' };
}

// Venda de ingresso e receita de EVENTO, nao mensalidade nem produto de lojinha.
// A decisao mora em caixa-ingressos.cjs (sinal explicito, nunca o valor); aqui so
// entram os detectores do caixa que ela reaproveita: a lista de produtos da lojinha
// (um produto citado vence alias de evento) e a saida declarada.
function naturezaVendaDoTexto(texto, { config = null, unidade = null, resposta = null, agora = Date.now() } = {}) {
  if (!_ingressosLib) return null;
  return _ingressosLib.classificarNaturezaVenda(texto, { config, unidade, resposta, agora,
    detectarProduto: detectarLojinhaProduto, saidaExplicita: _saidaExplicitaFromCaption });
}

// OCR de cupom nao tem "R$": aceita 5.700,00 / 1.234,56 (decimal obrigatorio, pra nao
// confundir com CNPJ, NSU, AUT, data ou numero de terminal).
function extrairValorOcr(text) {
  return extrairValorOcrDetalhado(text).valor;
}

// Mesma leitura, com a FONTE e a confiança. Baixa confiança = nenhum total
// rotulado e mais de um valor distinto possível no comprovante: escolher o
// primeiro seria chute.
function extrairValorOcrDetalhado(text) {
  const t = String(text || '');
  const semTributos = t.split('\n')
    .filter((l) => !/trib|ibpt|federal|estadual|municipal/i.test(l))
    .join('\n');
  const valor = _extrairValorOcrBruto(t);
  if (!valor) return { valor: null, fonte: null, baixaConfianca: false, candidatos: [] };
  const RE_TOTAL = /(?:valor\s+total|total\s+a\s+pagar|valor\s+pago|valor\s+a\s+pagar|vl\.?\s*total|subtotal)[^\d\n]{0,12}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[.,]\d{2})/i;
  const rotulados = candidatosMonetariosBR(semTributos).filter((c) => c.sinal === 'rotulo_rs');
  const fonte = (RE_TOTAL.test(semTributos) || rotulados.length) ? 'rotulo' : 'sem_rotulo';
  const distintos = new Set(candidatosMonetariosBR(semTributos).filter((c) => c.sinal === 'rs').map((c) => Math.round(c.valor * 100)));
  const reDec = /(?<![\d.,:\/-])(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,6},\d{2})(?![\d.,:\/-])/g;
  let m;
  while ((m = reDec.exec(semTributos)) !== null) {
    const v = parseBRMoney(m[1]);
    if (v && v < 1000000) distintos.add(Math.round(v * 100));
  }
  const candidatos = [...distintos].map((c) => c / 100);
  return { valor, fonte, baixaConfianca: fonte !== 'rotulo' && candidatos.length > 1, candidatos };
}

function _extrairValorOcrBruto(text) {
  const t = String(text || '');
  // A Lei da Transparencia poe "Tributos aproximados: Federal R$ 5,01 ..." em TODO
  // cupom fiscal — e quando o R$ do total sai sujo do OCR ("Subtotal R$ y 34,00",
  // "Valor Total R$" sem numero por quebra de linha), o primeiro R$ LIMPO do texto
  // e o do tributo. Caso real: card dos 2 refrigerantes nasceu com R$ 5,01
  // (Recreio, 28/08/2026). Linhas de tributo saem ANTES de qualquer extracao.
  const semTributos = t.split('\n')
    .filter((l) => !/trib|ibpt|federal|estadual|municipal/i.test(l))
    .join('\n');
  // 1) total rotulado, tolerante a ruido de OCR entre o rotulo e o numero
  //    ("Subtotal R$ y 34,00" — o [^\d\n]{0,12} atravessa o " R$ y ").
  //    Total antes de subtotal: com desconto, subtotal > pago.
  const RE_NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d{1,6}[.,]\\d{2})';
  for (const rotulo of ['(?:valor\\s+total|total\\s+a\\s+pagar|valor\\s+pago|valor\\s+a\\s+pagar|vl\\.?\\s*total)', 'subtotal']) {
    const m0 = new RegExp(rotulo + '[^\\d\\n]{0,12}' + RE_NUM, 'i').exec(semTributos);
    if (m0) {
      const bruto = m0[1].includes(',') ? m0[1] : m0[1].replace('.', ',');
      const v = parseBRMoney(bruto);
      if (v && v < 1000000) return v;
    }
  }
  const comRotulo = extrairValor(semTributos);
  if (comRotulo) return comRotulo;
  const re = /(?<![\d.,:\/-])(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,6},\d{2})(?![\d.,:\/-])/g;
  let m;
  while ((m = re.exec(semTributos)) !== null) {
    const v = parseBRMoney(m[1]);
    if (v && v < 1000000) return v;
  }
  return null;
}

// Cupom de cartao (PagBank/Cielo/Stone): bandeira, modalidade e parcelas.
const SINAL_CARTAO = /(\bvisa\b|master(?:card)?|elo\b|amex|hipercard|cr[eé]dito|d[eé]bito|\bnsu\b|pagbank|cielo|stone|getnet|rede\b|autorizado com senha|venda\s+cr[eé]dito|venda\s+d[eé]bito)/i;
// Sinal de maquininha que NAO depende da palavra solta "debito"/"credito".
// Cupom de cartao carrega bandeira, NSU ou adquirente; comprovante de Pix nao.
const SINAL_CARTAO_FORTE = /(\bvisa\b|master(?:card)?|elo\b|amex|hipercard|\bnsu\b|pagbank|cielo|stone|getnet|rede\b|autorizado com senha|venda\s+cr[eé]dito|venda\s+d[eé]bito|cart[aã]o\s+(?:de\s+)?(?:cr[eé]dito|d[eé]bito))/i;
function extrairCartao(text) {
  // "Debito em conta" / "credito em conta corrente" e' lancamento BANCARIO, nao
  // maquininha — sai do texto antes de qualquer teste de sinal de cartao.
  const t = String(text || '').replace(/\b(d[eé]bito|cr[eé]dito)\s+(?:em|na|no|de|da|do)\s+(?:c\/c|conta|cc)\b/gi, ' ');
  if (!SINAL_CARTAO.test(t)) return null;
  // 🔴 PIX EXPLICITO VENCE. Comprovante de Pix diz "Debito em conta" e o
  // SINAL_CARTAO aceita a palavra sozinha — foi assim que 6 comprovantes de pix
  // viraram "cartao debito" em 3 dias (03-05/09/2026). Sinal FORTE de
  // maquininha continua valendo mesmo com "pix" no texto: cupom nunca diz pix.
  if (/\bpix\b/i.test(t) && !SINAL_CARTAO_FORTE.test(t)) return null;
  const debito = /(d[eé]bito)/i.test(t) && !/(cr[eé]dito)/i.test(t);
  let parcelas = null;
  // A legenda humana costuma vir como "cartão de crédito 2x", sem "em" nem
  // "sem juros". O sinal de cartão já foi provado acima; só aqui o `2x` pode
  // virar parcela, para não capturar quantidade solta em Pix/dinheiro.
  const m = t.match(/em\s+(\d{1,2})\s*(?:x|parcelas?|vezes)/i)
    || t.match(/(\d{1,2})\s*x\s*(?:de|sem juros)/i)
    || t.match(/\b(\d{1,2})\s*x\b/i);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 24) parcelas = n; }
  return { forma: 'cartao', modalidade: debito ? 'debito' : 'credito', parcelas: debito ? null : parcelas };
}

function extrairForma(text, dflt = 'pix') {
  const t = String(text || '');
  // "Transferência Pix realizada" é como vários bancos rotulam Pix. Nesses
  // casos Pix é a forma real; "transferência" é só o tipo de movimentação.
  if (/\bpix\b/i.test(t)) return 'pix';
  const m = t.match(FORMA_KW);
  if (!m) return dflt;
  const w = m[1].toLowerCase();
  if (w.startsWith('cart')) return 'cartao';
  if (w.startsWith('transfer')) return 'transferencia';
  return w; // pix | dinheiro | cheque
}

// A forma escrita pela pessoa que enviou o comprovante e evidencia de negocio,
// enquanto OCR/visao sao apenas leitura probabilistica do documento. Mantemos
// essa distincao explicita para que um ruido de maquininha, bandeira ou palavra
// "credito" na imagem nunca sobrescreva "PG PIX" escrito pela equipe.
//
// Se a legenda humana citar duas formas, nao escolhemos nenhuma: o preview fica
// incompleto e pede confirmacao. A unica excecao e o rotulo bancario comum
// "transferencia Pix", que continua sendo Pix.
function extrairFormaHumana(text) {
  const bruto = bodyLimpo(text);
  if (!bruto) return { forma: null, cartaoModalidade: null, cartaoParcelas: null, ambigua: false, formas: [] };

  const t = _normConf(bruto)
    .replace(/\b(debito|credito)\s+(?:em|na|no|de|da|do)\s+(?:c\/c|conta|cc)\b/gi, ' ');
  const formas = new Set();
  if (/\bpix\b/i.test(t)) formas.add('pix');
  if (/\bdinheiro\b/i.test(t)) formas.add('dinheiro');
  if (/\bcheque\b/i.test(t)) formas.add('cheque');

  const cartao = extrairCartao(t);
  if (cartao && /\b(cartao|credito|debito|visa|master(?:card)?|elo|amex|hipercard)\b/i.test(t)) {
    formas.add('cartao');
  }
  // Bancos chamam Pix de "transferencia Pix". Nesse par, Pix e a forma real.
  if (!formas.has('pix') && /\btransfer(?:encia|ir|ido|ida)?\b/i.test(t)) formas.add('transferencia');

  if (formas.size > 1) {
    return { forma: null, cartaoModalidade: null, cartaoParcelas: null,
      ambigua: true, formas: Array.from(formas) };
  }
  const forma = formas.size === 1 ? Array.from(formas)[0] : null;
  if (forma === 'cartao') {
    return { forma, cartaoModalidade: cartao && cartao.modalidade || null,
      cartaoParcelas: cartao && cartao.parcelas || null, ambigua: false, formas: [forma] };
  }
  return { forma, cartaoModalidade: null, cartaoParcelas: null,
    ambigua: false, formas: forma ? [forma] : [] };
}

// ENVELOPE DE EVIDENCIAS V1 — evolui o envelope que ja existe; nao cria um
// segundo transporte nem uma segunda fonte de verdade do lancamento.
//
// O defeito que esta camada impede e sutil: legenda, OCR, visao, banco e LLM
// ja chegam ao mesmo fluxo, mas historicamente cada campo escolhia sua fonte
// em um bloco diferente. Isso deixa a precedencia virar uma colecao de guards
// locais. Aqui todas as fontes falam o mesmo contrato e UM resolvedor decide,
// em shadow, qual evidencia venceria e por que.
const PRIORIDADE_EVIDENCIA_V1 = Object.freeze({
  correcao_humana_explicita: 110,
  texto_humano_explicito: 100,
  documento_inequivoco: 90,
  banco_canonico: 80,
  ocr: 60,
  visao: 50,
  llm: 40,
});

const CONFIANCA_EVIDENCIA_V1 = Object.freeze({
  correcao_humana_explicita: 1,
  texto_humano_explicito: 1,
  documento_inequivoco: 0.99,
  banco_canonico: 1,
  ocr: 0.55,
  visao: 0.65,
  llm: 0.6,
});

function _normalizarConfiancaEvidencia(v, fallback) {
  let n = (v === null || v === undefined || v === '') ? Number.NaN : Number(v);
  if (!Number.isFinite(n)) n = Number(fallback);
  if (n > 1) n /= 100;
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function _normalizarValorEvidencia(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (campo === 'valor_total') {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
  }
  if (campo === 'cartao_parcelas') {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
  }
  const s = String(valor).trim();
  if (!s) return null;
  if (['forma', 'cartao_modalidade', 'categoria'].includes(campo)) return _normConf(s);
  if (campo === 'competencia') {
    const m = s.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
    if (m) return String(m[1]).padStart(2, '0') + '/' + m[2];
    const iso = s.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
    return iso ? iso[2] + '/' + iso[1] : s;
  }
  return s.replace(/\s+/g, ' ');
}

function criarCandidatoEvidencia(campo, valor, fonte, opcoes = {}) {
  const normalizado = _normalizarValorEvidencia(campo, valor);
  if (normalizado === null) return null;
  const prioridade = PRIORIDADE_EVIDENCIA_V1[fonte];
  if (!Number.isFinite(prioridade)) return null;
  return {
    campo,
    valor: normalizado,
    fonte,
    prioridade,
    confianca: _normalizarConfiancaEvidencia(
      opcoes.confianca,
      CONFIANCA_EVIDENCIA_V1[fonte]
    ),
    evidencia_id: opcoes.evidencia_id || null,
  };
}

function resolverCampoEvidencia(campo, candidatos = []) {
  const validos = (Array.isArray(candidatos) ? candidatos : [])
    .map((c) => criarCandidatoEvidencia(
      campo,
      c && c.valor,
      c && c.fonte,
      { confianca: c && c.confianca, evidencia_id: c && c.evidencia_id }
    ))
    .filter(Boolean)
    .sort((a, b) => b.prioridade - a.prioridade || b.confianca - a.confianca);
  if (!validos.length) {
    return { campo, status: 'ausente', valor: null, fonte: null, confianca: 0, candidatos: [] };
  }
  const topo = validos.filter((c) => c.prioridade === validos[0].prioridade);
  const valoresTopo = [...new Set(topo.map((c) => JSON.stringify(c.valor)))];
  if (valoresTopo.length > 1) {
    return { campo, status: 'conflito', valor: null, fonte: topo[0].fonte,
      confianca: Math.max(...topo.map((c) => c.confianca)), candidatos: validos };
  }
  const vencedor = topo[0];
  const discordancias = validos.filter((c) => JSON.stringify(c.valor) !== JSON.stringify(vencedor.valor));
  return { campo, status: 'resolvido', valor: vencedor.valor, fonte: vencedor.fonte,
    confianca: vencedor.confianca, candidatos: validos, discordancias: discordancias.length };
}

function _valorHumanoInequivoco(texto) {
  const soma = extrairSomaAditivaPagamento(texto);
  if (soma && soma.total) return soma.total;
  const vals = valoresMonetarios(texto).map((x) => Number(x.valor));
  if (vals.length === 1) return vals[0];
  if (!vals.length) return null;
  const totalRotulado = String(texto || '').match(/\b(?:valor\s+)?total\b[^\d]{0,20}r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (totalRotulado) return parseBRMoney(totalRotulado[1]);
  const ultimo = vals[vals.length - 1];
  const somaAnteriores = Number(vals.slice(0, -1).reduce((a, b) => a + b, 0).toFixed(2));
  return vals.length >= 3 && Math.abs(ultimo - somaAnteriores) < 0.01 ? ultimo : null;
}

function construirEnvelopeEvidenciasV1({ textoHumano = '', ocrText = '', ocrMeta = null,
  visao = null, llm = null, banco = null, extras = [] } = {}) {
  const porCampo = new Map();
  const add = (campo, valor, fonte, opcoes = {}) => {
    const c = criarCandidatoEvidencia(campo, valor, fonte, opcoes);
    if (!c) return;
    if (!porCampo.has(campo)) porCampo.set(campo, []);
    porCampo.get(campo).push(c);
  };
  const humano = bodyLimpo(textoHumano);
  const fh = extrairFormaHumana(humano);
  if (fh.ambigua) fh.formas.forEach((f) => add('forma', f, 'texto_humano_explicito'));
  else {
    add('forma', fh.forma, 'texto_humano_explicito');
    add('cartao_modalidade', fh.cartaoModalidade, 'texto_humano_explicito');
    add('cartao_parcelas', fh.cartaoParcelas, 'texto_humano_explicito');
  }
  add('valor_total', _valorHumanoInequivoco(humano), 'texto_humano_explicito');
  add('competencia', extrairCompetenciaTexto(humano), 'texto_humano_explicito');
  add('categoria', _categoriaExplicitaFromCaption(humano) || _categoriaFromCaption(humano), 'texto_humano_explicito');
  add('aluno', _alunoRotulado(humano), 'texto_humano_explicito');

  const correcao = String(llm && llm.intencao || '');
  if (correcao.startsWith('corrigir_')) {
    if (correcao === 'corrigir_forma') add('forma', llm.forma, 'correcao_humana_explicita');
    if (correcao === 'corrigir_valor') add('valor_total', llm.valor, 'correcao_humana_explicita');
    if (correcao === 'corrigir_competencia') add('competencia', llm.competencia, 'correcao_humana_explicita');
    if (correcao === 'corrigir_categoria') add('categoria', llm.categoria, 'correcao_humana_explicita');
    if (correcao === 'corrigir_aluno') add('aluno', llm.aluno_nome, 'correcao_humana_explicita');
  }

  const confOcr = ocrMeta && ocrMeta.ocr_confidence;
  const fo = extrairForma(ocrText, null);
  const co = extrairCartao(ocrText);
  add('forma', co ? 'cartao' : fo, 'ocr', { confianca: confOcr });
  add('cartao_modalidade', co && co.modalidade, 'ocr', { confianca: confOcr });
  add('cartao_parcelas', co && co.parcelas, 'ocr', { confianca: confOcr });
  add('valor_total', extrairValorOcr(ocrText), 'ocr', { confianca: confOcr });
  add('competencia', extrairCompetenciaTexto(ocrText), 'ocr', { confianca: confOcr });

  if (visao && typeof visao === 'object') {
    add('forma', visao.forma, 'visao', { confianca: visao.confianca });
    add('valor_total', visao.valor, 'visao', { confianca: visao.confianca });
    add('aluno', visao.aluno, 'visao', { confianca: visao.confianca });
    add('pagador', visao.pagador_nome, 'visao', { confianca: visao.confianca });
  }
  if (llm && typeof llm === 'object') {
    const conf = llm.confianca;
    add('forma', llm.forma, 'llm', { confianca: conf });
    add('valor_total', llm.valor_total != null ? llm.valor_total : llm.valor, 'llm', { confianca: conf });
    add('competencia', llm.competencia, 'llm', { confianca: conf });
    add('categoria', llm.categoria, 'llm', { confianca: conf });
    add('aluno', llm.aluno_nome || llm.aluno, 'llm', { confianca: conf });
    add('pagador', llm.pagador, 'llm', { confianca: conf });
  }
  if (banco && typeof banco === 'object') {
    const f = banco.fatura || banco.parcela || {};
    add('forma', banco.forma || f.forma, 'banco_canonico');
    add('valor_total', banco.valor_total || banco.valor || f.valor_da_parcela, 'banco_canonico');
    add('competencia', banco.competencia || f.competencia, 'banco_canonico');
    add('categoria', banco.categoria || categoriaDaFatura(banco), 'banco_canonico');
    add('aluno', banco.aluno_nome || banco.aluno, 'banco_canonico');
    add('pagador', banco.pagador || banco.responsavel_financeiro, 'banco_canonico');
  }
  for (const e of (Array.isArray(extras) ? extras : [])) {
    add(e && e.campo, e && e.valor, e && e.fonte, e || {});
  }

  const fields = {};
  for (const [campo, candidatos] of porCampo.entries()) {
    fields[campo] = resolverCampoEvidencia(campo, candidatos);
  }
  return {
    schema_version: 1,
    policy: 'correcao_humana>texto_humano>documento>cadastro>ocr>visao>llm',
    source_refs: {
      texto_humano_sha256: humano ? sha256(humano) : null,
      ocr_sha256: String(ocrText || '').trim() ? sha256(String(ocrText)) : null,
      ocr_status: ocrMeta && ocrMeta.status || null,
    },
    fields,
  };
}

function mesclarEnvelopesEvidenciasV1(base, novo) {
  const todos = {};
  for (const env of [base, novo]) {
    for (const [campo, resolvido] of Object.entries(env && env.fields || {})) {
      if (!todos[campo]) todos[campo] = [];
      todos[campo].push(...(Array.isArray(resolvido.candidatos) ? resolvido.candidatos : []));
    }
  }
  const fields = {};
  for (const [campo, candidatos] of Object.entries(todos)) {
    const unicos = [];
    const vistos = new Set();
    for (const c of candidatos) {
      const chave = JSON.stringify([c && c.fonte, c && c.valor, c && c.evidencia_id]);
      if (!vistos.has(chave)) { vistos.add(chave); unicos.push(c); }
    }
    fields[campo] = resolverCampoEvidencia(campo, unicos);
  }
  const refsNovas = Object.fromEntries(Object.entries(novo && novo.source_refs || {})
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== ''));
  return {
    schema_version: 1,
    policy: 'correcao_humana>texto_humano>documento>cadastro>ocr>visao>llm',
    source_refs: { ...(base && base.source_refs || {}), ...refsNovas },
    fields,
  };
}

function compararEnvelopeEvidenciasV1(envelope, atual = {}) {
  const divergencias = [];
  const conflitos = [];
  for (const [campo, r] of Object.entries(envelope && envelope.fields || {})) {
    if (r.status === 'conflito') conflitos.push(campo);
    if (r.status !== 'resolvido' || atual[campo] === undefined || atual[campo] === null) continue;
    const a = _normalizarValorEvidencia(campo, atual[campo]);
    if (a !== null && JSON.stringify(a) !== JSON.stringify(r.valor)) divergencias.push(campo);
  }
  return { divergencias, conflitos, ok: divergencias.length === 0 && conflitos.length === 0 };
}

function _evidenciaShadowLigado(chatId) {
  const bruto = process.env.SOL_CAIXA_EVIDENCE_SHADOW;
  if (bruto === '0') return false;
  const lista = String(bruto || process.env.SOL_CAIXA_V4_CANARIO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return lista.includes(String(chatId || ''));
}

// ---- PORTA 2: o que a mídia REALMENTE é (fix 17/08/2026) -------------------
// Print de tela do LA Report/Emusys tem valor e nome do aluno escritos nele:
// sem esta porta, a Sol lê o próprio relatório como comprovante e lança dinheiro
// que nunca entrou. Ordem importa: tela vence tudo.
const SINAL_TELA = /(fechamento de caixa|abertura de caixa|saldo inicial|saldo final|movimenta[cç][oõ]es do dia|vendas do dia|gerado pelo la report|la report|gest[aã]o de renova[cç][oõ]es|dados pessoais|hist[oó]rico de aulas|aulas a repor|cr[eé]dito de horas|fideliza|em andamento|status\s+descri[cç][aã]o\s+vencimento|forma de pagamento\s+recebedor|valor devido|comprovante recebido|posso lan[cç]ar|lancei no caixa|conferido por)/i;
// RECIBO DE CHECKOUT (26/09/2026, Arthur/Barra): o recibo do link de pagamento
// ("Sua compra foi aprovada · Data do pagamento · Codigo da transacao · Forma de
// pagamento: 2x - Mastercard") nao casava NADA daqui: a lista conhecia "data DE
// pagamento" e "ID da transacao", e o recibo diz "data DO pagamento" e "CODIGO da
// transacao". Com legenda passava (legenda financeira); reenviado sem legenda, foi
// recusado em silencio. Entram so as duas variacoes que a lista ja pretendia cobrir.
// ⚠️ "compra aprovada" fica FORA de proposito: aparece tambem em recibo de compra
// feita PELA escola (saida) e inverteria a direcao do dinheiro.
const SINAL_COMPROVANTE = /(comprovante|transa[cç][aã]o conclu[ií]da|transfer[eê]ncia (realizada|conclu)|(?:id|c[oó]digo) da transa|e2e[a-z0-9]|chave pix|pix copia|recibo|pagamento (realizado|efetuado|conclu)|transferir para|dados do (recebedor|destinat)|detalhes do (remetente|destinat)|institui[cç][aã]o|autentica[cç][aã]o|nsu|valor pago|data d[oe] pagamento|remetente)/i;
const SINAL_DESPESA = /(or[cç]amento|cota[cç][aã]o|proposta comercial|pedido\s*#|totalizadores|vendedor|nota fiscal|danfe|fornecedor|itens:)/i;
const BODY_SINTETICO = /^\s*(document|image|video|audio|sticker|photo)\s+received\s*$/i;

// O bridge manda "document received" quando não há legenda — isso não é texto humano.
function bodyLimpo(body) {
  const t = String(body || '').trim();
  return BODY_SINTETICO.test(t) ? '' : t;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// tipo: 'comprovante' | 'tela_sistema' | 'despesa' | 'indefinido'
function classificarMidia(ocrText, body) {
  const ocr = String(ocrText || '');
  const cap = bodyLimpo(body);
  if (SINAL_TELA.test(ocr)) return { tipo: 'tela_sistema', motivo: 'print_de_tela_do_sistema' };
  if (SINAL_COMPROVANTE.test(ocr)) return { tipo: 'comprovante', motivo: 'sinal_de_comprovante' };
  if (SINAL_DESPESA.test(ocr)) return { tipo: 'despesa', motivo: 'orcamento_ou_compra' };
  if (cap && (FIN_KW.test(cap) || MONEY.test(cap))) return { tipo: 'comprovante', motivo: 'legenda_financeira' };
  if (ocr.trim().length < 20) return { tipo: 'indefinido', motivo: 'nao_consegui_ler' };
  return { tipo: 'indefinido', motivo: 'sem_sinal_de_comprovante' };
}

function detectarComprovante(event) {
  if (!event || !event.hasMedia) return { ok: false, motivo: 'sem_midia' };
  const mt = String(event.mediaType || '').toLowerCase();
  if (mt.startsWith('audio') || mt === 'ptt') return { ok: false, motivo: 'audio' };
  const body = String(event.body || '');
  if (FIN_KW.test(body) || MONEY.test(body)) return { ok: true, motivo: 'midia+financeiro' };
  if (mt.startsWith('image') || mt.includes('pdf') || mt === 'document') {
    return { ok: true, motivo: 'midia_financeira_provavel' };
  }
  return { ok: false, motivo: 'midia_nao_financeira' };
}


// ---- gate de confirmacao (fix 17/08/2026: token solto no meio de frase NAO autoriza) ----
function _normConf(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// A mensagem INTEIRA e a confirmacao? ("pode", "pode lancar", "pode, R$ 430",
// "pode dinheiro 250,00"). Uma palavra afirmativa perdida no meio de uma frase de
// conversa ("pode responder mas...", "quando a sol lancar no report...") NAO conta.
function confirmacaoLimpa(text, tokens) {
  let t = _normConf(text);
  if (!t) return false;
  t = t.replace(/[\s.!?]+$/, '').replace(/^[\s,.]+/, '');
  if (!t) return false;
  const cauda = '(\\s*[,;:-]?\\s*(pode|sim|sol|entao|ai|ta|ta\\s+certo|tudo\\s+certo|por\\s+favor|pfv|obrigad[ao]|vlw|valeu))*';
  const valor = '(\\s*[,;:-]?\\s*(r\\$\\s*)?\\d[\\d.,]*)?';
  const forma = '(\\s*[,;:-]?\\s*(no|na|em|via|com)?\\s*(pix|dinheiro|cartao(?:\\s+(?:de)?bito|\\s+credito)?|cheque|transferencia)(\\s*\\d{1,2}\\s*x)?)?';
  const re = new RegExp('^' + tokens + cauda + valor + forma + valor + '$');
  return re.test(t);
}

// Tokens que valem como mensagem INTEIRA (forte) e os que so valem citando o preview (frouxo).
const TOK_LANCAR_FORTE = '(pode|sol\\s+pode|pode\\s+sim|pode\\s+lancar|pode\\s+lanca|confirmo|confirmado|autorizo|autorizado|manda\\s+ver)';
const TOK_LANCAR_REPLY = '(pode|sol\\s+pode|pode\\s+sim|pode\\s+lancar|pode\\s+lanca|lancar|lanca|confirmo|confirmado|autorizo|autorizado|isso\\s+mesmo|manda\\s+ver|sim|ok|blz|beleza|isso)';

// "pode" de confirmação (evita "pode ser" = talvez). Extrai valor/forma opcionais.
// respondeuPreview=true (a msg cita o preview) afrouxa o gate; sem citar, a mensagem
// inteira tem que ser a confirmação.
const _CATEGORIAS_DITAVEIS = '(venda|lojinha|passaporte|matricula|mensalidade|parcela|evento|aluguel|doacao|outro)';
// "coloca a categoria como venda" / "categoria: venda" — correcao ditada.
function extrairCategoriaCorrecao(text) {
  const n = _normConf(text).replace(/[^a-z0-9\s:]/g, ' ').replace(/\s+/g, ' ');
  let m = n.match(new RegExp('\\bcategoria\\b\\s*(?:como|pra|para|em|de|eh|e|:)?\\s*' + _CATEGORIAS_DITAVEIS + '\\b'));
  if (m) return m[1];
  m = n.match(new RegExp('\\b(?:coloca|poe|muda|troca|marca|deixa|lanca)\\b[a-z\\s]{0,20}\\bcomo\\s+' + _CATEGORIAS_DITAVEIS + '\\b'));
  return m ? m[1] : null;
}

function casarPode(text, { respondeuPreview = false } = {}) {
  let t = String(text || '').trim();
  if (!t) return { pode: false };
  if (/\bpode\s+ser\b/i.test(t)) return { pode: false };
  // "pode, mas coloca a categoria como venda" (CG 31/08): aprovacao condicional
  // com correcao inline caia em SILENCIO — nem lancava, nem respondia — e o
  // "pode" seco seguinte lancava com a categoria errada. A correcao viaja
  // junto: extrai a categoria, corta a clausula e avalia o resto como
  // confirmacao normal.
  let categoria = null;
  if (/\bpode\b/i.test(t)) {
    categoria = extrairCategoriaCorrecao(t);
    if (categoria) {
      const corte = t.search(/[,;]?\s*\b(mas|por[eé]m|s[oó]\s+que|coloca|p[oõ]e|muda|troca|marca|deixa|lan[cç]a|categoria)\b/i);
      if (corte > 0) t = t.slice(0, corte).replace(/[\s,;.:-]+$/, '');
      else categoria = null;
    }
  }
  // 31/08: "Foi de propósito sim, Luciano" (resposta a uma pergunta HUMANA)
  // aprovou uma saida de R$633 — o token frouxo aceitava "sim"/"ok" em
  // QUALQUER posicao da frase. Dinheiro exige afirmacao que ABRE a mensagem,
  // e mensagem curta.
  const _nt = _normConf(t);
  const ok = respondeuPreview
    ? (confirmacaoLimpa(t, TOK_LANCAR_REPLY)
       || (_nt.length <= 40 && new RegExp('^' + TOK_LANCAR_REPLY + '(\\s|$|[,.!])', 'i').test(_nt)))
    : confirmacaoLimpa(t, TOK_LANCAR_FORTE);
  if (!ok) return { pode: false };
  const cartao = extrairCartao(t);
  return {
    pode: true,
    categoria,
    valor: extrairValor(t, { allowBare: true }),
    forma: extrairForma(t, null),
    cartaoModalidade: cartao && cartao.modalidade,
    cartaoParcelas: cartao && cartao.parcelas,
  };
}

// O par que faltava de casarPode. A guarda de 25/08 ja oferecia "nao para descartar"
// sem que ninguem tratasse, e a pendencia ficava viva — depois qualquer legenda nova era
// lida como correcao dela (caso Aurora/CG: card saiu com o valor do comprovante anterior).
// Exigente de proposito: so mensagem CURTA e inequivoca descarta dinheiro.
// ⚠️ "nao e a parcela" / "nao foi esse aluno" NAO sao descarte — sao correcao, e quem
// trata correcao e o fluxo de nome/valor. Descarte e' a frase inteira.
function casarNao(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  const n = t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return false;
  return /^(nao|nao pode|nao lanca|nao lancar|nao e|cancela|cancelar|descarta|descartar|ignora|ignorar|deixa|deixa pra la|esquece|esquecer)$/.test(n);
}

// Elogio/agradecimento nao e comando. A guarda de pendencia respondia "nao entendi" a
// "Certinho" (Jhon/CG 25/08).
function ehConversaSemComando(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  const n = t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return true;   // so emoji/pontuacao
  return /^(certinho|certo|ok|okay|blz|beleza|show|otimo|perfeito|isso|isso ai|top|valeu|vlw|obrigad[oa]|obg|brigad[oa]|maravilha|boa|massa|legal|entendi|ta bom|tudo certo|feito|combinado|bom dia|boa tarde|boa noite|calma|calma ai|pera|pera ai|peraí|espera|aguarda|um momento|um instante|so um minuto)( .{0,12})?$/.test(n);
}

function fmtBRL(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Normaliza nome (igual cleanRecebedorName da Maria): title-case + conectores minusculos.
// "RAYSSA CRISTINE COSTA DA SILVA" -> "Rayssa Cristine Costa da Silva".
function tituloNome(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // `\b` não reconhece letras acentuadas como parte de palavra em JS; por
  // isso "João" virava "JoÃO". Capitalizamos por token, preservando os
  // conectores do nome em minúsculas.
  const conectores = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return s.toLocaleLowerCase('pt-BR').split(' ').map((parte) => {
    if (!parte || conectores.has(parte)) return parte;
    return parte.charAt(0).toLocaleUpperCase('pt-BR') + parte.slice(1);
  }).join(' ');
}

// A competencia estruturada e' a fonte de verdade. A descricao importada do
// Emusys e' texto historico e pode carregar o mes anterior (caso CG 12/09:
// competencia=09/2026, descricao="Parcela 08/2026"). Nunca deixamos esse texto
// velho contradizer o campo canonico no card nem na descricao do lancamento.
function _competenciaParaExibicao(raw) {
  const s = String(raw || '').trim();
  const iso = s.match(/^(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  return extrairCompetenciaTexto(s);
}

function descricaoParcelaCoerente(parcela, competencia) {
  const descricao = String(parcela && parcela.descricao || '').trim();
  if (!descricao) return descricao;
  const correta = _competenciaParaExibicao(competencia)
    || _competenciaParaExibicao(parcela && parcela.competencia);
  if (!correta) return descricao;
  const noTexto = descricao.match(/\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/);
  if (!noTexto) return descricao;
  const atual = `${String(Number(noTexto[1])).padStart(2, '0')}/${noTexto[2]}`;
  return atual === correta ? descricao : descricao.replace(noTexto[0], correta);
}

function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha, semAlunoDeclarado, entidade, valorMaiorNaLegenda, valorConflito, valorBaixaConfianca, ingresso, descricao, sugestaoNome }) {
  // forma legível
  let formaTxt;
  if (forma === 'cartao') {
    const mod = cartaoModalidade === 'credito' ? 'crédito' : (cartaoModalidade === 'debito' ? 'débito' : cartaoModalidade);
    formaTxt = 'cartão' + (mod ? ' ' + mod : '') + (cartaoParcelas && cartaoParcelas > 1 ? ` ${cartaoParcelas}x` : '');
  } else if (forma) {
    formaTxt = forma;
  } else {
    formaTxt = '❓ forma não identificada';
  }

  // Saida operacional (seguranca, despesa, retirada, troco) NAO e recebimento e NAO tem
  // aluno. Ate 25/08 o preview so sabia escrever recebimento, entao uma saida de R$100 do
  // seguranca aparecia como "*RECEBIMENTO*" pedindo "me diz de quem e" (caso Mayra/CG).
  const ehSaidaPreview = categoriaEhSaida(categoria);

  const blocos = [];
  blocos.push([`📄 *${ehSaidaPreview ? 'Saída de caixa' : 'Comprovante recebido'} — ${unidadeNome}*`]);

  // ---- o dinheiro: entrou ou saiu
  blocos.push([
    ehSaidaPreview ? '*PAGAMENTO (saída)*' : '*RECEBIMENTO*',
    `${valor ? '*' + fmtBRL(valor) + '*' : '❓ valor não identificado'} · ${formaTxt}`,
    // A descricao que vai para o banco aparece no card (06/10/2026): antes o card
    // nao mostrava nada, a confirmacao mostrava outra coisa e o banco guardava uma
    // terceira ("PG Semana Retirada"). Quem aprova precisa ver o que sera gravado.
    ...(ehSaidaPreview && descricao ? [`📝 ${descricao}`] : []),
    ...(valorMaiorNaLegenda ? [`⚠️ A mensagem cita ${fmtBRL(valorMaiorNaLegenda)} — este card cobre só ${fmtBRL(Number(valor) || 0)}. Se é pagamento de mais de um aluno, manda cada um: *Nome — R$ valor*.`] : []),
    ...(!valor && valorConflito ? [`⚠️ A mensagem diz *${fmtBRL(valorConflito.legenda)}* e o comprovante mostra *${fmtBRL(valorConflito.comprovante)}*. Não vou escolher no chute.`] : []),
    ...(!valor && !valorConflito && valorBaixaConfianca ? ['⚠️ Não consegui ler o valor do comprovante com segurança.'] : []),
  ]);

  // ---- ALUNO: de quem é
  const bAluno = ['*ALUNO*'];
  if (aluno) {
    bAluno.push(aluno);
    if (responsavelFinanceiro) bAluno.push(`Resp. financeiro: ${tituloNome(responsavelFinanceiro)}`);
    else if (pagadorNome && alunoViaPagador === 'comprovante' && mesmaPessoa(pagadorNome, aluno)) {
      bAluno.push(`Resp. financeiro: ${tituloNome(pagadorNome)} _(própria aluna no comprovante)_`);
    } else bAluno.push('Resp. financeiro: não encontrado no cadastro');
    if (pagadorNome && alunoViaPagador === 'familia') {
      bAluno.push(`Pagou: ${tituloNome(pagadorNome)} _(deduzi pelo sobrenome — confere?)_`);
    } else if (pagadorNome && alunoViaPagador === 'responsavel') {
      bAluno.push(`Pagou: ${tituloNome(responsavelFinanceiro || pagadorNome)} _(responsável cadastrado)_`);
    }
    if (alunoNovoOrigem) bAluno.push(`🆕 ${alunoNovoOrigem} — ainda não matriculado, identificado pelo funil.`);
    // Lojinha com grafia diferente do cadastro (06/10/2026): pergunta, não escolhe.
    if (sugestaoNome && Array.isArray(sugestaoNome.candidatos) && sugestaoNome.candidatos.length === 1) {
      bAluno.push(`⚠️ Não achei *${sugestaoNome.digitado}* no cadastro desta unidade. É *${sugestaoNome.candidatos[0]}*? Responde *sim* que eu ajusto o card.`);
    } else if (sugestaoNome && Array.isArray(sugestaoNome.candidatos) && sugestaoNome.candidatos.length > 1) {
      bAluno.push(`⚠️ Não achei *${sugestaoNome.digitado}* no cadastro desta unidade. Os mais parecidos: `
        + sugestaoNome.candidatos.slice(0, 3).map((n) => `*${n}*`).join(', ')
        + `${sugestaoNome.candidatos.length > 3 ? ' (e outros)' : ''} — não escolho por você. Me manda *aluno: Nome completo*.`);
    }
    if (confiancaBaixa) bAluno.push('⚠️ Não tenho certeza de qual aluno é — confere o nome.');
  } else if (candidatosAluno && candidatosAluno.length) {
    bAluno.push(`❓ Não identifiquei${pagadorNome ? ` — o pagamento veio de *${tituloNome(pagadorNome)}*` : ''}.`);
    bAluno.push('É de qual aluno?');
    candidatosAluno.forEach((c) => bAluno.push(`   – ${c}`));
  } else if (pagadorNome) {
    bAluno.push(`❓ Não achei pelo pagador (*${tituloNome(pagadorNome)}*) — me diz de quem é.`);
  } else {
    bAluno.push('❓ Não identifiquei — me diz de quem é.');
  }
  // Pedir aluno numa saida operacional e o que induziu a Mayra a "corrigir" o nome —
  // e a correcao virou nome de aluno. Saida nao tem aluno: a secao nao entra.
  // ⚠️ Lojinha idem QUANDO o "aluno" extraido e a propria descricao do produto: em 25/08
  // o card da Vitoria trouxe "*ALUNO* Venda bolsa de violino e pacote de Clips" com
  // "nao tenho certeza de qual aluno e" — a legenda descrevia a MERCADORIA. Lojinha com
  // comprador identificado de verdade continua mostrando.
  const _lojinhaSemComprador = String(categoria || '').toLowerCase() === 'lojinha'
    && (!aluno || (itemLojinha && String(aluno).toLowerCase().includes(String(itemLojinha).toLowerCase().slice(0, 10)))
        || /\b(venda|pacote|caixa|unidade|kit|par|jogo)\b/i.test(String(aluno || '')));
  // ⚠️ Lojinha sem comprador: PERGUNTA em vez de esconder. Esconder (25/08)
  // limpava o card poluido, mas deixava a venda sem dono e ninguem reparava —
  // foi assim que a camisa do Theo quase entrou no nome do vendedor.
  if (!ehSaidaPreview && ingresso && Array.isArray(ingresso.linhas)) {
    // Venda de ingresso (02/10/2026): o bloco diz evento, quantidade x lote e que
    // nao ha aluno — o artista/evento nunca aparece no lugar do aluno.
    blocos.push(['*VENDA DE INGRESSO*'].concat(ingresso.linhas));
  } else if (!ehSaidaPreview && semAlunoDeclarado) {
    // Receita de banda/evento nao tem aluno — declarado pelo humano (CG 31/08).
    blocos.push(['*ALUNO*', (entidade ? entidade + ' — ' : '') + 'sem aluno específico _(banda/evento)_ ✓']);
  } else if (!ehSaidaPreview && _lojinhaSemComprador) {
    blocos.push(['*ALUNO*', '⚠️ Não sei para quem foi a venda — me manda *aluno: Nome Completo*.']);
  } else if (!ehSaidaPreview) blocos.push(bAluno);

  let fecho = null;

  // ---- FATURA: a que se refere
  const linhasCan = canonica ? linhasDaFatura(canonica, valor) : [];
  if (composto && Array.isArray(composto.partes) && composto.partes.length >= 2) {
    const b = ['*FATURA*'];
    b.push(`Pagamento composto — ${composto.partes.length} parcelas/curso${composto.partes.length > 1 ? 's' : ''}`);
    if (composto.competencia) b.push(`Competência: *${composto.competencia}*`);
    composto.partes.forEach((p) => b.push(`${p.curso || p.label || 'Parte'}: ${fmtBRL(p.valor)}`));
    if (valor && Math.abs(composto.partes.reduce((s, p) => s + Number(p.valor || 0), 0) - Number(valor)) < 0.05) {
      b.push(`✅ Soma confere com o comprovante (${fmtBRL(valor)})`);
    }
    blocos.push(b);
  } else if (multiplas) {
    const b = ['*FATURA*'];
    const q = quitacao || {};
    b.push('Quitação — pagamento de *várias parcelas*' + (q.n ? ` (${q.n}x` + (q.vparc ? ` de ${fmtBRL(q.vparc)}` : '') + ')' : ''));
    if (q.inicio && q.fim) {
      b.push(`Meses: *${q.inicio} a ${q.fim}*`);
      if (q.proposto) b.push('_Deduzi pela 1ª parcela — se for outro período, me diz: *de 09/2026 a 08/2027*._');
      const qf = q.faturas;
      if (qf && qf.ok) {
        b.push(`Vou vincular *${qf.n} faturas*${qf.curso ? ' do curso de ' + qf.curso : ''} · soma ${fmtBRL(qf.soma)}`);
        if (valor && Math.abs(Number(qf.soma) - Number(valor)) >= 0.01) {
          b.push(`_A soma das faturas difere do comprovante (${fmtBRL(valor)}) — juros ou desconto. Lanço o valor do comprovante._`);
        }
      } else if (qf) {
        const porque = { faturas_ja_vinculadas: 'parte delas já está vinculada a outro lançamento',
          mais_de_uma_matricula: 'o aluno tem mais de um curso nesse período',
          periodo_incompleto: 'não há uma fatura por mês nesse período' }[qf.motivo] || 'não consegui confirmar as faturas';
        b.push(`⚠️ Não vou vincular faturas (${porque}) — lanço *sem vínculo de fatura*.`);
      }
    } else {
      b.push('❓ Quais meses? Me diz: *de 08/2026 a 07/2027*');
    }
    blocos.push(b);
  } else if (linhasCan.length) {
    blocos.push(['*FATURA*'].concat(linhasCan));
  } else if (parcela && parcela.descricao) {
    const b = ['*FATURA*'];
    let l = descricaoParcelaCoerente(parcela, competencia);
    if (parcela.vencimento) l += ` · vence ${parcela.vencimento}`;
    b.push(l);
    if (parcela.valor !== null && parcela.valor !== undefined) b.push(`Valor: ${fmtBRL(parcela.valor)}`);
    if (parcela.valor_bate === false) b.push('⚠️ O valor do comprovante difere do valor da parcela — confere.');
    if (parcela.multiplas_no_mes) b.push('⚠️ Esse aluno tem mais de uma parcela aberta no mês — confere o curso.');
    if (bloqueiaLancamento) b.push('⚠️ Não vou lançar com *pode* enquanto essa divergência não for explicada.');
    blocos.push(b);
  } else if (bloqueiaLancamento) {
    fecho = '👉 Me explica a divisão ou responde no preview certo antes de lançar.';
  } else {
    const b = ['*LANÇAMENTO*', `Categoria: ${categoria || 'parcela'}`];
    if (categoria === 'lojinha' && itemLojinha) b.push(`Item: ${itemLojinha}`);
    // A descricao que vai para o banco, igual a da confirmacao (fonte unica).
    if (categoria === 'lojinha' && descricao) b.push(`📝 ${descricao}`);
    if (ingresso && ingresso.descricao) b.push(`Descrição: ${ingresso.descricao}`);
    if (competencia) b.push(`Competência: ${competencia}`);
    if (faturaIndisponivel) b.push('⚠️ Não consegui confirmar a fatura na fonte oficial agora — não vou lançar com *pode* até confirmar.');
    blocos.push(b);
  }

  // ---- ATENÇÃO: só quando existe
  if (duplicata) {
    blocos.push(['*ATENÇÃO*',
      `Já tem uma entrada de ${fmtBRL(Number(duplicata.valor))} no caixa de hoje (${duplicata.hora}${duplicata.descricao ? ' — ' + duplicata.descricao : ''}).`,
      'Se for *outro pagamento*, responde citando este card: *pode, é outro pagamento*. Só "pode" não lança.']);
  }

  // ---- o que eu preciso pra lançar
  const semAluno = !aluno && !!(candidatosAluno && candidatosAluno.length || pagadorNome);
  const _sugestaoAberta = !!(sugestaoNome && Array.isArray(sugestaoNome.candidatos) && sugestaoNome.candidatos.length);
  if (_sugestaoAberta && !bloqueiaLancamento) {
    // o "pode" fica travado ate o aluno se resolver — o card nao convida a ele
    fecho = sugestaoNome.candidatos.length === 1
      ? `👉 Primeiro o aluno: é *${sugestaoNome.candidatos[0]}*? Responde *sim* (ou *aluno: Nome completo*). Depois disso eu peço o *pode*.`
      : '👉 Primeiro o aluno: me manda *aluno: Nome completo*. Depois disso eu peço o *pode*.';
  } else if (bloqueiaLancamento) {
    // O gate deterministico ja recusa o `pode`; o renderer nao pode terminar
    // convidando a equipe a executar uma aprovacao que ele mesmo vai negar.
    fecho = '👉 Me explica a divisão/curso correto antes de lançar.';
  } else if (faturaIndisponivel) {
    fecho = '👉 Confirma aluno, competência e curso/parcela antes de lançar.';
  } else if (semAluno && valor && !formaIncerta) {
    fecho = '👉 Me diz de qual aluno é que eu lanço.';
  } else if (!valor && (valorConflito || valorBaixaConfianca)) {
    fecho = '👉 Qual é o valor certo? Responde citando este card: *pode, R$ valor*' + (formaIncerta ? ' e a forma' : '') + '.';
  } else if (!valor && formaIncerta) {
    fecho = '👉 Me diz o valor e a forma: *pode, R$ 5.700 no cartão 12x*';
  } else if (!valor) {
    fecho = '👉 Me manda o valor: *pode, R$ 300*';
  } else if (formaIncerta) {
    fecho = '👉 Me confirma a forma: *pode, pix* / *pode, dinheiro* / *pode, cartão*';
  } else {
    fecho = '👉 *Posso lançar no caixa de hoje?* Responde *pode*';
  }
  blocos.push([fecho]);

  // Cada secao: TITULO, linha em branco, itens com bullet (pedido do Alf). Uso '•' e nao '*'
  // porque no WhatsApp o asterisco e' marcador de NEGRITO e negritaria metade do bloco.
  const _ehTitulo = (t) => /^\*[A-ZÇÃÁÉÍÓÚÂÊÔ ]+\*$/.test(t);
  const _semBullet = (l) => /^[\s•–—]/.test(l) || /^(⚠|🔴|✅|ℹ|❓|👉|_)/u.test(l.trim());
  const formatarBloco = (b) => {
    if (b.length <= 2 || !_ehTitulo(b[0])) return b.join('\n');
    const itens = b.slice(1).map((l) => (_semBullet(l) ? l : '• ' + l));
    return b[0] + '\n\n' + itens.join('\n');
  };
  return blocos.map(formatarBloco).join('\n\n');
}

function montarPreviewMultiAluno({ unidadeNome, valorTotal, forma, categoria, itens }) {
  const lista = Array.isArray(itens) ? itens : [];
  // Adiantamento declarado (SOL-134, 29/09/2026) é item sem fatura por definição,
  // não exceção de desconto: tem linha e aviso próprios.
  const adiantamentos = lista.filter((i) => i && i.adiantamento === true);
  const semVinculo = lista.filter((i) => i && i.sem_vinculo_fatura === true && i.adiantamento !== true);
  const vinculadas = lista.length - semVinculo.length - adiantamentos.length;
  const formaTxt = forma === 'cartao' ? 'cartão' : (forma || '❓ forma não identificada');
  const nomes = [...new Set(lista.map((i) => String(i.aluno_nome || '').trim()).filter(Boolean))];
  const mesmoAlunoVariasFaturas = lista.length >= 2 && nomes.length === 1;
  const categorias = [...new Set(lista.map((i) => String(i.categoria || '').toLowerCase().trim()).filter(Boolean))];
  const mesmoAlunoCategoriasMistas = mesmoAlunoVariasFaturas && categorias.length >= 2;
  const linhas = lista.map((item) => {
    if (item.adiantamento === true) {
      return `• Adiantamento parcela ${item.competencia} — ${fmtBRL(item.valor)} (sem fatura)`
        + (mesmoAlunoVariasFaturas ? '' : ` · ${item.aluno_nome}`);
    }
    const rotulo = mesmoAlunoVariasFaturas
      ? (mesmoAlunoCategoriasMistas
        ? (item.descricao || `${cap(item.categoria || 'Fatura')}${item.competencia ? ' ' + item.competencia : ''}`)
        : (item.competencia || item.descricao || 'Fatura'))
      : item.aluno_nome;
    return `• ${rotulo} — ${fmtBRL(item.valor)}${item.sem_vinculo_fatura ? ' _(desconto autorizado — sem fatura correspondente no Emusys)_' : ''}`;
  });
  const responsaveis = [...new Set(lista.map((i) => String(i.responsavel_financeiro || '').trim()).filter(Boolean))];
  const linhaResponsavel = responsaveis.length === 1 ? `\n• Resp. financeiro: ${responsaveis[0]}`
    : (responsaveis.length > 1 ? `\n• Resp. financeiros: ${responsaveis.join(' · ')}` : '');
  const descricoes = [...new Set(lista.filter((i) => i.adiantamento !== true)
    .map((i) => String(i.descricao || '').trim()).filter(Boolean))];
  const cursos = descricoes.map((d) => d.match(/^taxa(?:s)? de matr[íi]cula do curso de (.+)$/i)).filter(Boolean).map((m) => m[1]);
  const faturaTexto = cursos.length === descricoes.length && cursos.length > 0
    ? `Taxas de Matrícula dos cursos de ${cursos.join(' e ')}`
    : (descricoes.length ? descricoes.join(' · ') : (categoria || 'Recebimento'));
  const faturasPagas = lista.map((i) => i.fatura).filter((f) => f && f.status === 'paga');
  const datasPagas = [...new Set(faturasPagas.map((f) => String(f.data_pagamento || '')).filter(Boolean))];
  const formasPagas = [...new Set(faturasPagas.map((f) => String((f.forma_pagamento && f.forma_pagamento.nome) || '').trim()).filter(Boolean))];
  const dataBR = datasPagas.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(datasPagas[0])
    ? datasPagas[0].slice(8, 10) + '/' + datasPagas[0].slice(5, 7) : null;
  const linhaStatus = adiantamentos.length > 0
    ? `• ${vinculadas} fatura(s) validada(s) no Emusys + adiantamento declarado pela equipe (${adiantamentos.map((a) => `${fmtBRL(a.valor)} para ${a.competencia}`).join(', ')}), sem fatura — fica registrado para vincular quando a fatura nascer`
    : semVinculo.length > 0
    ? `• ${vinculadas} de ${lista.length} item(ns) com fatura validada no Emusys`
    : (faturasPagas.length === lista.length && dataBR
      ? `• Já pago no Emusys em ${dataBR}${formasPagas.length === 1 ? ` no ${formasPagas[0]}` : ''} — falta lançar no caixa`
      : '• Faturas validadas individualmente no Emusys');
  const blocoPessoas = mesmoAlunoVariasFaturas
    ? `*ALUNO*\n\n• ${nomes[0]}${linhaResponsavel}\n\n*${mesmoAlunoCategoriasMistas ? 'ITENS' : 'PARCELAS'}*\n\n${linhas.join('\n')}`
    : `*ALUNOS*\n\n${linhas.join('\n')}${linhaResponsavel}`;
  return [
    `📄 *Comprovante recebido — ${unidadeNome}*`,
    `*RECEBIMENTO*\n\n*${fmtBRL(valorTotal)}* · ${formaTxt}`,
    blocoPessoas,
    `*FATURA*\n\n• ${faturaTexto}\n• Valor: ${fmtBRL(valorTotal)} ✅ confere\n${linhaStatus}${semVinculo.length ? `\n• ⚠️ ${semVinculo.length} item(ns) sem fatura correspondente, com desconto explicitamente autorizado — confira essa exceção antes de aprovar.` : ''}`,
    '👉 *Posso lançar o lote completo no caixa de hoje?* Responde *pode*',
  ].join('\n\n');
}

// Exceção financeira não nasce de aritmética nem de interpretação do modelo.
// O formato abaixo é um protocolo explícito, como "Nome — R$ valor": a equipe
// escreve uma linha `Desconto autorizado por: Nome`. OCR nunca entra aqui e o
// "pode" posterior continua sendo outro gate independente.
function extrairAutorizacaoDescontoProtocolada(textoHumano) {
  const rotulo = 'desconto autorizado por';
  for (const bruta of String(textoHumano || '').split('\n')) {
    // Remove apenas markup do WhatsApp; não tenta entender conversa livre.
    const linha = bruta.split('*').join('').split('_').join('').split('~').join('').trim();
    const separador = linha.indexOf(':');
    if (separador < 0) continue;
    const chave = _normConf(linha.slice(0, separador));
    const autorizador = linha.slice(separador + 1).trim();
    if (chave !== rotulo || autorizador.length < 2 || autorizador.length > 80) continue;
    return { ok: true, autorizador, trecho_evidencia: linha,
      fonte: 'protocolo_desconto_autorizado_por' };
  }
  return { ok: false, motivo: 'desconto_sem_protocolo_explicito' };
}

// Nome de quem PAGOU, lido do comprovante ("De\nFULANO", "Detalhes do remetente ... Nome X").
const _NAO_PESSOA = /(institui|banco|santander|itau|ita[uú]|nubank|bradesco|caixa|inter|pagbank|99pay|picpay|mercado|ltda|me\b|s\.?a\.?$|music|escola|chave|pix|cnpj|cpf|ag[eê]ncia|conta)/i;
function extrairPagador(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const tentativas = [
    /(?:^|\n)\s*de\s*:?\s*\n+\s*([^\n]{6,100})/i,
    /remetente[\s\S]{0,180}?nome\s*:?\s*(?:\n+\s*)?([^\n]{6,100})/i,
    /origem[\s\S]{0,220}?nome\s*:?\s*(?:\n+\s*)?([^\n]{6,100})/i,
    /(?:pagador|origem|debitado de|enviado por)\s*:?\s*([^\n]{6,100})/i,
  ];
  for (const re of tentativas) {
    const m = t.match(re);
    if (!m) continue;
    // Alguns bancos prefixam o nome com CPF/CNPJ/identificador. Isso não é
    // nome: removemos só o prefixo e deixamos a resolução para a RPC canônica.
    const nome = String(m[1]).split('\n')[0]
      .replace(/^(?:\d[\d.\-\/\s]{5,}\s+)+/, '')
      .replace(/\s+/g, ' ').trim();
    if (nome.length < 6) continue;
    if (_NAO_PESSOA.test(nome)) continue;
    if (nome.split(' ').filter(Boolean).length < 2) continue;
    return nome;
  }
  return null;
}

// ---- I/O: env + chamada da RPC ------------------------------------------

function carregarEnv() {
  const env = {};
  for (const p of ENV_CANDIDATES) {
    let txt;
    try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  const url = env.LA_REPORT_SUPABASE_URL || env.SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co';
  const key = env.LA_REPORT_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return { url: String(url).replace(/\/+$/, ''), key };
}

function hashHex(alg, value) {
  return crypto.createHash(alg).update(String(value || '')).digest('hex');
}

function sha256(value) {
  return hashHex('sha256', value);
}

function md5(value) {
  return hashHex('md5', value);
}

function _parseVisionJson(stdout) {
  const txt = String(stdout || '').trim();
  if (!txt) return null;
  const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('{')) continue;
    try { return JSON.parse(lines[i]); } catch {}
  }
  const ini = txt.lastIndexOf('{');
  const fim = txt.lastIndexOf('}');
  if (ini >= 0 && fim > ini) {
    try { return JSON.parse(txt.slice(ini, fim + 1)); } catch {}
  }
  return null;
}

// Le o comprovante (imagem) por visao e extrai {valor, aluno, forma}. Best-effort:
// falha -> resolve(null) (o preview cai no fallback de pedir o valor). O humano
// SEMPRE confirma o valor no "pode" — a visao so monta o preview, nao decide dinheiro.
function extrairComprovanteVisao(imagePath, env, { timeout = 45000 } = {}) {
  return new Promise((resolve) => {
    if (!imagePath) return resolve(null);
    try { if (!fs.existsSync(imagePath)) return resolve(null); } catch { return resolve(null); }

    const prompt = 'Este e um comprovante de pagamento (Pix, transferencia ou cartao) de uma escola. '
      + 'Extraia e responda SOMENTE um JSON valido, sem markdown, com as chaves: '
      + 'valor (numero em reais, ex 509.00), '
      + 'aluno (nome do aluno, se estiver explícito; string, ou null), '
      + 'pagador_nome (nome de quem enviou o pagamento/origem do Pix; nunca o destinatário; string, ou null), '
      + 'forma ("pix" | "dinheiro" | "cartao" | "transferencia" | null). '
      + 'Se nao tiver certeza de um campo, use null.';

    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      [
        '-m', 'hermes_cli.main',
        'chat',
        '-Q',
        '--source', 'tool',
        '--max-turns', '1',
        '--ignore-rules',
        '--image', imagePath,
        '-q', prompt,
      ],
      {
        cwd: '/home/sol',
        timeout,
        maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, {
          HOME: process.env.HOME || '/home/sol',
          HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol',
        }),
      },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        let valor = o.valor;
        if (typeof valor === 'string') valor = parseBRMoney(valor);
        resolve({
          valor: (typeof valor === 'number' && valor > 0) ? valor : null,
          aluno: o.aluno || o.aluno_ou_pagador || null,
          pagador_nome: o.pagador_nome || o.pagador || null,
          forma: (o.forma ? String(o.forma).toLowerCase() : null),
        });
      }
    );
  });
}

function lancarRecebimento(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ p_payload: payload });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_lancar_recebimento`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout RPC lancar')));
    req.write(body); req.end();
  });
}

function lancarSaidaCaixa(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ p_payload: payload });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_lancar_saida`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout RPC saida')));
    req.write(body); req.end();
  });
}

function buscarLancamentoParaCorrecao(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ p_payload: payload });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_buscar_lancamento_para_correcao`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout RPC buscar correcao')));
    req.write(body); req.end();
  });
}

function chamarRpcCaixa(nome, payload, { url, key } = carregarEnv(), timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ p_payload: payload });
    const u = new URL(`${url}/rest/v1/rpc/${nome}`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`timeout RPC ${nome}`)));
    req.write(body); req.end();
  });
}

function _httpGetJson(pathQuery, { url, key } = carregarEnv(), timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const u = new URL(url + pathQuery);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('timeout GET')));
    req.end();
  });
}

// A3 (31/08): o ledger V3 ja guarda a pendencia inteira (preview_json.pending).
// Preview aberto = registrado, nao cancelado e sem consumo — e' o que o restart
// do bridge nao pode mais engolir (caso Arthur 17:58).
async function listarPreviewsAbertosV3(janelaMs) {
  const desde = new Date(Date.now() - janelaMs).toISOString();
  const previews = await _httpGetJson('/rest/v1/sol_caixa_shadow_previews_v1'
    + '?select=id,evento_id,preview_hash,criado_em,operacao,status,preview_json'
    + '&status=in.(public_preview_sent,draft_missing_fields)&criado_em=gte.' + encodeURIComponent(desde)
    + '&order=criado_em.asc&limit=100');
  if (!Array.isArray(previews) || !previews.length) return [];
  const idsEv = [...new Set(previews.map((p) => p.evento_id).filter(Boolean))];
  const eventos = idsEv.length
    ? await _httpGetJson('/rest/v1/sol_caixa_shadow_eventos_v1?select=id,chat_id_hash&id=in.(' + idsEv.join(',') + ')')
    : [];
  const chatPorEvento = {};
  for (const e of (eventos || [])) chatPorEvento[e.id] = e.chat_id_hash;
  const ids = previews.map((p) => p.id);
  const consumos = await _httpGetJson('/rest/v1/sol_caixa_v3_approval_consumos_v1?select=preview_id&preview_id=in.(' + ids.join(',') + ')');
  const consumidos = new Set((consumos || []).map((c) => c.preview_id));
  return previews
    .filter((p) => !consumidos.has(p.id))
    .map((p) => ({
      id: p.id, preview_hash: p.preview_hash, criado_em: p.criado_em, operacao: p.operacao,
      status: p.status,
      chat_id_hash: chatPorEvento[p.evento_id] || null,
      pending: p.preview_json && p.preview_json.pending,
      preview_message_id: p.preview_json && p.preview_json.preview_message_id,
    }));
}

function chamarRpcCaixaParam(nome, argName, payload, { url, key } = carregarEnv(), timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ [argName]: payload });
    const u = new URL(`${url}/rest/v1/rpc/${nome}`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`timeout RPC ${nome}`)));
    req.write(body); req.end();
  });
}

function registrarPreviewV3(payload, env) {
  return chamarRpcCaixa('sol_caixa_shadow_registrar', payload, env);
}

function registrarApprovalV3(payload, env) {
  return chamarRpcCaixaParam('sol_caixa_shadow_registrar_approval', 'payload', payload, env);
}

function finalizarPreviewV3(payload, env) {
  return chamarRpcCaixa('sol_caixa_v3_finalizar_preview_v1', payload, env);
}

function buscarMovimentosCaixa(payload, env) {
  return chamarRpcCaixa('sol_caixa_buscar_movimentos_v1', payload, env);
}

function corrigirMovimentoCaixa(payload, env) {
  return chamarRpcCaixa('sol_caixa_corrigir_movimento_v1', payload, env);
}

function estornarMovimentoCaixa(payload, env) {
  return chamarRpcCaixa('sol_caixa_estornar_movimento_v1', payload, env);
}

// A RPC REST precisa dos quatro argumentos nomeados; usa um wrapper dedicado
// para não deixar o bridge montar SQL ou tocar tabelas cruas.
function resolverMultiAlunoCaixaV1(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({
      p_unidade_id: payload.unidade_id,
      p_itens: payload.itens,
      p_valor_total: payload.valor_total,
      p_as_of: payload.as_of || null,
    });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_resolver_multi_aluno_v1`);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    }}, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); } });
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('timeout resolver multi-aluno'))); req.write(body); req.end();
  });
}

// N ALUNOS × N FATURAS — a ferramenta do pagamento INTEIRO (09/09/2026).
//
// 🔴 Substitui `sol_caixa_resolver_multi_aluno_v1`, que resolvia UMA fatura por
//    aluno (`limit 1`) e, no aluno com dois cursos ou com passaporte + parcela,
//    fechava a conta errada e devolvia `soma_itens_divergente`. Era a regressão
//    que a Mayra viveu: 19 minutos, 6 mensagens e desistiu — e o MESMO par de
//    alunos tinha sido lançado com sucesso em 01/09.
//
// ⚠️ Timeout 45s, não 15s. Medido com `explain analyze` em produção: 2 alunos
//    4,1s e 4 alunos 10,0s, porque cada ramo reconstrói o envelope de faturas da
//    unidade. A RPC ganhou `statement_timeout` próprio de 60s (o do PostgREST é
//    8s); 15s aqui desistiria antes do banco responder e a Sol diria "fonte
//    indisponível" para um caso que ia dar certo.
// Orquestrador: envelope estruturado -> combinacao unica. E a RPC que fecha o
// buraco medido em 10/09 — a ferramenta sabia responder, ninguem perguntava
// direito. Timeout maior porque ela monta o envelope e varre subconjuntos.
function resolverEnvelopeCaixaV1(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({
      p_unidade_id: payload.unidade_id,
      p_envelope: payload.envelope,
    });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_resolver_envelope_v1`);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    }}, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); } });
    });
    req.on('error', reject); req.setTimeout(45000, () => req.destroy(new Error('timeout resolver envelope'))); req.write(body); req.end();
  });
}

function resolverPagamentoItensV1(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({
      p_unidade_id: payload.unidade_id,
      p_itens: payload.itens,
      p_valor_total: payload.valor_total,
      p_competencia: payload.competencia || null,
    });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_resolver_pagamento_itens_v1`);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    }}, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); } });
    });
    req.on('error', reject); req.setTimeout(45000, () => req.destroy(new Error('timeout resolver pagamento inteiro'))); req.write(body); req.end();
  });
}

// SUGESTÃO DE NOME PARECIDO (06/10/2026). Só leitura, só para PERGUNTAR.
//
// 🔴 CG, 05/10: um "z" a mais no primeiro nome derrubou a identidade
//    (`aluno_nao_encontrado`), a Sol mandou "confere o nome completo" e a
//    equipe — que via o nome certo — travou 3 vezes e descartou o comprovante.
//
// ⚠️ A RPC não resolve nada: devolve até 4 nomes da MESMA unidade e a Sol
//    pergunta. Qualquer falha (sem credencial, timeout, função ainda não
//    aplicada no banco -> 404) vira `null` e a mensagem antiga volta a valer.
//    Sugestão é conveniência; nunca pode virar motivo de não responder.
function sugerirAlunoParecidoV1(payload, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const body = JSON.stringify({ p_unidade_id: payload.unidade_id, p_nome: payload.nome });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_sugerir_aluno_parecido_v1`);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    }}, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`sugerir aluno: HTTP ${res.statusCode}`));
        try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(new Error(`resposta invalida (${res.statusCode})`)); }
      });
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('timeout sugerir aluno'))); req.write(body); req.end();
  });
}

function lancarRecebimentoLote(payload, env) {
  return chamarRpcCaixa('sol_caixa_lancar_recebimento_lote_v1', payload, env);
}

// Composição do MESMO aluno é resolvida no LA Report. O bridge não lê alunos
// nem emusys_faturas diretamente: nome, competência e total são apenas sinais;
// a RPC canônica escolhe os itens ou bloqueia a ambiguidade.
function resolverCompostoAlunoCaixaV1(payload, env) {
  return chamarRpcCaixa('sol_caixa_resolver_composto_aluno_v1', payload, env);
}

function extrairCorrecaoForma(text) {
  const t = _normConf(text).replace(/^sol\b\s*[,;:-]?\s*/i, '');
  if (!t) return null;
  if (!/\b(pix|dinheiro|cartao|debito|credito|cheque|transferencia|transfer)\b/i.test(t)) return null;
  const querCorrigir = /(foi|era|corrig|muda|troca|nao e|não é|entrou como|lancou como|lançou como)/i.test(t);
  if (!querCorrigir) return null;
  // 🔴 DUAS FORMAS NA MESMA FRASE NAO E CORRECAO, E EXPLICACAO. Recreio,
  //    10/09 15:27: a Vitoria escreveu ao Luciano "essa aluna faz dois cursos,
  //    1 foi pago no cartao de credito e outro no pix". O extrator via "foi",
  //    achava cartao primeiro e virava `corrigir_forma` -> o card voltou para
  //    cartao e a competencia que ela tinha acabado de corrigir se perdeu.
  //    Frase que cita DUAS formas nao esta mandando usar uma delas — esta
  //    contando o caso. Quem cita duas, pergunta.
  // ⚠️ Sem `\b` de proposito: este arquivo atravessa camadas de escape e a
  //    barra some — a primeira versao virou BACKSPACE literal e a guarda
  //    nunca disparou. Padding com espaco faz o mesmo trabalho sem barra.
  const _pad = ' ' + t.replace(/[^a-z0-9]+/gi, ' ') + ' ';
  const _formas = new Set();
  if (_pad.includes(' pix ')) _formas.add('pix');
  if (_pad.includes(' dinheiro ')) _formas.add('dinheiro');
  if (_pad.includes(' cartao ') || _pad.includes(' credito ') || _pad.includes(' debito ')) _formas.add('cartao');
  if (_pad.includes(' cheque ')) _formas.add('cheque');
  if (_pad.includes(' transferencia ') || _pad.includes(' transfer ')) _formas.add('transferencia');
  if (_formas.size >= 2) return { forma: null, ambigua: true, formas: Array.from(_formas) };
  const cartao = extrairCartao(t);
  if (cartao && !/\bnao\s+(?:e|eh|é)\s+cartao\b/.test(t)) {
    return { forma: 'cartao', cartaoModalidade: cartao.modalidade || null, cartaoParcelas: cartao.parcelas || null };
  }
  if (/\bpix\b/i.test(t)) return { forma: 'pix', cartaoModalidade: null, cartaoParcelas: null };
  if (/\bdinheiro\b/i.test(t)) return { forma: 'dinheiro', cartaoModalidade: null, cartaoParcelas: null };
  if (/\btransferencia\b|\btransferência\b|\btransfer\b/i.test(t)) return { forma: 'transferencia', cartaoModalidade: null, cartaoParcelas: null };
  if (/\bcheque\b/i.test(t)) return { forma: 'cheque', cartaoModalidade: null, cartaoParcelas: null };
  if (/\b(?:entrou|lancou|lancou)\s+como\s+cartao\b/i.test(t) || /\bnao\s+(?:e|eh)\s+cartao\b/i.test(t)) return { forma: null };
  if (/\bcartao\b/i.test(t)) return { forma: 'cartao', cartaoModalidade: null, cartaoParcelas: null };
  return { forma: null };
}

function extrairLancamentoCitado(text) {
  const raw = String(text || '');
  if (!/lancei no caixa/i.test(raw)) return null;
  const valor = extrairValor(raw, { allowBare: true });
  if (!valor) return null;
  const forma = /\(([^)]+)\)/.exec(raw);
  const formaTxt = forma ? _normConf(forma[1]) : '';
  let formaAtual = null;
  let cartaoModalidade = null;
  if (/\bpix\b/.test(formaTxt)) formaAtual = 'pix';
  else if (/\bdinheiro\b/.test(formaTxt)) formaAtual = 'dinheiro';
  else if (/\btransfer/.test(formaTxt)) formaAtual = 'transferencia';
  else if (/\bcheque\b/.test(formaTxt)) formaAtual = 'cheque';
  else if (/\bcartao\b/.test(formaTxt)) {
    formaAtual = 'cartao';
    if (/\bdebito\b/.test(formaTxt)) cartaoModalidade = 'debito';
    if (/\bcredito\b/.test(formaTxt)) cartaoModalidade = 'credito';
  }
  const cat = /:\s*([^—\-\n]+)[—\-]/.exec(raw);
  const categoriaTxt = cat ? _normConf(cat[1]).trim() : '';
  let categoria = null;
  if (/passaporte/.test(categoriaTxt)) categoria = 'passaporte';
  else if (/lojinha|venda/.test(categoriaTxt)) categoria = 'lojinha';
  else if (/matricula|matr[ií]cula/.test(categoriaTxt)) categoria = 'matricula';
  else if (/parcela|mensalidade|quitacao|quitacao/.test(categoriaTxt)) categoria = 'parcela';
  return { valor, formaAtual, cartaoModalidade, categoria };
}

function extrairComandoMovimento(text) {
  const raw = String(text || '');
  const t = _normConf(raw).replace(/^sol\b\s*[,;:-]?\s*/i, '').trim();
  if (!t) return null;
  if (/\b(estorna|estornar|cancela|cancelar|exclui|excluir|apaga|apagar|desfaz|desfazer)\b/i.test(t)) {
    return { tipo: 'estornar', motivo: raw.replace(/^sol\b\s*[,;:-]?\s*/i, '').trim() || 'Estorno solicitado pelo grupo' };
  }
  const querCorrigir = /\b(corrig|corrige|corrigir|muda|mudar|altera|alterar|troca|trocar|nao e|não é|valor certo|valor correto)\b/i.test(t);
  if (!querCorrigir) return null;

  const correcoes = {};
  const valor = extrairValor(raw, { allowBare: true });
  if (valor && /\b(valor|r\$|reais|real|corrig|muda|altera|troca|nao e|não é)\b/i.test(t)) correcoes.valor = valor;

  const forma = extrairCorrecaoForma(raw);
  if (forma && forma.forma) {
    correcoes.forma_pagamento = forma.forma;
    correcoes.cartao_modalidade = forma.cartaoModalidade || null;
    correcoes.cartao_parcelas = forma.cartaoParcelas || null;
  }

  const cat = _categoriaExplicitaFromCaption(raw);
  if (cat && /\b(categoria|nao e|não é|corrig|muda|altera|troca|parcela|passaporte|lojinha|matr[ií]cula|seguran[cç]a)\b/i.test(t)) correcoes.categoria = cat;

  const responsavel = /respons[aá]vel\s+(?:e|é|eh|para|pra)\s+(.{3,80})$/i.exec(raw);
  if (responsavel) correcoes.responsavel = responsavel[1].trim();

  const descricao = /descri[cç][aã]o\s+(?:e|é|eh|para|pra)\s+(.{3,180})$/i.exec(raw);
  if (descricao) correcoes.descricao = descricao[1].trim();

  const keys = Object.keys(correcoes);
  const soForma = keys.length > 0 && keys.every((k) => ['forma_pagamento', 'cartao_modalidade', 'cartao_parcelas'].includes(k));
  if (keys.length === 0 || soForma) return null;
  return { tipo: 'corrigir', correcoes, motivo: raw.replace(/^sol\b\s*[,;:-]?\s*/i, '').trim() || 'Correção solicitada pelo grupo' };
}

// Casa o comprovante com a parcela REAL do aluno (emusys_faturas) via RPC read-only.
// Best-effort: falha/sem-match -> null. So enriquece o preview; nao decide dinheiro.
function identificarAlunoNovo(unidadeId, nome, { url, key } = carregarEnv(), { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !nome) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId, p_nome: String(nome) });
    const u = new URL(`${url}/rest/v1/rpc/sol_caixa_identificar_aluno_novo_v1`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

function casarParcela(unidadeId, aluno, valor, competencia, { url, key } = carregarEnv(), { timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !aluno) return resolve(null);
    const body = JSON.stringify({
      p_unidade_id: unidadeId,
      p_aluno: String(aluno),
      p_valor: (valor !== null && valor !== undefined) ? Number(valor) : null,
      p_competencia: competencia || null,
    });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_casar_parcela`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { const j = data ? JSON.parse(data) : null; resolve(j && j.ok ? j : null); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Responsável financeiro do aluno (read-only). Best-effort: falha -> null.
// O responsavel financeiro as vezes E o proprio aluno (as vezes com typo no cadastro).
// Nesse caso a linha do preview vira ruido -- omite.
function _chave(x) {
  return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function _dist(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function mesmaPessoa(a, b) {
  const x = _chave(a), y = _chave(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return _dist(x, y) / Math.max(x.length, y.length) <= 0.15;
}

function buscarResponsavel(unidadeId, aluno, { url, key } = carregarEnv(), { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !aluno) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId, p_aluno: String(aluno) });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_responsavel_aluno`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { const j = data ? JSON.parse(data) : null; resolve(j && j.ok ? j : null); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Identifica o aluno a partir do PAGADOR (responsavel cadastrado -> sobrenome de familia).
function identificarPorPagador(unidadeId, nome, { url, key } = carregarEnv(), { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !nome) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId, p_nome: String(nome) });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_identificar_por_pagador`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { const j = data ? JSON.parse(data) : null; resolve(j && j.ok ? j : null); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Duplicidade que importa e' no CAIXA DO DIA (nao no Emusys). Read-only, best-effort.
function jaLancadoHoje(unidadeId, valor, aluno, { url, key } = carregarEnv(), { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !valor) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId, p_valor: Number(valor), p_aluno: aluno || null });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_ja_lancado_hoje`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Parcela na FONTE CANONICA (contrato v4): tipo, numero da parcela, competencia,
// vencimento, status (paga/aberta/vencida), dias de atraso e os tres valores.
function casarParcelaCanonica(unidadeId, aluno, valor, { url, key } = carregarEnv(), { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId || !aluno) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId, p_aluno: String(aluno),
      p_valor: (valor !== null && valor !== undefined) ? Number(valor) : null });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_parcela_canonica`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Linhas do preview a partir da fatura canonica. Regras do contrato:
//  - so chamar de "parcela" quando tipo_fatura='parcela';
//  - "parcela N de M" so quando os dois existem;
//  - valor da parcela = valor_com_desconto; vencida = valor_hoje (com multa/mora);
//  - nunca apresentar valor_sem_desconto_condicional como "o valor da parcela".
// Base comparável da fatura canônica: a MESMA regra de `linhasDaFatura`
// (paga → valor pago; vencida em aberto → valor de hoje; senão valor da parcela).
function baseDaFaturaCanonica(can) {
  const f = can && can.fatura;
  if (!f) return null;
  const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) ? Number(v) : null;
  const vp = n(f.valor_da_parcela), vh = n(f.valor_hoje), vPago = n(f.valor_pago);
  if (f.status === 'paga' && vPago !== null) return vPago;
  if (f.status !== 'paga' && f.vencida && vh !== null) return vh;
  return vp;
}

// 🔴 29/09/2026 (Recreio, 12:54): comprovante de R$ 900 casado com UMA parcela de
//    R$ 500 saiu com "difere — confere" e "Responde pode"; o "pode" gravava R$ 900
//    na fatura de R$ 500. Comprovante MAIOR que a única fatura casada significa
//    outros itens ou excedente: o card explica e pergunta, nunca pede aprovação.
//    Menor que a fatura (parcial/negociação) continua como antes.
function excedeFaturaUnica({ canonica, valor, composto, quitacao, multiplas } = {}) {
  if (composto || multiplas || quitacao) return false;
  const base = baseDaFaturaCanonica(canonica);
  const v = Number(valor);
  if (base === null || !(v > 0)) return false;
  return v - base > 0.01;
}

function deveBloquearLancamento({ composto, parcela, canonica, valor, quitacao, multiplas } = {}) {
  if (!composto && parcela && parcela.multiplas_no_mes && parcela.valor_bate === false) return true;
  return excedeFaturaUnica({ canonica, valor, composto, quitacao, multiplas });
}

function linhasDaFatura(can, valorComprovante) {
  const f = can && can.fatura;
  if (!f) return [];
  const L = [];
  const rotulo = f.tipo_fatura === 'parcela'
    ? ((f.numero_parcela && f.total_parcelas_contrato)
        ? `Parcela ${f.numero_parcela}/${f.total_parcelas_contrato}` : 'Parcela')
    : (f.descricao || 'Lançamento');
  const comp = f.competencia ? String(f.competencia).slice(0, 7).split('-').reverse().join('/') : null;
  const venc = f.data_vencimento ? String(f.data_vencimento).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : null;

  const cab = [rotulo];
  if (comp) cab.push(comp);
  if (venc) cab.push((f.vencida ? 'venceu ' : 'vence ') + venc);
  L.push(cab.join(' · '));

  const vp = (f.valor_da_parcela !== null && f.valor_da_parcela !== undefined) ? Number(f.valor_da_parcela) : null;
  const vh = (f.valor_hoje !== null && f.valor_hoje !== undefined) ? Number(f.valor_hoje) : null;
  const vPago = (f.valor_pago !== null && f.valor_pago !== undefined) ? Number(f.valor_pago) : null;
  // Fatura paga precisa ser comparada com o que o Emusys efetivamente baixou.
  // Comparar com o valor original transforma multa/mora legitima em divergencia
  // (Bernardo/Barra, 15/09: 482,00 + 10,76 = 492,76).
  const base = (f.status === 'paga' && vPago !== null)
    ? vPago
    : ((f.status !== 'paga' && f.vencida && vh !== null) ? vh : vp);
  const bate = (valorComprovante && base !== null) ? Math.abs(Number(valorComprovante) - base) < 0.01 : null;
  // Teto de plausibilidade: quitacao real e' ate ~12 parcelas + margem. Razao
  // de 100x (31/08: OCR sem virgula fez 38.700 "bater com 100 parcelas") e'
  // sinal de VALOR ERRADO — o aviso certo e' a divergencia, nao a quitacao.
  const _razaoParcelas = (valorComprovante && vp) ? Number(valorComprovante) / vp : 0;
  const quitacao = (valorComprovante && vp) ? (Number(valorComprovante) % vp < 0.01 && _razaoParcelas >= 2 && _razaoParcelas <= 13) : false;

  if (f.status === 'paga' && vPago !== null) {
    L.push(`Valor pago: ${fmtBRL(vPago)}${bate === true ? '  ✅ confere' : ''}`);
    if (vp !== null && Math.abs(vPago - vp) >= 0.01) L.push(`Valor original: ${fmtBRL(vp)}`);
  } else if (vp !== null) {
    L.push(`Valor: ${fmtBRL(vp)}${f.vencida ? ' (até o vencimento)' : ''}${bate === true ? '  ✅ confere' : ''}`);
  }
  if (f.sem_vinculo_fatura === true) {
    L.push('Valor declarado no comprovante — sem vínculo de fatura no Emusys');
  }
  if (f.vencida) {
    let l = `🔴 Atrasada há ${f.dias_atraso} dia(s)`;
    if (vh !== null && vp !== null && Math.abs(vh - vp) >= 0.01) l += ` — hoje com multa/mora: *${fmtBRL(vh)}*`;
    L.push(l);
  }
  if (f.status === 'paga') {
    const dt = f.data_pagamento ? String(f.data_pagamento).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : null;
    const via = f.forma_pagamento && f.forma_pagamento.nome ? ` (${f.forma_pagamento.nome})` : '';
    L.push(`Já pago no Emusys${dt ? ' em ' + dt : ''}${via} — falta a baixa no caixa`);
  }
  if (quitacao) {
    L.push(`_O valor bate com ${Math.round(Number(valorComprovante) / vp)} parcelas — parece quitação._`);
  } else if (bate === false) {
    L.push(`⚠️ O comprovante (${fmtBRL(Number(valorComprovante))}) difere do valor da parcela — confere.`);
  }
  return L;
}

// ---- S3: resumo do caixa do dia (determinístico) ---------------------------
const PERGUNTA_CAIXA = /(quanto (entrou|entrando|recebeu|recebemos|foi lan[çc]ado)|como (t[áa]|esta|está) o caixa|resumo do caixa|caixa (de )?hoje|fechamento (de )?hoje|o que (j[áa] )?(entrou|foi lan[çc]ado)|total (do dia|de hoje)|quanto (tem|deu) (no |de )?caixa)/i;
function ehPerguntaDeCaixa(texto) {
  const t = bodyLimpo(texto);
  if (!t || t.length > 200) return false;
  return PERGUNTA_CAIXA.test(t);
}

function resumoDoDia(unidadeId, { url, key } = carregarEnv(), { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !unidadeId) return resolve(null);
    const body = JSON.stringify({ p_unidade_id: unidadeId });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_resumo_do_dia`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { const j = data ? JSON.parse(data) : null; resolve(j && j.ok ? j : null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

const _FORMA_LABEL = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', cheque: 'Cheque', transferencia: 'Transferência', outro: 'Outro' };
function montarResumoCaixa(r) {
  if (!r) return null;
  const L = [`📊 *Caixa de ${r.unidade} — ${r.data}*`, ''];
  if (r.caixa === 'nao_aberto') {
    L.push('O caixa de hoje ainda não foi aberto.');
    return L.join('\n');
  }
  const total = Number(r.total_entradas || 0);
  L.push('*ENTRADAS*');
  L.push('');
  L.push(`• Total: *${fmtBRL(total)}* em ${r.qtd} lançamento(s)`);
  const formas = r.por_forma || {};
  Object.keys(formas).forEach((f) => {
    L.push(`• ${_FORMA_LABEL[f] || f}: ${fmtBRL(Number(formas[f]))}`);
  });
  const lanc = Array.isArray(r.lancamentos) ? r.lancamentos : [];
  if (lanc.length) {
    L.push('');
    L.push('*LANÇAMENTOS*');
    L.push('');
    lanc.slice(0, 10).forEach((x) => {
      L.push(`• ${x.hora} — ${fmtBRL(Number(x.valor))} (${_FORMA_LABEL[x.forma] || x.forma}) — ${x.descricao || x.categoria || ''}`);
    });
    if (lanc.length > 10) L.push(`_(+${lanc.length - 10} lançamento(s))_`);
  }
  L.push('');
  L.push(r.caixa === 'fechado'
    ? `✅ Caixa *fechado*${r.fechado_por ? ' por ' + r.fechado_por : ''} — saldo final ${fmtBRL(Number(r.saldo_final || 0))}.`
    : `🟢 Caixa *aberto* — saldo do cofre ${fmtBRL(Number(r.saldo_inicial_cofre || 0))}.`);
  return L.join('\n');
}

// ---- handler com estado (pendências por grupo) --------------------------

// S0: quem e' a pessoa, pelo TELEFONE (o senderId e' LID do WhatsApp, id interno --
// nao serve pra cruzar cadastro). Read-only; falha -> null (cai no pushName).
function identificarPessoa(telefone, unidadeId, { url, key } = carregarEnv(), { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!key || !telefone) return resolve(null);
    const body = JSON.stringify({ p_telefone: String(telefone), p_unidade_id: unidadeId || null });
    let u;
    try { u = new URL(`${url}/rest/v1/rpc/sol_caixa_quem_e`); } catch (e) { return resolve(null); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy());
    req.write(body); req.end();
  });
}

// Nome pra assinar o lançamento: cadastro > pushName > 4 últimos dígitos.
function nomeParaCarimbo(identidade, event) {
  if (identidade && identidade.identificado && identidade.nome) return identidade.nome;
  return nomeDoAtor(event) + ' (não identificado)';
}

// Nome de quem falou (pushName do WhatsApp), com fallback pro número.
// Nome de aluno plausivel? ("image received", "document", "nao informado" nao sao nomes.
// O bridge injeta esse texto quando a midia vem sem legenda.)
// "está errado"/"tá incorreto" e' frase SOBRE o aluno, nunca nome (31/08: o
// card saiu com ALUNO "está errado").
const _NAO_NOME = /^(image|document|video|audio|sticker|photo|file)([\s_-]*received)?$|^(nao|n[aã]o)\s|received$|^null$|^undefined$|^(aluno|cliente|pagador|comprovante|recibo)$|\b(errad[oa]|incorret[oa]|equivocad[oa]|trocad[oa])\b|^(est[aá]|esta va|estava|t[aá])\s/i;
function nomePlausivel(nome) {
  const t = String(nome || '').trim();
  if (t.length < 4) return false;
  if (_NAO_NOME.test(t)) return false;
  if (!/[a-zA-ZÀ-ÿ]{3}/.test(t)) return false;
  if (/^\d+$/.test(t.replace(/\s/g, ''))) return false;
  return true;
}

function nomeDoAtor(event) {
  const n = String((event && event.senderName) || '').trim();
  if (n && !/^\+?\d[\d\s-]*$/.test(n)) return n;
  const num = String((event && event.senderId) || '').replace(/@.*/, '').replace(/\D/g, '');
  return num ? ('...' + num.slice(-4)) : 'alguém do grupo';
}

// "todas as parcelas", "quitou o ano", "antecipou": e' pagamento de VARIAS parcelas --
// casar uma parcela unica aqui seria mentira no lancamento.
const MULTIPLAS = /(todas\s+as\s+parcelas|todas\s+parcelas|quita(?:c|ç)(?:a|ã)o|quitou|quitar|antecipa(?:c|ç)(?:a|ã)o|antecipou|pacote\s+de\s+parcelas|ano\s+todo|semestre\s+todo|contrato\s+(?:todo|inteiro)|anuidade)/i;
function pagamentoMultiplo(texto) { return MULTIPLAS.test(String(texto || '')); }

function extrairDivisaoPagamento(texto, total) {
  const t = String(texto || '');
  if (!t || !/(=|\+|divid|separad|guitarra|canto|piano|bateria|viol[aã]o|teclado)/i.test(t)) return null;
  const matches = [...t.matchAll(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+,\d{2}/gi)]
    .map((m) => ({ bruto: m[0], valor: parseBRMoney(m[0]), idx: m.index || 0 }))
    .filter((m) => m.valor && m.valor > 0);
  if (matches.length < 2) return null;
  const totalNum = Number(total || 0);
  let partes = matches;
  if (totalNum) {
    const iTotal = partes.findIndex((m) => Math.abs(m.valor - totalNum) < 0.05);
    if (iTotal >= 0 && partes.length > 2) partes = partes.filter((_, i) => i !== iTotal);
  }
  if (partes.length < 2) return null;
  const soma = partes.reduce((s, m) => s + Number(m.valor || 0), 0);
  if (totalNum && Math.abs(soma - totalNum) > 0.05) return null;
  return partes.map((m) => {
    const antes = t.slice(Math.max(0, m.idx - 28), m.idx).replace(/[=+,:;\-–—()]/g, ' ').replace(/\s+/g, ' ').trim();
    const label = (antes.split(' ').filter(Boolean).slice(-2).join(' ') || 'parte').trim();
    return { label, valor: m.valor };
  });
}

function extrairAdicionalPagamento(texto) {
  const t = String(texto || '');
  if (!t || !/(falta|faltou|junto|inclui|incluir|mais|\+|banda|projeto|passaporte|taxa\s+de\s+matr[íi]cula)/i.test(t)) return null;
  const valores = valoresMonetarios(t);
  if (valores.length !== 1) return null;
  const idx = valores[0].idx;
  const trecho = t.slice(Math.max(0, idx - 50), Math.min(t.length, idx + 50));
  let label = 'adicional';
  if (/banda|projeto\s+de\s+banda/i.test(trecho)) label = 'Projeto de banda';
  if (/passaporte|taxa\s+de\s+matr[íi]cula/i.test(trecho)) label = 'Passaporte';
  const valor = valores[0].valor;
  return valor > 0 ? { label, valor } : null;
}

// Palavras com que a equipe diz que o dinheiro SAIU. Só valem no que o HUMANO
// escreveu — nunca no OCR (o cupom da compra tem COMPRA/PAGAMENTO/TROCO no corpo).
// ⚠️ "vale" so como substantivo com complemento ("vale de R$50", "vale pro
// instrutor") — "vale confirmar" e' verbo, e foi o que transformou um RELATO
// em saida de R$633 (31/08).
const SAIDA_TERMO_RE = /\b(?:despesas?|desembolso|reembolso|sa[ií]das?|retirad[ao]s?|retirei|sangrias?|compra(?:mos|ram)?|comprei|paguei|pagamos|gastei|gastos?)\b|\bvale\s+(?:de|do|da|pr[ao])\b|\bvale\s+(?:r\$\s*)?\d/i;

// Devolve a categoria de SAIDA declarada na legenda, ou null.
// ⚠️ Recebimento de aluno nunca e' saida, mesmo com verbo de compra na frase
// ("o responsavel pagou a parcela"): parcela/mensalidade/passaporte/matricula
// desqualificam antes de qualquer termo.
// Prosa/relato NAO e' ditado de lancamento (31/08: o resumo da auditoria
// colado no grupo virou "Saida de caixa R$633 dinheiro"). Ditado real e'
// curto, tem UM valor e nao fala de auditoria/exclusao/relatorio.
function _ehDitadoDeCaixa(texto) {
  const t = String(texto || '');
  if (!t) return false;
  if (t.length > 220) return false;
  if ((t.match(/r\$\s*[\d.,]+/gi) || []).length > 1) return false;
  if (/\b(apagad\w*|exclu[ií]\w*|audit\w*|rastro|trilha|deploy|restart|migration|corrigid\w*|documentad\w*|relat[oó]rio|resumo)\b/i.test(t)) return false;
  return true;
}

function _saidaExplicitaFromCaption(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  if (/\b(parcela|mensalidade|passaporte|matr[ií]cula)\b/i.test(t)) return null;
  if (/\btroco\b/i.test(t)) return 'troco';
  // "Sangria" é o nome de balcão da retirada de dinheiro do caixa (02/10/2026):
  // mesma categoria, sem categoria nova no banco.
  if (/\b(retirad[ao]s?|retirei|sangrias?)\b/i.test(t)) return 'retirada';
  // 🔴 29/09/2026 (CG, Jhon): "Sol, pagamento semanal do segurança - R$100,00 dinheiro"
  //    virou card de `despesa`. Segurança É saída, e o termo genérico ("saída",
  //    "paguei", "despesa") não pode vencer a categoria que a pessoa nomeou. Antes o
  //    ditado só acertava porque não tinha termo genérico; o adaptador da ferramenta
  //    (`saída <cat> R$ …`) sempre tem, então segurança pela ferramenta era impossível.
  if (/seguran[çc]a|vigia|porteiro/i.test(t)) return 'seguranca';
  if (SAIDA_TERMO_RE.test(t)) return 'despesa';
  return null;
}

// Categoria de SAÍDA dita pela PESSOA, com a mesma precedência do ditado de texto.
// É o código que decide a categoria a partir das palavras humanas; o palpite do
// modelo só vale quando a pessoa não nomeou nenhuma (29/09/2026).
function categoriaSaidaDoTexto(texto) {
  const t = String(texto || '');
  const saida = _saidaExplicitaFromCaption(t);
  if (saida) return saida;
  const cat = _categoriaExplicitaFromCaption(t);
  return categoriaEhSaida(cat) ? cat : null;
}

function _categoriaFromCaption(body) {
  const t = String(body || '');
  if (/seguran[çc]a|vigia|porteiro/i.test(t)) return 'seguranca';
  if (/passaporte/i.test(t)) return 'passaporte';
  if (detectarLojinhaProduto(t)) return 'lojinha';
  if (/matr[íi]cula/i.test(t)) return 'matricula';
  return 'parcela';
}
function _categoriaExplicitaFromCaption(body) {
  const t = String(body || '');
  if (/seguran[çc]a|vigia|porteiro/i.test(t)) return 'seguranca';
  if (/passaporte/i.test(t)) return 'passaporte';
  if (/matr[íi]cula/i.test(t)) return 'matricula';
  if (detectarLojinhaProduto(t)) return 'lojinha';
  if (/\b(parcela|mensalidade)\b/i.test(t)) return 'parcela';
  return null;
}

// Venda de lojinha por texto (V3): exatamente UM valor, aceitando "R$ 40,00",
// "Valor: 60", "60 reais". Dois valores diferentes = não adivinha (29/09/2026).
function _valorLojinhaTexto(texto) {
  const t = String(texto || '');
  const vals = new Set();
  const re = /(?:r\$\s*|valor\s*:?\s*(?:r\$\s*)?)(\d{1,5}(?:\.\d{3})*(?:,\d{1,2})?)|(\d{1,5}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const v = parseBRMoney(m[1] || m[2]);
    if (v > 0) vals.add(Math.round(v * 100));
  }
  if (vals.size !== 1) return null;
  return [...vals][0] / 100;
}

// Comprador declarado numa venda de lojinha: "aluno: X", "aluno X", "para a aluna X".
function _compradorDeclaradoLojinha(texto) {
  const rot = _alunoRotulado(texto);
  if (rot) return rot;
  const m = String(texto || '').match(/\b(?:para|pra|pro)\s+(?:[ao]\s+)?alun[oa]\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,5}?)(?=\s*(?:[-–—:,]|valor\b|r\$|\d|pix\b|dinheiro\b|cart[ãa]o\b|$))/i);
  const nome = m && m[1] && m[1].trim();
  return nome && nome.split(/\s+/).length >= 2 ? nome : null;
}

// 🔴 DESCRICAO DA SAIDA = O QUE A PESSOA ESCREVEU SOBRE O GASTO (06/10/2026).
//
// Caso Vitoria/Recreio 05/10: foto do cupom + "Compra de 3 pós de café e 3 de
// açúcar\nRetirada do caixa\nR$91,40 - dinheiro". O grupo leu "Lancei a saída…
// · Compra de pós de café e de açúcar Retirada do caixa" (era o campo ALUNO,
// lixo do `_alunoFromCaption`), o banco gravou "PG Semana Retirada" e o
// fechamento mostrou isso. A ADM corrigia a mao no report TODA vez.
//
// Duas fontes de verdade causavam isso: esta funcao (ditado por texto) e um
// bloco copiado no caminho da midia — e ambos jogavam fora a frase inteira
// quando ela continha a palavra da categoria ("retirada"), alem de arrancar
// "de"/"do" e deixar o texto ilegivel. Agora e UMA funcao, usada pelo card,
// pela confirmacao e pelo payload do banco.
//
// Regra: tira so o que nao descreve o gasto — valor (R$…), forma de pagamento,
// mencoes (@…), e trechos que sao SO rotulo ("Retirada do caixa", "saída em
// dinheiro", "PG segurança semana 25/08"). O resto fica como a pessoa escreveu
// (acento, preposicao, numero). Sem nada util: `PG Semana <Categoria>`, como antes.
// ⚠️ "PG semana <cat>" escrito pela pessoa continua no formato antigo
//    ("PG Semana Seguranca", "PG Semana Despesa - segurança"): e a convencao da
//    equipe para o pagamento semanal (Mayra/CG 25/08, Jhon/CG 09/09).
// ⚠️ Lookaround Unicode, nunca `\b`: em JS `\b` e ASCII e parte "saída" em
//    "saí"+"da" (Mayra/CG 25/08).
const _semAcentoDesc = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// palavras que, sozinhas, so ROTULAM a saida (nao dizem com o que se gastou)
const _ROTULO_SAIDA_DESC = new Set(('teve houve tivemos saida saidas retirada retiradas retirado retirei sangria sangrias '
  + 'gasto gastos despesa despesas compra uma um hoje pagamento pagamentos pg pgto pago paga semanal semana '
  + 'comprovante recibo cupom nota fiscal foi no na nos nas de do da dos das em o a os as e com caixa cofre '
  + 'para pra pro valor referente ref sol segue aqui lancar lanca lancei pode dinheiro especie pix cartao '
  + 'credito debito transferencia').split(' '));
// o que pode ser podado nas PONTAS de um trecho util ("Retirada do caixa para
// compra de café" -> "compra de café"; "café retirada do caixa" -> "café")
const _PONTA_SAIDA_DESC = new Set(('teve houve tivemos uma um saida saidas retirada retiradas retirado retirei sangria '
  + 'sangrias do da de dos das no na nos nas em caixa cofre para pra pro hoje foi referente ref valor sol e com '
  + 'segue aqui').split(' '));
const _PG_SEMANA_DESC = new Set(['pg', 'pgto', 'pagamento', 'semana', 'semanal']);

function _descricaoSaidaTexto(texto, categoria) {
  const cat = String(categoria || '').toLowerCase();
  const fallback = `PG Semana ${cap(cat)}`;
  const bruto = bodyLimpo(texto);
  if (!bruto) return fallback;
  const catTok = new Set(_semAcentoDesc(cat).split(/[^a-z0-9]+/).filter(Boolean));
  const norm = (tok) => _semAcentoDesc(tok).replace(/[^\p{L}\p{N}\/]/gu, '');
  const ehData = (n) => /^\d+(?:[\/.-]\d+)*$/.test(n);
  const ehRotulo = (n) => !n || _ROTULO_SAIDA_DESC.has(n) || catTok.has(n) || ehData(n);
  const aparar = (s) => s.replace(/^[\s\-–—:,.;]+|[\s\-–—:,;]+$/g, '').trim();
  const pgSemana = /(?<!\p{L})(?:pg|pgto|pagamento)(?!\p{L})/iu.test(bruto)
    && /(?<!\p{L})seman(?:a|al)(?!\p{L})/iu.test(bruto);

  const trechos = bruto
    .replace(/(^|\n)\s*@?sol\s*[,!?:-]?\s*/gi, '$1')
    .split(/\r?\n+|\s+[-–—|·;]+\s+|\s*[|·;]\s*/)
    .map((seg) => String(seg || '')
      .replace(/@\d{5,}/g, ' ')
      .replace(/r\$\s*[\d.,]*\d/gi, ' ')
      .replace(/(?<![\p{L}\p{N}])\d+(?:[.,]\d{1,2})?\s*reais(?!\p{L})/giu, ' ')
      .replace(/(?<![\p{L}\p{N}.,])\d{1,3}(?:\.\d{3})*,\d{2}(?![\p{N}])/gu, ' ')
      .replace(/(?<!\p{L})(?:(?:em|no|na|via|pelo|pela)\s+)?(?:dinheiro|esp[ée]cie|pix|cart[ãa]o(?:\s+de)?(?:\s+(?:cr[ée]dito|d[ée]bito))?|transfer[êe]ncia)(?!\p{L})/giu, ' ')
      .replace(/[^\p{L}\p{N}\s.,:\/()%+&'"-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .map((seg) => {
      const toks = seg.split(' ').filter(Boolean);
      if (!toks.some((t) => !ehRotulo(norm(t)))) return '';           // trecho so de rotulo
      const poda = (t) => { const n = norm(t); return !n || _PONTA_SAIDA_DESC.has(n) || catTok.has(n); };
      while (toks.length && poda(toks[0])) toks.shift();
      while (toks.length && poda(toks[toks.length - 1])) toks.pop();
      return aparar(toks.join(' '));
    })
    .filter((seg) => seg.length >= 2);

  let desc = trechos.join(' - ');
  if (pgSemana) {
    // "PG Semana <Cat>" ja diz pg/semana/categoria: o complemento nao repete
    desc = aparar(desc.split(' ').filter((t) => {
      const n = norm(t); return n && !_PG_SEMANA_DESC.has(n) && !catTok.has(n) && !ehData(n);
    }).join(' '));
    return desc.length >= 2 ? `${fallback} - ${desc}`.slice(0, 160) : fallback;
  }
  if (desc.length < 3) return fallback;
  return (desc.charAt(0).toUpperCase() + desc.slice(1)).slice(0, 160);
}

function _pareceTesteLancarApagar(texto) {
  const t = bodyLimpo(texto);
  return /\b(apag(?:o|a|ar)|exclu(?:o|i|ir)|delet(?:o|a|ar))\b/i.test(t)
    && /\b(test(?:e|ar|ando)?|lanc(?:o|a|ar)|lan[çc](?:o|a|ar))\b/i.test(t);
}

// Corta o comentario operacional que vem DEPOIS do nome do aluno. A equipe
// escreve naturalmente "parcela Nome Sobrenome pago no pix (...)"; sem esta
// fronteira, o parser transformava "pago no pix / ativamos..." em sobrenomes e
// obrigava o fluxo a depender do fallback pelo pagador.
//
// A regra exige um separador antes do verbo e um complemento tipico de
// pagamento depois dele. Assim, nao vira uma lista de frases conhecidas e nao
// corta nomes por mero substring.
function _cortarComentarioPagamentoDoNome(texto) {
  return String(texto || '').replace(
    /\s+(?:foi\s+)?(?:pag[oa]|pagou|quitad[oa])\b(?=\s+(?:no|na|via|por|em|hoje|ontem)\b|\s*\(|\s*$)[\s\S]*$/i,
    ' '
  );
}

function _alunoFromCaption(body) {
  let t = bodyLimpo(body);
  if (!t) return null;
  const rotulado = _alunoRotulado(t);
  if (rotulado) return rotulado;
  t = _cortarComentarioPagamentoDoNome(t);
  t = t.replace(/\b(parcela|passaporte|lojinha|mensalidade|matr[íi]cula|pagamento|comprovante|recibo|pix|dinheiro|cart[ãa]o|transfer[êe]ncia|boleto)\b/gi, ' ');
  t = t.replace(/\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi, ' ');
  t = t.replace(/r\$\s*[\d.,]+/gi, ' ').replace(/\d+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : null;
}

// Nome do aluno quando o humano ROTULA explicitamente ("aluno: Fulano" / "aluna: Fulana").
// Sinal forte -- vale mais que o palpite do LLM (que pode ter dado timeout). Corta no fim
// da frase e tira etiqueta de unidade (KIDS/LA/CG/Barra/Recreio) e um instrumento no fim.
const _UNIDADE_TAG = /\b(kids|l\.?a|campo\s+grande|c\.?\s*grande|cg|barra|recreio|unidade)\b/gi;
const _INSTRUMENTO = /^(viol[a\u00e3]o|guitarra|baixo|teclado|piano|bateria|canto|voz|trombone|trombeta|trompete|sax(?:ofone)?|flauta|clarinete|viol(?:ino|oncelo)|cavaco|cavaquinho|ukulele|banjo|percuss[a\u00e3]o|teoria|musicaliza[c\u00e7][a\u00e3]o)$/i;
function _limparAlunoRotulado(nome, opts) {
  const minTokens = (opts && opts.minTokens) || 2;
  let n = String(nome || '').split(/[\n,;|]/)[0];
  n = _cortarComentarioPagamentoDoNome(n);
  // O nome termina onde comeca OUTRO campo: "Aluno é Luiza Rodrigues é
  // responsável financeiro Salomé..." engolia a frase inteira (31/08).
  n = n.replace(/\s+(?:e|eh|é)?\s*(?:o|a)?\s*respons[aá]vel(?:\s+financeir[oa])?\b[\s\S]*$/i, ' ');
  // Mesmo corte, outro campo: "Maria Luzia Marinho da Silva Delgado e a parcela
  // é" virou nome inteiro, com o rabo da frase colado (CG 05/09 11:59).
  n = n.replace(/\s+e\s+(?:a|o)\s+(?:parcela|compet[eê]ncia|competencia|forma|categoria|fatura|mensalidade|turma|data|valor(?:es)?|total|desconto)\b[\s\S]*$/i, ' ');
  // Lixo verbal que a equipe cola antes do nome: "Aluno foi Arthur Vargas
  // Caldas" virou nome com "foi" (Barra 31/08) e "Nome do aluno Starline"
  // virou nome com o rotulo inteiro (CG 31/08). O prefixo derruba a guarda de
  // nome-diverge, que rejeita a canonica CERTA por causa do lixo.
  for (let i = 0; i < 5; i++) {
    const semLixo = n
      .replace(/^\s*(?:foi|foram|será|sera|eh|é|e|o|a|d[oa]|nome|alun[oa]s?)\s+/i, '')
      .replace(/^\s*[:\-]\s*/, '');
    if (semLixo === n) break;
    n = semLixo;
  }
  n = n.replace(/\b(v[eê]\s+se\s+localiza|se\s+localiza|localiza\s+sol|confere(?:\s+o\s+nome)?|por\s+favor|pfv)\b.*$/i, ' ');
  n = n.replace(/\br\$\s*[\d.,]+.*$/i, ' ');
  n = n.replace(/\br\s*$/i, ' ');
  n = n.replace(_UNIDADE_TAG, ' ').replace(/\s+/g, ' ').trim();
  let toks = n.split(' ').filter(Boolean);
  if (toks.length >= 3 && _INSTRUMENTO.test(toks[toks.length - 1])) toks = toks.slice(0, -1);
  n = toks.join(' ');
  return (nomePlausivel(n) && toks.length >= minTokens) ? n : null;
}
// "Venda: Arthur" / "Vendedor: Ana" / "Vendido por: Kailane" — quem VENDEU.
// O nome que vem depois destes rotulos NUNCA e' aluno (Barra 29/08: o card saiu
// com ALUNO=Arthur, que e' o ADM que fez a venda, e puxou a responsavel financeira
// de uma familia sem relacao nenhuma com a compra).
function _vendedorRotulado(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  const m = t.match(/\b(?:vend(?:a|eu|edor(?:a)?|ido\s+por)|atendente|atendido\s+por)\s*[:\-]\s*([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.'\s]{2,60})/i);
  if (!m) return null;
  const nome = String(m[1] || '').split(/[\n,;|]/)[0].replace(/\s+/g, ' ').trim();
  return nome || null;
}

// 🔴 VENDEDOR SEM DOIS-PONTOS (Barra, 06/10/2026 12:05). Foto do PagBank + legenda
//    "Venda caderno teclas para o aluno <Aluno>\n\nVenda <Professor>\n\nDébito: R$ 100".
//    O modelo listou as DUAS pessoas como pagamentos, o portão do multi-aluno
//    abriu e a Sol respondeu "a soma dos alunos não fecha" para UMA venda de
//    R$ 100. "Venda <Nome>" é a convenção da equipe para QUEM VENDEU (comissão) —
//    precedente manual de 02/10: "... para aluna X venda prof Y crédito 1x".
//
// Esta função só LÊ o texto: devolve os nomes que vêm depois de "venda",
// "venda prof", "vendido por", "vendedor(a)", "vendeu". Nenhum deles vira
// vendedor por aqui — quem confirma é o cadastro de professores/colaboradores
// ATIVOS (`vendedorDaEquipe`, dentro do handler). Nome que não casa = não há
// vendedor, e o comportamento antigo vale.
// ⚠️ `explicito`: rótulo inequívoco de vendedor ("vendedor", "vendido por",
//    "vendeu", "prof", ou "venda:" com dois-pontos). "Venda <Nome>" solto só
//    vale quando a mesma mensagem declara OUTRO comprador.
const _PARADA_VENDEDOR = new Set(('para pra pro pros pras no na nos nas em com ao aos a o os as e ou aluno aluna alunos alunas '
  + 'r reais real valor total cartao debito credito pix dinheiro especie transferencia boleto hoje ontem '
  + 'parcelado parcelada vista x foi feita feito realizada realizado').split(' '));
const _CONECTOR_VENDEDOR = new Set(['de', 'da', 'do', 'das', 'dos']);
function _vendedoresCitados(texto) {
  const out = [];
  const semAc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const re = /(?<!\p{L})(vendid[oa]\s+por|vendedor(?:a)?|vendeu|venda)(?!\p{L})\s*([:\-–—]?)\s*(?:(?:pel[oa]|d[oa])\s+)?(?:(prof(?:essor(?:a)?)?|profª)(?!\p{L})\.?\s*)?([\p{L}'’][\p{L}'’.\s]{1,80})/giu;
  for (const linha of String(bodyLimpo(texto) || '').split(/\r?\n/)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(linha)) !== null) {
      // o trecho do nome pode engolir um "venda prof X" seguinte: a busca continua
      // logo depois do rótulo, nunca depois do trecho inteiro
      re.lastIndex = m.index + m[1].length;
      const rotulo = semAc(m[1]);
      const prof = !!m[3];
      const toks = String(m[4] || '').split(/\s+/).map((t) => t.replace(/[.]+$/, '')).filter(Boolean);
      const nome = [];
      for (let i = 0; i < toks.length && nome.length < 6; i++) {
        const n = semAc(toks[i]).replace(/[^a-z'’]/g, '');
        if (!n) break;
        if (_CONECTOR_VENDEDOR.has(n)) { if (!nome.length) break; nome.push(toks[i].toLowerCase()); continue; }
        if (_PARADA_VENDEDOR.has(n) || PRODUTO_LOJINHA_RE.test(n) || n.length < 2) break;
        nome.push(toks[i]);
      }
      while (nome.length && _CONECTOR_VENDEDOR.has(semAc(nome[nome.length - 1]))) nome.pop();
      if (!nome.length) continue;
      const explicito = prof || rotulo !== 'venda' || !!m[2];
      out.push({ declarado: tituloNome(nome.join(' ')), explicito, prof });
    }
  }
  return out;
}

// O nome DITADO casa com o nome do CADASTRO da equipe? Mesmo primeiro nome e
// todo token ditado presente no cadastro (sem acento, sem conectivo). "Rafael
// Montenegro" casa "Rafael Montenegro Sales Pinto"; "Rafael Moreira" não casa.
// Fuzzy aqui, não: vendedor errado é comissão errada.
function _casaNomeEquipe(declarado, cadastro) {
  const toks = (s) => _normConf(String(s || '')).replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((t) => t && !_CONECTOR_VENDEDOR.has(t) && t !== 'e');
  const d = toks(declarado).filter((t) => t.length >= 2);
  const c = toks(cadastro);
  if (!d.length || !c.length || d[0] !== c[0]) return false;
  const set = new Set(c);
  return d.every((t) => set.has(t));
}

// Descrição de lojinha: UMA função para card, confirmação e banco.
function descricaoLojinha(item, aluno, vendedor) {
  const base = `Lojinha/Venda - ${item || 'Produto'}${aluno ? ' - ' + aluno : ''}`;
  if (!vendedor || !vendedor.declarado) return base;
  return `${base} · venda ${vendedor.prof ? 'prof. ' : ''}${vendedor.declarado}`;
}

// Equipe ATIVA (professores + colaboradores) — só leitura, para reconhecer
// vendedor. Professor aparece nas duas tabelas com o mesmo nome: é UMA pessoa.
async function listarEquipeAtiva(env = carregarEnv()) {
  const [profs, colabs, mesclados] = await Promise.all([
    _restGetJson('professores?ativo=eq.true&select=id,nome,nome_preferido', env),
    _restGetJson('colaboradores?ativo=eq.true&select=nome,tipo', env),
    // 06/10 (Alf): "venda prof Gabriel Leão" — "Gabriel Leão" é o nome do Emusys do
    // Recreio, registro mesclado no professor ativo. Apelido e registro mesclado contam
    // como nomes da MESMA pessoa; quem decide é o cadastro, não o texto.
    _restGetJson('professores?mesclado_em_professor_id=not.is.null&select=nome,mesclado_em_professor_id', env).catch(() => []),
  ]);
  const apelidos = new Map();
  for (const m of Array.isArray(mesclados) ? mesclados : []) {
    if (!m || !m.nome || m.mesclado_em_professor_id == null) continue;
    const k = String(m.mesclado_em_professor_id);
    apelidos.set(k, [...(apelidos.get(k) || []), String(m.nome)]);
  }
  const out = [];
  for (const p of Array.isArray(profs) ? profs : []) {
    if (!p || !p.nome) continue;
    const nomes = [String(p.nome), p.nome_preferido ? String(p.nome_preferido) : null, ...(apelidos.get(String(p.id)) || [])].filter(Boolean);
    out.push({ nome: String(p.nome), prof: true, match: nomes.join(' ') });
  }
  for (const c of Array.isArray(colabs) ? colabs : []) {
    if (c && c.nome) out.push({ nome: String(c.nome), prof: String(c.tipo || '').toLowerCase() === 'professor' });
  }
  return out;
}

function _mesmaPessoa(a, b) {
  const norm = (s) => _normConf(String(s || '')).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // primeiro nome + ao menos um sobrenome em comum, ou um contido no outro
  if (x.startsWith(y + ' ') || y.startsWith(x + ' ')) return true;
  const tx = x.split(' '), ty = y.split(' ');
  if (tx[0] !== ty[0]) return false;
  return tx.length === 1 || ty.length === 1 || tx.some((p) => p !== tx[0] && ty.includes(p));
}

// Conflito REAL de grafia: token significativo do nome ditado que nao existe
// no cadastro. Serve para distinguir "voce escreveu o sobrenome diferente do
// que esta no sistema" (conflito) de "voce escreveu so o primeiro nome"
// (abreviacao). Conectivo e token de <=2 letras nao contam.
function _conflitoDeGrafiaAluno(ditado, cadastro) {
  const norm = (s) => _normConf(String(s || '')).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const CONECTIVO = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del', 'di']);
  const d = norm(ditado), c = norm(cadastro);
  if (!d || !c || d === c) return false;
  const tc = new Set(c.split(' '));
  return d.split(' ').some((p) => p.length > 2 && !CONECTIVO.has(p) && !tc.has(p));
}

function _alunoRotulado(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  // 🔴 SO O SINGULAR ROTULA. "alunos" significa MAIS DE UM — e' o oposto de
  // etiqueta de UM nome. Com o plural aceito, "3 parcelas de alunos diferente
  // mas o valor esta unificado" gravou o ALUNO como "diferente mas o valor
  // esta unificado." (Recreio 05/09 12:45). O \b depois de alun[oa] recusa o
  // plural; o fluxo multi-aluno e quem trata mensagem com varios nomes.
  const m = t.match(/\balun[oa]\b\s*(?:([:\-])\s*|(?:e|é|foi)\s+)?([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.'\s]{2,80})/i);
  if (!m) return null;
  // "aluno: Starline" — rotulo com dois-pontos e' ditado deliberado: aceita
  // nome de um token (banda/mononimo). Sem o dois-pontos, a regra dos 2 fica.
  const _nome = _limparAlunoRotulado(m[2], { minTokens: m[1] ? 1 : 2 });
  // 🔴 FRASE NAO E' NOME. Se depois da limpeza ainda sobra vocabulario de
  // operacao, a pessoa estava falando DO LANCAMENTO e nao ditando um nome:
  // "o aluno e a parcela e de setembro" gravava ALUNO = "parcela e de setembro".
  if (_nome && _META_DEPOIS_DE_ALUNO.test(_nome)) return null;
  return _nome;
}

// Em uma pendência única, a equipe costuma responder só com o nome em uma
// linha e "Parcela 08/2026" na outra. Isso é dado humano forte; não deve ser
// descartado só por faltar a etiqueta "aluno:". Ainda passa pela canônica.
const META_NAO_E_NOME_RE = /\b(descri[cç][aã]o|categoria|despesa|sa[ií]da|entrada|retirada|sangria|troco|forma|valor|corrig|corre[cç][aã]o|lan[cç]|altera|muda|troca|confirma|pode|n[aã]o\s+e|cofre|caixa)\b/i;
// Vocabulario que, logo depois de "aluno", prova que a frase fala DO
// LANCAMENTO e nao dita um nome. Reusa META (fonte unica) e acrescenta os
// substantivos do dominio — duas listas soltas divergiriam com o tempo.
const _META_DEPOIS_DE_ALUNO = new RegExp(
  META_NAO_E_NOME_RE.source + '|\\b(parcelas?|compet[eê]ncias?|competencias?|mensalidades?|faturas?|cursos?|turmas?|matr[ií]culas?|passaportes?|m[eê]s|meses)\\b',
  'i');

// "nao tem aluno especifico" / "sem aluno" / "e' de banda X": receita de banda
// ou evento — lancamento sem aluno EXISTE, e a Sol nao tinha como ouvir isso
// (CG 31/08: a frase citando o card levou "Nao entendi essa", e o lancamento
// saiu com ALUNO "Nome do aluno Starline").
// A equipe contesta a FATURA que a Sol casou: "a parcela nao esta vencida",
// "ja foi corrigido no sistema", "TA ERRADO". Antes isso nao era gramatica
// nenhuma — a Sol respondia com o MESMO card (Kailane/Barra 31/08, 3x).
function _contestaFatura(body) {
  const n = _normConf(body);
  if (!n) return false;
  if (n.length > 200) return false;
  const negaVencimento = /(nao\s+(?:esta|ta|e)\s+vencid|nao\s+venceu|ainda\s+nao\s+venceu|nao\s+vence[u]?\s+ainda|vence\s+(?:so\s+)?(?:mes\s+que\s+vem|no\s+proximo|proximo\s+mes)|sera\s+(?:apenas\s+)?mes\s+que\s+vem|e\s+do\s+mes\s+que\s+vem)/.test(n);
  const erroFatura = /((?:ta|esta)\s+errad|nao\s+e\s+(?:essa|esse|essa\s+parcela|essa\s+fatura)|fatura\s+errad|parcela\s+errad)/.test(n);
  const corrigidoLa = /(ja\s+(?:foi\s+)?corrigid|ja\s+corrigi|ja\s+(?:foi\s+)?ajustad|ja\s+atualiz)/.test(n) && /(sistema|emusys)/.test(n);
  return negaVencimento || erroFatura || corrigidoLa;
}

function _semAlunoDeclarado(body) {
  const raw = bodyLimpo(body);
  if (!raw) return null;
  const n = _normConf(raw);
  const nega = /(nao\s+(?:tem|ha|existe)\s+alun[oa]|sem\s+alun[oa](?:\s+especifico)?\b|nao\s+e\s+(?:de\s+)?alun[oa]\b|nenhum\s+alun[oa]\b)/.test(n);
  const banda = /\be\s+d[ea]\s+banda\b/.test(n) || /\bbanda\s*[:\-]/.test(n) || (/\bbanda\b/.test(n) && nega);
  if (!nega && !banda) return null;
  let entidade = null;
  let m = raw.match(/\bbanda\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9.'\s-]{1,40})/i);
  if (!m) m = raw.match(/\bnome\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9.'\s-]{1,40})/i);
  if (m) {
    let e = String(m[1] || '').split(/[\n,;|]/)[0]
      .replace(/\bn[aã]o\b[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
    if (/^(nome|do|da|especifico|específico|especifica|específica)$/i.test(e)) e = '';
    if (e) entidade = ((banda && !/\bbandas?\b/i.test(e)) ? 'Banda ' : '') + tituloNome(e);
  }
  return { entidade };
}

function _nomeHumanoTardio(body) {
  const cru = bodyLimpo(body);
  // "a aluna faz dois cursos" tambem e metafrasa. Ela contem o rotulo
  // `aluna`, mas o que vem depois e uma propriedade da matricula, nao um nome.
  if (/\balun[oa]\s+(?:faz|tem|cursa)\s+(?:dois|duas|tr[eê]s|\d+)\s+cursos?\b/i.test(cru)) return null;
  const rotulado = _alunoRotulado(body);
  if (rotulado) return rotulado;
  // 🔴 LISTA DE PARCELAS NAO E NOME. Caso Isabella/CG 14/09: a Mayra citou o
  // card e respondeu "sao duas parcelas 08/2026 e 09/2026". O extrator tirou
  // os meses e o singular "parcela", deixou "sao duas parcelas e" e substituiu
  // Isabella por essa metafrasa. Duas competencias explicitas pertencem ao
  // campo FATURA; nunca podem entrar no caminho de correcao de aluno.
  if (extrairCompetenciasTexto(body).length >= 2
      || /\b(?:duas|dois|tr[eê]s|quatro|cinco|seis|\d+)\s+parcelas?\b/i.test(bodyLimpo(body))) return null;
  // Quem fala SOBRE o lancamento nao esta dizendo um nome de aluno.
  if (META_NAO_E_NOME_RE.test(cru)) return null;
  let t = cru
    .replace(/^sol\s*[,!?:-]?\s*/i, ' ')
    .replace(/\b(parcela|mensalidade|compet[eê]ncia|pagamento|comprovante|recibo|pix|dinheiro|cart[ãa]o|transfer[êe]ncia|unidade|campo\s+grande|recreio|barra)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{4}\b/g, ' ')
    .replace(/r\$\s*[\d.,]+/gi, ' ')
    .replace(/[^\p{L}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  const toks = t.split(' ').filter(Boolean);
  if (toks.length < 2 || toks.length > 6) return null;
  // Comentario nao e' nome: nenhum nome de PESSOA carrega estes tokens.
  // "ai Jhon ta certo esse" (01/09) sobreviveu a limpeza e virou ALUNO no card.
  const _TOK_NAO_NOME = /^(ai|a[i\u00ed]|ah|oh|opa|eita|po|p[o\u00f4]|ta|t[a\u00e1]|certo|certa|errado|errada|esse|essa|isso|aqui|ali|la|l[a\u00e1]|sim|nao|n[a\u00e3]o|ok|beleza|valeu|obrigad[oa]|gente|pessoal|galera|ne|n[e\u00e9]|mesmo|hein|uai|oi|ola|ol[a\u00e1]|eai|falou|cade|cad[e\u00ea])$/i;
  if (toks.some((x) => _TOK_NAO_NOME.test(x))) return null;
  return _limparAlunoRotulado(toks.join(' '));
}

function _cursoRotulado(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  const m = t.match(/\bcurso\s*(?:(?:[:\-])\s*|(?:e|é)\s+)?([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.'\s]{2,50})/i);
  if (!m) return null;
  let c = String(m[1] || '').split(/[\n,;|]/)[0].replace(/\s+/g, ' ').trim();
  c = c.replace(/\b(parcela|compet[eê]ncia|alun[oa]|valor|r\$).*$/i, '').trim();
  return c ? tituloNome(c) : null;
}

function _confirmacaoManualFatura(texto) {
  const aluno = _alunoRotulado(texto);
  const curso = _cursoRotulado(texto);
  const competencia = extrairCompetenciaTexto(texto);
  const temParcela = /\b(parcela|mensalidade)\b/i.test(String(texto || ''));
  if (!aluno || !competencia || !(curso || temParcela)) return null;
  return { aluno, curso, competencia };
}

function _alunoSuspeito(nome) {
  const n = bodyLimpo(nome);
  if (!n) return true;
  return /\b(restante|alun[oa]|passaporte|parcela|mensalidade|pagamento|comprovante|banda|evento|fest(?:a|ival)?|rock|show|grava[cç][aã]o|gravar)\b/i.test(n)
    || /\b(do|da|de)\s+(do|da|de)\b/i.test(n);
}

// Camada 1 de visao: OCR LOCAL (igual Maria) -- sem LLM, sem billing.
// Imagem -> tesseract (por+eng); PDF -> pdftotext, fallback pdftoppm+tesseract.
// `detailed` preserva o contrato legado (string por padrao), mas permite ao
// handler distinguir timeout, erro do tesseract e texto realmente vazio.
// Sem isto, 2+ tesseract concorrentes TRAVAM DE VERDADE nesta maquina (OpenMP
// disputando todas as CPUs visiveis por processo) -- nao e' mais lento, e' deadlock.
// Medido 26/08: sozinho ~1s; 2 concorrentes sem limite, nunca fecha (>50s); 2
// concorrentes com isto, <1s cada. Raiz do timeout de 45s em 100% das imagens de hoje.
const TESSERACT_ENV_SEM_OVERSUBSCRIPTION = { ...process.env, OMP_THREAD_LIMIT: '1', OMP_NUM_THREADS: '1' };

// Segunda chance no padrao da Maria: upscale + binarizacao + 2 PSMs por score
// + confianca medida + QR do PIX. Roda SO quando o caminho rapido falhou —
// medido 2,7x mais lento (2,2s -> 6,0s), e timeout ja e o defeito nº1
// (50 de 242). Rapido no comum, pesado onde ja tinha desistido.
function ocrSegundaChance(caminho) {
  try {
    const cp = require('child_process');
    const r = cp.spawnSync('/usr/bin/python3',
      ['/home/sol/.openclaw/workspace/scripts/ocr-comprovante.py', caminho],
      { timeout: 90000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0 || !r.stdout) return null;
    const j = JSON.parse(r.stdout);
    return (j && j.ok && j.text) ? j : null;
  } catch (_) { return null; }   // segunda chance nunca derruba nada
}

function ocrLocal(imagePath, { timeout = 45000, detailed = false } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let bytes = null;
    const finish = (text, meta = {}) => {
      const clean = String(text || '').trim();
      const result = {
        text: clean,
        status: meta.status || (clean ? 'ok' : 'texto_vazio'),
        duration_ms: Date.now() - startedAt,
        file_bytes: bytes,
        ...meta,
      };
      return resolve(detailed ? result : clean);
    };
    if (!imagePath) return finish('', { status: 'arquivo_ausente' });
    try {
      if (!fs.existsSync(imagePath)) return finish('', { status: 'arquivo_inexistente' });
      bytes = fs.statSync(imagePath).size;
    } catch (e) { return finish('', { status: 'arquivo_indisponivel', error_code: e && e.code || null }); }
    const isPdf = /\.pdf$/i.test(imagePath);
    if (isPdf) {
      execFile('/usr/bin/pdftotext', ['-layout', imagePath, '-'], { timeout, maxBuffer: 3 * 1024 * 1024 }, (err, stdout) => {
        const t = String(stdout || '').trim();
        if (t.length >= 15) return finish(t, { status: 'ok', engine: 'pdftotext', exit_code: err && err.code || 0, signal: err && err.signal || null });
        try {
          const cp = require('child_process');
          const pre = imagePath + '.ocrpg';
          const r = cp.spawnSync('/usr/bin/pdftoppm', ['-r', '200', '-png', '-f', '1', '-l', '1', imagePath, pre], { timeout, encoding: 'utf8' });
          const png = pre + '-1.png';
          if (!r.status && fs.existsSync(png)) {
            const rr = cp.spawnSync('/usr/bin/tesseract', [png, 'stdout', '-l', 'por+eng', '--psm', '6'], { timeout, encoding: 'utf8', maxBuffer: 3 * 1024 * 1024, env: TESSERACT_ENV_SEM_OVERSUBSCRIPTION });
            try { fs.unlinkSync(png); } catch (e) {}
            return finish(String(rr.stdout || '').trim(), { status: rr.status === 0 ? 'ok' : 'tesseract_error', engine: 'tesseract', psm: 6, exit_code: rr.status, signal: rr.signal || null });
          }
        } catch (e) {}
        return finish(t, { status: err && (err.killed || err.code === 'ETIMEDOUT') ? 'timeout' : 'texto_vazio', engine: 'pdftotext', exit_code: err && err.code || null, signal: err && err.signal || null });
      });
    } else {
      // PSM 6 (bloco) e 4 (colunas) em paralelo. Antes eram sequenciais e
      // dois timeouts de 45s transformavam uma falha transitória em 90s.
      const outcomes = [];
      const children = [];
      let done = false;
      const stopOthers = () => children.forEach((child) => { try { if (child && !child.killed) child.kill('SIGTERM'); } catch (_) {} });
      const isUsable = (text) => text.length >= 20 && (Boolean(extrairValorOcr(text)) || SINAL_COMPROVANTE.test(text));
      const conclude = (text, meta) => {
        if (done) return;
        done = true;
        stopOthers();
        finish(text, meta);
      };
      const onResult = (psm, err, stdout) => {
        if (done) return;
        const text = String(stdout || '').trim();
        const meta = {
          psm,
          engine: 'tesseract',
          exit_code: err && err.code || 0,
          signal: err && err.signal || null,
          timed_out: Boolean(err && (err.killed || err.code === 'ETIMEDOUT')),
        };
        outcomes.push({ text, meta });
        if (isUsable(text)) return conclude(text, { status: 'ok', ...meta, parallel: true });
        if (outcomes.length < 2) return;
        const texts = outcomes.map((x) => x.text).filter(Boolean);
        const timeoutSeen = outcomes.some((x) => x.meta.timed_out);
        const errorSeen = outcomes.some((x) => x.meta.exit_code && !x.meta.timed_out);
        conclude(texts.join('\n--- psm4 ---\n'), {
          status: texts.length ? 'ok_parcial' : (timeoutSeen ? 'timeout' : (errorSeen ? 'tesseract_error' : 'texto_vazio')),
          engine: 'tesseract',
          psm: outcomes.map((x) => x.meta.psm),
          exit_code: outcomes.map((x) => x.meta.exit_code),
          signal: outcomes.map((x) => x.meta.signal),
          timed_out: timeoutSeen,
          parallel: true,
        });
      };
      for (const psm of [6, 4]) {
        children.push(execFile('/usr/bin/tesseract', [imagePath, 'stdout', '-l', 'por+eng', '--psm', String(psm)], { timeout, maxBuffer: 3 * 1024 * 1024, env: TESSERACT_ENV_SEM_OVERSUBSCRIPTION }, (err, stdout) => onResult(psm, err, stdout)));
      }
    }
  });
}

// Interpreta categoria/aluno/competencia da legenda+OCR (LLM texto OAuth).
// Best-effort: falha -> null (cai no regex). NUNCA decide valor (isso e OCR).
function interpretarComprovante(texto, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 3) return resolve(null);
    const prompt = 'Recebimento de uma escola de musica. Do texto (legenda do WhatsApp + OCR do comprovante), '
      + 'responda SOMENTE um JSON valido, sem markdown: '
      + '{"categoria":"parcela|lojinha|passaporte|matricula|venda|seguranca|outro",'
      + '"aluno":"nome do ALUNO (nao o pagador do banco), ou null",'
      + '"competencia":"mes/parcela referida (ex: Agosto, 08/2026), ou null",'
      + '"forma":"pix|dinheiro|cartao|transferencia|cheque ou null",'
      // 🔴 quem enxerga "dois alunos" passa a ser o MODELO, nao o regex. A
      // legenda vem em prosa e muda de forma toda semana ("A e B", "A (R$x) e
      // B (R$y)", "aluno A - 4 cursos, aluna B"); regex nao acompanha isso.
      + '"pagamentos":[{"aluno":"nome completo","valor":numero ou null}]}. '
      + 'pagamentos: UMA entrada por PESSOA que o pagamento cobre. Se o texto cita '
      + 'dois ou mais alunos, liste todos, com o valor de cada um quando o texto disser. '
      + 'Se e um aluno so, devolva uma entrada so. Curso NAO e pessoa: "canto e harmonia" '
      + 'do mesmo aluno e UMA entrada. Nao invente nome que nao esteja no texto. '
      + 'categoria: parcela=mensalidade; lojinha=produto/loja; passaporte=passaporte; matricula=matricula; incerto=outro. '
      + 'So o JSON.\n\nTEXTO:\n' + t.slice(0, 1500);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        const validas = ['parcela', 'lojinha', 'passaporte', 'matricula', 'venda', 'seguranca', 'despesa', 'retirada', 'troco', 'outro'];
        let cat = String(o.categoria || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
        if (!validas.includes(cat)) cat = null;
        // ⚠️ o modelo as vezes repete o mesmo aluno; dedup por nome normalizado.
        //    E entrada sem nome nao vira item — item sem nome nao resolve fatura.
        const vistos = new Set();
        const pagamentos = (Array.isArray(o.pagamentos) ? o.pagamentos : [])
          .map((p) => ({
            aluno: (p && p.aluno && String(p.aluno).trim()) || null,
            valor: (p && p.valor != null && Number(p.valor) > 0) ? Number(p.valor) : null,
          }))
          .filter((p) => {
            if (!p.aluno) return false;
            const k = _normConf(p.aluno);
            if (!k || vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
        resolve({
          categoria: cat,
          aluno: (o.aluno && String(o.aluno).trim()) || null,
          competencia: (o.competencia && String(o.competencia).trim()) || null,
          forma: (o.forma ? String(o.forma).toLowerCase().trim() : null),
          pagamentos,
        });
      }
    );
  });
}

// GUARDA FINANCEIRA DA V4 (09/09/2026) — ver o patch versionado no repo.
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
const _PODE_EXPLICITO = /^[\s*_~]*(?:pode|podi)\b/i;
const _PODE_CURTO = /\bpode\s+(?:lan[cç]ar|dar\s+baixa|registrar|gravar)\b/i;

// Marca de EXTRATO colado. 🔴 O discriminador e QUANTOS PAGAMENTOS, nao quantas
// marcas: o replay mostrou que UMA linha de extrato ("*KIDS* 03/09 PIX RECEBIDO
// 07895543725 R$367,00= PIX Parcela 09/2026 de Carlos") e ditado LEGITIMO — a
// Rose cola a linha daquele pagamento para a Sol lancar. Contar marcas barrava
// esses casos, porque a mesma linha ja tem data + PIX RECEBIDO + "R$…=" = 3.
const _PAGAMENTO_NO_EXTRATO = /PIX\s+RECEBIDO\s+\d{6,}|R\$\s*[\d.,]+\s*=/gi;
// ⚠️ SO o cabecalho de relatorio. Tirei `*EMLA*` e `*KIDS*` daqui depois do
//    replay: eles sao ROTULO DE UNIDADE, nao marca de extrato, e apareciam em
//    ditado legitimo ("*KIDS* 03/09 PIX RECEBIDO … R$367,00= Parcela de Carlos"),
//    que e a Rose colando UM pagamento para lancar. Barrar por eles matava o
//    caso bom — que e como toda guarda boa vira guarda ruim.
const _CABECALHO_RELATORIO = /\*?\s*Recebimentos?\s+em\s+aberto/i;

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

// V4 FASE 1 — ROTEADOR EM SHADOW (31/08, go do Luciano): o mapa COMPLETO de
// intencoes do caixa, nao so correcoes. Roda em paralelo (fire-and-forget no
// bridge) para TODA mensagem de texto do grupo; a decisao vai para o log ao
// lado da acao do runtime legado. Nunca escreve, nunca responde — por ora, so
// observa. E' o cerebro da inversao: quando os logs provarem que ele decide
// melhor que a gramatica, ele assume a frente e os caminhos de hoje viram
// executores das intencoes dele.
// Chave e modelo do roteador. A chave mora FORA do repo, em arquivo 600 do
// usuario sol; o modelo troca por env sem redeploy (SOL_CAIXA_V4_MODELO).
const V4_ZEN_URL = 'https://opencode.ai/zen/v1/chat/completions';
const V4_ZEN_ENV = '/home/sol/.hermes/profiles/sol/caixa-ingestao/.secrets/zen.env';
let _v4Chave;
function _v4ChaveZen() {
  if (_v4Chave !== undefined) return _v4Chave;
  _v4Chave = process.env.OPENCODE_ZEN_API_KEY || null;
  if (!_v4Chave) {
    try {
      const m = fs.readFileSync(V4_ZEN_ENV, 'utf8').match(/OPENCODE_ZEN_API_KEY=(.+)/);
      _v4Chave = m ? m[1].trim() : null;
    } catch (e) { _v4Chave = null; }
  }
  return _v4Chave;
}
// Escolhido pela CAUDA (p90 4,2s, zero falhas em 25 casos), nao pela mediana:
// e' a unica cauda do conjunto compativel com um dia ficar na frente do usuario.
// Alternativa de maior acerto: deepseek-v4-pro (24/25, p90 7,7s).
function _v4Modelo() { return process.env.SOL_CAIXA_V4_MODELO || 'minimax-m3'; }

// Chamada HTTPS direta. Substitui o hermes_cli (10-13 s so de subir o
// processo). ⚠️ O User-Agent e' obrigatorio: sem ele o Cloudflare do
// opencode.ai devolve 403 "error code: 1010" antes de chegar ao modelo.
function _v4Http(prompt, timeout) {
  return new Promise((resolve) => {
    const chave = _v4ChaveZen();
    if (!chave) return resolve(null);
    const body = JSON.stringify({
      model: _v4Modelo(),
      // 🔴 2000, nao 300. Estes modelos emitem `reasoning_content` antes da resposta e
      // ele gasta o MESMO orcamento: com 300 o glm-5.3-flash, o deepseek-v4-pro e
      // o ling-3.0-flash terminavam com finish_reason=length e `content` VAZIO —
      // reprovados por um teto que era nosso, nao deles. O deepseek-v4-flash
      // sozinho gasta 1.800-2.100 tokens de raciocinio neste prompt.
      // ⚠️ 4000 desde 28/09: medido no minimax-m3, "venda capotraste … Venda
      //    Kailane" gastou os 2000 inteiros raciocinando (finish_reason=length,
      //    content vazio) em 1 de 3 chamadas; com 4000, 3 de 3 terminaram (1.063
      //    a 1.561 tokens). Caso comum não fica mais lento: o modelo para sozinho.
      max_tokens: 4000, temperature: 0,
      // ⚠️ `response_format: json_object` foi RETIRADO: nao acelera de forma
      // confiavel e, nos modelos que raciocinam, produz conteudo vazio. O prompt
      // ja pede "SOMENTE JSON" e o _parseVisionJson acha o ultimo bloco {...}
      // mesmo com prosa em volta.
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request(V4_ZEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + chave, 'Content-Type': 'application/json',
        'User-Agent': 'sol-caixa-roteador/1.0', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(d).choices[0].message.content || null); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => req.destroy(new Error('timeout roteador v4')));
    req.write(body); req.end();
  });
}

// ⚠️ 30s, nao 20s: medido em 05/09, a cauda do deepseek bate em 20s quando ha
// concorrencia. Em SOMBRA um null custa uma observacao perdida, entao esperar
// e' melhor que desistir. Quando o roteador for para a FRENTE isso se inverte:
// la o certo e' timeout curto com queda para o caminho deterministico.
// ── GUARDA DETERMINISTICA DE VALOR ──────────────────────────────────────────
// Ver o cabecalho do patch _patch-guarda-valor-v4-07set.cjs: 4,1% dos valores
// extraidos pelo roteador saiam errados, dois deles por fator de 10, e sem
// padrao que prompt resolva. Medida sobre 213 mensagens reais: pega 2 dos 3
// erros e faz ZERO falso bloqueio em 70 valores corretos.
function _numerosDoTexto(texto) {
  const t = String(texto || '');
  const achados = [];
  for (const m of t.matchAll(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi)) {
    // ⚠️ inteiro pequeno sem "R$" nao conta: "3x", "12/09" e numero de sala
    //    fariam qualquer valor "bater" e a guarda viraria enfeite.
    // "60 reais" e "Valor: 60" também são valor escrito (Barra, venda de corda
    // de 19/08: "Valor:60 reais" era recusado como "não confere").
    const _depois = t.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const _antes = t.slice(Math.max(0, m.index - 8), m.index);
    const _rotulado = /^\s*reais?\b/i.test(_depois) || /valor\s*:?\s*$/i.test(_antes);
    if (!/r\$/i.test(m[0]) && !/,\d{1,2}$/.test(m[1]) && !_rotulado) continue;
    const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) achados.push(n);
  }
  return achados;
}

function valorConfereComTexto(valor, ...textos) {
  if (valor == null) return { ok: true, motivo: 'sem_valor' };
  const alvo = Math.round(Number(valor) * 100);
  if (!Number.isFinite(alvo) || alvo <= 0) return { ok: false, motivo: 'valor_invalido' };
  for (const t of textos) {
    const ns = _numerosDoTexto(t);
    if (ns.some((n) => Math.round(n * 100) === alvo)) return { ok: true, motivo: 'exato' };
    // pagamento composto: "200 + 235,50" para um total de 435,50. Sem isto a
    // guarda reprovaria pagamento em partes, que e comum no caixa.
    if (ns.length >= 2) {
      const soma = ns.reduce((s, n) => s + n, 0);
      if (Math.round(soma * 100) === alvo) return { ok: true, motivo: 'soma' };
    }
  }
  return { ok: false, motivo: 'nao_esta_no_texto' };
}

// A DECISAO DO ROTEADOR VIRA ENVELOPE ESTRUTURADO — nunca frase.
//
// 🔴 O QUE ESTA FUNCAO EXISTE PARA IMPEDIR. A tentacao obvia era transformar a
//    decisao do LLM de volta numa frase canonica e re-passar pelo parser legado
//    (foi o que o fallback de dialogo de 31/08 faz). Isso recria exatamente o
//    defeito: quem monta a pergunta ao banco continua sendo a gramatica, e ela
//    entrega nome contaminado e primeiro valor. Aqui o payload vai DIRETO ao
//    Core, no formato que ele consome.
//
// ⚠️ NAO INVENTA NADA. Se o modelo nao deu identidade (nem aluno, nem pagador)
//    ou nao deu total, devolve recusa com motivo. Preencher por conta propria
//    seria o LLM decidindo dinheiro, que e o invariante que esta frente inteira
//    protege.
// ⚠️ `valor`/`valor_total` ja chegam aqui PENEIRADOS por valorConfereComTexto.
function montarEnvelopeV4(dec) {
  if (!dec || typeof dec !== 'object') return { ok: false, motivo: 'sem_decisao' };
  if (!['lancamento_por_texto', 'lancamento_multi_aluno'].includes(dec.intencao)) {
    return { ok: false, motivo: 'intencao_nao_lanca', intencao: dec.intencao };
  }
  // 🔴 TOTAL RECUSADO NAO CAI PARA O PARCIAL. Se `valorConfereComTexto` anulou
  //    o total, cair no `valor` reabre exatamente o defeito da Lis: numa frase
  //    com 357 + 300 e total 657, um total invalido ao lado de valor=357
  //    produziria de novo o card parcial de R$ 357. Prefiro nao responder.
  if (dec.valor_total_recusado) {
    return { ok: false, motivo: 'valor_total_recusado', recusado: dec.valor_total_recusado };
  }
  const total = (dec.valor_total != null) ? dec.valor_total : dec.valor;
  if (total == null || !(Number(total) > 0)) return { ok: false, motivo: 'sem_valor_total' };

  let itens = Array.isArray(dec.itens) ? dec.itens.filter((i) => i && i.aluno) : [];
  // singular -> plural: o contrato antigo continua valendo como entrada
  if (!itens.length && dec.aluno_nome) {
    itens = [{ aluno: dec.aluno_nome,
               categorias: dec.categoria ? [dec.categoria] : [],
               competencias: dec.competencia ? [dec.competencia] : [] }];
  }
  // pagador SOZINHO e legitimo: quem expande a familia e o Core, com as RPCs
  // de identidade. O que nao pode e' seguir sem identidade nenhuma.
  if (!itens.length && !dec.pagador) return { ok: false, motivo: 'sem_identidade' };

  return { ok: true, envelope: {
    pagador: dec.pagador || null,
    valor_total: Number(total),
    forma: dec.forma || null,
    itens: itens.map((i) => ({
      aluno: String(i.aluno).trim(),
      // ⚠️ `matricula` -> `passaporte`: o banco canoniza "Taxa de Matricula" e
      //    "Passaporte" no mesmo tipo. Sem esta normalizacao, um item que o
      //    modelo classifique como `matricula` filtraria para ZERO faturas e a
      //    Sol recusaria um pagamento que ela sabia resolver. Prompt e banco
      //    tem de falar a mesma lingua; onde nao falam, quem traduz e o codigo.
      categorias: (Array.isArray(i.categorias) ? i.categorias : [])
        .map((c) => (String(c).toLowerCase() === 'matricula' ? 'passaporte' : String(c).toLowerCase())),
      // 🔴 O Core compara competência como "MM/YYYY" (to_char(comp, 'MM/YYYY')).
      //    O agente mandou "Setembro" em 28/09 e a parcela paga não foi achada
      //    ("nenhuma_fatura_aberta"). Normaliza pela MESMA regra do legado; o que
      //    não for reconhecível segue como veio (o Core recusa, e a recusa volta
      //    ao agente — nunca vira outra competência por chute).
      competencias: (Array.isArray(i.competencias) ? i.competencias : [])
        .map(normalizarCompetenciaV4).filter(Boolean),
    })),
  } };
}

function normalizarCompetenciaV4(c) {
  const bruto = String(c == null ? '' : c).trim();
  if (!bruto) return null;
  const iso = bruto.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  return extrairCompetenciaTexto(bruto) || bruto;
}

// CORRECAO NO SEGUNDO TURNO — muda o ENVELOPE, nunca remonta a frase.
//
// 🔴 POR QUE NAO VIRA FRASE. O fallback de dialogo de 31/08 traduz a intencao do
//    LLM para uma frase canonica e re-passa pelo `handle()`. Ali fazia sentido,
//    porque o destino era a gramatica. Aqui seria o defeito de volta: quem
//    montaria a pergunta ao banco seria de novo o parser. A correcao incide
//    sobre o objeto estruturado, e o Core resolve outra vez.
//
// ⚠️ Correcao NAO inventa: campo que o modelo nao trouxe fica como estava.
//    E `corrigir_valor` so vale com valor que sobreviveu a guarda de texto.
function aplicarCorrecaoEnvelope(envelope, dec) {
  if (!envelope || !dec) return { ok: false, motivo: 'sem_base' };
  const e = JSON.parse(JSON.stringify(envelope));
  const itens = Array.isArray(e.itens) ? e.itens : [];
  switch (dec.intencao) {
    case 'corrigir_competencia': {
      const c = dec.competencia && String(dec.competencia).trim();
      if (!c) return { ok: false, motivo: 'correcao_sem_competencia' };
      // competencia declarada vale para TODOS os itens do envelope: o humano
      // esta corrigindo o comprovante, nao um aluno especifico.
      itens.forEach((it) => { it.competencias = [c]; });
      break;
    }
    case 'corrigir_valor': {
      if (dec.valor_recusado || dec.valor == null || !(Number(dec.valor) > 0)) {
        return { ok: false, motivo: 'correcao_sem_valor' };
      }
      e.valor_total = Number(dec.valor);
      break;
    }
    case 'corrigir_aluno': {
      const n = dec.aluno_nome && String(dec.aluno_nome).trim();
      if (!n) return { ok: false, motivo: 'correcao_sem_aluno' };
      // um item -> troca; varios -> nao adivinha QUAL, devolve para perguntar
      if (itens.length === 1) { itens[0].aluno = n; e.pagador = null; }
      else if (itens.length === 0) { e.itens = [{ aluno: n, categorias: [], competencias: [] }]; e.pagador = null; }
      else return { ok: false, motivo: 'correcao_aluno_ambigua' };
      break;
    }
    case 'corrigir_categoria': {
      const c = dec.categoria && String(dec.categoria).toLowerCase().trim();
      if (!c) return { ok: false, motivo: 'correcao_sem_categoria' };
      itens.forEach((it) => { it.categorias = [c]; });
      break;
    }
    case 'corrigir_forma': {
      const f = dec.forma && String(dec.forma).toLowerCase().trim();
      if (!f) return { ok: false, motivo: 'correcao_sem_forma' };
      e.forma = f;
      break;
    }
    default:
      return { ok: false, motivo: 'intencao_nao_corrige', intencao: dec.intencao };
  }
  e.itens = itens;
  return { ok: true, envelope: e };
}

// PORTAO DO CANARIO — desligado por padrao, e por LISTA, nunca global.
// `SOL_CAIXA_V4_CANARIO` recebe chatIds separados por virgula. Vazio = ninguem.
// ⚠️ Lista, e nao booleano: flip global em dinheiro nao e canario, e aposta.
function _v4CanarioLigado(chatId) {
  const lista = String(process.env.SOL_CAIXA_V4_CANARIO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return lista.length > 0 && lista.includes(String(chatId || ''));
}

function rotearMensagemV4(texto, contexto, { timeout = 30000, documento = null } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 1 || t.length > 1200) return resolve(null);
    const prompt = 'Voce e a Sol, agente do caixa de uma escola de musica, lendo UMA mensagem do grupo financeiro. '
      + 'Contexto atual (pendencias aguardando conferencia humana, pode ser vazio): '
      + JSON.stringify(contexto).slice(0, 1200)
      + '. Evidencia estruturada do documento (pode ser vazia): '
      + JSON.stringify(documento || {}).slice(0, 1600)
      + '. Classifique a INTENCAO da mensagem. Responda SOMENTE JSON valido, sem markdown: '
      + '{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|lancamento_multi_aluno|corrigir_lancamento_gravado|estornar_lancamento|reabrir_caixa|abrir_caixa|fechar_caixa|consulta_caixa|conversa|nada",'
      + '"aluno_nome":null,"valor":null,"forma":null,"cartao_modalidade":null,"cartao_parcelas":null,"categoria":null,"competencia":null,"entidade":null,'
      // 🔴 O CONTRATO PLURAL (10/09). O singular nao comportava familia nem
      //    varios meses: um `aluno_nome`, um `valor`, uma `competencia`.
      //    Mesmo invertendo o bridge, esses dois casos ficariam
      //    estruturalmente incompletos. Os campos antigos FICAM porque o
      //    placar do shadow os le — quebrar o log seria perder a serie.
      + '"pagador":null,"valor_total":null,'
      + '"itens":[{"aluno":null,"categorias":[],"competencias":[]}],"confianca":0.0}. '
      + 'CAMPOS PLURAIS: "pagador" e quem PAGOU quando a mensagem nomeia o responsavel em vez do aluno '
      + '("a mae da Lis mandou", "pagamento da Gisele"); deixe null se quem aparece e o proprio aluno. '
      + '"valor_total" e o total do comprovante — quando a mensagem traz parciais E um total, valor_total e o TOTAL. '
      + '"itens" tem UMA entrada por ALUNO citado (nao por fatura): itens[].categorias em '
      + '[parcela,passaporte,lojinha,venda,outro] e itens[].competencias em MM/AAAA, ambas listas, vazias quando a mensagem nao diz. '
      // ⚠️ NAO EXISTE categoria `matricula`. No banco, "Taxa de Matricula" e
      //    "Passaporte" compartilham `passaporte_taxa_matricula` — pedir ao
      //    modelo uma categoria que o filtro nao sustenta faria a Sol prometer
      //    um recorte que nao existe, e o item viria sem casar com fatura nenhuma.
      + 'TAXA DE MATRICULA e categoria "passaporte" — o sistema trata as duas juntas. '
      + 'A evidencia do documento serve para valor, forma, modalidade e parcelas. Nome lido no documento e pagador, nunca aluno confirmado. '
      + 'Se a mensagem humana declarar forma ou valor, ela vence a leitura do documento; conflito humano deve ficar nulo para pedir esclarecimento. '
      + 'Um aluno com dois cursos e UM item; dois irmaos sao DOIS itens. Varios meses do mesmo aluno vao em competencias[]. '
      // 28/09: "venda capotraste para o aluno Enzo R$40 pix Venda Kailane" virava
      // DOIS itens (Enzo e Kailane) sem total — a Kailane e a funcionaria que
      // vendeu. Medido: 3 de 4 chamadas liam assim.
      + 'VENDA DE PRODUTO (corda, palheta, baqueta, capotraste, caderno, livro, camiseta...) e categoria "lojinha". '
      + '"Venda Fulano", "Venda: Fulano", "vendido por Fulano" ou "vendedor Fulano" nomeia QUEM VENDEU (a equipe), NUNCA um aluno: nao vira item. '
      + 'Com um so valor na mensagem, esse valor e o valor_total. '
      + 'REGRAS: "conversa" = papo de equipe/elogio/despedida; "nada" = assunto alheio ao caixa. '
      + '"aprovar" quando autorizam lancar o que ja esta num card do contexto — inclusive so com "pode", "pode sim", "ok", "isso", "manda", respondendo a pergunta da Sol. Exige card no contexto: sem card, "pode" sozinho e "conversa". '
      + '"lancamento_por_texto" quando a mensagem DITA um pagamento novo, sem comprovante e sem card aberto: traz aluno e/ou valor e/ou competencia ("PG parcela 09/26 Aluno: Fulano LA CG - R$377,00"). Nao confundir com "aprovar" — aqui nao ha card para aprovar, ha um lancamento sendo criado. '
      + '"contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada SEM dizer qual e a certa ("essa parcela nao esta vencida", "ja foi corrigido no sistema"). '
      + 'Se a pessoa DIZ QUAL e a competencia certa ("e a parcela de 08/26 e 09/26 juntas", "e de setembro"), e "corrigir_competencia", nao contestacao — quem aponta o valor certo esta corrigindo, quem so aponta o erro esta contestando. '
      + '"saida_dinheiro" quando o dinheiro SAI do caixa — despesa, compra, retirada, sangria, vale, reembolso, troco, pagamento a fornecedor ou a prestador. '
      + 'Vale mesmo sem a palavra "saida" e mesmo sem forma de pagamento: "comprei agua 45", "paguei o motoboy 30", "retirei 200 pro cofre", "vale de R$ 100 pra Ana" sao todos saida_dinheiro. '
      + '"fechar_caixa" quando pedem para fechar OU pedem o relatorio/demonstrativo OFICIAL do caixa atual para revisar, aprovar ou fechar; isso cria apenas o preview e ainda exige "pode" humano depois. '
      + '"consulta_caixa" para perguntas de numeros/resumo e para relatorios historicos que nao iniciam fechamento. '
      + '"reabrir_caixa" quando pedem para abrir NOVAMENTE um caixa fechado ("pode abrir novamente", "reabre o caixa"). '
      + '"lancamento_multi_aluno" quando um pagamento cobre DOIS OU MAIS alunos (divisao por aluno). '
      + 'NUNCA invente nome ou valor que nao esteja na mensagem. confianca entre 0 e 1.\n\nMENSAGEM:\n' + t.slice(0, 900);
    // 🔴 A GUARDA DE VALOR VALE NO CAMINHO PRINCIPAL, NAO SO NO FALLBACK.
    //    Ate 10/09 `valorConfereComTexto` so era aplicada no ramo `execFile`,
    //    que hoje quase nunca roda — o caminho vivo e o HTTPS, e ele passava o
    //    numero do modelo direto. Foi assim que R$ 2.034,90 virou 20.349.
    //    Anula o VALOR, nunca a decisao: a intencao pode estar certa e o fluxo
    //    pergunta o numero, que e o caminho seguro.
    const _guardar = (v, ...ts) => {
      if (v == null) return { valor: null, recusado: null };
      const g = valorConfereComTexto(v, ...ts);
      return g.ok ? { valor: v, recusado: null } : { valor: null, recusado: { valor: v, motivo: g.motivo } };
    };
    const normaliza = (o) => {
      if (!o || typeof o !== 'object') return null;
      // Em mídia, o valor pode existir só no comprovante. A guarda continua
      // exata, mas passa a aceitar também o trecho de OCR já estruturado; sem
      // isso o modelo copiava R$ 400 do documento e a própria guarda anulava o
      // número por ele não aparecer na legenda humana.
      const textoDocumento = documento ? JSON.stringify(documento) : '';
      const _v  = valorDoModelo(o.valor);
      const _vt = valorDoModelo(o.valor_total);
      const gv  = _guardar(_v, texto, textoDocumento);
      const gvt = _guardar(_vt, texto, textoDocumento);
      // itens[]: uma entrada por ALUNO. Listas sempre listas — `null` aqui
      // obrigaria todo consumidor a repetir a mesma checagem.
      const itens = Array.isArray(o.itens) ? o.itens.map((it) => {
        if (!it || typeof it !== 'object') return null;
        const aluno = (it.aluno && String(it.aluno).trim()) || null;
        if (!aluno) return null;
        const lista = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x]))
          .map((y) => String(y || '').trim()).filter(Boolean);
        const gi = _guardar(valorDoModelo(it.valor),
          texto, textoDocumento);
        return {
          aluno,
          categorias: lista(it.categorias).map((c) => c.toLowerCase()),
          // competencia sai do modelo como "09/2026", "9/26", "setembro"…
          competencias: lista(it.competencias).map((c) => extrairCompetenciaTexto(c) || c).filter(Boolean),
          valor: gi.valor, valor_recusado: gi.recusado,
        };
      }).filter(Boolean) : [];
      const normalizada = {
        intencao: String(o.intencao || 'nada'),
        aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
        valor: gv.valor, valor_recusado: gv.recusado,
        forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
        cartao_modalidade: (o.cartao_modalidade && String(o.cartao_modalidade).toLowerCase().trim()) || null,
        cartao_parcelas: Number(o.cartao_parcelas) || null,
        categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
        competencia: (o.competencia && String(o.competencia).trim()) || null,
        entidade: (o.entidade && String(o.entidade).trim()) || null,
        pagador: (o.pagador && String(o.pagador).trim()) || null,
        valor_total: gvt.valor, valor_total_recusado: gvt.recusado,
        itens,
        confianca: Number(o.confianca) || null,
      };
      // Classificacao probabilistica nao pode transformar uma correcao de
      // campo em aprovacao. O caso real "a parcela e 09/2026" veio como
      // `aprovar` no roteador, embora nao tivesse o gesto financeiro "pode".
      // A evidencia explicita do texto vence o palpite do modelo.
      return normalizarCorrecaoCompetenciaRoteador(normalizada, texto, !!(contexto && contexto.length));
    };
    // Caminho normal: HTTPS direto.
    if (_v4ChaveZen()) {
      return _v4Http(prompt, timeout).then((txt) => resolve(normaliza(_parseVisionJson(txt || ''))));
    }
    // Fallback: o caminho antigo pelo hermes_cli (lento, mas melhor que mudo).
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout: 45000, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        const _v = valorDoModelo(o.valor);
        // 🔴 O valor so passa se estiver NO TEXTO. Ver a guarda acima: sem
        //    isto, 1 em cada 24 lancamentos sai com valor errado, dois por
        //    fator de 10. Anula o valor, NAO a decisao — a intencao pode estar
        //    certa e o fluxo pergunta o numero, que e o caminho seguro.
        const _g = valorConfereComTexto(_v, texto);
        resolve({
          intencao: String(o.intencao || 'nada'),
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          valor: _g.ok ? _v : null,
          valor_recusado: _g.ok ? null : { valor: _v, motivo: _g.motivo },
          forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
          categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
          competencia: (o.competencia && String(o.competencia).trim()) || null,
          entidade: (o.entidade && String(o.entidade).trim()) || null,
          confianca: Number(o.confianca) || null,
        });
      }
    );
  });
}

// Fallback de DIALOGO (31/08, OK do Luciano): mensagem com pendencia aberta
// que a gramatica nao entendeu vai a um classificador de saida RESTRITA. O LLM
// nunca escreve, nunca escolhe fatura e nunca aprova dinheiro — a intencao
// vira uma frase CANONICA da gramatica existente e re-passa pelo handle().
// ⚠️ timeout 35s, NAO 20s: medido em producao o classificador leva 11-22s
// (o caso "esquece esse ai" estourou 20s e virou null). Como o fallback so
// roda no caminho que HOJE responde "nao entendi", esperar e' melhor que
// desistir; e a falha continua caindo no "nao entendi" de sempre.
function classificarCorrecaoPendencia(texto, contexto, { timeout = 35000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 2 || t.length > 600) return resolve(null);
    const prompt = 'Grupo financeiro de escola de musica. Ha lancamento(s) aguardando conferencia humana: '
      + JSON.stringify(contexto).slice(0, 900)
      + '. A mensagem abaixo e de alguem da equipe e o parser nao entendeu. Classifique a INTENCAO dela sobre o lancamento. '
      + 'Responda SOMENTE JSON valido, sem markdown: '
      + '{"intencao":"corrigir_aluno|corrigir_categoria|corrigir_valor|corrigir_forma|corrigir_competencia|sem_aluno|descartar|aprovar|nada",'
      + '"aluno_nome":null,"categoria":null,"valor":null,"forma":null,"competencia":null,"entidade":null}. '
      + 'REGRAS: "nada" para conversa, pergunta ou assunto alheio. "aprovar" SO quando mandam lancar explicitamente. '
      + '"sem_aluno" quando dizem que nao e de aluno (banda/evento/empresa) — nome em entidade. '
      + 'categoria em [parcela,lojinha,passaporte,matricula,venda,despesa,outro]; forma em [pix,dinheiro,cartao,transferencia,cheque]. '
      + 'NUNCA invente nome ou valor que nao esteja na mensagem. '
      + 'Exemplos: "Sol, o valor foi R\$387,00" => corrigir_valor com valor 387.00; '
      + '"nao e esse aluno, e o Joao Silva" => corrigir_aluno; "isso e venda" => corrigir_categoria; '
      + '"foi no dinheiro" => corrigir_forma; '
      + '"a parcela e 09/2026" ou "essa e a de setembro" => corrigir_competencia com competencia "09/2026". '
      + 'competencia sempre no formato MM/AAAA.\n\nMENSAGEM:\n' + t.slice(0, 800);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        const intencoes = ['corrigir_aluno', 'corrigir_categoria', 'corrigir_valor', 'corrigir_forma', 'corrigir_competencia', 'sem_aluno', 'descartar', 'aprovar', 'nada'];
        const intencao = intencoes.includes(String(o.intencao || '')) ? String(o.intencao) : 'nada';
        resolve({
          intencao,
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
          valor: valorDoModelo(o.valor),
          forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
          // normaliza aqui: o modelo devolve "09/2026", "9/26", "setembro"...
          competencia: extrairCompetenciaTexto(String(o.competencia || '')) || null,
          entidade: (o.entidade && String(o.entidade).trim()) || null,
        });
      }
    );
  });
}

// O LLM interpreta texto livre, mas não pode escrever nem decidir a fatura.
// A saída passa por validarIntencaoMultiAluno + resolver canônico no banco.
function interpretarMultiAluno(texto, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 3) return resolve(null);
    const prompt = 'Recebimento de escola de música para MAIS DE UM aluno. Extraia somente o que está explícito. '
      + 'Responda SOMENTE JSON válido: '
      + '{"tipo_recebimento":"multi_aluno","valor_total":720,"forma":"pix|dinheiro|cartao|transferencia|cheque|null",'
      + '"categoria":"parcela|passaporte|matricula|lojinha|venda|outro|null","competencia":"08/2026|null",'
      + '"itens":[{"aluno_nome":"Nome", "valor":360|null, "competencia":"08/2026|null", "categoria":"passaporte|null"}]}. '
      + 'Nunca invente divisão: se houver dois alunos mas apenas total, devolva os nomes com valor null. '
      + 'Não autorize, não faça cálculos financeiros, não escolha fatura.\n\nTEXTO:\n' + t.slice(0, 2500);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        return resolve(o && typeof o === 'object' ? o : null);
      }
    );
  });
}

// tipo_fatura do contrato -> categoria do caixa
const _TIPO_CAT = { parcela: 'parcela', passaporte_taxa_matricula: 'passaporte',
  lojinha_produto: 'lojinha', venda_ingressos: 'venda', avulsa_outro: 'outro' };
function categoriaDaFatura(can) {
  const f = can && can.fatura;
  if (!f || !f.tipo_fatura) return null;
  return _TIPO_CAT[f.tipo_fatura] || null;
}
// descricao do lancamento a partir da fatura canonica
function descricaoDaFatura(can, aluno) {
  const f = can && can.fatura;
  if (!f) return null;
  let base;
  if (f.tipo_fatura === 'parcela') {
    const comp = f.competencia ? String(f.competencia).slice(0, 7).split('-').reverse().join('/') : null;
    base = (f.numero_parcela && f.total_parcelas_contrato)
      ? `Parcela ${f.numero_parcela}/${f.total_parcelas_contrato}` : 'Parcela';
    if (comp) base += ' ' + comp;
  } else {
    base = f.descricao || 'Recebimento';
  }
  return aluno ? `${base} - ${aluno}` : base;
}

// ---- quitacao: QUAIS meses (pedido da gerente da Barra) --------------------
const _MES_NOME = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const _mm = (m, a) => String(m).padStart(2, '0') + '/' + a;
function _somaMeses(mes, ano, n) {
  let t = (ano * 12) + (mes - 1) + n;
  return { mes: (t % 12) + 1, ano: Math.floor(t / 12) };
}
// A partir da parcela escolhida (ex.: 1/12 competencia 08/2026) e do numero de parcelas pagas,
// projeta o intervalo. E' PROPOSTA -- o humano confirma ou corrige.
function periodoQuitacao(canonica, nParcelas) {
  const f = canonica && canonica.fatura;
  if (!f || !f.competencia || !nParcelas || nParcelas < 2) return null;
  const comp = String(f.competencia).slice(0, 7).split('-');
  const ano = Number(comp[0]), mes = Number(comp[1]);
  if (!ano || !mes) return null;
  const fim = _somaMeses(mes, ano, nParcelas - 1);
  return { inicio: _mm(mes, ano), fim: _mm(fim.mes, fim.ano), n: nParcelas, proposto: true };
}
// ---- quitacao: QUAIS FATURAS (pagamento composto, 25/09/2026) -------------
// O card de quitacao ja dizia os MESES ("09/2026 a 08/2027"), mas o lancamento
// saia vinculado a UMA fatura so -- a canonica, a 1a do periodo. Caso real:
// Lucas Azevedo de Barros/CG pagou o contrato inteiro num cartao de R$ 4.752;
// o caixa guardaria 1 de 12 faturas e as outras 11 pareceriam em aberto.
// `sol_caixa_lancar_recebimento` aceita `fatura_ids` (migration 20260925000000)
// e grava UMA movimentacao com N filhas em `caixa_movimentacao_faturas`.
//
// REGRAS (todas medidas contra o pedido do Luciano, nao negociaveis):
//  - so fatura de MENSALIDADE ("Parcela MM/AAAA"): passaporte e ingresso tem
//    emusys_student_id mas nao sao parcela (ver CLAUDE.md, emusys_faturas);
//  - fatura com dono (outra movimentacao, via vw_caixa_movimentacao_fatura_links)
//    NUNCA e candidata;
//  - UMA matricula: `emusys_student_id` e pessoa, e quem faz 2 cursos tem 2
//    faturas por mes. Periodo coberto por 2 matriculas sem desempate = recusa;
//  - o periodo inteiro ou nada: faltar um mes vira "sem vinculo", nunca vinculo
//    parcial (vinculo mentiroso suja a carteira; ausencia so deixa de ajudar);
//  - a soma das faturas pode diferir do valor (juros, desconto): informa, nao trava.
function _competenciaIsoDoMM(mmYYYY) {
  const m = String(mmYYYY || '').match(/^(\d{2})\/(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : null;
}
function selecionarFaturasQuitacao(faturas, ocupadas, { inicio, fim, matriculaPreferida } = {}) {
  const ini = _competenciaIsoDoMM(inicio);
  const fi = _competenciaIsoDoMM(fim);
  if (!ini || !fi || ini > fi) return { ok: false, motivo: 'periodo_invalido' };
  const meses = [];
  let [a, m] = ini.split('-').map(Number);
  while (`${a}-${String(m).padStart(2, '0')}` <= fi && meses.length <= 25) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; a += 1; }
  }
  if (meses.length < 2 || meses.length > 24) return { ok: false, motivo: 'periodo_fora_da_faixa', meses: meses.length };
  const livres = new Set();
  const naFaixa = (Array.isArray(faturas) ? faturas : []).filter((f) => {
    const comp = String((f && f.competencia) || '').slice(0, 7);
    return f && f.id && meses.includes(comp)
      && /^\s*parcela\b/i.test(String(f.descricao || ''))
      && ['aberta', 'paga'].includes(String(f.status || ''));
  });
  const ocupadasNaFaixa = naFaixa.filter((f) => ocupadas && ocupadas.has(f.id)).length;
  naFaixa.filter((f) => !(ocupadas && ocupadas.has(f.id))).forEach((f) => livres.add(f));
  // Por matricula: quem cobre TODOS os meses, exatamente uma fatura por mes.
  const porMatricula = new Map();
  for (const f of livres) {
    const k = String(f.emusys_matricula_id == null ? '' : f.emusys_matricula_id);
    if (!porMatricula.has(k)) porMatricula.set(k, []);
    porMatricula.get(k).push(f);
  }
  const completas = [...porMatricula.entries()].filter(([k, fs]) => {
    if (!k) return false;
    const comps = fs.map((f) => String(f.competencia).slice(0, 7));
    return fs.length === meses.length && meses.every((mm) => comps.filter((c) => c === mm).length === 1);
  });
  let escolhida = null;
  if (matriculaPreferida != null) {
    escolhida = completas.find(([k]) => k === String(matriculaPreferida)) || null;
  }
  if (!escolhida && completas.length === 1) escolhida = completas[0];
  if (!escolhida) {
    return { ok: false, n: meses.length, inicio, fim,
      motivo: completas.length > 1 ? 'mais_de_uma_matricula'
        : (ocupadasNaFaixa ? 'faturas_ja_vinculadas' : 'periodo_incompleto'),
      ocupadas: ocupadasNaFaixa };
  }
  const fs = escolhida[1].slice().sort((x, y) => String(x.competencia).localeCompare(String(y.competencia)));
  const liquido = (f) => Number(f.valor_original || 0) - Number(f.desconto_fixo || 0) - Number(f.desconto_condicional || 0);
  const soma = Math.round(fs.reduce((t, f) => t + liquido(f), 0) * 100) / 100;
  return { ok: true, ids: fs.map((f) => f.id), n: fs.length, soma, inicio, fim,
    matricula: escolhida[0], curso: cursoDaFatura(fs[0]) };
}

function _restGetJson(pathQuery, { url, key } = carregarEnv()) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const u = new URL(`${url}/rest/v1/${pathQuery}`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 300) return reject(new Error(`GET ${u.pathname} ${res.statusCode}`));
        try { resolve(data ? JSON.parse(data) : []); } catch (e) { reject(new Error('resposta invalida')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout GET')));
    req.end();
  });
}

// Le as faturas da PESSOA daquela matricula na unidade e as que ja tem dono.
// A unidade sai da propria linha de `alunos`, nunca do chamador: fatura de outra
// unidade nao pode entrar nem por engano (a RPC revalida, mas manda certo).
async function resolverFaturasQuitacao(unidadeId, alunoId, quitacao, env = carregarEnv()) {
  const idNum = Number(alunoId);
  if (!unidadeId || !Number.isInteger(idNum) || idNum <= 0) return { ok: false, motivo: 'aluno_sem_vinculo' };
  const alu = await _restGetJson(`alunos?id=eq.${idNum}&select=id,unidade_id,emusys_student_id,emusys_matricula_id`, env);
  const a = Array.isArray(alu) ? alu[0] : null;
  if (!a || a.unidade_id !== unidadeId || !/^\d+$/.test(String(a.emusys_student_id || ''))) {
    return { ok: false, motivo: 'aluno_fora_da_unidade_ou_sem_emusys' };
  }
  const faturas = await _restGetJson('emusys_faturas?select=id,competencia,status,descricao,valor_original,'
    + 'desconto_fixo,desconto_condicional,emusys_matricula_id'
    + `&unidade_id=eq.${encodeURIComponent(unidadeId)}&emusys_student_id=eq.${a.emusys_student_id}&order=competencia`, env);
  const ids = (Array.isArray(faturas) ? faturas : []).map((f) => f.id).filter(Boolean);
  const ocupadas = new Set();
  for (let i = 0; i < ids.length; i += 60) {
    const lote = ids.slice(i, i + 60);
    const links = await _restGetJson(`vw_caixa_movimentacao_fatura_links?select=fatura_id&fatura_id=in.(${lote.join(',')})`, env);
    (Array.isArray(links) ? links : []).forEach((l) => l && l.fatura_id && ocupadas.add(l.fatura_id));
  }
  const r = selecionarFaturasQuitacao(faturas, ocupadas, {
    inicio: quitacao && quitacao.inicio, fim: quitacao && quitacao.fim,
    matriculaPreferida: a.emusys_matricula_id,
  });
  return { ...r, aluno_id: idNum };
}

// "de 09/2026 a 08/2027", "setembro a agosto", "ago/26 ate jul/27", "08/26-07/27"
function extrairPeriodoMeses(texto) {
  const t = _normConf(texto);
  if (!t) return null;
  const anoAtual = new Date().getFullYear();
  // 🔴 03/10/2026 (CG, Sabrina): sem fronteira de palavra, "sABRin(A) MARia" virou
  //    "abr a mar" = quitação 04/2026 a 03/2027 numa parcela única de 10/2026. Mês só
  //    conta como PALAVRA inteira e o conector "a/até" precisa estar solto.
  const num = /(\d{1,2})\s*[\/-]\s*(\d{2,4})\s*(?:\s(?:a|ate|até)\s|-|\u2192|=>)\s*(\d{1,2})\s*[\/-]\s*(\d{2,4})/;
  let m = t.match(num);
  if (m) {
    const a1 = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
    const a2 = Number(m[4]) < 100 ? 2000 + Number(m[4]) : Number(m[4]);
    return { inicio: _mm(Number(m[1]), a1), fim: _mm(Number(m[3]), a2) };
  }
  const nomes = Object.keys(_MES_NOME).join('|');
  const re = new RegExp('\\b(' + nomes + ')\\b\\s*(?:\\/|de\\s+)?(\\d{2,4})?\\s*(?:\\s(?:a|ate|até)\\s|-)\\s*\\b(' + nomes + ')\\b\\s*(?:\\/|de\\s+)?(\\d{2,4})?');
  m = t.match(re);
  if (m) {
    const m1 = _MES_NOME[m[1]], m2 = _MES_NOME[m[3]];
    let a1 = m[2] ? (Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2])) : anoAtual;
    let a2 = m[4] ? (Number(m[4]) < 100 ? 2000 + Number(m[4]) : Number(m[4])) : a1;
    if (!m[4] && m2 <= m1) a2 = a1 + 1;
    return { inicio: _mm(m1, a1), fim: _mm(m2, a2) };
  }
  return null;
}

function extrairCompetenciaTexto(texto) {
  const t = _normConf(texto);
  if (!t) return null;
  const anoAtual = new Date().getFullYear();
  let m = t.match(/\b(0?[1-9]|1[0-2])\s*[\/.-]\s*(20\d{2}|\d{2})\b/);
  if (m) {
    const mes = Number(m[1]);
    const ano = Number(m[2].length === 2 ? '20' + m[2] : m[2]);
    return _mm(mes, ano);
  }
  m = t.match(/\b(janeiro|fevereiro|marco|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b(?:\s*(?:de|\/|-)?\s*(20\d{2}|\d{2}))?/);
  if (m) {
    const mes = _MES_NOME[m[1].replace('ç', 'c')];
    const ano = m[2] ? Number(m[2].length === 2 ? '20' + m[2] : m[2]) : anoAtual;
    if (mes && ano) return _mm(mes, ano);
  }
  return null;
}

// Todas as competencias que o HUMANO escreveu, preservando ordem e removendo
// repeticoes. O extrator singular acima continua sendo o contrato legado; este
// e o contrato de lote para "08/2026 e 09/2026" do mesmo aluno.
function extrairCompetenciasTexto(texto) {
  const t = _normConf(texto);
  if (!t) return [];
  const achadas = [];
  const adicionar = (c) => { if (c && !achadas.includes(c)) achadas.push(c); };
  for (const m of t.matchAll(/\b(0?[1-9]|1[0-2])\s*[\/.-]\s*(20\d{2}|\d{2})\b/g)) {
    const ano = Number(m[2].length === 2 ? '20' + m[2] : m[2]);
    adicionar(_mm(Number(m[1]), ano));
  }
  return achadas;
}

// 🔴 ADIANTAMENTO DECLARADO (SOL-134, decisão do Alf em 29/09/2026). Recreio 29/09:
//    aluna com 2 cursos pagou R$ 1.650 = passaporte R$ 550 + parcelas 10/2026 de
//    Bateria e Piano (R$ 500 cada) + R$ 100, e a equipe escreveu "vai sobrar R$100
//    que será adiantamento para a parcela de novembro". O excedente vira o item
//    "adiantamento parcela <competência>", declarado pela equipe, SEM fatura.
// ⚠️ Só vale a declaração EXPLÍCITA: um trecho (linha ou frase) com a palavra
//    adiantamento/adiantar, UM valor em R$ e o mês. Sem isso, nada — o código nunca
//    deduz adiantamento de sobra (o comprovante maior que a fatura segue bloqueado).
//    Mês sem ano é o próximo mês com esse nome a partir de hoje; mês passado não é
//    adiantamento. Dois trechos declarando adiantamento = ambíguo = nada.
function extrairAdiantamentoDeclarado(texto, hoje = new Date()) {
  const bruto = String(texto || '');
  if (!/adiant/i.test(bruto)) return null;
  const trechos = bruto.split(/\n|;|\.(?=\s)|\s[·•]\s/).map((s) => s.trim()).filter(Boolean);
  const mesHoje = hoje.getFullYear() * 12 + hoje.getMonth() + 1;
  const achados = [];
  for (const trecho of trechos) {
    const tNorm = _normConf(trecho);
    const posAdiant = tNorm.search(/\badiant(?:amento|ar|ado|ada|ei|ou|a)?\b/);
    if (posAdiant < 0) continue;
    const valores = trecho.match(/r\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?|r\$\s*\d+(?:,\d{2})?/gi) || [];
    if (valores.length !== 1) { achados.push(null); continue; }
    const valor = parseBRMoney(valores[0]);
    // O mês do adiantamento é o que vem DEPOIS da palavra ("… adiantamento para a
    // parcela de novembro"); só sem nenhum depois vale o de antes. "parcelas de
    // outubro" no começo da frase é o que foi pago, não o adiantado.
    const t = _normConf(trecho.replace(valores[0], ' '));
    const pos = t.search(/\badiant/);
    const candidatos = [];
    for (const m of t.matchAll(/\b(0?[1-9]|1[0-2])\s*[\/.-]\s*(20\d{2}|\d{2})\b/g)) {
      candidatos.push({ i: m.index, mes: Number(m[1]), ano: Number(m[2].length === 2 ? '20' + m[2] : m[2]) });
    }
    for (const m of t.matchAll(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b(?:\s*(?:de|\/|-)?\s*(20\d{2}))?/g)) {
      const mes = _MES_NOME[m[1]];
      let ano = m[2] ? Number(m[2]) : null;
      if (!ano) {
        // Sem ano: o próximo mês com esse nome, e só se estiver perto (até 3 meses).
        ano = hoje.getFullYear();
        if (ano * 12 + mes < mesHoje) ano += 1;
        if (ano * 12 + mes - mesHoje > 3) ano = null;
      }
      if (ano) candidatos.push({ i: m.index, mes, ano });
    }
    const depois = candidatos.filter((c) => c.i > pos).sort((a, b) => a.i - b.i);
    const antes = candidatos.filter((c) => c.i < pos).sort((a, b) => b.i - a.i);
    const escolhido = depois[0] || (antes.length === 1 ? antes[0] : null);
    if (!(valor > 0) || !escolhido || escolhido.ano * 12 + escolhido.mes < mesHoje) { achados.push(null); continue; }
    achados.push({ valor, competencia: _mm(escolhido.mes, escolhido.ano), trecho });
  }
  if (achados.length !== 1 || !achados[0]) return null;
  return achados[0];
}

// Correcao de competencia e um comando de CAMPO, nao uma correcao de aluno.
// Exige linguagem corretiva; uma legenda nova como "PG parcela 09/2026" nao
// pode sequestrar um card aberto, e "pode" continua sendo o unico gesto de
// aprovacao financeira.
function extrairCorrecaoCompetencia(texto) {
  const competencia = extrairCompetenciaTexto(texto);
  if (!competencia) return null;
  const t = _normConf(texto);
  const explicita = /\b(?:parcela|mensalidade|competencia)\s*(?:correta?\s*)?(?:e|eh|foi|seria)\s*(?:a\s+)?(?:de\s+)?(?:0?[1-9]|1[0-2]|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(t);
  // A equipe tambem fala na ordem inversa: "e a parcela 09/2026". Sem essa
  // forma, a mensagem caia no corretor generico de categoria, que podia aceitar
  // outra competencia devolvida pelo casador e remontar exatamente o card que a
  // pessoa acabara de corrigir.
  const explicitaInvertida = /\b(?:e|eh|foi|seria)\s+(?:a\s+)?(?:parcela|mensalidade|competencia)\s*(?:correta?\s*)?(?:de\s+)?(?:0?[1-9]|1[0-2]|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(t);
  const imperativa = /\b(?:corrig|troca|muda|ajusta|altera)\w*\b[\s\S]{0,80}\b(?:parcela|mensalidade|competencia|0?[1-9]\s*[\/. -]\s*(?:20)?\d{2})\b/.test(t);
  const deMes = /\b(?:essa|esta|isso)\s+(?:e|eh)\s+(?:a\s+)?de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(t);
  return (explicita || explicitaInvertida || imperativa || deMes) ? competencia : null;
}

function normalizarCorrecaoCompetenciaRoteador(decisao, texto, temContexto) {
  if (!decisao || !temContexto) return decisao;
  const competencia = extrairCorrecaoCompetencia(texto);
  if (!competencia) return decisao;
  return { ...decisao, intencao: 'corrigir_competencia', competencia };
}

function competenciaIso(competencia) {
  const iso = String(competencia || '').match(/\b(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?\b/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const c = extrairCompetenciaTexto(competencia) || String(competencia || '');
  const m = c.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
  if (!m) return null;
  return `${m[2]}-${m[1]}-01`;
}

function valorFaturaCaixa(f) {
  const direto = f && (f.valor_pago !== null && f.valor_pago !== undefined) ? Number(f.valor_pago) : null;
  if (direto && direto > 0) return direto;
  const payload = f && f.payload && typeof f.payload === 'object' ? f.payload : {};
  const liquido = payload.valor_liquido_recebido !== null && payload.valor_liquido_recebido !== undefined ? Number(payload.valor_liquido_recebido) : null;
  if (liquido && liquido > 0) return liquido;
  const original = f && f.valor_original !== null && f.valor_original !== undefined ? Number(f.valor_original) : null;
  const desc = f && f.desconto_aplicado !== null && f.desconto_aplicado !== undefined ? Number(f.desconto_aplicado) : 0;
  if (original && original > 0) return Math.max(0, original - (desc || 0));
  return null;
}

function cursoDaFatura(f) {
  const tipo = String((f && f.tipo_fatura) || '');
  const d = String((f && f.descricao) || '');
  if (/passaporte|taxa.*matr/i.test(tipo) || /passaporte|taxa\s+de\s+matr[íi]cula/i.test(d)) return 'Passaporte';
  const m = d.match(/curso\s+(?:de\s+)?(.+?)\s*$/i);
  return (m && m[1] ? tituloNome(m[1].trim()) : (d || 'Parcela'));
}

function compostoDeFaturas(rows, valor, competencia, alunoNome) {
  const partes = (Array.isArray(rows) ? rows : [])
    .map((f) => ({ curso: cursoDaFatura(f), label: cursoDaFatura(f), valor: valorFaturaCaixa(f), descricao: f.descricao, status: f.status }))
    .filter((p) => p.valor && p.valor > 0);
  if (partes.length < 2) return null;
  const soma = partes.reduce((s, p) => s + Number(p.valor || 0), 0);
  if (valor && Math.abs(soma - Number(valor)) > 0.05) return null;
  return { ok: true, aluno_nome: alunoNome || null, competencia: extrairCompetenciaTexto(competencia), partes };
}

function descricaoDoComposto(composto, aluno) {
  if (!composto || !Array.isArray(composto.partes) || composto.partes.length < 2) return null;
  const cursos = composto.partes.map((p) => p.curso || p.label).filter(Boolean).join(' + ');
  const comp = composto.competencia ? ` ${composto.competencia}` : '';
  return `Parcelas${comp}${cursos ? ' ' + cursos : ''}${aluno ? ' - ' + aluno : ''}`;
}

async function buscarCompostoFaturasMes(unidadeId, aluno, competencia, valor, env = carregarEnv()) {
  const iso = competenciaIso(competencia);
  if (!unidadeId || !aluno || !iso) return null;
  const nome = String(aluno).replace(/\s+/g, ' ').trim();
  if (!nome) return null;
  const r = await resolverCompostoAlunoCaixaV1({
    unidade_id: unidadeId,
    aluno_nome: nome,
    competencia: iso,
    valor_total: valor,
  }, env);
  // CONTRATO: a RPC devolve itens[] (shape do multi-aluno, spec 2026-08-22), nunca
  // partes[]. O wrapper esperava partes[] e devolvia null em silencio desde o deploy de
  // 22/08 -> todo pagamento composto caia no casamento simples e o card dizia "difere do
  // valor da parcela" (caso Valentina/Recreio 24/08: Canto 418,91 + Teclado 395,90).
  // Aceita os dois nomes e traduz para o shape que o preview consome (curso/valor).
  const brutos = Array.isArray(r && r.itens) ? r.itens
    : (Array.isArray(r && r.partes) ? r.partes : null);
  if (!r || !r.ok || !brutos || brutos.length < 2) return null;
  const partes = brutos.map((it) => ({
    curso: it.curso || it.label || it.descricao || null,
    valor: Number(it.valor || 0),
    aluno_id: it.aluno_id != null ? it.aluno_id : null,
    canonical_fatura_id: it.canonical_fatura_id || null,
    categoria: it.categoria || 'parcela',
    competencia: it.competencia || null,
  }));
  return {
    ok: true,
    aluno_nome: r.aluno_nome || (brutos[0] && brutos[0].aluno_nome) || nome,
    competencia: r.competencia || (brutos[0] && brutos[0].competencia) || extrairCompetenciaTexto(competencia),
    responsavel_financeiro: (brutos[0] && brutos[0].responsavel_financeiro) || null,
    partes,
    itens: brutos,
  };
}

// Vinculo estruturado do lancamento: qual MATRICULA e qual FATURA este dinheiro quita.
//
// 🔴 REGRA: aluno_id vem da FATURA escolhida, NUNCA do match por nome. `alunos` e
// matricula, nao pessoa -- a Valentina (Recreio) tem 3 linhas: 697 Canto, 1099 Teclado,
// 1542 Power Kids. O `aluno_id` de topo que `sol_caixa_casar_parcela` devolve vinha do
// nome (limit 1 arbitrario entre as 3, todas com nome identico) e apontava Power Kids
// junto com uma fatura de Canto. O id que este helper le mora DENTRO do objeto da
// fatura/parcela e e resolvido no banco por emusys_matricula_id, que carrega o curso.
//
// Fica NULL sem constrangimento quando nao da para afirmar: e melhor movimento sem
// vinculo do que vinculo mentiroso -- ninguem reconcilia por cima de dado errado.
function derivarVinculo({ canonica, parcela, composto, alunoNovoId, multiplas, quitacao, faturaIdsCheque } = {}) {
  const num = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
  const uuid = (v) => (typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null;

  // 1) COMPOSTO: varias faturas num pagamento so, logo fatura_id nao existe (seriam N).
  //    aluno_id so sai quando TODAS as partes sao da mesma matricula. Na Valentina sao
  //    Canto + Teclado = matriculas diferentes, entao fica nulo -- resposta honesta.
  if (composto && Array.isArray(composto.partes) && composto.partes.length) {
    const ids = composto.partes.map((p) => num(p && p.aluno_id));
    const unico = (ids[0] !== null && ids.every((x) => x === ids[0])) ? ids[0] : null;
    return { aluno_id: unico, fatura_id: null,
      fonte: unico ? 'composto_mesma_matricula' : 'composto_multiplas_matriculas' };
  }
  // 1a) CHEQUE DE VÁRIAS PARCELAS (06/10/2026): um cheque de irmãos pagando N
  //     faturas = UMA movimentação ligada às N (`fatura_ids`). Os ids vêm do módulo
  //     de cheques, conferidos pela fatura real e pela soma no centavo.
  if (Array.isArray(faturaIdsCheque) && faturaIdsCheque.length >= 2) {
    const ids = faturaIdsCheque.map(uuid).filter(Boolean);
    if (ids.length === faturaIdsCheque.length) return { aluno_id: null, fatura_id: null, fatura_ids: ids, fonte: 'cheque_multi_fatura' };
  }
  // 1b) QUITACAO: varias competencias pagas de uma vez (25/09/2026). Com as N
  //     faturas do periodo resolvidas, vai `fatura_ids` (1 movimentacao, N filhas).
  //     Sem elas, NENHUMA fatura: a canonica e so a 1a do periodo, e vincular
  //     so ela diria que as outras seguem em aberto -- vinculo parcial e mentira.
  if (multiplas) {
    const q = quitacao && quitacao.faturas;
    const ids = (q && q.ok && Array.isArray(q.ids)) ? q.ids.map(uuid).filter(Boolean) : [];
    if (ids.length >= 2 && ids.length === q.ids.length) {
      return { aluno_id: num(q.aluno_id), fatura_id: null, fatura_ids: ids, fonte: 'quitacao_faturas' };
    }
    const a = (canonica && canonica.fatura && num(canonica.fatura.aluno_id))
      || (parcela && num(parcela.aluno_id)) || null;
    return { aluno_id: a, fatura_id: null, fonte: 'quitacao_sem_vinculo' };
  }
  // 2) FATURA CANONICA: a fonte mais forte do contrato v4.
  if (canonica && canonica.fatura) {
    const a = num(canonica.fatura.aluno_id);
    const f = uuid(canonica.fatura.canonical_fatura_id);
    if (a || f) return { aluno_id: a, fatura_id: f, fonte: 'canonica' };
  }
  // 3) CASAMENTO LEGADO: mesma regra, o aluno_id ja vem da fatura escolhida.
  if (parcela) {
    const a = num(parcela.aluno_id);
    const f = uuid(parcela.fatura_id);
    if (a || f) return { aluno_id: a, fatura_id: f, fonte: 'casamento' };
  }
  // 4) SEM FATURA (passaporte de quem esta entrando): so vincula se a RPC garantiu
  //    matricula unica -- ela devolve aluno_id null quando a pessoa tem 2+ cursos.
  const a = num(alunoNovoId);
  if (a) return { aluno_id: a, fatura_id: null, fonte: 'aluno_novo' };

  return { aluno_id: null, fatura_id: null, fonte: null };
}

function _descricaoLancamento(categoria, competencia, aluno, parcela) {
  if (parcela && parcela.descricao) {
    const descricao = descricaoParcelaCoerente(parcela, competencia);
    return aluno ? `${descricao} - ${aluno}` : descricao;
  }
  const cat = String(categoria || 'parcela');
  let s2 = cat.charAt(0).toUpperCase() + cat.slice(1);
  if (competencia) s2 += ' ' + competencia;
  if (aluno) s2 += ' - ' + aluno;
  return s2.length >= 3 ? s2 : 'Recebimento via Sol';
}

function _fonteCanonicaIndisponivel(c) {
  const motivo = String(c && (c.motivo || c.motivo_escolha || c.erro || '') || '').toLowerCase();
  // Ambiguidade de duas faturas pagas hoje nao e queda da fonte, mas precisa
  // seguir pela mesma barreira fail-closed: retry unico, zero fallback legado e
  // nenhum card aprovavel ate a fonte permitir uma escolha unica.
  return !c || motivo === 'fonte_indisponivel' || motivo === 'fatura_paga_hoje_ambigua'
    || /fonte.*indispon|timeout|temporar|indisponivel/.test(motivo);
}

// "fonte_competencia_futura_indisponivel" (regra de 17/09 na RPC canonica) diz
// que o mes SEGUINTE nao esta fresco -- e ele so sincroniza 1x por dia (~11h UTC)
// com validade de 30 min, ou seja, fica "velho" quase o dia todo. A RPC consulta
// esse mes para pegar baixa ANTECIPADA do mes que vem. Quando a equipe DECLAROU
// uma competencia anterior ao mes seguinte ("PG parcela 09/26" em setembro), a
// pergunta nao e sobre o mes seguinte: a RPC explicita por competencia responde
// com fonte fresca (o mes corrente sincroniza a cada 15 min). Sem isto, toda
// parcela ainda nao baixada no Emusys travava depois de ~08h47 BRT (caso Daniel
// Mynssem Mendes/CG, 26/09). Mes declarado = mes seguinte continua travado.
function _fonteFuturaLateralAoMesDeclarado(c, compEsperadaIso, agora = Date.now()) {
  if (!c || c.ok !== false || String(c.motivo || '') !== 'fonte_competencia_futura_indisponivel') return false;
  if (!compEsperadaIso || !/^\d{4}-\d{2}/.test(String(compEsperadaIso))) return false;
  const brt = new Date(agora - 3 * 3600 * 1000);
  let a = brt.getUTCFullYear(); let m = brt.getUTCMonth() + 2;
  if (m > 12) { m = 1; a += 1; }
  const proxima = `${a}-${String(m).padStart(2, '0')}`;
  return String(compEsperadaIso).slice(0, 7) < proxima;
}

function categoriaEhSaida(categoria) {
  return ['seguranca', 'despesa', 'retirada', 'troco'].includes(String(categoria || '').toLowerCase());
}

function criarHandlerFinanceiro({ grupos, sendFn, lancarFn = lancarRecebimento, lancarLoteFn = lancarRecebimentoLote, lancarSaidaFn = lancarSaidaCaixa, buscarCorrecaoFn = buscarLancamentoParaCorrecao, buscarMovimentosFn = buscarMovimentosCaixa, corrigirMovimentoFn = corrigirMovimentoCaixa, estornarMovimentoFn = estornarMovimentoCaixa, registrarPreviewV3Fn = registrarPreviewV3, registrarApprovalV3Fn = registrarApprovalV3, finalizarPreviewV3Fn = finalizarPreviewV3, visaoFn = extrairComprovanteVisao, ocrFn = ocrLocal, interpretarFn = interpretarComprovante, interpretarMultiFn = interpretarMultiAluno, resolverMultiFn = resolverPagamentoItensV1, sugerirAlunoFn = sugerirAlunoParecidoV1, equipeFn = listarEquipeAtiva, resolverEnvelopeFn = resolverEnvelopeCaixaV1, casarFn = casarParcela, responsavelFn = buscarResponsavel, pagadorFn = identificarPorPagador, identificarAlunoNovoFn = identificarAlunoNovo, canonicaFn = casarParcelaCanonica, faturasMesFn = buscarCompostoFaturasMes, faturasQuitacaoFn = resolverFaturasQuitacao, duplicataFn = jaLancadoHoje, identidadeFn = identificarPessoa, resumoFn = resumoDoDia, classificarCorrecaoFn = classificarCorrecaoPendencia, listarPreviewsAbertosFn = listarPreviewsAbertosV3, rotearV4Fn = rotearMensagemV4, chequesFn = undefined, ingressosConfigFn = undefined, abrirPreviewFn = undefined, log = () => {}, governanceFn = () => Promise.resolve({ ok: false, disabled: true }), janelaMs = 30 * 60 * 1000, dryRun = (process.env.SOL_CAIXA_DRYRUN === '1') }) {
  // Caixa fechado não é beco sem saída (CG 03/10): quem mandou o comprovante
  // recebe ali mesmo o card OFICIAL de abertura. Só cria preview; abrir continua
  // exigindo "pode" atual nesse card, e o comprovante guardado exige outro "pode".
  // Uma vez a cada 10 min por grupo, para não repostar a cada tentativa.
  const _aberturaOferecidaEm = new Map();
  async function oferecerAberturaCaixaFechado(event, chatId) {
    const grp = grupos[chatId];
    if (!grp || !grp.unidade_id) return 'sem_grupo';
    const ultima = _aberturaOferecidaEm.get(chatId) || 0;
    if (Date.now() - ultima < 10 * 60 * 1000) return 'recente';
    try {
      const postar = abrirPreviewFn || ((g, o) => require('./caixa-abertura-fechamento.cjs').postarAbertura(g, o));
      const r = await postar({ chat_id: chatId, unidade_id: grp.unidade_id, nome: grp.nome },
        { sendFn, event, governanceFn: governance });
      if (r && r.ok) { _aberturaOferecidaEm.set(chatId, Date.now()); log({ acao: 'abertura_oferecida_caixa_fechado', chatId }); return 'oferecida'; }
      log({ acao: 'abertura_nao_oferecida', chatId, motivo: r && r.skip });
      return (r && r.skip) || 'sem_dados';
    } catch (e) {
      log({ acao: 'abertura_oferta_erro', chatId, erro: String(e && e.message).slice(0, 200) });
      return 'erro';
    }
  }
  // SOL_CAIXA_V3_LEDGER_FAKE=1 (suite de testes): fiacao V3 ativa, banco intacto.
  // Sem isto, teste que nao mocka os registradores grava preview/approval REAL
  // no ledger de producao — 62% dos previews de 24-31/08 eram artefato de teste.
  // ⚠️ So substitui o DEFAULT (RPC real): mock explicito do teste — inclusive
  // mock que FALHA, como no gate-regressao caso 2 — continua valendo.
  if (process.env.SOL_CAIXA_V3_LEDGER_FAKE === '1') {
    let _fakeSeq = 0;
    if (registrarPreviewV3Fn === registrarPreviewV3) registrarPreviewV3Fn = async () => ({ ok: true, preview_id: 'fake-prev-' + (++_fakeSeq) });
    if (registrarApprovalV3Fn === registrarApprovalV3) registrarApprovalV3Fn = async () => ({ ok: true, approval_id: 'fake-appr-' + (++_fakeSeq) });
    if (finalizarPreviewV3Fn === finalizarPreviewV3) finalizarPreviewV3Fn = async () => ({ ok: true });
  }
  // grupos: { [chatId]: { unidade_id, nome } }
  const pendentes = new Map();   // chatId -> [ {previewId, unidade_id, nome, valor, forma, categoria, aluno, idemKey, origem, ts} ]
  // 🔴 29/09/2026 (CG, Mayra 12:27): "pode" citando um card que já tinha vencido caía em
  //    `pode_sem_pendencia` e a Sol ficava MUDA — a equipe achou que tinha lançado. Guardo,
  //    só em memória e por 3 h, os ids dos cards que venceram para responder "venceu".
  const vencidosRecentes = new Map(); // chatId -> [ { ids:Set, expiradoEm } ]
  const VENCIDO_GUARDA_MS = 3 * 60 * 60 * 1000;
  function _registrarVencido(chatId, p, agora) {
    const ids = new Set([p.previewId, p.origem, ...(Array.isArray(p.msgIds) ? p.msgIds : [])].filter(Boolean));
    const lista = (vencidosRecentes.get(chatId) || []).filter((v) => agora - v.expiradoEm < VENCIDO_GUARDA_MS);
    lista.push({ ids, expiradoEm: agora });
    vencidosRecentes.set(chatId, lista.slice(-20));
  }
  function _cardVencidoDoPode(chatId, quotedId, agora) {
    const lista = (vencidosRecentes.get(chatId) || []).filter((v) => agora - v.expiradoEm < VENCIDO_GUARDA_MS);
    vencidosRecentes.set(chatId, lista);
    if (quotedId) return lista.find((v) => v.ids.has(quotedId)) || null;
    // Sem citação: só responde se um card venceu há pouco (2 h) neste grupo.
    return lista.filter((v) => agora - v.expiradoEm < 2 * 60 * 60 * 1000).pop() || null;
  }
  const lancadosRecentes = new Map(); // chatId -> [ {confirmMessageId, movimentacao_id, unidade_id, nome, valor, forma, ts} ]
  const vistos = new Set();      // idemKeys ja processados (anti-redelivery)
  const textosRecentes = new Map(); // chatId+senderId -> {texto, ts}: legenda/nome que veio em bolha IRMA (comprovante + nome em mensagens separadas)
  const lotesMidia = new Map();  // chatId+senderId -> lote curto: 2 PDFs + texto humano viram UM preview
  const textoIrmaoKey = (event) => `${event.chatId}::${event.senderId || event.senderPhone || 'sem_sender'}`;
  // Pareamento MÍDIA SEM LEGENDA + TEXTO DO MESMO AUTOR chegando juntos, em qualquer ordem
  // (ver o bloco no topo de handle()).
  const legendasEsperando = new Map(); // key -> { texto, ts, reclamada }
  const midiasEmVoo = new Map();       // key -> { ts }
  const midiaRecente = new Map();      // key -> ts da última mídia do autor (com ou sem legenda)
  // 🔴 LEGENDA TARDIA (29/09/2026, CG 14:36). A foto chegou SEM legenda e, 12 s depois,
  //    o MESMO autor mandou "PG parcela 09/26 Aluno: … LA CG R$457,95" como mensagem
  //    separada — enquanto a foto ainda era interpretada (~34 s). O lote só costura
  //    texto dos primeiros ~0,9 s e a bolha irmã só é lida antes da interpretação;
  //    o card saiu sem a legenda ("não achei pelo pagador") e o texto foi tratado
  //    sozinho. Aqui cada mídia sem legenda guarda, por autor e por 60 s, um registro:
  //    texto com cara de legenda do mesmo autor nesse intervalo vira a legenda DELA
  //    (em voo: entra antes da interpretação ou a mídia é reavaliada no fim; depois
  //    do card: o card incompleto é substituído; recusada: é reavaliada). Um card só.
  const LEGENDA_TARDIA_MS = 60000;
  const midiasSemLegenda = new Map();  // key -> { ts, evento, emVoo, legenda, consumida, evidencia, resultado }
  // VENDA DE INGRESSO (02/10/2026). Config relida do disco a cada mudança (sem deploy
  // para trocar evento/lote); a pergunta "ingresso ou lojinha?" guarda o caso original
  // por 15 min para a resposta continuar dele, sem reenviar comprovante.
  const configIngressos = typeof ingressosConfigFn === 'function' ? ingressosConfigFn
    : () => (_ingressosLib ? _ingressosLib.carregarConfigIngressos({ log }) : { ok: false, eventos: [] });
  const perguntasNatureza = new Map(); // chatId -> { evento, autor, msgId, ts, motivo }
  const PERGUNTA_NATUREZA_MS = 15 * 60 * 1000;
  const loteJanelaMs = Math.max(0, Number(process.env.SOL_CAIXA_LOTE_MS || 900));
  const v3LedgerMode = String(process.env.SOL_CAIXA_V3_LEDGER_MODE || '').toLowerCase();
  const cheques = chequesFn !== undefined ? chequesFn
    : (_chequesLib ? _chequesLib.criarCheques({ carregarEnv, sendFn, log }) : null);
  // Cheques (29/09): o módulo pergunta ao caixa se o card de um lote ainda aceita
  // "pode", e usa o MESMO OCR local para reconhecer foto de cheque sem legenda.
  if (cheques && typeof cheques.ligarCaixa === 'function') {
    cheques.ligarCaixa({ ocr: ocrFn, cardAberto: (chatId, id) => (pendentes.get(chatId) || []).some((p) =>
      (p.previewId === id || (Array.isArray(p.msgIds) && p.msgIds.includes(id))) && Date.now() - p.ts < janelaMs) });
  }
  const v3LedgerAtivo = ['production', 'prod', 'on', '1'].includes(v3LedgerMode);
  const v3LedgerStrict = process.env.SOL_CAIXA_V3_LEDGER_STRICT === '1';
  function governance(event, eventType, details) {
    try { return Promise.resolve(governanceFn(event, eventType, details || {})).catch(() => ({ ok: false })); }
    catch (_) { return Promise.resolve({ ok: false }); }
  }

  function readbackMovimento(event, grupo, movimentoId, valor, forma, categoria) {
    if (!event || !event.caixaGovernancaEpisode || !movimentoId || !grupo) return;
    Promise.resolve().then(async () => {
      let resposta;
      try {
        resposta = await buscarMovimentosFn({
          unidade_id: grupo.unidade_id, valor: Number(valor), forma: forma || null,
          categoria: categoria || null, data_inicio: new Date().toISOString().slice(0, 10),
          data_fim: new Date().toISOString().slice(0, 10), chat_id: event.chatId,
          grupo_jid: event.chatId, ator_numero: event.senderPhone || '', ator_papel: 'grupo',
        });
      } catch (_) {
        await governance(event, 'readback_failed', { movement_ref: movimentoId, readback_status: 'query_error', outcome: 'inconclusive' });
        return;
      }
      const itens = resposta && Array.isArray(resposta.items) ? resposta.items : [];
      const confirmou = itens.some((item) => String(item.movimentacao_id || '') === String(movimentoId));
      await governance(event, confirmou ? 'readback_confirmed' : 'readback_failed', {
        movement_ref: movimentoId, readback_status: confirmou ? 'confirmed' : 'movement_not_found',
        outcome: confirmou ? 'ok' : 'inconclusive',
      });
    });
  }

  async function registrarPreviewPublicoV3({ event, grupo, previewId, texto, pendencia, result,
    previewStatus = 'public_preview_sent', previewHashFixo = null,
    publicPreviewSent = true, eventStatus = 'public_preview_sent', mode = 'v3_production_public_preview' }) {
    if (!v3LedgerAtivo) return null;
    const previewJson = {
      public_preview_sent: !!publicPreviewSent,
      preview_message_id: previewId || null,
      text: String(texto || '').slice(0, 5000),
      pending: pendencia,
      handler_result: result || null,
    };
    // O hash pode ser fixado antes da publicacao. Assim o ledger ganha uma
    // linha inaprovavel (`prepared_private`) ANTES de o WhatsApp exibir o card;
    // depois a mesma linha e promovida, via upsert, com o message id real.
    const previewHash = previewHashFixo || sha256(JSON.stringify(previewJson));
    const payload = {
      event_id_hash: sha256(event.messageId),
      chat_id_hash: md5(event.chatId),
      sender_id_hash: sha256(event.senderId || event.senderPhone || ''),
      unidade_id: grupo.unidade_id,
      observed_at: event.ts || new Date(Number(event.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      source: 'sol_caixa_whatsapp_production',
      mode,
      // O evento foi observado/publicado; quem controla se o card pode ser
      // aprovado e o preview_status abaixo. Na correcao, o card novo nasce
      // awaiting_supersede ate o banco trocar os dois estados atomicamente.
      status: eventStatus,
      raw_ref: {
        message_id_sha256: sha256(event.messageId),
        body_sha256: sha256(event.body || ''),
        has_media: !!event.hasMedia,
        media_type: event.mediaType || null,
        preview_message_id: previewId,
      },
      resolver_json: {
        resolver: 'caixa-financeiro.cjs production',
        handler_result: result || null,
      },
      warnings: [],
      blocks: [],
      preview_hash: previewHash,
      operacao: pendencia.v3Operacao || (categoriaEhSaida(pendencia.categoria) ? 'saida' : 'entrada'),
      categoria: pendencia.categoria || 'unknown',
      valor_centavos: pendencia.valor != null ? String(Math.round(Number(pendencia.valor) * 100)) : '',
      forma: pendencia.forma || 'unknown',
      preview_status: previewStatus,
      preview_json: previewJson,
    };
    try {
      const registered = await registrarPreviewV3Fn(payload);
      await governance(event, publicPreviewSent ? 'preview_sent' : 'preview_prepared', {
        preview_ref: (registered && registered.preview_id) || previewId || previewHash,
        action: result && result.acao || 'preview', outcome: registered && registered.ok ? 'ok' : 'inconclusive',
      });
      log({ acao: 'v3_preview_ledger_registrado', chatId: event.chatId,
            ok: !!(registered && registered.ok), preview_ledger_id: registered && registered.preview_id });
      return { ...(registered || {}), preview_hash: previewHash };
    } catch (e) {
      log({ acao: 'v3_preview_ledger_erro', chatId: event.chatId, erro: String(e && e.message) });
      if (v3LedgerStrict) throw e;
      return null;
    }
  }

  // Toda remontagem precisa produzir o par visual + preview V3. Sem isso o
  // WhatsApp mostrava "Posso lançar?" mas o guard financeiro recusava o Pode.
  async function vincularPreviewRemontadoV3({ event, grupo, pendencia, previewId, texto, result }) {
    let v3 = null;
    try {
      v3 = await registrarPreviewPublicoV3({ event, grupo, previewId, texto, pendencia, result });
    } catch (e) {
      log({ acao: 'v3_preview_remontado_erro', chatId: event.chatId, erro: String(e && e.message) });
    }
    if (v3 && v3.preview_id) {
      pendencia.v3PreviewId = v3.preview_id;
      pendencia.v3PreviewHash = v3.preview_hash || null;
      return true;
    }
    if (!v3LedgerAtivo) return true;
    const atuais = limparVelhos(event.chatId, Date.now());
    pendentes.set(event.chatId, atuais.filter((p) => p !== pendencia));
    await sendFn(event.chatId, '⚠️ Atualizei os dados, mas ainda não consegui preparar o preview seguro para lançamento. Não responda *pode* neste preview; tenta de novo em instantes.');
    log({ acao: 'v3_preview_remontado_bloqueado', chatId: event.chatId, motivo: 'preview_v3_nao_persistido' });
    return false;
  }

  async function registrarApprovalPublicoV3({ event, alvo, decision = 'approved' }) {
    if (!v3LedgerAtivo || !alvo || !alvo.v3PreviewId) return null;
    await governance(event, 'approval_observed', { preview_ref: alvo.v3PreviewId, action: decision, outcome: 'pending' });
    const approvalEventHash = sha256(event.messageId);
    const actorIdHash = sha256(event.senderId || event.senderPhone || '');
    const payload = {
      preview_id: alvo.v3PreviewId,
      approval_event_hash: approvalEventHash,
      actor_id_hash: actorIdHash,
      decision,
      decision_json: {
        source: 'sol_caixa_whatsapp_production',
        message_id_sha256: sha256(event.messageId),
        chat_id_hash: md5(event.chatId),
        preview_message_id: alvo.previewId || null,
        quoted_message_id: event.quotedMessageId || null,
        text_sha256: sha256(event.body || ''),
      },
    };
    try {
      const registered = await registrarApprovalV3Fn(payload);
      await governance(event, 'approval_observed', {
        preview_ref: alvo.v3PreviewId, approval_ref: registered && registered.approval_id,
        action: 'registered', outcome: registered && registered.ok ? 'ok' : 'inconclusive',
      });
      log({ acao: 'v3_approval_ledger_registrado', chatId: event.chatId,
            ok: !!(registered && registered.ok), approval_id: registered && registered.approval_id });
      return { ...(registered || {}), approval_event_hash: approvalEventHash, actor_id_hash: actorIdHash };
    } catch (e) {
      log({ acao: 'v3_approval_ledger_erro', chatId: event.chatId, erro: String(e && e.message) });
      if (v3LedgerStrict) throw e;
      return null;
    }
  }

  async function finalizarPreviewSeguroV3({ alvo, status, substituto = null, motivo = null }) {
    if (!v3LedgerAtivo || !alvo || !alvo.v3PreviewId) return { ok: true, sem_ledger: true };
    const payload = {
      preview_id: alvo.v3PreviewId,
      preview_hash: alvo.v3PreviewHash || null,
      status,
      motivo: motivo || status,
      replacement_preview_id: substituto && substituto.v3PreviewId || null,
      replacement_preview_hash: substituto && substituto.v3PreviewHash || null,
    };
    try {
      const r = await finalizarPreviewV3Fn(payload);
      const ok = !!(r && r.ok);
      log({ acao: 'v3_preview_finalizado', ok, status, preview_ledger_id: alvo.v3PreviewId,
            substituto_ledger_id: substituto && substituto.v3PreviewId || null,
            motivo: ok ? null : (r && r.motivo) || 'resposta_invalida' });
      return r || { ok: false, motivo: 'resposta_invalida' };
    } catch (e) {
      log({ acao: 'v3_preview_finalizacao_erro', status, preview_ledger_id: alvo.v3PreviewId,
            erro: String(e && e.message) });
      if (v3LedgerStrict) throw e;
      return { ok: false, motivo: 'erro_rpc_finalizacao' };
    }
  }

  // ── CAMINHO AGENT-FIRST ────────────────────────────────────────────────────
  //
  // 🔴 A INVERSAO MORA AQUI, NO ARTEFATO VERSIONADO — nao no bridge. O bridge
  //    nao esta sob hash no RUNTIME_BASELINE: trocar a ordem la seria uma
  //    mudanca de comportamento de dinheiro sem teste, sem paridade e sem
  //    rollback por hash. Aqui ela tem as tres coisas.
  //
  // 🔴 O QUE ELE FAZ DE DIFERENTE. O legado le a frase com gramatica e entrega
  //    ao banco `nome = "PG parcelas aluna Lis Dal Mora Mello curso canto e
  //    curso de violao Kids CG"` e `valor = 357` (medido, 10/09). Aqui o LLM
  //    entende, vira ENVELOPE ESTRUTURADO e o Core resolve. A frase nunca e
  //    remontada para o parser antigo — fazer isso recriaria o defeito.
  //
  // ⚠️ FAIL-SAFE, SEMPRE PARA O LADO DE NAO RESPONDER. Sem decisao, sem
  //    envelope, sem combinacao ou com erro: devolve null e o caminho de hoje
  //    assume. O agent-first pode nao responder; nao pode responder errado.
  // ⚠️ TIMEOUT CURTO (12s, nao 30s). Em SOMBRA esperar era melhor que desistir,
  //    porque um null custava uma observacao. Na FRENTE o custo se inverte: a
  //    consultora esta olhando a tela.
  // ⚠️ NAO APROVA NADA. Termina em preview + pendencia; o "pode" segue humano e
  //    passando pelo cofre V3, e a escrita segue no lote atomico.
  // Envelope vivo por chat: e o que permite corrigir no SEGUNDO TURNO sem
  // remontar frase. Guardado ao lado da pendencia, com o mesmo tempo de vida.
  const envelopesV4 = new Map();
  // Rascunho incompleto NAO e pendencia aprovavel. Ele vive separado para que
  // um "pode" jamais seja aproximado a um estado que ainda nao tem forma,
  // categoria ou vinculo seguro. Tambem e persistido no ledger para sobreviver
  // a restart sem depender da memoria do processo.
  const rascunhosV4 = new Map();
  // 🔴 ESTORNO/CORREÇÃO AMBÍGUO (§8.2, 28/09/2026): com mais de um lançamento
  //    igual a Sol NUNCA escolhe. Lista os candidatos (hora, quem lançou, id
  //    curto) e guarda a lista; só quem pediu — ou quem citar a lista — escolhe,
  //    pelo NÚMERO ou pelo ID. A escolha só define o alvo: o card de
  //    estorno/correção e o "pode" continuam obrigatórios.
  const escolhasMovimento = new Map();

  function horaBRT(iso) {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  }

  // 🔴 29/09/2026 (revisão do PR #528): `criado_por` de lançamento feito pela Sol é
  //    "sol-agente:grupo:<telefone>" (conferido em caixa_movimentacoes) — o PR o
  //    mostraria no grupo, com o número da pessoa. Quem lançou vem de `responsavel`
  //    ("Mayra · via Sol", "Mayra (aut.) · … (env.) · via Sol"); `criado_por` só
  //    quando é nome de gente (lançamento manual no sistema). Nunca telefone.
  function quemLancouMovimento(x) {
    const limpar = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s*·\s*via Sol\s*$/i, '').trim();
    const ehTecnico = (s) => /sol-agente|backfill|:\S*\d{6,}|\d{8,}/i.test(String(s || ''));
    const resp = limpar(x && x.responsavel);
    if (resp && !ehTecnico(resp)) return resp.slice(0, 50);
    const criado = limpar(x && x.criado_por);
    if (criado && !ehTecnico(criado)) return criado.slice(0, 50);
    return /sol-agente/i.test(String(x && x.criado_por || '')) ? 'Sol' : 'sem registro de quem lançou';
  }

  function horaMovimento(x) {
    return x && x.created_at ? horaBRT(x.created_at) : (x && /^\d{1,2}:\d{2}$/.test(String(x.hora || '')) ? String(x.hora) : '--:--');
  }

  function linhaCandidatoMovimento(x, i) {
    const id = String(x.movimentacao_id || '').slice(0, 8);
    const oque = String(x.descricao || '').replace(/\s+/g, ' ').slice(0, 60);
    return `*${i + 1}.* ${fmtBRL(x.valor)} · ${x.categoria || 'sem categoria'} · ${x.forma_pagamento || 'sem forma'} · ${horaMovimento(x)}\n`
      + `    lançado por ${quemLancouMovimento(x)} · id \`${id}\`${oque ? '\n    ' + oque : ''}`;
  }

  async function pedirEscolhaMovimento({ event, chatId, cmdMov, items, agora }) {
    const lista = items.slice(0, 5);
    const verbo = cmdMov.tipo === 'estornar' ? 'estornar' : 'corrigir';
    const texto = `Achei *${items.length}* lançamentos que batem com o pedido. Não vou escolher sozinha qual ${verbo}.\n\n`
      + lista.map(linhaCandidatoMovimento).join('\n\n')
      + (items.length > lista.length ? `\n\n_(mostrando os ${lista.length} mais recentes)_` : '')
      + '\n\n👉 Responde com o *número* (ex.: *2*) ou o *id* do lançamento certo.';
    const msgId = await sendFn(chatId, texto);
    escolhasMovimento.set(chatId, { cmdMov, items: lista, ts: agora, msgIds: [msgId].filter(Boolean),
      autor: String(event.senderPhone || event.senderId || '') });
    log({ acao: 'movimento_alvo_ambiguo', chatId, count: items.length, listados: lista.length });
    return { acao: 'movimento_alvo_ambiguo', previewId: msgId };
  }

  // A resposta à lista: número 1..N sozinho (com "o"/"número"/"nº" opcional) ou
  // o id curto de um dos candidatos. Protocolo que a própria Sol ensinou.
  function escolhaDaResposta(event, agora) {
    const esc = escolhasMovimento.get(event && event.chatId);
    if (!esc || event.hasMedia) return null;
    if (agora - esc.ts >= janelaMs) { escolhasMovimento.delete(event.chatId); return null; }
    const autor = String(event.senderPhone || event.senderId || '');
    const citou = event.quotedMessageId && esc.msgIds.includes(String(event.quotedMessageId));
    if (!citou && (!autor || autor !== esc.autor)) return null;
    const t = bodyLimpo(event.body).toLowerCase().replace(/^sol\b\s*[,;:-]?\s*/, '').trim();
    const mNum = t.match(/^(?:o|a|n[uú]mero|n[ºo°]\.?)?\s*(\d{1,2})\s*[.!]?$/);
    if (mNum) {
      const i = Number(mNum[1]) - 1;
      return { esc, item: esc.items[i] || null, foraDaLista: !esc.items[i] };
    }
    const porId = esc.items.filter((x) => {
      const id = String(x.movimentacao_id || '').toLowerCase();
      return id && t.split(/[^0-9a-f-]+/).some((tok) => tok.length >= 6 && id.startsWith(tok));
    });
    if (porId.length === 1) return { esc, item: porId[0], foraDaLista: false };
    return null;
  }

  function identidadeRascunhoV4(event) {
    const bruto = String((event && (event.senderPhone || event.senderId)) || '')
      .replace(/@.*/, '').replace(/\D/g, '');
    return bruto ? sha256(bruto) : null;
  }

  function referenciasRascunhoV4(draft) {
    return [draft && draft.origem]
      .concat((draft && Array.isArray(draft.msgIds)) ? draft.msgIds : [])
      .filter(Boolean).map(String);
  }

  function eventoPodeCompletarRascunhoV4(event, draft) {
    if (!event || !draft) return false;
    const autor = identidadeRascunhoV4(event);
    if (autor && draft.autorHash && autor === draft.autorHash) return true;
    const citado = event.quotedMessageId && String(event.quotedMessageId);
    return !!(citado && referenciasRascunhoV4(draft).includes(citado));
  }

  async function coletarEvidenciaMidiaV4(event) {
    if (!event || !event.hasMedia) return null;
    if (event.caixaMediaEvidence) return event.caixaMediaEvidence;
    const media = (event.mediaUrls || [])[0];
    if (!media) return null;

    let ocrText = '';
    let ocrMeta = { status: 'nao_executado', duration_ms: 0, file_bytes: null };
    try {
      log({ acao: 'ocr_attempt', chatId: event.chatId, trilho: 'agent_first_preflight' });
      const rawOcr = await ocrFn(media, { detailed: true });
      const textoPrimario = String((rawOcr && rawOcr.text) || rawOcr || '');
      if (textoPrimario.trim()) {
        ocrText = textoPrimario;
        ocrMeta = rawOcr && typeof rawOcr === 'object'
          ? { ...ocrMeta, ...rawOcr }
          : { ...ocrMeta, status: 'ok' };
      } else {
        const alt = ocrSegundaChance(media);
        if (alt && String(alt.text || '').trim()) {
          ocrText = String(alt.text);
          ocrMeta = {
            ...ocrMeta, status: 'ok_segunda_chance',
            ocr_confidence: alt.ocr_confidence,
            needs_human_confirmation: alt.needs_human_confirmation,
            qr: alt.qr || [], pix_payloads: alt.pix_payloads || [],
          };
        } else {
          ocrMeta = rawOcr && typeof rawOcr === 'object'
            ? { ...ocrMeta, ...rawOcr }
            : { ...ocrMeta, status: 'texto_vazio' };
        }
      }
    } catch (e) {
      ocrMeta = { ...ocrMeta, status: 'ocr_exception', error_code: e && e.code || null };
    }

    let valor = extrairValorOcr(ocrText);
    let forma = extrairForma(ocrText, null);
    let cartaoModalidade = null;
    let cartaoParcelas = null;
    const cartao = extrairCartao(ocrText);
    if (cartao) {
      forma = 'cartao';
      cartaoModalidade = cartao.modalidade || null;
      cartaoParcelas = cartao.parcelas || null;
    }

    let visao = null;
    if (!valor || !forma || ocrText.trim().length < 20) {
      try {
        visao = await visaoFn(media);
        if (visao) {
          if (!valor && visao.valor) valor = Number(visao.valor);
          if (!forma && visao.forma) forma = String(visao.forma).toLowerCase();
          if (forma === 'cartao') {
            cartaoModalidade = cartaoModalidade || visao.cartao_modalidade || visao.modalidade || null;
            cartaoParcelas = cartaoParcelas || Number(visao.cartao_parcelas || visao.parcelas) || null;
          }
        }
      } catch (e) {
        log({ acao: 'fallback_vision_error', chatId: event.chatId,
          trilho: 'agent_first_preflight', error_code: e && e.code || null });
      }
    }

    const evidence = {
      ocrText, ocrMeta, visao, valor: Number(valor) || null, forma: forma || null,
      cartaoModalidade, cartaoParcelas,
      pagador: (visao && (visao.pagador_nome || visao.aluno)) || extrairPagador(ocrText) || null,
    };
    event.caixaMediaEvidence = evidence;
    log({ acao: 'agent_first_midia_estruturada', chatId: event.chatId,
      ocr_status: ocrMeta.status, forma: evidence.forma,
      cartao_modalidade: evidence.cartaoModalidade,
      cartao_parcelas: evidence.cartaoParcelas, valor: evidence.valor });
    return evidence;
  }

  function aplicarEvidenciaMidiaV4(decisao, evidence, textoHumano) {
    if (!decisao || !evidence) return decisao;
    const dec = { ...decisao };
    const humana = extrairFormaHumana(textoHumano);
    if (humana.ambigua) {
      dec.forma = null;
      dec.cartao_modalidade = null;
      dec.cartao_parcelas = null;
    } else if (humana.forma) {
      dec.forma = humana.forma;
      dec.cartao_modalidade = humana.cartaoModalidade || null;
      dec.cartao_parcelas = humana.cartaoParcelas || null;
    } else if (evidence.forma) {
      dec.forma = evidence.forma;
      dec.cartao_modalidade = evidence.cartaoModalidade || null;
      dec.cartao_parcelas = evidence.cartaoParcelas || null;
    }
    const valorHumano = extrairValor(textoHumano);
    const valorSeguro = valorHumano || evidence.valor;
    if (valorSeguro && !(Number(dec.valor_total) > 0)) dec.valor_total = Number(valorSeguro);
    if (valorSeguro && !(Number(dec.valor) > 0)) dec.valor = Number(valorSeguro);
    return dec;
  }

  function limparEnvelopeDaPendencia(chatId, pendencia, motivo) {
    const guardado = envelopesV4.get(chatId);
    if (!guardado || !pendencia || guardado.previewId !== pendencia.previewId) return;
    envelopesV4.delete(chatId);
    log({ acao: 'agent_first_envelope_descartado', chatId, motivo,
          previewId: pendencia.previewId || null });
  }

  function formaExplicitaV4(texto, dec) {
    if (dec && dec.forma) {
      const f = String(dec.forma).toLowerCase().trim();
      if (['pix', 'dinheiro', 'cartao', 'cheque', 'transferencia'].includes(f)) {
        const cartao = f === 'cartao' ? extrairCartao(texto) : null;
        const p = f === 'cartao' ? String(texto || '').match(/\b(\d{1,2})\s*x\b/i) : null;
        return {
          forma: f,
          cartaoModalidade: dec.cartao_modalidade || dec.cartaoModalidade || (cartao && cartao.modalidade) || null,
          cartaoParcelas: Number(dec.cartao_parcelas || dec.cartaoParcelas)
            || (cartao && cartao.parcelas) || (p && Number(p[1]) >= 1 && Number(p[1]) <= 24 ? Number(p[1]) : null),
        };
      }
    }
    const cartao = extrairCartao(texto);
    if (cartao) {
      const p = String(texto || '').match(/\b(\d{1,2})\s*x\b/i);
      const parcelas = cartao.parcelas || (p && Number(p[1]) >= 1 && Number(p[1]) <= 24 ? Number(p[1]) : null);
      return { forma: 'cartao', cartaoModalidade: cartao.modalidade || null, cartaoParcelas: parcelas };
    }
    if (/\bpix\b/i.test(texto)) return { forma: 'pix', cartaoModalidade: null, cartaoParcelas: null };
    if (/\bdinheiro\b/i.test(texto)) return { forma: 'dinheiro', cartaoModalidade: null, cartaoParcelas: null };
    if (/\bcheque\b/i.test(texto)) return { forma: 'cheque', cartaoModalidade: null, cartaoParcelas: null };
    if (/\btransfer[eê]ncia\b|\btransfer\b/i.test(texto)) return { forma: 'transferencia', cartaoModalidade: null, cartaoParcelas: null };
    return { forma: null, cartaoModalidade: null, cartaoParcelas: null };
  }

  function categoriaDosItensV4(itens) {
    const lista = Array.isArray(itens) ? itens : [];
    const cats = lista.map((i) => String(i && i.categoria || '').toLowerCase().trim());
    if (!lista.length || cats.some((c) => !c)) return { ok: false, motivo: 'categoria_item_ausente' };
    const unicas = [...new Set(cats)];
    // A categoria de cada item continua no item. O topo existe para o contrato
    // do ledger/lote; quando o pagamento mistura naturezas, "outro" e mais
    // honesto que escolher silenciosamente a primeira.
    return { ok: true, categoria: unicas.length === 1 ? unicas[0] : 'outro' };
  }

  function mesclarRascunhoV4(base, dec, texto) {
    if (!base) return { ok: false, motivo: 'rascunho_sem_base' };
    if (String(dec && dec.intencao || '').startsWith('corrigir_')) {
      const corrigido = aplicarCorrecaoEnvelope(base, dec);
      if (corrigido.ok) return corrigido;
      // "cartao 2x" pode chegar como lancamento estruturado, e nao como
      // corrigir_forma. Nesse caso ainda aceitamos SOMENTE a forma explicita.
      if (dec.intencao !== 'corrigir_forma') return corrigido;
    }
    const envelope = JSON.parse(JSON.stringify(base));
    const faltavam = camposFaltantesV4(envelope);
    let forma = {};
    if (faltavam.includes('valor_total')) {
      const v = totalDaRespostaV4(texto, dec);
      if (v) envelope.valor_total = v;
    }
    if (faltavam.includes('forma')) {
      forma = formaExplicitaV4(texto, dec);
      if (forma.forma) envelope.forma = forma.forma;
    }
    const faltam = camposFaltantesV4(envelope);
    if (faltam.length === faltavam.length) {
      return { ok: false, motivo: 'rascunho_ainda_sem_' + faltam[0], faltam, envelope };
    }
    // Completou parte: o chamador decide se ainda pergunta o resto.
    return { ok: true, envelope, faltam, ...forma };
  }

  // O que o rascunho ainda precisa para virar card. Total e forma são os dois
  // únicos campos que o humano completa depois — identidade vem do comprovante.
  function camposFaltantesV4(envelope) {
    const f = [];
    if (!(Number(envelope && envelope.valor_total) > 0)) f.push('valor_total');
    if (!(envelope && envelope.forma)) f.push('forma');
    return f;
  }

  // 🔴 O TOTAL DA RESPOSTA SAI DO TEXTO DA PESSOA, nunca do modelo sozinho.
  //    Um único valor monetário escrito ("402,50", "R$ 402,50") vale; dois
  //    valores diferentes é ambíguo e a Sol pergunta de novo. O valor do modelo
  //    só entra se também estiver escrito (a mesma guarda do primeiro turno).
  function totalDaRespostaV4(texto, dec) {
    const achados = [...new Set(_numerosDoTexto(texto).map((n) => Math.round(n * 100)))];
    if (achados.length === 1) return achados[0] / 100;
    if (achados.length > 1) return null;
    const doModelo = valorDoModelo(dec && (dec.valor_total != null ? dec.valor_total : dec.valor));
    return doModelo && valorConfereComTexto(doModelo, texto).ok ? doModelo : null;
  }

  function perguntaFaltantesV4(faltam) {
    const f = Array.isArray(faltam) ? faltam : [];
    if (f.includes('valor_total') && f.includes('forma')) {
      return 'Ainda preciso do *total exato* e da *forma* (pix, dinheiro, cartão, cheque ou transferência).';
    }
    if (f.includes('valor_total')) return 'Ainda preciso do *total exato* do pagamento (ex.: R$ 402,50).';
    return 'Ainda preciso da forma: *pix*, *dinheiro*, *cartão*, *cheque* ou *transferência*.';
  }

  async function registrarRascunhoV4({ event, grupo, envelope, agora }) {
    if (!v3LedgerAtivo) return null;
    const origem = event.messageId;
    const previewHash = sha256(JSON.stringify({ tipo: 'agent_first_draft', chat: md5(event.chatId), origem: sha256(origem), envelope }));
    const pending = {
      tipoOperacao: 'agent_first_draft', unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor: envelope.valor_total, forma: envelope.forma || null, categoria: null,
      origem, ts: agora, agentFirstEnvelope: envelope, missingFields: camposFaltantesV4(envelope),
      rascunhoAutorHash: identidadeRascunhoV4(event), msgIds: [],
      v3Operacao: 'agent_first_draft', textoOriginal: bodyLimpo(event.body).slice(0, 500),
    };
    let v3 = null;
    try {
      v3 = await registrarPreviewPublicoV3({
        event, grupo, previewId: null, texto: 'rascunho agent-first aguardando ' + camposFaltantesV4(envelope).join('+'), pendencia: pending,
        result: { acao: 'agent_first_draft', missing_fields: camposFaltantesV4(envelope) },
        previewStatus: 'draft_missing_fields', previewHashFixo: previewHash,
        publicPreviewSent: false, eventStatus: 'draft_missing_fields', mode: 'v4_agent_first_draft',
      });
    } catch (e) {
      log({ acao: 'agent_first_draft_erro', chatId: event.chatId, erro: String(e && e.message) });
    }
    if (!v3 || !v3.ok || !v3.preview_id) return null;
    const draft = { envelope, origem, ts: agora, v3PreviewId: v3.preview_id,
      v3PreviewHash: previewHash, autorHash: identidadeRascunhoV4(event), msgIds: [],
      textoOriginal: pending.textoOriginal, grupo, event: { ...event, body: '' } };
    rascunhosV4.set(event.chatId, draft);
    log({ acao: 'agent_first_draft_persistido', chatId: event.chatId, preview_ledger_id: v3.preview_id });
    return draft;
  }

  async function vincularPerguntaRascunhoV4(draft, perguntaId) {
    if (!draft || !perguntaId) return;
    draft.msgIds = [...new Set([...(draft.msgIds || []), String(perguntaId)])];
    try {
      await registrarPreviewPublicoV3({
        event: draft.event, grupo: draft.grupo, previewId: perguntaId,
        texto: 'rascunho agent-first aguardando ' + camposFaltantesV4(draft.envelope).join('+'), pendencia: {
          tipoOperacao: 'agent_first_draft', unidade_id: draft.grupo.unidade_id,
          nome: draft.grupo.nome, valor: draft.envelope.valor_total,
          forma: draft.envelope.forma || null, categoria: null,
          origem: draft.origem, ts: draft.ts, agentFirstEnvelope: draft.envelope,
          missingFields: camposFaltantesV4(draft.envelope), rascunhoAutorHash: draft.autorHash,
          msgIds: draft.msgIds, v3Operacao: 'agent_first_draft',
        },
        result: { acao: 'agent_first_draft_pergunta_vinculada', missing_fields: camposFaltantesV4(draft.envelope) },
        previewStatus: 'draft_missing_fields', previewHashFixo: draft.v3PreviewHash,
        publicPreviewSent: false, eventStatus: 'draft_missing_fields', mode: 'v4_agent_first_draft',
      });
    } catch (e) {
      // O rascunho continua seguro pelo autor. Falhar ao persistir a referencia
      // apenas impede que outro remetente o complete por citacao apos restart.
      log({ acao: 'agent_first_draft_pergunta_vinculo_erro', chatId: draft.event.chatId,
        erro: String(e && e.message) });
    }
  }

  async function finalizarRascunhoV4(chatId, status, motivo) {
    const draft = rascunhosV4.get(chatId);
    if (!draft) return;
    rascunhosV4.delete(chatId);
    try {
      await registrarPreviewPublicoV3({
        event: draft.event, grupo: draft.grupo, previewId: null,
        texto: `rascunho ${status}`, pendencia: {
          tipoOperacao: 'agent_first_draft', unidade_id: draft.grupo.unidade_id,
          valor: draft.envelope.valor_total, forma: draft.envelope.forma || null,
          categoria: null, origem: draft.origem, ts: draft.ts,
          agentFirstEnvelope: draft.envelope, missingFields: [],
          rascunhoAutorHash: draft.autorHash || null, msgIds: draft.msgIds || [],
          v3Operacao: 'agent_first_draft',
        },
        result: { acao: 'agent_first_draft_finalizado', motivo },
        previewStatus: status, previewHashFixo: draft.v3PreviewHash,
        publicPreviewSent: false, eventStatus: status, mode: 'v4_agent_first_draft',
      });
    } catch (e) {
      log({ acao: 'agent_first_draft_finalizacao_erro', chatId, erro: String(e && e.message) });
    }
    log({ acao: 'agent_first_draft_finalizado', chatId, status, motivo });
  }

  async function limparEstadoDaOrigemV4(chatId, origem, motivo) {
    const arr = pendentes.get(chatId) || [];
    const afetadas = arr.filter((p) => p && p.origem === origem);
    pendentes.set(chatId, arr.filter((p) => !p || p.origem !== origem));
    for (const p of afetadas) {
      limparEnvelopeDaPendencia(chatId, p, motivo);
      await finalizarPreviewSeguroV3({ alvo: p, status: 'rejected', motivo });
    }
    const draft = rascunhosV4.get(chatId);
    if (draft && draft.origem === origem) await finalizarRascunhoV4(chatId, 'rejected', motivo);
    log({ acao: 'agent_first_estado_origem_limpo', chatId, origem_hash: sha256(origem || ''), motivo, pendencias: afetadas.length });
  }

  async function tratarAgentFirst(event, grupo, agora) {
    const texto = bodyLimpo(event.body);
    if (!texto) return null;
    const arr = limparVelhos(event.chatId, agora);
    let draft = rascunhosV4.get(event.chatId) || null;
    if (draft && (agora - draft.ts) >= janelaMs) {
      await finalizarRascunhoV4(event.chatId, 'expired', 'janela_runtime_expirou');
      draft = null;
    }
    if (draft && !eventoPodeCompletarRascunhoV4(event, draft)) {
      const pareceComplemento = !!formaExplicitaV4(texto, event && event.caixaToolDecision).forma
        || (camposFaltantesV4(draft.envelope).includes('valor_total') && !!totalDaRespostaV4(texto, null))
        || casarNao(texto) || casarPode(texto, { respondeuPreview: false }).pode;
      if (pareceComplemento) {
        log({ acao: 'agent_first_draft_ignorado_outro_remetente', chatId: event.chatId,
          citado: event.quotedMessageId || null });
        return { acao: 'agent_first_draft_ignorado_outro_remetente' };
      }
      // Para texto alheio, o rascunho simplesmente nao participa da decisao.
      draft = null;
    }
    if (draft && casarNao(texto)) {
      await finalizarRascunhoV4(event.chatId, 'rejected', 'descartado_pelo_humano');
      await sendFn(event.chatId, 'Tudo bem — descartei esse rascunho. Nada foi lançado.');
      return { acao: 'agent_first_draft_descartado' };
    }
    if (draft && casarPode(texto, { respondeuPreview: false }).pode) {
      const previa = mesclarRascunhoV4(draft.envelope, event && event.caixaToolDecision, texto);
      const faltam = previa.ok ? (previa.faltam || []) : (previa.faltam || camposFaltantesV4(draft.envelope));
      if (faltam.length) {
        await sendFn(event.chatId, perguntaFaltantesV4(faltam) + ' Só depois eu preparo o card que aceita *pode*.');
        return { acao: faltam.includes('valor_total') ? 'agent_first_draft_ainda_sem_total' : 'agent_first_draft_ainda_sem_forma' };
      }
    }
    const contexto = arr.slice(0, 3).map((p, i) => ({
      card: i + 1, valor: p.valor || null, forma: p.forma || null,
      categoria: p.categoria || null, aluno: p.aluno || null, competencia: p.competencia || null,
    }));
    const t0 = Date.now();
    // A ferramenta MCP ja e a escolha do LLM. Quando ela entrega uma decisao
    // estruturada, o runtime nao chama o classificador interno outra vez: daqui
    // para baixo ficam apenas validacao do envelope, Core, preview e cofre V3.
    // Sem essa propriedade, o canario antigo continua funcionando sem mudanca.
    const evidenceMedia = event && event.caixaMediaEvidence ? event.caixaMediaEvidence : null;
    let dec = event && event.caixaToolDecision ? event.caixaToolDecision : null;
    // 🔴 25 s + UMA nova tentativa (28/09/2026). Com a V4 na frente, roteador
    //    vazio vira SILÊNCIO para texto de venda (o legado não trata entrada por
    //    texto). Medido em produção: p50 3,4 s, p90 8,2 s, máx 12,7 s, e 1 em 16
    //    chamadas falha no provedor mesmo com 40 s — com o teto antigo de 12 s,
    //    "venda capotraste … R$40 pix" ficou muda em 3 de 4 tentativas.
    for (let tentativa = 1; !dec && tentativa <= 2; tentativa++) {
      try {
        dec = await rotearV4Fn(texto, contexto, {
          timeout: 25000,
          documento: evidenceMedia ? {
            valor: evidenceMedia.valor, forma: evidenceMedia.forma,
            cartao_modalidade: evidenceMedia.cartaoModalidade,
            cartao_parcelas: evidenceMedia.cartaoParcelas,
            pagador: evidenceMedia.pagador,
            ocr_excerpt: String(evidenceMedia.ocrText || '').slice(0, 900),
          } : null,
        });
      } catch (e) { dec = null; }
      if (!dec && tentativa === 1) log({ acao: 'agent_first_roteador_vazio_nova_tentativa', chatId: event.chatId, ms: Date.now() - t0 });
    }
    dec = aplicarEvidenciaMidiaV4(dec, evidenceMedia, texto);
    if (!dec) { log({ acao: 'agent_first_sem_decisao', chatId: event.chatId, ms: Date.now() - t0 }); return null; }

    // ── SEGUNDO TURNO: corrige o ENVELOPE guardado, nunca remonta frase ──────
    // 🔴 O ENVELOPE VIVE ENQUANTO A PENDENCIA DELE VIVER. Amarrar os dois numa
    //    regra so resolve aprovacao, descarte, expiracao e falha de persistencia
    //    V3 de uma vez: aprovou ou descartou, a pendencia sai do array; expirou,
    //    `limparVelhos` a tira; e se o V3 nao registrou, ela nunca nasceu. Um
    //    envelope orfao seria estado invisivel decidindo dinheiro.
    const guardado = envelopesV4.get(event.chatId);
    const pendGuardada = guardado && guardado.previewId
      ? arr.find((p) => p.previewId === guardado.previewId) || null
      : null;
    const pendVivo = !!pendGuardada;
    if (guardado && !pendVivo) {
      envelopesV4.delete(event.chatId);
      log({ acao: 'agent_first_envelope_descartado', chatId: event.chatId, motivo: 'pendencia_nao_existe_mais' });
    }
    const vivo = pendVivo && (agora - guardado.ts) < janelaMs;
    const draftVivo = !!(draft && (agora - draft.ts) < janelaMs);
    let env;
    let formaComplementada = formaExplicitaV4(texto, dec);
    if (draftVivo) {
      env = mesclarRascunhoV4(draft.envelope, dec, texto);
      formaComplementada = formaExplicitaV4(texto, dec);
      if (env.ok) env.faltam = camposFaltantesV4(env.envelope);
      if (!env.ok || env.faltam.length) {
        if (env.ok) {
          // Completou uma parte: o rascunho guarda o que chegou, e a pergunta
          // passa a ser só pelo que falta (nunca pede de novo o que foi dito).
          draft.envelope = env.envelope;
          draft.ts = agora;
        }
        const faltam = env.faltam || camposFaltantesV4(draft.envelope);
        const perguntaId = await sendFn(event.chatId, 'Guardei o restante. ' + perguntaFaltantesV4(faltam));
        await vincularPerguntaRascunhoV4(draft, perguntaId);
        log({ acao: 'agent_first_draft_ainda_incompleto', chatId: event.chatId, motivo: env.motivo || 'parcial', faltam });
        return { acao: faltam.includes('valor_total') ? 'agent_first_draft_ainda_sem_total' : 'agent_first_draft_ainda_sem_forma' };
      }
      log({ acao: 'agent_first_draft_completado', chatId: event.chatId, forma: env.envelope.forma,
        valor_total: env.envelope.valor_total });
    } else if (vivo && String(dec.intencao || '').startsWith('corrigir_')) {
      const corr = aplicarCorrecaoEnvelope(guardado.envelope, dec);
      if (!corr.ok) {
        log({ acao: 'agent_first_correcao_recusada', chatId: event.chatId,
              motivo: corr.motivo, intencao: dec.intencao });
        return null;
      }
      env = corr;
      log({ acao: 'agent_first_correcao', chatId: event.chatId, intencao: dec.intencao });
    } else {
      env = montarEnvelopeV4(dec);
    }
    if (!env.ok) {
      // 🔴 TOTAL RECUSADO E TERMINAL — NUNCA `null`. Devolver null aqui deixava o
      //    parser legado assumir a MESMA mensagem, e ele produz exatamente o
      //    card parcial de R$ 357 com o nome contaminado. Ou seja: a guarda de
      //    valor bloqueava o caminho novo e liberava o antigo, que e o caminho
      //    errado. O F11 nao pegava porque so olhava se o Core foi chamado.
      //    Quando o modelo inventou o total, ninguem responde: pergunta-se.
      if (env.motivo === 'valor_total_recusado') {
        // 🔴 RECUSAR NÃO PODE SER BECO SEM SAÍDA (Recreio 28/09). A Sol pedia "me
        //    manda o total" e não guardava nada: a resposta "o total foi R$ 402,50"
        //    chegava sem aluno, sem fatura e sem o comprovante, e ninguém lançava.
        //    Agora o resto do que foi lido vira RASCUNHO sem total; a resposta do
        //    mesmo autor (ou citando a pergunta) completa só o total — escrito por
        //    ela, nunca escolhido pelo modelo.
        const semTotal = montarEnvelopeV4({ ...dec, valor_total_recusado: null, valor_total: 1, valor: null });
        const salvo = semTotal.ok
          ? await registrarRascunhoV4({ event, grupo, agora,
            envelope: { ...semTotal.envelope, valor_total: null } })
          : null;
        const perguntaId = await sendFn(event.chatId,
          (event.hasMedia ? 'Recebi o comprovante, mas o valor total que li não confere com o que está escrito na mensagem. '
            : 'Não consegui confirmar o valor na sua mensagem. ')
          + 'Não vou lançar por conta própria. Me manda o total exato'
          + (salvo ? ' (ex.: R$ 402,50) — guardei o restante, não precisa reenviar o comprovante.' : ', por favor.'));
        if (salvo) await vincularPerguntaRascunhoV4(salvo, perguntaId);
        log({ acao: 'agent_first_valor_total_recusado', chatId: event.chatId,
              recusado: env.recusado && env.recusado.motivo, rascunho: !!salvo });
        return { acao: 'agent_first_valor_total_recusado' };
      }
      log({ acao: 'agent_first_sem_envelope', chatId: event.chatId, motivo: env.motivo,
            intencao: dec.intencao, confianca: dec.confianca });
      // O modelo reconheceu um LANÇAMENTO mas não fechou valor/identidade: se o
      // legado também não tratar, a pessoa precisa saber (nunca silêncio).
      if (String(dec.intencao || '').startsWith('lancamento') && ['sem_valor_total', 'sem_identidade'].includes(env.motivo)) {
        const _i0 = Array.isArray(dec.itens) && dec.itens[0];
        event._agentFirstNaoResolveu = { motivo: 'lancamento_ambiguo',
          valor: valorDoModelo(dec.valor_total != null ? dec.valor_total : dec.valor),
          aluno: dec.aluno_nome || (_i0 && _i0.aluno) || null };
      }
      return null;
    }

    // O mesmo envelope de negocio passa a carregar a trilha de evidencias.
    // Nesta fase ela e SHADOW: compara a decisao atual sem trocar valor, forma,
    // aluno, categoria ou competencia que chegam ao Core.
    const evidenciaTurno = construirEnvelopeEvidenciasV1({
      textoHumano: texto,
      ocrText: evidenceMedia && evidenceMedia.ocrText || '',
      ocrMeta: evidenceMedia && evidenceMedia.ocrMeta || null,
      visao: evidenceMedia && evidenceMedia.visao || null,
      llm: dec,
    });
    env.envelope.evidencias = mesclarEnvelopesEvidenciasV1(
      env.envelope.evidencias || null,
      evidenciaTurno
    );
    if (_evidenciaShadowLigado(event.chatId)) {
      const itemUnico = Array.isArray(env.envelope.itens) && env.envelope.itens.length === 1
        ? env.envelope.itens[0] : null;
      const cmp = compararEnvelopeEvidenciasV1(env.envelope.evidencias, {
        valor_total: env.envelope.valor_total,
        forma: env.envelope.forma,
        aluno: itemUnico && itemUnico.aluno,
        categoria: itemUnico && Array.isArray(itemUnico.categorias) && itemUnico.categorias.length === 1
          ? itemUnico.categorias[0] : null,
        competencia: itemUnico && Array.isArray(itemUnico.competencias) && itemUnico.competencias.length === 1
          ? itemUnico.competencias[0] : null,
        pagador: env.envelope.pagador,
      });
      log({ acao: 'evidence_resolver_shadow', trilho: 'agent_first', chatId: event.chatId,
        divergencias: cmp.divergencias, conflitos: cmp.conflitos, ok: cmp.ok });
    }

    if (!env.envelope.forma) {
      const salvo = await registrarRascunhoV4({ event, grupo, envelope: env.envelope, agora });
      if (!salvo) {
        await sendFn(event.chatId, '⚠️ Entendi os dados, mas não consegui guardar o rascunho com segurança. Nada foi lançado; tenta de novo em instantes.');
        log({ acao: 'agent_first_draft_nao_persistido', chatId: event.chatId });
        return { acao: 'agent_first_draft_nao_persistido' };
      }
      const perguntaId = await sendFn(event.chatId, 'Entendi o aluno e o valor. Falta só a forma de pagamento: *pix*, *dinheiro*, *cartão*, *cheque* ou *transferência*. Guardei o restante; não precisa repetir.');
      await vincularPerguntaRascunhoV4(salvo, perguntaId);
      return { acao: 'agent_first_aguardando_forma' };
    }

    // 🔴 VENDA DE LOJINHA NÃO TEM FATURA (28/09/2026). A V4 mandava toda venda
    //    ao Core, que procura fatura no Emusys e responde "nenhuma fatura" — a
    //    Sol parou de lançar venda por texto e pela ferramenta. O caminho de
    //    FOTO continua no legado (provado em 17 de 19 vendas de set/2026); aqui
    //    ficam texto e ferramenta.
    // O produto pode estar só na 1ª mensagem ("Venda de corda … R$ 60") quando
    // esta é o complemento ("pix"): o rascunho guarda o texto original.
    const textoProduto = ((draftVivo && draft && draft.textoOriginal) ? draft.textoOriginal + ' ' : '') + texto;
    // ⚠️ A fatura vem PRIMEIRO: Campo Grande emite fatura de lojinha no Emusys
    //    ("1 palheta caveira", tipo lojinha_produto) e o card deve ligar nela.
    //    Só sem fatura (ou com a cópia atualizando) a venda vira card sem vínculo.
    let res = null;
    try { res = await resolverEnvelopeFn({ unidade_id: grupo.unidade_id, envelope: env.envelope }); }
    catch (e) { log({ acao: 'agent_first_erro_resolver', chatId: event.chatId, erro: String(e && e.message) }); return null; }
    if (!res) return null;

    // Passaporte pode ser recebido antes de existir uma fatura aberta no
    // Emusys. Isso não autoriza um fallback genérico: o resgate usa a porta
    // canônica que já sabe validar valor declarado e identidade, e só abre
    // quando há UM aluno, UMA categoria explicitamente `passaporte`, total
    // positivo e nenhum pagador/família para expandir. Parcela, lote, categoria
    // ausente e identidade ambígua continuam recusados/fallback.
    if (res.motivo === 'nenhuma_fatura_aberta') {
      const itensEnv = Array.isArray(env.envelope.itens) ? env.envelope.itens : [];
      const itemEnv = itensEnv.length === 1 ? itensEnv[0] : null;
      const cats = itemEnv && Array.isArray(itemEnv.categorias) ? itemEnv.categorias : [];
      const total = Number(env.envelope.valor_total);
      const passaporteDeclarado = !env.envelope.pagador && itemEnv
        && typeof itemEnv.aluno === 'string' && itemEnv.aluno.trim()
        && cats.length === 1 && String(cats[0]).toLowerCase() === 'passaporte'
        && Number.isFinite(total) && total > 0;
      if (passaporteDeclarado) {
        const comp = Array.isArray(itemEnv.competencias) && itemEnv.competencias.length === 1
          ? String(itemEnv.competencias[0]) : '';
        const mm = comp.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
        let declarado = null;
        try {
          declarado = await resolverMultiFn({
            unidade_id: grupo.unidade_id,
            itens: [{ aluno_nome: itemEnv.aluno.trim(), valor: total,
              categoria: 'passaporte', declarado_pelo_humano: true }],
            valor_total: total,
            competencia: mm ? `${mm[2]}-${String(mm[1]).padStart(2, '0')}-01` : null,
          });
        } catch (e) {
          log({ acao: 'agent_first_passaporte_sem_fatura_erro', chatId: event.chatId,
                erro: String(e && e.message) });
        }
        const linhas = declarado && Array.isArray(declarado.itens) ? declarado.itens : [];
        const unico = linhas.length === 1 ? linhas[0] : null;
        const seguro = declarado && declarado.ok && unico
          && String(unico.categoria || '').toLowerCase() === 'passaporte'
          && unico.declarado_pelo_humano === true && unico.sem_vinculo_fatura === true
          && !unico.canonical_fatura_id
          && Math.abs(Number(unico.valor) - total) <= 0.01;
        if (seguro) {
          res = { ...declarado, valor_total: total, via: 'passaporte_declarado_sem_fatura' };
          log({ acao: 'agent_first_passaporte_sem_fatura_resgatado', chatId: event.chatId,
                linhas: 1 });
        } else {
          log({ acao: 'agent_first_passaporte_sem_fatura_bloqueado', chatId: event.chatId,
                motivo: (declarado && declarado.motivo) || 'resposta_fora_do_contrato' });
        }
      }
    }

    // PERGUNTA, nunca escolhe: e a mesma regra que matou o `limit 1` do casador.
    if (res.motivo === 'combinacao_ambigua') {
      const alts = (Array.isArray(res.alternativas) ? res.alternativas : []).map((a, i) =>
        `*${i + 1})* ` + (Array.isArray(a) ? a : []).map((f) =>
          `${f.aluno_nome} · ${f.categoria} ${f.competencia} — ${fmtBRL(Number(f.valor))}`).join(' + '))
        .join(String.fromCharCode(10));
      await sendFn(event.chatId,
        `❓ Achei *mais de uma* combinação de faturas que fecha ${fmtBRL(Number(res.valor_total))}. `
        + 'Não vou escolher por você — me diz qual é:' + String.fromCharCode(10) + alts);
      log({ acao: 'agent_first_pergunta', chatId: event.chatId, motivo: 'combinacao_ambigua', combinacoes: res.combinacoes });
      return { acao: 'agent_first_pergunta', motivo: 'combinacao_ambigua' };
    }
    if (res.motivo === 'nome_ambiguo') {
      const c = Array.isArray(res.candidatos) ? res.candidatos : [];
      await sendFn(event.chatId,
        `❓ Tem *${c.length}* alunos com esse nome nesta unidade${c.length ? ': ' + c.slice(0, 6).map((x) => x.aluno_nome || x.nome).filter(Boolean).join(', ') : ''}. `
        + 'Me diz o nome completo de quem pagou.');
      log({ acao: 'agent_first_pergunta', chatId: event.chatId, motivo: 'nome_ambiguo', candidatos: c.length });
      return { acao: 'agent_first_pergunta', motivo: 'nome_ambiguo' };
    }
    if (!event.hasMedia && ['nenhuma_fatura_aberta', 'fonte_indisponivel'].includes(res.motivo)
        && (ehVendaDeLojinhaV4(env.envelope, textoProduto, 'declarada')
          || ehVendaDeLojinhaV4(env.envelope, textoProduto, 'resgate'))) {
      log({ acao: 'agent_first_lojinha_resgatada', chatId: event.chatId, motivo: res.motivo });
      return abrirFluxoAgentFirstLojinha({ event, grupo, envelope: env.envelope, texto: textoProduto, agora,
        origemMessageId: (draftVivo && draft.origem) || event.messageId,
        cartaoModalidade: (formaComplementada && formaComplementada.cartaoModalidade) || null,
        cartaoParcelas: (formaComplementada && formaComplementada.cartaoParcelas) || null });
    }
    if (!res.ok || !Array.isArray(res.itens) || res.itens.length === 0) {
      log({ acao: 'agent_first_nao_resolveu', chatId: event.chatId, motivo: res.motivo || 'sem_itens' });
      // Marca para o aviso de fim de turno: se ninguém mais tratar, a pessoa
      // precisa saber que a Sol entendeu e por que não lançou.
      const _it = Array.isArray(env.envelope.itens) && env.envelope.itens[0];
      event._agentFirstNaoResolveu = { motivo: res.motivo || 'sem_itens',
        valor: env.envelope.valor_total, aluno: (_it && _it.aluno) || env.envelope.pagador || null };
      return null;
    }

    const categoria = categoriaDosItensV4(res.itens);
    if (!categoria.ok) {
      await limparEstadoDaOrigemV4(event.chatId, (draftVivo && draft.origem) || event.messageId, categoria.motivo);
      await sendFn(event.chatId, '⚠️ Não preparei o lançamento porque a categoria da fatura não veio completa da fonte oficial. Nada foi lançado; tenta de novo em instantes.');
      return { acao: 'agent_first_categoria_invalida', motivo: categoria.motivo };
    }

    log({ acao: 'agent_first_resolveu', chatId: event.chatId, via: res.via,
          linhas: res.itens.length, alunos: res.alunos, ms: Date.now() - t0 });

    // Daqui para baixo e o fluxo de sempre: preview, cofre V3, "pode" humano,
    // lote atomico. O agent-first so troca QUEM montou a pergunta.
    const anterior = vivo && guardado ? guardado.previewId : null;
    const origem = (draftVivo && draft.origem)
      || (vivo && pendGuardada && pendGuardada.origem) || event.messageId;
    const comum = {
      event, grupo, textoFonte: texto, textoHumano: texto, agora,
      // A correcao conserva a origem do comprovante. Alem de preservar a
      // idempotencia, isto faz a reidratacao escolher somente o preview mais
      // novo mesmo se um runtime antigo ainda enxergar os dois por instantes.
      origemMessageId: origem, resolvidoPronto: res, agentFirstEnvelope: env.envelope,
      supersedePreviewId: anterior,
      intent: { ok: true, valor_total: Number(res.valor_total), forma: env.envelope.forma,
                categoria: categoria.categoria,
                itens: res.itens.map((i) => ({ aluno_nome: i.aluno_nome, valor: Number(i.valor), categoria: i.categoria })) },
      cartaoModalidade: formaComplementada.cartaoModalidade || null,
      cartaoParcelas: formaComplementada.cartaoParcelas || null,
    };
    const saida = res.itens.length === 1
      ? await abrirFluxoAgentFirstSingular(comum)
      : await abrirFluxoMultiAluno(comum);
    // So guarda o envelope se a pendencia FOI persistida (previewId de volta).
    // V3 que nao registrou nao deixa pendencia — e nao pode deixar envelope.
    if (saida && saida.previewId) {
      envelopesV4.set(event.chatId, { envelope: env.envelope, ts: agora, previewId: saida.previewId });
      if (draftVivo) await finalizarRascunhoV4(event.chatId, 'superseded', 'preview_completo_criado');
    } else if (!(saida && saida.preservarEnvelope)) {
      await limparEstadoDaOrigemV4(event.chatId, origem, (saida && saida.acao) || 'sem_preview');
      log({ acao: 'agent_first_envelope_descartado', chatId: event.chatId,
            motivo: (saida && saida.acao) || 'sem_preview' });
    }
    return saida;
  }

  // Mesmo aluno, varias competencias explicitas. E um LOTE DE FATURAS, nao
  // correcao de nome e nao "quitacao" generica. O Core oficial decide quais
  // faturas fecham o total; zero combinacoes termina em conferencia humana e
  // nunca devolve a frase ao parser singular.
  async function tratarParcelasCompetenciasExplicitas({ event, grupo, agora, texto,
    aluno, valor, forma, categoria = 'parcela', origemMessageId = null,
    supersedePreviewId = null, evidenceEnvelope = null }) {
    const competencias = extrairCompetenciasTexto(texto);
    const nome = String(aluno || '').trim();
    const total = Number(valor);
    if (competencias.length < 2 || !nome || !(total > 0) || !forma) return null;

    const envelope = {
      pagador: null,
      valor_total: total,
      forma,
      itens: [{ aluno: nome, categorias: [categoria || 'parcela'], competencias }],
    };
    let res = null;
    try {
      res = await resolverEnvelopeFn({ unidade_id: grupo.unidade_id, envelope });
    } catch (e) {
      log({ acao: 'parcelas_competencias_resolver_erro', chatId: event.chatId,
        competencias, erro: String(e && e.message) });
    }

    if (res && res.ok && Array.isArray(res.itens) && res.itens.length >= 2) {
      const cat = categoriaDosItensV4(res.itens);
      if (!cat.ok) return null;
      log({ acao: 'parcelas_competencias_resolvidas', chatId: event.chatId,
        competencias, linhas: res.itens.length, aluno: nome });
      return abrirFluxoMultiAluno({
        event, grupo, textoFonte: texto, textoHumano: texto, agora,
        origemMessageId: origemMessageId || event.messageId,
        resolvidoPronto: res, agentFirstEnvelope: envelope,
        supersedePreviewId, evidenceEnvelope,
        intent: {
          ok: true, valor_total: Number(res.valor_total), forma,
          categoria: cat.categoria,
          itens: res.itens.map((i) => ({
            aluno_nome: i.aluno_nome, valor: Number(i.valor), categoria: i.categoria,
          })),
        },
      });
    }

    // O card singular anterior nao pode continuar aprovavel depois que o
    // humano declarou duas competencias. Se o ledger remoto nao fechar, a
    // barreira local `bloqueiaLancamento` ainda impede o "pode".
    if (supersedePreviewId) {
      const arr = limparVelhos(event.chatId, agora);
      const alvo = arr.find((p) => p.previewId === supersedePreviewId
        || (Array.isArray(p.msgIds) && p.msgIds.includes(supersedePreviewId))) || null;
      if (alvo) {
        alvo.bloqueiaLancamento = true;
        alvo.multiplas = true;
        alvo.competencias = competencias;
        const fim = await finalizarPreviewSeguroV3({
          alvo, status: 'rejected', motivo: 'multiplas_competencias_sem_fechamento_exato',
        });
        if (fim && fim.ok) {
          pendentes.set(event.chatId, arr.filter((p) => p !== alvo));
          limparEnvelopeDaPendencia(event.chatId, alvo, 'multiplas_competencias_sem_fechamento_exato');
        }
      }
    }

    const candidatas = Array.isArray(res && res.faturas) ? res.faturas.filter((f) =>
      competencias.includes(String(f && f.competencia || ''))) : [];
    const linhas = candidatas.map((f) => `• ${f.competencia} — ${fmtBRL(Number(f.valor))}`);
    const soma = candidatas.reduce((s, f) => s + Number(f && f.valor || 0), 0);
    const cobreTodas = competencias.every((c) => candidatas.some((f) => String(f.competencia) === c));
    const diferenca = cobreTodas ? total - soma : null;
    const detalhe = cobreTodas
      ? (`\n\nNo Emusys encontrei:\n${linhas.join('\n')}\n• Total oficial: *${fmtBRL(soma)}*`
        + (Math.abs(diferenca) >= 0.005 ? `\n• Diferença para o comprovante: *${fmtBRL(Math.abs(diferenca))}*` : ''))
      : '\n\nNão consegui confirmar as duas faturas na fonte oficial agora.';
    const fechoSeguro = supersedePreviewId
      ? '⚠️ Invalidei o card anterior. Não vou lançar enquanto essa divergência não for conferida.'
      : '⚠️ Não criei um card aprovável. Não vou lançar enquanto essa divergência não for conferida.';
    await sendFn(event.chatId,
      `Entendi a correção: *${nome}*, parcelas *${competencias.join(' e ')}*, `
      + `comprovante de *${fmtBRL(total)}* via ${forma}.${detalhe}\n\n`
      + fechoSeguro);
    log({ acao: 'parcelas_competencias_divergentes', chatId: event.chatId,
      aluno: nome, competencias, valor: total, soma_oficial: cobreTodas ? soma : null,
      diferenca: diferenca == null ? null : diferenca, motivo: res && res.motivo || 'fonte_indisponivel' });
    return { acao: 'parcelas_competencias_divergentes', competencias,
      motivo: res && res.motivo || 'fonte_indisponivel' };
  }

  // 🔴 ADIANTAMENTO DECLARADO (SOL-134, decisão do Alf em 29/09/2026; caso Recreio
  //    29/09, R$ 1.650 = passaporte 550 + parcelas 10/2026 de Bateria e Piano + R$ 100
  //    "que será adiantamento para a parcela de novembro"). O código decide:
  //    • o adiantamento é o que a equipe ESCREVEU (valor + mês), nunca a sobra;
  //    • o restante (comprovante − adiantamento) tem de fechar NO CENTAVO com faturas
  //      oficiais do aluno — o mesmo resolvedor de combinação única do Core;
  //    • só então sai o card multi-item (faturas + "Adiantamento parcela MM/AAAA —
  //      R$ X (sem fatura)") pelo lote de sempre (sol_caixa_lancar_recebimento_lote_v1),
  //      e ele pede "pode". Não fechou: explica e não cria card aprovável.
  function _competenciasDoTexto(texto, excluir, hoje = new Date()) {
    const lista = extrairCompetenciasTexto(texto);
    const t = _normConf(texto);
    const mesHoje = hoje.getFullYear() * 12 + hoje.getMonth() + 1;
    for (const m of t.matchAll(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b(?:\s*(?:de|\/|-)?\s*(20\d{2}))?/g)) {
      const mes = _MES_NOME[m[1]];
      let ano = m[2] ? Number(m[2]) : hoje.getFullYear();
      // sem ano: o mês com esse nome mais perto de hoje (parcela paga pode estar atrasada)
      if (!m[2]) {
        if (ano * 12 + mes - mesHoje > 6) ano -= 1;
        else if (mesHoje - (ano * 12 + mes) > 6) ano += 1;
      }
      const c = _mm(mes, ano);
      if (!lista.includes(c)) lista.push(c);
    }
    return lista.filter((c) => c !== excluir);
  }

  async function tratarPagamentoComAdiantamento({ event, grupo, agora, textoHumano, textoFonte,
    adiantamento, aluno, valor, forma, evidenceEnvelope }) {
    const total = Number(valor);
    const base = Math.round((total - Number(adiantamento.valor)) * 100) / 100;
    const nome = String(aluno || '').trim();
    if (!(base > 0) || !nomePlausivel(nome)) return null;
    const falar = async (porque, motivo) => {
      await sendFn(event.chatId,
        `Entendi o adiantamento de *${fmtBRL(adiantamento.valor)}* para a parcela *${adiantamento.competencia}*`
        + ` (${nome ? '*' + nome + '*, ' : ''}comprovante de *${fmtBRL(total)}*). ${porque}\n\n`
        + '⚠️ Não criei um card aprovável.');
      log({ acao: 'adiantamento_sem_fechamento', chatId: event.chatId, motivo,
            valor_total: total, adiantamento: adiantamento.valor, competencia: adiantamento.competencia });
      return { acao: 'adiantamento_sem_fechamento', motivo };
    };
    if (!forma) return falar('Falta a forma de pagamento (pix, dinheiro, cartão…).', 'forma_ausente');
    const tn = _normConf(textoHumano.replace(adiantamento.trecho, ' '));
    const categorias = [];
    if (/\bpassaporte/.test(tn)) categorias.push('passaporte');
    if (/\bmatr[ií]cula/.test(tn)) categorias.push('matricula');
    if (/\b(parcela|mensalidade)/.test(tn) || !categorias.length) categorias.push('parcela');
    const competencias = _competenciasDoTexto(textoHumano, adiantamento.competencia);
    const envelope = { pagador: null, valor_total: base, forma,
      itens: [{ aluno: nome, categorias, competencias }] };
    let res = null;
    try { res = await resolverEnvelopeFn({ unidade_id: grupo.unidade_id, envelope }); }
    catch (e) { log({ acao: 'adiantamento_resolver_erro', chatId: event.chatId, erro: String(e && e.message) }); }
    const itensFat = res && res.ok && Array.isArray(res.itens) ? res.itens : [];
    const soma = itensFat.reduce((s, i) => s + Number(i && i.valor || 0), 0);
    const mesmaPessoa = itensFat.length > 0 && itensFat.every((i) => i && nomePlausivel(i.aluno_nome)
      && _mesmaPessoa(i.aluno_nome, nome));
    const comFatura = itensFat.every((i) => i && i.canonical_fatura_id && i.sem_vinculo_fatura !== true);
    if (!itensFat.length || Math.abs(soma - base) > 0.01 || !mesmaPessoa || !comFatura) {
      const porque = res && res.motivo === 'combinacao_ambigua'
        ? `Achei mais de uma combinação de faturas que fecha os *${fmtBRL(base)}* restantes — me diz quais são.`
        : `Não achei faturas oficiais${nome ? ' de ' + nome : ''} que fechem exatamente os *${fmtBRL(base)}* restantes. Confere o nome, os meses e os valores.`;
      return falar(porque, (res && res.motivo) || (!mesmaPessoa ? 'outra_pessoa' : 'soma_nao_fecha'));
    }
    const cat = categoriaDosItensV4(itensFat);
    if (!cat.ok) return falar('A categoria de uma das faturas não veio completa da fonte oficial.', cat.motivo);
    const titular = itensFat[0];
    const itemAdiant = {
      ordem: itensFat.length + 1, aluno_nome: titular.aluno_nome,
      responsavel_financeiro: titular.responsavel_financeiro || null,
      valor: Number(adiantamento.valor), categoria: 'parcela', competencia: adiantamento.competencia,
      canonical_fatura_id: null, fatura: null,
      descricao: `Adiantamento parcela ${adiantamento.competencia} · declarado pela equipe, sem vínculo de fatura`,
      sem_vinculo_fatura: true, declarado_pelo_humano: true, adiantamento: true,
    };
    const itens = [...itensFat, itemAdiant];
    log({ acao: 'adiantamento_declarado_resolvido', chatId: event.chatId, faturas: itensFat.length,
          base, adiantamento: adiantamento.valor, competencia: adiantamento.competencia });
    return abrirFluxoMultiAluno({
      event, grupo, textoFonte: textoFonte || textoHumano, textoHumano, agora,
      origemMessageId: event.messageId,
      resolvidoPronto: { ...res, itens, valor_total: total, soma_itens: total },
      agentFirstEnvelope: envelope, evidenceEnvelope, adiantamento,
      intent: { ok: true, valor_total: total, forma, categoria: cat.categoria,
        itens: itens.map((i) => ({ aluno_nome: i.aluno_nome, valor: Number(i.valor), categoria: i.categoria })) },
    });
  }

  // Todo card guarda QUEM o enviou: o "pode" seco com 2+ cards abertos resolve
  // pelo autor. O card de ingresso (CG 03/10) nascia sem autor e o "pode" do
  // próprio Jereh virou "tem mais de um comprovante aguardando".
  function _carimbarAutor(pendencia, event) {
    if (!pendencia || !event) return pendencia;
    if (pendencia.autorPhone == null) pendencia.autorPhone = event.senderPhone || null;
    if (pendencia.autorId == null) pendencia.autorId = event.senderId || null;
    return pendencia;
  }
  async function prepararEPublicarPreviewV4({ event, grupo, texto, pendencia, result, previewStatus }) {
    if (!v3LedgerAtivo) return { ok: false, motivo: 'v3_indisponivel' };
    _carimbarAutor(pendencia, event);
    const origem = pendencia.origem || event.messageId;
    const previewHash = sha256(JSON.stringify({
      tipo: pendencia.tipoOperacao || 'lancamento_singular', chat: md5(event.chatId),
      origem: sha256(origem), valor: pendencia.valor, forma: pendencia.forma,
      categoria: pendencia.categoria, itens: pendencia.itens || null,
      aluno: pendencia.aluno || null, competencia: pendencia.competencia || null,
    }));
    let preparado = null;
    try {
      preparado = await registrarPreviewPublicoV3({
        event, grupo, previewId: null, texto, pendencia,
        result: { ...(result || {}), fase: 'prepared_private' },
        previewStatus: 'prepared_private', previewHashFixo: previewHash,
        publicPreviewSent: false, eventStatus: 'prepared_private', mode: 'v4_agent_first_two_phase',
      });
    } catch (e) {
      log({ acao: 'agent_first_preview_prepare_erro', chatId: event.chatId, erro: String(e && e.message) });
    }
    if (!preparado || !preparado.ok || !preparado.preview_id) {
      await limparEstadoDaOrigemV4(event.chatId, origem, 'preview_prepare_falhou');
      return { ok: false, motivo: 'preview_prepare_falhou' };
    }

    // O card que pede "pode" so sai depois de o registro seguro existir.
    let previewId = null;
    try { previewId = await sendFn(event.chatId, texto); }
    catch (e) {
      try {
        await registrarPreviewPublicoV3({
          event, grupo, previewId: null, texto: 'preview rejeitado antes da publicacao', pendencia,
          result: { acao: 'agent_first_preview_rejected', motivo: 'envio_card_falhou' },
          previewStatus: 'rejected', previewHashFixo: previewHash,
          publicPreviewSent: false, eventStatus: 'rejected', mode: 'v4_agent_first_two_phase',
        });
      } catch (e2) { /* continua fail-closed */ }
      await limparEstadoDaOrigemV4(event.chatId, origem, 'envio_card_falhou');
      log({ acao: 'agent_first_preview_envio_erro', chatId: event.chatId, erro: String(e && e.message) });
      return { ok: false, motivo: 'envio_card_falhou' };
    }
    pendencia.previewId = previewId;
    pendencia.v3PreviewId = preparado.preview_id;
    pendencia.v3PreviewHash = previewHash;
    let publicado = null;
    try {
      publicado = await registrarPreviewPublicoV3({
        event, grupo, previewId, texto, pendencia,
        result: { ...(result || {}), fase: 'public_preview_sent' },
        previewStatus, previewHashFixo: previewHash,
        publicPreviewSent: true, eventStatus: 'public_preview_sent', mode: 'v4_agent_first_two_phase',
      });
    } catch (e) {
      log({ acao: 'agent_first_preview_publish_erro', chatId: event.chatId, erro: String(e && e.message) });
    }
    if (!publicado || !publicado.ok || !publicado.preview_id) {
      try {
        await registrarPreviewPublicoV3({
          event, grupo, previewId, texto: 'preview rejeitado por falha de ativacao', pendencia,
          result: { acao: 'agent_first_preview_rejected', motivo: 'preview_publish_falhou' },
          previewStatus: 'rejected', previewHashFixo: previewHash,
          publicPreviewSent: false, eventStatus: 'rejected', mode: 'v4_agent_first_two_phase',
        });
      } catch (e) { /* a trava principal continua sendo nao criar pendencia local */ }
      await limparEstadoDaOrigemV4(event.chatId, origem, 'preview_publish_falhou');
      await sendFn(event.chatId, '⚠️ O card apareceu, mas não consegui ativá-lo no cofre seguro. Ignore esse card e não responda *pode*; nada foi lançado.');
      return { ok: false, motivo: 'preview_publish_falhou' };
    }
    pendencia.v3PreviewId = publicado.preview_id;
    pendencia.v3PreviewHash = previewHash;
    return { ok: true, previewId, pendencia };
  }

  // É venda de lojinha? 'declarada': o modelo classificou como lojinha (ou venda
  // com produto escrito). 'resgate': o Core não achou fatura e o texto fala de
  // produto. Nunca com parcela/passaporte declarados, nem com 2+ alunos.
  function ehVendaDeLojinhaV4(envelope, texto, modo) {
    const itens = Array.isArray(envelope && envelope.itens) ? envelope.itens : [];
    if (itens.length > 1) return false;
    const cats = itens.length ? (Array.isArray(itens[0].categorias) ? itens[0].categorias : []) : [];
    if (cats.some((c) => ['parcela', 'passaporte', 'matricula', 'mensalidade'].includes(String(c).toLowerCase()))) return false;
    const produto = !!detectarLojinhaProduto(texto);
    if (modo === 'declarada') return cats.includes('lojinha') || (cats.includes('venda') && produto);
    return produto && (cats.length === 0 || cats.some((c) => ['lojinha', 'venda', 'outro'].includes(String(c).toLowerCase())));
  }

  // Card de lojinha pela V4: mesma pendência e mesmo cofre V3 do card singular,
  // SEM fatura (venda não tem). O "pode" continua obrigatório.
  async function abrirFluxoAgentFirstLojinha({ event, grupo, envelope, texto, agora, origemMessageId,
    cartaoModalidade = null, cartaoParcelas = null }) {
    const valor = Number(envelope.valor_total);
    const forma = envelope.forma;
    const produto = detectarLojinhaProduto(texto);
    const itemLojinha = (produto && produto.item) || 'Produto de lojinha';
    let aluno = (Array.isArray(envelope.itens) && envelope.itens[0] && envelope.itens[0].aluno) || null;
    let responsavelFinanceiro = null;
    // Quem vendeu não é o comprador — mesma regra do caminho de foto: rótulo de
    // vendedor ("Venda: Kailane") OU o "aluno" ser quem mandou a mensagem, sem
    // "aluno: X" escrito (a Kailane registrando a própria venda virou
    // "Corda - Kailane" em 31/08).
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grupo.unidade_id); } catch (e) { /* melhor esforço */ }
    // "Venda <Professor>" (06/10/2026): mesmo reconhecimento do caminho de foto.
    const vendedorEquipe = await vendedorDaEquipe(texto, { chatId: event.chatId,
      comprador: _compradorDeclaradoLojinha(texto) });
    {
      const vendedor = _vendedorRotulado(texto);
      const remetente = idEnviou && idEnviou.identificado ? idEnviou.nome : null;
      const declarado = _alunoRotulado(texto);
      const ehDeclarado = !!(aluno && declarado && _mesmaPessoa(declarado, aluno));
      if (aluno && ((vendedor && _mesmaPessoa(aluno, vendedor)) || _ehOVendedor(aluno, vendedorEquipe)
          || (!ehDeclarado && remetente && _mesmaPessoa(aluno, remetente)))) {
        log({ acao: "aluno_descartado_nao_e_aluno", chatId: event.chatId, trilho: "agent_first_lojinha" });
        aluno = null;
      }
    }
    if (aluno) {
      try {
        const rr = await responsavelFn(grupo.unidade_id, aluno);
        if (rr && rr.aluno_nome && _mesmaPessoa(rr.aluno_nome, aluno)) {
          aluno = rr.aluno_nome;
          if (rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, aluno)) responsavelFinanceiro = rr.responsavel_nome;
        }
      } catch (e) { /* melhor esforço: o nome declarado segue */ }
    }
    const descricao = descricaoLojinha(itemLojinha, aluno, vendedorEquipe);
    // Nome que o cadastro não confirmou (rr acima não trocou): mesma pergunta do caminho de foto.
    const sugestaoLojinha = aluno
      ? await sugestaoNomeLojinha({ chatId: event.chatId, unidadeId: grupo.unidade_id, aluno, vendedor: vendedorEquipe })
      : null;
    const textoCard = montarPreview({ unidadeNome: grupo.nome, valor, forma, categoria: 'lojinha', aluno,
      responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta: false, multiplas: false,
      itemLojinha, descricao, sugestaoNome: sugestaoLojinha });
    const origem = origemMessageId || event.messageId;
    const pendencia = {
      previewId: null, unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor, forma, categoria: 'lojinha', aluno, competencia: null, descricao,
      responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta: false, canonica: null,
      itemLojinha, origem, idemKey: `${event.chatId}:${origem}:agent-first-lojinha`,
      vendedor: vendedorEquipe, sugestaoNomeLojinha: sugestaoLojinha,
      enviadoPor: nomeParaCarimbo(idEnviou, event), ts: agora, agentFirstEnvelope: envelope,
    };
    const seguro = await prepararEPublicarPreviewV4({
      event, grupo, texto: textoCard, pendencia,
      result: { acao: 'preview_agent_first_lojinha', valor, categoria: 'lojinha' },
      previewStatus: 'public_preview_sent',
    });
    if (!seguro.ok) return { acao: seguro.motivo };
    const arr = limparVelhos(event.chatId, agora);
    arr.push(pendencia);
    pendentes.set(event.chatId, arr);
    envelopesV4.set(event.chatId, { envelope, ts: agora, previewId: pendencia.previewId });
    if (rascunhosV4.get(event.chatId)) await finalizarRascunhoV4(event.chatId, 'superseded', 'preview_completo_criado');
    log({ acao: 'preview_agent_first_lojinha', chatId: event.chatId, valor, item: itemLojinha, com_aluno: !!aluno });
    return { acao: 'preview_agent_first_lojinha', previewId: pendencia.previewId };
  }

  // Ingresso de evento e uma venda SEM aluno (02/10/2026). A natureza ja foi decidida
  // por sinal explicito (caixa-ingressos.cjs); aqui o valor CONFERIDO (texto/comprovante,
  // nunca o preco) so calcula a quantidade pelo lote vigente. O card e o de sempre e o
  // dinheiro so entra pelo "pode", na mesma RPC sem aluno de cheques/avulsas.
  async function abrirFluxoVendaIngresso({ event, grupo, natureza, valor, forma, agora,
    origemMessageId, cartaoModalidade = null, cartaoParcelas = null }) {
    const sobre = natureza.evento ? ` de *${natureza.evento}*` : '';
    const total = Number(valor) || 0;
    if (!(total > 0)) {
      await sendFn(event.chatId, `Entendi venda de ingresso${sobre}, mas não achei o valor total. Manda numa linha, por exemplo: *2 ingressos LA Session R$ 80 pix*. Nada foi lançado.`);
      log({ acao: 'venda_ingresso_sem_valor', chatId: event.chatId, evento_id: natureza.evento_id });
      return { acao: 'venda_ingresso_sem_valor' };
    }
    if (!forma) {
      await sendFn(event.chatId, `Entendi venda de ingresso${sobre} de *${fmtBRL(total)}*. Me diz a forma: *pix*, *dinheiro*, *cartão* ou *transferência* — manda a venda de novo numa linha. Nada foi lançado.`);
      log({ acao: 'venda_ingresso_sem_forma', chatId: event.chatId, valor: total });
      return { acao: 'venda_ingresso_sem_forma' };
    }
    const res = _ingressosLib.resolverIngresso(natureza, total, { fmtBRL });
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grupo.unidade_id); } catch (e) { /* melhor esforco */ }
    const textoCard = montarPreview({ unidadeNome: grupo.nome, valor: total, forma, categoria: 'venda',
      aluno: null, formaIncerta: false, cartaoModalidade, cartaoParcelas, multiplas: false,
      semAlunoDeclarado: true, entidade: natureza.evento, ingresso: { linhas: res.linhas, descricao: res.descricao } });
    const origem = origemMessageId || event.messageId;
    const pendencia = {
      previewId: null, unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor: total, forma, categoria: 'venda', aluno: null, competencia: null, descricao: res.descricao,
      responsavelFinanceiro: null, cartaoModalidade, cartaoParcelas, formaIncerta: false,
      canonica: null, semAluno: true, entidade: natureza.evento || 'Venda de ingresso',
      ingresso: { evento_id: natureza.evento_id, evento: natureza.evento, setor: natureza.setor,
        preco_unitario: natureza.preco_unitario, lote: natureza.lote, quantidade: res.quantidade, fecha: res.fecha },
      origem, idemKey: `${event.chatId}:${origem}:venda-ingresso`,
      enviadoPor: nomeParaCarimbo(idEnviou, event), ts: agora,
    };
    const seguro = await prepararEPublicarPreviewV4({
      event, grupo, texto: textoCard, pendencia,
      result: { acao: 'preview_venda_ingresso', valor: total, categoria: 'venda', quantidade: res.quantidade },
      previewStatus: 'public_preview_sent',
    });
    if (!seguro.ok) return { acao: seguro.motivo };
    const arr = limparVelhos(event.chatId, agora);
    arr.push(pendencia);
    pendentes.set(event.chatId, arr);
    log({ acao: 'preview_venda_ingresso', chatId: event.chatId, valor: total, quantidade: res.quantidade,
      fecha_com_lote: res.fecha, evento_id: natureza.evento_id, evento_configurado: !!natureza.evento_id });
    return { acao: 'preview_venda_ingresso', previewId: pendencia.previewId };
  }

  // "É venda de ingresso ou da lojinha?" — a Sol pergunta em vez de chutar. O caso
  // original fica guardado; a resposta do mesmo autor (ou citando a pergunta) volta a
  // processá-lo com a resposta anexada, e a resposta decide sem nova pergunta.
  async function perguntarNaturezaVenda({ event, motivo, valor = null, forma = null, guardar = true }) {
    const texto = _ingressosLib.textoPerguntaNatureza(motivo, { valor, forma, fmtBRL });
    let msgId = null;
    try { msgId = await sendFn(event.chatId, texto); } catch (e) { /* sem pergunta, sem estado */ }
    if (guardar && msgId) {
      perguntasNatureza.set(event.chatId, { evento: { ...event }, msgId, ts: Date.now(), motivo,
        autor: String(event.senderPhone || event.senderId || '') });
    }
    log({ acao: 'venda_natureza_perguntada', chatId: event.chatId, motivo, midia: !!event.hasMedia });
    return { acao: 'venda_natureza_perguntada', motivo };
  }

  async function responderPerguntaNatureza(event, agora) {
    const p = perguntasNatureza.get(event.chatId);
    if (!p || event.hasMedia) return null;
    if (agora - p.ts > PERGUNTA_NATUREZA_MS) { perguntasNatureza.delete(event.chatId); return null; }
    const txt = bodyLimpo(event.body);
    if (!txt || casarPode(txt).pode) return null;
    const citou = !!(event.quotedMessageId && event.quotedMessageId === p.msgId);
    const mesmoAutor = !event.quotedMessageId && p.autor
      && p.autor === String(event.senderPhone || event.senderId || '');
    if (!citou && !mesmoAutor) return null;
    if (!_ingressosLib.ehRespostaNatureza(txt, { citou })) return null;
    perguntasNatureza.delete(event.chatId);
    const orig = p.evento;
    vistos.delete(`${orig.chatId}:${orig.messageId}`);
    const ev = { ...orig, body: [bodyLimpo(orig.body), txt].filter(Boolean).join(' · '),
      _respostaNatureza: txt, __handleTopo: true };
    delete ev._legendaTardiaRec;
    log({ acao: 'venda_natureza_respondida', chatId: event.chatId, motivo: p.motivo, midia: !!orig.hasMedia });
    return _handleInterno(ev, agora);
  }

  async function abrirFluxoAgentFirstSingular({ event, grupo, intent, agora, origemMessageId,
    resolvidoPronto, agentFirstEnvelope, supersedePreviewId = null,
    cartaoModalidade = null, cartaoParcelas = null }) {
    const arr = limparVelhos(event.chatId, agora);
    const item = resolvidoPronto && Array.isArray(resolvidoPronto.itens) ? resolvidoPronto.itens[0] : null;
    if (!item || !item.aluno_nome || !(Number(item.valor) > 0) || !intent.forma || !intent.categoria) {
      await limparEstadoDaOrigemV4(event.chatId, origemMessageId || event.messageId, 'singular_incompleto');
      return { acao: 'agent_first_singular_incompleto' };
    }
    const semVinculoFatura = item.sem_vinculo_fatura === true
      && !item.canonical_fatura_id
      && !(item.fatura && item.fatura.canonical_fatura_id);
    const fatura = item.fatura ? {
      ...item.fatura,
      canonical_fatura_id: item.canonical_fatura_id || item.fatura.canonical_fatura_id || null,
      descricao: item.descricao || item.fatura.descricao || null,
      competencia: item.fatura.competencia || (item.competencia ? String(item.competencia).split('/').reverse().join('-') + '-01' : null),
      valor_da_parcela: item.fatura.valor_da_parcela || item.fatura.valor_pago || item.fatura.valor_hoje || Number(item.valor),
    } : {
      canonical_fatura_id: item.canonical_fatura_id || null,
      tipo_fatura: semVinculoFatura ? 'passaporte_taxa_matricula' : null,
      descricao: item.descricao || (semVinculoFatura ? 'Passaporte promocional' : null),
      competencia: item.competencia || null,
      valor_da_parcela: Number(item.valor),
      status: semVinculoFatura ? 'declarada_sem_fatura' : null,
      sem_vinculo_fatura: semVinculoFatura,
    };
    const canonica = { ok: true, fatura };
    const texto = montarPreview({
      unidadeNome: grupo.nome, valor: Number(item.valor), forma: intent.forma,
      categoria: intent.categoria, aluno: item.aluno_nome, competencia: item.competencia || null,
      responsavelFinanceiro: item.responsavel_financeiro || null, canonica,
      cartaoModalidade, cartaoParcelas, formaIncerta: false, multiplas: false,
    });
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grupo.unidade_id); } catch (e) { /* melhor esforco */ }
    const origem = origemMessageId || event.messageId;
    const pendencia = {
      previewId: null, unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor: Number(item.valor), forma: intent.forma, categoria: intent.categoria,
      aluno: item.aluno_nome, competencia: item.competencia || null,
      descricao: item.descricao || null, responsavelFinanceiro: item.responsavel_financeiro || null,
      cartaoModalidade, cartaoParcelas, formaIncerta: false, canonica,
      origem, idemKey: `${event.chatId}:${origem}:agent-first-singular`,
      enviadoPor: nomeParaCarimbo(idEnviou, event), ts: agora,
      agentFirstEnvelope,
    };
    const seguro = await prepararEPublicarPreviewV4({
      event, grupo, texto, pendencia,
      result: { acao: 'preview_agent_first_singular', valor: pendencia.valor, categoria: pendencia.categoria },
      previewStatus: supersedePreviewId ? 'awaiting_supersede' : 'public_preview_sent',
    });
    if (!seguro.ok) return { acao: seguro.motivo };

    if (supersedePreviewId) {
      const velhas = arr.filter((p) => p.previewId === supersedePreviewId);
      if (velhas.length !== 1) {
        await finalizarPreviewSeguroV3({ alvo: pendencia, status: 'rejected', motivo: 'preview_anterior_nao_unico' });
        return { acao: 'preview_correcao_bloqueada' };
      }
      const fim = await finalizarPreviewSeguroV3({
        alvo: velhas[0], status: 'superseded', substituto: pendencia, motivo: 'correcao_agent_first',
      });
      if (!fim || !fim.ok) return { acao: 'preview_correcao_bloqueada', preservarEnvelope: true };
      arr.splice(arr.indexOf(velhas[0]), 1);
    }
    arr.push(pendencia);
    pendentes.set(event.chatId, arr);
    log({ acao: 'preview_agent_first_singular', chatId: event.chatId, valor: pendencia.valor, categoria: pendencia.categoria });
    return { acao: 'preview_agent_first_singular', previewId: pendencia.previewId };
  }

  // 🔴 CHEQUES DO LOTE DE DEPÓSITO → CAIXA DA SOL (26/09/2026, decisão do Alf).
  // Os itens chegam RESOLVIDOS pelo módulo de cheques (caixa-cheques.cjs): leitura
  // provada pela CMC-7, fatura real do espelho, sem duplicidade no caixa. Daqui para
  // baixo é o card de sempre, sem trilho paralelo: 2+ cheques = lote
  // (abrirFluxoMultiAluno com resolvidoPronto — as RPCs de lote exigem 2 itens),
  // 1 cheque = lançamento simples. Forma 'cheque'. O número do cheque vai na
  // descrição: é por ele que o Super Folha liga o depósito do banco.
  async function abrirCardCheques({ event, grp, itens, agora, textoPronto = null }) {
    const total = Math.round(itens.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100;
    const cats = [...new Set(itens.map((x) => x.categoria))];
    const categoria = cats.length === 1 ? cats[0] : 'parcela';
    if (itens.length >= 2) {
      return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: 'lote de cheques', textoHumano: '',
        intent: { ok: true, valor_total: total, forma: 'cheque', categoria, itens }, agora,
        origemMessageId: event.messageId, resolvidoPronto: { ok: true, itens },
        textoPronto, tetoItens: 60 });
    }
    const it = itens[0];
    let texto = textoPronto || montarPreview({ unidadeNome: grp.nome, valor: it.valor, forma: 'cheque', categoria: it.categoria,
      aluno: it.aluno_nome, competencia: it.competencia, parcela: null, confiancaBaixa: false,
      responsavelFinanceiro: it.responsavel_financeiro, formaIncerta: false, cartaoModalidade: null, cartaoParcelas: null,
      multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null, canonica: null, duplicata: null,
      quitacao: null, faturaIndisponivel: false, composto: null, bloqueiaLancamento: false });
    if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
    const previewId = await sendFn(event.chatId, texto);
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* melhor esforço */ }
    const pend = {
      previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor: it.valor, forma: 'cheque', categoria: it.categoria,
      aluno: it.aluno_nome, competencia: it.competencia,
      descricao: [it.descricao, it.complemento_descricao].filter(Boolean).join(' · ') || null,
      cheque_numero: it.cheque_numero || null, cheque_banco: it.cheque_banco || null, cheque_bom_para: it.cheque_bom_para || null,
      parcela: null, responsavelFinanceiro: it.responsavel_financeiro || null, cartaoModalidade: null, cartaoParcelas: null,
      formaIncerta: false, quitacao: null, multiplas: false, composto: null, itemLojinha: null, bloqueiaLancamento: false,
      faturaIndisponivel: false, bloqueiaFonteIndisponivel: false,
      canonica: it.canonical_fatura_id ? { ok: true, fatura: { canonical_fatura_id: it.canonical_fatura_id } } : null,
      faturaIdsCheque: Array.isArray(it.fatura_ids) && it.fatura_ids.length >= 2 ? it.fatura_ids.slice() : null,
      enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey: `${event.chatId}:${event.messageId}:cheque`,
      origem: event.messageId, msgIds: [previewId], autorPhone: event.senderPhone || null, autorId: event.senderId || null,
      toquePor: String(event.senderPhone || event.senderId || ''), toqueTs: agora, ts: agora,
    };
    const v3 = await registrarPreviewPublicoV3({ event, grupo: grp, previewId, texto, pendencia: pend,
      result: { acao: 'preview_cheque', valor: it.valor } });
    if (v3LedgerAtivo && (!v3 || !v3.preview_id)) {
      await sendFn(event.chatId, '⚠️ Não deixei esse cheque pendente porque o preview seguro não foi registrado. Não responda *pode*; reenvia o lote em instantes.');
      log({ acao: 'preview_cheque_sem_v3', chatId: event.chatId });
      return { acao: 'preview_cheque_sem_v3' };
    }
    if (v3 && v3.preview_id) { pend.v3PreviewId = v3.preview_id; pend.v3PreviewHash = v3.preview_hash || null; }
    const arr = limparVelhos(event.chatId, agora);
    arr.push(pend);
    pendentes.set(event.chatId, arr);
    log({ acao: 'preview_cheque_enviado', chatId: event.chatId, valor: it.valor });
    return { acao: 'preview_cheque_enviado', previewId };
  }

  // Publica o card de um lote de cheques: o principal (lote ou simples) e os extras
  // (cheque de várias parcelas fora do lote). Sem ✅ no principal, a lista sai como
  // mensagem comum. Toda mensagem fica ligada ao lote (respostas e citações).
  async function publicarCartaoCheques({ event, grp, lote, agora, cartao, acaoBase = 'cheques_lote_lido' }) {
    let principal = null;
    if (cartao.itensCaixa.length) {
      principal = await abrirCardCheques({ event, grp, itens: cartao.itensCaixa, agora, textoPronto: cartao.texto });
      if (principal && principal.previewId && cheques.vincularMensagem) cheques.vincularMensagem(lote, principal.previewId);
    } else {
      const id = await sendFn(event.chatId, cartao.texto);
      if (id && cheques.vincularMensagem) cheques.vincularMensagem(lote, id, null);
      if (lote) lote.pendenteCard = null;
    }
    for (const ex of cartao.extras || []) {
      const r = await abrirCardCheques({ event: { ...event, messageId: `${event.messageId}:x${ex.itens[0].cheque_numero}` },
        grp, itens: ex.itens, agora, textoPronto: ex.texto });
      if (r && r.previewId && cheques.vincularMensagem) cheques.vincularMensagem(lote, r.previewId, ex.chaves);
      if (!principal) principal = r;
    }
    return { acao: (principal && principal.acao) || acaoBase, previewId: principal && principal.previewId };
  }

  // 🔴 REPUBLICAR O CARD DO LOTE (06/10/2026). Toda mudança no lote (a equipe disse
  //    de quem é um cheque, confirmou número/valor, marcou conferência), o PDF
  //    reenviado e o "pode" num card vencido republicam o card a partir do ESTADO.
  //    Os cards antigos do lote morrem ANTES (preview V3 'rejected' + fora das
  //    pendências): nunca há dois cards aprováveis com o mesmo cheque.
  async function republicarLoteCheques({ event, grp, lote, aviso = null, agora = Date.now() }) {
    const r0 = await cheques.redecidir(event.chatId, lote);
    if (!r0.ok) {
      await sendFn(event.chatId, '⚠️ Não consegui conferir as faturas agora, então não refiz o card dos cheques. Nada foi lançado; tenta de novo em instantes.');
      log({ acao: 'cheques_republicar_fonte_indisponivel', chatId: event.chatId, motivo: r0.motivo });
      return { acao: 'cheques_republicar_fonte_indisponivel' };
    }
    const ids = new Set(cheques.cardsDoLote(lote));
    const arr = limparVelhos(event.chatId, agora);
    const velhas = arr.filter((p) => ids.has(p.previewId));
    for (const v of velhas) {
      await finalizarPreviewSeguroV3({ alvo: v, status: 'rejected', motivo: 'cheques_card_atualizado' });
      arr.splice(arr.indexOf(v), 1);
    }
    pendentes.set(event.chatId, arr);
    cheques.esquecerCards(lote);
    const cartao = cheques.cartaoDoLote(lote, { avisos: aviso ? [aviso] : [],
      cabecalho: `🧾 *Lote de cheques — ${grp.nome}* (atualizado)` });
    if (cartao.chaves.size) lote.pendenteCard = { chaves: cartao.chaves, ts: agora };
    log({ acao: 'cheques_card_republicado', chatId: event.chatId, cards_antigos: velhas.length,
      decisoes: lote.itens.map((it) => it.decisao) });
    return publicarCartaoCheques({ event, grp, lote, agora, cartao, acaoBase: 'cheques_lista_republicada' });
  }

  // Porta das ferramentas `cheques_*` (executor da ponte → aqui). O módulo valida e
  // muda o estado; aqui o card é republicado. Devolve o que a ferramenta mostra ao
  // agente (estado do lote + resultado de cada pedido, com motivo humano).
  async function ferramentaCheques(acao, { event, args = {}, quem = null }) {
    const grp = grupos[event.chatId];
    if (!cheques || !cheques.ferramenta) return { acao: 'cheques_indisponivel', motivo: 'cheques_indisponivel' };
    const r = await cheques.ferramenta(acao, { chatId: event.chatId, quotedId: event.quotedMessageId || null,
      args, quem, textoOriginal: String(args.p_texto_original || '') });
    if (!r.ok) return { acao: 'cheques_ferramenta_recusada', motivo: r.motivo, resultados: r.resultados || [] };
    if (acao === 'estado') return { acao: 'cheques_estado', estado: r.estado };
    if (!r.mudou) return { acao: 'cheques_nada_mudou', motivo: 'cheques_nada_mudou', resultados: r.resultados, estado: r.estado };
    const pub = await republicarLoteCheques({ event, grp, lote: r.lote, agora: Date.now() });
    return { ...pub, resultados: r.resultados, estado: r.estado };
  }

  function chequesConversa(event, opcoes) {
    try { return cheques && cheques.conversa ? cheques.conversa(event, opcoes) : null; } catch (_) { return null; }
  }
  function citaLoteCheques(chatId, quotedId) {
    try { return !!(cheques && cheques.citaLote && cheques.citaLote(chatId, quotedId)); } catch (_) { return false; }
  }

  // ---- SUGESTÃO DE NOME PARECIDO (06/10/2026) --------------------------------
  // Quando o resolver recusa um item por nome (`aluno_nao_encontrado` ou
  // `aluno_baixa_confianca`), procura alunos PARECIDOS da mesma unidade. Não
  // escolhe nada: devolve a lista para a Sol perguntar (1) ou listar (2+).
  // `nome_ambiguo` fica de fora de propósito: lá o primeiro nome BATEU com
  // várias pessoas e a recusa já lista os homônimos.
  const MOTIVOS_SUGESTAO_NOME = new Set(['aluno_nao_encontrado', 'aluno_baixa_confianca']);
  const _nomeNorm = (s) => _normConf(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  async function sugestaoDeNomeMulti({ event, grupo, resolvido, intent }) {
    if (!resolvido || !MOTIVOS_SUGESTAO_NOME.has(resolvido.motivo)) return null;
    const itens = intent && Array.isArray(intent.itens) ? intent.itens : [];
    const digitadoRpc = _nomeNorm(resolvido.aluno_nome);
    if (!itens.length || !digitadoRpc) return null;
    // O item recusado precisa ser UM só, e o mesmo que a RPC nomeou: pela ordem
    // (1-based, a do array enviado) e, na falta dela, pelo nome digitado.
    let indice = Number(resolvido.ordem) - 1;
    if (!(indice >= 0 && indice < itens.length && _nomeNorm(itens[indice] && itens[indice].aluno_nome) === digitadoRpc)) {
      const iguais = itens.map((it, i) => (_nomeNorm(it && it.aluno_nome) === digitadoRpc ? i : -1)).filter((i) => i >= 0);
      if (iguais.length !== 1) return null;
      indice = iguais[0];
    }
    let res = null;
    try { res = await sugerirAlunoFn({ unidade_id: grupo.unidade_id, nome: itens[indice].aluno_nome }); }
    catch (e) { log({ acao: 'sugestao_nome_erro', chatId: event.chatId, erro: String(e && e.message) }); return null; }
    if (!res || res.ok !== true || !Array.isArray(res.candidatos)) return null;
    // Nunca sugere quem já é OUTRO item do mesmo comprovante: irmãos pagam
    // juntos, e "É o Gabriel?" para a Gabriela lançaria o Gabriel duas vezes.
    const outros = itens.filter((_, i) => i !== indice).map((it) => _nomeNorm(it && it.aluno_nome)).filter(Boolean);
    const _mesmoQueOutro = (nome) => {
      const n = _nomeNorm(nome); const t = n.split(' ');
      return outros.some((o) => { const u = o.split(' ');
        return o === n || (u.length >= 2 && t[0] === u[0] && t[t.length - 1] === u[u.length - 1]); });
    };
    const candidatos = res.candidatos
      .map((c) => String((c && c.aluno_nome) || '').trim())
      .filter((nome) => nome && _nomeNorm(nome) !== digitadoRpc && !_mesmoQueOutro(nome))
      .filter((nome, i, arr) => arr.findIndex((x) => _nomeNorm(x) === _nomeNorm(nome)) === i)
      .slice(0, 4);
    log({ acao: 'sugestao_nome_candidatos', chatId: event.chatId, motivo: resolvido.motivo, candidatos: candidatos.length });
    if (!candidatos.length) return null;
    return { indice, digitado: String(itens[indice].aluno_nome).trim(), candidatos };
  }

  // ---- VENDEDOR DA EQUIPE (06/10/2026, Barra) --------------------------------
  // "Venda <Nome>" / "venda prof <Nome>" / "vendido por <Nome>" só vira VENDEDOR
  // quando o nome casa com UMA pessoa ativa de professores/colaboradores e não é
  // o comprador. Sem cadastro, sem vendedor: nada muda (o caminho antigo vale).
  let _equipeCache = null;
  async function _equipeAtiva() {
    const agora = Date.now();
    if (_equipeCache && agora - _equipeCache.ts < 10 * 60 * 1000) return _equipeCache.lista;
    const lista = await equipeFn();
    if (Array.isArray(lista)) _equipeCache = { ts: agora, lista };
    return Array.isArray(lista) ? lista : [];
  }
  async function vendedorDaEquipe(texto, { chatId = null, comprador = null } = {}) {
    const citados = _vendedoresCitados(texto);
    if (!citados.length) return null;
    let equipe = [];
    try { equipe = await _equipeAtiva(); }
    catch (e) { log({ acao: 'vendedor_equipe_erro', chatId, erro: String(e && e.message) }); return null; }
    for (const c of citados) {
      if (comprador && _mesmaPessoa(c.declarado, comprador)) continue;
      // "Venda Fulano" solto, sem comprador declarado, pode ser o próprio comprador.
      if (!c.explicito && !comprador) continue;
      const pessoas = new Map();
      for (const e of equipe) {
        if (!e || !e.nome || !_casaNomeEquipe(c.declarado, e.match || e.nome)) continue;
        const k = _normConf(e.nome).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const ant = pessoas.get(k);
        pessoas.set(k, { nome: e.nome, prof: !!(e.prof || (ant && ant.prof)) });
      }
      if (pessoas.size !== 1) {
        if (pessoas.size > 1) log({ acao: 'vendedor_ambiguo', chatId, candidatos: pessoas.size });
        continue;
      }
      const [p] = [...pessoas.values()];
      if (comprador && _mesmaPessoa(p.nome, comprador)) continue;
      const v = { declarado: c.declarado, nome: p.nome, prof: !!(p.prof || c.prof) };
      log({ acao: 'vendedor_reconhecido', chatId, prof: v.prof });
      return v;
    }
    return null;
  }
  const _ehOVendedor = (nome, v) => !!(v && nome && (_mesmaPessoa(nome, v.declarado) || _mesmaPessoa(nome, v.nome)));

  // Lojinha com aluno digitado diferente do cadastro: a mesma RPC da sugestão do
  // multi (só leitura). 1 candidato = pergunta "É X?"; 2+ = lista sem escolher.
  // Qualquer falha = null (o card sai como sempre saiu).
  async function sugestaoNomeLojinha({ chatId, unidadeId, aluno, vendedor }) {
    if (!aluno || !nomePlausivel(aluno)) return null;
    let res = null;
    try { res = await sugerirAlunoFn({ unidade_id: unidadeId, nome: aluno }); }
    catch (e) { log({ acao: 'sugestao_nome_erro', chatId, erro: String(e && e.message), trilho: 'lojinha' }); return null; }
    if (!res || res.ok !== true || !Array.isArray(res.candidatos)) return null;
    const dig = _nomeNorm(aluno);
    const candidatos = res.candidatos
      .map((c) => String((c && c.aluno_nome) || '').trim())
      .filter((n) => n && _nomeNorm(n) !== dig && !_ehOVendedor(n, vendedor))
      .filter((n, i, arr) => arr.findIndex((x) => _nomeNorm(x) === _nomeNorm(n)) === i)
      .slice(0, 4);
    log({ acao: 'sugestao_nome_candidatos', chatId, trilho: 'lojinha', candidatos: candidatos.length });
    return candidatos.length ? { digitado: String(aluno).trim(), candidatos } : null;
  }

  // A resposta "sim" à pergunta "É Fulana?". Reaproveita a revisão multi que já
  // existe (`pendentes`, mesma janela, mesmo "descarta"); a pergunta só guarda
  // o item e o nome sugerido. Devolve o alvo, `{ outroAutor }` ou null.
  // ⚠️ Só QUEM MANDOU o comprovante confirma — citando a pergunta ou não. "Sim"
  //    é a palavra mais comum de um grupo; de outra pessoa, sem citar, não é
  //    sequer olhado (Barra 26/09: "Sim" alheio virou divisão nove vezes).
  const _ehSimDeSugestao = (txt) => /^(sim|s|isso|isso mesmo|exato|exatamente|correto|confirmo|e (ela|ele|essa|esse)|sim (e|e (ela|ele|essa|esse)|isso|isso mesmo|exato|correto|pode seguir|segue)|pode seguir|segue)$/
    .test(_normConf(txt).replace(/^@?sol\b\s*[,;:-]?\s*/, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim());
  function sugestaoNomeDaResposta(event, agora) {
    if (!event || event.hasMedia) return null;
    const txt = bodyLimpo(event.body);
    if (!txt || txt.length > 40 || !_ehSimDeSugestao(txt)) return null;
    // Lojinha (06/10/2026): o card singular com "É X?" e UM candidato também
    // espera este "sim" — mesma régua de autor, mesma janela.
    const abertas = limparVelhos(event.chatId, agora)
      .filter((p) => (p.tipoOperacao === 'manual_review_multi_student' && p.sugestaoNome)
        || (!p.tipoOperacao && p.sugestaoNomeLojinha && p.sugestaoNomeLojinha.candidatos.length === 1));
    if (!abertas.length) return null;
    const falante = String(event.senderPhone || event.senderId || '');
    const doAutor = (p) => !!falante && [p.autorPhone, p.autorId].some((x) => x && String(x) === falante);
    if (event.quotedMessageId) {
      const q = String(event.quotedMessageId);
      const alvo = abertas.find((p) => (p.sugestaoNome && p.sugestaoNome.msgId === q) || p.previewId === q
        || (Array.isArray(p.msgIds) && p.msgIds.includes(q)) || p.origem === q) || null;
      if (!alvo) return null;
      return doAutor(alvo) ? { alvo } : { alvo, outroAutor: true };
    }
    const minhas = abertas.filter(doAutor);
    return minhas.length === 1 ? { alvo: minhas[0] } : null;
  }
  async function responderSugestaoNome(event, agora) {
    const r = sugestaoNomeDaResposta(event, agora);
    if (!r) return null;
    const { alvo } = r;
    if (r.outroAutor) {
      await sendFn(event.chatId, 'Quem confirma o nome é quem mandou o comprovante — fico aguardando o *sim* dele(a).');
      log({ acao: 'sugestao_nome_sim_de_outro_autor', chatId: event.chatId });
      return { acao: 'sugestao_nome_sim_de_outro_autor' };
    }
    const grp = grupos[event.chatId];
    if (alvo.sugestaoNomeLojinha) return confirmarSugestaoLojinha(event, alvo, grp, agora);
    const sug = alvo.sugestaoNome;
    const intent = sug.intent || {};
    const itens = Array.isArray(intent.itens) ? intent.itens : [];
    if (!grp || !itens[sug.indice]) return null;
    // Consome a pergunta ANTES de refazer: um segundo "sim" não reabre nada.
    pendentes.set(event.chatId, limparVelhos(event.chatId, agora).filter((p) => p !== alvo));
    const intentConfirmado = { ...intent,
      itens: itens.map((it, i) => (i === sug.indice ? { ...it, aluno_nome: sug.sugerido } : it)) };
    log({ acao: 'sugestao_nome_confirmada', chatId: event.chatId, ordem: sug.indice + 1 });
    // Mesmo caminho do complemento da divisão: o resolver roda de novo, agora
    // com o nome do CADASTRO, e só um preview + "pode" lança.
    return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: alvo.multiTexto,
      textoHumano: alvo.multiTextoHumano, intent: intentConfirmado, agora,
      origemMessageId: alvo.origem, evidenceEnvelope: alvo.evidenceEnvelope || null });
  }

  // "sim" do autor ao "É X?" da lojinha: troca o aluno pelo do CADASTRO, refaz
  // descrição e responsável, e manda o card de novo. Só o "pode" lança.
  async function confirmarSugestaoLojinha(event, alvo, grp, agora) {
    if (!grp) return null;
    const sug = alvo.sugestaoNomeLojinha;
    const sugerido = sug.candidatos[0];
    alvo.sugestaoNomeLojinha = null;
    alvo.aluno = sugerido;
    let responsavelFinanceiro = null;
    try {
      const rr = await responsavelFn(alvo.unidade_id, sugerido);
      if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, sugerido)) {
        log({ acao: 'responsavel_rejeitado_nome_diverge', chatId: event.chatId });
      } else if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, sugerido)) responsavelFinanceiro = rr.responsavel_nome;
    } catch (e) { /* melhor esforço */ }
    alvo.responsavelFinanceiro = responsavelFinanceiro;
    alvo.descricao = descricaoLojinha(alvo.itemLojinha, sugerido, alvo.vendedor || null);
    alvo.ts = agora;
    let texto = 'Ajustei o aluno para o nome do cadastro:\n\n' + montarPreview({
      unidadeNome: alvo.nome, valor: alvo.valor, forma: alvo.forma, categoria: alvo.categoria,
      aluno: alvo.aluno, competencia: alvo.competencia, responsavelFinanceiro,
      formaIncerta: alvo.formaIncerta, cartaoModalidade: alvo.cartaoModalidade, cartaoParcelas: alvo.cartaoParcelas,
      multiplas: false, itemLojinha: alvo.itemLojinha, valorConflito: alvo.valorConflito,
      valorBaixaConfianca: alvo.valorBaixaConfianca, descricao: alvo.descricao });
    if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
    alvo.previewId = await sendFn(event.chatId, texto);
    (alvo.msgIds = alvo.msgIds || []).push(alvo.previewId);
    log({ acao: 'sugestao_nome_confirmada', chatId: event.chatId, trilho: 'lojinha' });
    if (!await vincularPreviewRemontadoV3({ event, grupo: grp, pendencia: alvo, previewId: alvo.previewId, texto,
      result: { acao: 'preview_aluno_corrigido', aluno: alvo.aluno } })) {
      return { acao: 'preview_aluno_corrigido_sem_v3', aluno: alvo.aluno };
    }
    return { acao: 'sugestao_nome_lojinha_confirmada', aluno: alvo.aluno };
  }

  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, textoHumano, intent, agora,
    origemMessageId, resolvidoPronto = null, agentFirstEnvelope = null,
    evidenceEnvelope = null, supersedePreviewId = null, textoPronto = null, tetoItens = null,
    adiantamento = null }) {
    const arr = limparVelhos(event.chatId, agora);
    // Janela de reenvio: OCR lento (frequente, ~45s de timeout) leva a equipe a mandar o
    // MESMO comprovante de novo. Sem isto, cada reenvio empilha outra pendencia MANUAL
    // com o mesmo valor -- e a correcao seguinte, sem citar um card especifico, fica sem
    // como saber qual delas corrigir (2 candidatas = nenhuma escolhida, mensagem cai no
    // vazio). 15 min cobre o padrao real observado (2 reenvios em ~4 min).
    const DEDUP_MULTI_JANELA_MS = 15 * 60 * 1000;
    const colocarEmRevisao = async (motivo, extra = {}) => {
      const pendencia = {
        tipoOperacao: 'manual_review_multi_student', unidade_id: grupo.unidade_id, nome: grupo.nome,
        multiTexto: textoFonte, multiTextoHumano: textoHumano || null,
        valor: (intent && (intent.valor_total || intent.total)) || extra.valor || null,
        forma: intent && intent.forma || extra.forma || null, categoria: intent && intent.categoria || extra.categoria || null,
        origem: origemMessageId || event.messageId, idemKey: `${event.chatId}:${origemMessageId || event.messageId}:multi`,
        ts: agora, motivoMulti: motivo, evidenceEnvelope,
        // Dono da revisão: só ele completa a divisão sem citar o card (26/09).
        autorPhone: event.senderPhone || null, autorId: event.senderId || null, msgIds: [],
      };
      const duplicada = pendencia.valor != null && arr.find((p) =>
        p.tipoOperacao === 'manual_review_multi_student'
        && (agora - p.ts) < DEDUP_MULTI_JANELA_MS
        && p.valor != null && Math.abs(Number(p.valor) - Number(pendencia.valor)) < 0.01);
      if (duplicada) {
        log({ acao: 'manual_review_multi_student_dedup', chatId: event.chatId, valor: pendencia.valor });
        arr.splice(arr.indexOf(duplicada), 1, pendencia);
      } else {
        arr.push(pendencia);
      }
      pendentes.set(event.chatId, arr);
      return pendencia;
    };
    if (!intent || !intent.ok) {
      const _rev = await colocarEmRevisao(intent && intent.motivo || 'itens_incompletos');
      _rev.msgIds.push(await sendFn(event.chatId, '⚠️ Entendi que este comprovante é de mais de um aluno. Não vou escolher um deles nem dividir o total sozinho. Manda cada aluno com seu valor, por exemplo:\n• João — R$ 360\n• Pedro — R$ 360'));
      log({ acao: 'manual_review_multi_student', chatId: event.chatId, motivo: intent && intent.motivo || 'itens_incompletos' });
      return { acao: 'manual_review_multi_student' };
    }
    if (!intent.forma) {
      await colocarEmRevisao('forma_ausente');
      await sendFn(event.chatId, '⚠️ Entendi os dois alunos e a divisão, mas falta a forma de pagamento. Me diz: pix, dinheiro, cartão, cheque ou transferência.');
      return { acao: 'manual_review_multi_student' };
    }
    // Divisao DECLARADA prova o valor, nao o desconto. A excecao sem fatura so
    // viaja com a flag quando o episodio traz o protocolo deterministico de
    // autorização. Modelo, OCR e soma nunca autorizam.
    const _autorizacaoDesconto = extrairAutorizacaoDescontoProtocolada(textoHumano || '');
    const _valorNoTextoHumano = (v) => {
      const n = Number(v);
      // textoFonte carrega o OCR — numero que so existe no RECIBO nao e'
      // declaracao humana (furaria o fail-closed do vinculo de fatura).
      const _baseHumana = textoHumano || textoFonte;
      if (!n || !_baseHumana) return false;
      const cents = n.toFixed(2).replace('.', ',');
      const milhar = cents.replace(/\B(?=(\d{3})+(?=,))/g, '.');
      const inteiro = String(Math.round(n));
      return String(_baseHumana).includes(cents) || String(_baseHumana).includes(milhar)
        || new RegExp('(^|[^0-9,])' + inteiro + '([^0-9,]|$)').test(String(_baseHumana));
    };
    const itensParaResolver = (intent.itens || []).map((it) =>
      (_autorizacaoDesconto.ok && _valorNoTextoHumano(it && it.valor))
        ? { ...it, declarado_pelo_humano: true, desconto_negociado_explicito: true }
        : { ...it, declarado_pelo_humano: false, desconto_negociado_explicito: false });
    // 🔴 TETO EXPLICITO, COM RECUSA IMEDIATA (09/09/2026).
    //
    // O resolver custa ~1 envelope de faturas por chamada mais um custo por
    // aluno. Acima de um certo N a chamada estoura o `statement_timeout` e a
    // consultora fica esperando para receber "fonte indisponivel" — o pior dos
    // mundos: demora E nao lanca. Recusar na hora, dizendo o que fazer, e mais
    // honesto que expirar depois de 45s.
    //
    // ⚠️ O numero vem do BENCHMARK, nao de palpite, e mora em env var para
    //    poder subir sem deploy quando a medicao mudar. Uso real medido ate
    //    hoje: 13 lotes de 2 itens e 1 de 3 — o teto nao aperta a operacao.
    // ⚠️ Isto NAO substitui o conserto de escala; e a rede enquanto ele nao
    //    estiver promovido, e depois dele continua valendo como limite honesto.
    // ⚠️ `tetoItens` só vem do lote de CHEQUES (26/09): ele chega com as faturas já
    //    resolvidas (resolvidoPronto) e não paga o resolver que este teto protege; o
    //    validador do "pode" lê o envelope UMA vez. Lote real: 10-15 cheques.
    const _tetoAlunos = tetoItens || Math.max(2, Number(process.env.SOL_CAIXA_MAX_ALUNOS_LOTE || 12));
    if (itensParaResolver.length > _tetoAlunos) {
      await colocarEmRevisao('acima_do_teto');
      await sendFn(event.chatId,
        `⚠️ São *${itensParaResolver.length} alunos* num comprovante só, e acima de `
        + `${_tetoAlunos} eu não consigo confirmar todas as faturas a tempo — ia te `
        + `deixar esperando para no fim dizer que não deu.

`
        + `Me manda em partes: um comprovante (ou uma divisão) por vez, até `
        + `${_tetoAlunos} alunos em cada.
_Não lanço nada pela metade._`);
      log({ acao: 'multi_acima_do_teto', chatId: event.chatId,
            itens: itensParaResolver.length, teto: _tetoAlunos });
      return { acao: 'manual_review_multi_student' };
    }

    // ⚠️ `resolvidoPronto` e o caminho AGENT-FIRST: quem ja resolveu foi o
    //    orquestrador do envelope (pagador -> pessoas -> faturas -> combinacao
    //    unica). Daqui para baixo NADA muda — preview, cofre V3, aprovacao
    //    humana e lote atomico sao os mesmos. Duplicar esse trecho para o
    //    caminho novo seria criar a segunda fonte de verdade do lancamento.
    let resolvido = resolvidoPronto || null;
    if (!resolvido) {
      try {
        resolvido = await resolverMultiFn({ unidade_id: grupo.unidade_id, itens: itensParaResolver, valor_total: intent.valor_total });
      } catch (e) {
        log({ acao: 'resolver_multi_aluno_erro', chatId: event.chatId, erro: String(e && e.message) });
      }
    }
    if (!resolvido || !resolvido.ok || !Array.isArray(resolvido.itens)) {
      const _revisao = await colocarEmRevisao(resolvido && resolvido.motivo || 'itens_nao_validados');
      // 🔴 NOME QUASE CERTO NÃO É BECO SEM SAÍDA (06/10/2026, caso CG de 05/10).
      //    Um "z" a mais no primeiro nome e a Sol só dizia "confere o nome
      //    completo" — a equipe, que via o nome certo, travou 3x e descartou.
      //    Com UM aluno parecido na unidade, ela PERGUNTA; o "sim" de quem mandou
      //    refaz a resolução com o nome do cadastro (mesma régua, mesmo preview,
      //    mesmo "pode"). Com 2+ parecidos ela lista até 3 e NÃO escolhe.
      // ⚠️ Só no caminho em que ESTA função chamou o resolver: `resolvidoPronto`
      //    (agent-first/cheques) e adiantamento têm estado próprio que o "sim"
      //    não sabe reconstruir — lá a mensagem antiga continua valendo.
      const _sugestao = (!resolvidoPronto && !adiantamento)
        ? await sugestaoDeNomeMulti({ event, grupo, resolvido, intent }) : null;
      if (_sugestao && _sugestao.candidatos.length === 1) {
        const _n = Array.isArray(intent.itens) ? intent.itens.length : 0;
        const _seguirCom = _n === 2 ? 'os dois' : (_n > 2 ? `os ${_n}` : 'o lançamento');
        const _sugerido = _sugestao.candidatos[0];
        const _idPergunta = await sendFn(event.chatId,
          `⚠️ Entendi a divisão, mas não achei *${_sugestao.digitado}* no cadastro desta unidade. `
          + `É *${_sugerido}*?\nResponde *sim* que eu sigo com ${_seguirCom}.\n`
          + '_Não lanço nada sem você confirmar._');
        if (Array.isArray(_revisao.msgIds)) _revisao.msgIds.push(_idPergunta);
        _revisao.sugestaoNome = {
          indice: _sugestao.indice, digitado: _sugestao.digitado, sugerido: _sugerido,
          intent: JSON.parse(JSON.stringify(intent)), msgId: _idPergunta || null, ts: agora,
        };
        // ⚠️ Log sem nomes: só o motivo e a posição do item.
        log({ acao: 'sugestao_nome_perguntada', chatId: event.chatId,
              motivo: resolvido && resolvido.motivo, ordem: _sugestao.indice + 1 });
        return { acao: 'sugestao_nome_perguntada' };
      }
      // 02/09: a mesma legenda falhou as 16:23 e passou as 16:50 — o espelho do
      // Emusys ainda nao tinha as faturas como PAGAS (sync a cada 15 min). A
      // mensagem antiga mandava conferir dados que estavam CERTOS. A RPC ja
      // devolve o motivo estruturado; so faltava contar a verdade.
      const _quem = resolvido && resolvido.aluno_nome ? ` do ${resolvido.aluno_nome}` : '';
      const _pedeDivisao = 'me manda a divisão com o valor de cada um: *Nome — R$ valor*';
      // 2+ parecidos: mostra até 3 e NÃO escolhe — escolher entre parecidos é
      // o mesmo erro do `limit 1` que já trocou aluno no caixa.
      const _parecidos = (_sugestao && _sugestao.candidatos.length >= 2)
        ? ` Os mais parecidos que achei aqui: ${_sugestao.candidatos.slice(0, 3).map((n) => `*${n}*`).join(', ')}`
          + `${_sugestao.candidatos.length > 3 ? ' (e outros)' : ''} — não escolho por você.`
        : '';
      const _motivosMulti = {
        alocacao_nao_derivavel: (resolvido && Number(resolvido.candidatas) > 1)
          ? `achei mais de uma fatura paga${_quem} nos últimos dias e não sei qual é esta — ${_pedeDivisao}.`
          : `ainda não vejo a fatura${_quem} como paga na minha cópia do Emusys (ela atualiza a cada 15 min). Se o pagamento acabou de entrar, me reenvia daqui a pouco — ou ${_pedeDivisao}.`,
        sem_fatura_da_categoria: `não encontrei fatura dessa categoria${_quem} na competência — confere a competência, ou ${_pedeDivisao}.`,
        aluno_nao_encontrado: `não achei${_quem} no cadastro desta unidade — confere o nome completo.${_parecidos}`,
        item_sem_aluno: 'não consegui ler o nome de um dos alunos — ' + _pedeDivisao + '.',
        // 🔴 09/09: a Vitoria mandou "parcela de setembro" com o mes CERTO e
        // ouviu "confere o mes". As faturas entraram no espelho 3min18s depois
        // da recusa; as 13:52, reenviado, lancou. A hipotese mais provavel
        // quando o pagamento e recente nao e' a pessoa ter errado o mes — e' a
        // copia local estar atrasada (sync a cada 15 min).
        competencia_item_divergente: `a competência que achei na fatura${_quem} é outra. Se o pagamento é recente, pode ser a minha cópia do Emusys atrasada (ela atualiza a cada 15 min) — me reenvia daqui a pouco. Se não for isso, confere o mês.`,
        categoria_item_invalida: 'a categoria de um dos itens não confere com a fatura — confere se é parcela, passaporte ou taxa.',
        soma_itens_divergente: 'a soma dos alunos não fecha com o valor do comprovante — confere os valores.',
        item_nao_validado: `não consegui casar um dos itens${_quem} com fatura oficial — ${_pedeDivisao}.`,
        fonte_indisponivel: 'a fonte oficial de faturas está fora do ar agora. Não lanço sem confirmar; tenta de novo em alguns minutos.',
        // 🔴 Motivos do resolver do pagamento INTEIRO (09/09). Antes destes, um
        //    nome ambíguo não recusava: a cascata descia um ramo e ESCOLHIA um
        //    aluno. Recusar sem dizer quantos homônimos existem é beco sem saída — daí
        //    o número vir junto.
        nome_ambiguo: (() => {
          const n = Array.isArray(resolvido && resolvido.candidatos) ? resolvido.candidatos.length : 0;
          const quantos = n > 1 ? `achei ${n} alunos` : 'achei mais de um aluno';
          return `${quantos} com esse primeiro nome nesta unidade e não escolho por você — me manda o nome completo${_quem ? '' : ' de cada um'}.`;
        })(),
        valor_declarado_nao_bate: (() => {
          const enc = Number(resolvido && resolvido.valor_encontrado);
          const dec = Number(resolvido && resolvido.valor_declarado);
          const visto = enc ? ` A fatura que achei${_quem} é de ${fmtBRL(enc)}.` : '';
          return `o valor que você escreveu${dec ? ` (${fmtBRL(dec)})` : ''} ainda não bate com uma fatura oficial${_quem}.${visto} Se o pagamento acabou de entrar, minha cópia do Emusys pode estar atrasada — me reenvia daqui a pouco. Não criei card aprovável.`;
        })(),
        aluno_baixa_confianca: `o nome informado não bateu com segurança no cadastro${_quem}. Me manda o nome completo de cada aluno, exatamente como está no sistema.${_parecidos} Não criei card aprovável.`,
        aluno_sem_nome: 'não consegui ler o nome de um dos alunos — ' + _pedeDivisao + '.',
        sem_fatura_que_bata: `ainda não achei fatura oficial${_quem} que feche com esse valor. Se o pagamento acabou de entrar, minha cópia do Emusys pode estar atrasada — me reenvia daqui a pouco. Não criei card aprovável.`,
        itens_ausentes: 'não entendi a divisão — ' + _pedeDivisao + '.',
      };
      const _detalhe = _motivosMulti[resolvido && resolvido.motivo]
        || 'ainda não consegui confirmar todas as faturas oficiais — confere aluno, competência e valor de cada um.';
      await sendFn(event.chatId, `⚠️ Entendi a divisão, mas ${_detalhe}\n_Não lanço parcialmente._`);
      log({ acao: 'manual_review_multi_student', chatId: event.chatId, motivo: resolvido && resolvido.motivo || 'itens_nao_validados' });
      return { acao: 'manual_review_multi_student' };
    }
    // Defesa em profundidade: mesmo que a RPC antiga ou um mock devolva
    // `ok:true` com item sem fatura, o runtime não cria card aprovável sem a
    // evidência humana explícita. Isso cobre as três unidades no mesmo Core.
    // ADIANTAMENTO DECLARADO (SOL-134, 29/09/2026): o único item sem fatura que
    // dispensa o protocolo de desconto é o adiantamento que a EQUIPE escreveu
    // (valor e competência iguais ao declarado). Qualquer outro segue a regra.
    const _ehAdiantamentoDeclarado = (item) => !!(adiantamento && item && item.adiantamento === true
      && item.sem_vinculo_fatura === true && item.declarado_pelo_humano === true && !item.canonical_fatura_id
      && Math.abs(Number(item.valor) - Number(adiantamento.valor)) < 0.01
      && item.competencia === adiantamento.competencia);
    const _adiantamentos = resolvido.itens.filter((item) => item && item.adiantamento === true);
    if (_adiantamentos.length > 1 || _adiantamentos.some((item) => !_ehAdiantamentoDeclarado(item))) {
      await colocarEmRevisao('adiantamento_incoerente');
      await sendFn(event.chatId, '⚠️ Não consegui montar o adiantamento com segurança. Não criei card aprovável.');
      log({ acao: 'adiantamento_incoerente', chatId: event.chatId, itens: _adiantamentos.length });
      return { acao: 'manual_review_multi_student' };
    }
    const _semVinculo = resolvido.itens.filter((item) => item && item.sem_vinculo_fatura === true
      && !_ehAdiantamentoDeclarado(item));
    // A RPC pode devolver o nome canônico completo, diferente do rótulo curto
    // digitado. A identidade estável dentro do lote é ordem + valor.
    const _chaveItem = (item, indice = null) => {
      const ordem = Number(item && item.ordem || (indice != null ? indice + 1 : 0));
      return `${ordem}|${Number(item && item.valor || 0).toFixed(2)}`;
    };
    const _entradasAutorizadas = new Set(itensParaResolver
      .map((item, indice) => (item && item.declarado_pelo_humano === true
        && item.desconto_negociado_explicito === true) ? _chaveItem(item, indice) : null)
      .filter(Boolean));
    const _retornoIncoerente = _semVinculo.some((item) =>
      item.declarado_pelo_humano !== true || !_entradasAutorizadas.has(_chaveItem(item)));
    if (_semVinculo.length > 0
        && (!_autorizacaoDesconto.ok || _retornoIncoerente)) {
      await colocarEmRevisao('sem_vinculo_sem_desconto_autorizado');
      await sendFn(event.chatId,
        '⚠️ Ainda não encontrei todas as faturas oficiais deste lote. Pode ser atraso da sincronização com o Emusys. '
        + 'Não criei card aprovável e não vou tratar valor digitado como desconto. Me reenvia o comprovante daqui a pouco.');
      log({ acao: 'multi_sem_vinculo_bloqueado', chatId: event.chatId,
        itens_sem_vinculo: _semVinculo.length, motivo: _autorizacaoDesconto.motivo || 'retorno_incoerente' });
      return { acao: 'manual_review_multi_student' };
    }
    if (!v3LedgerAtivo) {
      await colocarEmRevisao('v3_indisponivel');
      await sendFn(event.chatId, '⚠️ Não preparei o lote: o trilho seguro de aprovação não está disponível agora. Não responda *pode*; tenta de novo em instantes.');
      return { acao: 'manual_review_multi_student' };
    }
    const itens = resolvido.itens.map((item) => ({
      aluno_nome: item.aluno_nome, valor: Number(item.valor), competencia: item.competencia || null,
      categoria: item.categoria || intent.categoria, descricao: item.descricao || null,
      canonical_fatura_id: item.canonical_fatura_id || null, responsavel_financeiro: item.responsavel_financeiro || null,
      fatura: item.fatura || null,
      // Só o lote de CHEQUES traz: "cheque Santander nº 000212" — o validador
      // devolve a descrição da fatura e a RPC do lote anexa este complemento.
      // cheque_numero/banco/bom_para viram colunas da movimentação (pedido SF).
      complemento_descricao: item.complemento_descricao || null,
      // Só o cheque de VÁRIAS parcelas (irmãos) traz: UMA movimentação ligada às N
      // faturas. Exige o validador do lote com `fatura_ids` (migration 20261006200000).
      ...(Array.isArray(item.fatura_ids) && item.fatura_ids.length >= 2
        ? { fatura_ids: item.fatura_ids.slice(), faturas: item.faturas || null } : {}),
      cheque_numero: item.cheque_numero || null,
      cheque_banco: item.cheque_banco || null,
      cheque_bom_para: item.cheque_bom_para || null,
      // Data do cheque (bom-para ou depósito): o validador do lote mede o valor da
      // parcela nela, não hoje (desconto de pontualidade — CG 06/10).
      cheque_data_ref: item.cheque_data_ref || null,
      sem_vinculo_fatura: !!item.sem_vinculo_fatura, declarado_pelo_humano: !!item.declarado_pelo_humano,
      desconto_negociado_explicito: !!item.sem_vinculo_fatura && !_ehAdiantamentoDeclarado(item)
        && _autorizacaoDesconto.ok && _entradasAutorizadas.has(_chaveItem(item)),
      ...(_ehAdiantamentoDeclarado(item) ? { adiantamento: true } : {}),
    }));
    const texto = textoPronto || montarPreviewMultiAluno({ unidadeNome: grupo.nome, valorTotal: intent.valor_total, forma: intent.forma, categoria: intent.categoria, itens });
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grupo.unidade_id); } catch (e) { /* melhor esforço */ }
    const pendencia = {
      previewId: null, tipoOperacao: 'lancar_recebimento_lote', unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor: intent.valor_total, forma: intent.forma, categoria: intent.categoria, itens,
      descricao: `Lote multi-aluno (${itens.length} itens)`, aluno: null, competencia: null,
      origem: origemMessageId || event.messageId, idemKey: `${event.chatId}:${origemMessageId || event.messageId}:lote-multi`,
      enviadoPor: nomeParaCarimbo(idEnviou, event), ts: agora,
      evidenceEnvelope,
    };
    // O envelope faz parte do estado persistido do preview V3. Guardar apenas
    // num Map resolvia o segundo turno ate o primeiro restart; depois o bridge
    // reidratava o card sem os fatos que o LLM tinha estruturado.
    let previewId = null;
    if (agentFirstEnvelope) {
      pendencia.agentFirstEnvelope = agentFirstEnvelope;
      const seguro = await prepararEPublicarPreviewV4({
        event, grupo, texto, pendencia,
        result: { acao: 'preview_multi_aluno_enviado', itens: itens.length, valor_total: intent.valor_total },
        // A correcao nasce NAO APROVAVEL. A mesma transacao que encerra o card
        // antigo promove este para public_preview_sent. Se a troca falhar, o
        // novo nunca fica aberto no ledger — nao ha janela com dois aprovaveis.
        previewStatus: supersedePreviewId ? 'awaiting_supersede' : 'public_preview_sent',
      });
      if (!seguro.ok) {
        log({ acao: 'preview_multi_aluno_sem_v3', chatId: event.chatId });
        return { acao: seguro.motivo || 'preview_multi_aluno_sem_v3' };
      }
      previewId = pendencia.previewId;
    } else {
      // Compatibilidade: o trilho deterministico/legado permanece exatamente
      // no contrato anterior. O two-phase novo pertence apenas ao agent-first.
      previewId = await sendFn(event.chatId, texto);
      pendencia.previewId = previewId;
      const v3 = await registrarPreviewPublicoV3({
        event, grupo, previewId, texto, pendencia,
        result: { acao: 'preview_multi_aluno_enviado', itens: itens.length, valor_total: intent.valor_total },
        previewStatus: supersedePreviewId ? 'awaiting_supersede' : 'public_preview_sent',
      });
      if (!v3 || !v3.preview_id || !v3.preview_hash) {
        await sendFn(event.chatId, '⚠️ Não deixei esse lote pendente porque o preview seguro não foi registrado. Não responda *pode*; tenta de novo em instantes.');
        log({ acao: 'preview_multi_aluno_sem_v3', chatId: event.chatId });
        return { acao: 'preview_multi_aluno_sem_v3' };
      }
      pendencia.v3PreviewId = v3.preview_id;
      pendencia.v3PreviewHash = v3.preview_hash;
    }
    // 🔴 UM COMPROVANTE, UMA PENDENCIA. A revisao manual do mesmo valor tem de
    //    morrer aqui: em 08/09 ela ficou aberta ao lado deste preview, e a
    //    correcao de competencia da ADM grudou NELA — reprocessando a legenda
    //    ruim (2 itens) e respondendo "ainda falta uma divisao por aluno" com
    //    os 3 itens ja montados. O dedup que existia so cobria
    //    manual_review x manual_review.
    const mortas = arr.filter((p) => p.tipoOperacao === 'manual_review_multi_student'
      && p.valor != null && intent.valor_total != null
      && Math.abs(Number(p.valor) - Number(intent.valor_total)) < 0.01);
    for (const morta of mortas) arr.splice(arr.indexOf(morta), 1);
    if (mortas.length) {
      log({ acao: 'manual_review_encerrada_por_preview', chatId: event.chatId,
            quantas: mortas.length, valor: intent.valor_total });
    }
    // 🔴 CORRECAO SUCEDE O PREVIEW ANTERIOR, NAO EMPILHA OUTRO. Sem isto, o 2o
    //    turno do agent-first deixava DUAS pendencias vivas: a corrigida e a
    //    antiga — e a antiga continua citavel, entao um "pode" nela lancaria o
    //    card velho. Duas pendencias para um comprovante e a receita da
    //    duplicidade. So morre o preview que ESTA funcao criou antes, indicado
    //    explicitamente por quem chama; nunca uma pendencia alheia.
    if (supersedePreviewId) {
      const velhas = arr.filter((p) => p.previewId === supersedePreviewId);
      if (velhas.length !== 1) {
        await finalizarPreviewSeguroV3({
          alvo: pendencia, status: 'rejected', motivo: 'preview_anterior_nao_unico',
        });
        await sendFn(event.chatId,
          '⚠️ Preparei a correção, mas o preview anterior não está mais disponível com segurança. '
          + 'Ignore o card novo e refaça o lançamento.');
        log({ acao: 'preview_correcao_bloqueada', chatId: event.chatId,
              anterior: supersedePreviewId, motivo: 'preview_anterior_nao_unico' });
        return { acao: 'preview_correcao_bloqueada', preservarEnvelope: false };
      }
      for (const velha of velhas) {
        const fim = await finalizarPreviewSeguroV3({
          alvo: velha, status: 'superseded', substituto: pendencia,
          motivo: 'correcao_agent_first',
        });
        if (!fim || !fim.ok) {
          // O novo nasceu `awaiting_supersede`, portanto ja e inaprovavel. O
          // antigo continua sendo o unico aberto; nenhuma compensacao remota e
          // necessaria e uma queda entre duas RPCs nao cria estado intermediario.
          await sendFn(event.chatId,
            '⚠️ Preparei a correção, mas não consegui substituir o preview antigo com segurança. '
            + 'Ignore o card novo e não responda *pode* nele; o card anterior continua valendo. Tenta a correção de novo em instantes.');
          log({ acao: 'preview_correcao_bloqueada', chatId: event.chatId,
                anterior: supersedePreviewId, motivo: fim && fim.motivo });
          return { acao: 'preview_correcao_bloqueada', preservarEnvelope: true };
        }
      }
      for (const v of velhas) arr.splice(arr.indexOf(v), 1);
      if (velhas.length) {
        log({ acao: 'preview_sucedido_por_correcao', chatId: event.chatId,
              quantas: velhas.length, anterior: supersedePreviewId });
      }
    }
    arr.push(pendencia); pendentes.set(event.chatId, arr);
    log({ acao: 'preview_multi_aluno_enviado', chatId: event.chatId, itens: itens.length, valor_total: intent.valor_total });
    return { acao: 'preview_multi_aluno_enviado', previewId };
  }

  function lembrarLancado(chatId, item) {
    const arr = (lancadosRecentes.get(chatId) || []).filter((x) => (Date.now() - x.ts) <= 2 * janelaMs);
    arr.push({ ...item, ts: Date.now() });
    lancadosRecentes.set(chatId, arr.slice(-5));
  }
  function alvoLancado(chatId, quotedMessageId, agora = Date.now()) {
    const arr = (lancadosRecentes.get(chatId) || []).filter((x) => (agora - x.ts) <= 2 * janelaMs);
    lancadosRecentes.set(chatId, arr);
    if (quotedMessageId) return arr.find((x) => x.confirmMessageId === quotedMessageId || x.previewId === quotedMessageId) || null;
    return arr.length === 1 ? arr[0] : null;
  }

  async function prepararLoteMidia(event, agora) {
    // A reavaliação por legenda tardia já é UMA mídia com UMA legenda: sem lote.
    if (!loteJanelaMs || event._legendaTardia) return { event };
    const k = textoIrmaoKey(event);
    let lote = lotesMidia.get(k);
    if (!lote || (agora - lote.ts) > 5000) {
      lote = { lider: event.messageId, ts: agora, eventos: [event], textos: [] };
      lotesMidia.set(k, lote);
      await sleep(loteJanelaMs);
      if (lotesMidia.get(k) !== lote || lote.lider !== event.messageId) return { skip: true, acao: 'lote_midia_ignorado' };
      lotesMidia.delete(k);
      if (lote.eventos.length <= 1 && lote.textos.length === 0) return { event };
      const corpos = []
        .concat(lote.eventos.map((e) => bodyLimpo(e.body)).filter(Boolean))
        .concat(lote.textos.map((x) => bodyLimpo(x.texto)).filter(Boolean));
      const mediaUrls = lote.eventos.flatMap((e) => Array.isArray(e.mediaUrls) ? e.mediaUrls : []);
      const consolidado = {
        ...event,
        messageId: lote.eventos.map((e) => e.messageId).filter(Boolean).join('+') || event.messageId,
        body: corpos.join(' · '),
        mediaUrls,
      };
      log({ acao: 'lote_midia_consolidado', chatId: event.chatId, midias: lote.eventos.length, textos: lote.textos.length });
      return { event: consolidado };
    }
    // 🔴 UMA MÍDIA = UM COMPROVANTE (26/09/2026, Barra). A Kailane mandou dois PDFs
    // juntos (R$ 499 e R$ 550) e o lote os fundiu num evento só: o OCR leu apenas o
    // primeiro arquivo, as duas legendas foram coladas, o modelo listou duas pessoas
    // e o par virou revisão "vários alunos" — que depois foi lançada como
    // "Passaporte R$ 550" sem aluno. O lote existe para costurar a LEGENDA que chega
    // em bolha separada; mídia a mais segue sozinha, com a legenda dela.
    log({ acao: 'lote_midia_segunda_midia_separada', chatId: event.chatId });
    return { event };
  }

  function anexarTextoAoLote(event, texto, agora) {
    if (!loteJanelaMs || !texto) return false;
    const lote = lotesMidia.get(textoIrmaoKey(event));
    if (!lote || (agora - lote.ts) > 5000) return false;
    lote.textos.push({ texto, ts: agora });
    lote.ts = agora;
    log({ acao: 'lote_texto_anexado', chatId: event.chatId, textos: lote.textos.length });
    return true;
  }

  // 🔴 FOTO DO CONTEXTO NA ENTRADA DO handle(). O observador da V4 roda DEPOIS
  // do handle, quando a pendencia aprovada JA FOI CONSUMIDA — media-se o
  // roteador mostrando a ele um contexto que nao existia quando a pessoa
  // escreveu. Medido em 03-05/09: 33 das 44 mensagens que lancaram chegaram ao
  // roteador com pendencias=0. Esta foto e' o conserto da MEDICAO, nao do
  // roteador.
  // ⚠️ A foto e' chaveada por MESSAGE ID, nao por chatId. O bridge nao serializa
  // o handle (em 05/09 as 16:36:35 chegaram 3 mensagens no mesmo segundo), entao
  // chavear por chat faria a foto da mensagem B sobrescrever a da A antes de o
  // observador de A ler — trocaria um defeito de medicao por outro.
  const ctxAntesDoHandle = new Map();   // messageId -> {ts, cards, total}
  function _chaveFotoV4(event) {
    return String((event && (event.messageId || event.chatId)) || '');
  }
  function fotografarContextoV4(event, chatId, agora) {
    try {
      // Poda simples: a foto vive uma janela; sem isto o Map cresce sem fim.
      for (const [k, v] of ctxAntesDoHandle) if (agora - v.ts > janelaMs) ctxAntesDoHandle.delete(k);
      const arr = (pendentes.get(chatId) || []).filter((p) => agora - p.ts < janelaMs);
      ctxAntesDoHandle.set(_chaveFotoV4(event), {
        ts: agora,
        cards: arr.slice(0, 3).map((p, i) => ({
          card: i + 1, valor: p.valor || null, forma: p.forma || null,
          categoria: p.categoria || null, aluno: p.aluno || null,
          competencia: p.competencia || null,
        })),
        total: arr.length,
      });
    } catch (e) { /* medicao nunca derruba o atendimento */ }
  }

  function limparVelhos(chatId, agora) {
    const arr = pendentes.get(chatId) || [];
    const vivos = arr.filter((p) => agora - p.ts < janelaMs);
    const expirados = arr.filter((p) => agora - p.ts >= janelaMs);
    pendentes.set(chatId, vivos);
    for (const p of expirados) {
      _registrarVencido(chatId, p, agora);
      limparEnvelopeDaPendencia(chatId, p, 'expirou');
      // A aprovacao vence no mesmo limite do card. A RPC tambem confere a idade,
      // portanto esta escrita e trilha/auditoria — nao a unica barreira.
      void finalizarPreviewSeguroV3({ alvo: p, status: 'expired', motivo: 'janela_runtime_expirou' });
    }
    const draft = rascunhosV4.get(chatId);
    if (draft && agora - draft.ts >= janelaMs) {
      void finalizarRascunhoV4(chatId, 'expired', 'janela_runtime_expirou');
    }
    return vivos;
  }

  // 🔴 PAGAMENTO ENTENDIDO NÃO PODE TERMINAR EM SILÊNCIO (28/09/2026). Quando o
  //    roteador reconhece um pagamento e o Core não acha a fatura, o agent-first
  //    devolve null para o parser antigo tentar; se ele também não trata, a
  //    pessoa ditou e nada aconteceu — sem card, sem pergunta, sem motivo. Aqui,
  //    no fim do turno, se NADA foi enviado ao grupo, a Sol diz o que entendeu e
  //    por que não lançou. Não vale para o caminho das ferramentas: lá o agente
  //    recebe o motivo na resposta da tool e fala ele mesmo.
  const _enviosPorChat = new Map();
  const _sendOriginal = sendFn;
  // Ids das mensagens que a PRÓPRIA Sol mandou (6 h, só memória): permitem saber se
  // uma resposta citada está falando COM ela ou entre colegas (29/09/2026).
  const _idsDaSol = new Map(); // messageId -> ts
  sendFn = async (chatId, texto, ...resto) => {
    _enviosPorChat.set(chatId, (_enviosPorChat.get(chatId) || 0) + 1);
    const id = await _sendOriginal(chatId, texto, ...resto);
    if (id) {
      const agoraId = Date.now();
      _idsDaSol.set(String(id), agoraId);
      if (_idsDaSol.size > 2000) {
        for (const [k, t] of _idsDaSol) { if (agoraId - t > 6 * 60 * 60 * 1000) _idsDaSol.delete(k); }
      }
    }
    return id;
  };
  // 🔴 29/09/2026 (Recreio 16:11, Rose → Vitória): conversa ENTRE colegas ("Não muda o
  //    valor da parcela", citando a Vitória) virou "Consigo corrigir/estornar, mas preciso
  //    saber qual lançamento" — a Sol falou no meio da conversa. Mexer em lançamento já
  //    gravado (ou responder sobre isso) só quando falam COM ela: chamaram pelo nome
  //    ("Sol, …") ou citaram uma mensagem dela.
  function _falouComSol(event) {
    if (event && (event.caixaToolCommand || event.caixaToolTarget || event._sintetico)) return true;
    if (/^\s*@?sol\b/i.test(String(event && event.body || ''))) return true;
    const q = event && event.quotedMessageId;
    return !!(q && _idsDaSol.has(String(q)));
  }
  // 🔴 06/10/2026 (Recreio): no dia seguinte a uma saida lancada, a equipe CONVERSOU
  //    sobre ela e a Sol se meteu 3x com "Entendi que é saída de …, mas falta o valor":
  //    (a) a Vitoria citando o "✅ Lancei a saída…" para explicar o problema; (b) a
  //    gerente citando o FECHAMENTO com "Descrição correta: R$91,40 Compra de…" — lido
  //    como saida NOVA de R$ 91,40 (um "pode" ali lancava o dinheiro DUAS vezes);
  //    (c) "Compra de 3 pós de café e 3 de açúcar" respondendo ao dono.
  // Citar o que a Sol JA CONCLUIU (lancamento confirmado, fechamento/abertura) e falar
  // SOBRE o passado — nunca abre lancamento novo. Card ABERTO citado continua sendo
  // correcao/aprovacao (Jhon/CG 09/09) e por isso fica fora daqui.
  // ⚠️ Nao depende so de `_idsDaSol`/`lancadosRecentes`: sao memoria do processo e o
  //    fechamento sai do cron (outro processo). O texto citado vem no evento.
  const _RE_MSG_CONCLUIDA_SOL = /(^|\n)\s*✅\s*(?:\*?\s*)?(?:Lancei|Caixa\s+(?:aberto|fechado))|FECHAMENTO DE CAIXA|Saldo final caixa|lancei (?:a sa[ií]da )?no caixa/i;
  function _citaConcluidoDaSol(event, chatId) {
    const q = event && event.quotedMessageId;
    if (!q) return false;
    // so LE as pendencias: expirar card aqui mudaria o estado de quem nao e conversa
    if ((pendentes.get(chatId) || []).some((p) => p.previewId === q || (p.msgIds || []).includes(q))) return false;
    if ((lancadosRecentes.get(chatId) || []).some((x) => x.confirmMessageId === q)) return true;
    return _RE_MSG_CONCLUIDA_SOL.test(String((event && (event.quotedBody || event.quotedPreview)) || ''));
  }
  // Chamou a Sol PELO NOME ("Sol, …", "@Sol", mencao ao numero dela) ou e comando
  // da ferramenta. Citar mensagem dela NAO conta aqui: ver `_citaConcluidoDaSol`.
  function _chamouSolPeloNome(event) {
    if (event && (event.caixaToolCommand || event.caixaToolTarget || event._sintetico)) return true;
    const b = _semAcentoDesc(String(event && event.body || ''));
    if (/^\s*@?sol(?!\p{L})/u.test(b) || /(^|[^\p{L}\p{N}])@?sol\s*[,!?:]/u.test(b)) return true;
    const bots = new Set((event && event.botIds) || []);
    return ((event && event.mentionedIds) || []).some((id) => bots.has(id));
  }
  // LEGENDA TARDIA (29/09/2026, CG 14:36) — ver `midiasSemLegenda`. O card que a
  // própria mídia publicou (por um caminho sem adiamento) e ainda está aberto.
  function _cardDaMidia(chatId, rec, agora) {
    return limparVelhos(chatId, agora).find((x) => (rec.resultado && rec.resultado.previewId
      && x.previewId === rec.resultado.previewId) || x.origem === rec.evento.messageId) || null;
  }

  async function _reavaliarMidiaComLegenda(rec, agora) {
    const ev0 = rec.evento;
    const chatId = ev0.chatId;
    rec.consumida = true;
    const cartaoAnterior = _cardDaMidia(chatId, rec, agora);
    if (cartaoAnterior) {
      const fim = await finalizarPreviewSeguroV3({ alvo: cartaoAnterior, status: 'rejected',
        motivo: 'substituido_por_legenda_tardia' });
      if (fim && fim.ok === false && !fim.sem_ledger) {
        log({ acao: 'legenda_tardia_card_nao_substituido', chatId, motivo: fim.motivo });
        return null;
      }
      pendentes.set(chatId, (pendentes.get(chatId) || []).filter((p) => p !== cartaoAnterior));
      limparEnvelopeDaPendencia(chatId, cartaoAnterior, 'substituido_por_legenda_tardia');
    }
    vistos.delete(`${chatId}:${ev0.messageId}`);
    const ev = { ...ev0, body: rec.legenda, _legendaTardia: true, __handleTopo: true };
    delete ev._legendaTardiaRec;
    if (rec.evidencia) ev.caixaMediaEvidence = rec.evidencia;
    log({ acao: 'midia_reavaliada_legenda_tardia', chatId, substituiu_card: !!cartaoAnterior,
          antes: rec.resultado && rec.resultado.acao, segundos: Math.round((agora - rec.ts) / 1000) });
    const r = await _handleInterno(ev, agora);
    return r ? { ...r, legendaTardia: true } : r;
  }

  async function handle(event, agora = Date.now()) {
    // Chamadas internas repassam `{...event}`: só o topo decide o aviso.
    if (!event || event.__handleTopo) return _handleInterno(event, agora);
    event.__handleTopo = true;

    // 🔴 LEGENDA E COMPROVANTE CHEGAM COMO DUAS MENSAGENS, E A ORDEM É ACASO
    //    (CG 28/09 17:16, Mayra). Ela encaminhou o PDF e escreveu embaixo "PG pix
    //    parcela 10/2026 aluna Julia Silva de Freitas - LA CG R$457,73"; a ponte
    //    entregou o TEXTO 33 ms ANTES do PDF. O lote de mídia só costurava texto
    //    que chega DEPOIS (e só abre depois da leitura do comprovante, ~3 s), então
    //    o texto foi tratado sozinho ("Entendi um pagamento… não achei fatura") e o
    //    PDF virou outro card, sem aluno — duas respostas contraditórias para um
    //    pagamento só. Aqui os dois se encontram no topo, antes de qualquer caminho:
    //    • texto primeiro: espera a janela do lote; se chegar mídia SEM legenda do
    //      mesmo autor, o texto vira a legenda dela e não é tratado sozinho;
    //    • mídia primeiro: nada muda — o lote e a bolha irmã já costuram, e é
    //      assim que chega a divisão multi-aluno (desviar ali quebrou 4 testes).
    //    Só vale para texto com cara de legenda (valor ou aluno rotulado), sem
    //    citação e que não seja "pode"/"não"; mídia que já tem legenda própria
    //    não adota outra.
    if (event.hasMedia) midiaRecente.set(textoIrmaoKey(event), agora);
    if (loteJanelaMs && !/^tool-/.test(String(event.messageId || ''))) {
      const _k = textoIrmaoKey(event);
      if (event.hasMedia) {
        if (!bodyLimpo(event.body)) {
          const esp = legendasEsperando.get(_k);
          if (esp && !esp.reclamada && Math.abs(agora - esp.ts) <= 5000) {
            esp.reclamada = true;
            legendasEsperando.delete(_k);
            event.body = esp.texto;
            log({ acao: 'legenda_anterior_adotada_pela_midia', chatId: event.chatId });
          }
          midiasEmVoo.set(_k, { ts: agora });
        }
        // Registro da legenda tardia: só mídia que ficou SEM legenda (nem própria,
        // nem adotada acima). Mídia nova do autor substitui o registro anterior.
        if (!event._sintetico && !bodyLimpo(event.body)) {
          const _rec = { ts: agora, evento: event, emVoo: true, legenda: null, consumida: false,
                         evidencia: null, resultado: null };
          midiasSemLegenda.set(_k, _rec);
          event._legendaTardiaRec = _rec;
        } else {
          midiasSemLegenda.delete(_k);
        }
      } else {
        const _t = bodyLimpo(event.body);
        const _pareceLegenda = _t && _t.length <= 300 && !event.quotedMessageId
          && !casarPode(_t).pode && !casarNao(_t)
          && (extrairValor(_t) || _alunoRotulado(_t));
        // LEGENDA TARDIA (29/09/2026, CG 14:36): texto do mesmo autor até 60 s depois
        // de uma mídia sem legenda dele. O lote curto (primeiros ~0,9 s) tem
        // precedência — é o caminho de sempre e já trata.
        //    • mídia em voo: o texto é a legenda dela (não é tratado sozinho);
        //    • mídia recusada ("não consegui ler"): é reavaliada com a legenda;
        //    • card já publicado: NÃO reavalia aqui — o autor completando o próprio
        //      card é o caminho de correção de sempre (1.5 / aluno corrigido), que
        //      remonta o MESMO card. Reavaliar ali sequestrava a divisão multi-aluno
        //      e o "Sol, o valor foi R$100" (testes de 31/08 e 29/08).
        //    "Sol, …" com card aberto do mesmo autor é resposta a ele, não legenda.
        const _recLT = _pareceLegenda ? midiasSemLegenda.get(_k) : null;
        const _loteVivoLT = (() => { const l = lotesMidia.get(_k); return !!(l && agora - l.ts <= 5000); })();
        const _respondeCardLT = /^\s*@?sol\b/i.test(_t) && (pendentes.get(event.chatId) || []).some((p) =>
          String(p.autorPhone || p.autorId || '') === String(event.senderPhone || event.senderId || ''));
        if (_recLT && !_recLT.legenda && !_recLT.temLegenda && !_loteVivoLT && !_respondeCardLT
            && agora - _recLT.ts >= 0 && agora - _recLT.ts <= LEGENDA_TARDIA_MS) {
          if (_recLT.emVoo) {
            _recLT.legenda = _t;
            log({ acao: 'legenda_tardia_anexada_a_midia', chatId: event.chatId,
                  segundos: Math.round((agora - _recLT.ts) / 1000) });
            return { acao: 'legenda_tardia_anexada_a_midia' };
          }
          if (_recLT.resultado && _recLT.resultado.acao === 'midia_recusada') {
            _recLT.legenda = _t;
            const _r2 = await _reavaliarMidiaComLegenda(_recLT, agora);
            if (_r2) return _r2;
          }
        }
        if (_pareceLegenda) {
          // Mídia já em voo ou lote aberto: é legenda que chegou DEPOIS, e o
          // caminho de sempre (lote/bolha irmã) já trata — não esperar nem desviar.
          const voo = midiasEmVoo.get(_k);
          const _midiaAntes = (voo && agora - voo.ts <= 5000) || lotesMidia.get(_k);
          if (!_midiaAntes) {
            const reg = { texto: _t, ts: agora, reclamada: false };
            legendasEsperando.set(_k, reg);
            await sleep(loteJanelaMs);
            if (legendasEsperando.get(_k) === reg) legendasEsperando.delete(_k);
            if (reg.reclamada) return { acao: 'legenda_anexada_a_midia' };
          }
        }
      }
    }
    const _antes = _enviosPorChat.get(event.chatId) || 0;
    let r;
    try {
      r = await _handleInterno(event, agora);
    } finally {
      if (event.hasMedia) {
        const _kv = textoIrmaoKey(event);
        const _v = midiasEmVoo.get(_kv);
        if (_v && _v.ts === agora) midiasEmVoo.delete(_kv);
        const _rec = event._legendaTardiaRec;
        if (_rec) { _rec.emVoo = false; _rec.resultado = r || null; }
      }
    }
    // A legenda tardia chegou depois de a mídia já ter lido a legenda (em geral
    // durante a interpretação): a mídia é reavaliada UMA vez com ela, com a mesma
    // leitura da imagem, e o card que tenha saído é substituído.
    {
      const _rec = event.hasMedia ? event._legendaTardiaRec : null;
      if (_rec && _rec.legenda && !_rec.consumida && midiasSemLegenda.get(textoIrmaoKey(event)) === _rec) {
        const _r2 = await _reavaliarMidiaComLegenda(_rec, agora);
        if (_r2) { _rec.resultado = _r2; r = _r2; }
      }
    }
    const nao = event && event._agentFirstNaoResolveu;
    const ehFerramenta = /^tool-/.test(String((event && event.messageId) || ''));
    // 🔴 O AVISO NÃO FALA POR CIMA DO COMPROVANTE (CG 28/09 17:16 e 18:28, Julia).
    //    Texto e PDF do mesmo autor chegam como duas mensagens; o texto sozinho
    //    não fechava fatura e o aviso dizia "não consegui ligar", enquanto o PDF,
    //    com o texto costurado como legenda, montava o card CERTO segundos depois.
    //    Duas respostas contraditórias. Com mídia do mesmo autor a menos de 60 s
    //    (antes ou depois), quem responde é o card da mídia; o aviso só registra.
    const _midiaPerto = !event.hasMedia && Math.abs(agora - (midiaRecente.get(textoIrmaoKey(event)) || -1e15)) <= 60000;
    if (nao && _midiaPerto) {
      log({ acao: 'agent_first_nao_resolveu_aviso_suprimido_midia', chatId: event.chatId, motivo: nao.motivo });
    }
    if (nao && !_midiaPerto && !ehFerramenta && (_enviosPorChat.get(event.chatId) || 0) === _antes) {
      const quem = nao.aluno ? ` de *${nao.aluno}*` : '';
      const valor = Number(nao.valor) > 0 ? ` de *${fmtBRL(Number(nao.valor))}*` : '';
      const porque = nao.motivo === 'nenhuma_fatura_aberta'
        ? 'não achei no Emusys uma fatura desse aluno, nesse mês, que feche com esse valor'
        : nao.motivo === 'lancamento_ambiguo'
          ? 'não consegui separar com segurança quem comprou e o valor. Me manda numa linha, por exemplo: *Venda de capotraste — aluno Fulano — R$ 40,00 — pix*'
        : nao.motivo === 'fonte_indisponivel'
          ? 'a cópia das faturas do Emusys está atualizando agora e eu não confirmo fatura com fonte velha — manda de novo em alguns minutos'
          : 'não consegui ligar esse pagamento a uma fatura oficial';
      try {
        await sendFn(event.chatId, `Entendi um pagamento${valor}${quem}, mas ${porque}. Nada foi lançado.`
          + (nao.motivo === 'nenhuma_fatura_aberta'
            ? ' Confere o nome completo e o mês (ex.: parcela 09/2026) — ou, se não for mensalidade, me diz o que é.' : ''));
        log({ acao: 'agent_first_nao_resolveu_avisado', chatId: event.chatId, motivo: nao.motivo });
      } catch (e) {
        log({ acao: 'agent_first_nao_resolveu_aviso_erro', chatId: event.chatId, erro: String(e && e.message) });
      }
      return { acao: 'agent_first_nao_resolveu_avisado', motivo: nao.motivo };
    }
    return r;
  }

  async function _handleInterno(event, agora = Date.now()) {
    const chatId = event.chatId;
    const grp = grupos[chatId];
    if (!grp) return { acao: 'ignorado_fora_grupo' };
    // LOTE DE CHEQUES (26/09/2026): antes de tudo — agente, lote de mídia e
    // comprovante. O PDF do lote não é comprovante de recebimento e não pode
    // virar card de caixa. Com o módulo em 'off' ele devolve null e nada muda.
    if (cheques) {
      try {
        const rc = event.hasMedia
          ? await cheques.tratarMidia(event, grp)
          : (event.quotedMessageId ? await cheques.tratarResposta(event, { unidadeId: grp.unidade_id }) : null);
        if (rc && rc.tratou) {
          // Card do lote vencido / mesmo PDF de hoje: republica do estado, sem reler.
          if (rc.republicar) return republicarLoteCheques({ event, grp, lote: rc.republicar, aviso: rc.aviso, agora });
          // Cheques ✅ entram no CAIXA DA SOL pelo card de sempre (decisão do Alf, 26/09).
          if ((Array.isArray(rc.itensCaixa) && rc.itensCaixa.length) || (Array.isArray(rc.extras) && rc.extras.length)) {
            // A mensagem organizada do lote É o card (preview V3): um "pode"
            // citando ela lança os ✅; a conversa citando ela resolve os ❓.
            return publicarCartaoCheques({ event, grp, lote: rc.lote, agora,
              cartao: { texto: rc.texto, itensCaixa: rc.itensCaixa || [], extras: rc.extras || [] }, acaoBase: rc.acao });
          }
          // "comprovante" em resposta a "essa foto é de cheque?": a foto volta ao caminho de sempre.
          if (rc.reprocessar) return _handleInterno(rc.reprocessar, agora);
          return { acao: rc.acao };
        }
      } catch (e) {
        log({ acao: 'cheques_erro', chatId, erro: String(e && e.message) });
      }
    }
    // Resposta a "é venda de ingresso ou da lojinha?": continua o caso guardado.
    if (!event.hasMedia && perguntasNatureza.size) {
      const rNat = await responderPerguntaNatureza(event, agora);
      if (rNat) return rNat;
    }
    // Resposta "sim" a "Não achei X. É Y?" (06/10/2026). Antes do agent-first e do
    // "pode": o "sim" citando a pergunta casaria como confirmação frouxa e
    // bateria na trava da revisão multi ("Não lancei…"), e sem citar iria ao
    // modelo, que não enxerga a pergunta.
    if (!event.hasMedia) {
      const rSug = await responderSugestaoNome(event, agora);
      if (rSug) return rSug;
    }
    // A foto sai aqui, antes de qualquer coisa consumir pendencia (P2).
    fotografarContextoV4(event, chatId, agora);
    const senderNum = String(event.senderPhone || event.senderId || '').replace(/@.*/, '').replace(/\D/g, '');

    // Nova mídia é um novo caso financeiro. Ela nunca pode completar um
    // rascunho anterior por proximidade temporal; só uma resposta textual do
    // mesmo remetente ou uma citação explícita pode fazê-lo. Foi assim que o
    // comprovante da Vitória herdou o rascunho da Daiana no mesmo grupo.
    const draftNaEntrada = rascunhosV4.get(chatId) || null;
    if (event.hasMedia && draftNaEntrada && event.messageId !== draftNaEntrada.origem) {
      await finalizarRascunhoV4(chatId, 'rejected', 'nova_midia_invalida_rascunho_anterior');
      log({ acao: 'agent_first_draft_invalidado_nova_midia', chatId,
        origem_hash: sha256(draftNaEntrada.origem || ''), nova_origem_hash: sha256(event.messageId || '') });
    }

    // O agent-first recebe a mesma evidência estruturada que o trilho
    // determinístico: OCR/visão, modalidade e parcelas. O documento é lido
    // uma vez e fica cacheado no evento para o fallback não repetir OCR.
    if (event.hasMedia && !event._sintetico && _v4CanarioLigado(chatId)) {
      await coletarEvidenciaMidiaV4(event);
    }

    // CANARIO AGENT-FIRST — DESLIGADO por padrao, por LISTA de grupo.
    // ⚠️ Antes de tudo, de proposito: se o legado responder primeiro, o
    //    canario nao mede nada (foi o diagnostico do caso Lis/Mayra).
    // 🔴 LEGENDA DE MIDIA TAMBEM PASSA AQUI — foi o buraco do gate anterior. O
    //    comprovante da Lis chegou como MIDIA COM LEGENDA, e eu tinha gatado em
    //    `!event.hasMedia`: o caso que originou a frente ficava justamente fora
    //    dela, e o meu teste, sendo de texto puro, nao representava o evento
    //    real. O OCR NAO MUDA: sem legenda, ou se o agent-first nao resolver, o
    //    fluxo de comprovante de hoje assume inteiro.
    // ⚠️ Quando resolve, o valor NAO vem do OCR — vem do total escrito pelo
    //    humano, conferido contra as FATURAS pelo Core. E' criterio mais forte
    //    que o OCR, nao mais fraco: este caminho nunca lanca sem vinculo de
    //    fatura, enquanto a legenda no fluxo legado pode.
    if (!event._sintetico && _v4CanarioLigado(chatId)) {
      const rAgent = await tratarAgentFirst(event, grp, agora);
      if (rAgent) return rAgent;
    }

    // 0) pergunta sobre o caixa do dia -> resposta com DADO (nunca LLM)
    if (process.env.SOL_RESUMO_SHORTCUT !== '0' && !event.hasMedia && ehPerguntaDeCaixa(event.body)) {
      let quem = null;
      try { quem = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* best-effort */ }
      if (quem && quem.identificado && quem.pode_consultar === false) {
        log({ acao: 'resumo_negado', motivo: 'sem_permissao' });
        return { acao: 'resumo_negado' };
      }
      const r = await resumoFn(grp.unidade_id);
      const txt = montarResumoCaixa(r);
      if (txt) {
        await sendFn(chatId, txt);
        log({ acao: 'resumo_enviado', total: r && r.total_entradas });
        return { acao: 'resumo_enviado' };
      }
      log({ acao: 'resumo_indisponivel' });
      return { acao: 'nada' };
    }

    // 0.5) saida operacional por TEXTO tambem e caixa.
    // Caso real (19/08): "Sol, pagamento semanal do seguranca... R$100 no
    // dinheiro" caiu no LLM porque nao tinha midia. Isso nao pode acontecer:
    // o bridge monta preview deterministico e o "pode" de qualquer operador
    // autorizado da unidade passa pela RPC auditada.
    const _citouConcluido = !event.hasMedia && !casarPode(event.body).pode && _citaConcluidoDaSol(event, chatId);
    if (_citouConcluido) log({ acao: 'citacao_concluido_da_sol_nao_abre_lancamento', chatId });
    if (!event.hasMedia && !casarPode(event.body).pode && !_citouConcluido) {
      const texto = bodyLimpo(event.body);
      // ⚠️ Com card aberto, frase de saida e' CORRECAO (tratada mais abaixo), nunca
      // lancamento novo — senao "Sol, foi saida" abre um caso sem valor e mata o
      // preview original (regressao real do caso Mayra/CG).
      const _pendAbertaTexto = limparVelhos(chatId, Date.now()).length > 0;
      // 31/08: prosa com "vale", "R$633" e "dinheiro" espalhados virou card de
      // saida. Texto puro so vira lancamento se PARECE ditado.
      const _ehDitado = _ehDitadoDeCaixa(texto);
      const categoriaTexto = !_ehDitado ? null
        : ((_pendAbertaTexto ? null : _saidaExplicitaFromCaption(texto))
        || _categoriaExplicitaFromCaption(texto));
      if (!_ehDitado && !_pendAbertaTexto && _saidaExplicitaFromCaption(texto)) {
        log({ acao: 'saida_texto_ignorada_prosa', chatId, len: texto.length });
      }
      // VENDA DE INGRESSO / "ingresso ou lojinha?" por TEXTO (02/10/2026). A natureza
      // vem de sinal explícito (caixa-ingressos.cjs), ANTES da lojinha: produto citado
      // devolve null aqui e a lojinha segue como sempre. Só reage a ditado com valor
      // ou forma — "quais os valores dos ingressos?" (CG 01/10) é conversa.
      if (_ingressosLib && _ehDitado && !_pendAbertaTexto && !/\?\s*$/.test(texto)) {
        const _valorIng = _ingressosLib.valorTextoIngresso(texto, { candidatosMonetariosBR, extrairValor });
        const _formaIng = extrairForma(texto, null);
        if (_valorIng || _formaIng) {
          const _nat = naturezaVendaDoTexto(texto, { config: configIngressos(),
            unidade: { id: grp.unidade_id, nome: grp.nome }, resposta: event._respostaNatureza || null });
          if (_nat && _nat.tipo === 'ingresso') {
            return abrirFluxoVendaIngresso({ event, grupo: grp, natureza: _nat, valor: _valorIng, forma: _formaIng,
              agora: Date.now(), origemMessageId: event.messageId });
          }
          if (_nat && _nat.tipo === 'perguntar' && _valorIng && !event._respostaNatureza) {
            return perguntarNaturezaVenda({ event, motivo: _nat.motivo, valor: _valorIng, forma: _formaIng });
          }
        }
        // "80 pix" e nada mais: o valor sozinho não diz se é ingresso, lojinha ou aluno.
        // Pergunta em vez de silêncio — mas não fala por cima de comprovante do mesmo autor.
        const _midiaDoAutor = Math.abs(Date.now() - (midiaRecente.get(textoIrmaoKey(event)) || -1e15)) <= 60000;
        // Exige a FORMA: número sozinho ("5", "1") é resposta de lista (estorno, cheques).
        if (!event._respostaNatureza && !_midiaDoAutor && !event.quotedMessageId
            && !rascunhosV4.get(chatId) && !escolhasMovimento.get(chatId)
            && extrairForma(texto, null) && _ingressosLib.ehSoValorEForma(texto)) {
          const _vSo = _ingressosLib.valorTextoIngresso(texto, { candidatosMonetariosBR, extrairValor });
          if (_vSo) return perguntarNaturezaVenda({ event, motivo: 'sem_contexto', valor: _vSo,
            forma: extrairForma(texto, null), guardar: false });
        }
      }
      // 🔴 29/09/2026: venda de lojinha por TEXTO só abria card pela V4 (#525). Com a V3 de
      //    volta, "Venda de corda para a aluna X Valor:60 reais pix" ficava sem resposta.
      //    Mesmo fluxo/cofre do card de lojinha (pendência V3 + "pode"), montado por regra.
      // Só no caminho V3: com a V4 ligada no grupo, a lojinha por texto é dela.
      if (!_v4CanarioLigado(chatId) && _ehDitado && !_pendAbertaTexto && categoriaTexto === 'lojinha'
          && /(?<!\p{L})vend(?:a|as|i|emos|eu|ido|ida)(?!\p{L})/iu.test(texto)
          && !/\b(parcela|mensalidade|passaporte|matr[ií]cula)\b/i.test(texto)) {
        // Um número solto também é o valor quando é o ÚNICO ("vendi um caderno 80 pix"),
        // pela mesma gramática pt-BR estrita da sangria (02/10/2026).
        let _vl = _valorLojinhaTexto(texto);
        if (!_vl) {
          const _soltosL = candidatosMonetariosBR(texto.replace(/#\s*\d+/g, ' '), { incluirSoltos: true });
          if (_soltosL.length === 1) _vl = _soltosL[0].valor;
        }
        const _fl = extrairForma(texto, null);
        const _prod = detectarLojinhaProduto(texto);
        if (!_vl) {
          await sendFn(chatId, `Entendi venda de ${(_prod && _prod.item) || 'lojinha'}, mas não achei *um* valor. Manda numa linha, por exemplo: *Venda de capotraste — aluno Fulano — R$ 40,00 — pix*`);
          log({ acao: 'lojinha_texto_sem_valor', chatId });
          return { acao: 'lojinha_texto_sem_valor' };
        }
        if (!_fl) {
          await sendFn(chatId, `Entendi venda de ${(_prod && _prod.item) || 'lojinha'} de ${fmtBRL(_vl)}. Me diz a forma: *pix*, *dinheiro*, *cartão* ou *transferência* — manda a venda de novo numa linha.`);
          log({ acao: 'lojinha_texto_sem_forma', chatId, valor: _vl });
          return { acao: 'lojinha_texto_sem_forma' };
        }
        const _comprador = _compradorDeclaradoLojinha(texto);
        const _envelope = { valor_total: _vl, forma: _fl,
          itens: _comprador ? [{ aluno: _comprador, categorias: ['lojinha'] }] : [] };
        log({ acao: 'lojinha_texto_v3', chatId, valor: _vl, com_aluno: !!_comprador });
        return abrirFluxoAgentFirstLojinha({ event, grupo: grp, envelope: _envelope, texto, agora: Date.now(),
          origemMessageId: event.messageId });
      }
      if (categoriaEhSaida(categoriaTexto)) {
        let valor = extrairValor(texto);
        // 02/10/2026: "sangria do caixa 1.000 dinheiro" ouvia "falta o valor". Ditado de
        // saída NOVO (sem card aberto) com exatamente UM número e nenhum sinal monetário:
        // esse número é o valor, lido pela mesma gramática pt-BR estrita. Dois números
        // ("20 notas de 50") continuam virando pergunta; o card ainda exige "pode".
        if (!valor && !_pendAbertaTexto) {
          const _soltos = candidatosMonetariosBR(texto, { incluirSoltos: true });
          if (_soltos.length === 1) valor = _soltos[0].valor;
        }
        const forma = extrairForma(texto, null);
        if (!valor) {
          // 🔴 COM CARD ABERTO, ISTO E CORRECAO — E O VALOR ESTA NO CARD (09/09/2026).
          //
          // Caso Jhon/CG 16:08-16:09: o ditado inteiro passou de primeira e abriu o
          // card certo de R$ 100. Ele so quis trocar `despesa` por `seguranca`,
          // CITANDO o card, e ouviu "falta o valor" — o valor estava na mensagem que
          // ele citou. Teve de reenviar tudo, e sobrou um card orfao.
          //
          // A guarda para isso JA EXISTIA e cobria metade: `_pendAbertaTexto` anula
          // `_saidaExplicitaFromCaption` mas nao `_categoriaExplicitaFromCaption`,
          // que e justamente a forma de corrigir. Em vez de mexer no parentese e
          // deixar a frase cair no "Nao entendi" (o caminho de correcao la embaixo
          // so conhece parcela/passaporte/lojinha/matricula, nunca `seguranca`),
          // a correcao e resolvida AQUI, onde a categoria ja foi reconhecida.
          //
          // ⚠️ Nao e regex nova de dialogo: reusa o detector que ja rodou.
          const _abertasCat = limparVelhos(chatId, agora).filter((p) => Number(p.valor) > 0);
          let _alvoCat = null;
          if (event.quotedMessageId) {
            _alvoCat = _abertasCat.find((p) => p.previewId === event.quotedMessageId
              || (p.msgIds || []).includes(event.quotedMessageId)) || null;
          }
          if (!_alvoCat && _abertasCat.length === 1) _alvoCat = _abertasCat[0];
          if (_alvoCat) {
            _alvoCat.categoria = categoriaTexto;
            _alvoCat.descricao = _descricaoSaidaTexto(_alvoCat.textoDitado || texto, categoriaTexto);
            _alvoCat.ts = agora;
            let _txtCat = `Ajustei: a categoria é ${categoriaTexto}. Remontei o preview:\n\n` + montarPreview({
              unidadeNome: _alvoCat.nome, valor: _alvoCat.valor, forma: _alvoCat.forma,
              descricao: _alvoCat.descricao,
              categoria: categoriaTexto, aluno: _alvoCat.aluno, competencia: _alvoCat.competencia,
              parcela: _alvoCat.parcela, confiancaBaixa: false,
              responsavelFinanceiro: _alvoCat.responsavelFinanceiro, formaIncerta: _alvoCat.formaIncerta,
              cartaoModalidade: _alvoCat.cartaoModalidade, cartaoParcelas: _alvoCat.cartaoParcelas,
              multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false, itemLojinha: null,
            });
            if (dryRun) _txtCat += '\n\n_(modo teste — nada será gravado no caixa)_';
            _alvoCat.previewId = await sendFn(chatId, _txtCat);
            (_alvoCat.msgIds = _alvoCat.msgIds || []).push(_alvoCat.previewId);
            _alvoCat.toquePor = String(event.senderPhone || event.senderId || '') || _alvoCat.toquePor;
            _alvoCat.toqueTs = agora;
            // O "pode" confere o hash do preview: remontar sem revincular o ledger V3
            // deixaria a aprovacao apontando para um card que ninguem mais ve.
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: _alvoCat, previewId: _alvoCat.previewId, texto: _txtCat,
              result: { acao: 'preview_categoria_saida_corrigida', categoria: categoriaTexto },
            })) return { acao: 'preview_categoria_saida_corrigida_sem_v3' };
            log({ acao: 'preview_categoria_saida_corrigida', chatId,
                  categoria: categoriaTexto, valor: _alvoCat.valor });
            return { acao: 'preview_categoria_saida_corrigida' };
          }
          // 🔴 06/10/2026: texto SEM valor e SEM anexo que nao chama a Sol e conversa
          // ("Compra de 3 pós de café…" respondendo ao dono; explicacao com a palavra
          // "retirada"). Perguntar o valor ali e se meter na conversa. Com "Sol, …"
          // continua perguntando — ai a pessoa esta mesmo ditando uma saida.
          if (!_chamouSolPeloNome(event)) {
            log({ acao: 'saida_texto_sem_valor_conversa', chatId, categoria: categoriaTexto });
            return { acao: 'saida_texto_sem_valor_conversa' };
          }
          await sendFn(chatId, `Entendi que é saída de ${categoriaTexto}, mas falta o valor. Manda de novo com o valor.`);
          log({ acao: 'saida_texto_sem_valor', chatId, categoria: categoriaTexto });
          return { acao: 'saida_texto_sem_valor' };
        }
        if (!forma) {
          // Perguntar sem guardar estado deixa a resposta orfa (02/09): o
          // "Dinheiro" caiu em `nada` e o "Sol, foi dinheiro" foi parar no
          // caminho de CORRIGIR lancamento gravado, sem alvo, 2x. A pendencia
          // e o que liga a resposta a pergunta — e o que da contexto ao
          // roteador V4, que sem ela recebeu "Dinheiro" solto e chutou.
          const askId = await sendFn(chatId, `Entendi que é saída de ${categoriaTexto} de ${fmtBRL(valor)}. Me diz a forma: *dinheiro*, *pix*, *cartão* ou *transferência*.`);
          const arrF = limparVelhos(chatId, agora);
          arrF.push({
            previewId: askId, tipoOperacao: 'aguardando_forma_saida',
            unidade_id: grp.unidade_id, nome: grp.nome,
            valor, forma: null, categoria: categoriaTexto,
            descricao: _descricaoSaidaTexto(texto, categoriaTexto),
            aluno: null, competencia: null, formaIncerta: true,
            origem: event.messageId, idemKey: `${chatId}:${event.messageId}:aguarda-forma`,
            msgIds: [askId], autorPhone: event.senderPhone || null,
            textoOriginal: texto, ts: agora,
          });
          pendentes.set(chatId, arrF);
          log({ acao: 'saida_texto_sem_forma', chatId, categoria: categoriaTexto, valor, pendencia: true });
          return { acao: 'saida_texto_sem_forma' };
        }
        const descricao = _descricaoSaidaTexto(texto, categoriaTexto);
        let textoPreview = montarPreview({
          unidadeNome: grp.nome, valor, forma, categoria: categoriaTexto, descricao,
          aluno: null, competencia: null, parcela: null, confiancaBaixa: false,
          responsavelFinanceiro: null, formaIncerta: false, cartaoModalidade: null,
          cartaoParcelas: null, multiplas: false, alunoViaPagador: null,
          pagadorNome: null, candidatosAluno: null, canonica: null, duplicata: null,
          quitacao: null, faturaIndisponivel: false, composto: null,
          bloqueiaLancamento: false, itemLojinha: null,
        });
        if (dryRun) textoPreview += '\n\n_(modo teste — nada será gravado no caixa)_';
        const previewId = await sendFn(chatId, textoPreview);
        const arr = limparVelhos(chatId, agora);
        let idEnviou = null;
        try { idEnviou = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* best-effort */ }
        const pendencia = {
          previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor, forma,
          categoria: categoriaTexto, aluno: null, competencia: null, descricao,
          // O ditado que gerou o card fica guardado: `_descricaoSaidaTexto` e funcao
          // pura do TEXTO + categoria, entao corrigir so a categoria depois exige o
          // texto original — senao a descricao fica com a categoria velha dentro
          // ("PG Semana Despesa - seguranca") mesmo com o card ja corrigido.
          textoDitado: texto,
          parcela: null, responsavelFinanceiro: null, cartaoModalidade: null,
          cartaoParcelas: null, formaIncerta: false, quitacao: null, multiplas: false,
          composto: null, itemLojinha: null, bloqueiaLancamento: false,
          faturaIndisponivel: false, bloqueiaFonteIndisponivel: false,
          enviadoPor: nomeParaCarimbo(idEnviou, event),
          autorPhone: event.senderPhone || null, autorId: event.senderId || null,
          idemKey: `${chatId}:${event.messageId}`, origem: event.messageId, ts: agora,
        };
        const v3 = await registrarPreviewPublicoV3({
          event, grupo: grp, previewId, texto: textoPreview, pendencia,
          result: { acao: 'saida_texto_preview_enviado', valor, forma, categoria: categoriaTexto },
        });
        if (v3 && v3.preview_id) {
          pendencia.v3PreviewId = v3.preview_id;
          pendencia.v3PreviewHash = v3.preview_hash || null;
        }
        // 🔴 O MESMO DITADO REENVIADO SUBSTITUI O CARD — NAO EMPILHA (09/09/2026).
        // Em 16:09 o Jhon reenviou a frase inteira e nasceu um segundo card; o
        // primeiro ficou aberto e virou "📌 Ainda aguardando: PG Semana Despesa -
        // seguranca — R$ 100,00". Card orfao com valor nao e ruido: um "pode"
        // citando ele lanca os mesmos R$ 100 DE NOVO.
        // ⚠️ O discriminador e o TEXTO, nao so o valor: duas saidas legitimas de
        //    R$ 100 no mesmo dia (seguranca e material) precisam coexistir. Mesmo
        //    texto = a pessoa achou que a Sol nao ouviu, e mandou outra vez.
        const _norm = (x) => bodyLimpo(String(x || '')).toLowerCase().replace(/\s+/g, ' ').trim();
        const _iDup = arr.findIndex((p) => p.unidade_id === grp.unidade_id
          && Number(p.valor) > 0 && Math.abs(Number(p.valor) - valor) < 0.01
          && _norm(p.textoDitado) && _norm(p.textoDitado) === _norm(texto));
        if (_iDup >= 0) {
          const _velho = arr.splice(_iDup, 1)[0];
          log({ acao: 'saida_preview_substitui_reenvio', chatId,
                previewIdAntigo: _velho && _velho.previewId, valor });
        }
        arr.push(pendencia);
        pendentes.set(chatId, arr);
        log({ acao: 'saida_texto_preview_enviado', chatId, previewId, categoria: categoriaTexto, valor });
        return { acao: 'saida_texto_preview_enviado', previewId };
      }
    }

    // 0.55) resposta à lista de lançamentos ambíguos: vira alvo EXATO e reentra
    //       no 0.6 — que monta o card e segue exigindo "pode".
    {
      const escolha = escolhaDaResposta(event, agora);
      if (escolha) {
        if (escolha.foraDaLista) {
          await sendFn(chatId, `Esse número não está na lista. Responde de *1* a *${escolha.esc.items.length}*, ou com o id.`);
          return { acao: 'movimento_escolha_fora_da_lista' };
        }
        escolhasMovimento.delete(chatId);
        log({ acao: 'movimento_escolhido_pelo_humano', chatId, id: String(escolha.item.movimentacao_id || '').slice(0, 8) });
        return handle({ ...event, _sintetico: true, quotedMessageId: null, quotedBody: null,
          body: escolha.esc.cmdMov.tipo === 'estornar' ? 'estornar lançamento' : 'corrigir lançamento',
          caixaToolCommand: escolha.esc.cmdMov, caixaToolTarget: escolha.item, _escolhaMovimento: true }, agora);
      }
    }

    // 0.6) correção/estorno de lançamento já gravado.
    // "Excluir" no caixa vira estorno auditado; alteração de valor/categoria/
    // descrição passa pela RPC de correção controlada. O alvo precisa vir de
    // mensagem citada, memória recente do lançamento ou busca que retorne item único.
    if (!event.hasMedia && !casarPode(event.body).pode) {
      // Mesma separacao da entrada agent-first: a ferramenta escolhe a acao e
      // entrega o comando estruturado; a gramatica continua apenas como
      // compatibilidade do bridge legado.
      let cmdMov = event && event.caixaToolCommand
        ? event.caixaToolCommand
        : extrairComandoMovimento(event.body);
      if (cmdMov && bodyLimpo(event.body).length > 250) {
        log({ acao: 'comando_movimento_ignorado_prosa', chatId, len: bodyLimpo(event.body).length });
        cmdMov = null;
      }
      const pendentesAtivos = limparVelhos(chatId, agora);
      const corrigePreviewAtivo = cmdMov && cmdMov.tipo === 'corrigir' && (
        pendentesAtivos.some((p) => p.previewId === event.quotedMessageId) ||
        (!event.quotedBody && pendentesAtivos.length === 1)
      );
      if (cmdMov && !corrigePreviewAtivo && !_falouComSol(event)) {
        log({ acao: 'comando_movimento_ignorado_conversa', chatId, tipo: cmdMov.tipo, citou: !!event.quotedMessageId });
        cmdMov = null;
      }
      if (cmdMov && !corrigePreviewAtivo) {
        // A tool `caixa_localizar_lancamento` devolve o ID exato. Quando a LLM
        // passa esse alvo, nao reabrimos busca por texto/valor e nunca escolhemos
        // outro movimento parecido.
        let alvo = event && event.caixaToolTarget
          ? event.caixaToolTarget
          : alvoLancado(chatId, event.quotedMessageId, agora);
        const citado = event.quotedBody ? extrairLancamentoCitado(event.quotedBody) : null;
        if (!alvo && citado) {
          let rBusca = null;
          try {
            rBusca = await buscarMovimentosFn({
              unidade_id: grp.unidade_id,
              valor: citado.valor || null,
              categoria: citado.categoria || null,
              forma: citado.formaAtual || null,
              texto: null,
              chat_id: chatId,
              grupo_jid: chatId,
              ator_numero: senderNum,
              ator_papel: 'grupo',
              origem_message_id: event.messageId,
              quoted_message_id: event.quotedMessageId || null,
            });
          } catch (e) {
            log({ acao: 'erro_rpc_buscar_movimento_citado', erro: String(e && e.message) });
          }
          const items = rBusca && Array.isArray(rBusca.items) ? rBusca.items : [];
          if (items.length === 1) alvo = items[0];
          else if (items.length > 1) return pedirEscolhaMovimento({ event, chatId, cmdMov, items, agora });
        }
        if (!alvo) {
          const valorBusca = cmdMov.correcoes && cmdMov.correcoes.valor ? cmdMov.correcoes.valor : extrairValor(event.body, { allowBare: true });
          let rBusca = null;
          try {
            rBusca = await buscarMovimentosFn({
              unidade_id: grp.unidade_id,
              valor: valorBusca || null,
              texto: valorBusca ? null : bodyLimpo(event.body).replace(/^sol\b\s*[,;:-]?\s*/i, '').slice(0, 80),
              chat_id: chatId,
              grupo_jid: chatId,
              ator_numero: senderNum,
              ator_papel: 'grupo',
              origem_message_id: event.messageId,
              quoted_message_id: event.quotedMessageId || null,
            });
          } catch (e) {
            log({ acao: 'erro_rpc_buscar_movimento', erro: String(e && e.message) });
          }
          const items = rBusca && Array.isArray(rBusca.items) ? rBusca.items : [];
          if (items.length === 1) alvo = items[0];
          else if (items.length > 1) return pedirEscolhaMovimento({ event, chatId, cmdMov, items, agora });
        }
        const movimentacaoId = alvo && (alvo.movimentacao_id || alvo.movimentacaoId);
        if (!movimentacaoId) {
          await sendFn(chatId, 'Consigo corrigir/estornar, mas preciso saber qual lançamento. Responde citando minha mensagem do lançamento.');
          log({ acao: 'movimento_sem_alvo', chatId, tipo: cmdMov.tipo });
          return { acao: 'movimento_sem_alvo' };
        }
        if (dryRun) {
          await sendFn(chatId, `🧪 (teste) Eu ${cmdMov.tipo === 'estornar' ? 'estornaria' : 'corrigiria'} o lançamento ${movimentacaoId}.`);
          return { acao: `dryrun_${cmdMov.tipo}_movimento` };
        }
        let idAut = null;
        try { idAut = await identidadeFn(event.senderPhone || event.senderId, grp.unidade_id); } catch (e) { /* best-effort */ }
        const autorizadoPor = nomeParaCarimbo(idAut, event);
        const payloadBase = {
          movimentacao_id: movimentacaoId,
          unidade_id: alvo.unidade_id || grp.unidade_id,
          valor: String(cmdMov.tipo === 'estornar' ? (alvo.valor || 0) : (cmdMov.correcoes && cmdMov.correcoes.valor ? cmdMov.correcoes.valor : (alvo.valor || 0))),
          forma: String((cmdMov.correcoes && (cmdMov.correcoes.forma_pagamento || cmdMov.correcoes.forma)) || alvo.forma_pagamento || alvo.forma || ''),
          categoria: String((cmdMov.correcoes && cmdMov.correcoes.categoria) || alvo.categoria || 'movimento'),
          ator_numero: senderNum,
          ator_papel: 'grupo',
          grupo_jid: chatId,
          chat_id: chatId,
          origem_message_id: event.messageId,
          preview_message_id: event.quotedMessageId || alvo.previewId || alvo.confirmMessageId || null,
          autorizado_por: autorizadoPor,
          motivo: cmdMov.motivo,
          idempotency_key: `${chatId}:${event.messageId}:${cmdMov.tipo}:${movimentacaoId}`,
        };
        if (v3LedgerAtivo) {
          const opLabel = cmdMov.tipo === 'estornar' ? 'estorno' : 'correção';
          const valorPreview = Number(payloadBase.valor || 0);
          const formaPreview = payloadBase.forma || 'sem forma';
          const categoriaPreview = payloadBase.categoria || 'movimento';
          let textoPreview = cmdMov.tipo === 'estornar'
            ? `Vou estornar este lançamento no caixa da ${grp.nome}: ${fmtBRL(valorPreview)} · ${categoriaPreview} · ${formaPreview}.\nNão vou apagar o original; vou criar um movimento inverso auditado.\n\n👉 Posso estornar agora? Responde *pode*.`
            : `Vou corrigir este lançamento no caixa da ${grp.nome}: ${fmtBRL(valorPreview)} · ${categoriaPreview} · ${formaPreview}.\n\n👉 Posso corrigir agora? Responde *pode*.`;
          // Escolhido numa lista de iguais (SOL-114, 29/09/2026): o card diz QUAL é —
          // hora, quem lançou e id — para o "pode" ser sobre o lançamento certo.
          if (event._escolhaMovimento) {
            textoPreview = textoPreview.replace('\n', `\nÉ o lançamento das ${horaMovimento(alvo)} · lançado por ${quemLancouMovimento(alvo)} · id \`${String(movimentacaoId).slice(0, 8)}\`.\n`);
          }
          const previewId = await sendFn(chatId, textoPreview);
          const pendenciaOperacao = {
            previewId,
            tipoOperacao: cmdMov.tipo === 'estornar' ? 'estornar_movimento' : 'corrigir_movimento',
            v3Operacao: cmdMov.tipo === 'estornar' ? 'estorno' : 'correcao_movimento',
            unidade_id: payloadBase.unidade_id,
            nome: grp.nome,
            valor: valorPreview,
            forma: payloadBase.forma,
            categoria: payloadBase.categoria,
            aluno: null,
            descricao: cmdMov.tipo === 'estornar' ? 'Estorno de movimento' : 'Correção de movimento',
            idemKey: payloadBase.idempotency_key,
            origem: event.messageId,
            payloadBase,
            correcoes: cmdMov.correcoes || null,
            movimentacao_id: movimentacaoId,
            ts: agora,
          };
          const v3 = await registrarPreviewPublicoV3({
            event, grupo: grp, previewId, texto: textoPreview, pendencia: pendenciaOperacao,
            result: { acao: 'movimento_operacao_preview_enviado', tipo: pendenciaOperacao.tipoOperacao, movimentacao_id: movimentacaoId },
          });
          if (v3 && v3.preview_id) {
            pendenciaOperacao.v3PreviewId = v3.preview_id;
            pendenciaOperacao.v3PreviewHash = v3.preview_hash || null;
          }
          const arr = limparVelhos(chatId, agora);
          arr.push(pendenciaOperacao);
          pendentes.set(chatId, arr);
          log({ acao: 'movimento_operacao_preview_enviado', tipo: pendenciaOperacao.tipoOperacao, movimentacao_id: movimentacaoId });
          return { acao: 'movimento_operacao_preview_enviado', tipo: pendenciaOperacao.tipoOperacao, movimentacao_id: movimentacaoId };
        }
        if (cmdMov.tipo === 'estornar') {
          let rEst;
          try { rEst = await estornarMovimentoFn(payloadBase); }
          catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao estornar. Já registrei o problema.'); log({ acao: 'erro_rpc_estornar_movimento', erro: String(e && e.message) }); return { acao: 'erro_estornar_movimento' }; }
          if (rEst && rEst.ok) {
            await sendFn(chatId, `Estornei no caixa: ${fmtBRL(rEst.valor || alvo.valor)}. Não apaguei o original; criei o movimento inverso auditado.`);
            log({ acao: 'movimento_estornado', movimentacao_id: movimentacaoId, estorno_id: rEst.movimentacao_estorno_id });
            return { acao: 'movimento_estornado', movimentacao_id: movimentacaoId, movimentacao_estorno_id: rEst.movimentacao_estorno_id };
          }
          await sendFn(chatId, `⚠️ Não consegui estornar: ${rEst && rEst.motivo ? rEst.motivo : 'erro desconhecido'}.`);
          log({ acao: 'estorno_recusado', motivo: rEst && rEst.motivo });
          return { acao: 'estorno_recusado', motivo: rEst && rEst.motivo };
        }
        let rCorr;
        try { rCorr = await corrigirMovimentoFn({ ...payloadBase, correcoes: cmdMov.correcoes }); }
        catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao corrigir. Já registrei o problema.'); log({ acao: 'erro_rpc_corrigir_movimento', erro: String(e && e.message) }); return { acao: 'erro_corrigir_movimento' }; }
        if (rCorr && rCorr.ok) {
          const depois = rCorr.depois || {};
          await sendFn(chatId, `Corrigi no caixa: ${fmtBRL(depois.valor || alvo.valor)} · ${depois.categoria || alvo.categoria || 'lançamento'} · ${depois.forma_pagamento || alvo.forma || alvo.forma_pagamento || ''}.`);
          log({ acao: 'movimento_corrigido', movimentacao_id: movimentacaoId });
          return { acao: 'movimento_corrigido', movimentacao_id: movimentacaoId };
        }
        await sendFn(chatId, `⚠️ Não consegui corrigir: ${rCorr && rCorr.motivo ? rCorr.motivo : 'erro desconhecido'}.`);
        log({ acao: 'movimento_correcao_recusada', motivo: rCorr && rCorr.motivo });
        return { acao: 'movimento_correcao_recusada', motivo: rCorr && rCorr.motivo };
      }
    }

    // 1) comprovante -> preview
    const det = detectarComprovante(event);
    if (event.hasMedia && det.ok) {
      const lote = await prepararLoteMidia(event, agora);
      if (lote.skip) return { acao: lote.acao };
      event = lote.event;
      // O lote costurou legenda: a mídia deixou de ser "sem legenda" (SOL-110).
      if (event._legendaTardiaRec && !event._legendaTardia && bodyLimpo(event.body)) event._legendaTardiaRec.temLegenda = true;
      const idemKey = `${chatId}:${event.messageId}`;
      if (vistos.has(idemKey)) return { acao: 'dup_ignorada' };
      vistos.add(idemKey);
      let valor = extrairValor(event.body);
      let forma = extrairForma(event.body, null);
      let cartaoModalidade = null, cartaoParcelas = null;
      const media = (event.mediaUrls || [])[0];
      const midiaPreprocessada = event.caixaMediaEvidence || null;
      // Camada 1: OCR LOCAL (igual Maria) -- roda sempre que ha midia (texto p/ valor E interpretacao)
      let ocrText = midiaPreprocessada ? String(midiaPreprocessada.ocrText || '') : '';
      let ocrMeta = midiaPreprocessada
        ? { ...(midiaPreprocessada.ocrMeta || {}) }
        : { status: 'nao_executado', duration_ms: 0, file_bytes: null };
      if (midiaPreprocessada) {
        if (!valor && midiaPreprocessada.valor) valor = Number(midiaPreprocessada.valor);
        if (!forma && midiaPreprocessada.forma) forma = midiaPreprocessada.forma;
        cartaoModalidade = midiaPreprocessada.cartaoModalidade || null;
        cartaoParcelas = midiaPreprocessada.cartaoParcelas || null;
      }
      if (media && !midiaPreprocessada) {
        try {
          log({ acao: 'ocr_attempt', chatId });
          const rawOcr = await ocrFn(media, { detailed: true });
          // 🔴 SEGUNDA CHANCE: o rapido desistiu (vazio, erro ou timeout). E o
          //    caso da Mayra hoje: PDF com tesseract_error cujo valor a Sol
          //    nunca leu, e ela pediu a legenda que acabara de receber.
          if (!String((rawOcr && rawOcr.text) || rawOcr || '').trim()) {
            const _alt = ocrSegundaChance(media);
            if (_alt) {
              // ⚠️ confianca e QR: a Sol NUNCA teve. Saber que NAO leu vale
              //    mais que ler mais — sem isso ela trata leitura ruim como boa.
              ocrText = String(_alt.text || '');
              ocrMeta = Object.assign({}, ocrMeta, {
                status: 'ok_segunda_chance',
                ocr_confidence: _alt.ocr_confidence,
                needs_human_confirmation: _alt.needs_human_confirmation,
                qr: _alt.qr || [], pix_payloads: _alt.pix_payloads || [] });
              log({ acao: 'ocr_segunda_chance', chatId, engine: _alt.engine,
                    conf: _alt.ocr_confidence, chars: ocrText.length,
                    qr: (_alt.qr || []).length });
            }
          }
          if (rawOcr && typeof rawOcr === 'object' && Object.prototype.hasOwnProperty.call(rawOcr, 'text')) {
            ocrText = String(rawOcr.text || '');
            ocrMeta = { ...ocrMeta, ...rawOcr };
          } else {
            ocrText = String(rawOcr || '');
            ocrMeta = { ...ocrMeta, status: ocrText.trim() ? 'ok' : 'texto_vazio' };
          }
        } catch (e) {
          ocrText = '';
          ocrMeta = { ...ocrMeta, status: 'ocr_exception', error_code: e && e.code || null, error_message: e && e.message || null };
        }
        log({
          acao: 'ocr_result', chatId, ocr_text_len: ocrText.length,
          ocr_status: ocrMeta.status, ocr_duration_ms: ocrMeta.duration_ms || null,
          ocr_file_bytes: ocrMeta.file_bytes || null, ocr_exit_code: ocrMeta.exit_code || null,
          ocr_signal: ocrMeta.signal || null, ocr_timed_out: Boolean(ocrMeta.timed_out),
        });
        if (!valor) { const vv = extrairValorOcr(ocrText); if (vv) valor = vv; }
        if (!forma) { const ff = extrairForma(ocrText, null); if (ff) forma = ff; }
        // Neste ponto so existe evidencia da IMAGEM. A legenda humana (inclusive
        // a bolha irma) sera aplicada depois e sempre tera precedencia.
        const cc = extrairCartao(ocrText);
        if (cc) { forma = 'cartao'; cartaoModalidade = cc.modalidade; cartaoParcelas = cc.parcelas; }
      }
      // Camada 2: visao OAuth e' fallback do OCR — inclusive quando ele falha.
      // O fluxo antigo recusava a midia antes de chegar aqui justamente no caso
      // de texto vazio/timeout, que e' quando a visao e' mais necessaria.
      let alunoVis = midiaPreprocessada && midiaPreprocessada.visao && midiaPreprocessada.visao.aluno || null;
      let pagadorVis = midiaPreprocessada && midiaPreprocessada.pagador || null;
      let visao = midiaPreprocessada && midiaPreprocessada.visao || null;
      // ⚠️ Tambem por FORMA ausente. A forma e' tao essencial quanto o valor: sem
      // ela o card trava e pede "pode, pix / pode, dinheiro / pode, cartao" — e
      // convidar a equipe a escolher a forma de cabeca num cupom de CARTAO e' como
      // dinheiro entra no caixa na linha errada.
      // Caso Arthur/Barra 29/08: foto torta de cupom PagBank num sofa escuro; o OCR
      // devolveu 452 chars de ruido (acima do limiar de 20, sem UM sinal de cartao)
      // e a legenda trazia o valor — entao nada disparava a visao. As 11:27 a MESMA
      // foto, com legenda SEM valor, saiu "cartao credito" certinho: dar mais
      // informacao fazia a Sol saber menos.
      if (media && !midiaPreprocessada && (!valor || !forma || ocrText.trim().length < 20)) {
        try {
          log({ acao: 'fallback_vision_attempt', chatId,
                motivo: ocrText.trim().length < 20 ? (ocrMeta.status || 'ocr_curto')
                  : !valor ? 'valor_ausente' : 'forma_ausente' });
          visao = await visaoFn(media);
          log({ acao: 'fallback_vision_result', ok: !!(visao && visao.valor), chatId });
          if (visao) {
            if (!valor && visao.valor) valor = visao.valor;
            if (!forma && visao.forma) forma = visao.forma;
            if (visao.pagador_nome) pagadorVis = visao.pagador_nome;
            // Quando a visão não distinguiu aluno de pagador, trata esse nome
            // primeiro como pagador. A canônica decide se é a própria aluna.
            if (visao.aluno) {
              alunoVis = visao.aluno;
              if (!pagadorVis) pagadorVis = visao.aluno;
            }
          }
        } catch (e) {
          log({ acao: 'fallback_vision_error', chatId, error_code: e && e.code || null, error_message: e && e.message || null });
        }
      }
      // 🔴 ESPIADA NA IRMÃ ANTES DE CLASSIFICAR. A costura da mensagem irmã
      //    existe ~10 linhas abaixo, mas fica DEPOIS do `return` de mídia
      //    recusada: com o OCR falhando, o fluxo devolvia "não consegui ler"
      //    sem nunca olhar o texto que a pessoa mandou no mesmo segundo.
      //    Caso Mayra/Lucca, CG 08/09 11:30 — ela pediu a legenda que tinha
      //    acabado de receber, e o lançamento de R$ 347 nunca saiu.
      // ⚠️ Só ESPIA: não consome (`textosRecentes.delete` é do bloco de baixo,
      //    que ainda faz o backfill de valor/forma). Deletar aqui quebraria ele.
      // LEGENDA TARDIA (29/09/2026, CG 14:36): guarda a leitura da IMAGEM (antes de
      // qualquer legenda) para a reavaliação não repetir OCR/visão; e, se a legenda
      // do mesmo autor já chegou enquanto a imagem era lida, ela entra AGORA, antes
      // de classificar e de interpretar — é a legenda desta mídia.
      const _recLT = event._legendaTardiaRec || null;
      if (_recLT && !_recLT.evidencia) {
        _recLT.evidencia = {
          ocrText, ocrMeta, visao, valor: Number(valor) || null, forma: forma || null,
          cartaoModalidade, cartaoParcelas,
          pagador: pagadorVis || (visao && (visao.pagador_nome || visao.aluno)) || null,
        };
      }
      if (_recLT && _recLT.legenda && !_recLT.consumida && !bodyLimpo(event.body)) {
        _recLT.consumida = true;
        event = { ...event, body: _recLT.legenda };
        const _vLT = extrairValor(event.body);
        if (_vLT) valor = _vLT;
        log({ acao: 'legenda_tardia_lida_antes_da_interpretacao', chatId });
      }
      let _bodyComIrma = event.body;
      try {
        const _kEsp = textoIrmaoKey(event);
        const _bufEsp = textosRecentes.get(_kEsp);
        // 🔴 29/09/2026 (SOL-110b): a janela era de 150 s para trás, e "Sol, a Fulana
        //    já pagou ontem, desconsidera" virou a legenda de um comprovante de OUTRO
        //    pagamento mandado 90 s depois. Legenda é o texto que acompanha a mídia:
        //    a mesma janela de 60 s da legenda tardia, nos dois sentidos.
        const _frescoEsp = _bufEsp && _bufEsp.ts >= agora - LEGENDA_TARDIA_MS && _bufEsp.ts <= agora + 60000;
        if (_frescoEsp && bodyLimpo(_bufEsp.texto)
            && bodyLimpo(_bufEsp.texto) !== bodyLimpo(event.body)) {
          _bodyComIrma = (bodyLimpo(event.body) ? bodyLimpo(event.body) + ' \u00b7 ' : '')
                         + bodyLimpo(_bufEsp.texto);
          log({ acao: 'legenda_irma_espiada', chatId, tinha_ocr: Boolean(ocrText) });
        }
      } catch (_) { _bodyComIrma = event.body; }

      // PORTA 2: print de tela / orçamento NÃO viram recebimento.
      let cls = classificarMidia(ocrText, _bodyComIrma);
      // A visao so promove para comprovante quando trouxe dado financeiro;
      // print/orcamento sem esse sinal continua bloqueado.
      if (cls.tipo !== 'comprovante' && visao && (visao.valor || visao.aluno)) cls = { tipo: 'comprovante', motivo: 'vision_fallback' };
      if (cls.tipo !== 'comprovante') {
        // Legenda tardia chegou durante a leitura: não recusa em cima dela — a
        // reavaliação (no topo do handle) decide com a legenda.
        if (_recLT && _recLT.legenda && !_recLT.consumida) {
          log({ acao: 'midia_adiada_legenda_tardia', chatId, etapa: 'recusa' });
          return { acao: 'midia_adiada_legenda_tardia' };
        }
        log({ acao: 'midia_recusada', tipo: cls.tipo, motivo: cls.motivo, chatId });
        if (cls.tipo === 'despesa') {
          await sendFn(chatId, '📄 Isso parece um orçamento/compra (despesa), não um recebimento — não lancei nada no caixa.');
        } else if (cls.motivo === 'nao_consegui_ler') {
          await sendFn(chatId, '👀 Recebi, mas não consegui ler. Se for comprovante, manda com a legenda (ex.: *comprovante pix R$ 300 - Fulano*).');
        }
        return { acao: 'midia_recusada', tipo: cls.tipo, motivo: cls.motivo };
      }
      // Legenda EFETIVA: costura a legenda da propria midia com a mensagem IRMA (o nome do
      // aluno que veio em bolha separada ~0,1s). Igual a Maria: o texto adjacente NAO se perde.
      let legendaEfetiva = bodyLimpo(event.body);
      let formaHumanaAmbigua = false;
      {
        const _kTextoIrmao = textoIrmaoKey(event);
        const _buf = textosRecentes.get(_kTextoIrmao);
        const _fresco = _buf && _buf.ts >= agora - LEGENDA_TARDIA_MS && _buf.ts <= agora + 60000;
        const _temNome = _fresco && (_alunoRotulado(_buf.texto) || nomePlausivel(_alunoFromCaption(_buf.texto)));
        if (_temNome && bodyLimpo(_buf.texto) && bodyLimpo(_buf.texto) !== legendaEfetiva) {
          legendaEfetiva = (legendaEfetiva ? legendaEfetiva + ' \u00b7 ' : '') + bodyLimpo(_buf.texto);
          textosRecentes.delete(_kTextoIrmao);
          log({ acao: 'legenda_irma_anexada', chatId });
          // ⚠️ A irma pode chegar DEPOIS de o valor ja ter sido procurado (OCR ->
          // 45s de visao -> so entao anexa). Caso Livia 29/08: "...R$100,00" na
          // legenda e o card saiu "valor nao identificado". Backfill do que falta.
          if (!valor) { const _vIrma = extrairValor(legendaEfetiva); if (_vIrma) valor = _vIrma; }
          if (!forma) { const _fIrma = extrairForma(legendaEfetiva, null); if (_fIrma) forma = _fIrma; }
        }
      }
      // A legenda da propria midia e a bolha irma sao a fala humana efetiva.
      // Elas vencem OCR e visao para a forma, assim como ja vencem o OCR para o
      // valor. Caso Sarah/CG 12/09: "PG PIX" foi lido corretamente pelo shadow,
      // mas o OCR forte de cartao sobrescreveu o preview antes desta costura.
      {
        const _fh = extrairFormaHumana(legendaEfetiva);
        if (_fh.ambigua) {
          formaHumanaAmbigua = true;
          forma = null; cartaoModalidade = null; cartaoParcelas = null;
          log({ acao: 'forma_humana_ambigua', chatId, formas: _fh.formas });
        } else if (_fh.forma) {
          if (forma && (forma !== _fh.forma
              || cartaoModalidade !== _fh.cartaoModalidade
              || cartaoParcelas !== _fh.cartaoParcelas)) {
            log({ acao: 'forma_humana_vence_inferencia', chatId,
              inferida: forma, humana: _fh.forma });
          }
          forma = _fh.forma;
          cartaoModalidade = _fh.cartaoModalidade;
          cartaoParcelas = _fh.cartaoParcelas;
        }
      }
      // R-j (31/08): a legenda humana com R$ explicito VENCE o valor do OCR.
      // O tesseract perdeu a virgula ("387,00" -> "38700") e o card nasceu com
      // R$ 38.700,00 tendo "R$387,00" escrito pela Mayra na legenda-irma — o
      // backfill era só `if (!valor)`, entao o OCR errado ganhava do humano.
      // 02/10/2026 (Recreio, retirada R$ 1.000 que virou R$ 2,00): a regra acima
      // virou ARBITRAGEM. O valor da imagem é lido sempre (não só quando a
      // legenda não tem valor) e confrontado com o humano; divergência real e
      // leitura de baixa confiança produzem card SEM valor, que pergunta.
      let valorConflito = null;
      let valorBaixaConfianca = false;
      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);
      {
        const _vHumano = somaLegenda ? somaLegenda.total : extrairValor(legendaEfetiva);
        const _ocrDet = extrairValorOcrDetalhado(ocrText);
        const _vImagem = _ocrDet.valor
          || valorDoModelo(visao && visao.valor)
          || valorDoModelo(midiaPreprocessada && midiaPreprocessada.valor)
          || (!_vHumano ? (Number(valor) || null) : null);
        const _declarados = candidatosMonetariosBR(legendaEfetiva).map((c) => c.valor);
        const _arb = arbitrarValorComprovante({ humano: _vHumano, declarados: _declarados, comprovante: _vImagem,
          comprovanteBaixaConfianca: !!(_ocrDet.valor && _ocrDet.baixaConfianca) });
        if (_arb.motivo === 'ocr_perdeu_virgula') {
          log({ acao: 'valor_da_legenda_vence_ocr', chatId, ocr: _vImagem, legenda: _vHumano });
        } else if (_arb.motivo === 'conflito_legenda_comprovante') {
          log({ acao: 'valor_conflito_legenda_comprovante', chatId, legenda: _vHumano, comprovante: _vImagem });
        } else if (_arb.motivo === 'comprovante_baixa_confianca') {
          log({ acao: 'valor_comprovante_baixa_confianca', chatId, candidatos: _ocrDet.candidatos.length });
        }
        if (somaLegenda && _arb.valor) log({ acao: 'valor_soma_legenda', chatId, total: _arb.valor, partes: somaLegenda.partes.length });
        valor = _arb.valor;
        valorConflito = _arb.conflito;
        valorBaixaConfianca = !!_arb.baixaConfianca;
      }
      // F2 (01/09): a legenda trazia 1.290, 432 E o total 1.722; o card saiu
      // com 1.290 dizendo "confere". Se a propria legenda tem um valor MAIOR
      // que o do card, e' sinal de pagamento de mais gente/parcial — avisa.
      let valorMaiorNaLegenda = null;
      {
        const _vals = (String(legendaEfetiva || '').match(/r?\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\b\d{2,6},\d{2}\b/gi) || [])
          .map((s) => parseBRMoney(s)).filter((v) => v && v > 0);
        const _max = _vals.length ? Math.max.apply(null, _vals) : 0;
        if (valor && _max > Number(valor) + 0.01) valorMaiorNaLegenda = _max;
      }
      // VENDA DE INGRESSO por comprovante (02/10/2026). Caso real CG 18:21: "2 ingressos
      // LA Session Felipe Alves" virou lojinha e o artista virou aluno. A natureza vem
      // só da fala humana (legenda + bolha irmã), nunca do OCR nem do valor, e é
      // decidida ANTES do interpretador LLM. Conflito de leitura continua fail-closed.
      const _natMidia = naturezaVendaDoTexto(legendaEfetiva, { config: configIngressos(),
        unidade: { id: grp.unidade_id, nome: grp.nome }, resposta: event._respostaNatureza || null });
      if (_natMidia && _natMidia.tipo === 'ingresso') {
        if (valorConflito || valorBaixaConfianca) {
          await sendFn(chatId, '⚠️ Entendi que é venda de ingresso, mas o valor do texto e do comprovante não ficou seguro. Não criei card; confere o valor total e reenvia.');
          log({ acao: 'venda_ingresso_valor_inseguro', chatId,
            conflito: !!valorConflito, baixa_confianca: valorBaixaConfianca });
          return { acao: 'venda_ingresso_valor_inseguro' };
        }
        return abrirFluxoVendaIngresso({ event, grupo: grp, natureza: _natMidia, valor, forma, agora,
          origemMessageId: event.messageId, cartaoModalidade, cartaoParcelas });
      }
      if (_natMidia && _natMidia.tipo === 'perguntar' && !event._respostaNatureza) {
        // Guarda a fala humana EFETIVA (legenda + bolha irmã): a resposta continua dela.
        return perguntarNaturezaVenda({ event: { ...event, body: legendaEfetiva }, motivo: _natMidia.motivo, valor, forma });
      }
      // Camada 3: INTERPRETACAO FLUIDA (categoria/aluno/competencia via LLM texto; humano confirma)
      let categoria = null, aluno = null, competencia = null;
      let interpretacaoLLM = null;
      // ⚠️ fora do try de proposito: `it` morre no fim do bloco, e o portao do
      //    pagamento inteiro (mais abaixo) precisa da lista de pessoas.
      let pagamentosLLM = [];
      try {
        log({ acao: 'interpretar_attempt', chatId });
        const it = await interpretarFn((legendaEfetiva + '\n' + ocrText).trim());
        interpretacaoLLM = it || null;
        log({ acao: 'interpretar_result', categoria: it && it.categoria });
        if (it) { categoria = it.categoria; aluno = it.aluno; competencia = it.competencia; if (!forma && !formaHumanaAmbigua && it.forma) forma = it.forma;
          pagamentosLLM = Array.isArray(it.pagamentos) ? it.pagamentos : []; }
      } catch (e) { /* best-effort */ }
      const textoClassificacao = legendaEfetiva + '\n' + ocrText;
      // Categoria de SAIDA (seguranca/despesa/retirada/troco) so pode nascer do que a
      // PESSOA escreveu, nunca do OCR do comprovante: o PDF do Santander tem "Chave de
      // seguranca" no rodape e o regex pescava isso -> parcela de aluna virava saida de
      // cofre -> recusa "saida de cofre precisa ser em dinheiro" (caso real Valentina/
      // Recreio 24/08/2026, R$ 814,81). Entrada segue lendo legenda + OCR normalmente.
      const categoriaLegenda = _categoriaFromCaption(textoClassificacao);
      const _catExpBruta = _categoriaExplicitaFromCaption(textoClassificacao);
      const _catExpSoLegenda = _categoriaExplicitaFromCaption(legendaEfetiva);
      const categoriaExplicita = (categoriaEhSaida(_catExpBruta) && !categoriaEhSaida(_catExpSoLegenda))
        ? _catExpSoLegenda
        : _catExpBruta;
      const lojinhaInfo = categoriaLegenda === 'passaporte' ? null : detectarLojinhaProduto(textoClassificacao);
      // SAIDA declarada na legenda manda em tudo — inclusive no palpite do LLM,
      // que aqui ja veio como 'lojinha'/'outro'. Fica ANTES de lojinha de proposito:
      // "compra de 2 refrigerantes" tem produto, mas e' despesa, nao venda.
      // ⚠️ legendaEfetiva, NAO textoClassificacao: este ultimo carrega o OCR.
      const _catSaidaLegenda = _saidaExplicitaFromCaption(legendaEfetiva);
      if (_catSaidaLegenda) categoria = _catSaidaLegenda;
      else if (categoriaExplicita === 'parcela') categoria = 'parcela';
      else if (categoriaExplicita === 'seguranca') categoria = 'seguranca';
      else if (categoriaLegenda === 'passaporte') categoria = 'passaporte';
      else if (lojinhaInfo) categoria = 'lojinha';
      const _catLegendaSegura = (categoriaEhSaida(categoriaLegenda) && !categoriaEhSaida(_categoriaFromCaption(legendaEfetiva)))
        ? _categoriaFromCaption(legendaEfetiva)
        : categoriaLegenda;
      categoria = categoria || _catLegendaSegura;
      const competenciaHumana = extrairCompetenciaTexto(legendaEfetiva);
      // Competência escrita pela equipe na legenda é evidência explícita e
      // vence qualquer palpite do LLM. O LLM não pode trocar 09/2026 por 08/2026.
      competencia = competenciaHumana || competencia;
      // Este e o MESMO envelope de midia+legenda que ja existia, agora com a
      // arbitragem dos campos formalizada. Ainda nao manda no dinheiro: serve
      // de sombra auditavel ate o corpus e os casos vivos fecharem.
      let evidenceEnvelope = construirEnvelopeEvidenciasV1({
        textoHumano: legendaEfetiva,
        ocrText,
        ocrMeta,
        visao,
        llm: interpretacaoLLM,
      });
      // Isabella/CG 14/09: "parcelas 08/2026 e 09/2026" e um contrato
      // deterministico completo. Roteia antes do singular e antes do detector
      // de multi-ALUNO: um aluno com duas faturas continua sendo um lote.
      const _competenciasDaLegenda = extrairCompetenciasTexto(legendaEfetiva);
      const _alunoDaLegenda = _alunoRotulado(legendaEfetiva);
      // ⚠️ INTERVALO nao e LISTA (25/09/2026). "parcelas de 09/2026 a 08/2027" tem
      // dois MM/AAAA, e este caminho lia os dois como "09/2026 e 08/2027" -- recusava
      // o card do Lucas (contrato inteiro, 12 meses) como "duas parcelas divergentes".
      // Periodo declarado e quitacao: vai para `multiplas`, que resolve as N faturas.
      const _periodoDaLegenda = extrairPeriodoMeses(legendaEfetiva);
      // SOL-134 (29/09/2026): excedente declarado como adiantamento. Antes das
      // competências explícitas: o mês do adiantamento não é parcela a quitar.
      {
        const _adiant = extrairAdiantamentoDeclarado(legendaEfetiva);
        if (_adiant && !categoriaEhSaida(categoria)) {
          // O total do pagamento: o "total" escrito pela equipe; sem ele, o valor
          // lido do comprovante. A 1ª cifra da legenda (que vence o OCR no card
          // singular) aqui é um dos ITENS, não o pagamento.
          const _mTot = _normConf(legendaEfetiva).match(/\btotal\b[^0-9]{0,15}?(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/);
          const _totDecl = _mTot ? parseBRMoney('R$ ' + _mTot[1]) : null;
          const _totOcr = extrairValorOcr(ocrText) || (visao && Number(visao.valor)) || null;
          const _alunoNoTexto = (n) => !!(n && nomePlausivel(n)
            && _normConf(legendaEfetiva).includes(_normConf(n)));
          // Aluno: o rótulo humano ou o nome que o modelo tirou do texto — desde
          // que esteja escrito na legenda. Nunca o pagador, nunca um palpite.
          const _alunoAd = _alunoDaLegenda || (_alunoNoTexto(aluno) ? aluno : null);
          if (_totDecl && _totOcr && Math.abs(_totDecl - _totOcr) > 0.01) {
            await sendFn(chatId, `Entendi o adiantamento de *${fmtBRL(_adiant.valor)}* para a parcela *${_adiant.competencia}*, `
              + `mas o total escrito (*${fmtBRL(_totDecl)}*) difere do comprovante (*${fmtBRL(_totOcr)}*). Confere o valor.\n\n⚠️ Não criei um card aprovável.`);
            log({ acao: 'adiantamento_sem_fechamento', chatId, motivo: 'total_diverge_comprovante',
                  total_escrito: _totDecl, comprovante: _totOcr });
            return { acao: 'adiantamento_sem_fechamento', motivo: 'total_diverge_comprovante' };
          }
          const _totalAd = _totDecl || _totOcr || Number(valor);
          if (_totalAd > _adiant.valor) {
            const _rAd = await tratarPagamentoComAdiantamento({ event, grupo: grp, agora,
              textoHumano: legendaEfetiva, textoFonte: textoClassificacao, adiantamento: _adiant,
              aluno: _alunoAd, valor: _totalAd, forma, evidenceEnvelope });
            if (_rAd) return _rAd;
          }
        }
      }
      if (_competenciasDaLegenda.length >= 2 && _alunoDaLegenda && !_periodoDaLegenda
          && Number(valor) > 0 && forma && !categoriaEhSaida(categoria)) {
        const _parcelas = await tratarParcelasCompetenciasExplicitas({
          event, grupo: grp, agora, texto: legendaEfetiva,
          aluno: _alunoDaLegenda, valor, forma, categoria: categoria || 'parcela',
          origemMessageId: event.messageId, evidenceEnvelope,
        });
        if (_parcelas) return _parcelas;
      }
      // Antes de qualquer casador singular: pluralidade contextual abre um
      // contrato próprio. Regex só roteia; LLM extrai; banco confirma itens.
      // ⚠️ Multi-aluno e' decisao de QUEM ESCREVEU, nunca do OCR: todo comprovante
      // PIX traz o nome do PAGADOR, e qualquer linha do recibo com dois grupos de
      // nomes ligados por "e" dispara o detector (medido: "SELMA DE MATTOS LINDO
      // BRAGA e LA MUSIK KIDS" -> true). Quando a legenda rotula UM aluno e nao tem
      // sinal de multi, o humano ja respondeu -- o recibo nao pode contradizer.
      // Caso Mayra/CG 28/08: "aluno Arthur de Jesus Lindo Braga" virou "mais de um
      // aluno" e o lancamento travou.
      // Multi-aluno so nasce do que o HUMANO escreveu — NUNCA do OCR. Recibo
      // carrega pagador, estabelecimento e conectivos ("e"); ja produziu multi
      // falso 2x em 2 dias (PIX 28/08; camisa PagBank 29/08, com o interpretador
      // dizendo lojinha e R$65 de UMA camisa). Sem legenda util o single cuida:
      // card sem aluno pergunta o nome.
      // 🔴 O REGEX DEIXA DE SER PORTEIRO (09/09, decisao do Luciano).
      // Ele acerta quando os nomes estao colados no "e" e erra em toda variacao
      // de escrita — parenteses, virgula, "aluno X - 4 cursos". Quem entende
      // prosa e o modelo; o regex fica como atalho barato.
      // 🔴 VENDEDOR NÃO É ALUNO, NEM NO PORTÃO DO MULTI (Barra 06/10/2026). O
      //    modelo listou "<Aluno>" e "<Professor>" (de "Venda <Professor>") como
      //    dois pagamentos; os dois nomes estão na legenda, o portão abriu e a
      //    Sol disse "a soma dos alunos não fecha" para UMA venda de R$ 100. Só
      //    em venda (lojinha) e só com o cadastro da equipe confirmando a pessoa.
      let vendedorEquipe = null;
      if ((lojinhaInfo || categoria === 'lojinha') && !categoriaEhSaida(categoria)) {
        vendedorEquipe = await vendedorDaEquipe(legendaEfetiva, { chatId,
          comprador: _compradorDeclaradoLojinha(legendaEfetiva) });
        if (vendedorEquipe) {
          const _antes = pagamentosLLM.length;
          pagamentosLLM = pagamentosLLM.filter((p) => !_ehOVendedor(p && p.aluno, vendedorEquipe));
          if (aluno && _ehOVendedor(aluno, vendedorEquipe)) aluno = null;
          if (_antes !== pagamentosLLM.length) {
            log({ acao: 'vendedor_fora_dos_pagamentos', chatId, removidos: _antes - pagamentosLLM.length });
          }
        }
      }
      const _pagLLM = pagamentosNaLegenda(pagamentosLLM, legendaEfetiva);
      const _multiPorLLM = _pagLLM.length >= 2;
      if (_multiPorLLM && !detectarContextoMultiAluno(legendaEfetiva)) {
        log({ acao: 'multi_visto_pelo_modelo', chatId, itens: _pagLLM.length,
              nomes: _pagLLM.map((p) => p.aluno).slice(0, 4) });
      }
      // 🔴 LOJINHA: PRODUTO NÃO É ALUNO (Barra 06/10/2026). "Caderno cordas +
      //    chaveiro porta palhetas + mini caixa de som" abriu o portão pelo
      //    NOMES_LIGADOS (duas palavras + "+" + duas palavras) e a Sol pediu
      //    "cada aluno com seu valor" para UMA venda de R$ 190. Em venda, quem diz
      //    se há mais de uma pessoa é o modelo (pagamentos) ou o formato que a
      //    própria Sol ensina ("Nome — R$ valor" em 2+ linhas); o detector de
      //    texto livre não decide QUANDO o modelo já leu a venda e devolveu UM
      //    comprador (ou a legenda rotula um: "para o aluno X"). Sem comprador, o detector segue valendo (caso
      //    "Pagamento de X e Y" em lojinha, 29/08).
      const _ehLojinhaMulti = (lojinhaInfo || categoria === 'lojinha') && !categoriaEhSaida(categoria)
        && !!(aluno || _compradorDeclaradoLojinha(legendaEfetiva)) && _pagLLM.length <= 1;
      const _multiPorTexto = _ehLojinhaMulti
        ? extrairItensNomeValor(legendaEfetiva).itens.length >= 2
        : detectarContextoMultiAluno(legendaEfetiva);
      if (_ehLojinhaMulti && !_multiPorTexto && detectarContextoMultiAluno(legendaEfetiva)) {
        log({ acao: 'lojinha_multi_texto_ignorado', chatId });
      }
      if (_multiPorTexto || _multiPorLLM) {
        // Divisao no formato ensinado = parse deterministico; LLM so p/ texto livre.
        let multiRaw = null;
        const _det = extrairItensNomeValor(legendaEfetiva);
        if (_det.itens.length >= 2) {
          multiRaw = { tipo_recebimento: 'multi_aluno', itens: _det.itens, valor_total: _det.totalDeclarado || undefined };
          log({ acao: 'multi_itens_deterministicos', chatId, itens: _det.itens.length, total_declarado: _det.totalDeclarado || null });
        } else if (_multiPorLLM) {
          // O interpretador que ja rodou nesta midia listou as pessoas: usar o
          // que esta na mao em vez de pagar uma SEGUNDA chamada de LLM (30s) para
          // perguntar o mesmo. A resolucao das faturas e determinstica logo
          // abaixo (sol_caixa_resolver_pagamento_v1), entao o modelo aqui so diz
          // QUEM — nunca quanto o banco deve.
          multiRaw = { tipo_recebimento: 'multi_aluno',
                       itens: _pagLLM.map((p) => ({ aluno_nome: p.aluno, valor: p.valor })),
                       valor_total: undefined };
          log({ acao: 'multi_itens_do_modelo', chatId, itens: _pagLLM.length });
        } else {
          try { multiRaw = await interpretarMultiFn(textoClassificacao); }
          catch (e) { log({ acao: 'interpretar_multi_aluno_erro', chatId, erro: String(e && e.message) }); }
        }
        const _totalMulti = Math.max(Number(valor) || 0, Number(valorMaiorNaLegenda) || 0, Number(extrairValorOcr(ocrText)) || 0) || valor;
        const intentMulti = validarIntencaoMultiAluno(multiRaw, _totalMulti, { forma, categoria, competencia });
        if (!intentMulti.ok) {
          // A revisao manual guarda o que a midia JA sabe (total/forma/categoria):
          // sem isso a completacao deterministica nasce sem categoria e devolve
          // itens_incompletos — era a LLM da releitura que repunha esses campos.
          if (intentMulti.total == null) intentMulti.total = _totalMulti || null;
          if (!intentMulti.categoria) intentMulti.categoria = categoria || null;
          if (!intentMulti.forma) intentMulti.forma = forma || null;
        }
        if (_evidenciaShadowLigado(chatId)) {
          const cmp = compararEnvelopeEvidenciasV1(evidenceEnvelope, {
            valor_total: intentMulti.valor_total || intentMulti.total,
            forma: intentMulti.forma,
            categoria: intentMulti.categoria,
            competencia: intentMulti.competencia,
          });
          log({ acao: 'evidence_resolver_shadow', trilho: 'legado_midia_multi', chatId,
            divergencias: cmp.divergencias, conflitos: cmp.conflitos, ok: cmp.ok });
        }
        return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: textoClassificacao,
          textoHumano: legendaEfetiva, intent: intentMulti, agora,
          origemMessageId: event.messageId, evidenceEnvelope });
      }
      if (!nomePlausivel(aluno)) aluno = null;              // "image received" nao e' aluno
      const _rotuloHumano = _alunoRotulado(legendaEfetiva);
      aluno = _rotuloHumano || aluno || _alunoFromCaption(legendaEfetiva) || alunoVis;
      if (!nomePlausivel(aluno)) aluno = null;
      // "aluno: Fulano" escrito por gente e' DECISAO, nao palpite. Sem isto, quando a
      // fatura canonica nao confirma o nome (aluno novo nao TEM fatura), o bloco do
      // pagador sobrescrevia — foi assim que o passaporte do Rafael virou Marcos.
      const _alunoVeioDoRotulo = !!(_rotuloHumano && nomePlausivel(_rotuloHumano));
      let alunoViaPagador = null, pagadorNome = pagadorVis || (visao && visao.pagador_nome) || null, candidatosAluno = null;
      // sem sinal de forma: NAO chuta pix -- pergunta no preview.
      const formaIncerta = !forma;
      let alunoNovoOrigem = null;
      let alunoNovoResponsavel = null;
      let alunoNovoId = null;
      // Camada 4: casa com a parcela REAL do aluno (read-only) -- enriquece o preview
      let parcela = null, confiancaBaixa = false;
      // Periodo declarado pelo humano ("de 09/2026 a 08/2027") tambem e quitacao,
      // mesmo sem a palavra -- e o mesmo leitor que o card ja usa para os meses.
      // So o texto HUMANO: data de recibo no OCR nao declara periodo nenhum.
      const multiplas = pagamentoMultiplo(bodyLimpo(event.body) + ' ' + ocrText)
        || !!extrairPeriodoMeses(bodyLimpo(event.body));
      const querParcela = !lojinhaInfo && !multiplas && (!categoria || categoria === 'parcela' || categoria === 'mensalidade' || categoria === 'passaporte' || categoria === 'matricula' || categoria === 'outro');
      const categoriaExplicitaTaxa = categoria === 'passaporte' || categoria === 'matricula' || categoriaLegenda === 'passaporte';
      const podeFallbackLegadoParcela = querParcela && !categoriaExplicitaTaxa;
      // FONTE CANONICA primeiro (contrato v4): tipo/parcela N-de-M/status/valores certos.
      let canonica = null;
      // aplica o resultado do casador (nome canonico do banco + parcela real)
      const aplicarCasamento = (m) => {
        if (!m || !m.ok) return false;
        // Rotulo humano MANDA: casador fuzzy que devolve OUTRA pessoa nao pode
        // sobrescrever nem trazer a fatura dela. Caso Soraia->Laura (CG 29/08):
        // word_similarity casou Silveira~Sobreira e o card saiu com aluna, fatura
        // e responsavel de outra familia.
        if (_alunoVeioDoRotulo && m.aluno_nome && !_mesmaPessoa(m.aluno_nome, aluno)) {
          log({ acao: 'casamento_rejeitado_nome_diverge', chatId, rotulo: aluno, casado: m.aluno_nome });
          return false;
        }
        if (m.aluno_nome) aluno = m.aluno_nome;
        if (m.ambiguo) confiancaBaixa = true;
        // 🔴 29/09/2026 (CG 17:39, "PG parcela 10/26 … R$450 dinheiro"): pedida a 10/2026,
        //    a RPC antiga devolveu a parcela ATRASADA de 06/2026 e o card saiu com ela.
        //    O mês que a pessoa escreveu manda: parcela de OUTRO mês nunca entra no card;
        //    a aluna fica confirmada, a fatura não, e o "pode" fica travado até conferir.
        if (m.parcela && querParcela && competenciaHumana && m.parcela.competencia
            && competenciaIso(m.parcela.competencia) !== competenciaIso(competenciaHumana)) {
          log({ acao: 'casar_competencia_divergente', chatId, pedida: competenciaHumana,
                veio: m.parcela.competencia, abertas: m.parcelas_abertas || null });
          bloqueiaFonteIndisponivel = true;
          return true;
        }
        if (m.parcela && querParcela) {
          parcela = m.parcela;
          if (m.parcela.competencia) competencia = m.parcela.competencia;
          if (categoria === 'outro') categoria = 'parcela';   // 'outro' era chute sem contexto
        }
        return true;
      };
      let alunoConfirmado = !!(lojinhaInfo && aluno);
      let canonicaIndisponivel = false;
      let bloqueiaFonteIndisponivel = false;
      // Timeout/erro de transporte resolve null (ou erro PostgREST sem campo `ok`);
      // "nao achei" de verdade responde {ok:false, motivo}. Indisponivel => retry 1x;
      // se seguir mudo, NUNCA cair na fonte legada (contrato v4: canonica e A fonte —
      // em 18/08 um statement timeout fez o fallback chutar a parcela errada no preview).
      const tentarCanonica = async (nome, competenciaPreferida = null) => {
        // Quando a equipe informou a competência, use a RPC date-aware que
        // recebe o mês explicitamente. Antes dela, consulte a fonte canônica:
        // é ela que sabe valor pago, multa/mora e baixa no Emusys. A canônica
        // só vale aqui se devolver exatamente a competência humana; caso
        // contrário, a RPC explícita continua desambiguando o mês.
        if (competenciaPreferida && querParcela && !multiplas) {
          const compEsperada = competenciaIso(competenciaPreferida);
          try {
            let c = await canonicaFn(grp.unidade_id, nome, valor);
            let respondeu = !!(c && (c.ok === true || c.ok === false));
            if (_fonteFuturaLateralAoMesDeclarado(c, compEsperada)) {
              // Resposta valida para ESTA pergunta: segue para a RPC explicita.
              log({ acao: 'canonica_futura_lateral', chatId, competencia: competenciaPreferida });
            } else if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) {
              respondeu = false;
              bloqueiaFonteIndisponivel = true;
            }
            if (!respondeu) {
              log({ acao: 'canonica_competencia_retry', chatId, competencia: competenciaPreferida });
              c = await canonicaFn(grp.unidade_id, nome, valor);
              respondeu = !!(c && (c.ok === true || c.ok === false));
              if (_fonteFuturaLateralAoMesDeclarado(c, compEsperada)) {
                bloqueiaFonteIndisponivel = false;
                log({ acao: 'canonica_futura_lateral', chatId, competencia: competenciaPreferida });
              } else if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) {
                respondeu = false;
                bloqueiaFonteIndisponivel = true;
              }
            }
            canonicaIndisponivel = !respondeu;
            const compCanonica = c && c.fatura && competenciaIso(c.fatura.competencia);
            log({ acao: 'canonica_competencia_result', chatId, ok: !!(c && c.ok),
              competencia: competenciaPreferida, competencia_canonica: compCanonica,
              indisponivel: canonicaIndisponivel || undefined });
            if (c && c.ok && _alunoVeioDoRotulo && c.aluno_nome && !_mesmaPessoa(c.aluno_nome, aluno)) {
              log({ acao: 'canonica_rejeitada_nome_diverge', chatId, rotulo: aluno, casado: c.aluno_nome });
              return false;
            }
            if (c && c.ok && compEsperada && compCanonica === compEsperada) {
              canonica = c;
              if (c.aluno_nome) aluno = c.aluno_nome;
              competencia = competenciaPreferida;
              return true;
            }
            // Fonte canônica muda/indisponível nunca autoriza cair na tabela
            // bruta. O fallback explícito só existe para resposta válida em
            // outra competência ou ausência confirmada de fatura na janela.
            if (!respondeu) return false;
          } catch (e) {
            canonicaIndisponivel = true;
            bloqueiaFonteIndisponivel = true;
            log({ acao: 'canonica_competencia_erro', chatId, competencia: competenciaPreferida });
            return false;
          }
          try {
            const m = await casarFn(grp.unidade_id, nome, valor, competenciaPreferida);
            log({ acao: 'casar_competencia_result', chatId, ok: !!(m && m.ok), competencia: competenciaPreferida });
            if (m && m.ok && m.parcela) return aplicarCasamento(m);
          } catch (e) {
            log({ acao: 'casar_competencia_erro', chatId });
          }
          return false;
        }
        try {
          let c = await canonicaFn(grp.unidade_id, nome, valor);
          let respondeu = !!(c && (c.ok === true || c.ok === false));
          if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
          if (!respondeu) {
            log({ acao: 'canonica_retry', chatId });
            c = await canonicaFn(grp.unidade_id, nome, valor);
            respondeu = !!(c && (c.ok === true || c.ok === false));
            if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
          }
          canonicaIndisponivel = !respondeu;
          log({ acao: 'canonica_result', ok: !!(c && c.ok), motivo: c && (c.motivo_escolha || c.motivo), indisponivel: canonicaIndisponivel || undefined });
          if (c && c.ok && _alunoVeioDoRotulo && c.aluno_nome && !_mesmaPessoa(c.aluno_nome, aluno)) {
            log({ acao: 'canonica_rejeitada_nome_diverge', chatId, rotulo: aluno, casado: c.aluno_nome });
            return false;
          }
          if (c && c.ok) { canonica = c; if (c.aluno_nome) aluno = c.aluno_nome; return true; }
        } catch (e) { canonicaIndisponivel = true; bloqueiaFonteIndisponivel = true; }
        return false;
      };
      if (aluno && (querParcela || multiplas)) alunoConfirmado = await tentarCanonica(aluno, competenciaHumana);
      if (!alunoConfirmado && aluno && !canonicaIndisponivel && podeFallbackLegadoParcela) {
        try {
          log({ acao: 'casar_attempt', chatId });
          const m = await casarFn(grp.unidade_id, aluno, valor, competencia);
          log({ acao: 'casar_result', ok: !!(m && m.parcela), conf: m && m.confianca_nome });
          alunoConfirmado = aplicarCasamento(m);
        } catch (e) { /* best-effort */ }
      }
      // Camada 4.5: quem paga quase nunca e' o aluno. Se o BANCO nao confirmou o nome
      // (ou nao veio nome nenhum), identifica pelo PAGADOR do comprovante e recasa.
      if (!alunoConfirmado) {
        pagadorNome = pagadorNome || extrairPagador(ocrText);
        if (pagadorNome) {
          try {
            // A fatura canônica recebe nome + valor e resolve quando o pagador
            // é a própria aluna ou quando o nome abrevia um sobrenome. Só cai
            // na relação familiar se essa confirmação não for possível.
            if (querParcela || multiplas) {
              alunoConfirmado = await tentarCanonica(pagadorNome, competenciaHumana);
              if (alunoConfirmado) alunoViaPagador = 'comprovante';
            }
            if (alunoConfirmado) {
              log({ acao: 'pagador_canonica_confirmado', chatId });
            } else {
            const idp = await pagadorFn(grp.unidade_id, pagadorNome);
            log({ acao: 'pagador_result', ok: !!(idp && idp.ok), via: idp && idp.via, total: idp && idp.total });
            if (idp && idp.ok && Array.isArray(idp.alunos) && idp.alunos.length) {
              if (idp.ambiguo && _alunoVeioDoRotulo) {
                // "de qual aluno e?" e pergunta que o humano JA respondeu na legenda.
                log({ acao: 'pagador_ambiguo_ignorado_rotulo_humano', chatId, aluno });
              } else if (idp.ambiguo) {
                // Uma PESSOA com 3 cursos sao 3 MATRICULAS: a lista repetia o
                // mesmo nome 3x e a pergunta "e' de qual aluno?" virava ruido
                // (Kamilly Azevedo da Silva, CG 05/09 13:51).
                candidatosAluno = [...new Set(idp.alunos.map((x) => x.aluno_nome))].slice(0, 4);
                aluno = null;
              } else if (_alunoVeioDoRotulo) {
                // o humano ja disse quem e; o pagador do comprovante nao vota contra
                log({ acao: 'pagador_ignorado_rotulo_humano', chatId, aluno, pagador: pagadorNome });
              } else {
                aluno = idp.alunos[0].aluno_nome;
                alunoViaPagador = idp.via;
                const okCan = await tentarCanonica(aluno, competenciaHumana);
                alunoConfirmado = okCan;
                if (!okCan && !canonicaIndisponivel && podeFallbackLegadoParcela) {
                  try {
                    const m2 = await casarFn(grp.unidade_id, aluno, valor, competencia);
                    log({ acao: 'casar_result_2', ok: !!(m2 && m2.parcela) });
                    aplicarCasamento(m2);
                  } catch (e) { /* best-effort */ }
                }
              }
            } else if (!aluno) {
              log({ acao: 'pagador_sem_match', chatId });
            }
            }
          } catch (e) { /* best-effort */ }
        }
        if (!alunoConfirmado && aluno && !alunoViaPagador) {
          // ALUNO NOVO (passaporte/matricula): quem compra passaporte AINDA NAO
          // matriculou -- ele existe no funil como experimental/lead, nunca em `alunos`.
          // Antes o card dizia "nao tenho certeza de qual aluno e" para alguem que o
          // sistema conhece (caso Giovanna/Recreio 24/08: experimental desde 04/08,
          // nome completo exato). Passaporte NUNCA dependeu de cadastro para lancar
          // (7 dos 12 dos ultimos 30 dias nao estao em `alunos`); isto so devolve a
          // identificacao que faltava, sem criar trava nova.
          try {
            const novo = await identificarAlunoNovoFn(grp.unidade_id, aluno);
            if (novo && novo.ok) {
              aluno = novo.nome || aluno;
              alunoNovoOrigem = (novo.origem !== 'aluno_matriculado') ? (novo.rotulo || novo.origem) : null;
              alunoNovoResponsavel = novo.responsavel_nome || null;
              // so vem preenchido quando a pessoa tem UMA matricula ativa na unidade;
              // com 2+ cursos a RPC devolve null de proposito (motivo_sem_vinculo).
              alunoNovoId = (novo.aluno_id != null) ? novo.aluno_id : null;
              alunoConfirmado = true;
              confiancaBaixa = false; // identificado pelo funil: nao afirmar e duvidar no mesmo card
              log({ acao: 'aluno_novo_identificado', chatId, origem: novo.origem, confianca: novo.confianca });
            }
          } catch (e) { log({ acao: 'aluno_novo_erro', chatId, erro: String(e && e.message) }); }
          if (!alunoConfirmado) confiancaBaixa = true;
        }
      }
      // Passaporte declarado pela equipe nao depende de fatura de mensalidade.
      // A fonte canonica pode falhar apenas na janela de competencias futuras e,
      // no retry, confirmar que nao existe uma fatura compativel. Se a identidade
      // do aluno foi resolvida de forma unica e a categoria humana e exatamente
      // passaporte, essa indisponibilidade lateral nao pode contaminar o preview
      // nem fazer o `pode` recusar um lancamento que nunca exigiu fatura.
      const passaporteDeclaradoSemFatura = categoriaExplicitaTaxa
        && String(categoria || '').toLowerCase() === 'passaporte'
        && alunoConfirmado && !confiancaBaixa && !candidatosAluno
        && nomePlausivel(aluno) && Number(valor) > 0
        && !canonica && !parcela;
      if (passaporteDeclaradoSemFatura) {
        canonicaIndisponivel = false;
        bloqueiaFonteIndisponivel = false;
        log({ acao: 'passaporte_declarado_independe_fatura', chatId });
      }
      // Aluno com dois cursos/parcelas no mesmo mes (caso Pedro 18/08):
      // se a legenda diz 08/2026 e o comprovante e a soma de Canto+Guitarra,
      // o preview precisa mostrar o composto em vez de puxar uma fatura isolada.
      let composto = null;
      const competenciaComposto = competenciaHumana || competencia;
      if (aluno && valor && competenciaComposto && querParcela && !multiplas) {
        let compMes = null;
        try {
          compMes = await faturasMesFn(grp.unidade_id, aluno, competenciaComposto, valor);
        } catch (e) {
          log({ acao: 'composto_mes_resolver_erro', chatId, erro: String(e && e.message) });
        }
        if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2
            && !(_alunoVeioDoRotulo && compMes.aluno_nome && !_mesmaPessoa(compMes.aluno_nome, aluno))) {
            composto = compMes;
            if (compMes.aluno_nome) aluno = compMes.aluno_nome;
            if (compMes.competencia) competencia = compMes.competencia;
            const itensComposto = (Array.isArray(compMes.itens) ? compMes.itens : []).map((item) => ({
              ...item,
              aluno_nome: item.aluno_nome || aluno,
              responsavel_financeiro: item.responsavel_financeiro || compMes.responsavel_financeiro || null,
              valor: Number(item.valor),
              categoria: item.categoria || categoriaDaFatura({ fatura: item.fatura }) || null,
              competencia: item.competencia || competencia || null,
              canonical_fatura_id: item.canonical_fatura_id
                || (item.fatura && item.fatura.canonical_fatura_id) || null,
            }));
            const categoriasComposto = categoriaDosItensV4(itensComposto);
            const somaComposto = itensComposto.reduce((s, item) => s + Number(item.valor || 0), 0);
            const mesmoAluno = itensComposto.length >= 2 && itensComposto.every((item) =>
              nomePlausivel(item.aluno_nome) && _mesmaPessoa(item.aluno_nome, aluno));
            const snapshotCompleto = itensComposto.every((item) =>
              Number(item.valor) > 0 && item.categoria && item.canonical_fatura_id);

            // O resolver ja encontrou duas cobrancas oficiais. A partir daqui
            // NAO existe fallback singular: um movimento unico perderia a
            // categoria e o vinculo de uma das faturas. Ou o snapshot inteiro
            // fecha, ou o episodio falha fechado sem card aprovavel.
            if (!categoriasComposto.ok || !mesmoAluno || !snapshotCompleto
                || Math.abs(somaComposto - Number(valor)) > 0.01) {
              await sendFn(chatId,
                '⚠️ Encontrei mais de uma cobrança para este aluno, mas não consegui montar '
                + 'o vínculo completo de todas elas. Não criei card aprovável e não vou lançar tudo em uma categoria só.');
              log({ acao: 'composto_mes_snapshot_invalido', chatId,
                partes: itensComposto.length, soma: somaComposto, valor: Number(valor),
                categorias_ok: categoriasComposto.ok, mesmo_aluno: mesmoAluno,
                snapshot_completo: snapshotCompleto });
              return { acao: 'composto_mes_snapshot_invalido' };
            }

            categoria = categoriasComposto.categoria;
            parcela = null;
            canonica = null;
            confiancaBaixa = false;
            bloqueiaFonteIndisponivel = false;
            log({ acao: 'composto_mes_result', ok: true, partes: itensComposto.length,
              competencia: compMes.competencia, categorias: itensComposto.map((i) => i.categoria) });

            const envelopeComposto = {
              pagador: pagadorNome || null,
              valor_total: Number(valor),
              forma,
              itens: [{
                aluno,
                categorias: [...new Set(itensComposto.map((i) => i.categoria))],
                competencias: [...new Set(itensComposto.map((i) => i.competencia).filter(Boolean))],
              }],
            };
            return abrirFluxoMultiAluno({
              event, grupo: grp, textoFonte: textoClassificacao,
              textoHumano: legendaEfetiva, agora, origemMessageId: event.messageId,
              resolvidoPronto: { ...compMes, valor_total: Number(valor), itens: itensComposto },
              agentFirstEnvelope: envelopeComposto, evidenceEnvelope,
              intent: {
                ok: true, valor_total: Number(valor), forma,
                categoria: categoriasComposto.categoria,
                itens: itensComposto.map((i) => ({
                  aluno_nome: i.aluno_nome, valor: Number(i.valor), categoria: i.categoria,
                })),
              },
            });
        }
      }

      // Responsável financeiro do aluno (quem paga) — pedido do Alf/Fernanda.
      let responsavelFinanceiro = alunoNovoResponsavel || null;
      if (aluno) {
        try {
          const rr = await responsavelFn(grp.unidade_id, aluno);
          // A RPC devolve em `aluno_nome` com QUEM o fuzzy casou (so busca ativos).
          // Pessoa diferente = responsavel de OUTRA familia (caso Rayanne/Soraia
          // 29/08: Soraia e' lead, o melhor ativo parecido era a Laura).
          if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, aluno)) {
            log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno, casado: rr.aluno_nome });
          } else if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, aluno)) responsavelFinanceiro = rr.responsavel_nome;
          log({ acao: 'responsavel_result', ok: !!responsavelFinanceiro });
        } catch (e) { /* best-effort */ }
      }
      // categoria/descricao: a fatura canonica manda (contrato v4); LLM so entra como fallback
      const catCanonica = categoriaDaFatura(canonica);
      const _categoriaAntesDaFatura = categoria;
      if (catCanonica) categoria = catCanonica;
      // duplicidade no CAIXA do dia (o Emusys estar pago e' normal; o caixa e' que nao pode repetir)
      let duplicata = null;
      if (valor) {
        try {
          const d = await duplicataFn(grp.unidade_id, valor, aluno);
          if (d && d.ja_lancado && Array.isArray(d.itens) && d.itens.length) duplicata = d.itens[0];
          log({ acao: 'duplicata_caixa', ja_lancado: !!duplicata });
        } catch (e) { /* best-effort */ }
      }
      // quitação: quantas parcelas e QUAIS meses (pedido da gerente da Barra)
      let quitacao = null;
      if (multiplas) {
        const vparc = canonica && canonica.fatura && Number(canonica.fatura.valor_da_parcela);
        let n = (valor && vparc) ? Math.round(Number(valor) / vparc) : null;
        if (!n || n < 2) n = (cartaoParcelas && cartaoParcelas > 1) ? cartaoParcelas : null;
        if (n && n > 13) { log({ acao: 'quitacao_razao_implausivel', chatId, n }); n = null; }
        const informado = extrairPeriodoMeses(bodyLimpo(event.body));
        const proposto = periodoQuitacao(canonica, n);
        quitacao = { n, vparc: vparc || null,
          inicio: (informado && informado.inicio) || (proposto && proposto.inicio) || null,
          fim: (informado && informado.fim) || (proposto && proposto.fim) || null,
          proposto: !informado && !!proposto };
        // Quais FATURAS esse periodo quita (pagamento composto, 25/09/2026).
        // Falha de leitura nao derruba o card: vira "sem vinculo" e o humano ve.
        if (quitacao.inicio && quitacao.fim) {
          const _alunoQ = derivarVinculo({ canonica, parcela, alunoNovoId }).aluno_id;
          try {
            quitacao.faturas = _alunoQ
              ? await faturasQuitacaoFn(grp.unidade_id, _alunoQ, quitacao)
              : { ok: false, motivo: 'aluno_sem_vinculo' };
          } catch (e) {
            quitacao.faturas = { ok: false, motivo: 'erro_leitura' };
            log({ acao: 'quitacao_faturas_erro', chatId, erro: String(e && e.message) });
          }
          log({ acao: 'quitacao_faturas', chatId, ok: !!(quitacao.faturas && quitacao.faturas.ok),
            n: quitacao.faturas && quitacao.faturas.n, motivo: quitacao.faturas && quitacao.faturas.motivo });
        }
      }
      const bloqueiaLancamento = deveBloquearLancamento({ composto, parcela, canonica, valor, quitacao, multiplas });
      const saidaCaixa = categoriaEhSaida(categoria);
      // Saida tem UMA descricao, da mesma funcao do ditado por texto (06/10/2026): o
      // bloco que existia aqui era copia divergente e gravava "PG Semana Retirada".
      // 🔴 E saida NAO tem aluno: em 05/10 o `_alunoFromCaption` transformou a
      // legenda ("Compra de pós de café… Retirada do caixa") em ALUNO, o card
      // escondeu (saida nao mostra ALUNO), mas a confirmacao exibiu e o payload
      // gravou esse "aluno". O que o grupo leu nao era o que o banco guardou.
      if (saidaCaixa) {
        if (aluno) log({ acao: 'saida_aluno_descartado', chatId });
        aluno = null; responsavelFinanceiro = null; candidatosAluno = null; alunoViaPagador = null;
      }
      const descricaoSaida = saidaCaixa ? _descricaoSaidaTexto(legendaEfetiva, categoria) : null;
      let descricao = composto
        ? (descricaoDoComposto(composto, aluno) || _descricaoLancamento(categoria, competencia, aluno, parcela))
        : lojinhaInfo
        ? descricaoLojinha(lojinhaInfo.item, aluno, vendedorEquipe)
        : saidaCaixa
        ? descricaoSaida
        : (multiplas && quitacao && quitacao.faturas && quitacao.faturas.ok)
        ? (`Parcelas ${quitacao.faturas.inicio} a ${quitacao.faturas.fim}`
           + (quitacao.faturas.curso ? ` do curso de ${quitacao.faturas.curso}` : '')
           + (aluno ? ' - ' + aluno : ''))
        : multiplas
        ? ('Quitacao' + (quitacao && quitacao.n ? ' ' + quitacao.n + 'x' : ' de parcelas')
           + (quitacao && quitacao.inicio ? ` (${quitacao.inicio} a ${quitacao.fim})` : '')
           + (aluno ? ' - ' + aluno : ''))
        : (descricaoDaFatura(canonica, aluno) || _descricaoLancamento(categoria, competencia, aluno, parcela));
      // ⚠️ Identidade do remetente ANTES do card: e' o que permite descartar
      // "aluno = quem enviou". Antes disso ela so era buscada depois, para o
      // carimbo de quem autorizou.
      let idEnviou = null;
      try { idEnviou = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* best-effort */ }
      {
        const _vendedor = _vendedorRotulado(legendaEfetiva);
        const _remetente = idEnviou && idEnviou.identificado ? idEnviou.nome : null;
        // "para o aluno Arthur Vargas" com remetente Arthur (ADM homonimo, Barra
        // 31/08): rotulo humano explicito de ALUNO vence a heuristica de
        // remetente. Ela existe para nome INFERIDO; contra declaracao, mente.
        const _alunoDeclarado = _alunoRotulado(legendaEfetiva);
        const _declarado = !!(aluno && _alunoDeclarado && _mesmaPessoa(_alunoDeclarado, aluno));
        const _porQue = (aluno && _vendedor && _mesmaPessoa(aluno, _vendedor)) ? 'rotulo_de_venda'
          : (aluno && _ehOVendedor(aluno, vendedorEquipe)) ? 'vendedor_da_equipe'
          : (aluno && !_declarado && _remetente && _mesmaPessoa(aluno, _remetente)) ? 'e_quem_enviou'
          : null;
        if (_porQue) {
          log({ acao: 'aluno_descartado_nao_e_aluno', chatId, aluno, motivo: _porQue });
          aluno = null; responsavelFinanceiro = null; canonica = null; parcela = null;
          alunoNovoId = null; alunoNovoOrigem = null; alunoViaPagador = null; candidatosAluno = null;
        }
      }
      // A descrição da lojinha nasce DEPOIS do descarte acima: antes, "Venda:
      // Arthur" saía do card mas ficava gravado como "Lojinha/Venda - Camisa - Arthur".
      if (lojinhaInfo && !composto && !saidaCaixa) descricao = descricaoLojinha(lojinhaInfo.item, aluno, vendedorEquipe);
      // Lojinha não passa pela resolução de aluno (não há fatura): o nome digitado
      // ia direto para o banco. Grafia diferente do cadastro vira PERGUNTA (mesma
      // RPC e mesmo "sim" do multi); o "pode" fica travado até o nome se resolver.
      let sugestaoLojinha = null;
      if (lojinhaInfo && aluno && !saidaCaixa && !composto) {
        sugestaoLojinha = await sugestaoNomeLojinha({ chatId, unidadeId: grp.unidade_id, aluno, vendedor: vendedorEquipe });
      }
      const _bancoEvidencia = canonica && canonica.ok ? {
        fatura: canonica.fatura || null,
        aluno_nome: canonica.aluno_nome || aluno || null,
        categoria: categoriaDaFatura(canonica),
        competencia: canonica.fatura && canonica.fatura.competencia,
      } : null;
      evidenceEnvelope = mesclarEnvelopesEvidenciasV1(
        evidenceEnvelope,
        construirEnvelopeEvidenciasV1({ banco: _bancoEvidencia })
      );
      if (_evidenciaShadowLigado(chatId)) {
        const cmp = compararEnvelopeEvidenciasV1(evidenceEnvelope, {
          valor_total: valor, forma, cartao_modalidade: cartaoModalidade,
          cartao_parcelas: cartaoParcelas, categoria, aluno, competencia,
          pagador: pagadorNome,
        });
        log({ acao: 'evidence_resolver_shadow', trilho: 'legado_midia', chatId,
          divergencias: cmp.divergencias, conflitos: cmp.conflitos, ok: cmp.ok });
      }
      // Legenda tardia chegou durante a interpretação: este card sairia sem ela.
      // Nada é enviado; a mídia é reavaliada com a legenda (um card só).
      if (_recLT && _recLT.legenda && !_recLT.consumida) {
        log({ acao: 'midia_adiada_legenda_tardia', chatId, etapa: 'card' });
        return { acao: 'midia_adiada_legenda_tardia' };
      }
      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel: canonicaIndisponivel || bloqueiaFonteIndisponivel, composto, bloqueiaLancamento, itemLojinha: lojinhaInfo && lojinhaInfo.item, valorMaiorNaLegenda, valorConflito, valorBaixaConfianca, descricao, sugestaoNome: sugestaoLojinha });
      if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
      const previewId = await sendFn(chatId, texto);
      const arr = limparVelhos(chatId, agora);
      log({ acao: 'identidade_envio', identificado: !!(idEnviou && idEnviou.identificado) });
      const pendencia = { previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor, forma, categoria, aluno, competencia, descricao, parcela, responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta, quitacao, multiplas, composto, canonica, alunoNovoId, itemLojinha: lojinhaInfo && lojinhaInfo.item, valorConflito, valorBaixaConfianca, bloqueiaLancamento, faturaIndisponivel: canonicaIndisponivel, bloqueiaFonteIndisponivel, categoriaInterpretada: _categoriaAntesDaFatura || null, enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId, evidenceEnvelope,
        vendedor: vendedorEquipe, sugestaoNomeLojinha: sugestaoLojinha,
        msgIds: [previewId], autorPhone: event.senderPhone || null, autorId: event.senderId || null,
        toquePor: String(event.senderPhone || event.senderId || ''), toqueTs: agora,
        arquivoBytes: (ocrMeta && ocrMeta.file_bytes) || null, ts: agora };
      // F5: reenviar o MESMO arquivo substitui a pendencia antiga (29/08: cada
      // reenvio citando o original empilhava um card novo — 4 pendencias, zero
      // lancamentos). file_bytes identico = mesmo comprovante.
      if (pendencia.arquivoBytes) {
        for (let _i = arr.length - 1; _i >= 0; _i--) {
          if (arr[_i].arquivoBytes === pendencia.arquivoBytes) {
            log({ acao: 'pendencia_substituida_reenvio', chatId, bytes: pendencia.arquivoBytes });
            arr.splice(_i, 1);
          }
        }
      }
      const v3 = await registrarPreviewPublicoV3({
        event, grupo: grp, previewId, texto, pendencia,
        result: { acao: 'preview_enviado', valor, forma, categoria, aluno, competencia },
      });
      if (v3 && v3.preview_id) {
        pendencia.v3PreviewId = v3.preview_id;
        pendencia.v3PreviewHash = v3.preview_hash || null;
      }
      // A RPC financeira exige o vínculo V3. Não pode existir um preview que
      // convida o "pode" se o registro V3 não foi persistido: era exatamente
      // o caso do preview correto da Beatriz que morria no último passo.
      //
      // PREVIEW INCOMPLETO POR DESENHO (24/08/2026): quando a Sol PEDE a forma
      // (ou o valor), o registro V3 falha de proposito -- a RPC exige forma e
      // categoria ('forma_obrigatoria_preview_v3'). Isso NAO e falha de
      // infraestrutura: e o fluxo normal de "me confirma a forma".
      // Antes, o return abaixo descartava a pendencia ANTES do push, entao a
      // resposta "pode, cartao" nao encontrava preview nenhum para completar e
      // a conversa morria (caso Giovanna/Recreio, cupom de maquininha ilegivel:
      // OCR timeout -> sem forma -> preview pedido e jogado fora no mesmo passo).
      // Agora a pendencia FICA guardada, sem v3PreviewId: a rotina 1.5b preenche
      // a forma e registra o V3 na remontagem. O gate do "pode" nao afrouxa --
      // sem v3PreviewId o lancamento continua recusado.
      const previewIncompletoPorDesenho = !!(pendencia.formaIncerta || !pendencia.valor);
      if (v3LedgerAtivo && (!pendencia.v3PreviewId || !pendencia.v3PreviewHash)) {
        if (previewIncompletoPorDesenho) {
          arr.push(pendencia);
          pendentes.set(chatId, arr);
          log({ acao: 'preview_incompleto_aguardando_complemento', chatId, previewId,
                falta: pendencia.formaIncerta ? 'forma' : 'valor' });
          return { acao: 'preview_incompleto_aguardando_complemento', previewId };
        }
        await sendFn(chatId, '⚠️ Preparei a conferência, mas o preview seguro não foi registrado. Não responda *pode* neste preview; vou pedir um novo comprovante se não normalizar em instantes.');
        log({ acao: 'preview_bloqueado_sem_v3', chatId, motivo: 'preview_v3_nao_persistido' });
        return { acao: 'preview_enviado_sem_v3', previewId };
      }
      arr.push(pendencia);
      pendentes.set(chatId, arr);
      log({ acao: 'preview_enviado', chatId, previewId, valor: valor || null });
      return { acao: 'preview_enviado', previewId };
    }

    // 1.5) resposta curta que COMPLETA o que ela pediu (valor e/ou forma).
    // Nao lanca: so preenche a lacuna e repergunta -- o gate do "pode" continua valendo.
    {
      const _arrPTodos = limparVelhos(chatId, agora);
      const txt = String(event.body || '').trim();
      // 🔴 29/09/2026 (CG 17:41): o Alf perguntou ao Jhon "Parcela 06/2026, John? Tá certo
      //    isso?" e a Sol respondeu "Atualizei a competência para 06/2026" — pergunta entre
      //    pessoas virou correção do card. Corrigir o card SEM citá-lo só vale para quem
      //    mandou o comprovante (ou quem chamou "Sol, …"), e nunca para pergunta com "?".
      //    Citando o card (ou o comprovante), segue valendo para qualquer pessoa do grupo.
      const _citaCard = (p, q) => !!q && (p.previewId === q || p.origem === q
        || (Array.isArray(p.msgIds) && p.msgIds.includes(q)));
      const _falante = String(event.senderPhone || event.senderId || '');
      const _ehAutor = (p) => !!_falante && [p.autorPhone, p.autorId, p.toquePor]
        .some((x) => x && String(x) === _falante);
      const _pergunta = /\?\s*$/.test(txt);
      const arrP = event.quotedMessageId
        ? _arrPTodos.filter((p) => _citaCard(p, event.quotedMessageId))
        : _arrPTodos.filter((p) => _falouComSol(event) || (_ehAutor(p) && !_pergunta));
      if (!event.hasMedia && txt && _arrPTodos.length && !arrP.length && !casarPode(txt).pode && !casarNao(txt)) {
        log({ acao: 'correcao_card_ignorada_conversa', chatId, citou: !!event.quotedMessageId, pergunta: _pergunta });
      }

      // ⚠️ MIDIA DESTE REMETENTE CONSOLIDANDO AGORA (lote aberto): este texto e
      // a LEGENDA dela — vai para o lote ANTES de qualquer caminho de correcao.
      // Em 31/08 17:45 a pendencia REIDRATADA sequestrou a legenda do reenvio
      // como "correcao de nome" e a midia processou SEM legenda: o card repetiu
      // o R$ 38.700 do OCR mesmo com "R$387,00" escrito pela Mayra. A guarda ja
      // existia so no bloco de saida (refrigerante 28/08); agora cobre todas.
      // Aprovacao/descarte ("pode"/"nao") seguem passando para o gate.
      if (!event.hasMedia && txt && !casarPode(txt).pode && !casarNao(txt)) {
        const _loteLegenda = lotesMidia.get(textoIrmaoKey(event));
        if (_loteLegenda && (agora - _loteLegenda.ts) <= 5000 && anexarTextoAoLote(event, txt, agora)) {
          return { acao: 'lote_texto_anexado' };
        }
      }

      // A equipe pode completar a divisão depois do comprovante. Reinterpreta
      // o conjunto original + complemento, nunca deixa a correção cair no
      // handler de categoria singular.
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const manuais = _arrPTodos.filter((p) => p.tipoOperacao === 'manual_review_multi_student');
        // 🔴 A REVISÃO NÃO É DONA DO GRUPO (26/09/2026, Barra). Sem citar o card,
        // QUALQUER texto de QUALQUER pessoa ("Sim", "Botar agora", "Falta mais
        // algum?") era lido como tentativa de divisão, e a Sol respondeu "Ainda falta
        // uma divisão…" nove vezes. Sem citação, só completa quem mandou o comprovante
        // e só se a mensagem trouxer valor — a divisão pedida é "Nome — R$ valor".
        const _quemFala = String(event.senderPhone || event.senderId || '');
        const _doDono = (p) => !!_quemFala && (String(p.autorPhone || '') === _quemFala
          || String(p.autorId || '') === _quemFala || String(p.autorId || '') === String(event.senderId || ''));
        const alvoManual = event.quotedMessageId
          ? manuais.find((p) => p.previewId === event.quotedMessageId || p.origem === event.quotedMessageId
              || (Array.isArray(p.msgIds) && p.msgIds.includes(event.quotedMessageId)))
          : (manuais.length === 1 && _doDono(manuais[0]) && /\d/.test(txt) ? manuais[0] : null);
        if (alvoManual && !ehConversaSemComando(txt)) {
          let multiRaw = null;
          const textoFonte = `${alvoManual.multiTexto || ''}\n${txt}`.trim();
          const _textoHumanoC = `${alvoManual.multiTextoHumano || ''}\n${txt}`.trim();
          const _detC = extrairItensNomeValor(_textoHumanoC);
          if (_detC.itens.length >= 2) {
            multiRaw = { tipo_recebimento: 'multi_aluno', itens: _detC.itens, valor_total: _detC.totalDeclarado || undefined };
            log({ acao: 'multi_itens_deterministicos', chatId, itens: _detC.itens.length, origem: 'correcao' });
          } else {
            try { multiRaw = await interpretarMultiFn(textoFonte); }
            catch (e) { log({ acao: 'interpretar_multi_aluno_correcao_erro', chatId, erro: String(e && e.message) }); }
          }
          const intentMulti = validarIntencaoMultiAluno(multiRaw, alvoManual.valor, {
            forma: extrairForma(txt, null) || alvoManual.forma,
            categoria: _categoriaFromCaption(txt) || alvoManual.categoria,
            competencia: extrairCompetenciaTexto(txt) || null,
          });
          // SAIDA DA ARMADILHA (Arthur/Barra 29/08): o humano disse que e' UM
          // aluno ("venda de camisa para o aluno Theo de bem, 65 reais") e o fluxo
          // multi repetia "manda os dois" para sempre. Um item declarado com nome
          // converte para lancamento single — o humano manda.
          const _um = (!intentMulti.ok && intentMulti.motivo === 'dois_itens_obrigatorios'
            && multiRaw && Array.isArray(multiRaw.itens) && multiRaw.itens.length === 1
            && multiRaw.itens[0] && multiRaw.itens[0].aluno_nome) ? multiRaw.itens[0] : null;
          if (_um) {
            const _valorU = Number(_um.valor || alvoManual.valor || 0) || null;
            const _formaU = extrairForma(txt, null) || alvoManual.forma || _um.forma || null;
            const _catU = String(_um.categoria || _categoriaFromCaption(txt) || alvoManual.categoria || 'outro').toLowerCase();
            let textoU = montarPreview({
              unidadeNome: grp.nome, valor: _valorU, forma: _formaU, categoria: _catU,
              aluno: _um.aluno_nome, competencia: _um.competencia || null, parcela: null,
              confiancaBaixa: false, responsavelFinanceiro: null, formaIncerta: !_formaU,
              cartaoModalidade: null, cartaoParcelas: null, multiplas: false,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false,
            });
            if (dryRun) textoU += '\n\n_(modo teste — nada será gravado no caixa)_';
            const previewIdU = await sendFn(chatId, 'Entendi — é um aluno só. Montei o lançamento:\n\n' + textoU);
            const pendU = {
              previewId: previewIdU, unidade_id: grp.unidade_id, nome: grp.nome,
              valor: _valorU, forma: _formaU, categoria: _catU, aluno: _um.aluno_nome,
              competencia: _um.competencia || null, descricao: null, parcela: null,
              responsavelFinanceiro: null, cartaoModalidade: null, cartaoParcelas: null,
              formaIncerta: !_formaU, quitacao: null, multiplas: false, composto: null,
              itemLojinha: null, bloqueiaLancamento: false, faturaIndisponivel: false,
              bloqueiaFonteIndisponivel: false, enviadoPor: null,
              idemKey: `${chatId}:${event.messageId}:um`, origem: alvoManual.origem || event.messageId,
              msgIds: [previewIdU], autorPhone: event.senderPhone || null, autorId: event.senderId || null,
              toquePor: String(event.senderPhone || event.senderId || ''), toqueTs: agora,
              arquivoBytes: alvoManual.arquivoBytes || null, ts: agora,
            };
            const v3u = await registrarPreviewPublicoV3({
              event, grupo: grp, previewId: previewIdU, texto: textoU, pendencia: pendU,
              result: { acao: 'multi_convertido_para_single', valor: _valorU, aluno: _um.aluno_nome },
            });
            if (v3u && v3u.preview_id) { pendU.v3PreviewId = v3u.preview_id; pendU.v3PreviewHash = v3u.preview_hash || null; }
            const arrN = limparVelhos(chatId, agora).filter((p) => p !== alvoManual);
            arrN.push(pendU);
            pendentes.set(chatId, arrN);
            log({ acao: 'multi_convertido_para_single', chatId, aluno: _um.aluno_nome, valor: _valorU });
            return { acao: 'multi_convertido_para_single', previewId: previewIdU };
          }
          if (!intentMulti.ok) {
            // ⚠️ Não renova `ts`: renovar a cada tentativa fazia a revisão nunca expirar.
            alvoManual.multiTexto = textoFonte;
            const _idFalta = await sendFn(chatId, 'Ainda falta uma divisão verificável por aluno. Manda os dois assim: *Nome — R$ valor*; não vou usar só o total.');
            if (Array.isArray(alvoManual.msgIds)) alvoManual.msgIds.push(_idFalta);
            log({ acao: 'manual_review_multi_student_continua', chatId, motivo: intentMulti.motivo });
            return { acao: 'manual_review_multi_student' };
          }
          pendentes.set(chatId, arrP.filter((p) => p !== alvoManual));
          return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte, textoHumano: _textoHumanoC, intent: intentMulti, agora, origemMessageId: alvoManual.origem });
        }
      }

      // 1.5a) CORRECAO DE FORMA: "Sol, foi pix" / "nao e cartao, e pix".
      // Antes do lançamento, remonta o preview. Depois do lançamento, muda só a
      // forma de pagamento via RPC auditada e referencia o lançamento recente.
      // Resposta a pergunta da forma: nao e correcao de nada — e a segunda
      // metade de um lancamento que a propria Sol comecou. So existe enquanto
      // houver pendencia `aguardando_forma_saida` (janela curta, aberta por
      // pergunta explicita dela), entao palavra de forma aqui E a resposta.
      if (!event.hasMedia && txt && !casarPode(txt).pode && !casarNao(txt)) {
        const _aguardando = limparVelhos(chatId, agora).find((p) => p.tipoOperacao === 'aguardando_forma_saida');
        if (_aguardando) {
          const _f = ((extrairCorrecaoForma(txt) || {}).forma) || extrairForma(txt, null);
          if (_f) {
            pendentes.set(chatId, limparVelhos(chatId, agora).filter((p) => p !== _aguardando));
            log({ acao: 'saida_forma_respondida', chatId, forma: _f, valor: _aguardando.valor });
            const _rf = await handle({
              ...event, _sintetico: true, hasMedia: false,
              body: `${_aguardando.textoOriginal || ''} ${_f}`.trim(),
              messageId: String(event.messageId || '') + '#forma',
            });
            if (_rf && _rf.acao === 'saida_texto_preview_enviado') return _rf;
            // Nao remontou: devolve a pendencia (o fallback LLM ainda alcanca)
            // e pede a frase completa em vez de sumir em silencio.
            const _volta = limparVelhos(chatId, agora);
            _volta.push({ ..._aguardando, ts: agora });
            pendentes.set(chatId, _volta);
            await sendFn(chatId, `Anotei *${_f}*, mas não consegui remontar o lançamento. Me manda a linha completa: *${_aguardando.descricao || _aguardando.categoria} — ${fmtBRL(_aguardando.valor)} ${_f}*.`);
            log({ acao: 'saida_forma_remontagem_falhou', chatId, forma: _f });
            return { acao: 'saida_forma_remontagem_falhou' };
          }
        }
      }
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        let corrForma = extrairCorrecaoForma(txt);
        if (corrForma && txt.length > 250) {
          log({ acao: 'correcao_forma_ignorada_prosa', chatId, len: txt.length });
          corrForma = null;
        }
        if (corrForma) {
          if (!corrForma.forma) {
            if (corrForma.ambigua) {
              await sendFn(chatId,
                'Você citou *' + corrForma.formas.join('* e *')
                + '* na mesma mensagem, então não sei qual é a deste comprovante. '
                + 'Me diz só a forma dele: *pix*, *dinheiro*, *cartão débito* ou *cartão crédito*.');
              log({ acao: 'correcao_forma_ambigua', chatId, formas: corrForma.formas });
              return { acao: 'correcao_forma_ambigua' };
            }
            await sendFn(chatId, 'Me diz a forma certa pra eu corrigir: *pix*, *dinheiro*, *cartão débito* ou *cartão crédito*.');
            log({ acao: 'correcao_forma_sem_destino', chatId });
            return { acao: 'correcao_forma_sem_destino' };
          }
          const candidatos = arrP.filter((p) => p.valor);
          let alvoP = null;
          if (event.quotedMessageId) alvoP = candidatos.find((p) => p.previewId === event.quotedMessageId) || null;
          if (!alvoP && candidatos.length === 1) alvoP = candidatos[0];
          if (alvoP && !alvoP.forma) {
            // "foi no cartao/pix" ainda pode ser só complemento de preview
            // incompleto; deixa a rotina 1.5b preencher e perguntar o "pode".
          } else {
          if (alvoP) {
            alvoP.forma = corrForma.forma;
            alvoP.formaIncerta = false;
            alvoP.cartaoModalidade = corrForma.cartaoModalidade || null;
            alvoP.cartaoParcelas = corrForma.cartaoParcelas || null;
            alvoP.ts = agora;
            let texto = `Você tem razão: a forma é ${corrForma.forma === 'cartao' ? 'cartão' : corrForma.forma}. Remontei o preview:\n\n` + montarPreview({
              unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma, descricao: alvoP.descricao,
              categoria: alvoP.categoria || 'parcela', aluno: alvoP.aluno, competencia: alvoP.competencia,
              parcela: alvoP.parcela, confiancaBaixa: false,
              responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: false,
              cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
              multiplas: alvoP.multiplas, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              // 🔴 A FATURA JA FIXADA TEM DE SOBREVIVER A CORRECAO DE FORMA.
              //    Aqui estava `canonica: null` fixo, e o card era remontado SEM
              //    a fatura que a humana tinha acabado de corrigir — em Recreio,
              //    10/09, "sol, pagamento foi pix" desfez a competencia 09/2026
              //    e o card voltou para 10/2026. Duas vezes. Trocar a FORMA nao
              //    reabre QUAL fatura foi escolhida; sao decisoes diferentes.
              //    A pendencia ja guardava `alvoP.canonica` (as correcoes de
              //    aluno/competencia gravam ali); so a renderizacao a jogava fora.
              canonica: alvoP.canonica || null, duplicata: null, quitacao: alvoP.quitacao || null,
              faturaIndisponivel: false, composto: alvoP.composto || null,
              bloqueiaLancamento: alvoP.bloqueiaLancamento, itemLojinha: alvoP.itemLojinha,
            });
            if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
              result: { acao: 'preview_forma_corrigida', forma: alvoP.forma },
            })) return { acao: 'preview_forma_corrigida_sem_v3', forma: alvoP.forma };
            log({ acao: 'preview_forma_corrigida', chatId, forma: alvoP.forma });
            return { acao: 'preview_forma_corrigida', forma: alvoP.forma };
          }
          let alvoL = alvoLancado(chatId, event.quotedMessageId, agora);
          if (!alvoL && event.quotedBody) {
            const citado = extrairLancamentoCitado(event.quotedBody);
            if (citado && citado.valor) {
              let achado = null;
              try {
                achado = await buscarCorrecaoFn({
                  unidade_id: grp.unidade_id,
                  valor: citado.valor,
                  categoria: citado.categoria,
                  forma_atual: citado.formaAtual,
                  chat_id: chatId,
                  quoted_message_id: event.quotedMessageId || null,
                });
              } catch (e) {
                log({ acao: 'erro_rpc_buscar_correcao_forma', erro: String(e && e.message) });
              }
              if (achado && achado.ok && achado.movimentacao_id) {
                alvoL = {
                  confirmMessageId: event.quotedMessageId || null,
                  previewId: null,
                  movimentacao_id: achado.movimentacao_id,
                  unidade_id: achado.unidade_id || grp.unidade_id,
                  nome: grp.nome,
                  valor: Number(achado.valor || citado.valor),
                  forma: achado.forma || citado.formaAtual,
                  categoria: achado.categoria || citado.categoria,
                  cartaoModalidade: achado.cartao_modalidade || citado.cartaoModalidade || null,
                };
                log({ acao: 'correcao_forma_alvo_por_citado', chatId, movimentacao_id: alvoL.movimentacao_id });
              } else if (achado && achado.motivo) {
                log({ acao: 'correcao_forma_citado_sem_match', chatId, motivo: achado.motivo });
              }
            }
          }
          // 🔴 06/10/2026 (Recreio): a Vitoria citou o "✅ Lancei a saída… (dinheiro)"
          //    explicando o problema da descricao ("retirada de dinheiro no caixa…") e
          //    recebeu "Vou corrigir … R$ 91,40 de dinheiro para dinheiro. Posso?".
          //    Correcao para a MESMA forma nao corrige nada: e conversa sobre o lancamento.
          if (alvoL && alvoL.forma && alvoL.forma === corrForma.forma
              && (corrForma.forma !== 'cartao' || !corrForma.cartaoModalidade
                  || corrForma.cartaoModalidade === (alvoL.cartaoModalidade || null))) {
            log({ acao: 'correcao_forma_sem_mudanca', chatId, movimentacao_id: alvoL.movimentacao_id, forma: corrForma.forma });
            return { acao: 'correcao_forma_sem_mudanca' };
          }
          if (!alvoL) {
            await sendFn(chatId, 'Consigo corrigir, mas preciso saber qual lançamento. Responde citando minha mensagem do lançamento e manda: *Sol, foi pix*.');
            log({ acao: 'correcao_forma_sem_alvo', chatId });
            return { acao: 'correcao_forma_sem_alvo' };
          }
          if (dryRun) {
            await sendFn(chatId, `🧪 (teste) Eu corrigiria ${fmtBRL(alvoL.valor)} de ${alvoL.forma} para ${corrForma.forma}.`);
            return { acao: 'dryrun_corrigir_forma' };
          }
          let idAut = null;
          try { idAut = await identidadeFn(event.senderPhone || event.senderId, alvoL.unidade_id); } catch (e) { /* best-effort */ }
          const autorizadoPor = nomeParaCarimbo(idAut, event);
          const payloadCorr = {
            movimentacao_id: alvoL.movimentacao_id, unidade_id: alvoL.unidade_id,
            valor: String(alvoL.valor || 0),
            categoria: String(alvoL.categoria || 'movimento'),
            forma: corrForma.forma, cartao_modalidade: corrForma.cartaoModalidade, cartao_parcelas: corrForma.cartaoParcelas,
            ator_numero: senderNum, ator_papel: 'grupo', chat_id: chatId, grupo_jid: chatId,
            origem_message_id: event.messageId, preview_message_id: alvoL.previewId || alvoL.confirmMessageId || null,
            autorizado_por: autorizadoPor,
            motivo: 'correcao de forma solicitada no grupo',
            idempotency_key: `${chatId}:${event.messageId}:corrigir_forma:${alvoL.movimentacao_id}`,
          };
          if (v3LedgerAtivo) {
            const textoPreview = `Vou corrigir a forma deste lançamento no caixa da ${grp.nome}: ${fmtBRL(alvoL.valor)} de ${alvoL.forma || 'forma atual'} para ${corrForma.forma === 'cartao' ? 'cartão' : corrForma.forma}.\n\n👉 Posso corrigir agora? Responde *pode*.`;
            const previewId = await sendFn(chatId, textoPreview);
            const pendenciaOperacao = {
              previewId,
              tipoOperacao: 'corrigir_movimento',
              v3Operacao: 'correcao_movimento',
              unidade_id: payloadCorr.unidade_id,
              nome: grp.nome,
              valor: Number(payloadCorr.valor || 0),
              forma: payloadCorr.forma,
              categoria: payloadCorr.categoria,
              aluno: null,
              descricao: 'Correção de forma',
              idemKey: payloadCorr.idempotency_key,
              origem: event.messageId,
              payloadBase: payloadCorr,
              correcoes: {
                forma_pagamento: corrForma.forma,
                cartao_modalidade: corrForma.cartaoModalidade || null,
                cartao_parcelas: corrForma.cartaoParcelas || null,
              },
              movimentacao_id: alvoL.movimentacao_id,
              ts: agora,
            };
            const v3 = await registrarPreviewPublicoV3({
              event, grupo: grp, previewId, texto: textoPreview, pendencia: pendenciaOperacao,
              result: { acao: 'correcao_forma_preview_enviado', movimentacao_id: alvoL.movimentacao_id, forma: corrForma.forma },
            });
            if (v3 && v3.preview_id) {
              pendenciaOperacao.v3PreviewId = v3.preview_id;
              pendenciaOperacao.v3PreviewHash = v3.preview_hash || null;
            }
            const arr = limparVelhos(chatId, agora);
            arr.push(pendenciaOperacao);
            pendentes.set(chatId, arr);
            log({ acao: 'correcao_forma_preview_enviado', movimentacao_id: alvoL.movimentacao_id, forma: corrForma.forma });
            return { acao: 'correcao_forma_preview_enviado', movimentacao_id: alvoL.movimentacao_id, forma: corrForma.forma };
          }
          await sendFn(chatId, '⚠️ Não corrigi: a correção de forma exige o preview V3 com aprovação. Reenvia o pedido em instantes.');
          log({ acao: 'correcao_forma_bloqueada_sem_v3', movimentacao_id: alvoL.movimentacao_id });
          return { acao: 'correcao_forma_bloqueada_sem_v3' };
          }
        }
      }

      // 1.5b) CORRECAO TARDIA: preview saiu sem aluno, ou com aluno claramente
      // contaminado por legenda ("restante do passaporte da aluna X"), e o humano
      // respondeu depois "Aluno: X" / "A aluna e X". Ainda exige "pode" para lancar.
      // DESCARTE: some com a pendencia citada (ou a unica recente). Antes do
      // nome-tardio de proposito — "nao" nunca pode ser lido como nome de aluno.
      if (!event.hasMedia && txt && casarNao(txt)) {
        const arrD = limparVelhos(chatId, agora);
        let alvoD = null;
        if (event.quotedMessageId) alvoD = arrD.find((p) => p.previewId === event.quotedMessageId) || null;
        if (!alvoD && arrD.length === 1) alvoD = arrD[0];
        if (alvoD) {
          const fimD = await finalizarPreviewSeguroV3({
            alvo: alvoD, status: 'rejected', motivo: 'descartado_pelo_operador',
          });
          if (!fimD || !fimD.ok) {
            await sendFn(chatId,
              '⚠️ Não consegui descartar esse preview com segurança agora. Ele continua pendente; tenta de novo em instantes.');
            log({ acao: 'preview_descarte_bloqueado', chatId, previewId: alvoD.previewId,
                  motivo: fimD && fimD.motivo });
            return { acao: 'preview_descarte_bloqueado' };
          }
          pendentes.set(chatId, arrD.filter((p) => p !== alvoD));
          limparEnvelopeDaPendencia(chatId, alvoD, 'descartado');
          // 🔴 ANTES DE AFIRMAR, OLHAR. "Nada foi gravado no caixa" e afirmacao
          // sobre o CAIXA; descartar o preview so autoriza a falar do PREVIEW.
          // Em 08/09 ela disse as duas como se fossem uma, e a entrada das 11:24
          // continuou la — quem descobriu foi a Fernanda, conferindo na mao.
          const grpD = grupos && grupos[chatId];
          let jaNoCaixa = null;
          let conferiu = false;
          if (grpD && grpD.unidade_id && alvoD.valor != null) {
            try {
              const d = await duplicataFn(grpD.unidade_id, alvoD.valor,
                                          alvoD.aluno || alvoD.aluno_nome || null);
              conferiu = true;
              if (d && d.ja_lancado) jaNoCaixa = d;
            } catch (_) { conferiu = false; }
          }
          if (jaNoCaixa) {
            // forma da RPC: { ok, ja_lancado, itens:[{hora,forma,valor,descricao}] }
            const it = (jaNoCaixa.itens && jaNoCaixa.itens[0]) || {};
            // ⚠️ Ela NAO estorna sozinha: conta o que existe e PEDE.
            await sendFn(chatId,
              `👍 Descartei o preview${alvoD.valor ? ' de ' + fmtBRL(alvoD.valor) : ''}.` +
              '\n\n' +
              `⚠️ Mas atenção: a entrada${it.valor != null ? ' de ' + fmtBRL(it.valor) : ''}${it.hora ? ' das ' + it.hora : ''} continua no caixa — essa eu ja tinha lancado.` +
              '\n' +
              `${it.descricao ? '· ' + it.descricao + '\n' : ''}Se quiser que eu tire, me responde *estorna*.`);
            log({ acao: 'descarte_com_entrada_no_caixa', chatId, previewId: alvoD.previewId,
                  valor: alvoD.valor, entrada_hora: it.hora || null });
            return { acao: 'descarte_com_entrada_no_caixa' };
          }
          // ⚠️ Sem ter conseguido conferir, NAO afirma ausencia.
          await sendFn(chatId, conferiu
            ? `👍 Descartei${alvoD.valor ? ' o lançamento de ' + fmtBRL(alvoD.valor) : ''}. Nada foi gravado no caixa.`
            : `👍 Descartei o preview${alvoD.valor ? ' de ' + fmtBRL(alvoD.valor) : ''}. Nao consegui conferir o caixa agora — se eu ja tinha lancado antes, me avisa.`);
          log({ acao: 'preview_descartado', chatId, previewId: alvoD.previewId,
                valor: alvoD.valor, conferiu_caixa: conferiu });
          return { acao: 'preview_descartado' };
        }
      }
      // CORRECAO DE TIPO: "Sol, foi saida / e despesa" com card aberto converte o
      // lancamento em saida de caixa, em vez de virar nome de aluno ou "nao entendi".
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const _catSaidaCorr = _saidaExplicitaFromCaption(txt);
        // ⚠️ Se ha MIDIA deste remetente consolidando AGORA (lote aberto), este texto
        // e a LEGENDA dela — deixa chegar ao anexarTextoAoLote no fim do handler.
        // Sem esta guarda, a legenda do reenvio era sequestrada e convertia uma
        // pendencia velha (caso refrigerantes 28/08: card saiu R$ 5,01).
        const _loteVivo = (() => {
          const l = lotesMidia.get(textoIrmaoKey(event));
          return !!(l && (agora - l.ts) <= 5000);
        })();
        if (_catSaidaCorr && !_loteVivo) {
          const arrS = limparVelhos(chatId, agora);
          let alvoS = null;
          if (event.quotedMessageId) alvoS = arrS.find((p) => p.previewId === event.quotedMessageId) || null;
          if (!alvoS && arrS.length === 1) alvoS = arrS[0];
          if (alvoS && !categoriaEhSaida(alvoS.categoria)) {
            alvoS.categoria = _catSaidaCorr;
            // Evidencia explicita do humano vence o que a pendencia herdou de OCR
            // ruim: "2 refrigerantes R$34 ... dinheiro" corrige valor E forma.
            const _vCorr = extrairValor(txt);
            if (_vCorr) alvoS.valor = _vCorr;
            const _fCorr = extrairForma(txt, null);
            if (_fCorr) { alvoS.forma = _fCorr; alvoS.formaIncerta = false; }
            alvoS.aluno = null;              // saida nao tem aluno
            alvoS.competencia = null;
            alvoS.parcela = null;
            alvoS.canonica = null;
            alvoS.composto = null;
            alvoS.multiplas = false;
            alvoS.responsavelFinanceiro = null;
            alvoS.candidatosAluno = null;
            alvoS.bloqueiaLancamento = false;
            alvoS.descricao = _descricaoSaidaTexto(alvoS.legenda || txt, _catSaidaCorr) || null;
            alvoS.ts = agora;
            let textoS = 'Corrigi — isso e saida de caixa:\n\n' + montarPreview({
              unidadeNome: alvoS.nome, valor: alvoS.valor, forma: alvoS.forma, descricao: alvoS.descricao,
              categoria: alvoS.categoria, aluno: null, competencia: null, parcela: null,
              confiancaBaixa: false, responsavelFinanceiro: null, formaIncerta: alvoS.formaIncerta,
              cartaoModalidade: alvoS.cartaoModalidade, cartaoParcelas: alvoS.cartaoParcelas,
              multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false,
            });
            if (dryRun) textoS += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoS.previewId = await sendFn(chatId, textoS);
            (alvoS.msgIds = alvoS.msgIds || []).push(alvoS.previewId);
            alvoS.toquePor = String(event.senderPhone || event.senderId || '') || alvoS.toquePor;
            alvoS.toqueTs = agora;
            await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoS, previewId: alvoS.previewId, texto: textoS,
              result: { acao: 'preview_tipo_corrigido_saida', categoria: alvoS.categoria },
            });
            log({ acao: 'preview_tipo_corrigido_saida', chatId, categoria: alvoS.categoria, valor: alvoS.valor });
            return { acao: 'preview_tipo_corrigido_saida', categoria: alvoS.categoria };
          }
        }
        // ── contestacao da FATURA casada: solta e remonta sem atraso/multa ──
        if (_contestaFatura(txt)) {
          const _citaFC = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoFC = null;
          if (event.quotedMessageId) alvoFC = arrP.find((x) => _citaFC(x, event.quotedMessageId)) || null;
          if (!alvoFC && arrP.length === 1) alvoFC = arrP[0];
          if (alvoFC && (alvoFC.canonica || alvoFC.parcela || alvoFC.composto)) {
            alvoFC.canonica = null; alvoFC.parcela = null; alvoFC.composto = null;
            alvoFC.faturaContestada = true;
            // A categoria tinha vindo da fatura contestada; volta para a que o
            // interpretador leu da legenda/OCR (passaporte, no caso real).
            if (alvoFC.categoriaInterpretada && alvoFC.categoriaInterpretada !== alvoFC.categoria) {
              log({ acao: 'categoria_restaurada_pos_contestacao', chatId, de: alvoFC.categoria, para: alvoFC.categoriaInterpretada });
              alvoFC.categoria = alvoFC.categoriaInterpretada;
            }
            alvoFC.bloqueiaLancamento = false;
            alvoFC.faturaIndisponivel = false;
            alvoFC.bloqueiaFonteIndisponivel = false;
            alvoFC.confirmacaoManualFonte = true;
            alvoFC.descricao = _descricaoLancamento(alvoFC.categoria, alvoFC.competencia, alvoFC.aluno, null);
            alvoFC.ts = agora;
            let textoFC = 'Ok — soltei a fatura que eu tinha casado (não vou usar os dados dela). Confere assim:\n\n' + montarPreview({
              unidadeNome: alvoFC.nome, valor: alvoFC.valor, forma: alvoFC.forma,
              categoria: alvoFC.categoria, aluno: alvoFC.aluno, competencia: alvoFC.competencia,
              parcela: null, confiancaBaixa: false, responsavelFinanceiro: alvoFC.responsavelFinanceiro,
              formaIncerta: alvoFC.formaIncerta, cartaoModalidade: alvoFC.cartaoModalidade,
              cartaoParcelas: alvoFC.cartaoParcelas, multiplas: false,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: alvoFC.quitacao, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false,
              semAlunoDeclarado: alvoFC.semAluno, entidade: alvoFC.entidade,
            });
            if (dryRun) textoFC += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoFC.previewId = await sendFn(chatId, textoFC);
            (alvoFC.msgIds = alvoFC.msgIds || []).push(alvoFC.previewId);
            alvoFC.toquePor = String(event.senderPhone || event.senderId || '') || alvoFC.toquePor;
            alvoFC.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoFC, previewId: alvoFC.previewId, texto: textoFC,
              result: { acao: 'preview_fatura_contestada', categoria: alvoFC.categoria },
            })) return { acao: 'preview_fatura_contestada_sem_v3' };
            log({ acao: 'preview_fatura_contestada', chatId, categoria: alvoFC.categoria });
            return { acao: 'preview_fatura_contestada' };
          }
        }

        // ── "e' de banda / nao tem aluno especifico": receita sem aluno ─────
        const _semAlunoDecl = _semAlunoDeclarado(txt);
        if (_semAlunoDecl) {
          const _citaSA = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoSA = null;
          if (event.quotedMessageId) alvoSA = arrP.find((x) => _citaSA(x, event.quotedMessageId)) || null;
          if (!alvoSA && arrP.length === 1) alvoSA = arrP[0];
          if (alvoSA && !categoriaEhSaida(alvoSA.categoria)) {
            alvoSA.aluno = null; alvoSA.semAluno = true;
            alvoSA.entidade = _semAlunoDecl.entidade || alvoSA.entidade || null;
            alvoSA.responsavelFinanceiro = null; alvoSA.canonica = null; alvoSA.parcela = null;
            alvoSA.candidatosAluno = null; alvoSA.alunoViaPagador = null; alvoSA.pagadorNome = null;
            alvoSA.alunoNovoId = null; alvoSA.alunoNovoOrigem = null;
            alvoSA.bloqueiaLancamento = false; alvoSA.faturaIndisponivel = false;
            alvoSA.bloqueiaFonteIndisponivel = false; alvoSA.confirmacaoManualFonte = true;
            if (!alvoSA.categoria || /^(outro|parcela|mensalidade|passaporte|matricula)$/i.test(alvoSA.categoria)) alvoSA.categoria = 'venda';
            alvoSA.descricao = cap(alvoSA.categoria) + ' - ' + (alvoSA.entidade || 'banda/evento (sem aluno)');
            alvoSA.ts = agora;
            let textoSA = 'Entendi — sem aluno específico:\n\n' + montarPreview({
              unidadeNome: alvoSA.nome, valor: alvoSA.valor, forma: alvoSA.forma,
              categoria: alvoSA.categoria, aluno: null, competencia: alvoSA.competencia,
              parcela: null, confiancaBaixa: false, responsavelFinanceiro: null,
              formaIncerta: alvoSA.formaIncerta, cartaoModalidade: alvoSA.cartaoModalidade,
              cartaoParcelas: alvoSA.cartaoParcelas, multiplas: false,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: alvoSA.quitacao, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false, semAlunoDeclarado: true, entidade: alvoSA.entidade,
            });
            if (dryRun) textoSA += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoSA.previewId = await sendFn(chatId, textoSA);
            (alvoSA.msgIds = alvoSA.msgIds || []).push(alvoSA.previewId);
            alvoSA.toquePor = String(event.senderPhone || event.senderId || '') || alvoSA.toquePor;
            alvoSA.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoSA, previewId: alvoSA.previewId, texto: textoSA,
              result: { acao: 'preview_sem_aluno_corrigido', entidade: alvoSA.entidade || null },
            })) return { acao: 'preview_sem_aluno_corrigido_sem_v3' };
            log({ acao: 'preview_sem_aluno_corrigido', chatId, entidade: alvoSA.entidade || null, categoria: alvoSA.categoria });
            return { acao: 'preview_sem_aluno_corrigido', entidade: alvoSA.entidade || null };
          }
        }
        // ── correcao ditada de VALOR ("Sol, o valor foi R$387,00") ──────────
        // (31/08: nao era gramatica; a Mayra citou o card e levou "Nao entendi".)
        // Rotulo "valor" + numero e' forma de comando; nome junto ("a aluna e X
        // e o valor e Y") fica com o caminho do nome, que trata os dois.
        const _valorDitado = (() => {
          if (_alunoRotulado(txt)) return null;
          const m = _normConf(txt).match(/\bvalor\b\s*(?:foi|e|eh|era|correto(?:\s+e)?|de)?\s*[:-]?\s*(?:r\$)?\s*(\d[\d.,]*)/);
          if (!m) return null;
          const v = parseBRMoney(m[1]);
          return v && v > 0 ? v : null;
        })();
        if (_valorDitado) {
          const _citaVD = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoVD = null;
          if (event.quotedMessageId) alvoVD = arrP.find((x) => _citaVD(x, event.quotedMessageId)) || null;
          // 🔴 29/09/2026 (Recreio 16:10): explicação de 1.032 caracteres para a colega
          //    ("…cada R$ 500,00…") trocou o valor do card de R$ 1.850 para R$ 500. Sem citar
          //    o card, só vale ditado curto — prosa longa é conversa, não comando.
          if (!alvoVD && arrP.length === 1 && (bodyLimpo(txt).length <= 220 || _falouComSol(event))) alvoVD = arrP[0];
          if (!alvoVD && arrP.length === 1) log({ acao: 'valor_ditado_ignorado_prosa', chatId, len: bodyLimpo(txt).length });
          if (alvoVD && Math.abs((alvoVD.valor || 0) - _valorDitado) >= 0.01) {
            log({ acao: 'preview_valor_corrigido', chatId, de: alvoVD.valor || null, para: _valorDitado });
            alvoVD.valor = _valorDitado;
            if (alvoVD.parcela && alvoVD.parcela.valor_da_parcela != null) {
              alvoVD.parcela.valor_bate = Math.abs(Number(alvoVD.parcela.valor_da_parcela) - _valorDitado) < 0.01;
            }
            alvoVD.bloqueiaLancamento = deveBloquearLancamento({ composto: alvoVD.composto, parcela: alvoVD.parcela, canonica: alvoVD.canonica, valor: alvoVD.valor, quitacao: alvoVD.quitacao, multiplas: alvoVD.multiplas });
            alvoVD.ts = agora;
            let textoVD = 'Corrigi o valor:\n\n' + montarPreview({
              unidadeNome: alvoVD.nome, valor: alvoVD.valor, forma: alvoVD.forma, descricao: alvoVD.descricao,
              categoria: alvoVD.categoria, aluno: alvoVD.aluno, competencia: alvoVD.competencia,
              parcela: alvoVD.parcela, confiancaBaixa: false, responsavelFinanceiro: alvoVD.responsavelFinanceiro,
              formaIncerta: alvoVD.formaIncerta, cartaoModalidade: alvoVD.cartaoModalidade,
              cartaoParcelas: alvoVD.cartaoParcelas, multiplas: alvoVD.multiplas,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: alvoVD.canonica, duplicata: null, quitacao: alvoVD.quitacao,
              faturaIndisponivel: alvoVD.faturaIndisponivel, composto: alvoVD.composto,
              bloqueiaLancamento: alvoVD.bloqueiaLancamento,
              semAlunoDeclarado: alvoVD.semAluno, entidade: alvoVD.entidade,
            });
            if (dryRun) textoVD += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoVD.previewId = await sendFn(chatId, textoVD);
            (alvoVD.msgIds = alvoVD.msgIds || []).push(alvoVD.previewId);
            alvoVD.toquePor = String(event.senderPhone || event.senderId || '') || alvoVD.toquePor;
            alvoVD.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoVD, previewId: alvoVD.previewId, texto: textoVD,
              result: { acao: 'preview_valor_corrigido', valor: _valorDitado },
            })) return { acao: 'preview_valor_corrigido_sem_v3' };
            return { acao: 'preview_valor_corrigido', valor: _valorDitado };
          }
        }

        // ── PERÍODO DA QUITAÇÃO (SOL-103, 29/09/2026). O card de quitação ensina
        // "se for outro período, me diz: *de 09/2026 a 08/2027*", e a resposta
        // "de 10/2026 a 09/2027" caía no caminho de VÁRIAS COMPETÊNCIAS abaixo —
        // lida como duas parcelas (10/2026 e 09/2027), invalidava o card. Num card
        // de quitação, intervalo é o PERÍODO: vira a lista de competências, as
        // faturas do período são resolvidas de novo e o MESMO card é remontado.
        const _periodoQuit = (!event.hasMedia && !casarPode(txt).pode) ? extrairPeriodoMeses(txt) : null;
        if (_periodoQuit) {
          const _citaQ = (x, id) => x.previewId === id || x.origem === id
            || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          const elegiveisQ = arrP.filter((x) => x.multiplas && !categoriaEhSaida(x.categoria)
            && x.tipoOperacao !== 'manual_review_multi_student' && x.tipoOperacao !== 'lancar_recebimento_lote');
          const alvoQ = event.quotedMessageId
            ? (elegiveisQ.find((x) => _citaQ(x, event.quotedMessageId)) || null)
            : (elegiveisQ.length === 1 ? elegiveisQ[0] : null);
          if (alvoQ) {
            const [mi, ai] = _periodoQuit.inicio.split('/').map(Number);
            const [mf, af] = _periodoQuit.fim.split('/').map(Number);
            const nMeses = (af * 12 + mf) - (ai * 12 + mi) + 1;
            if (!(nMeses >= 2 && nMeses <= 13)) {
              await sendFn(chatId, `Esse período (*${_periodoQuit.inicio} a ${_periodoQuit.fim}*) não fecha uma quitação de 2 a 13 parcelas. Me diz de novo, por exemplo: *de 10/2026 a 09/2027*.`);
              log({ acao: 'quitacao_periodo_invalido', chatId, inicio: _periodoQuit.inicio, fim: _periodoQuit.fim, n: nMeses });
              return { acao: 'quitacao_periodo_invalido' };
            }
            const qAnt = alvoQ.quitacao || {};
            const vparcQ = qAnt.vparc || (alvoQ.canonica && alvoQ.canonica.fatura
              && Number(alvoQ.canonica.fatura.valor_da_parcela)) || null;
            const qNova = { n: nMeses, vparc: vparcQ, inicio: _periodoQuit.inicio, fim: _periodoQuit.fim,
              proposto: false, competencias: [] };
            for (let k = 0; k < nMeses; k++) { const s = _somaMeses(mi, ai, k); qNova.competencias.push(_mm(s.mes, s.ano)); }
            const _alunoQ = derivarVinculo({ canonica: alvoQ.canonica, parcela: alvoQ.parcela, alunoNovoId: alvoQ.alunoNovoId }).aluno_id;
            try {
              qNova.faturas = _alunoQ ? await faturasQuitacaoFn(grp.unidade_id, _alunoQ, qNova) : { ok: false, motivo: 'aluno_sem_vinculo' };
            } catch (e) {
              qNova.faturas = { ok: false, motivo: 'erro_leitura' };
              log({ acao: 'quitacao_faturas_erro', chatId, erro: String(e && e.message) });
            }
            alvoQ.quitacao = qNova;
            alvoQ.multiplas = true;
            alvoQ.descricao = (qNova.faturas && qNova.faturas.ok)
              ? (`Parcelas ${qNova.faturas.inicio} a ${qNova.faturas.fim}`
                 + (qNova.faturas.curso ? ` do curso de ${qNova.faturas.curso}` : '') + (alvoQ.aluno ? ' - ' + alvoQ.aluno : ''))
              : (`Quitacao ${nMeses}x (${qNova.inicio} a ${qNova.fim})` + (alvoQ.aluno ? ' - ' + alvoQ.aluno : ''));
            alvoQ.bloqueiaLancamento = deveBloquearLancamento({ composto: alvoQ.composto, parcela: alvoQ.parcela,
              canonica: alvoQ.canonica, valor: alvoQ.valor, quitacao: qNova, multiplas: true });
            alvoQ.ts = agora;
            let textoQ = 'Atualizei o período da quitação:\n\n' + montarPreview({
              unidadeNome: alvoQ.nome, valor: alvoQ.valor, forma: alvoQ.forma,
              categoria: alvoQ.categoria, aluno: alvoQ.aluno, competencia: alvoQ.competencia,
              parcela: alvoQ.parcela, confiancaBaixa: false, responsavelFinanceiro: alvoQ.responsavelFinanceiro,
              formaIncerta: alvoQ.formaIncerta, cartaoModalidade: alvoQ.cartaoModalidade,
              cartaoParcelas: alvoQ.cartaoParcelas, multiplas: true,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: alvoQ.canonica, duplicata: null, quitacao: qNova,
              faturaIndisponivel: alvoQ.faturaIndisponivel, composto: alvoQ.composto,
              bloqueiaLancamento: alvoQ.bloqueiaLancamento,
            });
            if (dryRun) textoQ += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoQ.previewId = await sendFn(chatId, textoQ);
            (alvoQ.msgIds = alvoQ.msgIds || []).push(alvoQ.previewId);
            alvoQ.toquePor = String(event.senderPhone || event.senderId || '') || alvoQ.toquePor;
            alvoQ.toqueTs = agora;
            log({ acao: 'quitacao_periodo_corrigido', chatId, inicio: qNova.inicio, fim: qNova.fim, n: nMeses,
                  faturas_ok: !!(qNova.faturas && qNova.faturas.ok) });
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoQ, previewId: alvoQ.previewId, texto: textoQ,
              result: { acao: 'quitacao_periodo_corrigido', inicio: qNova.inicio, fim: qNova.fim },
            })) return { acao: 'quitacao_periodo_corrigido_sem_v3' };
            return { acao: 'quitacao_periodo_corrigido', inicio: qNova.inicio, fim: qNova.fim };
          }
        }

        // ── correcao para VARIAS COMPETENCIAS do mesmo aluno. Precisa vir
        // antes da correcao singular e, sobretudo, antes de _nomeHumanoTardio:
        // "sao duas parcelas ..." descreve faturas, nunca uma pessoa.
        const _competenciasCorrigidas = (!event.hasMedia && !casarPode(txt).pode)
          ? extrairCompetenciasTexto(txt) : [];
        if (_competenciasCorrigidas.length >= 2
            && (event.quotedMessageId || (arrP.length === 1 && /\b(?:s[aã]o|cobre|cobrem|corresponde|correspondem)\b[\s\S]{0,40}\bparcelas?\b/i.test(txt)))) {
          const _citaLista = (x, id) => x.previewId === id || x.origem === id
            || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          const elegiveisLista = arrP.filter((x) => !categoriaEhSaida(x.categoria)
            && x.tipoOperacao !== 'manual_review_multi_student'
            && x.tipoOperacao !== 'lancar_recebimento_lote');
          let alvoLista = null;
          if (event.quotedMessageId) alvoLista = elegiveisLista.find((x) => _citaLista(x, event.quotedMessageId)) || null;
          if (!alvoLista && !event.quotedMessageId && elegiveisLista.length === 1) alvoLista = elegiveisLista[0];
          if (!alvoLista) {
            await sendFn(chatId, 'Entendi os dois meses, mas não achei um único card ativo para corrigir. Reenvia o comprovante com o nome do aluno.');
            return { acao: 'parcelas_competencias_sem_alvo' };
          }
          const rLista = await tratarParcelasCompetenciasExplicitas({
            event, grupo: grp, agora, texto: txt,
            aluno: alvoLista.aluno, valor: alvoLista.valor, forma: alvoLista.forma,
            categoria: alvoLista.categoria || 'parcela',
            origemMessageId: alvoLista.origem,
            supersedePreviewId: alvoLista.previewId,
            evidenceEnvelope: alvoLista.evidenceEnvelope || null,
          });
          if (rLista) return rLista;
        }

        // ── correcao de COMPETENCIA: operacao propria, sem fingir que o aluno
        // mudou. Resolve novamente a fatura pelo mesmo aluno/valor e pela
        // competencia declarada; os demais campos da pendencia sobrevivem.
        const _competenciaCorrigida = (!event.hasMedia && !casarPode(txt).pode && !_alunoRotulado(txt))
          ? (event._correcaoCompetencia || extrairCorrecaoCompetencia(txt))
          : null;
        if (_competenciaCorrigida) {
          const _citaComp = (x, id) => x.previewId === id || x.origem === id
            || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          const elegiveisCompTodos = _arrPTodos.filter((x) => !categoriaEhSaida(x.categoria)
            && x.tipoOperacao !== 'manual_review_multi_student'
            && x.tipoOperacao !== 'lancar_recebimento_lote');
          const elegiveisComp = arrP.filter((x) => !categoriaEhSaida(x.categoria)
            && x.tipoOperacao !== 'manual_review_multi_student'
            && x.tipoOperacao !== 'lancar_recebimento_lote');
          let alvoComp = null;
          if (event.quotedMessageId) {
            alvoComp = elegiveisCompTodos.find((x) => _citaComp(x, event.quotedMessageId)) || null;
            // 🔴 29/09/2026 (CG 17:43): o autor respondeu uma mensagem humana
            // ("Vou ver aqui"), não o card, com a correção explícita "A parcela
            // é 10/2026". Havia um único card ativo dele, mas a Sol mentiu que o
            // card não estava mais ativo. A citação errada não deve sequestrar uma
            // correção explícita do próprio autor; conversa de outra pessoa e
            // pergunta continuam sem poder tocar no card.
            if (!alvoComp && elegiveisCompTodos.length === 1
                && _ehAutor(elegiveisCompTodos[0]) && !_pergunta) {
              alvoComp = elegiveisCompTodos[0];
              log({ acao: 'correcao_competencia_autor_citou_conversa', chatId,
                    quotedMessageId: event.quotedMessageId });
            }
          }
          if (!event.quotedMessageId && elegiveisComp.length === 1) alvoComp = elegiveisComp[0];
          if (!alvoComp) {
            const motivo = event.quotedMessageId ? 'card_citado_nao_encontrado' : 'mais_de_um_card';
            await sendFn(chatId, motivo === 'mais_de_um_card'
              ? 'Entendi a competência, mas há mais de um card aberto. Cita o card certo e manda de novo.'
              : 'Entendi a competência, mas esse card não está mais ativo. Reenvia o comprovante para eu remontar com segurança.');
            log({ acao: 'correcao_competencia_sem_alvo', chatId, competencia: _competenciaCorrigida, motivo });
            return { acao: 'correcao_competencia_sem_alvo', motivo };
          }

          const competenciaAnterior = alvoComp.competencia || null;
          let canonicaComp = null;
          let parcelaComp = null;
          let compostoComp = null;
          let falhasFonte = 0;
          if (alvoComp.aluno) {
            try {
              const c = await canonicaFn(alvoComp.unidade_id, alvoComp.aluno, alvoComp.valor);
              const compC = _competenciaParaExibicao(c && c.fatura && c.fatura.competencia)
                || _competenciaParaExibicao(c && c.parcela && c.parcela.competencia);
              if (c && c.ok && (!c.aluno_nome || _mesmaPessoa(c.aluno_nome, alvoComp.aluno))
                  && compC === _competenciaCorrigida) canonicaComp = c;
            } catch (_) { falhasFonte++; }
            try {
              const m = await casarFn(alvoComp.unidade_id, alvoComp.aluno, alvoComp.valor, _competenciaCorrigida);
              const compM = _competenciaParaExibicao(m && m.parcela && m.parcela.competencia);
              if (m && m.ok && m.parcela && (!m.aluno_nome || _mesmaPessoa(m.aluno_nome, alvoComp.aluno))
                  && compM === _competenciaCorrigida) parcelaComp = m.parcela;
            } catch (_) { falhasFonte++; }
            try {
              const cm = await faturasMesFn(alvoComp.unidade_id, alvoComp.aluno, _competenciaCorrigida, alvoComp.valor);
              if (cm && cm.ok && Array.isArray(cm.partes) && cm.partes.length >= 2
                  && (!cm.aluno_nome || _mesmaPessoa(cm.aluno_nome, alvoComp.aluno))) compostoComp = cm;
            } catch (_) { /* composto e best-effort */ }
          }

          // A declaracao humana vence o texto descritivo e qualquer fatura de
          // outro mes. Sem casamento exato, soltamos o vinculo: e mais seguro
          // lancar sem fatura do que baixar a fatura errada.
          alvoComp.competencia = _competenciaCorrigida;
          // Uma competência declarada é UMA parcela: a quitação deduzida antes
          // (período/meses/faturas) não sobrevive à correção humana (CG 03/10).
          alvoComp.multiplas = false;
          alvoComp.quitacao = null;
          alvoComp.canonica = compostoComp ? null : canonicaComp;
          alvoComp.parcela = compostoComp ? null : parcelaComp;
          alvoComp.composto = compostoComp;
          alvoComp.faturaIndisponivel = falhasFonte >= 2;
          alvoComp.bloqueiaFonteIndisponivel = falhasFonte >= 2;
          alvoComp.bloqueiaLancamento = !!(parcelaComp && parcelaComp.multiplas_no_mes && parcelaComp.valor_bate === false);
          alvoComp.descricao = descricaoDoComposto(compostoComp, alvoComp.aluno)
            || descricaoDaFatura(canonicaComp, alvoComp.aluno)
            || _descricaoLancamento(alvoComp.categoria, _competenciaCorrigida, alvoComp.aluno, parcelaComp);
          alvoComp.ts = agora;

          let textoComp = `Corrigi a competência para *${_competenciaCorrigida}*:\n\n` + montarPreview({
            unidadeNome: alvoComp.nome, valor: alvoComp.valor, forma: alvoComp.forma,
            categoria: alvoComp.categoria, aluno: alvoComp.aluno, competencia: alvoComp.competencia,
            parcela: alvoComp.parcela, confiancaBaixa: false,
            responsavelFinanceiro: alvoComp.responsavelFinanceiro,
            formaIncerta: alvoComp.formaIncerta, cartaoModalidade: alvoComp.cartaoModalidade,
            cartaoParcelas: alvoComp.cartaoParcelas, multiplas: alvoComp.multiplas,
            alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
            canonica: alvoComp.canonica, duplicata: null, quitacao: alvoComp.quitacao,
            faturaIndisponivel: alvoComp.faturaIndisponivel, composto: alvoComp.composto,
            bloqueiaLancamento: alvoComp.bloqueiaLancamento,
            semAlunoDeclarado: alvoComp.semAluno, entidade: alvoComp.entidade,
          });
          if (dryRun) textoComp += '\n\n_(modo teste — nada será gravado no caixa)_';
          alvoComp.previewId = await sendFn(chatId, textoComp);
          (alvoComp.msgIds = alvoComp.msgIds || []).push(alvoComp.previewId);
          alvoComp.toquePor = String(event.senderPhone || event.senderId || '') || alvoComp.toquePor;
          alvoComp.toqueTs = agora;
          const resultadoComp = {
            acao: 'preview_competencia_corrigida',
            de: competenciaAnterior, para: _competenciaCorrigida,
            fatura_vinculada: !!(canonicaComp || parcelaComp || compostoComp),
          };
          if (!await vincularPreviewRemontadoV3({
            event, grupo: grp, pendencia: alvoComp, previewId: alvoComp.previewId,
            texto: textoComp, result: resultadoComp,
          })) return { acao: 'preview_competencia_corrigida_sem_v3', competencia: _competenciaCorrigida };
          log({ ...resultadoComp, chatId });
          return { ...resultadoComp, competencia: _competenciaCorrigida };
        }

        // ── correcao ditada de categoria SEM aprovacao ("coloca a categoria
        // como venda"): atualiza a pendencia e remonta o card — antes caia no
        // limbo (nem correcao, nem aprovacao, nem resposta).
        const _catDitada = extrairCategoriaCorrecao(txt);
        if (_catDitada) {
          const _citaCD = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoCD = null;
          if (event.quotedMessageId) alvoCD = arrP.find((x) => _citaCD(x, event.quotedMessageId)) || null;
          if (!alvoCD && arrP.length === 1) alvoCD = arrP[0];
          if (alvoCD && !categoriaEhSaida(alvoCD.categoria) && !categoriaEhSaida(_catDitada)
              && String(alvoCD.categoria || '') !== _catDitada) {
            const catAntiga = alvoCD.categoria || null;
            alvoCD.categoria = _catDitada;
            if (alvoCD.descricao && catAntiga && alvoCD.descricao.toLowerCase().indexOf(String(catAntiga).toLowerCase()) === 0) {
              alvoCD.descricao = cap(_catDitada) + alvoCD.descricao.slice(String(catAntiga).length);
            }
            alvoCD.ts = agora;
            let textoCD = 'Troquei a categoria:\n\n' + montarPreview({
              unidadeNome: alvoCD.nome, valor: alvoCD.valor, forma: alvoCD.forma, descricao: alvoCD.descricao,
              categoria: alvoCD.categoria, aluno: alvoCD.aluno, competencia: alvoCD.competencia,
              parcela: alvoCD.parcela, confiancaBaixa: false, responsavelFinanceiro: alvoCD.responsavelFinanceiro,
              formaIncerta: alvoCD.formaIncerta, cartaoModalidade: alvoCD.cartaoModalidade,
              cartaoParcelas: alvoCD.cartaoParcelas, multiplas: alvoCD.multiplas,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: alvoCD.canonica, duplicata: null, quitacao: alvoCD.quitacao,
              faturaIndisponivel: alvoCD.faturaIndisponivel, composto: alvoCD.composto,
              bloqueiaLancamento: alvoCD.bloqueiaLancamento, semAlunoDeclarado: alvoCD.semAluno, entidade: alvoCD.entidade,
            });
            if (dryRun) textoCD += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoCD.previewId = await sendFn(chatId, textoCD);
            (alvoCD.msgIds = alvoCD.msgIds || []).push(alvoCD.previewId);
            alvoCD.toquePor = String(event.senderPhone || event.senderId || '') || alvoCD.toquePor;
            alvoCD.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoCD, previewId: alvoCD.previewId, texto: textoCD,
              result: { acao: 'preview_categoria_corrigida', de: catAntiga, para: _catDitada },
            })) return { acao: 'preview_categoria_corrigida_sem_v3' };
            log({ acao: 'preview_categoria_corrigida', chatId, de: catAntiga, para: _catDitada });
            return { acao: 'preview_categoria_corrigida', categoria: _catDitada };
          }
        }
        // Responsavel declarado no texto ("... é responsável financeiro Salomé
        // Cristina Rodrigues") e' rotulo humano: colhe e vence o do cadastro.
        const _respDitado = (() => {
          const m = String(txt || '').match(/respons[aá]vel(?:\s+financeir[oa])?\s*(?:e|eh|é|:)?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\s]{4,60})/i);
          if (!m) return null;
          const r = String(m[1]).split(/[\n,;|]/)[0].replace(/\s+/g, ' ').trim();
          return (r && r.split(' ').length >= 2 && nomePlausivel(r)) ? r : null;
        })();
        const nomeTardio = _nomeHumanoTardio(txt);
        // ⚠️ Saida operacional fica FORA: ela nasce com aluno null de proposito, entao
        // caia neste filtro e qualquer frase virava nome. Foi assim que "Sol, foi saída"
        // — uma correcao de TIPO — foi gravada como o nome do aluno (Mayra/CG 25/08).
        // ⚠️ Saida operacional fica FORA (nasce com aluno null de proposito).
        // ⚠️ Com CITACAO do preview, aceita corrigir mesmo com aluno ja preenchido: quando
        // a Sol acerta o formato e erra a PESSOA, o nome e plausivel, nao entra no
        // filtro de suspeito, e antes nao havia como consertar — a correcao vazava pro LLM,
        // que respondeu com valor inventado (caso Rafael/CG 25/08). Exigir a citacao
        // mantem o alvo inequivoco: sem ela, a regra antiga vale.
        // ⚠️ Correcao com ROTULO explicito ("a aluna e Soraia...") + card UNICO nao
        // exige citacao: e inequivoca. A exigencia de citacao (25/08) era para nome
        // solto plausivel. Caso Mayra/CG 29/08: a frase mais explicita possivel
        // levou "Nao entendi essa" porque o card ja tinha um aluno (errado).
        const _cita = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
        const _rotuloNaCorrecao = _alunoRotulado(txt);

        // Um lote e um snapshot imutavel. Se a pessoa avisa que FALTA outro
        // aluno/valor, alterar um item localmente transformaria o mesmo `pode`
        // em autorizacao para fatos diferentes. Invalida o lote inteiro e pede
        // a composicao completa; o comprovante nunca continua aprovavel pela
        // metade depois de uma correcao explicita.
        const _correcaoAdicionaItem = /\b(?:falta|faltou|inclui|incluir|inclua|adiciona|adicionar|soma|mais)\b/i.test(txt)
          && !!_rotuloNaCorrecao && Number(extrairValor(txt)) > 0;
        if (_correcaoAdicionaItem) {
          let loteAlvo = null;
          if (event.quotedMessageId) loteAlvo = arrP.find((x) =>
            x.tipoOperacao === 'lancar_recebimento_lote' && _cita(x, event.quotedMessageId)) || null;
          if (!loteAlvo) {
            const lotesAbertos = arrP.filter((x) => x.tipoOperacao === 'lancar_recebimento_lote');
            if (lotesAbertos.length === 1 && arrP.length === 1) loteAlvo = lotesAbertos[0];
          }
          if (loteAlvo) {
            loteAlvo.bloqueiaLancamento = true;
            const fim = await finalizarPreviewSeguroV3({
              alvo: loteAlvo, status: 'rejected',
              motivo: 'lote_incompleto_informado_pelo_humano',
            });
            if (fim && fim.ok) {
              pendentes.set(chatId, arrP.filter((p) => p !== loteAlvo));
              limparEnvelopeDaPendencia(chatId, loteAlvo, 'lote_incompleto_informado_pelo_humano');
            }
            await sendFn(chatId,
              `⚠️ Invalidei o lote anterior porque você informou outro item: ${_rotuloNaCorrecao} — ${fmtBRL(extrairValor(txt))}. `
              + 'Me reenvia a descrição completa com todos os alunos/cobranças e o total. O card anterior não pode mais ser lançado.');
            log({ acao: 'lote_invalidado_por_item_faltante', chatId,
              finalizado: !!(fim && fim.ok), aluno: _rotuloNaCorrecao,
              valor_item: Number(extrairValor(txt)) });
            return { acao: 'lote_invalidado_por_item_faltante', finalizado: !!(fim && fim.ok) };
          }
        }
        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)
          // Pendencia MULTI tem .itens, nao "um aluno": comentario humano ("ai
          // Jhon ta certo esse", 01/09 18:31) virou nome e mutilou o card do lote.
          && x.tipoOperacao !== 'manual_review_multi_student'
          && x.tipoOperacao !== 'lancar_recebimento_lote'
          && (
            (event.quotedMessageId && _cita(x, event.quotedMessageId))
            || ((!x.aluno || _alunoSuspeito(x.aluno)) && (agora - x.ts) <= 5 * 60 * 1000)
            || (!!_rotuloNaCorrecao && arrP.length === 1)
          ));
        let alvoP = null;
        if (event.quotedMessageId) alvoP = semAluno.find((p) => _cita(p, event.quotedMessageId)) || null;
        if (!alvoP && semAluno.length === 1) alvoP = semAluno[0];
        if (nomeTardio && alvoP) {
          const _alunoAntesDaCorrecao = alvoP.aluno || null;
          // Fotografia do card ANTES da correcao: se o texto nao se provar nome
          // de aluno, nada do que ele ditou pode ficar no card.
          const _cardAntes = { valor: alvoP.valor, competencia: alvoP.competencia };
          // Evidencia explicita do humano no MESMO texto vence o que a pendencia
          // herdou de OCR ruim (31/08: a correcao trazia "R$387,00" e o card
          // manteve os 38.700 do OCR — e a canonica rodou com o valor errado).
          // Colher ANTES da canonica: com 387 ela casa a fatura por valor exato.
          {
            const _vTexto = extrairValor(txt);
            if (_vTexto && Math.abs((alvoP.valor || 0) - _vTexto) >= 0.01) {
              log({ acao: 'valor_do_texto_na_correcao', chatId, de: alvoP.valor || null, para: _vTexto });
              alvoP.valor = _vTexto;
            }
          }
          // 03/09 (Mayra/CG): o humano podia corrigir o VALOR pelo texto e nao a
          // COMPETENCIA — ela so era herdada da pendencia. Assimetria pura, e a
          // Mayra caiu nela dizendo "a parcela e 09/2026" enquanto o card trazia
          // 10/2026 (janela de propagacao da baixa no Emusys).
          let _competenciaDitada = null;
          {
            const _cTexto = extrairCompetenciaTexto(txt);
            if (_cTexto && _cTexto !== alvoP.competencia) {
              log({ acao: 'competencia_do_texto_na_correcao', chatId, de: alvoP.competencia || null, para: _cTexto });
              _competenciaDitada = _cTexto;
              alvoP.competencia = _cTexto;
            }
          }
          let alunoConfirmado = false;
          let confiancaBaixa = false;
          let canonica = null;
          let composto = null;
          let canonicaIndisponivel = false;
          let bloqueiaFonteIndisponivel = false;
          let categoria = alvoP.categoria;
          let competencia = alvoP.competencia;
          let parcela = alvoP.parcela;
          const querParcela = !alvoP.multiplas && (!categoria || categoria === 'parcela' || categoria === 'mensalidade' || categoria === 'passaporte' || categoria === 'matricula' || categoria === 'outro');

          try {
            const _compTardiaIso = competenciaIso(competencia);
            const _lateralTardia = (x) => _fonteFuturaLateralAoMesDeclarado(x, _compTardiaIso);
            let c = await canonicaFn(alvoP.unidade_id, nomeTardio, alvoP.valor);
            let respondeu = !!(c && (c.ok === true || c.ok === false));
            if (_lateralTardia(c)) log({ acao: 'canonica_futura_lateral', chatId, competencia });
            else if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
            if (!respondeu) {
              log({ acao: 'canonica_retry_tardia', chatId });
              c = await canonicaFn(alvoP.unidade_id, nomeTardio, alvoP.valor);
              respondeu = !!(c && (c.ok === true || c.ok === false));
              if (_lateralTardia(c)) { bloqueiaFonteIndisponivel = false; log({ acao: 'canonica_futura_lateral', chatId, competencia }); }
              else if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
            }
            canonicaIndisponivel = !respondeu;
            // Nome de correcao e ROTULO por definicao: retorno com OUTRA pessoa =
            // enriquecimento rejeitado (caso Mayra 29/08: a correcao remontava o
            // card com a Laura do fuzzy de novo).
            if (c && c.ok && c.aluno_nome && !_mesmaPessoa(c.aluno_nome, nomeTardio)) {
              log({ acao: 'canonica_tardia_rejeitada_nome_diverge', chatId, ditado: nomeTardio, casado: c.aluno_nome });
              c = null;
            }
            if (c && c.ok) {
              canonica = c;
              alvoP.aluno = c.aluno_nome || nomeTardio;
              alunoConfirmado = true;
              if (c.parcela && querParcela) {
                // Competencia DITADA pelo humano vence a da fatura casada. Se a
                // canonica trouxe outra, soltamos o vinculo em vez de gravar a
                // fatura errada — mesma politica da contestacao de fatura: sujar
                // a carteira do aluno e' pior que lancar sem vinculo.
                const _compCanonica = c.parcela.competencia || null;
                if (_competenciaDitada && _compCanonica && _compCanonica !== _competenciaDitada) {
                  log({ acao: 'competencia_ditada_vence_fatura', chatId,
                        fatura: _compCanonica, ditada: _competenciaDitada });
                  parcela = null;
                  canonica = null;
                  competencia = _competenciaDitada;
                } else {
                  parcela = c.parcela;
                  if (_compCanonica) competencia = _competenciaDitada || _compCanonica;
                }
              }
              const catCanonica = categoriaDaFatura(c);
              if (catCanonica) categoria = catCanonica;
            }
          } catch (e) { canonicaIndisponivel = true; bloqueiaFonteIndisponivel = true; }

          if (!alunoConfirmado && !canonicaIndisponivel) {
            try {
              const m = await casarFn(alvoP.unidade_id, nomeTardio, alvoP.valor, competencia);
              if (m && m.ok && m.aluno_nome && !_mesmaPessoa(m.aluno_nome, nomeTardio)) {
                log({ acao: 'casamento_tardio_rejeitado_nome_diverge', chatId, ditado: nomeTardio, casado: m.aluno_nome });
              } else if (m && m.ok) {
                alvoP.aluno = m.aluno_nome || nomeTardio;
                if (m.ambiguo) confiancaBaixa = true;
                if (m.parcela && querParcela) {
                  parcela = m.parcela;
                  if (m.parcela.competencia) competencia = m.parcela.competencia;
                  if (categoria === 'outro') categoria = 'parcela';
                }
                alunoConfirmado = true;
              }
            } catch (e) { /* best-effort */ }
          }

          // TEXTO SEM ROTULO QUE NAO CASA COM ALUNO NENHUM NAO E NOME (26/09/2026).
          // "Os dados estao corretos sol" virou o aluno do card do Daniel (CG), e como
          // a busca desse "nome" respondia `aluno_nao_encontrado` -- e nao "fonte fora
          // do ar" --, a correcao ZEROU a trava de fonte e o `pode` gravou
          // "Parcela 09/2026 - estao corretos sol" sem fatura. A lista de palavras
          // proibidas (`_TOK_NAO_NOME`) nunca fecharia isso: toda frase nova fura.
          // A regra estrutural: sem rotulo ("aluno: X"), so e nome o que o banco
          // reconhece como aluno. Com rotulo, o humano declarou -- vale mesmo sem
          // cadastro (aluno novo), com baixa confianca, como sempre foi.
          if (!alunoConfirmado && !_rotuloNaCorrecao) {
            alvoP.valor = _cardAntes.valor;
            alvoP.competencia = _cardAntes.competencia;
            log({ acao: 'nome_tardio_sem_rotulo_nao_confirmado', chatId, texto: String(nomeTardio).slice(0, 60) });
            return { acao: 'nada' };
          }
          if (!alunoConfirmado) {
            alvoP.aluno = nomeTardio;
            confiancaBaixa = true;
          }

          if (alvoP.aluno && alvoP.valor && competencia && querParcela) {
            try {
              const compMes = await faturasMesFn(alvoP.unidade_id, alvoP.aluno, competencia, alvoP.valor);
              if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2
                  && !(compMes.aluno_nome && !_mesmaPessoa(compMes.aluno_nome, alvoP.aluno))) {
                composto = compMes;
                if (compMes.aluno_nome) alvoP.aluno = compMes.aluno_nome;
                categoria = 'parcela';
                parcela = null;
                canonica = null;
                confiancaBaixa = false;
                bloqueiaFonteIndisponivel = false;
                log({ acao: 'composto_mes_tardia', chatId, partes: compMes.partes.length, competencia: compMes.competencia });
              }
            } catch (e) { /* best-effort */ }
          }

          // Aluno MUDOU => nada do aluno anterior sobrevive por heranca
          // (01/09: card da Thyfany saiu com o composto e o responsavel do Davi).
          const _trocouAluno = !!(_alunoAntesDaCorrecao && alvoP.aluno && !_mesmaPessoa(_alunoAntesDaCorrecao, alvoP.aluno));
          let responsavelFinanceiro = _trocouAluno ? null : (alvoP.responsavelFinanceiro || null);
          if (_respDitado) {
            log({ acao: 'responsavel_ditado_pelo_humano', chatId, responsavel: _respDitado });
            responsavelFinanceiro = _respDitado;
          }
          try {
            const rr = await responsavelFn(alvoP.unidade_id, alvoP.aluno);
            if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, alvoP.aluno)) {
              log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno: alvoP.aluno, casado: rr.aluno_nome });
            } else if (!_respDitado && rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, alvoP.aluno)) responsavelFinanceiro = rr.responsavel_nome;
          } catch (e) { /* best-effort */ }

          alvoP.categoria = categoria;
          alvoP.competencia = competencia;
          alvoP.parcela = _trocouAluno ? (parcela === alvoP.parcela ? null : parcela) : parcela;
          alvoP.composto = _trocouAluno ? (composto || null) : (composto || alvoP.composto || null);
          alvoP.canonica = _trocouAluno ? (canonica || null) : (canonica || alvoP.canonica || null);
          alvoP.bloqueiaLancamento = deveBloquearLancamento({ composto: alvoP.composto, parcela, canonica: alvoP.canonica, valor: alvoP.valor, quitacao: alvoP.quitacao, multiplas: alvoP.multiplas });
          alvoP.faturaIndisponivel = canonicaIndisponivel;
          alvoP.bloqueiaFonteIndisponivel = bloqueiaFonteIndisponivel;
          alvoP.responsavelFinanceiro = responsavelFinanceiro;
          alvoP.descricao = descricaoDoComposto(alvoP.composto, alvoP.aluno) || descricaoDaFatura(canonica, alvoP.aluno) || _descricaoLancamento(categoria, competencia, alvoP.aluno, parcela);
          // Lojinha continua lojinha: item + comprador + vendedor (06/10/2026). E o
          // nome ditado responde a pergunta "É X?" — a trava do "pode" sai.
          if (alvoP.sugestaoNomeLojinha) alvoP.sugestaoNomeLojinha = null;
          if (String(alvoP.categoria || '') === 'lojinha' && alvoP.itemLojinha && !alvoP.composto) {
            alvoP.descricao = descricaoLojinha(alvoP.itemLojinha, alvoP.aluno, alvoP.vendedor || null);
          }
          alvoP.ts = agora;

          // 03/09 (Mayra/CG, Lucas Nunes): anunciar "Atualizei" reenviando o MESMO
          // nome e indistinguivel de ter ignorado quem corrigiu — ela repetiu duas
          // vezes e o pagamento ficou parado. Quando o nome ditado resolve para o
          // cadastro que ja estava no card E a grafia conflita, a Sol diz isso, mostra
          // o nome do sistema e devolve a saida (confirmar ou dar outro nome).
          const _grafiaConflita = !_trocouAluno && !!_alunoAntesDaCorrecao
            && _conflitoDeGrafiaAluno(nomeTardio, alvoP.aluno);
          if (_grafiaConflita) {
            log({ acao: 'correcao_nome_mesma_pessoa', chatId, ditado: nomeTardio, cadastro: alvoP.aluno });
          }
          const _cabecalhoCorrecao = _grafiaConflita
            ? ('E o mesmo cadastro que eu ja tinha aqui — no sistema ele esta como *'
               + alvoP.aluno + '*.\nSe for ele, responde *pode*. Se for outra pessoa, me manda o nome completo.\n'
               + '_(se o errado for o cadastro, da pra corrigir no Emusys)_\n\n')
            : 'Atualizei a pendencia com o aluno informado:\n\n';
          let texto = _cabecalhoCorrecao + montarPreview({
            unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
            categoria: alvoP.categoria, aluno: alvoP.aluno, competencia: alvoP.competencia,
            parcela: alvoP.parcela, confiancaBaixa, responsavelFinanceiro: alvoP.responsavelFinanceiro,
            formaIncerta: alvoP.formaIncerta, cartaoModalidade: alvoP.cartaoModalidade,
            cartaoParcelas: alvoP.cartaoParcelas, multiplas: alvoP.multiplas,
            alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
            canonica, duplicata: null, quitacao: alvoP.quitacao, faturaIndisponivel: canonicaIndisponivel,
            composto: alvoP.composto, bloqueiaLancamento: alvoP.bloqueiaLancamento,
            itemLojinha: alvoP.itemLojinha || null, descricao: alvoP.descricao,
          });
          if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
          alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
          if (!await vincularPreviewRemontadoV3({
            event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
            result: { acao: 'preview_aluno_corrigido', aluno: alvoP.aluno, competencia: alvoP.competencia },
          })) return { acao: 'preview_aluno_corrigido_sem_v3', aluno: alvoP.aluno };
          log({ acao: 'preview_aluno_corrigido', chatId, aluno: alvoP.aluno, mesma_pessoa: _grafiaConflita || undefined });
          return { acao: 'preview_aluno_corrigido', aluno: alvoP.aluno, mesmaPessoa: _grafiaConflita || undefined };
        }
      }

      const faltando = arrP.filter((x) => !x.valor || !x.forma);
      const curta = txt.split(/\s+/).filter(Boolean).length <= 8;
      if (!event.hasMedia && faltando.length === 1 && curta && !casarPode(txt).pode) {
        const alvoP = faltando[0];
        const vNovo = alvoP.valor ? null : extrairValor(txt, { allowBare: true });
        const fNovo = alvoP.forma ? null : extrairForma(txt, null);
        const cNovo = fNovo === 'cartao' ? extrairCartao(txt) : null;
        if (vNovo || fNovo) {
          if (vNovo) alvoP.valor = vNovo;
          if (fNovo) {
            alvoP.forma = fNovo;
            alvoP.formaIncerta = false;
            if (cNovo) {
              alvoP.cartaoModalidade = cNovo.modalidade || alvoP.cartaoModalidade || null;
              alvoP.cartaoParcelas = cNovo.parcelas || alvoP.cartaoParcelas || null;
            }
          }
          alvoP.ts = agora;
          alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
          alvoP.toqueTs = agora;
          const falta = !alvoP.valor ? 'valor' : (!alvoP.forma ? 'forma' : null);
          const quem = nomeDoAtor(event);
          if (falta === 'valor') {
            { const _mid = await sendFn(chatId, `Anotei a forma (${alvoP.forma}). Só falta o valor: manda *pode, R$ X*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }
          } else if (falta === 'forma') {
            { const _mid = await sendFn(chatId, `Anotei ${fmtBRL(alvoP.valor)}. Só me diz a forma: *pode, pix* / *pode, dinheiro* / *pode, cartão*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }
          } else {
            const formaTxt = alvoP.forma === 'cartao'
              ? `cartão${alvoP.cartaoModalidade ? ' ' + (alvoP.cartaoModalidade === 'credito' ? 'crédito' : 'débito') : ''}${alvoP.cartaoParcelas > 1 ? ' ' + alvoP.cartaoParcelas + 'x' : ''}`
              : alvoP.forma;
            // ⚠️ E' exatamente ESTA mensagem que a Fernanda citou em 29/08 — ela tem
            // de contar como citacao valida da pendencia.
            { const _mid = await sendFn(chatId, `Beleza, ${quem}: *${fmtBRL(alvoP.valor)}* em ${formaTxt}. Posso lançar? Responde *pode*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }
          }
          log({ acao: 'preview_completado', valor: alvoP.valor || null, forma: alvoP.forma || null });
          return { acao: 'preview_completado', valor: alvoP.valor || null, forma: alvoP.forma || null };
        }
      }

      // 1.5b) DIVISAO TARDIA: humano explicou que um comprovante total cobre mais de
      // uma parte/curso. Guarda a divisao e bloqueia o lancamento unico; melhor perguntar
      // do que lançar R$829 como uma parcela so.
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const adicional = extrairAdicionalPagamento(txt);
        const comValor = arrP.filter((x) => x.valor && !x.divisao);
        let alvoP = null;
        if (event.quotedMessageId) alvoP = comValor.find((p) => p.previewId === event.quotedMessageId) || null;
        if (!alvoP && comValor.length === 1) alvoP = comValor[0];
        if (!alvoP && /categor(?:ia)?\s+(?:e|é|eh)\s+(?:parcela|passaporte|lojinha|matr[íi]cula)|n[aã]o\s+(?:e|é|eh)\s+(?:parcela|passaporte|lojinha)/i.test(txt)) {
          await sendFn(chatId, 'Recebi a correção, mas não achei um preview ativo para remontar. Reenvia o comprovante/legenda que eu refaço antes de lançar.');
          log({ acao: 'correcao_categoria_sem_alvo', chatId });
          return { acao: 'correcao_categoria_sem_alvo' };
        }
        if (alvoP && /categor(?:ia)?\s+(?:e|é|eh)\s+passaporte|(?:nao|não)\s+(?:e|é|eh)\s+lojinha.*passaporte|passaporte/i.test(txt) && !adicional) {
          alvoP.categoria = 'passaporte';
          alvoP.itemLojinha = null;
          alvoP.composto = null;
          alvoP.divisao = null;
          alvoP.bloqueiaLancamento = false;
          alvoP.bloqueiaFonteIndisponivel = false;
          alvoP.faturaIndisponivel = false;
          alvoP.descricao = _descricaoLancamento('passaporte', alvoP.competencia, alvoP.aluno, alvoP.parcela);
          alvoP.ts = agora;
          let texto = 'Ajustei: a categoria é passaporte. Remontei o preview:\n\n' + montarPreview({
            unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
            categoria: 'passaporte', aluno: alvoP.aluno, competencia: alvoP.competencia,
            parcela: alvoP.parcela, confiancaBaixa: false,
            responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: alvoP.formaIncerta,
            cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
            multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
            canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
            composto: null, bloqueiaLancamento: false, itemLojinha: null,
          });
          if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
          alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
          if (!await vincularPreviewRemontadoV3({
            event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
            result: { acao: 'preview_categoria_passaporte_corrigida', categoria: 'passaporte' },
          })) return { acao: 'preview_categoria_passaporte_corrigida_sem_v3' };
          log({ acao: 'preview_categoria_passaporte_corrigida', chatId });
          return { acao: 'preview_categoria_passaporte_corrigida' };
        }
        // ⚠️ `\bparcela\b` SOLTO saiu daqui (31/08): qualquer frase que citasse a
        // palavra virava "a categoria e parcela" — foi assim que "A parcela nao
        // esta vencida" destruiu a categoria passaporte, correta, da Kailane.
        // Agora exige forma de COMANDO: rotulo, verbo, ou ditado que ABRE a
        // mensagem ("Parcela 08/2026").
        const _cmdParcela = /categor(?:ia)?\s+(?:e|é|eh)\s+parcela|(?:nao|não)\s+(?:e|é|eh)\s+lojinha.*parcela|(?:e|é|eh)\s+mensalidade|(?:e|é|eh|como|lanca|lança|coloca|marca|muda|troca|poe|põe)\s+(?:a\s+)?parcela\b|^\s*parcela\b|\bparcela\s+\d{1,2}\s*[/-]\s*\d{2,4}/i;
        if (alvoP && !/n[aã]o\s+(?:e|é|eh)\s+parcela/i.test(txt) && _cmdParcela.test(txt) && !_contestaFatura(txt) && !adicional) {
          let canonica = null;
          let parcela = null;
          const competenciaInformada = extrairCompetenciaTexto(txt);
          let competencia = competenciaInformada || alvoP.competencia;
          let confiancaBaixa = false;
          let faturaIndisponivel = false;
          const confirmacaoManual = _confirmacaoManualFatura(txt);
          if (confirmacaoManual) {
            alvoP.aluno = confirmacaoManual.aluno;
            competencia = confirmacaoManual.competencia || competencia;
            parcela = {
              descricao: `Parcela ${competencia || ''}${confirmacaoManual.curso ? ' do curso de ' + confirmacaoManual.curso : ''}`.trim(),
              competencia,
              valor: alvoP.valor,
              valor_bate: true,
              confirmada_pela_equipe: true,
            };
          }
          if (alvoP.aluno && !confirmacaoManual) {
            if (competenciaInformada) {
              // A competência explícita exige o casador date-aware. Não
              // consultar a RPC sem competência e aceitar agosto por engano.
              let encontrouFatura = false;
              try {
                const m = await casarFn(alvoP.unidade_id, alvoP.aluno, alvoP.valor, competencia);
                const competenciaRetornada = _competenciaParaExibicao(m && m.parcela && m.parcela.competencia);
                // A fala humana e autoridade do campo. Se a fonte ignorar o
                // filtro e devolver outra competencia, ela nao pode sobrescrever
                // a escolha explicita nem deixar uma fatura errada aprovavel.
                if (m && m.ok && m.parcela && competenciaRetornada === competenciaInformada) {
                  if (m.aluno_nome) alvoP.aluno = m.aluno_nome;
                  if (m.ambiguo) confiancaBaixa = true;
                  parcela = m.parcela;
                  competencia = competenciaInformada;
                  encontrouFatura = true;
                }
              } catch (e) { /* fail-closed abaixo */ }
              if (!encontrouFatura) faturaIndisponivel = true;
            } else {
              try {
                const c = await canonicaFn(alvoP.unidade_id, alvoP.aluno, alvoP.valor);
                if (c && c.ok) {
                  canonica = c;
                  if (c.aluno_nome) alvoP.aluno = c.aluno_nome;
                  if (c.parcela) {
                    parcela = c.parcela;
                    if (c.parcela.competencia) competencia = c.parcela.competencia;
                  }
                } else if (_fonteCanonicaIndisponivel(c)) {
                  faturaIndisponivel = true;
                }
              } catch (e) { faturaIndisponivel = true; }
              if (!parcela && !faturaIndisponivel) {
                try {
                  const m = await casarFn(alvoP.unidade_id, alvoP.aluno, alvoP.valor, competencia);
                  if (m && m.ok) {
                    if (m.aluno_nome) alvoP.aluno = m.aluno_nome;
                    if (m.ambiguo) confiancaBaixa = true;
                    if (m.parcela) {
                      parcela = m.parcela;
                      if (m.parcela.competencia) competencia = m.parcela.competencia;
                    }
                  }
                } catch (e) { /* best-effort */ }
              }
            }
          }
          alvoP.categoria = 'parcela';
          alvoP.itemLojinha = null;
          alvoP.parcela = parcela;
          // Nunca preserve a fatura canônica anterior quando a competência foi
          // alterada. Sem isso, derivarVinculo() preferia agosto ao casamento
          // date-aware de setembro na hora do lançamento.
          alvoP.canonica = canonica || null;
          alvoP.composto = null;
          alvoP.divisao = null;
          alvoP.competencia = competencia;
          alvoP.bloqueiaLancamento = deveBloquearLancamento({ composto: alvoP.composto, parcela, canonica: alvoP.canonica, valor: alvoP.valor, quitacao: alvoP.quitacao, multiplas: alvoP.multiplas });
          alvoP.confirmacaoManualFonte = !!(confirmacaoManual && faturaIndisponivel);
          alvoP.bloqueiaFonteIndisponivel = faturaIndisponivel && !alvoP.confirmacaoManualFonte;
          alvoP.faturaIndisponivel = faturaIndisponivel && !alvoP.confirmacaoManualFonte;
          alvoP.descricao = descricaoDaFatura(canonica, alvoP.aluno) || _descricaoLancamento('parcela', competencia, alvoP.aluno, parcela);
          alvoP.ts = agora;
          const acaoCorrecao = competenciaInformada ? 'preview_competencia_corrigida' : 'preview_categoria_parcela_corrigida';
          const abertura = confirmacaoManual
            ? 'Entendi a confirmação da equipe. Remontei o preview com aluno, curso/parcela e competência informados:\n\n'
            : (competenciaInformada
              ? `Atualizei a competência para ${competencia}. Remontei o preview:\n\n`
              : 'Ajustei: a categoria é parcela. Remontei o preview:\n\n');
          let texto = abertura + montarPreview({
            unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
            categoria: 'parcela', aluno: alvoP.aluno, competencia,
            parcela, confiancaBaixa,
            responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: alvoP.formaIncerta,
            cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
            multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
            canonica, duplicata: null, quitacao: null, faturaIndisponivel: alvoP.faturaIndisponivel,
            composto: null, bloqueiaLancamento: alvoP.bloqueiaLancamento, itemLojinha: null,
          });
          if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
          alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
          if (!await vincularPreviewRemontadoV3({
            event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
            result: { acao: acaoCorrecao, categoria: 'parcela', competencia },
          })) return { acao: acaoCorrecao + '_sem_v3' };
          log({ acao: acaoCorrecao, chatId, competencia });
          return { acao: acaoCorrecao, competencia };
        }
        const lojinhaCorrecao = detectarLojinhaProduto(txt);
        if (alvoP && lojinhaCorrecao && /n[aã]o\s+(?:e|é)\s+parcela|(?:e|é)\s+venda|lojinha|produto|corda|palheta|baqueta/i.test(txt)) {
          alvoP.categoria = 'lojinha';
          alvoP.itemLojinha = lojinhaCorrecao.item;
          alvoP.parcela = null;
          alvoP.composto = null;
          alvoP.divisao = null;
          alvoP.bloqueiaLancamento = false;
          alvoP.bloqueiaFonteIndisponivel = false;
          alvoP.faturaIndisponivel = false;
          alvoP.descricao = `Lojinha/Venda - ${lojinhaCorrecao.item || 'Produto'}${alvoP.aluno ? ' - ' + alvoP.aluno : ''}`;
          alvoP.ts = agora;
          let texto = 'Você tem razão: isso é venda de lojinha, não parcela. Remontei o preview:\n\n' + montarPreview({
            unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
            categoria: 'lojinha', aluno: alvoP.aluno, competencia: null,
            parcela: null, confiancaBaixa: false,
            responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: alvoP.formaIncerta,
            cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
            multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
            canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
            composto: null, bloqueiaLancamento: false, itemLojinha: alvoP.itemLojinha,
          });
          if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
          alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
          if (!await vincularPreviewRemontadoV3({
            event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
            result: { acao: 'preview_lojinha_corrigido', categoria: 'lojinha', item: alvoP.itemLojinha },
          })) return { acao: 'preview_lojinha_corrigido_sem_v3', item: alvoP.itemLojinha };
          log({ acao: 'preview_lojinha_corrigido', chatId, item: alvoP.itemLojinha });
          return { acao: 'preview_lojinha_corrigido', item: alvoP.itemLojinha };
        }
        if (alvoP && adicional && alvoP.aluno) {
          const valorOriginal = Number(alvoP.valor || 0);
          const valorNovo = Number((valorOriginal + Number(adicional.valor || 0)).toFixed(2));
          const competencia = alvoP.competencia || extrairCompetenciaTexto(txt);
          try {
            const compMes = await faturasMesFn(alvoP.unidade_id, alvoP.aluno, competencia, valorNovo);
            if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2) {
              alvoP.valor = valorNovo;
              alvoP.composto = compMes;
              if (compMes.aluno_nome) alvoP.aluno = compMes.aluno_nome;
              if (compMes.competencia) alvoP.competencia = compMes.competencia;
              alvoP.categoria = 'parcela';
              alvoP.parcela = null;
              alvoP.divisao = null;
              alvoP.bloqueiaLancamento = false;
              alvoP.bloqueiaFonteIndisponivel = false;
              alvoP.faturaIndisponivel = false;
              alvoP.descricao = descricaoDoComposto(alvoP.composto, alvoP.aluno) || alvoP.descricao;
              alvoP.ts = agora;
              let texto = `Você tem razão: faltava ${adicional.label} de ${fmtBRL(adicional.valor)}. Remontei pelo previsto do aluno:\n\n` + montarPreview({
                unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
                categoria: alvoP.categoria || 'parcela', aluno: alvoP.aluno,
                competencia: alvoP.competencia, parcela: null, confiancaBaixa: false,
                responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: alvoP.formaIncerta,
                cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
                multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
                canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
                composto: alvoP.composto, bloqueiaLancamento: false,
              });
              if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
              alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
              if (!await vincularPreviewRemontadoV3({
                event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
                result: { acao: 'preview_adicional_corrigido', adicional: adicional.valor, total: valorNovo },
              })) return { acao: 'preview_adicional_corrigido_sem_v3', adicional: adicional.valor, total: valorNovo };
              log({ acao: 'preview_adicional_corrigido', chatId, adicional: adicional.valor, total: valorNovo });
              return { acao: 'preview_adicional_corrigido', adicional: adicional.valor, total: valorNovo };
            }
          } catch (e) { /* best-effort */ }
        }
        if (alvoP) {
          const partes = extrairDivisaoPagamento(txt, alvoP.valor);
          if (partes && partes.length >= 2) {
            alvoP.composto = { ok: true, aluno_nome: alvoP.aluno || null, competencia: alvoP.competencia || extrairCompetenciaTexto(txt), partes };
            alvoP.divisao = null;
            alvoP.bloqueiaLancamento = false;
            alvoP.descricao = descricaoDoComposto(alvoP.composto, alvoP.aluno) || alvoP.descricao;
            alvoP.ts = agora;
            let texto = 'Entendi que esse comprovante cobre mais de um curso/parcela:\n\n' + montarPreview({
              unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
              categoria: alvoP.categoria || 'parcela', aluno: alvoP.aluno,
              competencia: alvoP.competencia, parcela: null, confiancaBaixa: false,
              responsavelFinanceiro: alvoP.responsavelFinanceiro, formaIncerta: alvoP.formaIncerta,
              cartaoModalidade: alvoP.cartaoModalidade, cartaoParcelas: alvoP.cartaoParcelas,
              multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
              composto: alvoP.composto, bloqueiaLancamento: false,
            });
            if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
            alvoP.previewId = await sendFn(chatId, texto);
            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);
            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;
            alvoP.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoP, previewId: alvoP.previewId, texto,
              result: { acao: 'preview_composto_pendente', partes: partes.length, total: alvoP.valor },
            })) return { acao: 'preview_composto_pendente_sem_v3', partes: partes.length };
            log({ acao: 'preview_composto_pendente', chatId, partes: partes.length, total: alvoP.valor });
            return { acao: 'preview_composto_pendente', partes: partes.length };
          }
        }
      }
    }

    // 2) "pode" -> lança (só confirmação limpa, ou resposta citando o preview)
    const arrPend = limparVelhos(chatId, agora);
    // Citar QUALQUER mensagem da Sol sobre a pendencia vale — inclusive o proprio
    // "Posso lancar? Responde pode" (29/08: Fernanda citou exatamente essa mensagem
    // e caiu na guarda de ambiguidade). O comprovante original tambem vale.
    const _citaPend = (p, id) => p.previewId === id || p.origem === id || (Array.isArray(p.msgIds) && p.msgIds.includes(id));
    const respondeuPreview = !!(event.quotedMessageId && arrPend.some((p) => _citaPend(p, event.quotedMessageId)));
    const conf = casarPode(event.body, { respondeuPreview });
      if (conf.pode) {
      const arr = arrPend;
      if (arr.length === 0) {
        const _venc = _cardVencidoDoPode(chatId, event.quotedMessageId, agora);
        if (_venc) {
          const _min = Math.round(janelaMs / 60000);
          await sendFn(chatId, `⏰ Esse card *venceu* (o card fica aberto por ${_min} min) e *nada foi lançado*. `
            + 'Reenvia o comprovante com a legenda que eu monto um card novo.');
          log({ acao: 'pode_card_vencido', chatId, citou: !!event.quotedMessageId });
          return { acao: 'pode_card_vencido' };
        }
        return { acao: 'pode_sem_pendencia' };
      }
      let alvo = null;
      if (event.quotedMessageId) alvo = arr.find((p) => _citaPend(p, event.quotedMessageId)) || null;
      // Citar um card velho/estranho NAO pode cair na unica pendencia atual.
      // Depois de uma correcao existe exatamente um card vigente; antes desta
      // guarda, responder "pode" citando o antigo lancava o novo — a interface
      // dizia uma coisa e a autorizacao valia para outra.
      if (event.quotedMessageId && !alvo) {
        await sendFn(chatId,
          '⚠️ Esse card não está mais pendente. Responde *pode* citando o preview mais recente.');
        log({ acao: 'pode_preview_invalido', chatId, quotedMessageId: event.quotedMessageId });
        return { acao: 'pode_preview_invalido' };
      }
      if (!alvo) {
        // Revisão "vários alunos" não concorre pelo "pode" seco com card lançável.
        const _lancaveis = arr.filter((p) => p.tipoOperacao !== 'manual_review_multi_student');
        const _cand = _lancaveis.length ? _lancaveis : arr;
        if (_cand.length === 1) alvo = _cand[0];
        else {
          // "pode" seco com 2+ cards: resolve por QUEM fala (29/08: o card da
          // Fernanda e o da Daiana; o pode de cada uma e sobre o SEU — ou sobre o
          // ultimo que a Sol mostrou para ela). Toque mais recente ganha. Quem nao
          // tem card proprio recebe a lista numerada em vez de um enigma.
          const _quem = String(event.senderPhone || event.senderId || '');
          const _minhas = _quem ? _cand.filter((p) =>
            String(p.toquePor || '') === _quem
            || String(p.autorPhone || '') === _quem
            || String(p.autorId || '') === _quem) : [];
          if (_minhas.length) {
            alvo = _minhas.reduce((a, b) => (((b.toqueTs || b.ts || 0) > (a.toqueTs || a.ts || 0)) ? b : a));
            log({ acao: 'pode_resolvido_por_autor', chatId, valor: alvo.valor || null });
          } else {
            const _lista = _cand.map((p, i) => (i + 1) + ') ' + (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : '') + (p.enviadoPor ? ' (' + p.enviadoPor + ')' : '')).join('\n');
            await sendFn(chatId, 'Tem mais de um comprovante aguardando:\n' + _lista + '\nResponde *pode* citando o card certo.');
            return { acao: 'ambiguo' };
          }
        }
      }
      // 🔴 REVISÃO "VÁRIOS ALUNOS" NÃO É LANÇÁVEL (26/09/2026, Barra). Ela guarda só
      // total, forma e categoria — não tem aluno nem divisão. Um "pode" (o do
      // Luciano, dado ao fechamento) a lançou como "Passaporte R$ 550" sem aluno, em
      // cima de um pagamento que já estava no caixa. Ela só vira lançamento depois da
      // divisão, pelo fluxo de lote.
      if (alvo.tipoOperacao === 'manual_review_multi_student') {
        await sendFn(chatId, '⚠️ Não lancei: ' + (alvo.valor ? 'o comprovante de ' + fmtBRL(alvo.valor) : 'esse comprovante') +
          ' está em revisão porque parece ser de mais de um aluno. Quem mandou precisa responder citando o card, com a divisão: *Nome — R$ valor*. Se for de um aluno só, reenvie o comprovante com o nome dele na legenda.');
        log({ acao: 'pode_bloqueado_revisao_multi', chatId, valor: alvo.valor || null });
        return { acao: 'pode_bloqueado_revisao_multi' };
      }
      if (alvo.tipoOperacao === 'estornar_movimento' || alvo.tipoOperacao === 'corrigir_movimento') {
        if (dryRun) {
          pendentes.set(chatId, arr.filter((p) => p !== alvo));
          limparEnvelopeDaPendencia(chatId, alvo, 'dryrun');
          await sendFn(chatId, `🧪 (teste) Eu ${alvo.tipoOperacao === 'estornar_movimento' ? 'estornaria' : 'corrigiria'} o lançamento ${alvo.movimentacao_id}.`);
          return { acao: `dryrun_${alvo.tipoOperacao}` };
        }
        let v3Approval = null;
        try {
          v3Approval = await registrarApprovalPublicoV3({ event, alvo, decision: 'approved' });
        } catch (e) {
          await sendFn(chatId, '⚠️ Não executei: não consegui registrar a aprovação V3. Tenta de novo em instantes.');
          log({ acao: 'v3_approval_bloqueou_operacao_movimento', erro: String(e && e.message) });
          return { acao: 'v3_approval_bloqueou_operacao_movimento' };
        }
        if (v3LedgerAtivo) {
          if (!alvo.v3PreviewId || !alvo.v3PreviewHash || !v3Approval || !v3Approval.approval_id) {
            await sendFn(chatId, '⚠️ Não executei: faltou vínculo V3 entre preview e aprovação. Reenvia o comando para gerar um preview novo.');
            log({ acao: 'v3_approval_bloqueou_operacao_movimento', erro: 'vinculo_v3_incompleto' });
            return { acao: 'v3_approval_bloqueou_operacao_movimento' };
          }
        }
        const payloadOperacao = {
          ...(alvo.payloadBase || {}),
          valor: String(alvo.valor || 0),
          forma: alvo.forma || '',
          categoria: alvo.categoria || 'movimento',
          v3_preview_id: alvo.v3PreviewId,
          v3_preview_hash: alvo.v3PreviewHash,
          v3_approval_id: v3Approval && v3Approval.approval_id,
          v3_approval_event_hash: v3Approval && v3Approval.approval_event_hash,
          v3_actor_id_hash: v3Approval && v3Approval.actor_id_hash,
          v3_ledger_required: '1',
        };
        let rOp;
        if (alvo.tipoOperacao === 'estornar_movimento') {
          try { rOp = await estornarMovimentoFn(payloadOperacao); }
          catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao estornar. Já registrei o problema.'); log({ acao: 'erro_rpc_estornar_movimento', erro: String(e && e.message) }); return { acao: 'erro_estornar_movimento' }; }
          pendentes.set(chatId, arr.filter((p) => p !== alvo));
          limparEnvelopeDaPendencia(chatId, alvo, 'estornado');
          if (rOp && rOp.ok) {
            const receipt = await sendFn(chatId, `Estornei no caixa: ${fmtBRL(rOp.valor || alvo.valor)}. Não apaguei o original; criei o movimento inverso auditado.`);
            await governance(event, 'write_applied', { action: 'estorno', movement_ref: rOp.movimentacao_estorno_id || alvo.movimentacao_id, approval_ref: v3Approval && v3Approval.approval_id, outcome: 'ok' });
            await governance(event, 'approval_consumed', { approval_ref: v3Approval && v3Approval.approval_id, movement_ref: rOp.movimentacao_estorno_id || alvo.movimentacao_id, outcome: 'ok' });
            await governance(event, 'receipt_sent', { receipt_ref: receipt, movement_ref: rOp.movimentacao_estorno_id || alvo.movimentacao_id, action: 'estorno', outcome: 'ok' });
            readbackMovimento(event, grupos[chatId], rOp.movimentacao_estorno_id || alvo.movimentacao_id, rOp.valor || alvo.valor, alvo.forma, alvo.categoria);
            log({ acao: 'movimento_estornado', movimentacao_id: alvo.movimentacao_id, estorno_id: rOp.movimentacao_estorno_id });
            return { acao: 'movimento_estornado', movimentacao_id: alvo.movimentacao_id, movimentacao_estorno_id: rOp.movimentacao_estorno_id };
          }
          await sendFn(chatId, `⚠️ Não consegui estornar: ${rOp && rOp.motivo ? rOp.motivo : 'erro desconhecido'}.`);
          return { acao: 'estorno_recusado', motivo: rOp && rOp.motivo };
        }
        try { rOp = await corrigirMovimentoFn({ ...payloadOperacao, correcoes: alvo.correcoes || {} }); }
        catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao corrigir. Já registrei o problema.'); log({ acao: 'erro_rpc_corrigir_movimento', erro: String(e && e.message) }); return { acao: 'erro_corrigir_movimento' }; }
        pendentes.set(chatId, arr.filter((p) => p !== alvo));
        limparEnvelopeDaPendencia(chatId, alvo, 'movimento_corrigido');
        if (rOp && rOp.ok) {
          const depois = rOp.depois || {};
          const receipt = await sendFn(chatId, `Corrigi no caixa: ${fmtBRL(depois.valor || alvo.valor)} · ${depois.categoria || alvo.categoria || 'lançamento'} · ${depois.forma_pagamento || alvo.forma || ''}.`);
          await governance(event, 'write_applied', { action: 'correcao', movement_ref: alvo.movimentacao_id, approval_ref: v3Approval && v3Approval.approval_id, outcome: 'ok' });
          await governance(event, 'approval_consumed', { approval_ref: v3Approval && v3Approval.approval_id, movement_ref: alvo.movimentacao_id, outcome: 'ok' });
          await governance(event, 'receipt_sent', { receipt_ref: receipt, movement_ref: alvo.movimentacao_id, action: 'correcao', outcome: 'ok' });
          readbackMovimento(event, grupos[chatId], alvo.movimentacao_id, depois.valor || alvo.valor, depois.forma_pagamento || alvo.forma, depois.categoria || alvo.categoria);
          log({ acao: 'movimento_corrigido', movimentacao_id: alvo.movimentacao_id });
          return { acao: 'movimento_corrigido', movimentacao_id: alvo.movimentacao_id };
        }
        await sendFn(chatId, `⚠️ Não consegui corrigir: ${rOp && rOp.motivo ? rOp.motivo : 'erro desconhecido'}.`);
        return { acao: 'movimento_correcao_recusada', motivo: rOp && rOp.motivo };
      }
      // CHEQUES (29/09): número + banco já no caixa barra o "pode" (lote ou simples).
      if (cheques && cheques.barrarNoPode && alvo.forma === 'cheque') {
        const _bChq = await cheques.barrarNoPode(alvo, chatId);
        if (_bChq) return _bChq;
      }
      if (alvo.tipoOperacao === 'lancar_recebimento_lote') {
        if (alvo.bloqueiaLancamento) {
          await sendFn(chatId, '⚠️ Não lancei: esse lote foi invalidado por uma correção. Reenvia a composição completa para gerar um preview novo.');
          log({ acao: 'lote_bloqueado_por_correcao', chatId });
          return { acao: 'lote_bloqueado_por_correcao' };
        }
        if (!v3LedgerAtivo || !alvo.v3PreviewId || !alvo.v3PreviewHash || !Array.isArray(alvo.itens) || alvo.itens.length < 2) {
          await sendFn(chatId, '⚠️ Não lancei: esse lote não tem o vínculo seguro completo. Reenvia o comprovante para gerar um preview novo.');
          log({ acao: 'lote_multi_bloqueado_sem_v3', chatId });
          return { acao: 'lote_multi_bloqueado_sem_v3' };
        }
        let idAut = null;
        try { idAut = await identidadeFn(event.senderPhone, alvo.unidade_id); } catch (e) { /* melhor esforço */ }
        const autorizadoPor = nomeParaCarimbo(idAut, event);
        let approval = null;
        try { approval = await registrarApprovalPublicoV3({ event, alvo, decision: 'approved' }); }
        catch (e) {
          await sendFn(chatId, '⚠️ Não lancei o lote: não consegui registrar a aprovação segura. Tenta de novo em instantes.');
          return { acao: 'lote_multi_approval_erro' };
        }
        if (!approval || !approval.approval_id) {
          await sendFn(chatId, '⚠️ Não lancei o lote: faltou vínculo entre o preview e a aprovação. Reenvia o comprovante para gerar um preview novo.');
          return { acao: 'lote_multi_approval_sem_v3' };
        }
        const payloadLote = {
          unidade_id: alvo.unidade_id, valor: String(alvo.valor), forma: alvo.forma, categoria: alvo.categoria,
          itens: alvo.itens, idempotency_key: alvo.idemKey, ator_numero: senderNum, ator_papel: 'grupo',
          chat_id: chatId, grupo_jid: chatId, origem_message_id: alvo.origem, preview_message_id: alvo.previewId,
          enviado_por: alvo.enviadoPor || null, autorizado_por: autorizadoPor,
          v3_preview_id: alvo.v3PreviewId, v3_preview_hash: alvo.v3PreviewHash,
          v3_approval_id: approval.approval_id, v3_approval_event_hash: approval.approval_event_hash,
          v3_actor_id_hash: approval.actor_id_hash, v3_ledger_required: '1',
        };
        let lote;
        try { lote = await lancarLoteFn(payloadLote); }
        catch (e) {
          await sendFn(chatId, '⚠️ Não lancei o lote: não consegui concluir a operação atômica. Nada foi lançado parcialmente.');
          log({ acao: 'lote_multi_rpc_erro', chatId, erro: String(e && e.message) });
          return { acao: 'lote_multi_rpc_erro' };
        }
        pendentes.set(chatId, arr.filter((p) => p !== alvo));
        limparEnvelopeDaPendencia(chatId, alvo, 'aprovado_lote');
        if (lote && lote.ok) {
          const movsLote = lote.movimentacoes || [];
          if (movsLote.length !== alvo.itens.length) {
            const reciboIncompleto = await sendFn(chatId, `🚨 ATENÇÃO: o banco confirmou ${movsLote.length} de ${alvo.itens.length} itens do lote. NÃO confia neste lançamento — confere o caixa antes de fechar e chama o suporte.`);
            await governance(event, 'write_refused', { action: 'lote_incompleto', movement_ref: lote.lote_id, reason_code: 'item_count_mismatch', outcome: 'error' });
            await governance(event, 'receipt_sent', { receipt_ref: reciboIncompleto, movement_ref: lote.lote_id, action: 'critical_warning', outcome: 'ok' });
            log({ acao: 'lote_multi_incompleto', chatId, lote_id: lote.lote_id, esperados: alvo.itens.length, gravados: movsLote.length });
            return { acao: 'lote_multi_incompleto', lote_id: lote.lote_id };
          }
          const nomesLote = [...new Set(alvo.itens.map((i) => String(i.aluno_nome || '').trim()).filter(Boolean))];
          const mesmoAlunoVariasFaturas = alvo.itens.length >= 2 && nomesLote.length === 1;
          const linhas = movsLote.map((m, idx) => {
            const item = alvo.itens[idx] || {};
            const rotulo = mesmoAlunoVariasFaturas
              ? (item.descricao || `${cap(item.categoria || 'Fatura')}${item.competencia ? ' ' + item.competencia : ''}`)
              : (m.aluno_nome || item.aluno_nome || 'Item');
            return `• ${rotulo}: ${fmtBRL(m.valor)}`;
          }).join('\n');
          const reciboLote = await sendFn(chatId, `✅ Lancei o lote no caixa da ${alvo.nome}: ${fmtBRL(alvo.valor)} (${alvo.forma}).\n${linhas}\n_Operação única e auditada; nenhum item foi lançado parcialmente._`);
          await governance(event, 'write_applied', { action: 'lote_lancado', movement_ref: lote.lote_id, approval_ref: approval.approval_id, preview_ref: alvo.v3PreviewId, outcome: 'ok' });
          await governance(event, 'approval_consumed', { approval_ref: approval.approval_id, movement_ref: lote.lote_id, outcome: 'ok' });
          await governance(event, 'receipt_sent', { receipt_ref: reciboLote, movement_ref: lote.lote_id, preview_ref: alvo.v3PreviewId, outcome: 'ok' });
          for (let idx = 0; idx < movsLote.length; idx += 1) {
            const mov = movsLote[idx];
            const item = alvo.itens[idx] || {};
            readbackMovimento(event, grupos[chatId], mov.movimentacao_id, mov.valor,
              alvo.forma, item.categoria || alvo.categoria);
          }
          if (cheques && cheques.registrarLancamento && alvo.forma === 'cheque') cheques.registrarLancamento(chatId, alvo.previewId);
          log({ acao: 'lote_multi_lancado', chatId, lote_id: lote.lote_id, itens: alvo.itens.length });
          return { acao: 'lote_multi_lancado', lote_id: lote.lote_id };
        }
        if (lote && lote.motivo === 'caixa_nao_aberto') {
          await sendFn(chatId, `⚠️ O caixa da ${alvo.nome} ainda não está aberto. O lote está conferido, mas não pode ser lançado agora. Nada foi lançado parcialmente. Responde *pode* citando a mensagem de *abertura*; com o caixa aberto, reenvia o comprovante para um preview novo.`);
          await oferecerAberturaCaixaFechado(event, chatId);
          log({ acao: 'lote_multi_recusado', chatId, motivo: lote.motivo });
          return { acao: 'lote_multi_recusado', motivo: lote.motivo };
        }
        const motivoLote = lote && lote.motivo;
        await governance(event, 'write_refused', { action: 'lote_lancamento', reason_code: motivoLote || 'unknown', outcome: 'refused' });
        const motivoHumano = {
          snapshot_fatura_nao_encontrada: 'a fatura canônica do preview não está disponível na fonte oficial',
          snapshot_status_fatura_mudou: 'o status de uma fatura mudou desde o preview',
          snapshot_valor_fatura_mudou: 'o valor de uma fatura mudou desde o preview',
          snapshot_categoria_mudou: 'a categoria de uma fatura mudou desde o preview',
          snapshot_competencia_mudou: 'a competência de uma fatura mudou desde o preview',
          snapshot_soma_divergente: 'a soma das faturas não confere com o total',
          fonte_indisponivel: 'a fonte oficial de faturas está indisponível',
        }[motivoLote] || 'a validação final não reproduziu o preview';
        await sendFn(chatId, `⚠️ Não lancei o lote: ${motivoHumano}. Nada foi lançado parcialmente. O card continua aberto por até ${Math.round(janelaMs / 60000)} min desde que foi enviado; depois disso, reenvia o comprovante.`);
        log({ acao: 'lote_multi_recusado', chatId, motivo: motivoLote });
        return { acao: 'lote_multi_recusado', motivo: motivoLote };
      }
      if (alvo.divisao && alvo.divisao.length >= 2) {
        const linhas = alvo.divisao.map((p) => `• ${p.label}: ${fmtBRL(p.valor)}`).join('\n');
        await sendFn(chatId, `⚠️ Não lancei: esse comprovante está marcado como pagamento dividido.\n${linhas}\n\nConfirma/manda cada parte separada para eu lançar sem misturar.`);
        log({ acao: 'bloqueado_divisao_pendente', chatId, partes: alvo.divisao.length });
        return { acao: 'bloqueado_divisao_pendente' };
      }
      // Lojinha com "É X?" em aberto (06/10/2026): o nome do comprador ainda não
      // se resolveu — "pode" não grava o nome digitado por cima da pergunta.
      if (alvo.sugestaoNomeLojinha && Array.isArray(alvo.sugestaoNomeLojinha.candidatos)
          && alvo.sugestaoNomeLojinha.candidatos.length) {
        const _c = alvo.sugestaoNomeLojinha.candidatos;
        await sendFn(chatId, _c.length === 1
          ? `⚠️ Não lancei: antes me confirma o aluno — é *${_c[0]}*? Responde *sim*, ou manda *aluno: Nome completo*.`
          : '⚠️ Não lancei: antes me manda o aluno — *aluno: Nome completo*. Não escolho entre os parecidos.');
        log({ acao: 'pode_bloqueado_sugestao_nome', chatId, candidatos: _c.length });
        return { acao: 'pode_bloqueado_sugestao_nome' };
      }
      if (alvo.bloqueiaLancamento) {
        await sendFn(chatId, '⚠️ Não lancei: o valor diverge e o aluno tem mais de uma parcela/curso possível. Me explica a divisão ou responde no preview certo.');
        log({ acao: 'bloqueado_multiplas_sem_divisao', chatId });
        return { acao: 'bloqueado_multiplas_sem_divisao' };
      }
      if (alvo.bloqueiaFonteIndisponivel && !alvo.confirmacaoManualFonte) {
        await sendFn(chatId, '⚠️ Não lancei: não consegui confirmar a fatura na fonte oficial. Confirma aluno, competência e curso/parcela antes do *pode*.');
        log({ acao: 'bloqueado_fonte_indisponivel', chatId });
        return { acao: 'bloqueado_fonte_indisponivel' };
      }
      const valor = conf.valor || alvo.valor;
      const forma = conf.forma || alvo.forma;
      const cartaoModalidade = conf.cartaoModalidade || alvo.cartaoModalidade || null;
      const cartaoParcelas = conf.cartaoParcelas || alvo.cartaoParcelas || null;
      if (!forma) {
        await sendFn(chatId, 'Falta a forma pra eu lançar certo. Responde: *pode, pix* / *pode, dinheiro* / *pode, cartão*.');
        return { acao: 'sem_forma' };
      }
      if (!valor) { await sendFn(chatId, 'Preciso do valor pra lançar. Manda *pode, R$ X*.'); return { acao: 'sem_valor' }; }

      // 🔴 DUPLICIDADE NÃO SE APROVA COM "pode" SECO (26/09/2026, Barra). O card do
      // Bento dizia "Já tem uma entrada de R$ 550 hoje (08:56) — É outro pagamento?"
      // e um "Pode" lançou de novo: o aviso era só texto. A pergunta é conferida
      // AQUI, na hora do "pode" (o caixa pode ter mudado desde o card), com a mesma
      // regra do aviso — mesmo valor + mesmo aluno no caixa de hoje (RPC
      // sol_caixa_ja_lancado_hoje). Confirmar é o protocolo que a Sol ensina:
      // "pode, é outro pagamento", citando o card.
      if (!alvo.tipoOperacao && alvo.aluno && !categoriaEhSaida(alvo.categoria)
          && !/outro\s+pagamento/i.test(String(event.body || ''))) {
        let _dup = null;
        try { _dup = await duplicataFn(alvo.unidade_id, valor, alvo.aluno); } catch (_) { _dup = null; }
        const _it = _dup && _dup.ja_lancado && Array.isArray(_dup.itens) && _dup.itens[0];
        if (_it) {
          await sendFn(chatId, `⚠️ Não lancei: já tem ${fmtBRL(Number(_it.valor || valor))} de ${alvo.aluno} no caixa de hoje` +
            `${_it.hora ? ' (' + _it.hora + (_it.descricao ? ' — ' + _it.descricao : '') + ')' : ''}.\n` +
            'Se for mesmo *outro pagamento*, responde citando o card: *pode, é outro pagamento*.');
          log({ acao: 'pode_bloqueado_duplicidade', chatId, valor, hora: _it.hora || null });
          return { acao: 'pode_bloqueado_duplicidade' };
        }
      }

      // "pode, mas coloca a categoria como venda": aplica a correcao ANTES do
      // payload e derruba o preview V3 antigo — o validador exige categoria
      // identica entre preview e aprovacao (categoria_divergente_v3), entao o
      // bloco "completado no pode" logo abaixo re-registra com a corrigida.
      if (conf.categoria && String(conf.categoria) !== String(alvo.categoria || '')
          && !categoriaEhSaida(alvo.categoria) && !categoriaEhSaida(conf.categoria)) {
        const catAntiga = alvo.categoria || null;
        alvo.categoria = conf.categoria;
        if (alvo.descricao && catAntiga && alvo.descricao.toLowerCase().indexOf(String(catAntiga).toLowerCase()) === 0) {
          alvo.descricao = cap(conf.categoria) + alvo.descricao.slice(String(catAntiga).length);
        }
        if (v3LedgerAtivo && alvo.v3PreviewId) { alvo.v3PreviewId = null; alvo.v3PreviewHash = null; }
        log({ acao: 'categoria_corrigida_no_pode', chatId, de: catAntiga, para: conf.categoria });
      }

      // COMPLEMENTO NO PROPRIO PODE (24/08/2026): a Sol PEDE "pode, pix / pode,
      // dinheiro / pode, cartao", entao a resposta chega com aprovacao E forma
      // juntas. Nesse caso o preview foi guardado SEM vinculo V3 (a RPC exige
      // forma: 'forma_obrigatoria_preview_v3'). Agora que a forma existe, registra
      // o preview V3 ANTES da aprovacao -- senao o lancamento morre em
      // 'v3_approval_bloqueou_lancamento' e o humano fica sem saida, que era o
      // beco do caso Giovanna/Recreio (cupom ilegivel -> sem forma).
      if (v3LedgerAtivo && forma && !alvo.v3PreviewId) {
        alvo.forma = forma;
        alvo.formaIncerta = false;
        alvo.cartaoModalidade = cartaoModalidade;
        alvo.cartaoParcelas = cartaoParcelas;
        alvo.valor = valor;
        try {
          const v3tardio = await registrarPreviewPublicoV3({
            event, grupo: { unidade_id: alvo.unidade_id, nome: alvo.nome }, previewId: alvo.previewId,
            texto: `preview completado no pode (forma=${forma})`, pendencia: alvo,
            result: { acao: 'preview_completado_no_pode', valor, forma, categoria: alvo.categoria },
          });
          if (v3tardio && v3tardio.preview_id) {
            alvo.v3PreviewId = v3tardio.preview_id;
            alvo.v3PreviewHash = v3tardio.preview_hash || null;
            log({ acao: 'v3_preview_registrado_no_pode', chatId, forma });
          }
        } catch (e) {
          log({ acao: 'v3_preview_no_pode_erro', chatId, erro: String(e && e.message) });
        }
      }
      if (dryRun) {
        pendentes.set(chatId, arr.filter((p) => p !== alvo));
        limparEnvelopeDaPendencia(chatId, alvo, 'dryrun');
        await sendFn(chatId, `🧪 (teste) Eu lançaria na ${alvo.nome}: ${cap(alvo.categoria || 'parcela')} — ${fmtBRL(valor)} (${forma}). Nada foi gravado.`);
        log({ acao: 'dryrun', valor });
        return { acao: 'dryrun' };
      }
      let idAut = null;
      try { idAut = await identidadeFn(event.senderPhone, alvo.unidade_id); } catch (e) { /* best-effort */ }
      log({ acao: 'identidade_autorizacao', chatId, identificado: !!(idAut && idAut.identificado) });
      const autorizadoPor = nomeParaCarimbo(idAut, event);
      const payload = {
        unidade_id: alvo.unidade_id, valor: String(valor), forma, categoria: alvo.categoria || 'parcela',
        aluno: alvo.aluno || null, descricao: alvo.descricao || null, idempotency_key: alvo.idemKey, ator_numero: senderNum, ator_papel: 'grupo',
        chat_id: chatId, grupo_jid: chatId, origem_message_id: alvo.origem, preview_message_id: alvo.previewId,
        cartao_modalidade: cartaoModalidade, cartao_parcelas: cartaoParcelas,
        cheque_numero: alvo.cheque_numero || null, cheque_banco: alvo.cheque_banco || null,
        cheque_bom_para: alvo.cheque_bom_para || null,
        enviado_por: alvo.enviadoPor || null, autorizado_por: autorizadoPor,
        responsavel_financeiro: alvo.responsavelFinanceiro || null,
      };
      // Vinculo estruturado: a RPC valida os dois contra a unidade e ignora o que nao
      // bater, entao mandar e seguro; o que nao pode e mandar id CHUTADO (ver derivarVinculo).
      const vinculo = derivarVinculo(alvo);
      // Fatura contestada pela equipe nao volta pela porta dos fundos: vincular
      // a fatura errada suja a carteira do aluno (pior que lancar sem vinculo).
      if (alvo.faturaContestada) { vinculo.fatura_id = null; vinculo.fonte = 'fatura_contestada'; }
      if (alvo.faturaContestada) vinculo.fatura_ids = null;
      if (vinculo.aluno_id) payload.aluno_id = vinculo.aluno_id;
      if (vinculo.fatura_id) payload.fatura_id = vinculo.fatura_id;
      // Pagamento composto: 2+ faturas vao em `fatura_ids` e a RPC grava as filhas.
      // Com 1 so, segue o caminho de sempre (fatura_id) -- nunca array de um.
      if (Array.isArray(vinculo.fatura_ids) && vinculo.fatura_ids.length >= 2) {
        payload.fatura_ids = vinculo.fatura_ids;
      } else if (Array.isArray(vinculo.fatura_ids) && vinculo.fatura_ids.length === 1) {
        payload.fatura_id = vinculo.fatura_ids[0];
      }
      log({ acao: 'vinculo_lancamento', chatId, fonte: vinculo.fonte,
            aluno_id: vinculo.aluno_id || null, tem_fatura: !!vinculo.fatura_id,
            faturas: Array.isArray(payload.fatura_ids) ? payload.fatura_ids.length : undefined });
      let v3Approval = null;
      try {
        v3Approval = await registrarApprovalPublicoV3({ event, alvo, decision: 'approved' });
      } catch (e) {
        await sendFn(chatId, '⚠️ Não lancei: não consegui registrar a aprovação do preview. Tenta de novo em instantes.');
        log({ acao: 'v3_approval_bloqueou_lancamento', chatId, erro: String(e && e.message) });
        return { acao: 'v3_approval_bloqueou_lancamento' };
      }
      if (v3LedgerAtivo) {
        if (!alvo.v3PreviewId || !alvo.v3PreviewHash || !v3Approval || !v3Approval.approval_id) {
          await sendFn(chatId, '⚠️ Não lancei: faltou vínculo V3 entre preview e aprovação. Reenvia o comprovante para gerar um preview novo.');
          log({ acao: 'v3_approval_bloqueou_lancamento', chatId, erro: 'vinculo_v3_incompleto' });
          return { acao: 'v3_approval_bloqueou_lancamento' };
        }
        payload.v3_preview_id = alvo.v3PreviewId;
        payload.v3_preview_hash = alvo.v3PreviewHash;
        payload.v3_approval_id = v3Approval.approval_id;
        payload.v3_approval_event_hash = v3Approval.approval_event_hash;
        payload.v3_actor_id_hash = v3Approval.actor_id_hash;
        payload.v3_ledger_required = '1';
      }
      let r;
      const ehSaida = categoriaEhSaida(payload.categoria);
      try { r = await (ehSaida ? lancarSaidaFn(payload) : lancarFn(payload)); }
      catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao lançar. Já registrei o problema; tenta de novo em instantes.'); log({ acao: 'erro_rpc', chatId, erro: String(e && e.message) }); return { acao: 'erro' }; }
      // remove a pendência alvo
      pendentes.set(chatId, arr.filter((p) => p !== alvo));
      limparEnvelopeDaPendencia(chatId, alvo, 'aprovado');
      if (r && r.ok && r.ja_lancado) {
        const reciboDuplicado = await sendFn(chatId, 'Esse comprovante já tinha sido lançado ✅.');
        await governance(event, 'write_refused', { action: 'duplicate', outcome: 'duplicate', movement_ref: r.movimentacao_id });
        await governance(event, 'receipt_sent', { action: 'duplicate_notice', receipt_ref: reciboDuplicado, movement_ref: r.movimentacao_id, outcome: 'ok' });
        return { acao: 'ja_lancado' };
      }
      if (r && r.ok) {
        await governance(event, 'write_applied', {
          action: ehSaida ? 'saida_lancada' : 'lancado', movement_ref: r.movimentacao_id,
          approval_ref: v3Approval && v3Approval.approval_id, preview_ref: alvo.v3PreviewId, outcome: 'ok',
        });
        await governance(event, 'approval_consumed', {
          approval_ref: v3Approval && v3Approval.approval_id, movement_ref: r.movimentacao_id, outcome: 'ok',
        });
        const quem = (alvo.enviadoPor && alvo.enviadoPor !== autorizadoPor)
          ? `${autorizadoPor} autorizou · ${alvo.enviadoPor} enviou`
          : `${autorizadoPor} autorizou`;
        const verbo = ehSaida ? 'Lancei a saída' : 'Lancei';
        // Quem confere o caixa pelo grupo precisa saber DE QUEM foi o dinheiro —
        // foi conferindo assim que o Jhon pegou o lote incompleto de 01/09. A
        // confirmacao do lote ja listava nomes; a do unico dizia so "Parcela".
        // Saida mostra a DESCRICAO gravada, nunca `aluno` (06/10/2026: o grupo leu a
        // legenda-como-aluno enquanto o banco guardava "PG Semana Retirada").
        // Lojinha idem: a descricao gravada (item, comprador e vendedor) e a que o
        // grupo le — mesma string do card (06/10/2026).
        const _de = (String(payload.categoria) === 'lojinha' && payload.descricao) ? ` · ${payload.descricao}`
          : (alvo.aluno && !ehSaida) ? ` · ${alvo.aluno}`
          : (payload.descricao ? ` · ${payload.descricao}` : '');
        const confirmMessageId = await sendFn(chatId, `✅ ${verbo} no caixa da ${alvo.nome}: ${cap(payload.categoria)} — ${fmtBRL(r.valor)} (${r.forma})${_de}.\n_${quem} · registrei isso no responsável do lançamento._`);
        await governance(event, 'receipt_sent', {
          receipt_ref: confirmMessageId, movement_ref: r.movimentacao_id, preview_ref: alvo.v3PreviewId, outcome: 'ok',
        });
        readbackMovimento(event, grp, r.movimentacao_id, r.valor || valor, r.forma || forma, payload.categoria);
        lembrarLancado(chatId, {
          confirmMessageId, previewId: alvo.previewId, movimentacao_id: r.movimentacao_id,
          unidade_id: alvo.unidade_id, nome: alvo.nome, valor: Number(r.valor || valor),
          forma: r.forma || forma, categoria: payload.categoria,
          cartaoModalidade, cartaoParcelas,
        });
        // F6: "antes de lancar veja se tem algum sem lancar" — a Sol e' quem ve.
        const _aindaAbertas = limparVelhos(chatId, agora);
        if (_aindaAbertas.length) {
          // Revisão "vários alunos" aparecia como "Passaporte — R$ 550" e convidava ao
          // "pode" que a lançou sem aluno (26/09). Ela é listada pelo que falta.
          await sendFn(chatId, '📌 Ainda aguardando: ' + _aindaAbertas.map((p) => (p.tipoOperacao === 'manual_review_multi_student'
            ? 'comprovante' + (p.valor ? ' de ' + fmtBRL(p.valor) : '') + ' em revisão (falta a divisão por aluno)'
            : (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : ''))).join(' · ') + '. Responde citando o card.');
        }
        // CHEQUES (06/10): o lote fica sabendo que esses cheques entraram — não
        // voltam a ser assunto da conversa nem do próximo card do mesmo lote.
        if (cheques && cheques.registrarLancamento && alvo.forma === 'cheque') cheques.registrarLancamento(chatId, alvo.previewId);
        log({ acao: ehSaida ? 'saida_lancada' : 'lancado', chatId,
              movimentacao_id: r.movimentacao_id, valor: r.valor });
        return { acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id };
      }
      const motivos = {
        caixa_nao_aberto: 'o caixa de hoje ainda não está aberto',
        valor_invalido: 'o valor não ficou válido',
        forma_invalida: 'a forma de pagamento não é válida',
        saida_cofre_so_dinheiro: 'saída de cofre precisa ser em dinheiro',
        ator_sem_numero: 'não consegui identificar seu número',
      };
      const msg = motivos[r && r.motivo] || 'não consegui lançar agora';
      await governance(event, 'write_refused', { action: 'lancamento', reason_code: (r && r.motivo) || 'unknown', outcome: 'refused' });
      // devolve a pendência (pode reabrir caixa e tentar de novo)
      if (r && r.motivo === 'caixa_nao_aberto') {
        arr.push(alvo); pendentes.set(chatId, arr);
        await sendFn(chatId, `⚠️ Não lancei: ${msg}. O comprovante ficou guardado.`
          + '\n\n1️⃣ Responde *pode* citando a mensagem de *abertura* do caixa.'
          + '\n2️⃣ Com o caixa aberto, responde *pode* de novo citando o card do comprovante.');
        const oferta = await oferecerAberturaCaixaFechado(event, chatId);
        if (oferta === 'ja_aberto') {
          await sendFn(chatId, 'O caixa acabou de ser aberto. Responde *pode* citando o card do comprovante que eu lanço.');
        } else if (oferta === 'ja_existe') {
          await sendFn(chatId, 'O caixa de hoje já foi fechado. Se precisa reabrir, peça *Sol, reabre o caixa de hoje*.');
        } else if (oferta !== 'oferecida' && oferta !== 'recente') {
          await sendFn(chatId, 'Não consegui trazer a abertura agora. Escreve *Sol, abre o caixa* que eu mando o card.');
        }
      } else {
        await sendFn(chatId, `⚠️ Não lancei: ${msg}.`);
      }
      log({ acao: 'recusado', chatId, motivo: r && r.motivo });
      return { acao: 'recusado', motivo: r && r.motivo };
    }
    // Mensagem humana "solta" (nao era pergunta de caixa, nem "pode", nem completou preview):
    // pode ser o NOME DO ALUNO que acompanha um comprovante que chega em bolha separada.
    // Guarda pra proxima midia costurar (igual a Maria). Consumida no uso; janela curta.
    if (!event.hasMedia) {
      const _solto = bodyLimpo(event.body);
      if (_pareceTesteLancarApagar(_solto)) {
        await sendFn(chatId, 'Melhor não testar com lançamento real e apagar depois. Teste seguro é preview/consulta; se algo já foi lançado manualmente, deixa como está e me chama antes de mexer.');
        log({ acao: 'bloqueou_teste_lancar_apagar', chatId });
        return { acao: 'bloqueou_teste_lancar_apagar' };
      }
      if (_solto && /[A-Za-z\u00c0-\u00ff]{3}/.test(_solto) && _solto.length <= 200) {
        if (anexarTextoAoLote(event, _solto, agora)) return { acao: 'lote_texto_anexado' };
        textosRecentes.set(textoIrmaoKey(event), { texto: _solto, ts: agora });
      }
    }
    return { acao: 'nada' };
  }

  // ha comprovante aguardando "pode" nesse grupo? (o fluxo de abrir/fechar consulta isso
  // pra nao roubar a confirmacao do comprovante)
  function temPendencia(chatId, agora = Date.now()) {
    return limparVelhos(chatId, agora).length > 0;
  }

  // Token estrutural do conjunto de cards ativos. O fallback de linguagem e
  // assíncrono: enquanto ele classifica uma frase, outro evento pode aprovar,
  // descartar ou remontar o card. Comparar apenas `temPendencia()` depois não
  // basta, porque um segundo card do grupo pode continuar aberto. O token
  // garante que a resposta ainda pertence exatamente ao mesmo estado que a
  // iniciou (CG 29/09: "Lode" começou antes do "pode" e respondeu 34s depois,
  // já em cima da conversa humana).
  function tokenEstadoPendencias(chatId, agora = Date.now()) {
    return limparVelhos(chatId, agora)
      .map((p) => [p.previewId || '', p.origem || '', Number(p.ts) || 0, p.tipoOperacao || ''].join(':'))
      .sort()
      .join('|');
  }

  // A guarda de "nao vaza pro LLM" (bridge) precisa saber se a mensagem CITA um card
  // pendente, para so falar quando a mensagem plausivelmente e' pra Sol -- sem isto ela
  // interceptava QUALQUER mensagem nao reconhecida no grupo, inclusive assunto entre
  // humanos (caso Luciano/Barra 26/08: "Vou ver o que aconteceu ok?").
  function citaAlgumaPendencia(chatId, quotedMessageId, agora = Date.now()) {
    if (!quotedMessageId) return false;
    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId || p.origem === quotedMessageId || (Array.isArray(p.msgIds) && p.msgIds.includes(quotedMessageId)));
  }

  // O bridge usa esta versao estrita para decidir se uma conversa humana foi
  // dirigida a Sol. `origem` e a mensagem HUMANA que trouxe o comprovante; cita-la
  // nao equivale a citar a Sol (CG 29/09: Alf perguntou ao Jhon se a aluna tinha
  // parcela atrasada, citando a foto, e a Sol se meteu com "nao entendi").
  // `msgIds` contem respostas complementares enviadas pela propria Sol e, junto do
  // previewId, continua sendo um endereco valido para ela.
  function citaCardPendenteDaSol(chatId, quotedMessageId, agora = Date.now()) {
    if (!quotedMessageId) return false;
    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId
      || (Array.isArray(p.msgIds) && p.msgIds.includes(quotedMessageId)));
  }

  // A3: reconstruir as pendencias a partir do ledger V3 (chamado pelo bridge
  // no boot). O ultimo preview de cada comprovante (origem) e' o vigente.
  async function reidratarPendencias() {
    try {
      const mapaChat = {};
      for (const jid of Object.keys(grupos || {})) mapaChat[md5(jid)] = jid;
      const abertos = await listarPreviewsAbertosFn(janelaMs);
      const porOrigem = new Map();
      for (const a of (abertos || [])) {
        if (!a || !a.pending || !a.pending.origem) continue;
        const chatId = mapaChat[a.chat_id_hash];
        if (!chatId) continue;
        if (a.operacao === 'agent_first_draft' && a.status === 'draft_missing_fields'
            && a.pending.agentFirstEnvelope) {
          const ts = Number(a.pending.ts) || new Date(a.criado_em).getTime() || Date.now();
          rascunhosV4.set(chatId, {
            envelope: a.pending.agentFirstEnvelope, origem: a.pending.origem, ts,
            autorHash: a.pending.rascunhoAutorHash || null,
            msgIds: Array.isArray(a.pending.msgIds) ? a.pending.msgIds : [],
            textoOriginal: a.pending.textoOriginal || '',
            v3PreviewId: a.id, v3PreviewHash: a.preview_hash, grupo: grupos[chatId],
            event: { messageId: a.pending.origem, chatId, senderId: 'rehydrated', body: '', ts: a.criado_em },
          });
          continue;
        }
        if (!['entrada', 'saida', 'correcao_forma', 'correcao_movimento', 'estorno'].includes(String(a.operacao || ''))) continue;
        porOrigem.set(chatId + '::' + a.pending.origem, { a, chatId });
      }
      let n = 0;
      const agora = Date.now();
      for (const { a, chatId } of porOrigem.values()) {
        const arr = limparVelhos(chatId, agora);
        if (arr.some((x) => x.origem === a.pending.origem)) continue;
        const pend = a.pending;
        pend.v3PreviewId = a.id;
        pend.v3PreviewHash = a.preview_hash;
        if (!pend.previewId && a.preview_message_id) pend.previewId = a.preview_message_id;
        pend.reidratada = true;
        arr.push(pend);
        pendentes.set(chatId, arr);
        if (pend.agentFirstEnvelope && pend.previewId) {
          envelopesV4.set(chatId, {
            envelope: pend.agentFirstEnvelope,
            ts: Number(pend.ts) || new Date(a.criado_em).getTime() || agora,
            previewId: pend.previewId,
          });
        }
        n++;
      }
      log({ acao: 'reidratacao_pendencias', total: n, rascunhos: rascunhosV4.size });
      return { ok: true, total: n, rascunhos: rascunhosV4.size };
    } catch (e) {
      log({ acao: 'reidratacao_pendencias_erro', erro: String(e && e.message) });
      return { ok: false };
    }
  }

  // Decide e registra UMA vez. Em shadow, o bridge chama sem await e ignora o
  // retorno. No preflight operacional, ele aguarda a mesma decisão apenas para
  // escolher um executor determinístico que cria preview — nunca aprovação ou
  // escrita financeira. Isso evita duplicar chamada/custo e mantém o placar.
  async function decidirRoteadorV4(event, acaoLegada, { modo = 'shadow' } = {}) {
    try {
      if (process.env.SOL_CAIXA_V4_SHADOW === '0') return null;
      if (!event || event.hasMedia || event._sintetico) return null;
      const texto = bodyLimpo(event.body);
      if (!texto) return null;
      const chatId = event.chatId;
      if (!grupos[chatId]) return null;
      // Usa a FOTO tirada na entrada do handle; so cai no estado atual quando
      // nao ha foto (mensagem que nem chegou ao handle). O campo contexto_de diz qual
      // dos dois foi usado — sem isso a proxima leitura do placar nao sabe se
      // esta comparando com a medicao velha ou com a nova.
      const foto = ctxAntesDoHandle.get(_chaveFotoV4(event));
      ctxAntesDoHandle.delete(_chaveFotoV4(event));
      const arrP = limparVelhos(chatId, Date.now());
      const usouFoto = !!(foto && Date.now() - foto.ts < janelaMs);
      const contexto = usouFoto ? foto.cards : arrP.slice(0, 3).map((p, i) => ({
        card: i + 1, valor: p.valor || null, forma: p.forma || null,
        categoria: p.categoria || null, aluno: p.aluno || null,
        competencia: p.competencia || null,
      }));
      const t0 = Date.now();
      const dec = await rotearV4Fn(texto, contexto);
      log({
        acao: 'roteador_v4_shadow', chatId,
        intencao: dec && dec.intencao, confianca: dec && dec.confianca,
        campos: dec ? { aluno: dec.aluno_nome, valor: dec.valor, forma: dec.forma, categoria: dec.categoria, competencia: dec.competencia, entidade: dec.entidade } : null,
        legado: acaoLegada || null,
        // 🔴 pendencias passa a ser o que o roteador VIU (a foto), nao o estado
        // depois do handle. E o texto fica gravado: sem ele nao existe replay —
        // nem o caixa.log nem o bridge.log nem a auditoria guardavam o corpo.
        pendencias: usouFoto ? foto.cards.length : arrP.length,
        contexto_de: usouFoto ? 'foto_pre_handle' : 'pos_handle',
        modo,
        modelo: _v4Modelo(), texto: texto.slice(0, 300),
        ms: Date.now() - t0,
      });
      return dec || null;
    } catch (e) {
      log({ acao: 'roteador_v4_shadow_erro', erro: String(e && e.message) });
      return null;
    }
  }

  // V4 SHADOW: o bridge chama SEM await depois do handle() — a decisao do
  // roteador vai para o log ao lado da acao do legado. Nunca escreve.
  async function observarRoteadorV4(event, acaoLegada) {
    await decidirRoteadorV4(event, acaoLegada, { modo: 'shadow' });
  }

  // Fallback de DIALOGO: chamado pelo bridge ANTES do "Nao entendi". A intencao
  // do LLM vira frase CANONICA e re-passa pelo handle() — nunca escreve, nunca
  // aprova dinheiro. Qualquer falha => null => "Nao entendi" de sempre.
  async function tratarNaoEntendida(event) {
    try {
      if (!event || event._sintetico) return null;
      const chatId = event.chatId;
      const grp = grupos[chatId];
      if (!grp) return null;
      const arrP = limparVelhos(chatId, Date.now());
      if (!arrP.length) return null;
      const tokenInicial = tokenEstadoPendencias(chatId);
      const contexto = arrP.slice(0, 3).map((p, i) => ({
        card: i + 1, valor: p.valor || null, forma: p.forma || null,
        categoria: p.categoria || null, aluno: p.aluno || null,
        competencia: p.competencia || null,
      }));
      let cls = null;
      try { cls = await classificarCorrecaoFn(event.body, contexto); } catch (e) { cls = null; }
      // O classificador pode levar dezenas de segundos. Se qualquer card foi
      // consumido, descartado ou remontado nesse intervalo, a conclusão ficou
      // obsoleta e não pode falar nem executar uma correção sintética.
      const tokenAtual = tokenEstadoPendencias(chatId);
      if (!tokenAtual || tokenAtual !== tokenInicial) {
        log({ acao: 'fallback_llm_estado_obsoleto', chatId });
        return { tratou: true, acao: 'fallback_llm_obsoleto' };
      }
      if (!cls || !cls.intencao || cls.intencao === 'nada') {
        log({ acao: 'fallback_llm_sem_intencao', chatId });
        return null;
      }
      log({ acao: 'fallback_llm_classificou', chatId, intencao: cls.intencao });
      if (cls.intencao === 'aprovar') {
        await sendFn(chatId, 'Se é para lançar, responde *pode* (citando o card, se houver mais de um). Aprovação de dinheiro eu só aceito explícita.');
        return { tratou: true, acao: 'fallback_llm_pede_pode', intencao: cls.intencao };
      }
      // "O aluno está errado" (31/08): o roteador acertou corrigir_aluno SEM
      // nome (conf .99) enquanto a gramatica gravava "está errado" como nome.
      // Sem nome declarado, a resposta certa e' PEDIR o nome.
      if (cls.intencao === 'corrigir_aluno' && !cls.aluno_nome) {
        await sendFn(chatId, 'Entendi que o aluno está errado — me diz o certo: *aluno: Nome Completo* (citando o card, se houver mais de um).');
        return { tratou: true, acao: 'fallback_llm_pede_nome', intencao: cls.intencao };
      }
      let sintetico = null;
      if (cls.intencao === 'corrigir_aluno' && cls.aluno_nome) sintetico = 'aluno: ' + cls.aluno_nome;
      else if (cls.intencao === 'corrigir_categoria' && cls.categoria) sintetico = 'coloca a categoria como ' + cls.categoria;
      else if (cls.intencao === 'corrigir_valor' && valorDoModelo(cls.valor)) sintetico = 'o valor é R$ ' + valorDoModelo(cls.valor).toFixed(2).replace('.', ',');
      else if (cls.intencao === 'corrigir_forma' && cls.forma) sintetico = 'a forma é ' + cls.forma;
      else if (cls.intencao === 'corrigir_competencia' && cls.competencia) {
        // Campo estruturado, nunca frase sintetica com o nome do card. A frase
        // era o motivo de uma correcao de mes aparecer como correcao de aluno.
        const r = await handle({
          ...event,
          _sintetico: true,
          _correcaoCompetencia: cls.competencia,
          hasMedia: false,
          messageId: String(event.messageId || '') + '#llm',
          quotedMessageId: event.quotedMessageId || (arrP.length === 1 ? arrP[0].previewId : null),
        });
        if (r && r.acao && r.acao !== 'nada') {
          log({ acao: 'fallback_llm_tratou', chatId, intencao: cls.intencao, acao_final: r.acao });
          return { tratou: true, acao: r.acao, intencao: cls.intencao };
        }
        return null;
      }
      else if (cls.intencao === 'sem_aluno') sintetico = (cls.entidade ? ('é de banda, nome ' + cls.entidade + ', ') : '') + 'não tem aluno específico';
      else if (cls.intencao === 'descartar') sintetico = 'não';
      if (!sintetico) return null;
      const r = await handle({
        ...event,
        body: sintetico,
        _sintetico: true,
        hasMedia: false,
        messageId: String(event.messageId || '') + '#llm',
        quotedMessageId: event.quotedMessageId || (arrP.length === 1 ? arrP[0].previewId : null),
      });
      if (r && r.acao && r.acao !== 'nada') {
        log({ acao: 'fallback_llm_tratou', chatId, intencao: cls.intencao, acao_final: r.acao });
        return { tratou: true, acao: r.acao, intencao: cls.intencao };
      }
      log({ acao: 'fallback_llm_gramatica_recusou', chatId, intencao: cls.intencao });
      return null;
    } catch (e) {
      log({ acao: 'fallback_llm_erro', erro: String(e && e.message) });
      return null;
    }
  }

  // Confirmacao de QUALQUER preview persistido precisa continuar neste handler.
  // O preview pode ter sido criado pela midia deterministica ou pelo agent-first;
  // isso nao muda o gate: "pode" e uma decisao financeira exata, nao uma tarefa
  // probabilistica do LLM. Esta consulta nao aprova nem descarta nada; apenas
  // decide a rota antes do LLM. Com mais de uma pendencia, o proprio handler
  // falha fechado e exige que o humano cite o card correto.
  function deveTratarConfirmacaoDeterministica(event, agora = Date.now()) {
    if (!event || event.hasMedia) return false;
    const chatId = event.chatId;
    const arr = limparVelhos(chatId, agora);
    if (!arr.length) return false;

    const _citaPend = (p, id) => p.previewId === id || p.origem === id
      || (Array.isArray(p.msgIds) && p.msgIds.includes(id));
    const citado = event.quotedMessageId
      ? arr.find((p) => _citaPend(p, event.quotedMessageId)) || null
      : null;
    // Citar card velho/estranho nao ganha outra pendencia por aproximacao.
    if (event.quotedMessageId && !citado) return false;
    const respondeuPreview = !!citado;
    const confirma = casarPode(event.body, { respondeuPreview }).pode || casarNao(event.body);
    if (!confirma) return false;

    if (citado) return true;
    return arr.length > 0;
  }

  // Resposta que completa rascunho é parte da mesma máquina de estado do
  // recebimento. O bridge consulta isto ANTES do handoff ao agente, evitando
  // que "cartão de crédito" vire um turno probabilístico que pode terminar sem
  // resposta. Só o mesmo remetente ou uma citação explícita alcança o rascunho.
  // CARD CLASSICO INCOMPLETO (25/09/2026, Fefe/Recreio): o comprovante do Bernardo
  // saiu com "me confirma a forma" -- pendencia classica em `pendentes`, sem forma.
  // "Sol, o pagamento foi feito por pix" nao e' `pode` nem rascunho V4, entao este
  // portao dizia "nao", o texto caia no agente (Recreio e' agent-first) e o modelo
  // foi procurar lancamento antigo ("achei R$ 440 de passaporte em 16/09") em vez de
  // completar o card. A rotina que completa ja existia no `handle` ("faltando"):
  // estas regras sao AS MESMAS dela -- 1 card faltando dado, ate 8 palavras, sem
  // `pode` -- mais autoria: so quem mandou o comprovante (ou quem cita o card)
  // completa, para conversa alheia no grupo nao virar complemento por acaso.
  function completaCardClassicoIncompleto(event, agora) {
    const faltando = limparVelhos(event.chatId, agora).filter((p) => !p.valor || !p.forma);
    if (faltando.length !== 1) return false;
    const alvo = faltando[0];
    const autor = String(event.senderPhone || event.senderId || '');
    const doAutor = !!autor && [alvo.autorPhone, alvo.autorId, alvo.toquePor]
      .some((x) => x && String(x) === autor);
    const q = event.quotedMessageId && String(event.quotedMessageId);
    const citou = !!q && (alvo.previewId === q || alvo.origem === q
      || (Array.isArray(alvo.msgIds) && alvo.msgIds.includes(q)));
    if (!doAutor && !citou) return false;
    const texto = bodyLimpo(event.body);
    if (texto.split(/\s+/).filter(Boolean).length > 8) return false;
    if (casarPode(texto).pode) return false;
    if (!alvo.forma && formaExplicitaV4(texto, null).forma) return true;
    if (!alvo.valor && extrairValor(texto, { allowBare: true })) return true;
    return false;
  }

  // CORRECAO DE ALUNO NO CARD CLASSICO (25/09/2026, Fefe/Recreio, mesmo episodio):
  // "Sol, o nome do aluno e Bernardo Neumann da Cunha" chegou com o card do
  // Bernardo aberto. O `handle` ja sabe corrigir isso (`preview_aluno_corrigido`,
  // remonta o card e revincula o V3), mas este portao so segurava forma/valor, o
  // texto foi para o agente -- que nao enxerga o card -- e ele respondeu "nome
  // completo corrigido" sem corrigir nada. Regras: um alvo inequivoco (citacao,
  // ou card UNICO do mesmo autor), nome ROTULADO ("aluno e X", "aluno: X"; nome
  // solto continua no fluxo antigo), frase curta, nunca `pode`/`nao`, nunca lote
  // nem saida (saida nasce sem aluno de proposito).
  function corrigeAlunoCardClassico(event, agora) {
    const arr = limparVelhos(event.chatId, agora);
    if (!arr.length) return false;
    const q = event.quotedMessageId && String(event.quotedMessageId);
    const _cita = (p) => !!q && (p.previewId === q || p.origem === q
      || (Array.isArray(p.msgIds) && p.msgIds.includes(q)));
    let alvo = null;
    if (q) {
      alvo = arr.find(_cita) || null;
      if (!alvo) return false;
    } else {
      if (arr.length !== 1) return false;
      alvo = arr[0];
      const autor = String(event.senderPhone || event.senderId || '');
      const doAutor = !!autor && [alvo.autorPhone, alvo.autorId, alvo.toquePor]
        .some((x) => x && String(x) === autor);
      if (!doAutor) return false;
    }
    if (alvo.tipoOperacao === 'lancar_recebimento_lote') return false;
    if (categoriaEhSaida(alvo.categoria)) return false;
    const texto = bodyLimpo(event.body);
    if (!texto || texto.split(/\s+/).filter(Boolean).length > 14) return false;
    if (casarPode(texto, { respondeuPreview: !!q }).pode || casarNao(texto)) return false;
    const nome = _alunoRotulado(texto);
    return !!(nome && nomePlausivel(nome));
  }

  // Resumo MINIMO dos cards abertos para o agente (sem telefone, sem ids de
  // banco): o card e' enviado pelo handler direto ao WhatsApp e nunca entra na
  // sessao do Hermes, entao sem isto o modelo "adivinha" pelo historico velho
  // (25/09: foi atras de um passaporte de 16/09). Nao e' autorizacao de nada;
  // so contexto para ele nao confundir card aberto com lancamento antigo.
  function resumoCardsAbertosParaAgente(chatId, agora = Date.now()) {
    const arr = limparVelhos(chatId, agora);
    if (!arr.length) return null;
    const _limpa = (s) => String(s || '').replace(/[\[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const partes = arr.slice(0, 3).map((p, i) => {
      const falta = [!p.valor && 'valor', !p.forma && 'forma'].filter(Boolean);
      return `card ${i + 1}: ${p.valor ? fmtBRL(p.valor) : 'valor ?'} · ${_limpa(p.forma) || 'forma ?'}`
        + ` · ${_limpa(p.categoria) || 'categoria ?'} · aluno ${_limpa(p.aluno) || '?'}`
        + (p.competencia ? ` · ${_limpa(p.competencia)}` : '')
        + (falta.length ? ` · FALTA ${falta.join('+')}` : ' · aguardando pode');
    });
    return `${arr.length} card(s) de comprovante AINDA NAO LANCADO(S) neste grupo -- ${partes.join(' | ')}`
      + (arr.length > 3 ? ' | ...' : '');
  }

  function deveTratarComplementoDeterministico(event, agora = Date.now()) {
    if (!event || event.hasMedia) return false;
    if (escolhaDaResposta(event, agora)) return true;
    if (sugestaoNomeDaResposta(event, agora)) return true;
    let draft = rascunhosV4.get(event.chatId) || null;
    if (!draft) return completaCardClassicoIncompleto(event, agora) || corrigeAlunoCardClassico(event, agora);
    if (agora - draft.ts >= janelaMs) {
      void finalizarRascunhoV4(event.chatId, 'expired', 'janela_runtime_expirou');
      return false;
    }
    if (!eventoPodeCompletarRascunhoV4(event, draft)) return false;
    const texto = bodyLimpo(event.body);
    return !!formaExplicitaV4(texto, event.caixaToolDecision).forma
      || (camposFaltantesV4(draft.envelope).includes('valor_total') && !!totalDaRespostaV4(texto, null))
      || casarNao(texto) || casarPode(texto, { respondeuPreview: false }).pode;
  }

  // ⚠️ ehConversaSemComando no retorno conserta bug LATENTE: o bridge chama
  // _fh.ehConversaSemComando(body) desde 25/08, mas o handler nunca a expos —
  // o guard de "elogio nao leva nao-entendi" estava morto por undefined.
  return { handle, temPendencia, tokenEstadoPendencias, citaAlgumaPendencia, citaCardPendenteDaSol, ehConversaSemComando,
    reidratarPendencias, tratarNaoEntendida, observarRoteadorV4, decidirRoteadorV4, tratarAgentFirst,
    deveTratarConfirmacaoDeterministica, deveTratarComplementoDeterministico, resumoCardsAbertosParaAgente,
    ferramentaCheques, chequesConversa, citaLoteCheques,
    _pendentes: pendentes, _envelopesV4: envelopesV4, _rascunhosV4: rascunhosV4, _escolhasMovimento: escolhasMovimento };
}

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = {
  _fonteFuturaLateralAoMesDeclarado,
  selecionarFaturasQuitacao, resolverFaturasQuitacao,
  parseBRMoney, lerNumeroMonetarioBR, candidatosMonetariosBR, arbitrarValorComprovante, extrairValorOcrDetalhado, extrairAdiantamentoDeclarado, valorDoModelo, normalizarCompetenciaV4, montarEnvelopeV4, extrairValor, extrairForma, extrairFormaHumana, detectarComprovante, casarPode,
  _saidaExplicitaFromCaption, categoriaSaidaDoTexto, excedeFaturaUnica, deveBloquearLancamento, _valorLojinhaTexto, _compradorDeclaradoLojinha, _nomeHumanoTardio, extrairValorOcr, _vendedorRotulado, _mesmaPessoa, _vendedoresCitados, _casaNomeEquipe, descricaoLojinha,
  _alunoRotulado, _limparAlunoRotulado, _semAlunoDeclarado, extrairCategoriaCorrecao,
  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3, _contestaFatura, rotearMensagemV4,
  montarEnvelopeV4, aplicarCorrecaoEnvelope, _v4CanarioLigado, resolverEnvelopeCaixaV1, valorConfereComTexto,
  PRIORIDADE_EVIDENCIA_V1, criarCandidatoEvidencia, resolverCampoEvidencia,
  construirEnvelopeEvidenciasV1, mesclarEnvelopesEvidenciasV1,
  compararEnvelopeEvidenciasV1, _evidenciaShadowLigado,
  casarNao, ehConversaSemComando,
  montarPreview, montarPreviewMultiAluno, descricaoParcelaCoerente, fmtBRL, carregarEnv, lancarRecebimento, lancarRecebimentoLote, resolverMultiAlunoCaixaV1, resolverPagamentoItensV1, resolverCompostoAlunoCaixaV1, lancarSaidaCaixa, buscarLancamentoParaCorrecao,
  buscarMovimentosCaixa, corrigirMovimentoCaixa, estornarMovimentoCaixa, registrarPreviewV3, registrarApprovalV3, finalizarPreviewV3, criarHandlerFinanceiro,
  confirmacaoLimpa, classificarMidia, bodyLimpo, nomeDoAtor, buscarResponsavel, mesmaPessoa, pagamentoMultiplo,
  extrairDivisaoPagamento, extrairSomaAditivaPagamento, extrairAdicionalPagamento, detectarLojinhaProduto, naturezaVendaDoTexto, detectarContextoMultiAluno, validarIntencaoMultiAluno,
  identificarPessoa, nomeParaCarimbo, ehPerguntaDeCaixa, resumoDoDia, montarResumoCaixa,
  extrairCartao, extrairValorOcr, extrairPagador, identificarPorPagador, nomePlausivel,
  _alunoRotulado, _alunoFromCaption, _cortarComentarioPagamentoDoNome, _alunoSuspeito,
  _cursoRotulado, _confirmacaoManualFatura,
  derivarVinculo, casarParcelaCanonica, linhasDaFatura, categoriaDaFatura, descricaoDaFatura, jaLancadoHoje,
  periodoQuitacao, extrairPeriodoMeses,
  extrairCompetenciaTexto, extrairCompetenciasTexto, extrairCorrecaoCompetencia, normalizarCorrecaoCompetenciaRoteador, compostoDeFaturas, buscarCompostoFaturasMes, descricaoDoComposto,
  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, extrairItensNomeValor, extrairAutorizacaoDescontoProtocolada, casarParcela,
  guardaFinanceiraV4,
  ocrLocal,
  extrairCorrecaoForma, extrairLancamentoCitado, extrairComandoMovimento,
  categoriaEhSaida, _descricaoSaidaTexto,
};
