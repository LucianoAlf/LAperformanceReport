-- P21: alinha o bloco comercial do relatorio gerencial com o relatorio mensal comercial.
--
-- Raizes corrigidas:
-- 1) Taxa Exp -> Mat podia publicar numerador maior que "Matriculas no mes",
--    porque a conciliacao escolhia o maior sinal entre funil classificado e raw Emusys.
--    A partir de Junho/2026, o numerador publicado fica limitado ao total de
--    matriculas novas comerciais canonicas do mesmo periodo.
-- 2) "Canais com maior Lead->Matricula" vinha de uma query legada de 12 meses.
--    O gerencial passa a usar "matriculas por canal" do proprio mes, com a mesma
--    regra de matricula nova comercial usada no relatorio comercial.

do $$
begin
  if to_regprocedure('public.get_conciliacao_experimentais_v2_legacy_p21_20260707(uuid, integer, integer, text, date)') is null then
    alter function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date)
      rename to get_conciliacao_experimentais_v2_legacy_p21_20260707;
  end if;
end $$;

create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_resumo jsonb;
  v_inicio date;
  v_fim_exclusivo date;
  v_matriculas_comerciais integer := 0;
  v_conversoes_atual integer := 0;
  v_conversoes_corrigidas integer := 0;
  v_denominador integer := 0;
  v_taxa numeric;
begin
  v_result := public.get_conciliacao_experimentais_v2_legacy_p21_20260707(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodo,
    p_data
  );

  v_inicio := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
    else make_date(p_ano, p_mes, 1)
  end;
  v_fim_exclusivo := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then v_inicio + 1
    else (v_inicio + interval '1 month')::date
  end;

  -- Mantem historico antigo intacto antes de Junho/2026; Junho foi o fechamento
  -- em auditoria com comercial/gerencia.
  if v_inicio < date '2026-06-01' then
    return v_result;
  end if;

  with matriculas_base as (
    select
      a.unidade_id,
      a.data_matricula,
      lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g')) as nome_norm,
      regexp_replace(coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''), '\D', '', 'g') as telefone_norm
    from public.alunos a
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    where a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and lower(coalesce(a.status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
      and coalesce(a.is_segundo_curso, false) = false
      and coalesce(c.is_projeto_banda, false) = false
      and lower(coalesce(c.nome, '')) not like '%banda%'
      and lower(coalesce(c.nome, '')) not like '%canto coral%'
      and upper(coalesce(tm.codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
      and (coalesce(tm.conta_como_pagante, false) = true or coalesce(tm.entra_ticket_medio, false) = true)
      and coalesce(a.valor_parcela, 0) > 0
  ),
  matriculas_agrupadas as (
    select 1
    from matriculas_base
    group by unidade_id, data_matricula, nome_norm, telefone_norm
  )
  select count(*)::integer
    into v_matriculas_comerciais
  from matriculas_agrupadas;

  v_resumo := coalesce(v_result->'resumo', '{}'::jsonb);
  v_conversoes_atual := coalesce(nullif(v_resumo->>'conversoes_exp_mat_canonicas', '')::integer, 0);
  v_denominador := coalesce(nullif(v_resumo->>'denominador_taxa_exp_mat', '')::integer, 0);
  v_conversoes_corrigidas := least(v_conversoes_atual, v_matriculas_comerciais);

  if v_denominador > 0 then
    v_taxa := round(v_conversoes_corrigidas::numeric / v_denominador * 100, 1);
  else
    v_taxa := null;
  end if;

  v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_canonicas}', to_jsonb(v_conversoes_corrigidas), true);
  v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_canonica}', to_jsonb(v_taxa), true);
  v_resumo := jsonb_set(v_resumo, '{matriculas_comerciais_canonicas_periodo}', to_jsonb(v_matriculas_comerciais), true);
  v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_original_p21}', to_jsonb(v_conversoes_atual), true);
  v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_status}', to_jsonb(
    case
      when coalesce((v_resumo->>'taxa_exp_mat_liberada')::boolean, false)
      then 'liberada_p21_cap_matriculas_comerciais_periodo'
      else coalesce(nullif(v_resumo->>'taxa_exp_mat_status', ''), 'bloqueada_pendencias_conciliacao')
    end
  ), true);

  v_result := jsonb_set(v_result, '{resumo}', v_resumo, true);
  v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,status}', to_jsonb('p21_cap_matriculas_comerciais_periodo'::text), true);
  v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,numerador}', to_jsonb('conversoes canonicas limitadas ao total de matriculas novas comerciais canonicas do mesmo periodo'::text), true);

  return v_result;
end;
$function$;

revoke all on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) to authenticated, service_role;

comment on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) is
  'P21: wrapper da conciliacao de experimentais com numerador Exp->Mat limitado ao total de matriculas novas comerciais canonicas do periodo.';

