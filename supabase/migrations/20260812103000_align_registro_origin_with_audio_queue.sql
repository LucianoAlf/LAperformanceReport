-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- The durable audio queue owns the channel origin. Registration normalization
-- must preserve it instead of trusting an LLM-supplied payload field.

update public.fabio_registros_aula as registro
   set origem = audio.origem,
       atualizado_em = now()
  from public.fabio_fila_audios as audio
 where registro.audio_id = audio.id
   and registro.origem is distinct from audio.origem;

comment on column public.fabio_registros_aula.origem is
  'Canal autoritativo do registro; quando ha audio_id, deve refletir fabio_fila_audios.origem.';
