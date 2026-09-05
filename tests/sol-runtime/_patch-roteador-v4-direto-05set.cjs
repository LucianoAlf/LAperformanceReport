#!/usr/bin/env node
// OS TRES PRE-REQUISITOS DO FLIP DA V4 (auditoria de 05/09/2026, go do Luciano).
//
// P1  O ROTEADOR SAI DO `hermes_cli`.  Medido na VPS: uma chamada com prompt
//     trivial leva 10-13 s, e o piso NAO e' o modelo — trocar para
//     `openai-api/gpt-5.4-mini` deu os mesmos 10,5 s. O custo e' subir o venv
//     Python e inicializar o agente, UM PROCESSO POR MENSAGEM. Em producao isso
//     virou mediana de 21,8 s e p90 de 44,5 s, com 10% sem resposta nenhuma —
//     e latencia decidindo dinheiro ja e' cicatriz conhecida desta casa.
//     Passa a ser HTTPS direto (OpenCode Zen, API compativel com OpenAI), com o
//     modelo escolhido por env. Sem chave, cai de volta no caminho antigo: a
//     sombra nunca fica muda por falta de arquivo.
//     ⚠️ O `User-Agent` NAO e' enfeite: sem ele o Cloudflare do opencode.ai
//     devolve 403 "error code: 1010" antes de a requisicao chegar ao modelo.
//
// P2  O CONTEXTO E' FOTOGRAFADO ANTES DO `handle()`.  Esta era a falha de
//     MEDICAO que subestimava o roteador: `observarRoteadorV4` roda DEPOIS do
//     handle, entao quando alguem escreve "Pode" o runtime ja lancou e ja
//     CONSUMIU a pendencia — o roteador recebia a palavra sozinha, sem card
//     nenhum. Medido em 3 dias: **33 das 44 mensagens que fizeram o runtime
//     lancar chegaram ao roteador com `pendencias: 0`**, e ele respondia
//     `nada`/`conversa`, que e' a resposta certa para "aprovar o que?".
//     Agora o `handle()` tira a foto na entrada e o observador usa a foto.
//
// P3  `saida_dinheiro` GANHA EXEMPLOS.  Era a maior lacuna real de julgamento:
//     6 das 16 perdas do shadow em 3 dias eram saida de dinheiro ditada por
//     texto, que o legado lia e o roteador chamava de `nada` — apesar de ter a
//     intencao no enum. A regra dizia "despesa/retirada paga do caixa"; a
//     equipe escreve "comprei agua 45".
//
// P4  O SHADOW PASSA A GUARDAR O TEXTO.  Hoje e' impossivel reprocessar a
//     sombra: nem o `caixa.log`, nem o `bridge.log`, nem
//     `sol_caixa_lancamento_auditoria` guardam o corpo da mensagem (e
//     `sol_caixa_ingestao_recebimentos.raw_text` parou em 15/08). Sem o texto
//     nao ha como rodar de novo com outro modelo. Passa a gravar truncado em
//     300 chars — daqui pra frente o replay de verdade existe.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-roteador-v4-direto-05set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

// ── P1 + P3: transporte direto e prompt com exemplos de saida ───────────────
trocar(
  String.raw`function rotearMensagemV4(texto, contexto, { timeout = 45000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 1 || t.length > 1200) return resolve(null);`,
  String.raw`// Chave e modelo do roteador. A chave mora FORA do repo, em arquivo 600 do
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
function _v4Modelo() { return process.env.SOL_CAIXA_V4_MODELO || 'deepseek-v4-flash'; }

// Chamada HTTPS direta. Substitui o hermes_cli (10-13 s so de subir o
// processo). ⚠️ O User-Agent e' obrigatorio: sem ele o Cloudflare do
// opencode.ai devolve 403 "error code: 1010" antes de chegar ao modelo.
function _v4Http(prompt, timeout) {
  return new Promise((resolve) => {
    const chave = _v4ChaveZen();
    if (!chave) return resolve(null);
    const body = JSON.stringify({
      model: _v4Modelo(), max_tokens: 300, temperature: 0,
      // Medido em 05/09: com response_format o deepseek cai de 3-6 s para ~1,2 s
      // e para de embrulhar o JSON em prosa. ⚠️ Nem todo modelo respeita — o
      // glm-5.3-flash devolve conteudo VAZIO com esta opcao, entao trocar de
      // modelo exige remedir, nao so trocar a env.
      response_format: { type: 'json_object' },
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
function rotearMensagemV4(texto, contexto, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 1 || t.length > 1200) return resolve(null);`,
  'P1a transporte HTTPS direto');

trocar(
  String.raw`      + '"saida_dinheiro" quando relatam despesa/retirada paga do caixa. "consulta_caixa" para perguntas (resumo, quanto entrou, etc). '`,
  String.raw`      + '"saida_dinheiro" quando o dinheiro SAI do caixa — despesa, compra, retirada, vale, reembolso, troco, pagamento a fornecedor ou a prestador. '
      + 'Vale mesmo sem a palavra "saida" e mesmo sem forma de pagamento: "comprei agua 45", "paguei o motoboy 30", "retirei 200 pro cofre", "vale de R$ 100 pra Ana" sao todos saida_dinheiro. '
      + '"consulta_caixa" para perguntas (resumo, quanto entrou, etc). '`,
  'P3 saida_dinheiro ganha exemplos');

