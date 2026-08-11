-- Reconstroi os comparativos a partir dos fechamentos mensais canonicos.
-- A versao anterior do relatorio deixava o bloco fixo como
-- "fechamento_anterior_incompativel" e nao consultava a competencia anterior.
-- Esta camada consulta somente snapshots fechados, valida o hash e retorna o
-- motivo estruturado quando a comparacao nao pode ser publicada.

alter function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  rename to get_relatorio_gerencial_canonico_comparativos_base_v1;

create or replace function public.get_comparativo_fechamento_mensal_v1(
  p_unidade_id uuid,
  p_atual_ano integer,
  p_atual_mes integer,
  p_anterior_ano integer,
  p_anterior_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_atual_admin public.fechamento_mensal_snapshots%rowtype;
  v_atual_comercial public.fechamento_mensal_snapshots%rowtype;
  v_anterior_admin public.fechamento_mensal_snapshots%rowtype;
  v_anterior_comercial public.fechamento_mensal_snapshots%rowtype;
  v_atual_admin_existe boolean;
  v_atual_comercial_existe boolean;
  v_anterior_admin_existe boolean;
  v_anterior_comercial_existe boolean;
  v_atual_admin_hash_ok boolean := false;
  v_atual_comercial_hash_ok boolean := false;
  v_anterior_admin_hash_ok boolean := false;
  v_anterior_comercial_hash_ok boolean := false;
  v_status_anterior jsonb := '[]'::jsonb;
  v_status_atual jsonb := '[]'::jsonb;
  v_dominios_ausentes jsonb := '[]'::jsonb;
  v_componentes_diferentes jsonb := '[]'::jsonb;
  v_fingerprint_atual text;
  v_fingerprint_anterior text;
  v_disponibilidade text := 'indisponivel';
  v_motivo text := 'dominio_anterior_ausente';
  v_dados_atual jsonb;
  v_dados_anterior jsonb;
begin
  if p_unidade_id is null
     or p_atual_ano is null or p_atual_mes not between 1 and 12
     or p_anterior_ano is null or p_anterior_mes not between 1 and 12 then
    raise exception 'COMPARATIVO_FECHAMENTO_PARAMETROS_INVALIDOS';
  end if;

  select exists (
    select 1 from public.fechamento_mensal_snapshots s
    where s.ano = p_atual_ano and s.mes = p_atual_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio = 'relatorio_admin_mensal'
  ) into v_atual_admin_existe;
  select exists (
    select 1 from public.fechamento_mensal_snapshots s
    where s.ano = p_atual_ano and s.mes = p_atual_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio = 'relatorio_comercial_mensal'
  ) into v_atual_comercial_existe;

  select * into v_atual_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = p_atual_ano and s.mes = p_atual_mes
    and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_admin_mensal' and s.status = 'fechado'
  order by s.versao desc limit 1;

  select * into v_atual_comercial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_atual_ano and s.mes = p_atual_mes
    and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_comercial_mensal' and s.status = 'fechado'
  order by s.versao desc limit 1;

  v_atual_admin_hash_ok := v_atual_admin.id is not null
    and v_atual_admin.payload_hash is not null
    and public.hash_jsonb_canonico(v_atual_admin.payload) = v_atual_admin.payload_hash;
  v_atual_comercial_hash_ok := v_atual_comercial.id is not null
    and v_atual_comercial.payload_hash is not null
    and public.hash_jsonb_canonico(v_atual_comercial.payload) = v_atual_comercial.payload_hash;

  select exists (
    select 1 from public.fechamento_mensal_snapshots s
    where s.ano = p_anterior_ano and s.mes = p_anterior_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio = 'relatorio_admin_mensal'
  ) into v_anterior_admin_existe;
  select exists (
    select 1 from public.fechamento_mensal_snapshots s
    where s.ano = p_anterior_ano and s.mes = p_anterior_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio = 'relatorio_comercial_mensal'
  ) into v_anterior_comercial_existe;

  select * into v_anterior_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = p_anterior_ano and s.mes = p_anterior_mes
    and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_admin_mensal' and s.status = 'fechado'
  order by s.versao desc limit 1;

  select * into v_anterior_comercial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_anterior_ano and s.mes = p_anterior_mes
    and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_comercial_mensal' and s.status = 'fechado'
  order by s.versao desc limit 1;

  v_anterior_admin_hash_ok := v_anterior_admin.id is not null
    and v_anterior_admin.payload_hash is not null
    and public.hash_jsonb_canonico(v_anterior_admin.payload) = v_anterior_admin.payload_hash;
  v_anterior_comercial_hash_ok := v_anterior_comercial.id is not null
    and v_anterior_comercial.payload_hash is not null
    and public.hash_jsonb_canonico(v_anterior_comercial.payload) = v_anterior_comercial.payload_hash;

  select coalesce(jsonb_agg(status order by status), '[]'::jsonb)
    into v_status_anterior
  from (
    select distinct s.status
    from public.fechamento_mensal_snapshots s
    where s.ano = p_anterior_ano and s.mes = p_anterior_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio in ('relatorio_admin_mensal', 'relatorio_comercial_mensal')
  ) estados;

  select coalesce(jsonb_agg(status order by status), '[]'::jsonb)
    into v_status_atual
  from (
    select distinct s.status
    from public.fechamento_mensal_snapshots s
    where s.ano = p_atual_ano and s.mes = p_atual_mes
      and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
      and s.dominio in ('relatorio_admin_mensal', 'relatorio_comercial_mensal')
  ) estados;

  if not v_atual_admin_hash_ok or not v_atual_comercial_hash_ok then
    v_motivo := case
      when not v_atual_admin_existe or not v_atual_comercial_existe
        then 'dominio_atual_ausente'
      when v_atual_admin.id is null or v_atual_comercial.id is null
        then 'fechamento_atual_nao_fechado'
      else 'payload_atual_invalido'
    end;
  elsif not v_anterior_admin_existe or not v_anterior_comercial_existe then
    v_motivo := 'dominio_anterior_ausente';
    if not v_anterior_admin_existe then
      v_dominios_ausentes := v_dominios_ausentes || jsonb_build_array('relatorio_admin_mensal');
    end if;
    if not v_anterior_comercial_existe then
      v_dominios_ausentes := v_dominios_ausentes || jsonb_build_array('relatorio_comercial_mensal');
    end if;
  elsif v_anterior_admin.id is null or v_anterior_comercial.id is null then
    v_motivo := 'fechamento_anterior_nao_fechado';
  elsif not v_anterior_admin_hash_ok or not v_anterior_comercial_hash_ok then
    v_motivo := 'payload_anterior_invalido';
  else
    v_fingerprint_atual := md5(jsonb_build_object(
      'unidade_id', p_unidade_id,
      'escopo', 'unidade',
      'dominios', jsonb_build_array('relatorio_admin_mensal', 'relatorio_comercial_mensal'),
      'status_exigido', 'fechado',
      'granularidade', 'competencia-mensal',
      'contrato', 'relatorio-mensal-canonico-v1',
      'versoes', jsonb_build_object(
        'relatorio_admin_mensal', v_atual_admin.versao,
        'relatorio_comercial_mensal', v_atual_comercial.versao
      )
    )::text);
    v_fingerprint_anterior := md5(jsonb_build_object(
      'unidade_id', p_unidade_id,
      'escopo', 'unidade',
      'dominios', jsonb_build_array('relatorio_admin_mensal', 'relatorio_comercial_mensal'),
      'status_exigido', 'fechado',
      'granularidade', 'competencia-mensal',
      'contrato', 'relatorio-mensal-canonico-v1',
      'versoes', jsonb_build_object(
        'relatorio_admin_mensal', v_anterior_admin.versao,
        'relatorio_comercial_mensal', v_anterior_comercial.versao
      )
    )::text);

    if v_fingerprint_atual = v_fingerprint_anterior then
      v_disponibilidade := 'disponivel';
      v_motivo := 'fechamentos_equivalentes';
    else
      v_motivo := 'fingerprint_incompativel';
      if v_atual_admin.versao is distinct from v_anterior_admin.versao then
        v_componentes_diferentes := v_componentes_diferentes || jsonb_build_array('versao_relatorio_admin_mensal');
      end if;
      if v_atual_comercial.versao is distinct from v_anterior_comercial.versao then
        v_componentes_diferentes := v_componentes_diferentes || jsonb_build_array('versao_relatorio_comercial_mensal');
      end if;
    end if;
  end if;

  if v_fingerprint_atual is null
     and v_atual_admin_hash_ok and v_atual_comercial_hash_ok then
    v_fingerprint_atual := md5(jsonb_build_object(
      'unidade_id', p_unidade_id, 'escopo', 'unidade',
      'dominios', jsonb_build_array('relatorio_admin_mensal', 'relatorio_comercial_mensal'),
      'status_exigido', 'fechado', 'granularidade', 'competencia-mensal',
      'contrato', 'relatorio-mensal-canonico-v1',
      'versoes', jsonb_build_object(
        'relatorio_admin_mensal', v_atual_admin.versao,
        'relatorio_comercial_mensal', v_atual_comercial.versao
      )
    )::text);
  end if;

  v_dados_atual := jsonb_build_object(
    'competencia', jsonb_build_object('ano', p_atual_ano, 'mes', p_atual_mes),
    'administrativo', case when v_atual_admin.id is not null then jsonb_build_object(
      'snapshot_id', v_atual_admin.id, 'status', v_atual_admin.status,
      'versao', v_atual_admin.versao, 'payload_hash', v_atual_admin.payload_hash,
      'resumo', v_atual_admin.payload->'resumo'
    ) else '{}'::jsonb end,
    'comercial', case when v_atual_comercial.id is not null then jsonb_build_object(
      'snapshot_id', v_atual_comercial.id, 'status', v_atual_comercial.status,
      'versao', v_atual_comercial.versao, 'payload_hash', v_atual_comercial.payload_hash,
      'resumo', v_atual_comercial.payload->'resumo'
    ) else '{}'::jsonb end
  );
  v_dados_anterior := jsonb_build_object(
    'competencia', jsonb_build_object('ano', p_anterior_ano, 'mes', p_anterior_mes),
    'administrativo', case when v_anterior_admin.id is not null then jsonb_build_object(
      'snapshot_id', v_anterior_admin.id, 'status', v_anterior_admin.status,
      'versao', v_anterior_admin.versao, 'payload_hash', v_anterior_admin.payload_hash,
      'resumo', v_anterior_admin.payload->'resumo'
    ) else '{}'::jsonb end,
    'comercial', case when v_anterior_comercial.id is not null then jsonb_build_object(
      'snapshot_id', v_anterior_comercial.id, 'status', v_anterior_comercial.status,
      'versao', v_anterior_comercial.versao, 'payload_hash', v_anterior_comercial.payload_hash,
      'resumo', v_anterior_comercial.payload->'resumo'
    ) else '{}'::jsonb end
  );

  return jsonb_build_object(
    'disponibilidade', v_disponibilidade,
    'status', v_disponibilidade,
    'motivo', v_motivo,
    'competencia_atual', jsonb_build_object('ano', p_atual_ano, 'mes', p_atual_mes),
    'competencia_anterior', jsonb_build_object('ano', p_anterior_ano, 'mes', p_anterior_mes),
    'dominios_ausentes', v_dominios_ausentes,
    'status_anterior', v_status_anterior,
    'status_atual', v_status_atual,
    'componentes_diferentes', v_componentes_diferentes,
    'fingerprint_atual', v_fingerprint_atual,
    'fingerprint_anterior', v_fingerprint_anterior,
    'atual', v_dados_atual,
    'anterior', v_dados_anterior,
    'politica', jsonb_build_object(
      'versao', 'fechamento-equivalente-v2',
      'dominio', 'gerencial',
      'grao', 'competencia-mensal',
      'status_exigido', 'fechado'
    )
  );
end;
$function$;

revoke all on function public.get_comparativo_fechamento_mensal_v1(uuid, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.get_relatorio_gerencial_canonico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
  v_mes_anterior jsonb;
  v_ano_anterior jsonb;
  v_ano_mes_anterior integer;
  v_mes_anterior_numero integer;
  v_comparativos jsonb;
begin
  v_base := public.get_relatorio_gerencial_canonico_comparativos_base_v1(
    p_unidade_id, p_ano, p_mes
  );

  if p_mes = 1 then
    v_ano_mes_anterior := p_ano - 1;
    v_mes_anterior_numero := 12;
  else
    v_ano_mes_anterior := p_ano;
    v_mes_anterior_numero := p_mes - 1;
  end if;

  v_mes_anterior := public.get_comparativo_fechamento_mensal_v1(
    p_unidade_id, p_ano, p_mes, v_ano_mes_anterior, v_mes_anterior_numero
  );
  v_ano_anterior := public.get_comparativo_fechamento_mensal_v1(
    p_unidade_id, p_ano, p_mes, p_ano - 1, p_mes
  );

  v_comparativos := jsonb_build_object(
    'disponibilidade', v_mes_anterior->>'disponibilidade',
    'status', v_mes_anterior->>'status',
    'motivo', v_mes_anterior->>'motivo',
    'mes_anterior', v_mes_anterior,
    'ano_anterior', v_ano_anterior,
    'fingerprint', v_mes_anterior->>'fingerprint_atual',
    'fingerprint_atual', v_mes_anterior->>'fingerprint_atual',
    'fingerprint_anterior', v_mes_anterior->>'fingerprint_anterior',
    'politica', v_mes_anterior->'politica'
  );

  return jsonb_set(v_base, '{comparativos}', v_comparativos, true);
end;
$function$;

revoke all on function public.get_relatorio_gerencial_canonico_comparativos_base_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer) is
  'Compoe o relatorio gerencial e carrega comparativos do mes anterior e do mesmo mes do ano anterior somente entre snapshots fechados equivalentes.';
