# Addendum - Conversao por ciclo no Health Score Professor V3

**Data:** 2026-07-28  
**Ciclo:** Jun-Ago/2026  
**Status:** implementado; visivel para diagnostico e fora do score

## Decisao

A conversao experimental para matricula volta a usar o ciclo de tres meses,
inclusive quando o consumidor solicita uma competencia mensal.

No ciclo Jun-Ago/2026:

- a metrica e calculada de 01/06/2026 a 31/08/2026;
- o recorte corrente termina na data da materializacao;
- a base minima continua em 3 experimentais confirmadas no ciclo;
- o valor aparece como `provisorio_ciclo`;
- `publicavel = false`, `peso_disponivel = false` e `contribuicao = null`;
- a metrica nao altera score, cobertura, ranking ou classificacao.

## Identidade e credito

O denominador identifica a experimental pela identidade operacional do evento
ou do lead. A ausencia de aluno canonico nao apaga uma experimental realizada.

O numerador continua rigoroso:

- exige pessoa canonica resolvida;
- exige matricula canonica em ate 30 dias depois da experimental;
- credita no maximo uma matricula por experimental;
- atribui o credito ao professor que ministrou a experimental.

Uma conversao declarada no lead sem pessoa e matricula canonicas permanece
visivel para revisao, mas nao entra no numerador.

## Conciliacao automatica

A conciliacao automatica e aditiva e nao altera o payload bruto. Ela exige:

1. telefone normalizado com um unico lead na mesma unidade;
2. nome do lead igual ao nome do aluno ou do responsavel;
3. registro da regra, metodo e evidencia usada.

Ambiguidade de nome ou telefone vai para revisao humana. Nome exato e unico
fica reservado como fallback controlado; nao e usado para fabricar pessoa.

## Calibracao futura

O ciclo atual nao ativa a conversao no score porque apenas 22 de 83 vinculos
professor-unidade da materializacao de 28/07 atingem a amostra minima. O
levantamento anterior possuia 82 vinculos; um novo vinculo entrou antes da
materializacao final. Ativar o pilar agora penalizaria
somente quem recebeu experimentais, enquanto os demais teriam o peso
redistribuido.

Antes do proximo ciclo, a coordenacao deve calibrar em conjunto:

- distribuicao real das seis metricas;
- metas;
- pesos;
- bases minimas;
- efeito da indisponibilidade de um pilar.

As configuracoes e snapshots anteriores permanecem imutaveis.

## Seguranca de migrations

Antes de revogar `EXECUTE` de `authenticated`, toda migration deve consultar
dependencias em `pg_constraint`, `pg_trigger` e `pg_attrdef`.

Funcoes usadas por `CHECK`, trigger ou default de tabelas escritas pelo
frontend mantem o privilegio necessario. O hardening integral e reservado a
RPCs e materializadores internos sem dependencia estrutural.
