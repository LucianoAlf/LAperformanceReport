# P02.H.1 - Dashboard Leads v2

Data: 2026-06-15

## Escopo

Objetivo do patch: migrar somente o card de Leads do Dashboard operacional para a fonte comercial canonica v2.

Arquivos alterados:

- `src/components/App/Dashboard/DashboardPage.tsx`
- `src/hooks/useComercialOperacionalResumoV2.ts`

Escopo explicitamente nao alterado:

- Experimentais
- Matriculas
- Taxa de conversao
- Ticket/passaporte
- Professores
- Cursos
- Relatorios diario/mensal
- `/app/comercial`
- `ComercialPage.tsx`
- `TabComercialNew.tsx`
- `TabProfessoresNew.tsx`
- `dados_comerciais`
- `origem_leads`
- `dados_mensais`
- Supabase schema, SQL de escrita, migration, backfill ou deploy

## Implementacao

Foi criado o hook isolado `useComercialOperacionalResumoV2`.

O hook chama somente a RPC:

`public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes, p_periodo, p_data)`

Para o card de Leads, o hook soma `kpis.leads_entrantes` para os meses do range selecionado no Dashboard:

- `ano` vem do filtro de competencia do Dashboard.
- `mesInicio` e `mesFim` vem do range de competencia.
- `unidadeId = "todos"` envia `p_unidade_id = null`.
- Unidade especifica envia o UUID selecionado.
- `p_periodo = "mensal"`.
- `p_data = null`.

No `DashboardPage`, somente o card `Leads` passou a exibir o valor v2. Os demais cards continuam usando as fontes existentes.

## Validacao SELECT-only

Ambiente: producao read-only via RPC/SELECT.

Objetivo: comparar `leads_entrantes` da RPC v2 contra contagem direta em `public.leads` para Maio/2026 e Junho/2026, por unidade e consolidado.

SQL usado:

```sql
with unidades as (
  select null::uuid as unidade_id, 'Consolidado' as unidade_nome
  union all select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande'
  union all select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio'
  union all select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra'
),
periodos as (
  select 2026 as ano, 5 as mes
  union all select 2026, 6
),
params as (
  select p.ano, p.mes, u.unidade_id, u.unidade_nome
  from periodos p
  cross join unidades u
),
direto as (
  select
    p.ano,
    p.mes,
    p.unidade_id,
    p.unidade_nome,
    count(l.id)::int as direct_count_rows,
    coalesce(sum(coalesce(l.quantidade, 1)), 0)::int as direct_sum_quantidade
  from params p
  left join public.leads l
    on l.data_contato >= make_date(p.ano, p.mes, 1)
   and l.data_contato < (make_date(p.ano, p.mes, 1) + interval '1 month')
   and (p.unidade_id is null or l.unidade_id = p.unidade_id)
  group by p.ano, p.mes, p.unidade_id, p.unidade_nome
),
rpc as (
  select
    p.ano,
    p.mes,
    p.unidade_id,
    p.unidade_nome,
    (
      public.get_kpis_comercial_canonicos_v2(
        p.unidade_id,
        p.ano,
        p.mes,
        'mensal',
        null::date
      )->'kpis'->>'leads_entrantes'
    )::int as rpc_leads_entrantes
  from params p
)
select
  r.ano,
  r.mes,
  r.unidade_nome,
  r.rpc_leads_entrantes,
  d.direct_count_rows,
  d.direct_sum_quantidade,
  r.rpc_leads_entrantes - d.direct_sum_quantidade as diff_rpc_vs_sum_quantidade
from rpc r
join direto d
  using (ano, mes, unidade_id, unidade_nome)
order by r.ano, r.mes, r.unidade_nome;
```

Resultado:

| Ano | Mes | Unidade | RPC v2 | SELECT direto | Diferenca |
| --- | --- | --- | ---: | ---: | ---: |
| 2026 | 05 | Barra | 180 | 180 | 0 |
| 2026 | 05 | Campo Grande | 516 | 516 | 0 |
| 2026 | 05 | Consolidado | 918 | 918 | 0 |
| 2026 | 05 | Recreio | 222 | 222 | 0 |
| 2026 | 06 | Barra | 82 | 82 | 0 |
| 2026 | 06 | Campo Grande | 211 | 211 | 0 |
| 2026 | 06 | Consolidado | 439 | 439 | 0 |
| 2026 | 06 | Recreio | 146 | 146 | 0 |

Conclusao da validacao SELECT-only: para Leads, a RPC v2 bate com a contagem transacional direta em `public.leads` para Maio/2026 e Junho/2026, por unidade e consolidado.

Observacao: os numeros atuais de Maio/2026 diferem dos totais encontrados em auditorias antigas. Isso foi registrado como ponto de atencao historico, mas nao foi corrigido nem reprocessado neste PR.

## Gates locais

- `git diff --check`: passou. Apenas aviso de conversao LF/CRLF no Windows para `DashboardPage.tsx`.
- `npm run build`: passou com exit code 0.
- Warnings do build: Recharts/circular re-export e chunk size, ja existentes no projeto.
- `npm test`/lint: nao executados porque `package.json` nao possui scripts `test` ou `lint`.

## Validacao visual

Status: aprovada em ambiente local autenticado com backend de producao read-only.

URL local: `http://127.0.0.1:5177/app`

Ambiente de dados: `https://ouqwbbermlzqqvtqwlul.supabase.co`

Nao foi gravada chave em arquivo. As variaveis `VITE_*` foram herdadas temporariamente no processo local do Vite.

Resultados visuais:

| Competencia | Unidade | Leads exibidos | Esperado RPC v2 | Resultado |
| --- | --- | ---: | ---: | --- |
| 2026-05 | Consolidado | 918 | 918 | OK |
| 2026-05 | Campo Grande | 516 | 516 | OK |
| 2026-05 | Recreio | 222 | 222 | OK |
| 2026-05 | Barra | 180 | 180 | OK |
| 2026-06 | Consolidado | 439 | 439 | OK |
| 2026-06 | Campo Grande | 211 | 211 | OK |
| 2026-06 | Recreio | 146 | 146 | OK |
| 2026-06 | Barra | 82 | 82 | OK |

Checklist visual:

- Dashboard operacional abriu autenticado.
- Card `Leads (Mes)` carregou pela fonte v2.
- Sem `NaN`.
- Sem erro visual de RPC.
- Sem loading infinito.
- Filtro de mes respeitado para Maio/2026 e Junho/2026.
- Filtro de unidade respeitado para Consolidado, Campo Grande, Recreio e Barra.
- Demais cards permaneceram na tela e nao foram migrados neste patch.
- Console errors durante a validacao visual: nenhum.

## Riscos e observacoes

- O Dashboard continua misto: somente Leads foi migrado para v2.
- Experimentais, matriculas, taxa de conversao, ticket/passaporte e demais blocos comerciais continuam em fontes antigas/mistas.
- Este patch nao resolve relatorio diario, relatorio mensal, `/app/comercial`, `ComercialPage`, IA/Gemini ou consumidores operacionais fora do card Leads.
- O card usa range explicito do Dashboard (`ano`, `mesInicio`, `mesFim`) e nao usa `CURRENT_DATE`.
- Rollback: remover o hook novo e voltar o valor do card Leads para `dadosComercial?.leads_mes`.

## Veredito

P02.H.1 esta pronto como patch tecnico local para revisao antes de commit/PR.

Confirmacao explicita: somente o card de Leads mudou. Nenhum outro KPI do Dashboard foi migrado neste patch.
