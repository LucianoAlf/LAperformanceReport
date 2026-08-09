-- CP1 — Estabiliza a materializacao de professor_unidade_curso_modalidade.
--
-- Contexto (medido em 09/08/2026): a rotina diaria abortava a transacao inteira nas TRES
-- unidades, por dois motivos independentes, e a execucao do sync continuava marcada como
-- 'completa' — falha silenciosa. Efeito colateral: Campo Grande ficou com ZERO atribuicoes
-- ativas desde 29/07 e o Health Score V3 travou (media_turma sem segmentacao).
--
-- CAUSA 1 — PROFESSOR_CURSO_MODALIDADE_CHAVE_IMUTAVEL (23514), Recreio e Barra.
--   O UPDATE das atribuicoes ativas fazia `vigencia_inicio = least(atual, evidencia)` e o
--   proprio predicado do WHERE selecionava justamente as linhas em que esse valor mudava.
--   O trigger fn_professor_curso_modalidade_proteger_historico_v1 proibe alterar
--   vigencia_inicio de linha ativa. A funcao pedia exatamente o que o trigger proibe:
--   bastava UMA evidencia com inicio anterior para derrubar a execucao toda.
--   Medido em 09/08: 7 linhas em Barra, 4 no Recreio casavam o predicado.
--
-- CAUSA 2 — PROFESSOR_CURSO_MODALIDADE_SOBREPOSICAO (23P01), Campo Grande.
--   O INSERT so verificava a existencia de linha ATIVA, mas o trigger
--   fn_professor_curso_modalidade_impedir_sobreposicao_v1 compara a vigencia nova contra
--   TODAS as linhas da mesma chave, inclusive as ENCERRADAS. Como o inicio era retroativo
--   (`least(evidencia, hoje)`), todo vinculo ja encerrado colidia com o proprio historico.
--   Medido em 09/08: 108 de 108 materializaveis de Campo Grande colidiam — nenhum passava,
--   o que explica a unidade nao ter se recuperado sozinha em 11 dias.
--
-- Correcoes:
--   1. vigencia_inicio sai do SET e do predicado do UPDATE. O inicio e imutavel por design
--      (o trigger diz isso); a evidencia mais antiga continua registrada no jsonb evidencias.
--   2. O INSERT ancora o inicio no dia seguinte ao ultimo encerramento da mesma chave, e
--      adia para a proxima execucao o que foi encerrado hoje (vigencia_inicio futura tambem
--      e proibida pelo trigger). Historico fica continuo: sem buraco e sem sobreposicao.
--   3. Novo contador `adiados_encerrados_hoje` no retorno, para o adiamento nao ser mudo.
--
-- Validado em transacao com rollback antes de aplicar, nas tres unidades:
--   Recreio      -> 149 mantidos, 149 atualizados,   1 criado,  0 encerrados
--   Barra        -> 121 mantidos, 121 atualizados,   0 criados,  1 encerrado
--   Campo Grande ->   0 mantidos,   0 atualizados, 108 criados,  0 encerrados
--   As 108 de Campo Grande nascem em 2026-07-30, dia seguinte ao encerramento em massa.
--
-- CREATE OR REPLACE (nao DROP+CREATE) para preservar a ACL: recriar reabriria EXECUTE
-- para anon por causa do ALTER DEFAULT PRIVILEGES do schema public.

