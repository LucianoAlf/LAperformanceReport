import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260808213000_turmas_v2_elimina_recalculo_duplicado.sql',
  import.meta.url,
);

const sql = fs.readFileSync(migrationPath, 'utf8');

const ocorrencias = (padrao) => (sql.match(padrao) || []).length;

test('preserva assinatura, contrato e modo de execucao da RPC', () => {
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_kpis_turmas_canonicos_v2\s*\(/i,
  );
  // DROP + CREATE reabriria EXECUTE para anon neste projeto (ALTER DEFAULT PRIVILEGES).
  assert.doesNotMatch(sql, /drop\s+function/i);

  assert.match(sql, /p_ano\s+integer/i);
  assert.match(sql, /p_mes\s+integer/i);
  assert.match(sql, /p_unidade_id\s+uuid\s+default\s+null/i);
  assert.match(sql, /p_data_inicio\s+date\s+default\s+null/i);
  assert.match(sql, /p_data_fim\s+date\s+default\s+null/i);

  assert.match(sql, /language\s+plpgsql/i);
  assert.match(sql, /\bstable\b/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s+to\s+'public'\s*,\s*'pg_temp'/i);

  for (const coluna of [
    'professor_id',
    'unidade_id',
    'ano',
    'mes',
    'ocupacoes_elegiveis',
    'turmas_elegiveis',
    'media_alunos_turma',
    'turmas_um_aluno',
    'percentual_turmas_um_aluno',
    'competencia_status',
    'fonte',
    'regra_versao',
  ]) {
    assert.match(sql, new RegExp(`\\b${coluna}\\b`), `coluna ausente no retorno: ${coluna}`);
  }
});

test('le a base canonica uma unica vez -- esta e a regressao que causou o timeout', () => {
  // A causa raiz media em 08/08/2026: a base rodava 2x por chamada (uma direta,
  // outra via get_kpis_turmas_canonicos_v1 -> get_carteira_professor_periodo_canonica).
  assert.equal(
    ocorrencias(/get_carteira_professor_periodo_detalhe_canonico_v1\s*\(/g),
    1,
    'a base canonica deve ser chamada exatamente uma vez',
  );

  // Estas duas continuam existindo no banco, mas nao podem voltar ao caminho
  // desta funcao: qualquer uma delas reintroduz o recalculo da mesma base.
  assert.doesNotMatch(sql, /public\.get_kpis_turmas_canonicos_v1\s*\(/i);
  assert.doesNotMatch(sql, /public\.get_carteira_professor_periodo_canonica\s*\(/i);
});

test('mantem as expressoes de negocio inalteradas', () => {
  // Divisao crua, sem round: era o valor que get_kpis_turmas_canonicos_v1
  // entregava a tela. A carteira canonica arredonda, a v1 nao -- e a v1 vencia.
  assert.match(
    sql,
    /a\.alunos_via_turmas::numeric\s*\/\s*a\.turmas_elegiveis_media/i,
  );
  assert.doesNotMatch(
    sql,
    /round\s*\(\s*a\.alunos_via_turmas::numeric\s*\/\s*a\.turmas_elegiveis_media/i,
  );

  // Percentual de turmas com um aluno so: round(.., 2) sobre turmas_elegiveis.
  assert.match(sql, /round\s*\([\s\S]{0,120}?turmas_um_aluno[\s\S]{0,120}?\*\s*100\s*,\s*2\s*\)/i);

  // Rotulos consumidos pela tela.
  assert.match(sql, /'carteira_professor_periodo_canonica'::text\s+as\s+fonte/i);
  assert.match(sql, /'turmas_v2_pessoa_professor_turma_regular'::text\s+as\s+regra_versao/i);

  // Join do bloco de turmas unitarias: igualdade estrita, como no original.
  assert.match(sql, /left\s+join\s+unitarias\s+u[\s\S]{0,200}?u\.unidade_id\s*=\s*a\.uid/i);
});

test('preserva o controle de acesso, inclusive as validacoes herdadas da v1', () => {
  assert.match(sql, /auth\.role\(\)\s*=\s*'service_role'/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /usuario_tem_permissao\(/i);
  assert.match(sql, /'professores\.ver'/i);
  assert.match(sql, /'alunos\.ver'/i);
  assert.match(sql, /Acesso negado: usuario sem cadastro ativo/i);
  assert.match(sql, /Acesso negado: unidade fora do escopo do usuario/i);

  // Validacoes de periodo: a de mes ja existia aqui; a de periodo invertido
  // vinha de get_kpis_turmas_canonicos_v1 e precisa continuar valendo.
  assert.match(sql, /Mes invalido/i);
  assert.match(sql, /Periodo invalido: data final anterior a inicial/i);
});
