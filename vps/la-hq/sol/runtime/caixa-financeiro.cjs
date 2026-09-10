'use strict';
/*
 * Sol Caixa — Fatia 1 (caminho A: determinístico no bridge).
 * Comprovante cai no grupo financeiro -> monta preview "posso lançar?".
 * Membro do grupo responde "pode" -> chama a RPC guardada -> "lancei ✅".
 * O LLM NUNCA entra no caminho do dinheiro. Funções puras testáveis + handler.
 */
const fs = require('fs');
const https = require('https');
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

function parseBRMoney(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');           // 1.397,00 -> 1397.00
  } else if (t.includes('.')) {
    const parts = t.split('.');
    const last = parts[parts.length - 1];
    if (!(parts.length === 2 && last.length === 2)) {
      t = t.replace(/\./g, '');                            // 1.397 -> 1397 (milhar)
    }
  }
  const v = parseFloat(t);
  return isFinite(v) && v > 0 ? v : null;
}

// Rótulos que marcam O valor do comprovante (vence "R$ 0,00" de taxa/desconto).
const VALOR_ROTULADO = /(valor\s*(da\s*conta|do\s*pix|pago|total|da\s*transa[çc][ãa]o|recebido)?\s*[:\-]?\s*)r\$\s*([\d.]+(?:,\d{1,2})?)/gi;

function extrairValor(text, { allowBare = false } = {}) {
  if (!text) return null;
  const t = String(text);
  // 1) valor rotulado > 0 (o "Valor da conta: R$ 405,00" do comprovante)
  let m;
  VALOR_ROTULADO.lastIndex = 0;
  while ((m = VALOR_ROTULADO.exec(t)) !== null) {
    if (!m[1] || !m[1].trim()) continue;              // sem rótulo -> deixa pro passo 2
    const v = parseBRMoney(m[3]);
    if (v) return v;
  }
  // 2) primeiro R$ com valor > 0 (antes parava no primeiro "R$ 0,00" e desistia)
  const todos = t.match(/r\$\s*[\d.]+(?:,\d{1,2})?/gi) || [];
  for (const bruto of todos) {
    const v = parseBRMoney(String(bruto).replace(/r\$\s*/i, ''));
    if (v) return v;
  }
  if (allowBare) {
    const b = t.match(/(?<![\d\/])(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)(?![\d\/])/);
    if (b) return parseBRMoney(b[1]);
  }
  return null;
}

