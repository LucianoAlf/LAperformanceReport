-- Gate 10 - verificacao SELECT-only da configuracao segmentada V3.
-- Competencia auditada: julho/2026.
-- Rascunho auditado: versao 3. Este script nao ativa configuracao.

-- 1. Estado governado da configuracao e da simulacao.
select public.get_health_score_professor_v3_config_ui(
  '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid
) as config_rascunho;

select
  id,
  config_id,
  competencia_referencia,
  publica,
  resultado,
  created_at
from public.health_score_professor_v3_config_simulacoes
where id = '49ff6bee-1af7-45c0-b908-516a85df9890'::uuid;

-- 2. Comparacao dos valores brutos por professor/unidade.
with unidades_alvo as (
  select id as unidade_id, nome
  from public.unidades
  where upper(nome) in ('BARRA', 'RECREIO', 'CAMPO GRANDE')
), segmentado as (
  select
    u.nome as unidade,
    d.professor_id,
    max(d.pessoas_unicas_total) as pessoas_unicas_total,
    sum(d.vinculos_ativos) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as vinculos_ativos,
    sum(d.ocupacoes_unicas) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as ocupacoes_unicas,
    sum(d.turmas_elegiveis) filter (
      where not d.linha_diagnostico and d.curso_id is not null
    )::integer as turmas_elegiveis
  from unidades_alvo u
  cross join lateral
    public.get_health_score_professor_v3_metricas_segmentadas_v1(
      date '2026-07-01',
      '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
      u.unidade_id,
      'mensal'
    ) d
  where d.metrica = 'media_turma'
  group by u.nome, d.professor_id
), canonico as (
  select
    u.nome as unidade,
    c.professor_id,
    c.carteira_alunos::numeric as carteira_alunos,
    c.media_alunos_turma::numeric as media_alunos_turma
  from unidades_alvo u
  cross join lateral public.get_carteira_professor_periodo_canonica(
    2026,
    7,
    u.unidade_id,
    date '2026-07-01',
    date '2026-07-20'
  ) c
), comparacao as (
  select
    coalesce(s.unidade, c.unidade) as unidade,
    coalesce(s.professor_id, c.professor_id) as professor_id,
    s.pessoas_unicas_total,
    c.carteira_alunos,
    s.vinculos_ativos,
    s.ocupacoes_unicas,
    s.turmas_elegiveis,
    case
      when s.turmas_elegiveis > 0 then round(
        s.ocupacoes_unicas::numeric / s.turmas_elegiveis,
        2
      )
    end as media_segmentada,
    c.media_alunos_turma
  from segmentado s
  full join canonico c
    on c.unidade = s.unidade
   and c.professor_id = s.professor_id
)
select
  count(*) as professor_unidade_comparados,
  count(*) filter (
    where pessoas_unicas_total is distinct from carteira_alunos
  ) as divergencias_total_pessoas,
  count(*) filter (
    where coalesce(media_segmentada, 0)
      is distinct from coalesce(media_alunos_turma, 0)
  ) as divergencias_media_bruta,
  max(abs(coalesce(pessoas_unicas_total, 0) - coalesce(carteira_alunos, 0)))
    as delta_maximo_pessoas,
  max(abs(coalesce(media_segmentada, 0) - coalesce(media_alunos_turma, 0)))
    as delta_maximo_media
from comparacao;

-- 3. Separacao conceitual auditavel: pessoa, vinculo e ocupacao.
select
  u.nome as unidade,
  d.professor_id,
  max(d.professor_nome) as professor_nome,
  max(d.pessoas_unicas_total) as pessoas_unicas_total,
  sum(d.vinculos_ativos) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as vinculos_ativos,
  sum(d.ocupacoes_unicas) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as ocupacoes_unicas,
  sum(d.turmas_elegiveis) filter (
    where not d.linha_diagnostico and d.curso_id is not null
  ) as turmas_elegiveis
from public.unidades u
cross join lateral
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date '2026-07-01',
    '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
    u.id,
    'mensal'
  ) d
where upper(u.nome) in ('BARRA', 'RECREIO', 'CAMPO GRANDE')
  and d.metrica = 'numero_alunos'
group by u.nome, d.professor_id
order by u.nome, professor_nome;

