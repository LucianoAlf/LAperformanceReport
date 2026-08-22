-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PRD Perfil Comportamental LA v1.3 (aprovado 16/07/2026)
-- Espelha o padrão anamneses -> alunos para o lado do professor.

-- 1) Resultado vigente no cadastro
alter table public.professores
  add column if not exists temperamento_codinome varchar;

comment on column public.professores.temperamento_codinome is
  'Perfil comportamental vigente (ex: CAZUZA/SLASH). Fonte: última aplicação concluída em professor_perfil_testes.';

-- 2) A aplicação do teste como entidade
create table if not exists public.professor_perfil_testes (
  id                      bigint generated always as identity primary key,
  professor_id            integer not null references public.professores(id),
  unidade_id              uuid references public.unidades(id),
  contexto                varchar not null default 'PROF',
  versao_questionario     integer not null default 1,
  evento_token            varchar not null,
  status                  varchar not null default 'iniciado',
  temperamento_primario   varchar,
  temperamento_secundario varchar,
  temperamento_codinome   varchar,
  temperamento_contagem   jsonb,
  ajuste_semestre         jsonb,
  ajuste_semestre_em      timestamptz,
  iniciado_em             timestamptz default now(),
  concluido_em            timestamptz,
  created_at              timestamptz default now()
);

comment on table public.professor_perfil_testes is
  'Aplicações do teste de perfil comportamental do professor (13+2 cenários). Histórico preservado; o vigente desnormaliza em professores.temperamento_codinome.';
comment on column public.professor_perfil_testes.ajuste_semestre is
  'PRIVADO do professor (D10/RF-14): card de ajuste pro semestre. NUNCA expor em telas administrativas, painéis ou relatórios.';
comment on column public.professor_perfil_testes.evento_token is
  'Token do link/QR do evento ou aplicação individual. Valida a escrita pública via Edge Function.';

-- 3) Respostas auditáveis
create table if not exists public.professor_perfil_respostas (
  id               bigint generated always as identity primary key,
  teste_id         bigint not null references public.professor_perfil_testes(id) on delete cascade,
  pergunta_numero  integer not null,
  opcao_canonica   char(1) not null,
  resposta_posicao integer not null,
  created_at       timestamptz default now(),
  unique (teste_id, pergunta_numero)
);

comment on table public.professor_perfil_respostas is
  'Respostas individuais por aplicação. opcao_canonica (A/B/C/D do gabarito) preserva o recálculo mesmo com opções embaralhadas na exibição. 1-13 fixas; 14-15 desempate (presença = houve empate).';

-- 4) Índices e segurança
create index if not exists idx_ppt_professor    on public.professor_perfil_testes(professor_id);
create index if not exists idx_ppt_evento_token on public.professor_perfil_testes(evento_token);
create index if not exists idx_ppr_teste        on public.professor_perfil_respostas(teste_id);

alter table public.professor_perfil_testes    enable row level security;
alter table public.professor_perfil_respostas enable row level security;
-- Sem policies permissivas: escrita/leitura pública só via Edge Function (service role), padrão anamnese.
