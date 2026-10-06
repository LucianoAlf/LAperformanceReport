-- supabase/migrations/20261002140000_barra_set26_regrava_comercial_conversao_exp_mat.sql
--
-- Regrava o relatorio mensal COMERCIAL de setembro/2026 da Barra com a conversao corrigida
-- (irmaos 20261002120000 + experimental de mes anterior 20261002130000): 12/33 -> 16/33.
-- Aprovado pelo Hugo em 02/10/2026 depois de ver a simulacao do texto.
--
-- Escopo deliberadamente estreito:
--   * relatorio_gerencial: NOVA versao = payload da versao vigente com SO tres campos trocados em
--     kpis_comercial[0] (conversoes_exp_mat_canonicas, taxa_exp_mat_canonica,
--     taxa_conversao_exp_mat), lidos do preview. A regravacao inteira refotografaria leads
--     (153 -> 152), kpis_gestao, matriculas ativas e financeiro, que ninguem aprovou.
--   * comercial: NOVA versao = foto de hoje (traz canais preenchidos depois do fechamento e o
--     professor da experimental do Nicolas e do Bento, conferidos no Emusys) - aprovado.
--   * relatorio_comercial_mensal: remontado pelo builder sobre as duas versoes acima.
--     Experimentais realizadas 33 (era 35): aplicada antes a 20261002160000 (reagendamento).
--   * relatorio_admin_mensal e dados_mensais: NAO tocados. Guarda abaixo prova que o rico do
--     administrativo nao mudou.