do $$
begin
  if to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p21_20260707(uuid, integer, integer)') is null then
    alter function public.get_dados_relatorio_gerencial(uuid, integer, integer)
      rename to get_dados_relatorio_gerencial_legacy_p21_20260707;
  end if;
end $$;

create or replace function public.get_dados_relatorio_gerencial(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_canais jsonb;
begin
  v_result := public.get_dados_relatorio_gerencial_legacy_p21_20260707(p_unidade_id, p_ano, p_mes);

  with base as (
    select
      a.id,
      a.nome,
      a.telefone,
      a.responsavel_telefone,
      a.unidade_id,
      a.data_matricula,
      case
        when nullif(a.emusys_lead_id, '') ~ '^[0-9]+$' then nullif(a.emusys_lead_id, '')::integer
        else null
      end as emusys_lead_id_int,
      co_aluno.nome as canal_aluno,
      c.nome as curso_nome,
      tm.codigo as tipo_codigo,
      tm.conta_como_pagante,
      tm.entra_ticket_medio,
      a.valor_parcela,
      a.status,
      a.is_segundo_curso,
      coalesce(c.is_projeto_banda, false) as is_banda
    from public.alunos a
    left join public.canais_origem co_aluno on co_aluno.id = a.canal_origem_id
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    where a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  ),
  enriquecida as (
    select
      b.*,
      coalesce(b.canal_aluno, co_lead.nome, 'Não informado') as canal_resolvido
    from base b
    left join lateral (
      select l.*
      from public.leads l
      where l.unidade_id = b.unidade_id
        and (
          l.aluno_id = b.id
          or (b.emusys_lead_id_int is not null and l.emusys_lead_id = b.emusys_lead_id_int)
          or regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') in (
            regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g'),
            regexp_replace(coalesce(b.responsavel_telefone, ''), '\D', '', 'g')
          )
        )
      order by
        (
          case when l.aluno_id = b.id then 100 else 0 end
          + case when b.emusys_lead_id_int is not null and l.emusys_lead_id = b.emusys_lead_id_int then 80 else 0 end
          + case when lower(trim(coalesce(l.nome, ''))) = lower(trim(coalesce(b.nome, ''))) then 35 else 0 end
          + case
              when regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') <> ''
               and regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') in (
                regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g'),
                regexp_replace(coalesce(b.responsavel_telefone, ''), '\D', '', 'g')
              )
              then 20 else 0
            end
          + case when lower(coalesce(l.status, '')) = 'convertido' then 15 else 0 end
          + case when coalesce(l.data_contato, l.data_experimental) is not null and coalesce(l.data_contato, l.data_experimental) <= b.data_matricula then 5 else 0 end
          + case when coalesce(l.data_contato, l.data_experimental) is not null and coalesce(l.data_contato, l.data_experimental) > b.data_matricula then -10 else 0 end
        ) desc,
        coalesce(l.data_contato, l.data_experimental) desc nulls last,
        l.id desc
      limit 1
    ) lead on true
    left join public.canais_origem co_lead on co_lead.id = lead.canal_origem_id
  ),
  canonica as (
    select *
    from enriquecida
    where lower(coalesce(status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
      and coalesce(is_segundo_curso, false) = false
      and coalesce(is_banda, false) = false
      and lower(coalesce(curso_nome, '')) not like '%banda%'
      and lower(coalesce(curso_nome, '')) not like '%canto coral%'
      and upper(coalesce(tipo_codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
      and (coalesce(conta_como_pagante, false) = true or coalesce(entra_ticket_medio, false) = true)
      and coalesce(valor_parcela, 0) > 0
  ),
  agrupada as (
    select
      canal_resolvido,
      count(*)::integer as matriculas
    from canonica
    group by canal_resolvido
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'canal', canal_resolvido,
        'matriculas', matriculas,
        'fonte', 'matriculas_comerciais_mes'
      )
      order by matriculas desc, canal_resolvido
    ),
    '[]'::jsonb
  )
    into v_canais
  from agrupada;

  v_result := jsonb_set(v_result, '{canais_maior_conversao}', v_canais, true);
  v_result := jsonb_set(v_result, '{canais_maior_conversao_fonte}', to_jsonb('p21_matriculas_por_canal_mes_mesma_regra_relatorio_comercial'::text), true);

  return v_result;
end;
$function$;

revoke all on function public.get_dados_relatorio_gerencial(uuid, integer, integer) from public, anon;
grant execute on function public.get_dados_relatorio_gerencial(uuid, integer, integer) to authenticated, service_role;

comment on function public.get_dados_relatorio_gerencial(uuid, integer, integer) is
  'P21: gerencial com bloco comercial alinhado ao relatorio mensal comercial: Exp->Mat capado por matriculas comerciais e canais por matriculas do mes.';
