-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- S0 da Sol: quem é quem e o que pode. (colaboradores.id é integer, não uuid.)
create or replace function public.sol_tel_chave(p_tel text)
returns text language sql immutable as $function$
  with d as (select regexp_replace(coalesce(p_tel,''), '\D', '', 'g') n),
  s as (select case when length(n) >= 12 and left(n,2) = '55' then substr(n,3) else n end n from d)
  select case when length(n) >= 10 then left(n,2) || right(n,8) else nullif(n,'') end from s;
$function$;

create table if not exists public.sol_permissoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer references public.colaboradores(id) on delete cascade,
  telefone text,
  nome_exibicao text,
  unidade_id uuid references public.unidades(id),
  papel text not null default 'adm_unidade',
  escopo text not null default 'unidade',
  pode_autorizar boolean not null default true,
  pode_consultar boolean not null default true,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  constraint sol_permissoes_alvo check (colaborador_id is not null or telefone is not null),
  constraint sol_permissoes_escopo check (escopo in ('unidade','todas')),
  constraint sol_permissoes_papel check (papel in ('adm_unidade','gerente','diretoria','professor','outro'))
);
create unique index if not exists sol_permissoes_colab_uk on public.sol_permissoes(colaborador_id) where colaborador_id is not null;
create unique index if not exists sol_permissoes_tel_uk on public.sol_permissoes(public.sol_tel_chave(telefone)) where telefone is not null;
alter table public.sol_permissoes enable row level security;
revoke all on table public.sol_permissoes from public, anon, authenticated;
grant select, insert, update, delete on table public.sol_permissoes to service_role;

create or replace function public.sol_caixa_quem_e(p_telefone text, p_unidade_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare
  v_chave text := public.sol_tel_chave(p_telefone);
  v_c record; v_p record;
  v_uni uuid; v_uni_nome text; v_nome text;
begin
  if v_chave is null then
    return jsonb_build_object('ok', true, 'identificado', false, 'motivo', 'sem_telefone');
  end if;

  select c.id, c.nome, c.apelido, c.unidade_id, c.departamento, c.cargo, c.ativo
    into v_c
  from public.colaboradores c
  where c.whatsapp is not null and public.sol_tel_chave(c.whatsapp) = v_chave
  order by c.ativo desc limit 1;

  select p.* into v_p from public.sol_permissoes p
   where p.ativo and (p.colaborador_id = v_c.id or public.sol_tel_chave(p.telefone) = v_chave)
   order by (p.colaborador_id is not null) desc limit 1;

  if v_c.id is null and v_p.id is null then
    return jsonb_build_object('ok', true, 'identificado', false, 'motivo', 'nao_cadastrado');
  end if;

  v_nome := coalesce(nullif(btrim(coalesce(v_p.nome_exibicao,'')),''),
                     nullif(btrim(coalesce(v_c.apelido,'')),''),
                     nullif(btrim(coalesce(v_c.nome,'')),''));
  v_uni := coalesce(v_p.unidade_id, v_c.unidade_id);
  select nome into v_uni_nome from public.unidades where id = v_uni;

  return jsonb_build_object(
    'ok', true, 'identificado', true,
    'nome', v_nome, 'nome_completo', v_c.nome, 'colaborador_id', v_c.id,
    'unidade_id', v_uni, 'unidade_nome', v_uni_nome, 'departamento', v_c.departamento,
    'ativo', coalesce(v_c.ativo, true),
    'papel', coalesce(v_p.papel, 'adm_unidade'),
    'escopo', coalesce(v_p.escopo, 'unidade'),
    'pode_autorizar', coalesce(v_p.pode_autorizar, true),
    'pode_consultar', coalesce(v_p.pode_consultar, true),
    'no_escopo', case when p_unidade_id is null then true
                      when coalesce(v_p.escopo,'unidade') = 'todas' then true
                      else (v_uni = p_unidade_id) end);
end $function$;
revoke all on function public.sol_caixa_quem_e(text, uuid) from public, anon, authenticated;
grant execute on function public.sol_caixa_quem_e(text, uuid) to service_role;
