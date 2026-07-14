-- Mantem a carteira canonica encapsulada na RPC agregada usada pelo frontend.
-- As tabelas de roster/presenca nao precisam ser expostas ao papel authenticated.

ALTER FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) SECURITY DEFINER;

ALTER FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) SET search_path = public;

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) TO service_role;

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
  integer, integer, uuid, date, date
) TO service_role;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) IS 'Fonte agregada canonica de KPIs de professores. Executa como owner para preservar RLS das tabelas internas sem expo-las ao navegador.';
