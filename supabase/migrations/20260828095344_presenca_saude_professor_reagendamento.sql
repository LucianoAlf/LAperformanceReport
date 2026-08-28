-- A view de saude unia a confirmacao somente por aula_id. O mesmo id local
-- acompanha reagendamentos e pode trocar data/professor; a limpeza intencional
-- da ocorrencia antiga passava entao a parecer uma sobrescrita pelo sync.
-- `sync_ausente_emusys` tambem era contado como cancelamento humano desfeito.

create index if not exists idx_automacao_log_limpeza_reagendamento_aula
  on public.automacao_log ((detalhes ->> 'aula_id'), created_at desc)
  where acao = 'presenca_limpa_por_reagendamento';

create or replace view public.vw_saude_presenca_professor as
with limpezas_reagendamento as materialized (
  select
    l.detalhes ->> 'aula_id' as aula_id_texto,
    max(l.created_at) as ultima_limpeza
  from public.automacao_log l
  where l.acao = 'presenca_limpa_por_reagendamento'
    and l.detalhes ->> 'aula_id' is not null
  group by l.detalhes ->> 'aula_id'
), janela as (
  select
    ae.id,
    ae.unidade_id,
    ae.professor_presenca,
    ae.professor_presenca_origem,
    ae.cancelada,
    ae.cancelada_origem,
    ppc.estava_presente,
    ppc.respondido_em
  from public.aulas_emusys ae
  left join limpezas_reagendamento lr
    on lr.aula_id_texto = ae.id::text
  left join public.professor_ponto_confirmacoes ppc
    on ppc.aula_emusys_id = ae.id
   and ppc.professor_id = ae.professor_id
   and ppc.data_aula = ae.data_aula
   and (
     lr.ultima_limpeza is null
     or ppc.respondido_em > lr.ultima_limpeza
   )
  where ae.data_aula between
    (now() at time zone 'America/Sao_Paulo')::date - 7
    and (now() at time zone 'America/Sao_Paulo')::date
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  count(*) filter (
    where j.professor_presenca_origem is not null
  )::integer as marcacoes_humanas,
  count(*) filter (
    where j.estava_presente is not null
      and not coalesce(j.cancelada, false)
      and (
        (j.estava_presente
          and j.professor_presenca is distinct from 'presente')
        or
        (not j.estava_presente
          and j.professor_presenca is distinct from 'ausente')
      )
  )::integer as revertidas,
  count(*) filter (
    where j.cancelada_origem = 'agenda_secretaria'
      and not coalesce(j.cancelada, false)
  )::integer as cancelamentos_humanos_desfeitos,
  count(*) filter (
    where j.estava_presente is not null
      and j.professor_presenca_origem is null
  )::integer as sem_procedencia_na_ficha,
  max(j.respondido_em) as ultima_marcacao
from public.unidades u
left join janela j on j.unidade_id = u.id
where u.ativo = true
group by u.id, u.nome;

comment on view public.vw_saude_presenca_professor is
  'Saude da protecao humana em aulas_emusys. Compara somente professor/data da ocorrencia atual e ignora confirmacao invalidada por limpeza auditada de reagendamento. `revertidas` e `cancelamentos_humanos_desfeitos` devem permanecer 0.';

revoke all on public.vw_saude_presenca_professor
  from public, anon, authenticated;
grant select on public.vw_saude_presenca_professor
  to authenticated, service_role;
