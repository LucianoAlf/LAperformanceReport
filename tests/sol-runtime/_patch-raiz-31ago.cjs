#!/usr/bin/env node
// Raizes de 31/08 — Barra (capotraste/homonimo) + CG (banda Starline/Pareidolia).
//
// R-a  ROTULO DE ALUNO VENCE O REMETENTE HOMONIMO. "Venda capotraste para o
//      aluno Arthur Vargas" com remetente Arthur (ADM): a guarda V1 descartou o
//      aluno DECLARADO (aluno_descartado_nao_e_aluno / e_quem_enviou). A
//      heuristica existe para nome inferido; contra declaracao, mente.
//
// R-b  O EXTRATOR DE NOME TIRA O LIXO VERBAL DO INICIO. "Aluno foi Arthur
//      Vargas Caldas" virou nome com "foi" e "Nome do aluno Starline" virou
//      nome com o rotulo inteiro. O prefixo derruba a guarda de nome-diverge
//      (rejeita a canonica que casou a pessoa CERTA: ditado "foi Arthur..."
//      x casado "Arthur..."), suja a descricao e mata o vinculo.
//      + rotulo com dois-pontos ("aluno: Starline") aceita nome de 1 token —
//      e' ditado deliberado (banda/mononimo).
//
// R-c  GRAMATICA SEM-ALUNO/BANDA. "Sol,e de Banda, nome Starline, nao tem
//      aluno especifico" citando o card levou "Nao entendi essa". Receita de
//      banda/evento NAO tem aluno; a gramatica limpa a exigencia, guarda a
//      entidade e vira venda. + correcao de categoria ditada sem "pode".
//
// R-d  "PODE, MAS <CORRECAO DE CATEGORIA>". "pode , mas coloca a categoria
//      como venda" caiu em SILENCIO (result nada) e o pode seco seguinte
//      lancou "outro". A correcao viaja com o pode: aplica, re-registra o
//      preview V3 (o validador exige categoria identica — categoria_divergente_v3)
//      e lanca.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-raiz-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R-b1: _limparAlunoRotulado tira lixo verbal + minTokens ──────────────────
trocar(
  `function _limparAlunoRotulado(nome) {
  let n = String(nome || '').split(/[\\n,;|]/)[0];`,
  `function _limparAlunoRotulado(nome, opts) {
  const minTokens = (opts && opts.minTokens) || 2;
  let n = String(nome || '').split(/[\\n,;|]/)[0];
  // Lixo verbal que a equipe cola antes do nome: "Aluno foi Arthur Vargas
  // Caldas" virou nome com "foi" (Barra 31/08) e "Nome do aluno Starline"
  // virou nome com o rotulo inteiro (CG 31/08). O prefixo derruba a guarda de
  // nome-diverge, que rejeita a canonica CERTA por causa do lixo.
  for (let i = 0; i < 5; i++) {
    const semLixo = n
      .replace(/^\\s*(?:foi|foram|será|sera|eh|é|e|o|a|d[oa]|nome|alun[oa]s?)\\s+/i, '')
      .replace(/^\\s*[:\\-]\\s*/, '');
    if (semLixo === n) break;
    n = semLixo;
  }`,
  'R-b1 _limparAlunoRotulado tira lixo verbal');

trocar(
  `  return (nomePlausivel(n) && toks.length >= 2) ? n : null;
}`,
  `  return (nomePlausivel(n) && toks.length >= minTokens) ? n : null;
}`,
  'R-b1 minTokens no retorno');

// ── R-b2: rotulo com dois-pontos aceita 1 token; "foi" vira separador ────────
trocar(
  `  const m = t.match(/\\balun[oa]s?\\s*(?:(?:[:\\-])\\s*|(?:e|é)\\s+)?([A-Za-z\\u00c0-\\u00ff][A-Za-z\\u00c0-\\u00ff.'\\s]{3,80})/i);
  if (!m) return null;
  return _limparAlunoRotulado(m[1]);`,
  `  const m = t.match(/\\balun[oa]s?\\s*(?:([:\\-])\\s*|(?:e|é|foi)\\s+)?([A-Za-z\\u00c0-\\u00ff][A-Za-z\\u00c0-\\u00ff.'\\s]{2,80})/i);
  if (!m) return null;
  // "aluno: Starline" — rotulo com dois-pontos e' ditado deliberado: aceita
  // nome de um token (banda/mononimo). Sem o dois-pontos, a regra dos 2 fica.
  return _limparAlunoRotulado(m[2], { minTokens: m[1] ? 1 : 2 });`,
  'R-b2 _alunoRotulado separador');

