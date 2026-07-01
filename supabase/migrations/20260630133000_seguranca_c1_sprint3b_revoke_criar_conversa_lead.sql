-- C1 Sprint 3 (complemento): criar_conversa_lead — sem uso identificado (0 chamadas,
-- ausente no repo, nenhuma função a referencia). Revoga PUBLIC/anon; mantém
-- authenticated/service_role/postgres. Rollback no arquivo de baseline se necessário.
REVOKE EXECUTE ON FUNCTION public.criar_conversa_lead(p_lead_id integer, p_atribuido_a character varying) FROM PUBLIC, anon;
