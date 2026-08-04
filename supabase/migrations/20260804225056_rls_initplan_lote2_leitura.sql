-- Lote 2: envolve chamadas de funcao SEM argumento em (select ...) para virarem
-- InitPlan (1x por query) em vez de serem reavaliadas por linha.
-- Semantica identica: sao STABLE e nao dependem da linha.
-- NAO tocamos em funcoes que recebem coluna como argumento
-- (passagem_bastao_is_professor, usuario_tem_permissao) - essas SAO correlacionadas.
--
-- Equivalencia provada com `set local role authenticated` + JWT real nos 3 perfis:
--   admin      -> ve o total de cada tabela
--   unidade CG -> metas 2, renov 219, crm_hist 91, relped 1, vcards 1 (= count sem RLS)
--   professor  -> metas 2, renov 144, crm_hist 38, relped 7, vcards 1 (= Recreio)
--
-- Ganho: renovacoes_legado 30 ms -> 1 ms; crm_lead_historico 27 ms -> 9 ms.
-- ATENCAO: nao afeta as RPCs de KPI, que sao SECURITY DEFINER (RLS nao se aplica dentro).

-- SELECT escopadas por unidade
alter policy metas_select_policy on public.metas
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy movimentacoes_select_policy on public.movimentacoes
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy relatorios_diarios_select_policy on public.relatorios_diarios
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy relped_select_policy on public.relatorios_pedagogicos
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy renovacoes_select_policy on public.renovacoes_legado
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy salas_select on public.salas
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

alter policy vcards_unidade_select on public.vcards_unidade
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

-- SELECT via join em leads
alter policy crm_followups_select on public.crm_followups
  using ((select public.is_admin()) or exists (
    select 1 from public.leads
    where leads.id = crm_followups.lead_id
      and leads.unidade_id in (select public.get_user_unidade_ids())));

alter policy crm_lead_historico_select on public.crm_lead_historico
  using ((select public.is_admin()) or exists (
    select 1 from public.leads
    where leads.id = crm_lead_historico.lead_id
      and leads.unidade_id in (select public.get_user_unidade_ids())));

-- SELECT simples de admin
alter policy "Auditoria: admin pode ver" on public.auditoria_acesso
  using ((select public.is_admin()));

alter policy "Usuario_perfis: usuário vê próprios" on public.usuario_perfis
  using (usuario_id in (select usuarios.id from public.usuarios
                        where usuarios.auth_user_id = (select auth.uid()))
         or (select public.is_admin()));

-- fn_professor_do_usuario() e is_admin() sem argumento; usuario_tem_permissao
-- recebe unidade_id (coluna) e por isso fica como esta.
alter policy disponibilidade_propostas_leitura on public.disponibilidade_professor_propostas
  using (professor_id = (select public.fn_professor_do_usuario())
         or (select public.is_admin())
         or public.usuario_tem_permissao(
              (select u.id from public.usuarios u where u.auth_user_id = (select auth.uid()) limit 1),
              'professores.ver'::character varying,
              unidade_id));

-- ALL (cobre SELECT) de tabelas de apoio muito lidas
alter policy "Perfil_permissoes: admin pode tudo" on public.perfil_permissoes
  using ((select public.is_admin()));

alter policy "Perfis: admin pode tudo" on public.perfis
  using ((select public.is_admin()));

alter policy "Permissoes: admin pode tudo" on public.permissoes
  using ((select public.is_admin()));

alter policy "Usuario_perfis: admin pode tudo" on public.usuario_perfis
  using ((select public.is_admin()));

alter policy admin_unidades_cursos on public.unidades_cursos
  using ((select public.is_admin()));

alter policy admin_professor_360_ocorrencias_log on public.professor_360_ocorrencias_log
  using ((select public.is_admin()));

alter policy admin_programa_fideliza_config on public.programa_fideliza_config
  using ((select public.is_admin()));

alter policy admin_programa_fideliza_experiencias on public.programa_fideliza_experiencias
  using ((select public.is_admin()));

alter policy admin_programa_fideliza_historico on public.programa_fideliza_historico
  using ((select public.is_admin()));

alter policy admin_programa_fideliza_penalidades on public.programa_fideliza_penalidades
  using ((select public.is_admin()));
