import assert from 'node:assert/strict';
import test from 'node:test';

import { resolverConversaDaCaixa } from '../supabase/functions/_shared/caixa-conversa.ts';

const DEPTO = 'sucesso_aluno';
const CAIXA = 3;
const UNID_CG = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

// Stub do client Supabase com o mínimo da API fluente que a função usa.
// A tabela vive em memória; cada chamada fica registrada para o teste inspecionar.
function criarSupabaseFake({ conversas = [], falharInsertCom = null } = {}) {
  const linhas = conversas.map((c) => ({ ...c }));
  const chamadas = [];
  let proximoId = 1000;

  function casa(linha, filtros) {
    return Object.entries(filtros).every(([col, val]) => {
      if (val === null) return linha[col] === null || linha[col] === undefined;
      return String(linha[col] ?? '') === String(val);
    });
  }

  async function executar(ctx) {
    chamadas.push({ tabela: ctx.tabela, tipo: ctx.tipo, filtros: { ...ctx.filtros }, payload: ctx.payload });

    if (ctx.tipo === 'select') {
      const achadas = linhas.filter((l) => casa(l, ctx.filtros));
      if (ctx.single || ctx.maybeSingle) {
        if (achadas.length > 1 && ctx.maybeSingle) {
          // Reproduz o comportamento real do PostgREST: .maybeSingle() com 2+ linhas é erro.
          return { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } };
        }
        return { data: achadas[0] ?? null, error: null };
      }
      return { data: achadas, error: null };
    }

    if (ctx.tipo === 'insert') {
      if (falharInsertCom) return { data: null, error: falharInsertCom };
      const nova = { id: `conv-${proximoId++}`, ...ctx.payload };
      linhas.push(nova);
      return { data: nova, error: null };
    }

    if (ctx.tipo === 'update') {
      const alvo = linhas.filter((l) => casa(l, ctx.filtros));
      alvo.forEach((l) => Object.assign(l, ctx.payload));
      return { data: alvo, error: null };
    }

    return { data: null, error: null };
  }

  const client = {
    from(tabela) {
      const ctx = { tabela, filtros: {}, tipo: null, payload: null, single: false, maybeSingle: false };
      const builder = {
        select() { if (!ctx.tipo) ctx.tipo = 'select'; return builder; },
        insert(p) { ctx.tipo = 'insert'; ctx.payload = p; return builder; },
        update(p) { ctx.tipo = 'update'; ctx.payload = p; return builder; },
        eq(col, val) { ctx.filtros[col] = val; return builder; },
        is(col, val) { ctx.filtros[col] = val; return builder; },
        limit() { return builder; },
        order() { return builder; },
        maybeSingle() { ctx.maybeSingle = true; return executar(ctx); },
        single() { ctx.single = true; return executar(ctx); },
        then(resolve, reject) { return executar(ctx).then(resolve, reject); },
      };
      return builder;
    },
  };

  return { client, linhas, chamadas };
}

