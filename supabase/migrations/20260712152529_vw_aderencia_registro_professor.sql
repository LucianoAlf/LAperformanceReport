-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- A METRICA QUE FALTA NO SISTEMA.
-- O Health Score do professor mede carteira, retencao, conversao e presenca — e e CEGO ao
-- pedagogico. O Ramon tem Health 68 "retencao impecavel" com 0 registros em 621 aulas.
--
-- ATENCAO — DUAS METRICAS DIFERENTES (nao confundir):
--   COBERTURA    = "tem registro agora?"  → funciona para o legado. NAO e o North Star.
--   PONTUALIDADE = "teve registro em <=24h?" → SO computavel para o que o LA Teacher escreveu.
--     Motivo (auditoria do Codex, 12/07): o Emusys nao expoe QUANDO a anotacao foi escrita.
--     aluno_presenca.respondido_em de origem 'emusys' e carimbo do SYNC, nao da acao humana.
--     Logo: o legado e IMENSURAVEL em 24h, e sempre sera. O relogio nasce com o app.
--
-- Grao: aula INDIVIDUAL x professor x mes (a aula individual e onde o prontuario do aluno mora).
drop view if exists public.vw_aderencia_registro_professor;
create view public.vw_aderencia_registro_professor
with (security_invoker = true)
as
with alvos as (
  select
    ae.id, ae.professor_id, ae.professor_nome, ae.unidade_id,
    ae.data_aula, ae.data_hora_fim,
    date_trunc('month', ae.data_aula)::date as mes,
    public.fn_curso_base(ae.curso_nome) as curso_base,
    nullif(btrim(coalesce(ae.anotacoes_fabio,'')),'') is not null as tem_fabio,
    nullif(btrim(coalesce(ae.anotacoes,'')),'')       is not null as tem_emusys,
    -- quando o Fabio escreveu (unico timestamp REAL que existe)
    (select min(l.criado_em) from public.aula_registros_fabio_log l where l.aula_id = ae.id) as fabio_escrito_em
  from public.aulas_emusys ae
  where ae.professor_id is not null
    and coalesce(ae.cancelada,false) = false
    and ae.data_hora_fim < now()
    and (
      ae.tipo <> 'turma'                                  -- aula individual
      or not exists (                                     -- ou turma sem individuais paralelas
        select 1 from public.aulas_emusys i
         where i.tipo = 'individual'
           and i.unidade_id = ae.unidade_id
           and i.data_hora_inicio = ae.data_hora_inicio
           and i.professor_id is not distinct from ae.professor_id)
    )
)
select
  a.professor_id,
  a.professor_nome,
  a.unidade_id,
  a.mes,
  count(*)                                                     as aulas,

  -- COBERTURA (serve pro legado; NAO e o North Star)
  count(*) filter (where a.tem_fabio or a.tem_emusys)          as com_registro,
  round(100.0 * count(*) filter (where a.tem_fabio or a.tem_emusys) / nullif(count(*),0)) as pct_cobertura,

  count(*) filter (where a.tem_fabio)                          as registros_fabio,
  count(*) filter (where a.tem_emusys and not a.tem_fabio)     as registros_emusys,

  -- PONTUALIDADE — o NORTH STAR. So conta o que passou pelo app (tem hora de verdade).
  count(*) filter (where a.data_aula >= public.fn_data_corte_cobranca()) as aulas_pos_corte,
  count(*) filter (where a.fabio_escrito_em is not null
                     and a.fabio_escrito_em <= a.data_hora_fim + interval '24 hours'
                     and a.data_aula >= public.fn_data_corte_cobranca())  as registradas_em_24h,
  round(100.0 * count(*) filter (where a.fabio_escrito_em is not null
                                   and a.fabio_escrito_em <= a.data_hora_fim + interval '24 hours'
                                   and a.data_aula >= public.fn_data_corte_cobranca())
        / nullif(count(*) filter (where a.data_aula >= public.fn_data_corte_cobranca()), 0)
  ) as pct_north_star,

  -- tempo mediano ate registrar (so o que tem hora real)
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
  'Aderencia ao registro de aula por professor/mes. pct_cobertura = tem texto (serve pro legado). pct_north_star = registrado em <=24h — SO mensuravel para registros do LA Teacher (o Emusys nao guarda quando a anotacao foi escrita). NAO use pct_cobertura como North Star.';
