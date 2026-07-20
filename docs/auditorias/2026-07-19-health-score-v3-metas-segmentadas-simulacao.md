# Health Score V3 - Simulacao das metas segmentadas

Data da execucao: 20/07/2026  
Competencia: julho/2026  
Escopo: tres unidades, sem ativacao

## Veredito

A simulacao privada foi executada, mas a configuracao nao foi ativada. A
configuracao ativa permaneceu na versao 2 e o novo rascunho permaneceu na
versao 3, com vigencia futura em 01/09/2026.

O Gate 10 esta aprovado como simulacao e diagnostico. Ele nao autoriza o
cutover nem a publicacao de ranking.

## Configuracoes

| Papel | ID | Versao | Estado |
|---|---|---:|---|
| Ativa produtiva | `9af37ebb-761f-4234-bb74-9136d8399e3f` | 2 | `ativa` |
| Homologacao segmentada | `0e6a01ab-073a-46f0-9148-5412e795d9da` | 3 | `rascunho` |

O rascunho herdou apenas os seis pesos e metas gerais existentes. A matriz
`unidade + curso + modalidade` ficou vazia de proposito: a direcao ainda nao
forneceu uma matriz completa de valores homologados. A regra deste Gate foi
nao inventar metas, nao copiar valores entre unidades e nao copiar valores
entre modalidades.

## Resultado da simulacao

Simulacao: `49ff6bee-1af7-45c0-b908-516a85df9890`.

| Indicador | Resultado |
|---|---:|
| Professores/recortes avaliados | 129 |
| Saudaveis | 88 |
| Atencao | 6 |
| Criticos | 1 |
| Sem base | 34 |
| Score medio observado | 82,23 |
| Ocorrencias sem regra segmentada | 250 |
| Atribuicoes pontuaveis sem meta | 194 atribuicoes |
| Segmentacoes incompletas | 56 |
| Segmentos com carteira zero | 0 |
| Alertas de capacidade | 0 |
| Nao ofertada com dado observado | 0 |

O diagnostico consolidou 250 ocorrencias sem regra segmentada e 194
atribuicoes pontuaveis ainda sem meta homologada.

Esses scores sao apenas uma simulacao estrutural. Como as 194 atribuicoes
ainda nao possuem meta segmentada, os numeros nao sao publicaveis nem servem
para premiacao.

## Convergencia canonica

Na primeira comparacao, a camada segmentada reduzia indevidamente o total
visual ao retirar alunos de projetos antes de calcular a carteira. Isso gerou
14 divergencias em 75 combinacoes professor/unidade, embora a media por turma
ja estivesse correta.

A migration
`20260719206000_health_score_v3_segmentos_preservar_total_canonico.sql`
separou os conceitos:

- total visual de pessoas: carteira canonica completa;
- vinculos pontuaveis: pessoa, curso e modalidade regular;
- ocupacoes: pessoa e turma regular;
- projetos e bandas: visiveis na carteira, fora das metas segmentadas.

Depois da correcao, a verificacao remota retornou:

| Comparacao | Resultado |
|---|---:|
| Professor/unidade comparados | 75 |
| Divergencias no total de pessoas | 0 |
| Divergencias na media bruta | 0 |
| Maior delta de carteira | 0 |
| Maior delta de media | 0 |

A RPC superior `get_health_score_professor_v3_metricas_periodo` tambem foi
comparada com a carteira canonica: 75 recortes e zero divergencia.

## Controles cobertos

- unidades com metas potencialmente distintas permanecem separadas;
- `individual` e `turma` permanecem modalidades independentes;
- pessoa em mais de um curso nao duplica o total visual;
- vinculos por curso continuam separados para pontuacao;
- ocupacao continua no grao pessoa/turma;
- professor com somente projeto continua visivel sem criar meta ou nota;
- configuracao ativa e snapshots fechados nao foram alterados.

## Decisao

A configuracao V3 segmentada permanece nao ativada. O proximo passo e auditar
seguranca, isolamento, imutabilidade e desempenho; somente depois vem a
validacao visual end to end. A matriz so pode ser preenchida com metas
explicitamente aprovadas pela direcao.
