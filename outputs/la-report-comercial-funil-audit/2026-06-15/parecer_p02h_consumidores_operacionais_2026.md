# P02.H - Inventario de consumidores comerciais operacionais 2026

Data: 2026-06-15
Escopo: auditoria de codigo e mapa de consumidores.
Seguranca: sem SQL, sem Supabase, sem alteracao de codigo, sem migration, sem backfill, sem commit, sem merge/deploy.

## Atualizacao 2026-06-19 - status pos PR #4 e PR #5

Status fechado em producao antes do pacote P02H:

- PR #4 mergeado em `main`: Sazonalidade da apresentacao comercial virou `leads-only`.
- PR #5 mergeado em `main`: card de Leads do Dashboard operacional passou a usar RPC v2.
- Vercel/main validado com sucesso apos os dois merges.
- Producao validada em `/apresentacao/comercial` para Sazonalidade:
  - grafico e heatmap exibem somente `Leads Entrantes`;
  - nao publica `Matriculas Comerciais por unidade`;
  - nota discreta mantida: "Matriculas comerciais por unidade aguardam regra canonica".
- Sem banco, sem SQL, sem Supabase, sem alteracao em `dados_comerciais`, `origem_leads` ou `dados_mensais`.

Mudanca de metodo aprovada pelo Alf:

- Nao abrir PR por card.
- Trabalhar em branch unica: `p02h-integracao-operacional-v2`.
- Fazer commits incrementais na branch.
- Abrir PR apenas no final do pacote.
- Seguir apenas com consumidores operacionais que podem trocar fonte legada por RPC v2 sem semantica nova.
- Travar somente se aparecer SQL produtivo, regra canonica ambigua ou risco de dado enganoso.

Escopo autorizado para o pacote P02H:

- `leads_entrantes` v2;
- origem/canal v2;
- series mensais de leads;
- consumidores operacionais que so precisam trocar fonte legada por RPC v2 sem alterar regra comercial.

Continuam bloqueados:

- experimentais realizadas;
- taxa experimental -> matricula;
- matricula comercial por unidade;
- conversao lead -> aluno;
- professores/experimental;
- relatorios enviados automaticamente.

Consequencia para este inventario:

- A recomendacao antiga de "P02.H.1 - Dashboard Leads v2" ja foi executada e validada via PR #5.
- O proximo pacote nao deve mexer em novos cards isolados do Dashboard.
- O alvo natural agora e consolidar um adaptador operacional v2 por competencia e entao migrar, em uma branch unica, os consumidores de Leads/Origem/Series que ainda bebem de `dados_comerciais`, `origem_leads` ou formulas locais.

## 1. Veredito executivo

O Comercial ainda nao esta canonico ponta a ponta em 2026.

O que esta validado como v2/canonico hoje:

- RPC `public.get_kpis_comercial_canonicos_v2(...)` criada em producao, validada e sem permissao `anon`.
- `/apresentacao/comercial`:
  - `ComercialOrigem` migrado para v2 no PR #2.
  - `ComercialInicio` migrado para v2 no PR #3.
  - `ComercialSazonalidade` esta no PR #4 draft, com ajuste conservador para nao publicar matriculas por unidade como canonicas.

O que ainda nao esta canonico:

- KPI cards comerciais atuais do Dashboard operacional.
- `/app/comercial` e `ComercialPage`.
- Relatorios diario/mensal gerados na tela comercial.
- Tab Comercial da Gestao Mensal.
- Tab Professores quando usa conversao/experimentais/matriculas.
- IA/Gemini comercial e relatorio gerencial no bloco comercial.
- Views/RPCs antigas que leem `vw_kpis_comercial_mensal`, `vw_kpis_comercial_historico`, `dados_comerciais` e `origem_leads`.

## 2. Matriz de consumidores

