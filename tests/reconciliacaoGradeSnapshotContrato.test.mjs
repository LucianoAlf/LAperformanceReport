import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const helper = readFileSync(
  new URL('../supabase/functions/_shared/reconciliacao-grade-snapshot.ts', import.meta.url),
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
  assert.match(syncGrade, /status: ["']upsert_aulas_incompleto_preservado["']/u);
  assert.match(syncGrade, /status: ["']roster_incompleto_preservado["']/u);
  assert.match(syncPresenca, /status: ["']roster_incompleto_preservado["']/u);
  assert.match(
    syncPresenca,
    /verificarIntegridadeMapaAulas\(\s*linhas,\s*idPorEmusysId,?\s*\)/u,
    'metadados precisa bloquear roster e reconcilia\u00e7\u00e3o quando o mapa do upsert estiver parcial',
  );
  assert.match(
    syncPresenca,
    /status: ["']upsert_aulas_incompleto_preservado["']/u,
    'metadados precisa expor que preservou a grade em vez de reconciliar parcialmente',
  );
  assert.match(
    migration,
    /when v_estado in \('incompleto', 'ambiguo'\) then 'revisao_estrutural'/u,
    'a RPC deve preservar o roster quando a fotografia depender de nome',
  );
  assert.match(syncPresenca, /gradeIncompleta = true/u);
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
