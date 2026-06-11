-- ============================================================================
-- DRAFT ONLY - NAO APLICAR SEM APPROVE EXPLICITO DO ALF
-- ============================================================================
-- Projeto: LA Music Report / Sol
-- Fase: P0.1 Fase 1A - marcacao documental de candidatos deprecated
-- Data: 2026-06-10
--
-- Este arquivo e um rascunho versionado para revisao humana.
-- Ele NAO foi aplicado no banco.
-- Ele NAO deve ser executado automaticamente por pipeline de migration.
--
-- Proibido nesta fase:
-- - DROP
-- - ALTER estrutural
-- - CREATE OR REPLACE
-- - UPDATE/DELETE/INSERT
-- - backfill
--
-- Objetivo:
-- marcar documentalmente objetos candidatos a deprecacao futura, sem mudar
-- comportamento runtime.
--
-- Pre-condicoes antes de aplicar em fase futura:
-- 1. confirmar projeto ativo ouqwbbermlzqqvtqwlul;
-- 2. confirmar zero consumidores runtime novos;
-- 3. confirmar smoke tests de Dashboard, Analytics, Administrativo, WhatsApp,
--    IA/Gemini, Fideliza+, Professores e Comercial;
-- 4. confirmar que wrappers publicos ainda nao serao removidos;
-- 5. confirmar APPROVE explicito do Alf para COMMENT-only.
-- ============================================================================

comment on view public.vw_kpis_gestao_mensal is
'DEPRECATED_CANDIDATE P0.1: nao usar como fonte canonica de KPIs executivos de alunos. Historico fechado usa dados_mensais; mes atual aberto usa get_kpis_alunos_canonicos/calculo vivo canonico. Nao remover enquanto get_dados_relatorio_gerencial_legacy_p01g ou get_dados_retencao_ia_legacy_p01g consumirem.';

comment on view public.vw_kpis_retencao_mensal is
'DEPRECATED_CANDIDATE P0.1: nao usar como fonte canonica de retencao/alunos em novas implementacoes. Nao remover enquanto get_dados_relatorio_gerencial_legacy_p01g ou get_dados_retencao_ia_legacy_p01g consumirem.';

comment on function public.get_dados_relatorio_gerencial_legacy_p01g(uuid, integer, integer) is
'DEPRECATED_CANDIDATE P0.1: manter somente como rollback enquanto get_dados_relatorio_gerencial ainda preservar shape antigo via wrapper. Futuro: flatten do wrapper publico sem dependencia legacy_p01g.';

comment on function public.get_dados_retencao_ia_legacy_p01g(uuid, integer, integer) is
'DEPRECATED_CANDIDATE P0.1: manter somente como rollback enquanto get_dados_retencao_ia ainda preservar shape antigo via wrapper. Futuro: flatten do wrapper publico sem dependencia legacy_p01g.';

comment on view public.vw_dashboard_unidade is
'DEPRECATED_CANDIDATE P0.1: sem consumidor runtime confirmado no banco; referencia morta TabDashboard removida do frontend na Fase 1A. Manter em observacao antes de qualquer DROP.';

-- ============================================================================
-- Checklist SELECT-only sugerido antes de executar este rascunho em fase futura
-- ============================================================================
--
-- select pg_get_viewdef('public.vw_dashboard_unidade'::regclass, true);
--
-- select p.oid::regprocedure::text
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and pg_get_functiondef(p.oid) ilike any(array[
--     '%vw_kpis_gestao_mensal%',
--     '%vw_kpis_retencao_mensal%',
--     '%vw_dashboard_unidade%',
--     '%legacy_p01g%'
--   ])
-- order by 1;
--
-- select schemaname, viewname
-- from pg_views
-- where schemaname = 'public'
--   and definition ilike any(array[
--     '%vw_kpis_gestao_mensal%',
--     '%vw_kpis_retencao_mensal%',
--     '%vw_dashboard_unidade%'
--   ])
-- order by viewname;
