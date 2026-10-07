-- 23/09/2026 — financeiro_emusys_lancamentos ganha emusys_fatura_id.
--
-- O endpoint GET /financeiro/lancamentos passou a expor fatura_id: o id da
-- fatura que o lancamento quitou quando a Rose reconcilia o extrato na tela
-- do Emusys. E a ponte deterministica extrato -> fatura usada na
-- reconciliacao com o Super Folha (propostas_sf_v3). Sem a coluna, o campo
-- so sobreviveria dentro do payload jsonb e o espelho nao serviria de fonte
-- para a conciliacao.
--
-- Backfill: itens ja espelhados que trouxeram fatura_id dentro de payload
-- ganham a coluna agora. Itens buscados antes do campo existir seguem NULL
-- ate o dia ser revarrido pela rotina (revarredura cobre os ultimos 10 dias
-- todo dia e o mes anterior na semanal).

alter table public.financeiro_emusys_lancamentos
  add column emusys_fatura_id bigint;

comment on column public.financeiro_emusys_lancamentos.emusys_fatura_id is
  'fatura_id do payload do lancamento (Emusys): a fatura que a conciliacao da Rose vinculou a este lancamento. Id no namespace da unidade/token — juntar com contas_receber.emusys_fatura_id sempre filtrando unidade.';

-- chave de junção com contas_receber.emusys_fatura_id (id é por token/unidade)
create index financeiro_lancamentos_fatura_idx
  on public.financeiro_emusys_lancamentos (unidade_id, emusys_fatura_id)
  where emusys_fatura_id is not null;

-- backfill a partir do payload cru ja espelhado (fatura_id ausente ou null
-- no json vira NULL — jsonb ->> devolve SQL null em ambos os casos)
update public.financeiro_emusys_lancamentos
set emusys_fatura_id = (payload ->> 'fatura_id')::bigint
where payload ->> 'fatura_id' is not null;
