begin;

create or replace function public.fn_aplicar_jornada_curso_grade_atual_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_grade record;
  v_grade_encontrada boolean := false;
  v_disciplina_api bigint;
  v_curso_api integer;
  v_nome_api text;
  v_evidencias jsonb;
  v_deve_logar boolean := false;
begin
  begin
    v_disciplina_api := nullif(
      new.payload_snapshot -> 'disciplina' ->> 'disciplina_id',
      ''
    )::bigint;
  exception when invalid_text_representation then
    v_disciplina_api := null;
  end;

  v_disciplina_api := coalesce(v_disciplina_api, new.emusys_disciplina_id);

  select d.curso_id
    into v_curso_api
  from public.curso_emusys_depara d
  where d.unidade_id = new.unidade_id
    and d.emusys_disciplina_id = v_disciplina_api
    and d.status_mapeamento = 'mapeado'
  limit 1;

  v_curso_api := coalesce(v_curso_api, new.curso_id);
  v_nome_api := coalesce(
    nullif(btrim(new.payload_snapshot -> 'disciplina' ->> 'nome'), ''),
    new.curso_nome_emusys
  );

  new.emusys_disciplina_id_origem := v_disciplina_api;
  new.curso_id_origem := v_curso_api;
  new.curso_nome_emusys_origem := v_nome_api;

  if new.status_matricula = 'ativa'
     and new.emusys_matricula_disciplina_id is not null then
    select * into v_grade
    from public.fn_resolver_jornada_curso_grade_atual_v1(
      new.unidade_id,
      new.emusys_matricula_disciplina_id
    );
    v_grade_encontrada := found;
  end if;

  if v_grade_encontrada then
    v_evidencias := jsonb_build_object(
      'regra', 'grade_recorrente_v1',
      'janela_inicio', current_date - 14,
      'janela_fim', current_date + 60,
      'aulas_evidencia', v_grade.aulas_evidencia,
      'aulas_futuras', v_grade.aulas_futuras,
      'aulas_regulares', v_grade.aulas_regulares,
      'data_ultima_aula', v_grade.data_ultima_aula,
      'modalidade', v_grade.modalidade,
      'disciplina_api_id', v_disciplina_api,
      'curso_api_id', v_curso_api,
      'curso_api_nome', v_nome_api,
      'disciplina_grade_id', v_grade.emusys_disciplina_id,
      'curso_grade_id', v_grade.curso_id,
      'curso_grade_nome', v_grade.curso_nome_grade
    );

    if tg_op = 'UPDATE' then
      v_deve_logar := old.curso_id is distinct from v_grade.curso_id
        or old.emusys_disciplina_id is distinct from v_grade.emusys_disciplina_id;
    end if;

    new.emusys_disciplina_id := v_grade.emusys_disciplina_id;
    new.curso_id := v_grade.curso_id;
    new.curso_nome_emusys := v_grade.curso_nome_grade;
    new.curso_resolucao_fonte := 'grade_recorrente_v1';
    new.curso_resolucao_confianca := 'alta';
    new.curso_resolvido_em := now();
    new.curso_resolucao_evidencias := v_evidencias;
    new.payload_snapshot := jsonb_set(
      coalesce(new.payload_snapshot, '{}'::jsonb),
      '{resolucao_curso}',
      v_evidencias,
      true
    );

    if v_deve_logar then
      insert into public.jornada_curso_resolucao_log (
        jornada_id,
        unidade_id,
        emusys_matricula_disciplina_id,
        emusys_disciplina_id_anterior,
        emusys_disciplina_id_novo,
        curso_id_anterior,
        curso_id_novo,
        fonte,
        confianca,
        evidencias
      ) values (
        new.id,
        new.unidade_id,
        new.emusys_matricula_disciplina_id,
        case when tg_op = 'UPDATE' then old.emusys_disciplina_id else v_disciplina_api end,
        v_grade.emusys_disciplina_id,
        case when tg_op = 'UPDATE' then old.curso_id else v_curso_api end,
        v_grade.curso_id,
        'grade_recorrente_v1',
        'alta',
        v_evidencias
      );
    end if;
  elsif tg_op = 'UPDATE'
    and old.curso_resolucao_fonte = 'grade_recorrente_v1'
    and v_disciplina_api is not distinct from old.emusys_disciplina_id_origem then
    new.emusys_disciplina_id := old.emusys_disciplina_id;
    new.curso_id := old.curso_id;
    new.curso_nome_emusys := old.curso_nome_emusys;
    new.curso_resolucao_fonte := old.curso_resolucao_fonte;
    new.curso_resolucao_confianca := old.curso_resolucao_confianca;
    new.curso_resolvido_em := old.curso_resolvido_em;
    new.curso_resolucao_evidencias := old.curso_resolucao_evidencias;
    new.payload_snapshot := jsonb_set(
      coalesce(new.payload_snapshot, '{}'::jsonb),
      '{resolucao_curso}',
      coalesce(old.curso_resolucao_evidencias, '{}'::jsonb),
      true
    );
  else
    new.curso_resolucao_fonte := 'matriculas_api';
    new.curso_resolucao_confianca := null;
    new.curso_resolvido_em := null;
    new.curso_resolucao_evidencias := '{}'::jsonb;
    new.payload_snapshot := coalesce(new.payload_snapshot, '{}'::jsonb)
      - 'resolucao_curso';
  end if;

  return new;
end;
$function$;

update public.aluno_jornada_matricula_disciplina j
   set curso_id_origem = d.curso_id,
       fonte_ultima_atualizacao = 'backfill:curso_origem_depara_v1',
       updated_at = now()
  from public.curso_emusys_depara d
 where j.status_matricula = 'ativa'
   and d.unidade_id = j.unidade_id
   and d.emusys_disciplina_id = j.emusys_disciplina_id_origem
   and d.status_mapeamento = 'mapeado'
   and j.curso_id_origem is distinct from d.curso_id;

comment on function public.fn_aplicar_jornada_curso_grade_atual_v1() is
  'Preserva a disciplina original da API com curso local resolvido pelo de-para e aplica somente grade recorrente nao reagendada como curso atual.';

commit;
