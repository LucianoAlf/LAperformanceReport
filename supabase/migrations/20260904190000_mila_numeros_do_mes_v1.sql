-- Os numeros do MES para a consultora — MESMA fonte do relatorio comercial.
--
-- Faltava a Mila saber falar do mes, nao so do dia: leads entrantes, funil,
-- canais, cursos, ticket e passaportes. Nada precisou ser criado: o relatorio
-- diario/mensal ja le `get_kpis_comercial_canonicos_v2` + `metas_kpi`, e e
-- exatamente o que esta funcao consome — assim a Mila e o relatorio nunca
-- divergem (pedido do Luciano depois do episodio "30 x 24").
--
-- 🔴 MES FECHADO VEM DO SNAPSHOT, nao do calculo ao vivo. Comparado com o
-- relatorio que a equipe recebeu (Recreio/ago): o vivo dava leads 279 contra
-- 278, experimentais 61 contra 51 e faltas 24 contra 17. Nao e erro de nenhum
-- dos dois — o relatorio e uma FOTO de 01/09 15:53 e o banco continuou andando
-- (lead com data de agosto cadastrado depois, status de experimental que mudou).
-- Mas a consultora recebeu 51: se a Mila disser 61, ela desconfia dos dois.
-- Regra: snapshot fechado/retificado -> usa ele e diz que e oficial; nao existe
-- (mes corrente) -> ao vivo, e diz que e parcial.
--
-- ⚠️ `experimentais_realizadas_status_operacional` e STATUS, nao presenca
-- confirmada; o bloco `gaps` da canonica vai junto, para a Mila poder dizer
-- "tem N sem presenca confirmada" em vez de fingir precisao que nao existe.
create or replace function public.mila_numeros_do_mes_v1(
  p_solicitante_telefone text,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare
  q record; v_un uuid; v_un_nome text; v_mes jsonb; v_dia jsonb; v_metas jsonb; v_snap jsonb;
  v_leads int; v_exp int; v_mat int; v_ticket numeric; v_fonte text; v_bloco jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade', 'solicitante', q.nome); end if;
  select nome into v_un_nome from unidades where id = v_un;

  select s.payload->'resumo' into v_snap
    from fechamento_mensal_snapshots s
   where s.dominio = 'relatorio_comercial_mensal' and s.unidade_id = v_un
     and s.ano = p_ano and s.mes = p_mes and s.status in ('fechado','retificado')
   order by s.versao desc limit 1;

  v_dia := get_kpis_comercial_canonicos_v2(v_un, p_ano, p_mes, 'diario',
             (now() at time zone 'America/Sao_Paulo')::date);
  select jsonb_object_agg(tipo, valor) into v_metas
    from metas_kpi where unidade_id = v_un and ano = p_ano and mes = p_mes;
  v_metas := coalesce(v_metas, '{}'::jsonb);

  if v_snap is not null then
    v_fonte := 'fechamento oficial do mes (o MESMO numero do relatorio que a equipe recebeu)';
    v_leads := coalesce((v_snap->>'leads')::int, 0);
    v_exp   := coalesce((v_snap->>'experimentais')::int, 0);
    v_mat   := coalesce((v_snap->>'matriculas')::int, 0);
    v_bloco := jsonb_build_object(
      'leads', v_leads, 'meta_leads', v_metas->'leads',
      'experimentais_realizadas', v_exp, 'meta_experimentais', v_metas->'experimentais',
      'faltas', v_snap->'faltas', 'visitas', v_snap->'visitas',
      'matriculas', v_mat, 'meta_matriculas', v_metas->'matriculas',
      'ticket_medio_parcela', v_snap->'ticket_medio_parcela', 'meta_ticket', v_metas->'ticket_parcela',
      'passaportes_total', v_snap->'total_passaportes',
      'ticket_medio_passaporte', v_snap->'ticket_medio_passaporte',
      'parcelas_contratadas', v_snap->'total_parcelas');
    v_mes := get_kpis_comercial_canonicos_v2(v_un, p_ano, p_mes);  -- só para canais/cursos
    return jsonb_build_object(
      'ok', true, 'solicitante', q.nome, 'unidade', v_un_nome, 'fechado', true,
      'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
      'mes', v_bloco,
      'funil', jsonb_build_object(
        'lead_para_experimental', v_snap->'taxa_lead_exp', 'meta_lead_para_experimental', v_metas->'taxa_lead_exp',
        'experimental_para_matricula', v_snap->'taxa_exp_mat', 'meta_experimental_para_matricula', v_metas->'taxa_exp_mat',
        'lead_para_matricula', v_snap->'taxa_lead_mat', 'meta_lead_para_matricula', v_metas->'taxa_conversao'),
      'hoje', jsonb_build_object(
        'leads', v_dia #> '{kpis,leads_entrantes}',
        'experimentais_realizadas', v_dia #> '{kpis,experimentais_realizadas_status_operacional}',
        'faltas', v_dia #> '{kpis,experimentais_no_show}',
        'canceladas', v_dia #> '{kpis,experimentais_canceladas}',
        'matriculas', v_dia #> '{kpis,matriculas_comerciais_principais}',
        'passaportes_total', v_dia #> '{kpis,passaportes_total}'),
      'canais_do_mes', v_mes->'origem_canal', 'cursos_do_mes', v_mes->'cursos_mais_procurados',
      'fonte', v_fonte);
  end if;

  -- mes corrente: ao vivo
  v_mes := get_kpis_comercial_canonicos_v2(v_un, p_ano, p_mes);
  v_leads  := coalesce((v_mes #>> '{kpis,leads_entrantes}')::int, 0);
  v_exp    := coalesce((v_mes #>> '{kpis,experimentais_realizadas_status_operacional}')::int, 0);
  v_mat    := coalesce((v_mes #>> '{kpis,matriculas_comerciais_principais}')::int, 0);
  v_ticket := (select round(avg(nullif(m.valor_parcela, 0)), 2)
                 from matriculas_comerciais_v1(v_un, make_date(p_ano, p_mes, 1),
                        (make_date(p_ano, p_mes, 1) + interval '1 month')::date) m
                where m.conta);

  return jsonb_build_object(
    'ok', true, 'solicitante', q.nome, 'unidade', v_un_nome, 'fechado', false,
    'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
    'mes', jsonb_build_object(
      'leads', v_leads, 'meta_leads', v_metas->'leads',
      'experimentais_realizadas', v_exp, 'meta_experimentais', v_metas->'experimentais',
      'experimentais_agendadas', v_mes #> '{kpis,experimentais_agendadas_periodo}',
      'faltas', v_mes #> '{kpis,experimentais_no_show}',
      'canceladas', v_mes #> '{kpis,experimentais_canceladas}',
      'visitas', v_mes #> '{kpis,visitas}',
      'matriculas', v_mat, 'meta_matriculas', v_metas->'matriculas',
      'ticket_medio_parcela', v_ticket, 'meta_ticket', v_metas->'ticket_parcela',
      'passaportes_total', v_mes #> '{kpis,passaportes_total}',
      'ticket_medio_passaporte', v_mes #> '{kpis,ticket_medio_passaporte}'),
    'funil', jsonb_build_object(
      'lead_para_experimental', case when v_leads > 0 then round(v_exp::numeric * 100 / v_leads, 1) end,
      'meta_lead_para_experimental', v_metas->'taxa_lead_exp',
      'experimental_para_matricula', case when v_exp > 0 then round(v_mat::numeric * 100 / v_exp, 1) end,
      'meta_experimental_para_matricula', v_metas->'taxa_exp_mat',
      'lead_para_matricula', case when v_leads > 0 then round(v_mat::numeric * 100 / v_leads, 1) end,
      'meta_lead_para_matricula', v_metas->'taxa_conversao'),
    'hoje', jsonb_build_object(
      'leads', v_dia #> '{kpis,leads_entrantes}',
      'experimentais_realizadas', v_dia #> '{kpis,experimentais_realizadas_status_operacional}',
      'faltas', v_dia #> '{kpis,experimentais_no_show}',
      'canceladas', v_dia #> '{kpis,experimentais_canceladas}',
      'matriculas', v_dia #> '{kpis,matriculas_comerciais_principais}',
      'passaportes_total', v_dia #> '{kpis,passaportes_total}'),
    'canais_do_mes', v_mes->'origem_canal', 'cursos_do_mes', v_mes->'cursos_mais_procurados',
    'ressalvas', v_mes->'gaps',
    'fonte', 'ao vivo — mes ainda nao fechou, entao o numero ainda muda'
  );
end $function$;

revoke all on function public.mila_numeros_do_mes_v1(text,int,int) from public, anon, authenticated;
grant execute on function public.mila_numeros_do_mes_v1(text,int,int) to service_role, mila_acesso_restrito;