function valoresMonetarios(texto) {
  return [...String(texto || '').matchAll(/r\$\s*[\d.]+(?:,\d{1,2})?/gi)]
    .map((m) => ({ valor: parseBRMoney(String(m[0]).replace(/r\$\s*/i, '')), idx: m.index || 0 }))
    .filter((m) => m.valor && m.valor > 0);
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

function detectarContextoMultiAluno(texto) {
  const t = _normConf(texto);
  if (!t) return false;

  // NOMES_LIGADOS: dois (ou mais) NOMES PROPRIOS ligados por "e" / "+" / "&".
  // Exige 2+ palavras alfabeticas de CADA lado -- e' o que separa
  //   "Daniel Da Hora Marinho e Arthur Da Hora Marinho"   (2 pessoas)
  // de
  //   "Parcela 07/26 + 08/26 aluno Arthur Martins"        (o "+" liga DATAS)
  //   "Joao Pedro de Almeida e Souza"                     (sobrenome com "e")
  const nomesLigados = /\b[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\s*(?:\be\b|\+|&)\s*[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\b/.test(t);

  // "350,00 cada" / "cada um": valor POR CABECA so existe com 2+ pessoas.
  const valorPorCabeca = /\b\d{2,4}(?:[.,]\d{2})?\s*(?:reais\s*)?cada\b|\bcada\s+um\b/.test(t);

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

const PRODUTO_LOJINHA_RE = /\b(lojinha|loja|cordas?|palhetas?|baquetas?|capotraste|afinador(?:es)?|cabos?|correia|encordoamento|livro|apostila|camisetas?|camisas?)\b/i;
function detectarLojinhaProduto(texto) {
  const t = String(texto || '');
  if (/passaporte|taxa\s+de\s+matr[íi]cula/i.test(t)) return null;
  if (!PRODUTO_LOJINHA_RE.test(t)) return null;
  let item = null;
  const mCorda = t.match(/\bcorda(?:s)?(?:\s+de\s+([a-zA-ZÀ-ÿ]+))?/i);
  if (mCorda) item = 'Corda' + (mCorda[1] ? ' de ' + tituloNome(mCorda[1]) : '');
  if (!item) {
    const mItem = t.match(/\b(palheta|baqueta|capotraste|afinador|cabo|correia|encordoamento|livro|apostila|camiseta|camisa)(?:\s+de\s+([a-zA-ZÀ-ÿ]+))?/i);
    if (mItem) item = tituloNome(mItem[1] + (mItem[2] ? ' de ' + mItem[2] : ''));
  }
  if (!item && !/\b(lojinha|loja)\b/i.test(t)) return null;
  return { categoria: 'lojinha', item: item || 'Produto de lojinha' };
}

// OCR de cupom nao tem "R$": aceita 5.700,00 / 1.234,56 (decimal obrigatorio, pra nao
// confundir com CNPJ, NSU, AUT, data ou numero de terminal).
function extrairValorOcr(text) {
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
  const m = t.match(/em\s+(\d{1,2})\s*(?:x|parcelas?|vezes)/i) || t.match(/(\d{1,2})\s*x\s*(?:de|sem juros)/i);
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

// ---- PORTA 2: o que a mídia REALMENTE é (fix 17/08/2026) -------------------
// Print de tela do LA Report/Emusys tem valor e nome do aluno escritos nele:
// sem esta porta, a Sol lê o próprio relatório como comprovante e lança dinheiro
// que nunca entrou. Ordem importa: tela vence tudo.
const SINAL_TELA = /(fechamento de caixa|abertura de caixa|saldo inicial|saldo final|movimenta[cç][oõ]es do dia|vendas do dia|gerado pelo la report|la report|gest[aã]o de renova[cç][oõ]es|dados pessoais|hist[oó]rico de aulas|aulas a repor|cr[eé]dito de horas|fideliza|em andamento|status\s+descri[cç][aã]o\s+vencimento|forma de pagamento\s+recebedor|valor devido|comprovante recebido|posso lan[cç]ar|lancei no caixa|conferido por)/i;
const SINAL_COMPROVANTE = /(comprovante|transa[cç][aã]o conclu[ií]da|transfer[eê]ncia (realizada|conclu)|id da transa|e2e[a-z0-9]|chave pix|pix copia|recibo|pagamento (realizado|efetuado|conclu)|transferir para|dados do (recebedor|destinat)|detalhes do (remetente|destinat)|institui[cç][aã]o|autentica[cç][aã]o|nsu|valor pago|data de pagamento|remetente)/i;
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

function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha, semAlunoDeclarado, entidade, valorMaiorNaLegenda }) {
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
    ...(valorMaiorNaLegenda ? [`⚠️ A mensagem cita ${fmtBRL(valorMaiorNaLegenda)} — este card cobre só ${fmtBRL(Number(valor) || 0)}. Se é pagamento de mais de um aluno, manda cada um: *Nome — R$ valor*.`] : []),
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
  if (!ehSaidaPreview && semAlunoDeclarado) {
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
    } else {
      b.push('❓ Quais meses? Me diz: *de 08/2026 a 07/2027*');
    }
    blocos.push(b);
  } else if (linhasCan.length) {
    blocos.push(['*FATURA*'].concat(linhasCan));
  } else if (parcela && parcela.descricao) {
    const b = ['*FATURA*'];
    let l = parcela.descricao;
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
    if (competencia) b.push(`Competência: ${competencia}`);
    if (faturaIndisponivel) b.push('⚠️ Não consegui confirmar a fatura na fonte oficial agora — não vou lançar com *pode* até confirmar.');
    blocos.push(b);
  }

  // ---- ATENÇÃO: só quando existe
  if (duplicata) {
    blocos.push(['*ATENÇÃO*',
      `Já tem uma entrada de ${fmtBRL(Number(duplicata.valor))} no caixa de hoje (${duplicata.hora}${duplicata.descricao ? ' — ' + duplicata.descricao : ''}).`,
      'É outro pagamento?']);
  }

  // ---- o que eu preciso pra lançar
  const semAluno = !aluno && !!(candidatosAluno && candidatosAluno.length || pagadorNome);
  if (faturaIndisponivel) {
    fecho = '👉 Confirma aluno, competência e curso/parcela antes de lançar.';
  } else if (semAluno && valor && !formaIncerta) {
    fecho = '👉 Me diz de qual aluno é que eu lanço.';
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
  const formaTxt = forma === 'cartao' ? 'cartão' : (forma || '❓ forma não identificada');
  const linhas = lista.map((item) => `• ${item.aluno_nome} — ${fmtBRL(item.valor)}${item.sem_vinculo_fatura ? ' _(valor declarado — sem vínculo de fatura)_' : ''}`);
  const responsaveis = [...new Set(lista.map((i) => String(i.responsavel_financeiro || '').trim()).filter(Boolean))];
  const linhaResponsavel = responsaveis.length === 1 ? `\n• Resp. financeiro: ${responsaveis[0]}`
    : (responsaveis.length > 1 ? `\n• Resp. financeiros: ${responsaveis.join(' · ')}` : '');
  const descricoes = [...new Set(lista.map((i) => String(i.descricao || '').trim()).filter(Boolean))];
  const cursos = descricoes.map((d) => d.match(/^taxa(?:s)? de matr[íi]cula do curso de (.+)$/i)).filter(Boolean).map((m) => m[1]);
  const faturaTexto = cursos.length === descricoes.length && cursos.length > 0
    ? `Taxas de Matrícula dos cursos de ${cursos.join(' e ')}`
    : (descricoes.length ? descricoes.join(' · ') : (categoria || 'Recebimento'));
  const faturasPagas = lista.map((i) => i.fatura).filter((f) => f && f.status === 'paga');
  const datasPagas = [...new Set(faturasPagas.map((f) => String(f.data_pagamento || '')).filter(Boolean))];
  const formasPagas = [...new Set(faturasPagas.map((f) => String((f.forma_pagamento && f.forma_pagamento.nome) || '').trim()).filter(Boolean))];
  const dataBR = datasPagas.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(datasPagas[0])
    ? datasPagas[0].slice(8, 10) + '/' + datasPagas[0].slice(5, 7) : null;
  const linhaStatus = faturasPagas.length === lista.length && dataBR
    ? `• Já pago no Emusys em ${dataBR}${formasPagas.length === 1 ? ` no ${formasPagas[0]}` : ''} — falta lançar no caixa`
    : '• Faturas validadas individualmente no Emusys';
  return [
    `📄 *Comprovante recebido — ${unidadeNome}*`,
    `*RECEBIMENTO*\n\n*${fmtBRL(valorTotal)}* · ${formaTxt}`,
    `*ALUNOS*\n\n${linhas.join('\n')}${linhaResponsavel}`,
    `*FATURA*\n\n• ${faturaTexto}\n• Valor: ${fmtBRL(valorTotal)} ✅ confere\n${linhaStatus}${lista.some((i) => i.sem_vinculo_fatura) ? '\n• ⚠️ Item(ns) com desconto negociado — lanço sem vínculo de fatura.' : ''}`,
    '👉 *Posso lançar o lote completo no caixa de hoje?* Responde *pode*',
  ].join('\n\n');
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
    + '?select=id,evento_id,preview_hash,criado_em,operacao,preview_json'
    + '&status=eq.public_preview_sent&criado_em=gte.' + encodeURIComponent(desde)
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
  const base = (f.status !== 'paga' && f.vencida && vh !== null) ? vh : vp;
  const bate = (valorComprovante && base !== null) ? Math.abs(Number(valorComprovante) - base) < 0.01 : null;
  // Teto de plausibilidade: quitacao real e' ate ~12 parcelas + margem. Razao
  // de 100x (31/08: OCR sem virgula fez 38.700 "bater com 100 parcelas") e'
  // sinal de VALOR ERRADO — o aviso certo e' a divergencia, nao a quitacao.
  const _razaoParcelas = (valorComprovante && vp) ? Number(valorComprovante) / vp : 0;
  const quitacao = (valorComprovante && vp) ? (Number(valorComprovante) % vp < 0.01 && _razaoParcelas >= 2 && _razaoParcelas <= 13) : false;

  if (vp !== null) {
    L.push(`Valor: ${fmtBRL(vp)}${f.vencida ? ' (até o vencimento)' : ''}${bate === true ? '  ✅ confere' : ''}`);
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
const MULTIPLAS = /(todas\s+as\s+parcelas|todas\s+parcelas|quita(?:c|ç)(?:a|ã)o|quitou|quitar|antecipa(?:c|ç)(?:a|ã)o|antecipou|pacote\s+de\s+parcelas|ano\s+todo|semestre\s+todo)/i;
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
const SAIDA_TERMO_RE = /\b(?:despesas?|desembolso|reembolso|sa[ií]das?|retirad[ao]s?|retirei|compra(?:mos|ram)?|comprei|paguei|pagamos|gastei|gastos?)\b|\bvale\s+(?:de|do|da|pr[ao])\b|\bvale\s+(?:r\$\s*)?\d/i;

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
  if (/\b(retirad[ao]s?|retirei)\b/i.test(t)) return 'retirada';
  if (SAIDA_TERMO_RE.test(t)) return 'despesa';
  return null;
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

function _descricaoSaidaTexto(texto, categoria) {
  const cat = String(categoria || '').toLowerCase();
  let t = bodyLimpo(texto)
    .replace(/^sol\s*[,!?:-]?\s*/i, ' ')
    .replace(/r\$\s*[\d.,]+/ig, ' ')
    // ANTES da lista abaixo, e com lookaround Unicode em vez de \b: "\b" em JS e ASCII,
    // entao em "saida" acentuada ele ve fronteira entre "sai" e "da" e o "\bda\b" da
    // lista arranca o miolo da palavra. Sobrava "sai" na descricao (Mayra/CG 25/08).
    .replace(/(?<!\p{L})(teve|houve|tivemos|sa[íi]da|retirada|gasto|despesa|uma?|hoje)(?!\p{L})/giu, ' ')
    .replace(/\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia|foi|no|na|de|do|da|em)\b/ig, ' ')
    .replace(/[^\p{L}\d\s./-]/gu, ' ')
    // hifen que sobrou depois de tirar as palavras em volta ("dinheiro - PG seguranca")
    .replace(/(^|\s)-+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 3) return `PG Semana ${cap(cat)}`;
  // sem normalizar acento, "segurança" no texto nunca casa com "seguranca" do enum e a
  // categoria aparece duas vezes na descricao do caixa.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return `PG Semana ${cap(cat)}${semAcento(t).includes(semAcento(cat)) ? '' : ' - ' + t}`;
}

function _pareceTesteLancarApagar(texto) {
  const t = bodyLimpo(texto);
  return /\b(apag(?:o|a|ar)|exclu(?:o|i|ir)|delet(?:o|a|ar))\b/i.test(t)
    && /\b(test(?:e|ar|ando)?|lanc(?:o|a|ar)|lan[çc](?:o|a|ar))\b/i.test(t);
}

function _alunoFromCaption(body) {
  let t = bodyLimpo(body);
  if (!t) return null;
  const rotulado = _alunoRotulado(t);
  if (rotulado) return rotulado;
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
const META_NAO_E_NOME_RE = /\b(descri[cç][aã]o|categoria|despesa|sa[ií]da|entrada|retirada|troco|forma|valor|corrig|corre[cç][aã]o|lan[cç]|altera|muda|troca|confirma|pode|n[aã]o\s+e|cofre|caixa)\b/i;
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
  const rotulado = _alunoRotulado(body);
  if (rotulado) return rotulado;
  // Quem fala SOBRE o lancamento nao esta dizendo um nome de aluno.
  if (META_NAO_E_NOME_RE.test(bodyLimpo(body))) return null;
  let t = bodyLimpo(body)
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
      max_tokens: 2000, temperature: 0,
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
    if (!/r\$/i.test(m[0]) && !/,\d{1,2}$/.test(m[1])) continue;
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
      categorias: Array.isArray(i.categorias) ? i.categorias : [],
      competencias: Array.isArray(i.competencias) ? i.competencias : [],
    })),
  } };
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

