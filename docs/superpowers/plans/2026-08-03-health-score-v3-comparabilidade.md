# Health Score V3 Comparability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar desempenho observado de Health Score comparável para impedir notas artificialmente altas com pouca evidência, manter todos os professores ativos visíveis e alinhar tabela, modal e os cinco relatórios da Coordenação ao mesmo contrato canônico.

**Architecture:** Uma nova migração amplia os read models V3 sem alterar snapshots fechados nem a configuração ativa. O servidor calcula comparabilidade, pilares válidos, motivos estruturados e a última referência comparável; TypeScript apenas normaliza, ordena e apresenta esse contrato. Os relatórios canônicos V2 e a Edge Function recebem os mesmos campos, sem recalcular score ou elegibilidade no cliente ou na IA.

**Tech Stack:** PostgreSQL/Supabase migrations e RPCs, TypeScript, React, Node test runner, Deno Edge Functions, Vite.

---

## Task 1: Fixar o contrato canônico de comparabilidade no banco

**Files:**
- Create: `supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql`
- Create: `tests/healthScoreProfessorV3Comparabilidade.test.mjs`
- Create: `tests/healthScoreProfessorV3ComparabilidadePostgres.test.mjs`
- Reference: `supabase/migrations/20260802235000_health_score_v3_nota_viva_coerente.sql`
- Reference: `supabase/migrations/20260803110000_relatorios_coordenacao_canonicos_v2.sql`

- [ ] Escrever testes estáticos e de fixture PostgreSQL para: 1 pilar/15%, 2 pilares/40%, 3 pilares/50%, 3 pilares/65% com e sem fidelização, zero pilares e referência histórica comparável.
- [ ] Executar os testes e confirmar falha pela ausência do novo contrato.
- [ ] Criar helpers SQL puros para contar pilares pontuáveis válidos e resolver `comparavel`, `em_maturacao` ou `sem_base_operacional` a partir da configuração versionada.
- [ ] Recriar `get_health_score_professor_v3_performance(date, uuid, text)` acrescentando `score_observado`, `score_comparavel`, `pilares_validos`, `pilares_esperados`, `comparabilidade_estado`, `comparabilidade_motivo`, `competencia_referencia`, `score_referencia` e `classificacao_referencia`.
- [ ] Manter `score` como valor observado para compatibilidade/auditoria; redefinir `score_exibivel` e `classificacao` como semântica comparável. Nenhum consumidor poderá inferir comparabilidade apenas porque `score` é numérico.
- [ ] Localizar referência somente em competência anterior que cumpra a mesma regra de comparabilidade; nunca copiar essa nota para a competência atual.
- [ ] Garantir que a migração não atualiza nem exclui snapshots ou configurações vigentes.
- [ ] Executar os testes até ficarem verdes e rodar regressões SQL estáticas relacionadas.

## Task 2: Normalizar estados, evidências e ordenação no frontend

**Files:**
- Modify: `src/lib/healthScoreProfessorV3Performance.ts`
- Modify: `tests/healthScoreProfessorV3Performance.test.mjs`
- Modify: `tests/healthScoreProfessorV3OrdemEstavel.test.mjs`
- Create: `tests/healthScoreProfessorV3ComparabilidadeFrontend.test.mjs`

- [ ] Escrever testes para mapear todos os novos campos sem fallback local de elegibilidade.
- [ ] Escrever testes que reproduzam Adriana/Fabrício e provem que professores em maturação não lideram os comparáveis.
- [ ] Escrever testes dos três blocos de ordem: comparáveis por score/cobertura/nome; maturação por cobertura/pilares/nome; sem base por nome.
- [ ] Executar e confirmar falhas esperadas.
- [ ] Ampliar interfaces e normalizador, mantendo `scoreObservado` separado de `scoreComparavel` e da referência histórica.
- [ ] Substituir o status genérico por `comparavel`, `em_maturacao` e `sem_base_operacional` nos resolvers públicos.
- [ ] Implementar mensagens causais: sem experimental, amostra em formação, auditoria de conversão, sem aulas elegíveis, cobertura insuficiente, auditoria de presença e dados em auditoria.
- [ ] Atualizar o comparador operacional para usar exclusivamente os campos canônicos do servidor.
- [ ] Executar testes novos e regressões do helper até ficarem verdes.

## Task 3: Tornar tabela e modal semanticamente justos

**Files:**
- Modify: `src/components/App/Professores/TabPerformanceProfessores.tsx`
- Modify: `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`
- Modify: `src/hooks/useHealthScoreProfessorV3Performance.ts`
- Modify: `tests/healthScoreProfessorV3Frontend.test.mjs`
- Modify: `tests/healthScoreProfessorV3CorrecoesUi.test.mjs`
- Create: `tests/healthScoreProfessorV3ContinuidadeUi.test.mjs`

