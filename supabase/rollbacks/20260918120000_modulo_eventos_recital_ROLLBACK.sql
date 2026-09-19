-- ROLLBACK de 20260918120000_modulo_eventos_recital.sql (LAPE-39)
--
-- Seguro de rodar: a migration e 100% aditiva (prefixo evento_*) e nenhum objeto
-- existente do LA Report foi alterado por ela. Derrubar isto nao afeta banda_evento,
-- eventos_operacionais, aluno_presenca nem qualquer KPI.
--
-- ⚠️ APAGA OS DADOS DE RECITAL. Se ja houver evento montado, exportar antes.
-- ⚠️ As permissoes RBAC sao removidas ao final; se ja tiverem sido atribuidas a algum
-- perfil, o delete em perfil_permissoes cai por cascade ou precisa ser feito antes.

drop trigger if exists trg_evento_apresentacao_deriva on public.evento_apresentacao;
drop trigger if exists trg_evento_participacao_deriva on public.evento_participacao;
drop trigger if exists trg_evento_touch on public.evento;
drop trigger if exists trg_evento_participacao_touch on public.evento_participacao;
drop trigger if exists trg_evento_bloco_touch on public.evento_bloco;
drop trigger if exists trg_evento_apresentacao_touch on public.evento_apresentacao;

drop table if exists public.evento_apresentacao_item cascade;
drop table if exists public.evento_apresentacao cascade;
drop table if exists public.evento_bloco cascade;
drop table if exists public.evento_participacao cascade;
drop table if exists public.evento cascade;

drop function if exists public.fn_evento_apresentacao_deriva();
drop function if exists public.fn_evento_participacao_deriva();
drop function if exists public.fn_evento_touch();

delete from public.permissoes where codigo in ('eventos.ver', 'eventos.editar');
