# Auditoria complementar - disponibilidade e meta de carteira

**Data:** 2026-07-28  
**Competencia:** julho/2026  
**Modo:** SELECT-only depois da rematerializacao inicial  
**Status:** DECISAO FECHADA; LIBERADO PARA CONFERENCIA DA COORDENACAO

Nenhum snapshot foi rematerializado nesta auditoria. Nenhuma tela, card,
ranking, relatorio ou RPC consumidora foi alterada.

## Veredito

A inversao original entre professores foi corrigida, mas a regra ainda nao
deve virar fonte de tela. Ha tres riscos comprovados:

1. ausencia de disponibilidade pode aumentar o score pela redistribuicao de
   peso;
2. existem horarios sobrepostos entre unidades e uma duplicidade interna;
3. a meta proporcional a toda a disponibilidade declarada cria incentivo para
   reduzir horas cadastradas.

## 1. Disponibilidade ausente como bloqueio

Ha **8 vinculos ativos** sem disponibilidade cadastrada:

| Unidade | Professor |
|---|---|
| Barra | Jeyson Gaia Ramos |
| Campo Grande | Adriana Mesquita dos Santos Vilas Boas |
| Campo Grande | Alexandre de Sa Ritta do Espirito Santo |
| Campo Grande | Ana Beatriz Paz de Almeida |
| Campo Grande | Fabricio Costa de Oliveira |
| Campo Grande | Jeyson Gaia Ramos |
| Recreio | Ana Beatriz Paz de Almeida |
| Recreio | Matheus Reis |

O motor devolve uma nona linha `sem_base_disponibilidade`: Leonardo Castro em
Campo Grande. Esse nao e um horario faltante a preencher. O vinculo de Leonardo
na unidade esta corretamente `emusys_ativo=false` e
`validacao_status=ignorado`, mas a carteira periodica ainda devolve uma pessoa
historica para ele na unidade. Isso e uma divergencia de escopo da carteira,
separada dos oito cadastros ausentes.

### Impacto se disponibilidade ausente bloquear publicacao

| Unidade | Linhas do motor bloqueadas | Vinculos ativos a preencher |
|---|---:|---:|
| Barra | 1 | 1 |
| Campo Grande | 6 | 5 |
| Recreio | 2 | 2 |
| **Total** | **9** | **8** |

Dos nove casos, somente Alexandre de Sa em Campo Grande possui score parcial
atualmente: **95,27**, com cobertura **65%**. Os outros oito ja estao sem score.
Portanto, transformar `sem_base_disponibilidade` em bloqueio de publicacao
retira o premio indevido de Alexandre sem fabricar nota zero.

**Recomendacao tecnica:** disponibilidade ausente deve bloquear a publicacao
do Health Score daquele professor-unidade, mantendo os valores observados
visiveis. A regra deve ser versionada e nao aplicada ate a aprovacao.

## 2. Sobreposicoes entre unidades

Foram detectados **3 professores** e **5 sobreposicoes**:

| Professor | Dia | Unidade A | Unidade B | Sobreposicao |
|---|---|---|---|---|
| Erick Cosme da Silva | Quarta | Barra 09:00-20:00 | Recreio 08:00-21:00 | 09:00-20:00 |
| Erick Cosme da Silva | Sexta | Barra 09:00-20:00 | Recreio 08:00-21:00 | 09:00-20:00 |
| Erick Cosme da Silva | Sabado | Barra 08:00-11:00 | Recreio 08:00-16:00 | 08:00-11:00 |
| Ramon Pina Morais | Sabado | Campo Grande 08:00-15:00 | Recreio 08:00-16:00 | 08:00-15:00 |
| Renan Amorim Guimaraes | Quarta | Campo Grande 14:00-19:00 | Recreio 13:00-21:00 | 14:00-19:00 |

Horas somadas sem descontar sobreposicao:

| Professor | Por unidade | Total declarado |
|---|---|---:|
| Erick Cosme da Silva | Barra 39h; Recreio 34h | 73h |
| Ramon Pina Morais | Campo Grande 14h; Recreio 30h | 44h |
| Renan Amorim Guimaraes | Campo Grande 27h; Recreio 8h | 35h |

### Duplicidade dentro da mesma unidade

| Professor | Unidade | Chaves | Faixa |
|---|---|---|---|
| Matheus Sterque Mendes | Campo Grande | `Sexta` e `Sexta-feira` | 15:00-16:00 nas duas |

Essa duplicidade soma uma hora a mais no calculo atual.

## 3. Nota de carteira por faixa de horas

