-- O documento gerencial fechado nao pode recalcular o ranking mensal em tempo
-- de leitura. Esse ranking atravessa KPIs e presenca vivos e, sob a role
-- authenticated, pode exceder o teto da requisicao. Nao existe snapshot mensal
-- oficial para agosto/2026; portanto a ausencia precisa ser explicita, sem
-- fabricar resultado a partir de dados vivos.
--
-- A migration nao toca snapshots, dados de presenca, contratos de permissao ou
-- o conteudo administrativo/comercial fechado. O ajuste adicional de planner
-- protege o produtor legado de KPI, que ainda pode receber plano generico.
begin;

alter function public.get_kpis_professor_periodo_canonico(
  integer,
  integer,
  uuid,
  date,
  date
) set plan_cache_mode = 'force_custom_plan';

comment on function public.get_kpis_professor_periodo_canonico(
  integer,
  integer,
  uuid,
  date,
  date
) is 'Fonte canonica mensal de KPIs de professores; usa plano especifico por unidade e competencia para preservar a latencia dos consumidores autenticados.';

create or replace function public.get_relatorio_gerencial_canonico_comparativos_base_v1(
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
  v_rankings jsonb;
  v_mensais jsonb;
begin
  v_base := public.get_relatorio_gerencial_canonico_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  -- O fechamento nao possui um snapshot mensal oficial de rankings. Retornar
  -- indisponibilidade estruturada e preferivel a reprocessar a cadeia de
  -- presenca ao vivo e publicar uma classificacao que nao pertence ao corte.
  v_mensais := jsonb_build_object(
    'retencao', jsonb_build_object(
      'status', 'indisponivel',
      'tipo', 'fechamento_mensal',
      'motivo', 'ranking_mensal_sem_snapshot_fechado',
      'itens', '[]'::jsonb
    ),
    'matriculadores', jsonb_build_object(
      'status', 'indisponivel',
      'tipo', 'fechamento_mensal',
      'motivo', 'ranking_mensal_sem_snapshot_fechado',
      'itens', '[]'::jsonb
    ),
    'presenca', jsonb_build_object(
      'status', 'indisponivel',
      'tipo', 'fechamento_mensal',
      'motivo', 'ranking_mensal_sem_snapshot_fechado',
      'itens', '[]'::jsonb
    ),
    'media_turma', jsonb_build_object(
      'status', 'indisponivel',
      'tipo', 'fechamento_mensal',
      'motivo', 'ranking_mensal_sem_snapshot_fechado',
      'itens', '[]'::jsonb
    )
  );

  v_rankings := coalesce(v_base->'rankings', '{}'::jsonb);
  v_rankings := jsonb_set(v_rankings, '{mensais}', v_mensais, true);
  v_rankings := jsonb_set(
    v_rankings,
    '{destaques_mensais_parciais}',
    jsonb_build_object(
      'status', 'indisponivel',
      'motivo', 'fechamento_mensal_publicado'
    ),
    true
  );

  return jsonb_set(v_base, '{rankings}', v_rankings, true);
end;
$function$;

comment on function public.get_relatorio_gerencial_canonico_comparativos_base_v1(
  uuid,
  integer,
  integer
) is 'Compoe o relatorio gerencial fechado sem recalcular ranking mensal ao vivo; enquanto nao houver snapshot mensal oficial, retorna indisponibilidade estruturada.';

commit;
