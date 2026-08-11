-- Captura aditiva do Lead ID que GET /matriculas devolve em aluno.lead_id.
-- Nao cria unicidade: um lead pode originar mais de uma matricula/curso.
-- O sync so preenche quando a linha exata da unidade esta sem valor e nunca
-- sobrescreve divergencia local; divergencias seguem para a fila de auditoria.

alter table public.alunos
  add column if not exists emusys_lead_id bigint;

create index if not exists idx_alunos_unidade_emusys_lead_id
  on public.alunos (unidade_id, emusys_lead_id)
  where emusys_lead_id is not null;

comment on column public.alunos.emusys_lead_id is
  'Lead ID externo do Emusys, escopado pela unidade e capturado na matricula; NULL quando a API nao informa ou ainda nao houve conciliacao.';
