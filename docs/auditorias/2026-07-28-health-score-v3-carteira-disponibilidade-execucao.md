# Health Score V3 - carteira proporcional à disponibilidade

**Data:** 2026-07-28  
**Competência simulada:** julho/2026  
**Estado:** materializado em revisões de sombra; nenhum consumidor alterado  
**Fonte canônica da disponibilidade:** `professores_unidades.disponibilidade`

## Veredito

A regra aprovada foi implementada e materializada nas três unidades:

- carteira em pessoas canônicas únicas por professor e unidade;
- bandas e projetos permanecem na carteira;
- meta de carteira = horas semanais cadastradas x P75 de alunos/hora da unidade;
- P50 preservado somente como diagnóstico;
- maturação de seis meses exclui o pilar da nota sem esconder valor e meta;
- disponibilidade ausente e carteira zerada não fabricam nota zero;
- metas por curso continuam diagnósticas e não são somadas;
- as 33 atribuições não pontuáveis permanecem auditáveis e não bloqueiam carteira nem média/turma;
- média/turma não teve sua fórmula alterada;
- cada revisão guarda horas, P75, meta resultante e hash do JSON de disponibilidade.

## Políticas aplicadas

| Unidade | P50 diagnóstico | P75 aplicado |
|---|---:|---:|
| Barra | 0,946 aluno/h | 1,143 aluno/h |
| Campo Grande | 1,300 aluno/h | 1,607 aluno/h |
| Recreio | 0,921 aluno/h | 1,141 aluno/h |

## Cobertura da disponibilidade

Os números anteriores de `71/81` e `8 pendentes` mediam universos diferentes.

| Unidade | Todos os vínculos | Todos preenchidos | Vínculos ativos | Ativos preenchidos | Ativos pendentes |
|---|---:|---:|---:|---:|---:|
| Barra | 20 | 18 | 19 | 18 | 1 |
| Campo Grande | 35 | 30 | 32 | 27 | 5 |
| Recreio | 26 | 23 | 24 | 22 | 2 |
| **Total** | **81** | **71** | **75** | **67** | **8** |

Vínculos inativos e identidades mescladas continuam no histórico, mas não devem
ser enviados à coordenação para preenchimento de disponibilidade atual.

## Simulação V4 anterior x nova revisão

| Unidade | Professores | Score V4 | Score novo | Parciais novos | Cobertura média V4 | Cobertura média nova | Score médio novo | Sem base |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Barra | 20 | 11 | 14 | 14 | 53,50% | 59,75% | 80,19 | 6 |
| Campo Grande | 34 | 17 | 20 | 20 | 55,30% | 55,59% | 87,27 | 14 |
| Recreio | 28 | 14 | 17 | 17 | 51,92% | 56,25% | 81,99 | 11 |

`Score V4` indica quantos professores tinham score no último snapshot anterior
à revisão-base criada nesta execução. A coluna `Score novo` usa a revisão
append-only corrigida pela disponibilidade.

## Distribuição dos scores novos

| Unidade | 60-69 | 70-79 | 80-89 | 90-100 | Sem base |
|---|---:|---:|---:|---:|---:|
| Barra | 1 | 6 | 5 | 2 | 6 |
| Campo Grande | 0 | 3 | 8 | 9 | 14 |
| Recreio | 1 | 4 | 10 | 2 | 11 |

Nenhum ranking ou premiação foi habilitado. As revisões seguem em estado
`parcial` ou `sem_base`.

## Conferência nominal solicitada - Barra

| Professor | Score antes | Score depois | Cobertura antes | Cobertura depois | Alunos | Horas | Meta carteira | Nota carteira | Estado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Erick Cosme da Silva | sem base | sem base | 10% | 25% | 9 | 39 | 44,58 | - | `em_maturacao` |
| Gabriel Antony Alves de Araújo | 78,26 | 83,37 | 75% | 75% | 43 | 45 | 51,44 | 83,60 | `ok` |
| Isaque Mendes da Silva | 90,44 | 85,09 | 60% | 85% | 25 | 36 | 41,15 | 60,76 | `ok` |
| Peterson Biancamano | 90,34 | 96,22 | 85% | 85% | 10 | 7 | 8,00 | 100,00 | `ok` |

O resultado preserva a decisão que motivou a auditoria: Erick continua sem
score porque o vínculo está em maturação; Isaque possui score com amostra
madura. Peterson deixa de ser comparado com uma meta global incompatível com
sua carga de sete horas.

## Estados do pilar de carteira

| Unidade | `ok` | `em_maturacao` | `sem_base_disponibilidade` | `sem_base_zero_carteira` |
|---|---:|---:|---:|---:|
| Barra | 14 | 4 | 2 | 0 |
| Campo Grande | 24 | 2 | 7 | 1 |
| Recreio | 20 | 2 | 6 | 0 |

Esses totais incluem vínculos inativos e identidades históricas materializadas.
A lista operacional de preenchimento contém somente os oito vínculos ativos.

## Integridade e auditoria

- `payload_emusys` com horário/disponibilidade/agenda: **0 de 81**;
- origem `la_report_legacy`, estado `preexistente`, sem validação formal:
  **60 vínculos**;
- atribuições não pontuáveis preservadas no diagnóstico: **33**;
- linhas diagnósticas não pontuáveis nos snapshots: **70**;
- métricas de carteira ou média/turma ainda bloqueadas por
  `segmentacao_incompleta`: **0**;
- revisões corrigidas: Barra 20, Campo Grande 34, Recreio 28;
- alterações em telas, cards, rankings, relatórios ou RPCs consumidoras:
  **nenhuma**.

Os snapshots foram gravados em cadeia append-only. A revisão-base intermediária
foi preservada e a revisão corrigida aponta para ela em `snapshot_anterior_id`.

## Ponto para revisão da coordenação

`Matheus Sterque Mendes`, em Campo Grande, possui as chaves `Sexta` e
`Sexta-feira`, ambas 15:00-16:00. A simulação atual soma oito horas semanais,
mas o cadastro aparenta duplicar a mesma faixa. Corrigir o cadastro antes da
rematerialização final.

## Próximo gate

1. Coordenação confere e salva os oito vínculos ativos sem disponibilidade.
2. Coordenação corrige a duplicidade de dia do Matheus Sterque.
3. Rematerializar julho com os JSONs finais.
4. Comparar novamente os deltas e somente então decidir eventual cutover de
   consumidores.

Arquivos complementares:

- `2026-07-28-health-score-v3-carteira-disponibilidade-folha-coordenacao.md`
- `2026-07-28-health-score-v3-carteira-disponibilidade-delta-professor.md`
