#!/usr/bin/env node
// Incidente 31/08 16:12 (CG) + as duas pendencias aprovadas pelo Luciano.
//
// R-e  PROSA NAO E' DITADO. O resumo da auditoria colado no grupo virou "Saida
//      de caixa R$633 dinheiro": "vale confirmar" casou o SAIDA_TERMO_RE, o
//      primeiro R$ da prosa virou valor e "dinheiro de evento" virou forma.
//      Texto puro so vira lancamento se PARECE ditado (curto, UM valor, sem
//      vocabulario de auditoria/relato); "vale" so como substantivo.
//
// R-f  "SIM" NO MEIO DE FRASE NAO APROVA DINHEIRO. "Foi de propósito sim,
//      Luciano" (resposta a uma pergunta humana) aprovou a saida: o token
//      frouxo aceitava "sim"/"ok" em QUALQUER posicao quando a mensagem citava
//      a pendencia. Agora exige mensagem curta E afirmacao que ABRE a mensagem.
//
// A3   REIDRATACAO: pendencia vivia so na memoria do bridge; restart engolia
//      preview aberto (caso Arthur 17:58). O ledger V3 ja guarda a pendencia
//      inteira (preview_json.pending) — reidratar no boot.
//
// LLM  FALLBACK DE DIALOGO (OK do Luciano): mensagem nao entendida com
//      pendencia aberta vai a um classificador de saida RESTRITA; a intencao
//      vira frase CANONICA e re-passa pelo handle(). Nunca escreve, nunca
//      aprova ("aprovar" => pede *pode* explicito). Falha => "Nao entendi".
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-dialogo-e-reidratacao-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ⚠️ `` dentro de template string vira BACKSPACE (0x08), nao regex word
// boundary — ja corrompeu o arquivo vivo antes. Construir a barra a parte.
const BS = String.fromCharCode(92);

// ── R-e1: "vale" so como substantivo com complemento ─────────────────────────
trocar(
  `const SAIDA_TERMO_RE = /\\b(despesas?|desembolso|reembolso|sa[ií]das?|retirad[ao]s?|retirei|compra(?:mos|ram)?|comprei|paguei|pagamos|gastei|gastos?|vale)\\b/i;`,
  `// ⚠️ "vale" so como substantivo com complemento ("vale de R$50", "vale pro
// instrutor") — "vale confirmar" e' verbo, e foi o que transformou um RELATO
// em saida de R$633 (31/08).
const SAIDA_TERMO_RE = /\\b(?:despesas?|desembolso|reembolso|sa[ií]das?|retirad[ao]s?|retirei|compra(?:mos|ram)?|comprei|paguei|pagamos|gastei|gastos?)\\b|\\bvale\\s+(?:de|do|da|pr[ao])\\b|\\bvale\\s+(?:r\\$\\s*)?\\d/i;`,
  'R-e1 vale substantivo');

// ── R-e2: helper _ehDitadoDeCaixa ────────────────────────────────────────────
trocar(
  `function _saidaExplicitaFromCaption(body) {`,
  `// Prosa/relato NAO e' ditado de lancamento (31/08: o resumo da auditoria
// colado no grupo virou "Saida de caixa R$633 dinheiro"). Ditado real e'
// curto, tem UM valor e nao fala de auditoria/exclusao/relatorio.
function _ehDitadoDeCaixa(texto) {
  const t = String(texto || '');
  if (!t) return false;
  if (t.length > 220) return false;
  if ((t.match(/r\\$\\s*[\\d.,]+/gi) || []).length > 1) return false;
  if (/\\b(apagad\\w*|exclu[ií]\\w*|audit\\w*|rastro|trilha|deploy|restart|migration|corrigid\\w*|documentad\\w*|relat[oó]rio|resumo)\\b/i.test(t)) return false;
  return true;
}

function _saidaExplicitaFromCaption(body) {`,
  'R-e2 helper _ehDitadoDeCaixa');

