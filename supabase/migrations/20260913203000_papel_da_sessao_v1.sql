-- papel_da_sessao_v1 (13/09/2026): "quem é o portador deste bearer?" respondido pelo
-- PostgREST, que valida a assinatura do JWT (ou traduz a chave `sb_secret_*`) e fixa o
-- papel. A edge relatorio-admin-whatsapp usa isto para aceitar o crachá da Mila
-- (service_role) nos modos dry_run sem comparar strings de chave — comparar não serve
-- quando a chave da VPS é `sb_secret_…` e a do runtime é o JWT legado: são o mesmo
-- direito com formatos diferentes.
--
-- Devolve só o nome do papel; executável por qualquer papel de propósito (é o que
-- torna a pergunta respondível para anon, authenticated e service_role).
create or replace function public.papel_da_sessao_v1()
returns text
language sql
stable
as $$
  select coalesce(auth.role(), current_user::text)
$$;

comment on function public.papel_da_sessao_v1() is
  'Papel do bearer que chegou pelo PostgREST (anon | authenticated | service_role). Usado pela edge relatorio-admin-whatsapp para reconhecer o crachá da Mila nos modos dry_run.';

grant execute on function public.papel_da_sessao_v1() to anon, authenticated, service_role;
