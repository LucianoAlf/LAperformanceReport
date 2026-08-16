import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const exportador = readFileSync('supabase/functions/export-contas-receber/index.ts', 'utf8');
const exportadorCanonico = readFileSync(
  'supabase/functions/_shared/inadimplenciaCanonicaExport.ts',
  'utf8',
);
const farmerHook = readFileSync(
  'src/components/App/Administrativo/PainelFarmer/hooks/useAlertas.ts',
  'utf8',
);
const farmerDashboard = readFileSync(
  'src/components/App/Administrativo/PainelFarmer/DashboardTab.tsx',
  'utf8',
);
const canonicalClient = readFileSync('src/lib/inadimplenciaCanonica.ts', 'utf8');
const financeiroClient = readFileSync('src/lib/financeiroFaturasEmusys.ts', 'utf8');
const modalRelatorio = readFileSync('src/components/App/Administrativo/ModalRelatorio.tsx', 'utf8');
const migrationPath = 'supabase/migrations/20260816013512_financeiro_faturas_relatorios_canonicos.sql';
const solInadimplenciaMigrations = readdirSync('supabase/migrations')
  .filter((name) => /^\d+_sol_caixa_inadimplentes.*\.sql$/u.test(name))
  .sort();
const latestSolInadimplenciaMigration = solInadimplenciaMigrations.at(-1);

