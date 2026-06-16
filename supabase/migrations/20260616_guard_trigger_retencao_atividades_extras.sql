-- ============================================
-- Migration: Guard em trigger auxiliar de retenção para atividades extras
-- Segurança: não altera dados. Apenas redefine função trigger.
-- ============================================

CREATE OR REPLACE FUNCTION public.preencher_campos_retencao_movimentacoes_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno_id integer;
  v_valor_parcela numeric;
  v_data_matricula date;
  v_data_mov date;
  v_meses numeric;
  v_curso_id integer;
BEGIN
  IF NEW.tipo NOT IN ('evasao', 'nao_renovacao') THEN
    RETURN NEW;
  END IF;

  v_data_mov := COALESCE(NEW.data, CURRENT_DATE);
  v_curso_id := NEW.curso_id;

  IF v_curso_id IS NULL AND NEW.aluno_id IS NOT NULL THEN
    SELECT a.curso_id INTO v_curso_id
    FROM public.alunos a
    WHERE a.id = NEW.aluno_id
    LIMIT 1;
  END IF;

  IF public.is_atividade_extra_curso(v_curso_id) THEN
    RETURN NEW;
  END IF;

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
$function$;
