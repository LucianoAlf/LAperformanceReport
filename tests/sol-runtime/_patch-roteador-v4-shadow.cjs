#!/usr/bin/env node
// SOL CAIXA V4 — FASE 1: roteador LLM em SHADOW (31/08, go do Luciano).
//
// A sombra do contrato deterministico do Alfredo rodou 7 dias e quantificou a
// tese: de 504 eventos, o contrato de regras classificou 21 (4%) — 105
// coverage_gaps onde o runtime AGIU sem o contrato ter regra. Regra escrita
// nao escala para dialogo; quem escala e o modelo (arquitetura da Maria:
// LLM roteia, tools estreitas executam, determinismo so na fronteira do
// dinheiro).
//
// FASE 1 (isto aqui): o roteador LLM roda em PARALELO para toda mensagem de
// texto do grupo financeiro — fire-and-forget, zero impacto no fluxo, zero
// escrita — e o log guarda a decisao dele AO LADO da acao do runtime legado
// (step 'roteador_v4_shadow'). Em 2-3 dias comparamos decisao a decisao; o
// flip (fase 2) so acontece com os numeros na mesa.
//
// Kill switch: SOL_CAIXA_V4_SHADOW=0 desliga.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-roteador-v4-shadow.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── o roteador: mesmo padrao LLM do classificador, com o mapa COMPLETO ───────
trocar(
  `// Fallback de DIALOGO (31/08, OK do Luciano): mensagem com pendencia aberta`,
  `// V4 FASE 1 — ROTEADOR EM SHADOW (31/08, go do Luciano): o mapa COMPLETO de
// intencoes do caixa, nao so correcoes. Roda em paralelo (fire-and-forget no
// bridge) para TODA mensagem de texto do grupo; a decisao vai para o log ao
// lado da acao do runtime legado. Nunca escreve, nunca responde — por ora, so
// observa. E' o cerebro da inversao: quando os logs provarem que ele decide
// melhor que a gramatica, ele assume a frente e os caminhos de hoje viram
// executores das intencoes dele.
function rotearMensagemV4(texto, contexto, { timeout = 45000 } = {}) {
  return new Promise((resolve) => {
    const t = String(texto || '').trim();
    if (t.length < 1 || t.length > 1200) return resolve(null);
    const prompt = 'Voce e a Sol, agente do caixa de uma escola de musica, lendo UMA mensagem do grupo financeiro. '
      + 'Contexto atual (pendencias aguardando conferencia humana, pode ser vazio): '
      + JSON.stringify(contexto).slice(0, 1200)
      + '. Classifique a INTENCAO da mensagem. Responda SOMENTE JSON valido, sem markdown: '
      + '{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|corrigir_lancamento_gravado|estornar_lancamento|consulta_caixa|conversa|nada",'
      + '"aluno_nome":null,"valor":null,"forma":null,"categoria":null,"competencia":null,"entidade":null,"confianca":0.0}. '
      + 'REGRAS: "conversa" = papo de equipe/elogio/despedida; "nada" = assunto alheio ao caixa. '
      + '"aprovar" SO quando mandam lancar explicitamente. "contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada. '
      + '"saida_dinheiro" quando relatam despesa/retirada paga do caixa. "consulta_caixa" para perguntas (resumo, quanto entrou, etc). '
      + 'NUNCA invente nome ou valor que nao esteja na mensagem. confianca entre 0 e 1.\\n\\nMENSAGEM:\\n' + t.slice(0, 900);
    execFile(
      '/home/sol/.hermes/hermes-agent/venv/bin/python',
      ['-m', 'hermes_cli.main', 'chat', '-Q', '--source', 'tool', '--max-turns', '1', '--ignore-rules', '-q', prompt],
      { cwd: '/home/sol', timeout, maxBuffer: 256 * 1024,
        env: Object.assign({}, process.env, { HOME: process.env.HOME || '/home/sol', HERMES_HOME: process.env.HERMES_HOME || '/home/sol/.hermes/profiles/sol' }) },
      (err, stdout) => {
        if (err) return resolve(null);
        const o = _parseVisionJson(stdout);
        if (!o || typeof o !== 'object') return resolve(null);
        resolve({
          intencao: String(o.intencao || 'nada'),
          aluno_nome: (o.aluno_nome && String(o.aluno_nome).trim()) || null,
          valor: o.valor != null ? parseBRMoney(String(o.valor)) : null,
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

// Fallback de DIALOGO (31/08, OK do Luciano): mensagem com pendencia aberta`,
  'rotearMensagemV4');

// ── metodo no handler: contexto + chamada, para o bridge disparar em paralelo ─
trocar(
  `  // Fallback de DIALOGO: chamado pelo bridge ANTES do "Nao entendi". A intencao`,
  `  // V4 SHADOW: o bridge chama SEM await depois do handle() — a decisao do
  // roteador vai para o log ao lado da acao do legado. Nunca escreve.
  async function observarRoteadorV4(event, acaoLegada) {
    try {
      if (process.env.SOL_CAIXA_V4_SHADOW === '0') return;
      if (!event || event.hasMedia || event._sintetico) return;
      const texto = bodyLimpo(event.body);
      if (!texto) return;
      const chatId = event.chatId;
      if (!grupos[chatId]) return;
      const arrP = limparVelhos(chatId, Date.now());
      const contexto = arrP.slice(0, 3).map((p, i) => ({
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
        legado: acaoLegada || null, pendencias: arrP.length, ms: Date.now() - t0,
      });
    } catch (e) {
      log({ acao: 'roteador_v4_shadow_erro', erro: String(e && e.message) });
    }
  }

  // Fallback de DIALOGO: chamado pelo bridge ANTES do "Nao entendi". A intencao`,
  'observarRoteadorV4 no handler');

// ── param injetavel + return + exports ───────────────────────────────────────
trocar(
  `classificarCorrecaoFn = classificarCorrecaoPendencia, listarPreviewsAbertosFn = listarPreviewsAbertosV3, log = () => {}`,
  `classificarCorrecaoFn = classificarCorrecaoPendencia, listarPreviewsAbertosFn = listarPreviewsAbertosV3, rotearV4Fn = rotearMensagemV4, log = () => {}`,
  'param rotearV4Fn');

trocar(
  `  return { handle, temPendencia, citaAlgumaPendencia, ehConversaSemComando,
    reidratarPendencias, tratarNaoEntendida, _pendentes: pendentes };`,
  `  return { handle, temPendencia, citaAlgumaPendencia, ehConversaSemComando,
    reidratarPendencias, tratarNaoEntendida, observarRoteadorV4, _pendentes: pendentes };`,
  'observarRoteadorV4 no return');

trocar(
  `  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3, _contestaFatura,`,
  `  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3, _contestaFatura, rotearMensagemV4,`,
  'export rotearMensagemV4');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
