# P0.1C - Flatten dos Wrappers Publicos sem `_legacy_p01g`

Data: 2026-06-11

Status: proposta local revisada / SQL draft nao aplicado.

## 1. Resumo executivo

A Fase 1B confirmou que os wrappers publicos `get_dados_relatorio_gerencial` e `get_dados_retencao_ia` ainda chamam as funcoes `_legacy_p01g` e depois sobrescrevem parte do payload com `get_kpis_alunos_canonicos`.

A Fase 1C proposta aqui remove essa chamada direta a `_legacy_p01g` dos wrappers publicos, preservando nome, parametros e shape JSON. A proposta nao remove as funcoes legadas, nao faz DROP, nao faz DML e nao altera `dados_mensais`.

Revisao de seguranca aplicada em 2026-06-12:

- a checagem de ausencia de legado foi trocada para detectar chamada runtime real, evitando falso positivo por comentario;
- `get_dados_relatorio_gerencial` preserva `SECURITY DEFINER`, que e o modo atual em producao;
- `get_dados_retencao_ia` preserva `SECURITY INVOKER`/default, que e o modo atual em producao;
- ambos preservam `SET search_path = public, pg_temp`;
- o limite de `alunos_renovacao_urgente` foi movido para subquery antes do `jsonb_agg`;
- o limite de `evasoes_recentes` tambem foi movido para subquery antes do `jsonb_agg`;
- blocos de retencao, evasoes recentes, permanencia, rankings, cursos e canais foram marcados como legado temporario/operacional quando ainda nao sao contrato canonico.

Arquivo SQL proposto:

- `supabase/migration-drafts/20260611_p01c_flatten_wrappers_publicos_NAO_APLICAR.sql`

## 2. Contrato preservado

Wrappers publicos mantidos:

- `public.get_dados_relatorio_gerencial(uuid, integer, integer) returns jsonb`
- `public.get_dados_retencao_ia(uuid, integer, integer) returns json`

Consumidores runtime confirmados no codigo:

- `src/components/App/Administrativo/ModalRelatorio.tsx`
- `src/components/App/Administrativo/PlanoAcaoRetencao.tsx`

Nao foram encontradas chamadas diretas a `_legacy_p01g` no frontend ou em Edge Functions.

## 3. Mapa de fontes depois da proposta

### `get_dados_relatorio_gerencial`

| Campo/top-level | Fonte proposta | Status |
|---|---|---|
| `periodo` | montagem direta no wrapper | OK |
| `gerente_nome`, `hunter_nome`, `farmers_nomes` | `unidades` | OK |
| `kpis_gestao` | `get_kpis_alunos_canonicos(...)->por_unidade` | Canonico |
| `kpis_alunos_canonicos` | `get_kpis_alunos_canonicos(...)` | Canonico |
| `dados_mes_atual` | `get_kpis_alunos_canonicos(...)->por_unidade` | Canonico |
| `matriculas_ativas`, `matriculas_banda`, `matriculas_2_curso`, `total_bolsistas` | `get_kpis_alunos_canonicos(...)->totais` | Canonico |
| `kpis_retencao` | `vw_kpis_retencao_mensal` direto | Legado temporario |
| `kpis_comercial` | `leads` direto | Fora do P0.1 alunos |
| `metas_kpi` | `metas_kpi` | OK |
| `mes_anterior`, `mesmo_mes_ano_passado` | `dados_mensais` | OK/historico |
| `sazonalidade` | `vw_sazonalidade` | Manter por enquanto |
| `motivos_evasao` | `vw_evasoes_motivos` | Manter por enquanto |
| rankings de professores | views/tabelas operacionais de professores | Fora do corte P0.1C |
| `cursos_mais_procurados`, `canais_maior_conversao`, `total_indicacoes`, `total_family_pacotes`, `permanencia_por_faixa` | consultas diretas preservadas do legado | Mantem shape |

### `get_dados_retencao_ia`

| Campo/top-level | Fonte proposta | Status |
|---|---|---|
| `periodo` | montagem direta no wrapper | OK |
| `kpis_gestao` | `get_kpis_alunos_canonicos(...)->por_unidade` | Canonico |
| `kpis_alunos_canonicos` | `get_kpis_alunos_canonicos(...)` | Canonico |
| `kpis_retencao` | `vw_kpis_retencao_mensal` direto | Legado temporario |
| `renovacoes_proximas` | `get_resumo_renovacoes_proximas(...)` | Operacional |
| `alunos_renovacao_urgente` | `vw_renovacoes_proximas` | Operacional/retencao; limitado por subquery antes do aggregate |
| `mes_anterior`, `mesmo_mes_ano_passado` | `dados_mensais` | Historico |
| `metas` | `metas` | OK |
| `evasoes_recentes` | `movimentacoes_admin` + joins | Operacional; inclui aviso_previo, nao e fonte canonica de churn/evasao e limita itens antes do aggregate |
| `permanencia_por_faixa` | `alunos` | Operacional; preservacao de shape, nao contrato canonico P0.1 |
| `dados_mes_atual` | `dados_mensais` | Mantido para shape atual |

