// Pagamento composto: UMA movimentação quitando N faturas (25/09/2026).
//
// Caso de aceite: Lucas Azevedo de Barros (CG) pagou o contrato inteiro num
// cartão de R$ 4.752 — 12 parcelas de R$ 396, de 09/2026 a 08/2027. O card de
// quitação já mostrava os meses, mas o lançamento saía vinculado a UMA fatura
// (a canônica, a 1ª do período). `sol_caixa_lancar_recebimento` aceita
// `fatura_ids` e grava 1 movimentação com N filhas.
//
// Em produção as 12 faturas dele JÁ têm dono (foram lançadas pelo formulário),
// então lá o comportamento certo é justamente "não revincular" — coberto no
// cenário D. Aqui o caminho feliz roda com as 12 simuladas como livres.
//
// Prova, com o código real (sendFn/lancarFn fakes, nada vai ao WhatsApp nem ao caixa):
//   A. seleção pura: período inteiro de uma matrícula, fora passaporte e fatura com dono;
//   B. derivarVinculo: quitação resolvida -> fatura_ids; não resolvida -> SEM fatura
//      (nunca a canônica sozinha, que seria vínculo parcial);
//   C. handler inteiro: card mostra as 12, `pode` emite fatura_ids com 12 e valor TOTAL;
//   D. faturas já vinculadas: card avisa e o lançamento sai sem vínculo.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const AUTOR = '5521900000009';
const MATRICULA = 2733001;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// 12 parcelas reais do Lucas (liquido 396), + passaporte no período + fatura de
// OUTRA matrícula da mesma pessoa em 09/2026 (quem faz 2 cursos).
const COMPS = [];
for (let i = 0; i < 12; i += 1) {
  const m = ((8 + i) % 12) + 1; const a = 2026 + Math.floor((8 + i) / 12);
  COMPS.push({ iso: `${a}-${String(m).padStart(2, '0')}-01`, mm: `${String(m).padStart(2, '0')}/${a}` });
}
const FATURAS = COMPS.map((c, i) => ({
  id: uuid(50305 + i), competencia: c.iso, status: i === 0 ? 'paga' : 'aberta',
  descricao: `Parcela ${c.mm} do curso de Bateria`, valor_original: 440,
  desconto_fixo: 0, desconto_condicional: 44, emusys_matricula_id: MATRICULA,
})).concat([
  { id: uuid(90001), competencia: '2026-09-01', status: 'aberta', descricao: 'Passaporte',
    valor_original: 400, desconto_fixo: 0, desconto_condicional: 0, emusys_matricula_id: null },
  { id: uuid(90002), competencia: '2026-09-01', status: 'aberta', descricao: 'Parcela 09/2026 do curso de Canto',
    valor_original: 400, desconto_fixo: 0, desconto_condicional: 0, emusys_matricula_id: 999 },
]);
const IDS_LUCAS = FATURAS.slice(0, 12).map((f) => f.id);

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

