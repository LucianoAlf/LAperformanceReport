import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const alunosPage = readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8');
const tabelaAlunos = readFileSync('src/components/App/Alunos/TabelaAlunos.tsx', 'utf8');
const canonicalClient = readFileSync('src/lib/inadimplenciaCanonica.ts', 'utf8');
const refreshEdge = readFileSync(
  'supabase/functions/atualizar-inadimplencia-emusys/index.ts',
  'utf8',
);

test('lista de alunos le a RPC canonica e nao o booleano da jornada', () => {
  assert.match(alunosPage, /\.rpc\(\s*['"]get_inadimplencia_canonica['"]/);
  assert.match(alunosPage, /normalizarInadimplenciaCanonica/);
  assert.match(alunosPage, /indexarInadimplenciaPorMatricula/);
  assert.doesNotMatch(
    alunosPage,
    /\.from\(\s*['"]aluno_jornada_matricula_disciplina['"]\)[\s\S]{0,300}inadimplente_emusys/,
  );
});

test('banner e filtro recebem status, total corrigido e timestamp da leitura canonica', () => {
  assert.match(tabelaAlunos, /inadimplenciaCanonica/);
  assert.match(tabelaAlunos, /totalAtualizado/);
  assert.match(tabelaAlunos, /ultimoSyncMaisAntigo/);
  assert.match(tabelaAlunos, /queue_status/);
  assert.match(tabelaAlunos, /snapshot_complete/);
  assert.doesNotMatch(tabelaAlunos, /valor\s*\+=\s*a\.valor_parcela/);
  assert.doesNotMatch(tabelaAlunos, /\(Emusys ao vivo\)/);
});

test('cliente canonico falha fechado em stale ou erro e agrega faturas por matricula', () => {
  assert.match(canonicalClient, /status\s*===\s*['"]stale['"]/);
  assert.match(canonicalClient, /items:\s*\[\]/);
  assert.match(canonicalClient, /new Map/);
  assert.match(canonicalClient, /valor_atualizado/);
  assert.match(canonicalClient, /sync_completed_at/);
});

test('botao de atualizar usa a fila unica e a edge nao mantem uma segunda verdade', () => {
  assert.match(refreshEdge, /refresh-contas-receber/);
  assert.match(refreshEdge, /include_backlog/);
  assert.match(refreshEdge, /queue_status/);
  assert.match(refreshEdge, /next_attempt_at/);
  assert.doesNotMatch(refreshEdge, /\/matriculas\?/);
  assert.doesNotMatch(refreshEdge, /\.update\(\s*\{\s*inadimplente_emusys/);

  assert.match(tabelaAlunos, /data\?\.ok\s*===\s*true/);
  assert.match(tabelaAlunos, /data\?\.queue_status\s*===\s*['"]succeeded['"]/);
  assert.match(tabelaAlunos, /data\?\.snapshot_complete\s*===\s*true/);
});
