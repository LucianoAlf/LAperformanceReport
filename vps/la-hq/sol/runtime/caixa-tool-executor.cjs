'use strict';

// Executor das ferramentas de caixa da Sol — roda DENTRO da ponte do WhatsApp.
//
// 🔴 POR QUE AQUI E NÃO NO PROCESSO DAS FERRAMENTAS (28/09/2026). Até esta data o
//    MCP `sol-portas-mcp.mjs` instanciava o PRÓPRIO handler do caixa: dois
//    processos, dois mapas de cards/rascunhos em memória. Um card aberto pela
//    ferramenta não existia para a ponte, e um card aberto pela ponte só chegava
//    à ferramenta pela reidratação do ledger V3 a cada chamada. Duas cópias do
//    mesmo estado decidindo dinheiro — mesma família das duplicatas de
//    renovação. Agora o MCP só valida o crachá e pede à ponte que execute; o
//    estado é um só: o `_caixaHandler` da ponte.
//
// A resposta é MEDIDA, não presumida: o que foi enviado ao grupo e o que o
// runtime registrou durante ESTA chamada (AsyncLocalStorage — uma mensagem de
// outra pessoa processada ao mesmo tempo não entra na conta desta ferramenta).

const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

// Mesmo módulo (mesmo caminho absoluto) que a ponte já carregou: o cache do
// Node devolve a MESMA instância, sem segundo estado. Só funções puras são usadas.
let _cf = null;
function cf() {
  if (!_cf) _cf = require(require('node:path').join(__dirname, 'caixa-financeiro.cjs'));
  return _cf;
}

const captura = new AsyncLocalStorage();

// Chamados pela ponte no sendFn e no log do handler: só registram quando há uma
// execução de ferramenta em curso NESTE contexto assíncrono.
function registrarEnvio(texto) {
  const c = captura.getStore();
  if (c) c.envios.push(String(texto || ''));
}
function registrarEvento(evento) {
  const c = captura.getStore();
  if (c && evento && evento.acao) c.eventos.push({ acao: evento.acao, motivo: evento.motivo || null });
}

const ACOES_QUE_GRAVAM = new Set(['lancado', 'lote_multi_lancado', 'saida_lancada', 'movimento_estornado',
  'movimento_corrigido', 'aberto', 'fechado', 'caixa_reaberto']);

const MOTIVO_HUMANO = {
  pode_sem_pendencia: 'não havia nenhum card aguardando aprovação neste grupo',
  nenhuma_fatura_aberta: 'não achei no Emusys uma fatura desse aluno e competência que feche com esse valor',
  agent_first_nao_resolveu: 'não consegui ligar o pagamento a uma fatura oficial',
  fonte_indisponivel: 'a cópia das faturas do Emusys está atualizando; tentar de novo em alguns minutos',
  valor_total_nao_aparece_no_texto_original: 'o total não aparece no texto da pessoa',
  texto_e_total_declarado_obrigatorios: 'faltou o texto original ou o total',
  texto_original_obrigatorio: 'faltou a mensagem exata da pessoa (p_texto_original)',
  aprovacao_explicita_obrigatoria: 'a mensagem não é uma aprovação explícita ("pode")',
  recusa_explicita_obrigatoria: 'a mensagem não é um descarte explícito ("não", "cancela")',
  ja_aberto: 'o caixa de hoje já está aberto',
  ja_existe: 'o caixa de hoje já existe',
  sem_dados: 'não consegui ler os dados de abertura do caixa',
  saida_incompleta: 'faltou valor, categoria, forma ou descrição da saída',
  alvo_exato_obrigatorio: 'não identifiquei exatamente qual lançamento mexer',
  motivo_obrigatorio: 'faltou o motivo do estorno',
  correcao_vazia: 'não veio nada para corrigir',
  unidade_divergente: 'o grupo não corresponde à unidade do crachá',
  grupo_fora_do_caixa: 'este grupo não é um grupo financeiro da Sol',
  handler_indisponivel: 'o caixa da Sol não está carregado agora',
  cheques_lista_republicada: 'a lista do lote foi republicada com a mudança; ainda não há cheque pronto para o caixa',
  sem_lote_aberto: 'não há lote de cheques aberto neste grupo hoje',
  cheques_agente_desligado: 'a conversa sobre cheques pelo agente está desligada; use o caminho antigo (citar a lista: "N é da Fulana")',
  cheques_desligado: 'o lote de cheques está desligado neste momento',
  cheques_nada_mudou: 'nenhum pedido foi aceito; veja o motivo de cada cheque em `resultados`',
  fonte_faturas_indisponivel: 'não consegui consultar as faturas agora; tentar de novo em instantes',
  fonte_caixa_indisponivel: 'não consegui consultar o caixa agora; tentar de novo em instantes',
};

