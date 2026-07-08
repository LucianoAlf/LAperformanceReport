# Jornada canonica por matricula/disciplina — Design

**Data:** 2026-07-08
**Status:** aprovado como regra de negocio — aguardando plano de implementacao
**Escopo:** LA Report, Emusys, Sucesso do Aluno, Alunos, Professores e base para LA Teacher

## Problema

Hoje o LA Report ja consegue mostrar alguns sinais de jornada, mas eles estao espalhados:

- A aba **Jornada** de Sucesso do Aluno usa `fase_jornada`, calculada por tempo de permanencia.
- A aba **Marcos** usa a Edge `marcos-jornada`, que consulta aulas do Emusys por periodo e le `nr_da_aula`.
- A ficha do aluno e historicos de presenca consomem `aulas_emusys` e `aluno_presenca`.
- `movimentacoes_admin` registra eventos administrativos, mas nao representa o estado atual do contrato por disciplina.

Isso resolve leituras operacionais, mas nao responde de forma canonica:

> Em qual aula do contrato este aluno esta agora, em cada curso/disciplina?

Exemplo de regra real:

- Um aluno com Piano e Canto tem duas jornadas separadas.
- Piano pode estar em `12/40`.
- Canto pode estar em `3/40`.

Essa informacao precisa existir como estado canonico, nao como calculo solto de tela.

## Objetivo

Criar uma camada canonica nova para jornada por matricula/disciplina, separada de:

- `alunos` puro.
- `movimentacoes_admin`.
- presenca/falta.
- marcos operacionais de pesquisa.

Essa camada sera a fonte oficial para:

- LA Teacher: carteira do professor com posicao de cada aluno.
- Sucesso do Aluno: acompanhamento de jornada por contrato/disciplina.
- Alunos: ficha detalhada da jornada.
- Professores: leitura de carteira e risco de renovacao.
- Relatorios futuros de jornada.

## Nao-objetivos

- Substituir `fase_jornada` atual por tempo de permanencia.
- Apagar ou reescrever `marcos-jornada`.
- Usar presenca/falta para definir em qual aula do contrato o aluno esta.
- Mudar as regras financeiras, ticket, MRR ou retencao.
- Fazer push de dados para o Emusys.

## Regra oficial

Jornada canonica e por **matricula/disciplina**.

O identificador principal do vinculo e:

- `unidade_id`
- `emusys_matricula_disciplina_id`

Os IDs do Emusys sao por unidade. Portanto qualquer chave, upsert ou matching precisa sempre considerar a unidade.

### Contadores oficiais

- `nr_aulas_passadas`: aulas ja ocorridas no contrato, segundo o Emusys.
- `nr_aulas_contratadas`: total de aulas contratadas.
- `nr_aulas_futuras`: aulas restantes/agendadas segundo o Emusys.
- `proxima_aula_numero`: `nr_aulas_passadas + 1`, quando ainda houver aula futura.
- `percentual_jornada`: percentual de 0 a 100, calculado como `nr_aulas_passadas / nr_aulas_contratadas * 100`.

### Exibicao

Quando houver aula futura:

- Exibir `Aula 36/40`.
- Tambem mostrar `35 realizadas de 40` para tirar ambiguidade.

Quando nao houver aula futura:

- Exibir `40/40 concluida` se o total contratado estiver completo.
- Exibir o estado disponivel se os contadores estiverem incompletos.

## Presenca e falta

Presenca/falta nao define a posicao oficial da jornada.

Um aluno pode estar na aula `21/40` mesmo tendo faltado quatro aulas. A jornada anda pelo contrato e pelas aulas ocorridas; presenca mede comportamento, risco e qualidade de acompanhamento.

Por isso a arquitetura deve ter duas leituras:

1. **Jornada canonica:** posicao oficial do contrato/disciplina.
2. **Jornada enriquecida:** jornada canonica + presencas + faltas + taxa de presenca + ultima aula.

Fonte de presenca/falta:

- `aulas_emusys`
- `aluno_presenca`
- sync de presenca/aulas Emusys

Esses dados entram em views de leitura, nao na regra de contagem da aula atual.

## Tabela canonica

Criar tabela:

`aluno_jornada_matricula_disciplina`

Campos centrais:

