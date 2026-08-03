# Health Score Professor V3 — comparabilidade, maturação e continuidade mensal

**Data:** 03/08/2026

**Status:** desenho aprovado em conversa; aguardando revisão do documento antes do plano de implementação

**Escopo:** score operacional do professor, ordenação da tabela, estados de evidência, continuidade entre competências e consumidores do relatório da Coordenação

## 1. Problema comprovado

O motor atual calcula uma nota normalizada entre os pilares disponíveis. Essa normalização é útil para diagnóstico, mas produz falsa comparabilidade quando há pouca evidência:

- Adriana Mesquita recebeu 100 pontos em julho com 15% de cobertura e somente `media_turma` pontuando;
- Fabrício Costa recebeu 100 pontos em agosto com 25% de cobertura e somente `retencao` pontuando no recorte consolidado;
- a tabela operacional ordena pelo score exibível, sem considerar cobertura, quantidade de pilares válidos ou elegibilidade comparativa.

Portanto, o valor calculado responde “como foi o desempenho na parte observada”, mas a interface o apresenta como se respondesse “qual é o Health Score comparável do professor”.

## 2. Princípios

1. Falta de evidência nunca vira nota zero.
2. Evidência parcial não pode produzir vantagem competitiva.
3. Todos os professores ativos permanecem visíveis.
4. Score observado e Health Score comparável são conceitos distintos.
5. O último score comparável pode contextualizar o mês atual, mas nunca pode se passar por dado da competência corrente.
6. Pesos, metas, amostras e cobertura continuam governados pela configuração versionada.
7. Snapshots fechados permanecem imutáveis.

## 3. Abordagens avaliadas

### 3.1 Tratar pilares ausentes como zero

Rejeitada. Penaliza professor novo, recesso, ausência de experimental e falhas de cobertura sem relação direta com desempenho.

### 3.2 Aplicar redutor estatístico por confiança

Não escolhida nesta entrega. Evita notas extremas com pouca base, mas introduz uma fórmula difícil de explicar e governar operacionalmente.

### 3.3 Separar desempenho observado de score comparável

**Escolhida.** Preserva os dados observados, impede ranking injusto e mantém uma explicação simples para a Coordenação.

## 4. Contrato de comparabilidade

Um resultado só pode ser chamado de **Health Score comparável** quando cumprir simultaneamente:

1. pelo menos 3 pilares pontuáveis válidos;
2. cobertura ponderada mínima configurada, inicialmente 60%;
3. pelo menos um pilar de fidelização válido: `retencao` ou `permanencia`;
4. amostra mínima individual de cada pilar atendida;
5. fonte canônica disponível e sem bloqueio de auditoria.

O motor continua calculando o desempenho observado entre os pilares disponíveis, mas abaixo desses critérios o valor não define classificação nem posição competitiva.

## 5. Estados do professor

### 5.1 Comparável

- Exibe `Health Score` numérico.
- Recebe classificação `Saudável`, `Atenção` ou `Crítico`.
- Participa da ordenação operacional por score.
- Ranking e premiação oficial continuam condicionados ao fechamento do ciclo.

### 5.2 Em maturação

- Exibe os indicadores disponíveis.
- Pode exibir `Desempenho observado`, sempre acompanhado de cobertura e quantidade de pilares válidos.
- Não recebe classificação saudável/atenção/crítico.
- Não disputa posição com professores comparáveis.
- A ordenação interna usa: maior cobertura, maior quantidade de pilares válidos e nome.

Exemplo: `Em maturação · desempenho observado 100 · 1/5 pilares · cobertura 15%`.

### 5.3 Sem base operacional

- Nenhum pilar pontuável válido.
- Não exibe nota.
- Exibe o motivo concreto da ausência de base.
- Permanece visível depois dos grupos comparável e em maturação.

## 6. Estados de evidência por métrica

O texto genérico `Evidência pendente` deixa de ser usado quando a causa já é conhecida.

### Conversão experimental

- zero experimentais: `Não realizou experimental no período`;
- uma ou duas, considerando amostra mínima 3: `Amostra em formação: N de 3`;
- amostra mínima atingida, mas vínculo/conciliação incompleto: `Conversão em auditoria`;
- amostra e fonte válidas: percentual publicado e pilar elegível.

Ausência de experimental não penaliza e não ocupa peso efetivo.

### Presença

- nenhuma aula elegível: `Sem aulas elegíveis no período`;
- eventos existentes com cobertura abaixo da política: `Cobertura de presença insuficiente`;
- problema de chamada, vínculo ou fonte: `Presença em auditoria`;
- amostra e cobertura válidas: percentual publicado e pilar elegível.

### Demais pilares

