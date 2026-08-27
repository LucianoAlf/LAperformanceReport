# Consumidores de presença

Inventário estático em 26/08/2026. O banco `ouqwbbermlzqqvtqwlul` é compartilhado pelo LA Report e pelo LA Teacher. Este documento registra contratos e caminhos; não contém dados de alunos, professores ou responsáveis.

## Grão e cadeia atual

- `aluno_presenca`: evidência bruta por linha de aula/aluno; é destino de writers, não contrato de leitura novo.
- `vw_aluno_presenca_semantica_v1`: interpreta uma linha bruta.
- `vw_presenca_slot_canonica_v1`: colapsa linhas gêmeas no slot real.
- `vw_aluno_frequencia_canonica_v1`: agrega frequência; a última migration troca sua fonte para o slot.
- `fn_presenca_pendencias_do_dia_v2`: contrato único de Agenda/Sol; parte do roster operacional, associa a ocorrência v2 pela chave completa e só publica nomes com cobertura concluída e roster seguro. A assinatura sem versão é apenas um adapter temporário.
- `alunos.percentual_presenca`: snapshot legado. O campo homônimo devolvido por `vw_aluno_sucesso_lista` é calculado via `vw_absenteismo_aluno`, mas ainda depende da leitura bruta.

Contrato alvo do programa: `vw_presenca_ocorrencia_canonica_v2` como ocorrência única, com frescor e estado de publicação; `fn_presenca_pendencias_do_dia_v2` para Agenda/Sol; `get_presenca_contexto_agente_v1` para agentes; comandos duráveis `app_criar_comando_presenca_v1`, `app_aplicar_comando_presenca_v1` e `app_status_comando_presenca_v1` para writers humanos.

## Classificações

| Classe | Uso |
|---|---|
| `writer` | Produz evidência ou decisão de presença. |
| `auditoria` | Explica vínculo, divergência ou impacto sem publicar KPI. |
| `operacional` | Fecha chamada ou apresenta pendência acionável. |
| `agente` | Contexto consumido por Sol, Lia, Mila, Fábio ou BI. |
| `relatorio` | Lista ou texto gerencial. |
| `kpi` | Agregação numérica publicável. |
| `grafico` | Renderização de série, ranking ou percentual. |
| `legado_bloqueado` | Leitura existente congelada: pode ser removida, mas não replicada. |

## Matriz produtor → consumidor

| Produtor | Contrato atual | Consumidor | Contrato alvo | Validação |
|---|---|---|---|---|
| Emusys / `supabase/functions/sync-presenca-emusys/index.ts` (`writer`) | `upsert_presenca_emusys_bruta`; ao final ainda chama `atualizar_percentual_presenca` | Agenda | `vw_presenca_ocorrencia_canonica_v2` + `fn_presenca_pendencias_do_dia_v2` com frescor | Igualdade de membros Agenda × Sol por unidade/data; sync incompleto não fecha chamada. |
| Agenda / `src/components/App/Agenda/Chamada/useChamadaAcoes.ts` (`writer`, `operacional`) | `app_criar_comando_presenca_v1` → `app_aplicar_comando_presenca_v1`; experimental usa RPC separada | Sol | Comando durável e `fn_presenca_pendencias_do_dia_v2` | Repetir `request_id`, recarregar e confirmar que a chamada não reaparece. |
| Professor no app / `D:/la-teacher-worktrees/presenca-canonica-raiz/src/lib/api.ts` (`writer`, `operacional`) | `app_criar_comando_chamada_professor_v1` → `app_aplicar_comando_presenca_v1`; leitura por `app_minha_agenda_sessao` | LA Teacher/Fábio | Comando durável + ocorrência v2 escopada ao professor | Mesma ocorrência/status da Agenda; teste de ownership e idempotência. |
| Relatório de pendências / `20260827031200_presenca_contexto_agentes_v1.sql` (`operacional`, `agente`) | `fn_texto_relatorio_presenca` chama `get_presenca_contexto_agente_v1(..., 'sol')`; dado inseguro gera somente atraso estrutural | Sol | Contrato atingido | Agenda e Sol têm os mesmos `slot_key`; nenhuma cobrança nominal ou “Tudo fechado” em dado incompleto. |
| Alertas / `supabase/functions/processar-alertas-lia/index.ts` e `dispatcher.ts` (`agente`) | Alertas de frequência consultam `get_presenca_contexto_agente_v1(..., 'lia')`; dado inseguro é adiado como `presenca_desatualizada` sem mensagem | Lia | Contrato atingido | A migration de contexto revoga o `SELECT` cru do papel e os testes provam finalidade, frescor e ausência de envio. |
| Agenda experimental / `src/components/App/Agenda/Chamada/useChamadaAcoes.ts` (`writer`, `operacional`) | `app_registrar_presenca_experimental`; reconciliação em `sync-presenca-emusys` | Mila/experimental | Contexto experimental canônico por lead/vínculo, sem usar presença regular por nome/horário | Testes de lead convertido, homônimo e duas unidades; regular e experimental permanecem separados. |
| `get_health_score_professor_v3_presenca_periodo_v2` (`kpi`) | Última definição integral localizada em `20260813234837_20260813232430_health_score_v3_presenca_canonica_aplicabilidade.sql`, lendo `vw_aluno_presenca_semantica_v1` | Health Score Professor V3 | `vw_presenca_ocorrencia_canonica_v2`, somente ciclo aberto/novas materializações | Comparar numerador, denominador e publicabilidade; snapshots fechados continuam imutáveis. |
| Views/RPCs de sucesso e frequência (`relatorio`, `kpi`, `grafico`) | `get_faltas_periodo`, `vw_absenteismo_aluno`, `vw_aluno_sucesso_lista` e telas abaixo | Relatórios, KPIs e gráficos | Agregações sobre ocorrência v2; incompleto retorna `null + estado_publicacao` | Teste estático e PostgreSQL para gêmeas, dois cursos, cancelada, justificada e sync stale. |
| Schema/geradores analíticos (`agente`, `relatorio`) | BI usa `get_presenca_contexto_agente_v1(..., 'bi')`; o validador bloqueia `aluno_presenca`, `percentual_presenca` e relações legadas; plano/relatório recebem `presenca_contexto` | BI, plano e relatório do aluno | Contrato atingido | Toda presença inclui período, universo, regra, publicação e frescor; inseguro fica `Em auditoria`. |