const ORIENTACAO = {
  executado: 'GRAVADO no caixa. O recibo já saiu no grupo pela ferramenta: não repita.',
  card_publicado: 'Card publicado no grupo. NADA foi gravado ainda: aguarde o "pode" humano citando o card. Não diga que lançou.',
  mensagem_publicada: 'A ferramenta publicou a mensagem abaixo no grupo (pergunta ou recusa). NADA foi gravado e NENHUM card aprovável saiu. Não diga que lançou nem que preparou card; não repita a mensagem.',
  nada_aconteceu: 'NADA foi enviado e NADA foi gravado. Diga isso à pessoa com o motivo, sem afirmar sucesso, e peça o que falta.',
  consulta: 'Só leitura: nada foi publicado nem gravado. Use o estado para decidir a próxima ferramenta; não cole o estado no grupo.',
};

// Ferramentas do LOTE DE CHEQUES (06/10/2026): a conversa sobre o lote aberto é do
// agente; validar, mudar o estado e republicar o card é do caixa (handler único).
const ACOES_CHEQUES = { cheques_estado: 'estado', cheques_atribuir: 'atribuir',
  cheques_confirmar_leitura: 'confirmar_leitura', cheques_marcar_conferencia: 'conferencia' };

// Estados, do mais forte ao mais fraco. Só os dois primeiros são sucesso.
function classificarDesfecho({ resultado, envios = [], eventos = [] }) {
  const acao = (resultado && resultado.acao) || null;
  const acoes = [acao, ...eventos.map((e) => e.acao)].filter(Boolean);
  const gravou = acoes.some((a) => ACOES_QUE_GRAVAM.has(a));
  const cardPreview = acoes.some((a) => /preview/.test(a) && !/sem_v3|bloque|erro|recus|invalid|descart/.test(a));
  const publicouCard = !gravou && ((envios.length > 0 && cardPreview) || !!(resultado && resultado.previewId));
  const estado = gravou ? 'executado' : (publicouCard ? 'card_publicado'
    : (envios.length > 0 ? 'mensagem_publicada' : 'nada_aconteceu'));
  const ultimoMotivo = [...eventos].reverse().find((e) => e.motivo) || null;
  const motivo = estado === 'executado' || estado === 'card_publicado' ? null
    : ((ultimoMotivo && ultimoMotivo.motivo) || acao || (resultado && resultado.skip) || 'sem_desfecho');
  return {
    ok: estado === 'executado' || estado === 'card_publicado',
    estado, acao, gravou_no_caixa: gravou, publicou_no_grupo: envios.length > 0 || publicouCard,
    mensagens_publicadas: envios.map((t) => t.slice(0, 600)),
    motivo, motivo_humano: motivo ? (MOTIVO_HUMANO[motivo] || null) : null, orientacao: ORIENTACAO[estado],
  };
}

function recusa(motivo) {
  return { ok: false, estado: 'nada_aconteceu', acao: null, gravou_no_caixa: false, publicou_no_grupo: false,
    mensagens_publicadas: [], motivo, motivo_humano: MOTIVO_HUMANO[motivo] || null,
    orientacao: ORIENTACAO.nada_aconteceu };
}

function textoContemValor(texto, valor) {
  const alvo = Math.round(Number(valor) * 100);
  if (!Number.isFinite(alvo) || alvo <= 0) return false;
  // 02/10/2026: o leitor monetário é o MESMO do caixa-financeiro (gramática
  // pt-BR estrita: "1.000" é mil, "1 mil" é mil, "020" não é dinheiro). O
  // tokenizador próprio que vivia aqui lia "1.000" como "1.00".
  const cands = cf().candidatosMonetariosBR(texto, { incluirSoltos: true });
  if (cands.some((c) => Math.round(c.valor * 100) === alvo)) return true;
  // 🔴 A SOMA DO QUE A PESSOA ESCREVEU TAMBÉM É O TOTAL (CG 29/09, Mayra): "segunda parcela
  //    do passaporte de A (R$200,00) e B (R$200,00)" era recusada porque "400" não estava
  //    escrito. A trava existe para o modelo não INVENTAR total; somar os valores que a
  //    pessoa escreveu não inventa nada. Só valores marcados com R$ (senão data, telefone e
  //    "13/13" entrariam na soma), e só com 2+ valores.
  const comRS = cands.filter((c) => c.sinal === 'rs' || c.sinal === 'rotulo_rs').map((c) => Math.round(c.valor * 100));
  return comRS.length >= 2 && comRS.reduce((a, b) => a + b, 0) === alvo;
}

