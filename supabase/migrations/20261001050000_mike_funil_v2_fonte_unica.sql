-- Mike v2: o funil passa a ler a FONTE ÚNICA comercial (get_kpis_comercial_competencia_v1):
-- fechamento oficial quando o mês fechou, senão ao vivo — a mesma função dos relatórios diário, mensal,
-- de matrículas e comparativo, e a mesma que a Mila usa (mila_numeros_do_mes_v1). Metas de metas_kpi.
-- Corrige a v1, que lia o cálculo ao vivo da v2 canônica e divergia em experimentais e em mês fechado.
-- Só números agregados: não devolve lista de matrículas nem nome de pessoa.
-- Rollback: supabase/rollbacks/20261001050000_mike_funil_v2_fonte_unica_ROLLBACK.sql
create or replace function public.mike_funil_v2(p_ano integer, p_mes integer, p_unidade text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_unidade uuid;
  v_nome text := 'Rede (CG + REC + BARRA)';
  c jsonb;
  v_metas jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fechado boolean;
begin
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 or p_ano not between 2020 and 2100 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  if make_date(p_ano, p_mes, 1) > v_hoje then
    return jsonb_build_object('ok', true, 'sem_dado', true, 'motivo', 'competencia_no_futuro');
  end if;
  if p_unidade is not null and btrim(p_unidade) <> '' then
    select u.id, u.nome into v_unidade, v_nome from public.unidades u where u.codigo = upper(btrim(p_unidade));
    if v_unidade is null then
      return jsonb_build_object('ok', false, 'erro', 'unidade_invalida', 'unidades_validas', jsonb_build_array('CG', 'REC', 'BARRA'));
    end if;
    select coalesce(jsonb_object_agg(tipo, valor), '{}'::jsonb) into v_metas
      from public.metas_kpi where unidade_id = v_unidade and ano = p_ano and mes = p_mes;
  end if;

  -- A fonte única libera chamada interna (service_role/postgres: Mila, edge, cron) e barra JWT de usuário.
  -- O Mike é chamada interna já autorizada por esta função; a marca vale só para esta transação.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  c := public.get_kpis_comercial_competencia_v1(v_unidade, p_ano, p_mes);
  perform set_config('request.jwt.claim.role', '', true);
  if c is null or coalesce((c->>'ok')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'erro', 'fonte_indisponivel');
  end if;
  v_fechado := coalesce((c->>'fechado')::boolean, false);

  return jsonb_build_object(
    'ok', true,
    'escopo', v_nome,
    'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
    'fechado', v_fechado,
    'fonte', case
      when v_fechado then 'fechamento oficial do mês (o mesmo número do relatório mensal da equipe)'
      when make_date(p_ano, p_mes, 1) = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
        then 'ao vivo: o mês ainda não fechou, o número ainda muda (mesma fonte do relatório diário)'
      else 'recalculado ao vivo: esta competência não tem fechamento oficial; não é o número do relatório'
    end,
    'kpis', c->'kpis',
    'metas', case when v_unidade is null then null else jsonb_build_object(
      'leads', v_metas->'leads', 'experimentais', v_metas->'experimentais', 'matriculas', v_metas->'matriculas',
      'ticket_parcela', v_metas->'ticket_parcela', 'taxa_lead_exp', v_metas->'taxa_lead_exp',
      'taxa_exp_mat', v_metas->'taxa_exp_mat', 'taxa_lead_mat', v_metas->'taxa_conversao') end,
    'funil', c->'funil',
    'canais_do_mes', coalesce(c->'canais_do_mes', '[]'::jsonb),
    'cursos_do_mes', coalesce(c->'cursos_do_mes', '[]'::jsonb),
    'ressalvas', c->'ressalvas',
    'divergencias', c->'divergencias',
    'definicoes', c->'definicoes',
    'regra_ticket', c->>'regra_ticket',
    'como_ler', jsonb_build_array(
      'Experimentais confirmadas (presença + vínculo) são o denominador da taxa experimental→matrícula.',
      'Matrícula por canal ainda não tem vínculo lead→aluno confiável: zero por canal não quer dizer que o canal não matricula.',
      '"Sem canal" é lead sem origem registrada: falha de cadastro, não canal.'
    )
  );
end;
$$;

revoke all on function public.mike_funil_v2(integer, integer, text) from public, anon, authenticated;
grant execute on function public.mike_funil_v2(integer, integer, text) to mike_mcp, service_role;
revoke execute on function public.mike_funil_v1(integer, integer, text) from mike_mcp;