| Consumidor | Fonte atual | Tipo de fonte | Afeta 2026 atual? | Risco historico | Diagnostico |
|---|---|---|---:|---:|---|
| `src/components/App/Dashboard/DashboardPage.tsx` | Historico: `vw_kpis_comercial_historico`; mes atual: `leads` + `alunos`; calculos no frontend | misto: view antiga + dado vivo + formula local | Sim | Alto | KPI cards comerciais e funil ainda nao usam RPC v2. Mistura `visita_escola` com experimentais realizadas e calcula conversao no frontend. |
| `src/components/GestaoMensal/TabComercialNew.tsx` | Historico: `vw_kpis_comercial_historico`, `origem_leads`, `experimentais_professor_mensal`, `cursos_matriculados`; atual: `leads`, `alunos`, `dados_mensais` | misto: snapshot/view antiga + vivo + formula local | Sim | Alto | Tab operacional mais critica. Alimenta leads, experimentais, matriculas, funil, canais, cursos, professores e comparativos. |
| `src/components/App/Comercial/ComercialPage.tsx` | `leads`, `lead_experimentais`, `alunos`; fallback `dados_comerciais`; mutacoes em `leads`, `alunos`, `lead_experimentais` | operacional vivo + fallback legado + escrita | Sim | Muito alto | Tela operacional principal. Tem relatorios diario/mensal, cards, listas, filtros e acoes de escrita. Nao deve ser primeiro alvo de migracao. |
| `src/components/GestaoMensal/TabProfessoresNew.tsx` | `vw_kpis_professor_mensal/historico`, `experimentais_mensal_unidade`, `professores_performance`, `dados_comerciais`, `dados_mensais`, `alunos` | misto: views, CSV/snapshot, vivo | Sim | Alto | Conversao por professor depende de regra de experimental/presenca/matricula ainda nao canonica. |
| `src/hooks/useKPIsComercial.ts` | Tenta `vw_kpis_comercial_mensal`; fallback para `leads` + `alunos` | view antiga + fallback vivo | Potencial | Alto | Nao encontrei uso direto alem export, mas o hook e perigoso: consulta a view sem filtrar `ano/mes` na query e depois consolida tudo. |
| `src/hooks/useComercialData.ts` | `dados_comerciais` | snapshot legado contaminavel | Hoje nao, na apresentacao; se reutilizado sim | Alto | Base dos blocos legados da apresentacao. Calcula KPIs no frontend. |
| `src/hooks/useCursosData.ts` | `cursos_matriculados` | snapshot/historico/manual | Indireto | Medio/alto | Nao equivale a interesse de lead nem matricula canonica por curso. |
| `src/hooks/useProfessoresData.ts` | `professores_experimentais` | snapshot/historico/manual | Indireto | Alto | Ranking de professores na apresentacao usa tabela antiga; nao prova presenca individual/coversao. |
| `src/hooks/useDadosHistoricos.ts` | `vw_kpis_comercial_historico` | view historica antiga | Sim, em comparativos | Alto | Pode contaminar medias historicas/comparativos comerciais. |
| `src/components/Comercial/ComercialVisaoGeral.tsx` | `useComercialData` -> `dados_comerciais` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Ainda exibe "Aulas Experimentais", "Novas Matriculas" e taxas antigas. |
| `src/components/Comercial/ComercialFunil.tsx` | `useComercialData` -> `dados_comerciais` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Exibe taxa Exp -> Mat e taxa total antigas. Deve esperar regra de presenca/vinculo. |
| `src/components/Comercial/ComercialCursos.tsx` | `useCursosData` + `useComercialData` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Mistura `cursos_matriculados` com KPIs de `dados_comerciais`. Nao migrar sem decidir curso de interesse vs curso matriculado. |
| `src/components/Comercial/ComercialProfessores.tsx` | `useProfessoresData` -> `professores_experimentais` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Copy diz "professores que mais matricularam", mas fonte e experimentais. |
| `src/components/Comercial/ComercialFinanceiro.tsx` | `useComercialData` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Financeiro comercial de matriculas vem do snapshot antigo. |
| `src/components/Comercial/ComercialAlertas.tsx` | `useComercialData` + textos fixos | snapshot legado + copy hardcoded | Nao no operacional; apresentacao 2025 | Alto | Ainda tem frases fixas antigas e simulacoes em cima de KPIs legados. |
| `src/components/Comercial/ComercialRanking.tsx` | `useComercialData` | snapshot legado | Nao no operacional; apresentacao 2025 | Alto | Ranking usa taxas antigas e taxa Exp -> Mat. |
| `src/components/Comercial/ComercialOrigem.tsx` | `useOrigemData` -> RPC v2 | v2 canonico para leads/origem | Nao, hardcoded 2025 | Baixo | Migrado e validado. |
| `src/components/Comercial/ComercialInicio.tsx` | `useComercialResumoV2` -> RPC v2 | v2 canonico/diagnostico 2025 | Nao, hardcoded 2025 | Baixo/medio | Migrado. Matricula comercial consolidada segue diagnostica pela regra de unidade/vinculo. |
| `src/components/Comercial/ComercialSazonalidade.tsx` | `useComercialSeriesMensaisV2` -> RPC v2 | v2; PR #4 draft | Nao, hardcoded 2025 | Medio | Leads ok; matriculas por unidade ocultadas/diagnosticas por ambiguidade semantica. |
| `supabase/functions/gemini-insights-comercial/index.ts` | RPC `get_dados_comercial_ia` | RPC antiga | Sim | Alto | IA comercial bebe de `get_dados_comercial_ia`, que le `vw_kpis_comercial_mensal`. Ainda nao v2. |
| `supabase/functions/gemini-relatorio-gerencial/index.ts` | payload `kpis_comercial` de `get_dados_relatorio_gerencial` | RPC/view antiga | Sim | Alto | Relatorio gerencial usa bloco comercial antigo: leads, experimentais, matriculas e taxas. |
| `supabase/functions/relatorio-admin-whatsapp/index.ts` | RPC canonica de alunos | canonico para alunos/retencao | Parcial | Baixo para alunos; comercial fora | Relatorio admin diario ja foi estabilizado na frente Alunos. Nao resolve funil comercial. |
| `supabase/functions/sync-presenca-emusys/index.ts` | `lead_experimentais`, `leads`, aulas Emusys | integracao/sync | Sim | Alto | Atualiza status e presenca; risco ja conhecido de confirmacao operacional nao equivaler sempre a presenca individual. |
| `supabase/functions/processar-matricula-emusys/index.ts` | `leads`, `alunos`, match por Emusys lead/telefone/nome | integracao/sync | Sim | Alto | Vínculo lead -> aluno ainda tem baixa cobertura em auditorias; nao corrigir sem plano. |

