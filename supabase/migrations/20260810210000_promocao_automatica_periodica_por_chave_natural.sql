-- A promocao automatica de periodos ativos exatos era uma MIGRATION DE UMA VEZ SO
-- (`20260727121000`): promoveu 207 vinculos em 27/07/2026 e nunca mais rodou.
--
-- Como a reconstrucao gera periodos novos toda semana, tudo que nasceu depois daquele dia
-- ficou parado em `confianca='media'` / `publicavel=false` e foi se acumulando como
-- "vinculo em revisao", travando o fechamento do ciclo. Mesmo tipo de apodrecimento que a
-- reconstrucao teve ate ganhar cron em 09/08 -- processo sem cadencia vira divida silenciosa.
--
-- Eram 31 vinculos ATIVOS em revisao e **29 passaram no criterio identico** ao aprovado em
-- 27/07: a jornada do Emusys esta ativa, e UNICA para aquela matricula-disciplina, e o
-- professor dela bate com o do periodo. Os 2 que sobraram sao divergencia de verdade
-- (professor da jornada != professor do periodo, e 1 com conflito) e seguem para curadoria.
--
-- ⚠️ CHAVE NATURAL, nao `periodo_id`. A migration de 27/07 usava
-- `where not exists (... where existente.periodo_id = c.periodo_origem_id)`, e o `periodo_id`
-- MUDA a cada reconstrucao -- entao aquela guarda nao reconhece o mesmo vinculo depois de
-- reconstruido. E a mesma licao de 09/08 (`fn_chave_natural_periodo_professor_v1`, ancorada
-- no `emusys_aula_id` da primeira aula). Sem isso, uma execucao periodica promoveria de novo
-- o que ja foi decidido -- inclusive por cima de decisao HUMANA.
--
-- ⚠️ Nao promove quem ja tem revisao de qualquer origem naquela chave natural. Curadoria
-- humana (inclusive `rejeitado` e `manter_revisao`) sempre vence a promocao.
--
-- ⚠️ Exige `b.data_fim is null` alem de `status_periodo='ativo'`. Sem isso a promocao volta a
-- cair na contradicao corrigida em `20260810201500` (aprovar um periodo "ativo" que carrega
-- data de fim, e a regra de publicavel rejeitar em seguida).
--
-- EFEITO MEDIDO da execucao de hoje (ciclo 2026-JUN-AGO): 19 professores, todos SOBEM ou
-- ficam iguais, ninguem perde. Maior movimento +0,76 pp (Leonardo Castro 90,91 -> 91,67).
-- Israel Rocha 92,86 -> 93,55 | Valdo Delfino 90,24 -> 90,91 | Gabriel Antony 89,36 -> 89,80.
-- Os demais movem menos de 0,4 pp. So o DENOMINADOR cresce: os promovidos sao periodos
-- ATIVOS e os dois contadores de encerramento filtram `status_periodo='encerrado'` --
-- `encerramentos_penalizadores` seguiu 114, sem se mexer.
-- Consolidado do ciclo: `vinculos_em_revisao` 49 -> 20, expostos 1.337 -> 1.366,
-- estado `ok` 10 -> 19, `ok_com_pendencias` 27 -> 18.
create or replace function public.promover_periodos_professor_ativos_exatos_v2(
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_revisado_por integer;
  v_candidatos integer;
  v_inseridos integer := 0;
begin
  -- Ator: mesma exigencia da migration de 27/07 -- quem ativou a config vigente e tem
  -- permissao de editar professores. Sem ator valido, nao promove (nao inventa autoria).
  select c.ativado_por into v_revisado_por
    from public.health_score_professor_v3_config_versoes c
    join public.usuarios u on u.id = c.ativado_por
   where c.status = 'ativa' and c.ativado_por is not null and u.ativo = true
     and public.usuario_tem_permissao(c.ativado_por, 'professores.editar', null)
   order by c.versao desc, c.vigencia_inicio desc, c.id desc
   limit 1;

  if v_revisado_por is null then
    raise exception 'HEALTH_SCORE_V3_CONFIGURACAO_ATIVA_SEM_ATOR_VALIDO: exige ativado_por ativo com professores.editar';
  end if;

  create temporary table _promocao_candidatos on commit drop as
  with jornada_exata as (
    -- "exata" = a matricula-disciplina tem UMA unica jornada ativa. Duas jornadas ativas
    -- para o mesmo par significa que nao da para dizer de quem e o aluno.
    select j.unidade_id, j.emusys_matricula_disciplina_id,
           min(j.professor_id) as professor_id,
           min(j.emusys_disciplina_id) as emusys_disciplina_id
      from public.aluno_jornada_matricula_disciplina j
     where j.status_matricula = 'ativa'
       and j.emusys_matricula_disciplina_id is not null
     group by 1, 2
    having count(*) = 1
  ), revisadas as (
    select distinct coalesce(
             public.fn_chave_natural_periodo_professor_v1(
               pr.unidade_id, pr.pessoa_chave, pr.emusys_matricula_disciplina_id,
               pr.emusys_professor_id, pr.evidencias),
             'baseline:' || rv.periodo_id::text) as chave_res
      from public.professor_periodos_revisoes_v1 rv
      left join public.professor_matricula_disciplina_periodos_v1 pr on pr.id = rv.periodo_id
  )
  select b.periodo_origem_id, b.reconstrucao_id, b.unidade_id,
         b.emusys_matricula_disciplina_id, b.professor_id, b.status_periodo,
         b.confianca, b.inicio_incompleto, b.conflitos, b.publicavel, b.fonte,
         coalesce(b.chave_natural, b.periodo_chave) as chave_res
    from public.vw_professor_periodos_baseline_v3_sombra b
    join jornada_exata je
      on je.unidade_id = b.unidade_id
     and je.emusys_matricula_disciplina_id = b.emusys_matricula_disciplina_id
     and je.professor_id = b.professor_id
   where b.status_periodo = 'ativo'
     and b.confianca = 'media'
     and b.data_fim is null
     and b.professor_id is not null
     and b.emusys_professor_id is not null
     and b.emusys_matricula_disciplina_id is not null
     and b.emusys_disciplina_id is not null
     and b.inicio_incompleto is false
     and jsonb_typeof(b.conflitos) = 'array'
     and jsonb_array_length(b.conflitos) = 0
     and b.periodo_origem_id is not null
     -- curadoria humana (ou promocao anterior) na mesma chave natural sempre vence
     and not exists (select 1 from revisadas r where r.chave_res = coalesce(b.chave_natural, b.periodo_chave));

  select count(*) into v_candidatos from _promocao_candidatos;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'candidatos', v_candidatos, 'inseridos', 0);
  end if;

  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao
  )
  select c.periodo_origem_id, c.reconstrucao_id, 'aprovado',
         'Promocao automatica: periodo ativo sustentado por jornada atual exata.',
         jsonb_build_object(
           'periodo_id', c.periodo_origem_id, 'reconstrucao_id', c.reconstrucao_id,
           'unidade_id', c.unidade_id,
           'emusys_matricula_disciplina_id', c.emusys_matricula_disciplina_id,
           'professor_id', c.professor_id, 'status_periodo', c.status_periodo,
           'confianca', c.confianca, 'inicio_incompleto', c.inicio_incompleto,
           'conflitos', c.conflitos, 'publicavel', c.publicavel, 'fonte', c.fonte),
         jsonb_build_object(
           'periodo_id', c.periodo_origem_id, 'reconstrucao_id', c.reconstrucao_id,
           'unidade_id', c.unidade_id,
           'emusys_matricula_disciplina_id', c.emusys_matricula_disciplina_id,
           'professor_id', c.professor_id, 'status_periodo', c.status_periodo,
           'confianca', 'alta', 'conflitos', c.conflitos, 'publicavel', true,
           'fonte', c.fonte || '+promocao_automatica_v1',
           'evidencias', jsonb_build_object(
             'promocao_confianca', jsonb_build_object(
               'regra', 'jornada_atual_exata',
               'confianca_anterior', 'media',
               'confianca_atual', 'alta',
               'versao', 'v2_periodica_chave_natural'))),
         v_revisado_por, 'promocao_automatica'
    from _promocao_candidatos c
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;

  return jsonb_build_object(
    'dry_run', false, 'candidatos', v_candidatos, 'inseridos', v_inseridos,
    'executado_em', now());
