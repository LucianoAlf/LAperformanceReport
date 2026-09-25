// E2E do portão agent-first × correção de ALUNO em card clássico aberto
// (Fefê/Recreio, 25/09/2026 — continuação do card-classico-complemento-gate).
//
// Com o card do Bernardo aberto, "Sol, o nome do aluno é Bernardo Neumann da
// Cunha" foi para o AGENTE (Recreio é agent-first). O agente não enxerga o card
// (ele sai do handler direto para o WhatsApp) e respondeu "nome completo
// corrigido" sem corrigir nada. O `handle` determinístico já sabia corrigir.
//
// Prova, com o handler REAL (sendFn/lancarFn fakes), que:
//   1. o portão SEGURA a correção rotulada do autor com card único (completo ou não);
//   2. o portão SEGURA a correção de outra pessoa quando ela CITA o card;
//   3. o portão NÃO segura: outra pessoa sem citar, nome solto sem rótulo,
//      frase que fala DO lançamento, `pode`, dois cards sem citação;
//   4. o handle corrige o aluno e remonta o card (nada é lançado);
//   5. o resumo para o agente descreve o card sem telefone e marca o que falta.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const FEFE = '5521900000001';
const OUTRA = '5521900000002';

function fixture(forma) {
  const enviadas = [];
  const lancados = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ texto: '', status: 'texto_vazio' }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Bernardo Neumann Cunha', competencia: '09/2026', forma }),
    identidadeFn: async () => ({ identificado: true, nome: 'Fernanda' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    responsavelFn: async (_u, n) => ({ ok: true, aluno_nome: n, responsavel_nome: 'Responsavel Teste' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    pagadorFn: async () => ({ ok: false }),
    faturasMesFn: async () => null,
    classificarCorrecaoFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-TESTE', valor: Number(p.valor) }; },
    log: () => {},
  });
  return { h, enviadas, lancados };
}

const comprovante = (id) => ({
  chatId: CHAT, senderPhone: FEFE, messageId: id,
  body: 'Parcela do mês de Setembro do aluno Bernardo Neumann Cunha - R$442,75',
  hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
});

(async () => {
  const falhas = [];
  const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
  const CORRECAO = 'Sol, o nome do aluno é Bernardo Neumann da Cunha';

  for (const forma of [null, 'pix']) {
    const tag = forma ? 'card completo' : 'card sem forma';
    const { h, enviadas, lancados } = fixture(forma);
    const r1 = await h.handle(comprovante('ORIG-' + tag));
    ok(r1 && ['preview_enviado', 'preview_incompleto_aguardando_complemento'].includes(r1.acao),
      `${tag} 0: card não nasceu -> ${r1 && r1.acao}`);
    const gate = (ev) => h.deveTratarComplementoDeterministico({ chatId: CHAT, hasMedia: false, ...ev });

    ok(gate({ senderPhone: FEFE, body: CORRECAO }) === true, `${tag} 1: não segurou correção rotulada do autor`);
    ok(gate({ senderPhone: FEFE, body: 'aluno: Bernardo Neumann da Cunha' }) === true, `${tag} 1b: não segurou "aluno: X"`);
    ok(gate({ senderPhone: OUTRA, body: CORRECAO, quotedMessageId: 'MSG1' }) === true, `${tag} 2: não segurou outra pessoa citando o card`);
    ok(gate({ senderPhone: OUTRA, body: CORRECAO }) === false, `${tag} 3a: segurou outra pessoa sem citação`);
    ok(gate({ senderPhone: FEFE, body: 'Bernardo Neumann da Cunha' }) === false, `${tag} 3b: segurou nome solto sem rótulo`);
    ok(gate({ senderPhone: FEFE, body: 'o aluno é Bernardo e a parcela é de setembro' }) === false, `${tag} 3c: segurou frase sobre o lançamento`);
    ok(gate({ senderPhone: FEFE, body: 'Sol, o nome do aluno é Bernardo' }) === false, `${tag} 3d: segurou nome de um token sem dois-pontos`);
    ok(gate({ senderPhone: OUTRA, body: CORRECAO, quotedMessageId: 'MSG-VELHA' }) === false, `${tag} 3e: segurou citação de card que não existe`);

    const resumo = h.resumoCardsAbertosParaAgente(CHAT);
    ok(resumo && /R\$ 442,75/.test(resumo) && /Bernardo/.test(resumo), `${tag} 5a: resumo sem valor/aluno -> ${resumo}`);
    ok(resumo && !/55219/.test(resumo), `${tag} 5b: resumo vazou telefone`);
    ok(resumo && (forma ? /aguardando pode/.test(resumo) : /FALTA forma/.test(resumo)), `${tag} 5c: resumo não marcou estado -> ${resumo}`);

    const r2 = await h.handle({ chatId: CHAT, senderPhone: FEFE, messageId: 'RESP-' + tag, body: CORRECAO, hasMedia: false });
    ok(r2 && r2.acao === 'preview_aluno_corrigido' && r2.aluno === 'Bernardo Neumann da Cunha',
      `${tag} 4: handle não corrigiu o aluno -> ${JSON.stringify(r2)}`);
    ok(/Bernardo Neumann da Cunha/.test(enviadas[enviadas.length - 1] || ''), `${tag} 4b: card remontado sem o nome novo`);
    ok(lancados.length === 0, `${tag} 4c: correção de nome LANÇOU dinheiro`);
  }

  // Dois cards abertos, sem citação: alvo ambíguo, fica fora do portão.
  {
    const { h } = fixture('pix');
    await h.handle(comprovante('ORIG-A'));
    await h.handle({ ...comprovante('ORIG-B'), body: 'Parcela do mês de Setembro da aluna Maria Teste Silva - R$300,00' });
    const n = h._pendentes.get(CHAT);
    ok(n && n.length === 2, `6-pre: esperava 2 cards abertos, veio ${n && n.length}`);
    if (n && n.length === 2) {
      ok(h.deveTratarComplementoDeterministico({ chatId: CHAT, hasMedia: false, senderPhone: FEFE, body: CORRECAO }) === false,
        '6: segurou correção com dois cards e sem citação');
    }
    ok(h.resumoCardsAbertosParaAgente('outro@g.us') === null, '7: resumo inventou card em grupo sem pendência');
  }

  if (falhas.length) { console.log('RESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('RESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });

// Bridge: o resumo do card entra no texto do agente, DEPOIS da observacao
// (texto persistido limpo) e so no caminho agent-first. Checagem estrutural,
// no mesmo padrao do agent-first-draft-identity-ocr-e2e.
{
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  const iCand = src.indexOf("event.caixaGovernancaAgentFirstCandidate = true;");
  const iResumo = src.indexOf('resumoCardsAbertosParaAgente(chatId)');
  const iObs = src.indexOf('observeGroupMessage(event);');
  const iInj = src.indexOf('[card_caixa_aberto: ${event.caixaCardsAbertos}]');
  const falhasB = [];
  if (!(iCand > 0 && iResumo > iCand && iResumo - iCand < 1200)) falhasB.push('bridge: resumo fora do ramo agent-first');
  if (!(iInj > iObs && iObs > 0)) falhasB.push('bridge: injecao antes da observacao');
  if (falhasB.length) { console.log('RESULTADO BRIDGE: FALHOU\n - ' + falhasB.join('\n - ')); process.exitCode = 1; }
}
