import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const syncPath = join(process.cwd(), 'supabase', 'functions', 'sync-matriculas-emusys', 'index.ts');
const supabaseConfigPath = join(process.cwd(), 'supabase', 'config.toml');
const uiPath = join(process.cwd(), 'src', 'components', 'App', 'Alunos', 'ConciliacaoMatriculas.tsx');
const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir)
  .find((name) => /_conciliacao_emusys_auditoria_preserva_analise\.sql$/u.test(name));
const identityMigrationName = readdirSync(migrationsDir)
  .find((name) => /_cadastro_emusys_identidade_e_decisao_humana\.sql$/u.test(name));

test('guarda cadastral revalida identidade e restauracao de decisao humana', () => {
  assert.ok(
    identityMigrationName && existsSync(join(migrationsDir, identityMigrationName)),
    'falta migration que fecha a corrida entre relink de matricula, sync e decisao humana',
  );

  const sql = readFileSync(join(migrationsDir, identityMigrationName), 'utf8');
  assert.match(
    sql,
    /p_emusys_matricula_id\s+text/i,
    'a RPC precisa exigir a identidade externa que originou o patch',
  );
  assert.match(
    sql,
    /a\.emusys_matricula_id\s*=\s*p_emusys_matricula_id/i,
    'a matricula deve ser rechecado dentro do lock do aluno',
  );
  assert.match(
    sql,
    /revoke all on function public\.aplicar_cadastro_emusys_canonico\(uuid, integer, jsonb\)[\s\S]*?service_role/i,
    'a assinatura insegura nao pode permanecer executavel',
  );
  assert.match(
    sql,
    /from public\.alunos[\s\S]*?for update[\s\S]*?from public\.alunos_emusys_atributos_divergencias[\s\S]*?for update/i,
    'a decisao humana deve travar primeiro o aluno e depois a divergencia',
  );
  for (const campo of ['telefone', 'email', 'responsavel_nome', 'responsavel_telefone', 'foto_url', 'instagram']) {
    assert.match(
      sql,
      new RegExp(`when '${campo}' then[\\s\\S]*?set ${campo} =`, 'iu'),
      `manter_la deve restaurar ${campo} se o sync terminou antes da decisao humana`,
    );
  }
});

