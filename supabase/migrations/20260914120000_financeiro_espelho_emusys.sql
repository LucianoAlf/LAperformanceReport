-- Espelho dos endpoints financeiros BETA do Emusys dentro do LA Report.
-- Decisão Alf 2026-09-14: o LA Report guarda o espelho; o Super Folha consome;
-- a Maria lê só o Super Folha. Objetivo: fechar jan–set/2026 contra a planilha
-- da Rose e a distribuição da Ana, com rotina diária.
--
-- Fontes (beta): GET /financeiro/lancamentos (items+paginação), e catálogos
-- completos a cada rodada: /financeiro/contas_financeiras,
-- /financeiro/plano_contas e /financeiro/formas_pagamento.
--
-- Regras duras (do Alf):
--  - chave única = (unidade_id, id do Emusys). Ids do Emusys são POR TOKEN; o
--    mesmo número significa coisas diferentes em escolas diferentes.
--  - nunca apagar item: iteração por item com primeira_vez_visto,
--    ultima_vez_visto, hash_conteudo, alterado_em, sumiu_em.
--  - não filtrar naturezas: entrada, saida, transferencia, estorno, estornado.
--  - transferência vem em 2 itens; "Repasse da Operadora" e "Transferido para
--    a Tesouraria" chegam sem conta legível (conta null ou id sem cadastro) —
--    conta_* e forma_pagamento_* são NULLABLE de propósito. Medido 14/09:
--    transferência "Repasse da Operadora" veio com conta {id:1002, descricao:''}
--    (id fantasma fora do catálogo) e forma_pagamento null.
--  - valor vem COM SINAL, e o sinal NÃO é derivável da natureza: medido 14/09,
--    estornado veio -750 num caso e positivo em outros. Guardar como vem.
--  - plano_codigo = código extraído do INÍCIO do nome da API
--    ("5.2.4 Aluguel" → 5.2.4). O campo `codigo` do catálogo é numeração
--    interna do Emusys, NÃO usar como classificação contábil.
--  - sem updated_em na fonte ⇒ revarrer mês corrente + 2 anteriores dia a dia.

-- ────────────────────────────────────────────────────────────────────────────
-- Lançamentos (o espelho principal)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_emusys_lancamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  emusys_lancamento_id bigint not null,
  data date not null,
  valor numeric(14, 2) not null,           -- com sinal, como vem da API
  natureza text not null check (natureza in (
    'entrada', 'saida', 'transferencia', 'estorno', 'estornado'
  )),
  conta_emusys_id bigint,
  conta_descricao text,                    -- pode vir '' vazia (id fantasma de repasse)
  plano_emusys_id bigint,
  plano_nome text,
  plano_codigo text,                       -- extraído do INÍCIO do plano_nome ("\d+(\.\d+)*")
  forma_pagamento_emusys_id bigint,
  forma_pagamento_descricao text,
  descricao text,
  payload jsonb not null,                  -- item cru da API
  hash_conteudo text not null,             -- sha256 canônico dos campos espelhados
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,                 -- preenchido só quando o hash muda
  sumiu_em timestamptz,                    -- preenchido quando some de uma varredura completa do dia; limpa se volta
  unique (unidade_id, emusys_lancamento_id)
);

comment on table public.financeiro_emusys_lancamentos is
  'Espelho item a item de GET /financeiro/lancamentos (Emusys beta). Nunca apaga: item que some de varredura completa do dia ganha sumiu_em. Chave única (unidade_id, emusys_lancamento_id) porque o id é por token.';

create index financeiro_lancamentos_unidade_data_idx
  on public.financeiro_emusys_lancamentos (unidade_id, data);
create index financeiro_lancamentos_data_idx
  on public.financeiro_emusys_lancamentos (data);
create index financeiro_lancamentos_sumiu_idx
  on public.financeiro_emusys_lancamentos (unidade_id, data)
  where sumiu_em is null;

-- ────────────────────────────────────────────────────────────────────────────
-- Catálogos (reescritos completos a cada rodada; mesmas colunas de tracking)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_emusys_contas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  emusys_conta_id bigint not null,
  descricao text,
  tipo text,
  banco text,
  status text,
  payload jsonb not null,
  hash_conteudo text not null,
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,
  sumiu_em timestamptz,
  unique (unidade_id, emusys_conta_id)
);

comment on table public.financeiro_emusys_contas is
  'Catálogo GET /financeiro/contas_financeiras (Emusys beta), completo a cada rodada. ⚠️ CG retorna HTTP 500 "erro desconhecido" neste endpoint desde 14/09/2026 (bug da origem) — a sync registra erro e segue com os outros catálogos.';

