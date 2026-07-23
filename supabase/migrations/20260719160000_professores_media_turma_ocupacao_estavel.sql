-- Restaura a regra aprovada da media por turma sem reabrir o falso positivo
-- de reagendamentos. A carteira continua contando pessoas; a ocupacao conta
-- pessoa x turma somente quando a identidade da turma e estavel.

do $migration$
declare
  v_function regprocedure :=
    'public.get_carteira_professor_periodo_canonica(integer,integer,uuid,date,date)'::regprocedure;
  v_definition text;
  v_marker_position integer;
  v_prefix text;
  v_suffix text;
  v_person_expression constant text :=
    'COUNT(DISTINCT b.pessoa_chave)';
  v_occupation_expression constant text := $expression$COUNT(DISTINCT jsonb_build_array(
        b.pessoa_chave,
        CASE
          WHEN b.fonte = 'jornada'
            OR b.turma_chave LIKE 'turma:%'
            OR b.turma_chave ~ '^individual:[0-9]+$'
          THEN b.turma_chave
          ELSE NULL
        END
      ))$expression$;
  v_occurrences integer;
begin
  select pg_get_functiondef(v_function::oid)
    into v_definition;

  v_marker_position := strpos(lower(v_definition), 'turmas_calc as (');
  if v_marker_position = 0 then
    raise exception
      'Definicao inesperada de get_carteira_professor_periodo_canonica: turmas_calc ausente';
  end if;

  v_prefix := left(v_definition, v_marker_position - 1);
  v_suffix := substring(v_definition from v_marker_position);
  v_occurrences := (
    length(v_suffix) - length(replace(v_suffix, v_person_expression, ''))
  ) / length(v_person_expression);

  if v_occurrences <> 2 then
    raise exception
      'Definicao inesperada de get_carteira_professor_periodo_canonica: esperadas 2 expressoes de ocupacao, encontradas %',
      v_occurrences;
  end if;

  v_definition := v_prefix || replace(
    v_suffix,
    v_person_expression,
    v_occupation_expression
  );

  execute v_definition;
end;
$migration$;

revoke all on function public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) from public, anon, authenticated;
grant execute on function public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) to service_role;

comment on function public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) is
  'Carteira por pessoa; media por ocupacoes pessoa/turma com identidade estavel. Turmas de banda ficam excluidas e fallback temporal de reagendamento nao multiplica ocupacoes.';