(async () => {
  const sel = mod.selecionarFaturasQuitacao;
  const periodo = { inicio: '09/2026', fim: '08/2027' };

  // A. seleção pura
  const a1 = sel(FATURAS, new Set(), { ...periodo, matriculaPreferida: MATRICULA });
  ok(a1.ok && a1.n === 12 && a1.soma === 4752, `A1: esperava 12 faturas somando 4752 -> ${JSON.stringify(a1).slice(0, 160)}`);
  ok(a1.ok && a1.ids.every((id) => IDS_LUCAS.includes(id)), 'A1b: entrou fatura que não é do contrato (passaporte ou outro curso)');
  ok(a1.curso === 'Bateria', `A1c: curso -> ${a1.curso}`);
  const a2 = sel(FATURAS, new Set([IDS_LUCAS[4]]), { ...periodo, matriculaPreferida: MATRICULA });
  ok(!a2.ok && a2.motivo === 'faturas_ja_vinculadas', `A2: fatura com dono virou candidata -> ${a2.motivo}`);
  const a3 = sel(FATURAS.filter((f) => f.id !== IDS_LUCAS[6]), new Set(), { ...periodo, matriculaPreferida: MATRICULA });
  ok(!a3.ok && a3.motivo === 'periodo_incompleto', `A3: mês faltando não recusou -> ${a3.motivo}`);
  const outraMatricula = FATURAS.slice(0, 12).map((f) => ({ ...f, id: f.id.replace('4000-8000', '4000-9000'), emusys_matricula_id: 777 }));
  const a4 = sel(FATURAS.concat(outraMatricula), new Set(), { ...periodo });
  ok(!a4.ok && a4.motivo === 'mais_de_uma_matricula', `A4: duas matrículas completas sem desempate -> ${a4.motivo}`);
  const a5 = sel(FATURAS.concat(outraMatricula), new Set(), { ...periodo, matriculaPreferida: MATRICULA });
  ok(a5.ok && a5.ids[0] === IDS_LUCAS[0], 'A5: com a matrícula do aluno como desempate, deveria escolher a dele');
  const a6 = sel(FATURAS, new Set(), { inicio: '09/2026', fim: '09/2026' });
  ok(!a6.ok, 'A6: período de 1 mês não é quitação');

  // B. derivarVinculo
  const dv = mod.derivarVinculo;
  const canonica = { ok: true, fatura: { aluno_id: 245, canonical_fatura_id: IDS_LUCAS[0], competencia: '2026-09-01' } };
  const b1 = dv({ canonica, multiplas: true, quitacao: { faturas: { ...a1, aluno_id: 245 } } });
  ok(b1.fatura_id === null && Array.isArray(b1.fatura_ids) && b1.fatura_ids.length === 12 && b1.aluno_id === 245,
    `B1: -> ${JSON.stringify(b1).slice(0, 160)}`);
  const b2 = dv({ canonica, multiplas: true, quitacao: { faturas: { ok: false, motivo: 'faturas_ja_vinculadas' } } });
  ok(b2.fatura_id === null && !b2.fatura_ids && b2.aluno_id === 245, `B2: quitação sem faturas vinculou algo -> ${JSON.stringify(b2)}`);
  const b3 = dv({ canonica });
  ok(b3.fatura_id === IDS_LUCAS[0] && !b3.fatura_ids, 'B3: pagamento simples mudou de comportamento');

  // C. handler inteiro
  const fixture = (ocupadas) => {
    const enviadas = []; const lancados = []; let seq = 0;
    const h = mod.criarHandlerFinanceiro({
      grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
      sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
      ocrFn: async () => ({ texto: '', status: 'texto_vazio' }),
      visaoFn: async () => null,
      interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Lucas Azevedo de Barros', competencia: '09/2026', forma: 'cartao' }),
      identidadeFn: async () => ({ identificado: true, nome: 'Vitoria' }),
      duplicataFn: async () => ({ ja_lancado: false }),
      responsavelFn: async () => ({ ok: true, aluno_nome: 'Lucas Azevedo de Barros', responsavel_nome: 'Responsavel Teste' }),
      canonicaFn: async () => ({ ok: true, aluno_nome: 'Lucas Azevedo de Barros', motivo_escolha: 'valor_exato',
        fatura: { canonical_fatura_id: IDS_LUCAS[0], aluno_id: 245, tipo_fatura: 'parcela',
          descricao: 'Parcela 09/2026 do curso de Bateria', competencia: '2026-09-01', status: 'aberta',
          valor_da_parcela: 396, numero_parcela: 1, total_parcelas_contrato: 12 } }),
      casarFn: async () => null,
      pagadorFn: async () => ({ ok: false }),
      faturasMesFn: async () => null,
      faturasQuitacaoFn: async (unidadeId, alunoId, q) => {
        if (unidadeId !== UNIDADE || alunoId !== 245) return { ok: false, motivo: 'chamada_errada' };
        return { ...sel(FATURAS, new Set(ocupadas), { inicio: q.inicio, fim: q.fim, matriculaPreferida: MATRICULA }), aluno_id: 245 };
      },
      lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-' + lancados.length, valor: Number(p.valor), forma: p.forma }; },
      log: () => {},
    });
    return { h, enviadas, lancados };
  };
  const LEGENDA = 'Quitação do contrato - parcelas de 09/2026 a 08/2027 do aluno Lucas Azevedo de Barros - R$4.752,00 cartão de crédito 12x';

  const C = fixture([]);
  const r1 = await C.h.handle({ chatId: CHAT, senderPhone: AUTOR, messageId: 'LUCAS-1', body: LEGENDA,
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg' });
  const card = C.enviadas.join('\n');
  ok(r1 && /preview/.test(String(r1.acao)), `C0: card não nasceu -> ${r1 && r1.acao}`);
  ok(/Vou vincular \*12 faturas\* do curso de Bateria/.test(card), `C1: card não mostrou as 12 faturas:\n${card.slice(0, 600)}`);
  ok(/09\/2026 a 08\/2027/.test(card), 'C2: card sem o período');
  const r2 = await C.h.handle({ chatId: CHAT, senderPhone: AUTOR, messageId: 'LUCAS-2', body: 'pode', hasMedia: false });
  const p = C.lancados[0];
  ok(r2 && r2.acao === 'lancado', `C3: pode não lançou -> ${r2 && r2.acao}`);
  ok(p && Array.isArray(p.fatura_ids) && p.fatura_ids.length === 12 && p.fatura_ids.every((id) => IDS_LUCAS.includes(id)),
    `C4: fatura_ids errado -> ${p && JSON.stringify(p.fatura_ids)}`);
  ok(p && !p.fatura_id, `C5: mandou fatura_id junto -> ${p && p.fatura_id}`);
  ok(p && Number(p.valor) === 4752, `C6: valor não é o TOTAL -> ${p && p.valor}`);
  ok(p && p.aluno_id === 245, `C7: aluno_id -> ${p && p.aluno_id}`);
  ok(p && /^Parcelas 09\/2026 a 08\/2027 do curso de Bateria - Lucas Azevedo de Barros/.test(String(p.descricao || '')),
    `C8: descrição -> ${p && p.descricao}`);
  ok(C.lancados.length === 1, `C9: esperava 1 movimentação, veio ${C.lancados.length}`);

  // D. produção real: as 12 já têm dono -> avisa e lança sem vínculo
  const D = fixture(IDS_LUCAS);
  await D.h.handle({ chatId: CHAT, senderPhone: AUTOR, messageId: 'LUCAS-D1', body: LEGENDA,
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg' });
  const cardD = D.enviadas.join('\n');
  ok(/Não vou vincular faturas \(parte delas já está vinculada a outro lançamento\)/.test(cardD),
    `D1: card não avisou as faturas com dono:\n${cardD.slice(0, 600)}`);
  await D.h.handle({ chatId: CHAT, senderPhone: AUTOR, messageId: 'LUCAS-D2', body: 'pode', hasMedia: false });
  const pd = D.lancados[0];
  ok(pd && !pd.fatura_id && !pd.fatura_ids, `D2: lançou com vínculo em fatura que já tem dono -> ${pd && JSON.stringify({ f: pd.fatura_id, fs: pd.fatura_ids })}`);

  if (falhas.length) { console.log('RESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('RESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
