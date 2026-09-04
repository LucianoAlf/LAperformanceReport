-- ============================================================================
-- 2026-09-03 — Gate do fechamento de ciclo: retrato de roster = só evidência
-- ============================================================================
-- O que mudou e por quê (auditoria 03/09/2026, autorizado pelo Alf):
-- O fechamento oficial do ciclo (fechar_health_score_professor_v3_ciclo)
-- recusa quando há snapshots "excedentes" — professor fora do roster ativo
-- com retrato no ciclo. Faz todo sentido para retratos COM evidência
-- ('parcial'/'oficial'): um score sem roster ativo é suspeito.
--
-- Mas o trigger fn_health_score_v3_bloquear_sem_disponibilidade FORÇA
-- estado_publicacao='sem_base' em qualquer UPDATE em snapshot cuja métrica
-- numero_alunos está 'sem_base_disponibilidade'. Ou seja: snapshots de
-- professores que saíram/mesclaram e nunca tiveram base operacional são
-- matematicamente inelimináveis do conjunto 'sem_base' por escrita — eles só
-- podem sair do filtro pelo gate. Sem este ajuste, NENHUM ciclo com
-- ex-desligado consegue fechar: é um deadlock estrutural, não uma escolha.
--
-- Propriedade de segurança preservada: 'sem_base' não carrega score, não
-- compete em ranking, não contamina média — é inócuo por construção. Quem tem
-- evidência ('parcial'/'oficial') continua travando o fechamento.
--
-- Nada mais na função muda (mesmos locks, mesmos checks, mesma escrita).
-- ============================================================================

-- O corpo completo é recriado a seguir com UMA única alteração no bloco de
-- roster: o conjunto `roster_retratado` passa a considerar apenas
-- estado_publicacao in ('parcial','oficial') — 'sem_base' sai do gate.
-- (Tudo o mais é byte a byte igual à versão vigente em 03/09/2026.)

-- SEGUNDA CORREÇÃO (mesma auditoria): o trigger de métricas bloqueava INSERT
-- quando o snapshot já nasce 'fechado' — exatamente o que a cerimônia de
-- fechamento de ciclo faz (insere a revisão oficial já fechada e copia as
-- métricas). Ou seja: a cerimônia era impossível de executar até o fim (nunca
-- tinha sido rodada — prova: 0 snapshots 'oficial' na base). Correção
-- principled: a multi-mutation controlada (mesma chave que o trigger de
-- snapshots já lê) passa a autorizar o INSERT governado. Append-only continua:
-- UPDATE/DELETE seguem proibidos sempre.
create or replace function public.fn_health_score_professor_v3_bloquear_metrica_fechada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_snapshot_id uuid;
  v_estado text;
  v_controlado boolean := coalesce(
    current_setting('app.health_score_v3_mutacao_controlada', true),
    'off'
  ) = 'on';
begin
  v_snapshot_id := case
    when tg_op = 'DELETE' then old.snapshot_id
    else new.snapshot_id
  end;

  select s.estado
    into v_estado
  from public.health_score_professor_v3_snapshots s
  where s.id = v_snapshot_id;

  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: metricas sao append-only';
  end if;

  -- 2026-09-03: cerimônia controlada (chave de sessão) pode anexar métricas —
  -- é o que o fechamento oficial de ciclo faz ao replicar a revisão oficial.
  -- Sem isso, a cerimônia morria no insert de métricas (nunca tinha rodado).
  if v_controlado then
    return new;
  end if;

  if v_estado not in ('provisorio', 'em_maturacao') then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: novas metricas exigem snapshot aberto';
  end if;

  return new;
end;
$function$;

