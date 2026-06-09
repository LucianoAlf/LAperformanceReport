# P0.1I - Ecossistema restante de KPIs, graficos e relatorios

Data: 2026-06-09

## 1. Resumo

O nucleo de KPIs executivos de alunos ja esta no caminho canonico nas telas principais:

- Dashboard
- Analytics / Gestao
- Administrativo / Lancamentos
- Pagina Alunos

O pacote atual avancou sobre os pontos que ainda vazavam para fonte antiga:

- relatorio automatico WhatsApp local deixou de consultar `vw_kpis_gestao_mensal`/`vw_kpis_retencao_mensal` para KPIs de alunos/retencao;
- `useDadosHistoricos` deixou de buscar `vw_kpis_gestao_mensal` para dados atuais e `vw_kpis_retencao_mensal` para renovacao viva;
- Fideliza+ recebeu badge explicito de fonte trimestral propria, pendente de P0.2;
- Leticia Ferreira Vasconcelos / Recreio foi validada visualmente: o segundo curso aparece como `Bolsista integral`.

Nao houve migration, deploy de Edge Function, escrita em banco, backfill ou recalculo.

## 2. Matriz de status

| Area | Fonte atual apos patch | Status | Observacao |
|---|---|---|---|
| Dashboard - cards alunos | `useKPIsAlunosCanonicos` | OK | Mes fechado usa `dados_mensais`; mes atual usa fonte viva canonica. |
| Dashboard - Evolucao de Alunos | `dados_mensais` + mes atual canonico | OK P0.1 | Historico depende de snapshots existentes. |
| Dashboard - Comercial | `leads` / `vw_kpis_comercial_historico` | Fora P0.1 | Fica para frente Leads/Funil. |
| Analytics/Gestao - cards alunos | `useKPIsAlunosCanonicos` | OK | Validado em CG/Junho e CG/Maio fechado. |
| Analytics/Gestao - retencao atual | `movimentacoes_admin` + base canonica de pagantes | OK P0.1H | Nao usa `vw_kpis_retencao_mensal` no runtime atual. |
| Administrativo - resumo | `useKPIsAlunosCanonicos` + retencao operacional canonica | OK P0.1H | Corrigiu zeros e divergencias de alunos/matriculas. |
| Modal Relatorio manual | props do Administrativo + RPC `get_dados_relatorio_gerencial` | OK parcial | IA ja recebe wrapper canonico P0.1G. Texto diario manual herda resumo da tela. |
| Relatorio WhatsApp automatico local | RPC `get_kpis_alunos_canonicos` + `movimentacoes_admin` | Patch local pronto | Precisa deploy separado da Edge para afetar producao. |
| Plano Acao Retencao IA | RPC `get_dados_retencao_ia` | OK parcial | Wrapper P0.1G injeta canonico, mas legado interno ainda existe para rollback. |
| Fideliza+ | RPC `get_programa_fideliza_dados` | P0.2 pendente | RPC propria trimestral, `SECURITY DEFINER` sem `search_path`, mistura `movimentacoes_admin`, `dados_mensais`, `renovacoes` e fallback vivo. |
| Professores / Carteira | RPC `get_carteira_professores` + `vw_kpis_professor_mensal` | Operacional, nao historico | Deve continuar como carteira operacional ao vivo. Nao deprecar agora. |
| Abas legadas GestaoMensal (`TabDashboard`) | `vw_dashboard_unidade` | Candidata a remocao futura | Arquivo nao aparece importado no frontend atual, mas ainda deve ser removido em pacote proprio. |

## 3. Dependencias restantes encontradas

Runtime `src`/Edge:

- `src/hooks/useFidelizaPrograma.ts`
  - usa `get_programa_fideliza_dados`;
  - nao esta no canonico P0.1.
- `src/components/App/Professores/TabCarteiraProfessores.tsx`
  - usa `get_carteira_professores`;
  - usa `vw_kpis_professor_mensal` para health score/performance.
- `src/components/GestaoMensal/TabDashboard.tsx`
  - usa `vw_dashboard_unidade`;
  - componente legado nao importado pela tela atual.

Migrations antigas ainda citam views/RPCs legadas. Isso nao e runtime, mas deve ser considerado na auditoria de deprecacao.

## 4. O que foi alterado neste pacote

- `supabase/functions/relatorio-admin-whatsapp/index.ts`
  - KPIs de alunos/matriculas do relatorio automatico agora chamam `get_kpis_alunos_canonicos`;
  - retencao do relatorio automatico deixou de combinar view com `Math.max`;
  - renovacoes/nao renovacoes usam `movimentacoes_admin` diretamente.
- `src/hooks/useDadosHistoricos.ts`
  - dados atuais usam `fetchKPIsAlunosCanonicos`;
  - historico de gestao usa `dados_mensais`;
  - taxa de renovacao viva usa `movimentacoes_admin`, nao `vw_kpis_retencao_mensal`.
- `src/components/App/Administrativo/TabProgramaFideliza.tsx`
  - badge explicito de fonte trimestral propria / P0.2 pendente.
- `src/components/App/Alunos/AlunosPage.tsx`
  - comentario ajustado para nao citar `vw_kpis_gestao_mensal` como regua.

## 5. Pendencias reais antes de dizer "100%"

1. Deploy da Edge Function `relatorio-admin-whatsapp`.
   - O patch local nao altera o automatico em producao ate deploy aprovado.
2. P0.2 Fideliza+.
   - Recriar/ajustar `get_programa_fideliza_dados` com `SET search_path = public, pg_temp`.
   - Definir regra trimestral canonica para churn, inadimplencia, renovacao e reajuste.
   - Validar trimestre fechado vs aberto.
3. P0.3 Professores.
   - Separar carteira operacional de KPI executivo/historico.
   - Auditar `get_carteira_professores`, `get_kpis_professor_periodo` e `vw_kpis_professor_mensal`.
4. Deprecacao.
   - Nao remover `vw_kpis_gestao_mensal`, `vw_dashboard_unidade`, `vw_kpis_retencao_mensal` ou RPCs antigas ate zerar referencias runtime e dependencias SQL.

## 6. Regra para deprecar

Um objeto so deve ser deprecado/removido quando:

1. zero referencia no frontend/Edge;
2. zero dependencia em RPC/view/function;
3. zero uso em cron/n8n/relatorio;
4. substituto canonico documentado;
5. rollback claro;
6. pelo menos um ciclo de validacao visual e SELECT-only passou.
