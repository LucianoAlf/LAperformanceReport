# Health Score Professor V3 - Ciclo Canônico e Leitura Mensal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma leitura mensal honesta e um ciclo fixo de três meses calculado sobre fatos canônicos, com cobertura normalizada, comparabilidade configurável e paridade entre painel, modal e os cinco relatórios da Coordenação.

**Architecture:** O PostgreSQL continua sendo o único produtor de métricas, nota, cobertura, comparabilidade, estado de publicação e ranking. Uma migração append-only corrige a separação mensal/ciclo e cria a projeção viva do ciclo a partir de numeradores e denominadores agregados; outra torna o corte de comparabilidade editável pelo fluxo governado; uma terceira amplia o contrato canônico dos relatórios. React e as Edge Functions apenas tipam, ordenam e apresentam o contrato, sem recalcular score nem preencher ausência com referência histórica.

**Tech Stack:** PostgreSQL 17/Supabase migrations e RPCs, React 19, TypeScript 5.8, Node test runner, Deno Edge Functions, Vite 6.

**Design aprovado:** `docs/superpowers/specs/2026-08-03-health-score-v3-ciclo-mensal-design.md`

---

## Regras de execução

- Trabalhar somente na worktree `D:\2026\LA-performance-report\.worktrees\health-score-ciclo-mensal` e na branch `design/health-score-ciclo-mensal`.
- Antes de cada commit, executar `git status --short` e conferir que não há arquivos fora deste escopo.
- Não editar migrations já aplicadas; toda alteração de banco entra em migration append-only.
- Não alterar configuração ativa nem snapshots fechados diretamente.
- Não implementar cálculo de score, cobertura, elegibilidade ou ranking no frontend ou na IA.
- Usar TDD: escrever o teste, confirmar RED pelo motivo esperado, implementar o mínimo e confirmar GREEN.
- Se Docker ou Supabase local estiver indisponível, registrar explicitamente o teste não executado; teste estático não substitui fixture PostgreSQL.

## Task 1: Congelar o contrato de período, cobertura e comparabilidade

**Files:**
- Create: `tests/healthScoreProfessorV3CicloMensalContrato.test.mjs`
- Create: `tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs`
- Modify: `tests/healthScoreProfessorV3Comparabilidade.test.mjs`
- Modify: `tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs`
- Reference: `src/lib/healthScoreProfessorV3Periodos.ts`
- Reference: `supabase/migrations/20260719120000_health_score_v3_ciclos_publicacao_parcial.sql`
- Reference: `supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql`

- [ ] Adicionar testes de período para `Mar/Abr/Mai`, `Jun/Jul/Ago`, `Set/Out/Nov` e `Dez/Jan/Fev`, incluindo `2026-12-01 -> 2027-02-28`.
- [ ] Fixar no teste a cobertura normalizada:

```js
assert.equal(normalizeCoverage(55, 90), 61.1);
assert.equal(normalizeCoverage(40, 90), 44.4);
assert.equal(normalizeCoverage(0, 90), 0);
```

- [ ] Fixar os gates simultâneos: pelo menos 3/5 pilares, cobertura normalizada mínima, Retenção ou Permanência válida, amostra mínima atendida e ausência de bloqueio real de fonte.
- [ ] Congelar os casos aceitos:
  - Matheus Reis, Pedro Sérgio e Willer: `3/5`, `55/90`, `61,1%`, comparáveis;
  - Jeyson, Joel e Mariana: `2/5`, leitura parcial;
  - Adriana e Fabrício: score observado alto com base estreita, fora do bloco comparável.
- [ ] Exigir que `peso_pontuavel_total`, `peso_disponivel_total` e `cobertura_normalizada` façam parte do retorno da RPC.
- [ ] Exigir que a falta de experimental, aula, presença ou vínculo encerrado use códigos distintos; `dados_em_auditoria` só é aceito com motivo objetivo não vazio.
- [ ] Executar e confirmar RED:

```powershell
node --test tests/healthScoreProfessorV3CicloMensalContrato.test.mjs tests/healthScoreProfessorV3Comparabilidade.test.mjs
node --test tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs
```

