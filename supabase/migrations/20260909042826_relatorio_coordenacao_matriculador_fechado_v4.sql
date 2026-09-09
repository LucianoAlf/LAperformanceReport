begin;

-- O fechamento comercial congela o professor da experimental junto com a
-- matricula. Alteracoes posteriores no cadastro do aluno nao podem reescrever
-- um ranking historico ja fechado.
alter function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date)
  rename to relatorio_coordenacao_matriculas_base_v4;

create or replace function public.relatorio_coordenacao_matriculas_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
  v_documento jsonb;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_item jsonb;
  v_nome_fechado text;
  v_professor_atual integer;
  v_professor_fechado integer;
  v_quantidade integer;
  v_atribuidas integer;
  v_sem_professor integer;
  v_por_professor jsonb;
begin
  v_resultado := public.relatorio_coordenacao_matriculas_base_v4(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade,
    p_data_corte
  );

  if not coalesce((v_resultado ->> 'origem_completa')::boolean, false) then
    return v_resultado;
  end if;

  v_por_professor := coalesce(v_resultado -> 'por_professor', '{}'::jsonb);
  v_atribuidas := coalesce((v_resultado ->> 'matriculas_atribuidas_professor')::integer, 0);
  v_sem_professor := coalesce((v_resultado ->> 'matriculas_sem_professor')::integer, 0);

  for v_documento in
    select value
    from jsonb_array_elements(coalesce(v_resultado -> 'documentos', '[]'::jsonb))
    where value ->> 'tipo' = 'relatorio_comercial_mensal'
    order by value ->> 'competencia', value ->> 'unidade_id'
  loop
    v_snapshot := null;
    select s.* into v_snapshot
    from public.fechamento_mensal_snapshots s
    where s.id = (v_documento ->> 'documento_id')::uuid;

    if v_snapshot.id is null
       or jsonb_typeof(v_snapshot.payload -> 'matriculas') <> 'array' then
      raise exception 'RELATORIO_COORDENACAO_V4_FECHAMENTO_COMERCIAL_INVALIDO'
        using errcode = '22000';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_snapshot.payload -> 'matriculas')
    loop
      v_nome_fechado := coalesce(
        nullif(btrim(v_item ->> 'professores_experimentais'), ''),
        nullif(btrim(v_item ->> 'professores'), '')
      );

      v_professor_atual := null;
      if coalesce(v_item ->> 'id', '') ~ '^\d+$' then
        select a.professor_experimental_id into v_professor_atual
        from public.alunos a
        where a.id = (v_item ->> 'id')::integer;
      end if;

      if v_professor_atual is null and v_nome_fechado is not null then
        select min(p.id) into v_professor_atual
        from public.professores p
        where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
            = regexp_replace(lower(public.unaccent(v_nome_fechado)), '\s+', ' ', 'g')
        having count(*) = 1;
      end if;

      v_professor_fechado := null;
      if v_nome_fechado is not null then
        select min(p.id) into v_professor_fechado
        from public.professores p
        where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
            = regexp_replace(lower(public.unaccent(v_nome_fechado)), '\s+', ' ', 'g')
        having count(*) = 1;
      end if;

      if v_professor_atual is distinct from v_professor_fechado then
        if v_professor_atual is not null then
          v_quantidade := coalesce(
            (v_por_professor ->> v_professor_atual::text)::integer,
            0
          );
          if v_quantidade <= 0 then
            raise exception 'RELATORIO_COORDENACAO_V4_ATRIBUICAO_COMERCIAL_INCONSISTENTE'
              using errcode = '22000';
          end if;
          v_por_professor := jsonb_set(
            v_por_professor,
            array[v_professor_atual::text],
            to_jsonb(v_quantidade - 1),
            true
          );
        end if;

        if v_professor_fechado is not null then
          v_por_professor := jsonb_set(
            v_por_professor,
            array[v_professor_fechado::text],
            to_jsonb(coalesce(
              (v_por_professor ->> v_professor_fechado::text)::integer,
              0
            ) + 1),
            true
          );
        end if;

        if v_professor_atual is null and v_professor_fechado is not null then
          v_atribuidas := v_atribuidas + 1;
          v_sem_professor := greatest(v_sem_professor - 1, 0);
        elsif v_professor_atual is not null and v_professor_fechado is null then
          v_atribuidas := greatest(v_atribuidas - 1, 0);
          v_sem_professor := v_sem_professor + 1;
        end if;
      end if;
    end loop;
  end loop;

  return v_resultado || jsonb_build_object(
    'por_professor', v_por_professor,
    'matriculas_atribuidas_professor', v_atribuidas,
    'matriculas_sem_professor', v_sem_professor,
    'regra_atribuicao_fechada', 'professor_registrado_no_fechamento_comercial'
  );
end;
$function$;

revoke all on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date)
  to service_role;

revoke all on function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date)
  to service_role;

comment on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date) is
  'Composicao comercial V4 antes da estabilizacao da autoria historica.';

comment on function public.relatorio_coordenacao_matriculas_v4(uuid, integer, integer, text, date) is
  'Matriculas V4; em fechamento comercial, a autoria vem do professor registrado no proprio documento e nao do cadastro vivo do aluno.';

commit;
