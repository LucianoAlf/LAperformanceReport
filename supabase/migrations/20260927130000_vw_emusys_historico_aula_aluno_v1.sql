-- Contrato de leitura v1 do historico Emusys para o LA Teacher (relatorio anual
-- do recital). Pedido registrado em
-- la-teacher/docs/prompt-la-report-historico-emusys-relatorio-anual-2026-09-27.md.
--
-- Decisoes:
-- * a ligacao com `alunos` e resolvida NA VIEW por
--   (unidade_id, emusys_aluno_id) = (alunos.unidade_id, alunos.emusys_student_id::bigint),
--   sem gravar `aluno_id` no staging: aluno novo ou recem-vinculado aparece sem
--   rotina extra, e o filtro por aluno desce direto para o indice
--   (unidade_id, emusys_aluno_id) do roster (<100 ms por aluno, medido 32 ms).
-- * o coletor e append-only e nunca apaga linha de roster antiga, entao uma
--   (aula, aluno) pode ter varias linhas quando o payload muda; a versao
--   visivel e a mais recente por (coletado_em, id). NOT EXISTS em vez de
--   DISTINCT ON porque DISTINCT ON bloqueia o pushdown do filtro de aluno.
-- * pessoa com mais de uma linha em `alunos` (segundo curso) aparece uma vez
--   por aluno_id: o historico da pessoa responde a qualquer matricula dela.
-- * fechada: so o dono e service_role leem (texto pedagogico de aluno).

create view public.vw_emusys_historico_aula_aluno_v1
with (security_invoker = false) as
select
  r.unidade_id,
  a.id as aluno_id,
  r.emusys_aula_id::integer as emusys_aula_id,
  au.data_hora_inicio,
  au.disciplina_nome,
  au.professor_nome,
  au.emusys_professor_id::integer as emusys_professor_id,
  au.turma_nome,
  au.categoria,
  au.cancelada,
  r.presenca_origem as presenca,
  coalesce(
    nullif(btrim(au.payload ->> 'anotacoes'), ''),
    (
      select nullif(btrim(item ->> 'anotacoes'), '')
        from jsonb_array_elements(au.payload -> 'itens_origem') as item
       where nullif(btrim(item ->> 'anotacoes'), '') is not null
       limit 1
    )
  ) as anotacoes
from public.emusys_aula_alunos_historico_staging_v1 r
join public.emusys_aulas_historico_staging_v1 au
  on au.id = r.aula_staging_id
join public.alunos a
  on a.unidade_id = r.unidade_id
 and a.emusys_student_id ~ '^[0-9]+$'
 and a.emusys_student_id::bigint = r.emusys_aluno_id
where r.emusys_aluno_id is not null
  and not exists (
    select 1
      from public.emusys_aula_alunos_historico_staging_v1 novo
     where novo.aula_staging_id = r.aula_staging_id
       and novo.emusys_aluno_id is not distinct from r.emusys_aluno_id
       and (novo.coletado_em, novo.id) > (r.coletado_em, r.id)
  );

comment on view public.vw_emusys_historico_aula_aluno_v1 is
  'CONTRATO v1 com o LA Teacher: uma linha por (emusys_aula_id, aluno_id) com a versao mais recente observada. Ligacao aluno resolvida na view; se o staging mudar, manter estas colunas ou publicar _v2.';
comment on column public.vw_emusys_historico_aula_aluno_v1.aluno_id is
  'alunos.id ligado por (unidade_id, emusys_student_id = emusys_aluno_id). Pessoa com segunda matricula aparece uma vez por aluno_id; linha sem aluno local fica de fora.';
comment on column public.vw_emusys_historico_aula_aluno_v1.presenca is
  'presenca_origem do Emusys na linha de roster mais recente (presente|ausente).';
comment on column public.vw_emusys_historico_aula_aluno_v1.anotacoes is
  'payload->>anotacoes da aula, com fallback ao primeiro item de itens_origem; null quando vazio.';

-- Fechada: sem acesso para anon/authenticated/public nem para outros roles do
-- projeto (mesmo padrao de 20260716155615_health_score_v3_staging_isolamento_roles).
revoke all on public.vw_emusys_historico_aula_aluno_v1 from public, anon, authenticated;

do $$
declare
  v_role text;
begin
  for v_role in
    select rolname
      from pg_roles
     where rolname not in ('postgres', 'service_role', 'supabase_admin')
       and rolname not like 'pg_%'
  loop
    execute format(
      'revoke all privileges on table public.vw_emusys_historico_aula_aluno_v1 from %I',
      v_role
    );
  end loop;
end;
$$;

grant select on public.vw_emusys_historico_aula_aluno_v1 to service_role;
