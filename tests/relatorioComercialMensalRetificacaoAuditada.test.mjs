import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260801171624_retificar_comercial_mensal_multicurso.sql',
);
const sql = fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, 'utf8')
  : '';

test('retificacao comercial mensal e append-only e preserva o snapshot fechado', () => {
  assert.notEqual(sql, '', 'migration da retificacao auditada ainda nao existe');
  assert.match(sql, /create table public\.fechamento_mensal_retificacoes/i);
  assert.match(sql, /before update or delete on public\.fechamento_mensal_retificacoes/i);
  assert.match(sql, /raise exception 'RETIFICACAO_MENSAL_IMUTAVEL'/i);
  assert.match(sql, /alter table public\.fechamento_mensal_retificacoes enable row level security/i);
  assert.match(sql, /revoke all on table public\.fechamento_mensal_retificacoes[\s\S]*authenticated/i);
  assert.doesNotMatch(
    sql,
    /update\s+public\.fechamento_mensal_snapshots\s+set\s+payload/i,
    'o payload do snapshot fechado nao pode ser reescrito',
  );
});

test('produtor futuro agrupa principal e cursos adicionais pagos pela mesma pessoa', () => {
  assert.match(sql, /montar_relatorio_comercial_mensal_payload_sem_adicionais_v1/i);
  assert.match(sql, /pessoa_key/i);
  assert.match(sql, /regexp_replace\([\s\S]*responsavel_telefone[\s\S]*'\\D'/i);
  assert.match(sql, /bool_or\([\s\S]*is_segundo_curso[\s\S]*false/i);
  assert.match(sql, /having[\s\S]*bool_or/i);
  assert.match(sql, /sum\(coalesce\(valor_parcela, 0\)\)/i);
  assert.match(sql, /string_agg\(curso_nome, ' e ' order by eh_principal desc, id\)/i);
  assert.match(sql, /jsonb_agg\(valor_parcela order by id\)/i);
  assert.match(sql, /RELATORIO_COMERCIAL_MENSAL_QUANTIDADE_DIVERGENTE/i);
});

test('aplicacao exige hash base, motivo, privilegio e invariantes de escopo', () => {
  assert.match(sql, /aplicar_retificacao_relatorio_comercial_mensal_v1/i);
  assert.match(sql, /p_payload_hash_esperado text/i);
  assert.match(sql, /p_motivo text/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /RETIFICACAO_MENSAL_HASH_BASE_DIVERGENTE/i);
  assert.match(sql, /RETIFICACAO_MENSAL_MOTIVO_OBRIGATORIO/i);
  assert.match(sql, /RETIFICACAO_MENSAL_INVARIANTE_DIVERGENTE/i);
  assert.match(sql, /retificacao_solicitada/i);
  assert.match(sql, /on conflict \(snapshot_id, payload_corrigido_hash\) do nothing/i);
});

test('leitura valida os dois hashes e entrega a retificacao sem ocultar o hash original', () => {
  assert.match(sql, /get_relatorio_mensal_snapshot_base_v1/i);
  assert.match(sql, /base_payload_hash/i);
  assert.match(sql, /payload_corrigido_hash/i);
  assert.match(sql, /RETIFICACAO_MENSAL_HASH_CORRIGIDO_DIVERGENTE/i);
  assert.match(sql, /'snapshot_payload_hash'/i);
  assert.match(sql, /'retificacao_id'/i);
  assert.match(sql, /'retificado', true/i);
});

test('retificacao de julho do Recreio usa chave estavel e hash exato, sem UUID gerado', () => {
  assert.match(sql, /upper\(u\.codigo\)\s*=\s*'REC'/i);
  assert.match(sql, /upper\(u\.nome\)\s*=\s*'RECREIO'/i);
  assert.match(sql, /2026\s*,\s*7/i);
  assert.match(sql, /e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f/i);
  assert.match(sql, /Gabriela da Silva Machado/i);
  assert.match(sql, /Contrabaixo/i);
  assert.match(sql, /R\$\s*395,00/i);
  assert.doesNotMatch(sql, /664fe6ed-a900-4c6d-8650-a2e3f6811b82/i);
});
