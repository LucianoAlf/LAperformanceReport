-- A funcao antiga permanece apenas como implementacao interna do wrapper P24.
-- O rename preservou os grants anteriores; removemos a chamada direta para
-- impedir que consumidores autenticados contornem os rankings canonicos.

revoke all on function
  public.get_dados_relatorio_gerencial_legacy_rankings_p24_20260719(
    uuid, integer, integer
  )
  from public, anon, authenticated, fabio_agent, service_role;

comment on function
  public.get_dados_relatorio_gerencial_legacy_rankings_p24_20260719(
    uuid, integer, integer
  ) is
  'Implementacao interna legada do relatorio gerencial P24. Sem EXECUTE para papeis de API; consumir public.get_dados_relatorio_gerencial.';
