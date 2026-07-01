-- P09L: restaura gravacao autenticada da decisao humana da conciliacao comercial.
-- Contexto: a auditoria de seguranca habilitou RLS em lead_experimentais_decisoes_humanas,
-- mas a UI de fechamento ainda grava a decisao operacional diretamente nessa tabela.
-- Mantemos leitura/escrita somente para usuarios autenticados e sem DELETE.

alter table public.lead_experimentais_decisoes_humanas enable row level security;

drop policy if exists lead_exp_decisoes_humanas_select_auth on public.lead_experimentais_decisoes_humanas;
drop policy if exists lead_exp_decisoes_humanas_insert_auth on public.lead_experimentais_decisoes_humanas;
drop policy if exists lead_exp_decisoes_humanas_update_auth on public.lead_experimentais_decisoes_humanas;

create policy lead_exp_decisoes_humanas_select_auth
  on public.lead_experimentais_decisoes_humanas
  for select
  to authenticated
  using (true);

create policy lead_exp_decisoes_humanas_insert_auth
  on public.lead_experimentais_decisoes_humanas
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.lead_experimentais le
      where le.id = lead_experimental_id
    )
  );

create policy lead_exp_decisoes_humanas_update_auth
  on public.lead_experimentais_decisoes_humanas
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.lead_experimentais le
      where le.id = lead_experimental_id
    )
  )
  with check (
    exists (
      select 1
      from public.lead_experimentais le
      where le.id = lead_experimental_id
    )
  );

comment on policy lead_exp_decisoes_humanas_insert_auth
  on public.lead_experimentais_decisoes_humanas
  is 'Permite ao usuario autenticado registrar decisao operacional de conciliacao apenas para lead experimental existente.';

