-- Retificação append-only de JUNHO e JULHO/2026 — "Experimentais realizadas" = status operacional
--
-- A mesma correção aplicada a agosto em 20260913200000 (bloco 5), agora como FUNÇÃO reutilizável
-- e chamada para as duas competências que faltavam. O relatório mensal publicava em
-- `resumo.experimentais` o DENOMINADOR da taxa exp→mat (presença confirmada + vínculo), enquanto
-- o diário, a v2 canônica e a Mila publicam o status operacional do CRM. Medido nas 6 linhas:
--   jun: Barra 18→31 · CG 18→25 · Recreio 47→57
--   jul: Barra 43→101 · CG 19→53 · Recreio 41→88
--
-- O QUE MUDA: resumo.experimentais, resumo.taxa_lead_exp e resumo.experimentais_confirmadas (novo).
-- taxa_exp_mat NÃO muda (mesmo numerador e denominador). Lista e tickets ficam como a foto do
-- fechamento — retificação corrige a definição, não re-fotografa o cadastro (ver 20260913200000).
-- Idempotente pelo marcador `retificacao_experimentais_e_ticket_2026_09` no payload (o mesmo de
-- agosto, para o leitor `get_kpis_comercial_competencia_v1` tratar as três competências igual).
create or replace function public.retificar_experimentais_status_operacional_v1(p_ano integer, p_mes integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  v_snap public.fechamento_mensal_snapshots%rowtype;
  v_com public.fechamento_mensal_snapshots%rowtype;
  v_k jsonb; v_novo jsonb; v_novo_id uuid;
  v_exp_status int; v_conf_antes int; v_leads int;
  v_antes jsonb; v_depois jsonb;
  v_chaves_resumo text[] := array['experimentais', 'experimentais_confirmadas', 'taxa_lead_exp'];
  v_out jsonb := '[]'::jsonb;
begin
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RETIFICACAO_COMERCIAL_COMPETENCIA_INVALIDA';
  end if;

  for u in
    select distinct s.unidade_id
      from public.fechamento_mensal_snapshots s
     where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade' and s.dominio = 'relatorio_comercial_mensal'
  loop
    select * into v_snap
      from public.fechamento_mensal_snapshots s
     where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade' and s.unidade_id = u.unidade_id
       and s.dominio = 'relatorio_comercial_mensal'
     order by s.versao desc limit 1;
    if v_snap.payload ? 'retificacao_experimentais_e_ticket_2026_09' then
      v_out := v_out || jsonb_build_object('unidade_id', u.unidade_id, 'pulado', 'ja_retificado', 'versao', v_snap.versao);
      continue;
    end if;
    if v_snap.payload_hash is null or public.hash_jsonb_canonico(v_snap.payload) <> v_snap.payload_hash then
      raise exception 'RETIFICACAO_COMERCIAL_HASH_DIVERGENTE unidade % %/%', u.unidade_id, p_mes, p_ano;
    end if;

    select * into v_com
      from public.fechamento_mensal_snapshots s
     where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade' and s.unidade_id = u.unidade_id
       and s.dominio = 'comercial' and s.status in ('aprovado', 'fechado', 'retificado')
     order by s.versao desc limit 1;
    if v_com.id is null then
      raise exception 'RETIFICACAO_COMERCIAL_SEM_SNAPSHOT_COMERCIAL unidade % %/%', u.unidade_id, p_mes, p_ano;
    end if;
    v_k := coalesce(v_com.payload->'kpis', v_com.payload);
    v_exp_status := (v_k->>'experimentais_realizadas_status_operacional')::int;
    if v_exp_status is null then
      raise exception 'RETIFICACAO_COMERCIAL_SEM_STATUS_OPERACIONAL unidade % %/%', u.unidade_id, p_mes, p_ano;
    end if;

    v_conf_antes := (v_snap.payload#>>'{resumo,experimentais}')::int;
    v_leads := coalesce((v_snap.payload#>>'{resumo,leads}')::int, 0);

    v_antes := jsonb_build_object(
      'experimentais', v_snap.payload#>'{resumo,experimentais}',
      'taxa_lead_exp', v_snap.payload#>'{resumo,taxa_lead_exp}');

    v_novo := v_snap.payload;
    v_novo := jsonb_set(v_novo, '{resumo,experimentais}', to_jsonb(v_exp_status));
    v_novo := jsonb_set(v_novo, '{resumo,experimentais_confirmadas}', to_jsonb(coalesce(v_conf_antes, 0)));
    v_novo := jsonb_set(v_novo, '{resumo,taxa_lead_exp}',
                to_jsonb(case when v_leads > 0 then round(v_exp_status::numeric / v_leads * 100, 1) else 0 end));

    v_depois := jsonb_build_object(
      'experimentais', v_novo#>'{resumo,experimentais}',
      'experimentais_confirmadas', v_novo#>'{resumo,experimentais_confirmadas}',
      'taxa_lead_exp', v_novo#>'{resumo,taxa_lead_exp}');

    v_novo := jsonb_set(v_novo, '{retificacao_experimentais_e_ticket_2026_09}', jsonb_build_object(
      'aplicado_em', now(),
      'snapshot_anterior', v_snap.id,
      'antes', v_antes,
      'depois', v_depois,
      'motivo', '"Experimentais realizadas" passa a ser o status operacional do CRM (a mesma chave da v2 canônica, '
             || 'do relatório diário e da Mila); o denominador da taxa exp->mat fica em experimentais_confirmadas. '
             || 'Lista e tickets preservados como a foto do fechamento.'));

    -- guarda de escopo: fora de resumo e do bloco de retificação, o payload sai byte a byte igual
    if (v_novo - 'resumo' - 'retificacao_experimentais_e_ticket_2026_09')
       is distinct from
       (v_snap.payload - 'resumo' - 'retificacao_experimentais_e_ticket_2026_09')
    then
      raise exception 'RETIFICACAO_COMERCIAL_ESCOPO_EXCEDIDO unidade %', u.unidade_id;
    end if;
    -- ⚠️ parênteses obrigatórios: `-` precede `->`, e `'resumo' - text[]` viraria cast de json
    if ((v_novo->'resumo') - v_chaves_resumo) is distinct from ((v_snap.payload->'resumo') - v_chaves_resumo) then
      raise exception 'RETIFICACAO_COMERCIAL_RESUMO_ESCOPO_EXCEDIDO unidade %', u.unidade_id;
    end if;

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    ) values (
      p_ano, p_mes, 'unidade', u.unidade_id, 'relatorio_comercial_mensal', v_snap.versao + 1, v_snap.status,
      'retificacao_experimentais_status_operacional_v1', v_novo,
      public.hash_jsonb_canonico(v_novo), v_snap.financeiro_realizado_disponivel,
      format('retificacao append-only; snapshot anterior: %s', v_snap.id),
      v_snap.capturado_em, v_snap.capturado_por,
      now(), auth.uid(), now(), auth.uid()
    ) returning id into v_novo_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_novo_id, p_ano, p_mes, 'unidade', u.unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_comercial_mensal',
        'snapshot_anterior_id', v_snap.id,
        'payload_anterior_hash', v_snap.payload_hash,
        'antes', v_antes,
        'depois', v_depois
      ), auth.uid()
    );

    v_out := v_out || jsonb_build_object(
      'unidade_id', u.unidade_id, 'de', v_snap.versao, 'para', v_snap.versao + 1,
      'experimentais_antes', v_conf_antes, 'experimentais_depois', v_exp_status, 'snapshot_novo', v_novo_id);
  end loop;

  return jsonb_build_object('ano', p_ano, 'mes', p_mes, 'resultado', v_out);
end;
$$;

revoke all on function public.retificar_experimentais_status_operacional_v1(integer, integer) from public, anon, authenticated;
grant execute on function public.retificar_experimentais_status_operacional_v1(integer, integer) to service_role;

do $$
begin
  if to_regclass('public.fechamento_mensal_snapshots') is null then
    raise notice 'sem fechamento_mensal_snapshots neste banco — retificação pulada';
    return;
  end if;
  raise notice 'jun/2026: %', public.retificar_experimentais_status_operacional_v1(2026, 6);
  raise notice 'jul/2026: %', public.retificar_experimentais_status_operacional_v1(2026, 7);
end $$;