Expected: falhas por ausência dos novos pesos/cobertura normalizada e porque o ciclo ainda não possui uma projeção viva canônica. Manter os testes RED sem commit até a implementação da Task 2 deixá-los verdes.

## Task 2: Separar conversão mensal da conversão acumulada do ciclo

**Files:**
- Create: `supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql`
- Modify: `tests/healthScoreProfessorV3CicloMensalContrato.test.mjs`
- Modify: `tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConversaoCicloProvisorio.test.mjs`
- Reference: `supabase/migrations/20260728220000_health_score_v3_conversao_ciclo_provisorio.sql`
- Reference: `supabase/migrations/20260719123500_health_score_v3_metricas_periodo_otimizada.sql`

- [ ] Na fixture PostgreSQL, inserir duas competências com numeradores e denominadores diferentes e provar que o ciclo usa `sum(numerador) / sum(denominador)`, nunca média simples de percentuais.
- [ ] Fixar que `p_periodicidade = 'mensal'` devolve somente fatos da competência solicitada e `p_periodicidade = 'ciclo'` devolve fatos entre `periodo_inicio` e `data_corte`.
- [ ] Confirmar RED antes da migration.
- [ ] Na migration, preservar a implementação vigente com um nome interno auditável e recriar `get_health_score_professor_v3_metricas_periodo(date, uuid, text)` com roteamento explícito:

```sql
case p_periodicidade
  when 'mensal' then -- conversão e demais fatos somente do mês
  when 'ciclo' then  -- fatos brutos do ciclo fixo até a data de corte
  else raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA'
end case;
```

- [ ] Criar `get_health_score_professor_v3_conversao_mensal(date, uuid)` usando o mesmo contrato de identidade e D+30 da conversão canônica, mas limitado ao primeiro e último dia do mês.
- [ ] Recriar `get_health_score_professor_v3_conversao_ciclo(date, uuid)` sem o hardcode `2026-JUN-AGO`, agregando o ciclo resolvido por `fn_health_score_v3_periodo`.
- [ ] Para média por turma, presença e retenção, preservar numerador e denominador brutos do produtor periódico existente; o ciclo soma os fatos elegíveis e só então calcula o valor.
- [ ] Para permanência, usar vínculos encerrados elegíveis até a data de corte; nunca fabricar duração para vínculo ativo.
- [ ] Preservar `numero_alunos` e capacidade como diagnóstico com peso efetivo zero.
- [ ] Respeitar a vigência pontuável de presença em `2026-08-03`; valores anteriores podem ir em `detalhes.referencia_historica`, nunca em `peso_disponivel` ou `contribuicao` atual.
- [ ] Emitir códigos causais exatos:
  - `sem_experimental_mes`;
  - `amostra_experimental_insuficiente`;
  - `sem_aulas_elegiveis_mes`;
  - `presenca_ainda_nao_registrada_mes`;
  - `sem_vinculos_encerrados_elegiveis`;
  - `amostra_vinculos_insuficiente`;
  - `fonte_canonica_indisponivel` somente com `detalhes.motivo_auditoria`.
- [ ] Reaplicar `SECURITY DEFINER`, `search_path`, `REVOKE` e `GRANT EXECUTE` equivalentes aos RPCs atuais.
- [ ] Executar GREEN:

```powershell
node --test tests/healthScoreProfessorV3CicloMensalContrato.test.mjs tests/healthScoreProfessorV3ConversaoCicloProvisorio.test.mjs
node --test tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs
```

- [ ] Commit:

```powershell
git add supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql tests/healthScoreProfessorV3CicloMensalContrato.test.mjs tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3ConversaoCicloProvisorio.test.mjs
git commit -m "feat: separar metricas mensais e acumuladas do ciclo"
```

## Task 3: Produzir mensal e ciclo vivo no mesmo read model

