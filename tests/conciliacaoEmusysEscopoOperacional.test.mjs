import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const syncPath = join(process.cwd(), 'supabase', 'functions', 'sync-matriculas-emusys', 'index.ts');
const uiPath = join(process.cwd(), 'src', 'components', 'App', 'Alunos', 'ConciliacaoMatriculas.tsx');
const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir)
  .find((name) => /_conciliacao_emusys_fora_escopo_operacional\.sql$/u.test(name));
const migrationPath = migrationName ? join(migrationsDir, migrationName) : '';

test('sync separa a fila operacional do processamento historico da matricula', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /function alunoEntraNaFilaOperacional\s*\(/,
    'o sync deve declarar a regra explicita de elegibilidade da fila operacional',
  );
  assert.match(
    source,
    /status\s*===\s*'ativo'[\s\S]*status\s*===\s*'trancado'[\s\S]*status\s*===\s*'aviso_previo'/,
    'ativo, trancado e aviso previo devem permanecer elegiveis para a fila',
  );
  assert.match(
    source,
    /for\s*\(const a of alunosParaReconciliar\)[\s\S]*?if\s*\(\s*!alunoEntraNaFilaOperacional\(a\)\s*\)\s*\{\s*continue;/,
    'o sync deve continuar tratando o ciclo historico, mas parar antes de gerar sugestoes e divergencias para aluno fora da operacao',
  );
});

test('sync operacional fecha pendencias de alunos fora da operacao sem apagar auditoria', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /\.rpc\(\s*'resolver_pendencias_conciliacao_fora_escopo_operacional'/,
    'o cron diario deve chamar a limpeza de historico como parte da sincronizacao',
  );
  assert.match(
    source,
    /pendencias_fora_escopo/,
    'a execucao deve registrar quantas pendencias historicas foram fechadas',
  );
});

test('tela de atributos usa o estado operacional atual como segunda defesa', () => {
  const source = readFileSync(uiPath, 'utf8');

  assert.match(
    source,
    /function atributoForaEscopoOperacional\s*\(/,
    'a tela deve declarar a mesma regra de exclusao para uma mudanca de estado recem-chegada',
  );
  assert.match(
    source,
    /select\('id, nome, instagram_nao_possui, status, is_ex_aluno'\)/,
    'a tela deve consultar o estado canonico junto com o nome do aluno',
  );
  assert.match(
    source,
    /filter\(row\s*=>\s*!atributoInstagramNaoSeAplica\(row\)\s*&&\s*!atributoForaEscopoOperacional\(row\)\)/,
    'o atributo historico nao pode ser renderizado nem contado como trabalho atual',
  );
});

test('leitor da conciliacao e saneamento existente excluem somente inativos e evadidos', () => {
  assert.ok(
    existsSync(migrationPath),
    'falta migration que fecha a fila historica sem excluir sua trilha de auditoria',
  );

  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(
    migration,
    /a\.status\s+in\s*\('inativo',\s*'evadido'\)/i,
    'a migration deve tratar inativo e evadido como fora do escopo operacional',
  );
  assert.match(
    migration,
    /decisao\s*=\s*'fora_escopo_operacional'/i,
    'a limpeza deve manter um motivo auditavel no historico de atributos',
  );
  assert.match(
    migration,
    /analise_sol\s*=\s*'Resolvida automaticamente: aluno fora do escopo operacional\.'/i,
    'a fila de matricula deve registrar por que o item foi fechado',
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_conciliacao_matriculas/i,
    'o leitor principal deve ganhar defesa no banco, nao apenas no front-end',
  );
  assert.match(
    migration,
    /coalesce\(a\.status,\s*'ativo'\)\s+not\s+in\s*\('inativo',\s*'evadido'\)/i,
    'itens ligados a aluno historico nao podem voltar para a lista visivel',
  );
});
