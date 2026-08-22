-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- 1. Tabela nova: detalhe por aluno da carteira mensal do professor
-- ============================================================
create table if not exists public.professor_carteira_mensal_detalhe (
  id             uuid primary key default gen_random_uuid(),
  competencia    date not null,
  unidade_id     uuid not null references public.unidades(id),
  professor_id   integer not null references public.professores(id),
  aluno_id       integer references public.alunos(id),
  pessoa_chave   text not null,
  curso_id       integer references public.cursos(id),
  fonte          text not null default 'sync_matriculas_emusys_fechamento_automatico',
  capturado_em   timestamptz not null default now(),
  unique (competencia, unidade_id, professor_id, pessoa_chave, curso_id)
);

create index if not exists ix_carteira_detalhe_professor
  on public.professor_carteira_mensal_detalhe (professor_id, unidade_id, competencia);

create index if not exists ix_carteira_detalhe_competencia
  on public.professor_carteira_mensal_detalhe (competencia);

alter table public.professor_carteira_mensal_detalhe enable row level security;

-- Mesmo padrão de professor_carteira_mensal_canonica: RLS ligado, sem
-- policy nenhuma (trancada) e sem grant a authenticated/anon. Leitura só
-- via RPC SECURITY DEFINER (a ser criada quando o frontend for ligado).
revoke all on public.professor_carteira_mensal_detalhe from public, anon, authenticated;

-- ============================================================
-- 2. Estende capturar_carteira_professores_mensal para gravar
--    também o detalhe por aluno (não só o agregado)
-- ============================================================
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

-- ============================================================
-- 3. Sincroniza o fechamento geral com a captura da carteira do
--    professor: mesma execução, mesmo instante de leitura do banco.
-- ============================================================
create or replace function public.fechar_competencia_mensal_automatico()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo_dia date;
  v_ano integer;
  v_mes integer;
  v_ja_existe integer;
  v_snapshot jsonb;
  v_compat jsonb;
begin
  v_ultimo_dia := (date_trunc('month', v_hoje_brt) + interval '1 month - 1 day')::date;

  if v_hoje_brt <> v_ultimo_dia then
    return jsonb_build_object(
      'ok', true,
      'ignorado', true,
      'motivo', 'execucao permitida apenas no ultimo dia do mes (BRT)',
      'hoje_brt', v_hoje_brt,
      'ultimo_dia_brt', v_ultimo_dia
    );
  end if;

  v_ano := extract(year from v_hoje_brt)::integer;
  v_mes := extract(month from v_hoje_brt)::integer;

  select count(*) into v_ja_existe
  from public.fechamento_mensal_snapshots s
  where s.ano = v_ano
    and s.mes = v_mes
    and s.status in ('aprovado', 'fechado');

  if v_ja_existe > 0 then
    return jsonb_build_object(
      'ok', true,
      'ja_fechado', true,
      'ano', v_ano,
      'mes', v_mes,
      'linhas_existentes', v_ja_existe
    );
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_snapshot := public.gravar_snapshot_fechamento_mensal(
    v_ano,
    v_mes,
    null,
    format('fechamento automatico %s/%s - cron ultimo dia 22h BRT', v_mes, v_ano),
    true
  );

  v_compat := public.atualizar_dados_mensais_por_snapshot(v_ano, v_mes, null, false);

  -- Carteira do professor (agregado + detalhe): capturada na MESMA
  -- execucao do fechamento geral, para nunca divergir por timing.
  -- Envolvida em bloco protegido: falha aqui vira aviso, nao derruba
  -- o fechamento de Comercial/Alunos/Gerencial ja concluido acima.
  begin
    perform public.capturar_carteira_professores_mensal(make_date(v_ano, v_mes, 1));
  exception when others then
    raise warning 'Falha ao capturar carteira de professores em %/%: %', v_mes, v_ano, sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'ano', v_ano,
    'mes', v_mes,
    'executado_em_brt', now() at time zone 'America/Sao_Paulo',
    'snapshots_gravados', v_snapshot->'snapshot_count',
    'dados_mensais_linhas', v_compat->'linhas_atualizadas'
  );
end;
$function$;

-- ============================================================
-- 4. Desativa o cron separado (00h30) — a captura agora acontece
--    dentro do fechamento geral (22h), evitando divergência.
-- ============================================================
select cron.unschedule('snapshot-carteira-professores-mensal');
