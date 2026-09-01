#!/usr/bin/env node
// Caso Jhon/CG 01/09 18:28 — a legenda tinha a divisao COMPLETA no formato que
// a propria Sol ensina ("Davi Guilherme - R$ 1.290,00 / Thuanny De Souza -
// R$ 432,00 / LA CG - R$1.722,00") e mesmo assim caiu na parede "Manda cada
// aluno com seu valor": o interpretarMultiAluno (LLM, timeout 30s) estourou o
// tempo, multiRaw veio nulo e o intent nasceu 'intencao_ausente'. Dois minutos
// depois, "Um instante" (conversa!) re-disparou a reinterpretacao da legenda
// guardada e a MESMA LLM respondeu em 20s — roleta de latencia num texto que e'
// 100% parseavel por maquina.
//
// D1  FORMATO ENSINADO E' PROTOCOLO, NAO CONVERSA: extrairItensNomeValor()
//     parseia as linhas "Nome — R$ valor" deterministicamente (linha da unidade
//     vira o TOTAL declarado, nao item). Com 2+ itens, o LLM nem e' chamado —
//     nos DOIS call sites (midia e completacao). Texto livre segue no LLM.
// D1b _valorNoTextoHumano conferia contra textoFonte, que CARREGA O OCR — um
//     numero que so existe no recibo podia marcar item como "declarado pelo
//     humano" e lancar sem vinculo de fatura. Agora confere contra o texto
//     HUMANO (legenda/ditado), com fallback no antigo p/ pendencia pre-patch.
// D1c colocarEmRevisao guarda valor (intent.total) e multiTextoHumano — sem
//     isso a completacao deterministica nao teria total p/ fechar a soma.
//
// D2  PENDENCIA MULTI FORA DO NOME-TARDIO: as 18:31 o comentario "ai Jhon ta
//     certo esse" (Luciano falando COM O JHON) virou "nome de aluno" e mutilou
//     o card do lote (preview_aluno_corrigido aluno="ai Jhon ta certo esse").
//     Lote tem .itens, nao "um aluno" — manual_review_multi_student e
//     lancar_recebimento_lote saem da lista de alvos.
//
// D3  TOKEN DE COMENTARIO NAO E' NOME: nenhum nome de pessoa carrega "ta",
//     "certo", "esse", "ai"... — gate de tokens no caminho do nome LIVRE
//     (rotulo explicito "aluno: X" continua passando direto). E "um instante"
//     entra na familia de conversa ("um momento" ja estava).
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-multi-deterministico-01set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

// ── D1: extrator deterministico do formato ensinado ──────────────────────────
trocar(
  '\nconst PRODUTO_LOJINHA_RE',
  [
    '',
    '// O formato que a Sol ENSINA ("Nome — R$ valor" por linha) e\' protocolo, nao',
    '// conversa: parseavel sem LLM. Linha da unidade ("LA CG - R$1.722,00") vira o',
    '// TOTAL declarado. Em 01/09 18:28 a divisao completa do Jhon caiu na parede',
    '// porque o interpretador LLM estourou 30s — latencia decidindo dinheiro.',
    'function extrairItensNomeValor(texto) {',
    '  const unidadeRe = new RegExp(_UNIDADE_TAG.source, \'i\');',
    '  const itens = []; let totalDeclarado = null;',
    '  for (const l of String(texto || \'\').split(/\\n/)) {',
    '    const m = l.match(/^\\s*([a-z\\u00e0-\\u00ffA-Z\\u00c0-\\u00ff]{2,}(?:\\s+[a-z\\u00e0-\\u00ffA-Z\\u00c0-\\u00ff]{2,}){1,4})\\s*[-\\u2013\\u2014]\\s*(r?\\$?\\s*\\d[\\d.,]*)\\s*$/i);',
    '    if (!m) continue;',
    '    const nome = m[1].replace(/\\s+/g, \' \').trim();',
    '    const v = parseBRMoney(m[2]);',
    '    if (!v || v <= 0) continue;',
    '    if (unidadeRe.test(nome)) { totalDeclarado = v; continue; }',
    '    if (!nomePlausivel(nome)) continue;',
    '    itens.push({ aluno_nome: nome, valor: v });',
    '  }',
    '  return { itens, totalDeclarado };',
    '}',
    '',
    'const PRODUTO_LOJINHA_RE',
  ].join('\n'),
  'D1 extrator deterministico');

