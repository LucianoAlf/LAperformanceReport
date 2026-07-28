begin;

alter table public.health_score_professor_v3_config_versoes
  add column if not exists chave_criacao_governada text;

create unique index if not exists
  health_score_v3_config_chave_criacao_governada_uidx
on public.health_score_professor_v3_config_versoes (
  chave_criacao_governada
)
where chave_criacao_governada is not null;

create table if not exists public.health_score_professor_v3_config_substituicoes (
  id uuid primary key default gen_random_uuid(),
  config_anterior_id uuid not null
    references public.health_score_professor_v3_config_versoes(id)
    on delete restrict,
  config_nova_id uuid not null unique
    references public.health_score_professor_v3_config_versoes(id)
    on delete restrict,
  vigencia_inicio date not null,
  vigencia_fim date not null,
  justificativa text not null
    check (nullif(btrim(justificativa), '') is not null),
  substituido_por integer references public.usuarios(id),
  substituido_em timestamptz not null default now(),
  constraint health_score_v3_config_substituicao_distinta_chk
    check (config_anterior_id <> config_nova_id),
  constraint health_score_v3_config_substituicao_vigencia_chk
    check (vigencia_fim >= vigencia_inicio)
);

alter table public.health_score_professor_v3_config_substituicoes
  enable row level security;

revoke all on table
  public.health_score_professor_v3_config_substituicoes
  from public, anon, authenticated, service_role;
grant select on table
  public.health_score_professor_v3_config_substituicoes
  to service_role;

do $validar_exclusao_temporal$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t
      on t.oid = c.conrelid
    join pg_namespace n
      on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'health_score_professor_v3_config_versoes'
      and c.conname = 'health_score_professor_v3_config_vigencia_ativa_excl'
      and c.contype = 'x'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_VIGENCIA_CONFLITANTE: constraint de exclusao ativa ausente';
  end if;
end;
$validar_exclusao_temporal$;

create or replace function public.fn_health_score_v3_bloquear_config_substituicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  raise exception
    'HEALTH_SCORE_V3_CONFIG_SUBSTITUICAO_APPEND_ONLY: update e delete proibidos';
end;
$function$;

drop trigger if exists
  trg_health_score_professor_v3_config_substituicoes_append_only
  on public.health_score_professor_v3_config_substituicoes;
create trigger trg_health_score_professor_v3_config_substituicoes_append_only
before update or delete
on public.health_score_professor_v3_config_substituicoes
for each row
execute function public.fn_health_score_v3_bloquear_config_substituicao();

create or replace function public.fn_health_score_professor_v3_bloquear_config_versao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_lifecycle boolean := coalesce(
    current_setting('app.health_score_v3_config_lifecycle', true),
    'off'
  ) = 'on';
  v_arquivar_id text := coalesce(
    current_setting(
      'app.health_score_v3_config_ciclo_aberto_arquivar_id',
      true
    ),
    ''
  );
