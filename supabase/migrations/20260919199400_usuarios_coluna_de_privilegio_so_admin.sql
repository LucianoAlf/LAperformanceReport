-- 19/09/2026 (revisão independente): ESCALADA DE PRIVILÉGIO em `usuarios`.
-- A policy `usuarios_update_policy` é `USING (is_admin() OR auth_user_id =
-- auth.uid())`, **sem `with check`** e sem restrição de coluna — e `is_admin()`
-- lê `usuarios.perfil`. Ou seja: qualquer usuário logado podia dar PATCH na
-- própria linha e virar `perfil = 'admin'` — e, sendo admin, alcançar tudo.
-- Hoje só o porteiro de requisição segurava (a rota `/usuarios` não está na
-- lista do professor); isso é uma camada só, e a equipe (admin/unidade) não
-- passa pelo porteiro.
--
-- Conserto na TABELA, que vale para qualquer caminho (PostgREST, RPC INVOKER,
-- app novo):
--   · gatilho BEFORE UPDATE: quem chega pelo login do app e NÃO é admin não
--     muda coluna de privilégio (perfil, ativo, auth_user_id, unidade_id,
--     email, senha_hash, id) — 42501;
--   · `with check` na policy, para a linha não poder ser jogada para outro dono.
-- O que a equipe faz continua igual: ModalEditarPerfil e OnboardingChecklist só
-- mexem em nome/apelido/telefone/avatar_url (do próprio usuário), e
-- GerenciarUsuarios (perfil/unidade_id/ativo) roda com admin.
-- Rotina, cron e agentes (service_role/postgres) não são alvo do gatilho.
--
-- Tabela do LA Report: o espelho está no prompt entregue ao agente de lá.

create or replace function public.fn_usuarios_trava_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- quem não chega pelo login do app (service_role, cron, dono, agentes) não é o alvo
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.perfil       is distinct from old.perfil
     or new.ativo        is distinct from old.ativo
     or new.auth_user_id is distinct from old.auth_user_id
     or new.unidade_id   is distinct from old.unidade_id
     or new.email        is distinct from old.email
     or new.senha_hash   is distinct from old.senha_hash
     or new.id           is distinct from old.id then
    raise exception 'ACESSO_NEGADO_COLUNA_DE_PRIVILEGIO'
      using errcode = '42501',
            detail  = 'perfil, ativo, auth_user_id, unidade_id, email, senha_hash e id só mudam por admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_trava_privilegio on public.usuarios;
create trigger trg_usuarios_trava_privilegio
before update on public.usuarios
for each row execute function public.fn_usuarios_trava_privilegio();

-- A linha não pode ser empurrada para outro dono nem por quem passou no USING.
alter policy usuarios_update_policy on public.usuarios
  using (is_admin() or auth_user_id = auth.uid())
  with check (is_admin() or auth_user_id = auth.uid());

-- NÃO mexo nos GRANTs de `anon` aqui de propósito: `anon` tem privilégio de
-- tabela em `usuarios`, mas as policies não deixam ele ver nem gravar nada
-- (o SELECT é só para `authenticated`; o UPDATE exige auth.uid()). E o
-- pg_stat_statements mostra 6 SELECTs de `anon` por `auth_user_id` que eu não
-- consegui atribuir a um chamador no código — tirar o grant trocaria "lista
-- vazia" por 403 num caminho que não identifiquei. Fica registrado no
-- relatório e no prompt do LA Report (tabela deles) como recomendação.