// 🔴 `lancamento_por_texto` estava no ENUM e NAO tinha uma linha de descricao.
// Medido na bancada: "PG parcela 09/26 / Aluno: X / LA CG - R$377,00" — o
// formato que a equipe usa o dia inteiro — virava `aprovar` com confianca 0,95.
// E `aprovar` dizia "SO quando mandam lancar explicitamente", o que exclui
// justamente o "pode" que a propria Sol ENSINA ("Responde *pode*").
trocar(
  String.raw`      + '"aprovar" SO quando mandam lancar explicitamente. "contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada. '`,
  String.raw`      + '"aprovar" quando autorizam lancar o que ja esta num card do contexto — inclusive so com "pode", "pode sim", "ok", "isso", "manda", respondendo a pergunta da Sol. Exige card no contexto: sem card, "pode" sozinho e "conversa". '
      + '"lancamento_por_texto" quando a mensagem DITA um pagamento novo, sem comprovante e sem card aberto: traz aluno e/ou valor e/ou competencia ("PG parcela 09/26 Aluno: Fulano LA CG - R$377,00"). Nao confundir com "aprovar" — aqui nao ha card para aprovar, ha um lancamento sendo criado. '
      + '"contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada. '`,
  'P3b lancamento_por_texto ganha descricao, aprovar aceita o "pode"');

// O corpo antigo (execFile do hermes_cli) vira o FALLBACK, so alcancavel quando
// nao ha chave. Nunca deixar a sombra muda por falta de arquivo.
trocar(
  String.raw`      + 'NUNCA invente nome ou valor que nao esteja na mensagem. confianca entre 0 e 1.\n\nMENSAGEM:\n' + t.slice(0, 900);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        resolve({`,
  String.raw`      + 'NUNCA invente nome ou valor que nao esteja na mensagem. confianca entre 0 e 1.\n\nMENSAGEM:\n' + t.slice(0, 900);
    const normaliza = (o) => (!o || typeof o !== 'object') ? null : ({
      intencao: String(o.intencao || 'nada'),
      aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
      valor: o.valor != null ? parseBRMoney(String(o.valor)) : null,
      forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
      categoria: (o.categoria && String(o.categoria).toLowerCase().trim()) || null,
      competencia: (o.competencia && String(o.competencia).trim()) || null,
      entidade: (o.entidade && String(o.entidade).trim()) || null,
      confianca: Number(o.confianca) || null,
    });
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
        resolve({`,
  'P1b caminho antigo vira fallback');

// ── P2: a foto do contexto sai ANTES do handle ──────────────────────────────
trocar(
  String.raw`  function limparVelhos(chatId, agora) {`,
  String.raw`  // 🔴 FOTO DO CONTEXTO NA ENTRADA DO handle(). O observador da V4 roda DEPOIS
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

  function limparVelhos(chatId, agora) {`,
  'P2a foto do contexto');

trocar(
  String.raw`  async function handle(event, agora = Date.now()) {
    const chatId = event.chatId;
    const grp = grupos[chatId];
    if (!grp) return { acao: 'ignorado_fora_grupo' };`,
  String.raw`  async function handle(event, agora = Date.now()) {
    const chatId = event.chatId;
    const grp = grupos[chatId];
    if (!grp) return { acao: 'ignorado_fora_grupo' };
    // A foto sai aqui, antes de qualquer coisa consumir pendencia (P2).
    fotografarContextoV4(event, chatId, agora);`,
  'P2b handle tira a foto na entrada');

trocar(
  String.raw`      const arrP = limparVelhos(chatId, Date.now());
      const contexto = arrP.slice(0, 3).map((p, i) => ({
        card: i + 1, valor: p.valor || null, forma: p.forma || null,
        categoria: p.categoria || null, aluno: p.aluno || null,
        competencia: p.competencia || null,
      }));`,
  String.raw`      // Usa a FOTO tirada na entrada do handle; so cai no estado atual quando
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
      }));`,
  'P2c observador usa a foto');

// ── P4: o shadow guarda o texto, para o replay existir ──────────────────────
trocar(
  String.raw`        legado: acaoLegada || null, pendencias: arrP.length, ms: Date.now() - t0,
      });`,
  String.raw`        legado: acaoLegada || null,
        // 🔴 pendencias passa a ser o que o roteador VIU (a foto), nao o estado
        // depois do handle. E o texto fica gravado: sem ele nao existe replay —
        // nem o caixa.log nem o bridge.log nem a auditoria guardavam o corpo.
        pendencias: usouFoto ? foto.cards.length : arrP.length,
        contexto_de: usouFoto ? 'foto_pre_handle' : 'pos_handle',
        modelo: _v4Modelo(), texto: texto.slice(0, 300),
        ms: Date.now() - t0,
      });`,
  'P4 shadow grava texto, modelo e origem do contexto');

fs.writeFileSync(alvo, src);
console.log('\nescrito ' + alvo + '  (' + antes + ' -> ' + src.length + ' bytes)');