## 3. Evidencias principais no codigo

- `useComercialData.ts:13` default 2025; `useComercialData.ts:29` e `useComercialData.ts:209` leem `dados_comerciais`.
- `useCursosData.ts:17` default 2025; `useCursosData.ts:29` le `cursos_matriculados`.
- `useProfessoresData.ts:17` default 2025; `useProfessoresData.ts:29` le `professores_experimentais`.
- `useOrigemData.ts:91`, `useComercialResumoV2.ts:138`, `useComercialSeriesMensaisV2.ts:136` chamam `get_kpis_comercial_canonicos_v2`.
- `DashboardPage.tsx:381-384` usa `vw_kpis_comercial_historico` para historico comercial.
- `DashboardPage.tsx:423-449` usa `leads` do mes atual e status para leads/experimentais/matriculas.
- `DashboardPage.tsx:451-453` calcula conversao no frontend com flag de lead, nao pela RPC v2.
- `TabComercialNew.tsx:129-163` usa `dados_comerciais` e `dados_mensais` para comparativos.
- `TabComercialNew.tsx:241-282` usa `vw_kpis_comercial_historico`, `origem_leads`, `experimentais_professor_mensal`, `cursos_matriculados`.
- `TabComercialNew.tsx:398-464` usa `leads`, `dados_mensais` e `alunos` para periodo atual.
- `TabComercialNew.tsx:515` mistura `experimental_realizada`, `compareceu` e `visita_escola` em contagem de exp/visitas por canal.
- `ComercialPage.tsx:189-205` tem `UNIDADE_MAP`/`resolverUnidade` local; ja havia alerta de mapeamento possivelmente invertido.
- `ComercialPage.tsx:279-282` define `ehMatriculaNova` no frontend.
- `ComercialPage.tsx:870-880` faz fallback para `dados_comerciais`.
- `ComercialPage.tsx:1103-1107` le `lead_experimentais` para detalhe, enquanto o resumo tambem usa `leads` e depois `alunos`.
- `get_dados_comercial_ia.sql:28-43` e `:69-74` leem `vw_kpis_comercial_mensal`.
- `get_dados_relatorio_gerencial_v2.sql:83-88` injeta `kpis_comercial` a partir de `vw_kpis_comercial_mensal`.
- `gemini-insights-comercial/index.ts` chama `get_dados_comercial_ia`.
- `gemini-relatorio-gerencial/index.ts:119-128` consome `kpis_comercial` e imprime funil comercial.