**Files:**
- Modify: `supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql`
- Modify: `tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs`
- Modify: `tests/healthScoreProfessorV3MesVivo.test.mjs`
- Modify: `tests/healthScoreProfessorV3NotaVivaCoerente.test.mjs`
- Modify: `tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs`
- Reference: `supabase/migrations/20260802235000_health_score_v3_nota_viva_coerente.sql`

- [ ] Adicionar fixture com ciclo aberto `Jun/Jul/Ago 2026` e exigir linhas reais para os três meses, em vez de snapshot procurado pela competência `2026-08-01`.
- [ ] Adicionar fixture de ciclo fechado e provar que o snapshot oficial é preferido e permanece imutável.
- [ ] Adicionar teste de falha: ausência do produtor de ciclo deve levantar `HEALTH_SCORE_V3_CICLO_INDISPONIVEL`, sem devolver uma grade inteira de valores nulos.
- [ ] Confirmar RED.
- [ ] Recriar `get_health_score_professor_v3_performance(date, uuid, text)` com a seleção explícita:

```sql
if p_periodicidade = 'ciclo' and not v_ciclo_fechado then
  return query select * from public.get_health_score_professor_v3_projecao_viva_coerente(
    p_competencia, p_unidade_id, 'ciclo'
  );
elsif p_periodicidade = 'mensal' and v_competencia = v_competencia_atual then
  return query select * from public.get_health_score_professor_v3_projecao_viva_coerente(
    p_competencia, p_unidade_id, 'mensal'
  );
else
  -- snapshot válido e verificado do recorte solicitado
end if;
```

- [ ] Resolver o snapshot do ciclo por `periodo_inicio`, `periodo_fim` e `ciclo_codigo`, não pela igualdade cega com o mês selecionado.
- [ ] Calcular no servidor:

```sql
peso_pontuavel_total := sum(peso) filter (where papel = 'nota' and peso > 0);
peso_disponivel_total := sum(peso) filter (
  where papel = 'nota' and peso_disponivel and nota is not null
);
cobertura_normalizada := round(
  peso_disponivel_total / nullif(peso_pontuavel_total, 0) * 100,
  1
);
```

- [ ] Passar `cobertura_normalizada`, e não peso bruto, para `avaliar_health_score_professor_v3_comparabilidade`.
- [ ] Retornar `data_corte`, `configuracao_id`, `configuracao_versao`, `regra_fingerprint`, `peso_pontuavel_total`, `peso_disponivel_total`, `cobertura_normalizada` e `comparabilidade_motivos`.
- [ ] Manter `score_observado` sempre separado de `score_comparavel`; somente o segundo recebe classificação competitiva.
- [ ] No ciclo aberto, publicar `estado_publicacao = 'ciclo_em_acompanhamento'`, `ranking_habilitado = false`.
- [ ] No ciclo fechado oficial, usar o ranking persistido do snapshot; não reordenar no consumidor.
- [ ] Recriar `get_health_score_professor_v3_snapshot_modal` como filtro do mesmo read model, sem cálculo paralelo.
- [ ] Executar GREEN e regressões:

```powershell
node --test tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3MesVivo.test.mjs tests/healthScoreProfessorV3NotaVivaCoerente.test.mjs tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs
```

- [ ] Criar novo commit com a ampliação do mesmo contrato ainda não publicado:

```powershell
git add supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3MesVivo.test.mjs tests/healthScoreProfessorV3NotaVivaCoerente.test.mjs tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs
git commit -m "feat: publicar health score mensal e ciclo vivo"
```

## Task 4: Tornar o corte editável pelo fluxo governado

**Files:**
- Create: `supabase/migrations/20260803221000_health_score_v3_config_comparabilidade.sql`
- Modify: `src/lib/healthScoreProfessorV3.ts`
- Modify: `src/hooks/useHealthScoreProfessorV3Config.ts`
- Modify: `src/components/App/Professores/HealthScoreV3Config.tsx`
- Create: `tests/healthScoreProfessorV3ConfigComparabilidade.test.mjs`
- Modify: `tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs`
- Modify: `tests/healthScoreProfessorV3LaboratorioConfig.test.mjs`
- Modify: `tests/healthScoreProfessorV3MutacaoControlada.test.mjs`

