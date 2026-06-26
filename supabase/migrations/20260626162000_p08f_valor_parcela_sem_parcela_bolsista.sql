-- P08F: impede que preco de tabela vire parcela/MRR para bolsista integral
-- ou contrato sem parcela. A regra comercial continua:
-- regular cobravel = valor_cheio - desconto_condicional.

CREATE OR REPLACE FUNCTION public.aplicar_valor_parcela_comercial_canonico()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  campo_fixado boolean := false;
  tipo_codigo text;
BEGIN
  IF NEW.valor_cheio IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.matriculas_campos_fixados f
      WHERE f.aluno_id = NEW.id
        AND f.campo = 'valor_parcela'
    ) INTO campo_fixado;
  END IF;

  IF campo_fixado THEN
    RETURN NEW;
  END IF;

  SELECT tm.codigo
    INTO tipo_codigo
  FROM public.tipos_matricula tm
  WHERE tm.id = NEW.tipo_matricula_id;

  IF tipo_codigo = 'BOLSISTA_INT'
     OR NEW.tipo_aluno = 'bolsista_integral'
     OR NEW.status_pagamento = 'sem_parcela' THEN
    NEW.valor_parcela := 0;
    RETURN NEW;
  END IF;

  NEW.valor_parcela := round((NEW.valor_cheio - coalesce(NEW.desconto_condicional, 0))::numeric, 2);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_alunos_valor_parcela_comercial_emusys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  campo_fixado boolean := false;
  tipo_codigo text;
BEGIN
  IF NEW.valor_cheio IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.matriculas_campos_fixados mcf
      WHERE mcf.aluno_id = NEW.id
        AND mcf.campo = 'valor_parcela'
    ) INTO campo_fixado;
  END IF;

  IF campo_fixado THEN
    RETURN NEW;
  END IF;

  SELECT tm.codigo
    INTO tipo_codigo
  FROM public.tipos_matricula tm
  WHERE tm.id = NEW.tipo_matricula_id;

  IF tipo_codigo = 'BOLSISTA_INT'
     OR NEW.tipo_aluno = 'bolsista_integral'
     OR NEW.status_pagamento = 'sem_parcela' THEN
    NEW.valor_parcela := 0;
    RETURN NEW;
  END IF;

  NEW.valor_parcela := round((NEW.valor_cheio - coalesce(NEW.desconto_condicional, 0))::numeric, 2);
  RETURN NEW;
END;
$function$;