function idMensagem(ctx, action, args) {
  return 'tool-' + crypto.createHash('sha256').update([
    ctx._chat, action, JSON.stringify(args || {}), Math.floor(Date.now() / 30000),
  ].join('|')).digest('hex').slice(0, 24);
}

function criarExecutorCaixaTool({ obterHandler, obterAbf, obterGovernanca, enviar, grupos, fecharEpisodio, log }) {
  const _log = typeof log === 'function' ? log : () => {};

  async function executarNoContexto(tool, ctx, args, cap) {
    const handler = await obterHandler();
    const abf = await obterAbf();
    if (!handler || !abf) return recusa('handler_indisponivel');
    const grupoMapa = typeof grupos === 'function' ? grupos() : (grupos || {});
    const grupo = grupoMapa[ctx._chat];
    if (!grupo) return recusa('grupo_fora_do_caixa');
    if (ctx.unidade_id && grupo.unidade_id && String(ctx.unidade_id) !== String(grupo.unidade_id)) {
      return recusa('unidade_divergente');
    }
    const governanca = obterGovernanca ? await obterGovernanca() : null;
    // ⚠️ SEM reidratar a cada chamada. Isso era necessário quando o MCP tinha
    //    cópia própria; aqui o handler É o estado vivo (reidratado uma vez no
    //    boot da ponte), e reidratar de novo sobrescreveria o rascunho em curso e
    //    poderia ressuscitar card recém-aprovado cuja baixa no ledger é assíncrona.
    const syntheticMessageId = idMensagem(ctx, tool.action, args);
    let episodio = governanca && ctx._episode_id && governanca.adoptEpisode
      ? governanca.adoptEpisode(ctx._episode_id, { unitName: grupo.nome, source: 'whatsapp_group', messageKind: 'text' })
      : null;
    if (!episodio && governanca) {
      episodio = governanca.beginEpisode({ chatId: ctx._chat, messageId: syntheticMessageId,
        unitName: grupo.nome, hasMedia: false, source: 'agent_tool_uncorrelated' });
      if (episodio) void governanca.record(episodio, 'correlation_gap', {
        correlation_status: 'missing_episode_header', engine: 'agent_tools', outcome: 'inconclusive',
      });
    }
    if (episodio && governanca) void governanca.record(episodio, 'tool_selected', {
      tool_name: tool.name, action: tool.action, engine: 'agent_tools', tool_call_ref: syntheticMessageId,
    });
    const base = {
      chatId: ctx._chat, senderPhone: ctx._ator_numero, senderId: ctx._ator_numero + '@s.whatsapp.net',
      senderName: ctx.quem || 'Equipe', hasMedia: false, mediaUrls: [],
      messageId: syntheticMessageId, quotedMessageId: args.p_preview_message_id || null,
      caixaGovernancaEpisode: episodio,
    };
    const governanceFn = (event, eventType, details) => (governanca && event && event.caixaGovernancaEpisode)
      ? governanca.record(event.caixaGovernancaEpisode, eventType, details || {})
      : Promise.resolve({ ok: false, sem_episodio: true });
    // Abertura/fechamento devolvem `true` em quase tudo; o desfecho real está no log.
    const logAbf = (e) => { registrarEvento(e); _log(e); };
    const sendFn = async (chatId, texto) => { registrarEnvio(texto); return enviar(chatId, texto); };

    let resultado;
    const a = tool.action;
    if (a === 'preparar_lancamento') {
      const texto = String(args.p_texto_original || '').trim();
      const valor = Number(args.p_valor_total);
      if (!texto || !(valor > 0)) return recusa('texto_e_total_declarado_obrigatorios');
      if (!textoContemValor(texto, valor)) return recusa('valor_total_nao_aparece_no_texto_original');
      resultado = await handler.tratarAgentFirst({ ...base, body: texto, caixaToolDecision: {
        intencao: Array.isArray(args.p_itens) && args.p_itens.length > 1 ? 'lancamento_multi_aluno' : 'lancamento_por_texto',
        valor_total: valor, forma: args.p_forma || null, pagador: args.p_pagador || null,
        cartao_modalidade: args.p_cartao_modalidade || null,
        cartao_parcelas: Number(args.p_cartao_parcelas) || null,
        itens: Array.isArray(args.p_itens) ? args.p_itens : [],
      } }, grupo, Date.now());
    } else if (a === 'preparar_saida') {
      const valor = Number(args.p_valor);
      const forma = String(args.p_forma || '').trim().toLowerCase();
      const descricao = String(args.p_descricao || '').trim();
      const textoOriginal = String(args.p_texto_original || '').trim();
      // 🔴 29/09/2026 (CG, Jhon): a pessoa escreveu "segurança", o modelo passou
      //    `despesa` e o card saiu como despesa. A categoria que a PESSOA nomeou decide;
      //    o palpite do modelo só entra quando o texto humano não nomeia nenhuma.
      const categoriaModelo = String(args.p_categoria || '').trim().toLowerCase();
      const categoriaHumana = textoOriginal ? cf().categoriaSaidaDoTexto(textoOriginal) : null;
      const categoria = categoriaHumana || categoriaModelo;
      if (categoriaHumana && categoriaModelo && categoriaHumana !== categoriaModelo) {
        _log({ acao: 'saida_categoria_da_pessoa_prevaleceu', chatId: ctx._chat,
               categoria_modelo: categoriaModelo, categoria_pessoa: categoriaHumana });
      }
      if (!(valor > 0) || !['seguranca', 'despesa', 'retirada', 'troco'].includes(categoria)
          || !forma || !descricao || !textoOriginal) return recusa('saida_incompleta');
      // Adaptador canônico do schema para o runtime que monta o mesmo preview V3.
      const body = `saída ${categoria} R$ ${valor.toFixed(2).replace('.', ',')} ${forma} ${descricao}`;
      resultado = await handler.handle({ ...base, body });
    } else if (a === 'preparar_abertura') {
      resultado = await abf.postarAbertura(
        { chat_id: ctx._chat, unidade_id: grupo.unidade_id, nome: grupo.nome },
        { sendFn, event: base, governanceFn, log: logAbf });
    } else if (a === 'preparar_fechamento') {
      resultado = await abf.tratarPedidoDiretoFechamento(
        { ...base, body: 'Sol, vamos fechar o caixa agora' },
        { grupo, sendFn, governanceFn, log: logAbf });
    } else if (a === 'aprovar_preview') {
      const texto = String(args.p_aprovacao || '').trim();
      if (!/^(pode(?:\s+sim)?|confirmo|autorizo|pode\s+(?:lançar|corrigir|estornar|abrir|fechar))\b/i.test(texto)) {
        return recusa('aprovacao_explicita_obrigatoria');
      }
      const ev = { ...base, body: texto };
      const tratou = await abf.tratarConfirmacao(ev, { sendFn, governanceFn, log: logAbf,
        temComprovantePendente: (cid) => handler.temPendencia(cid) });
      resultado = tratou ? { acao: 'abertura_fechamento_tratado' } : await handler.handle(ev);
    } else if (a === 'descartar_preview') {
      const texto = String(args.p_recusa || '').trim();
      if (!/^(não|nao|cancela|cancelar|descarta|descartar)\b/i.test(texto)) return recusa('recusa_explicita_obrigatoria');
      resultado = await handler.handle({ ...base, body: texto });
    } else if (a === 'preparar_estorno' || a === 'preparar_correcao') {
      const alvo = {
        movimentacao_id: String(args.p_movimentacao_id || '').trim(),
        unidade_id: grupo.unidade_id,
        valor: Number(args.p_valor_atual),
        forma_pagamento: String(args.p_forma_atual || ''),
        categoria: String(args.p_categoria_atual || ''),
      };
      if (!alvo.movimentacao_id || !(alvo.valor > 0)) return recusa('alvo_exato_obrigatorio');
      let cmd;
      if (a === 'preparar_estorno') {
        const motivo = String(args.p_motivo || '').trim();
        if (!motivo) return recusa('motivo_obrigatorio');
        cmd = { tipo: 'estornar', motivo, correcoes: {} };
      } else {
        const correcoes = {};
        if (args.p_novo_valor != null) correcoes.valor = Number(args.p_novo_valor);
        if (args.p_nova_forma) correcoes.forma_pagamento = String(args.p_nova_forma);
        if (args.p_nova_categoria) correcoes.categoria = String(args.p_nova_categoria);
        if (!Object.keys(correcoes).length) return recusa('correcao_vazia');
        cmd = { tipo: 'corrigir', motivo: String(args.p_motivo || 'correção solicitada no grupo'), correcoes };
      }
      resultado = await handler.handle({ ...base,
        body: cmd.tipo === 'estornar' ? 'estornar lançamento' : 'corrigir lançamento',
        caixaToolCommand: cmd, caixaToolTarget: alvo });
    } else if (ACOES_CHEQUES[a]) {
      if (!handler.ferramentaCheques) return recusa('handler_indisponivel');
      const textoOriginal = String(args.p_texto_original || '').trim();
      if (a !== 'cheques_estado' && !textoOriginal) return recusa('texto_original_obrigatorio');
      resultado = await handler.ferramentaCheques(ACOES_CHEQUES[a], { event: base, quem: ctx.quem || 'Equipe',
        args: { ...args, p_texto_original: textoOriginal } });
      if (a === 'cheques_estado' && resultado && resultado.acao === 'cheques_estado') {
        return { ok: true, estado: 'consulta', acao: 'cheques_estado', gravou_no_caixa: false, publicou_no_grupo: false,
          mensagens_publicadas: [], lote: resultado.estado, orientacao: ORIENTACAO.consulta };
      }
    } else {
      return recusa('acao_desconhecida');
    }
    const desfecho = classificarDesfecho({ resultado, envios: cap.envios, eventos: cap.eventos });
    // Cheques: card só conta se ESTA chamada abriu um preview aprovável (previewId).
    // A republicação fecha o preview antigo (evento "v3_preview_finalizado"), que a
    // régua genérica leria como card novo — e o agente diria "card pronto" sem card.
    if (ACOES_CHEQUES[a] && !desfecho.gravou_no_caixa) {
      const estado = resultado && resultado.previewId ? 'card_publicado' : (cap.envios.length ? 'mensagem_publicada' : 'nada_aconteceu');
      Object.assign(desfecho, { estado, ok: estado === 'card_publicado' || (estado === 'mensagem_publicada' && !!(resultado && resultado.acao === 'cheques_lista_republicada')),
        orientacao: ORIENTACAO[estado] });
      if (estado === 'card_publicado') { desfecho.motivo = null; desfecho.motivo_humano = null; }
    }
    if (resultado && Array.isArray(resultado.resultados)) desfecho.resultados = resultado.resultados;
    if (resultado && resultado.estado && typeof resultado.estado === 'object') desfecho.lote = resultado.estado;
    if (resultado && resultado.motivo && !desfecho.ok) {
      desfecho.motivo = resultado.motivo; desfecho.motivo_humano = MOTIVO_HUMANO[resultado.motivo] || desfecho.motivo_humano;
    }
    if (episodio && fecharEpisodio) {
      try {
        await fecharEpisodio(episodio, ctx._chat, {
          terminal_state: desfecho.acao || desfecho.estado,
          action: desfecho.acao || tool.action,
          outcome: desfecho.ok ? 'ok' : 'refused',
        });
      } catch (e) { _log({ step: 'caixa_tool_fechar_episodio_erro', msg: String(e && e.message) }); }
    }
    return desfecho;
  }

  async function executar(pedido) {
    const tool = (pedido && pedido.tool) || {};
    const ctx = (pedido && pedido.ctx) || {};
    const args = (pedido && pedido.args) || {};
    if (!ctx.ok || !ctx._chat || !ctx._ator_numero) return recusa('contexto_invalido');
    const cap = { envios: [], eventos: [] };
    const t0 = Date.now();
    try {
      const out = await captura.run(cap, () => executarNoContexto(tool, ctx, args, cap));
      _log({ step: 'caixa_tool', tool: tool.name, estado: out.estado, acao: out.acao, motivo: out.motivo, ms: Date.now() - t0 });
      return out;
    } catch (e) {
      _log({ step: 'caixa_tool_erro', tool: tool.name, msg: String(e && e.message), ms: Date.now() - t0 });
      // Se algo já saiu no grupo antes do erro, a resposta tem de dizer isso.
      const d = classificarDesfecho({ resultado: null, envios: cap.envios, eventos: cap.eventos });
      return { ...d, ok: false, motivo: 'erro_interno', erro: String(e && e.message).slice(0, 200) };
    }
  }

  return { executar };
}

module.exports = { criarExecutorCaixaTool, registrarEnvio, registrarEvento, classificarDesfecho,
  textoContemValor, MOTIVO_HUMANO };