test('exportacao de inadimplencia consome a RPC canonica e bloqueia leitura nao confiavel', () => {
  assert.match(exportador, /modo\s*===\s*['"]inadimplencia['"]/);
  assert.match(exportador, /\.rpc\(\s*['"]get_inadimplencia_canonica['"]/);
  assert.match(exportador, /prepararExportacaoInadimplenciaCanonica/);
  assert.doesNotMatch(exportador, /status\s*!==\s*['"]ok['"]/);
  assert.match(exportadorCanonico, /collection_allowed/);
  assert.match(exportadorCanonico, /collection_scope/);
  assert.match(exportadorCanonico, /valor_atualizado/);
  assert.match(exportadorCanonico, /fresh_until/);
  assert.doesNotMatch(exportadorCanonico, /unknown_invoices/);
});

test('exportacao de snapshot sinaliza frescor e nao serve stale por padrao', () => {
  assert.match(exportador, /stale_after/);
  assert.match(exportador, /require_fresh/);
  assert.match(exportador, /requireFresh\s*=\s*body\.require_fresh\s*!==\s*false/);
  assert.match(exportador, /is_fresh/);
});

test('painel farmer usa a leitura canonica, valor corrigido e estado de frescor', () => {
  assert.match(farmerHook, /\.rpc\(\s*['"]get_inadimplencia_canonica['"]/);
  assert.doesNotMatch(farmerHook, /\.from\(\s*['"]vw_farmer_inadimplentes['"]/);
  assert.match(farmerHook, /montarAlertasInadimplenciaCanonica/);
  assert.doesNotMatch(farmerHook, /collectionGraceDays:/);
  assert.doesNotMatch(farmerHook, /item\.dias_atraso\s*>=/);
  assert.match(farmerDashboard, /inadimplenciaCanonica\.status/);
  assert.match(farmerDashboard, /valor_atualizado/);
  assert.doesNotMatch(farmerDashboard, /item\.valor_parcela/);
});

test('relatorio financeiro le snapshot imutavel, aplica gate e anexa a leitura canonica', () => {
  assert.equal(existsSync(migrationPath), true, 'migration canonica de relatorios ausente');
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /create or replace function public\.get_financeiro_faturas_emusys/i);
  assert.match(sql, /from public\.sync_run_items/i);
  assert.doesNotMatch(sql, /from public\.emusys_faturas/i);
  assert.match(sql, /snapshot_complete\s*=\s*true/i);
  assert.match(sql, /stale_after/i);
  assert.match(sql, /source_missing\s+is\s+false/i);
  assert.match(sql, /get_inadimplencia_canonica/i);
  assert.match(sql, /inadimplencia_canonica/i);
});

test('consumidores do relatorio propagam status e frescor sem sobrepor historico fechado', () => {
  assert.match(financeiroClient, /status:\s*FinanceiroFaturasStatus/);
  assert.match(financeiroClient, /sync_completed_at/);
  assert.match(financeiroClient, /stale_after/);
  assert.match(financeiroClient, /status:\s*String\(payload\?\.status/);
  assert.match(modalRelatorio, /data\?\.status\s*!==\s*['"]ok['"]/);
  assert.match(modalRelatorio, /isPeriodoAtual\s*\?/);
  assert.match(modalRelatorio, /snapshot mensal fechado/i);
});

test('a lista da Sol consome a leitura canonica e nao replica o sync de faturas', () => {
  assert.ok(latestSolInadimplenciaMigration, 'migration da inadimplencia da Sol ausente');
  const sql = readFileSync(`supabase/migrations/${latestSolInadimplenciaMigration}`, 'utf8');
  assert.match(sql, /get_inadimplencia_canonica/i);
  assert.doesNotMatch(sql, /from\s+(?:public\.)?sync_run_items/i);
  assert.doesNotMatch(sql, /from\s+(?:public\.)?emusys_faturas/i);
  assert.doesNotMatch(sql, /inadimplente_emusys/i);
  assert.match(sql, /collection_allowed/i);
  assert.match(sql, /collection_scope/i);
  assert.match(sql, /canonical_status/i);
  assert.match(sql, /jsonb_array_elements\s*\(\s*coalesce\(v_canonical->'items'/i);
  assert.match(sql, /contact_resolution_status[^\n]+resolved/i);
  assert.match(sql, /aluno_id_canonico/i);
  assert.doesNotMatch(sql, /al\.emusys_student_id\s*=/i);
  assert.doesNotMatch(sql, /order\s+by\s+al\.updated_at/i);
  assert.match(sql, /p_carencia_dias\s+is\s+distinct\s+from\s+2/i);
  assert.match(sql, /p_multa_pct\s+is\s+distinct\s+from\s+0\.02/i);
  assert.match(sql, /p_mora_pct_mes\s+is\s+distinct\s+from\s+0\.01/i);
  for (const protectedRpc of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(sql, new RegExp(protectedRpc, 'i'));
  }
});

test('farmer usa helper para liberar partial confirmado sem decisao local de status', () => {
  assert.match(farmerHook, /podeCobrarInadimplenciaCanonica/);
  assert.match(farmerHook, /podeCobrarInadimplenciaCanonica\(estadoCanonico\)/);
  assert.doesNotMatch(farmerHook, /estadoCanonico\.status\s*===\s*['"]ok['"]/);
  assert.doesNotMatch(farmerHook, /\.eq\(\s*['"]status['"]\s*,\s*['"]ativo['"]\s*\)/);
  assert.match(farmerHook, /\.in\(\s*['"]id['"]\s*,\s*alunoIdsCanonicos\s*\)/);
  assert.match(farmerHook, /\.in\(\s*['"]unidade_id['"]\s*,\s*unidades\s*\)/);
  assert.doesNotMatch(farmerHook, /is_segundo_curso/);
  assert.doesNotMatch(farmerHook, /emusys_student_id/);
});

test('farmer expira uma vez, limpa cobranca e desfaz timer na troca de unidade', () => {
  assert.match(farmerHook, /freshUntil/);
  assert.match(farmerHook, /window\.setTimeout/);
  assert.match(farmerHook, /window\.clearTimeout/);
  assert.match(farmerHook, /tempoAteExpirar\s*<=\s*0/);
  assert.match(farmerHook, /setInadimplentes\(\[\]\)/);
  assert.match(farmerHook, /void fetchAlertas\(\)/);
  assert.match(farmerHook, /\[[^\]]*inadimplenciaCollectionAllowed[^\]]*unidadeId[^\]]*\]/);
});

test('dashboard mostra partial acionavel e reconciliacao separada sem misturar dinheiro', () => {
  assert.match(farmerDashboard, /podeCobrarInadimplenciaCanonica/);
  assert.match(farmerDashboard, /Inadimplências elegíveis — cobrança amigável D\+2/iu);
  assert.match(farmerDashboard, /faturas aguardando reconciliação — fora da cobrança/iu);
  assert.match(farmerDashboard, /fatura\(s\) com identidade inválida aguardando conciliação — fora da cobrança/iu);
  assert.match(farmerDashboard, /sourceMissingCount/);
  assert.match(farmerDashboard, /invalidIdentityInvoiceCount/);
  assert.match(farmerDashboard, /validationIssueCount/);
  assert.match(farmerDashboard, /contactResolutionPendingCount/);
  assert.match(farmerDashboard, /sem contato local unívoco/u);
  assert.match(farmerDashboard, /variant="success"/);

  const reconciliationNotice = farmerDashboard.match(/sourceMissingCount\s*>\s*0[\s\S]*?<\/div>\s*\)}/)?.[0] ?? '';
  const invalidIdentityNotice = farmerDashboard.match(/(?:invalidIdentityInvoiceCount|validationIssueCount)\s*>\s*0[\s\S]*?<\/div>\s*\)}/)?.[0] ?? '';
  assert.ok(reconciliationNotice, 'aviso independente de source_missing ausente');
  assert.ok(invalidIdentityNotice, 'aviso independente de identidade inválida ausente');
  assert.doesNotMatch(reconciliationNotice, /totalAtualizado|valor_atualizado|R\$/);
  assert.doesNotMatch(invalidIdentityNotice, /totalAtualizado|valor_atualizado|R\$/);
});

test('farmer aplica a carencia publicada pelo estado e nao um limiar local ambiguo', () => {
  assert.match(farmerHook, /montarAlertasInadimplenciaCanonica\(estadoCanonico/);
  assert.doesNotMatch(farmerHook, /dias_atraso\s*>=\s*2/);
  assert.doesNotMatch(farmerHook, /COBRANCA_AMIGAVEL_CARENCIA_DIAS/);
  assert.doesNotMatch(farmerHook, /collectionGraceDays:/);
});

test('farmer enriquece contato apenas pelo aluno_id canonico publicado pela RPC', () => {
  assert.match(farmerHook, /item\.aluno_id_canonico/);
  assert.match(farmerHook, /contact_resolution_status\s*===\s*['"]resolved['"]/);
  assert.match(farmerHook, /\.in\(\s*['"]id['"]\s*,\s*alunoIdsCanonicos\s*\)/);
  assert.doesNotMatch(farmerHook, /candidatos\[0\]|is_segundo_curso/);
  assert.match(canonicalClient, /contatosPorAluno/);
  assert.match(canonicalClient, /emusys_matricula_ids/);
  assert.match(farmerDashboard, /key=\{`\$\{item\.unidade_id\}:\$\{item\.aluno_id\}`\}/);
});

test('dashboard mantem stale incomplete e error bloqueados e distintos', () => {
  assert.match(farmerDashboard, /Dados de inadimplência desatualizados — cobrança bloqueada/u);
  assert.match(farmerDashboard, /Leitura financeira inválida — cobrança bloqueada/u);
  assert.match(farmerDashboard, /Falha na leitura financeira — cobrança bloqueada/u);
  assert.doesNotMatch(farmerDashboard, /nenhuma cobrança é liberada com leitura parcial/iu);
});