create table public.financeiro_emusys_plano_contas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  emusys_plano_id bigint not null,
  nome text,
  codigo_api text,                         -- campo `codigo` da API: numeração interna, NÃO usar p/ classificar
  codigo_extraido text,                    -- código do INÍCIO do nome ("5.2.4 Aluguel" → 5.2.4)
  id_pai bigint,
  tipo text,                               -- sintetico | analitico
  natureza text,                           -- receita | despesa (da API)
  status text,                             -- ativo | inativo
  payload jsonb not null,
  hash_conteudo text not null,
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,
  sumiu_em timestamptz,
  unique (unidade_id, emusys_plano_id)
);

comment on table public.financeiro_emusys_plano_contas is
  'Catálogo GET /financeiro/plano_contas (Emusys beta), completo a cada rodada. codigo_extraido vem do início do nome; codigo_api é a numeração interna e não classifica nada.';

create table public.financeiro_emusys_formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  emusys_forma_id bigint not null,
  descricao text,
  id_pai bigint,
  generico boolean,
  payload jsonb not null,
  hash_conteudo text not null,
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,
  sumiu_em timestamptz,
  unique (unidade_id, emusys_forma_id)
);

comment on table public.financeiro_emusys_formas_pagamento is
  'Catálogo GET /financeiro/formas_pagamento (Emusys beta), completo a cada rodada.';

-- ────────────────────────────────────────────────────────────────────────────
-- Controle da varredura: um registro por (unidade, dia)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_emusys_varredura_dias (
  unidade_id uuid not null references public.unidades(id),
  data date not null,
  status text not null check (status in ('completo', 'erro')),
  itens integer not null default 0,
  tentativas integer not null default 0,
  ultimo_erro text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  ultima_tentativa_em timestamptz not null default now(),
  primary key (unidade_id, data)
);

comment on table public.financeiro_emusys_varredura_dias is
  'Um dia só entra como completo quando TODAS as páginas dele vieram. Status erro nunca vale como vazio: o dia fica pendente até completar.';

-- Resumo por unidade: janela monitorada e a última varredura que fechou inteira
create table public.financeiro_emusys_varredura_resumo (
  unidade_id uuid primary key references public.unidades(id),
  janela_inicio date,
  janela_fim date,
  ultima_varredura_completa_em timestamptz,  -- só avança quando TODOS os dias da janela estão completos
  ultima_tentativa_em timestamptz not null default now(),
  dias_pendentes integer not null default 0,
  catalogos_erro jsonb,                       -- ex.: {"contas": "HTTP 500 repetido"}
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

comment on table public.financeiro_emusys_varredura_resumo is
  'Estado da rotina diária (mês corrente + 2 anteriores). ultima_varredura_completa_em só anda quando a janela inteira fecha sem dia em erro.';

-- ────────────────────────────────────────────────────────────────────────────
-- Trava de leitura: espelho só via service_role/edge. anon/authenticated fora.
-- (A tabela do utilitário de mapa do banco conta funções executáveis por anon;
-- aqui nem tabela aparece para eles.)
-- ────────────────────────────────────────────────────────────────────────────
revoke all on table public.financeiro_emusys_lancamentos from public, anon, authenticated;
revoke all on table public.financeiro_emusys_contas from public, anon, authenticated;
revoke all on table public.financeiro_emusys_plano_contas from public, anon, authenticated;
revoke all on table public.financeiro_emusys_formas_pagamento from public, anon, authenticated;
revoke all on table public.financeiro_emusys_varredura_dias from public, anon, authenticated;
revoke all on table public.financeiro_emusys_varredura_resumo from public, anon, authenticated;

grant select, insert, update on table public.financeiro_emusys_lancamentos to service_role;
grant select, insert, update on table public.financeiro_emusys_contas to service_role;
grant select, insert, update on table public.financeiro_emusys_plano_contas to service_role;
grant select, insert, update on table public.financeiro_emusys_formas_pagamento to service_role;
grant select, insert, update on table public.financeiro_emusys_varredura_dias to service_role;
grant select, insert, update on table public.financeiro_emusys_varredura_resumo to service_role;

alter table public.financeiro_emusys_lancamentos enable row level security;
alter table public.financeiro_emusys_contas enable row level security;
alter table public.financeiro_emusys_plano_contas enable row level security;
alter table public.financeiro_emusys_formas_pagamento enable row level security;
alter table public.financeiro_emusys_varredura_dias enable row level security;
alter table public.financeiro_emusys_varredura_resumo enable row level security;
