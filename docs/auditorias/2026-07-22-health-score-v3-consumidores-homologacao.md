# Homologacao dos consumidores do Health Score Professor V3

**Data:** 22/07/2026
**Escopo:** LA Report, Edge Functions e contratos de consumo do Fabio/LA Teacher
**Estado da V3:** publicacao parcial; ranking e premiacao bloqueados ate snapshot oficial

## Veredito

Os consumidores internos auditados usam a mesma camada canonica de KPIs do professor e os snapshots V3. Performance, cards, modal, Dashboard, Analytics e o relatorio instantaneo preservam os estados `parcial`, `sem_base` e `oficial`; ausencia de base nao e convertida em zero.

O relatorio instantaneo tinha duas divergencias reais e foi corrigido: dependia desnecessariamente da RPC mensal legada e incluia professor sem vinculo ativo. Agora ele usa apenas KPIs canonicos + V3, filtra os vinculos ativos e bloqueia rankings enquanto nao houver snapshot oficial com `ranking_habilitado`.

Fabio e LA Teacher ainda nao chamam a RPC V3 neste repositorio. O contrato seguro de consumo existe e esta pronto, mas a integracao desses dois consumidores permanece uma etapa externa e explicita.

## Matriz de consumidores

| Consumidor | Fonte canonica atual | Fonte V3 | Politica de estado | Rollback | Evidencia / estado |
|---|---|---|---|---|---|
| Gestao de Professores - Performance | `get_kpis_professor_periodo_canonico_v3` | `get_health_score_professor_v3_performance` | Exibe parcial e sem base; ranking so oficial | Manter componentes V2 sem trocar RPCs | Validado nas tres unidades; 19 Barra, 24 Recreio e 32 Campo Grande visiveis no recorte ativo |
| Modal individual do professor | Mesmo KPI canonico do periodo | `get_health_score_professor_v3_snapshot_modal` | Cada pilar preserva valor, base, cobertura e estado | Ocultar bloco V3 e manter modal anterior | Comparacao campo a campo sem divergencias em casos de Barra, Recreio e Campo Grande |
| Carteira do professor | KPI canonico; `get_carteira_professores` apenas como enriquecimento financeiro | `get_health_score_professor_v3_performance` | Score/metricas V3 nao recebem fallback numerico | Voltar a esconder os campos V3 | Fonte V3 usada para alunos, media/turma, permanencia e Health |
| Cadastro de professores | KPI canonico do periodo | Nao pontua Health | Nulos permanecem nulos | Manter grade cadastral anterior | Turmas, alunos e media/turma usam a camada canonica |
| Dashboard | KPI canonico do professor | Hook de Performance V3 | Media do Health considera somente scores existentes; cobertura nula vira `Sem base` | Ocultar banda V3 | Validado: 47 ativos e 47/47 scores parciais no consolidado |
| Analytics | Mesma camada do Dashboard | Hook de Performance V3 | Nao converte cobertura ausente em 0% | Ocultar banda V3 | Validado no consolidado; mesma media e cobertura do Dashboard |
| Relatorio individual | Payload canonico montado no modal | Snapshot modal V3 | Seis pilares com `Sem base`; sem inferir zero | Invocar gerador anterior sem bloco V3 | Contrato e serializacao auditados; Edge nao consulta fonte paralela |
| Relatorio da coordenacao com IA | KPIs canonicos + dados mensais operacionais | Performance V3 | Parcial para diagnostico; sem ranking/premiacao | Remover bloco V3 do payload | Fonte e contrato auditados; chamada externa nao executada na homologacao para evitar efeito/custo de IA |
| Relatorio instantaneo/ranking | KPI canonico filtrado por professor e vinculo de unidade ativos | Performance V3 | Ranking somente quando `oficial` e `ranking_habilitado`; caso contrario informa indisponibilidade | Reverter gerador instantaneo | Validado no Chrome: 47 professores, score parcial medio 85,0 e nenhum Top publicado |
| `gemini-insights-equipe` | Payload fornecido pelo frontend | Modulo compartilhado V3 | Usa parcial como diagnostico | Retirar bloco V3 do payload | Codigo auditado |
| `gemini-insights-professor` | Payload fornecido pelo modal | Modulo compartilhado V3 | Respeita pilares sem base | Retirar bloco V3 do payload | Codigo auditado |
| `gemini-ranking-professores` | Payload canonico do frontend | Modulo compartilhado V3 | Exige oficial + ranking habilitado | Manter ranking bloqueado | Codigo auditado |
| `gemini-relatorio-coordenacao` | Payload canonico do frontend | Modulo compartilhado V3 | Parcial sem premiacao | Retirar bloco V3 | Codigo auditado |
| `gemini-relatorio-professor-individual` | Payload canonico do modal | Modulo compartilhado V3 | Preserva seis pilares e sem base | Retirar bloco V3 | Codigo auditado |
| Fabio | Sem consumidor V3 conectado neste repositorio | `get_health_score_professor_v3_consumidor_pedagogico` | RPC pedagogica segura, sem financeiro | Nao conectar ate homologacao do cliente | **Pendente de integracao externa**; contrato backend pronto |
| LA Teacher | Integracao vive fora deste repositorio | Mesma RPC pedagogica autorizada | Deve respeitar carteira/escopo e sem base | Manter app sem bloco V3 | **Pendente de integracao externa** |