| Campo | Tipo sugerido | Observacao |
|---|---|---|
| `id` | uuid | PK interna |
| `unidade_id` | uuid | obrigatorio |
| `aluno_id` | bigint ou uuid conforme tabela atual | aluno local |
| `emusys_aluno_id` | integer | ID por unidade |
| `emusys_matricula_id` | integer | matricula Emusys |
| `emusys_matricula_disciplina_id` | integer | vinculo matricula-disciplina |
| `emusys_disciplina_id` | integer | disciplina/curso Emusys |
| `curso_id` | bigint ou uuid conforme tabela atual | curso local, quando houver de-para |
| `curso_nome_emusys` | text | nome vindo do Emusys |
| `professor_id` | bigint ou uuid conforme tabela atual | professor local, quando houver match |
| `emusys_professor_id` | integer | ID do professor no Emusys |
| `professor_nome_emusys` | text | fallback/auditoria |
| `status_matricula` | text | ativa, trancada, finalizada etc. |
| `qtd_contratos` | integer | vindo de matricula |
| `nr_aulas_contratadas` | integer | total |
| `nr_aulas_passadas` | integer | aulas ocorridas |
| `nr_aulas_futuras` | integer | aulas futuras/restantes |
| `proxima_aula_numero` | integer | passadas + 1 quando aplicavel |
| `percentual_jornada` | numeric | percentual de 0 a 100 |
| `data_primeira_aula` | date/timestamptz | inicio da disciplina/contrato |
| `data_ultima_aula` | date/timestamptz | fim previsto |
| `dia_semana` | integer/text | agenda principal, quando houver |
| `horario` | text/time | agenda principal, quando houver |
| `fonte_ultima_atualizacao` | text | webhook, sync, backfill |
| `ultima_sincronizacao_emusys` | timestamptz | auditoria |
| `payload_snapshot` | jsonb | snapshot minimo da matricula/disciplina |
| `created_at` | timestamptz | default now |
| `updated_at` | timestamptz | atualizado em upsert |

### Indices e unicidade

Chave unica recomendada:

```sql
unique (unidade_id, emusys_matricula_disciplina_id)
```

Indices recomendados:

```sql
(unidade_id, aluno_id)
(unidade_id, professor_id)
(unidade_id, status_matricula)
(unidade_id, proxima_aula_numero)
(unidade_id, data_ultima_aula)
```

## Upsert central

Criar um helper unico, usado por webhook e sync:

`upsertJornadaMatriculaDisciplina(payload, fonte)`

Responsabilidades:

1. Receber uma matricula Emusys com uma ou mais disciplinas.
2. Resolver aluno local por `unidade_id + emusys_aluno_id` e fallback seguro ja usado no sync.
3. Resolver curso local por `unidade_id + emusys_disciplina_id`, quando houver de-para.
4. Resolver professor local por `unidade_id + emusys_professor_id`, quando houver de-para.
5. Gerar uma linha por disciplina.
6. Calcular `proxima_aula_numero` e `percentual_jornada`.
7. Fazer upsert idempotente pela chave unica.
8. Preservar `payload_snapshot` para auditoria.

O helper deve aceitar dados vindos tanto do shape de `/matriculas` quanto do shape de webhook.

## Fontes que alimentam

### `matricula_nova`

Cria ou atualiza a jornada inicial por disciplina.

### `matricula_renovacao` / `matricula_renovada`

Atualiza ciclo, contadores, datas e `qtd_contratos` conforme o Emusys mandar.

Nao devemos inventar reset manual. Se o Emusys trouxer `nr_aulas_passadas = 0` no novo ciclo, o LA Report apenas espelha a fonte canonica.

### `matricula_alterada`

Novo webhook do Emusys para troca de curso, modulo, turma, disciplina, professor ou data.

Deve atualizar:

- curso/disciplina.
- professor.
- agenda.
- datas.
- contadores.
- snapshot.

Esse evento nao deve cair como ignorado depois da implementacao.

### `matricula_trancamento` / `matricula_finalizacao`

Atualiza `status_matricula` e preserva a ultima posicao conhecida.

### `sync-matriculas-emusys`

Fonte de reconciliacao e backfill.

Deve:

- varrer matriculas ativas.
- atualizar a tabela canonica.
- corrigir divergencias silenciosas que nao chegaram por webhook.
- permitir backfill inicial das tres unidades.

### `sync-presenca-emusys` / `aulas_emusys`

Fonte complementar para views enriquecidas.

Nao deve ser a fonte principal de `nr_aulas_passadas`.

## Views e RPCs

### `vw_jornada_aluno_atual`

Uma linha por aluno/matricula/disciplina ativa, com a posicao oficial.

Consumidores:

- ficha do aluno.
- Sucesso do Aluno.
- LA Teacher quando filtrado por aluno.

### `vw_jornada_professor_atual`

Carteira do professor com cada aluno/disciplina e posicao da jornada.

Consumidores:

- LA Teacher.
- pagina Professores.
- relatorios pedagogicos.