- [ ] Escrever teste RED exigindo que `coberturaMinima` e `exigePilarFidelizacao` sobrevivam a clone, edição, serialização, simulação e releitura.
- [ ] Exigir que a UI não possua corte hardcoded e que configuração ativa continue somente leitura.
- [ ] Criar RPC `salvar_health_score_professor_v3_config_rascunho_v2` com os parâmetros existentes mais:

```sql
p_cobertura_minima numeric,
p_exige_pilar_fidelizacao boolean
```

- [ ] A RPC deve validar `professores.editar`, status `rascunho`, faixa `1..100`, justificativa e pesos; deve atualizar somente o rascunho e devolver `fn_health_score_professor_v3_config_json`.
- [ ] Preservar a RPC anterior como compatibilidade para clientes antigos; ela não pode alterar configuração ativa.
- [ ] Ampliar a simulação server-side para devolver mudanças de score observado, cobertura normalizada, comparabilidade e faixa no mensal e no ciclo aberto.
- [ ] Na UI, dentro do laboratório já existente, adicionar controles claros:
  - `Cobertura mínima para comparação`;
  - `Exigir Retenção ou Permanência`.
- [ ] O botão `Salvar ajuste` deve chamar a RPC V2 e, após sucesso, reler a configuração e a performance; nenhum recálculo local decide comparabilidade.
- [ ] Executar:

```powershell
node --test tests/healthScoreProfessorV3ConfigComparabilidade.test.mjs tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3LaboratorioConfig.test.mjs tests/healthScoreProfessorV3MutacaoControlada.test.mjs
```

- [ ] Commit:

```powershell
git add supabase/migrations/20260803221000_health_score_v3_config_comparabilidade.sql src/lib/healthScoreProfessorV3.ts src/hooks/useHealthScoreProfessorV3Config.ts src/components/App/Professores/HealthScoreV3Config.tsx tests/healthScoreProfessorV3ConfigComparabilidade.test.mjs tests/healthScoreProfessorV3ConfigCicloAberto.test.mjs tests/healthScoreProfessorV3LaboratorioConfig.test.mjs tests/healthScoreProfessorV3MutacaoControlada.test.mjs
git commit -m "feat: governar corte de comparabilidade do health score"
```

## Task 5: Alinhar tipos, estados, tabela e modal

**Files:**
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Modify: `src/hooks/useHealthScoreProfessorV3Performance.ts`
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- Modify: `tests/healthScoreProfessorV3Performance.test.mjs`
- Modify: `tests/healthScoreProfessorV3ComparabilidadeFrontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3OrdemEstavel.test.mjs`
- Modify: `tests/healthScoreProfessorV3ContinuidadeUi.test.mjs`
- Create: `tests/healthScoreProfessorV3CicloMensalUi.test.mjs`

- [ ] Escrever teste RED para todos os novos campos do read model e garantir que o normalizador não inventa valor quando a RPC falha.
- [ ] Fixar os textos públicos:
  - mensal comparável: `Leitura comparável`;
  - mensal abaixo do gate: `Leitura parcial`;
  - ciclo aberto comparável: `Ciclo em acompanhamento`;
  - ciclo aberto abaixo do gate: `Base em formação`;
  - sem pilares: `Sem base operacional`.
- [ ] Fixar mensagens por pilar com amostra dinâmica, por exemplo `Amostra atual: 2 de 3 experimentais`.
- [ ] Ampliar `HealthScoreV3ProfessorPerformance` com os pesos brutos, cobertura normalizada, corte aplicado, data de corte, configuração e fingerprint.
- [ ] Substituir o campo ambíguo `cobertura` na apresentação por `coberturaNormalizada`; manter o valor legado somente para compatibilidade interna enquanto consumidores forem migrados.
- [ ] Preservar o ícone e o layout-base já aprovados; alterar apenas conteúdo e hierarquia semântica.
- [ ] Na tabela mensal, ordenar:
  1. comparáveis por score, cobertura e nome;
  2. parciais por cobertura, pilares e nome;
  3. sem base por nome.
