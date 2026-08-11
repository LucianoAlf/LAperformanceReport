-- Observabilidade do trigger de sucessao de ciclo (trg_jornada_ciclo_sucedido).
--
-- O trigger engole excecao de proposito (nao pode derrubar o sync/webhook). O preco
-- disso e que uma falha dele e SILENCIOSA -- exatamente o modo de falha que ja custou
-- caro neste projeto (crons marcando "succeeded" em cima de 401). Esta view e o
-- contra-peso: mede o ESTADO, nao a execucao.
--
-- Coluna de alarme: `orfaos_nao_marcados`. Sao pares (ciclo velho, ciclo novo) que
-- satisfazem o predicado do trigger e mesmo assim continuam sem `sucedida_por`.
-- Em regime normal e SEMPRE 0 -- o trigger marca no mesmo instante em que o ciclo novo
-- entra. Qualquer valor > 0 significa: trigger caiu, foi dropado, ou o predicado deixou
-- de casar (ex: o Emusys mudou a forma de numerar matricula_disciplina).
--
-- Como aferir:
--   select * from vw_saude_jornada_ciclos;              -- orfaos_nao_marcados deve ser 0
--   select * from vw_saude_jornada_ciclos where orfaos_nao_marcados > 0;
--
-- ⚠️ `vigentes_vencendo_30d` e a contagem que alimenta a aba Administrativo -> Contratos.
-- Serve para conferir contra GET /matriculas sem abrir a tela. Paridade medida em
-- 2026-08-10: Barra 11, CG 22, Recreio 15 -- identico a API nas tres.

create or replace view public.vw_saude_jornada_ciclos as
with pares as (
  select velha.unidade_id,
         velha.emusys_matricula_disciplina_id as md_velha,
         velha.sucedida_por
    from public.aluno_jornada_matricula_disciplina velha
    join public.aluno_jornada_matricula_disciplina nova
      on nova.unidade_id            = velha.unidade_id
     and nova.emusys_matricula_id   = velha.emusys_matricula_id
     and nova.emusys_disciplina_id  = velha.emusys_disciplina_id
     and nova.emusys_matricula_disciplina_id > velha.emusys_matricula_disciplina_id
     and nova.data_ultima_aula               > velha.data_ultima_aula
     and coalesce(nova.status_matricula, '') <> 'finalizada'
   where velha.status_matricula = 'ativa'
)
select
  u.id   as unidade_id,
  u.nome as unidade_nome,
  count(*) filter (where j.status_matricula = 'ativa' and j.sucedida_por is null)::integer      as ciclos_vigentes,
  count(*) filter (where j.sucedida_por is not null)::integer                                    as ciclos_sucedidos,
  -- ALARME: deve ser 0. Ver comentario no topo.
  (select count(*) from pares p
    where p.unidade_id = u.id and p.sucedida_por is null)::integer                               as orfaos_nao_marcados,
  max(j.sucedida_em)                                                                             as ultima_sucessao_anotada,
  (select count(*) from public.vw_contratos_vencendo v
    where v.unidade_id = u.id and v.dias_ate_vencimento between 0 and 30)::integer               as vigentes_vencendo_30d,
  (select count(*) from public.vw_contratos_vencendo v
    where v.unidade_id = u.id and v.dias_ate_venc_fatura between 0 and 30)::integer              as vigentes_fatura_30d
from public.unidades u
left join public.aluno_jornada_matricula_disciplina j on j.unidade_id = u.id
where u.ativo = true
group by u.id, u.nome;

revoke all on public.vw_saude_jornada_ciclos from public, anon, authenticated;
grant select on public.vw_saude_jornada_ciclos to authenticated, service_role;
