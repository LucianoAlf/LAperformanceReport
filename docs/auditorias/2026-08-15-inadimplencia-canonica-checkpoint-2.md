# Inadimplência — checkpoint 2: leitura canônica e frescor

Data: 15/08/2026
Projeto: `ouqwbbermlzqqvtqwlul`
Branch: `fix/inadimplencia-canonica-frescor`

## Contrato publicado no código

`public.get_inadimplencia_canonica(uuid, date)` devolve uma linha por
fatura canônica e expõe:

- `status`: `ok`, `incomplete` ou `stale`;
- manifesto `freshness` por competência, com `completed_at` e `fresh_until`;
- `items` apenas para `status = 'aberta'`, vencimento até a data de corte e
  `source_missing IS FALSE`;
- `reconciliation.unknown_invoices` para `source_missing = true`, sem chamar
  essas linhas de pagas;
- juros de contrato centralizados: valor original cheio, multa de 2% e mora de
  1% ao mês pro rata die;
- ACL explícita para usuário autenticado com unidade autorizada/admin e
  `service_role`.

Se qualquer competência conhecida com fatura aberta ou indeterminada não tiver
um `live` completo recente, a função retorna `status = 'stale'`, zera os totais
e devolve `items = []`. O snapshot antigo não é servido silenciosamente.
O limite é o `sync_runs.stale_after` gravado pelo sync; não há parâmetro de
caller que possa ampliar essa janela.

## Evidência

As duas migrations foram aplicadas e alinhadas ao ledger remoto, sem usar
`--include-all`:

- `20260816003732_inadimplencia_canonica_frescor`;
- `20260816004257_inadimplencia_canonica_dedupe_global`.

A segunda migration mantém a primeira imutável e corrige o grain global de
`canonical_fatura_id`: duplicatas entre unidades são consolidadas e
diagnosticadas. Se a mesma fatura aparecer simultaneamente confirmada e como
`source_missing`, ela fica somente em `unknown_invoices` e não entra nos
totais nem em `items`.

`tests/inadimplenciaCanonicaPostgres.test.mjs` aplicou a migration em uma
fixture PostgreSQL descartável e comprovou:

1. filtro de aberta/vencida e exclusão de paga;
2. reconciliação pendente para `source_missing`;
3. bloqueio de snapshot velho;
4. cálculo `100 * (1 + 0,02 + 0,01 * 30/30) = 103`;
5. deduplicação global entre unidades;
6. conflito entre linha confirmada e `source_missing` sem cobrança;
7. competência quitada no snapshot mais novo deixa a janela obrigatória;
8. bloqueio de usuário autenticado em outra unidade e leitura de
   `service_role`.

O teste de contrato também protege invoice grain, frescor, juros, ACL e a
fronteira das RPCs operacionais da Sol. O teste foi executado com
`--test-isolation=none` por uma limitação intermitente do runner Node no
Windows; a fixture PostgreSQL passou 1/1.

No remoto, a assinatura efetiva é `get_inadimplencia_canonica(uuid,date)`,
com default de data em `America/Sao_Paulo`, `SECURITY DEFINER`, execução apenas
para `authenticated` e `service_role` e sem permissão para `anon`. A leitura
real das três unidades retornou `status = 'stale'` e `items = []`; portanto,
nenhum snapshot antigo foi exposto como lista de cobrança. Os avisos dos
advisors do Supabase são informativos e preexistentes, sem alerta novo ligado
a estas funções.

## Escopo ainda não concluído

Esta migration só cria a leitura canônica. A fila/backoff do sync e a migração
dos consumidores ficam nos checkpoints seguintes. Nenhum cron foi ligado e
nenhuma RPC operacional da Sol foi alterada.
