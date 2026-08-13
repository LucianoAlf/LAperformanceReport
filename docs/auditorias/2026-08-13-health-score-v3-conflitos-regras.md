# Health Score Professor V3 — baseline e correções da auditoria

**Data de referência:** 2026-08-13
**Sprint:** Sprint 0 — Task 0.1
**Natureza:** investigação somente leitura
**Estado:** baseline congelada; nenhuma correção de código foi implementada

## 1. Escopo e limite da evidência

Esta auditoria registra uma investigação exclusivamente de leitura. Não houve
escrita no banco de dados, rematerialização, backfill, alteração de configuração,
fechamento de snapshot, migration, deploy ou qualquer outra escrita em produção.

Este documento corrige o registro da auditoria e congela a baseline verificada em
2026-08-13. A criação deste arquivo também foi estritamente documental: não fez
nova consulta ao banco remoto e não valida nenhuma correção de código.

## 2. Baseline verificada em 2026-08-13

### 2.1 Leitor atual versus roster atual

As frações abaixo significam `professores devolvidos pelo leitor / professores no
roster atual` para o mesmo recorte.

| Periodicidade | Recorte | Leitor / roster | Observação |
|---|---|---:|---|
| Ciclo | Consolidado | 44/44 | Completo no recorte observado |
| Ciclo | Barra | 19/20 | Falta 1 professor |
| Mensal | Consolidado | 43/44 | Falta 1 professor |
| Mensal | Barra | 19/20 | Falta 1 professor |
| Mensal | Campo Grande | 32/32 | Completo, mas estagnado desde 2026-08-06 |

A contagem completa de todos os demais recortes não foi fornecida nesta
investigação. Portanto, estes números não autorizam extrapolar completude para
outras unidades ou competências.

### 2.2 Matriz materializada observada

| Professor | Unidade | Métricas emitidas | Lacuna observada |
|---|---|---|---|
| Jonathan (`professor_id=60`) | Barra | 4 métricas | Ausentes `retencao` e `permanencia` |
| Matheus Reis (`professor_id=46`) | Campo Grande | `conversao`, `presenca` | Somente 2 métricas emitidas |
| Jeyson Gaia Ramos (`professor_id=49`) | Campo Grande | `conversao`, `media_turma`, `numero_alunos`, `presenca` | Somente 4 métricas emitidas |

A causa individual das lacunas dessa matriz não foi demonstrada para cada
professor. Ausência materializada não deve ser convertida automaticamente em zero,
nem tratada como prova de ausência do dado bruto.

### 2.3 Cron de materialização

O job `109` apresentou o seguinte histórico:

| Execução | Resultado | Duração observada |
|---|---|---:|
| 2026-08-09 | Sucesso | 91,908 s |
| 2026-08-10 | Sucesso | 115,862 s |
| 2026-08-11 | Falha | aproximadamente 120 s |
| 2026-08-12 | Falha | aproximadamente 120 s |
| 2026-08-13 | Falha | aproximadamente 120 s |

O `statement_timeout=120000ms` é um padrão da plataforma definido em
`/etc/postgresql-custom/platform-defaults.conf`; não é uma configuração no nível
do role observado.

Não foi demonstrado que as variações de latência ou as falhas foram causadas por
lock, mudança de plano ou autovacuum. O fato estrutural comprovado é outro: a
função de fingerprint chama o produtor completo e a materialização chama o mesmo
produtor completo novamente, duplicando trabalho na mesma operação.

### 2.4 Snapshots oficiais

Não existem atualmente snapshots Health Score Professor V3 fechados ou oficiais.
Consequentemente, nenhum score observado nesta baseline deve ser chamado de
oficial, usado para ranking ou tratado como fechamento imutável já realizado.

## 3. Correções dos falsos positivos e das imprecisões anteriores

### 3.1 Métricas, pilares e denominador

O contrato materializa **seis métricas**, mas apenas **cinco pilares têm peso no
score**. `numero_alunos` é uma métrica diagnóstica, não um pilar pontuável. A soma
atual dos pesos dos cinco pilares pontuáveis é **90**, não 100.

Assim, cobertura, denominador e expectativa de catálogo não podem contar as seis
métricas como seis pilares pontuáveis, nem presumir que o total de pesos atual seja
100.

### 3.2 Caso Jonathan: encolhimento real, bloqueio final também real

