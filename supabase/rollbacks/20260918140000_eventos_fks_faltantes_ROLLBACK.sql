-- ROLLBACK de 20260918140000_eventos_fks_faltantes.sql (LAPE-39)
--
-- ⚠️ Derrubar as FKs faz a lista de eventos voltar a quebrar com
-- "Could not find a relationship between 'evento' and 'evento_apresentacao'":
-- e a FK que o PostgREST usa para resolver o count embutido.

alter table public.evento_apresentacao
  drop constraint if exists evento_apresentacao_evento_fk,
  drop constraint if exists evento_apresentacao_unidade_fk;

alter table public.evento_participacao
  drop constraint if exists evento_participacao_unidade_fk;

alter table public.evento_apresentacao
  alter column evento_id drop not null,
  alter column unidade_id drop not null,
  alter column pessoa_chave drop not null;

alter table public.evento_participacao
  alter column unidade_id drop not null,
  alter column pessoa_chave drop not null;
