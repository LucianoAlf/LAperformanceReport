# P0.1 - Status de Validacao e Plano de Deprecacao de Fontes KPI

Data: 2026-06-08

## 1. O que foi feito

- Criada fonte canonica viva para KPIs executivos de alunos em `src/lib/kpisAlunosVivosCanonicos.ts`.
- Criado/ajustado contrato de consumo em `src/hooks/useKPIsAlunosCanonicos.ts`.
- Dashboard, Analytics/Gestao, Administrativo e Pagina Alunos passaram a consumir a fonte canonica para KPIs executivos de alunos.
- Mes fechado/historico usa `dados_mensais`.
- Mes atual aberto usa calculo vivo canonico direto de `alunos`/`movimentacoes_admin`, sem depender cegamente de `vw_kpis_gestao_mensal` para alunos ativos.
- Corrigido bug do Administrativo com FK ambigua em `movimentacoes_admin -> unidades`.
- Corrigido crash visual em Analytics/Gestao por uso de variaveis de competencia antes da inicializacao.
- Instalado Playwright e validado visualmente via Chrome logado.

## 2. Validado visualmente

Ambiente validado: app local `http://127.0.0.1:4176`, Chrome logado.

### Campo Grande / Junho 2026 aberto

| Tela | Status |
|---|---|
| Analytics / Gestao | OK: ativos 479, pagantes 449, Kids 194, School 285, banda 39, novas 6, evasoes 5 |
| Dashboard | OK: pagantes 449, matriculas mes 6, evasoes 5, ticket R$ 389 |
| Pagina Alunos | OK: matriculas 543, ativos 479, pagantes 449, segundo curso 27, banda 39, ticket R$ 389 |
| Administrativo | OK: ativos 479, pagantes 449, matriculas 543, bolsistas 30, novos 6 |

### Campo Grande / Maio 2026 fechado

| Tela | Status |
|---|---|
| Analytics / Gestao | OK: badge Fechado, ativos 496, pagantes 470, Kids 202, School 294, evasoes 13 |

### Barra e Recreio / Junho 2026 aberto

| Unidade | Status |
|---|---|
| Barra | OK: Kids 147 + School 81 = ativos 228 |
| Recreio | OK: Kids 173 + School 154 = ativos 327 |

## 3. O que esta validado com seguranca

- Cards executivos de alunos nas quatro telas principais:
  - Dashboard;
  - Analytics/Gestao;
  - Administrativo;
  - Pagina Alunos.
- Separacao de regra:
  - `alunos_ativos` = pessoas unicas;
  - `matriculas_ativas` = vinculos;
  - Kids/School usa a mesma base de alunos ativos;
  - mes fechado nao recalcula silenciosamente pela tabela viva.
- Build passou.
- Smoke test em aba limpa do Chrome passou sem erro novo de console.

## 4. O que ainda NAO esta 100% validado

Ainda nao da para afirmar que todos os graficos, relatorios, modais e RPCs bebem da mesma fonte.

Principais pontos pendentes:

| Area | Evidencia | Risco |
|---|---|---|
| Dashboard - camada legada | `DashboardPage.tsx` ainda consulta `vw_dashboard_unidade` e `vw_kpis_gestao_mensal` em trechos auxiliares | Pode sobrar grafico/alerta/resumo usando fonte antiga |
| Analytics/Gestao - financeiro/retencao | `TabGestao.tsx` ainda usa `vw_kpis_retencao_mensal` e `vw_kpis_gestao_mensal` para dados atuais de grafico financeiro | Grafico pode divergir do card canonico |
| Analytics/Gestao - fallback morto | Existe bloco `if (false)` com fallback antigo calculando de `alunos` | Baixo risco runtime, mas divida tecnica |
| `useDadosHistoricos` | Usa `vw_kpis_gestao_mensal`, `vw_kpis_comercial_historico`, `vw_unidade_anual` | Relatorios/graficos historicos podem nao obedecer `dados_mensais` |
| `TabDashboard` | Usa `vw_dashboard_unidade` e `dados_mensais` | Aba legada precisa decisao: migrar ou deprecar |
| Retencao | `useKPIsRetencao` e `TabGestao` ainda leem `vw_kpis_retencao_mensal` e `movimentacoes_admin` | Precisa alinhar regra de churn/aviso previo/nao renovacao |
| Administrativo - relatorios | `ModalRelatorio`, Alertas e Lancamentos usam `movimentacoes_admin`/RPCs proprias | Operacional ok, mas precisa mapa de relatorio |
| Professores / Carteira | Usa `get_carteira_professores` e queries diretas em `alunos` | Deve ficar como carteira operacional, nao KPI historico |
| Fideliza+ | Usa RPC `get_programa_fideliza_dados` | Ainda nao auditado; nao pode afirmar que bate com fonte canonica |

## 5. Candidatos a deprecacao: ainda NAO aprovar