## Reconciliacao dos snapshots

Os snapshots mensais de junho, julho e do ciclo junho-agosto foram rematerializados depois da conciliacao das atribuicoes. A paridade de julho entre a fonte corrente e o snapshot ficou sem divergencias:

| Recorte | Professores | Divergencias |
|---|---:|---:|
| Barra | 19 | 0 |
| Recreio | 24 | 0 |
| Campo Grande | 33 linhas de origem; 32 no recorte ativo | 0 |
| Consolidado | 47 | 0 |

A constraint de diagnostico foi ampliada de forma aditiva para aceitar estados legitimos de ausencia de base, incluindo `sem_base_sem_turmas` e `sem_base_zero_carteira`. Isso evita falha de materializacao sem fabricar indicador.

## Regras confirmadas

- `parcial`: pode aparecer para diagnostico, cards e modal, mas nao participa de ranking ou premiacao.
- `sem_base`: aparece literalmente como sem base; cobertura ausente nao vira `0%`.
- `oficial`: somente snapshot fechado, com configuracao vigente e permissao explicita de ranking.
- Ranking de metrica e Health Score usa somente snapshots oficiais e habilitados.
- Em coorte mista, professores `parcial` ou `sem_base` permanecem no resumo da equipe, mas ficam fora de todos os rankings, inclusive carteira, media/turma, presenca e matriculadores.
- Professor sem vinculo ativo ou com vinculo ignorado nao entra no resumo da equipe.
- Retencao V3, conversao confirmada e presenca semantica podem divergir de indicadores operacionais por definicao; a interface deve identificar a semantica, nao misturar as fontes.
- Configuracao ativa e snapshot fechado permanecem imutaveis; mudancas passam por rascunho, simulacao e ativacao separada.

## Divergencias corrigidas nesta rodada

1. Cobertura `null` aparecia como `0%` ou `-%` em alguns consumidores.
2. Rankings auxiliares podiam ser montados a partir de snapshots parciais.
3. O relatorio instantaneo publicava Top Carteira/Media/Presenca mesmo sem ciclo oficial.
4. O relatorio instantaneo falhava quando a RPC mensal legada falhava.
5. O resumo instantaneo incluia professor sem vinculo ativo e mostrava 48 em vez de 47.
6. Alguns snapshots de Campo Grande estavam anteriores a mudancas de atribuicao; foram rematerializados.
7. Uma coorte mista podia liberar rankings auxiliares de professores ainda parciais; todos os rankings agora usam exclusivamente a coorte oficial habilitada.

## Pendencias antes da virada total

- Conectar Fabio e LA Teacher a RPC pedagogica V3 no repositorio/aplicativo responsavel.
- Executar chamadas reais dos relatorios com IA em ambiente controlado quando for desejado validar o provedor externo; os payloads e contratos locais ja foram auditados.
- Manter ranking e premiacao bloqueados ate o fechamento oficial do ciclo e homologacao da coordenacao.
- Migrar qualquer consumidor externo ainda nao inventariado antes de desativar a V2.

## Criterio de rollback

Cada consumidor foi mantido com integracao aditiva. O rollback consiste em ocultar/remover a leitura V3 do consumidor especifico, sem apagar snapshots, historico, configuracoes ou fontes canonicas. Nenhuma alteracao desta rodada exige reverter dados brutos de aulas, presencas ou alunos.
