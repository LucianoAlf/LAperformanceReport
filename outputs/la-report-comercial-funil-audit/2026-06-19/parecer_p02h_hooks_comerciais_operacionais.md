# P02H - Diagnostico dos hooks comerciais operacionais

Data: 2026-06-19
Branch: `p02h-integracao-operacional-v2`

## Escopo

Este parecer mapeia somente:

- `src/hooks/useComercialData.ts`
- `src/hooks/useDadosHistoricos.ts`
- `src/hooks/useKPIsComercial.ts`

Nao houve codigo alterado neste bloco. Nao houve banco, Supabase, SQL, PR, push, merge ou deploy.

## Consumidores encontrados

### `useComercialData`

Consumidores diretos:

- `src/components/Comercial/ComercialAlertas.tsx`
- `src/components/Comercial/ComercialCursos.tsx`
- `src/components/Comercial/ComercialFinanceiro.tsx`
- `src/components/Comercial/ComercialFunil.tsx`
- `src/components/Comercial/ComercialMetas.tsx`
- `src/components/Comercial/ComercialRanking.tsx`
- `src/components/Comercial/ComercialVisaoGeral.tsx`

Uso principal atual:

- Apresentacao comercial 2025 e blocos legados da rota `/apresentacao/comercial`.
- Nao e o caminho operacional principal ja migrado em P02H para `TabComercialNew` Leads.

Fonte atual:

- `dados_comerciais` em `useComercialData.ts`.
- `metas_comerciais` para metas.

### `useDadosHistoricos`

Consumidor direto:

- `src/components/App/Metas/Simulador/SimuladorPage.tsx`

Uso principal atual:

- Simulador de metas.
- Mistura dados atuais de alunos canonicos com medias historicas de gestao/comercial.

Fontes atuais:

- `fetchKPIsAlunosCanonicos(...)`
- `dados_mensais`
- `movimentacoes_admin`
- `vw_kpis_comercial_historico`
- `unidades`
- `vw_unidade_anual`

### `useKPIsComercial`

Consumidores diretos encontrados:

- Exportado em `src/hooks/index.ts`.
- Nao foi encontrado consumo direto por componente atual via `git grep`.

Fontes atuais:

- Caminho principal: `vw_kpis_comercial_mensal`.
- Fallback: `leads` e `alunos` direto.

Observacao critica:

- A consulta principal em `vw_kpis_comercial_mensal` nao filtra explicitamente `ano`/`mes`; o hook apenas seta `currentYear/currentMonth` no objeto consolidado depois.
- Essa view ja foi classificada anteriormente como presa/arriscada por `CURRENT_DATE`.
- Mesmo sem consumidor direto forte hoje, o hook e perigoso se for reutilizado.

## Classificacao por hook e campo

Legenda:

- A: pode migrar agora para RPC v2 sem semantica nova.
- B: deve continuar legado com label/flag, ou ficar como esta ate haver corte proprio.
- C: bloqueado por regra canonica.

### `useComercialData.ts`

| Campo/saida | Fonte atual | Categoria | Motivo |
|---|---|---:|---|
| `dados` bruto | `dados_comerciais` | B | Objeto bruto e legado. Migrar inteiro quebraria consumidores que ainda esperam campos antigos. |
| `dadosMensais.leads` | `dados_comerciais.total_leads` | A | Pode vir de `seriesMensais.leadsEntrantes` da RPC v2. |
| `dadosPorUnidade.totalLeads` | `dados_comerciais.total_leads` agrupado | A | Pode vir de `por_unidade.leads_entrantes` da RPC v2. |
| `kpis.totalLeads` | `dados_comerciais.total_leads` | A | Equivalente a `kpis.leads_entrantes` na v2. |
| `aulasExperimentais` / `dadosMensais.experimentais` / `dadosPorUnidade.aulasExperimentais` | `dados_comerciais.aulas_experimentais` | C | Experimental realizada ainda depende de presenca individual e status operacional separado. |
| `novasMatriculas` / `matriculasLAMK` / `matriculasEMLA` | `dados_comerciais.novas_matriculas_*` | C | Matricula comercial por unidade e vinculo lead-aluno ainda nao canonizados. |
| `taxaLeadExp` | calculada de leads e experimentais | C | Denominador pode ser v2, mas numerador experimental segue bloqueado. |
| `taxaExpMat` | calculada de experimentais e matriculas | C | Explicitamente bloqueada para dashboard/operacional. |
| `taxaConversaoTotal` | calculada de leads e matriculas | C | Conversao lead->aluno e matricula comercial ainda precisam regra canonica. |
| `ticketMedioParcelas` | `dados_comerciais.ticket_medio_parcelas` | B/C | Financeiro/comercial antigo; nao coberto pela RPC v2 atual. |
| `ticketMedioPassaporte` | `dados_comerciais.ticket_medio_passaporte` | B/C | Passaporte tem regra pendente e preenchimento desigual. |
| `faturamentoPassaporte` | `dados_comerciais.faturamento_passaporte` | B/C | Depende da regra de passaporte/matricula comercial. |
| `metas` | `metas_comerciais` | B | Nao e snapshot comercial contaminado, mas tambem nao e alvo da v2. |
| `useUnidadeData` | `dados_comerciais` por unidade | B/C | Legado bruto, usado como escape de unidade; nao migrar inteiro sem consumidor especifico. |

