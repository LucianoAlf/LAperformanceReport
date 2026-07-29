-- Health Score V3: separar o guard de LEITURA do guard de GERENCIAMENTO.
--
-- PROBLEMA: as RPCs de leitura (get_health_score_professor_v3_performance e
-- ..._snapshot_modal) abriam com `perform fn_health_score_professor_v3_ator_gerenciador()`,
-- que exige a permissao 'professores.editar'. Resultado: TODO usuario nao-admin recebia
--   HEALTH_SCORE_V3_ACESSO_NEGADO: configuracao exige permissao global
-- na aba Carteira (Professores), no Dashboard e na Gestao Mensal -- 17 contas de perfil
-- 'unidade', entre elas os gerentes das 3 unidades.
--
-- POR QUE SO ADMIN PASSAVA: fn_usuario_atual_tem_permissao consulta o sistema granular
-- (usuario_perfis + perfil_permissoes), e a tabela usuario_perfis esta VAZIA (0 linhas
-- para 29 usuarios ativos). Na pratica so passa quem cai no atalho legado de
-- usuario_tem_permissao: `if perfil = 'admin' then return true`. A permissao
-- 'professores.carteira', que existe e seria a correta, nunca foi atribuida a ninguem.
--
-- DECISAO (Hugo, 29/07/2026): usuario de perfil 'unidade' ve a carteira da PROPRIA
-- unidade, nunca consolidado. O perfil 'professor' segue negado por ora -- dar acesso a
-- ele exigiria filtrar pela propria carteira, senao veria o score dos colegas.
--
-- ESCOPO: cria um guard de leitura e troca UMA linha em 4 sobrecargas de 2 RPCs de
-- leitura. O fn_health_score_professor_v3_ator_gerenciador NAO e alterado -- ele segue
-- protegendo as 11 funcoes de escrita (ativar_/criar_/salvar_/simular_/fechar_ciclo),
-- que devem mesmo continuar restritas.
--
-- A troca e feita por pg_get_functiondef + replace + execute, e nao reescrevendo os
-- corpos a mao: essas funcoes sao grandes e foram redefinidas em 28/07 pela migration
-- 20260728225000. Transcrever manualmente arriscaria reverter aquele trabalho.

-- ── 1. Guard de leitura ───────────────────────────────────────────────────────────
create or replace function public.fn_health_score_professor_v3_ator_leitura(
  p_unidade_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
begin
  -- Materializacao interna e cron rodam fora de sessao de usuario.
  if coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' then
    return null;
  end if;

  select u.id, u.perfil, u.unidade_id
    into v_usuario_id, v_perfil, v_unidade_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: usuario sem cadastro ativo'
      using errcode = '42501';
  end if;

  -- Admin le tudo, inclusive consolidado (p_unidade_id null).
  if v_perfil = 'admin' then
    return v_usuario_id;
  end if;

  -- Perfil de unidade le SO a propria unidade. Consolidado (null) e negado de proposito:
  -- o seletor do frontend ja trava esses usuarios na unidade deles
  -- (AuthContext.canViewConsolidated = isAdmin), entao null aqui indica chamada indevida.
  if v_perfil = 'unidade' then
    if p_unidade_id is null
       or v_unidade_usuario is null
       or p_unidade_id <> v_unidade_usuario then
      raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: unidade fora do escopo do usuario'
        using errcode = '42501';
    end if;
    return v_usuario_id;
  end if;

  raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: perfil sem acesso ao health score'
    using errcode = '42501';
end;
$$;

comment on function public.fn_health_score_professor_v3_ator_leitura(uuid) is
  'Guard de LEITURA do Health Score V3. Admin le tudo; perfil unidade le so a propria unidade; demais perfis negados. Nao confundir com fn_health_score_professor_v3_ator_gerenciador, que guarda ESCRITA (configuracao/snapshot) e exige professores.editar.';

-- ── 2. Trocar o guard nas 4 sobrecargas de leitura ────────────────────────────────
do $migracao$
declare
  r record;
  v_def text;
  v_novo text;
  v_trocadas integer := 0;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_health_score_professor_v3_performance',
        'get_health_score_professor_v3_snapshot_modal'
      )
      and p.prosrc like '%fn_health_score_professor_v3_ator_gerenciador%'
  loop
    v_def := pg_get_functiondef(r.oid);

    v_novo := replace(
      v_def,
      'perform public.fn_health_score_professor_v3_ator_gerenciador();',
      'perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);'
    );

    if v_novo = v_def then
      raise exception 'Guard nao encontrado em %; abortando sem alterar nada', r.oid::regprocedure;
    end if;

    execute v_novo;
    v_trocadas := v_trocadas + 1;
  end loop;

  if v_trocadas <> 4 then
    raise exception 'Esperava trocar 4 sobrecargas, troquei %. Abortando.', v_trocadas;
  end if;

  raise notice 'Guard de leitura aplicado em % sobrecargas.', v_trocadas;
end;
$migracao$;
