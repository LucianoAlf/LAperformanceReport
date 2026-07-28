# Auditoria - Conversao por ciclo provisoria no Health Score V3

**Data:** 2026-07-28  
**Competencia materializada:** Jul/2026  
**Ciclo observado:** Jun-Ago/2026  
**Unidades:** Barra, Campo Grande e Recreio

## Veredito

Implementacao aprovada tecnicamente:

- o denominador deixou de depender da pessoa canonica;
- o numerador continua exigindo pessoa e matricula canonicas;
- 69 eventos foram conciliados com lead por regra segura;
- 22 de 83 vinculos professor-unidade atingem a amostra minima no ciclo;
- nenhum vinculo recebeu peso de conversao;
- a conversao teve zero contribuicoes no score;
- ranking e premiacao continuam bloqueados.

## O que foi aplicado

Migration:

`supabase/migrations/20260728220000_health_score_v3_conversao_ciclo_provisorio.sql`

Indice complementar:

`supabase/migrations/20260728220100_health_score_v3_conciliacao_lead_index.sql`

Objetos:

- `health_score_v3_experimental_lead_conciliacoes`;
- `get_health_score_professor_v3_conversao_ciclo`;
- wrapper atualizado de `get_health_score_professor_v3_metricas_periodo`.

O materializador gerou novas revisoes append-only:

| Unidade | Snapshots finais |
|---|---:|
| Barra | 20 |
| Campo Grande | 35 |
| Recreio | 28 |

Nenhum consumidor foi trocado e nenhum snapshot anterior foi reescrito.

## Conciliacao segura

| Unidade | Metodo | Eventos |
|---|---|---:|
| Barra | telefone + nome coerente | 18 |
| Campo Grande | telefone + nome coerente | 19 |
| Recreio | telefone + nome coerente | 32 |
| **Total** |  | **69** |

O processo gravou somente a ponte `raw -> lead`. Nao atualizou
`emusys_experimentais_raw`, `leads`, `alunos` ou matriculas.

## Casos para revisao humana

Os cinco casos que exigem decisao ou reparo de origem sao:

| Unidade | Professor | Experimental | Evidencia | Motivo |
|---|---|---|---|---|
| Campo Grande | Matheus dos Santos | Samara Abreu Rodrigues, 03/06 | telefone aponta para Jammal Rodrigues Braga, que possui pessoa canonica | nomes divergentes |
| Barra | Matheus Reis | Theo Martiniano, 09/07 | telefone aponta para Noah Martiniano | nomes divergentes |
| Recreio | Israel Rocha | Luisa Mello, 27/07 | telefone aponta para Pedro Mello | nomes divergentes |
| Recreio | Lucas Guimaraes | Mateus Aguiar dos Santos, 24/06 | telefone aponta para Lucas Aguiar dos Santos | nomes divergentes |
| Barra | Gabriel Antony | Ravi Marques Leone, 05/06 | telefone e nome conciliados; lead `9764` esta convertido | falta pessoa e matricula canonicas para o numerador |

Ravi permanece no denominador. A conversao declarada nao recebe credito ate a
matricula canonica existir.

Caso adicional, sem bloqueio humano:

- Julia Correa Gomes Diniz, Barra, 11/06, nao possui lead por telefone. O
  evento continua valido no denominador pela identidade da experimental, sem
  inventar lead ou pessoa.

## Resultado da conversao no ciclo

| Unidade | `provisorio_ciclo` | Abaixo da amostra | Sem experimental | Pontuando |
|---|---:|---:|---:|---:|
| Barra | 7 | 9 | 4 | 0 |
| Campo Grande | 5 | 18 | 12 | 0 |
| Recreio | 10 | 10 | 8 | 0 |
| **Total** | **22** | **37** | **24** | **0** |

Todos os registros de conversao possuem `peso_disponivel = false` e
`contribuicao = null`.

As mudancas de score observadas entre a materializacao anterior e a nova nao
vieram da conversao. A comparacao por metrica mostrou:

