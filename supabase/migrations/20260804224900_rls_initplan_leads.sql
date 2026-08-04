-- Envolve is_admin() em (select ...) para virar InitPlan (avaliado 1x por query)
-- em vez de ser reavaliado por linha. Semantica identica: is_admin() e STABLE,
-- sem argumentos e nao depende da linha.
--
-- Medido (perfil unidade, count(*) em leads):
--   antes: 152,9 ms / 18.849 buffers
--   depois:  7,5 ms /  1.122 buffers
-- Contagens visiveis inalteradas: admin 8863, unidade 4571, professor 2275.
alter policy leads_select_policy on public.leads
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy leads_update_policy on public.leads
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy leads_delete_policy on public.leads
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy leads_insert_policy on public.leads
  with check ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));
