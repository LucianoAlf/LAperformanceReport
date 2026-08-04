import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql',
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const correcaoPath = resolve(
  root,
  'supabase/migrations/20260804231000_pesquisa_evasao_subprojeto_c_gate_a_correcao.sql',
);
const correcaoSql = existsSync(correcaoPath) ? readFileSync(correcaoPath, 'utf8') : '';
const correcaoTiposPath = resolve(
  root,
  'supabase/migrations/20260804232000_pesquisa_evasao_subprojeto_c_gate_a_correcao_tipos.sql',
);
const correcaoTiposSql = existsSync(correcaoTiposPath)
  ? readFileSync(correcaoTiposPath, 'utf8')
  : '';

test('migration cria os contratos versionados de classificacao e analytics', () => {
  assert.ok(sql, 'migration de RPCs do Subprojeto C ainda nao existe');
  for (const signature of [
    /registrar_classificacao_pesquisa_evasao_v1\s*\(\s*p_pesquisa_id\s+uuid\s*,\s*p_analise_id\s+uuid\s*,\s*p_categorias\s+text\[\]\s*,\s*p_relacao_motivo\s+text\s*,\s*p_justificativa\s+text(?:\s+default\s+'')?\s*\)/i,
    /obter_dados_classificacao_pesquisa_evasao_v1\s*\(\s*p_pesquisa_id\s+uuid\s*\)/i,
    /listar_respostas_evasao_analytics_v1\s*\(/i,
  ]) assert.match(sql, signature);
});

test('escrita trava pesquisa, usa analise revisada atual e identidade server-side', () => {
  assert.match(sql, /where id = p_pesquisa_id\s+for update/i);
  assert.match(sql, /modo_teste[\s\S]*PESQUISA_EVASAO_C_TESTE_PROIBIDO/i);
  assert.match(sql, /v_analise\.status\s*<>\s*'revisada'/i);
  assert.match(sql, /PESQUISA_EVASAO_C_CONVERSA_ATUALIZADA/i);
  assert.match(sql, /unnest\s*\(\s*p_categorias\s*\)/i);
  assert.match(sql, /revisor_auth_user_id[\s\S]*auth\.uid\(\)/i);
});

test('taxonomia multirrotulo aplica exclusividade e justificativa de outro', () => {
  assert.match(sql, /'inconclusivo'\s*=\s*any\(v_categorias\)[\s\S]*cardinality\(v_categorias\)\s*<>\s*1/i);
  assert.match(sql, /'resposta_invalida'\s*=\s*any\(v_categorias\)/i);
  assert.match(sql, /'outro'\s*=\s*any\(v_categorias\)[\s\S]*PESQUISA_EVASAO_C_JUSTIFICATIVA_OBRIGATORIA/i);
  assert.match(sql, /p_relacao_motivo\s*=\s*'sem_motivo_anterior'/i);
  assert.match(sql, /PESQUISA_EVASAO_C_RELACAO_INCOERENTE/i);
});

test('read models excluem teste, calculam vigencia e nao usam colunas legadas', () => {
  assert.match(sql, /fn_pesquisa_evasao_c_classificacao_vigente/i);
  assert.match(sql, /pe\.modo_teste\s*=\s*false/i);
  assert.match(sql, /estado_operacional/i);
  assert.match(sql, /aguardando_revisao_textual/i);
  assert.match(sql, /aguardando_classificacao/i);
  assert.match(sql, /acao_pendente/i);
  assert.match(sql, /em_acompanhamento/i);
  assert.match(sql, /encerrado/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*(categoria_resposta|sentimento)/i);
  assert.doesNotMatch(sql, /pe\.(categoria_resposta|sentimento)/i);
});

test('ACL das RPCs fecha public, anon e agentes', () => {
  assert.match(sql, /revoke all on function public\.registrar_classificacao_pesquisa_evasao_v1/i);
  assert.match(sql, /grant execute on function public\.listar_respostas_evasao_analytics_v1/i);
  for (const role of ['mila_acesso_restrito', 'sol_acesso_restrito', 'fabio_agent', 'lia_acesso_restrito']) {
    assert.match(sql, new RegExp(role));
  }
});

test('acoes e desfechos exigem classificacao vigente e identidade server-side', () => {
  assert.match(sql, /registrar_acao_pesquisa_evasao_v1/i);
  assert.match(sql, /concluir_acao_pesquisa_evasao_v1/i);
  assert.match(sql, /registrar_desfecho_pesquisa_evasao_v1/i);
  assert.match(sql, /fn_pesquisa_evasao_c_classificacao_vigente\s*\(\s*p_pesquisa_id\s*,\s*p_classificacao_id/i);
  assert.match(sql, /criado_por_usuario_id[\s\S]*auth\.uid\(\)/i);
  assert.match(sql, /professor_id[\s\S]*vincular_professor/i);
  assert.match(sql, /sucede_desfecho_id/i);
  assert.doesNotMatch(sql, /p_aluno_id|p_criado_por_usuario_id/i);
});

test('conclusao de acao e desfecho preservam auditoria e append-only', () => {
  assert.match(sql, /v_acao\.estado\s*<>\s*'pendente'[\s\S]*PESQUISA_EVASAO_C_ACAO_JA_ENCERRADA/i);
  assert.match(sql, /concluida_por_usuario_id\s*=\s*v_usuario\.id/i);
  assert.match(sql, /concluida_por_auth_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /select id into v_anterior[\s\S]*pesquisa_evasao_desfechos/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao_desfechos/i);
});

test('correcao do Gate A alinha o tipo da RPC e fecha privilegios destrutivos de cliente', () => {
  assert.ok(correcaoSql, 'migration corretiva do Gate A ainda nao existe');
  assert.match(correcaoSql, /u\.nome::text/i);
  assert.match(correcaoSql, /revoke truncate, trigger on table/i);
  assert.match(correcaoSql, /webhook_debug_log[\s\S]*from public, anon, authenticated/i);
});

test('correcao complementar converte todos os retornos varchar declarados como text', () => {
  assert.ok(correcaoTiposSql, 'migration complementar de tipos ainda nao existe');
  for (const column of [
    'u.nome::text',
    'ms.categoria::text',
    'pe.resposta_tipo::text',
  ]) assert.match(correcaoTiposSql, new RegExp(column.replace('.', '\\.'), 'i'));
});

test('fixture do Subprojeto C passa em PostgreSQL 17 isolado', {
  skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER,
}, async () => {
  const { runPesquisaEvasaoSubprojetoCPg17Fixture } = await import(
    './helpers/runPesquisaEvasaoSubprojetoCPg17Fixture.mjs'
  );
  const output = runPesquisaEvasaoSubprojetoCPg17Fixture({
    container: process.env.PESQUISA_EVASAO_PG17_CONTAINER,
  });
  assert.match(output, /PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK/);
});
