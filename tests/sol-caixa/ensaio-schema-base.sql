-- Schema base do ensaio isolado — as tabelas que o caixa lê e escreve.
--
-- 🔴 POR QUE ESTE ARQUIVO EXISTE. Replayar `supabase/migrations/` num Postgres
--    nu reconstrói as FUNÇÕES (o projeto tem 2.128 migrations), mas não as
--    tabelas base: elas nasceram antes do `supabase link`, então nunca
--    entraram no histórico. Sem elas o replay falha em cascata.
--
-- ⚠️ Estrutura extraída de `pg_attribute`/`pg_attrdef` de produção por SELECT
--    (leitura pura). NENHUM DADO vem junto: o seed é sintético, em
--    `ensaio-seed.sql`. Nome de aluno real não sai de produção para uma máquina
--    de teste.
--
-- ⚠️ Só o que a cadeia do caixa toca. Não é o schema do sistema.
--
--   docker exec sol-ensaio psql -U postgres -d ensaio -f ensaio-schema-base.sql

create sequence if not exists public.alunos_id_seq;
create sequence if not exists public.cursos_id_seq;
create sequence if not exists public.movimentacoes_id_seq;

create table if not exists public.unidades (
  id uuid not null default gen_random_uuid(),
  nome character varying(100) not null,
  codigo character varying(20) not null,
  cor_primaria character varying(7) default '#00d4ff'::character varying,
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  endereco text,
  telefone text,
  gerente_nome character varying(100),
  link_comunidade text,
  secretaria_whatsapp text,
  secretaria_fixo text,
  primary key (id)
);

create table if not exists public.cursos (
  id integer not null default nextval('public.cursos_id_seq'::regclass),
  nome character varying(100) not null,
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  fator_demanda numeric(2,1) default 1.0,
  emusys_ids integer[],
  is_projeto_banda boolean default false,
  natureza_operacional text not null default 'pedagogica'::text,
  capacidade_maxima integer,
  nome_normalizado character varying(100) generated always as (upper(btrim(nome))) stored,
  primary key (id)
);

create table if not exists public.alunos (
  id integer not null default nextval('public.alunos_id_seq'::regclass),
  nome character varying(200) not null,
  data_nascimento date,
  telefone character varying(20),
  unidade_id uuid not null,
  professor_atual_id integer,
  curso_id integer,
  tipo_matricula_id integer default 1,
  data_matricula date,
  data_inicio_contrato date,
  data_fim_contrato date,
  data_saida date,
  valor_parcela numeric(10,2),
  valor_passaporte numeric(10,2),
  status character varying(20) default 'ativo'::character varying,
  is_ex_aluno boolean default false,
  is_segundo_curso boolean default false,
  canal_origem_id integer,
  forma_pagamento_id integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  tipo_aluno character varying(50) default 'pagante'::character varying,
  status_pagamento character varying(20) default 'em_dia'::character varying,
  dia_vencimento integer default 5,
  responsavel_nome character varying(255),
  responsavel_telefone character varying(50),
  responsavel_parentesco character varying(50),
  modalidade character varying(20) default 'turma'::character varying,
  emusys_student_id text,
  emusys_matricula_id text,
  valor_cheio numeric,
  desconto_fixo numeric,
  desconto_condicional numeric,
  emusys_lead_id text,
  -- ⚠️ GERADA, e as funcoes de identidade dependem dela: `sol_nome_mesma_pessoa_v1`,
  --    `sol_caixa_responsavel_aluno` e o validador de snapshot todos comparam por
  --    aqui. Expressao copiada de produção, nao inventada.
  nome_normalizado character varying(200) generated always as (upper(btrim(nome))) stored,
  primary key (id)
);