// ── D1: caminho da MIDIA usa o extrator antes do LLM ─────────────────────────
trocar(
  [
    '      if (detectarContextoMultiAluno(legendaEfetiva)) {',
    '        let multiRaw = null;',
    '        try { multiRaw = await interpretarMultiFn(textoClassificacao); }',
    '        catch (e) { log({ acao: \'interpretar_multi_aluno_erro\', chatId, erro: String(e && e.message) }); }',
    '        const _totalMulti = Math.max(Number(valor) || 0, Number(valorMaiorNaLegenda) || 0, Number(extrairValorOcr(ocrText)) || 0) || valor;',
    '        const intentMulti = validarIntencaoMultiAluno(multiRaw, _totalMulti, { forma, categoria, competencia });',
    '        return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: textoClassificacao, intent: intentMulti, agora, origemMessageId: event.messageId });',
    '      }',
  ].join('\n'),
  [
    '      if (detectarContextoMultiAluno(legendaEfetiva)) {',
    '        // Divisao no formato ensinado = parse deterministico; LLM so p/ texto livre.',
    '        let multiRaw = null;',
    '        const _det = extrairItensNomeValor(legendaEfetiva);',
    '        if (_det.itens.length >= 2) {',
    '          multiRaw = { tipo_recebimento: \'multi_aluno\', itens: _det.itens, valor_total: _det.totalDeclarado || undefined };',
    '          log({ acao: \'multi_itens_deterministicos\', chatId, itens: _det.itens.length, total_declarado: _det.totalDeclarado || null });',
    '        } else {',
    '          try { multiRaw = await interpretarMultiFn(textoClassificacao); }',
    '          catch (e) { log({ acao: \'interpretar_multi_aluno_erro\', chatId, erro: String(e && e.message) }); }',
    '        }',
    '        const _totalMulti = Math.max(Number(valor) || 0, Number(valorMaiorNaLegenda) || 0, Number(extrairValorOcr(ocrText)) || 0) || valor;',
    '        const intentMulti = validarIntencaoMultiAluno(multiRaw, _totalMulti, { forma, categoria, competencia });',
    '        if (!intentMulti.ok) {',
    '          // A revisao manual guarda o que a midia JA sabe (total/forma/categoria):',
    '          // sem isso a completacao deterministica nasce sem categoria e devolve',
    '          // itens_incompletos — era a LLM da releitura que repunha esses campos.',
    '          if (intentMulti.total == null) intentMulti.total = _totalMulti || null;',
    '          if (!intentMulti.categoria) intentMulti.categoria = categoria || null;',
    '          if (!intentMulti.forma) intentMulti.forma = forma || null;',
    '        }',
    '        return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte: textoClassificacao, textoHumano: legendaEfetiva, intent: intentMulti, agora, origemMessageId: event.messageId });',
    '      }',
  ].join('\n'),
  'D1 midia deterministica');

// ── D1: assinatura + revisao guardam o texto humano e o total ────────────────
trocar(
  '  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, intent, agora, origemMessageId }) {',
  '  async function abrirFluxoMultiAluno({ event, grupo, textoFonte, textoHumano, intent, agora, origemMessageId }) {',
  'D1 assinatura textoHumano');

trocar(
  '        multiTexto: textoFonte, valor: intent && intent.valor_total || extra.valor || null,',
  '        multiTexto: textoFonte, multiTextoHumano: textoHumano || null,\n        valor: (intent && (intent.valor_total || intent.total)) || extra.valor || null,',
  'D1c revisao guarda humano e total');