-- 4. Bloqueios da matriz ainda nao homologada.
with detalhe as (
  select d.*
  from public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date '2026-07-01',
    '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
    null,
    'mensal'
  ) d
)
select jsonb_build_object(
  'regra_ausente', count(*) filter (
    where estado_base = 'regra_ausente'
  ),
  'atribuicoes_pontuaveis_sem_meta', count(distinct atribuicao_id) filter (
    where atribuicao_pontuavel and config_meta_segmento_id is null
  ),
  'segmentacao_incompleta', count(*) filter (
    where estado_base = 'segmentacao_incompleta'
  ),
  'nao_ofertada_observada', count(*) filter (
    where estado_base = 'divergencia_nao_ofertada'
  ),
  'zero_carteira', count(*) filter (
    where estado_base = 'sem_base_zero_carteira'
  ),
  'capacidade_excedida', count(*) filter (
    where capacidade_excedida
  )
) as bloqueios;

-- 5. Casos de controle da matriz. Ausencia de linha indica meta ainda nao
-- homologada; nao deve haver copia silenciosa entre unidade/modalidade.
select
  u.nome as unidade,
  c.nome as curso,
  m.modalidade,
  m.capacidade_maxima,
  m.meta_media_turma,
  m.meta_carteira_curso,
  m.estado
from public.health_score_professor_v3_config_metas_curso_modalidade m
join public.unidades u on u.id = m.unidade_id
join public.cursos c on c.id = m.curso_id
where m.config_id = '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid
  and (
    upper(c.nome) like 'BATERIA%'
    or upper(c.nome) like 'CANTO%'
  )
order by u.nome, c.nome, m.modalidade;

-- 6. ACLs de tabela. O resultado esperado e zero DML para anon/authenticated;
-- service_role le as bases e escreve somente o log privado de simulacao.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'health_score_professor_v3_config_metas_curso_modalidade',
    'professor_unidade_curso_modalidade',
    'health_score_professor_v3_snapshot_metrica_segmentos',
    'health_score_professor_v3_snapshot_metrica_diagnosticos',
    'health_score_professor_v3_config_simulacoes'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 7. EXECUTE, SECURITY DEFINER e search_path das RPCs de fronteira.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as assinatura,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as anon_executa,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_executa,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) as service_role_executa
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_health_score_professor_v3_metricas_segmentadas_v1',
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    'materializar_health_score_professor_v3_segmentos_v1',
    'criar_health_score_professor_v3_config_rascunho',
    'salvar_health_score_professor_v3_config',
    'simular_health_score_professor_v3_config',
    'ativar_health_score_professor_v3_config'
  )
order by p.proname, assinatura;

-- O guard de escrita exige a permissao funcional professores.editar para o
-- usuario autenticado. service_role e postgres sao os unicos bypasses.
select pg_get_functiondef(p.oid) as guard_professores_editar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fn_health_score_professor_v3_ator_gerenciador';

-- 8. Triggers de imutabilidade instalados.
select
  c.relname as tabela,
  t.tgname as trigger,
  pg_get_triggerdef(t.oid) as definicao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and t.tgname in (
    'trg_health_score_professor_v3_config_meta_segmentada_imutavel',
    'trg_health_score_professor_v3_snapshot_segmento_imutavel',
    'trg_health_score_v3_snapshot_segmento_config_consistente'
  )
order by c.relname, t.tgname;

-- 9. Prova transacional. Cria uma fixture isolada, demonstra os tres
-- bloqueios e desfaz absolutamente tudo no final.
begin;

do $audit$
declare
  v_config_ativa uuid := '9af37ebb-761f-4234-bb74-9136d8399e3f'::uuid;
  v_config_rascunho uuid := '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid;
  v_unidade_id uuid;
  v_curso_id integer;
  v_professor_id integer;
  v_meta_id uuid;
  v_snapshot_id uuid;
  v_snapshot_metrica_id uuid;
  v_bloqueou_config boolean := false;
  v_bloqueou_meta_referenciada boolean := false;
  v_bloqueou_segmento boolean := false;