Risco de migração:

- Migrar o hook inteiro: alto.
- Migrar somente campos A mantendo assinatura: medio, porque consumidores ainda misturam KPI v2 com cards legados.
- Melhor abordagem: nao mexer nele globalmente agora; criar cortes por consumidor ou adaptador dedicado.

### `useDadosHistoricos.ts`

| Campo/saida | Fonte atual | Categoria | Motivo |
|---|---|---:|---|
| `dadosAtuais.alunosAtivos` | `fetchKPIsAlunosCanonicos` | B | Fora do escopo comercial; ja segue frente alunos. |
| `dadosAtuais.alunosPagantes` | `fetchKPIsAlunosCanonicos` | B | Fora do escopo comercial. |
| `dadosAtuais.ticketMedio` | `fetchKPIsAlunosCanonicos` | B | Fora do escopo comercial. |
| `dadosAtuais.churnRate` | `fetchKPIsAlunosCanonicos` | B | Retencao/alunos. |
| `dadosAtuais.taxaRenovacao` | `dados_mensais` ou `movimentacoes_admin` | B | Retencao/renovacao, fora da v2 comercial. |
| `dadosHistoricos.mediaEvasoes` | `dados_mensais` | B | Gestao/retencao, nao comercial. |
| `dadosHistoricos.mediaLeads` | `vw_kpis_comercial_historico.total_leads` | A | Pode ser recalculado por RPC v2 para os 12 meses do periodo historico. |
| `dadosHistoricos.mediaExperimentais` | `vw_kpis_comercial_historico.experimentais_realizadas` | C | Experimental canonica ainda bloqueada. |
| `dadosHistoricos.mediaMatriculas` | `vw_kpis_comercial_historico.novas_matriculas_total` ou `dados_mensais.novas_matriculas` | C | Matricula comercial/academica precisa regra explicita no simulador. |
| `taxaConversaoLeadExp` | `vw_kpis_comercial_historico.taxa_lead_exp` | C | Depende de experimental. |
| `taxaConversaoExpMat` | `vw_kpis_comercial_historico.taxa_exp_mat` | C | Explicitamente bloqueada. |
| `taxaConversaoTotal` | calculada das duas taxas | C | Herda bloqueios. |
| `churnHistorico` | `vw_unidade_anual.churn_medio` | B | Retencao/gestao, fora do corte comercial v2. |

Risco de migração:

- Migrar somente `mediaLeads`: medio-baixo. Impacta simulador/metas, mas e uma metrica A.
- Migrar taxas/matriculas/experimentais: alto e bloqueado.
- Risco operacional: o simulador pode mudar metas sugeridas se a media de leads antiga estava inflada por snapshot. Isso e desejado, mas precisa label/observacao.

### `useKPIsComercial.ts`

| Campo/saida | Fonte atual | Categoria | Motivo |
|---|---|---:|---|
| `data.total_leads` | `vw_kpis_comercial_mensal` ou fallback `leads.length` | A | Deve vir de `kpis.leads_entrantes` da RPC v2. |
| `dataByUnidade[].total_leads` | `vw_kpis_comercial_mensal` | A | Pode vir de `por_unidade.leads_entrantes`. |
| `leadsPorCanal` / `leads_por_canal` | view ou fallback `leads.canal_origem` | A | Deve vir de `origem_canal` da RPC v2. |
| `experimentais_agendadas` | view ou status em `leads` | C | Regras de agendada/realizada separadas; nao migrar neste pacote sem definicao. |
| `experimentais_realizadas` | view ou status em `leads` | C | Presenca individual confirmada ainda bloqueada. |
| `faltaram` / `taxa_showup` | view/status | C | Depende da regra de experimental/no-show. |
| `novas_matriculas` | view ou `alunos.data_matricula` | C | Matricula comercial, academica e conversao ainda separadas. |
| `taxa_conversao_lead_exp` | view/status | C | Depende de experimental. |
| `taxa_conversao_exp_mat` | view/status/alunos | C | Explicitamente bloqueada. |
| `taxa_conversao_geral` | view ou `alunos/leads` | C | Conversao lead->aluno ainda bloqueada. |
| `faturamento_novos` | view ou `alunos.valor_parcela` | B/C | Financeiro/passaporte/matricula ainda nao coberto pela v2. |
| `ticket_medio_novos` | view ou `alunos.valor_parcela` | B/C | Depende de regra financeira e matricula nova. |
| `matriculas_por_professor` | view ou `alunos.professores` | C | Professor/experimental/conversao bloqueado. |
| `funnelData` | composto por leads, experimentais e matriculas | C | Nao pode ser publicado como funil canonico ainda. |

