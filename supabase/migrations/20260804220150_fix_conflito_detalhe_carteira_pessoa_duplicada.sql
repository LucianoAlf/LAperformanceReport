-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.capturar_carteira_professores_mensal(p_competencia date, p_fonte text default 'sync_matriculas_emusys_fechamento_automatico'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_processados integer := 0;
  v_detalhe_linhas integer := 0;
begin
  if p_competencia is null or p_competencia <> v_competencia then
    raise exception 'Competencia deve ser o primeiro dia do mes: %', p_competencia;
  end if;

  if v_competencia > date_trunc(
    'month',
    now() at time zone 'America/Sao_Paulo'
  )::date then
    raise exception 'Nao e permitido capturar competencia futura: %', v_competencia;
  end if;

  with pares_validos as (
    select distinct pu.unidade_id, pu.professor_id
    from public.professores_unidades pu
    join public.professores p on p.id = pu.professor_id
    where p.ativo = true
      and pu.emusys_ativo = true
      and coalesce(pu.validacao_status, '') <> 'ignorado'

    union

    select distinct j.unidade_id, j.professor_id
    from public.aluno_jornada_matricula_disciplina j
    join public.professores p on p.id = j.professor_id
    where p.ativo = true
      and j.status_matricula = 'ativa'
      and j.professor_id is not null
  ),
  contagens as (
    select
      j.unidade_id,
      j.professor_id,
      count(distinct coalesce(
        j.emusys_aluno_id::text,
        case when j.aluno_id is not null then 'local:' || j.aluno_id::text end
      ))::integer as carteira_alunos
    from public.aluno_jornada_matricula_disciplina j
    where j.status_matricula = 'ativa'
      and j.professor_id is not null
    group by j.unidade_id, j.professor_id
  ),
  gravados as (
    insert into public.professor_carteira_mensal_canonica (
      competencia,
      unidade_id,
      professor_id,
      carteira_alunos,
      fonte,
      auditado_por,
      auditado_em,
      observacoes
    )
    select
      v_competencia,
      pv.unidade_id,
      pv.professor_id,
      coalesce(c.carteira_alunos, 0),
      p_fonte,
      'cron_fechamento_professores',
      now(),
      'Carteira congelada apos os syncs noturnos do primeiro dia do mes.'
    from pares_validos pv
    left join contagens c
      on c.unidade_id = pv.unidade_id
     and c.professor_id = pv.professor_id
    on conflict (competencia, unidade_id, professor_id) do update
    set
      carteira_alunos = excluded.carteira_alunos,
      fonte = excluded.fonte,
      auditado_por = excluded.auditado_por,
      auditado_em = excluded.auditado_em,
      observacoes = excluded.observacoes
    where professor_carteira_mensal_canonica.fonte =
      'sync_matriculas_emusys_fechamento_automatico'
    returning 1
  )
  select count(*) into v_processados from gravados;

  -- Detalhe por aluno: sincroniza com o MESMO recorte usado no agregado
  -- acima (mesma leitura de aluno_jornada_matricula_disciplina, mesma
  -- transação). Idempotente: apaga e regrava o que essa fonte já tinha
  -- gravado para essa competência antes de inserir de novo.
  delete from public.professor_carteira_mensal_detalhe
  where competencia = v_competencia
    and fonte = p_fonte;

  with detalhe as (
    insert into public.professor_carteira_mensal_detalhe (
      competencia, unidade_id, professor_id, aluno_id, pessoa_chave, curso_id, fonte
    )
    select distinct
      v_competencia,
      j.unidade_id,
      j.professor_id,
      j.aluno_id,
      coalesce(
        j.emusys_aluno_id::text,
        case when j.aluno_id is not null then 'local:' || j.aluno_id::text end
      ) as pessoa_chave,
      j.curso_id,
      p_fonte
    from public.aluno_jornada_matricula_disciplina j
    join public.professores p on p.id = j.professor_id
    where p.ativo = true
      and j.status_matricula = 'ativa'
      and j.professor_id is not null
      and coalesce(
        j.emusys_aluno_id::text,
        case when j.aluno_id is not null then 'local:' || j.aluno_id::text end
      ) is not null
    -- Proteção contra pessoa duplicada no cadastro local (2 aluno_id
    -- distintos apontando pro mesmo emusys_aluno_id): a contagem
    -- canônica acima já colapsa isso via pessoa_chave; o detalhe
    -- precisa da mesma proteção, senão colide na constraint única.
    on conflict (competencia, unidade_id, professor_id, pessoa_chave, curso_id)
    do nothing
    returning 1
  )
  select count(*) into v_detalhe_linhas from detalhe;

  return jsonb_build_object(
    'ok', true,
    'competencia', v_competencia,
    'linhas_processadas', v_processados,
    'detalhe_linhas', v_detalhe_linhas,
    'fonte', p_fonte
  );
end;
$function$;
