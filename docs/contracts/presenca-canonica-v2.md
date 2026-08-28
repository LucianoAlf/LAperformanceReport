# Contrato de presença canônica v2

Contrato aditivo em sombra. `aluno_presenca` continua sendo a evidência bruta;
nenhum consumidor operacional lê a v2 até os gates de comparação e frescor.

## Grão e chave

Uma ocorrência é identificada por:

```text
(aluno_id, unidade_id, professor_id,
 data_hora_inicio, data_hora_fim, lower(btrim(curso_nome)))
```

`fn_presenca_slot_key_v2` materializa a chave como MD5 de um array JSON com os
seis componentes, preservando `null`. `aula_emusys_id` é proveniência e aparece
em `ids_aulas_emusys`; nunca identifica o slot sozinho. O mesmo ID do Emusys em
duas unidades produz duas ocorrências.

Quando uma linha histórica não possui vínculo com `aulas_emusys`, início só usa
`data_aula + horario_aula` em `America/Sao_Paulo` se o horário existir. Professor,
início, fim ou curso ausente torna a identidade incompleta: a linha recebe chave
isolada `incompleto:<hash-do-id>`, resultado `indeterminado` e não fecha chamada.
Duas linhas incompletas nunca são fundidas por suposição.

## Estados e precedência

| Evidência eleita | `resultado_canonico` | `fecha_chamada` | `fonte_decisao` |
|---|---|---:|---|
| Secretaria humana terminal | estado humano | `true` | `agenda_secretaria` |
| Manual humano terminal | estado humano | `true` | `manual` |
| LA Teacher/Fábio terminal | estado humano | `true` | fonte humana |
| Aula cancelada | `aula_cancelada` | `false` | `aula_cancelada` |
| Aula justificada | `aula_justificada` | `false` | `aula_justificada` |
| Emusys presente sem humano terminal | `presente` | `true` | `emusys` |
| Emusys ausente com política temporal confirmada | `falta` | `false` | `emusys_politica_temporal` |
| Emusys ausente sem política confirmatória aplicável | `indeterminado` | `false` | `indeterminado` |
| Humano não terminal ou sem `respondido_em` | `indeterminado` | `false` | `indeterminado` |

A força da fonte é aplicada antes de `decidido_em` e `id`. Entre fontes da mesma
força, o primeiro instante terminal vence, preservando o `first write wins`.
Secretaria prevalece sobre professor; sincronização nunca apaga decisão humana.
A política temporal define a classificação da ausência mesmo quando exige revisão
posterior; `exige_revisao_operacional` não transforma a evidência em decisão
humana e, portanto, a ausência continua sem fechar a chamada.

`possui_conflito=true` quando decisões humanas terminais divergem, quando humano
e Emusys discordam, ou quando as linhas gêmeas do Emusys discordam entre si. O
resultado eleito permanece disponível, mas o conflito nunca é silencioso.
Cancelamento/justificativa vale para o slot inteiro; presença registrada nesse
slot conserva `possui_conflito=true`, mas não entra como frequência.

## Colunas públicas

```text
slot_key, aluno_id, unidade_id, professor_id,
data_aula, data_hora_inicio, data_hora_fim, curso_nome,
resultado_canonico, fecha_chamada, fonte_decisao, decidido_em,
emusys_presenca_bruta, possui_conflito, ids_aulas_emusys, regra_versao
```

Consumidores futuros devem usar `fecha_chamada` para estado operacional e, após
o ledger existir, o estado de cobertura/frescor para decidir publicação. Uma
`falta` derivada da política temporal do Emusys não equivale a uma chamada
humana fechada.

## Segurança e rollout

- A view é `security_invoker=true`.
- `PUBLIC`, `anon` e `authenticated` não recebem `SELECT`.
- Somente `service_role` recebe `SELECT` e `EXECUTE` na chave durante a sombra.
- Nenhuma tabela, evidência ou snapshot histórico é reescrito.
- O cutover depende de `sem_explicacao=0` e do ledger completo por unidade/data.
