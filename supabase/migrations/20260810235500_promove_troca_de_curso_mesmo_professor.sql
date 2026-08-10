-- "Vamos automatizar essa regra de troca de curso senao isso vai aparecer de novo" -- Alf,
-- 10/08/2026. Terceira promocao automatica do dia, mesma familia das outras duas (cron
-- `promover-periodos-professor-ativos-exatos`, reagendado aqui para incluir esta funcao).
--
-- ORIGEM: as 4 unidades confirmaram hoje que "aluno trocou de curso, mesmo professor" nao e
-- saida -- ver a curadoria manual em `20260810234500`. Generalizar essa regra ingenuamente
-- ("orfao com outra jornada ativa") pega **524 periodos**, porque "aluno tem outra jornada
-- ativa" TAMBEM acontece com quem faz DOIS instrumentos ao mesmo tempo (nao e troca, sao dois
-- vinculos legitimos e simultaneos). Decompondo por status_periodo E cardinalidade de
-- candidatas, a fatia realmente segura -- `status_periodo='encerrado'` (quem ainda ensina os
-- dois instrumentos concorrentes nunca fica "encerrado", porque as aulas continuam) + UMA UNICA
-- jornada nova + MESMO professor -- cai para **12 casos**, dos quais so 10 tem candidata unica.
--
-- ⚠️ MESMO "MESMO PROFESSOR" TEM CASO QUE NAO E TROCA. Dos 10 com candidata unica, o intervalo
-- entre a ultima aula do curso antigo e a primeira do novo varia de -7 a **987 dias** (quase 3
-- anos -- Rafael Placido, Canto em 2023 -> Violao em 2026 com o mesmo Jeyson Gaia). Isso nao e
-- continuidade, e coincidencia de professor entre dois episodios desconexos da vida do aluno.
-- Calibrando contra os 4 casos que as EQUIPES confirmaram hoje como verdade fundamental
-- (Gabriela Dornas -7, Clarisse -6, Luana +19, Arthur +7 -- reconferido com o join TRAVADO no
-- mesmo emusys_aluno_id, que a primeira consulta desta investigacao nao travava e por isso
-- misturava turma de outro aluno), a janela **45 dias** (a MESMA que o projeto ja usa em
-- `vw_professor_periodos_baseline_v3_sombra` para aceitar evidencia de saida, e que o CP11
-- reusou para renovacao pendente) cobre os 4 confirmados com folga e deixa de fora os 6 velhos
-- (189 a 987 dias) e as 2 ambiguas (mais de uma jornada candidata).
--
-- ⚠️ A OUTRA FATIA -- "orfao + candidata unica + PROFESSOR DIFERENTE" (92 casos) -- NAO entra
-- aqui e nao devia. Amostrando: o curso antigo e quase sempre "Musicalizacao
-- Preparatoria/Infantil/para Bebes" (turma de entrada) e o novo e um instrumento especifico com
-- professor especializado -- e o PIPELINE normal (musicalizacao -> instrumento), estruturalmente
-- diferente de "trocou de instrumento mantendo o mesmo professor". Os intervalos vao de 4 a 462
-- dias, sem corte limpo. Fica para curadoria humana, nao para automacao.
--
-- CASOS DO DIA (todos Recreio, dentro de 45 dias, professor identico antes/depois):
--   Felipe de Moura Vieira (Lucas da Silva Guimaraes)   Musicalizacao Prep -> Guitarra,  7 dias
--   Giovanna Goncalves Frias Ribeiro (Leticia Palmeira) Bateria -> Canto,               14 dias
--   Laura Almada Teixeira Neto (Larissa Bheattriz)      Guitarra -> Canto,               7 dias
--   Liah Lemos Schettino (Joel de Salles Gouveia Filho) Canto -> Violino,                7 dias
--
-- Nenhum penaliza: `tipo_fim='troca_de_curso_mesmo_professor'` entra na familia `troca%`
-- (LIKE), que `encerramentos_penalizadores` e `encerramentos_pos_corte_pendentes` ja excluem
-- desde o CP8. So sobe o denominador/numerador.
--
-- ⚠️ NAO MUDA O CICLO CORRENTE. Os 4 casos encerraram entre marco e maio de 2026, fora da
-- janela jun-ago -- nunca contavam como "em revisao" DESTE ciclo, entao o consolidado do ciclo
-- fica em 5 antes e depois desta migration. O efeito e nos snapshots MENSAIS de marco/abril/maio
-- (`vinculos_em_revisao`: mar 8->4, abr 8->4, mai 7->3 -- medido pos-execucao) e, principalmente,
-- em fechar a RECORRENCIA: sem isso, o mesmo padrao reapareceria a cada troca de instrumento
-- futura. E o "atacar na raiz" que o Alf pediu -- nao um numero movido hoje, e um numero que
-- para de crescer daqui pra frente.
do $mig$
begin
  create or replace function public.promover_troca_de_curso_mesmo_professor_v1(
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

    create temporary table _troca_curso_candidatos on commit drop as
    with orfaos as (
      select b.periodo_origem_id, b.reconstrucao_id, b.unidade_id, b.emusys_aluno_id,
             b.professor_id, b.emusys_professor_id, b.emusys_matricula_disciplina_id,
             b.emusys_disciplina_id, b.status_periodo, b.tipo_fim, b.confianca, b.conflitos,
             b.publicavel, b.fonte, b.data_inicio, b.data_fim, b.inicio_incompleto,
             coalesce(b.chave_natural, b.periodo_chave) as chave_res
        from public.vw_professor_periodos_baseline_v3_sombra b
       where b.status_periodo = 'encerrado'
         and b.publicavel is false
         and b.professor_id is not null
         and b.emusys_professor_id is not null
         and b.emusys_matricula_disciplina_id is not null
         and b.emusys_disciplina_id is not null
         and b.emusys_aluno_id is not null
         and b.data_inicio is not null
         and b.data_fim is not null
         and b.data_fim >= b.data_inicio
         and b.inicio_incompleto is false
         and b.periodo_origem_id is not null
         and not exists (select 1 from public.aluno_jornada_matricula_disciplina j
                          where j.unidade_id = b.unidade_id
                            and j.emusys_matricula_disciplina_id = b.emusys_matricula_disciplina_id)
    ), candidatas as (
      select o.*, j.emusys_matricula_disciplina_id as md_nova,
             j.data_primeira_aula as nova_data_primeira_aula,
             count(*) over (partition by o.periodo_origem_id) as n_candidatas
        from orfaos o
        join public.aluno_jornada_matricula_disciplina j
          on j.unidade_id = o.unidade_id
         and j.emusys_aluno_id = o.emusys_aluno_id
         and j.professor_id = o.professor_id            -- MESMO professor
         and j.status_matricula = 'ativa'
         and j.emusys_matricula_disciplina_id <> o.emusys_matricula_disciplina_id
    ), revisadas as (
      select distinct coalesce(
               public.fn_chave_natural_periodo_professor_v1(
                 pr.unidade_id, pr.pessoa_chave, pr.emusys_matricula_disciplina_id,
                 pr.emusys_professor_id, pr.evidencias),
               'baseline:' || rv.periodo_id::text) as chave_res
        from public.professor_periodos_revisoes_v1 rv
        left join public.professor_matricula_disciplina_periodos_v1 pr on pr.id = rv.periodo_id
    )
    select c.*
      from candidatas c
     where c.n_candidatas = 1
       and abs((c.nova_data_primeira_aula at time zone 'America/Sao_Paulo')::date
               - (c.data_fim at time zone 'America/Sao_Paulo')::date) <= 45
       and not exists (select 1 from revisadas r where r.chave_res = c.chave_res);

    select count(*) into v_candidatos from _troca_curso_candidatos;

    if p_dry_run then
      return jsonb_build_object('dry_run', true, 'candidatos', v_candidatos, 'inseridos', 0);
    end if;

    insert into public.professor_periodos_revisoes_v1 (
      periodo_id, reconstrucao_id, decisao, motivo,
      snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao
    )
    select c.periodo_origem_id, c.reconstrucao_id, 'aprovado',
           'Promocao automatica: troca de curso com o MESMO professor (nova matricula em ate '
             || '45 dias da ultima aula da antiga; sem candidata ambigua).',
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
             'tipo_fim', 'troca_de_curso_mesmo_professor',
             'confianca', 'alta', 'conflitos', '[]'::jsonb, 'publicavel', true,
             'fonte', c.fonte || '+promocao_automatica_v1',
             'evidencias', jsonb_build_object(
               'promocao_troca_de_curso', jsonb_build_object(
                 'regra', 'orfao_mesmo_professor_janela_45d',
                 'md_antiga', c.emusys_matricula_disciplina_id,
                 'md_nova', c.md_nova,
                 'versao', 'v1_troca_de_curso_mesmo_professor'))),
           v_revisado_por, 'promocao_automatica'
      from _troca_curso_candidatos c
    on conflict do nothing;

    get diagnostics v_inseridos = row_count;

    return jsonb_build_object(
      'dry_run', false, 'candidatos', v_candidatos, 'inseridos', v_inseridos,
      'executado_em', now());
  end;
  $fn$;

  comment on function public.promover_troca_de_curso_mesmo_professor_v1(boolean) is
    'Reclassifica como troca de curso o encerramento cuja matricula-disciplina sumiu da jornada, mas o aluno tem OUTRA jornada ativa, unica, com o MESMO professor, iniciada em ate 45 dias da ultima aula da antiga. Decisao do Alf em 10/08/2026: automatizar o padrao confirmado pelas unidades. So a fatia MESMO PROFESSOR foi automatizada -- professor diferente e o pipeline musicalizacao->instrumento, que precisa de curadoria.';

  -- ⚠️ ACL nominal: `ALTER DEFAULT PRIVILEGES` deste projeto concede EXECUTE a `anon` em
  -- funcao nova, entao `revoke from public` NAO basta.
  revoke all on function public.promover_troca_de_curso_mesmo_professor_v1(boolean) from public, anon, authenticated;
  grant execute on function public.promover_troca_de_curso_mesmo_professor_v1(boolean) to service_role;
end
$mig$;

-- As TRES promocoes no MESMO job, as 06:00 UTC = 03:00 BRT, meia hora antes da materializacao
-- do Health Score V3 (job 109). Os tres crivos sao disjuntos (ativos-exatos so pega 'ativo';
-- trocas-pela-jornada e troca-de-curso so pegam 'encerrado', e se diferenciam por ter ou nao
-- MESMO md_id) e todos dedupam por chave natural, entao repetir e barato.
-- ⚠️ `cron.job` tem LEITURA PUBLICA neste projeto: o comando chama funcoes SQL direto e nao
-- carrega service_role, JWT nem qualquer segredo.
do $cron$
begin
  perform cron.unschedule('promover-periodos-professor-ativos-exatos')
   where exists (select 1 from cron.job where jobname = 'promover-periodos-professor-ativos-exatos');

  perform cron.schedule(
    'promover-periodos-professor-ativos-exatos',
    '0 6 * * *',
    'select public.promover_periodos_professor_ativos_exatos_v2(false), public.promover_trocas_confirmadas_pela_jornada_v1(false), public.promover_troca_de_curso_mesmo_professor_v1(false);'
  );
end
$cron$;