Nenhum destes objetos deve ser removido agora.

| Objeto | Status atual | Motivo para nao deprecar ainda |
|---|---|---|
| `vw_kpis_gestao_mensal` | Candidata futura | Ainda referenciada por Dashboard, TabGestao e useDadosHistoricos |
| `vw_dashboard_unidade` | Candidata futura | Ainda referenciada por Dashboard e TabDashboard |
| `vw_kpis_retencao_mensal` | Candidata futura | Ainda referenciada por Administrativo, TabGestao e useKPIsRetencao |
| `vw_kpis_comercial_mensal` | Fora do P0.1 | Comercial/Leads precisa frente propria |
| `vw_kpis_comercial_historico` | Fora do P0.1 | Historico comercial precisa frente propria |
| RPC `get_programa_fideliza_dados` | Bloqueada | Precisa auditoria de corpo SQL antes de qualquer mudanca |
| RPC `get_carteira_professores` | Bloqueada | Deve ser classificada como operacional/professor, nao historico |

## 6. Proximo pacote recomendado

### P0.1C - Fechar graficos e relatorios de alunos

Objetivo: garantir que cards e graficos de alunos usem a mesma fonte.

1. Dashboard:
   - remover dependencia de `vw_kpis_gestao_mensal` para qualquer KPI executivo de aluno;
   - revisar grafico "Evolucao de Alunos";
   - revisar "Resumo por Unidade".
2. Analytics/Gestao:
   - revisar grafico "Evolucao Mensal";
   - revisar graficos financeiros que substituem mes atual via `vw_kpis_gestao_mensal`;
   - substituir mes atual por fonte canonica quando o KPI for de alunos/financeiro derivado de alunos.
3. Administrativo:
   - auditar `ModalRelatorio` e relatorio WhatsApp;
   - classificar o que e operacional (`movimentacoes_admin`) versus KPI executivo.
4. Gerar matriz por grafico:
   - tela;
   - componente;
   - fonte atual;
   - fonte canonica;
   - precisa patch.

### P0.2 - Fideliza+

Objetivo: auditar `get_programa_fideliza_dados` com `pg_get_functiondef`, mapear fontes internas e decidir se trimestre fechado deve usar snapshot.

### P0.3 - Professores / Carteira

Objetivo: manter carteira como operacional ao vivo, mas impedir que seja confundida com KPI historico fechado.

## 7. Regra para deprecar banco

So aprovar deprecacao quando todos os itens abaixo forem verdadeiros:

1. Zero referencia no frontend.
2. Zero referencia em RPC/function/view dependente.
3. Zero dependencia em relatorio, n8n, cron ou automacao.
4. Existe substituto canonico documentado.
5. Existe plano de rollback.
6. O objeto foi marcado como deprecated antes de ser removido.

## 8. Decisao atual

- Status dos cards executivos de alunos: validado nas telas principais.
- Status de todos os graficos/relatorios/RPCs: ainda nao validado.
- Proxima acao segura: P0.1C, auditar e corrigir graficos/relatorios de alunos antes de qualquer deprecacao de view/tabela.

## 9. Atualizacao 2026-06-09 - Fideliza+, Professores, IA/Gemini e graficos financeiros

### Regras financeiras canonicas confirmadas

- `banda/projeto` nao entra no ticket executivo.
- `bolsista_integral` e `bolsista_parcial` nao entram no ticket executivo.
- Ticket Medio executivo = MRR recorrente elegivel / pessoas pagantes.
- Segundo curso pago entra no MRR, mas nao duplica pessoa pagante.
- Reajuste Medio canonico exclui:
  - banda/projeto/coral;
  - bolsistas;
  - renovacoes zeradas;
  - reducao de valor;
  - renovacao sem confirmacao operacional/agente.

### Validado em banco

Objeto validado: `public.get_kpis_alunos_financeiro_vivo_canonico`.

Evidencia:

- Usa `tipos_matricula.entra_ticket_medio = true` para MRR/ticket.
- Exclui `BOLSISTA_INT`, `BOLSISTA_PARC` e `BANDA` do reajuste.
- Exclui curso/projeto/banda/coral do reajuste por `is_projeto_banda` e nome do curso.
- Exclui valores zerados e reducoes de reajuste.

Campo consolidado Junho/2026 retornado por `public.get_kpis_alunos_canonicos(null, 2026, 6)`:

| KPI | Valor |
|---|---:|
| Alunos ativos | 1035 |
| Alunos pagantes | 990 |
| Matriculas ativas | 1211 |
| MRR | R$ 414.103,80 |
| Ticket medio | R$ 418,29 |
| Inadimplencia | 1,21% |
| Inadimplencia valor | R$ 4.418,60 |
| Reajuste medio | 11,53% |
| Reajustes validos | 24 |

### Fideliza+

Status: parcialmente saneado no frontend.

O que mudou:

