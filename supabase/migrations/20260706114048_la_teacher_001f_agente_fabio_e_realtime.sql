-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Registrar o Fábio na tabela agentes (nascendo inativo/config)
do $$ begin
  if not exists (select 1 from public.agentes where lower(nome) in ('fábio','fabio')) then
    insert into public.agentes (nome, descricao, system_prompt, is_active, status, modo_teste)
    values ('Fábio',
            'Agente pedagógico — LA Teacher (registro de aulas, briefing, jornada)',
            'Ver alma em fabio-backup/skills/normalizacao (fabio-alma-normalizacao-v1). Placeholder até deploy.',
            false, 'configuracao', true);
  end if;
end $$;

-- 9 · REALTIME — o app assina o status do processamento
do $$ begin
  alter publication supabase_realtime add table public.fabio_registros_aula;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.fabio_fila_audios;
exception when duplicate_object then null; end $$;