## 4. Fontes legadas/snapshots que ainda contaminam consumidores

### `dados_comerciais`

Usado por:

- `useComercialData`.
- `ComercialPage` como fallback historico.
- `TabComercialNew` comparativos.
- `TabProfessoresNew` comparativos de experimentais.

Risco: alto. A auditoria anterior confirmou triggers aditivos em `leads` que podem inflar/alterar snapshots apos updates.

### `origem_leads`

Usado por:

- `TabComercialNew` para origem historica.

Risco: alto. PR #2 removeu de `ComercialOrigem`, mas a Gestao Mensal ainda pode consumir.

### `vw_kpis_comercial_mensal`

Usado por:

- `useKPIsComercial`.
- `get_dados_comercial_ia`.
- `get_dados_relatorio_gerencial`.

Risco: alto. A view foi apontada anteriormente como presa/arriscada por `CURRENT_DATE`/mes atual e nao deve ser fonte canonica nova.

### `vw_kpis_comercial_historico`

Usado por:

- `DashboardPage` para periodo historico.
- `TabComercialNew` para periodo historico.
- `useDadosHistoricos`.

Risco: medio/alto. Pode ser util como legado, mas nao deve virar regra canonica sem reconciliar com a v2.

### `cursos_matriculados`, `professores_experimentais`, `experimentais_professor_mensal`, `experimentais_mensal_unidade`

Usados em apresentacao e Gestao Mensal.

Risco: medio/alto. Sao historicos/snapshots auxiliares. Podem preservar historia, mas nao provam vinculo comercial canonico.

## 5. Onde 2026 ainda esta vulneravel

1. Dashboard operacional: cards de Leads, Experimentais, Taxa Conversao e Ticket Passaporte ainda nao usam RPC v2.
2. Gestao Mensal Comercial: KPIs, graficos, funil, rankings e comparativos ainda misturam legado e vivo.
3. `/app/comercial`: relatorios e cards ainda sao calculados em tela, com fallback legado e varias fontes ao mesmo tempo.
4. IA/Gemini comercial: ainda usa RPC/view antiga.
5. Relatorio gerencial mensal: ainda recebe `kpis_comercial` antigo.
6. Experimentais: presenca individual confirmada ainda nao cobre tudo; status operacional nao pode ser vendido como canonico final.
7. Matriculas comerciais por unidade: regra atual por `alunos.unidade_id + valor_passaporte > 0` ficou ambigua no P02.G2.
8. Vínculo lead -> aluno: cobertura ainda baixa para conversao de lead; nao usar conversao vinculada como KPI amplo sem explicitar.

## 6. Risco de quebrar historico

O historico nao deve ser reescrito. A migracao segura deve ser paralela:

- manter `dados_comerciais`, `origem_leads` e views antigas para consulta/auditoria enquanto consumidores migram;
- nao executar backfill nem recalculo automatico de historico nesta frente;
- quando um consumidor passar para v2, comparar side-by-side contra a fonte antiga e documentar divergencias;
- para meses fechados, definir politica de retificacao explicita antes de congelar relatorios comerciais;
- separar visualmente "historico legado" de "fonte canonica v2" quando ambos aparecerem no mesmo relatorio.

Ponto importante: a RPC v2 e transacional. Se linhas antigas em `leads`, `lead_experimentais` ou `alunos` forem alteradas, a leitura historica pode mudar. Para relatorio mensal fechado 100%, ainda falta definir snapshot/retificacao canonica comercial.

## 7. Ordem recomendada de migracao

### Fase H.1 - Primeiro PR pequeno operacional

Recomendacao: migrar apenas o card/valor de `Leads` do `DashboardPage` para a RPC v2, com competencia explicita e validacao Maio/Junho 2026.

Escopo sugerido:

- Criar hook isolado `useComercialOperacionalResumoV2` ou equivalente.
- Usar `get_kpis_comercial_canonicos_v2`.
- Alimentar somente `dadosComercial.leads_mes` e, se necessario, o primeiro degrau do funil `Leads`.
- Nao mexer ainda em experimentais, conversao, ticket, matriculas ou relatorios.
- Mostrar/registrar fonte "Comercial: v2" para o card migrado, se caber no UI.

Por que este primeiro:

- `leads_entrantes` e o campo v2 mais maduro.
- Evita presenca individual, matricula por unidade, professor e conversao.
- Comeca a tirar 2026 operacional da logica local sem mexer em fluxo de escrita.