// ── R-c helper: _semAlunoDeclarado (antes de _nomeHumanoTardio) ──────────────
trocar(
  `function _nomeHumanoTardio(body) {`,
  `// "nao tem aluno especifico" / "sem aluno" / "e' de banda X": receita de banda
// ou evento — lancamento sem aluno EXISTE, e a Sol nao tinha como ouvir isso
// (CG 31/08: a frase citando o card levou "Nao entendi essa", e o lancamento
// saiu com ALUNO "Nome do aluno Starline").
function _semAlunoDeclarado(body) {
  const raw = bodyLimpo(body);
  if (!raw) return null;
  const n = _normConf(raw);
  const nega = /(nao\\s+(?:tem|ha|existe)\\s+alun[oa]|sem\\s+alun[oa](?:\\s+especifico)?\\b|nao\\s+e\\s+(?:de\\s+)?alun[oa]\\b|nenhum\\s+alun[oa]\\b)/.test(n);
  const banda = /\\be\\s+d[ea]\\s+banda\\b/.test(n) || /\\bbanda\\s*[:\\-]/.test(n) || (/\\bbanda\\b/.test(n) && nega);
  if (!nega && !banda) return null;
  let entidade = null;
  let m = raw.match(/\\bbanda\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9.'\\s-]{1,40})/i);
  if (!m) m = raw.match(/\\bnome\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9.'\\s-]{1,40})/i);
  if (m) {
    let e = String(m[1] || '').split(/[\\n,;|]/)[0]
      .replace(/\\bn[aã]o\\b[\\s\\S]*$/i, '').replace(/\\s+/g, ' ').trim();
    if (/^(nome|do|da|especifico|específico|especifica|específica)$/i.test(e)) e = '';
    if (e) entidade = (banda ? 'Banda ' : '') + tituloNome(e);
  }
  return { entidade };
}

function _nomeHumanoTardio(body) {`,
  'R-c helper _semAlunoDeclarado');

// ── R-a: aluno declarado na legenda vence a heuristica de remetente ──────────
trocar(
  `        const _vendedor = _vendedorRotulado(legendaEfetiva);
        const _remetente = idEnviou && idEnviou.identificado ? idEnviou.nome : null;
        const _porQue = (aluno && _vendedor && _mesmaPessoa(aluno, _vendedor)) ? 'rotulo_de_venda'
          : (aluno && _remetente && _mesmaPessoa(aluno, _remetente)) ? 'e_quem_enviou'
          : null;`,
  `        const _vendedor = _vendedorRotulado(legendaEfetiva);
        const _remetente = idEnviou && idEnviou.identificado ? idEnviou.nome : null;
        // "para o aluno Arthur Vargas" com remetente Arthur (ADM homonimo, Barra
        // 31/08): rotulo humano explicito de ALUNO vence a heuristica de
        // remetente. Ela existe para nome INFERIDO; contra declaracao, mente.
        const _alunoDeclarado = _alunoRotulado(legendaEfetiva);
        const _declarado = !!(aluno && _alunoDeclarado && _mesmaPessoa(_alunoDeclarado, aluno));
        const _porQue = (aluno && _vendedor && _mesmaPessoa(aluno, _vendedor)) ? 'rotulo_de_venda'
          : (aluno && !_declarado && _remetente && _mesmaPessoa(aluno, _remetente)) ? 'e_quem_enviou'
          : null;`,
  'R-a rotulo de aluno vence e_quem_enviou');

// ── R-c: bloco sem-aluno + correcao de categoria ditada (antes do nomeTardio) ─
trocar(
  `        const nomeTardio = _nomeHumanoTardio(txt);`,
  `        // ── "e' de banda / nao tem aluno especifico": receita sem aluno ─────
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
            let textoSA = 'Entendi — sem aluno específico:\\n\\n' + montarPreview({
              unidadeNome: alvoSA.nome, valor: alvoSA.valor, forma: alvoSA.forma,
              categoria: alvoSA.categoria, aluno: null, competencia: alvoSA.competencia,
              parcela: null, confiancaBaixa: false, responsavelFinanceiro: null,
              formaIncerta: alvoSA.formaIncerta, cartaoModalidade: alvoSA.cartaoModalidade,
              cartaoParcelas: alvoSA.cartaoParcelas, multiplas: false,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: alvoSA.quitacao, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false, semAlunoDeclarado: true, entidade: alvoSA.entidade,
            });
            if (dryRun) textoSA += '\\n\\n_(modo teste — nada será gravado no caixa)_';
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
            let textoCD = 'Troquei a categoria:\\n\\n' + montarPreview({
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
            if (dryRun) textoCD += '\\n\\n_(modo teste — nada será gravado no caixa)_';
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
        const nomeTardio = _nomeHumanoTardio(txt);`,
  'R-c bloco sem-aluno + categoria ditada');

// ── montarPreview: assinatura + render sem-aluno ─────────────────────────────
trocar(
  `function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha }) {`,
  `function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha, semAlunoDeclarado, entidade }) {`,
  'montarPreview assinatura semAluno/entidade');

