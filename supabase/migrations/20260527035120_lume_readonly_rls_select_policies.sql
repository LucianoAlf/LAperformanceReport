-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- GRANT SELECT em todas as tabelas operacionais
GRANT SELECT ON
  public.alunos,
  public.alunos_historico,
  public.aluno_presenca,
  public.aulas_emusys,
  public.leads,
  public.lead_experimentais,
  public.visitas,
  public.movimentacoes_admin,
  public.professores,
  public.cursos,
  public.turmas,
  public.motivos_saida,
  public.colaboradores,
  public.unidades,
  public.dados_mensais,
  public.crm_pipeline_etapas,
  public.bi_conversations_lamusic,
  public.bi_messages_lamusic,
  public.bi_ai_query_playbooks
TO lume_readonly;

-- Policies de leitura total para lume_readonly (tabelas com RLS ativo)
DO $$ 
DECLARE
  tabelas text[] := ARRAY[
    'alunos','alunos_historico','aluno_presenca','aulas_emusys',
    'leads','visitas','movimentacoes_admin','professores','cursos',
    'turmas','motivos_saida','colaboradores','unidades','dados_mensais',
    'crm_pipeline_etapas','bi_conversations_lamusic','bi_messages_lamusic',
    'bi_ai_query_playbooks'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS lume_readonly_select ON public.%I',
      t
    );
    EXECUTE format(
      'CREATE POLICY lume_readonly_select ON public.%I
       FOR SELECT TO lume_readonly USING (true)',
      t
    );
  END LOOP;
END $$;
