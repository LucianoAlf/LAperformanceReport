-- LA Teacher: carteira na fonte unica (jornada canonica) e drop da agenda orfa.
-- Aplicada no Supabase como 20260709213803_la_teacher_009_carteira_fonte_unica.
-- Nao altera vw_fabio_carteira_professor, app_minha_agenda_mes ou
-- app_minha_agenda_sessao.

create or replace function public.app_minha_carteira()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'aluno_id', c.aluno_id,
          'aluno_nome', c.aluno_nome,
          'curso', c.curso_nome,
          'status_matricula', c.status_matricula,
          'dia_aula', c.dia_semana,
          'horario_aula', c.horario,
          'unidade', c.unidade_nome,
          'jornada_label', c.jornada_label,
          'nr_aulas_passadas', c.nr_aulas_passadas,
          'nr_aulas_contratadas', c.nr_aulas_contratadas,
          'percentual_presenca_contrato', c.percentual_presenca_contrato,
          'qualidade', case
            when c.aluno_id is null or c.emusys_aluno_id is null then 'aluno_sem_id_emusys'
            when c.curso_id is null then 'sem_contexto'
            else 'ok'
          end
        )
        order by c.aluno_nome
      ),
      '[]'::jsonb
    )
    from public.vw_jornada_professor_atual c
    where c.professor_id = v_prof
  );
end;
$function$;

revoke all on function public.app_minha_carteira() from public, anon;
grant execute on function public.app_minha_carteira() to authenticated;

-- Agenda crua do P3, substituida pela agenda por sessao (contrato v3).
drop function if exists public.app_minha_agenda(date);
