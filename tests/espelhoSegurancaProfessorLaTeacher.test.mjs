import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const arquivos = [
  'supabase/migrations/20260919194000_presenca_v3_sombra_so_rotina_interna.sql',
  'supabase/migrations/20260919195000_definer_sem_porteiro_so_rotina_interna.sql',
  'supabase/migrations/20260919196000_bi_sql_livre_so_admin.sql',
  'supabase/migrations/20260919197000_projecao_aulas_sem_anon_so_leitura.sql',
  'supabase/migrations/20260919198000_escrita_sem_porteiro_so_rotina_interna.sql',
  'supabase/migrations/20260919199000_porteiro_do_professor.sql',
  'supabase/migrations/20260919199100_porteiro_do_professor_bloqueia.sql',
  'supabase/migrations/20260919199200_escrita_sem_anon.sql',
  'supabase/migrations/20260919199300_chat_do_fabio_sem_rota_de_tabela.sql',
  'supabase/migrations/20260919199400_usuarios_coluna_de_privilegio_so_admin.sql',
  'supabase/migrations/20260919199500_sonda_do_porteiro.sql',
  'supabase/migrations/20260919199700_realtime_sem_professor.sql',
];

test('espelho das 12 migrations de seguranca do LA Teacher existe', () => {
  for (const path of arquivos) {
    assert.equal(existsSync(path), true, path);
  }
});

test('presenca v3 sombra e rotina interna: sem authenticated', () => {
  const sql = readFileSync(arquivos[0], 'utf8');
  assert.match(sql, /revoke execute on function public\.get_professor_presenca_v3_sombra\(date, uuid\) from authenticated, anon, public/i);
  assert.match(sql, /grant execute on function public\.get_professor_presenca_v3_sombra\(date, uuid\) to service_role/i);
});

test('BI SQL livre so admin ou service_role', () => {
  const sql = readFileSync(arquivos[2], 'utf8');
  assert.match(sql, /ACESSO_NEGADO_BI/);
  assert.match(sql, /is_admin\(\)/);
  assert.match(sql, /service_role/);
});

test('porteiro do professor e a unica pre-request e so aceita rpc jsonb', () => {
  const porteiro = readFileSync(arquivos[5], 'utf8');
  assert.match(porteiro, /pgrst\.db_pre_request/);
  assert.match(porteiro, /fn_porteiro_requisicao/);
  assert.match(porteiro, /ACESSO_NEGADO_PROFESSOR/);
  const bloqueia = readFileSync(arquivos[6], 'utf8');
  assert.match(bloqueia, /modo = 'bloquear'/);
  const sonda = readFileSync(arquivos[10], 'utf8');
  assert.match(sonda, /fn_porteiro_rota_segura/);
  assert.match(sonda, /rota_do_professor_tem_que_ser_rpc/);
});

test('usuarios nao deixa nao-admin virar admin', () => {
  const sql = readFileSync(arquivos[9], 'utf8');
  assert.match(sql, /fn_usuarios_trava_privilegio/);
  assert.match(sql, /ACESSO_NEGADO_COLUNA_DE_PRIVILEGIO/);
  assert.match(sql, /with check \(is_admin\(\) or auth_user_id = auth\.uid\(\)\)/i);
});

test('realtime de conversa/campanha/evasao recusa professor', () => {
  const sql = readFileSync(arquivos[11], 'utf8');
  assert.match(sql, /fn_usuario_e_professor/);
  assert.match(sql, /crm_mensagens_select/);
  assert.match(sql, /not \(select public\.fn_usuario_e_professor\(\)\)/);
});

test('definer interno revoga authenticated e nao o devolve', () => {
  const sql = readFileSync(arquivos[1], 'utf8');
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
  assert.doesNotMatch(
    sql,
    /grant execute on function %s to authenticated/,
  );
});
