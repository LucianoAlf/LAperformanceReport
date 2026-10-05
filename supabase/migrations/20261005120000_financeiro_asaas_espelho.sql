-- Espelho do extrato Asaas via Emusys beta dentro do LA Report.
-- Decisão Alf 2026-10-05 (mesmo caminho de 14/09): o LA Report chama o Emusys,
-- guarda o espelho e expõe um export; o Super Folha só consome pelo export.
-- Pedido: docs/handoffs/2026-10-05-extrato-asaas-espelho-para-la-report.md
-- (molde: 2026-09-14-espelho-financeiro-emusys-superfolha.md).
--
-- Fontes (beta, medido ao vivo 05/10/2026):
--   GET /financeiro/convenios_asaas?status=todos -> { convenios_asaas: [...] }
--   GET /financeiro/extrato_asaas?convenio_id=&startDate=&finishDate=&offset=
--       &limit=100&order=asc -> espelho cru do GET /v3/financialTransactions
--       da Asaas: { object, hasMore, totalCount, limit, offset, data: [...] }.
--
-- Regras duras (mesmas do espelho de lançamentos + as do extrato):
--  - chave única do item = (unidade_id, convenio_id, asaas_id). convenio_id é
--    por token da unidade (CG tem DOIS convênios: 5 e 7); o id do item é o
--    "ftn_…" textual da Asaas, não numérico.
--  - nunca apagar item: tracking por item (primeira_vez_visto, ultima_vez_visto,
--    hash_conteudo, alterado_em, sumiu_em). Item sumido fica para rastro e NÃO
--    entra nos totais.
--  - `type` NÃO tem lista fechada: setembro/2026 só trouxe PAYMENT_RECEIVED,
--    PAYMENT_FEE e TRANSFER, mas a Asaas também emite estorno, chargeback,
--    antecipação etc. (o Recreio teve chargeback em fev/2026). Guardar qualquer
--    type — sem CHECK de enum.
--  - `value` vem COM SINAL (FEE e TRANSFER negativos) e `date` é a data em que
--    o dinheiro entrou no Asaas (cartão = liberação), NÃO a data do pagamento
--    do aluno.
--  - `balance` encadeia: balance(anterior) + value = balance; quebra de cadeia
--    vira ERRO de varredura, nunca silêncio. `posicao_dia` guarda a ordem do
--    item dentro do dia na última varredura (necessária para conferir a cadeia
--    e para o ordering determinístico do export).
--  - `externalReference` é por paymentId (o par RECEIVED+FEE repete o valor);
--    pode ser null. NÃO é o id de /faturas (verificação pendente — ver §5 do
--    handoff).
--  - `description` traz o nome do pagador (dado pessoal): guardar no espelho e
--    entregar no export, como combinado com o Super Folha.
--  - "dia em erro nunca vale como vazio", igual aos lançamentos.

-- ────────────────────────────────────────────────────────────────────────────
-- Extrato Asaas (o espelho principal)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_asaas_extrato (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  convenio_id bigint not null,
  asaas_id text not null,                    -- id da financialTransaction (ftn_…)
  data date not null,
  valor numeric(14, 2) not null,             -- `value`, com sinal, como vem
  balance numeric(14, 2),                    -- saldo do convênio após o item
  tipo text not null,                        -- `type`; sem lista fechada
  descricao text,                            -- contém nome do pagador (dado pessoal)
  payment_id text,
  external_reference text,
  transfer_id text,
  pix_transaction_id text,
  split_id text,
  anticipation_id text,
  bill_id text,
  invoice_id text,
  payment_dunning_id text,
  credit_bureau_report_id text,
  posicao_dia integer,                       -- índice do item dentro do dia na varredura
  payload jsonb not null,                    -- item cru da API
  hash_conteudo text not null,               -- sha256 canônico dos campos espelhados
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,                   -- preenchido só quando o hash muda
  sumiu_em timestamptz,                      -- some de varredura completa do dia; limpa se volta
  unique (unidade_id, convenio_id, asaas_id)
);

comment on table public.financeiro_asaas_extrato is
  'Espelho item a item de GET /financeiro/extrato_asaas (Emusys beta; cru do financialTransactions da Asaas). Nunca apaga: item que some de varredura completa ganha sumiu_em. Chave única (unidade_id, convenio_id, asaas_id) — convênio é por token e o id Asaas é textual.';

create index financeiro_asaas_extrato_unidade_data_idx
  on public.financeiro_asaas_extrato (unidade_id, data);
