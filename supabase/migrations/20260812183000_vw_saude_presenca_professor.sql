-- Observabilidade do trg_proteger_decisao_humana_aula (migration 20260812180000).
-- O trigger e silencioso por desenho (nao loga, nao levanta excecao): se parar de
-- funcionar, a marcacao volta a sumir sem sinal nenhum. Mesmo modo de falha do
-- trg_jornada_ciclo_sucedido, mesma solucao: view de saude com coluna que deve ser 0.
--
-- ⚠️ Residual conhecido: marcacoes de 10-11/08/2026 aparecem em `revertidas` com
-- `professor_presenca_origem` NULL — sao anteriores ao fix e ficaram fora do backfill
-- de proposito (o Emusys ja tinha o lancamento real dessas datas). So e fracasso quando
-- a origem esta preenchida.
create or replace view public.vw_saude_presenca_professor as
with janela as (
  select ae.id, ae.unidade_id, ae.professor_presenca, ae.professor_presenca_origem,
         ae.cancelada, ae.cancelada_origem, ppc.estava_presente, ppc.respondido_em
  from public.aulas_emusys ae
  left join public.professor_ponto_confirmacoes ppc
         on ppc.aula_emusys_id = ae.id and ppc.origem = 'chamada_secretaria'
  where ae.data_aula between (now() at time zone 'America/Sao_Paulo')::date - 7
                         and (now() at time zone 'America/Sao_Paulo')::date
)
select u.id as unidade_id,
       u.nome as unidade_nome,
       count(*) filter (where j.professor_presenca_origem is not null)::integer as marcacoes_humanas,
       count(*) filter (
         where j.estava_presente is not null and not coalesce(j.cancelada, false)
           and ((j.estava_presente and j.professor_presenca is distinct from 'presente')
             or (not j.estava_presente and j.professor_presenca is distinct from 'ausente'))
       )::integer as revertidas,
       count(*) filter (
         where j.cancelada_origem is not null and not coalesce(j.cancelada, false)
       )::integer as cancelamentos_humanos_desfeitos,
       count(*) filter (
         where j.estava_presente is not null and j.professor_presenca_origem is null
       )::integer as sem_procedencia_na_ficha,
       max(j.respondido_em) as ultima_marcacao
from public.unidades u
left join janela j on j.unidade_id = u.id
where u.ativo = true
group by u.id, u.nome;

comment on view public.vw_saude_presenca_professor is
  'Saude da protecao de decisao humana em aulas_emusys (janela de 7 dias). `revertidas` e `cancelamentos_humanos_desfeitos` DEVEM ser 0 — se subirem, trg_proteger_decisao_humana_aula parou de proteger ou houve escrita fora das RPCs da Agenda. Contexto: em 12/08/2026, 77 de 83 marcacoes (92,8%) eram apagadas pelo sync de metadados a cada 15 min.';

-- ALTER DEFAULT PRIVILEGES pega VIEW tambem: relacao nova nasce com authenticated=arwdDxtm.
revoke all on public.vw_saude_presenca_professor from public, anon, authenticated;
grant select on public.vw_saude_presenca_professor to authenticated, service_role;
