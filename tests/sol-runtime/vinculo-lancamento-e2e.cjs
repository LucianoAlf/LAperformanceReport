// E2E do VÍNCULO ESTRUTURADO no lançamento simples (aluno_id + fatura_id).
//
// Roda o handler REAL contra o BANCO REAL (canonicaFn não é stubada — é o ponto do
// teste), com sendFn/lancarFn fakes: não manda WhatsApp e não grava no caixa.
//
// 🔴 O QUE ESTE TESTE PROTEGE: `alunos` é MATRÍCULA, não pessoa. A Valentina (Recreio)
// tem 3 linhas — 697 Canto, 1099 Teclado, 1542 Power Kids. O `aluno_id` de topo que
// `sol_caixa_casar_parcela` devolve vem do match por NOME (limit 1 arbitrário entre as
// três, nomes idênticos) e apontava **Power Kids** junto com uma fatura de **Canto**.
// Se alguém "simplificar" o runtime para ler aquele campo, o caso 1 quebra na hora.
const mod = require('./_alvo.cjs');
require('./_alvo.cjs').exigeCredenciais('vinculo-lancamento');  // usa as RPCs reais

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';   // Recreio

// matrículas reais da Valentina — o teste falha se ela deixar de ter 2+ cursos
const VALENTINA_CANTO = 697;
const VALENTINA_TECLADO = 1099;
const VALENTINA_POWER_KIDS = 1542;   // o id ERRADO, que o match por nome devolve

function novoHandler() {
  const enviadas = [];
  const logs = [];
  let lancou = null;
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ texto: '', status: 'timeout' }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: null, aluno: null, competencia: null, forma: null }),
    identidadeFn: async () => ({ identificado: true, nome: 'Fernanda' }),
    // determinismo: ela JÁ foi lançada hoje de verdade, e a trava de duplicata
    // mataria o teste por um motivo que não é o que estamos medindo.
    duplicataFn: async () => ({ ja_lancado: false }),
    lancarFn: async (p) => {
      lancou = p;
      return { ok: true, movimentacao_id: 'MOV-TESTE', valor: Number(p.valor),
               forma: p.forma, categoria: p.categoria, descricao: p.descricao };
    },
    log: (o) => logs.push(o),
  });
  return { handle: (ev) => h.handle(ev), enviadas, logs, get lancou() { return lancou; } };
}

async function rodar(legenda, resposta, tag) {
  const H = novoHandler();
  await H.handle({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'ORIG-' + tag,
    body: legenda, hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
  });
  await H.handle({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'RESP-' + tag,
    body: resposta, hasMedia: false,
  });
  const v = H.logs.filter((l) => l && l.acao === 'vinculo_lancamento').pop() || null;
  return { payload: H.lancou, vinculo: v, msgs: H.enviadas };
}

