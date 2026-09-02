-- supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql
--
-- fechar_competencia_mensal_canonica_v1 e tudo-ou-nada por construcao: varre
-- todas as unidades ativas e explode se faltar dominio em qualquer uma. Em
-- agosto/2026 isso deixou Barra e Recreio sem relatorio por causa de UM aluno
-- de Campo Grande. Esta v2 fecha uma unidade por vez.
--
-- A v1 fica intacta -- tem consumidores e continua sendo o caminho manual.

create or replace function public.fechar_competencia_mensal_canonica_v2(
  p_ano integer,
  p_mes integer,
  p_motivo text,
  p_unidade_id uuid,
  p_lote_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid := coalesce(p_lote_id, gen_random_uuid());
  v_nome text;
  v_faltantes text[];
  v_snapshots_fechados integer := 0;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL';
  end if;
  if p_ano is null or p_mes not between 1 and 12
     or nullif(btrim(coalesce(p_motivo, '')), '') is null
     or p_unidade_id is null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  select u.nome into v_nome
  from public.unidades u
  where u.id = p_unidade_id and u.ativo = true;

  if not found then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_UNIDADE_INVALIDA: %', p_unidade_id;
  end if;

  select array_agg(esperado.dominio order by esperado.dominio)
    into v_faltantes
  from (values
    ('alunos_admin'::text),
    ('alunos_executivo'::text),
    ('comercial'::text),
    ('relatorio_gerencial'::text),
    ('relatorio_admin_mensal'::text),
    ('relatorio_comercial_mensal'::text)
  ) esperado(dominio)
  where not exists (
    select 1
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.unidade_id = p_unidade_id
      and s.dominio = esperado.dominio
      and s.status in ('aprovado', 'fechado')
  );

  if v_faltantes is not null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO: unidade %, dominio(s) ausente(s): %',
      v_nome, array_to_string(v_faltantes, ', ');
  end if;

  perform public.fechar_competencia(
    p_unidade_id, p_ano, p_mes,
    'relatorios_mensais_canonicos_v2', p_motivo, v_lote_id
  );

  with atualizados as (
    update public.fechamento_mensal_snapshots s
    set status = 'fechado',
        fechado_em = now(),
        fechado_por = auth.uid(),
        updated_at = now()
    where s.ano = p_ano
      and s.mes = p_mes
      and s.status = 'aprovado'
      and s.escopo = 'unidade'          -- sem isto, os 11 snapshots consolidados
      and s.unidade_id = p_unidade_id   -- de 2026 seriam carimbados junto
    returning s.id, s.escopo, s.dominio, s.versao
  ), auditados as (
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    select a.id, p_ano, p_mes, a.escopo, p_unidade_id, 'snapshot_fechado',
      jsonb_build_object(
        'dominio', a.dominio, 'versao', a.versao,
        'fechamento_lote_id', v_lote_id, 'motivo', p_motivo,
        'origem', 'fechar_competencia_mensal_canonica_v2'
      ),
      auth.uid()
    from atualizados a
    returning snapshot_id
  )
  select count(*)::integer into v_snapshots_fechados from auditados;

  return jsonb_build_object(
    'ok', true, 'ano', p_ano, 'mes', p_mes,
    'unidade_id', p_unidade_id, 'unidade_nome', v_nome,
    'fechamento_lote_id', v_lote_id,
    'snapshots_fechados', v_snapshots_fechados
  );
end;
$$;

revoke all on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) from public;
revoke execute on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) from anon;
grant execute on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) to service_role;

comment on function public.fechar_competencia_mensal_canonica_v2(integer, integer, text, uuid, uuid) is
  'Fecha a competencia mensal de UMA unidade. Diferente da v1 (tudo-ou-nada), permite que unidade travada nao segure as outras. Filtra escopo=unidade no UPDATE para nao carimbar snapshots consolidados.';
