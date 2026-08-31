-- Absenteismo por aluno: nao pagar o custo do lado canonico quando ninguem esta nele.
--
-- INCIDENTE (31/08/2026): a tela Sucesso do Aluno ficou VAZIA em producao --
-- `vw_aluno_sucesso_lista` devolvendo HTTP 500 com `57014 statement timeout`.
--
-- Cadeia: vw_aluno_sucesso_lista -> vw_absenteismo_aluno -> esta funcao.
--
-- A funcao era SQL com `union all` dos dois caminhos do rollout. O planner avalia
-- OS DOIS lados, e o filtro `fn_presenca_rollout_modo_interno_v1(a.unidade_id,'kpis')
-- = 'canonico_v2'` depende de `a.unidade_id`, que so existe depois do join com
-- `alunos` -- entao `vw_absenteismo_aluno_canonica_v2` era computada INTEIRA para
-- produzir ZERO linhas. Medido: >20s contra o `statement_timeout=8s` do papel
-- `authenticated`. O lado legado responde instantaneamente (1.577 linhas).
--
-- ⚠️ As 21 linhas de `presenca_rollout_config` (3 unidades x 7 superficies) estao em
-- `modo='sombra'` desde 27/08, motivo `publicacao_tecnica_inicial_sem_cutover`.
-- Ou seja: o mecanismo criado para tornar a migracao SEGURA era o que derrubava a
-- tela, cobrando o preco integral de um calculo cujo resultado e descartado. Nada
-- "parecia" ligado, e foi por isso que passou quatro dias despercebido.
--
-- CORRECAO: virar PL/pgSQL e desviar ANTES de tocar a view pesada. Sem nenhuma
-- unidade em `canonico_v2`, retorna direto o legado.
--
-- ⚠️ NAO altera a semantica do rollout: quando a primeira unidade for virada para
-- `canonico_v2`, o desvio deixa de valer sozinho e o comportamento original (union
-- all das duas pontas, cada unidade no seu modo) volta identico.
--
-- ⚠️ NAO corrige a causa de fundo: `vw_absenteismo_aluno_canonica_v2` precisa caber
-- em 8s ANTES de qualquer cutover, senao virar o rollout reproduz este travamento --
-- so que de proposito e sem aviso. Frente separada.
--
-- ⚠️ Continua SECURITY DEFINER: `vw_absenteismo_aluno_legado_v1` nega SELECT ao papel
-- `authenticated` (conferido: `42501 permission denied`), entao o acesso so existe
-- pelos direitos do dono. As checagens de autorizacao abaixo sao copia literal da
-- versao anterior -- e o que impede a funcao de virar porta aberta.

create or replace function public.fn_absenteismo_aluno_rollout_v1()
returns setof public.vw_absenteismo_aluno_canonica_v2
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_tem_canonico boolean;
begin
  select exists (
    select 1
    from public.presenca_rollout_config c
    where c.superficie = 'kpis'
      and c.modo = 'canonico_v2'
  ) into v_tem_canonico;

  if not v_tem_canonico then
    -- Caminho rapido. O `if` e o que impede o planner de montar o lado canonico:
    -- num `union all` unico ele seria executado e so entao descartado.
    return query
      select
        l.aluno_id,
        l.total_aulas,
        l.faltas,
        l.taxa_historica,
        l.taxa_recente_30d,
        l.tendencia,
        l.ultima_presenca,
        l.dias_sem_presenca,
        l.confiavel,
        case when l.total_aulas is not null and l.faltas is not null
          then l.total_aulas - l.faltas else null end::bigint,
        l.faltas::bigint,
        0::bigint,
        null::bigint,
        null::bigint,
        null::bigint,
        null::bigint,
        'legado'::text,
        'publicavel'::text,
        null::timestamptz,
        'presenca-legado-v1'::text
      from public.vw_absenteismo_aluno_legado_v1 l
      join public.alunos a on a.id = l.aluno_id
      where (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
        )
      );
    return;
  end if;

  -- Ha ao menos uma unidade virada: comportamento original, cada unidade no seu modo.
  return query
    select c.*
    from public.vw_absenteismo_aluno_canonica_v2 c
    join public.alunos a on a.id = c.aluno_id
    where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') = 'canonico_v2'
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
        )
      )
    union all
    select
      l.aluno_id,
      l.total_aulas,
      l.faltas,
      l.taxa_historica,
      l.taxa_recente_30d,
      l.tendencia,
      l.ultima_presenca,
      l.dias_sem_presenca,
      l.confiavel,
      case when l.total_aulas is not null and l.faltas is not null
        then l.total_aulas - l.faltas else null end::bigint,
      l.faltas::bigint,
      0::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      'legado'::text,
      'publicavel'::text,
      null::timestamptz,
      'presenca-legado-v1'::text
    from public.vw_absenteismo_aluno_legado_v1 l
    join public.alunos a on a.id = l.aluno_id
    where public.fn_presenca_rollout_modo_interno_v1(a.unidade_id, 'kpis') <> 'canonico_v2'
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and ((select public.is_admin()) or a.unidade_id in (select public.get_user_unidade_ids()))
        )
      );
end;
$function$;

-- `ALTER DEFAULT PRIVILEGES` neste schema concede EXECUTE a `anon` em funcao nova, e
-- recriar conta como nova. Revogar nominalmente (regra do CLAUDE.md).
revoke execute on function public.fn_absenteismo_aluno_rollout_v1() from public, anon;
grant execute on function public.fn_absenteismo_aluno_rollout_v1() to authenticated, service_role;
