begin;

-- O novo dominio de ciclo compartilha a infraestrutura de fechamento sem
-- colidir com as fotografias mensais existentes. A troca da constraint e feita
-- mantendo uma constraint valida durante toda a operacao.
alter table public.fechamento_mensal_snapshots
  drop constraint if exists fechamento_mensal_snapshots_dominio_check_v4;

alter table public.fechamento_mensal_snapshots
  add constraint fechamento_mensal_snapshots_dominio_check_v4 check (
    dominio = any (array[
      'alunos_admin',
      'alunos_executivo',
      'comercial',
      'retencao',
      'renovacoes',
      'professores',
      'relatorio_admin',
      'relatorio_admin_mensal',
      'relatorio_comercial_mensal',
      'relatorio_gerencial',
      'relatorio_coordenacao',
      'relatorio_coordenacao_ciclo',
      'metas',
      'programa_matriculador',
      'programa_fideliza',
      'compatibilidade_dados_mensais'
    ]::text[])
  ) not valid;

alter table public.fechamento_mensal_snapshots
  validate constraint fechamento_mensal_snapshots_dominio_check_v4;

alter table public.fechamento_mensal_snapshots
  drop constraint if exists fechamento_mensal_snapshots_dominio_check;

alter table public.fechamento_mensal_snapshots
  rename constraint fechamento_mensal_snapshots_dominio_check_v4
  to fechamento_mensal_snapshots_dominio_check;

create index if not exists idx_fechamento_coordenacao_v4_lookup
  on public.fechamento_mensal_snapshots (
    ano,
    mes,
    dominio,
    escopo,
    coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    versao desc
  )
  where dominio in ('relatorio_coordenacao', 'relatorio_coordenacao_ciclo')
    and status in ('preview', 'aprovado', 'fechado', 'retificado')
    and payload @> '{"schema_version": 4}'::jsonb;

-- Primeira versao do produtor em sombra. A migration seguinte substitui os
-- blocos de origem, mas esta fundacao ja retira toda recomposicao do clique.
create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
  v_auditoria jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  v_base := public.get_relatorio_coordenacao_canonico_v3(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );

  if v_base is null
     or jsonb_typeof(v_base -> 'professores') <> 'array'
     or jsonb_typeof(v_base -> 'periodo') <> 'object' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  -- gerado_em era now() no V3 e faria uma recaptura identica criar uma versao.
  -- A data de gravacao pertence ao envelope documento, nao ao conteudo factual.
  v_auditoria := coalesce(v_base -> 'auditoria', '{}'::jsonb) - 'gerado_em';

  return jsonb_set(
    jsonb_set(
      (v_base - 'documento') || jsonb_build_object('auditoria', v_auditoria),
      '{schema_version}',
      '4'::jsonb,
      true
    ),
    '{periodo,periodicidade}',
    to_jsonb(p_periodicidade),
    true
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text)
  to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(uuid, integer, integer, text) is
  'Produtor privado do conteudo factual V4. Executado somente durante materializacao, nunca no clique do usuario.';

