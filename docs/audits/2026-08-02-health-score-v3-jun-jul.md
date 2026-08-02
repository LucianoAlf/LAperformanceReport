# Auditoria Health Score Professor V3 - junho e julho de 2026

Data da leitura: 02/08/2026. Banco: produção LA Report. Operação: somente leitura.

## Objetivo

Validar Matheus Lana da Silva e Valdo Delfino nos recortes locais e consolidado antes de publicar a nova leitura do Health Score V3. Junho é tratado como mês regular. Julho é tratado como mês parcial, com duas semanas de recesso e reposições na última semana.

## Evidência encontrada antes da correção

- Matheus Lana possuía pilares válidos de retenção e permanência, além de carteira real, mas aparecia sem base em alguns recortes por regras antigas de cobertura e pela exigência global do snapshot.
- Em julho, Matheus tinha 29 alunos na Barra e 33 no consolidado. O problema não era ausência de carteira; era a forma de decidir se a nota podia ser exibida.
- Valdo tinha 29 alunos em Campo Grande, 10 no Recreio e 39 no consolidado em julho. Portanto, `sem base` não podia ser interpretado como ausência de professor ou ausência de alunos.
- A presença consolidada de Valdo em julho estava em 63,46%, com 52 de 58 eventos classificados e 89,66% de cobertura. A regra antiga de corte em 90% escondia o pilar inteiro por uma diferença de 0,34 ponto percentual.
- A conversão tinha amostras pequenas em alguns recortes. Ela deve continuar visível como diagnóstico, mas só compõe a nota quando a amostra mínima de três experimentais é atingida.
- A carteira era pontuada na revisão anterior. A decisão aprovada é mantê-la como diagnóstico e sinal de carga, com peso efetivo zero.

## Decisões aplicadas

- O score parcial aparece sempre que ao menos um pilar de nota possui evidência válida.
- Os pesos dos pilares válidos são redistribuídos para somar 100% no recorte.
- Carteira não altera a nota; continua visível para diagnóstico, capacidade e mapa de sinais.
- Presença abaixo da antiga cobertura de 90% deixa de apagar os demais pilares do professor.
- Conversão sem amostra mínima não penaliza e recebe motivo explícito.
- Julho não gera ranking ou premiação oficial. Junho permanece comparativo regular.
- Snapshots fechados não são sobrescritos; qualquer recomposição é append-only.

## Critérios de bloqueio do rollout

O script `scripts/auditar-health-score-v3-jun-jul.mjs` bloqueia a publicação se:

1. carteira tiver contribuição ou peso efetivo diferente de zero;
2. os pesos efetivos de um score exibível não somarem 100%;
3. conversão pontuar com menos de três experimentais;
4. um pilar válido não tiver código explícito de evidência;
5. Matheus Lana ou Valdo Delfino desaparecerem dos recortes auditados.

## Resultado pós-rollout

As migrations aditivas foram aplicadas no projeto `ouqwbbermlzqqvtqwlul`. Junho e julho foram materializados nas três unidades e no consolidado por novas revisões append-only. O fluxo não atualizou nem apagou snapshots existentes.

O script retornou `AUDITORIA_APROVADA=true`, sem falhas. Nos casos nominais:

- Matheus Lana: julho com score parcial de 84,14 na Barra, 93,38 no Recreio e 88,13 no consolidado;
- Valdo Delfino: julho com score parcial de 84,48 em Campo Grande, 65,46 no Recreio e 81,70 no consolidado;
- todos os recortes exibíveis tiveram pesos efetivos normalizados em 100%, tolerada apenas a precisão decimal de 99,9999%;
- carteira permaneceu com papel `diagnostico`, peso efetivo zero e contribuição nula;
- conversão sem amostra suficiente não contribuiu para a nota e recebeu motivo explícito;
- o produtor mensal do Recreio devolveu os 24 professores ativos, todos com score parcial, 18 sinais pedagógicos e nenhum campo financeiro.

Julho permanece imutável para leitura do relatório. Como o ciclo é parcial, ranking e premiação continuam desabilitados.
