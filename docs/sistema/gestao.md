# Mapa do sistema — gestao

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/gestao.md`](../banco/detalhe/gestao.md)

## Relatórios de Coordenação (09/09/2026)

- `montar_relatorio_coordenacao_conteudo_v4` produz o documento compartilhado pelos cinco relatórios; os geradores local e `gemini-relatorio-coordenacao` apresentam a mesma versão/status.
- `get_health_score_professor_v3_presenca_periodo_v2` agrega ocorrências classificadas sem veto global por unidade. Mensal e ciclo compartilham `get_health_score_professor_v3_conversao_periodo_canonico`, com matrícula comprovada, crédito único e janela D+30.
- `fechar_health_score_professor_v3_ciclo` exige recorte integral e publica atomicamente os comparáveis. `retificar_coordenacao_jun_ago_2026` é interno (`service_role`) e preserva a revisão oficial anterior como invalidada.
- Alteração de estrutura e backfill são transações separadas: o recálculo não mantém o lock de DDL da tabela de snapshots. A carga e a comparação dos documentos precedem a liberação.
- Frontend diferencia fechamento oficial de acompanhamento, exige identidade/notas do ranking e mantém maturação fora da classificação; Top 10 exige amostra, cobertura exibe x/y e sugestões não duplicam prioridades.
- `executar_relatorio_coordenacao_batch_diario_v4` captura mensal/ciclo das três unidades e consolidado em uma transação REPEATABLE READ, às 05:00 BRT (job 257). Limites: 110 s de execução e 3 s de lock. Falha em um recorte desfaz os oito; documentos finais são preservados.
- **Liberação em validação:** responsável reconfirmou D+30 (Jun–Ago a partir de 30/09), autorizou OpenAI e retirou financeiro dos cinco relatórios. Edge 97 publicada; frontend e regularização versionada da publicação antecipada em andamento. Ver [gates e evidências](../audits/2026-09-09-coordenacao-release.md).

## Dashboard (`/app`)
- **Componentes:** `Dashboard/DashboardPage.tsx`, `Dashboard/ModalDetalheKPI.tsx`
- **Hooks:** `useMetasKPI`, `useComercialOperacionalResumoV2`, `useHealthScoreProfessorV3Performance`
- **RPCs:** `get_kpis_alunos_canonicos` para a base viva de alunos e
  `get_health_score_professor_v3_performance_snapshot_v3` para o card de
  professores; o consumidor lê a última fotografia V3 e não recalcula o score
  no request. Os demais cards preservam suas fontes próprias.
- **Edge functions:** nenhuma
- **Tabelas/views:** `alunos`, `movimentacoes_admin`, `leads`, `vw_alertas_inteligentes`, `professores`, `vw_turmas_implicitas`, `professores_performance`, `dados_mensais`, `unidades`; o Health Score usa somente snapshots V3 por RPC.
- **Health Score V3:** o ciclo fixo é a leitura principal e o mensal mostra as evidências da competência. Score observado não é ocultado por baixa comparabilidade; ranking e premiação exigem ciclo oficial fechado e score comparável. Falha V3 é explícita e não retorna silenciosamente para a V2.

## Gestão Mensal (`/app/gestao-mensal`)
Orquestrador `GestaoMensal/GestaoMensalPage.tsx`. Abas: **Gestão**, **Comercial**, **Professores**.
- **Gestão (`TabGestao.tsx`):** hook `useMetasKPI`, `useCompetenciaMensalStatus`, `fetchKPIsAlunosCanonicos`. **RPC:** `recalcular_dados_mensais`. Tabelas: `alunos`, `movimentacoes_admin`, `dados_mensais`, `motivos_saida`.
- **Comercial (`TabComercialNew.tsx`):** `fetchComercialOperacionalResumoV2`, `fetchExperimentaisDiagnosticoComercialV2`. RPCs: nenhuma direta. Tabelas: `leads`, `alunos`, `dados_mensais`.
- **Professores (`TabProfessoresNew.tsx`):** **RPCs** `get_experimentais_professor_canonicos_v1`, `get_health_score_professor_v3_performance`. O resumo V3 alterna entre mês e ciclos `Mar-Abr-Mai`, `Jun-Jul-Ago`, `Set-Out-Nov`, `Dez-Jan-Fev`; o ciclo é a leitura principal e rankings ficam reservados ao fechamento oficial comparável. As views V2 permanecem somente para indicadores operacionais ainda não migrados e rollback controlado.
- **Modal Permanência (`ModalPermanenciaDetalhe.tsx`):** **RPC** `get_historico_ltv`.

## Metas (`/app/metas`)
`Metas/MetasPageNew.tsx`; abas Gestão/Comercial/Professores + **Simulador de Metas** e **Simulador de Turma**.
- **Hooks:** `useSimulador`, `useSimuladorTurma`, `useDadosHistoricos`, `useMetasKPI`
- **RPCs:** `get_dados_turma_unidade`
- **Edge functions:** `gemini-insights` (plano IA), `gemini-insights-turma`
- **Tabelas:** `metas_kpi` (upsert por unidade+ano+mes+tipo), `metas`, `templates_cenario`, `planos_acao`, `simulacoes_turma`, `metas_professor_turma`
