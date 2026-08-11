-- Fecha somente os dois snapshots mensais canonicos de uma unidade.
-- O wrapper existente fechar_competencia_mensal_canonica_v1 atua em todas as
-- unidades; este RPC e usado para uma retificacao/captura historica isolada,
-- mantendo as demais unidades fora do lote.

create or replace function public.fechar_relatorio_mensal_canonico_unidade_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lote_id uuid := gen_random_uuid();
  v_aprovados integer := 0;
  v_fechados integer := 0;
  v_total integer := 0;
  v_fechamento jsonb;
  v_ids jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL';
  end if;
  if p_unidade_id is null
     or p_ano is null
     or p_mes not between 1 and 12
     or nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  select
    count(*) filter (where s.status = 'aprovado')::integer,
    count(*) filter (where s.status = 'fechado')::integer,
    count(*)::integer
  into v_aprovados, v_fechados, v_total
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio in ('relatorio_admin_mensal', 'relatorio_comercial_mensal');

  if v_total = 2 and v_fechados = 2 and v_aprovados = 0 then
    return jsonb_build_object(
      'ok', true,
      'status', 'ja_fechado',
      'unidade_id', p_unidade_id,
      'ano', p_ano,
      'mes', p_mes,
      'snapshots_fechados', 0
    );
  end if;

  if v_total <> 2 or v_aprovados <> 2 then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO: esperado 2 snapshots aprovados da unidade';
  end if;

  v_fechamento := public.fechar_competencia(
    p_unidade_id,
    p_ano,
    p_mes,
    'relatorios_mensais_canonicos_v1',
    p_motivo,
    v_lote_id
  );

  with atualizados as (
    update public.fechamento_mensal_snapshots s
    set status = 'fechado',
        fechado_em = now(),
        fechado_por = auth.uid(),
        updated_at = now()
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.unidade_id = p_unidade_id
      and s.dominio in ('relatorio_admin_mensal', 'relatorio_comercial_mensal')
      and s.status = 'aprovado'
    returning s.id, s.dominio, s.versao
  ), auditados as (
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    select
      a.id,
      p_ano,
      p_mes,
      'unidade',
      p_unidade_id,
      'snapshot_fechado',
      jsonb_build_object(
        'dominio', a.dominio,
        'versao', a.versao,
        'fechamento_lote_id', v_lote_id,
        'motivo', p_motivo,
        'escopo_isolado', true
      ),
      auth.uid()
    from atualizados a
    returning snapshot_id
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(snapshot_id), '[]'::jsonb)
  into v_total, v_ids
  from auditados;

  return jsonb_build_object(
    'ok', true,
    'status', 'fechado',
    'unidade_id', p_unidade_id,
    'ano', p_ano,
    'mes', p_mes,
    'fechamento_lote_id', v_lote_id,
    'competencia', v_fechamento,
    'snapshots_fechados', v_total,
    'snapshot_ids', v_ids
  );
end;
$function$;

revoke all on function public.fechar_relatorio_mensal_canonico_unidade_v1(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.fechar_relatorio_mensal_canonico_unidade_v1(uuid, integer, integer, text)
  to service_role;

comment on function public.fechar_relatorio_mensal_canonico_unidade_v1(uuid, integer, integer, text) is
  'Fecha somente os snapshots relatorio_admin_mensal e relatorio_comercial_mensal de uma unidade, com auditoria e sem tocar outras unidades.';
