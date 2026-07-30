import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql',
  'utf8',
);
const kpisVivos = readFileSync('src/lib/kpisAlunosVivosCanonicos.ts', 'utf8');
const estadoOperacional = readFileSync('src/lib/estadoOperacionalAlunos.ts', 'utf8');
const alunosPage = readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8');
const administrativo = readFileSync(
  'src/components/App/Administrativo/AdministrativoPage.tsx',
  'utf8',
);
const relatorioAdministrativo = readFileSync(
  'src/components/App/Administrativo/ModalRelatorio.tsx',
  'utf8',
);
const tabGestao = readFileSync('src/components/GestaoMensal/TabGestao.tsx', 'utf8');
const tabRetencao = readFileSync('src/components/GestaoMensal/TabRetencao.tsx', 'utf8');
const carteiraProfessor = readFileSync(
  'src/lib/carteiraProfessorDetalheCanonica.ts',
  'utf8',
);
const relatorioAdminWhatsApp = readFileSync(
  'supabase/functions/relatorio-admin-whatsapp/index.ts',
  'utf8',
);
const biAgentTools = readFileSync(
  'supabase/functions/bi-agent-lamusic/tools.ts',
  'utf8',
);
const biAgentSchema = readFileSync(
  'supabase/functions/bi-agent-lamusic/schema.ts',
  'utf8',
);
const autocompleteAluno = readFileSync(
  'src/components/ui/AutocompleteAluno.tsx',
  'utf8',
);
const simuladorTurma = readFileSync('src/hooks/useSimuladorTurma.ts', 'utf8');
const sucessoPresenca = readFileSync(
  'src/components/App/SucessoCliente/PresencaTab.tsx',
  'utf8',
);

test('mes vivo do Dashboard e Analytics consome a RPC canonica', () => {
  assert.match(kpisVivos, /\.rpc\(\s*['"]get_kpis_alunos_canonicos['"]/);
  assert.doesNotMatch(
    kpisVivos,
    /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]ativo['"]\s*,\s*['"]trancado['"]\s*\]\s*\)/,
  );
  assert.doesNotMatch(
    kpisVivos,
    /row\.status\s*===\s*['"]ativo['"]\s*\|\|\s*row\.status\s*===\s*['"]trancado['"]/,
  );
});

test('listas vivas e trancamentos atuais possuem contratos separados', () => {
  assert.match(
    migration,
    /create or replace function public\.get_alunos_ativos_atuais_canonicos/i,
  );
  assert.match(
    estadoOperacional,
    /\.rpc\(\s*['"]get_alunos_ativos_atuais_canonicos['"]/,
  );
  assert.match(
    estadoOperacional,
    /\.rpc\(\s*['"]get_trancamentos_atuais_canonicos['"]/,
  );
  assert.match(
    estadoOperacional,
    /\.rpc\(\s*['"]get_trancamentos_periodo_canonicos['"]/,
  );
});

test('Administrativo distingue base atual de movimento historico', () => {
  for (const label of [
    'Ativos agora',
    'Trancados agora',
    'Trancamentos no período',
  ]) {
    assert.match(administrativo, new RegExp(label, 'i'));
  }

  assert.doesNotMatch(
    administrativo,
    /Alunos ativos, trancados e em aviso pr[eé]vio/i,
  );
  assert.doesNotMatch(
    administrativo,
    /\.in\(\s*['"]status['"]\s*,\s*\[[^\]]*['"]trancado['"][^\]]*\]\s*\)/,
  );
});

test('Alunos e relatorio administrativo nao refazem a classificacao viva no cliente', () => {
  assert.match(alunosPage, /fetchAlunosAtivosAtuaisCanonicos/);
  assert.match(administrativo, /fetchAlunosAtivosAtuaisCanonicos/);
  assert.doesNotMatch(
    relatorioAdministrativo,
    /\.in\(\s*['"]status['"]\s*,\s*\[[^\]]*['"]trancado['"][^\]]*\]\s*\)/,
  );
});

test('Gestao e Retencao nao usam trancado em denominador vivo', () => {
  assert.doesNotMatch(
    tabGestao,
    /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]ativo['"]\s*,\s*['"]trancado['"]\s*\]\s*\)/,
  );
  assert.doesNotMatch(
    tabRetencao,
    /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]ativo['"]\s*,\s*['"]trancado['"]\s*\]\s*\)/,
  );
  assert.match(tabRetencao, /fetchTotalAlunosAtivosCanonicos/);
});

test('carteira do professor permanece ancorada em jornada ativa', () => {
  assert.match(carteiraProfessor, /status_matricula\s*===\s*['"]ativa['"]/);
  assert.doesNotMatch(
    carteiraProfessor,
    /status_matricula\s*===\s*['"]trancada['"]/,
  );
});

test('relatorios distinguem estoque atual de movimento de trancamento', () => {
  assert.match(relatorioAdministrativo, /trancamentos_periodo/i);
  assert.match(relatorioAdministrativo, /Trancados agora/i);
  assert.match(relatorioAdministrativo, /Trancamentos no per(?:í|i|Ã­)odo/i);
  assert.match(relatorioAdminWhatsApp, /const trancadosAtuais = kpisAlunos\.trancados/);
  assert.match(relatorioAdminWhatsApp, /Trancados agora/i);
  assert.match(relatorioAdminWhatsApp, /Trancamentos no per(?:í|i|Ã­)odo/i);
  assert.doesNotMatch(
    relatorioAdminWhatsApp,
    /const trancados\s*=\s*trancamentosMov\.length/,
  );
});

test('alerta financeiro nao inclui matricula trancada na base viva', () => {
  assert.doesNotMatch(
    alunosPage,
    /status\s*===\s*['"]ativo['"]\s*\|\|\s*status\s*===\s*['"]trancado['"]/,
  );
});

test('agente de BI usa o estado operacional canonico nos resumos vivos', () => {
  assert.match(
    biAgentTools,
    /\.rpc\(\s*['"]get_kpis_alunos_admin_operacional['"]/,
  );
  assert.match(biAgentTools, /vw_alunos_estado_operacional_v131/);
  assert.match(biAgentSchema, /vw_alunos_estado_operacional_v131/);
  assert.doesNotMatch(
    biAgentSchema,
    /WHERE\s+a\.status\s*=\s*['"]ativo['"]/i,
  );
});


test('seletores e ferramentas vivas usam alunos ativos canonicos', () => {
  assert.match(migration, /create or replace function public\.buscar_alunos_ativos_atuais_canonicos/i);
  assert.ok(autocompleteAluno.includes(".rpc('buscar_alunos_ativos_atuais_canonicos'"));
  assert.ok(!autocompleteAluno.includes(".eq('status', 'ativo')"));
  for (const consumer of [simuladorTurma, sucessoPresenca]) {
    assert.match(consumer, /fetchAlunosAtivosAtuaisCanonicos/);
    assert.ok(!consumer.includes(".in('status', ['ativo', 'aviso_previo'])"));
    assert.ok(!consumer.includes(".eq('status', 'ativo')"));
  }
});