function rotearMensagemV4(texto, contexto, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 1 || t.length > 1200) return resolve(null);
    const prompt = 'Voce e a Sol, agente do caixa de uma escola de musica, lendo UMA mensagem do grupo financeiro. '
      + 'Contexto atual (pendencias aguardando conferencia humana, pode ser vazio): '
      + JSON.stringify(contexto).slice(0, 1200)
      + '. Classifique a INTENCAO da mensagem. Responda SOMENTE JSON valido, sem markdown: '
      + '{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|lancamento_multi_aluno|corrigir_lancamento_gravado|estornar_lancamento|reabrir_caixa|abrir_caixa|fechar_caixa|consulta_caixa|conversa|nada",'
      + '"aluno_nome":null,"valor":null,"forma":null,"categoria":null,"competencia":null,"entidade":null,'
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
      + '[parcela,passaporte,matricula,lojinha,venda,outro] e itens[].competencias em MM/AAAA, ambas listas, vazias quando a mensagem nao diz. '
      + 'Um aluno com dois cursos e UM item; dois irmaos sao DOIS itens. Varios meses do mesmo aluno vao em competencias[]. '
      + 'REGRAS: "conversa" = papo de equipe/elogio/despedida; "nada" = assunto alheio ao caixa. '
      + '"aprovar" quando autorizam lancar o que ja esta num card do contexto — inclusive so com "pode", "pode sim", "ok", "isso", "manda", respondendo a pergunta da Sol. Exige card no contexto: sem card, "pode" sozinho e "conversa". '
      + '"lancamento_por_texto" quando a mensagem DITA um pagamento novo, sem comprovante e sem card aberto: traz aluno e/ou valor e/ou competencia ("PG parcela 09/26 Aluno: Fulano LA CG - R$377,00"). Nao confundir com "aprovar" — aqui nao ha card para aprovar, ha um lancamento sendo criado. '
      + '"contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada SEM dizer qual e a certa ("essa parcela nao esta vencida", "ja foi corrigido no sistema"). '
      + 'Se a pessoa DIZ QUAL e a competencia certa ("e a parcela de 08/26 e 09/26 juntas", "e de setembro"), e "corrigir_competencia", nao contestacao — quem aponta o valor certo esta corrigindo, quem so aponta o erro esta contestando. '
      + '"saida_dinheiro" quando o dinheiro SAI do caixa — despesa, compra, retirada, vale, reembolso, troco, pagamento a fornecedor ou a prestador. '
      + 'Vale mesmo sem a palavra "saida" e mesmo sem forma de pagamento: "comprei agua 45", "paguei o motoboy 30", "retirei 200 pro cofre", "vale de R$ 100 pra Ana" sao todos saida_dinheiro. '
      + '"consulta_caixa" para perguntas (resumo, quanto entrou, etc). '
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
      const _v  = o.valor != null ? parseBRMoney(String(o.valor)) : null;
      const _vt = o.valor_total != null ? parseBRMoney(String(o.valor_total)) : null;
      const gv  = _guardar(_v, texto);
      const gvt = _guardar(_vt, texto);
      // itens[]: uma entrada por ALUNO. Listas sempre listas — `null` aqui
      // obrigaria todo consumidor a repetir a mesma checagem.
      const itens = Array.isArray(o.itens) ? o.itens.map((it) => {
        if (!it || typeof it !== 'object') return null;
        const aluno = (it.aluno && String(it.aluno).trim()) || null;
        if (!aluno) return null;
        const lista = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x]))
          .map((y) => String(y || '').trim()).filter(Boolean);
        const gi = _guardar(it.valor != null ? parseBRMoney(String(it.valor)) : null, texto);
        return {
          aluno,
          categorias: lista(it.categorias).map((c) => c.toLowerCase()),
          // competencia sai do modelo como "09/2026", "9/26", "setembro"…
          competencias: lista(it.competencias).map((c) => extrairCompetenciaTexto(c) || c).filter(Boolean),
          valor: gi.valor, valor_recusado: gi.recusado,
        };
      }).filter(Boolean) : [];
      return {
        intencao: String(o.intencao || 'nada'),
        aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
        valor: gv.valor, valor_recusado: gv.recusado,
        forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
        categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
        competencia: (o.competencia && String(o.competencia).trim()) || null,
        entidade: (o.entidade && String(o.entidade).trim()) || null,
        pagador: (o.pagador && String(o.pagador).trim()) || null,
        valor_total: gvt.valor, valor_total_recusado: gvt.recusado,
        itens,
        confianca: Number(o.confianca) || null,
      };
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
        const _v = o.valor != null ? parseBRMoney(String(o.valor)) : null;
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
          valor: o.valor != null ? parseBRMoney(String(o.valor)) : null,
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
// "de 09/2026 a 08/2027", "setembro a agosto", "ago/26 ate jul/27", "08/26-07/27"
function extrairPeriodoMeses(texto) {
  const t = _normConf(texto);
  if (!t) return null;
  const anoAtual = new Date().getFullYear();
  const num = /(\d{1,2})\s*[\/-]\s*(\d{2,4})\s*(?:a|ate|até|-|\u2192|=>)\s*(\d{1,2})\s*[\/-]\s*(\d{2,4})/;
  let m = t.match(num);
  if (m) {
    const a1 = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
    const a2 = Number(m[4]) < 100 ? 2000 + Number(m[4]) : Number(m[4]);
    return { inicio: _mm(Number(m[1]), a1), fim: _mm(Number(m[3]), a2) };
  }
  const nomes = Object.keys(_MES_NOME).join('|');
  const re = new RegExp('(' + nomes + ')[a-z]*\\s*(?:\\/|de\\s*)?(\\d{2,4})?\\s*(?:a|ate|até|-)\\s*(' + nomes + ')[a-z]*\\s*(?:\\/|de\\s*)?(\\d{2,4})?');
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

function competenciaIso(competencia) {
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
function derivarVinculo({ canonica, parcela, composto, alunoNovoId } = {}) {
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
    return aluno ? `${parcela.descricao} - ${aluno}` : parcela.descricao;
  }
  const cat = String(categoria || 'parcela');
  let s2 = cat.charAt(0).toUpperCase() + cat.slice(1);
  if (competencia) s2 += ' ' + competencia;
  if (aluno) s2 += ' - ' + aluno;
  return s2.length >= 3 ? s2 : 'Recebimento via Sol';
}

function _fonteCanonicaIndisponivel(c) {
  const motivo = String(c && (c.motivo || c.motivo_escolha || c.erro || '') || '').toLowerCase();
  return !c || motivo === 'fonte_indisponivel' || /fonte.*indispon|timeout|temporar|indisponivel/.test(motivo);
}

function categoriaEhSaida(categoria) {
  return ['seguranca', 'despesa', 'retirada', 'troco'].includes(String(categoria || '').toLowerCase());
}

function criarHandlerFinanceiro({ grupos, sendFn, lancarFn = lancarRecebimento, lancarLoteFn = lancarRecebimentoLote, lancarSaidaFn = lancarSaidaCaixa, buscarCorrecaoFn = buscarLancamentoParaCorrecao, buscarMovimentosFn = buscarMovimentosCaixa, corrigirMovimentoFn = corrigirMovimentoCaixa, estornarMovimentoFn = estornarMovimentoCaixa, registrarPreviewV3Fn = registrarPreviewV3, registrarApprovalV3Fn = registrarApprovalV3, visaoFn = extrairComprovanteVisao, ocrFn = ocrLocal, interpretarFn = interpretarComprovante, interpretarMultiFn = interpretarMultiAluno, resolverMultiFn = resolverPagamentoItensV1, resolverEnvelopeFn = resolverEnvelopeCaixaV1, casarFn = casarParcela, responsavelFn = buscarResponsavel, pagadorFn = identificarPorPagador, canonicaFn = casarParcelaCanonica, faturasMesFn = buscarCompostoFaturasMes, duplicataFn = jaLancadoHoje, identidadeFn = identificarPessoa, resumoFn = resumoDoDia, classificarCorrecaoFn = classificarCorrecaoPendencia, listarPreviewsAbertosFn = listarPreviewsAbertosV3, rotearV4Fn = rotearMensagemV4, log = () => {}, janelaMs = 30 * 60 * 1000, dryRun = (process.env.SOL_CAIXA_DRYRUN === '1') }) {
  // SOL_CAIXA_V3_LEDGER_FAKE=1 (suite de testes): fiacao V3 ativa, banco intacto.
  // Sem isto, teste que nao mocka os registradores grava preview/approval REAL
  // no ledger de producao — 62% dos previews de 24-31/08 eram artefato de teste.
  // ⚠️ So substitui o DEFAULT (RPC real): mock explicito do teste — inclusive
  // mock que FALHA, como no gate-regressao caso 2 — continua valendo.
  if (process.env.SOL_CAIXA_V3_LEDGER_FAKE === '1') {
    let _fakeSeq = 0;
    if (registrarPreviewV3Fn === registrarPreviewV3) registrarPreviewV3Fn = async () => ({ ok: true, preview_id: 'fake-prev-' + (++_fakeSeq) });
    if (registrarApprovalV3Fn === registrarApprovalV3) registrarApprovalV3Fn = async () => ({ ok: true, approval_id: 'fake-appr-' + (++_fakeSeq) });
  }
  // grupos: { [chatId]: { unidade_id, nome } }
  const pendentes = new Map();   // chatId -> [ {previewId, unidade_id, nome, valor, forma, categoria, aluno, idemKey, origem, ts} ]
  const lancadosRecentes = new Map(); // chatId -> [ {confirmMessageId, movimentacao_id, unidade_id, nome, valor, forma, ts} ]
  const vistos = new Set();      // idemKeys ja processados (anti-redelivery)
  const textosRecentes = new Map(); // chatId+senderId -> {texto, ts}: legenda/nome que veio em bolha IRMA (comprovante + nome em mensagens separadas)
  const lotesMidia = new Map();  // chatId+senderId -> lote curto: 2 PDFs + texto humano viram UM preview
  const textoIrmaoKey = (event) => `${event.chatId}::${event.senderId || event.senderPhone || 'sem_sender'}`;
  const loteJanelaMs = Math.max(0, Number(process.env.SOL_CAIXA_LOTE_MS || 900));
  const v3LedgerMode = String(process.env.SOL_CAIXA_V3_LEDGER_MODE || '').toLowerCase();
  const v3LedgerAtivo = ['production', 'prod', 'on', '1'].includes(v3LedgerMode);
  const v3LedgerStrict = process.env.SOL_CAIXA_V3_LEDGER_STRICT === '1';

  async function registrarPreviewPublicoV3({ event, grupo, previewId, texto, pendencia, result }) {
    if (!v3LedgerAtivo) return null;
    const previewJson = {
      public_preview_sent: true,
      preview_message_id: previewId,
      text: String(texto || '').slice(0, 5000),
      pending: pendencia,
      handler_result: result || null,
    };
    const previewHash = sha256(JSON.stringify(previewJson));
    const payload = {
      event_id_hash: sha256(event.messageId),
      chat_id_hash: md5(event.chatId),
      sender_id_hash: sha256(event.senderId || event.senderPhone || ''),
      unidade_id: grupo.unidade_id,
      observed_at: event.ts || new Date(Number(event.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      source: 'sol_caixa_whatsapp_production',
      mode: 'v3_production_public_preview',
      status: 'public_preview_sent',
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
      preview_status: 'public_preview_sent',
      preview_json: previewJson,
    };
    try {
      const registered = await registrarPreviewV3Fn(payload);
      log({ acao: 'v3_preview_ledger_registrado', ok: !!(registered && registered.ok), preview_ledger_id: registered && registered.preview_id });
      return { ...(registered || {}), preview_hash: previewHash };
    } catch (e) {
      log({ acao: 'v3_preview_ledger_erro', erro: String(e && e.message) });
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
      log({ acao: 'v3_approval_ledger_registrado', ok: !!(registered && registered.ok), approval_id: registered && registered.approval_id });
      return { ...(registered || {}), approval_event_hash: approvalEventHash, actor_id_hash: actorIdHash };
    } catch (e) {
      log({ acao: 'v3_approval_ledger_erro', erro: String(e && e.message) });
      if (v3LedgerStrict) throw e;
      return null;
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

  async function tratarAgentFirst(event, grupo, agora) {
    const texto = bodyLimpo(event.body);
    if (!texto) return null;
    const arr = limparVelhos(event.chatId, agora);
    const contexto = arr.slice(0, 3).map((p, i) => ({
      card: i + 1, valor: p.valor || null, forma: p.forma || null,
      categoria: p.categoria || null, aluno: p.aluno || null, competencia: p.competencia || null,
    }));
    const t0 = Date.now();
    let dec = null;
    try { dec = await rotearV4Fn(texto, contexto, { timeout: 12000 }); } catch (e) { dec = null; }
    if (!dec) { log({ acao: 'agent_first_sem_decisao', chatId: event.chatId, ms: Date.now() - t0 }); return null; }

    // ── SEGUNDO TURNO: corrige o ENVELOPE guardado, nunca remonta frase ──────
    const guardado = envelopesV4.get(event.chatId);
    const vivo = guardado && (agora - guardado.ts) < janelaMs;
    let env;
    if (vivo && String(dec.intencao || '').startsWith('corrigir_')) {
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
      log({ acao: 'agent_first_sem_envelope', chatId: event.chatId, motivo: env.motivo,
            intencao: dec.intencao, confianca: dec.confianca });
      return null;
    }

    let res = null;
    try { res = await resolverEnvelopeFn({ unidade_id: grupo.unidade_id, envelope: env.envelope }); }
    catch (e) { log({ acao: 'agent_first_erro_resolver', chatId: event.chatId, erro: String(e && e.message) }); return null; }
    if (!res) return null;

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
    if (!res.ok || !Array.isArray(res.itens) || res.itens.length === 0) {
      log({ acao: 'agent_first_nao_resolveu', chatId: event.chatId, motivo: res.motivo || 'sem_itens' });
      return null;
    }

    log({ acao: 'agent_first_resolveu', chatId: event.chatId, via: res.via,
          linhas: res.itens.length, alunos: res.alunos, ms: Date.now() - t0 });
    envelopesV4.set(event.chatId, { envelope: env.envelope, ts: agora });
    // Daqui para baixo e o fluxo de sempre: preview, cofre V3, "pode" humano,
    // lote atomico. O agent-first so troca QUEM montou a pergunta.
    return abrirFluxoMultiAluno({
      event, grupo, textoFonte: texto, textoHumano: texto, agora,
      origemMessageId: event.messageId, resolvidoPronto: res,
      intent: { ok: true, valor_total: Number(res.valor_total), forma: env.envelope.forma,
                categoria: null,
                itens: res.itens.map((i) => ({ aluno_nome: i.aluno_nome, valor: Number(i.valor), categoria: i.categoria })) },
    });
  }

  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, textoHumano, intent, agora, origemMessageId, resolvidoPronto = null }) {
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
        ts: agora, motivoMulti: motivo,
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
      await colocarEmRevisao(intent && intent.motivo || 'itens_incompletos');
      await sendFn(event.chatId, '⚠️ Entendi que este comprovante é de mais de um aluno. Não vou escolher um deles nem dividir o total sozinho. Manda cada aluno com seu valor, por exemplo:\n• João — R$ 360\n• Pedro — R$ 360');
      log({ acao: 'manual_review_multi_student', chatId: event.chatId, motivo: intent && intent.motivo || 'itens_incompletos' });
      return { acao: 'manual_review_multi_student' };
    }
    if (!intent.forma) {
      await colocarEmRevisao('forma_ausente');
      await sendFn(event.chatId, '⚠️ Entendi os dois alunos e a divisão, mas falta a forma de pagamento. Me diz: pix, dinheiro, cartão, cheque ou transferência.');
      return { acao: 'manual_review_multi_student' };
    }
    // Divisao DECLARADA pelo humano viaja com a flag: valor negociado que nao
    // bate com fatura lanca SEM vinculo, como no fluxo de um aluno (Jhon/CG
    // 01/09, "Desconto autorizado pelo Jereh"). So marca quando o valor esta
    // LITERALMENTE no texto escrito — divisao derivada segue fail-closed.
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
      _valorNoTextoHumano(it && it.valor) ? { ...it, declarado_pelo_humano: true } : it);
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
    const _tetoAlunos = Math.max(2, Number(process.env.SOL_CAIXA_MAX_ALUNOS_LOTE || 12));
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
      await colocarEmRevisao(resolvido && resolvido.motivo || 'itens_nao_validados');
      // 02/09: a mesma legenda falhou as 16:23 e passou as 16:50 — o espelho do
      // Emusys ainda nao tinha as faturas como PAGAS (sync a cada 15 min). A
      // mensagem antiga mandava conferir dados que estavam CERTOS. A RPC ja
      // devolve o motivo estruturado; so faltava contar a verdade.
      const _quem = resolvido && resolvido.aluno_nome ? ` do ${resolvido.aluno_nome}` : '';
      const _pedeDivisao = 'me manda a divisão com o valor de cada um: *Nome — R$ valor*';
      const _motivosMulti = {
        alocacao_nao_derivavel: (resolvido && Number(resolvido.candidatas) > 1)
          ? `achei mais de uma fatura paga${_quem} nos últimos dias e não sei qual é esta — ${_pedeDivisao}.`
          : `ainda não vejo a fatura${_quem} como paga na minha cópia do Emusys (ela atualiza a cada 15 min). Se o pagamento acabou de entrar, me reenvia daqui a pouco — ou ${_pedeDivisao}.`,
        sem_fatura_da_categoria: `não encontrei fatura dessa categoria${_quem} na competência — confere a competência, ou ${_pedeDivisao}.`,
        aluno_nao_encontrado: `não achei${_quem} no cadastro desta unidade — confere o nome completo.`,
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
          return `o valor que você escreveu${dec ? ` (${fmtBRL(dec)})` : ''} não bate com fatura nenhuma${_quem}.${visto} Se for desconto negociado, escreve o valor na mensagem que eu lanço sem vincular a fatura.`;
        })(),
        aluno_sem_nome: 'não consegui ler o nome de um dos alunos — ' + _pedeDivisao + '.',
        sem_fatura_que_bata: `não achei fatura${_quem} que feche com esse valor — confere o valor, ou ${_pedeDivisao}.`,
        itens_ausentes: 'não entendi a divisão — ' + _pedeDivisao + '.',
      };
      const _detalhe = _motivosMulti[resolvido && resolvido.motivo]
        || 'ainda não consegui confirmar todas as faturas oficiais — confere aluno, competência e valor de cada um.';
      await sendFn(event.chatId, `⚠️ Entendi a divisão, mas ${_detalhe}\n_Não lanço parcialmente._`);
      log({ acao: 'manual_review_multi_student', chatId: event.chatId, motivo: resolvido && resolvido.motivo || 'itens_nao_validados' });
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
      sem_vinculo_fatura: !!item.sem_vinculo_fatura, declarado_pelo_humano: !!item.declarado_pelo_humano,
    }));
    const texto = montarPreviewMultiAluno({ unidadeNome: grupo.nome, valorTotal: intent.valor_total, forma: intent.forma, categoria: intent.categoria, itens });
    const previewId = await sendFn(event.chatId, texto);
    let idEnviou = null;
    try { idEnviou = await identidadeFn(event.senderPhone, grupo.unidade_id); } catch (e) { /* melhor esforço */ }
    const pendencia = {
      previewId, tipoOperacao: 'lancar_recebimento_lote', unidade_id: grupo.unidade_id, nome: grupo.nome,
      valor: intent.valor_total, forma: intent.forma, categoria: intent.categoria, itens,
      descricao: `Lote multi-aluno (${itens.length} itens)`, aluno: null, competencia: null,
      origem: origemMessageId || event.messageId, idemKey: `${event.chatId}:${origemMessageId || event.messageId}:lote-multi`,
      enviadoPor: nomeParaCarimbo(idEnviou, event), ts: agora,
    };
    const v3 = await registrarPreviewPublicoV3({
      event, grupo, previewId, texto, pendencia,
      result: { acao: 'preview_multi_aluno_enviado', itens: itens.length, valor_total: intent.valor_total },
    });
    if (!v3 || !v3.preview_id || !v3.preview_hash) {
      await sendFn(event.chatId, '⚠️ Não deixei esse lote pendente porque o preview seguro não foi registrado. Não responda *pode*; tenta de novo em instantes.');
      log({ acao: 'preview_multi_aluno_sem_v3', chatId: event.chatId });
      return { acao: 'preview_multi_aluno_sem_v3' };
    }
    pendencia.v3PreviewId = v3.preview_id;
    pendencia.v3PreviewHash = v3.preview_hash;
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
    if (!loteJanelaMs) return { event };
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
    lote.eventos.push(event);
    lote.ts = agora;
    log({ acao: 'lote_midia_anexada', chatId: event.chatId, midias: lote.eventos.length });
    return { skip: true, acao: 'lote_midia_anexada' };
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
    pendentes.set(chatId, vivos);
    return vivos;
  }

  async function handle(event, agora = Date.now()) {
    const chatId = event.chatId;
    const grp = grupos[chatId];
    if (!grp) return { acao: 'ignorado_fora_grupo' };
    // A foto sai aqui, antes de qualquer coisa consumir pendencia (P2).
    fotografarContextoV4(event, chatId, agora);
    const senderNum = String(event.senderPhone || event.senderId || '').replace(/@.*/, '').replace(/\D/g, '');

    // CANARIO AGENT-FIRST — DESLIGADO por padrao, por LISTA de grupo.
    // ⚠️ Antes de tudo, de proposito: se o legado responder primeiro, o
    //    canario nao mede nada (foi o diagnostico do caso Lis/Mayra).
    // ⚠️ Nao vale para midia nesta rodada: o caminho de comprovante tem OCR e
    //    visao, e misturar as duas inversoes no mesmo canario impede saber qual
    //    delas moveu o numero.
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
    if (!event.hasMedia && !casarPode(event.body).pode) {
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
      if (categoriaEhSaida(categoriaTexto)) {
        const valor = extrairValor(texto);
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
          unidadeNome: grp.nome, valor, forma, categoria: categoriaTexto,
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

    // 0.6) correção/estorno de lançamento já gravado.
    // "Excluir" no caixa vira estorno auditado; alteração de valor/categoria/
    // descrição passa pela RPC de correção controlada. O alvo precisa vir de
    // mensagem citada, memória recente do lançamento ou busca que retorne item único.
    if (!event.hasMedia && !casarPode(event.body).pode) {
      let cmdMov = extrairComandoMovimento(event.body);
      if (cmdMov && bodyLimpo(event.body).length > 250) {
        log({ acao: 'comando_movimento_ignorado_prosa', chatId, len: bodyLimpo(event.body).length });
        cmdMov = null;
      }
      const pendentesAtivos = limparVelhos(chatId, agora);
      const corrigePreviewAtivo = cmdMov && cmdMov.tipo === 'corrigir' && (
        pendentesAtivos.some((p) => p.previewId === event.quotedMessageId) ||
        (!event.quotedBody && pendentesAtivos.length === 1)
      );
      if (cmdMov && !corrigePreviewAtivo) {
        let alvo = alvoLancado(chatId, event.quotedMessageId, agora);
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
          else if (items.length > 1) {
            await sendFn(chatId, 'Achei mais de um lançamento parecido. Responde citando a minha mensagem exata do lançamento ou informa o valor/aluno.');
            log({ acao: 'movimento_alvo_ambiguo', chatId, count: items.length });
            return { acao: 'movimento_alvo_ambiguo' };
          }
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
          else if (items.length > 1) {
            const linhas = items.slice(0, 5).map((x, i) => `${i + 1}. ${fmtBRL(x.valor)} · ${x.categoria || 'sem categoria'} · ${x.forma_pagamento || 'sem forma'} · ${x.responsavel || x.descricao || ''}`.trim()).join('\n');
            await sendFn(chatId, `Achei mais de um lançamento. Me diz qual é, ou responde citando a mensagem correta:\n${linhas}`);
            log({ acao: 'movimento_alvo_ambiguo', chatId, count: items.length });
            return { acao: 'movimento_alvo_ambiguo' };
          }
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
      const idemKey = `${chatId}:${event.messageId}`;
      if (vistos.has(idemKey)) return { acao: 'dup_ignorada' };
      vistos.add(idemKey);
      let valor = extrairValor(event.body);
      let forma = extrairForma(event.body, null);
      let cartaoModalidade = null, cartaoParcelas = null;
      const media = (event.mediaUrls || [])[0];
      // Camada 1: OCR LOCAL (igual Maria) -- roda sempre que ha midia (texto p/ valor E interpretacao)
      let ocrText = '';
      let ocrMeta = { status: 'nao_executado', duration_ms: 0, file_bytes: null };
      if (media) {
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
        // ⚠️ Este ramo SOBRESCREVE a forma sem olhar o que ja foi lido. Com pix
        // explicito no comprovante, so sinal FORTE de maquininha desbanca — e
        // nesse caso extrairCartao ja devolve null (F1a, 05/09/2026).
        const cc = extrairCartao(ocrText);
        if (cc) { forma = 'cartao'; cartaoModalidade = cc.modalidade; cartaoParcelas = cc.parcelas; }
      }
      // Camada 2: visao OAuth e' fallback do OCR — inclusive quando ele falha.
      // O fluxo antigo recusava a midia antes de chegar aqui justamente no caso
      // de texto vazio/timeout, que e' quando a visao e' mais necessaria.
      let alunoVis = null;
      let pagadorVis = null;
      let visao = null;
      // ⚠️ Tambem por FORMA ausente. A forma e' tao essencial quanto o valor: sem
      // ela o card trava e pede "pode, pix / pode, dinheiro / pode, cartao" — e
      // convidar a equipe a escolher a forma de cabeca num cupom de CARTAO e' como
      // dinheiro entra no caixa na linha errada.
      // Caso Arthur/Barra 29/08: foto torta de cupom PagBank num sofa escuro; o OCR
      // devolveu 452 chars de ruido (acima do limiar de 20, sem UM sinal de cartao)
      // e a legenda trazia o valor — entao nada disparava a visao. As 11:27 a MESMA
      // foto, com legenda SEM valor, saiu "cartao credito" certinho: dar mais
      // informacao fazia a Sol saber menos.
      if (media && (!valor || !forma || ocrText.trim().length < 20)) {
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
      let _bodyComIrma = event.body;
      try {
        const _kEsp = textoIrmaoKey(event);
        const _bufEsp = textosRecentes.get(_kEsp);
        const _frescoEsp = _bufEsp && _bufEsp.ts >= agora - 150000 && _bufEsp.ts <= agora + 60000;
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
      {
        const _kTextoIrmao = textoIrmaoKey(event);
        const _buf = textosRecentes.get(_kTextoIrmao);
        const _fresco = _buf && _buf.ts >= agora - 150000 && _buf.ts <= agora + 60000;
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
      // R-j (31/08): a legenda humana com R$ explicito VENCE o valor do OCR.
      // O tesseract perdeu a virgula ("387,00" -> "38700") e o card nasceu com
      // R$ 38.700,00 tendo "R$387,00" escrito pela Mayra na legenda-irma — o
      // backfill era só `if (!valor)`, entao o OCR errado ganhava do humano.
      {
        const _vLegenda = extrairValor(legendaEfetiva);
        if (_vLegenda && valor && Math.abs(_vLegenda - valor) >= 0.01) {
          log({ acao: 'valor_da_legenda_vence_ocr', chatId, ocr: valor, legenda: _vLegenda });
          valor = _vLegenda;
        }
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
      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);
      if (somaLegenda) {
        valor = somaLegenda.total;
        log({ acao: 'valor_soma_legenda', chatId, total: valor, partes: somaLegenda.partes.length });
      }
      // Camada 3: INTERPRETACAO FLUIDA (categoria/aluno/competencia via LLM texto; humano confirma)
      let categoria = null, aluno = null, competencia = null;
      // ⚠️ fora do try de proposito: `it` morre no fim do bloco, e o portao do
      //    pagamento inteiro (mais abaixo) precisa da lista de pessoas.
      let pagamentosLLM = [];
      try {
        log({ acao: 'interpretar_attempt', chatId });
        const it = await interpretarFn((legendaEfetiva + '\n' + ocrText).trim());
        log({ acao: 'interpretar_result', categoria: it && it.categoria });
        if (it) { categoria = it.categoria; aluno = it.aluno; competencia = it.competencia; if (!forma && it.forma) forma = it.forma;
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
      const _pagLLM = pagamentosNaLegenda(pagamentosLLM, legendaEfetiva);
      const _multiPorLLM = _pagLLM.length >= 2;
      if (_multiPorLLM && !detectarContextoMultiAluno(legendaEfetiva)) {
        log({ acao: 'multi_visto_pelo_modelo', chatId, itens: _pagLLM.length,
              nomes: _pagLLM.map((p) => p.aluno).slice(0, 4) });
      }
      if (detectarContextoMultiAluno(legendaEfetiva) || _multiPorLLM) {
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
        return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: textoClassificacao, textoHumano: legendaEfetiva, intent: intentMulti, agora, origemMessageId: event.messageId });
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
      const multiplas = pagamentoMultiplo(bodyLimpo(event.body) + ' ' + ocrText);
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
        // recebe o mês explicitamente. Nunca deixe a busca sem competência
        // escolher outra fatura de mesmo valor.
        if (competenciaPreferida && querParcela && !multiplas) {
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
            const novo = await identificarAlunoNovo(grp.unidade_id, aluno);
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
      // Aluno com dois cursos/parcelas no mesmo mes (caso Pedro 18/08):
      // se a legenda diz 08/2026 e o comprovante e a soma de Canto+Guitarra,
      // o preview precisa mostrar o composto em vez de puxar uma fatura isolada.
      let composto = null;
      const competenciaComposto = competenciaHumana || competencia;
      if (aluno && valor && competenciaComposto && querParcela && !multiplas) {
        try {
          const compMes = await faturasMesFn(grp.unidade_id, aluno, competenciaComposto, valor);
          if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2
              && !(_alunoVeioDoRotulo && compMes.aluno_nome && !_mesmaPessoa(compMes.aluno_nome, aluno))) {
            composto = compMes;
            if (compMes.aluno_nome) aluno = compMes.aluno_nome;
            if (compMes.competencia) competencia = compMes.competencia;
            categoria = 'parcela';
            parcela = null;
            canonica = null;
            confiancaBaixa = false;
            bloqueiaFonteIndisponivel = false;
            log({ acao: 'composto_mes_result', ok: true, partes: compMes.partes.length, competencia: compMes.competencia });
          }
        } catch (e) { /* best-effort */ }
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
      }
      const bloqueiaLancamento = !composto && parcela && parcela.multiplas_no_mes && parcela.valor_bate === false;
      const saidaCaixa = categoriaEhSaida(categoria);
      const descricaoSaida = saidaCaixa
        ? (bodyLimpo(legendaEfetiva)
          .replace(/r\$\s*[\d.,]+/ig, ' ')
          .replace(/\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia)\b/ig, ' ')
          .replace(/[^\p{L}\d\s./-]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim())
        : null;
      const descricao = composto
        ? (descricaoDoComposto(composto, aluno) || _descricaoLancamento(categoria, competencia, aluno, parcela))
        : lojinhaInfo
        ? `Lojinha/Venda - ${lojinhaInfo.item || 'Produto'}${aluno ? ' - ' + aluno : ''}`
        : saidaCaixa
        ? (descricaoSaida && descricaoSaida.length >= 3 ? `PG Semana ${cap(categoria)}${descricaoSaida.toLowerCase().includes(String(categoria).toLowerCase()) ? '' : ' - ' + descricaoSaida}` : `PG Semana ${cap(categoria)}`)
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
          : (aluno && !_declarado && _remetente && _mesmaPessoa(aluno, _remetente)) ? 'e_quem_enviou'
          : null;
        if (_porQue) {
          log({ acao: 'aluno_descartado_nao_e_aluno', chatId, aluno, motivo: _porQue });
          aluno = null; responsavelFinanceiro = null; canonica = null; parcela = null;
          alunoNovoId = null; alunoNovoOrigem = null; alunoViaPagador = null; candidatosAluno = null;
        }
      }
      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel: canonicaIndisponivel, composto, bloqueiaLancamento, itemLojinha: lojinhaInfo && lojinhaInfo.item, valorMaiorNaLegenda });
      if (dryRun) texto += '\n\n_(modo teste — nada será gravado no caixa)_';
      const previewId = await sendFn(chatId, texto);
      const arr = limparVelhos(chatId, agora);
      log({ acao: 'identidade_envio', identificado: !!(idEnviou && idEnviou.identificado) });
      const pendencia = { previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor, forma, categoria, aluno, competencia, descricao, parcela, responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta, quitacao, multiplas, composto, canonica, alunoNovoId, itemLojinha: lojinhaInfo && lojinhaInfo.item, bloqueiaLancamento, faturaIndisponivel: canonicaIndisponivel, bloqueiaFonteIndisponivel, categoriaInterpretada: _categoriaAntesDaFatura || null, enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId,
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
      const arrP = limparVelhos(chatId, agora);
      const txt = String(event.body || '').trim();

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
        const manuais = arrP.filter((p) => p.tipoOperacao === 'manual_review_multi_student');
        const alvoManual = event.quotedMessageId
          ? manuais.find((p) => p.previewId === event.quotedMessageId || p.origem === event.quotedMessageId)
          : (manuais.length === 1 ? manuais[0] : null);
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
            alvoManual.multiTexto = textoFonte; alvoManual.ts = agora;
            await sendFn(chatId, 'Ainda falta uma divisão verificável por aluno. Manda os dois assim: *Nome — R$ valor*; não vou usar só o total.');
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
              unidadeNome: alvoP.nome, valor: alvoP.valor, forma: alvoP.forma,
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
          pendentes.set(chatId, arrD.filter((p) => p !== alvoD));
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
              unidadeNome: alvoS.nome, valor: alvoS.valor, forma: alvoS.forma,
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
          if (!alvoVD && arrP.length === 1) alvoVD = arrP[0];
          if (alvoVD && !categoriaEhSaida(alvoVD.categoria) && Math.abs((alvoVD.valor || 0) - _valorDitado) >= 0.01) {
            log({ acao: 'preview_valor_corrigido', chatId, de: alvoVD.valor || null, para: _valorDitado });
            alvoVD.valor = _valorDitado;
            if (alvoVD.parcela && alvoVD.parcela.valor_da_parcela != null) {
              alvoVD.parcela.valor_bate = Math.abs(Number(alvoVD.parcela.valor_da_parcela) - _valorDitado) < 0.01;
            }
            alvoVD.bloqueiaLancamento = !alvoVD.composto && alvoVD.parcela && alvoVD.parcela.multiplas_no_mes && alvoVD.parcela.valor_bate === false;
            alvoVD.ts = agora;
            let textoVD = 'Corrigi o valor:\n\n' + montarPreview({
              unidadeNome: alvoVD.nome, valor: alvoVD.valor, forma: alvoVD.forma,
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
              unidadeNome: alvoCD.nome, valor: alvoCD.valor, forma: alvoCD.forma,
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
            let c = await canonicaFn(alvoP.unidade_id, nomeTardio, alvoP.valor);
            let respondeu = !!(c && (c.ok === true || c.ok === false));
            if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
            if (!respondeu) {
              log({ acao: 'canonica_retry_tardia', chatId });
              c = await canonicaFn(alvoP.unidade_id, nomeTardio, alvoP.valor);
              respondeu = !!(c && (c.ok === true || c.ok === false));
              if (c && c.ok === false && _fonteCanonicaIndisponivel(c)) { respondeu = false; bloqueiaFonteIndisponivel = true; }
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
          alvoP.bloqueiaLancamento = !alvoP.composto && parcela && parcela.multiplas_no_mes && parcela.valor_bate === false;
          alvoP.faturaIndisponivel = canonicaIndisponivel;
          alvoP.bloqueiaFonteIndisponivel = bloqueiaFonteIndisponivel;
          alvoP.responsavelFinanceiro = responsavelFinanceiro;
          alvoP.descricao = descricaoDoComposto(alvoP.composto, alvoP.aluno) || descricaoDaFatura(canonica, alvoP.aluno) || _descricaoLancamento(categoria, competencia, alvoP.aluno, parcela);
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
                if (m && m.ok && m.parcela) {
                  if (m.aluno_nome) alvoP.aluno = m.aluno_nome;
                  if (m.ambiguo) confiancaBaixa = true;
                  parcela = m.parcela;
                  if (m.parcela.competencia) competencia = m.parcela.competencia;
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
          alvoP.bloqueiaLancamento = !alvoP.composto && parcela && parcela.multiplas_no_mes && parcela.valor_bate === false;
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
      if (arr.length === 0) return { acao: 'pode_sem_pendencia' };
      let alvo = null;
      if (event.quotedMessageId) alvo = arr.find((p) => _citaPend(p, event.quotedMessageId)) || null;
      if (!alvo) {
        if (arr.length === 1) alvo = arr[0];
        else {
          // "pode" seco com 2+ cards: resolve por QUEM fala (29/08: o card da
          // Fernanda e o da Daiana; o pode de cada uma e sobre o SEU — ou sobre o
          // ultimo que a Sol mostrou para ela). Toque mais recente ganha. Quem nao
          // tem card proprio recebe a lista numerada em vez de um enigma.
          const _quem = String(event.senderPhone || event.senderId || '');
          const _minhas = _quem ? arr.filter((p) =>
            String(p.toquePor || '') === _quem
            || String(p.autorPhone || '') === _quem
            || String(p.autorId || '') === _quem) : [];
          if (_minhas.length) {
            alvo = _minhas.reduce((a, b) => (((b.toqueTs || b.ts || 0) > (a.toqueTs || a.ts || 0)) ? b : a));
            log({ acao: 'pode_resolvido_por_autor', chatId, valor: alvo.valor || null });
          } else {
            const _lista = arr.map((p, i) => (i + 1) + ') ' + (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : '') + (p.enviadoPor ? ' (' + p.enviadoPor + ')' : '')).join('\n');
            await sendFn(chatId, 'Tem mais de um comprovante aguardando:\n' + _lista + '\nResponde *pode* citando o card certo.');
            return { acao: 'ambiguo' };
          }
        }
      }
      if (alvo.tipoOperacao === 'estornar_movimento' || alvo.tipoOperacao === 'corrigir_movimento') {
        if (dryRun) {
          pendentes.set(chatId, arr.filter((p) => p !== alvo));
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
          if (rOp && rOp.ok) {
            await sendFn(chatId, `Estornei no caixa: ${fmtBRL(rOp.valor || alvo.valor)}. Não apaguei o original; criei o movimento inverso auditado.`);
            log({ acao: 'movimento_estornado', movimentacao_id: alvo.movimentacao_id, estorno_id: rOp.movimentacao_estorno_id });
            return { acao: 'movimento_estornado', movimentacao_id: alvo.movimentacao_id, movimentacao_estorno_id: rOp.movimentacao_estorno_id };
          }
          await sendFn(chatId, `⚠️ Não consegui estornar: ${rOp && rOp.motivo ? rOp.motivo : 'erro desconhecido'}.`);
          return { acao: 'estorno_recusado', motivo: rOp && rOp.motivo };
        }
        try { rOp = await corrigirMovimentoFn({ ...payloadOperacao, correcoes: alvo.correcoes || {} }); }
        catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao corrigir. Já registrei o problema.'); log({ acao: 'erro_rpc_corrigir_movimento', erro: String(e && e.message) }); return { acao: 'erro_corrigir_movimento' }; }
        pendentes.set(chatId, arr.filter((p) => p !== alvo));
        if (rOp && rOp.ok) {
          const depois = rOp.depois || {};
          await sendFn(chatId, `Corrigi no caixa: ${fmtBRL(depois.valor || alvo.valor)} · ${depois.categoria || alvo.categoria || 'lançamento'} · ${depois.forma_pagamento || alvo.forma || ''}.`);
          log({ acao: 'movimento_corrigido', movimentacao_id: alvo.movimentacao_id });
          return { acao: 'movimento_corrigido', movimentacao_id: alvo.movimentacao_id };
        }
        await sendFn(chatId, `⚠️ Não consegui corrigir: ${rOp && rOp.motivo ? rOp.motivo : 'erro desconhecido'}.`);
        return { acao: 'movimento_correcao_recusada', motivo: rOp && rOp.motivo };
      }
      if (alvo.tipoOperacao === 'lancar_recebimento_lote') {
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
        if (lote && lote.ok) {
          const movsLote = lote.movimentacoes || [];
          if (movsLote.length !== alvo.itens.length) {
            await sendFn(chatId, `🚨 ATENÇÃO: o banco confirmou ${movsLote.length} de ${alvo.itens.length} itens do lote. NÃO confia neste lançamento — confere o caixa antes de fechar e chama o suporte.`);
            log({ acao: 'lote_multi_incompleto', chatId, lote_id: lote.lote_id, esperados: alvo.itens.length, gravados: movsLote.length });
            return { acao: 'lote_multi_incompleto', lote_id: lote.lote_id };
          }
          const linhas = movsLote.map((m) => `• ${m.aluno_nome}: ${fmtBRL(m.valor)}`).join('\n');
          await sendFn(chatId, `✅ Lancei o lote no caixa da ${alvo.nome}: ${fmtBRL(alvo.valor)} (${alvo.forma}).\n${linhas}\n_Operação única e auditada; nenhum item foi lançado parcialmente._`);
          log({ acao: 'lote_multi_lancado', chatId, lote_id: lote.lote_id, itens: alvo.itens.length });
          return { acao: 'lote_multi_lancado', lote_id: lote.lote_id };
        }
        if (lote && lote.motivo === 'caixa_nao_aberto') {
          await sendFn(chatId, `⚠️ O caixa da ${alvo.nome} ainda não está aberto. O lote está conferido, mas não pode ser lançado agora. Nada foi lançado parcialmente. Gere um preview novo quando o caixa estiver aberto.`);
          log({ acao: 'lote_multi_recusado', chatId, motivo: lote.motivo });
          return { acao: 'lote_multi_recusado', motivo: lote.motivo };
        }
        const motivoLote = lote && lote.motivo;
        const motivoHumano = {
          snapshot_fatura_nao_encontrada: 'a fatura canônica do preview não está disponível na fonte oficial',
          snapshot_status_fatura_mudou: 'o status de uma fatura mudou desde o preview',
          snapshot_valor_fatura_mudou: 'o valor de uma fatura mudou desde o preview',
          snapshot_categoria_mudou: 'a categoria de uma fatura mudou desde o preview',
          snapshot_competencia_mudou: 'a competência de uma fatura mudou desde o preview',
          snapshot_soma_divergente: 'a soma das faturas não confere com o total',
          fonte_indisponivel: 'a fonte oficial de faturas está indisponível',
        }[motivoLote] || 'a validação final não reproduziu o preview';
        await sendFn(chatId, `⚠️ Não lancei o lote: ${motivoHumano}. Nada foi lançado parcialmente. O preview original foi preservado; não precisa reenviar o comprovante.`);
        log({ acao: 'lote_multi_recusado', chatId, motivo: motivoLote });
        return { acao: 'lote_multi_recusado', motivo: motivoLote };
      }
      if (alvo.divisao && alvo.divisao.length >= 2) {
        const linhas = alvo.divisao.map((p) => `• ${p.label}: ${fmtBRL(p.valor)}`).join('\n');
        await sendFn(chatId, `⚠️ Não lancei: esse comprovante está marcado como pagamento dividido.\n${linhas}\n\nConfirma/manda cada parte separada para eu lançar sem misturar.`);
        log({ acao: 'bloqueado_divisao_pendente', chatId, partes: alvo.divisao.length });
        return { acao: 'bloqueado_divisao_pendente' };
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
        await sendFn(chatId, `🧪 (teste) Eu lançaria na ${alvo.nome}: ${cap(alvo.categoria || 'parcela')} — ${fmtBRL(valor)} (${forma}). Nada foi gravado.`);
        log({ acao: 'dryrun', valor });
        return { acao: 'dryrun' };
      }
      let idAut = null;
      try { idAut = await identidadeFn(event.senderPhone, alvo.unidade_id); } catch (e) { /* best-effort */ }
      log({ acao: 'identidade_autorizacao', identificado: !!(idAut && idAut.identificado) });
      const autorizadoPor = nomeParaCarimbo(idAut, event);
      const payload = {
        unidade_id: alvo.unidade_id, valor: String(valor), forma, categoria: alvo.categoria || 'parcela',
        aluno: alvo.aluno || null, descricao: alvo.descricao || null, idempotency_key: alvo.idemKey, ator_numero: senderNum, ator_papel: 'grupo',
        chat_id: chatId, grupo_jid: chatId, origem_message_id: alvo.origem, preview_message_id: alvo.previewId,
        cartao_modalidade: cartaoModalidade, cartao_parcelas: cartaoParcelas,
        enviado_por: alvo.enviadoPor || null, autorizado_por: autorizadoPor,
        responsavel_financeiro: alvo.responsavelFinanceiro || null,
      };
      // Vinculo estruturado: a RPC valida os dois contra a unidade e ignora o que nao
      // bater, entao mandar e seguro; o que nao pode e mandar id CHUTADO (ver derivarVinculo).
      const vinculo = derivarVinculo(alvo);
      // Fatura contestada pela equipe nao volta pela porta dos fundos: vincular
      // a fatura errada suja a carteira do aluno (pior que lancar sem vinculo).
      if (alvo.faturaContestada) { vinculo.fatura_id = null; vinculo.fonte = 'fatura_contestada'; }
      if (vinculo.aluno_id) payload.aluno_id = vinculo.aluno_id;
      if (vinculo.fatura_id) payload.fatura_id = vinculo.fatura_id;
      log({ acao: 'vinculo_lancamento', fonte: vinculo.fonte,
            aluno_id: vinculo.aluno_id || null, tem_fatura: !!vinculo.fatura_id });
      let v3Approval = null;
      try {
        v3Approval = await registrarApprovalPublicoV3({ event, alvo, decision: 'approved' });
      } catch (e) {
        await sendFn(chatId, '⚠️ Não lancei: não consegui registrar a aprovação do preview. Tenta de novo em instantes.');
        log({ acao: 'v3_approval_bloqueou_lancamento', erro: String(e && e.message) });
        return { acao: 'v3_approval_bloqueou_lancamento' };
      }
      if (v3LedgerAtivo) {
        if (!alvo.v3PreviewId || !alvo.v3PreviewHash || !v3Approval || !v3Approval.approval_id) {
          await sendFn(chatId, '⚠️ Não lancei: faltou vínculo V3 entre preview e aprovação. Reenvia o comprovante para gerar um preview novo.');
          log({ acao: 'v3_approval_bloqueou_lancamento', erro: 'vinculo_v3_incompleto' });
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
      catch (e) { await sendFn(chatId, '⚠️ Deu erro técnico ao lançar. Já registrei o problema; tenta de novo em instantes.'); log({ acao: 'erro_rpc', erro: String(e && e.message) }); return { acao: 'erro' }; }
      // remove a pendência alvo
      pendentes.set(chatId, arr.filter((p) => p !== alvo));
      if (r && r.ok && r.ja_lancado) { await sendFn(chatId, 'Esse comprovante já tinha sido lançado ✅.'); return { acao: 'ja_lancado' }; }
      if (r && r.ok) {
        const quem = (alvo.enviadoPor && alvo.enviadoPor !== autorizadoPor)
          ? `${autorizadoPor} autorizou · ${alvo.enviadoPor} enviou`
          : `${autorizadoPor} autorizou`;
        const verbo = ehSaida ? 'Lancei a saída' : 'Lancei';
        // Quem confere o caixa pelo grupo precisa saber DE QUEM foi o dinheiro —
        // foi conferindo assim que o Jhon pegou o lote incompleto de 01/09. A
        // confirmacao do lote ja listava nomes; a do unico dizia so "Parcela".
        const _de = alvo.aluno ? ` · ${alvo.aluno}`
          : (alvo.descricao ? ` · ${alvo.descricao}` : '');
        const confirmMessageId = await sendFn(chatId, `✅ ${verbo} no caixa da ${alvo.nome}: ${cap(payload.categoria)} — ${fmtBRL(r.valor)} (${r.forma})${_de}.\n_${quem} · registrei isso no responsável do lançamento._`);
        lembrarLancado(chatId, {
          confirmMessageId, previewId: alvo.previewId, movimentacao_id: r.movimentacao_id,
          unidade_id: alvo.unidade_id, nome: alvo.nome, valor: Number(r.valor || valor),
          forma: r.forma || forma, categoria: payload.categoria,
          cartaoModalidade, cartaoParcelas,
        });
        // F6: "antes de lancar veja se tem algum sem lancar" — a Sol e' quem ve.
        const _aindaAbertas = limparVelhos(chatId, agora);
        if (_aindaAbertas.length) {
          await sendFn(chatId, '📌 Ainda aguardando: ' + _aindaAbertas.map((p) => (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : '')).join(' · ') + '. Responde *pode* citando o card.');
        }
        log({ acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id, valor: r.valor });
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
      // devolve a pendência (pode reabrir caixa e tentar de novo)
      if (r && r.motivo === 'caixa_nao_aberto') { arr.push(alvo); pendentes.set(chatId, arr); }
      await sendFn(chatId, `⚠️ Não lancei: ${msg}.`);
      log({ acao: 'recusado', motivo: r && r.motivo });
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

  // A guarda de "nao vaza pro LLM" (bridge) precisa saber se a mensagem CITA um card
  // pendente, para so falar quando a mensagem plausivelmente e' pra Sol -- sem isto ela
  // interceptava QUALQUER mensagem nao reconhecida no grupo, inclusive assunto entre
  // humanos (caso Luciano/Barra 26/08: "Vou ver o que aconteceu ok?").
  function citaAlgumaPendencia(chatId, quotedMessageId, agora = Date.now()) {
    if (!quotedMessageId) return false;
    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId || p.origem === quotedMessageId || (Array.isArray(p.msgIds) && p.msgIds.includes(quotedMessageId)));
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
        n++;
      }
      log({ acao: 'reidratacao_pendencias', total: n });
      return { ok: true, total: n };
    } catch (e) {
      log({ acao: 'reidratacao_pendencias_erro', erro: String(e && e.message) });
      return { ok: false };
    }
  }

  // V4 SHADOW: o bridge chama SEM await depois do handle() — a decisao do
  // roteador vai para o log ao lado da acao do legado. Nunca escreve.
  async function observarRoteadorV4(event, acaoLegada) {
    try {
      if (process.env.SOL_CAIXA_V4_SHADOW === '0') return;
      if (!event || event.hasMedia || event._sintetico) return;
      const texto = bodyLimpo(event.body);
      if (!texto) return;
      const chatId = event.chatId;
      if (!grupos[chatId]) return;
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
        modelo: _v4Modelo(), texto: texto.slice(0, 300),
        ms: Date.now() - t0,
      });
    } catch (e) {
      log({ acao: 'roteador_v4_shadow_erro', erro: String(e && e.message) });
    }
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
      const contexto = arrP.slice(0, 3).map((p, i) => ({
        card: i + 1, valor: p.valor || null, forma: p.forma || null,
        categoria: p.categoria || null, aluno: p.aluno || null,
        competencia: p.competencia || null,
      }));
      let cls = null;
      try { cls = await classificarCorrecaoFn(event.body, contexto); } catch (e) { cls = null; }
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
      else if (cls.intencao === 'corrigir_valor' && cls.valor) sintetico = 'o valor é R$ ' + String(cls.valor).replace('.', ',');
      else if (cls.intencao === 'corrigir_forma' && cls.forma) sintetico = 'a forma é ' + cls.forma;
      // A gramatica de correcao exige um NOME para entrar no bloco. Reusamos o
      // nome que JA esta no card e anexamos a competencia — `_limparAlunoRotulado`
      // corta o sufixo "parcela ..." do nome, e a competencia e' colhida do mesmo
      // texto pelo passo 1. Nenhuma regex nova.
      else if (cls.intencao === 'corrigir_competencia' && cls.competencia) {
        const _alvoNome = (arrP.find((p) => p.aluno) || {}).aluno || null;
        // A competencia vem ANTES do rotulo: com `aluno: Nome parcela MM/AAAA` o
        // captador de nome engole o "parcela" (a classe de caracteres dele nao
        // aceita digito, entao para no "09" e deixa a palavra colada no nome).
        sintetico = _alvoNome
          ? ('parcela ' + cls.competencia + ' aluno: ' + _alvoNome)
          : null;
        if (!sintetico) {
          await sendFn(chatId, 'Entendi que a competência é ' + cls.competencia
            + ' — mas ainda não sei de qual aluno é. Me manda *aluno: Nome Completo* citando o card.');
          return { tratou: true, acao: 'fallback_llm_pede_aluno_p_competencia', intencao: cls.intencao };
        }
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

  // ⚠️ ehConversaSemComando no retorno conserta bug LATENTE: o bridge chama
  // _fh.ehConversaSemComando(body) desde 25/08, mas o handler nunca a expos —
  // o guard de "elogio nao leva nao-entendi" estava morto por undefined.
  return { handle, temPendencia, citaAlgumaPendencia, ehConversaSemComando,
    reidratarPendencias, tratarNaoEntendida, observarRoteadorV4, tratarAgentFirst, _pendentes: pendentes };
}

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = {
  parseBRMoney, extrairValor, extrairForma, detectarComprovante, casarPode,
  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr, _vendedorRotulado, _mesmaPessoa,
  _alunoRotulado, _limparAlunoRotulado, _semAlunoDeclarado, extrairCategoriaCorrecao,
  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3, _contestaFatura, rotearMensagemV4,
  montarEnvelopeV4, aplicarCorrecaoEnvelope, _v4CanarioLigado, resolverEnvelopeCaixaV1, valorConfereComTexto,
  casarNao, ehConversaSemComando,
  montarPreview, montarPreviewMultiAluno, fmtBRL, carregarEnv, lancarRecebimento, lancarRecebimentoLote, resolverMultiAlunoCaixaV1, resolverPagamentoItensV1, resolverCompostoAlunoCaixaV1, lancarSaidaCaixa, buscarLancamentoParaCorrecao,
  buscarMovimentosCaixa, corrigirMovimentoCaixa, estornarMovimentoCaixa, registrarPreviewV3, registrarApprovalV3, criarHandlerFinanceiro,
  confirmacaoLimpa, classificarMidia, bodyLimpo, nomeDoAtor, buscarResponsavel, mesmaPessoa, pagamentoMultiplo,
  extrairDivisaoPagamento, extrairSomaAditivaPagamento, extrairAdicionalPagamento, detectarLojinhaProduto, detectarContextoMultiAluno, validarIntencaoMultiAluno,
  identificarPessoa, nomeParaCarimbo, ehPerguntaDeCaixa, resumoDoDia, montarResumoCaixa,
  extrairCartao, extrairValorOcr, extrairPagador, identificarPorPagador, nomePlausivel, _alunoRotulado, _alunoFromCaption, _alunoSuspeito,
  _cursoRotulado, _confirmacaoManualFatura,
  derivarVinculo, casarParcelaCanonica, linhasDaFatura, categoriaDaFatura, descricaoDaFatura, jaLancadoHoje,
  periodoQuitacao, extrairPeriodoMeses,
  extrairCompetenciaTexto, compostoDeFaturas, buscarCompostoFaturasMes, descricaoDoComposto,
  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, extrairItensNomeValor, casarParcela,
  guardaFinanceiraV4,
  ocrLocal,
  extrairCorrecaoForma, extrairLancamentoCitado, extrairComandoMovimento,
  categoriaEhSaida,
};
