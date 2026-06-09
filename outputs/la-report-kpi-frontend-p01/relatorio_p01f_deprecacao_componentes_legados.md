# P0.1F - Componentes Legados e Candidatos a Deprecacao

Data: 2026-06-08

## 1. Resumo

Este pacote separa o que ja pode sair do caminho do frontend ativo do que ainda precisa frente propria.

Nao houve migration, deploy, DDL ou escrita em banco.

## 2. TabDashboard legado

Arquivo:

- `src/components/GestaoMensal/TabDashboard.tsx`

Evidencia:

- `GestaoMensalPage.tsx` renderiza somente:
  - `TabGestao`;
  - `TabComercialNew`;
  - `TabProfessoresNew`.
- `TabDashboard.tsx` nao e importado diretamente por nenhuma rota atual.
- O unico vinculo ativo era o reexport em `src/components/GestaoMensal/index.ts`.

Acao aplicada:

- Removida a exportacao de `TabDashboard` do barrel `src/components/GestaoMensal/index.ts`.
- Adicionado comentario de legado no arquivo.
- O arquivo nao foi deletado ainda.

Impacto:

- Reduz risco de reutilizacao acidental da aba que ainda consulta `vw_dashboard_unidade`.
- Nao altera a UI atual.

## 3. vw_dashboard_unidade

Status:

- Ainda aparece no codigo apenas dentro de `TabDashboard.tsx`, agora legado e nao exportado.

Decisao:

- Nao deprecar a view ainda.
- Proxima etapa segura: confirmar dependencias no banco/RPC/n8n/relatorios antes de qualquer DROP.

## 4. Fideliza+

Arquivo:

- `src/hooks/useFidelizaPrograma.ts`

Fonte atual:

- RPC `get_programa_fideliza_dados`.
- RPCs/tabelas proprias de penalidades, experiencias e config.

Decisao:

- Fora do P0.1.
- Precisa P0.2 com `pg_get_functiondef` da RPC e regra trimestral propria.
- Nao misturar com fonte canonica mensal de alunos sem desenho de competencia trimestral.

## 5. Professores / Carteira

Arquivo:

- `src/components/App/Professores/TabCarteiraProfessores.tsx`

Fonte atual:

- RPC `get_carteira_professores`;
- `vw_kpis_professor_mensal`;
- query operacional direta em `alunos` para expandir carteira.

Decisao:

- Manter como carteira operacional ao vivo.
- Nao tratar como KPI historico fechado.
- P0.3 deve auditar a RPC e ajustar copy/labels para evitar comparacao com Dashboard/Analytics.

## 6. Estado de deprecacao

Ainda nao aprovar DROP/remoção de objetos.

| Objeto | Pode remover agora? | Motivo |
|---|---|---|
| `vw_dashboard_unidade` | Nao | Precisa varredura de dependencias fora do frontend ativo |
| `vw_kpis_retencao_mensal` | Nao | Retencao aberta e relatorio ainda usam |
| `get_programa_fideliza_dados` | Nao | Fonte principal do Fideliza+ |
| `get_carteira_professores` | Nao | Fonte principal da carteira de professores |
| `vw_kpis_professor_mensal` | Nao | Fonte de score/carteira |

## 7. Proximo passo

1. Deploy controlado do relatorio administrativo corrigido.
2. Testar relatorio real de Campo Grande/Recreio.
3. P0.2 Fideliza+.
4. P0.3 Professores/Carteira.
5. Depois disso, varredura de dependencias no banco para plano de deprecacao.
