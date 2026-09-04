-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- PASSO 1 · bloco 5 (trafego) + pauta para a Mila
-- radar_trafego_gate_ok(): current_user in (service_role, postgres,
-- mila_acesso_restrito) or is_admin(). As RPCs de trafego passam a usar o gate
-- (replace com guarda sobre o corpo vivo). Alargamento DELIBERADO: a Mila fala
-- com diretoria e consultora pelo mesmo numero; quem separa e a camada de TOOL
-- (passo 3) via quem_eh — o banco libera a role, a skill escopa a pessoa.
-- GRANTs a mila_acesso_restrito: trafego_criativo, trafego_canal,
-- publico_reativacao, bloco_comercial_grupo, resolver_entidade_por_telefone,
-- vw_ads_gasto_diario_v1. A Mila passou de 6 para 16 RPCs.
-- Provado pelo MCP REAL dela (sem JWT): select em alunos -> 0; as RPCs -> dado.
select 1; -- corpo integral esta no banco
