-- Espelho de faturas PAGAS por data de pagamento (para o DRE caixa do Super Folha).
-- O sync de faturas puxa por vencimento/competência; faturas pagas em M com
-- vencimento futuro (adiantamento, cheque pré-datado) não chegam no mês em que
-- o dinheiro entrou. Esta tabela captura essas faturas para o export.
--
-- Chave única = (unidade_id, emusys_fatura_id): uma fatura só é paga uma vez.
-- competencia_pagamento = mês da data_pagamento (a "competência" do DRE caixa).
-- competencia_vencimento = mês da data_vencimento (a competência do snapshot).
--
-- O export faz o merge: snapshot por vencimento + faturas_pagas_mes por pagamento,
-- dedup por emusys_fatura_id (a do snapshot vence primeiro, a de pagamento é extra).

create table if not exists public.faturas_pagas_mes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  unidade_codigo text not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_contrato_id bigint,
  emusys_student_id bigint,
  descricao text not null default '',
  status text not null default 'paga',
  data_vencimento date not null,
  data_pagamento date not null,
  competencia_vencimento date not null,
  competencia_pagamento date not null,
  valor_original numeric(12,2) not null default 0,
  valor_pago numeric(12,2),
  juros_e_multa numeric(12,2) not null default 0,
  desconto_aplicado numeric(12,2) not null default 0,
  desconto_fixo numeric(12,2) not null default 0,
  desconto_condicional numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  constraint faturas_pagas_mes_unidade_fatura_uniq unique (unidade_id, emusys_fatura_id)
);

create index if not exists idx_faturas_pagas_mes_competencia_pagamento
  on public.faturas_pagas_mes (competencia_pagamento, unidade_id);

create index if not exists idx_faturas_pagas_mes_unidade_vencimento
  on public.faturas_pagas_mes (unidade_id, data_vencimento);

alter table public.faturas_pagas_mes enable row level security;

revoke all on table public.faturas_pagas_mes from public, anon, authenticated;
grant select, insert, update on table public.faturas_pagas_mes to service_role;

comment on table public.faturas_pagas_mes is
  'Faturas PAGAS capturadas por data de pagamento (DRE caixa). O sync puxa status=paga com vencimento M-2 a M+12, filtra por data_pagamento em M. O export merge com o snapshot de vencimento, dedup por emusys_fatura_id.';
