-- Corrige a fonte das metas operacionais sem reabrir snapshots fechados.
-- O fechamento gerencial carrega `metas_kpi` da própria competência; o
-- programa Fideliza+ e o Matriculador+ continuam em seus blocos dedicados.
-- Também expõe o bloqueio técnico da captura histórica sem gravar backfill.
-- Um exemplo real auditado é RENOVACOES_MENSAL_DIVERGENTE.

create or replace function public.diagnosticar_captura_fechamento_mensal_v1(
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
  v_dominios jsonb := '[]'::jsonb;
  v_erro text;
begin
  select coalesce(jsonb_agg(d.dominio order by d.dominio), '[]'::jsonb)
  into v_dominios
  from (
    select distinct s.dominio
    from public.fechamento_mensal_snapshots s
    where s.unidade_id = p_unidade_id
      and s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio in (
        'alunos_admin',
        'alunos_executivo',
        'comercial',
        'relatorio_gerencial',
        'relatorio_admin_mensal',
        'relatorio_comercial_mensal'
      )
  ) d;

  if jsonb_array_length(v_dominios) = 0 then
    return jsonb_build_object(
      'status', 'bloqueada',
      'motivo', 'COMPETENCIA_ANTERIOR_SEM_SNAPSHOTS',
      'funcao', 'capturar_relatorios_mensais_canonicos_v1',
      'dominios_existentes', v_dominios
    );
  end if;

  begin
    perform public.montar_relatorio_admin_mensal_payload_v1(
      p_unidade_id,
      p_ano,
      p_mes
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  if v_erro is not null then
    return jsonb_build_object(
      'status', 'bloqueada',
      'motivo', v_erro,
      'funcao', 'capturar_relatorios_mensais_canonicos_v1',
      'dominios_existentes', v_dominios
    );
  end if;

  begin
    perform public.montar_relatorio_comercial_mensal_payload_v1(
      p_unidade_id,
      p_ano,
      p_mes
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  if v_erro is not null then
    return jsonb_build_object(
      'status', 'bloqueada',
      'motivo', v_erro,
      'funcao', 'capturar_relatorios_mensais_canonicos_v1',
      'dominios_existentes', v_dominios
    );
  end if;

  return jsonb_build_object(
    'status', 'apta_para_captura',
    'motivo', 'CAPTURA_CANONICA_VALIDADA',
    'funcao', 'capturar_relatorios_mensais_canonicos_v1',
    'dominios_existentes', v_dominios
  );
end;
$function$;

revoke all on function public.diagnosticar_captura_fechamento_mensal_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

alter function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  rename to get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1;

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
  v_resultado jsonb;
  v_metas_operacionais jsonb := '{}'::jsonb;
  v_mes_anterior_ano integer;
  v_mes_anterior_numero integer;
begin
  v_resultado := public.get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  select coalesce(
    jsonb_object_agg(m.tipo, to_jsonb(m.valor) order by m.tipo),
    '{}'::jsonb
  )
  into v_metas_operacionais
  from public.metas_kpi m
  where m.unidade_id = p_unidade_id
    and m.ano = p_ano
    and m.mes = p_mes;

  if jsonb_typeof(v_metas_operacionais) = 'object'
     and v_metas_operacionais <> '{}'::jsonb then
    v_resultado := jsonb_set(
      v_resultado,
      '{metas,operacionais}',
      v_metas_operacionais,
      true
    );
    v_resultado := jsonb_set(
      v_resultado,
      '{metas,mensais}',
      v_metas_operacionais,
      true
    );
    v_resultado := jsonb_set(
      v_resultado,
      '{metas,metadados,operacionais}',
      jsonb_build_object(
        'fonte', 'metas_kpi',
        'ano', p_ano,
        'mes', p_mes,
        'escopo', 'unidade_competencia'
      ),
      true
    );
  end if;

  if p_mes = 1 then
    v_mes_anterior_ano := p_ano - 1;
    v_mes_anterior_numero := 12;
  else
    v_mes_anterior_ano := p_ano;
    v_mes_anterior_numero := p_mes - 1;
  end if;

  if (v_resultado#>>'{comparativos,mes_anterior,motivo}') = 'dominio_anterior_ausente' then
    v_resultado := jsonb_set(
      v_resultado,
      '{comparativos,mes_anterior,bloqueio_captura}',
      public.diagnosticar_captura_fechamento_mensal_v1(
        p_unidade_id,
        v_mes_anterior_ano,
        v_mes_anterior_numero
      ),
      true
    );
  end if;

  if (v_resultado#>>'{comparativos,ano_anterior,motivo}') = 'dominio_anterior_ausente' then
    v_resultado := jsonb_set(
      v_resultado,
      '{comparativos,ano_anterior,bloqueio_captura}',
      public.diagnosticar_captura_fechamento_mensal_v1(
        p_unidade_id,
        p_ano - 1,
        p_mes
      ),
      true
    );
  end if;

  return v_resultado;
end;
$function$;

revoke all on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer) is
  'Compoe o relatorio gerencial, carrega metas_kpi por competencia e expone o diagnostico read-only da captura historica.';
