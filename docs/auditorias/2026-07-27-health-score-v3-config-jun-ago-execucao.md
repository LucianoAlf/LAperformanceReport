# Execucao da configuracao Health Score V3 - ciclo Jun-Ago

**Data:** 2026-07-27  
**Projeto:** `ouqwbbermlzqqvtqwlul`  
**Escopo:** backend e configuracao governada; nenhum consumidor de tela alterado

## Resultado

A revisao V4 foi criada pela sessao autenticada de Luciano Alf, simulada para
julho/2026 e ativada para o ciclo de 01/06/2026 a 31/08/2026.

| Item | Resultado |
|---|---:|
| Configuracao nova | V4 |
| ID | `4f34ac12-8a6a-4adc-9910-c60aebe2be89` |
| Criado por | Luciano Alf (`usuarios.id = 2`) |
| Ativado por | Luciano Alf (`usuarios.id = 2`) |
| Metricas | 6 |
| Peso total | 100% |
| Metas segmentadas pedagogicas | 69 |
| Aula Experimental na matriz | 0 |
| Simulacoes | 1 |
| Snapshots escritos nesta etapa | 0 |

## Trilha de substituicao

- V2 (`9af37ebb-761f-4234-bb74-9136d8399e3f`) foi preservada e arquivada.
- V4 passou a ser a configuracao ativa de Jun-Ago.
- V3 (`0e6a01ab-073a-46f0-9148-5412e795d9da`) continua ativa a partir de
  01/09/2026.
- A substituicao append-only foi registrada em
  `health_score_professor_v3_config_substituicoes`.

## Task 6A

`cursos.id = 45` (`Aula Experimental`) foi classificado como curso comercial.
Ele permanece disponivel para a metrica de conversao, mas foi retirado do
catalogo, da carteira e da media por turma.

O inventario bloqueante, executado contra a matriz pedagogica de origem,
retornou:

| Unidade | Segmentos pedagogicos pontuaveis sem meta |
|---|---:|
| Barra | 0 |
| Campo Grande | 0 |
| Recreio | 0 |

## Ajuste descoberto na simulacao

A simulacao preserva divergencias historicas e atribuicoes nao pontuaveis como
diagnostico. O guard anterior da ativacao bloqueava essas linhas como se fossem
metas faltantes.

A migration
`20260727125000_health_score_v3_ativacao_segmentos_pontuaveis.sql` alinhou o
guard ao contrato:

- atribuicao formal pontuavel sem meta continua bloqueando;
- combinacao declarada nao ofertada com dados observados continua bloqueando;
- divergencia historica nao pontuavel continua visivel, mas nao impede a
  ativacao.

## Promocao automatica dos periodos

Foram promovidos somente candidatos exatos, em revisoes append-only:

| Unidade | Revisoes promovidas |
|---|---:|
| Barra | 75 |
| Campo Grande | 71 |
| Recreio | 61 |
| **Total** | **207** |

O baseline efetivo exposto por
`vw_professor_periodos_baseline_v3_sombra` permaneceu com 8.273 linhas. A
tabela fisica conserva reconstrucoes historicas adicionais; portanto, 8.273
nao representa o total fisico da tabela.

As cinco pendencias que exigem julgamento humano permaneceram fora da promocao.

## Migrations aplicadas

1. `20260727120000_health_score_v3_retencao_universo_governado`
2. `20260727121000_health_score_v3_promocao_periodos_ativos_exatos`
3. `20260727122000_health_score_v3_percentuais_valor_real`
4. `20260727122500_health_score_v3_cursos_pedagogicos`
5. `20260727123000_health_score_v3_config_ciclo_aberto`
6. `20260727124000_health_score_v3_origem_segmentada_ciclo_aberto`
7. `20260727125000_health_score_v3_ativacao_segmentos_pontuaveis`

## Proximo gate

Materializar novas revisoes provisorias de julho com a V4, comparar as tres
unidades e os quatro professores-piloto, e parar antes de qualquer mudanca de
tela.
