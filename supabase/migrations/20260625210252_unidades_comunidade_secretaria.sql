-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- Nota: telefones/links de secretaria sao dado publico de atendimento, nao segredo.

alter table public.unidades
  add column if not exists link_comunidade text,
  add column if not exists secretaria_whatsapp text,
  add column if not exists secretaria_fixo text;

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/CqECiLkdvJZ2vQYFJT8v7N',
  secretaria_whatsapp='(21) 96552-9851', secretaria_fixo='(21) 2412-0461'
where id='2ec861f6-023f-4d7b-9927-3960ad8c2a92';

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/JLnoXDNJEOjGn0tDKlzsdF',
  secretaria_whatsapp='(21) 3955-1135', secretaria_fixo='(21) 3411-5703'
where id='95553e96-971b-4590-a6eb-0201d013c14d';

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/CQQyziknpqwCKvZPMLT3kY?mode=wwt',
  secretaria_whatsapp='(21) 96957-5619', secretaria_fixo='(21) 3400-8891'
where id='368d47f5-2d88-4475-bc14-ba084a9a348e';