## Allowlist executável de leituras diretas

O teste varre `src`, `supabase/functions` e `D:/la-teacher-worktrees/presenca-canonica-raiz/src`. Migrations históricas não entram na proibição. A allowlist é exata por arquivo e quantidade: uma leitura nova no mesmo arquivo também falha.

| Caminho | Ocorrências | Classe | Situação/contrato alvo |
|---|---:|---|---|
| `report:src/components/App/Alunos/statusPagamentoGovernanca.ts` | 1 | `legado_bloqueado` | Usa presença crua em governança de pagamento; migrar para projeção de última ocorrência publicável. |
| `report:src/hooks/useProfessorDependencies.ts` | 2 | `auditoria` | Conta e mostra dependências antes da gestão do professor; manter somente como auditoria escopada. |
| `report:supabase/functions/auditor-divergencias-emusys/index.ts` | 1 | `auditoria` | SQL de diagnóstico de vínculo aluno/professor. |
| `report:supabase/functions/previsualizar-reconciliacao-grade-emusys/index.ts` | 1 | `auditoria` | Preview read-only da reconciliação de grade. |

Não foi encontrada leitura direta de `aluno_presenca` em `D:/la-teacher-worktrees/presenca-canonica-raiz/src`; `src/lib/api.ts` consome RPCs. Writers que gravam por RPC não precisam de leitura direta liberada.

## Demais ocorrências runtime catalogadas

| Símbolo/contrato | Caminhos executáveis | Classe | Observação |
|---|---|---|---|
| `get_agenda_dia`, `get_agenda_dia_v2`, `get_agenda_semana` | `src/hooks/useAgendaDia.ts`, `src/hooks/useAgendaSemana.ts` | `operacional` | `get_agenda_dia_v2` envolve o read model existente com o mesmo envelope de pendências da Sol; o frontend muda no checkpoint visual. A definição de `get_agenda_semana` ainda não foi localizada nas migrations. |
| `app_criar_comando_presenca_v1`, `app_aplicar_comando_presenca_v1`, `app_status_comando_presenca_v1` | `src/components/App/Agenda/Chamada/useChamadaAcoes.ts` | `writer`, `operacional` | Secretaria recebe recibo persistente; a assinatura antiga sem `request_id` fica revogada. |
| `app_minha_agenda_sessao`, `app_criar_comando_chamada_professor_v1`, `app_aplicar_comando_presenca_v1` | `D:/la-teacher-worktrees/presenca-canonica-raiz/src/lib/api.ts` | `operacional`, `writer` | LA Teacher usa request id estável e não escreve tabela direta. |

