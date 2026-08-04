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