A nota abaixo inclui apenas linhas com estado `ok`. Maturacao, disponibilidade
ausente e carteira zero permanecem fora.

### Barra

| Horas semanais | Professores | Nota media | Mediana | Min-Max |
|---|---:|---:|---:|---:|
| Ate 8h | 6 | 81,07 | 81,24 | 58,33-100 |
| Mais de 8h ate 16h | 2 | 93,75 | 93,75 | 87,49-100 |
| Mais de 16h ate 24h | 2 | 82,81 | 82,81 | 65,62-100 |
| Mais de 24h ate 32h | 2 | 73,73 | 73,73 | 65,62-81,84 |
| Mais de 32h | 2 | 72,18 | 72,18 | 60,76-83,60 |

### Campo Grande

| Horas semanais | Professores | Nota media | Mediana | Min-Max |
|---|---:|---:|---:|---:|
| Ate 8h | 9 | 79,52 | 93,34 | 20,74-100 |
| Mais de 8h ate 16h | 5 | 71,67 | 80,90 | 50,56-86,16 |
| Mais de 16h ate 24h | 6 | 75,99 | 69,58 | 51,86-100 |
| Mais de 24h ate 32h | 3 | 51,02 | 49,35 | 36,88-66,84 |
| Mais de 32h | 1 | 81,08 | 81,08 | 81,08 |

### Recreio

| Horas semanais | Professores | Nota media | Mediana | Min-Max |
|---|---:|---:|---:|---:|
| Ate 8h | 5 | 81,32 | 75,12 | 58,43-100 |
| Mais de 8h ate 16h | 5 | 75,84 | 78,88 | 43,82-100 |
| Mais de 16h ate 24h | 4 | 79,55 | 79,12 | 59,97-100 |
| Mais de 24h ate 32h | 3 | 87,77 | 97,38 | 66,61-99,33 |
| Mais de 32h | 3 | 91,22 | 92,51 | 81,15-100 |

### Correlacoes

| Unidade | Horas x nota | Horas x alunos |
|---|---:|---:|
| Barra | -0,191 | 0,937 |
| Campo Grande | -0,223 | 0,785 |
| Recreio | 0,256 | 0,951 |

Barra e Campo Grande confirmam o incentivo apontado: aumentar horas esta
associado a mais alunos, mas tambem a nota menor. Recreio nao apresenta o mesmo
sentido, o que mostra que o efeito depende da ocupacao real de cada unidade.

## Decisao registrada

O campo atual representa disponibilidade declarada no cadastro, nao uma carga
que a escola formalmente se comprometeu a preencher.

Fica aprovada a **disponibilidade total** como base da politica V1:

- o campo e mantido pela recepcao e pela coordenacao;
- o professor avaliado nao controla a propria disponibilidade;
- a meta crescer com a agenda representa a oportunidade comercial aberta pela
  escola;
- as correlacoes observadas em uma unica competencia, com 20 a 30 professores
  por unidade e sinais opostos entre unidades, nao justificam um novo campo e
  um novo processo.

`carga_comprometida` permanece somente no roadmap. Reavaliar depois de dois ou
tres ciclos completos caso a correlacao negativa se mantenha com amostra maior.

## Execucao do guardrail

Aplicado em 28/07/2026 pela migration
`20260728127000_health_score_v3_disponibilidade_bloqueia_publicacao.sql`:

- `sem_base_disponibilidade` bloqueia a publicacao do Health Score completo;
- score, classificacao e ranking ficam `sem_base` enquanto faltar a
  disponibilidade;
- a politica V1 registra explicitamente
  `base_horas = disponibilidade_total`;
- a funcao de trigger nao possui `EXECUTE` para `public`, `anon` ou
  `authenticated`;
- nenhum snapshot oficial foi rematerializado ou reescrito na aplicacao.

Conferencia remota:

- snapshots antes e depois: `2.236`;
- ultimo snapshot antes e depois:
  `2026-07-28 10:46:08.190676+00`;
- snapshots Jul/2026 da configuracao 4 antes e depois: `422`.

Portanto, o guardrail passa a valer na proxima materializacao autorizada. O
snapshot atualmente exibido, inclusive o de Alexandre de Sa, permanece
inalterado ate a devolucao da folha assinada e a autorizacao expressa para
rematerializar.

## Proximos passos, sem execucao automatica

1. coordenacao preenche os oito vinculos ativos;
2. coordenacao resolve as cinco sobreposicoes e a duplicidade de Matheus
   Sterque;
3. devolver a folha assinada;
4. simular novamente antes de rematerializar e antes de qualquer cutover.