create or replace function public.fechar_health_score_professor_v3_ciclo(p_ciclo_codigo text, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_usuario_id integer;
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_lock record;
  v_origem record;
  v_novo_id uuid;
  v_revisao integer;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_roster_diagnostico jsonb;
begin
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: justificativa obrigatoria';
  end if;

  select * into v_ciclo
  from public.health_score_professor_v3_ciclos c
  where c.codigo = p_ciclo_codigo
  for update;
  if not found then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: ciclo inexistente';
  end if;
  if current_date < v_ciclo.data_fim then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ainda aberto';
  end if;
  if v_ciclo.publicacao_oficial then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ja oficial';
  end if;

  -- A ordem global e unica para todas as sessoes: competencia, familia e
  -- unidade. Assim o fechamento coordena tanto o materializador periodico
  -- quanto o materializador legado de escopo explicito sem ciclo de espera.
  for v_lock in
    with competencias as (
      select gs::date as competencia
      from generate_series(
        date_trunc('month', v_ciclo.data_inicio)::timestamp,
        date_trunc('month', v_ciclo.data_fim)::timestamp,
        interval '1 month'
      ) gs
    ), unidades_ativas as (
      select u.id as unidade_id
      from public.unidades u
      where u.ativo = true
    ), chaves as (
      select
        c.competencia,
        0 as ordem_familia,
        null::uuid as unidade_id,
        'health_score_v3_periodo:' || c.competencia::text || ':ciclo' as chave
      from competencias c

      union all

      select
        c.competencia,
        1 as ordem_familia,
        null::uuid as unidade_id,
        'health_score_professor_v3:' || c.competencia::text || ':consolidado:rede' as chave
      from competencias c

      union all

      select
        c.competencia,
        2 as ordem_familia,
        u.unidade_id,
        'health_score_professor_v3:' || c.competencia::text || ':unidade:' || u.unidade_id::text as chave
      from competencias c
      cross join unidades_ativas u
    )
    select competencia, ordem_familia, unidade_id, chave
    from chaves
    order by competencia, ordem_familia, unidade_id nulls first
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock.chave, 0));
  end loop;

  -- Sob os mesmos advisory locks da materializacao, o fechamento e recusado
  -- antes de criar qualquer revisao se um escopo nao retratar o roster ativo.
  -- 2026-09-03: o gate considera somente retratos COM evidência ('parcial',
  -- 'oficial'). 'sem_base' é inócuo por construção (sem score/ranking) e era
  -- ineliminável pela trava de disponibilidade — deadlock do primeiro ciclo.
  with roster_unidade as (
    select distinct pu.unidade_id, p.id as professor_id
    from public.professores_unidades pu
    join public.unidades u on u.id = pu.unidade_id and u.ativo = true
    join public.professores p on p.id = pu.professor_id and p.ativo = true
    where pu.emusys_ativo = true
      and pu.validacao_status is distinct from 'ignorado'
      and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
  ), roster_esperado as (
    select r.unidade_id, r.professor_id
    from roster_unidade r
    union
    select null::uuid, r.professor_id
    from roster_unidade r
  ), roster_retratado as (
    select distinct s.unidade_id, s.professor_id
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo'
      and s.ciclo_codigo = p_ciclo_codigo
      and s.estado_publicacao in ('parcial', 'oficial')
  ), retratado_amplo as (
    -- 'sem_base' conta como retratado para AUSÊNCIA: o professor está no roster
    -- ativo e o sistema respondeu 'sem base operacional' (sem evidência).
    select distinct s.unidade_id, s.professor_id
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo'
      and s.ciclo_codigo = p_ciclo_codigo
      and s.estado_publicacao in ('parcial', 'sem_base', 'oficial')
  ), ausentes as (
    select * from roster_esperado
    except
    select * from retratado_amplo
  ), excedentes as (
    select * from roster_retratado
    except
    select * from roster_esperado
  )
  select jsonb_build_object(
    'professores_ausentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unidade_id', a.unidade_id,
        'professor_id', a.professor_id
      ) order by a.unidade_id nulls first, a.professor_id)
      from ausentes a
    ), '[]'::jsonb),
    'professores_excedentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unidade_id', e.unidade_id,
        'professor_id', e.professor_id
      ) order by e.unidade_id nulls first, e.professor_id)
      from excedentes e
    ), '[]'::jsonb)
  ) into v_roster_diagnostico;

  if jsonb_array_length(v_roster_diagnostico->'professores_ausentes') > 0
    or jsonb_array_length(v_roster_diagnostico->'professores_excedentes') > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: roster incompleto',
      detail = v_roster_diagnostico::text;
  end if;

  for v_origem in
    with candidatos as (
      select s.*,
        row_number() over (
          partition by s.professor_id, s.unidade_id
          order by s.competencia desc, s.revisao desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.periodicidade = 'ciclo'
        and s.ciclo_codigo = p_ciclo_codigo
        and s.estado_publicacao = 'parcial'
        and s.score_exibivel
        and s.score is not null
    )
    select c.* from candidatos c
    where c.rn = 1
      and not exists (
        select 1
        from public.health_score_professor_v3_snapshot_metricas m
        where m.snapshot_id = c.id
          and m.nota is not null
          and coalesce((m.detalhes->>'apta_oficial')::boolean, false) is not true
      )
  loop
    select coalesce(max(s.revisao), 0) + 1 into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_origem.professor_id
      and s.unidade_id is not distinct from v_origem.unidade_id
      and s.competencia = v_origem.competencia
      and s.periodicidade = 'ciclo';

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_origem.professor_id, v_origem.escopo, v_origem.unidade_id,
      v_origem.competencia, v_origem.trimestre_inicio, v_revisao, 'fechado',
      v_origem.config_id, v_origem.config_versao, v_origem.score,
      v_origem.cobertura, v_origem.classificacao, true, true, null,
      'health-score-professor-v3-fechamento-ciclo-1', v_origem.id,
      btrim(p_justificativa), v_usuario_id, now(), 'ciclo',
      v_origem.periodo_inicio, v_origem.periodo_fim, v_origem.ciclo_codigo,
      'oficial', true, true
    ) returning id into v_novo_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel,
      contribuicao, meta_aplicada, peso_efetivo, codigo_evidencia, papel
    )
    select v_novo_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object('fechado_oficialmente_em', now()),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada,
      m.peso_efetivo, m.codigo_evidencia, m.papel
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_origem.id;

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_novo_id);
  end loop;

  if v_count = 0 then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: nenhum snapshot apto ao oficial';
  end if;

  update public.health_score_professor_v3_ciclos
  set estado = 'fechado', publicacao_oficial = true,
      ranking_habilitado = true, fechado_em = now(),
      fechado_por = v_usuario_id, justificativa_fechamento = btrim(p_justificativa)
  where id = v_ciclo.id;

  return jsonb_build_object(
    'ciclo_codigo', p_ciclo_codigo,
    'estado_publicacao', 'oficial',
    'ranking_habilitado', true,
    'snapshots_fechados', v_count,
    'snapshot_ids', v_ids
  );
end;
$function$;