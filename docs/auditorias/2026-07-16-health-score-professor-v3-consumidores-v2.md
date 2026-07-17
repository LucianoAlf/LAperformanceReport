# Baseline de consumidores V2 - Health Score do Professor

**Data:** 2026-07-16
**Objetivo:** congelar o estado produtivo antes da implementacao em sombra do Health Score do Professor V3.
**Regra:** nenhum consumidor desta lista muda de fonte durante staging, reconstrucao ou calculo em sombra.

## Fontes produtivas congeladas

| Responsabilidade | Fonte atual | Grao | Estado |
|---|---|---|---|
| KPIs periodicos de professor | `get_kpis_professor_periodo_canonico_v3` por `src/lib/professoresKpisCanonicos.ts` | professor + unidade + competencia | produtivo |
| Calculo do Health Score | `calcularHealthScore` em `src/hooks/useHealthScore.ts` | professor no recorte entregue pela tela | produtivo V2 |
| Pesos/configuracao | `config_health_score_professor` por `src/hooks/useHealthScoreConfig.ts` | unidade ou configuracao global | produtivo V2 |
| Relatorio textual instantaneo | dados normalizados em `src/lib/relatorioCoordenacaoInstantaneo.ts` | professor no recorte selecionado | produtivo V2 |

O sufixo `canonico_v3` da RPC de KPIs e uma versao da fonte atual de KPIs, nao o novo motor Health Score V3. A camada nova usa nomes explicitos `health_score_professor_v3_*` e RPCs `*_v3_sombra`.

## Inventario de consumidores

| Consumidor | Arquivo principal | Fonte efetiva | Estado atual | Rollback do futuro cutover |
|---|---|---|---|---|
| Cadastro/listagem de professores | `src/components/App/Professores/ProfessoresPage.tsx` | `buscarKpisProfessoresCanonicos` + tabelas de cadastro | produtivo | remover feature flag V3 e manter o caminho atual |
| Performance/ranking | `src/components/App/Professores/TabPerformanceProfessores.tsx` | KPIs canonicos atuais + `calcularHealthScore` | produtivo | voltar a flag para V2 sem alterar dados |
| Card individual/performance | `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx` | KPIs canonicos atuais + `calcularHealthScore` | produtivo | voltar a flag para V2 |
| Carteira | `src/components/App/Professores/TabCarteiraProfessores.tsx` | KPIs canonicos atuais + `calcularHealthScore` | produtivo | voltar a flag para V2 |
| Configuracoes/sliders | `src/components/App/Professores/HealthScoreConfig.tsx` | `config_health_score_professor` | produtivo V2 | manter componente V2 e nao ativar config V3 |
| Relatorio da coordenacao | `src/components/App/Professores/ModalRelatorioCoordenacao.tsx` | `buscarKpisProfessoresCanonicos`; declaracao de fonte `get_kpis_professor_periodo_canonico_v3` | produtivo | voltar a flag para geracao V2 |
| Relatorio textual local | `src/lib/relatorioCoordenacaoInstantaneo.ts` | payload de KPIs entregue pelo modal | produtivo | manter normalizador V2 |
| Relatorio individual com IA | `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx` -> `gemini-relatorio-professor-individual` | payload montado pelo consumidor V2 | produtivo | manter payload V2 |
| Relatorio da coordenacao com IA | `src/components/App/Professores/ModalRelatorioCoordenacao.tsx` -> `gemini-relatorio-coordenacao` | payload montado com KPIs V2 | produtivo | manter payload V2 |
| Dashboard - bloco Professores | `src/components/App/Dashboard/DashboardPage.tsx` | `buscarKpisProfessoresCanonicos` | produtivo | voltar a flag para V2 |
| WhatsApp coordenacao | `ModalRelatorioCoordenacao.tsx` -> `relatorio-coordenacao-whatsapp` | texto ja gerado pelo modal | transporte, nao fonte | continuar recebendo texto V2 |

## Consumidores a confirmar antes do cutover

- Analytics de professores: confirmar a rota/componente efetivo no momento da Fase 7; nao foi encontrada chamada direta a `buscarKpisProfessoresCanonicos` no inventario desta fase.
- Fabio e LA Teacher: nao recebem o motor V3 nesta fase. Qualquer consumo futuro deve usar RPC escopada e autorizada, sem dados financeiros.
- Metas: a pagina registra metas de `media_alunos_turma` e `media_alunos_prof`, mas nao deve ser migrada implicitamente junto com o score.

## Contrato de nao regressao

1. `useHealthScore.ts`, `useHealthScoreConfig.ts` e `HealthScoreConfig.tsx` nao sao alterados durante staging e sombra.
2. `professoresKpisCanonicos.ts` permanece na RPC vigente.
3. Nenhuma tela produtiva pode mencionar tabelas `health_score_professor_v3_*` ou RPCs `*_v3_sombra` antes do cutover individual.
4. Relatorios gerencial, administrativo e comercial ficam fora deste desenvolvimento.
5. Rollback de consumidor e troca de feature flag/fonte; nunca exige apagar staging, periodos ou snapshots V3.

## Evidencia automatizada

O arquivo `tests/healthScoreProfessorV3Contrato.test.mjs` verifica:

- ausencia de referencias V3 nos consumidores produtivos;
- permanencia de `calcularHealthScore` como motor V2;
- permanencia de `config_health_score_professor` como configuracao V2;
- permanencia de `get_kpis_professor_periodo_canonico_v3` como fonte atual de KPI.