- [ ] Na tabela de ciclo aberto, aplicar os mesmos blocos; no ciclo oficial fechado, usar `ranking_posicao` do servidor.
- [ ] No modal, mostrar período exato, data de corte, configuração, pesos brutos, cobertura normalizada, pilares e motivo de exclusão; referência histórica deve ficar em cartão separado e marcada `fora da nota`.
- [ ] O hook deve manter o erro da RPC de ciclo e mostrar uma mensagem acionável; não substituir a resposta por professores com `Dados em auditoria`.
- [ ] Executar:

```powershell
node --test tests/healthScoreProfessorV3Performance.test.mjs tests/healthScoreProfessorV3ComparabilidadeFrontend.test.mjs tests/healthScoreProfessorV3OrdemEstavel.test.mjs tests/healthScoreProfessorV3ContinuidadeUi.test.mjs tests/healthScoreProfessorV3CicloMensalUi.test.mjs
npm run build
```

- [ ] Commit:

```powershell
git add src/lib/healthScoreProfessorV3Performance.ts src/hooks/useHealthScoreProfessorV3Performance.ts src/components/App/Professores/TabPerformanceProfessores.tsx src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx tests/healthScoreProfessorV3Performance.test.mjs tests/healthScoreProfessorV3ComparabilidadeFrontend.test.mjs tests/healthScoreProfessorV3OrdemEstavel.test.mjs tests/healthScoreProfessorV3ContinuidadeUi.test.mjs tests/healthScoreProfessorV3CicloMensalUi.test.mjs
git commit -m "feat: apresentar leitura mensal e ciclo sem ambiguidade"
```

## Task 6: Criar o contrato canônico dos relatórios mensal e de ciclo

