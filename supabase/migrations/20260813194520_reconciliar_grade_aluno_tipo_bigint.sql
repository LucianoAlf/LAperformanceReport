-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- aula_alunos_emusys.aluno_emusys_id e bigint; o parametro nasceu integer.
-- DROP explicito da assinatura antiga: com p_dry_run tendo DEFAULT, manter as duas
-- deixaria a chamada ambigua ("function is not unique") — foi o que derrubou o
-- webhook de leads do n8n por 21h em 11/08/2026.
drop function if exists public.reconciliar_grade_aluno_v1(integer, uuid, date, date, integer[], boolean);

create or replace function public.reconciliar_grade_aluno_v1(
  p_aluno_emusys_id bigint,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_ids_vivos integer[],
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_detalhe jsonb;
  v_ids integer[];
  v_aplicadas integer := 0;
begin
  if p_ids_vivos is null or cardinality(p_ids_vivos) = 0 then
    return jsonb_build_object('status','abortado','motivo','API nao devolveu nenhuma aula viva para o aluno na janela','aplicadas',0);
  end if;

  if p_data_inicio < (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('status','abortado','motivo','p_data_inicio anterior a hoje — esta rotina so reconcilia o futuro','aplicadas',0);
  end if;

  with
  slots_ausentes as (
    select distinct a.unidade_id, a.data_hora_inicio,
           coalesce(a.turma_nome,'') as turma_nome,
           coalesce(a.professor_nome,'') as professor_nome,
           coalesce(a.sala_nome,'') as sala_nome
    from aulas_emusys a
    join aula_alunos_emusys al on al.aula_emusys_id = a.id
    where a.unidade_id = p_unidade_id
      and a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
      and al.aluno_emusys_id = p_aluno_emusys_id
      and not (a.emusys_id = any(p_ids_vivos))
  ),
  linhas_do_slot as (
    select a.id, a.emusys_id, a.data_aula, a.tipo, a.curso_nome,
           a.professor_nome, a.sala_nome, a.professor_presenca_origem,
           to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora,
           s.data_hora_inicio, s.unidade_id,
           s.turma_nome as slot_turma, s.professor_nome as slot_prof, s.sala_nome as slot_sala
    from slots_ausentes s
    join aulas_emusys a
      on a.unidade_id = s.unidade_id
     and a.data_hora_inicio = s.data_hora_inicio
     and coalesce(a.turma_nome,'') = s.turma_nome
     and coalesce(a.professor_nome,'') = s.professor_nome
     and coalesce(a.sala_nome,'') = s.sala_nome
    where a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
  ),
  veredito as (
    select l.unidade_id, l.data_hora_inicio, l.slot_turma, l.slot_prof, l.slot_sala,
           bool_or(l.emusys_id = any(p_ids_vivos)) as slot_parcialmente_vivo,
           bool_or(exists (
             select 1 from aula_alunos_emusys x
             where x.aula_emusys_id = l.id
               and x.aluno_emusys_id is distinct from p_aluno_emusys_id
           )) as tem_outro_aluno,
           bool_or(
             l.professor_presenca_origem is not null
             or exists (
               select 1 from aluno_presenca ap
               where ap.aula_emusys_id = l.id
                 and ap.respondido_por::text in ('agenda_secretaria','professor_la_teacher','fabio_audio','manual')
             )
           ) as tem_marcacao_humana,
           array_agg(l.id) as ids,
           min(l.data_aula) as data_aula,
           min(l.hora) as hora,
           string_agg(distinct l.tipo,'+') as tipos,
           min(l.curso_nome) as curso_nome,
           min(l.professor_nome) as professor_nome,
           min(l.sala_nome) as sala_nome,
           count(*)::int as linhas
    from linhas_do_slot l
    group by 1,2,3,4,5
  ),
  julgado as (
    select v.*, case
             when v.slot_parcialmente_vivo then 'mantido_slot_vivo'
             when v.tem_outro_aluno        then 'mantido_outro_aluno'
             when v.tem_marcacao_humana    then 'mantido_marcacao_humana'
             else 'cancelar'
           end as acao
    from veredito v
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'data_aula', j.data_aula, 'hora', j.hora, 'turma', nullif(j.slot_turma,''),
        'curso', j.curso_nome, 'professor', j.professor_nome, 'sala', j.sala_nome,
        'linhas', j.linhas, 'tipos', j.tipos, 'aula_ids', to_jsonb(j.ids),
        'acao', j.acao
      ) order by j.data_aula, j.hora), '[]'::jsonb) from julgado j),
    (select array_agg(x) from julgado j, unnest(j.ids) as t(x) where j.acao = 'cancelar')
  into v_detalhe, v_ids;

  if not p_dry_run and v_ids is not null and cardinality(v_ids) > 0 then
    update aulas_emusys
       set cancelada = true,
           cancelada_origem = 'sync_ausente_emusys',
           cancelada_motivo = 'Aula removida no Emusys (cronograma regerado)',
           cancelada_em = now()
     where id = any(v_ids);
    get diagnostics v_aplicadas = row_count;
  end if;

  return jsonb_build_object(
    'status','ok','dry_run',p_dry_run,'aluno_emusys_id',p_aluno_emusys_id,
    'janela', jsonb_build_object('inicio',p_data_inicio,'fim',p_data_fim),
    'ids_vivos', cardinality(p_ids_vivos),
    'slots_avaliados', jsonb_array_length(v_detalhe),
    'a_cancelar', coalesce(cardinality(v_ids),0),
    'aplicadas', v_aplicadas, 'detalhe', v_detalhe);
end;
$function$;

revoke all on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean) from public, anon, authenticated;
grant execute on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean) to service_role;

comment on function public.reconciliar_grade_aluno_v1 is
  'Cancela aulas futuras de um aluno que sumiram do Emusys (cronograma regerado apos mudanca da data da 1a aula). Decide por SLOT, preservando slot vivo, slot com outro aluno e decisao humana. Chamada pela edge reconciliar-grade-aluno.';
