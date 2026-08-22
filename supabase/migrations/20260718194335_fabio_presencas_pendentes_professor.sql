-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 014 Fase 3 (lado professor): RPC read-only da pendência de presença de UM professor,
-- separada em dentro_janela (dias<=3, detalhado) e escalar_coordenacao (dias>3, resumo).
-- Lê só vw_presenca_pendencia. Exclui justificada. Backend-only (service_role). Spec: Alfredo.

create or replace function public.fabio_presencas_pendentes_professor(p_professor_id integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select *
    from public.vw_presenca_pendencia
    where professor_id = p_professor_id
      and not justificada
  ),
  janela as (
    select data_hora_inicio, data_aula, hora, curso_nome,
           jsonb_agg(
             jsonb_build_object('aluno_id', aluno_id, 'nome', aluno_primeiro_nome, 'dias_em_atraso', dias_em_atraso)
             order by aluno_nome
           ) as alunos
    from base
    where dias_em_atraso <= 3
    group by data_hora_inicio, data_aula, hora, curso_nome, aula_id
  ),
  escala as (
    select data_hora_inicio, data_aula, hora,
           count(distinct aluno_id) as qtd_alunos,
           max(dias_em_atraso)      as dias_em_atraso
    from base
    where dias_em_atraso > 3
    group by data_hora_inicio, data_aula, hora, aula_id
  )
  select jsonb_build_object(
    'professor_id', p_professor_id,
    'dentro_janela', coalesce((
      select jsonb_agg(
        jsonb_build_object('data_aula', data_aula, 'hora', hora, 'curso_nome', curso_nome, 'alunos', alunos)
        order by data_hora_inicio desc)
      from janela), '[]'::jsonb),
    'escalar_coordenacao', coalesce((
      select jsonb_agg(
        jsonb_build_object('data_aula', data_aula, 'hora', hora, 'qtd_alunos', qtd_alunos, 'dias_em_atraso', dias_em_atraso)
        order by data_hora_inicio desc)
      from escala), '[]'::jsonb)
  );
$function$;

revoke all on function public.fabio_presencas_pendentes_professor(integer) from public, anon, authenticated;
grant execute on function public.fabio_presencas_pendentes_professor(integer) to service_role;