As portas com `request_id` e o fechamento das assinaturas legadas são versionados por `20260827030900_presenca_comando_overloads_compatibilidade.sql`.
| `get_faltas_periodo_v2` | `src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts` | `relatorio`, `grafico` | Agrega ocorrência v2; ranking só recebe linhas quando todo o universo está publicável. |
| `percentual_presenca` de `vw_aluno_sucesso_lista` | `src/components/App/SucessoCliente/TabSucessoAluno.tsx`, `ModalDetalhesSucessoAluno.tsx` | `kpi`, `grafico` | A view encadeia `vw_absenteismo_aluno`, agora reconstruída sobre ocorrência v2 com frescor e publicação. |
| Detalhes de presença regular/experimental | `src/components/App/SucessoCliente/PresencaTab.tsx`, `src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx`, `src/components/App/Professores/ModalDetalhesPresenca.tsx` | `relatorio`, `grafico` | Regular usa `get_presenca_ocorrencias_periodo_v2`; experimental usa contrato próprio e não participa de frequência. |
| `percentual_presenca` selecionado de `alunos` | `src/components/App/Administrativo/PainelFarmer/hooks/useSucessoAlunoAlertas.ts` | `legado_bloqueado` | Leitura direta do snapshot antigo. |
| `percentual_presenca` analítico | `supabase/functions/bi-agent-lamusic/schema.ts`, `gerar-plano-aluno/index.ts`, `gerar-relatorio-aluno/index.ts` | `agente`, `relatorio`, `legado_bloqueado` | O schema anuncia e os geradores recebem o campo legado. |
| `atualizar_percentual_presenca` | `supabase/functions/sync-presenca-emusys/index.ts` | `writer`, `legado_bloqueado` | Recalcula snapshot após o sync; não deve orientar consumidor novo. |
| `percentual_presenca_contrato` | `src/hooks/useJornadaAluno.ts`, `D:/la-teacher-worktrees/presenca-canonica-raiz/src/lib/api.ts` | `relatorio` | Campo distinto, contratual; ocorrência lexical do prefixo, não leitura de `alunos.percentual_presenca`. |
| IDs/tabelas auxiliares | `src/components/App/Alunos/ConciliacaoPresencas.tsx`, `src/components/App/Agenda/Chamada/ChamadaDrawer.tsx` | `auditoria`, `writer` | Usam `aluno_presenca_id`, revisões/retificações; não são leitura direta da tabela bruta. |
| Referências explicativas | `src/lib/agenda.ts`, `src/components/App/Agenda/AgendaCard.tsx` | `operacional` | Menções em comentários de contrato, sem query direta. |

## Definições vivas reconstruídas

As definições abaixo são as últimas criações integrais localizadas mais os patches posteriores que alteram o corpo vivo. Elas são inspecionadas pelo teste; migrations antigas permanecem apenas como histórico.

| Objeto | Migration(s) efetivas | Classe/estado atual |
|---|---|---|
| `vw_aluno_presenca_semantica_v1` | `20260811120100_presenca_semantica_v14_falta_justificada.sql` | Projeção canônica v1; leitura bruta permitida dentro da projeção. |
| `vw_presenca_slot_canonica_v1` | `20260824232302_presenca_slot_exclusao_do_slot_e_divergencia_real.sql` | Projeção canônica do slot; lê a semântica, não a tabela bruta. |
| `vw_aluno_frequencia_canonica_v1` | Base `20260715161000_frequencia_churn_sombra_performance.sql`; patches `20260825144235_frequencia_do_aluno_conta_aula_real_nao_registro_duplicado.sql` e `20260827031300_presenca_consumidores_numericos_v2.sql` | `kpi`; definição viva usa `vw_presenca_ocorrencia_metrica_v2`. |
| `fn_presenca_pendencias_do_dia_v2` e adapter legado | Cadeia histórica `20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql`, `20260824232102_pendencias_presenca_percorre_roster_do_slot_inteiro.sql`, `20260824232411_pendencia_respeita_justificativa_do_slot.sql`; regra efetiva `20260827031000_presenca_pendencias_canonicas_v2.sql` | `operacional`; preserva aluno sem linha, separa curso regular/experimental e falha fechado para roster/sync inseguros. |
| `get_faltas_periodo` | Legado em `20260615235041_faltas_periodo_inclui_banda_com_flag.sql`; v2 em `20260827031300_presenca_consumidores_numericos_v2.sql`; despacho em `20260827031800_presenca_rollout_kpis.sql` | `relatorio`; adapter preserva assinatura e só publica o universo v2 completo quando `kpis=canonico_v2`. |
| `vw_absenteismo_aluno` | Histórico em `20260704212922_criar_view_absenteismo_aluno.sql` e segurança em `20260707215751_seguranca_views_security_invoker_e_funcoes_guard.sql`; v2 em `20260827031300_presenca_consumidores_numericos_v2.sql`; despacho em `20260827031800_presenca_rollout_kpis.sql` | `kpi`; view `security_invoker` chama função governada sem liberar a cópia canônica privada. |