begin
  if tg_op = 'UPDATE'
     and v_arquivar_id = old.id::text
     and old.status = 'ativa'
     and new.status = 'arquivada'
     and old.vigencia_inicio = date '2026-06-01'
     and old.vigencia_fim = date '2026-08-31'
     and row(
       new.id,
       new.versao,
       new.vigencia_inicio,
       new.vigencia_fim,
       new.cobertura_minima,
       new.faixa_atencao_min,
       new.faixa_saudavel_min,
       new.exige_pilar_fidelizacao,
       new.justificativa,
       new.chave_criacao_governada,
       new.criado_por,
       new.ativado_por,
       new.criado_em,
       new.ativado_em
     ) is not distinct from row(
       old.id,
       old.versao,
       old.vigencia_inicio,
       old.vigencia_fim,
       old.cobertura_minima,
       old.faixa_atencao_min,
       old.faixa_saudavel_min,
       old.exige_pilar_fidelizacao,
       old.justificativa,
       old.chave_criacao_governada,
       old.criado_por,
       old.ativado_por,
       old.criado_em,
       old.ativado_em
     ) then
    new.atualizado_em := now();
    return new;
  end if;

  if v_lifecycle
     and tg_op = 'UPDATE'
     and old.status = 'ativa'
     and new.status = 'ativa'
     and new.vigencia_inicio = old.vigencia_inicio
     and new.vigencia_fim is not null
     and new.vigencia_fim >= old.vigencia_inicio
     and row(
       new.id,
       new.versao,
       new.cobertura_minima,
       new.faixa_atencao_min,
       new.faixa_saudavel_min,
       new.exige_pilar_fidelizacao,
       new.justificativa,
       new.chave_criacao_governada,
       new.criado_por,
       new.ativado_por,
       new.criado_em,
       new.ativado_em
     ) is not distinct from row(
       old.id,
       old.versao,
       old.cobertura_minima,
       old.faixa_atencao_min,
       old.faixa_saudavel_min,
       old.exige_pilar_fidelizacao,
       old.justificativa,
       old.chave_criacao_governada,
       old.criado_por,
       old.ativado_por,
       old.criado_em,
       old.ativado_em
     ) then
    new.atualizado_em := now();
    return new;
  end if;

  if old.status <> 'rascunho'
     or exists (
       select 1
       from public.health_score_professor_v3_snapshots s
       where s.config_id = old.id
         and s.estado in ('fechado', 'invalidado')
     ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: versao ativa ou usada por snapshot fechado';
  end if;

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    return new;
  end if;
  return old;
end;
$function$;

create or replace function public.fn_health_score_professor_v3_config_fingerprint(
  p_config_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select md5(jsonb_build_object(
    'config_id', c.id,
    'versao', c.versao,
    'vigencia_inicio', c.vigencia_inicio,
    'vigencia_fim', c.vigencia_fim,
    'cobertura_minima', c.cobertura_minima,
    'faixa_atencao_min', c.faixa_atencao_min,
    'faixa_saudavel_min', c.faixa_saudavel_min,
    'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao,
    'justificativa', c.justificativa,
    'metricas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'peso', m.peso,
          'meta', m.meta,
          'amostra_minima', m.amostra_minima,
          'cobertura_minima', m.cobertura_minima,
          'parametros', m.parametros
        )
        order by case m.metrica
          when 'retencao' then 1
          when 'permanencia' then 2
          when 'conversao' then 3
          when 'media_turma' then 4
          when 'numero_alunos' then 5
          when 'presenca' then 6
        end
      )
      from public.health_score_professor_v3_config_metricas m
      where m.config_id = c.id
    ), '[]'::jsonb),
    'metas_segmentadas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unidade_id', s.unidade_id,
          'curso_id', s.curso_id,
          'modalidade', s.modalidade,
          'estado', s.estado,
          'capacidade_maxima', s.capacidade_maxima,
          'meta_media_turma', s.meta_media_turma,
          'meta_carteira_curso', s.meta_carteira_curso,
          'parametros', s.parametros
        )
        order by
          s.unidade_id::text,
          s.curso_id,
          s.modalidade,
          s.estado,
          s.capacidade_maxima,
          s.meta_media_turma,
          s.meta_carteira_curso
      )
      from public.health_score_professor_v3_config_metas_curso_modalidade s
      where s.config_id = c.id
    ), '[]'::jsonb)
  )::text)
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$function$;