**Files:**
- Create: `supabase/migrations/20260803222000_relatorios_coordenacao_ciclo.sql`
- Modify: `src/lib/relatorioCoordenacaoCanonico.ts`
- Modify: `src/lib/relatorioCoordenacaoInstantaneo.ts`
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`
- Create: `tests/relatoriosCoordenacaoCiclo.test.mjs`
- Modify: `tests/relatoriosCoordenacaoComparabilidade.test.mjs`
- Modify: `tests/relatoriosCoordenacaoCanonicosV2.test.mjs`
- Modify: `tests/relatoriosCoordenacaoCanonicosV2Postgres.test.mjs`
- Modify: `tests/relatorioCoordenacaoRankingV3.test.mjs`

- [ ] Escrever testes RED exigindo que os cinco relatórios recebam `periodicidade`, período, estado de publicação, cobertura normalizada e comparabilidade do mesmo produtor.
- [ ] Adicionar fixture que compara painel, modal e relatório para Matheus Reis, Pedro Sérgio, Jeyson e Adriana.
- [ ] Criar `get_relatorio_coordenacao_canonico_v3(uuid, date, text)` com `p_periodicidade in ('mensal','ciclo')`.
- [ ] O V3 deve compor os blocos existentes de carteira, presença, retenção e sinais com `get_health_score_professor_v3_performance`; não recalcular Health Score no payload.
- [ ] Para mensal histórico, preservar snapshot fechado e hash verificado. Para ciclo fechado, ler snapshot de ciclo imutável. Para recortes abertos, usar a projeção viva correspondente.
- [ ] Retornar erro explícito `RELATORIO_COORDENACAO_CICLO_INDISPONIVEL` se o ciclo não puder ser produzido.
- [ ] Manter `get_relatorio_coordenacao_canonico_v2` como wrapper mensal de compatibilidade durante o rollout.
- [ ] No modal de relatórios, permitir escolher `Mensal` ou o ciclo fixo já resolvido pela tela. O relatório mensal continua mensal; o consolidado do ciclo recebe `periodicidade = 'ciclo'`.
- [ ] Atualizar os cinco renderizadores:
  - Mensal com IA: evidência e desempenho do mês, sem ranking definitivo;
  - Ranking: somente ciclo oficial fechado; ciclo aberto mostra acompanhamento sem posição oficial;
  - Carteira e Carga: diagnóstico do recorte, fora da nota;
  - Presença e Alertas: fatos do recorte e vigência da política;
  - Retenção e Evasões: numeradores, denominadores e saídas atribuíveis do recorte.
- [ ] A Edge Function deve receber `periodicidade`, validar o contrato V3 e redigir somente narrativa; números, períodos, estados e elegibilidade vêm prontos do banco.
- [ ] Manter pendências de capacidade resumidas em `Qualidade dos dados`, fora do mapa público de prioridades.
- [ ] Executar:

```powershell
node --test tests/relatoriosCoordenacaoCiclo.test.mjs tests/relatoriosCoordenacaoComparabilidade.test.mjs tests/relatoriosCoordenacaoCanonicosV2.test.mjs tests/relatoriosCoordenacaoCanonicosV2Postgres.test.mjs tests/relatorioCoordenacaoRankingV3.test.mjs
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
```

- [ ] Commit:

```powershell
git add supabase/migrations/20260803222000_relatorios_coordenacao_ciclo.sql src/lib/relatorioCoordenacaoCanonico.ts src/lib/relatorioCoordenacaoInstantaneo.ts src/components/App/Professores/ModalRelatorioCoordenacao.tsx supabase/functions/gemini-relatorio-coordenacao/index.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts tests/relatoriosCoordenacaoCiclo.test.mjs tests/relatoriosCoordenacaoComparabilidade.test.mjs tests/relatoriosCoordenacaoCanonicosV2.test.mjs tests/relatoriosCoordenacaoCanonicosV2Postgres.test.mjs tests/relatorioCoordenacaoRankingV3.test.mjs
git commit -m "feat: adicionar relatorio consolidado do ciclo pedagogico"
```

## Task 7: Atualizar documentação e mapa de contratos

**Files:**
- Modify: `docs/HEALTH_SCORE_PROFESSOR_V3.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] Documentar os ciclos fixos, inclusive a virada `Dez/Jan/Fev`.
- [ ] Documentar a diferença entre score observado, score comparável, cobertura normalizada, classificação diagnóstica e ranking oficial.
- [ ] Documentar a soma de numeradores/denominadores e proibir média de taxas/scores mensais.
- [ ] Documentar a vigência da presença em `03/08/2026` e a referência histórica fora da nota.
- [ ] Atualizar o mapa da página `/app/professores`, RPCs V3 e Edge Function da Coordenação.
- [ ] Registrar no mapa Emusys que a origem operacional não mudou; somente o recorte temporal e a publicação do Health Score foram separados.
- [ ] Verificar que não há `TODO`, `TBD`, `placeholder` ou contradição com o design aprovado:

```powershell
rg -n "TODO|TBD|placeholder" docs/HEALTH_SCORE_PROFESSOR_V3.md docs/METRICAS.md docs/MAPA-SISTEMA.md docs/MAPA-INTEGRACAO-EMUSYS.md
```

Expected: nenhum resultado.

- [ ] Commit:

```powershell
git add docs/HEALTH_SCORE_PROFESSOR_V3.md docs/METRICAS.md docs/MAPA-SISTEMA.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "docs: alinhar health score mensal e por ciclo"
```

## Task 8: Rodar regressão completa e validar visualmente

**Files:**
- No source changes expected; correções encontradas devem voltar à task responsável e receber teste de regressão.

- [ ] Rodar todos os testes Health Score e relatórios da Coordenação:

```powershell
$healthTests = rg --files tests | Where-Object { $_ -match 'healthScoreProfessorV3|relatorio.*Coordenacao|relatoriosCoordenacao' }
node --test $healthTests
```

- [ ] Rodar fixtures PostgreSQL com Docker disponível:

```powershell
node --test tests/healthScoreProfessorV3CicloMensalPostgres.test.mjs tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs tests/relatoriosCoordenacaoCanonicosV2Postgres.test.mjs
```

- [ ] Rodar Edge, build e higiene do diff:

```powershell
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
npm run build
git diff --check origin/main...HEAD
```