test('resolverConversaDaCaixa', async (t) => {
  await t.test('conversa EXTERNA com o mesmo número é vinculada ao aluno, não duplicada', async () => {
    // O caso Arílson: a conversa já existe (nasceu externa), o aluno agora é conhecido.
    const { client, linhas } = criarSupabaseFake({
      conversas: [{
        id: 'conv-arilson', whatsapp_jid: '5521974882061', departamento: DEPTO,
        aluno_id: null, unidade_id: null, telefone_externo: '5521974882061',
      }],
    });

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521974882061', departamento: DEPTO, caixaId: CAIXA,
      alunoId: 2492, unidadeId: UNID_CG,
    });

    assert.equal(r.conversaId, 'conv-arilson', 'reaproveita a conversa que já existe');
    assert.equal(linhas.length, 1, 'NÃO cria segunda conversa para o mesmo número');
    assert.equal(linhas[0].aluno_id, 2492, 'vincula o aluno');
    assert.equal(linhas[0].unidade_id, UNID_CG, 'preenche a unidade — é o que devolve a conversa à ADM');
  });

  await t.test('conversa já vinculada a um IRMÃO não troca de dono', async () => {
    // Mesmo número, dois filhos. Trocar o dono reescreveria o histórico do irmão.
    const { client, linhas } = criarSupabaseFake({
      conversas: [{
        id: 'conv-familia', whatsapp_jid: '5521999999999', departamento: DEPTO,
        aluno_id: 111, unidade_id: UNID_CG,
      }],
    });

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521999999999', departamento: DEPTO, caixaId: CAIXA,
      alunoId: 222, unidadeId: UNID_CG,
    });

    assert.equal(r.conversaId, 'conv-familia');
    assert.equal(linhas[0].aluno_id, 111, 'o dono original é preservado');
    assert.equal(r.alunoId, 111, 'a mensagem é gravada sob o dono da conversa, não sob quem pedimos');
  });

  await t.test('sem conversa prévia, cria já vinculada ao aluno e à unidade', async () => {
    const { client, linhas } = criarSupabaseFake();

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521970000001', departamento: DEPTO, caixaId: CAIXA,
      alunoId: 777, unidadeId: UNID_CG, nomeExterno: 'Fulano Responsável',
    });

    assert.ok(r.conversaId);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].aluno_id, 777);
    assert.equal(linhas[0].unidade_id, UNID_CG);
    assert.equal(linhas[0].whatsapp_jid, '5521970000001');
    assert.equal(linhas[0].departamento, DEPTO);
  });

  await t.test('sem alunoId (notificação interna da equipe) NUNCA vincula aluno', async () => {
    // A mesma função registra a notificação que vai para a Jessyca. Vincular um aluno
    // aqui transformaria a conversa dela na conversa do aluno recém-matriculado.
    const { client, linhas } = criarSupabaseFake();

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521984695110', departamento: DEPTO, caixaId: CAIXA,
      alunoId: null, unidadeId: null, nomeExterno: 'Jessyca',
    });

    assert.ok(r.conversaId);
    assert.equal(r.alunoId, null);
    assert.equal(linhas[0].aluno_id, null, 'segue como contato, sem dono');
    assert.equal(linhas[0].nome_externo, 'Jessyca');
  });

  await t.test('conversa externa NUNCA recebe unidade_id — senão o webhook perde a resposta', async () => {
    // processExternalAdminMessage procura a conversa externa com `unidade_id IS NULL`
    // (a caixa do Sucesso do Aluno é consolidada). Com a unidade preenchida ele não acha,
    // tenta inserir, bate em uq_admin_conversas_jid_depto e DESCARTA a mensagem recebida.
    const { client, linhas } = criarSupabaseFake();

    await resolverConversaDaCaixa(client, {
      jid: '5521955555555', departamento: DEPTO, caixaId: CAIXA,
      alunoId: null, unidadeId: UNID_CG, nomeExterno: 'Contato qualquer',
    });

    assert.equal(linhas[0].aluno_id, null);
    assert.equal(linhas[0].unidade_id, null, 'unidade só entra junto com o aluno');
  });

  await t.test('corrida com o webhook (23505 no insert) devolve a conversa que venceu', async () => {
    // uq_admin_conversas_jid_depto recusa o segundo insert do mesmo número.
    const { client } = criarSupabaseFake({
      conversas: [],
      falharInsertCom: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    // A conversa aparece entre o select e o insert (corrida real).
    const fake = criarSupabaseFake({ falharInsertCom: { code: '23505', message: 'duplicate key' } });
    fake.linhas.push({
      id: 'conv-corrida', whatsapp_jid: '5521970000002', departamento: DEPTO, aluno_id: null, unidade_id: null,
    });
    let primeiraLeitura = true;
    const original = fake.client.from;
    fake.client.from = (tabela) => {
      const b = original(tabela);
      if (tabela === 'admin_conversas' && primeiraLeitura) {
        const maybeSingleOriginal = b.maybeSingle;
        b.maybeSingle = () => { primeiraLeitura = false; return Promise.resolve({ data: null, error: null }); };
        void maybeSingleOriginal;
      }
      return b;
    };

    const r = await resolverConversaDaCaixa(fake.client, {
      jid: '5521970000002', departamento: DEPTO, caixaId: CAIXA, alunoId: 555, unidadeId: UNID_CG,
    });

    assert.equal(r.conversaId, 'conv-corrida', 'não perde a mensagem quando o insert colide');
    void client;
  });

  await t.test('nunca busca conversa por aluno_id — a chave é o número', async () => {
    // Buscar por aluno_id com .maybeSingle() quebra quando o aluno tem 2 conversas
    // (16 alunos já estão nessa situação hoje). A chave única real é (jid, departamento).
    const { client, chamadas } = criarSupabaseFake({
      conversas: [
        { id: 'c1', whatsapp_jid: '5521911111111', departamento: DEPTO, aluno_id: 42, unidade_id: UNID_CG },
        { id: 'c2', whatsapp_jid: '5521922222222', departamento: DEPTO, aluno_id: 42, unidade_id: UNID_CG },
      ],
    });

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521922222222', departamento: DEPTO, caixaId: CAIXA, alunoId: 42, unidadeId: UNID_CG,
    });

    assert.equal(r.conversaId, 'c2', 'acha a conversa do número certo, mesmo com o aluno tendo duas');
    const buscasPorAluno = chamadas.filter((c) => c.tipo === 'select' && 'aluno_id' in c.filtros);
    assert.equal(buscasPorAluno.length, 0, 'nenhuma leitura de conversa filtrada por aluno_id');
  });

  await t.test('jid com sufixo @s.whatsapp.net casa com o número puro gravado', async () => {
    const { client, linhas } = criarSupabaseFake({
      conversas: [{
        id: 'conv-sufixo', whatsapp_jid: '5521933333333', departamento: DEPTO, aluno_id: null, unidade_id: null,
      }],
    });

    const r = await resolverConversaDaCaixa(client, {
      jid: '5521933333333@s.whatsapp.net', departamento: DEPTO, caixaId: CAIXA,
      alunoId: 99, unidadeId: UNID_CG,
    });

    assert.equal(r.conversaId, 'conv-sufixo', 'não cria duplicata por causa do sufixo do jid');
    assert.equal(linhas.length, 1);
  });
});
