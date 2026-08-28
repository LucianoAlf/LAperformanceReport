import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const helper = readFileSync(
  new URL('../supabase/functions/_shared/reconciliacao-grade-snapshot.ts', import.meta.url),
  'utf8',
);
const syncRunHelper = readFileSync(
  new URL('../supabase/functions/_shared/presenca-sync-run.ts', import.meta.url),
  'utf8',
);
const syncGrade = readFileSync(
  new URL('../supabase/functions/sync-grade-futura-emusys/index.ts', import.meta.url),
  'utf8',
);
const syncPresenca = readFileSync(
  new URL('../supabase/functions/sync-presenca-emusys/index.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20260827030500_presenca_roster_operacional.sql', import.meta.url),
  'utf8',
);

test('syncs delegam a remoção de grade à reconciliação protegida por fotografia', () => {
  assert.match(helper, /export async function reconciliarGradeSnapshotEmusys/u);
  assert.match(helper, /export async function reconciliarGradeSnapshotEmusysV1/u);
  assert.match(syncGrade, /montarSnapshotGradeEmusys/u);
  assert.match(syncGrade, /reconciliarGradeSnapshotEmusys/u);
  assert.match(
    syncGrade,
    /buscarTodasAulasEmusys(?:<[^>]+>)?\(\{/u,
    'a fotografia futura precisa rejeitar paginação incompleta do Emusys',
  );
  assert.match(syncPresenca, /montarSnapshotGradeEmusys/u);
  assert.match(syncPresenca, /reconciliarGradeSnapshotEmusys/u);
  assert.match(
    syncGrade,
    /aula\.data_hora_inicio\.split\(["'] ["']\)\[0\] <= dataFim/u,
    'a fotografia futura deve ignorar retorno do Emusys fora da janela pedida',
  );
  assert.match(
    syncPresenca,
    /aula\.data_hora_inicio\.split\(["'] ["']\)\[0\] <= dataFim/u,
    'a fotografia de metadados deve ignorar retorno do Emusys fora da janela pedida',
  );
  assert.match(
    syncPresenca,
    /aula\.data_hora_inicio\.split\(["'] ["']\)\[0\] === dataAlvo/u,
    'a fotografia diaria deve conter somente o proprio dia',
  );
  assert.match(
    syncPresenca,
    /async function fetchAulasDia[\s\S]*?return fetchAulasRange\(token, data, data\);/u,
    'a fotografia diaria precisa falhar fechada quando uma pagina do Emusys falhar',
  );

  assert.doesNotMatch(syncGrade, /\.update\(\{ cancelada: true \}\)/u);
  assert.doesNotMatch(
    syncPresenca,
    /from\(["']aula_alunos_emusys["']\)\s*\.delete\(\)/u,
    'o sync de presença não pode apagar roster sem a trava de presença da RPC',
  );
  assert.match(helper, /"incompleto"/u);
  assert.match(helper, /"ambiguo"/u);
  assert.match(
    syncGrade,
    /throw new Error\(["']PRESENCA_SYNC_AULA_GRAVACAO_FALHOU["']\)/u,
  );
  assert.match(
    syncGrade,
    /throw new Error\(["']PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU["']\)/u,
  );
  assert.match(
    syncGrade,
    /throw new Error\(["']PRESENCA_SYNC_MAPA_AULAS_INCOMPLETO["']\)/u,
  );
  assert.match(
    syncPresenca,
    /verificarIntegridadeMapaAulas\(\s*linhas,\s*idPorEmusysId,?\s*\)/u,
    'metadados precisa bloquear roster e reconcilia\u00e7\u00e3o quando o mapa do upsert estiver parcial',
  );
  assert.match(
    syncPresenca,
    /throw new Error\(["']PRESENCA_SYNC_MAPA_AULAS_INCOMPLETO["']\)/u,
    'metadados precisa falhar fechado quando o mapa do upsert estiver parcial',
  );
  assert.match(syncPresenca, /reconciliacaoGrade\.status !== ["']ok["']/u);
  assert.match(
    syncPresenca,
    /reconciliacaoGrade\.estados_gravados !== snapshotGrade\.length/u,
  );
  assert.match(
    migration,
    /when v_estado in \('incompleto', 'ambiguo'\) then 'revisao_estrutural'/u,
    'a RPC deve preservar o roster quando a fotografia depender de nome',
  );
  assert.doesNotMatch(syncPresenca, /gradeIncompleta = true/u);
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.aula_alunos_emusys/iu,
    'presença histórica e vínculo histórico devem sobreviver à reconciliação',
  );
  assert.doesNotMatch(
    migration,
    /'aluno_chave',\s*j\.aluno_chave/u,
    'a prévia não pode devolver chave que contenha nome ou data de nascimento',
  );
});

test('Edge dual preserva v1 e faz fallback exclusivamente pelo codigo PGRST202', () => {
  assert.match(helper, /type ReconciliacaoContrato\s*=\s*["']v2["']\s*\|\s*["']v1_fallback["']/u);
  assert.match(helper, /interface ResultadoReconciliacaoDual/u);
  assert.match(helper, /reconciliar_grade_snapshot_emusys_v2/u);
  assert.match(helper, /reconciliar_grade_snapshot_emusys_v1/u);
  assert.match(helper, /p_sync_run_id:\s*params\.syncRunId/u);
  assert.match(helper, /error\.code\s*===\s*["']PGRST202["']/u);
  assert.doesNotMatch(
    helper,
    /error\.message[\s\S]{0,160}(?:fallback|reconciliar_grade_snapshot_emusys_v1)/iu,
    'mensagem textual nunca pode decidir fallback',
  );
  assert.match(syncGrade, /syncRunId,\s*\n\s*unidadeId:\s*unidade\.id/u);
  assert.match(syncPresenca, /syncRunId,\s*\n\s*unidadeId:\s*unidade\.id/u);
  assert.match(syncGrade, /contrato:\s*reconciliacaoDual\.contrato/u);
  assert.match(syncPresenca, /contrato:\s*reconciliacaoDual\.contrato/u);
});

test('leases englobam a reconciliacao e novos logs usam somente ids datas e contagens', () => {
  const blocoGrade = syncGrade.slice(syncGrade.indexOf('for (const unidade of unidades)'));
  assert.ok(
    blocoGrade.indexOf('executarSyncPresencaComLease({')
      < blocoGrade.indexOf('fetchAulasRange(unidade.token'),
    'grade futura deve adquirir lease antes de ler e escrever a fotografia',
  );
  const inicioTrabalho = syncRunHelper.indexOf(
    'const resultado = await input.trabalho(',
  );
  const inicioFinalizacao = syncRunHelper.indexOf(
    'presenca_sync_finalizar_v1',
    inicioTrabalho,
  );
  assert.ok(
    inicioTrabalho >= 0 && inicioFinalizacao > inicioTrabalho,
    'finalizacao precisa ocorrer depois do trabalho que inclui a reconciliacao',
  );

  for (const source of [syncGrade, syncPresenca]) {
    assert.match(source, /reconciliacao_grade unidade_id=\$\{unidade\.id\}/u);
    assert.match(source, /data_inicio=\$\{/u);
    assert.match(source, /data_fim=\$\{/u);
    assert.match(source, /sync_run_id=\$\{syncRunId\}/u);
    assert.match(source, /contrato=\$\{reconciliacaoDual\.contrato\}/u);
    assert.match(source, /aulas_snapshot=\$\{snapshotGrade\.length\}/u);
    const inicioLog = source.indexOf(
      '`[sync-',
      source.indexOf('reconciliacao_grade unidade_id=${unidade.id}') - 30,
    );
    const fimLog = source.indexOf('`', inicioLog + 1);
    assert.ok(inicioLog >= 0 && fimLog > inicioLog);
    assert.doesNotMatch(
      source.slice(inicioLog, fimLog + 1),
      /aluno|nome|roster|telefone|snapshotGrade\s*\)|JSON\.stringify/u,
      'log de reconciliacao nao pode serializar PII ou roster',
    );
  }
});
