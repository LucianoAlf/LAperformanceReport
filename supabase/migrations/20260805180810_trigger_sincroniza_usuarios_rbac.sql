-- Espelha usuarios.perfil (legado) em usuario_perfis (RBAC) na criacao/edicao de usuario.
-- Sem isso, todo usuario criado pela tela /app/admin/usuarios nasce sem vinculo RBAC e as
-- funcoes canonicas devolvem lista vazia em silencio (Carteira vazia, MRR R$ 0).
--
-- Trigger em usuarios (nao na tela) porque ha DOIS caminhos de escrita: a edge function
-- admin-create-user (criar) e um UPDATE direto na tabela (editar).

create or replace function public.fn_usuarios_sincroniza_rbac()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_perfil_id uuid;
  v_unidade_id uuid;
  v_vinculos_ativos int;
begin
  -- 'professor' fica de fora de proposito: o perfil RBAC Professor tem 6 permissoes e nunca
  -- foi confirmado que cobrem o uso real (caso Matheus Felipe, id 32).
  if new.perfil = 'admin' then
    select id into v_perfil_id from perfis where nome = 'Admin' and ativo;
    v_unidade_id := null;
  elsif new.perfil = 'unidade' and new.unidade_id is not null then
    select id into v_perfil_id from perfis where nome = 'Gerente' and ativo;
    v_unidade_id := new.unidade_id;
  else
    return new;
  end if;

  if v_perfil_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select count(*) into v_vinculos_ativos
    from usuario_perfis where usuario_id = new.id and ativo;

    -- 2+ vinculos = multi-unidade configurado a mao (Fabi, Jessica, piloto). O legado tem
    -- uma unidade so e nao sabe representar isso: sincronizar aqui destruiria a configuracao.
    if v_vinculos_ativos > 1 then
      return new;
    end if;

    update usuario_perfis set ativo = false, updated_at = now()
    where usuario_id = new.id and ativo
      and (perfil_id is distinct from v_perfil_id
           or unidade_id is distinct from v_unidade_id);
  end if;

  insert into usuario_perfis (usuario_id, perfil_id, unidade_id, ativo)
  values (new.id, v_perfil_id, v_unidade_id, true)
  on conflict do nothing;

  -- vinculo pode ja existir desativado por uma troca anterior
  update usuario_perfis set ativo = true, updated_at = now()
  where usuario_id = new.id and perfil_id = v_perfil_id
    and unidade_id is not distinct from v_unidade_id and not ativo;

  return new;
end;
$$;

-- ALTER DEFAULT PRIVILEGES do schema public concede EXECUTE a anon em funcao nova.
revoke all on function public.fn_usuarios_sincroniza_rbac() from public, anon;

drop trigger if exists trg_usuarios_sincroniza_rbac on public.usuarios;
create trigger trg_usuarios_sincroniza_rbac
after insert or update of perfil, unidade_id on public.usuarios
for each row execute function public.fn_usuarios_sincroniza_rbac();