- [ ] Subir preview somente na worktree e manter o processo identificado:

```powershell
npm run dev -- --host 127.0.0.1 --port 5176
```

- [ ] No navegador autenticado, validar Recreio e Barra:
  - mensal de julho e agosto;
  - ciclo `Jun/Jul/Ago` sem erro e sem grade artificial de auditoria;
  - ordem dos blocos comparável/parcial/sem base;
  - Matheus Reis, Pedro Sérgio, Willer, Jeyson, Joel, Mariana, Adriana e Fabrício;
  - modal com pesos/cobertura/fonte coerentes;
  - alteração simulada do corte refletida após releitura;
  - geração mensal e consolidada dos cinco relatórios.
- [ ] Confirmar que ícone e layout-base do Health Score não mudaram.
- [ ] Registrar evidência visual e resultados dos comandos no corpo da PR.

## Task 9: Publicar com isolamento, checks e auditoria pós-deploy

**Files:**
- No additional source files expected.

- [ ] Buscar o remoto e comparar a branch antes de integrar:

```powershell
git fetch origin
git status --short
git log --oneline --left-right HEAD...origin/main
```

- [ ] Rebasear somente a worktree, resolver conflitos do escopo e repetir toda a Task 8.
- [ ] Fazer push da branch e abrir PR com migrations, comandos executados, evidências e riscos residuais.
- [ ] Aguardar checks verdes; qualquer correção entra em novo commit com teste de regressão.
- [ ] Mesclar somente o diff desta branch, sem incluir arquivos da `main` local compartilhada ou de outros chats.
- [ ] Aplicar as migrations na ordem `20260803220000`, `20260803221000`, `20260803222000` pelo fluxo oficial do Supabase.
- [ ] Deployar `gemini-relatorio-coordenacao` e o frontend pelo fluxo oficial do projeto.
- [ ] Auditar produção em modo leitura nas três unidades:

```sql
with unidades_alvo as (
  select id, nome
  from public.unidades
  where upper(nome) in ('BARRA', 'CAMPO GRANDE', 'RECREIO')
)
select u.nome as unidade, p.*
from unidades_alvo u
cross join lateral public.get_health_score_professor_v3_performance(
  date '2026-08-01', u.id, 'mensal'
) p;

with unidades_alvo as (
  select id, nome
  from public.unidades
  where upper(nome) in ('BARRA', 'CAMPO GRANDE', 'RECREIO')
)
select u.nome as unidade, p.*
from unidades_alvo u
cross join lateral public.get_health_score_professor_v3_performance(
  date '2026-08-01', u.id, 'ciclo'
) p;
```

- [ ] Confirmar no retorno real: período, pesos, cobertura normalizada, comparabilidade, fontes, configuração, ranking desligado no ciclo aberto e ausência de referência anterior dentro da nota.
- [ ] Confirmar no navegador de produção a paridade entre tabela, modal e relatórios.
- [ ] Se qualquer número divergir, interromper a publicação funcional, preservar snapshots e corrigir por nova migration append-only; não editar dados fechados manualmente.

## Critérios finais de aceite

- [ ] O mensal mostra somente fatos da competência e referências históricas separadas.
- [ ] O ciclo agrega fatos brutos do ciclo fixo e não calcula média de scores ou percentuais mensais.
- [ ] `55/90` aparece como `61,1%` e usa o corte versionado.
- [ ] Score observado com base estreita não lidera professores comparáveis.
- [ ] Todos os professores ativos permanecem visíveis com motivo causal de ausência.
- [ ] Carteira e capacidade não alteram a nota.
- [ ] Presença anterior a `03/08/2026` não compõe retroativamente a nota.
- [ ] Ciclo aberto não publica ranking; ciclo oficial fechado usa snapshot imutável.
- [ ] Painel, modal e cinco relatórios consomem o mesmo produtor canônico.
- [ ] Mudança governada de peso/corte é refletida após releitura server-side.
- [ ] Falha de ciclo aparece como erro acionável, nunca como ausência inventada em massa.