create or replace function public.materializar_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_status text default 'preview',
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dominio text;
  v_escopo text;
  v_chave text;
  v_conteudo jsonb;
  v_hash text;
  v_anterior public.fechamento_mensal_snapshots%rowtype;
  v_id uuid := gen_random_uuid();
  v_versao integer;
  v_agora timestamptz := now();
  v_payload jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  if p_status not in ('preview', 'aprovado', 'fechado', 'retificado') then
    raise exception 'RELATORIO_COORDENACAO_V4_STATUS_INVALIDO'
      using errcode = '22023';
  end if;

  v_dominio := case
    when p_periodicidade = 'ciclo' then 'relatorio_coordenacao_ciclo'
    else 'relatorio_coordenacao'
  end;
  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;
  v_chave := concat_ws(
    ':',
    'relatorio-coordenacao-v4',
    p_ano,
    p_mes,
    p_periodicidade,
    v_escopo,
    coalesce(p_unidade_id::text, 'consolidado')
  );

  perform pg_advisory_xact_lock(hashtextextended(v_chave, 0));

  v_conteudo := public.montar_relatorio_coordenacao_conteudo_v4(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  ) - 'documento';
  v_hash := public.hash_jsonb_canonico(v_conteudo);

  select s.*
    into v_anterior
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.dominio = v_dominio
  order by s.versao desc
  limit 1;

  if v_anterior.id is not null
     and v_anterior.payload ->> 'schema_version' = '4'
     and v_anterior.payload_hash = v_hash
     and v_anterior.status = p_status then
    return jsonb_build_object(
      'ok', true,
      'criado', false,
      'id', v_anterior.id,
      'versao', v_anterior.versao,
      'hash', v_anterior.payload_hash,
      'dominio', v_dominio,
      'escopo', v_escopo
    );
  end if;

  v_versao := coalesce(v_anterior.versao, 0) + 1;
  v_payload := v_conteudo || jsonb_build_object(
    'documento',
    jsonb_strip_nulls(jsonb_build_object(
      'id', v_id,
      'versao', v_versao,
      'hash', v_hash,
      'status', p_status,
      'gerado_em', v_agora,
      'supersede_id', v_anterior.id
    ))
  );

  insert into public.fechamento_mensal_snapshots (
    id,
    ano,
    mes,
    escopo,
    unidade_id,
    dominio,
    versao,
    status,
    fonte,
    payload,
    payload_hash,
    observacao,
    capturado_em,
    capturado_por,
    aprovado_em,
    aprovado_por,
    fechado_em,
    fechado_por
  ) values (
    v_id,
    p_ano,
    p_mes,
    v_escopo,
    p_unidade_id,
    v_dominio,
    v_versao,
    p_status,
    'montar_relatorio_coordenacao_conteudo_v4',
    v_payload,
    v_hash,
    nullif(btrim(p_observacao), ''),
    v_agora,
    auth.uid(),
    case when p_status in ('aprovado', 'fechado', 'retificado') then v_agora end,
    case when p_status in ('aprovado', 'fechado', 'retificado') then auth.uid() end,
    case when p_status in ('fechado', 'retificado') then v_agora end,
    case when p_status in ('fechado', 'retificado') then auth.uid() end
  );

  return jsonb_build_object(
    'ok', true,
    'criado', true,
    'id', v_id,
    'versao', v_versao,
    'hash', v_hash,
    'dominio', v_dominio,
    'escopo', v_escopo,
    'supersede_id', v_anterior.id
  );
end;
$function$;

revoke all on function public.materializar_relatorio_coordenacao_documento_v4(uuid, integer, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.materializar_relatorio_coordenacao_documento_v4(uuid, integer, integer, text, text, text)
  to service_role;

comment on function public.materializar_relatorio_coordenacao_documento_v4(uuid, integer, integer, text, text, text) is
  'Insere versoes V4 append-only sob advisory lock; conteudo identico e mesmo status sao idempotentes.';

create or replace function public.get_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dominio text;
  v_escopo text;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  v_dominio := case
    when p_periodicidade = 'ciclo' then 'relatorio_coordenacao_ciclo'
    else 'relatorio_coordenacao'
  end;
  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;

  select s.*
    into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.dominio = v_dominio
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
    and s.payload @> '{"schema_version": 4}'::jsonb
  order by s.versao desc
  limit 1;

  if v_snapshot.id is null then
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_INDISPONIVEL'
      using errcode = 'P0002';
  end if;

  if v_snapshot.payload_hash is distinct from
     public.hash_jsonb_canonico(v_snapshot.payload - 'documento') then
    raise exception 'RELATORIO_COORDENACAO_V4_HASH_INVALIDO'
      using errcode = '22000';
  end if;

  return v_snapshot.payload;
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_documento_v4(uuid, integer, integer, text)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_documento_v4(uuid, integer, integer, text)
  to authenticated, service_role;

comment on function public.get_relatorio_coordenacao_documento_v4(uuid, integer, integer, text) is
  'Leitor rapido do documento V4 materializado. Nao consulta fontes operacionais nem recompõe indicadores.';

commit;
