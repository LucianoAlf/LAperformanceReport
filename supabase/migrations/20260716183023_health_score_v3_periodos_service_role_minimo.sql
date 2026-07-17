-- Health Score Professor V3 - menor privilegio na camada de periodos em sombra.
-- Escritas seguem exclusivamente pela RPC transacional SECURITY DEFINER.

revoke all on public.professor_periodos_reconstrucoes_v1 from service_role;
grant select on public.professor_periodos_reconstrucoes_v1 to service_role;

revoke all on public.professor_matricula_disciplina_periodos_v1 from service_role;
grant select on public.professor_matricula_disciplina_periodos_v1 to service_role;

revoke all on function public.materializar_periodos_professor_v1(
  uuid, date, date, text, text, jsonb, jsonb, uuid, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.materializar_periodos_professor_v1(
  uuid, date, date, text, text, jsonb, jsonb, uuid, integer, jsonb
) to service_role;