- conversao: valores alterados, zero alteracao de peso e contribuicao;
- presenca: dados vivos alterados na Barra;
- carteira e media/turma: dados vivos/configuracao vigente alterados em parte
  dos vinculos.

## Professores de referencia

| Professor | Unidade | Conversao do ciclo | Estado | Peso |
|---|---|---:|---|---|
| Erick Cosme | Barra | 6/9 = 66,67% | `provisorio_ciclo` | fora |
| Erick Cosme | Recreio | 3/6 = 50,00% | `provisorio_ciclo` | fora |
| Gabriel Antony | Barra | 1/3 = 33,33% | `provisorio_ciclo` | fora |
| Isaque Mendes | Barra | 1/2 = 50,00% | `sem_base_amostra` | fora |
| Peterson Biancamano | Barra | sem experimental | `sem_base` | fora |
| Peterson Biancamano | Campo Grande | 1/1 = 100,00% | `sem_base_amostra` | fora |

## Distribuicao real dos seis pilares

Valores abaixo sao descritivos. Nenhuma meta ou peso foi alterado.

### Barra

| Pilar | Observados | Pontuaveis | P50 | Media | P75 |
|---|---:|---:|---:|---:|---:|
| Retencao | 19 | 11 | 100,00% | 96,46% | 100,00% |
| Permanencia | 15 | 15 | 10,66 meses | 10,10 | 11,25 |
| Conversao | 16 | 0 | 50,00% | 60,42% | 75,00% |
| Media/turma | 19 | 19 | 1,04 | 1,17 | 1,20 |
| Numero de alunos | 19 | 15 | 10 | 14,00 | 20 |
| Presenca | 19 | 11 | 62,26% | 66,77% | 74,12% |

### Campo Grande

| Pilar | Observados | Pontuaveis | P50 | Media | P75 |
|---|---:|---:|---:|---:|---:|
| Retencao | 32 | 21 | 96,15% | 87,99% | 100,00% |
| Permanencia | 28 | 27 | 10,40 meses | 11,11 | 12,08 |
| Conversao | 23 | 0 | 33,33% | 44,20% | 100,00% |
| Media/turma | 31 | 30 | 1,50 | 1,54 | 1,73 |
| Numero de alunos | 34 | 26 | 13 | 14,82 | 20 |
| Presenca | 0 | 0 | - | - | - |

### Recreio

| Pilar | Observados | Pontuaveis | P50 | Media | P75 |
|---|---:|---:|---:|---:|---:|
| Retencao | 24 | 15 | 100,00% | 97,20% | 100,00% |
| Permanencia | 21 | 20 | 9,86 meses | 10,70 | 11,30 |
| Conversao | 20 | 0 | 33,33% | 40,58% | 50,00% |
| Media/turma | 24 | 24 | 1,10 | 1,16 | 1,25 |
| Numero de alunos | 24 | 20 | 13,50 | 17,25 | 23 |
| Presenca | 24 | 14 | 65,76% | 67,41% | 75,19% |

## Leitura para o proximo ciclo

As escalas nao sao equivalentes:

- retencao concentra valores proximos de 100;
- conversao concentra valores entre 33 e 60, dependendo da unidade;
- presenca fica perto de 60 a 67;
- permanencia, carteira e media/turma usam unidades diferentes.

Somar essas notas sem calibracao conjunta faz a disponibilidade de pilares
influenciar o score. A recomendacao e discutir metas, pesos e bases minimas
com a coordenacao antes de permitir que a conversao pontue no proximo ciclo.

## Seguranca

- wrapper de leitura: `authenticated = true`, `anon = false`;
- helper e funcao-base: sem `EXECUTE` para `authenticated` ou `anon`;
- zero dependencias em `CHECK`, trigger ou default para as funcoes endurecidas;
- a verificacao de dependencias estruturais esta dentro da migration.

Os advisors nao apontaram alerta severo nos objetos novos. A tabela interna
aparece apenas com o aviso informativo esperado de RLS sem policy, pois nao e
consultada pelo frontend e possui grants somente para `service_role`. O indice
da FK de lead foi criado em migration aditiva.
