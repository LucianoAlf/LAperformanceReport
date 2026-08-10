-- "Se ta no Emusys trocado, troca aqui tambem" -- Alf, 10/08/2026. PARTE 2 de 2: a promocao.
--
-- CRIVO ESTRITO -- so entra quem tem as tres coisas:
--   1. a jornada do Emusys para aquela matricula-disciplina existe e esta `ativa`
--   2. ela e UNICA (duas jornadas ativas = nao da para dizer de quem e o aluno)
--   3. o professor dela e DIFERENTE do professor do periodo
-- Quem tem jornada `inativa` fica de fora DE PROPOSITO: Alexandre/Miguel Santos Borges
-- (`interrompida`) e Gabriel Barbosa/Guilherme Dias (`concluida`) sao SAIDA de verdade, nao
-- troca, e continuam como curadoria humana.
--
-- ⚠️ O snapshot grava `conflitos: []`. Dois dos casos tinham `["jornada_atual_divergente"]` --
-- e o conflito E a prova da troca, nao um impedimento: a jornada atual divergir do periodo e
-- exatamente o que define uma troca. Reclassificar RESOLVE o conflito. Sem zerar ali, a regra
-- de publicavel recusaria justamente os casos que a regra existe para tratar.
--
-- ⚠️ `tipo_fim` vira `troca_confirmada_jornada` (valor ja existente no vocabulario). Quatro dos
-- nove do ciclo ja estavam num `troca%` e mesmo assim nao eram publicaveis -- o problema nunca
-- foi a classificacao, foi o `publicavel`.
--
-- ⚠️ ALCANCE MAIOR DO QUE O CICLO. O dry-run devolveu **32 candidatos**, nao os 9 que eu tinha
-- medido -- porque a medicao anterior estava presa a janela do ciclo JUN-AGO e a funcao varre
-- todo o historico (2022-08 a 2026-08). Mantido de proposito: a classificacao esta certa ou
-- errada independente da data, e deixar 2022 errado nao e melhor. Nenhum snapshot estava
-- `fechado` (todos `provisorio`/`em_maturacao`), entao nada oficial foi reescrito.
--
-- EFEITO MEDIDO, antes -> depois, com os PENALIZADORES INALTERADOS em todos os periodos:
--   ciclo 2026 JUN-AGO   expostos 1.366 -> 1.375 | penalizadores 114 -> 114 | em revisao 20 -> 11
--   mensal 2025-09       expostos 1.205 -> 1.212 | penalizadores  72 ->  72
--   mensal 2026-02       expostos 1.243 -> 1.253 | penalizadores  72 ->  72
--   mensal 2026-06       expostos 1.237 -> 1.243 | penalizadores  58 ->  58
-- Os 9 professores do ciclo, todos SUBINDO e 8 deles indo para estado `ok`:
--   Ana Beatriz 100,00 (14->15) | Gabriel Antony 89,80 -> 90,00 | Jordan Barbosa 100,00 (18->19)
--   Leticia 90,57 -> 90,74 | Marcos Delfino 84,62 -> 85,71 | Rafael Alves 93,22 -> 93,33
--   Renan Amorim 93,75 -> 93,94 | Rodrigo Pinheiro 94,44 -> 94,59 | Willer 91,67 -> 91,89
--
-- ⚠️ Deduplica por CHAVE NATURAL e nunca sobrepoe revisao existente, igual a
-- `promover_periodos_professor_ativos_exatos_v2`. As duas rodam no mesmo cron.
create or replace function public.promover_trocas_confirmadas_pela_jornada_v1(
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

  create temporary table _troca_candidatos on commit drop as
  with jornada_exata as (
    select j.unidade_id, j.emusys_matricula_disciplina_id,
           min(j.professor_id) as professor_id,
           min(j.professor_nome_emusys) as professor_nome
      from public.aluno_jornada_matricula_disciplina j
     where j.status_matricula = 'ativa'
       and j.emusys_matricula_disciplina_id is not null
       and j.professor_id is not null
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
         b.tipo_fim, b.confianca, b.conflitos, b.publicavel, b.fonte,
         je.professor_id as professor_jornada_id, je.professor_nome as professor_jornada_nome,
         coalesce(b.chave_natural, b.periodo_chave) as chave_res
    from public.vw_professor_periodos_baseline_v3_sombra b
    join jornada_exata je
      on je.unidade_id = b.unidade_id
     and je.emusys_matricula_disciplina_id = b.emusys_matricula_disciplina_id
   where b.status_periodo = 'encerrado'
     and b.publicavel is false
     and je.professor_id is distinct from b.professor_id   -- o Emusys mostra OUTRO professor
     and b.professor_id is not null
     and b.emusys_professor_id is not null
     and b.emusys_matricula_disciplina_id is not null
     and b.emusys_disciplina_id is not null
     and b.data_inicio is not null
     and b.data_fim is not null
     and b.data_fim >= b.data_inicio
     and b.inicio_incompleto is false
     and b.periodo_origem_id is not null
     and not exists (select 1 from revisadas r where r.chave_res = coalesce(b.chave_natural, b.periodo_chave));

  select count(*) into v_candidatos from _troca_candidatos;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'candidatos', v_candidatos, 'inseridos', 0);
  end if;

  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao
  )
  select c.periodo_origem_id, c.reconstrucao_id, 'aprovado',
         'Promocao automatica: troca confirmada pela jornada atual do Emusys (aluno ativo com '
           || coalesce(c.professor_jornada_nome, 'outro professor') || ').',
         jsonb_build_object(
           'periodo_id', c.periodo_origem_id, 'reconstrucao_id', c.reconstrucao_id,
           'unidade_id', c.unidade_id,
           'emusys_matricula_disciplina_id', c.emusys_matricula_disciplina_id,
           'professor_id', c.professor_id, 'status_periodo', c.status_periodo,
           'tipo_fim', c.tipo_fim, 'confianca', c.confianca,
           'conflitos', c.conflitos, 'publicavel', c.publicavel, 'fonte', c.fonte),
         jsonb_build_object(
           'periodo_id', c.periodo_origem_id, 'reconstrucao_id', c.reconstrucao_id,
           'unidade_id', c.unidade_id,
           'emusys_matricula_disciplina_id', c.emusys_matricula_disciplina_id,
           'professor_id', c.professor_id, 'status_periodo', 'encerrado',
           'tipo_fim', 'troca_confirmada_jornada',
           'confianca', 'alta',
           -- o conflito ERA a prova da troca; reclassificar resolve
           'conflitos', '[]'::jsonb,
           'publicavel', true,
           'fonte', c.fonte || '+promocao_automatica_v1',
           'evidencias', jsonb_build_object(
             'promocao_troca', jsonb_build_object(
               'regra', 'jornada_atual_ativa_com_outro_professor',
               'professor_periodo_id', c.professor_id,
               'professor_jornada_id', c.professor_jornada_id,
               'tipo_fim_anterior', c.tipo_fim,
               'conflitos_anteriores', c.conflitos,
               'versao', 'v1_troca_confirmada_jornada'))),
         v_revisado_por, 'promocao_automatica'
    from _troca_candidatos c
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;

  return jsonb_build_object(
    'dry_run', false, 'candidatos', v_candidatos, 'inseridos', v_inseridos,
    'executado_em', now());
