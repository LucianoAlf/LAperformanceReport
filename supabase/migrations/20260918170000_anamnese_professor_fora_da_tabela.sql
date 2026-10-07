-- 20260918170000 — o login do professor deixa de ler (e de alterar) a tabela de anamneses
--
-- Achado da revisão final da rodada 2 de Novidades (18/09/2026). A policy
-- `anamneses_por_unidade` dizia "quem tem `usuarios.unidade_id` vê a unidade
-- inteira" — sem olhar o PERFIL. Professor com unidade preenchida (hoje só o
-- Matheus, usuarios.id 32) caía na mesma regra da secretaria. Medido num ensaio
-- com o token dele (BEGIN/ROLLBACK, antes desta migration):
--
--   anamneses                 249 linhas (122 com filiação preenchida)
--   anamnese_respostas_perfil 2.631 linhas (o teste de temperamento)
--   anamnese_convites         139 linhas (com o token do convite)
--   UPDATE numa anamnese      1 linha alterada
--
-- O app do professor nunca faz isso: lê o perfil por `app_aluno_ficha` →
-- `fn_anamnese_do_aluno` (SECURITY DEFINER, sem filiação, telefone, token nem
-- entrevistador). Mas quem segura é o banco, não o app — a chave pública e o
-- login estão no celular dele, e a API responde a quem pedir.
--
-- QUEM USA A TABELA DIRETO (grep nos 3 repos + pg_stat_statements desde 15/09):
--
--   LA Report, AlunosPage.tsx        SELECT unidade_id, pessoa_chave, diagnosticos   283x  authenticated (admin/unidade)
--   site da anamnese, FormWizard.tsx INSERT ... RETURNING id  (+ respostas_perfil)     32x  authenticated (admin/unidade)
--   notificar-anamnese (edge)        SELECT                                             50x  service_role
--   Fábio / Mila                     SELECT                                              —   fabio_agent (BYPASSRLS) / mila_acesso_restrito
--
--   Quem gravou anamnese nos últimos 90 dias: 356 'unidade', 136 'admin', 0 'professor'.
--   UPDATE/DELETE via API: nenhum no código dos 3 repos e nenhum no pg_stat_statements.
--   Toda leitura do perfil pelo professor passa por função SECURITY DEFINER
--   (dona postgres, BYPASSRLS) — não depende desta policy.
--
-- O QUE MUDA:
--   1. As policies de `anamneses` e `anamnese_convites` passam a exigir PERFIL de equipe: 'unidade'
--      para a unidade dele, 'admin' para todas. É o mesmo idioma que o LA Report
--      já usa (`perfil in ('admin','unidade')`). Lista de permissão: um perfil
--      que surgir no futuro NÃO herda acesso a dado de saúde de criança sem
--      alguém decidir.
--   2. `anon` perde tudo na tabela (a policy já barrava; o grant era sobra — e
--      TRUNCATE nem passa por RLS). O link do responsável e o formulário online
--      usam `get_anamnese_publica` / `salvar_anamnese_online`, SECURITY DEFINER,
--      que não dependem de grant na tabela.
--   3. `authenticated` fica só com SELECT e INSERT — os dois que alguém usa.
--      Sai UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES. Se um dia o LA Report
--      ganhar tela de editar anamnese, o conserto é um GRANT de uma linha.
--
-- O QUE NÃO MUDA: a regra da equipe (secretaria só a própria unidade, admin
-- todas), `service_role`, `fabio_agent`, `mila_acesso_restrito`, e o perfil do
-- aluno no app do professor.
--
-- A porta das FUNÇÕES (get_anamnese_aluno & cia., que qualquer login chamava
-- para qualquer aluno de qualquer unidade) é a 20260918170100.

alter policy anamneses_por_unidade on public.anamneses
  using (
    (unidade_id in (select u.unidade_id from public.usuarios u
                     where u.auth_user_id = auth.uid()
                       and u.perfil = 'unidade'))
    or exists (select 1 from public.usuarios u
                where u.auth_user_id = auth.uid()
                  and u.perfil = 'admin')
  );

-- `respostas_perfil_via_anamnese` (o teste de temperamento) NÃO precisa mudar:
-- ela lê `anamnese_id in (select a.id from anamneses a ...)`, e essa subconsulta
-- roda com a RLS de `anamneses` — que agora já tira o professor. Provado por
-- mutante: sem alterar esta policy, o professor lê 0 respostas. Alterá-la seria
-- uma linha que nenhum teste consegue distinguir.

alter policy anamnese_convites_por_unidade on public.anamnese_convites
  using (
    (unidade_id in (select u.unidade_id from public.usuarios u
                     where u.auth_user_id = auth.uid()
                       and u.perfil = 'unidade'))
    or exists (select 1 from public.usuarios u
                where u.auth_user_id = auth.uid()
                  and u.perfil = 'admin')
  );

revoke all on table public.anamneses from anon;
revoke update, delete, truncate, trigger, references on table public.anamneses from authenticated;

comment on policy anamneses_por_unidade on public.anamneses is
'Só a EQUIPE: perfil unidade vê/grava a própria unidade, admin todas. Professor fica de fora mesmo com usuarios.unidade_id preenchido — ele lê o perfil do aluno por app_aluno_ficha. Ver migration 20260918170000.';
