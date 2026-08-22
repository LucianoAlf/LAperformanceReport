-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE IF NOT EXISTS public.bi_ai_query_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  intent text NOT NULL UNIQUE,
  description text NOT NULL,

  example_questions text[] NOT NULL DEFAULT '{}',
  allowed_roles text[] NOT NULL DEFAULT '{}',
  required_scope text NOT NULL DEFAULT 'unit'
    CONSTRAINT bi_ai_query_playbooks_scope_check
    CHECK (required_scope IN ('none','unit','own','all_admin','unit_or_all_admin')),

  tables_used text[] NOT NULL DEFAULT '{}',
  columns_used jsonb NOT NULL DEFAULT '{}'::jsonb,

  query_type text NOT NULL DEFAULT 'select'
    CONSTRAINT bi_ai_query_playbooks_type_check
    CHECK (query_type IN ('select','aggregate','lookup')),

  query_template text NOT NULL,
  params_schema jsonb NOT NULL DEFAULT '{}'::jsonb,

  safety_notes text,
  confidence numeric NOT NULL DEFAULT 0.5,
  usage_count integer NOT NULL DEFAULT 0,

  review_status text NOT NULL DEFAULT 'draft'
    CONSTRAINT bi_ai_query_playbooks_status_check
    CHECK (review_status IN ('draft','approved','disabled')),

  created_by text NOT NULL DEFAULT 'sol',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE public.bi_ai_query_playbooks
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_user_access"
  ON public.bi_ai_query_playbooks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP TRIGGER IF EXISTS trg_bi_ai_query_playbooks_updated_at ON public.bi_ai_query_playbooks;
CREATE TRIGGER trg_bi_ai_query_playbooks_updated_at
  BEFORE UPDATE ON public.bi_ai_query_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bi_ai_query_playbooks (
  intent,
  description,
  example_questions,
  allowed_roles,
  required_scope,
  tables_used,
  columns_used,
  query_type,
  query_template,
  confidence,
  review_status
) VALUES (
  'matriculas_ativas_por_unidade',
  'Conta alunos ativos agrupados por unidade.',
  ARRAY['quantas matrículas temos por unidade?', 'liste as matrículas das 3 unidades'],
  ARRAY['admin','farmer'],
  'unit_or_all_admin',
  ARRAY['alunos','unidades'],
  '{"alunos":["id","status","unidade_id"],"unidades":["id","nome"]}'::jsonb,
  'aggregate',
  'SELECT u.nome AS unidade, count(a.id) AS total
   FROM alunos a
   JOIN unidades u ON u.id = a.unidade_id
   WHERE a.status = ''ativo''
   /*SCOPE_FILTER*/
   GROUP BY u.nome
   ORDER BY u.nome',
  0.95,
  'approved'
)
ON CONFLICT (intent) DO NOTHING;
