-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists valor_mensalidade_emusys numeric;

comment on column public.aluno_jornada_matricula_disciplina.valor_mensalidade_emusys is
  'contrato_atual.valor_mensalidade da API do Emusys (valor cru). Preenchido so pela varredura sync-matriculas-emusys; o webhook em tempo real nao traz o campo. Usado para alertar divergencia contra alunos.valor_parcela -- nunca escreve nele automaticamente.';
