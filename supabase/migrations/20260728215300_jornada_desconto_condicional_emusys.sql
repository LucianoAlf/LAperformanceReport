-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists desconto_condicional_emusys numeric;

comment on column public.aluno_jornada_matricula_disciplina.desconto_condicional_emusys is
  'contrato_atual.desconto_condicional da API do Emusys. Existe para tornar valor_mensalidade_emusys comparavel a alunos.valor_parcela, que e o LIQUIDO (valor_mensalidade - desconto_condicional, regra canonica em processar-matricula-emusys). Comparar valor_parcela contra o valor CRU acende alerta falso em todo aluno com desconto: 747 de 1171 ativos, contra 31 reais.';
