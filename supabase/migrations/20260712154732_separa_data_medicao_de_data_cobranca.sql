-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ERRO DE DESENHO (pego em 12/07): eu usei fn_data_corte_cobranca() para DUAS coisas distintas.
--   COBRAR   -> 21/07 (anistia D-G1: o bot nao cobra o passivo)
--   MEDIR    -> 13/07 (o piloto do Matheus comeca amanha; a semana dele TEM que contar)
-- Com uma funcao so, a semana do piloto ficaria invisivel no North Star.
create or replace function public.fn_data_inicio_medicao()
returns date language sql immutable parallel safe
as $$ select date '2026-07-13' $$;

comment on function public.fn_data_inicio_medicao() is
  'Inicio da medicao do North Star (% de aulas com registro em <=24h). 13/07 = 1o dia do piloto (Matheus). Antes disso o Emusys nao guarda QUANDO a anotacao foi escrita — legado imensuravel.';

comment on function public.fn_data_corte_cobranca() is
  'Anistia D-G1: o Fabio so COBRA registro de aulas a partir de 21/07. Diferente de fn_data_inicio_medicao (13/07): a gente mede o piloto sem cobrar ninguem.';

drop view if exists public.vw_aderencia_registro_professor;
create view public.vw_aderencia_registro_professor
with (security_invoker = true)
as
with alvos as (
  select
    ae.id, ae.professor_id, ae.professor_nome, ae.unidade_id,
    ae.data_aula, ae.data_hora_fim,
    date_trunc('month', ae.data_aula)::date as mes,
    nullif(btrim(coalesce(ae.anotacoes_fabio,'')),'') is not null as tem_fabio,
    nullif(btrim(coalesce(ae.anotacoes,'')),'')       is not null as tem_emusys,
    (select min(l.criado_em) from public.aula_registros_fabio_log l where l.aula_id = ae.id) as fabio_escrito_em
  from public.aulas_emusys ae
  where ae.professor_id is not null
    and coalesce(ae.cancelada,false) = false
    and ae.data_hora_fim < now()
    and (
      ae.tipo <> 'turma'
      or not exists (
        select 1 from public.aulas_emusys i
         where i.tipo = 'individual'
           and i.unidade_id = ae.unidade_id
           and i.data_hora_inicio = ae.data_hora_inicio
           and i.professor_id is not distinct from ae.professor_id)
    )
)
select
  a.professor_id, a.professor_nome, a.unidade_id, a.mes,
  count(*) as aulas,

  -- COBERTURA (serve pro legado; NAO e o North Star)
  count(*) filter (where a.tem_fabio or a.tem_emusys) as com_registro,
  round(100.0 * count(*) filter (where a.tem_fabio or a.tem_emusys) / nullif(count(*),0)) as pct_cobertura,
  count(*) filter (where a.tem_fabio)                      as registros_fabio,
  count(*) filter (where a.tem_emusys and not a.tem_fabio) as registros_emusys,

  -- NORTH STAR: so o que passou pelo app (unico com hora real), a partir do PILOTO (13/07)
  count(*) filter (where a.data_aula >= public.fn_data_inicio_medicao()) as aulas_mensuraveis,
  count(*) filter (where a.data_aula >= public.fn_data_inicio_medicao()
                     and a.fabio_escrito_em is not null
                     and a.fabio_escrito_em <= a.data_hora_fim + interval '24 hours') as registradas_em_24h,
  round(100.0 * count(*) filter (where a.data_aula >= public.fn_data_inicio_medicao()
                                   and a.fabio_escrito_em is not null
                                   and a.fabio_escrito_em <= a.data_hora_fim + interval '24 hours')
        / nullif(count(*) filter (where a.data_aula >= public.fn_data_inicio_medicao()), 0)
  ) as pct_north_star,

  -- quantas ja sao COBRAVEIS pelo bot (anistia: so pos 21/07)
  count(*) filter (where a.data_aula >= public.fn_data_corte_cobranca()) as aulas_cobraveis,

  round((percentile_cont(0.5) within group (
      order by extract(epoch from (a.fabio_escrito_em - a.data_hora_fim))/3600.0
  ))::numeric, 1) as horas_medianas_ate_registrar
from alvos a
group by 1,2,3,4;

revoke all on public.vw_aderencia_registro_professor from public, anon;
grant select on public.vw_aderencia_registro_professor to authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant select on public.vw_aderencia_registro_professor to fabio_agent';
  end if;
end $$;

comment on view public.vw_aderencia_registro_professor is
  'Aderencia ao registro. pct_cobertura = tem texto (legado). pct_north_star = registrado em <=24h, medido a partir de 13/07 (piloto). aulas_cobraveis = o que o bot pode cobrar (pos 21/07). NAO confundir as tres.';
