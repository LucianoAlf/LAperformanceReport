-- FISC-55: o KPI `visitas` sumia do snapshot comercial POR UNIDADE.
--
-- O bloco `por_unidade` de get_kpis_comercial_canonicos_v2 monta um jsonb com 8
-- chaves e NAO publica `visitas`, embora a CTE `base` ja calcule a coluna
-- (`coalesce(vb.visitas, 0)::int AS visitas`). O bloco `kpis`, do consolidado,
-- publica -- e por isso o consolidado sempre esteve certo (29/28/28 em jun/jul/ago)
-- enquanto TODA unidade saiu zerada.
--
-- Efeito: montar_relatorio_comercial_mensal_payload_v1 faz
--     'visitas', coalesce((v_kpis->>'visitas')::integer, 0)
-- e a AUSENCIA da chave vira 0 em silencio. Os 18 snapshots
-- `relatorio_comercial_mensal` por unidade (jun/jul/ago x 3 unidades x 2 versoes)
-- foram enviados com "Visitas: 0". Reportado pela Vitoria (CG, agosto/2026).
--
-- ⚠️ `faltas` escapou do mesmo destino so porque tem 2a fonte
--    (`v_kpis_gerencial->>'faltaram'`). `visitas` e o UNICO KPI cujo coalesce
--    termina em literal 0 sem outra fonte -- por construcao, falha silenciosa.
--
-- ⚠️ NAO tem relacao com marcacao de presenca: o KPI conta
--    `status NOT IN ('cancelada','cancelado')`, entao 'agendada' ja contaria.
--    Mesmo com presenca marcada nas 28, o relatorio seguiria 0.
--
-- ⚠️ PATCH SOBRE A DEFINICAO VIVA, nunca copia da migration de junho: o banco e
--    a fonte de verdade. Fail-closed -- se a ancora nao aparecer exatamente 1x,
--    aborta sem tocar em nada.
--
-- ⚠️ Esta migration NAO conserta os snapshots ja gravados: sao fotos congeladas.
--    A retificacao de agosto e passo separado.
--
-- Nao inclui `experimentais_no_show` de proposito: `faltas` hoje resolve pelo
-- fallback do gerencial, e trocar a fonte poderia mudar o numero.

DO $do$
DECLARE
  v_def  text;
  v_anc  text;
  v_novo text;
  v_n    int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_kpis_comercial_canonicos_v2';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FISC55: get_kpis_comercial_canonicos_v2 nao encontrada';
  END IF;

  v_anc := $anc$          'conversoes_de_lead', conversoes_de_lead,
          'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca
        )$anc$;

  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FISC55: ancora aparece % vez(es), esperado 1 -- abortado', v_n;
  END IF;

  v_novo := replace(v_def, v_anc, $sub$          'conversoes_de_lead', conversoes_de_lead,
          'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
          'visitas', visitas
        )$sub$);

  EXECUTE v_novo;
END
$do$;

-- Prova: a chave passa a existir no por_unidade.
DO $chk$
DECLARE v_tem boolean;
BEGIN
  SELECT (public.get_kpis_comercial_canonicos_v2(NULL, 2026, 8, 'mensal', NULL)
            -> 'por_unidade' -> 0) ? 'visitas'
    INTO v_tem;
  IF NOT v_tem THEN
    RAISE EXCEPTION 'FISC55: por_unidade continua sem a chave visitas';
  END IF;
END
$chk$;
