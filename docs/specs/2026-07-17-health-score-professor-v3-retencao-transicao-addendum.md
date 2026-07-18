# Addendum - Retencao do Health Score do Professor V3

**Data da decisao:** 17/07/2026

**Autoridade:** Alf

**Documento alterado:** `2026-07-16-contrato-health-score-professor-v5-final.md`, secao 6.4
**Status:** regra aprovada para a camada V3 em sombra

## Motivo

Os motivos historicos de troca e encerramento do vinculo professor-matricula-disciplina nao possuem cobertura integral. Exigir motivo confirmado para todo o passado fazia os encerramentos sem motivo desaparecerem do numerador negativo e produzia retencoes artificiais de 100%.

## Regra por data do encerramento

### Ate 02/08/2026, inclusive

Todo vinculo professor-matricula-disciplina encerrado na janela conta como perda na retencao do professor, independentemente do motivo registrado.

### A partir de 03/08/2026

Somente encerramentos com atribuicao confirmada e motivo configurado para contar no score do professor penalizam a retencao. Os motivos inicialmente atribuiveis sao:

- Desanimo;
- Desistencia;
- Insatisfacao.

Motivo neutro confirmado nao penaliza. Motivo ausente ou nao conciliado fica pendente e impede a publicacao silenciosa daquela leitura.

## Separacao obrigatoria

Esta regra altera apenas **retencao**. O **tempo de permanencia com o professor** continua cumulativo e usa todos os vinculos encerrados elegiveis, independentemente do motivo, respeitando a duracao minima de quatro meses e a confianca historica.

## Implementacao

- RPC: `get_professor_retencao_v3_sombra`;
- versao: `health-score-professor-v3-retencao-2`;
- corte aplicado por evento, inclusive no trimestre julho-setembro de 2026;
- modo anterior ao corte: `todos_encerramentos`;
- modo posterior ao corte: `somente_motivo_atribuivel_confirmado`;
- a V2 e os relatorios gerencial, administrativo e comercial nao sao alterados.
