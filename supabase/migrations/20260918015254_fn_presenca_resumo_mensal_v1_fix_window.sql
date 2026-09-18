-- Corrige: window function nao pode aparecer dentro de jsonb_agg.
-- A contagem de reincidencia por aluno passa a ser calculada numa CTE propria.
create or replace function public.fn_presenca_resumo_mensal_v1(
  p_ano integer, p_mes integer, p_unidade_id uuid default null
)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_inicio date; v_fim date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_unidades jsonb := '[]'::jsonb;
  v_u record;
begin
  if p_ano is null or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception using errcode = '22023', message = 'COMPETENCIA_INVALIDA';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  if v_fim >= v_hoje then v_fim := v_hoje - 1; end if;
  if v_fim < v_inicio then
    raise exception using errcode = '22023', message = 'COMPETENCIA_AINDA_NAO_COMECOU';
  end if;

  for v_u in
    select u.id, u.nome from public.unidades u
    where u.ativo and (p_unidade_id is null or u.id = p_unidade_id)
      and u.nome not ilike '%TESTE%'
    order by u.nome
  loop
    declare
      v_itens jsonb := '[]'::jsonb;
      v_op integer := 0; v_av integer := 0; v_sem integer := 0;
      v_cegos jsonb := '[]'::jsonb;
    begin
      select
        count(*) filter (where x.tem_aula),
        count(*) filter (where x.tem_aula and x.publicavel),
        count(*) filter (where not x.tem_aula),
        coalesce(jsonb_agg(jsonb_build_object('dia', to_char(x.d,'DD/MM'), 'motivo', x.motivo)
                 order by x.d) filter (where x.tem_aula and not x.publicavel), '[]'::jsonb)
      into v_op, v_av, v_sem, v_cegos
      from (
        select d::date as d,
               exists (select 1 from public.aulas_emusys ae
                 where ae.unidade_id = v_u.id and ae.data_aula = d::date
                   and ae.data_hora_fim < now()
                   and coalesce(ae.categoria,'normal') = 'normal'
                   and not coalesce(ae.cancelada,false)
                   and ae.professor_id is not null) as tem_aula,
               coalesce((select c.status = 'concluida' and c.snapshot_hash is not null
                 from public.presenca_sync_cobertura c
                 where c.unidade_id = v_u.id and c.modo='presenca' and c.data_alvo = d::date), false) as publicavel,
               coalesce((select c.status from public.presenca_sync_cobertura c
                 where c.unidade_id = v_u.id and c.modo='presenca' and c.data_alvo = d::date),
                 'sem_cobertura') as motivo
        from generate_series(v_inicio, v_fim, interval '1 day') d
      ) x;

      with ocor as materialized (
        select o.slot_key, o.unidade_id, o.data_aula, o.fecha_chamada,
               o.possui_conflito, o.resultado_canonico, o.fonte_decisao
        from public.vw_presenca_ocorrencia_canonica_v2 o
        where o.unidade_id = v_u.id and o.data_aula between v_inicio and v_fim
      ), cand as materialized (
        select * from public.fn_presenca_candidatos_periodo_v1(v_u.id, v_inicio, v_fim)
      ), achados as (
        select distinct on (c.slot_key)
          c.slot_key, c.aluno_id, c.data_aula, c.curso_nome, c.turma_nome,
          c.professor_id, c.data_hora_inicio, c.roster_estado, c.tem_vinculo_roster,
          case when coalesce(o.possui_conflito,false) then 'divergencia' else 'sem_chamada' end as tipo,
          coalesce(o.resultado_canonico,'indeterminado') as resultado_canonico,
          coalesce(o.fonte_decisao,'sem_registro') as fonte_decisao
        from cand c
        left join ocor o on o.slot_key = c.slot_key
          and o.unidade_id = c.unidade_id and o.data_aula = c.data_aula
        where coalesce(o.fecha_chamada, false) = false
        order by c.slot_key, c.data_aula
      ), com_contagem as (
        select a.*, count(*) over (partition by a.aluno_id) as ocorrencias_no_mes
        from achados a
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'aluno_id', a.aluno_id,
        'aluno_nome', al.nome,
        'professor_nome', coalesce(pr.nome, '(sem professor)'),
        'curso_nome', coalesce(a.curso_nome, a.turma_nome, 'Aula'),
        'data', to_char(a.data_aula, 'DD/MM'),
        'data_iso', a.data_aula,
        'hora', to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'tipo', a.tipo,
        'resultado_canonico', a.resultado_canonico,
        'fonte_decisao', a.fonte_decisao,
        'tem_vinculo_roster', a.tem_vinculo_roster,
        'roster_estado', a.roster_estado,
        'ocorrencias_no_mes', a.ocorrencias_no_mes
      ) order by a.ocorrencias_no_mes desc, al.nome, a.data_aula), '[]'::jsonb)
      into v_itens
      from com_contagem a
      join public.alunos al on al.id = a.aluno_id
      left join public.professores pr on pr.id = a.professor_id;

      v_unidades := v_unidades || jsonb_build_object(
        'unidade_id', v_u.id,
        'unidade_nome', v_u.nome,
        'total', jsonb_array_length(v_itens),
        'sem_chamada', (select count(*) from jsonb_array_elements(v_itens) i where i->>'tipo'='sem_chamada'),
        'divergencias', (select count(*) from jsonb_array_elements(v_itens) i where i->>'tipo'='divergencia'),
        'alunos_distintos', (select count(distinct i->>'aluno_id') from jsonb_array_elements(v_itens) i),
        'reincidentes', (select count(*) from (
            select 1 from jsonb_array_elements(v_itens) i
            group by i->>'aluno_id' having count(*) > 1) z),
        'cobertura', jsonb_build_object(
          'dias_operacionais', v_op,
          'dias_avaliados', v_av,
          'dias_sem_aula', v_sem,
          'dias_nao_avaliados', v_cegos,
          'completa', (v_av = v_op)
        ),
        'itens', v_itens
      );
    end;
  end loop;

  return jsonb_build_object(
    'competencia', to_char(v_inicio,'MM/YYYY'),
    'periodo_inicio', v_inicio, 'periodo_fim', v_fim,
    'mes_parcial', v_fim < (v_inicio + interval '1 month - 1 day')::date,
    'regra_versao', 'presenca-resumo-mensal-v1',
    'gerado_em', now(),
    'unidades', v_unidades
  );
end;
$function$;

revoke all on function public.fn_presenca_resumo_mensal_v1(integer, integer, uuid) from public, anon;
grant execute on function public.fn_presenca_resumo_mensal_v1(integer, integer, uuid) to authenticated, service_role;;
