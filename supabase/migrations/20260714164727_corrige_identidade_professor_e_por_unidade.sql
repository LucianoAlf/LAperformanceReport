-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRECAO DE ERRO MEU (Claude Web, 14/07). Pego pelo Codex numa auditoria read-only.
--
-- Eu propus popular professores.emusys_id (global) e ate criei um indice UNICO nela.
-- ERRADO: a identidade do Emusys e POR UNIDADE. Prova em producao:
--   emusys_id 1002 = Gabriel Barbosa Rufino Otavio (Campo Grande)
--   emusys_id 1002 = Gabriel Santos Teixeira da Silva (Barra)
-- Sao DUAS PESSOAS. Meu indice unico teria forcado o sync a escolher um dos dois —
-- e jogar as aulas de um na carteira do outro. Bug pior que o original.
--
-- A chave canonica JA EXISTE e ja esta populada: professores_unidades(unidade_id, emusys_id).
drop index if exists public.uq_professores_emusys_id;
drop view if exists public.vw_aulas_sem_professor;

comment on column public.professores.emusys_id is
  'NAO USAR para resolver professor a partir do Emusys. A identidade do Emusys e POR UNIDADE: o mesmo emusys_id pode ser pessoas diferentes em unidades diferentes (caso real: 1002 = um Gabriel em CG, outro Gabriel na Barra). A chave canonica e professores_unidades(unidade_id, emusys_id). Coluna mantida so por compatibilidade; esta vazia.';

comment on column public.aulas_emusys.emusys_professor_id is
  'prof_id CRU do payload (professores[0].id). Guardar SEMPRE, mesmo quando nao resolver. Resolver o professor_id local por professores_unidades(unidade_id, emusys_professor_id) — NUNCA por nome e NUNCA por professores.emusys_id (global, colide entre unidades).';

comment on column public.aulas_emusys.sem_acompanhamento is
  'TRUE somente quando o payload trouxer professores[0].id NUMERICAMENTE igual a 0 = Treino/Ensaio (aluno usa a sala sozinho). Regra do Mateus/Emusys, 14/07. IMPORTANTE (auditoria Codex): as ~9.085 aulas historicas sem professor NAO sao treino — em 27.811 aulas inspecionadas no Emusys nao houve NENHUM id=0 explicito. Nao classificar por ausencia; so por id=0 explicito.';

create view public.vw_aulas_sem_professor as
select
  case
    when ae.sem_acompanhamento then 'treino_sem_acompanhamento'
    when ae.professor_nome is not null then 'BUG_falha_de_vinculo'
    else 'indefinido_investigar'
  end as diagnostico,
  ae.id,
  ae.emusys_id,
  ae.data_aula,
  ae.professor_nome,
  ae.emusys_professor_id,
  ae.unidade_id,
  (select pu.professor_id from public.professores_unidades pu
    where pu.unidade_id = ae.unidade_id
      and pu.emusys_id = ae.emusys_professor_id) as professor_recuperavel,
  ae.curso_nome,
  ae.sala_nome,
  (ae.data_aula >= current_date) as e_futura
from public.aulas_emusys ae
where ae.professor_id is null and coalesce(ae.cancelada,false) = false;

alter view public.vw_aulas_sem_professor set (security_invoker = on);
revoke all on public.vw_aulas_sem_professor from public, anon;
grant select on public.vw_aulas_sem_professor to authenticated, service_role;
