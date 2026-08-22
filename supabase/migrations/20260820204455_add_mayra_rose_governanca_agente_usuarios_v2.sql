-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

insert into governanca.agente_usuarios (
  telefone,
  nome,
  departamento,
  nivel,
  unidade_id,
  pode_editar,
  ativo,
  updated_at
)
values
  ('5521995507831', 'Mayra', 'administrativo', 'colaborador', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, false, true, now()),
  ('5521973870998', 'Rose', 'financeiro', 'lider', null::uuid, false, true, now())
on conflict (telefone) do update set
  nome = excluded.nome,
  departamento = excluded.departamento,
  nivel = excluded.nivel,
  unidade_id = excluded.unidade_id,
  pode_editar = excluded.pode_editar,
  ativo = true,
  updated_at = now();