end;
$fn$;

comment on function public.promover_periodos_professor_ativos_exatos_v2(boolean) is
  'Promove periodos ATIVOS sustentados por jornada do Emusys ativa e unica, com o professor batendo. Substitui a migration de uma vez so de 27/07/2026, que nao tinha cadencia. Deduplica por CHAVE NATURAL (periodo_id muda a cada reconstrucao) e nunca sobrepoe revisao humana.';

-- ⚠️ ACL nominal: `ALTER DEFAULT PRIVILEGES` deste projeto concede EXECUTE a `anon` em funcao
-- nova, entao `revoke from public` NAO basta.
revoke all on function public.promover_periodos_professor_ativos_exatos_v2(boolean) from public, anon, authenticated;
grant execute on function public.promover_periodos_professor_ativos_exatos_v2(boolean) to service_role;

-- Cadencia diaria as 06:00 UTC = 03:00 BRT, meia hora ANTES da materializacao do Health
-- Score V3 (job 109, `30 6 * * *`), para o snapshot do dia ja nascer com as promocoes.
-- ⚠️ `cron.job` tem LEITURA PUBLICA neste projeto: o comando chama uma funcao SQL direto e
-- nao carrega service_role, JWT nem qualquer segredo.
do $cron$
begin
  perform cron.unschedule('promover-periodos-professor-ativos-exatos')
   where exists (select 1 from cron.job where jobname = 'promover-periodos-professor-ativos-exatos');

  perform cron.schedule(
    'promover-periodos-professor-ativos-exatos',
    '0 6 * * *',
    'select public.promover_periodos_professor_ativos_exatos_v2(false);'
  );
end
$cron$;
