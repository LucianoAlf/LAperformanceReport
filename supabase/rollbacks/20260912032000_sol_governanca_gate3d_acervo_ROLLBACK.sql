-- Rollback destrutivo do schema Gate 3D. Antes de usar em ambiente com dados,
-- exporte o acervo e valide a cadeia com sol_governanca_verificar_acervo_v1().

drop function if exists public.sol_governanca_readback_v1();
drop function if exists public.sol_governanca_verificar_acervo_v1();
drop function if exists public.sol_governanca_registrar_rodada_v1(text,timestamptz,timestamptz,text,jsonb,text);
drop function if exists public.sol_governanca_append_evento_interno_v1(text,text,text,text,text,jsonb,text);
drop table if exists public.sol_governanca_eventos;
drop function if exists public.sol_governanca_payload_sanitizado_v1(jsonb);
drop function if exists public.sol_governanca_bloquear_mutacao_v1();
