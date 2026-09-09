begin;

-- Competencia encerrada so pode ser lida do fechamento comercial que conserva
-- o universo e a autoria daquele mes. Se esse documento faltar, a origem fica
-- incompleta: nunca recompomos o passado com cadastro vivo nem com payloads
-- gerenciais antigos. Apenas a competencia corrente usa a fonte operacional.
create or replace function public.relatorio_coordenacao_matriculas_base_v4(
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
  v_periodo record;
  v_unidade record;
  v_documento public.fechamento_mensal_snapshots%rowtype;
  v_item jsonb;
  v_linha record;
  v_professor_id integer;
  v_nome_professor text;
  v_total integer := 0;
  v_atribuidas integer := 0;
  v_sem_professor integer := 0;
  v_total_fonte integer;
  v_origem_completa boolean := true;
  v_por_professor jsonb := '{}'::jsonb;
  v_documentos jsonb := '[]'::jsonb;
begin
  for v_periodo in
    select * from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    ) order by competencia
  loop
    for v_unidade in
      select * from public.relatorio_coordenacao_unidades_v4(p_unidade_id)
      order by unidade_id
    loop
      v_documento := null;
      v_total_fonte := 0;

      select s.* into v_documento
      from public.fechamento_mensal_snapshots s
      where s.ano = extract(year from v_periodo.competencia)::integer
        and s.mes = extract(month from v_periodo.competencia)::integer
        and s.escopo = 'unidade'
        and s.unidade_id = v_unidade.unidade_id
        and s.dominio = 'relatorio_comercial_mensal'
        and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
        and jsonb_typeof(s.payload -> 'matriculas') = 'array'
      order by s.versao desc
      limit 1;

      if v_documento.id is not null then
        for v_item in
          select value
          from jsonb_array_elements(v_documento.payload -> 'matriculas')
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := null;

          if coalesce(v_item ->> 'id', '') ~ '^\d+$' then
            select a.professor_experimental_id into v_professor_id
            from public.alunos a
            where a.id = (v_item ->> 'id')::integer;
          end if;

          v_nome_professor := coalesce(
            nullif(btrim(v_item ->> 'professores_experimentais'), ''),
            nullif(btrim(v_item ->> 'professores'), '')
          );
          if v_professor_id is null and v_nome_professor is not null then
            select min(p.id) into v_professor_id
            from public.professores p
            where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
                = regexp_replace(lower(public.unaccent(v_nome_professor)), '\s+', ' ', 'g')
            having count(*) = 1;
          end if;

          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'relatorio_comercial_mensal',
          'documento_id', v_documento.id,
          'versao', v_documento.versao,
          'hash', v_documento.payload_hash,
          'capturado_em', v_documento.capturado_em,
          'matriculas', v_total_fonte
        ));
      elsif v_periodo.competencia = date_trunc('month', current_date)::date then
        for v_linha in
          select m.aluno_id, a.professor_experimental_id
          from public.matriculas_comerciais_v1(
            v_unidade.unidade_id,
            v_periodo.inicio,
            v_periodo.fim + 1
          ) m
          join public.alunos a on a.id = m.aluno_id
          where m.conta is true
          order by m.data_matricula, m.aluno_id
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := v_linha.professor_experimental_id;
          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'periodo_em_andamento',
          'matriculas', v_total_fonte,
          'data_corte', v_periodo.fim
        ));
      else
        v_origem_completa := false;
        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'fechamento_comercial_ausente',
          'matriculas', null
        ));
      end if;

      v_total := v_total + v_total_fonte;
    end loop;
  end loop;

  return jsonb_build_object(
    'origem_completa', v_origem_completa,
    'matriculas_total', case when v_origem_completa then v_total else null end,
    'matriculas_atribuidas_professor', case
      when v_origem_completa then v_atribuidas else null end,
    'matriculas_sem_professor', case
      when v_origem_completa then v_sem_professor else null end,
    'por_professor', case when v_origem_completa then v_por_professor else '{}'::jsonb end,
    'documentos', v_documentos,
    'regra', 'matriculas_comerciais_atribuidas_ao_professor_da_experimental'
  );
end;
$function$;

revoke all on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date)
  to service_role;

comment on function public.relatorio_coordenacao_matriculas_base_v4(uuid, integer, integer, text, date) is
  'Composicao comercial V4: fechamento comercial para competencias encerradas; fonte operacional somente na competencia corrente; sem fallback legado.';

commit;
