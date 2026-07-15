# Inventario de Consumidores Pedagogicos

**Data:** 2026-07-15
**Projeto:** `ouqwbbermlzqqvtqwlul`
**Metodo:** catalogo PostgreSQL + busca no repositorio, sem alteracao de dados

## Veredito

O impacto de `aluno_presenca` e maior que o pente-fino. Foram encontrados 38 objetos
SQL com dependencia textual direta de `aluno_presenca`,
`vw_jornada_aluno_com_presenca`, `vw_absenteismo_aluno` ou da feature de churn.
Esse numero e piso, pois wrappers e telas podem depender indiretamente desses objetos.

## P0 em producao

| Consumidor | Uso | Risco |
|---|---|---|
| `features_churn_alunos_ativos` | features 30/60/geral do modelo | ausencia ambigua altera a previsao |
| Edge `calcular-risco-evasao` | recalculo a cada 3 dias | grava scores acionaveis na tela |
| `vw_risco_evasao_atual` | leitura do score corrente | mitigado em 15/07 com baixa confianca |
| `calcular_health_score_aluno` | componente de presenca do Health Score | agrega ausencia bruta via absenteismo |
| `get_kpis_professor_periodo_base_legado_20260713` | presenca em KPI de professor | alimenta wrapper com nome canonico |
| `get_dados_relatorio_coordenacao_legado_20260711` | relatorio e rankings | pode publicar ranking contaminado |

## Funcoes diretamente atingidas

- `admin_corrigir_presenca`
- `app_aluno_ficha`
- `app_minha_agenda_sessao`
- `app_registrar_presencas_aula`
- `atualizar_percentual_presenca`
- `calcular_health_score_aluno`
- `fabio_briefing_matinal`
- `fabio_contexto_professor`
- `fabio_pente_fino_unidade`
- `features_churn_alunos_ativos`
- `fn_completar_origem_retificacao_presenca`
- `fn_prontuario_aluno_interno`
- `get_candidatos_pesquisa_primeira_aula`
- `get_carteira_professor_periodo_canonica`
- `get_conciliacao_experimentais_v2_legacy_p21_20260707`
- `get_dados_relatorio_coordenacao_legado_20260711`
- `get_divergencias_alunos`
- `get_experimentais_comercial_diagnostico_v2`
- `get_faltas_periodo`
- `get_historico_aulas_aluno`
- `get_historico_pedagogico_aluno_interno_20260712`
- `get_jornada_aluno`
- `get_kpis_comercial_canonicos_v2`
- `get_kpis_professor_periodo`
- `get_kpis_professor_periodo_base_legado_20260713`
- `get_relatorio_pedagogico_aluno_interno_20260712`
- `rpc_analise_turmas`
- `sincronizar_grade_horaria_alunos`

## Views diretamente atingidas

- `vw_absenteismo_aluno`
- `vw_aluno_sucesso_lista` (indireta via absenteismo)
- `vw_fabio_aulas_contexto`
- `vw_jornada_aluno_com_presenca`
- `vw_jornada_marcos`
- `vw_jornada_professor_atual`
- `vw_ponto_professor_aulas`
- `vw_prontuario_aluno`
- `vw_registro_pendencia`
- `vw_turmas_professor_periodo`

## Crons ativos relacionados

- `calcular-risco-evasao-3d`: `0 5 */3 * *`.
- recalculo diario de Health Score de alunos.
- sync de presenca Emusys que materializa ausencia apos a janela de maturidade.

## Achados estruturais

1. `get_kpis_professor_periodo_canonico_base_20260711` chama
   `get_kpis_professor_periodo_base_legado_20260713`; o wrapper canonico nao torna
   canonicas todas as metricas recebidas da base legada.
2. `vw_jornada_aluno_com_presenca` combina jornada e presenca no mesmo read model e
   permite agregacao antes da confirmacao robusta da disciplina.
3. `aluno_presenca.respondido_em` e horario do sync para registros Emusys, nao horario
   real da chamada.
4. O Emusys nao entrega um estado explicito de chamada nao registrada.
5. A migration `20260714233000_professores_performance_junho_canonica.sql` regrediu
   a media por turma para pessoa unica/turma, contrariando a regra pessoa+turma.

## Ordem de migracao

1. churn;
2. Health Score do aluno;
3. KPI/Health Score do professor e relatorio da coordenacao;
4. contexto, briefing e pente-fino do Fabio;
5. ficha, historicos e telas auxiliares.

Objetos com nome legado nao serao removidos antes da verificacao de grants, chamadas
no frontend, Edge Functions, crons e logs.
