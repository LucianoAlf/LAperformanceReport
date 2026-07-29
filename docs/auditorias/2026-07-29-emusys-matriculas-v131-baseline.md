# Baseline read-only - Emusys matriculas v1.3.1

**Data:** 2026-07-29  
**Modo:** SELECT-only no LA Report e GET-only no Emusys  
**Grao canonico:** `unidade_id + emusys_matricula_id`  
**Escritas durante o baseline:** nenhuma

## Veredito inicial

O contrato antigo nao pode receber o payload v1.3.1 com seguranca:

- `sync-matriculas-emusys` nao reconhece `inativa` e usa fallback para `ativo`;
- a jornada antiga usa `trancada` tanto para trancamento temporario quanto para milhares de interrupcoes definitivas;
- `matricula_finalizacao` trata toda finalizacao como evasao;
- consumidores vivos divergem entre `ativo` e `ativo + trancado`.

O corte aprovado para a nova fonte canonica e:

| Estado Emusys | Estado local | Regra operacional |
|---|---|---|
| `ativa` | `ativo` | entra na base ativa |
| `trancada` | `trancado` | trancamento temporario; fica fora dos denominadores ativos |
| `inativa / interrompida` | `evadido` | interrupcao definitiva |
| `inativa / concluida` | `inativo` | contrato concluido sem renovacao ativa |

## GET Emusys

Fotografia obtida na auditoria v1.3.1 por unidade:

| Unidade | Ativa | Trancada | Inativa / interrompida | Inativa / concluida |
|---|---:|---:|---:|---:|
| Barra | 262 | 6 | 476 | 69 |
| Recreio | 426 | 4 | 915 | 138 |
| Campo Grande | 495 | 18 | 1.809 | 193 |
| **Total** | **1.183** | **28** | **3.200** | **400** |

Esses numeros sao estado atual da API. Nao representam movimentos iniciados no mes.

## Banco local antes da implementacao

Consulta executada em 29/07/2026:

```sql
select u.nome unidade, a.status, count(*) linhas,
       count(distinct lower(trim(a.nome))) pessoas
from public.alunos a
join public.unidades u on u.id = a.unidade_id
where a.arquivado_em is null
group by u.nome, a.status;
```

| Unidade | Status local | Linhas | Pessoas por nome normalizado |
|---|---|---:|---:|
| Barra | ativo | 261 | 236 |
| Barra | trancado | 8 | 8 |
| Barra | evadido | 29 | 28 |
| Barra | inativo | 71 | 68 |
| Campo Grande | ativo | 497 | 431 |
| Campo Grande | trancado | 20 | 20 |
| Campo Grande | evadido | 113 | 113 |
| Campo Grande | inativo | 73 | 72 |
| Recreio | ativo | 427 | 343 |
| Recreio | trancado | 5 | 4 |
| Recreio | evadido | 54 | 54 |
| Recreio | inativo | 39 | 35 |

Jornada antiga:

| Unidade | Status da jornada | Linhas | Matriculas |
|---|---|---:|---:|
| Barra | ativa | 270 | 269 |
| Barra | trancada | 476 | 476 |
| Barra | finalizada | 69 | 69 |
| Campo Grande | ativa | 515 | 511 |
| Campo Grande | trancada | 1.812 | 1.811 |
| Campo Grande | finalizada | 193 | 193 |
| Recreio | ativa | 441 | 431 |
| Recreio | trancada | 915 | 915 |
| Recreio | finalizada | 137 | 137 |

O total de `trancada` na jornada antiga coincide quase exatamente com
`inativa / interrompida` da API. Portanto essa coluna nao identifica
trancamento temporario na fotografia historica atual.

## Inventario de consumidores

| Familia | Fonte atual encontrada | Acao |
|---|---|---|
| Administrativo | `get_kpis_alunos_admin_operacional`, `AdministrativoPage.tsx`, `ModalRelatorio.tsx` | migrar e separar estado atual de movimento |
| Alunos | `AlunosPage.tsx`, `TabelaAlunos.tsx`, `kpisAlunosVivosCanonicos.ts` | migrar ativos/pagantes e manter filtro dedicado de trancados |
| Dashboard | `fetchKPIsAlunosCanonicos`, `kpisAlunosVivosCanonicos.ts` | migrar fonte viva |
| Analytics | hooks executivos e snapshots mensais | migrar somente competencia aberta; preservar snapshots fechados |
| Professores | jornada atual, carteira e Health Score | ja usa jornada `ativa` em grande parte; validar todos os consumidores |
| Sucesso do Aluno | `vw_aluno_sucesso_lista` | retirar `trancado` da populacao atual |
| LA Teacher | `app_minha_carteira`, jornada atual | validar que somente `ativa` continua saindo |
| Fabio | `vw_fabio_carteira_professor` e contexto | validar que somente `ativa` continua saindo |
| Relatorios | administrativo WhatsApp, gerencial e BI | consumir RPCs canonicas; nao recalcular status na IA |
| Health Score | carteira atual e populacao observada | trancado fora da nota corrente |
| Churn | `features_churn_alunos_ativos` e risco atual | trancado fora da populacao corrente; pipeline segue em auditoria |
| Financeiro | pagantes, MRR, ticket, inadimplencia e contratos atuais | somente `ativa` |

## Medidas que nao podem ser confundidas

- **Trancados agora:** estado corrente `trancada` na fonte canonica.
- **Trancamentos no periodo:** linhas de
  `movimentacoes_admin.tipo = 'trancamento'` iniciadas no recorte.

As duas medidas nao compartilham denominador e nao podem usar o mesmo rotulo.

## Objetos historicos

`dados_mensais`, `fechamento_mensal_snapshots` e snapshots fechados do Health
Score permanecem imutaveis. A regra nova vale para leitura viva, competencia
aberta e fechamentos futuros.

## Riscos congelados

1. Um status novo ou inconsistente pode virar `ativo` pelo fallback atual.
2. Conclusao pode virar evasao pelo webhook atual.
3. Trancado pode contar em carteira, MRR e ticket em alguns consumidores e
   ficar fora em outros.
4. Destrancamento manual por nome pode atingir a linha errada.
5. Relatorio gerencial pode divergir da tela se recalcular a semantica.