- amostra abaixo do mínimo: `Amostra em formação: N de M`;
- fonte indisponível: `Dados em auditoria`;
- regra não aplicável: `Não aplicável neste período`;
- regra e amostra válidas: valor publicado.

## 7. Continuidade entre competências

No mês em andamento, a tela mostra dois recortes separados quando a competência atual ainda não é comparável:

- **Referência:** último Health Score comparável, com competência explícita, por exemplo `Referência Jul/26: 88`;
- **Competência atual:** cobertura, pilares válidos e desempenho observado, por exemplo `Ago/26 em maturação: 2/5 pilares · 40%`.

O score anterior não é copiado para agosto, não altera as métricas atuais e não recebe rótulo de score de agosto. Quando agosto cumpre os critérios, o score corrente substitui a referência como valor principal.

Se o professor nunca teve score comparável, aparece somente como `Em maturação`, sem referência artificial.

## 8. Ordenação da tabela

A ordem padrão terá três blocos:

1. comparáveis: score decrescente, cobertura decrescente e nome;
2. em maturação: cobertura decrescente, quantidade de pilares válidos decrescente e nome;
3. sem base operacional: nome.

Filtros podem isolar os três estados. A ordenação nunca usa o desempenho observado para colocar um professor em maturação acima de um professor comparável.

## 9. Dados e arquitetura

O read model canônico deve expor explicitamente:

- `score_observado`;
- `score_comparavel` ou `score_exibivel` sob a nova semântica;
- `cobertura`;
- `pilares_validos` e `pilares_esperados`;
- `comparabilidade_estado`;
- `comparabilidade_motivo`;
- `competencia_referencia` e `score_referencia`;
- estado estruturado de cada métrica.

O frontend apenas renderiza e ordena o contrato; não recalcula elegibilidade. Relatório mensal, relatório individual e payload da IA consomem os mesmos campos.

Alterações de pesos, metas ou amostras continuam passando pelo fluxo versionado e recalculam cobertura e comparabilidade no servidor. A configuração ativa e os snapshots fechados não são reescritos.

## 10. Relatório da Coordenação

- Professores comparáveis podem aparecer ordenados por Health Score.
- Professores em maturação aparecem em seção própria, com evidências disponíveis e lacunas reais.
- O relatório não chama desempenho observado de Health Score.
- `Não realizou experimental` e `Sem aulas elegíveis` são contexto, não pendência.
- Ranking e premiação continuam reservados ao ciclo oficial fechado.

## 11. Falhas e segurança semântica

- Fonte indisponível bloqueia o pilar, não gera zero.
- Referência anterior nunca substitui silenciosamente o mês atual.
- Mudança de configuração invalida caches do recorte aberto e força nova leitura canônica.
- Consumidores antigos não podem inferir comparabilidade apenas pela presença de um score numérico.
- A migração preserva leitura de snapshots históricos e acrescenta semântica sem alterar dados fechados.

## 12. Testes obrigatórios

### Banco

- um pilar válido e 15% de cobertura: observado disponível, não comparável;
- dois pilares e 40%: observado disponível, não comparável;
- três pilares e 50%: não comparável por cobertura;
- três pilares e 65%, com fidelização: comparável;
- três pilares e 65%, sem fidelização: não comparável;
- ausência de experimental: não aplicável ao peso, motivo correto;
- presença sem aulas elegíveis: não aplicável ao peso, motivo correto;
- referência anterior retornada apenas quando comparável;
- snapshot fechado permanece byte a byte inalterado.

### Frontend

- comparáveis aparecem antes dos professores em maturação;
- Adriana não aparece como Health Score 100 comparável;
- Fabrício não lidera agosto com um único pilar;
- rótulos distinguem referência, observado e corrente;
- alterar pesos/metas no fluxo governado reflete nova cobertura após releitura do servidor;
- nenhum fallback V2 é usado.

### Relatórios

- os mesmos estados e valores do read model aparecem nos cinco relatórios da Coordenação;
- professor sem experimental não aparece como pendência;
- professor em maturação não recebe classificação competitiva;
- nenhuma IA recalcula score, cobertura ou elegibilidade.

## 13. Critérios de aceite

- nenhum professor com menos de 3 pilares válidos ou menos de 60% de cobertura é apresentado como score comparável;
- todos os professores ativos continuam visíveis;
- nenhuma ausência de evidência vira zero;
- Adriana e Fabrício deixam de ocupar o topo por normalização de base pequena;
- a tabela, o modal e os relatórios usam o mesmo contrato canônico;
- o mês atual mantém continuidade por referência explícita, sem falsificar competência;
- pesos e metas permanecem configuráveis e auditáveis;
- snapshots fechados e configurações ativas permanecem protegidos.