create or replace function public.reconciliar_professor_curso_modalidade_v2(p_execucao_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_data_referencia date;
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_mantidos integer := 0;
  v_encerrados integer := 0;
  v_excecoes integer := 0;
  v_adiados integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  if v_execucao.status <> 'completa' then
    raise exception 'execucao_nao_esta_completa';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'professor_curso_modalidade_catalogo_v2:'
        || v_execucao.unidade_id::text,
      0
    )
  );

  v_data_referencia := (
    coalesce(v_execucao.finalizado_em, clock_timestamp())
      at time zone 'America/Sao_Paulo'
  )::date;

  drop table if exists pg_temp._professor_curso_modalidade_v2;
  create temporary table pg_temp._professor_curso_modalidade_v2
  on commit drop
  as
  select evidencia.*
  from public.fn_professor_curso_modalidade_evidencias_v2(
    v_data_referencia,
    v_execucao.unidade_id,
    null
  ) evidencia;

  drop table if exists pg_temp._professor_curso_modalidade_v2_materializavel;
  create temporary table pg_temp._professor_curso_modalidade_v2_materializavel
  on commit drop
  as
  select
    evidencia.professor_id,
    evidencia.unidade_id,
    evidencia.curso_id,
    evidencia.modalidade,
    min(evidencia.vigencia_inicio) as vigencia_inicio,
    bool_or(evidencia.tem_atribuicao_formal) as tem_atribuicao_formal,
    bool_or(evidencia.tem_jornada_ativa) as tem_jornada_ativa,
    jsonb_build_object(
      'regra_versao', 'professor_curso_modalidade_catalogo_v2',
      'execucao_id', p_execucao_id,
      'data_referencia', v_data_referencia,
      'origens', jsonb_agg(
        evidencia.evidencias
        order by evidencia.emusys_disciplina_id,
          evidencia.emusys_professor_id
      )
    ) as evidencias
  from pg_temp._professor_curso_modalidade_v2 evidencia
  where evidencia.materializavel
  group by
    evidencia.professor_id,
    evidencia.unidade_id,
    evidencia.curso_id,
    evidencia.modalidade;

  select count(*)::integer
    into v_excecoes
  from pg_temp._professor_curso_modalidade_v2 evidencia
  where not evidencia.materializavel
     or evidencia.estado = 'jornada_sem_atribuicao_formal';

  -- CORRECAO 1: vigencia_inicio nao entra mais no SET nem no predicado.
  with atualizadas as (
    update public.professor_unidade_curso_modalidade atribuicao
       set fonte = 'emusys',
           confianca = 'alta',
           evidencias = materializavel.evidencias,
           revisado_por = null,
           revisado_em = null,
           atualizado_em = now()
      from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
     where atribuicao.professor_id = materializavel.professor_id
       and atribuicao.unidade_id = materializavel.unidade_id
       and atribuicao.curso_id = materializavel.curso_id
       and atribuicao.modalidade = materializavel.modalidade
       and atribuicao.status = 'ativo'
       and atribuicao.vigencia_fim is null
       and atribuicao.fonte in ('jornada', 'aula', 'emusys')
       and (
         atribuicao.fonte is distinct from 'emusys'
         or atribuicao.confianca is distinct from 'alta'
         or atribuicao.evidencias is distinct from materializavel.evidencias
       )
    returning atribuicao.id
  )
  select count(*)::integer into v_atualizados from atualizadas;

  select count(*)::integer
    into v_mantidos
  from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
  join public.professor_unidade_curso_modalidade atribuicao
    on atribuicao.professor_id = materializavel.professor_id
   and atribuicao.unidade_id = materializavel.unidade_id
   and atribuicao.curso_id = materializavel.curso_id
   and atribuicao.modalidade = materializavel.modalidade
   and atribuicao.status = 'ativo'
   and atribuicao.vigencia_fim is null;

  -- CORRECAO 2: o inicio da atribuicao nova nao pode invadir o historico da mesma chave.
  with inseridas as (
    insert into public.professor_unidade_curso_modalidade (
      professor_id,
      unidade_id,
      curso_id,
      modalidade,
      vigencia_inicio,
      status,
      fonte,
      confianca,
      evidencias,
      atualizado_em
    )
    select
      materializavel.professor_id,
      materializavel.unidade_id,
      materializavel.curso_id,
      materializavel.modalidade,
      -- greatest ignora NULL: sem historico, vale o candidato original.
      greatest(
        least(materializavel.vigencia_inicio, v_data_referencia),
        historico.ultimo_fim + 1
      ),
      'ativo',
      'emusys',
      'alta',
      materializavel.evidencias,
      now()
    from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
    cross join lateral (
      select max(anterior.vigencia_fim) as ultimo_fim
      from public.professor_unidade_curso_modalidade anterior
      where anterior.professor_id = materializavel.professor_id
        and anterior.unidade_id = materializavel.unidade_id
        and anterior.curso_id = materializavel.curso_id
        and anterior.modalidade = materializavel.modalidade
        and anterior.vigencia_fim is not null
    ) historico
    where not exists (
      select 1
      from public.professor_unidade_curso_modalidade existente
      where existente.professor_id = materializavel.professor_id
        and existente.unidade_id = materializavel.unidade_id
        and existente.curso_id = materializavel.curso_id
        and existente.modalidade = materializavel.modalidade
        and existente.status = 'ativo'
        and existente.vigencia_fim is null
    )
      and not exists (
        select 1
        from public.professor_unidade_curso_modalidade revisada
        where revisada.professor_id = materializavel.professor_id
          and revisada.unidade_id = materializavel.unidade_id
          and revisada.curso_id = materializavel.curso_id
          and revisada.modalidade = materializavel.modalidade
          and revisada.status = 'encerrado'
          and revisada.fonte = 'revisao'
          and revisada.vigencia_inicio <= v_data_referencia
          and revisada.vigencia_fim >= materializavel.vigencia_inicio
      )
      -- encerrado hoje so pode reabrir amanha: o trigger recusa vigencia_inicio futura.
      and coalesce(historico.ultimo_fim, '-infinity'::date) < v_data_referencia
    on conflict (
      professor_id,
      unidade_id,
      curso_id,
      modalidade
    ) where status = 'ativo' and vigencia_fim is null
    do nothing
    returning id
  )
  select count(*)::integer into v_criados from inseridas;

  -- Observabilidade: materializaveis que seguem sem linha ativa depois do INSERT.
  select count(*)::integer
    into v_adiados
  from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
  where not exists (
    select 1
    from public.professor_unidade_curso_modalidade existente
    where existente.professor_id = materializavel.professor_id
      and existente.unidade_id = materializavel.unidade_id
      and existente.curso_id = materializavel.curso_id
      and existente.modalidade = materializavel.modalidade
      and existente.status = 'ativo'
      and existente.vigencia_fim is null
  );

  with encerradas as (
    update public.professor_unidade_curso_modalidade atribuicao
       set status = 'encerrado',
           vigencia_fim = greatest(
             atribuicao.vigencia_inicio,
             v_data_referencia
           ),
           evidencias = atribuicao.evidencias || jsonb_build_object(
             'encerramento', jsonb_build_object(
               'regra_versao', 'professor_curso_modalidade_catalogo_v2',
               'execucao_id', p_execucao_id,
               'data', v_data_referencia,
               'motivo', 'ausente_no_formal_e_na_jornada_apos_sync_completo'
             )
           ),
           atualizado_em = now()
     where atribuicao.unidade_id = v_execucao.unidade_id
       and atribuicao.status = 'ativo'
       and atribuicao.vigencia_fim is null
       and atribuicao.fonte in ('jornada', 'aula', 'emusys')
       and atribuicao.fonte not in ('manual', 'revisao')
       and not exists (
         select 1
         from pg_temp._professor_curso_modalidade_v2_materializavel materializavel
         where materializavel.professor_id = atribuicao.professor_id
           and materializavel.unidade_id = atribuicao.unidade_id
           and materializavel.curso_id = atribuicao.curso_id
           and materializavel.modalidade = atribuicao.modalidade
       )
    returning atribuicao.id
  )
  select count(*)::integer into v_encerrados from encerradas;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'data_referencia', v_data_referencia,
    'criados', v_criados,
    'atualizados', v_atualizados,
    'mantidos', v_mantidos,
    'encerrados', v_encerrados,
    'excecoes', v_excecoes,
    'adiados_encerrados_hoje', v_adiados
  );
end;
$function$;

comment on function public.reconciliar_professor_curso_modalidade_v2(uuid) is
  'Reconcilia professor_unidade_curso_modalidade a partir do catalogo Emusys. '
  'CP1 (09/08/2026): nao altera mais vigencia_inicio de linha ativa (CHAVE_IMUTAVEL) e '
  'ancora o inicio da atribuicao nova depois do ultimo encerramento da mesma chave '
  '(SOBREPOSICAO). Antes disso, uma unica colisao abortava a execucao inteira da unidade.';