// ── R-e3: gate no bloco de saida por texto ───────────────────────────────────
trocar(
  `      const _pendAbertaTexto = limparVelhos(chatId, Date.now()).length > 0;
      const categoriaTexto = (_pendAbertaTexto ? null : _saidaExplicitaFromCaption(texto))
        || _categoriaExplicitaFromCaption(texto);`,
  `      const _pendAbertaTexto = limparVelhos(chatId, Date.now()).length > 0;
      // 31/08: prosa com "vale", "R\$633" e "dinheiro" espalhados virou card de
      // saida. Texto puro so vira lancamento se PARECE ditado.
      const _ehDitado = _ehDitadoDeCaixa(texto);
      const categoriaTexto = !_ehDitado ? null
        : ((_pendAbertaTexto ? null : _saidaExplicitaFromCaption(texto))
        || _categoriaExplicitaFromCaption(texto));
      if (!_ehDitado && !_pendAbertaTexto && _saidaExplicitaFromCaption(texto)) {
        log({ acao: 'saida_texto_ignorada_prosa', chatId, len: texto.length });
      }`,
  'R-e3 gate de prosa');

// ── R-e4: comando de movimento (corrigir/estornar/excluir) tambem tem gate ──
// A prosa de 31/08 casou "apagados"/"excluir" + R$633 e abriu preview de
// correcao/estorno de um movimento real. Nao da para vetar "exclui/apaga"
// (e' o comando legitimo) nem 2 valores ("corrige de X pra Y" e' legitimo) —
// o discriminador e' TAMANHO: comando de movimento e' curto.
trocar(
  `      const cmdMov = extrairComandoMovimento(event.body);`,
  `      let cmdMov = extrairComandoMovimento(event.body);
      if (cmdMov && bodyLimpo(event.body).length > 250) {
        log({ acao: 'comando_movimento_ignorado_prosa', chatId, len: bodyLimpo(event.body).length });
        cmdMov = null;
      }`,
  'R-e4 gate de prosa no comando de movimento');

// ── R-e5: correcao de forma tambem e' ditado curto ───────────────────────────
// A prosa de 31/08 tinha "dinheiro de evento" + "se foi intencional" — casou
// "Sol, foi dinheiro" e respondeu "preciso saber qual lancamento".
trocar(
  `        const corrForma = extrairCorrecaoForma(txt);
        if (corrForma) {`,
  `        let corrForma = extrairCorrecaoForma(txt);
        if (corrForma && txt.length > 250) {
          log({ acao: 'correcao_forma_ignorada_prosa', chatId, len: txt.length });
          corrForma = null;
        }
        if (corrForma) {`,
  'R-e5 gate de prosa na correcao de forma');

// ── R-f: token frouxo exige mensagem curta E afirmacao que abre a mensagem ───
trocar(
  `  const ok = respondeuPreview
    ? (confirmacaoLimpa(t, TOK_LANCAR_REPLY) || new RegExp('(^|\\\\s)' + TOK_LANCAR_REPLY + '(\\\\s|$|[,.!])', 'i').test(_normConf(t)))
    : confirmacaoLimpa(t, TOK_LANCAR_FORTE);`,
  `  // 31/08: "Foi de propósito sim, Luciano" (resposta a uma pergunta HUMANA)
  // aprovou uma saida de R\$633 — o token frouxo aceitava "sim"/"ok" em
  // QUALQUER posicao da frase. Dinheiro exige afirmacao que ABRE a mensagem,
  // e mensagem curta.
  const _nt = _normConf(t);
  const ok = respondeuPreview
    ? (confirmacaoLimpa(t, TOK_LANCAR_REPLY)
       || (_nt.length <= 40 && new RegExp('^' + TOK_LANCAR_REPLY + '(\\\\s|$|[,.!])', 'i').test(_nt)))
    : confirmacaoLimpa(t, TOK_LANCAR_FORTE);`,
  'R-f token frouxo ancorado no inicio');

