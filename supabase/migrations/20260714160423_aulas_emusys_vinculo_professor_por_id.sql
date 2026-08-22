-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BUG (14/07): 504 aulas com professor_nome preenchido e professor_id NULL.
-- O sync casa professor por NOME (string), nao por ID. Consequencias reais:
--   Erick Osmy (420 aulas) — Emusys diz "Erick Osmy", cadastro diz "Erick Cosme da Silva"
--   Vinicius/Juliana/Fabricio — nome IDENTICO e mesmo assim nao casou
-- Quando esses professores receberem login, a agenda deles aparece VAZIA.
--
-- RAIZ: professores.emusys_id EXISTE mas esta VAZIA nos 59 registros. Nunca foi populada.
-- E aulas_emusys nao guarda o prof_id que vem no payload da API. Sem isso, so resta o nome.
--
-- REGRA DO MATEUS (Emusys, 14/07): "se o prof_id for zero, e sem acompanhamento"
--   = Treino/Ensaio (aluno reserva a sala pra treinar sozinho, sem professor).
--   Esses devem MESMO ficar com professor_id NULL — mas precisam ser DISTINGUIVEIS
--   do bug de vinculo acima, senao a gente conserta o que nao devia (ou nao conserta o que devia).
alter table public.aulas_emusys
  add column if not exists emusys_professor_id integer,
  add column if not exists sem_acompanhamento  boolean not null default false;

comment on column public.aulas_emusys.emusys_professor_id is
  'prof_id CRU do Emusys (professores[0].id do payload). E por AQUI que o vinculo deve ser feito — nunca por nome. Nome muda, apelido diverge, cadastro tem grafia diferente.';
comment on column public.aulas_emusys.sem_acompanhamento is
  'TRUE quando o Emusys manda prof_id=0 = Treino/Ensaio (aluno usa a sala sozinho, sem professor). Regra confirmada pelo Mateus/Emusys em 14/07. NAO e aula: fica fora de pendencia, aderencia e North Star — mas e DIFERENTE de professor_id NULL por falha de vinculo.';

create index if not exists idx_aulas_emusys_emusys_professor
  on public.aulas_emusys (emusys_professor_id) where emusys_professor_id is not null;

create index if not exists idx_aulas_emusys_orfas
  on public.aulas_emusys (professor_nome)
  where professor_id is null and professor_nome is not null and not sem_acompanhamento;

-- professores.emusys_id existe mas esta 100% vazia. Indice unico pro sync amarrar de vez.
create unique index if not exists uq_professores_emusys_id
  on public.professores (emusys_id) where emusys_id is not null;

-- Visao de diagnostico: separa TREINO (legitimo) de FALHA DE VINCULO (bug)
create or replace view public.vw_aulas_sem_professor as
select
  case
    when ae.sem_acompanhamento then 'treino_sem_acompanhamento'
    when ae.professor_nome is not null then 'BUG_falha_de_vinculo'
    else 'indefinido_investigar'
  end as diagnostico,
  ae.id, ae.emusys_id, ae.data_aula, ae.professor_nome, ae.emusys_professor_id,
  ae.curso_nome, ae.sala_nome, ae.unidade_id,
  (ae.data_aula >= current_date) as e_futura
from public.aulas_emusys ae
where ae.professor_id is null and coalesce(ae.cancelada,false) = false;

alter view public.vw_aulas_sem_professor set (security_invoker = on);
revoke all on public.vw_aulas_sem_professor from public, anon;
grant select on public.vw_aulas_sem_professor to authenticated, service_role;
