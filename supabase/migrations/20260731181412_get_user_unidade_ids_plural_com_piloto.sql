-- Passo 2 da migracao do RBAC: permitir que uma pessoa tenha acesso a N unidades.
--
-- O legado guarda UMA unidade por usuario (`usuarios.unidade_id`), entao nao ha
-- como expressar "Fabi atende as 3 unidades sem ser admin". Esta funcao devolve
-- um CONJUNTO de unidades e substitui `get_user_unidade_id()` nas policies.
--
-- SEGURANCA POR CONSTRUCAO: quem nao esta na lista piloto recebe exatamente a
-- unica unidade do legado. Como `x IN (um valor)` e identico a `x = valor`, o
-- comportamento desses usuarios e matematicamente inalterado.
--
-- Somente quem estiver em `rbac_piloto_usuarios` resolve pelas unidades dos
-- vinculos em `usuario_perfis`. A lista comeca vazia; a inclusao e explicita.
create table if not exists public.rbac_piloto_usuarios (
  usuario_id integer primary key references public.usuarios(id) on delete cascade,
  incluido_em timestamptz not null default now(),
  motivo text
);

alter table public.rbac_piloto_usuarios enable row level security;

revoke all on table public.rbac_piloto_usuarios from public, anon, authenticated;

create or replace function public.get_user_unidade_ids()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- caminho piloto: unidades vindas dos vinculos RBAC
  select distinct up.unidade_id
  from public.usuarios u
  join public.rbac_piloto_usuarios pil on pil.usuario_id = u.id
  join public.usuario_perfis up on up.usuario_id = u.id and up.ativo
  where u.auth_user_id = (select auth.uid())
    and u.ativo = true
    and up.unidade_id is not null

  union

  -- caminho legado: a unica unidade de sempre, para quem nao e piloto
  select u.unidade_id
  from public.usuarios u
  where u.auth_user_id = (select auth.uid())
    and u.ativo = true
    and u.unidade_id is not null
    and not exists (
      select 1 from public.rbac_piloto_usuarios pil where pil.usuario_id = u.id
    );
$function$;

grant execute on function public.get_user_unidade_ids() to authenticated, service_role;

comment on function public.get_user_unidade_ids() is
  'Conjunto de unidades do usuario atual. Fora da lista piloto devolve exatamente usuarios.unidade_id (1 linha), preservando o comportamento de get_user_unidade_id().';
