-- Livro de bordo do escritor de presenca no Emusys (API 1.7.0) + rollout sombra.
--
-- Desenho: docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md
-- Molde: fabio_emusys_escrita (copiar o molde, nao a tabela — o livro do Fabio
-- registra escrita de FICHA; este registra escrita de PRESENCA).
--
-- Uma linha por gatilho avaliado:
--   aluno     -> presenca_evento_id = presenca_acao_eventos.id (item_aplicado)
--   professor -> ficha_id           = fabio_registros_aula.id (confirmado/gravado)
-- O valor registrado e o ESTADO VIGENTE de (aluno, aula) no momento da
-- avaliacao, nunca o valor do evento-gatilho — reprocessamento nao manda
-- estado velho por cima de correcao nova.
--
-- modo 'sombra': a edge registra o que faria sem chamar o PATCH.
-- modo 'ativo':  chama o PATCH e guarda a resposta inteira.

create table if not exists public.presenca_emusys_escrita (
  id bigint generated always as identity primary key,
  request_id uuid,
  presenca_evento_id bigint,
  ficha_id uuid,
  unidade_id uuid not null,
  aula_emusys_id integer not null,
  aluno_id integer,
  professor_id integer,
  alvo text not null check (alvo in ('aluno', 'professor')),
  estado_vigente text,
  fonte_decisao text,
  presente boolean,
  estado_antes jsonb,
  decisao text not null,
  motivo text,
  resposta jsonb,
  erro text,
  modo text not null check (modo in ('sombra', 'ativo')),
  criado_em timestamptz not null default now(),
  check (num_nonnulls(presenca_evento_id, ficha_id) = 1)
);

comment on table public.presenca_emusys_escrita is
  'Livro de bordo do escritor de presenca no Emusys: uma linha por gatilho (evento de aluno ou ficha de professor), com estado antes, decisao, resposta e modo sombra/ativo.';

comment on column public.presenca_emusys_escrita.presenca_evento_id is
  'Gatilho de aluno: presenca_acao_eventos.id do item_aplicado. O valor escrito vem do estado vigente em aluno_presenca, nao do evento.';
comment on column public.presenca_emusys_escrita.ficha_id is
  'Gatilho de professor: fabio_registros_aula.id ao entrar em confirmado/gravado_emusys.';
comment on column public.presenca_emusys_escrita.estado_antes is
  'Leitura do GET /aula antes de decidir: presenca, horario_presenca, justificada, cancelada da linha alvo.';
comment on column public.presenca_emusys_escrita.decisao is
  'escrito | seria_escrito | ja_coerente | conflito_marca_humana | pulado_linha_protegida | pulado_identidade_divergente | pulado_sem_estado | pulado_sem_canal_justificada | erro';

create unique index if not exists presenca_emusys_escrita_evento_uk
  on public.presenca_emusys_escrita (presenca_evento_id)
  where presenca_evento_id is not null;

create unique index if not exists presenca_emusys_escrita_ficha_uk
  on public.presenca_emusys_escrita (ficha_id)
  where ficha_id is not null;

create index if not exists presenca_emusys_escrita_unidade_data_ix
  on public.presenca_emusys_escrita (unidade_id, criado_em);

create index if not exists presenca_emusys_escrita_alvo_aula_aluno_ix
  on public.presenca_emusys_escrita (aula_emusys_id, aluno_id)
  where aluno_id is not null;

alter table public.presenca_emusys_escrita enable row level security;

grant select, insert, update, delete on public.presenca_emusys_escrita
  to service_role;
grant select on public.presenca_emusys_escrita
  to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

-- Superficie nova do rollout canonico: o escritor le presenca_rollout_config
-- por unidade. Nasce em sombra nas tres — so grava o que faria.
-- 'canonico_v2' nesta superficie significa "escreve de verdade" (modo ativo).
alter table public.presenca_rollout_config
  drop constraint presenca_rollout_config_superficie_check;
alter table public.presenca_rollout_config
  add constraint presenca_rollout_config_superficie_check
  check (superficie = any (array[
    'agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis',
    'emusys_escrita'
  ]));

insert into public.presenca_rollout_config
  (unidade_id, superficie, modo, ativado_por, motivo, versao)
values
  ('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'emusys_escrita', 'sombra',
   'migration:presenca_emusys_escrita_livro',
   'escritor nasce em sombra; liga por unidade com o numero da sombra', 1),
  ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'emusys_escrita', 'sombra',
   'migration:presenca_emusys_escrita_livro',
   'escritor nasce em sombra; liga por unidade com o numero da sombra', 1),
  ('95553e96-971b-4590-a6eb-0201d013c14d', 'emusys_escrita', 'sombra',
   'migration:presenca_emusys_escrita_livro',
   'escritor nasce em sombra; liga por unidade com o numero da sombra', 1)
on conflict (unidade_id, superficie) do nothing;