begin
  select u.id into strict v_unidade_id
  from public.unidades u
  where upper(u.nome) = 'BARRA'
  limit 1;

  select c.id into strict v_curso_id
  from public.cursos c
  where coalesce(c.is_projeto_banda, false) = false
  order by c.id
  limit 1;

  select p.id into strict v_professor_id
  from public.professores p
  order by p.id
  limit 1;

  begin
    insert into public.health_score_professor_v3_config_metas_curso_modalidade (
      config_id,
      unidade_id,
      curso_id,
      modalidade,
      estado,
      capacidade_maxima,
      meta_media_turma,
      meta_carteira_curso
    ) values (
      v_config_ativa,
      v_unidade_id,
      v_curso_id,
      'turma',
      'configurada',
      2,
      1.5,
      10
    );
  exception
    when others then
      v_bloqueou_config := sqlerrm like '%HEALTH_SCORE_V3_CONFIG_IMUTAVEL%';
  end;

  if not v_bloqueou_config then
    raise exception 'AUDITORIA_FALHOU: configuracao ativa aceitou meta segmentada';
  end if;

  insert into public.health_score_professor_v3_config_metas_curso_modalidade (
    config_id,
    unidade_id,
    curso_id,
    modalidade,
    estado,
    capacidade_maxima,
    meta_media_turma,
    meta_carteira_curso
  ) values (
    v_config_rascunho,
    v_unidade_id,
    v_curso_id,
    'turma',
    'configurada',
    2,
    1.5,
    10
  )
  returning id into v_meta_id;

  insert into public.health_score_professor_v3_snapshots (
    professor_id,
    escopo,
    unidade_id,
    competencia,
    trimestre_inicio,
    revisao,
    estado,
    config_id,
    config_versao,
    score,
    cobertura,
    classificacao,
    publicavel,
    publicado,
    regra_versao,
    periodicidade,
    periodo_inicio,
    periodo_fim,
    estado_publicacao,
    score_exibivel,
    ranking_habilitado
  ) values (
    v_professor_id,
    'unidade',
    v_unidade_id,
    date '2099-01-01',
    date '2098-12-01',
    999999,
    'provisorio',
    v_config_rascunho,
    3,
    null,
    0,
    'sem_base',
    false,
    false,
    'auditoria-gate-11',
    'mensal',
    date '2099-01-01',
    date '2099-01-31',
    'sem_base',
    false,
    false
  ) returning id into v_snapshot_id;

  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id,
    metrica,
    estado_base,
    publicavel,
    confianca,
    fonte,
    regra_versao,
    peso,
    peso_disponivel
  ) values (
    v_snapshot_id,
    'media_turma',
    'sem_base',
    false,
    'baixa',
    'auditoria-gate-11',
    'auditoria-gate-11',
    15,
    false
  ) returning id into v_snapshot_metrica_id;

  insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
    snapshot_metrica_id,
    config_meta_segmento_id,
    unidade_id,
    curso_id,
    modalidade,
    estado_base,
    fonte,
    regra_versao
  ) values (
    v_snapshot_metrica_id,
    v_meta_id,
    v_unidade_id,
    v_curso_id,
    'turma',
    'sem_base_zero_carteira',
    'auditoria-gate-11',
    'auditoria-gate-11'
  );

  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);
  update public.health_score_professor_v3_snapshots
  set estado = 'fechado', fechado_em = now()
  where id = v_snapshot_id;
  perform set_config('app.health_score_v3_mutacao_controlada', 'off', true);

  begin
    delete from public.health_score_professor_v3_config_metas_curso_modalidade
    where id = v_meta_id;
  exception
    when others then
      v_bloqueou_meta_referenciada :=
        sqlerrm like '%HEALTH_SCORE_V3_CONFIG_IMUTAVEL%';
  end;

  begin
    update public.health_score_professor_v3_snapshot_metrica_segmentos
    set pessoas_unicas = 1
    where snapshot_metrica_id = v_snapshot_metrica_id;
  exception
    when others then
      v_bloqueou_segmento :=
        sqlerrm like '%HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL%';
  end;

  if not v_bloqueou_meta_referenciada or not v_bloqueou_segmento then
    raise exception 'AUDITORIA_FALHOU: imutabilidade de snapshot/config nao preservada';
  end if;

  raise notice 'Gate 11: config ativa, meta referenciada e snapshot fechado bloqueados';
end;
$audit$;

rollback;

-- 10. Indices das tabelas novas. Todos devem estar validos.
select
  t.relname as tabela,
  ic.relname as indice,
  i.indisunique as unico,
  i.indisprimary as primario,
  i.indisvalid as valido
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index i on i.indrelid = t.oid
join pg_class ic on ic.oid = i.indexrelid
where n.nspname = 'public'
  and t.relname in (
    'health_score_professor_v3_config_metas_curso_modalidade',
    'professor_unidade_curso_modalidade',
    'health_score_professor_v3_snapshot_metrica_segmentos',
    'health_score_professor_v3_snapshot_metrica_diagnosticos',
    'health_score_professor_v3_config_simulacoes'
  )
order by t.relname, ic.relname;

-- 11. Desempenho das leituras segmentadas: unidade e consolidado.
explain (analyze, buffers, format text)
select *
from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date '2026-07-01',
  '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
  '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid,
  'mensal'
);

explain (analyze, buffers, format text)
select *
from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  date '2026-07-01',
  '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
  null,
  'mensal'
);

-- A simulacao grava somente um log privado; o ROLLBACK remove a medicao.
begin;

explain (analyze, buffers, format text)
select public.simular_health_score_professor_v3_config(
  '0e6a01ab-073a-46f0-9148-5412e795d9da'::uuid,
  date '2026-07-01'
);

rollback;
