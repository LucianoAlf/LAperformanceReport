-- Fase 1 do Relatório Pedagógico com IA: tabela de histórico dos relatórios gerados.
-- Guarda o rascunho estruturado da IA (conteudo_json), o texto final editado pelo
-- coordenador (conteudo_editado) e os metadados de período. Reusável pelo agente Fábio
-- (Fase 4) para enviar ao responsável via WhatsApp sem regerar.
-- RLS por unidade no padrão verbatim da tabela `metas`.

create table if not exists public.relatorios_pedagogicos (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         integer not null,
  pessoa_nome      text not null,
  unidade_id       uuid references public.unidades(id),
  periodo_tipo     text not null check (periodo_tipo in ('mensal','semestral','anual','custom')),
  data_inicio      date,
  data_fim         date,
  conteudo_json    jsonb,        -- estruturado: instrumentos[] + visao_geral + pontos_atencao + proximos_passos
  conteudo_editado text,         -- texto final apos edicao humana (o que e impresso/enviado)
  modelo_ia        text,
  status           text not null default 'rascunho' check (status in ('rascunho','finalizado','enviado')),
  gerado_por       uuid,
  gerado_em        timestamptz not null default now(),
  editado_em       timestamptz,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_relped_aluno on public.relatorios_pedagogicos(aluno_id);
create index if not exists idx_relped_unidade on public.relatorios_pedagogicos(unidade_id);

create trigger trg_relped_updated_at
  before update on public.relatorios_pedagogicos
  for each row execute function public.set_updated_at();

alter table public.relatorios_pedagogicos enable row level security;

create policy relped_select_policy on public.relatorios_pedagogicos
  for select using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy relped_insert_policy on public.relatorios_pedagogicos
  for insert with check (is_admin() or (unidade_id = get_user_unidade_id()));

create policy relped_update_policy on public.relatorios_pedagogicos
  for update using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy relped_delete_policy on public.relatorios_pedagogicos
  for delete using (is_admin() or (unidade_id = get_user_unidade_id()));

comment on table public.relatorios_pedagogicos is
  'Historico de relatorios pedagogicos gerados por IA (Gemini) a partir das anotacoes de aula. Rascunho editavel + reuso pelo agente Fabio.';