- `useFidelizaPrograma` continua chamando `get_programa_fideliza_dados` para configuracao, penalidades e estrutura do programa.
- Antes de pontuar/rankear, aplica overlay canonico em `src/lib/fidelizaCanonico.ts`.
- O overlay recalcula por unidade/trimestre:
  - churn;
  - inadimplencia;
  - taxa de renovacao;
  - reajuste medio.

Validacao visual local:

| Unidade | Churn | Inadimplencia | Renovacao | Reajuste |
|---|---:|---:|---:|---:|
| Campo Grande | 2,2% | 0,6% | 76% | 12,1% |
| Barra | 3,6% | 0,0% | 81% | 9,8% |
| Recreio | 3,9% | 0,4% | 56% | 10,4% |

Risco restante:

- A RPC `get_programa_fideliza_dados` ainda possui logica legada interna baseada em `renovacoes`.
- Nao deprecar `renovacoes` nem a RPC antes de migrar a origem do programa ou transformar esse overlay em funcao/RPC canonica.

### Graficos financeiros da Analytics

Status: ajustado para ticket consolidado ponderado.

O que mudou:

- `TabGestao.tsx` passou a buscar `alunos_pagantes` junto com `ticket_medio` e `faturamento_estimado`.
- Grafico "Evolucao do Ticket Medio" deixou de usar media simples por unidade.
- Agora calcula, quando possivel:
  - `SUM(faturamento_estimado) / SUM(alunos_pagantes)`.
- Para mes atual aberto, o ponto atual vem do KPI canonico vivo.

Validacao visual local:

- Analytics / Financeiro / Consolidado / Jun/2026:
  - Ticket Medio: R$ 418.
  - MRR: R$ 414.104.
  - Inadimplencia: 1,0%.
  - Reajuste Medio: 11,5%.
  - Grafico "Evolucao do Ticket Medio" mostra atual R$ 418.

### Relatorios IA/Gemini

Status: payload saneado para KPIs de alunos, sem disparar geracao de IA nesta validacao.

Evidencia em codigo:

- `ModalRelatorio.tsx` chama `get_dados_relatorio_gerencial` antes de `gemini-relatorio-gerencial`.
- `PlanoAcaoRetencao.tsx` chama `get_dados_retencao_ia` antes de `gemini-insights-retencao`.

Evidencia em banco:

- `get_dados_relatorio_gerencial` chama `get_dados_relatorio_gerencial_legacy_p01g`, mas sobrescreve:
  - `kpis_gestao`;
  - `kpis_alunos_canonicos`;
  - `dados_mes_atual`;
  - matriculas/banda/2o curso/bolsistas.
- `get_dados_retencao_ia` chama `get_dados_retencao_ia_legacy_p01g`, mas sobrescreve:
  - `kpis_gestao`;
  - `kpis_alunos_canonicos`.

Risco restante:

- O texto gerado pela IA pode ainda interpretar campos legados se o prompt usar partes antigas do JSON.
- Proxima validacao deve gerar um relatorio controlado e conferir se o texto cita os campos canonicos.

### Professores / Carteira

Status: classificado como operacional ao vivo, nao KPI executivo historico.

Evidencia:

- `TabCarteiraProfessores.tsx` usa `get_carteira_professores`.
- A tela mostra badge: "Carteira operacional ao vivo - nao compara com competencia fechada".
- A RPC conta linhas operacionais da carteira por professor, nao snapshot historico.

Risco restante:

- `get_carteira_professores` ainda e fonte operacional propria.
- Nao deprecar antes de decidir se a carteira continua linha operacional ou se ganha uma funcao canonica propria.

## 10. Status atual para deprecacao

Ainda nao aprovar limpeza de banco.

Pode ser candidato futuro, mas nao agora:

| Objeto | Status atualizado | Bloqueio |
|---|---|---|
| `renovacoes` | Legado ainda referenciado por backend/RPC | `get_programa_fideliza_dados` ainda usa internamente |
| `get_programa_fideliza_dados` | Parcialmente saneada no frontend por overlay | Migrar logica para canonico no banco antes de deprecar |
| `get_carteira_professores` | Operacional valida, nao historica | Decidir contrato canonico de carteira |
| `vw_dashboard_unidade` | Residual em aba legada | Confirmar que `TabDashboard` nao e rota ativa antes de remover |
| `vw_kpis_comercial_mensal` | Fora do P0.1 | Depende da frente Comercial/Leads |
| `vw_kpis_comercial_historico` | Fora do P0.1 | Depende da frente Comercial/Leads |

Proximo passo seguro:

1. Gerar relatorio IA/Gemini controlado e conferir texto contra payload canonico.
2. Migrar `get_programa_fideliza_dados` no banco ou criar RPC canonica substituta.
3. Definir contrato canonico de Professores/Carteira.
4. So depois iniciar plano de deprecacao com zero referencias.
