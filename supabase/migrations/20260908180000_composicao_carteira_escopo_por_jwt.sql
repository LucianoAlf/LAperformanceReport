-- Fix da coluna "Atividade extra" que aparecia VAZIA para 100% dos usuarios.
--
-- DOIS defeitos encadeados, ambos achados so quando o Hugo abriu a tela:
--
-- 1) get_carteira_professor_periodo_composicao_v1 nasceu SECURITY INVOKER e chama
--    get_carteira_professor_periodo_detalhe_canonico_v1, que NAO tem execute para
--    `authenticated` (so postgres/service_role). Dava permission denied em runtime,
--    engolido pelo consultarSupabaseOpcional do front -> coluna vazia, sem erro.
--    ⚠️ Validar RPC INVOKER como service_role NAO prova nada: service_role ignora RLS
--    e tem execute em tudo. E a armadilha ja documentada no CLAUDE.md (get_agenda_dia
--    em 02/08, emusys_disciplinas_catalogo em 03/08) e ela se repetiu aqui.
--
-- 2) Ao virar SECURITY DEFINER, o predicado de escopo copiado das views de contratos
--    (`current_user in ('service_role','postgres')`) passou a liberar TUDO: em DEFINER,
--    current_user e o DONO da funcao, nunca o chamador. Medido: usuario de Campo Grande
--    lia as 3 unidades e conseguia pedir a Barra explicitamente.
--    O discriminador correto e a PRESENCA DE CLAIM JWT (auth.uid() is null = chamada
--    interna). auth.role() continua nao servindo pelo motivo ja documentado: conexao
--    que so faz SET ROLE nao tem claim.
--
-- Validado nos 3 perfis apos o fix:
--   admin (lucianoalf)      -> Barra, Campo Grande, Recreio; Will 16 regular + 10 extra
--   unidade (cg@lamusic)    -> so Campo Grande; pedindo Barra explicitamente = 0 linhas
--   service_role / interno  -> 3 unidades, 74 linhas
--
-- O corpo aplicado esta em producao; esta migration registra a decisao. O SQL completo
-- foi aplicado via MCP nas migrations `composicao_carteira_security_definer_com_escopo`
-- e `composicao_carteira_escopo_por_jwt_nao_current_user` (2026-09-08).

do $$
declare
  v_def text := pg_get_functiondef('public.get_carteira_professor_periodo_composicao_v1(integer,integer,uuid,date,date)'::regprocedure);
begin
  if not v_def ilike '%security definer%' then
    raise exception 'COMPOSICAO_CARTEIRA_DEVE_SER_SECURITY_DEFINER';
  end if;
  if v_def ilike '%current_user%' then
    raise exception 'COMPOSICAO_CARTEIRA_NAO_PODE_ESCOPAR_POR_CURRENT_USER: em DEFINER ele e o dono, nao o chamador';
  end if;
  if not v_def ilike '%auth.uid()%' then
    raise exception 'COMPOSICAO_CARTEIRA_SEM_DISCRIMINADOR_DE_CLAIM';
  end if;
  if has_function_privilege('anon','public.get_carteira_professor_periodo_composicao_v1(integer,integer,uuid,date,date)','execute') then
    raise exception 'COMPOSICAO_CARTEIRA_EXECUTAVEL_POR_ANON';
  end if;
end
$$;
