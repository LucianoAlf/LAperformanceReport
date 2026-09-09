begin;

-- A soma de medias por professor acumula arredondamentos de centesimos. O total
-- do ciclo precisa manter o mesmo grao do fechamento gerencial: soma da carteira
-- em cada competencia e media dos totais mensais, com arredondamento apenas no
-- resultado final.
alter function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  rename to montar_relatorio_coordenacao_conteudo_base_v4;

create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with base as materialized (
    select public.montar_relatorio_coordenacao_conteudo_base_v4(
      p_unidade_id,
      p_ano,
      p_mes,
      p_periodicidade
    ) as payload
  ), professores as (
    select p.item
    from base b
    cross join lateral jsonb_array_elements(b.payload -> 'professores') p(item)
  ), fechamentos as (
    select
      nullif(p.item ->> 'professor_id', '')::integer as professor_id,
      nullif(f.item ->> 'competencia', '')::date as competencia,
      nullif(f.item ->> 'valor', '')::numeric as carteira
    from professores p
    cross join lateral jsonb_array_elements(
      coalesce(
        p.item #> '{metricas,numero_alunos,detalhes,fechamentos}',
        '[]'::jsonb
      )
    ) f(item)
  ), totais_mensais as (
    select f.competencia, sum(f.carteira) as carteira
    from fechamentos f
    where f.carteira is not null
    group by f.competencia
  ), estatisticas as (
    select
      (select avg(t.carteira) from totais_mensais t) as carteira_media_exata,
      count(distinct f.professor_id) filter (where f.carteira is not null)
        as professores_observados
    from fechamentos f
  )
  select jsonb_set(
    jsonb_set(
      b.payload,
      '{carteira_carga,alunos_na_carteira}',
      case
        when e.carteira_media_exata is null then 'null'::jsonb
        else to_jsonb(round(e.carteira_media_exata, 2))
      end,
      true
    ),
    '{carteira_carga,media_por_professor}',
    case
      when e.carteira_media_exata is null or e.professores_observados = 0
        then 'null'::jsonb
      else to_jsonb(round(
        e.carteira_media_exata / e.professores_observados,
        1
      ))
    end,
    true
  )
  from base b
  cross join estatisticas e;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_base_v4(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_base_v4(uuid, integer, integer, text)
  to service_role;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_base_v4(uuid, integer, integer, text) is
  'Composicao factual V4 antes do ajuste de granularidade do total de carteira.';

comment on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text) is
  'Documento factual V4 com carteira total calculada por fechamento mensal, sem soma de valores intermediarios arredondados.';

commit;
