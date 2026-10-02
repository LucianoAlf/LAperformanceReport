#!/usr/bin/env node
'use strict';

// VENDA DE INGRESSO × LOJINHA (02/10/2026). Substitui o hotfix 906f691f (evento
// hardcoded) pelo trilho próprio com config de evento/lote fora do código.
//
// Caso real (CG 18:21): "2 ingressos LA Session Felipe Alves" (R$ 80) virou card de
// LOJINHA com o artista tratado como aluno. Risco nº 1: caderno/camisa custam o mesmo
// que 2 ingressos — o VALOR NUNCA CLASSIFICA. Ingresso só por sinal explícito; produto
// citado vai para a lojinha; sem sinal, a Sol pergunta.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('./_alvo.cjs');
const ing = require(path.join(path.dirname(require.resolve('./_alvo.cjs')), '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-ingressos.cjs'));

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const falhas = [];
const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

const CONFIG_LOTE1 = ing.validarConfigIngressos({ schema_version: 1, eventos: [
  { id: 'la-session-felipe-alves', nome: 'LA Session – Felipe Alves',
    aliases: ['la session', 'l.a session'], lotes: [{ nome: '1º lote', preco: 40 }] },
] });
const CONFIG_LOTE2 = ing.validarConfigIngressos({ schema_version: 1, eventos: [
  { id: 'la-session-felipe-alves', nome: 'LA Session – Felipe Alves',
    aliases: ['la session', 'l.a session'],
    lotes: [{ nome: '1º lote', preco: 40 }, { nome: '2º lote', preco: 45, a_partir_de: '2026-01-01' }] },
] });
checar(CONFIG_LOTE1.ok && CONFIG_LOTE2.ok, 'configs de teste deveriam ser válidas');

