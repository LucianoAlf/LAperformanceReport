import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const exportador = readFileSync('supabase/functions/export-contas-receber/index.ts', 'utf8');
const farmerHook = readFileSync(
  'src/components/App/Administrativo/PainelFarmer/hooks/useAlertas.ts',
  'utf8',
);
const farmerDashboard = readFileSync(
  'src/components/App/Administrativo/PainelFarmer/DashboardTab.tsx',
  'utf8',
);
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
  assert.match(exportador, /status\s*!==\s*['"]ok['"]/);
  assert.match(exportador, /valor_atualizado/);
  assert.match(exportador, /fresh_until/);
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
  assert.doesNotMatch(sql, /from\s+sync_run_items/i);
  assert.match(sql, /status.*incomplete|incomplete.*status/is);
  assert.match(sql, /freshness|frescor/i);
});