// ── D1b: "declarado pelo humano" confere contra texto HUMANO, nao OCR ────────
trocar(
  [
    '    const _valorNoTextoHumano = (v) => {',
    '      const n = Number(v);',
    '      if (!n || !textoFonte) return false;',
  ].join('\n'),
  [
    '    const _valorNoTextoHumano = (v) => {',
    '      const n = Number(v);',
    '      // textoFonte carrega o OCR — numero que so existe no RECIBO nao e\'',
    '      // declaracao humana (furaria o fail-closed do vinculo de fatura).',
    '      const _baseHumana = textoHumano || textoFonte;',
    '      if (!n || !_baseHumana) return false;',
  ].join('\n'),
  'D1b base humana no declarado (1/2)');

trocar(
  [
    '      return String(textoFonte).includes(cents) || String(textoFonte).includes(milhar)',
    '        || new RegExp(\'(^|[^0-9,])\' + inteiro + \'([^0-9,]|$)\').test(String(textoFonte));',
  ].join('\n'),
  [
    '      return String(_baseHumana).includes(cents) || String(_baseHumana).includes(milhar)',
    '        || new RegExp(\'(^|[^0-9,])\' + inteiro + \'([^0-9,]|$)\').test(String(_baseHumana));',
  ].join('\n'),
  'D1b base humana no declarado (2/2)');

// ── D1: completacao deterministica + conversa nao dispara reinterpretacao ────
trocar(
  [
    '        if (alvoManual) {',
    '          let multiRaw = null;',
    '          const textoFonte = `${alvoManual.multiTexto || \'\'}\\n${txt}`.trim();',
    '          try { multiRaw = await interpretarMultiFn(textoFonte); }',
    '          catch (e) { log({ acao: \'interpretar_multi_aluno_correcao_erro\', chatId, erro: String(e && e.message) }); }',
  ].join('\n'),
  [
    '        if (alvoManual && !ehConversaSemComando(txt)) {',
    '          let multiRaw = null;',
    '          const textoFonte = `${alvoManual.multiTexto || \'\'}\\n${txt}`.trim();',
    '          const _textoHumanoC = `${alvoManual.multiTextoHumano || \'\'}\\n${txt}`.trim();',
    '          const _detC = extrairItensNomeValor(_textoHumanoC);',
    '          if (_detC.itens.length >= 2) {',
    '            multiRaw = { tipo_recebimento: \'multi_aluno\', itens: _detC.itens, valor_total: _detC.totalDeclarado || undefined };',
    '            log({ acao: \'multi_itens_deterministicos\', chatId, itens: _detC.itens.length, origem: \'correcao\' });',
    '          } else {',
    '            try { multiRaw = await interpretarMultiFn(textoFonte); }',
    '            catch (e) { log({ acao: \'interpretar_multi_aluno_correcao_erro\', chatId, erro: String(e && e.message) }); }',
    '          }',
  ].join('\n'),
  'D1 completacao deterministica');

trocar(
  '          return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte, intent: intentMulti, agora, origemMessageId: alvoManual.origem });',
  '          return abrirFluxoMultiAluno({ event, grupo: grp, textoFonte, textoHumano: _textoHumanoC, intent: intentMulti, agora, origemMessageId: alvoManual.origem });',
  'D1 completacao passa texto humano');

// ── D2: pendencia multi fora do alvo de nome-tardio ──────────────────────────
trocar(
  [
    '        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)',
    '          && (',
  ].join('\n'),
  [
    '        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)',
    '          // Pendencia MULTI tem .itens, nao "um aluno": comentario humano ("ai',
    '          // Jhon ta certo esse", 01/09 18:31) virou nome e mutilou o card do lote.',
    '          && x.tipoOperacao !== \'manual_review_multi_student\'',
    '          && x.tipoOperacao !== \'lancar_recebimento_lote\'',
    '          && (',
  ].join('\n'),
  'D2 multi fora do nome-tardio');

