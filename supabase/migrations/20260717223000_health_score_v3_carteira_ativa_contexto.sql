-- Contexto separado da permanencia oficial: idade dos vinculos ainda ativos.
-- Nao compoe nota, numerador ou denominador do Health Score V3.

create or replace function public.get_professor_carteira_ativa_tempo_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  idade_media_meses numeric,
  amostra_ativa integer,
  amostra_publicavel integer,
  publicavel boolean,
  fonte text,
  regra_versao text,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with params as (
  select date_trunc('month', p_competencia)::date as competencia,
    (date_trunc('month', p_competencia) + interval '1 month')::date
      as fim_competencia_exclusivo
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), ativos as (
  select pe.*, p.competencia, p.fim_competencia_exclusivo
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  cross join params p
  where pe.professor_id is not null
    and pe.status_periodo = 'ativo'
    and (pe.data_inicio at time zone 'America/Sao_Paulo')::date
      < p.fim_competencia_exclusivo
), agregado as (
  select
    a.professor_id,
    case when p_unidade_id is null then null::uuid else a.unidade_id end
      as unidade_saida,
    a.competencia,
    avg(
      extract(epoch from (
        (a.fim_competencia_exclusivo::timestamp at time zone 'America/Sao_Paulo')
        - a.data_inicio
      )) / 86400.0 / 30.44
    ) as idade_media_meses,
    count(*)::integer as amostra_ativa,
    count(*) filter (
      where a.publicavel = true
        and a.confianca in ('alta', 'revisado_aprovado')
    )::integer as amostra_publicavel,
    count(*) filter (where a.inicio_incompleto)::integer as inicio_incompleto
  from ativos a
  group by a.professor_id,
    case when p_unidade_id is null then null::uuid else a.unidade_id end,
    a.competencia
)
select
  ag.professor_id,
  pr.nome as professor_nome,
  ag.unidade_saida as unidade_id,
  ag.competencia,
  round(ag.idade_media_meses, 2) as idade_media_meses,
  ag.amostra_ativa,
  ag.amostra_publicavel,
  false as publicavel,
  'vw_professor_periodos_efetivos_v3_sombra'::text as fonte,
  'health-score-professor-v3-carteira-ativa-contexto-1'::text as regra_versao,
  jsonb_build_object(
    'entra_no_score', false,
    'leitura', 'idade media dos vinculos ainda ativos no fechamento da competencia',
    'inicio_incompleto', ag.inicio_incompleto,
    'aviso', 'contexto operacional separado da permanencia historica encerrada'
  ) as detalhes
from agregado ag
join public.professores pr on pr.id = ag.professor_id
order by pr.nome, ag.unidade_saida;
$$;

comment on function public.get_professor_carteira_ativa_tempo_v3_sombra(date, uuid) is
  'V3 sombra: idade media da carteira ativa, separada e explicitamente fora do score de permanencia.';

revoke all on function public.get_professor_carteira_ativa_tempo_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_carteira_ativa_tempo_v3_sombra(date, uuid)
  to service_role;
