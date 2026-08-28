-- Integra a auditoria de portas do LA Teacher com os helpers privados criados
-- pelo rollout canônico. A auditoria trata toda função app_* sem o marcador
-- [interna] como uma porta que precisa de EXECUTE para authenticated.
--
-- Estes três entrypoints são implementações chamadas apenas pelos wrappers
-- públicos app_minha_agenda_sessao e app_registrar_presencas_aula. Mantê-los
-- privados é deliberado; o marcador evita um falso alarme sem abrir ACL.

begin;

comment on function public.app_minha_agenda_sessao_publicacao_legado_v1(date) is
  '[interna] Implementação legado preservada para sombra e rollback; acessível somente pelo wrapper governado app_minha_agenda_sessao.';

comment on function public.app_registrar_presencas_aula_canonica_v2_interno(
  uuid, integer, integer[]
) is
  '[interna] Implementação canônica privada da escrita do LA Teacher; acessível somente pelo wrapper governado app_registrar_presencas_aula.';

comment on function public.app_registrar_presencas_aula_publicacao_legado_v1(
  integer, integer[], uuid
) is
  '[interna] Implementação legado privada da escrita do LA Teacher; acessível somente pelo wrapper governado app_registrar_presencas_aula.';

commit;
