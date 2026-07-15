-- Restauracao defensiva da regra validada pela coordenacao para o fechamento:
-- media oficial = pessoas regulares unicas / turmas regulares elegiveis.
--
-- A tentativa de contar pares pessoa/turma revelou falsos pares em aulas
-- reagendadas sem turma_nome. A regra de ocupacao fica em auditoria de sombra;
-- ela nao pode contaminar o KPI oficial enquanto transicoes e reagendamentos
-- nao estiverem temporalmente normalizados.

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.get_carteira_professor_periodo_canonica(integer,integer,uuid,date,date)'::regprocedure;
  v_definition text;
  v_pair_expression constant text :=
    'COUNT(DISTINCT (b.pessoa_chave, b.turma_chave))';
  v_person_expression constant text :=
    'COUNT(DISTINCT b.pessoa_chave)';
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef(v_function::oid)
  INTO v_definition;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_pair_expression, ''))
  ) / length(v_pair_expression);

  IF v_occurrences <> 2 THEN
    RAISE EXCEPTION
      'Definicao inesperada de get_carteira_professor_periodo_canonica: esperadas 2 expressoes pessoa/turma, encontradas %',
      v_occurrences;
  END IF;

  v_definition := replace(
    v_definition,
    v_pair_expression,
    v_person_expression
  );

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) TO service_role;

COMMENT ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) IS 'Carteira e media por pessoas regulares unicas; turmas de banda excluidas. Ocupacoes pessoa/turma permanecem em auditoria ate normalizar reagendamentos.';
