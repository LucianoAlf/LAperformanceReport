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

test('consumidores da lista usam o helper operacional e partial nao depende de status ok', () => {
  assert.match(alunosPage, /import[\s\S]{0,500}podeCobrarInadimplenciaCanonica[\s\S]{0,200}from ['"]@\/lib\/inadimplenciaCanonica['"]/);
  assert.match(tabelaAlunos, /import[\s\S]{0,300}podeCobrarInadimplenciaCanonica[\s\S]{0,200}from ['"]@\/lib\/inadimplenciaCanonica['"]/);
  assert.match(alunosPage, /podeCobrarInadimplenciaCanonica\(inadimplenciaAtual\)/);
  assert.match(tabelaAlunos, /podeCobrarInadimplenciaCanonica\(inadimplenciaCanonica\)/);
  assert.doesNotMatch(alunosPage, /const\s+leituraCompleta\s*=\s*inadimplenciaAtual\.status\s*===\s*['"]ok['"]/);
  assert.doesNotMatch(tabelaAlunos, /status\s*===\s*['"]ok['"]\s*&&\s*inadimplenciaInfoCanonica\.totalFaturas/);
});

test('banner separa cobranca confirmada de reconciliacao sem contaminar totais', () => {
  assert.match(tabelaAlunos, /totalMatriculas/);
  assert.match(tabelaAlunos, /inadimplências confirmadas — cobrança liberada/u);
  assert.match(tabelaAlunos, /sourceMissingCount/);
  assert.match(tabelaAlunos, /faturas aguardando reconciliação — fora da cobrança/u);

  const confirmedSection = tabelaAlunos.match(/const inadimplenciaConfirmada[\s\S]*?const reconciliacaoPendente/)?.[0] ?? '';
  assert.match(confirmedSection, /totalMatriculas/);
  assert.match(confirmedSection, /totalFaturas/);
  assert.match(confirmedSection, /totalAtualizado/);
  assert.doesNotMatch(confirmedSection, /sourceMissingCount/);
});

test('estados bloqueados sao distintos e incomplete explica os motivos amigavelmente', () => {
  assert.match(tabelaAlunos, /Dados de inadimplência desatualizados — lista bloqueada/u);
  assert.match(tabelaAlunos, /Leitura financeira inválida — cobrança bloqueada/u);
  assert.match(tabelaAlunos, /Falha na leitura financeira — cobrança bloqueada/u);
  assert.match(tabelaAlunos, /blockReasons/);
  assert.doesNotMatch(tabelaAlunos, /nenhuma cobrança é liberada com leitura parcial/iu);
});

test('filtro canonico so existe com gate valido e nao repete status ativo local', () => {
  const liveFilterStart = alunosPage.indexOf('if (filtros.inadimplente_emusys_live');
  const liveFilterEnd = alunosPage.indexOf('if (filtros.anamnese)', liveFilterStart);
  const liveFilter = alunosPage.slice(liveFilterStart, liveFilterEnd);
  assert.match(liveFilter, /cobrancaInadimplenciaLiberada/);
  assert.match(liveFilter, /inadimplente_emusys/);
  assert.doesNotMatch(liveFilter, /\.status/);

  assert.match(tabelaAlunos, /cobrancaLiberada\s*&&\s*inadimplenciaInfoCanonica\.total\s*>\s*0/);
  assert.match(tabelaAlunos, /Filtrar ativos inadimplentes/);
  assert.match(alunosPage, /inadimplente_emusys_live:\s*false/);
});

test('expiracao limpa flags e filtro, recarrega uma vez e sempre limpa o timer', () => {
  assert.match(alunosPage, /freshUntil/);
  assert.match(alunosPage, /window\.setTimeout/);
  assert.match(alunosPage, /window\.clearTimeout/);
  assert.match(alunosPage, /tempoAteExpirar\s*<=\s*0/);
  assert.match(alunosPage, /inadimplente_emusys:\s*undefined/);
  assert.match(alunosPage, /setFiltros\(prev\s*=>[\s\S]{0,250}inadimplente_emusys_live:\s*false/);
  assert.match(alunosPage, /carregarDadosRef\.current\(\)/);
});

test('associacao financeira preserva unidade mais matricula e nunca usa nome ou student id', () => {
  const canonicalJoin = alunosPage.match(/const inadimplenciaMap[\s\S]*?setAlunos\(alunosComInadimplenciaEmusys\)/)?.[0] ?? '';
  assert.match(canonicalJoin, /chaveInadimplenciaMatricula\(aluno\.unidade_id, aluno\.emusys_matricula_id\)/);
  assert.match(canonicalJoin, /chaveInadimplenciaMatricula\(oc\.unidade_id, oc\.emusys_matricula_id\)/);
  assert.doesNotMatch(canonicalJoin, /\.nome|emusys_student_id/);
});

test('atualizar agora recarrega a leitura real e nunca trata 429 como sucesso', () => {
  assert.match(tabelaAlunos, /httpStatus\s*===\s*429/);
  assert.match(tabelaAlunos, /next_attempt_at/);
  assert.match(tabelaAlunos, /await onRecarregar\(\)/);
  assert.doesNotMatch(tabelaAlunos, /ultimoSyncMaisAntigo\s*:\s*new Date/);
});