## 4. Campos que deixam de vir de `_legacy_p01g`

Com a proposta aplicada, os wrappers publicos deixam de chamar:

- `get_dados_relatorio_gerencial_legacy_p01g`
- `get_dados_retencao_ia_legacy_p01g`

Os campos abaixo passam a ser montados diretamente no wrapper publico:

- `periodo`
- dados de gestor/equipe
- `kpis_gestao`
- `kpis_alunos_canonicos`
- `dados_mes_atual`
- `kpis_retencao`
- `kpis_comercial`
- metas
- historicos comparativos
- blocos auxiliares de IA/relatorio

Importante: "deixa de vir de `_legacy_p01g`" nao significa que todas as fontes internas ja sejam canonicas. A fonte de retencao ainda esta marcada como legado temporario.

## 5. Campos pendentes / legado temporario

| Campo/bloco | Motivo |
|---|---|
| `kpis_retencao` | ainda usa `vw_kpis_retencao_mensal`; nao consolidar como canonico ate fechar regra completa de retencao |
| `renovacoes_proximas` / `vw_renovacoes_proximas` | ainda depende de fluxo operacional de renovacoes; nao remover antes da frente de renovacao/Fideliza+ |
| `evasoes_recentes` | bloco operacional da IA; inclui `aviso_previo`, portanto nao deve alimentar churn/evasao canonico |
| `permanencia_por_faixa` | preserva shape para IA, mas ainda usa leitura operacional de `alunos` |
| rankings de professores | pertencem a Professores/Carteira; fora do P0.1C |
| `kpis_comercial` | Comercial/Leads/Funil fora do P0.1C |
| views auxiliares `vw_sazonalidade`, `vw_evasoes_motivos`, `vw_kpis_professor_mensal`, `vw_ranking_professores_retencao` | manter ate auditoria propria |

## 6. Baseline SELECT-only antes da Fase 1C

Consulta executada somente leitura em 2026-06-12 no projeto `ouqwbbermlzqqvtqwlul`. Ela registra o estado atual dos wrappers antes de qualquer aplicacao da proposta.

| Unidade | Competencia | Cenario | Relatorio canonico? | Retencao canonico? | Ativos | Pagantes | Ticket | Evasoes | Ren. previstas | Ren. realizadas | Ren. pendentes | MRR perdido |
|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Barra | 2026-05 | maio_fechado | sim | sim | 222 | 221 | 426.53 | 13 | 14 | 13 | 0 | 5786.00 |
| Campo Grande | 2026-05 | maio_fechado | sim | sim | 496 | 470 | 368.66 | 13 | 43 | 38 | 0 | 1719.00 |
| Recreio | 2026-05 | maio_fechado | sim | sim | 324 | 314 | 401.49 | 19 | 16 | 16 | 0 | 0.00 |
| Barra | 2026-06 | junho_aberto | sim | sim | 229 | 226 | 447.28 | 3 | 12 | 12 | 0 | 0.00 |
| Campo Grande | 2026-06 | junho_aberto | sim | sim | 481 | 451 | 390.07 | 2 | 39 | 37 | 0 | 741.00 |
| Recreio | 2026-06 | junho_aberto | sim | sim | 329 | 318 | 440.14 | 17 | 7 | 7 | 0 | 0.00 |
| Consolidado | 2026-06 | junho_consolidado | sim | sim | 1039 | 995 | 419.07 | 22 | 58 | 56 | 0 | 741.00 |

Observacao: estes numeros refletem a base viva/historica no momento da consulta; podem mudar em competencia aberta.

## 7. Queries SELECT-only de paridade

### Confirmar ausencia de chamada a `_legacy_p01g` apos aplicar em ambiente controlado

```sql
select p.oid::regprocedure::text as signature,
       pg_get_functiondef(p.oid) ~
         'get_dados_(relatorio_gerencial|retencao_ia)_legacy_p01g\s*\('
         as calls_legacy_runtime
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_dados_relatorio_gerencial','get_dados_retencao_ia')
order by 1;
```

Esperado depois da Fase 1C aplicada em ambiente controlado:

- `calls_legacy_runtime = false` para os dois wrappers publicos.

Observacao: nao usar `ilike '%legacy_p01g%'`, porque comentarios podem gerar falso positivo.

### Capturar definicao atual antes de aplicar