// ── D3: token de comentario mata o nome LIVRE ────────────────────────────────
trocar(
  [
    '  const toks = t.split(\' \').filter(Boolean);',
    '  if (toks.length < 2 || toks.length > 6) return null;',
    '  return _limparAlunoRotulado(toks.join(\' \'));',
  ].join('\n'),
  [
    '  const toks = t.split(\' \').filter(Boolean);',
    '  if (toks.length < 2 || toks.length > 6) return null;',
    '  // Comentario nao e\' nome: nenhum nome de PESSOA carrega estes tokens.',
    '  // "ai Jhon ta certo esse" (01/09) sobreviveu a limpeza e virou ALUNO no card.',
    '  const _TOK_NAO_NOME = /^(ai|a[i\\u00ed]|ah|oh|opa|eita|po|p[o\\u00f4]|ta|t[a\\u00e1]|certo|certa|errado|errada|esse|essa|isso|aqui|ali|la|l[a\\u00e1]|sim|nao|n[a\\u00e3]o|ok|beleza|valeu|obrigad[oa]|gente|pessoal|galera|ne|n[e\\u00e9]|mesmo|hein|uai|oi|ola|ol[a\\u00e1]|eai|falou|cade|cad[e\\u00ea])$/i;',
    '  if (toks.some((x) => _TOK_NAO_NOME.test(x))) return null;',
    '  return _limparAlunoRotulado(toks.join(\' \'));',
  ].join('\n'),
  'D3 gate de tokens no nome livre');

// ── D3: "um instante" e' conversa (familia do "um momento") ──────────────────
trocar(
  '|um momento|so um minuto)',
  '|um momento|um instante|so um minuto)',
  'D3 um instante e conversa');

// ── D4: o retorno da RPC e' a verdade sobre o que foi GRAVADO ────────────────
// Em 01/09 o snapshot devolveu 1 de 2 itens, a RPC gravou so a Thuanny (432 de
// 1.722) e o runtime anunciou "nenhum item foi lancado parcialmente" contando o
// PROPRIO payload. O banco agora tem invariante (RAISE em lote parcial); isto
// e' a segunda linha: divergencia nunca mais passa como sucesso.
trocar(
  [
    '        if (lote && lote.ok) {',
    '          const linhas = (lote.movimentacoes || []).map((m) => `\u2022 ${m.aluno_nome}: ${fmtBRL(m.valor)}`).join(\'\\n\');',
  ].join('\n'),
  [
    '        if (lote && lote.ok) {',
    '          const movsLote = lote.movimentacoes || [];',
    '          if (movsLote.length !== alvo.itens.length) {',
    '            await sendFn(chatId, `\ud83d\udea8 ATEN\u00c7\u00c3O: o banco confirmou ${movsLote.length} de ${alvo.itens.length} itens do lote. N\u00c3O confia neste lan\u00e7amento \u2014 confere o caixa antes de fechar e chama o suporte.`);',
    '            log({ acao: \'lote_multi_incompleto\', chatId, lote_id: lote.lote_id, esperados: alvo.itens.length, gravados: movsLote.length });',
    '            return { acao: \'lote_multi_incompleto\', lote_id: lote.lote_id };',
    '          }',
    '          const linhas = movsLote.map((m) => `\u2022 ${m.aluno_nome}: ${fmtBRL(m.valor)}`).join(\'\\n\');',
  ].join('\n'),
  'D4 retorno da RPC e a verdade');

// ── D1: exporta o extrator p/ teste ──────────────────────────────────────────
trocar(
  '  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, casarParcela,',
  '  extrairComprovanteVisao, interpretarComprovante, interpretarMultiAluno, extrairItensNomeValor, casarParcela,',
  'D1 export do extrator');

fs.writeFileSync(alvo, src, 'utf8');
console.log('\npatch aplicado: ' + antes + ' -> ' + src.length + ' bytes (+' + (src.length - antes) + ')');
