-- Complementa as migrations administrativas sincronizadas do banco com a RPC
-- detalhada de trancamentos consumida pelo relatorio diario canonico.

create or replace function public.get_trancamentos_admin_operacionais_v1(
  p_unidade_id uuid,
  p_data_referencia date default (
    (now() at time zone 'America/Sao_Paulo')::date
  )
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
begin
  if p_unidade_id is null then
    raise exception 'UNIDADE_OBRIGATORIA'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.pode_gerar_relatorio_admin_v1(p_unidade_id) then
    raise exception 'RELATORIO_ADMIN_NAO_AUTORIZADO'
      using errcode = '42501';
  end if;

  with alunos_com_chave as (
    select
      a.*,
      case
        when btrim(coalesce(a.emusys_matricula_id, '')) ~ '^[0-9]+$'
          then btrim(a.emusys_matricula_id)::bigint
        else null
      end as emusys_matricula_id_numero
    from public.alunos a
    where a.unidade_id = p_unidade_id
      and a.arquivado_em is null
  ),
  trancamentos_base as (
    select
      a.id as aluno_id,
      a.nome as aluno_nome,
      a.emusys_matricula_id,
      c.nome as curso_nome,
      eo.trancamento_data_inicial as data_inicio,
      coalesce(eo.trancamento_data_final, mov.previsao_retorno) as data_final,
      coalesce(
        nullif(btrim(eo.trancamento_motivo), ''),
        nullif(btrim(mov.motivo), '')
      ) as motivo,
      case
        when eo.trancamento_data_inicial is null then null
        else greatest(p_data_referencia - eo.trancamento_data_inicial, 0)
      end::integer as dias_trancado,
      case
        when eo.trancamento_data_inicial is null then 'data_ausente'
        when p_data_referencia <= (eo.trancamento_data_inicial + interval '1 month')::date
          then 'contratual'
        when p_data_referencia <= (eo.trancamento_data_inicial + interval '2 months')::date
          then 'extensao_gerencial'
        else 'fora_da_politica'
      end as faixa_politica,
      case
        when eo.trancamento_data_inicial is null then 1
        when p_data_referencia > (eo.trancamento_data_inicial + interval '2 months')::date then 0
        when p_data_referencia > (eo.trancamento_data_inicial + interval '1 month')::date then 2
        else 3
      end as prioridade,
      case
        when coalesce(
          nullif(btrim(a.emusys_student_id), ''),
          ea.emusys_aluno_id::text,
          j.emusys_aluno_id::text
        ) is not null
          then 'emusys:' || coalesce(
            nullif(btrim(a.emusys_student_id), ''),
            ea.emusys_aluno_id::text,
            j.emusys_aluno_id::text
          )
        else 'local:' || a.id::text
      end as pessoa_key
    from alunos_com_chave a
    join public.vw_alunos_estado_operacional_v131 eo
      on eo.aluno_id = a.id
     and eo.unidade_id = a.unidade_id
     and eo.eh_trancamento_atual = true
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join lateral (
      select estado.emusys_aluno_id
      from public.emusys_matriculas_estado_atual estado
      where estado.unidade_id = a.unidade_id
        and estado.emusys_aluno_id is not null
        and (
          estado.emusys_matricula_id = a.emusys_matricula_id_numero
          or estado.aluno_id = a.id
        )
      order by
        (estado.emusys_matricula_id = a.emusys_matricula_id_numero) desc,
        estado.sincronizado_em desc
      limit 1
    ) ea on true
    left join lateral (
      select jornada.emusys_aluno_id
      from public.aluno_jornada_matricula_disciplina jornada
      where jornada.unidade_id = a.unidade_id
        and jornada.emusys_aluno_id is not null
        and (
          jornada.emusys_matricula_id = a.emusys_matricula_id_numero
          or jornada.aluno_id = a.id
        )
      order by
        (jornada.emusys_matricula_id = a.emusys_matricula_id_numero) desc,
        jornada.ultima_sincronizacao_emusys desc
      limit 1
    ) j on true
    left join lateral (
      select m.motivo, m.previsao_retorno
      from public.movimentacoes_admin m
      where m.unidade_id = a.unidade_id
        and m.tipo = 'trancamento'
        and (
          (
            nullif(btrim(m.emusys_matricula_id), '') is not null
            and btrim(m.emusys_matricula_id) = btrim(a.emusys_matricula_id)
          )
          or m.aluno_id = a.id
        )
      order by
        (
          nullif(btrim(m.emusys_matricula_id), '') is not null
          and btrim(m.emusys_matricula_id) = btrim(a.emusys_matricula_id)
        ) desc,
        m.data desc,
        m.created_at desc
      limit 1
    ) mov on true
    where not (
      coalesce(c.is_projeto_banda, false)
      or coalesce(tm.codigo, '') = 'BANDA'
      or lower(coalesce(c.nome, '')) like '%coral%'
    )
  ),
  totais as (
    select
      count(distinct pessoa_key)::integer as total_alunos,
      count(*)::integer as total_matriculas
    from trancamentos_base
  )
  select jsonb_build_object(
    'fonte', 'estado_operacional_emusys_v131',
    'data_referencia', p_data_referencia,
    'unidade_id', p_unidade_id,
    'total_alunos', totais.total_alunos,
    'total_matriculas', totais.total_matriculas,
    'itens', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'aluno_nome', tb.aluno_nome,
            'curso_nome', tb.curso_nome,
            'emusys_matricula_id', tb.emusys_matricula_id,
            'data_inicio', tb.data_inicio,
            'data_final', tb.data_final,
            'dias_trancado', tb.dias_trancado,
            'faixa_politica', tb.faixa_politica,
            'motivo', tb.motivo
          )
          order by tb.prioridade, tb.dias_trancado desc nulls last, tb.aluno_nome
        )
        from trancamentos_base tb
      ),
      '[]'::jsonb
    )
  ) into v_resultado
  from totais;

  return v_resultado;
end;
$function$;

comment on function public.get_trancamentos_admin_operacionais_v1(uuid, date) is
  'Trancamentos atuais no grao de matricula, com politica de um mes contratual, um mes gerencial e alerta acima de dois meses.';

revoke all on function public.get_trancamentos_admin_operacionais_v1(uuid, date)
  from public, anon;
grant execute on function public.get_trancamentos_admin_operacionais_v1(uuid, date)
  to authenticated, service_role;