create or replace function public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
  p_config_origem_id uuid,
  p_vigencia_inicio date,
  p_vigencia_fim date,
  p_justificativa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_origem public.health_score_professor_v3_config_versoes%rowtype;
  v_existente public.health_score_professor_v3_config_versoes%rowtype;
  v_novo_id uuid;
  v_versao integer;
  v_chave_criacao text;
  v_justificativa text;
  v_total_metricas integer;
  v_metricas_distintas integer;
  v_peso_total numeric;
  v_metricas_clonadas integer;
  v_metas_pedagogicas integer;
  v_metas_clonadas integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if p_config_origem_id is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao de origem explicita obrigatoria';
  end if;
  if p_vigencia_inicio is distinct from date '2026-06-01'
     or p_vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: revisao deve cobrir exatamente 2026-06-01 a 2026-08-31';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  v_justificativa := btrim(p_justificativa);
  v_chave_criacao := md5(jsonb_build_object(
    'operacao', 'revisao_ciclo_aberto_v1',
    'config_origem_id', p_config_origem_id,
    'vigencia_inicio', p_vigencia_inicio,
    'vigencia_fim', p_vigencia_fim,
    'justificativa', v_justificativa,
    'ator', v_ator
  )::text);

  select c.* into v_existente
  from public.health_score_professor_v3_config_versoes c
  where c.chave_criacao_governada = v_chave_criacao
  for share;

  if found then
    if v_existente.status not in ('rascunho', 'ativa')
       or v_existente.vigencia_inicio is distinct from p_vigencia_inicio
       or v_existente.vigencia_fim is distinct from p_vigencia_fim
       or v_existente.justificativa is distinct from v_justificativa
       or v_existente.criado_por is distinct from v_ator then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de criacao encontrou estado incoerente';
    end if;

    select count(*)
      into v_metas_clonadas
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = v_existente.id;

    return public.fn_health_score_professor_v3_config_json(v_existente.id)
      || jsonb_build_object(
        'config_origem_id', p_config_origem_id,
        'matriz_pedagogica_clonada', v_metas_clonadas,
        'ja_existente', true
      );
  end if;

  select c.* into v_origem
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_origem_id
  for share;

  if not found or v_origem.status <> 'ativa' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem explicita deve estar ativa';
  end if;
  if v_origem.vigencia_inicio is distinct from date '2026-06-01'
     or v_origem.vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem deve cobrir exatamente Jun-Ago';
  end if;

  select count(*), count(distinct m.metrica), sum(m.peso)
    into v_total_metricas, v_metricas_distintas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_origem_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );

  if v_total_metricas <> 6
     or v_metricas_distintas <> 6
     or v_peso_total <> 100
     or exists (
       select 1
       from public.health_score_professor_v3_config_metricas m
       where m.config_id = p_config_origem_id
         and m.metrica not in (
           'conversao',
           'media_turma',
           'numero_alunos',
           'permanencia',
           'presenca',
           'retencao'
         )
     ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: origem exige seis metricas canonicas e peso total 100';
  end if;

  select coalesce(max(c.versao), 0) + 1
    into v_versao
  from public.health_score_professor_v3_config_versoes c;

  insert into public.health_score_professor_v3_config_versoes (
    versao,
    status,
    vigencia_inicio,
    vigencia_fim,
    cobertura_minima,
    faixa_atencao_min,
    faixa_saudavel_min,
    exige_pilar_fidelizacao,
    justificativa,
    chave_criacao_governada,
    criado_por
  ) values (
    v_versao,
    'rascunho',
    date '2026-06-01',
    date '2026-08-31',
    v_origem.cobertura_minima,
    v_origem.faixa_atencao_min,
    v_origem.faixa_saudavel_min,
    v_origem.exige_pilar_fidelizacao,
    v_justificativa,
    v_chave_criacao,
    v_ator
  )
  returning id into v_novo_id;

  insert into public.health_score_professor_v3_config_metricas (
    config_id,
    metrica,
    peso,
    meta,
    amostra_minima,
    cobertura_minima,
    parametros
  )
  select
    v_novo_id,
    m.metrica,
    m.peso,
    m.meta,
    m.amostra_minima,
    m.cobertura_minima,
    m.parametros
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_origem_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );
  get diagnostics v_metricas_clonadas = row_count;

  if v_metricas_clonadas <> 6 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: clone das seis metricas ficou incompleto';
  end if;

  select count(*)
    into v_metas_pedagogicas
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  join public.cursos curso
    on curso.id = m.curso_id
   and curso.natureza_operacional = 'pedagogica'
  where m.config_id = p_config_origem_id;

  insert into public.health_score_professor_v3_config_metas_curso_modalidade (
    config_id,
    unidade_id,
    curso_id,
    modalidade,
    estado,
    capacidade_maxima,
    meta_media_turma,
    meta_carteira_curso,
    parametros
  )
  select
    v_novo_id,
    m.unidade_id,
    m.curso_id,
    m.modalidade,
    m.estado,
    m.capacidade_maxima,
    m.meta_media_turma,
    m.meta_carteira_curso,
    m.parametros
  from public.health_score_professor_v3_config_metas_curso_modalidade m
  join public.cursos curso
    on curso.id = m.curso_id
   and curso.natureza_operacional = 'pedagogica'
  where m.config_id = p_config_origem_id;
  get diagnostics v_metas_clonadas = row_count;

  if v_metas_clonadas <> v_metas_pedagogicas then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: clone da matriz pedagogica ficou incompleto';
  end if;

  return public.fn_health_score_professor_v3_config_json(v_novo_id)
    || jsonb_build_object(
      'config_origem_id', p_config_origem_id,
      'matriz_pedagogica_clonada', v_metas_clonadas,
      'ja_existente', false
    );