end;
$fn$;

comment on function public.promover_trocas_confirmadas_pela_jornada_v1(boolean) is
  'Reclassifica como troca o encerramento cuja jornada do Emusys esta ativa, e unica, e aponta OUTRO professor. Decisao do Alf em 10/08/2026: "se ta no Emusys trocado, troca aqui tambem". Troca nao penaliza (CP8), entao o vinculo passa a contar sem prejudicar o professor. Jornada inativa fica de fora -- ali e saida de verdade.';

-- ⚠️ ACL nominal: `ALTER DEFAULT PRIVILEGES` deste projeto concede EXECUTE a `anon` em funcao
-- nova, entao `revoke from public` NAO basta.
revoke all on function public.promover_trocas_confirmadas_pela_jornada_v1(boolean) from public, anon, authenticated;
grant execute on function public.promover_trocas_confirmadas_pela_jornada_v1(boolean) to service_role;

-- As duas promocoes no MESMO job: rodam juntas, as 06:00 UTC = 03:00 BRT, meia hora antes da
-- materializacao do Health Score V3 (job 109). Ordem importa pouco -- os crivos sao
-- disjuntos (uma so pega `ativo`, a outra so `encerrado`) -- mas as duas dedupam por chave
-- natural, entao repetir e barato.
-- ⚠️ `cron.job` tem LEITURA PUBLICA neste projeto: o comando chama funcoes SQL direto e nao
-- carrega service_role, JWT nem qualquer segredo.
do $cron$
begin
  perform cron.unschedule('promover-periodos-professor-ativos-exatos')
   where exists (select 1 from cron.job where jobname = 'promover-periodos-professor-ativos-exatos');

  perform cron.schedule(
    'promover-periodos-professor-ativos-exatos',
    '0 6 * * *',
    'select public.promover_periodos_professor_ativos_exatos_v2(false), public.promover_trocas_confirmadas_pela_jornada_v1(false);'
  );
end
$cron$;