create table if not exists public.emusys_faturas (
  id uuid not null default gen_random_uuid(),
  unidade_id uuid not null,
  unidade_codigo text not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_contrato_id bigint,
  emusys_student_id bigint,
  descricao text not null default ''::text,
  status text not null default ''::text,
  data_vencimento date not null,
  data_pagamento date,
  competencia date not null,
  valor_original numeric(12,2) not null default 0,
  valor_pago numeric(12,2),
  juros_e_multa numeric(12,2) not null default 0,
  desconto_aplicado numeric(12,2) not null default 0,
  desconto_fixo numeric(12,2) not null default 0,
  desconto_condicional numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.caixas_diarios (
  id uuid not null default gen_random_uuid(),
  unidade_id uuid not null,
  data_caixa date not null,
  status text not null default 'aberto'::text,
  saldo_inicial_cofre numeric(12,2) not null default 0,
  saldo_final_calculado numeric(12,2) not null default 0,
  saldo_final_conferido numeric(12,2),
  aberto_em timestamp with time zone not null default now(),
  aberto_por text,
  fechado_em timestamp with time zone,
  fechado_por text,
  observacoes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.caixa_movimentacoes (
  id uuid not null default gen_random_uuid(),
  caixa_diario_id uuid not null,
  unidade_id uuid not null,
  data_movimento date not null,
  ambiente text not null,
  tipo text not null,
  forma_pagamento text not null,
  categoria text not null default 'outro'::text,
  descricao text not null,
  valor numeric(12,2) not null,
  responsavel text,
  criado_por text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  cartao_modalidade text,
  cartao_parcelas integer,
  link_pagamento text,
  aluno_id integer,
  fatura_id uuid,
  primary key (id)
);

create table if not exists public.movimentacoes (
  id integer not null default nextval('public.movimentacoes_id_seq'::regclass),
  aluno_id integer,
  unidade_id uuid not null,
  curso_id integer,
  professor_id integer,
  tipo character varying(50) not null,
  data_movimentacao date not null default CURRENT_DATE,
  data_referencia date,
  valor_mensalidade numeric(10,2),
  observacoes text,
  created_at timestamp with time zone default now(),
  primary key (id)
);

create table if not exists public.sol_caixa_ingestao_recebimentos (
  id uuid not null default gen_random_uuid(),
  chat_id text not null,
  message_id text not null,
  unidade_id uuid,
  status text not null default 'recebido'::text,
  motivo_ignorado text,
  valor_extraido numeric,
  forma_extraida text,
  categoria_extraida text,
  aluno_extraido text,
  raw_text text,
  media_ref text,
  preview_json jsonb,
  preview_message_id text,
  idempotency_key text not null,
  fingerprint text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  movimentacao_id uuid,
  lancado_em timestamp with time zone,
  lancado_por text,
  primary key (id)
);

create table if not exists public.sol_caixa_lancamento_auditoria (
  id uuid not null default gen_random_uuid(),
  ator_numero text,
  ator_papel text,
  chat_id text,
  origem_message_id text,
  preview_message_id text,
  idempotency_key text,
  unidade_id uuid,
  data_caixa date,
  payload jsonb,
  resultado text,
  motivo text,
  movimentacao_id uuid,
  caixa_diario_id uuid,
  criado_em timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.sol_caixa_lotes_v1 (
  id uuid not null default gen_random_uuid(),
  unidade_id uuid not null,
  caixa_diario_id uuid not null,
  preview_id uuid not null,
  approval_id uuid not null,
  idempotency_key text not null,
  valor_total numeric not null,
  forma_pagamento text not null,
  categoria text not null,
  ator_numero text,
  payload jsonb not null,
  status text not null default 'lancado'::text,
  criado_em timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.sol_caixa_lote_itens_v1 (
  id uuid not null default gen_random_uuid(),
  lote_id uuid not null,
  ordem smallint not null,
  aluno_nome text not null,
  responsavel_financeiro text,
  competencia text,
  categoria text not null,
  valor numeric not null,
  canonical_fatura_id text,
  movimentacao_id uuid not null,
  item_json jsonb not null,
  criado_em timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.sol_caixa_shadow_previews_v1 (
  id uuid not null default gen_random_uuid(),
  evento_id uuid not null,
  preview_hash text not null,
  unidade_id uuid,
  operacao text,
  categoria text,
  valor_centavos integer,
  forma text,
  status text not null default 'shadow_private'::text,
  preview_json jsonb not null default '{}'::jsonb,
  criado_em timestamp with time zone not null default now(),
  primary key (id)
);

-- ⚠️ Os índices que importam para o BENCHMARK. `emusys_faturas` é a tabela que o
--    envelope varre; sem estes o custo medido seria o de um seq scan e a
--    comparação com produção não valeria nada.
create index if not exists ix_emusys_faturas_unid_comp
  on public.emusys_faturas (unidade_id, competencia);
create index if not exists ix_emusys_faturas_student
  on public.emusys_faturas (emusys_student_id);
create index if not exists ix_emusys_faturas_matricula
  on public.emusys_faturas (emusys_matricula_id);
create index if not exists ix_emusys_faturas_status
  on public.emusys_faturas (status);
create index if not exists ix_alunos_unidade on public.alunos (unidade_id);
create index if not exists ix_alunos_student on public.alunos (emusys_student_id);
create index if not exists ix_alunos_nome_trgm
  on public.alunos using gin (nome gin_trgm_ops);
create index if not exists ix_alunos_nome_norm_trgm
  on public.alunos using gin (nome_normalizado gin_trgm_ops);
create index if not exists ix_caixa_mov_caixa on public.caixa_movimentacoes (caixa_diario_id);
create index if not exists ix_caixas_diarios_unid_data
  on public.caixas_diarios (unidade_id, data_caixa);

-- ⚠️ COLUNAS QUE OS TRIGGERS DAS MIGRATIONS EXIGEM. Eu tinha enxugado `alunos`
--    para o que a cadeia do caixa lê, e o `calcular_campos_aluno()` — criado por
--    uma migration antiga — estourou em `NEW.idade_atual`. Trigger de produção
--    não sabe que este é um banco de ensaio: ou o schema é o mesmo, ou o ensaio
--    testa um objeto que não existe lá.
alter table public.alunos
  add column if not exists idade_atual integer,
  add column if not exists classificacao character varying(4),
  add column if not exists tempo_permanencia_meses integer,
  add column if not exists whatsapp character varying(20),
  add column if not exists email character varying(150),
  add column if not exists tipo_saida_id integer,
  add column if not exists motivo_saida_id integer,
  add column if not exists created_by character varying(100),
  add column if not exists updated_by character varying(100),
  add column if not exists dia_aula character varying(20),
  add column if not exists horario_aula time without time zone,
  add column if not exists percentual_presenca integer,
  add column if not exists professor_experimental_id integer,
  add column if not exists agente_comercial character varying(100),
  add column if not exists is_aluno_retorno boolean default false,
  add column if not exists data_ultima_renovacao date,
  add column if not exists numero_renovacoes integer default 0,
  add column if not exists nps_saida integer,
  add column if not exists health_score character varying(10),
  add column if not exists health_score_updated_at timestamp with time zone,
  add column if not exists health_score_updated_by integer,
  add column if not exists health_score_numerico integer,
  add column if not exists photo_url text,
  add column if not exists foto_url text,
  add column if not exists instagram character varying(100),
  add column if not exists anamnese_preenchida boolean default false,
  add column if not exists anamnese_preenchida_em timestamp with time zone,
  add column if not exists temperamento_codinome character varying(40),
  add column if not exists lead_origem_id integer,
  add column if not exists arquivado_em timestamp with time zone,
  add column if not exists arquivado_por text,
  add column if not exists arquivado_motivo text,
  add column if not exists arquivado_origem text,
  add column if not exists arquivado_aluno_principal_id integer,
  add column if not exists aguardando_renovacao boolean,
  add column if not exists instagram_nao_possui boolean not null default false,
  add column if not exists instagram_nao_possui_marcado_em timestamp with time zone,
  add column if not exists instagram_nao_possui_marcado_por text;

-- A lixeira de matrículas: o envelope consulta foto de aluno arquivado.
-- `like ... including defaults` mantém a estrutura em UM lugar só — se `alunos`
-- ganhar coluna, esta acompanha sem eu ter que lembrar.
create table if not exists public.alunos_arquivados
  (like public.alunos including defaults);

-- ═══════════════════════════════════════════════════════════════════════════
-- O RUN PUBLICADO — `sync_runs` + `sync_run_items`.
--
-- 🔴 POR QUE ELAS ESTAVAM FALTANDO. Duas migrations do repo criam `sync_runs`
--    (`20260718174455` e `20260718230000`), mas a segunda aborta no replay com
--    `relation "cron.job" does not exist` — este ensaio não tem pg_cron. No
--    container da la-hq elas existiam por herança de execuções anteriores; num
--    checkout limpo do CI, não. O ensaio manual passava e o GitHub Actions
--    ficava vermelho: `relation "public.sync_runs" does not exist`, no seed.
--
--    É a mesma lição de novo, agora do outro lado: **ensaio que só passa na
--    máquina de quem o escreveu não prova nada.**
--
-- ⚠️ NÃO É MOCK. Colunas, tipos, defaults, NOT NULL e índices vêm de
--    `pg_attribute`/`pg_indexes` de produção por SELECT. O contrato importa:
--    é daqui que o envelope de faturas lê, e a eleição do run compara
--    `run_type`, `status`, `snapshot_complete`, `unidades_concluidas` e
--    `completed_at`. Um default errado aqui inventaria comportamento.
create table if not exists public.sync_runs (
  id uuid not null default gen_random_uuid(),
  competencia date not null,
  run_type text not null default 'live'::text,
  status text not null default 'running'::text,
  trigger_source text not null,
  requested_by text,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  stale_after timestamp with time zone not null,
  unidades_concluidas integer not null default 0,
  units_summary jsonb not null default '[]'::jsonb,
  snapshot_complete boolean not null default false,
  total_emusys integer not null default 0,
  total_inseridos integer not null default 0,
  total_atualizados integer not null default 0,
  total_ausentes_marcados integer not null default 0,
  baseline_source text,
  erro_detalhe text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create table if not exists public.sync_run_items (
  id uuid not null default gen_random_uuid(),
  run_id uuid not null,
  canonical_fatura_id uuid not null,
  competencia date not null,
  unidade_id uuid not null,
  unidade_codigo text not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_contrato_id bigint,
  emusys_student_id bigint,
  descricao text not null default ''::text,
  status text not null default 'desconhecido'::text,
  data_vencimento date not null,
  data_pagamento date,
  valor_original numeric(12,2) not null default 0,
  valor_pago numeric(12,2),
  juros_e_multa numeric(12,2) not null default 0,
  desconto_aplicado numeric(12,2) not null default 0,
  desconto_fixo numeric(12,2) not null default 0,
  desconto_condicional numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  source_missing boolean not null default false,
  source_missing_reason text,
  source_last_seen_at timestamp with time zone,
  source_missing_detected_at timestamp with time zone,
  source_missing_resolved_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

-- A FK é o que faz o `truncate ... cascade` do seed alcançar os itens; sem ela
-- o seed deixaria itens órfãos de runs antigos e a eleição leria lixo.
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'sync_run_items_run_id_fkey') then
    alter table public.sync_run_items
      add constraint sync_run_items_run_id_fkey
      foreign key (run_id) references public.sync_runs(id) on delete cascade;
  end if;
end $fk$;

-- Índices de produção. O `sync_runs_competencia_sucesso_idx` é o que sustenta a
-- eleição do run mais recente por competência, que é feita a cada leitura.
create unique index if not exists sync_run_items_identidade_uniq
  on public.sync_run_items (run_id, competencia, unidade_id, emusys_fatura_id);
create index if not exists sync_run_items_run_idx
  on public.sync_run_items (run_id, unidade_id, emusys_fatura_id);
create index if not exists sync_run_items_run_canonical_fatura_idx
  on public.sync_run_items (run_id, canonical_fatura_id, unidade_id, competencia, created_at desc, id desc)
  where canonical_fatura_id is not null;
create index if not exists sync_run_items_run_unidade_fatura_idx
  on public.sync_run_items (run_id, unidade_id, emusys_fatura_id, competencia, created_at desc, id desc)
  where emusys_fatura_id is not null;
create index if not exists sync_runs_competencia_sucesso_idx
  on public.sync_runs (competencia, completed_at desc) where status = 'succeeded';
create unique index if not exists sync_runs_baseline_competencia_uniq
  on public.sync_runs (competencia) where run_type = 'baseline';
-- ⚠️ Singleton global de run em andamento. Não é usado por este ensaio (o seed
--    publica runs `succeeded`), mas faz parte do contrato: se um dia alguém
--    semear dois runs `running`, é melhor descobrir aqui do que em produção.
create unique index if not exists sync_runs_global_running_uniq
  on public.sync_runs (status) where status = 'running';