O resultado final observado para Jonathan foi:

| Campo | Valor observado |
|---|---|
| Métricas emitidas | 4 |
| Pilares válidos | 1 |
| Pilares esperados inferidos incorretamente | 3 |
| Score observado | 66,67 |
| Cobertura normalizada | 33,3% |
| Score comparável | `null` |
| Classificação | `null` |
| Estado | `em_maturacao` / `pilares_insuficientes` |

O encolhimento do denominador é real: o produtor chega a um score numérico usando
um conjunto de peso válido menor do que o catálogo pontuável completo. Porém, a
conclusão anterior de que Jonathan seria publicado com classificação foi um falso
positivo. O leitor final já aplica a barreira de suficiência, devolve score
comparável e classificação nulos e mantém o caso em maturação por pilares
insuficientes.

Isso não torna o denominador correto; apenas demonstra que, no caminho final
observado, o guard de publicação impede a classificação. Não houve E2E de todos os
consumidores para afirmar que nenhuma interface paralela contorna esse guard.

### 3.3 `papel=NULL`: histórico real, revisão elegível atual íntegra

Os nulos históricos de `papel` são reais nas linhas brutas:

| Periodicidade | Linhas com `papel=NULL` / linhas históricas |
|---|---:|
| Ciclo | 2592/3888 |
| Mensal | 960/2358 |

Entretanto, as revisões elegíveis mais recentes de agosto têm **zero** papel nulo.
Logo, o fast path V1 está ativo para as leituras elegíveis atuais. Os números
históricos não sustentam recomendação de backfill indiscriminado: qualquer
reparo futuro deve delimitar revisões realmente consumidas, demonstrar impacto e
preservar a proveniência antes de escrever.

### 3.4 Vigência das configurações e fingerprint

A configuração ativa `v4` termina em 2026-08-31 e a configuração ativa `v3`
começa em 2026-09-01. As vigências são adjacentes, não sobrepostas.

Também não foi demonstrado que snapshots antigos tenham sido invalidados por
fingerprint. Essa hipótese não pode ser registrada como fato sem evidência de uma
revisão afetada e da transição concreta de seu estado.

### 3.5 Dezembro a fevereiro

A referência a dezembro–fevereiro é uma incompatibilidade em documentação
legada. Não foi demonstrado nexo causal entre essa divergência documental e o
incidente V3 atual.

### 3.6 Semântica de `competencia` no ciclo

No ciclo, `competencia` é a competência de referência passada ao materializador.
O defeito não deve ser resumido como “mês da materialização”. O acoplamento
problemático está em usar a competência da consulta bruta para decidir a seleção
de aberto/fechado, misturando a referência do materializador com o critério de
elegibilidade temporal dos dados.

### 3.7 Latência: hipótese não comprovada e duplicidade comprovada

É incorreto afirmar que a latência foi transitória por lock, plano ou autovacuum:
nenhuma dessas causas foi demonstrada. O que está provado é a duplicação
estrutural do produtor completo:

1. a função de fingerprint executa o produtor completo;
2. a função de materialização executa o produtor completo outra vez.

Ainda não está quantificada, de forma isolada, qual parcela dos aproximadamente
120 segundos decorre dessa duplicidade. Portanto, eliminar o trabalho duplicado é
prioridade, mas não autoriza declarar que ele é a única causa do timeout.

## 4. Nova lacuna de integridade no fechamento

A função `fechar_health_score_professor_v3_ciclo` copia as métricas do snapshot
sem copiar:

- `papel`;
- `codigo_evidencia`;
- `peso_efetivo`.

As três colunas são nullable e não possuem default. Portanto, um novo snapshot
fechado por esse caminho receberia `NULL` nesses campos, mesmo que o snapshot de
origem os tivesse preenchidos.

Esse comportamento forçaria o fallback legado na leitura do snapshot recém-
fechado e perderia dados governados essenciais: o papel semântico da métrica, o
código que liga o valor à sua evidência e o peso efetivamente aplicado naquela
revisão. O fechamento deixaria de ser uma cópia fiel e auditável da revisão
governada.

Como não existem snapshots V3 fechados ou oficiais, esta é uma lacuna preventiva
comprovada no contrato da função, não evidência de que um fechamento V3 já tenha
corrompido dados existentes.

## 5. Prioridades corrigidas

