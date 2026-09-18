-- ALTER DEFAULT PRIVILEGES do schema public concede EXECUTE a authenticated em toda
-- funcao nova, entao o grant nominal para service_role nao basta: a funcao nasceu
-- executavel por qualquer usuario logado. Ela ENFILEIRA ENVIO DE WHATSAPP, entao
-- precisa de revoke nominal. Mesma armadilha ja documentada no CLAUDE.md para anon.
-- ACL correta ao final: {postgres=X, service_role=X}
revoke execute on function public.fn_enfileirar_resumo_mensal_presenca_v1(integer, integer, boolean, boolean)
  from authenticated, anon, public;
