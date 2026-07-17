import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260715233500_otimiza_conciliacao_experimentais_segura.sql';
const alunosPagePath = 'src/components/App/Alunos/AlunosPage.tsx';
const comercialPagePath = 'src/components/App/Comercial/ComercialPage.tsx';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('conciliacao comercial executa como definer depois de validar usuario e unidade', () => {
  const migration = readOptional(migrationPath);

  assert.ok(migration, 'migration de desempenho e escopo comercial ainda nao existe');
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.get_conciliacao_experimentais_v2\s*\(/i);
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /from\s+public\.usuarios[\s\S]*auth_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /perfil\s*=\s*'unidade'[\s\S]*p_unidade_id\s+is\s+null/i);
  assert.match(migration, /p_unidade_id\s*<>\s*v_unidade_usuario/i);
  assert.match(migration, /usuario_tem_permissao\s*\([\s\S]*'comercial\.ver'/i);
  assert.match(migration, /get_conciliacao_experimentais_v2_legacy_p22_20260707/i);
});

test('implementacoes legadas deixam de ser chamaveis diretamente pelo frontend', () => {
  const migration = readOptional(migrationPath);

  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.get_conciliacao_experimentais_v2_legacy_p21_20260707[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.get_conciliacao_experimentais_v2_legacy_p22_20260707[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.get_conciliacao_experimentais_v2\([\s\S]*to\s+authenticated,\s*service_role/i,
  );
});

test('card de permanencia usa meses e nunca o LTV financeiro', () => {
  const page = readOptional(alunosPagePath);

  assert.match(page, /tempoPermanenciaCanonico\s*=\s*Number\([^;]*tempoPermanencia/i);
  assert.match(page, /ltvMedio:\s*Math\.round\(\(tempoPermanenciaCanonico\s*\|\|\s*ltvMedio\)/i);
  assert.doesNotMatch(page, /ltvCanonico\s*=\s*Number\([^;]*\.ltv\)/i);
});

test('relatorio comercial mostra carregamento e erro em vez de permanecer vazio', () => {
  const page = readOptional(comercialPagePath);

  assert.match(page, /relatorioGerando/);
  assert.match(page, /relatorioErro/);
  assert.match(page, /gerarRelatorioSelecionado/);
  assert.match(page, /catch\s*\(err\)[\s\S]*setRelatorioErro/i);
  assert.match(page, /N[aã]o foi poss[ií]vel gerar o relat[oó]rio/i);
});

test('seletor do relatorio diario nao aninha o controle do cron em outro botao', () => {
  const page = readOptional(comercialPagePath);
  const inicio = page.indexOf('data-testid="relatorio-diario-card"');
  const fim = page.indexOf('{/* Relatório Semanal */}', inicio);

  assert.ok(inicio >= 0, 'card do relatorio diario precisa de um container identificavel');
  assert.ok(fim > inicio, 'nao foi possivel delimitar o card do relatorio diario');

  const card = page.slice(inicio, fim);
  const seletor = card.indexOf('data-testid="selecionar-relatorio-diario"');
  const fimSeletor = card.indexOf('</button>', seletor);
  const controleCron = card.indexOf('data-testid="cron-comercial-control"');

  assert.ok(seletor >= 0, 'botao de selecao do relatorio diario nao foi encontrado');
  assert.ok(controleCron >= 0, 'controle do cron comercial nao foi encontrado');
  assert.ok(fimSeletor > seletor && fimSeletor < controleCron, 'controle do cron ficou aninhado no botao de selecao');
});