A ordem de tratamento deve ser:

1. **Completude da matriz:** explicar e impedir professores/revisões com catálogo
   materializado incompleto.
2. **Correção do denominador e do catálogo:** separar seis métricas materializadas,
   cinco pilares pontuáveis, peso total 90 e `numero_alunos` diagnóstico.
3. **Materialização resiliente:** evitar que um limite de execução deixe unidades,
   periodicidades ou revisões estagnadas sem estado operacional explícito.
4. **Eliminar trabalho duplicado do produtor:** impedir a execução integral no
   fingerprint e novamente na materialização.
5. **Integridade do fechamento e ciclo de vida mensal:** preservar `papel`,
   `codigo_evidencia` e `peso_efetivo`, além de definir abertura, revisão,
   fechamento e imutabilidade por periodicidade.
6. **Estados não bloqueantes e staleness na UI:** mostrar maturação, insuficiência,
   erro e defasagem sem publicar classificação indevida nem bloquear toda a tela.
7. **Rematerialização controlada e E2E:** recalcular somente o universo aprovado,
   comparar revisões e validar leitor, UI e consumidores sem apagar histórico.

## 6. Critérios GO/STOP do Sprint 0

### GO — concluir a baseline documental

O Sprint 0 Task 0.1 pode ser considerado concluído quando:

- esta baseline e suas correções forem preservadas em um commit exclusivamente
  documental;
- ficar explícito que não houve escrita em banco ou produção e que nenhum código
  foi corrigido;
- as contagens, casos nominais, execuções do cron, origem do timeout e ausência de
  snapshots oficiais estiverem registrados sem extrapolação;
- os falsos positivos anteriores estiverem corrigidos, incluindo o guard final de
  Jonathan, a vigência adjacente, o estado atual de `papel` e os limites da
  evidência de latência;
- a lacuna de fechamento e a ordem de prioridades estiverem incorporadas ao gate
  das próximas tarefas.

### STOP — não avançar para escrita, ativação ou declaração de correção

Deve permanecer **STOP** para migration, rematerialização, backfill, fechamento,
ativação, deploy ou alegação de incidente resolvido enquanto não houver, em gates
separados:

- contrato aprovado para a matriz completa e para o catálogo/denominador;
- desenho resiliente da materialização e eliminação verificável da dupla execução
  do produtor;
- fechamento que copie integralmente `papel`, `codigo_evidencia` e
  `peso_efetivo`, com teste do ciclo de vida mensal;
- plano de rematerialização delimitado por revisão, competência, periodicidade e
  unidade, com preservação do histórico;
- E2E do leitor até a UI comprovando estados, staleness, score comparável nulo e
  classificação nula quando os pilares forem insuficientes.

Também é STOP se a justificativa depender de qualquer hipótese ainda não
demonstrada: lock/plano/autovacuum como causa, invalidação por fingerprint,
dezembro–fevereiro como causa atual, sobreposição entre `v4` e `v3`, morte do fast
path V1 ou necessidade de backfill histórico indiscriminado.

## 7. Incertezas preservadas

Esta auditoria não demonstra:

- a causa individual de cada métrica ausente na matriz;
- a contribuição isolada da duplicidade do produtor para o tempo total;
- uma causa de lock, plano ou autovacuum;
- invalidação real de snapshot antigo por fingerprint;
- impacto causal da divergência documental de dezembro–fevereiro no incidente;
- paridade de todos os consumidores ou comportamento E2E da UI;
- integridade de um fechamento V3 já executado, pois não existe snapshot V3
  fechado/oficial atualmente.

Qualquer uma dessas conclusões exige evidência adicional em uma etapa posterior e
não pode ser preenchida por inferência neste documento.

## 8. Veredito

A baseline de 2026-08-13 fica congelada com três problemas estruturais que exigem
tratamento posterior: matriz incompleta, composição/materialização frágil e
fechamento que não preserva campos governados. Ao mesmo tempo, ficam retiradas as
conclusões não sustentadas sobre classificação final de Jonathan, papel nulo nas
revisões atuais, sobreposição de configurações, invalidação por fingerprint,
dezembro–fevereiro e causalidade transitória da latência.

Este registro não afirma que o Health Score V3 foi corrigido. Ele apenas corrige a
auditoria e estabelece o gate de evidência para as próximas tarefas do sprint.
