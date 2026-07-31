begin;

alter table public.fila_relatorios_whatsapp
  add column if not exists tipo_relatorio text;

alter table public.fila_relatorios_whatsapp
  alter column tipo_relatorio set default 'relatorio_admin';

-- Toda linha anterior a esta migration pertence ao produtor administrativo.
-- O comercial automático usava outra fila e só passa a usar esta tabela junto
-- com a coluna discriminadora criada aqui.
update public.fila_relatorios_whatsapp
set tipo_relatorio = 'relatorio_admin'
where tipo_relatorio is null;

alter table public.fila_relatorios_whatsapp
  alter column tipo_relatorio set not null;

alter table public.fila_relatorios_whatsapp
  add constraint fila_relatorios_whatsapp_tipo_relatorio_check
  check (tipo_relatorio in ('relatorio_admin', 'relatorio_comercial'))
  not valid;

alter table public.fila_relatorios_whatsapp
  validate constraint fila_relatorios_whatsapp_tipo_relatorio_check;

create unique index if not exists idx_fila_relatorio_dia_tipo
  on public.fila_relatorios_whatsapp
  (tipo_relatorio, unidade_id, jid, data_dia);

drop index if exists public.idx_fila_relatorio_dia;

comment on column public.fila_relatorios_whatsapp.tipo_relatorio is
  'Discrimina relatório administrativo e comercial na deduplicação diária.';

commit;