create index financeiro_asaas_extrato_convenio_data_idx
  on public.financeiro_asaas_extrato (convenio_id, data, posicao_dia);
create index financeiro_asaas_extrato_payment_idx
  on public.financeiro_asaas_extrato (payment_id)
  where payment_id is not null;
create index financeiro_asaas_extrato_sumiu_idx
  on public.financeiro_asaas_extrato (unidade_id, convenio_id, data)
  where sumiu_em is null;

-- ────────────────────────────────────────────────────────────────────────────
-- Catálogo de convênios (reescrito completo a cada rodada)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_asaas_convenios (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  convenio_id bigint not null,
  status text,                               -- ativo | pendente | inativo | cancelado | problema_receita
  conta_emusys_id bigint,                    -- conta_bancaria.id no cadastro Emusys
  conta_descricao text,
  conta_banco text,
  conta_agencia text,
  conta_numero text,
  conta_titular text,
  payload jsonb not null,
  hash_conteudo text not null,
  primeira_vez_visto timestamptz not null default now(),
  ultima_vez_visto timestamptz not null default now(),
  alterado_em timestamptz,
  sumiu_em timestamptz,
  unique (unidade_id, convenio_id)
);

comment on table public.financeiro_asaas_convenios is
  'Catálogo GET /financeiro/convenios_asaas (Emusys beta), completo a cada rodada. A CG tem DOIS convênios ativos (5 Kids CG e 7 LA CG). Só convênio ativo aceita extrato_asaas na origem.';

-- ────────────────────────────────────────────────────────────────────────────
-- Controle da varredura: um registro por (unidade, convenio, dia)
-- ────────────────────────────────────────────────────────────────────────────
create table public.financeiro_asaas_varredura_dias (
  unidade_id uuid not null references public.unidades(id),
  convenio_id bigint not null,
  data date not null,
  status text not null check (status in ('completo', 'erro')),
  itens integer not null default 0,
  balance_quebras integer not null default 0,  -- quebras da cadeia de balance vistas no dia
  tentativas integer not null default 0,
  ultimo_erro text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  ultima_tentativa_em timestamptz not null default now(),
  primary key (unidade_id, convenio_id, data)
);

comment on table public.financeiro_asaas_varredura_dias is
  'Um dia só entra como completo quando a janela que o cobre veio inteira E a cadeia de balance não quebrou nele. Status erro nunca vale como vazio.';

-- Resumo por (unidade, convenio): janela monitorada e fronteira da carga inicial
create table public.financeiro_asaas_varredura_resumo (
  unidade_id uuid not null references public.unidades(id),
  convenio_id bigint not null,
  janela_inicio date,
  janela_fim date,
  ultima_varredura_completa_em timestamptz,  -- só avança quando a janela inteira fecha sem dia em erro
  ultima_revarredura_mensal_em timestamptz,  -- última revarredura do mês anterior inteiro
  carga_inicial_concluida_ate date,          -- todo dia desde 2024-01-01 até aqui está completo
  ultima_tentativa_em timestamptz not null default now(),
  dias_pendentes integer not null default 0,
  ultimo_erro text,
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, convenio_id)
);

comment on table public.financeiro_asaas_varredura_resumo is
  'Estado da rotina por convênio: janela diária (últimos 10 dias), revarredura mensal do mês anterior e fronteira da carga inicial (a partir de 2024-01-01).';

-- ────────────────────────────────────────────────────────────────────────────
-- Trava de leitura: espelho só via service_role/edge (mesmo padrão de 14/09).
-- description carrega nome do pagador — dado pessoal, sai só pelo export ao SF.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on table public.financeiro_asaas_extrato from public, anon, authenticated;
revoke all on table public.financeiro_asaas_convenios from public, anon, authenticated;
revoke all on table public.financeiro_asaas_varredura_dias from public, anon, authenticated;
revoke all on table public.financeiro_asaas_varredura_resumo from public, anon, authenticated;

grant select, insert, update on table public.financeiro_asaas_extrato to service_role;
grant select, insert, update on table public.financeiro_asaas_convenios to service_role;
grant select, insert, update on table public.financeiro_asaas_varredura_dias to service_role;
grant select, insert, update on table public.financeiro_asaas_varredura_resumo to service_role;

alter table public.financeiro_asaas_extrato enable row level security;
alter table public.financeiro_asaas_convenios enable row level security;
alter table public.financeiro_asaas_varredura_dias enable row level security;
alter table public.financeiro_asaas_varredura_resumo enable row level security;