(async () => {
  const falhas = [];

  // ── CASO 1: parcela de aluna com 3 cursos ─────────────────────────────────────────
  // O vínculo tem de apontar a matrícula do CURSO DA FATURA, jamais a do match por nome.
  {
    const r = await rodar(
      'Parcela do mês de agosto da aluna Valentina Mendes Rodrigues Aleixo R$418,91',
      'pode, pix', 'C1');
    console.log('CASO 1 (parcela, aluna com 3 cursos)');
    console.log('  vinculo:', JSON.stringify(r.vinculo));
    console.log('  payload.aluno_id:', r.payload && r.payload.aluno_id,
                '| fatura_id:', r.payload && (r.payload.fatura_id ? 'sim' : 'não'));
    if (!r.payload) {
      falhas.push('CASO 1: não chegou a lançar');
    } else {
      if (r.payload.aluno_id === VALENTINA_POWER_KIDS) {
        falhas.push('CASO 1: 🔴 REGRESSÃO — pegou o aluno_id do match por NOME (Power Kids '
          + VALENTINA_POWER_KIDS + '), curso que não tem fatura nenhuma');
      }
      if (r.payload.aluno_id !== VALENTINA_CANTO && r.payload.aluno_id !== VALENTINA_TECLADO) {
        falhas.push('CASO 1: aluno_id não é uma matrícula com fatura (esperava '
          + VALENTINA_CANTO + ' ou ' + VALENTINA_TECLADO + ', veio ' + r.payload.aluno_id + ')');
      }
      if (!r.payload.fatura_id) falhas.push('CASO 1: parcela casada mas sem fatura_id');
    }
  }

  // ── CASO 2: passaporte de quem tem matrícula única ────────────────────────────────
  {
    const r = await rodar(
      'Passaporte promocional da aluna Giovanna Oliveira da Cunha - R$400,00',
      'pode, cartão', 'C2');
    console.log('CASO 2 (passaporte, matrícula única)');
    console.log('  vinculo:', JSON.stringify(r.vinculo));
    console.log('  payload.aluno_id:', r.payload && r.payload.aluno_id);
    // ⚠️ Fonte canônica stale (sync de faturas caído) => o V3 recusa confirmar e o
    // "pode" é bloqueado DE PROPÓSITO. Isso é o runtime acertando com o ambiente
    // quebrado — vira SKIP declarado, não falha (28/08: sync de ago/26 morrendo com
    // statement timeout; casos 2/3 bloqueavam com "fonte oficial indisponível").
    const fonteIndisponivel2 = r.msgs && r.msgs.some((t) => /fonte oficial|n[aã]o vou lan[cç]ar com/i.test(t));
    if (!r.payload && fonteIndisponivel2) console.log('  ⚠️ SKIP: fonte canônica indisponível (sync de faturas stale) — fail-closed correto');
    else if (!r.payload) falhas.push('CASO 2: não chegou a lançar');
    else if (r.payload.categoria !== 'passaporte') falhas.push('CASO 2: categoria ' + r.payload.categoria);
    // aluno_id aqui é desejável mas não obrigatório: se a Giovanna ganhar um 2º curso,
    // a RPC passa a devolver null de propósito e ISSO ESTÁ CERTO. O que não pode é vir
    // um id qualquer — por isso a asserção é sobre coerência, não sobre presença.
    else if (r.payload.aluno_id != null && !Number.isInteger(r.payload.aluno_id)) {
      falhas.push('CASO 2: aluno_id não é inteiro: ' + r.payload.aluno_id);
    }
  }

  // ── CASO 3: composto (2 cursos num pagamento só) ──────────────────────────────────
  // Canto 418,91 + Teclado 395,90 = 814,81. São matrículas DIFERENTES, então o honesto
  // é não vincular: um movimento não pode apontar duas matrículas nem duas faturas.
  {
    const r = await rodar(
      'Parcela do mês de agosto da aluna Valentina Mendes Rodrigues Aleixo R$814,81',
      'pode, pix', 'C3');
    console.log('CASO 3 (composto Canto+Teclado)');
    console.log('  vinculo:', JSON.stringify(r.vinculo));
    console.log('  payload.aluno_id:', r.payload && r.payload.aluno_id,
                '| fatura_id:', r.payload && (r.payload.fatura_id ? 'sim' : 'não'));
    // O composto de ago/26 só resolve com as faturas de ago FRESCAS; com o sync morto,
    // a canônica devolve a parcela de setembro, o valor diverge e o fail-closed segura
    // o "pode" — mesma causa, outra frase. Skip declarado nos dois formatos.
    const fonteIndisponivel3 = r.msgs && r.msgs.some((t) => /fonte oficial|n[aã]o vou lan[cç]ar com/i.test(t));
    if (!r.payload && fonteIndisponivel3) { console.log('  ⚠️ SKIP: fonte canônica indisponível — fail-closed correto'); }
    else     if (!r.payload) {
      falhas.push('CASO 3: não chegou a lançar');
    } else if (r.vinculo && r.vinculo.fonte === 'composto_multiplas_matriculas') {
      if (r.payload.aluno_id) falhas.push('CASO 3: composto de 2 matrículas não pode vincular aluno_id');
      if (r.payload.fatura_id) falhas.push('CASO 3: composto não pode vincular UMA fatura');
    } else {
      console.log('  (composto não resolveu neste run — fonte:', r.vinculo && r.vinculo.fonte, ')');
      if (r.payload.fatura_id && r.payload.aluno_id) {
        // caiu no casamento simples: aí o par tem de ser coerente, e é o caso 1 de novo
        if (r.payload.aluno_id === VALENTINA_POWER_KIDS) {
          falhas.push('CASO 3: 🔴 vinculou Power Kids, curso sem fatura');
        }
      }
    }
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — vínculo sai da fatura, nunca do match por nome');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
