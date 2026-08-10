-- A validacao nos 3 perfis (obrigatoria neste projeto) pegou um vazamento de escopo na
-- migration irma:
--   admin ................. 26 linhas, BARRA+CG+REC   ok
--   unidade (CG) .......... 13 linhas, so CG          ok
--   professor ............. 10 linhas, REC            ⚠️ NAO DEVERIA VER NADA
--
-- Motivo: o professor testado nao tem vinculo RBAC, mas `get_user_unidade_ids()` cai no
-- legado `usuarios.unidade_id` e devolve a unidade dele. O escopo por unidade sozinho nao
-- separa "gestor da unidade" de "professor lotado na unidade".
--
-- A fila de divergencias e ferramenta de GESTAO: mostra nome, cadastro e situacao de
-- identidade de todos os professores da unidade. Professor nao deve ver a dos colegas.
--
-- Guarda adicionada: alem do escopo de unidade, exige perfil de gestao (admin ou unidade).
-- Deliberadamente conservador — na duvida, nega.
--
-- Depois da correcao: admin 26 / unidade CG 13 (so CG) / professor 0. E o professor
-- tentando decidir recebe 42501.
do $mig$
begin
  create or replace function public.fn_pode_operar_fila_divergencias_professor()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
  as $fn$
    select exists (
      select 1 from public.usuarios u
      where u.auth_user_id = (select auth.uid())
        and u.ativo
        and u.perfil in ('admin', 'unidade')
    );
  $fn$;

  comment on function public.fn_pode_operar_fila_divergencias_professor() is
    'Fila de divergencias de professor e ferramenta de gestao: so admin e perfil unidade. Escopo de unidade sozinho nao basta — get_user_unidade_ids() devolve a unidade do proprio professor pelo legado usuarios.unidade_id.';

  revoke all on function public.fn_pode_operar_fila_divergencias_professor() from public, anon;
  grant execute on function public.fn_pode_operar_fila_divergencias_professor() to authenticated, service_role;

  -- Leitura: soma a guarda de perfil ao escopo de unidade que ja existia.
  execute replace(
    (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_professores_divergencias_emusys'),
    E'      and (\n        (select public.is_admin())\n        or d.unidade_id in (select public.get_user_unidade_ids())\n      )',
    E'      and (select public.fn_pode_operar_fila_divergencias_professor())\n      and (\n        (select public.is_admin())\n        or d.unidade_id in (select public.get_user_unidade_ids())\n      )'
  );

  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='get_professores_divergencias_emusys')
     not like '%fn_pode_operar_fila_divergencias_professor%' then
    raise exception 'ABORTADO: a guarda nao entrou na funcao de leitura';
  end if;

  -- Decisao: mesma guarda, na checagem de escopo.
  execute replace(
    (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='decidir_professor_divergencia_emusys'),
    E'    if not (\n      (select public.is_admin())\n      or v_linha.unidade_id in (select public.get_user_unidade_ids())\n    ) then',
    E'    if not (select public.fn_pode_operar_fila_divergencias_professor()) then\n      raise exception ''DIVERGENCIA_PERFIL_SEM_PERMISSAO: fila e de gestao (admin ou unidade)''\n        using errcode = ''42501'';\n    end if;\n\n    if not (\n      (select public.is_admin())\n      or v_linha.unidade_id in (select public.get_user_unidade_ids())\n    ) then'
  );

  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='decidir_professor_divergencia_emusys')
     not like '%DIVERGENCIA_PERFIL_SEM_PERMISSAO%' then
    raise exception 'ABORTADO: a guarda nao entrou na funcao de decisao';
  end if;

  -- Recriar funcao reabre EXECUTE p/ anon neste projeto (ALTER DEFAULT PRIVILEGES).
  revoke all on function public.get_professores_divergencias_emusys(boolean, uuid) from public, anon;
  grant execute on function public.get_professores_divergencias_emusys(boolean, uuid) to authenticated, service_role;
  revoke all on function public.decidir_professor_divergencia_emusys(bigint, text, text) from public, anon;
  grant execute on function public.decidir_professor_divergencia_emusys(bigint, text, text) to authenticated, service_role;
end
$mig$;