// ── LLM: classificador de correcao (mesmo padrao do interpretarComprovante) ──
trocar(
  `// O LLM interpreta texto livre, mas não pode escrever nem decidir a fatura.`,
  `// Fallback de DIALOGO (31/08, OK do Luciano): mensagem com pendencia aberta
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
      + '{"intencao":"corrigir_aluno|corrigir_categoria|corrigir_valor|corrigir_forma|sem_aluno|descartar|aprovar|nada",'
      + '"aluno_nome":null,"categoria":null,"valor":null,"forma":null,"entidade":null}. '
      + 'REGRAS: "nada" para conversa, pergunta ou assunto alheio. "aprovar" SO quando mandam lancar explicitamente. '
      + '"sem_aluno" quando dizem que nao e de aluno (banda/evento/empresa) — nome em entidade. '
      + 'categoria em [parcela,lojinha,passaporte,matricula,venda,despesa,outro]; forma em [pix,dinheiro,cartao,transferencia,cheque]. '
      + 'NUNCA invente nome ou valor que nao esteja na mensagem.\\n\\nMENSAGEM:\\n' + t.slice(0, 800);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        const intencoes = ['corrigir_aluno', 'corrigir_categoria', 'corrigir_valor', 'corrigir_forma', 'sem_aluno', 'descartar', 'aprovar', 'nada'];
        const intencao = intencoes.includes(String(o.intencao || '')) ? String(o.intencao) : 'nada';
        resolve({
          intencao,
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
          valor: o.valor != null ? parseBRMoney(String(o.valor)) : null,
          forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
          entidade: (o.entidade && String(o.entidade).trim()) || null,
        });
      }
    );
  });
}

// O LLM interpreta texto livre, mas não pode escrever nem decidir a fatura.`,
  'LLM classificarCorrecaoPendencia');

// ── A3: leitura dos previews abertos do ledger ───────────────────────────────
trocar(
  `function chamarRpcCaixaParam(nome, argName, payload, { url, key } = carregarEnv(), timeout = 15000) {`,
  `function _httpGetJson(pathQuery, { url, key } = carregarEnv(), timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('missing SUPABASE service key'));
    const u = new URL(url + pathQuery);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'apikey': key, 'Authorization': \`Bearer \${key}\` },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null); }
        catch (e) { reject(new Error(\`resposta invalida (\${res.statusCode})\`)); }
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

function chamarRpcCaixaParam(nome, argName, payload, { url, key } = carregarEnv(), timeout = 15000) {`,
  'A3 _httpGetJson + listarPreviewsAbertosV3');

// ── prefixo "Banda" nao duplica (visto com o LLM real: entidade "evento das
// bandas" virava "Banda Evento das Bandas") ───────────────────────────────
trocar(
  `    if (e) entidade = (banda ? 'Banda ' : '') + tituloNome(e);`,
  '    if (e) entidade = ((banda && !/' + BS + 'bbandas?' + BS + 'b/i.test(e)) ? ' + "'Banda '" + " : '') + tituloNome(e);",
  'prefixo Banda sem duplicar');

// ── exports (o classificador precisa ser testavel isoladamente) ─────────────
trocar(
  `  _alunoRotulado, _limparAlunoRotulado, _semAlunoDeclarado, extrairCategoriaCorrecao,`,
  `  _alunoRotulado, _limparAlunoRotulado, _semAlunoDeclarado, extrairCategoriaCorrecao,
  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3,`,
  'exports do classificador e da reidratacao');

// ── parametros injetaveis ────────────────────────────────────────────────────
trocar(
  `resumoFn = resumoDoDia, log = () => {}`,
  `resumoFn = resumoDoDia, classificarCorrecaoFn = classificarCorrecaoPendencia, listarPreviewsAbertosFn = listarPreviewsAbertosV3, log = () => {}`,
  'params classificarCorrecaoFn/listarPreviewsAbertosFn');

// ── reidratar + tratarNaoEntendida + return ampliado ─────────────────────────
trocar(
  `  return { handle, temPendencia, citaAlgumaPendencia, _pendentes: pendentes };`,
  `  // A3: reconstruir as pendencias a partir do ledger V3 (chamado pelo bridge
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
      let sintetico = null;
      if (cls.intencao === 'corrigir_aluno' && cls.aluno_nome) sintetico = 'aluno: ' + cls.aluno_nome;
      else if (cls.intencao === 'corrigir_categoria' && cls.categoria) sintetico = 'coloca a categoria como ' + cls.categoria;
      else if (cls.intencao === 'corrigir_valor' && cls.valor) sintetico = 'o valor é R$ ' + String(cls.valor).replace('.', ',');
      else if (cls.intencao === 'corrigir_forma' && cls.forma) sintetico = 'a forma é ' + cls.forma;
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
    reidratarPendencias, tratarNaoEntendida, _pendentes: pendentes };`,
  'A3+LLM reidratar/tratarNaoEntendida/return');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