Risco de migração:

- Por estar sem consumidor direto encontrado, migrar agora traz pouco ganho visual.
- Como API publica do hook mistura campos A e C, migrar parcialmente pode dar falsa sensacao de hook canonico.
- Recomendacao: manter como legado/perigoso no mapa e nao usar em novos consumidores.

## Fontes por categoria

### Legado/snapshot ainda presente

- `dados_comerciais`
  - `useComercialData`
  - comparativos em `TabComercialNew`
- `origem_leads`
  - historico de experimentais/matriculas por canal em `TabComercialNew`
  - nao mais usado para Leads por Canal nos blocos ja migrados
- `vw_kpis_comercial_historico`
  - `useDadosHistoricos`
  - historico antigo de `TabComercialNew`
- `vw_kpis_comercial_mensal`
  - `useKPIsComercial`

### Dado vivo direto

- `leads`
  - fallback de `useKPIsComercial`
  - campos legados/pendentes de `TabComercialNew`
- `alunos`
  - fallback de `useKPIsComercial`
  - matriculas legadas/pendentes em `TabComercialNew`

### Fonte v2 autorizada

- `get_kpis_comercial_canonicos_v2`
  - `useComercialOperacionalResumoV2`
  - `TabComercialNew` para Leads Entrantes, Leads por Canal e Serie Mensal
  - `DashboardPage` para card Leads
  - apresentacao comercial em blocos ja migrados

## Risco por area

| Area | Risco se migrar hook inteiro | Observacao |
|---|---:|---|
| Dashboard | Alto | Ja tem corte seguro para card Leads. Nao usar hooks mistos para demais cards. |
| Gestao Mensal Comercial | Medio/alto | Leads ja migrado; experimentais/matriculas continuam bloqueados. |
| Simulador/Metas | Medio | `mediaLeads` pode migrar, mas muda planejamento; precisa aviso de fonte v2. |
| Apresentacao Comercial 2025 | Medio/alto | `useComercialData` alimenta varias telas com copy e graficos antigos. Migrar globalmente pode quebrar narrativa. |
| Relatorios automaticos | Alto | Fora do escopo autorizado; nao tocar ainda. |

## Recomendacao do proximo commit incremental

Nao migrar `useComercialData` inteiro e nao migrar `useKPIsComercial` inteiro.

Proximo commit recomendado:

`feat(comercial): migra media de leads historica do simulador para v2`

Escopo sugerido:

- Alterar somente `useDadosHistoricos.ts`.
- Trocar apenas `dadosHistoricos.mediaLeads` para usar RPC v2 nos 12 meses historicos equivalentes.
- Manter `mediaExperimentais`, `mediaMatriculas`, `taxaConversaoLeadExp`, `taxaConversaoExpMat` e `taxaConversaoTotal` como legado/bloqueado.
- Adicionar label/flag no simulador se necessario: "Media de leads pela fonte canonica v2; taxas comerciais seguem historico legado."

Justificativa:

- `mediaLeads` e campo A.
- O consumidor e unico e conhecido: `SimuladorPage`.
- O corte e pequeno e nao mexe em dashboard, relatorios, professores, experimentais ou matriculas.
- Reduz dependencia de `vw_kpis_comercial_historico` sem fingir que o funil inteiro ficou canonico.

Alternativa segura se quisermos evitar impacto no simulador agora:

- Criar apenas uma anotacao/deprecacao no `useKPIsComercial` e impedir novos usos, mas isso nao melhora dado operacional.

## Bloqueios mantidos

- Experimentais realizadas.
- Taxa experimental -> matricula.
- Matricula comercial por unidade.
- Conversao lead -> aluno.
- Professores/experimental.
- Relatorios enviados automaticamente.
- Qualquer SQL/banco/Supabase.
