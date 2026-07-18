# Health Score Professor V3 - Calibracao trimestral da conversao

**Data:** 2026-07-18

**Status:** meta inicial aprovada para execucao em sombra

**Autoridade:** Alf

## 1. Veredito

A meta inicial de conversao experimental para matricula foi fixada em `70%`.
Ela e uma referencia de desempenho versionada, nao o peso do pilar e nem um
valor fabricado para o professor.

O peso inicial da conversao continua `15%`. A nota e calculada por:

```text
nota = min(100, taxa_real_trimestral / 70 * 100)
```

O snapshot preserva taxa real, numerador, denominador, amostra, meta, nota,
fonte e confianca.

## 2. Coorte canonica usada

Recorte fechado de referencia: `2026-Q2`.

Regras:

- uma experimental confirmada conta uma vez no denominador;
- cada matricula pode receber credito de no maximo uma experimental;
- o credito vai para a ultima experimental confirmada anterior a matricula e
  dentro da janela de 30 dias;
- matricula direta sem experimental nao entra na taxa;
- cancelamento, falta e simples agendamento nao entram no denominador;
- professor e unidade precisam estar resolvidos;
- o trimestre e consolidado, nunca media simples dos meses.

## 3. Evidencia

| Medida | Resultado |
|---|---:|
| Experimentais confirmadas | 78 |
| Matriculas creditadas canonicamente | 34 |
| Taxa da rede | 43,59% |
| Professores com experimental | 34 |
| Professores com amostra minima | 10 |
| P50 entre professores elegiveis | 41,43% |
| P75 entre professores elegiveis | 62,5025% |
| P90 entre professores elegiveis | 66,67% |
| Meta inicial arredondada | 70% |

Uma verificacao alternativa por IDs estaveis encontrou 35 vinculos possiveis.
O motor canonico creditou 34 porque um caso nao satisfez integralmente a regra
de conciliacao. O caso nao foi promovido artificialmente: permanece como
diagnostico, sem inflar o numerador.

## 4. Por que nao 90%

`90%` seria uma meta aspiracional sem sustentacao na distribuicao trimestral
observada. A meta `70%` fica ligeiramente acima do P90 real, preserva desafio e
continua reproduzivel. A coordenacao podera elevar ou reduzir a meta em uma
nova versao quando houver mais trimestres maduros.

## 5. Governanca futura

- slider altera somente o peso da conversao;
- meta e editada em campo numerico separado;
- mudanca cria nova versao em rascunho;
- simulacao mostra impacto antes da ativacao;
- ativacao exige vigencia, autor e justificativa;
- snapshots fechados nunca sao recalculados pela nova meta.
