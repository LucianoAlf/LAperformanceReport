-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 5 · IDENTIDADE — vínculo professor ↔ usuário/auth
alter table public.professores add column if not exists usuario_id integer references public.usuarios(id);
create unique index if not exists ux_professores_usuario
  on public.professores(usuario_id) where usuario_id is not null;

create or replace function public.fn_professor_do_usuario()
returns integer language sql stable security definer set search_path = public as $$
  select p.id
  from public.professores p
  join public.usuarios u on u.id = p.usuario_id
  where u.auth_user_id = auth.uid()
  limit 1;
$$;
