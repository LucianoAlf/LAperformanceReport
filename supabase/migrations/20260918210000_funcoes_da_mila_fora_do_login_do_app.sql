-- CÓPIA da migration do la-teacher (mesmo nome e mesmo SQL). O teste com os
-- casos (professor recusado, Mila igual, Lia/Sol intactas) e os mutantes moram
-- lá: supabase/migrations/20260918210000_funcoes_da_mila_fora_do_login_do_app.test.sql
-- e scripts/mutantes-20260918210000.mjs.
--
-- ⚠️ PARA QUEM FOR RECRIAR UMA DESTAS FUNÇÕES: o grant certo é
--     to service_role, mila_acesso_restrito   (e lia/sol onde já tinham)
--   NUNCA 'authenticated'. A Mila chega pela API como service_role; nenhuma
--   tela chama estas funções. O laço da 20260909130431 repôs 'authenticated'
--   e foi assim que a anamnese vazou para o login de professor.
--
-- 20260918210000 — as funções da Mila deixam de ser chamáveis pelo login do app
--
-- O ACHADO (18/09/2026, fechando o buraco da anamnese — 20260918170000/170100):
-- get_situacao_lead_v1 é SECURITY DEFINER (passa por cima da RLS), tem EXECUTE
-- para 'authenticated', e a ÚNICA checagem de quem chama é
-- governanca.quem_eh(p_solicitante_telefone) — um telefone que o PRÓPRIO
-- chamador informa. Para lead que virou aluno ela devolve a anamnese:
-- diagnosticos, diagnosticos_outro, necessidade_apoio, temperamento e
-- situacao_responsaveis. Qualquer um dos 11 logins de professor, pela API,
-- passando o telefone de alguém da equipe, lia a saúde de 293 leads que viraram
-- alunos com diagnóstico preenchido (medido em 18/09).
--
-- DE ONDE VEIO: não da migration que criou a ficha. A 20260904162000 do LA
-- Report fazia o certo (revoke de public, anon, authenticated; grant só para
-- service_role e mila_acesso_restrito). Quem reabriu foi a 20260909130431
-- (dm_da_consultora_tambem_le_a_vigencia): ao recriar 4 funções ela repôs o
-- EXECUTE com "to authenticated, service_role, mila_acesso_restrito" — o
-- comentário dela só fala da Mila. As outras seis abaixo têm a mesma porta
-- (telefone informado pelo chamador; a radar_ficha_v1 nem isso) e nenhuma
-- devolve saúde — devolvem nome e telefone de lead e aluno.
--
-- QUEM CHAMA DE VERDADE (pg_stat_statements desde 15/09 21:35 UTC + grep em
-- la-teacher, LA Report e anamnese-la-music):
--   função                            service_role  authenticated  quem
--   get_situacao_lead_v1                     2             0       MCP da Mila (mila-gestao-tools-mcp.mjs)
--   mila_cutucada_v1                       123             0       mila-cutucada.py
--   mila_briefing_manha_v1                   9             0       mila-proativa.py e MCP
--   mila_fechamento_dia_v1                   9             0       mila-proativa.py e MCP
--   mila_numeros_do_mes_v1                   2             0       MCP
--   radar_pendencias_comerciais_v1          17             0       mila-proativa.py
--   radar_ficha_v1                           0             0       (Lia e Mila têm grant)
-- A Mila chama pela API com a chave de serviço (SUPABASE_LAREPORT_SERVICE_KEY)
-- e chega como service_role. O papel mila_acesso_restrito é login DIRETO no
-- Postgres (o authenticator nem é membro dele, então a API não o assume) e não
-- chamou nenhuma destas. Nenhuma tela chama nenhuma delas.
--
-- O QUE MUDA: só sai o 'authenticated' (public e anon já não tinham; o revoke
-- deles é cinto). service_role, mila_acesso_restrito, lia_acesso_restrito e os
-- papéis da Sol continuam como estão. O corpo das funções não é tocado.
--
-- FICA DE FORA DE PROPÓSITO: relatorio_matriculas_texto_v1 e
-- relatorio_comparativo_texto_v1 têm a mesma checagem por telefone, mas a tela
-- Comercial do LA Report (ComercialPage.tsx) chama as duas com login — revogar
-- quebraria a tela. Aquelas pedem trava por login, não revoke.
--
-- ⚠️ ESTAS FUNÇÕES SÃO DO LA REPORT. "create or replace" não mexe em
-- permissão; o que reabre é repetir o laço de grant da 20260909130431. Esta
-- mesma migration entra no repo deles.

-- >>> revogações
revoke execute on function public.get_situacao_lead_v1(text, text, text, integer)       from public, anon, authenticated;
revoke execute on function public.mila_cutucada_v1(text, integer)                       from public, anon, authenticated;
revoke execute on function public.mila_briefing_manha_v1(text, date, uuid)              from public, anon, authenticated;
revoke execute on function public.mila_fechamento_dia_v1(text, date, uuid)              from public, anon, authenticated;
revoke execute on function public.mila_numeros_do_mes_v1(text, integer, integer, uuid)  from public, anon, authenticated;
revoke execute on function public.radar_pendencias_comerciais_v1(text, integer)         from public, anon, authenticated;
revoke execute on function public.radar_ficha_v1(uuid, text, integer)                   from public, anon, authenticated;
-- <<< revogações