test('sync grava no cadastro local os campos cadastrais atuais confirmados pelo Emusys', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /function gerarPatchCadastroCanonicoEmusys\s*\(/,
    'telefone, e-mail e responsável precisam ter uma regra própria de fonte canônica',
  );
  for (const campo of ['telefone', 'email', 'responsavel_nome', 'responsavel_telefone']) {
    assert.match(
      source,
      new RegExp(`setCampoEmusysAutoritativo\\([^\\n]*['\"]${campo}['\"]`, 'u'),
      `${campo} deve ser atualizado pelo valor atual do Emusys quando não estiver fixado`,
    );
  }
  assert.match(
    source,
    /async function aplicarPatchAtributosEmusys\s*\(/,
    'o patch precisa ser persistido, e não apenas calculado para uma sugestão',
  );
  assert.match(
    source,
    /async function sincronizarAtributosCadastraisEmusys\s*\(/,
    'o enriquecimento precisa existir fora da fila de sugestão completa',
  );
  assert.match(
    source,
    /await sincronizarAtributosCadastraisEmusys\([\s\S]*?if \(escopo === 'operacional'\)/,
    'o cron operacional precisa aplicar os dados cadastrais antes do retorno antecipado',
  );
  assert.match(
    source,
    /\.rpc\(\s*'aplicar_cadastro_emusys_canonico'/,
    'a escrita precisa passar pela guarda atômica que revalida campos fixados no banco',
  );
  assert.match(
    source,
    /p_emusys_matricula_id:\s*String\(aluno\.emusys_matricula_id/u,
    'o patch deve carregar a matricula Emusys que originou o dado cadastral',
  );
  assert.doesNotMatch(
    source,
    /r\.upd\s*=\s*\{\s*\.\.\.r\.upd,\s*\.\.\.autoAtributos\.patch\s*\}/,
    'atributos automáticos não podem continuar presos em auto_preview',
  );
});

test('sync cadastral não toca em forma de pagamento nem por preenchimento vazio', () => {
  const source = readFileSync(syncPath, 'utf8');
  const inicio = source.indexOf('async function sincronizarAtributosCadastraisEmusys');
  const fim = source.indexOf('const TIPOS_DECISAO_IGNORA_SYNC');
  const sincronizador = inicio >= 0 && fim > inicio ? source.slice(inicio, fim) : '';

  assert.match(
    sincronizador,
    /const patch = cadastroCanonico\.patch;/,
    'a escrita direta deve conter exclusivamente os quatro campos cadastrais autoritativos',
  );
  assert.doesNotMatch(
    sincronizador,
    /gerarPatchAtributosVaziosConfiaveis|formasPagamento|forma_pagamento_id/,
    'forma de pagamento continua uma decisão financeira humana, fora deste sync',
  );
});

test('auditoria do sync cadastral informa o aluno exigido pelo log operacional', () => {
  const source = readFileSync(syncPath, 'utf8');
  const inicio = source.indexOf('async function sincronizarAtributosCadastraisEmusys');
  const fim = source.indexOf('const TIPOS_DECISAO_IGNORA_SYNC');
  const sincronizador = inicio >= 0 && fim > inicio ? source.slice(inicio, fim) : '';

  assert.match(
    sincronizador,
    /logs\.push\(\{\s*aluno_nome:\s*aluno\.nome,/u,
    'cada atualização precisa preencher aluno_nome, que é obrigatório em automacao_log',
  );
});

test('falhas do sync preservam a mensagem do erro em vez de registrar object Object', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /function descreverErroSync\s*\(/u,
    'o sync precisa normalizar erros estruturados do PostgREST antes de persistir o diagnóstico',
  );
  assert.match(
    source,
    /resumo\.erro_unidade\s*=\s*descreverErroSync\(e\);/u,
    'a execução falha deve guardar a mensagem legível que permite investigar sem tentativa cega',
  );
});

test('registro persistido da execucao nao degrada erro estruturado para object Object', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /erro:\s*descreverErroSync\(e\),/u,
    'o registro persistido deve usar a mesma mensagem legivel da resposta do sync',
  );
});

test('guarda no banco revalida campos fixados e limita o patch aos quatro campos cadastrais', () => {
  assert.ok(
    migrationName && existsSync(join(migrationsDir, migrationName)),
    'falta migration com a guarda atômica do cadastro Emusys',
  );

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');
  assert.match(
    sql,
    /create or replace function public\.aplicar_cadastro_emusys_canonico/i,
    'o banco deve aplicar o patch cadastral no mesmo ato em que consulta campos fixados',
  );
  for (const campo of ['telefone', 'email', 'responsavel_nome', 'responsavel_telefone']) {
    assert.match(sql, new RegExp(`'${campo}'`, 'u'), `${campo} precisa ser explicitamente permitido na guarda`);
  }
  assert.doesNotMatch(sql, /forma_pagamento_id/i, 'a guarda de cadastro não pode ganhar competência financeira');
  assert.match(
    sql,
    /not exists\s*\([\s\S]*?matriculas_campos_fixados/i,
    'a decisão de escrever deve reconsultar os campos fixados dentro da própria operação SQL',
  );
  assert.match(
    sql,
    /revoke all on function public\.aplicar_cadastro_emusys_canonico[\s\S]*?from public, anon, authenticated/i,
    'a RPC interna não pode ficar acessível ao navegador',
  );
});

test('fila operacional preserva status desconhecido e exclui somente histórico confirmado', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.match(
    source,
    /return\s+aluno\?\.is_ex_aluno\s*!==\s*true\s*&&\s*!\['inativo',\s*'evadido'\]\.includes\(status\);/,
    'status nulo ou novo não pode desaparecer da reconciliação operacional',
  );
  assert.match(
    source,
    /select\('[^']*is_ex_aluno[^']*'\)/,
    'o sync precisa carregar is_ex_aluno antes de decidir se uma linha entra na fila',
  );
});

test('tela carrega todas as pendências antes de descontar histórico dos contadores', () => {
  const source = readFileSync(uiPath, 'utf8');

  assert.match(
    source,
    /async function carregarTodasAsLinhasAtributos\s*\(/,
    'a tela precisa paginar integralmente as pendências antes de calcular totais',
  );
  assert.match(
    source,
    /\.range\(inicio,\s*inicio\s*\+\s*ATRIBUTO_TAMANHO_LOTE\s*-\s*1\)/,
    'a paginação precisa avançar por lotes determinísticos',
  );
  assert.doesNotMatch(
    source,
    /aplicarFiltroGrupo\(baseRowsQuery\(\),\s*grupo\)\.limit\(limite\)/,
    'um corte silencioso de mil itens não pode alimentar os totais globais',
  );
});

test('tela busca o cadastro dos alunos por lotes antes de filtrar a fila', () => {
  const source = readFileSync(uiPath, 'utf8');

  assert.match(
    source,
    /async function carregarAlunosDosAtributos\s*\(/,
    'a tela precisa buscar nomes e estado operacional sem exceder o limite do Data API',
  );
  assert.match(
    source,
    /\.in\('id',\s*loteIds\)/,
    'a busca de alunos precisa avançar por lotes de IDs',
  );
});

test('migration corretiva registra decisão estruturada e preserva a análise já gravada', () => {
  assert.ok(
    migrationName && existsSync(join(migrationsDir, migrationName)),
    'falta migration corretiva para a auditoria de conciliação fora do escopo',
  );

  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');
  assert.match(
    sql,
    /insert into public\.matriculas_divergencias_decisoes/i,
    'a correção precisa registrar a decisão estruturada para as linhas já fechadas',
  );
  assert.match(
    sql,
    /on conflict \(divergencia_id\) do nothing/i,
    'a recuperação precisa ser idempotente',
  );
  assert.match(
    sql,
    /create or replace function public\.resolver_pendencias_conciliacao_fora_escopo_operacional/i,
    'o saneamento futuro precisa preservar a mesma trilha de auditoria',
  );
  assert.doesNotMatch(
    sql,
    /set[\s\S]{0,200}analise_sol\s*=/i,
    'a correção não pode sobrescrever a análise humana existente',
  );
});

test('sync não substitui análise humana ao encerrar status já decidido pela regra canônica', () => {
  const source = readFileSync(syncPath, 'utf8');

  assert.doesNotMatch(
    source,
    /analise_sol:\s*'Resolvida: nao renovacao canonica registrada para a mesma matricula Emusys\.'/,
    'o sync deve conservar a análise já escrita e registrar a decisão em trilha própria',
  );
  assert.match(
    source,
    /from\('matriculas_divergencias_decisoes'\)\s*\.upsert\(/,
    'o encerramento por regra canônica precisa ter uma decisão estruturada',
  );
});

test('deploy do sync de matrículas preserva a proteção JWT explícita', () => {
  const config = readFileSync(supabaseConfigPath, 'utf8');

  assert.match(
    config,
    /\[functions\.sync-matriculas-emusys\][\s\S]*?verify_jwt\s*=\s*true/,
    'a função não pode depender do padrão de deploy para manter o gateway protegido',
  );
});
