-- P0.1S - Materializacao de campos de retencao na origem
-- Data: 2026-06-09
--
-- Arquivo executavel.
--
-- Objetivo:
-- - Para novas evasoes/nao-renovacoes em movimentacoes_admin, preencher campos
--   operacionais que alimentam MRR perdido, tempo de permanencia e LTV.
-- - Nao recalcula historico, nao faz backfill e nao altera dados_mensais.
--
-- Regras:
-- - Nunca sobrescrever valor_parcela_evasao informado manualmente.
-- - Nunca sobrescrever tempo_permanencia_meses informado manualmente.
-- - Usar aluno_id quando existir; senao tentar nome normalizado + unidade.
-- - O fallback de leitura no frontend/Edge continua existindo como seguranca,
--   mas novos registros ja devem nascer completos.

CREATE OR REPLACE FUNCTION public.preencher_campos_retencao_movimentacoes_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aluno_id integer;
  v_valor_parcela numeric;
  v_data_matricula date;
  v_data_mov date;
  v_meses numeric;
BEGIN
  IF NEW.tipo NOT IN ('evasao', 'nao_renovacao') THEN
    RETURN NEW;
  END IF;

  v_data_mov := COALESCE(NEW.data, CURRENT_DATE);

  IF NEW.aluno_id IS NOT NULL THEN
    SELECT a.id, a.valor_parcela, a.data_matricula
      INTO v_aluno_id, v_valor_parcela, v_data_matricula
    FROM public.alunos a
    WHERE a.id = NEW.aluno_id
    LIMIT 1;
  END IF;

  IF v_aluno_id IS NULL AND NEW.aluno_nome IS NOT NULL AND NEW.unidade_id IS NOT NULL THEN
    SELECT a.id, a.valor_parcela, a.data_matricula
      INTO v_aluno_id, v_valor_parcela, v_data_matricula
    FROM public.alunos a
    WHERE a.unidade_id = NEW.unidade_id
      AND lower(trim(a.nome)) = lower(trim(NEW.aluno_nome))
    ORDER BY
      CASE WHEN a.status IN ('ativo', 'aviso_previo', 'trancado') THEN 0 ELSE 1 END,
      a.data_saida DESC NULLS LAST,
      a.data_matricula ASC NULLS LAST,
      a.id ASC
    LIMIT 1;
  END IF;

  IF NEW.valor_parcela_evasao IS NULL THEN
    NEW.valor_parcela_evasao := COALESCE(
      NEW.valor_parcela_anterior,
      NEW.valor_parcela_novo,
      v_valor_parcela
    );
  END IF;

  IF NEW.tempo_permanencia_meses IS NULL AND v_data_matricula IS NOT NULL THEN
    v_meses :=
      (date_part('year', age(v_data_mov, v_data_matricula)) * 12)
      + date_part('month', age(v_data_mov, v_data_matricula));

    NEW.tempo_permanencia_meses := GREATEST(0, floor(v_meses))::integer;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preencher_campos_retencao_movimentacoes_admin ON public.movimentacoes_admin;

CREATE TRIGGER trg_preencher_campos_retencao_movimentacoes_admin
  BEFORE INSERT OR UPDATE OF
    tipo,
    data,
    aluno_id,
    aluno_nome,
    unidade_id,
    valor_parcela_anterior,
    valor_parcela_novo,
    valor_parcela_evasao,
    tempo_permanencia_meses
  ON public.movimentacoes_admin
  FOR EACH ROW
  EXECUTE FUNCTION public.preencher_campos_retencao_movimentacoes_admin();

COMMENT ON FUNCTION public.preencher_campos_retencao_movimentacoes_admin() IS
'Preenche valor_parcela_evasao e tempo_permanencia_meses em novas evasoes/nao-renovacoes sem sobrescrever valores manuais. P0.1S.';

COMMENT ON TRIGGER trg_preencher_campos_retencao_movimentacoes_admin ON public.movimentacoes_admin IS
'Materializa campos de retencao na origem para MRR perdido, permanencia e LTV.';