function novo({ ocrValor = 80, config = CONFIG_LOTE1, interpretar = { categoria: 'lojinha', aluno: 'Felipe Alves', forma: 'pix' } } = {}) {
  const enviadas = []; const lancamentos = []; const logs = [];
  let seq = 0; let interpretacoes = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: `COMPROVANTE PIX\nVALOR PAGO R$ ${ocrValor},00\n02/10/2026`, status: 'ok', file_bytes: 88000 }),
    visaoFn: async () => null,
    interpretarFn: async () => { interpretacoes++; return interpretar; },
    identidadeFn: async () => ({ identificado: true, nome: 'Operadora Teste' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    lancarFn: async (p) => { lancamentos.push(p); return { ok: true, movimentacao_id: 'MOV1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    ingressosConfigFn: () => config,
    log: (o) => logs.push(o),
  });
  return { h, enviadas, lancamentos, logs, get interpretacoes() { return interpretacoes; } };
}
let _id = 0;
const foto = (body, extra = {}) => ({ chatId: CHAT, senderPhone: '5521990000001', messageId: 'F' + (++_id),
  body, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'], ...extra });
const texto = (body, extra = {}) => ({ chatId: CHAT, senderPhone: '5521990000001', messageId: 'T' + (++_id),
  body, hasMedia: false, ...extra });
const ultimo = (A) => String(A.enviadas.at(-1) || '');

(async () => {
  // ---- 1) caso real: foto + "2 ingressos LA Session Felipe Alves" (R$ 80) → 2 × R$ 40, sem aluno
  {
    const A = novo();
    const r = await A.h.handle(foto('2 ingressos LA Session Felipe Alves'));
    checar(r.acao === 'preview_venda_ingresso', `caso real deveria abrir card de ingresso; veio ${JSON.stringify(r)}`);
    checar(A.interpretacoes === 0, 'ingresso explícito decide antes do LLM que chamou o artista de aluno');
    const card = ultimo(A);
    checar(/VENDA DE INGRESSO/.test(card), 'card deveria ter o bloco VENDA DE INGRESSO');
    checar(/R\$\s*80,00/.test(card), 'card deveria mostrar R$ 80,00');
    checar(/2 × R\$\s*40,00 \(1º lote\)/.test(card), `card deveria mostrar 2 × R$ 40,00 (1º lote): ${card}`);
    checar(/Sem aluno — venda para fora/.test(card), 'card deveria dizer que não há aluno');
    checar(!/\*ALUNO\*/.test(card), 'card de ingresso não tem bloco ALUNO');
    checar(/Categoria: venda/.test(card), 'categoria venda');
    checar(/Posso lançar/.test(card), 'card de sempre: "Posso lançar?"');
    const pend = A.h._pendentes.get(CHAT)[0];
    checar(pend && pend.aluno == null, 'Felipe Alves não pode virar aluno');
    checar(pend && pend.descricao === 'Venda de ingresso – LA Session – Felipe Alves – 2 × R$ 40,00', `descrição errada: ${pend && pend.descricao}`);
    checar(A.lancamentos.length === 0, 'nada grava antes do pode');
    const rp = await A.h.handle(texto('pode', { quotedMessageId: pend.previewId }));
    checar(rp.acao === 'lancado', `pode deveria lançar; veio ${JSON.stringify(rp)}`);
    const l = A.lancamentos[0] || {};
    checar(A.lancamentos.length === 1, 'uma única escrita');
    checar(Number(l.valor) === 80 && l.categoria === 'venda' && l.aluno == null && !l.aluno_id && !l.fatura_id,
      `lançamento deveria ser venda R$ 80 sem aluno/fatura: ${JSON.stringify(l)}`);
    checar(l.descricao === 'Venda de ingresso – LA Session – Felipe Alves – 2 × R$ 40,00', `descrição gravada: ${l.descricao}`);
  }

  // ---- 2) "2 ingressos Isac Jamba - Pista" (evento NÃO configurado) → ingresso, sem preço inventado
  {
    const A = novo();
    const r = await A.h.handle(foto('2 ingressos Isac Jamba - Pista'));
    checar(r.acao === 'preview_venda_ingresso', `Isac Jamba deveria ser ingresso; veio ${JSON.stringify(r)}`);
    const card = ultimo(A);
    checar(/Evento: Isac Jamba - Pista/.test(card), `rótulo do evento livre: ${card}`);
    checar(/Quantidade: 2/.test(card) && !/×/.test(card), 'sem preço configurado: quantidade declarada, sem fórmula');
    const pend = A.h._pendentes.get(CHAT)[0];
    checar(pend && pend.aluno == null && pend.descricao === 'Venda de ingresso – Isac Jamba - Pista – 2 ingressos', `descrição: ${pend && pend.descricao}`);
  }
  // "Ingresso Isac Jamba - VIP" de R$ 65: setor/ingresso explícitos, artista nunca aluno
  {
    const A = novo({ ocrValor: 65 });
    const r = await A.h.handle(foto('Ingresso Isac Jamba - VIP'));
    checar(r.acao === 'preview_venda_ingresso', `VIP deveria ser ingresso; veio ${JSON.stringify(r)}`);
    checar(A.h._pendentes.get(CHAT)[0].aluno == null, 'artista não vira aluno');
  }
  // Setor sozinho também é sinal explícito ("Isac Jamba - Pista" sem a palavra ingresso)
  {
    const A = novo({ ocrValor: 40 });
    const r = await A.h.handle(foto('Isac Jamba - Pista'));
    checar(r.acao === 'preview_venda_ingresso', `setor Pista deveria ser ingresso; veio ${JSON.stringify(r)}`);
  }

  // ---- 3) "ingresso 45" com o 2º lote configurado → 1 × R$ 45
  {
    const A = novo({ config: CONFIG_LOTE2 });
    const r = await A.h.handle(texto('ingresso LA Session 45 pix'));
    checar(r.acao === 'preview_venda_ingresso', `ingresso 45 deveria abrir card; veio ${JSON.stringify(r)}`);
    checar(/1 × R\$\s*45,00 \(2º lote\)/.test(ultimo(A)), `2º lote: ${ultimo(A)}`);
    const B = novo({ config: CONFIG_LOTE2, ocrValor: 90 });
    await B.h.handle(foto('ingressos LA Session'));
    checar(/2 × R\$\s*45,00 \(2º lote\)/.test(ultimo(B)), `R$ 90 no 2º lote = 2 × 45: ${ultimo(B)}`);
  }

  // ---- 4) valor que não fecha com o lote continua ingresso, sem quantidade, "Posso lançar?"
  {
    const A = novo({ ocrValor: 97 });
    const r = await A.h.handle(foto('ingressos LA Session'));
    checar(r.acao === 'preview_venda_ingresso', `R$ 97 continua ingresso; veio ${JSON.stringify(r)}`);
    const card = ultimo(A);
    checar(/não deduzi/.test(card) && !/\d+ × R\$/.test(card), `sem quantidade: ${card}`);
    checar(/Posso lançar/.test(card), 'mesmo sem quantidade, "Posso lançar?"');
    checar(A.h._pendentes.get(CHAT)[0].descricao === 'Venda de ingresso – LA Session – Felipe Alves', 'descrição sem quantidade');
    // Quantidade declarada que não fecha: avisa, não bloqueia, não inventa preço
    const B = novo({ ocrValor: 70 });
    const rb = await B.h.handle(foto('2 ingressos LA Session'));
    checar(rb.acao === 'preview_venda_ingresso', `2 ingressos por 70 continua card; veio ${JSON.stringify(rb)}`);
    checar(/2 × R\$\s*40,00 \(1º lote\) daria R\$\s*80,00, mas o valor é R\$\s*70,00/.test(ultimo(B)), `aviso de divergência: ${ultimo(B)}`);
  }

  // ---- 5) LOJINHA continua lojinha (produto citado vence; valor igual ao de ingresso não importa)
  {
    const A = novo({ interpretar: { categoria: 'lojinha', aluno: null, forma: 'pix' } });
    const r = await A.h.handle(texto('vendi um caderno 80 pix'));
    checar(r.acao !== 'preview_venda_ingresso' && r.acao !== 'venda_natureza_perguntada', `caderno 80 é lojinha; veio ${JSON.stringify(r)}`);
    checar(/Categoria: lojinha/.test(ultimo(A)) && /R\$\s*80,00/.test(ultimo(A)), `card de lojinha R$ 80: ${ultimo(A)}`);
    const B = novo();
    const rb = await B.h.handle(texto('vendi um caderno 80'));
    checar(rb.acao === 'lojinha_texto_sem_forma', `caderno 80 sem forma pergunta a forma da LOJINHA; veio ${JSON.stringify(rb)}`);
    const C = novo({ ocrValor: 60, interpretar: { categoria: 'lojinha', aluno: null, forma: 'pix' } });
    const rc = await C.h.handle(texto('venda de corda 60 pix'));
    checar(rc.acao !== 'preview_venda_ingresso' && /Categoria: lojinha/.test(ultimo(C)), `corda é lojinha; veio ${JSON.stringify(rc)} ${ultimo(C)}`);
    const D = novo({ ocrValor: 60, interpretar: { categoria: 'lojinha', aluno: null, forma: 'pix' } });
    const rd = await D.h.handle(foto('venda de corda'));
    checar(rd.acao === 'preview_enviado' && /Categoria: lojinha/.test(ultimo(D)), `foto de corda é lojinha; veio ${JSON.stringify(rd)}`);
    // Produto + alias do evento → produto vence (camiseta do evento é lojinha)
    checar(ing.classificarNaturezaVenda('camiseta LA Session', { config: CONFIG_LOTE1, detectarProduto: mod.detectarLojinhaProduto }) === null,
      'produto citado vence alias de evento');
  }

  // ---- 6) sem sinal claro → pergunta, nunca chute
  {
    const A = novo();
    const r = await A.h.handle(texto('80 pix'));
    checar(r.acao === 'venda_natureza_perguntada', `"80 pix" deveria perguntar; veio ${JSON.stringify(r)}`);
    checar(/ingresso/.test(ultimo(A)) && /lojinha/.test(ultimo(A)) && /Nada foi lançado/.test(ultimo(A)), 'pergunta cita as opções');
    checar((A.h._pendentes.get(CHAT) || []).length === 0 && A.lancamentos.length === 0, '"80 pix" não abre card nem grava');
    // "venda 80 pix" → pergunta ingresso ou lojinha; resposta continua o caso
    const B = novo();
    const rb = await B.h.handle(texto('venda 80 pix'));
    checar(rb.acao === 'venda_natureza_perguntada', `"venda 80 pix" deveria perguntar; veio ${JSON.stringify(rb)}`);
    checar(/venda de ingresso\* ou \*da lojinha/.test(ultimo(B)), `pergunta ingresso × lojinha: ${ultimo(B)}`);
    const rr = await B.h.handle(texto('ingresso LA Session'));
    checar(rr.acao === 'preview_venda_ingresso', `resposta "ingresso" deveria abrir card; veio ${JSON.stringify(rr)}`);
    checar(/2 × R\$\s*40,00/.test(ultimo(B)), 'resposta reaproveita o valor original');
    const C = novo();
    await C.h.handle(texto('venda 80 pix'));
    const rl = await C.h.handle(texto('lojinha, caderno'));
    checar(rl.acao !== 'preview_venda_ingresso' && /Categoria: lojinha/.test(ultimo(C)), `resposta "lojinha" vira lojinha; veio ${JSON.stringify(rl)}`);
    // O próximo caso do mesmo autor NÃO é sequestrado como resposta
    const I = novo();
    await I.h.handle(texto('venda 80 pix'));
    const ri = await I.h.handle(texto('parcela 10/2026 aluno Fulano R$ 400 pix'));
    checar(ri.acao !== 'preview_venda_ingresso' && !(I.logs.some((l) => l.acao === 'venda_natureza_respondida')),
      `mensagem nova com valor não é resposta; veio ${JSON.stringify(ri)}`);
    // Citando a pergunta, "é de aluno" é resposta (e não vira ingresso)
    const J = novo({ interpretar: { categoria: null, aluno: null, forma: 'pix' } });
    const rj0 = await J.h.handle(foto('venda'));
    const perguntaId = 'MSG' + J.enviadas.length;
    const rj = await J.h.handle(texto('é de aluno', { quotedMessageId: perguntaId }));
    checar(J.logs.some((l) => l.acao === 'venda_natureza_respondida') && rj.acao !== 'preview_venda_ingresso',
      `resposta citada "é de aluno" continua o caso sem ingresso; veio ${JSON.stringify(rj0)} → ${JSON.stringify(rj)}`);
    // Foto só com "venda" (sem item, sem ingresso) → pergunta; a resposta abre o ingresso
    const D = novo({ interpretar: { categoria: 'lojinha', aluno: null, forma: 'pix' } });
    const rd = await D.h.handle(foto('venda'));
    checar(rd.acao === 'venda_natureza_perguntada', `foto "venda" sem item pergunta; veio ${JSON.stringify(rd)}`);
    const rd2 = await D.h.handle(texto('é ingresso'));
    checar(rd2.acao === 'preview_venda_ingresso', `resposta à pergunta da foto abre ingresso; veio ${JSON.stringify(rd2)}`);
    checar(/Evento não identificado/.test(ultimo(D)), 'sem evento citado: card avisa');
    // O LLM dizer `venda` (receita de banda, 31/08) NÃO abre o trilho de ingresso
    const G = novo({ interpretar: { categoria: 'venda', aluno: null, forma: 'pix' } });
    const rg = await G.h.handle(foto('PG Bora Gravar - StarLine'));
    checar(rg.acao !== 'preview_venda_ingresso' && !/VENDA DE INGRESSO/.test(ultimo(G)), `palpite do LLM não vira ingresso; veio ${JSON.stringify(rg)}`);
    // Número sozinho é resposta de lista (estorno/cheques), não "80 pix"
    const H = novo();
    const rh = await H.h.handle(texto('5'));
    checar(rh.acao !== 'venda_natureza_perguntada', `"5" sozinho não pergunta; veio ${JSON.stringify(rh)}`);
    // Ingresso + produto juntos → pergunta
    const E = novo();
    const re = await E.h.handle(foto('ingresso e camiseta'));
    checar(re.acao === 'venda_natureza_perguntada', `ingresso + produto pergunta; veio ${JSON.stringify(re)}`);
    // Conversa sobre ingresso não dispara nada (CG 01/10)
    const F = novo();
    const rf = await F.h.handle(texto('Jereh, quais os valores dos ingressos?'));
    checar(!['preview_venda_ingresso', 'venda_natureza_perguntada', 'venda_ingresso_sem_valor'].includes(rf.acao)
      && F.enviadas.length === 0, `conversa não aciona; veio ${JSON.stringify(rf)}`);
  }

  // ---- 7) nomes de artista/aluno: parcela com o mesmo nome não é show
  checar(ing.classificarNaturezaVenda('parcela 10/2026 aluno Felipe Alves R$ 400 pix',
    { config: CONFIG_LOTE1, detectarProduto: mod.detectarLojinhaProduto }) === null, 'parcela do aluno Felipe Alves não é evento');
  checar(ing.classificarNaturezaVenda('Parcela 10/2026 LA Session', { config: CONFIG_LOTE1,
    detectarProduto: mod.detectarLojinhaProduto }) === null, 'alias + parcela → fluxo de aluno');
  checar((ing.classificarNaturezaVenda('ingresso + parcela 10/2026', { config: CONFIG_LOTE1,
    detectarProduto: mod.detectarLojinhaProduto }) || {}).motivo === 'ingresso_e_parcela', 'ingresso + parcela pergunta');
  checar(ing.classificarNaturezaVenda('entrada do passaporte 300 pix', { config: CONFIG_LOTE1,
    detectarProduto: mod.detectarLojinhaProduto }) === null, '"entrada" de pagamento não é ingresso');

  // ---- 8) config: arquivo inválido/ausente falha fechado; hot-reload sem restart
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ing-'));
    const arq = path.join(dir, 'ingressos-eventos.json');
    checar(ing.carregarConfigIngressos({ caminho: arq }).eventos.length === 0, 'ausente → sem eventos');
    fs.writeFileSync(arq, '{ quebrado');
    checar(ing.carregarConfigIngressos({ caminho: arq }).ok === false, 'JSON inválido → ok=false');
    fs.writeFileSync(arq, JSON.stringify({ schema_version: 1, eventos: [{ id: 'x-evento', nome: 'Evento X', aliases: ['evento x'], lotes: [{ preco: 40 }] }] }));
    const t = new Date(Date.now() + 5000); fs.utimesSync(arq, t, t);
    const c1 = ing.carregarConfigIngressos({ caminho: arq });
    checar(c1.ok && c1.eventos[0].lotes[0].preco === 40, 'config válida carregada');
    fs.writeFileSync(arq, JSON.stringify({ schema_version: 1, eventos: [{ id: 'x-evento', nome: 'Evento X', aliases: ['evento x'], lotes: [{ preco: 45.5 }] }] }));
    const t2 = new Date(Date.now() + 10000); fs.utimesSync(arq, t2, t2);
    checar(ing.carregarConfigIngressos({ caminho: arq }).eventos[0].lotes[0].preco === 45.5, 'troca de lote relida sem restart');
    checar(!ing.validarConfigIngressos({ schema_version: 1, eventos: [{ id: 'y', nome: 'Y', aliases: [] }] }).ok, 'evento sem alias é recusado');
    checar(!ing.validarConfigIngressos({ schema_version: 1, eventos: [{ id: 'z-ok', nome: 'Zeta', aliases: ['zeta show'], lotes: [{ preco: -1 }] }] }).ok, 'preço negativo é recusado');
    // Exemplo versionado é válido
    const ex = path.join(path.dirname(require.resolve(path.join(path.dirname(require.resolve('./_alvo.cjs')), '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-ingressos.cjs'))), 'ingressos-eventos.example.json');
    checar(ing.validarConfigIngressos(JSON.parse(fs.readFileSync(ex, 'utf8'))).ok, 'ingressos-eventos.example.json deveria ser válido');
    // Sem config, o caso real continua ingresso (sem quantidade inventada)
    const A = novo({ config: { ok: false, eventos: [] } });
    const r = await A.h.handle(foto('2 ingressos LA Session Felipe Alves'));
    checar(r.acao === 'preview_venda_ingresso' && /Quantidade: 2/.test(ultimo(A)) && !/×/.test(ultimo(A)),
      `sem config: ingresso com quantidade declarada e sem preço; veio ${JSON.stringify(r)} ${ultimo(A)}`);
  }

  // ---- 9) fail-closed de valor e de forma (herdado do hotfix)
  {
    const A = novo();
    const r = await A.h.handle(texto('2 ingressos LA Session pix'));
    checar(r.acao === 'venda_ingresso_sem_valor' && A.lancamentos.length === 0, `sem valor pergunta valor, não calcula 2×40; veio ${JSON.stringify(r)}`);
    const B = novo();
    const rb = await B.h.handle(texto('2 ingressos LA Session R$ 80'));
    checar(rb.acao === 'venda_ingresso_sem_forma', `sem forma pergunta forma; veio ${JSON.stringify(rb)}`);
    const C = novo({ ocrValor: 70 });
    const rc = await C.h.handle(foto('2 ingressos LA Session R$ 80'));
    checar(rc.acao === 'venda_ingresso_valor_inseguro' && (C.h._pendentes.get(CHAT) || []).length === 0,
      `legenda 80 × comprovante 70 falha fechado; veio ${JSON.stringify(rc)}`);
  }

  if (falhas.length) {
    console.error('VERMELHO venda de ingresso:\n  - ' + falhas.join('\n  - '));
    process.exit(1);
  }
  console.log('VERDE venda de ingresso: sinal explícito, lote configurável, lojinha intacta, pergunta sem sinal, sem aluno e fail-closed');
})().catch((e) => { console.error('ERRO:', e && e.stack); process.exit(1); });