```sql
select p.oid::regprocedure::text as signature,
       pg_get_functiondef(p.oid) as functiondef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_dados_relatorio_gerencial','get_dados_retencao_ia')
order by 1;
```

### Paridade minima de shape

```sql
with casos as (
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
  select null::uuid, 'Consolidado', 2026, 6
)
select unidade, ano, mes,
       public.get_dados_relatorio_gerencial(unidade_id, ano, mes) ? 'kpis_alunos_canonicos' as rel_tem_canonico,
       public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb ? 'kpis_alunos_canonicos' as ret_tem_canonico,
       jsonb_array_length(public.get_dados_relatorio_gerencial(unidade_id, ano, mes)->'kpis_gestao') as rel_kpis_gestao_len,
       jsonb_array_length((public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb)->'kpis_gestao') as ret_kpis_gestao_len
from casos
order by mes, unidade;
```

### Paridade de top-level keys

```sql
with casos as (
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
  select null::uuid, 'Consolidado', 2026, 6
),
payloads as (
  select unidade, ano, mes,
         public.get_dados_relatorio_gerencial(unidade_id, ano, mes) as relatorio,
         public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb as retencao
  from casos
)
select unidade, ano, mes,
       (select array_agg(key order by key) from jsonb_object_keys(relatorio) key) as relatorio_keys,
       (select array_agg(key order by key) from jsonb_object_keys(retencao) key) as retencao_keys
from payloads
order by mes, unidade;
```

### Paridade de arrays principais

```sql
with casos as (
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
  select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
  select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
  select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
  select null::uuid, 'Consolidado', 2026, 6
),
payloads as (
  select unidade, ano, mes,
         public.get_dados_relatorio_gerencial(unidade_id, ano, mes) as relatorio,
         public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb as retencao
  from casos
)
select unidade, ano, mes,
       jsonb_array_length(coalesce(relatorio->'kpis_gestao', '[]'::jsonb)) as rel_kpis_gestao_len,
       jsonb_array_length(coalesce(relatorio->'kpis_retencao', '[]'::jsonb)) as rel_kpis_retencao_len,
       jsonb_array_length(coalesce(retencao->'kpis_gestao', '[]'::jsonb)) as ret_kpis_gestao_len,
       jsonb_array_length(coalesce(retencao->'kpis_retencao', '[]'::jsonb)) as ret_kpis_retencao_len,
       jsonb_array_length(coalesce(retencao->'alunos_renovacao_urgente', '[]'::jsonb)) as ret_urgentes_len,
       jsonb_array_length(coalesce(retencao->'evasoes_recentes', '[]'::jsonb)) as ret_evasoes_recentes_len
from payloads
order by mes, unidade;
```

## 8. Riscos para Gemini/IA/relatorios

- Risco principal: algum consumidor depender implicitamente de campo legado pouco usado dentro de `kpis_retencao`, rankings ou historicos auxiliares.
- Mitigacao: preservar top-level keys e arrays; comparar payload JSON antes/depois com queries de paridade.
- Risco de negocio: declarar retencao como canonica antes de fechar fonte. A proposta evita isso: `kpis_retencao` fica documentado como legado temporario.
- Risco operacional: `evasoes_recentes` inclui `aviso_previo`; este bloco serve para contexto da IA, nao para calculo canonico de churn/evasao.
- Risco de permissao: nao alterar modo de seguranca dos wrappers publicos nesta fase. `get_dados_relatorio_gerencial` permanece `SECURITY DEFINER`; `get_dados_retencao_ia` permanece `SECURITY INVOKER`/default.
- Risco de execucao: aplicar diretamente em producao sem ensaio. Recomendacao: aplicar primeiro em ambiente controlado ou janela com rollback pronto.

## 9. Rollback

Rollback proposto no SQL draft:

- recriar `get_dados_relatorio_gerencial` no formato P0.1G atual, voltando a chamar `get_dados_relatorio_gerencial_legacy_p01g` e sobrescrever apenas blocos canonicos;
- recriar `get_dados_retencao_ia` no formato P0.1G atual, voltando a chamar `get_dados_retencao_ia_legacy_p01g`;
- nao dropar as funcoes legacy.

## 10. Recomendacao

Nao aplicar ainda em producao.

Status recomendado depois da revisao: pre-staging. O draft esta mais seguro, mas ainda precisa baseline antes/depois em ambiente controlado.

Proximo passo recomendado:

1. revisar o SQL draft;
2. aplicar em ambiente controlado/staging;
3. rodar as queries de paridade;
4. comparar payloads de `ModalRelatorio` e `PlanoAcaoRetencao`;
5. so depois pedir APPROVE para executar em producao.

O objetivo desta fase e correto e limitado: desacoplar runtime publico de `_legacy_p01g`, sem limpar tudo agora.