trocar(
  `  if (!ehSaidaPreview && _lojinhaSemComprador) {`,
  `  if (!ehSaidaPreview && semAlunoDeclarado) {
    // Receita de banda/evento nao tem aluno — declarado pelo humano (CG 31/08).
    blocos.push(['*ALUNO*', (entidade ? entidade + ' — ' : '') + 'sem aluno específico _(banda/evento)_ ✓']);
  } else if (!ehSaidaPreview && _lojinhaSemComprador) {`,
  'montarPreview render sem-aluno');

// ── R-d1: casarPode entende "pode, mas <correcao de categoria>" ──────────────
trocar(
  `function casarPode(text, { respondeuPreview = false } = {}) {
  const t = String(text || '').trim();
  if (!t) return { pode: false };
  if (/\\bpode\\s+ser\\b/i.test(t)) return { pode: false };
  const ok = respondeuPreview`,
  `const _CATEGORIAS_DITAVEIS = '(venda|lojinha|passaporte|matricula|mensalidade|parcela|evento|aluguel|doacao|outro)';
// "coloca a categoria como venda" / "categoria: venda" — correcao ditada.
function extrairCategoriaCorrecao(text) {
  const n = _normConf(text).replace(/[^a-z0-9\\s:]/g, ' ').replace(/\\s+/g, ' ');
  let m = n.match(new RegExp('\\\\bcategoria\\\\b\\\\s*(?:como|pra|para|em|de|eh|e|:)?\\\\s*' + _CATEGORIAS_DITAVEIS + '\\\\b'));
  if (m) return m[1];
  m = n.match(new RegExp('\\\\b(?:coloca|poe|muda|troca|marca|deixa|lanca)\\\\b[a-z\\\\s]{0,20}\\\\bcomo\\\\s+' + _CATEGORIAS_DITAVEIS + '\\\\b'));
  return m ? m[1] : null;
}

function casarPode(text, { respondeuPreview = false } = {}) {
  let t = String(text || '').trim();
  if (!t) return { pode: false };
  if (/\\bpode\\s+ser\\b/i.test(t)) return { pode: false };
  // "pode, mas coloca a categoria como venda" (CG 31/08): aprovacao condicional
  // com correcao inline caia em SILENCIO — nem lancava, nem respondia — e o
  // "pode" seco seguinte lancava com a categoria errada. A correcao viaja
  // junto: extrai a categoria, corta a clausula e avalia o resto como
  // confirmacao normal.
  let categoria = null;
  if (/\\bpode\\b/i.test(t)) {
    categoria = extrairCategoriaCorrecao(t);
    if (categoria) {
      const corte = t.search(/[,;]?\\s*\\b(mas|por[eé]m|s[oó]\\s+que|coloca|p[oõ]e|muda|troca|marca|deixa|lan[cç]a|categoria)\\b/i);
      if (corte > 0) t = t.slice(0, corte).replace(/[\\s,;.:-]+$/, '');
      else categoria = null;
    }
  }
  const ok = respondeuPreview`,
  'R-d1 casarPode extrai categoria');

trocar(
  `  return {
    pode: true,
    valor: extrairValor(t, { allowBare: true }),`,
  `  return {
    pode: true,
    categoria,
    valor: extrairValor(t, { allowBare: true }),`,
  'R-d1 casarPode devolve categoria');

// ── R-d2: aprovacao aplica a categoria e re-registra o preview V3 ────────────
trocar(
  `      if (!valor) { await sendFn(chatId, 'Preciso do valor pra lançar. Manda *pode, R$ X*.'); return { acao: 'sem_valor' }; }`,
  `      if (!valor) { await sendFn(chatId, 'Preciso do valor pra lançar. Manda *pode, R$ X*.'); return { acao: 'sem_valor' }; }

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
      }`,
  'R-d2 pode aplica categoria + re-registro V3');

// ── vocabulario de evento no _alunoSuspeito ──────────────────────────────────
trocar(
  `  return /\\b(restante|alun[oa]|passaporte|parcela|mensalidade|pagamento|comprovante)\\b/i.test(n)`,
  `  return /\\b(restante|alun[oa]|passaporte|parcela|mensalidade|pagamento|comprovante|banda|evento|fest(?:a|ival)?|rock|show|grava[cç][aã]o|gravar)\\b/i.test(n)`,
  'vocabulario de evento no _alunoSuspeito');

// ── exports ──────────────────────────────────────────────────────────────────
trocar(
  `  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr, _vendedorRotulado, _mesmaPessoa,`,
  `  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr, _vendedorRotulado, _mesmaPessoa,
  _alunoRotulado, _limparAlunoRotulado, _semAlunoDeclarado, extrairCategoriaCorrecao,`,
  'exports novos helpers');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
