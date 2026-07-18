-- Gate 5: peso, meta, valor real e nota sao grandezas independentes.
-- A configuracao V1 permanece rascunho ate conversao e permanencia serem aprovadas.

do $$
declare
  v_config_id uuid;
begin
  select c.id
    into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.versao = 1
    and c.status = 'rascunho'
  for update;

  if v_config_id is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao 1 rascunho nao encontrada';
  end if;

  update public.health_score_professor_v3_config_metricas m
  set meta = case m.metrica
      when 'media_turma' then 1.44
      when 'numero_alunos' then 33
      when 'conversao' then null
      when 'permanencia' then null
      when 'retencao' then null
      when 'presenca' then null
    end,
    parametros = (
      m.parametros
      - 'normalizacao'
      - 'meta_status'
      - 'meta_justificativa'
      - 'meta_autoridade'
      - 'meta_aprovada_em'
    ) || jsonb_build_object(
      'normalizacao', 'meta_versionada',
      'meta_status', case m.metrica
        when 'media_turma' then 'aprovada'
        when 'numero_alunos' then 'aprovada'
        when 'conversao' then 'em_calibracao'
        when 'permanencia' then 'em_calibracao'
        when 'retencao' then 'aguardando_dados_reais'
        when 'presenca' then 'bloqueada_ate_inicio'
      end,
      'meta_justificativa', case m.metrica
        when 'media_turma' then 'P75 professor-unidade validado em 2026-07-17'
        when 'numero_alunos' then 'P75 de alunos_fechamento validado em 2026-07-17'
        when 'conversao' then 'Q3 2026 parcial; meta depende de coorte trimestral suficiente'
        when 'permanencia' then 'P75 professor-unidade reproduzido; aguarda aprovacao do Alf'
        when 'retencao' then 'motivos de saida ainda sem confirmacoes humanas suficientes'
        when 'presenca' then 'pontuacao inicia em 2026-08-03'
      end,
      'meta_autoridade', case
        when m.metrica in ('media_turma', 'numero_alunos') then 'Alf'
        else null
      end,
      'meta_aprovada_em', case
        when m.metrica in ('media_turma', 'numero_alunos') then '2026-07-17'
        else null
      end
    ),
    atualizado_em = now()
  where m.config_id = v_config_id;
end;
$$;

create or replace function public.ativar_health_score_professor_v3_config(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_usuario_id integer;
  v_metricas integer;
  v_peso_total numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('health_score_professor_v3_config', 0));
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select *
    into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao inexistente';
  end if;
  if v_config.status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;
  if v_config.faixa_atencao_min >= v_config.faixa_saudavel_min then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: faixas incoerentes';
  end if;

  select count(distinct metrica), sum(peso)
    into v_metricas, v_peso_total
  from public.health_score_professor_v3_config_metricas
  where config_id = p_config_id;

  if v_metricas <> 6 or v_peso_total <> 100 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares e soma de pesos 100';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and coalesce(m.parametros->>'normalizacao', '') <> 'meta_versionada'
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: todos os pilares exigem meta versionada';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and (
        (
          m.meta is null
          and coalesce(m.parametros->>'meta_status', '') = 'aprovada'
        )
        or (
          m.meta is not null
          and coalesce(m.parametros->>'meta_status', '') <> 'aprovada'
        )
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: meta e meta_status incoerentes';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in (
        'media_turma',
        'numero_alunos',
        'conversao',
        'permanencia'
      )
      and (
        m.meta is null
        or m.parametros->>'meta_status' <> 'aprovada'
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: quatro metas calibraveis ainda nao homologadas';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('retencao', 'presenca')
      and m.meta is null
      and coalesce(m.parametros->>'meta_status', '') not in (
        'em_calibracao',
        'aguardando_dados_reais',
        'bloqueada_ate_inicio'
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: pilar pendente sem estado explicito';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_versoes c
    where c.id <> p_config_id
      and c.status = 'ativa'
      and daterange(
        c.vigencia_inicio,
        coalesce(c.vigencia_fim + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        v_config.vigencia_inicio,
        coalesce(v_config.vigencia_fim + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia sobrepoe configuracao ativa';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.config_id = p_config_id
      and s.estado = 'fechado'
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao ja usada por snapshot fechado';
  end if;

  update public.health_score_professor_v3_config_versoes
  set status = 'ativa',
      justificativa = btrim(p_justificativa),
      ativado_por = v_usuario_id,
      ativado_em = now(),
      atualizado_em = now()
  where id = p_config_id;

  return jsonb_build_object(
    'config_id', p_config_id,
    'versao', v_config.versao,
    'status', 'ativa',
    'vigencia_inicio', v_config.vigencia_inicio,
    'vigencia_fim', v_config.vigencia_fim
  );
end;
$$;

revoke all on function public.ativar_health_score_professor_v3_config(uuid, text)
  from public, anon, authenticated;
grant execute on function public.ativar_health_score_professor_v3_config(uuid, text)
  to authenticated, service_role;

comment on function public.ativar_health_score_professor_v3_config(uuid, text) is
  'Gate 5: ativa somente configuracao com quatro metas homologadas e pendencias explicitas.';
