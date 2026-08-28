-- Torna explicito o escopo ja garantido pela slot_key para que o planner
-- limite a view canonica antes do join de pendencias. Sem mudanca de retorno.

CREATE OR REPLACE FUNCTION public.fn_presenca_pendencias_do_dia_v2(p_unidade_id uuid, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_frescor jsonb;
  v_status text;
  v_sincronizado_em timestamptz;
  v_pendencias jsonb := '[]'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_revisoes jsonb := '[]'::jsonb;
  v_tem_revisao boolean := false;
  v_inicio_dia timestamptz := p_data::timestamp at time zone 'America/Sao_Paulo';
begin
  if p_unidade_id is null or p_data is null then
    raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and session_user::text not in (
    'postgres', 'service_role',
    'sol_acesso_restrito', 'lia_acesso_restrito', 'mila_acesso_restrito'
  ) then
    if v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  if v_role = 'service_role' or session_user::text in ('postgres', 'service_role') then
    v_frescor := public.fn_presenca_dados_frescos_v1(p_unidade_id, p_data);
  else
    v_frescor := public.fn_presenca_dados_frescos_interno_v1(p_unidade_id, p_data);
  end if;

  v_sincronizado_em := nullif(v_frescor ->> 'finalizada_em', '')::timestamptz;

  select exists (
    select 1
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) into v_tem_revisao;

  if coalesce((v_frescor ->> 'publicavel')::boolean, false) is not true then
    v_status := 'dados_desatualizados';
  elsif v_tem_revisao then
    v_status := 'roster_em_revisao';
  else
    v_status := 'atualizados';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aula_emusys_id', x.aula_id,
    'estado', x.estado,
    'qtd_esperada', x.qtd_esperada,
    'qtd_recebida', x.qtd_recebida,
    'sincronizado_em', x.sincronizado_em
  ) order by x.aula_id), '[]'::jsonb)
  into v_revisoes
  from (
    select ae.id as aula_id,
           case
             when coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
               then coalesce(re.estado, 'sem_fotografia')
             else 'roster_desatualizado'
           end as estado,
           re.qtd_esperada,
           re.qtd_recebida,
           re.sincronizado_em
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) x;

  if v_status = 'atualizados' then
    with candidatos as (
      select
        public.fn_presenca_slot_key_v2(
          r.aluno_id,
          ae.unidade_id,
          ae.professor_id,
          ae.data_hora_inicio,
          ae.data_hora_fim,
          ae.curso_nome
        ) as slot_key,
        r.aluno_id,
        ae.id as aula_emusys_id,
        ae.unidade_id,
        ae.professor_id,
        ae.data_hora_inicio,
        ae.data_hora_fim,
        ae.curso_nome,
        ae.turma_nome,
        row_number() over (
          partition by
            r.aluno_id, ae.unidade_id, ae.professor_id,
            ae.data_hora_inicio, ae.data_hora_fim,
            lower(btrim(coalesce(ae.curso_nome, '')))
          order by
            nullif(ae.matricula_disciplina_id, 0) nulls last,
            case when ae.tipo = 'turma' then 0 else 1 end,
            ae.id
        ) as posicao
      from public.vw_aula_roster_operacional_v1 r
      join public.aulas_emusys ae on ae.id = r.aula_emusys_id
      where ae.unidade_id = p_unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and ae.professor_id is not null
        and public.fn_presenca_pendencia_elegivel(
          ae.unidade_id,
          r.aluno_id,
          ae.data_aula,
          ae.matricula_disciplina_id,
          ae.curso_nome
        )
        and not exists (
          select 1
          from public.aulas_emusys g
          where g.unidade_id = ae.unidade_id
            and g.professor_id = ae.professor_id
            and g.data_hora_inicio = ae.data_hora_inicio
            and g.data_hora_fim = ae.data_hora_fim
            and lower(btrim(coalesce(g.curso_nome, '')))
                = lower(btrim(coalesce(ae.curso_nome, '')))
            and (coalesce(g.cancelada, false) or coalesce(g.justificada, false))
        )
    ), pares as (
      select * from candidatos where posicao = 1
    ), enriquecidos as (
      select p.*,
             al.nome as aluno_nome,
             pr.nome as professor_nome,
             o.resultado_canonico,
             o.fecha_chamada,
             o.fonte_decisao,
             o.decidido_em,
             o.possui_conflito,
             o.regra_versao as ocorrencia_regra_versao
      from pares p
      join public.alunos al on al.id = p.aluno_id
      left join public.professores pr on pr.id = p.professor_id
      left join public.vw_presenca_ocorrencia_canonica_v2 o
        on o.slot_key = p.slot_key
       and o.unidade_id = p.unidade_id
       and o.data_aula = p_data
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'sem_resposta',
        'resultado_canonico', coalesce(e.resultado_canonico, 'indeterminado'),
        'fonte_decisao', coalesce(e.fonte_decisao, 'sem_registro')
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.fecha_chamada, false) = false and not coalesce(e.possui_conflito, false)),
        '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'divergencia',
        'resultado_canonico', e.resultado_canonico,
        'fonte_decisao', e.fonte_decisao,
        'decidido_em', e.decidido_em,
        'detalhe', 'Decisoes de presenca conflitantes; revisar a ocorrencia canonica.'
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.possui_conflito, false)),
        '[]'::jsonb)
    into v_pendencias, v_conflitos
    from enriquecidos e;
  end if;

  return jsonb_build_object(
    'dados_status', v_status,
    'sincronizado_em', v_sincronizado_em,
    'regra_versao', 'presenca-v2',
    'pendencias', v_pendencias,
    'conflitos', v_conflitos,
    'revisoes_estruturais', v_revisoes
  );
end;
$function$;