do $$
declare
  v_bar uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_obs text := 'Regravacao set/26 Barra: conversao exp->mat com irmaos e experimental de mes anterior (20261002120000/130000); migration 20261002140000';
  v_adm_antes jsonb;
  v_prev jsonb; v_un jsonb; v_ger_old jsonb; v_ger_novo_preview jsonb; v_ger jsonb; v_payload jsonb;
  v_ver int; v_id uuid; v_k text; v_n int; v_r jsonb; v_status text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('app.fechamento_competencia_viva', '2026-9', true);

  v_adm_antes := (public.get_relatorio_admin_mensal_rico_v1(v_bar, 2026, 9))->'payload';

  select status into v_status from public.competencias_mensais where unidade_id = v_bar and ano = 2026 and mes = 9;
  if v_status <> 'fechado' then raise exception 'competencia Barra set/26 deveria estar fechada, esta %', v_status; end if;
  update public.competencias_mensais set status = 'aberto' where unidade_id = v_bar and ano = 2026 and mes = 9;

  v_prev := public.preview_fechamento_mensal(2026, 9, null, true);
  select value into v_un from jsonb_array_elements(v_prev->'unidades') where value->>'unidade_id' = v_bar::text;
  if v_un is null then raise exception 'preview sem a Barra'; end if;
  if jsonb_array_length(coalesce(v_un->'bloqueios', '[]')) > 0 then raise exception 'preview bloqueado: %', v_un->'bloqueios'; end if;

  -- comercial: foto de hoje
  v_payload := v_un->'fontes'->'comercial_canonico';
  if v_payload is null or v_payload = 'null'::jsonb or v_payload ? 'erro' then raise exception 'payload comercial invalido'; end if;
  select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
    where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_bar and dominio = 'comercial';
  insert into public.fechamento_mensal_snapshots
    (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, financeiro_realizado_disponivel, observacao, aprovado_em)
  values (2026, 9, 'unidade', v_bar, 'comercial', v_ver, 'aprovado', 'get_kpis_comercial_canonicos_v2', v_payload,
          public.hash_jsonb_canonico(v_payload), false, v_obs, now())
  returning id into v_id;
  insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
  values (v_id, 2026, 9, 'unidade', v_bar, 'snapshot_gravado',
          jsonb_build_object('dominio', 'comercial', 'versao', v_ver, 'origem', '20261002140000'));

  -- relatorio_gerencial: vigente + 3 campos da conversao
  select payload into v_ger_old from public.fechamento_mensal_snapshots
    where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_bar and dominio = 'relatorio_gerencial'
      and status in ('aprovado', 'fechado')
    order by versao desc limit 1;
  v_ger_novo_preview := v_un->'fontes'->'relatorio_gerencial';
  if v_ger_old is null or v_ger_novo_preview is null then raise exception 'gerencial ausente'; end if;
  v_ger := v_ger_old;
  foreach v_k in array array['conversoes_exp_mat_canonicas', 'taxa_exp_mat_canonica', 'taxa_conversao_exp_mat'] loop
    if (v_ger_novo_preview #> array['kpis_comercial', '0', v_k]) is null then raise exception 'preview sem %', v_k; end if;
    v_ger := jsonb_set(v_ger, array['kpis_comercial', '0', v_k], v_ger_novo_preview #> array['kpis_comercial', '0', v_k]);
  end loop;
  if (v_ger #>> '{kpis_comercial,0,conversoes_exp_mat_canonicas}')::int <> 16
     or (v_ger #>> '{kpis_comercial,0,taxa_exp_mat_canonica}')::numeric <> 48.5 then
    raise exception 'gerencial fora do esperado: %', v_ger->'kpis_comercial'->0;
  end if;
  select count(*) into v_n from jsonb_object_keys(v_ger) k where v_ger->k is distinct from v_ger_old->k;
  if v_n <> 1 then raise exception 'gerencial mudou % blocos (esperado so kpis_comercial)', v_n; end if;
  select count(*) into v_n from jsonb_object_keys(v_ger->'kpis_comercial'->0) k
    where v_ger->'kpis_comercial'->0->k is distinct from v_ger_old->'kpis_comercial'->0->k;
  if v_n <> 3 then raise exception 'kpis_comercial mudou % campos (esperado 3)', v_n; end if;

  select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
    where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_bar and dominio = 'relatorio_gerencial';
  insert into public.fechamento_mensal_snapshots
    (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, financeiro_realizado_disponivel, observacao, aprovado_em)
  values (2026, 9, 'unidade', v_bar, 'relatorio_gerencial', v_ver, 'aprovado', 'get_dados_relatorio_gerencial', v_ger,
          public.hash_jsonb_canonico(v_ger), false, v_obs, now())
  returning id into v_id;
  insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
  values (v_id, 2026, 9, 'unidade', v_bar, 'snapshot_gravado',
          jsonb_build_object('dominio', 'relatorio_gerencial', 'versao', v_ver, 'origem', '20261002140000',
                             'campos', array['kpis_comercial.0.conversoes_exp_mat_canonicas',
                                             'kpis_comercial.0.taxa_exp_mat_canonica',
                                             'kpis_comercial.0.taxa_conversao_exp_mat']));

  -- relatorio_comercial_mensal
  v_payload := public.montar_relatorio_comercial_mensal_payload_v1(v_bar, 2026, 9);
  v_r := v_payload->'resumo';
  if (v_r->>'conversoes_exp_mat')::int <> 16 or (v_r->>'taxa_exp_mat')::numeric <> 48.5
     or (v_r->>'matriculas')::int <> 21 or (v_r->>'experimentais')::int <> 33
     or (v_r->>'experimentais_confirmadas')::int <> 33 or (v_r->>'leads')::int <> 152 then
    raise exception 'relatorio comercial fora do simulado: %', v_r;
  end if;
  select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
    where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_bar and dominio = 'relatorio_comercial_mensal';
  insert into public.fechamento_mensal_snapshots
    (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, observacao, aprovado_em)
  values (2026, 9, 'unidade', v_bar, 'relatorio_comercial_mensal', v_ver, 'aprovado',
          'montar_relatorio_comercial_mensal_payload_v1', v_payload, public.hash_jsonb_canonico(v_payload), v_obs, now())
  returning id into v_id;
  insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
  values (v_id, 2026, 9, 'unidade', v_bar, 'snapshot_gravado',
          jsonb_build_object('dominio', 'relatorio_comercial_mensal', 'versao', v_ver, 'origem', '20261002140000'));

  perform public.fechar_competencia_mensal_canonica_v2(2026, 9, v_obs, v_bar, null);
  if (select status from public.competencias_mensais where unidade_id = v_bar and ano = 2026 and mes = 9) <> 'fechado' then
    raise exception 'competencia nao voltou a fechado';
  end if;

  if (public.get_relatorio_admin_mensal_rico_v1(v_bar, 2026, 9))->'payload' is distinct from v_adm_antes then
    raise exception 'relatorio administrativo mudou - abortando';
  end if;

  raise notice 'Barra set/26 comercial regravado: 16/33';
end $$;