- [ ] Escrever testes de fonte/UI para os rótulos e filtros aprovados antes de editar os componentes.
- [ ] Confirmar falha porque a UI atual ainda classifica qualquer nota observada como saúde competitiva.
- [ ] Preservar o ícone e o desenho visual existentes do Health Score; alterar somente conteúdo e hierarquia semântica.
- [ ] Na tabela, mostrar `Health Score` apenas para comparáveis; para maturação mostrar `Desempenho observado`, cobertura e pilares válidos; para zero pilares mostrar `Sem base operacional`.
- [ ] Remover o texto genérico `Evidência pendente` quando houver causa estruturada.
- [ ] No mês vivo, mostrar referência histórica com competência explícita e o estado corrente separado.
- [ ] No modal, usar exatamente os mesmos campos e mensagens do read model, sem recálculo de cobertura ou classificação.
- [ ] Atualizar filtros para separar comparável, em maturação e sem base.
- [ ] Rodar testes de UI e build TypeScript.

## Task 4: Alinhar relatório mensal e os quatro relatórios instantâneos

**Files:**
- Modify: `supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql`
- Modify: `src/lib/relatorioCoordenacaoCanonico.ts`
- Modify: `src/lib/relatorioCoordenacaoInstantaneo.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `tests/relatoriosCoordenacaoCanonicosV2.test.mjs`
- Modify: `tests/relatorioCoordenacaoRankingV3.test.mjs`
- Create: `tests/relatoriosCoordenacaoComparabilidade.test.mjs`

- [ ] Escrever testes que exijam os mesmos estados/valores canônicos nos cinco relatórios e impeçam classificação competitiva de professor em maturação.
- [ ] Confirmar falhas nos relatórios atuais.
- [ ] Ampliar `get_relatorio_coordenacao_canonico_v2` para transportar comparabilidade, score observado, referência e motivos estruturados por professor.
- [ ] No relatório de Health Score, separar `Professores comparáveis`, `Em maturação` e `Sem base operacional`; não chamar desempenho observado de Health Score.
- [ ] Manter ranking e premiação somente para ciclo oficial fechado e elegível.
- [ ] Fazer mensal/IA receber os mesmos campos prontos; a IA só redige análise e não decide score, cobertura ou elegibilidade.
- [ ] Preservar os contratos canônicos já validados de carteira, presença e retenção.
- [ ] Rodar testes dos cinco relatórios e Edge Function.

## Task 5: Verificar configuração em tempo real e casos reais

**Files:**
- Modify if needed: `tests/healthScoreProfessorV3LaboratorioConfig.test.mjs`
- Modify if needed: `tests/healthScoreProfessorV3MutacaoControlada.test.mjs`
- Reference: `src/components/App/Professores/TabConfiguracoesPerformance.tsx`

- [ ] Adicionar teste provando que mudança governada de pesos/metas/amostras é lida novamente pelo servidor e altera cobertura/comparabilidade sem fórmula paralela no frontend.
- [ ] Rodar o conjunto completo Health Score V3, relatórios da Coordenação, build e lint disponível.
- [ ] Fazer auditoria somente leitura dos casos Adriana, Fabrício, Matheus Lana e Valdo no ambiente alvo, comparando resposta canônica, tela e relatório.
- [ ] Verificar visualmente no preview autenticado: ordem, rótulos, modal e continuidade Jul/Ago, sem alterar o ícone aprovado.
- [ ] Registrar limitações reais se o banco local ou a sessão autenticada estiverem indisponíveis; não substituir evidência ausente por suposição.

## Task 6: Publicar sem tocar no trabalho concorrente

**Files:**
- No additional source files expected.

- [ ] Revisar `git diff`, confirmar que somente o worktree `codex/health-score-comparabilidade` contém a entrega e que a `main` local concorrente não foi tocada.
- [ ] Atualizar a branch contra `origin/main`, resolver somente conflitos do escopo e repetir toda a verificação.
- [ ] Criar commits pequenos e auditáveis, subir a branch e abrir PR.
- [ ] Verificar checks da PR e corrigir falhas com novo ciclo TDD.
- [ ] Fazer merge somente após checks verdes, conforme autorização vigente do usuário.
- [ ] Aplicar/deployar migração e frontend pelo fluxo oficial do repositório.
- [ ] Validar produção em leitura: Adriana/Fabrício não comparáveis com base pequena, ordem correta, relatórios alinhados e snapshots fechados preservados.