end;
$function$;

create or replace function public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_config_conflitante public.health_score_professor_v3_config_versoes%rowtype;
  v_config_futura public.health_score_professor_v3_config_versoes%rowtype;
  v_substituicao public.health_score_professor_v3_config_substituicoes%rowtype;
  v_total_metricas integer;
  v_metricas_distintas integer;
  v_peso_total numeric;
  v_segmentos_faltantes jsonb;
  v_fingerprint text;
  v_resultado_simulacao jsonb;
  v_competencia_simulacao date;
  v_arquivadas integer;
  v_selecao_jul uuid;
  v_selecao_set uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao inexistente';
  end if;

  if v_config.status = 'ativa' then
    if v_config.chave_criacao_governada is null
       or v_config.vigencia_inicio is distinct from date '2026-06-01'
       or v_config.vigencia_fim is distinct from date '2026-08-31'
       or v_config.ativado_por is null
       or v_config.ativado_em is null then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou configuracao incoerente';
    end if;
    if v_config.justificativa is distinct from btrim(p_justificativa) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao exige a mesma justificativa';
    end if;

    select s.* into v_substituicao
    from public.health_score_professor_v3_config_substituicoes s
    where s.config_nova_id = p_config_id
    for share;

    if not found then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao sem substituicao';
    end if;
    if v_substituicao.justificativa is distinct from btrim(p_justificativa) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao exige a mesma justificativa';
    end if;
    if v_substituicao.vigencia_inicio is distinct from date '2026-06-01'
       or v_substituicao.vigencia_fim is distinct from date '2026-08-31'
       or v_substituicao.substituido_por is distinct from v_config.ativado_por
       or not exists (
         select 1
         from public.health_score_professor_v3_config_versoes anterior
         where anterior.id = v_substituicao.config_anterior_id
           and anterior.status = 'arquivada'
           and anterior.vigencia_inicio = date '2026-06-01'
           and anterior.vigencia_fim = date '2026-08-31'
       ) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou substituicao incoerente';
    end if;

    select c.* into v_config_futura
    from public.health_score_professor_v3_config_versoes c
    where c.id <> p_config_id
      and c.status = 'ativa'
      and c.vigencia_inicio = date '2026-09-01'
    order by c.versao desc, c.id
    limit 1
    for share;

    if not found then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao ativa de 2026-09-01 deve existir';
    end if;

    select c.id into v_selecao_jul
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and date '2026-07-01' >= c.vigencia_inicio
      and (
        c.vigencia_fim is null
        or date '2026-07-01' <= c.vigencia_fim
      );

    select c.id into v_selecao_set
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and date '2026-09-01' >= c.vigencia_inicio
      and (
        c.vigencia_fim is null
        or date '2026-09-01' <= c.vigencia_fim
      );

    if v_selecao_jul is distinct from p_config_id
       or v_selecao_set is distinct from v_config_futura.id then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou selecao temporal incoerente';
    end if;

    v_fingerprint :=
      public.fn_health_score_professor_v3_config_fingerprint(p_config_id);

    return public.fn_health_score_professor_v3_config_json(p_config_id)
      || jsonb_build_object(
        'config_substituida_id', v_substituicao.config_anterior_id,
        'config_futura_preservada_id', v_config_futura.id,
        'config_fingerprint', v_fingerprint,
        'ja_ativa', true
      );
  end if;

  if v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;
  if v_config.vigencia_inicio is distinct from date '2026-06-01'
     or v_config.vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: revisao deve cobrir exatamente Jun-Ago';
  end if;
  if btrim(p_justificativa) is distinct from v_config.justificativa then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: salve e simule a justificativa antes da ativacao';
  end if;

  select count(*), count(distinct m.metrica), sum(m.peso)
    into v_total_metricas, v_metricas_distintas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );

  if v_total_metricas <> 6
     or v_metricas_distintas <> 6
     or v_peso_total <> 100
     or exists (
       select 1
       from public.health_score_professor_v3_config_metricas m
       where m.config_id = p_config_id
         and m.metrica not in (
           'conversao',
           'media_turma',
           'numero_alunos',
           'permanencia',
           'presenca',
           'retencao'
         )
     ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis metricas canonicas e peso total 100';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos')
      and (
        m.meta is not null
        or m.parametros->>'normalizacao'
          is distinct from 'segmentada_unidade_curso_modalidade'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: media e carteira exigem normalizacao segmentada';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('conversao', 'permanencia')
      and (
        m.meta is null
        or m.parametros->>'meta_status' is distinct from 'aprovada'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conversao e permanencia ainda nao homologadas';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    join public.cursos c
      on c.id = m.curso_id
    where m.config_id = p_config_id
      and c.natureza_operacional = 'comercial'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: matriz da revisao contem curso comercial';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = p_config_id
      and m.estado = 'configurada'
      and m.meta_media_turma > m.capacidade_maxima
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: meta de media acima da capacidade';
  end if;

  v_segmentos_faltantes :=
    public.fn_health_score_professor_v3_segmentos_faltantes_v1(p_config_id);
  if jsonb_array_length(coalesce(v_segmentos_faltantes, '[]'::jsonb)) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INCOMPLETA: segmentos oficiais sem regra final: %',
      v_segmentos_faltantes::text;
  end if;

  if exists (
    select 1
    from public.professor_unidade_curso_modalidade a
    join public.cursos c
      on c.id = a.curso_id
     and c.natureza_operacional = 'pedagogica'
    left join public.health_score_professor_v3_config_metas_curso_modalidade m
      on m.config_id = p_config_id
     and m.unidade_id = a.unidade_id
     and m.curso_id = a.curso_id
     and m.modalidade = a.modalidade
     and m.estado = 'configurada'
    where a.status = 'ativo'
      and a.vigencia_fim is null
      and a.confianca in ('alta', 'revisada')
      and m.id is null
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: atribuicao pedagogica pontuavel sem meta segmentada';
  end if;

  v_fingerprint :=
    public.fn_health_score_professor_v3_config_fingerprint(p_config_id);

  select s.resultado, s.competencia
    into v_resultado_simulacao, v_competencia_simulacao
  from public.health_score_professor_v3_config_simulacoes s
  where s.config_id = p_config_id
    and s.config_fingerprint = v_fingerprint
    and s.competencia between date '2026-06-01' and date '2026-08-31'
    and s.criado_em > v_config.atualizado_em
    and s.criado_em >= clock_timestamp() - interval '24 hours'
    and coalesce((s.resultado->>'total')::integer, 0) > 0
  order by s.criado_em desc, s.id desc
  limit 1;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: simulacao atual obrigatoria antes da ativacao';
  end if;

  if exists (
    select 1
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia_simulacao,
      p_config_id,
      null,
      'mensal'
    ) d
    where d.metrica = 'numero_alunos'
      and (
        d.estado_base in (
          'regra_ausente',
          'divergencia_nao_ofertada',
          'segmentacao_incompleta'
        )
        or (
          d.atribuicao_pontuavel
          and d.config_meta_segmento_id is null
        )
        or d.divergencias->>'nao_ofertada_com_dados' = 'true'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: diagnosticos segmentados atuais bloqueiam a ativacao';
  end if;

  if jsonb_array_length(
    coalesce(v_resultado_simulacao->'regra_ausente', '[]'::jsonb)
  ) > 0
     or jsonb_array_length(
       coalesce(
         v_resultado_simulacao->'nao_ofertada_observada',
         '[]'::jsonb
       )
     ) > 0
     or jsonb_array_length(
       coalesce(
         v_resultado_simulacao->'atribuicoes_pontuaveis_sem_meta',
         '[]'::jsonb
       )
     ) > 0
     or jsonb_array_length(
       coalesce(
         v_resultado_simulacao->'segmentacao_incompleta',
         '[]'::jsonb
       )
     ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: excecoes atuais bloqueiam a ativacao';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.estado = 'fechado'
      and s.competencia between date '2026-06-01' and date '2026-08-31'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: snapshot fechado em Jun-Ago impede substituicao';
  end if;

  select c.* into v_config_futura
  from public.health_score_professor_v3_config_versoes c
  where c.id <> p_config_id
    and c.status = 'ativa'
    and c.vigencia_inicio = date '2026-09-01'
  order by c.versao desc, c.id
  limit 1
  for share;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao ativa de 2026-09-01 deve existir';
  end if;

  select c.* into v_config_conflitante
  from public.health_score_professor_v3_config_versoes c
  where c.id <> p_config_id
    and c.status = 'ativa'
    and c.vigencia_inicio <= date '2026-08-31'
    and (
      c.vigencia_fim is null
      or c.vigencia_fim >= date '2026-06-01'
    )
  order by c.versao desc, c.id
  limit 1
  for update;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conflito ativo Jun-Ago inexistente';
  end if;
  if v_config_conflitante.vigencia_inicio is distinct from date '2026-06-01'
     or v_config_conflitante.vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conflito ativo deve cobrir exatamente Jun-Ago';
  end if;

  perform set_config(
    'app.health_score_v3_config_ciclo_aberto_arquivar_id',
    v_config_conflitante.id::text,
    true
  );
  update public.health_score_professor_v3_config_versoes c
  set status = 'arquivada',
      atualizado_em = now()
  where c.id = v_config_conflitante.id
    and c.status = 'ativa'
    and c.vigencia_inicio = date '2026-06-01'
    and c.vigencia_fim = date '2026-08-31';
  get diagnostics v_arquivadas = row_count;
  perform set_config(
    'app.health_score_v3_config_ciclo_aberto_arquivar_id',
    '',
    true
  );

  if v_arquivadas <> 1 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: arquivamento exato Jun-Ago nao realizado';
  end if;

  insert into public.health_score_professor_v3_config_substituicoes (
    config_anterior_id,
    config_nova_id,
    vigencia_inicio,
    vigencia_fim,
    justificativa,
    substituido_por
  ) values (
    v_config_conflitante.id,
    p_config_id,
    date '2026-06-01',
    date '2026-08-31',
    btrim(p_justificativa),
    v_ator
  );

  update public.health_score_professor_v3_config_versoes
  set status = 'ativa',
      justificativa = btrim(p_justificativa),
      ativado_por = v_ator,
      ativado_em = now(),
      atualizado_em = now()
  where id = p_config_id;

  select c.id into v_selecao_jul
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date '2026-07-01' >= c.vigencia_inicio
    and (
      c.vigencia_fim is null
      or date '2026-07-01' <= c.vigencia_fim
    );

  select c.id into v_selecao_set
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date '2026-09-01' >= c.vigencia_inicio
    and (
      c.vigencia_fim is null
      or date '2026-09-01' <= c.vigencia_fim
    );

  if v_selecao_jul is distinct from p_config_id
     or v_selecao_set is distinct from v_config_futura.id then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: selecao temporal Jun-Ago/Setembro divergente';
  end if;

  return public.fn_health_score_professor_v3_config_json(p_config_id)
    || jsonb_build_object(
      'config_substituida_id', v_config_conflitante.id,
      'config_futura_preservada_id', v_config_futura.id,
      'config_fingerprint', v_fingerprint,
      'ja_ativa', false
    );
end;
$function$;

revoke all on function
  public.fn_health_score_v3_bloquear_config_substituicao()
  from public, anon, authenticated, service_role;
revoke all on function
  public.fn_health_score_professor_v3_bloquear_config_versao()
  from public, anon, authenticated, service_role;
revoke all on function
  public.fn_health_score_professor_v3_config_fingerprint(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    date,
    date,
    text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.salvar_health_score_professor_v3_config_rascunho(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  from public, anon, authenticated, service_role;

grant execute on function
  public.fn_health_score_v3_bloquear_config_substituicao()
  to service_role;
grant execute on function
  public.fn_health_score_professor_v3_bloquear_config_versao()
  to service_role;
grant execute on function
  public.fn_health_score_professor_v3_config_fingerprint(uuid)
  to service_role;
grant execute on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    date,
    date,
    text
  )
  to authenticated, service_role;
grant execute on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    text
  )
  to authenticated, service_role;
grant execute on function
  public.salvar_health_score_professor_v3_config_rascunho(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  to authenticated, service_role;

comment on table public.health_score_professor_v3_config_substituicoes is
  'Trilha append-only das substituicoes governadas de configuracao do Health Score Professor V3.';
comment on column
  public.health_score_professor_v3_config_versoes.chave_criacao_governada is
  'Chave deterministica nullable para idempotencia de criacoes governadas; configuracoes legadas permanecem sem chave.';
comment on function
  public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    date,
    date,
    text
  ) is
  'Cria revisao rascunho explicita para Jun-Ago, clonando metricas e somente a matriz pedagogica.';
comment on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
    uuid,
    text
  ) is
  'Ativa a revisao Jun-Ago simulada, arquiva apenas o conflito exato e preserva a configuracao de setembro.';

commit;