Validacao obrigatoria:

- Maio/2026 e Junho/2026 por unidade e consolidado.
- RPC v2 vs SELECT direto.
- Visual autenticado em producao read-only ou staging correto.
- Garantir que comparativos/historico nao mudaram silenciosamente.

### Fase H.2 - Gestao Mensal Comercial: subaba Leads

Migrar somente `total_leads` e `leads_por_canal` da subaba Leads em `TabComercialNew`.

Nao migrar ainda:

- experimentais;
- matriculas;
- professores;
- cursos;
- taxa de conversao;
- ticket/passaporte.

### Fase H.3 - IA/Gemini comercial e relatorio gerencial

Trocar `get_dados_comercial_ia`/`kpis_comercial` para payload v2, com nomes explicitos:

- `leads_entrantes`;
- `experimentais_realizadas_presenca_confirmada`;
- `experimentais_realizadas_status_operacional`;
- `matriculas_comerciais_principais` como diagnostico se ainda nao validado por unidade;
- `conversoes_de_lead` separado de matricula.

Bloquear taxa Exp -> Mat enquanto a canônica estiver inconsistente.

### Fase H.4 - `/app/comercial` leitura, antes de escrita

Fazer primeiro um modo read-only/side-by-side:

- resumo v2 ao lado do resumo atual;
- relatorio diario/mensal usando payload v2 apenas para campos maduros;
- sem alterar modais de criacao/edicao/exclusao.

### Fase H.5 - Experimentais/presenca

So depois de resolver:

- presenca individual Emusys como canonica;
- status operacional separado;
- agendadas por dia vs realizadas por mes;
- multiplas experimentais por lead sem tratar como duplicidade automatica.

### Fase H.6 - Matriculas, professores e cursos

So depois de definir:

- unidade canonica da matricula comercial;
- vinculo lead -> aluno;
- curso de interesse vs curso matriculado;
- professor da experimental vs professor fixo vs professor matriculador.

## 8. Primeiro PR pequeno recomendado

Nome sugerido: `P02.H.1 - Dashboard Leads v2`.

Arquivos provaveis:

- `src/components/App/Dashboard/DashboardPage.tsx`
- novo hook isolado, por exemplo `src/hooks/useComercialOperacionalResumoV2.ts`

Nao tocar:

- `ComercialPage.tsx`;
- `TabComercialNew.tsx`;
- `TabProfessoresNew.tsx`;
- `useComercialData.ts`;
- `dados_comerciais`;
- `origem_leads`;
- `dados_mensais`;
- SQL/Supabase;
- relatorios;
- experimentais/taxas/matriculas.

Critério de aceite:

- `Leads` do Dashboard em 2026 vem da RPC v2.
- Maio/Junho 2026 batem RPC v2 vs SELECT direto.
- Nenhum KPI de experimentais/matriculas/conversao muda nesse PR.
- Build passa.
- Visual autenticado confirma card sem NaN/erro.

## 9. Perguntas pendentes para Alf/Hugo

1. Mes fechado comercial deve ser congelado em snapshot canonico ou sempre recalculado por evento com trilha de retificacao?
2. Para o Dashboard operacional, podemos migrar primeiro apenas Leads e deixar os demais cards marcados como legado/diagnostico?
3. A IA/Gemini deve ser migrada antes ou depois do Dashboard, considerando que hoje ela pode gerar texto com KPI comercial antigo?
4. O relatorio diario comercial deve contar experimentais agendadas no dia por `lead_experimentais.data_experimental` ou por data de criacao/agendamento?
5. Para relatorio mensal, a experimental realizada canonica continua exigindo presenca individual confirmada, mesmo que a cobertura atual fique baixa?
6. A matricula comercial consolidada pode ser exibida como diagnostica enquanto a regra de unidade segue pendente?

## 10. Status final do P02.H

Inventario concluido.

Nao houve:

- alteracao de banco;
- SQL;
- alteracao de codigo de producao;
- migration;
- commit;
- merge;
- deploy;
- backfill;
- recalculo de historico.

Conclusao: a fundacao v2 existe, mas o operacional 2026 ainda precisa migracao gradual. O primeiro passo seguro e pequeno e levar apenas `Leads` do Dashboard para v2, antes de tocar em experimentais, matriculas, professores, relatorios ou `/app/comercial`.
