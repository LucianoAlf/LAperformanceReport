begin;
drop policy if exists carreira_sol_readonly on public.colaborador_carreira;
revoke select on public.colaborador_carreira from sol_acesso_restrito;
drop policy if exists carreira_versoes_admin on public.colaborador_carreira_versoes;
drop policy if exists carreira_escrita_dono on public.colaborador_carreira;
drop policy if exists carreira_leitura on public.colaborador_carreira;
drop table if exists public.colaborador_carreira_versoes;
drop table if exists public.colaborador_carreira;
commit;