### `vw_jornada_marcos`

Base para marcos como:

- primeira aula.
- aula 15.
- aula 21.
- ultimas aulas do contrato.
- perto de renovacao.

Essa view deve aproveitar a jornada canonica e pode continuar cruzando com proximas aulas/presencas para data e contato.

### `vw_jornada_aluno_com_presenca`

Leitura enriquecida:

- jornada canonica.
- total de presencas.
- total de faltas.
- percentual de presenca.
- ultima aula.
- ultima presenca/falta.

Essa view e a fronteira correta para juntar jornada e comportamento sem misturar regras.

### RPCs

- `get_jornada_aluno(p_aluno_id)`
- `get_jornada_professor(p_professor_id)`

As RPCs devem ser finas e consumir as views canonicas. A regra principal deve ficar em tabela/helper/sync, nao duplicada em RPC.

## Relacao com telas existentes

### Sucesso do Aluno — Jornada

Continua podendo mostrar fase por tempo de casa, mas deve ganhar a leitura real de contrato/disciplina.

Nome sugerido para evitar confusao:

- "Fase da jornada" = onboarding, consolidacao, encantamento, renovacao.
- "Posicao no contrato" = Aula 36/40.

### Sucesso do Aluno — Marcos

Pode continuar funcionando com `marcos-jornada` no curto prazo.

Depois da tabela canonica, os marcos devem migrar para `vw_jornada_marcos`, usando Emusys ao vivo apenas quando for necessario buscar agenda futura ainda nao sincronizada.

### Alunos

Ficha do aluno deve listar uma jornada por matricula/disciplina.

Exemplo:

- Piano: Aula 12/40, professor X, quarta 14:00.
- Canto: Aula 3/40, professor Y, sexta 18:00.

### Professores e LA Teacher

A carteira do professor deve consumir `vw_jornada_professor_atual`.

Exemplo de card:

- Maria Silva — Piano — Aula 36/40 — 4 aulas restantes — presenca 82%.

## Regras de qualidade

- IDs Emusys sempre namespaced por unidade.
- Nao confiar em nome como chave principal quando houver ID.
- Webhook e sync precisam ser idempotentes.
- A tabela canonica deve aceitar disciplina sem match local de curso/professor, mantendo os campos Emusys como fallback.
- `payload_snapshot` deve permitir auditoria sem reconsultar Emusys.
- Nao apagar linhas antigas imediatamente em caso de ausencia no sync; primeiro marcar status conforme fonte ou registrar divergencia.

## Backfill inicial

Rodar `sync-matriculas-emusys` nas tres unidades para popular a tabela.

Critérios:

1. Quantidade de jornadas ativas deve bater com disciplinas ativas no Emusys por unidade.
2. Aluno com dois cursos deve gerar duas linhas.
3. Jornada deve preservar status de trancada/finalizada quando vier do payload.
4. Sem duplicar linhas em reexecucao.

## Testes e validacao

### Banco

- Validar constraint unica.
- Validar calculo de `proxima_aula_numero`.
- Validar `percentual_jornada` com divisor zero/nulo.
- Validar upsert idempotente.

### Edge Functions

- Payload de `matricula_nova` com uma disciplina.
- Payload de `matricula_nova` com duas disciplinas.
- Payload de `matricula_alterada` trocando curso/professor.
- Payload de `matricula_renovada` com contadores reiniciados.
- Payload de finalizacao/trancamento preservando ultima jornada.

### Smoke real

- Escolher um aluno real com um curso.
- Escolher um aluno real com dois cursos.
- Escolher um professor real e conferir carteira.
- Conferir um marco de aula contra a aba Marcos existente.

## Plano de implantacao recomendado

1. Criar migracao da tabela canonica e views iniciais.
2. Criar helper de upsert compartilhado.
3. Plugar `processar-matricula-emusys`.
4. Adicionar handler de `matricula_alterada`.
5. Plugar `sync-matriculas-emusys`.
6. Rodar backfill das tres unidades.
7. Expor leitura em Sucesso do Aluno/Alunos.
8. Expor leitura em Professores/LA Teacher.
9. Migrar Marcos para view canonica quando a primeira leitura estiver validada.

## Criterios de aceite

- Aluno com mais de uma disciplina aparece com jornadas separadas.
- `Aula X/Y` vem da camada canonica, nao de calculo avulso na tela.
- Presenca/falta aparece como enriquecimento, sem alterar a posicao oficial.
- `matricula_alterada` deixa de ser ignorado.
- Reexecutar sync nao duplica jornada.
- LA Teacher consegue consumir uma fonte unica para carteira do professor.