O cutover operacional de `fn_texto_relatorio_presenca` e
`app_minha_agenda_sessao` é a última mutação de
`20260827031700_presenca_rollout_adapters.sql`: as implementações v2 ficam
privadas e as portas públicas preservam legado/sombra/canônico por unidade.
| Relatório da Sol | Baseline `20260827030000_presenca_funcoes_vivas_baseline.sql`; pendências v2 em `20260827031000_presenca_pendencias_canonicas_v2.sql`; finalidade em `20260827031200_presenca_contexto_agentes_v1.sql` | `agente`, `operacional`; texto unitário e consolidado usam o contexto `sol`, o mesmo envelope v2 e o horário da sincronização. |
| LA Teacher | Leitura-base `app_minha_agenda_sessao` em `20260812172432_presenca_canonica_resolvedor_conflitos.sql`; writer em `20260815112104_reverte_precedencia_secretaria_prevalece.sql`; patch do slot em `20260824231632_la_teacher_presenca_pela_canonica_do_slot.sql`; envelope v2 em `20260827031100_la_teacher_presenca_canonica_v2.sql` | Writer preserva decisão forte; agenda do professor recebe ocorrência v2, frescor, versão da regra e estado estrutural sem transformar ausência bruta do Emusys em falta. |
| Fábio por período | Legado `fabio_professor_presencas_periodo` do LA Teacher; adaptador em `20260827032100_presenca_rollout_fabio_periodo.sql` | `agente`; sombra/rollback preservam o JSON v1, e `canonico_v2` publica somente ocorrência v2 fresca. `falta_provavel` fica vazio: ausência bruta nunca vira falta. |
| Health Score Professor V3 | Histórico em `20260813234837_20260813232430_health_score_v3_presenca_canonica_aplicabilidade.sql`; função viva em `20260827031300_presenca_consumidores_numericos_v2.sql` | `kpi`; ciclos abertos e novas materializações usam ocorrência v2; snapshots fechados não recebem DML. |
| Interfaces de consulta | `20260827031400_presenca_interfaces_consulta_v2.sql` | Regular usa ocorrência v2; experimental permanece em contrato próprio com ACL por unidade. |

O risco de escopo congelado no baseline foi fechado na função-fonte v2: ela
valida unidade para `authenticated` antes de devolver qualquer nome. O adapter e
o texto continuam temporariamente executáveis pelos papéis atuais para
compatibilidade; no checkpoint de agentes a Sol migra para
`get_presenca_contexto_agente_v1` e a porta textual deixa de ser um contrato novo.

## Ambiguidades e decisões humanas pendentes

1. `get_agenda_semana` é chamado pelo frontend, mas sua definição não aparece nas migrations pesquisadas; é preciso decidir se será recuperada do banco antes de qualquer recriação.
2. O acesso direto histórico de `lia_acesso_restrito` a `aluno_presenca` é revogado na mesma migration que entrega `get_presenca_contexto_agente_v1`; publicação da migration e da Edge deve ocorrer na mesma onda para não abrir uma janela sem contrato.
3. O serviço externo do agente Fábio não está nos três diretórios deste inventário. O cliente, a agenda e a ferramenta SQL por período estão cobertos; o executável externo ainda precisa de inventário próprio antes da troca.
4. `fn_presenca_pendencias_do_dia` precisa continuar partindo do roster para enxergar aluno sem linha. A decisão de desenho é manter essa propriedade na v2 sem transformar ausência de linha em falta.
5. As superfícies numéricas convergiram localmente para ocorrência v2; a paridade com dados reais e a prova byte a byte dos snapshots fechados permanecem para o checkpoint de sombra, sem recalcular histórico.
6. Mila não mostrou leitura de presença regular em `mila-processar-mensagem`; a presença experimental encontrada vive na Agenda/sync. Qualquer novo vínculo precisa usar IDs de lead/aluno/unidade, nunca nome ou horário isolado.
