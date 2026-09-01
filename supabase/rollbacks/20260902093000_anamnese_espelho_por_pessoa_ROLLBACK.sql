-- ROLLBACK da migration 20260902093000_anamnese_espelho_por_pessoa.sql (LAPE-19).
-- Corpo das duas funcoes como estavam em producao ANTES da substituicao,
-- capturado por pg_get_functiondef em 02/09/2026.
--
-- ⚠️ O flag ligado nas 24 linhas PERMANECE ligado apos o rollback -- e o
-- comportamento correto (a pessoa preencheu mesmo), nao residuo a limpar.

drop trigger if exists trg_alunos_vinculo_emusys_anamnese on public.alunos;
drop function if exists public.fn_alunos_vinculo_emusys_anamnese();

CREATE OR REPLACE FUNCTION public.fn_atualizar_aluno_anamnese()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.aluno_id IS NOT NULL AND NEW.status = 'completa' THEN
    UPDATE alunos SET
      anamnese_preenchida = true,
      anamnese_preenchida_em = NOW(),
      temperamento_codinome = NEW.temperamento_codinome,
      updated_at = NOW()
    WHERE id = NEW.aluno_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_vincular_anamnese_pendente()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE anamneses SET
    aluno_id = NEW.id,
    vinculo_status = 'vinculado'
  WHERE vinculo_status = 'pendente'
    AND aluno_id IS NULL
    AND unidade_id = NEW.unidade_id
    AND LOWER(TRIM(nome_aluno)) = LOWER(TRIM(NEW.nome))
    AND tipo_formulario = NEW.classificacao;

  IF FOUND THEN
    UPDATE alunos SET
      anamnese_preenchida = true,
      anamnese_preenchida_em = NOW(),
      temperamento_codinome = (
        SELECT temperamento_codinome FROM anamneses
        WHERE aluno_id = NEW.id AND status = 'completa'
        LIMIT 1
      )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

drop function if exists public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text);
