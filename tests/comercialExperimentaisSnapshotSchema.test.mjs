import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql
    .toLowerCase()
    .indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('migration adiciona identidade externa e vigencia do snapshot raw', () => {
  const sql = migration();

  for (const column of [
    /emusys_lead_id\s+integer/i,
    /emusys_aluno_id\s+integer/i,
    /participante_chave\s+text/i,
    /snapshot_ativo\s+boolean\s+not\s+null\s+default\s+false/i,
    /snapshot_execucao_id\s+uuid/i,
    /snapshot_visto_em\s+timestamptz/i,
    /snapshot_inativado_em\s+timestamptz/i,
  ]) {
    assert.match(sql, column);
  }

  assert.match(
    sql,
    /create\s+table\s+public\.emusys_experimentais_snapshot_execucoes/i,
  );
  assert.match(
    sql,
    /unique[\s\S]{0,120}\(\s*unidade_id\s*,\s*emusys_aula_id\s*,\s*participante_chave\s*\)[\s\S]{0,120}where\s+snapshot_ativo\s+is\s+true/i,
  );
});

test('backfill escolhe uma linha vigente por business key antes do indice parcial', () => {
  const sql = migration();
  const backfill = sql.search(/row_number\s*\(\s*\)\s+over/i);
  const index = sql.search(
    /unique[\s\S]{0,120}\(\s*unidade_id\s*,\s*emusys_aula_id\s*,\s*participante_chave\s*\)/i,
  );

  assert.notEqual(backfill, -1);
  assert.notEqual(index, -1);
  assert.ok(backfill < index, 'backfill deve preceder o indice parcial');
  assert.match(
    sql,
    /partition\s+by\s+(?:r\.)?unidade_id\s*,\s*(?:r\.)?emusys_aula_id\s*,\s*(?:r\.)?participante_chave[\s\S]{0,180}order\s+by\s+(?:r\.)?updated_at\s+desc\s*,\s*(?:r\.)?id\s+desc/i,
  );
});

test('RPC de aplicacao e privada, transacional e registra execucao completa', () => {
  const sql = migration();
  const block = functionBlock(sql, 'aplicar_snapshot_experimentais_emusys_v1');

  assert.match(block, /language\s+plpgsql/i);
  assert.match(block, /security\s+definer/i);
  assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(block, /jsonb_to_recordset/i);
  assert.match(block, /on\s+conflict[\s\S]*where\s+snapshot_ativo\s+is\s+true[\s\S]*do\s+update/i);
  assert.match(
    block,
    /(?:p_)?data_fim\s*-\s*(?:p_)?data_inicio[\s\S]{0,100}45/i,
  );
  assert.match(block, /status[\s\S]{0,100}'completo'/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.aplicar_snapshot_experimentais_emusys_v1\([^;]+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.aplicar_snapshot_experimentais_emusys_v1\([^;]+to\s+service_role/i,
  );
});

test('RPC exige identidade raw e normalizada de forma simetrica', () => {
  const sql = migration();
  const block = functionBlock(sql, 'aplicar_snapshot_experimentais_emusys_v1');

  for (const identity of ['lead', 'aluno']) {
    assert.match(
      block,
      new RegExp(
        `case[\\s\\S]{0,160}payload_emusys_${identity}_id_texto[\\s\\S]{0,160}end\\s+is\\s+distinct\\s+from\\s+l\\.emusys_${identity}_id`,
        'i',
      ),
      `identidade ${identity} deve comparar raw convertido inclusive quando um lado e nulo`,
    );
    assert.doesNotMatch(
      block,
      new RegExp(
        `payload_emusys_${identity}_id_texto\\s+is\\s+not\\s+null\\s+and\\s+l\\.emusys_${identity}_id\\s+is\\s+distinct`,
        'i',
      ),
      `identidade ${identity} nao pode omitir raw ausente da comparacao`,
    );
  }
});

test('guard comercial valida usuario, unidade e permissao sem expor RPC privada', () => {
  const sql = migration();
  const block = functionBlock(sql, 'pode_gerar_relatorio_comercial_v1');

  assert.match(block, /returns\s+boolean/i);
  assert.match(block, /security\s+definer/i);
  assert.match(block, /auth\.uid\s*\(\s*\)/i);
  assert.match(block, /coalesce\s*\(\s*u\.ativo\s*,\s*true\s*\)/i);
  assert.match(block, /(?:u\.perfil|v_perfil)\s*=\s*'unidade'/i);
  assert.match(
    block,
    /(?:u\.unidade_id|v_unidade_usuario)\s*=\s*p_unidade_id/i,
  );
  assert.match(block, /usuario_tem_permissao[\s\S]*'comercial\.ver'/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.pode_gerar_relatorio_comercial_v1\(uuid\)\s+from\s+public\s*,\s*anon/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.pode_gerar_relatorio_comercial_v1\(uuid\)\s+to\s+authenticated/i,
  );
});

test('leitura operacional usa somente vigentes e publica frescor do snapshot', () => {
  const sql = migration();
  const block = functionBlock(sql, 'get_experimentais_emusys_operacional_v1');

  assert.match(block, /security\s+definer/i);
  assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(block, /snapshot_ativo\s+is\s+true/i);
  assert.doesNotMatch(
    block,
    /least\s*\(/i,
    'D+7 mensal deve atravessar o fim do mes',
  );
  assert.match(
    block,
    /coalesce\s*\(\s*p_data\s*,\s*current_date\s*\)[\s\S]{0,80}\+\s*7/i,
  );
  for (const key of [
    'snapshot_atualizado_em',
    'snapshot_execucao_id',
    'snapshot_linhas_inativas',
    'snapshot_status',
  ]) {
    assert.match(block, new RegExp(`'${key}'`, 'i'));
  }
  assert.match(block, /emusys_experimentais_snapshot_execucoes/i);
});
