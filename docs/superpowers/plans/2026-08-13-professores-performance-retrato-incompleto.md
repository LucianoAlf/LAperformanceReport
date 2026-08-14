# Professores Performance — Retrato Completo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a aba Performance da página de Professores funcionar para Consolidado e Unidade, nas visões Mensal e Ciclo, sem esconder a lista inteira quando um professor não possui evidência em um ou mais pilares. Preservar o contrato de dados, a distinção entre `sem_base` e valor zero e a imutabilidade de snapshots publicados.

**Architecture:** Corrigir primeiro o contrato canônico do produtor V3 para que cada professor ativo tenha a matriz completa dos seis pilares, preenchendo apenas o estado diagnóstico `sem_base` quando a fonte não existir. Em seguida, tornar a materialização/reconciliação observável e idempotente. Por fim, separar a competência exibida da competência de consulta do ciclo aberto e fazer a UI tratar cobertura parcial como aviso não bloqueante. A aba Carteira continuará usando a carteira contratual como fonte primária e o Health Score apenas como enriquecimento.

**Tech Stack:** React + TypeScript, Supabase/PostgreSQL, migrações SQL, Node `node:test`, fixtures PostgreSQL, Vite e navegador autenticado para E2E.

---

## Diagnóstico confirmado

### Evidência de reprodução

- No navegador autenticado, `Performance → Consolidado → Ciclo` retorna a lista.
- Ao trocar para `Barra`, a leitura retorna 19 professores para um roster ativo de 20 e a tela mostra `Retrato incompleto`.
- Voltando para `Consolidado` e trocando para `Mensal`, a leitura retorna 43 professores para um roster ativo de 44 e a mesma tela bloqueia toda a aba.
- A consulta direta ao leitor com a competência de referência de agosto retorna 19/20 em Barra, 43/44 no consolidado mensal e 44/44 no consolidado de ciclo.

### Causa raiz de dados/materialização

1. O professor Jonathan de Lima Santos (`professor_id = 60`) foi vinculado à Barra pela migração `supabase/migrations/20260809225806_vincular_jonathan_barra_transferencia_de_unidade.sql` depois da materialização que havia produzido 19 retratos na unidade.
2. O produtor `get_health_score_professor_v3_performance('2026-08-01', Barra, ...)` passou a encontrar o professor, mas retornou somente quatro dos seis pilares para ele: `conversao`, `media_turma`, `numero_alunos` e `presenca`. As fontes de `retencao` e `permanencia` retornaram zero linhas para mensal e ciclo.
3. A materialização diária, em `supabase/migrations/20260808193000_health_score_v3_cron_diario_idempotente.sql`, exige seis métricas por professor. Em 2026-08-10 ela falhou tanto para Barra quanto para o consolidado com `HEALTH_SCORE_V3_PILARES_INCOMPLETOS` e `snapshots_criados = 0`.
4. O comportamento correto para falta de histórico já é representável pelo contrato (`sem_base`, motivo e sem valor pontuável). O defeito é a ausência da linha diagnóstica no produtor, que transforma uma falta de evidência individual em falha do escopo inteiro.

### Causa raiz independente do seletor de ciclo

`TabPerformanceProfessores.tsx` usa `CICLO_MES_REPRESENTATIVO['JUN-AGO'] = 6`. Assim, ao escolher explicitamente `Jun / Jul / Ago`, o hook envia `2026-06-01` ao leitor. O leitor decide se o retrato está aberto comparando a competência recebida com o mês corrente; como junho não é o mês corrente, ele exige snapshot `fechado/oficial`. Os snapshots atuais são `parcial`/`em_acompanhamento`, então a mesma consulta retorna zero. Com `2026-08-01`, a consulta retorna os retratos parciais do ciclo aberto.

### Amplificador de UX

Em `src/components/App/Professores/TabPerformanceProfessores.tsx`, a condição `healthV3SnapshotCoverageIncomplete` faz um `return` antes da tabela e dos seletores. Um único professor ausente, portanto, impede a equipe de visualizar os outros 19/43/44 e até de trocar o período. O helper `mergeHealthScoreV3ActiveRoster` já existe para representar o professor ausente como `sem_base`, mas não é aproveitado visualmente devido a esse retorno antecipado.

### Escopo preservado

Não há evidência, nesta investigação, de que Agenda, 360°, Divergências, Checklists, Configurações ou Cadastro tenham a mesma causa. O container já mantém leitores próprios para Performance e Carteira. A correção deve ser isolada no contrato do Health Score, no leitor de Performance e na defesa de UX, seguida de smoke test em todas as abas.

## Plano de implementação

### Fase 1 — Fixar o contrato com testes vermelhos

- [ ] Criar uma fixture PostgreSQL com um professor ativo recém-vinculado à unidade, sem linhas históricas de retenção e permanência, mas com as outras quatro fontes disponíveis.
- [ ] Adicionar teste de contrato para `get_health_score_professor_v3_metricas_periodo`/`get_health_score_professor_v3_performance`: exatamente seis métricas distintas por professor e por periodicidade, sem duplicidade.
- [ ] Exigir que retenção e permanência ausentes sejam linhas explícitas com `estado_base = 'sem_base'`, `publicavel = false`, valor/numerador/denominador nulos quando não houver evidência e motivo/código causal auditável. O teste deve rejeitar `0`, inferência não autorizada ou classificação como saudável.
- [ ] Adicionar teste de escopo: o mesmo professor deve aparecer no consolidado e na unidade em que tem vínculo ativo, sem vazamento de outra unidade e sem duplicação por vínculo múltiplo.
- [ ] Adicionar teste do materializador com esse roster: a unidade não pode abortar por uma pessoa sem histórico; após o produtor completar a matriz, o snapshot deve ser criado para todos os ativos e a execução deve registrar a cobertura integral.

Arquivos de teste esperados: `tests/healthScoreProfessorV3MetricasSegmentadas.test.mjs`, `tests/healthScoreProfessorV3PerformanceAbertaOtimizada.test.mjs`, `tests/healthScoreProfessorV3SnapshotReader.test.mjs` e um novo teste PostgreSQL focado no caso de professor recém-vinculado.

### Fase 2 — Corrigir o produtor canônico, sem fabricar evidência

- [ ] Criar uma nova migração via `supabase migration new`, sem editar migrações já aplicadas.
- [ ] Ajustar a função canônica usada por `get_health_score_professor_v3_performance` para construir a matriz `roster ativo × {retencao, permanencia, conversao, media_turma, numero_alunos, presenca}` e fazer `left join` com cada fonte.
- [ ] Para fonte ausente, emitir a linha diagnóstica com motivo específico. Não preencher nota, denominador, valor ou contagem com zero e não usar fallback legado para mascarar falta de evidência.
- [ ] Manter a semântica atual de `papel`, `metrica_publicavel`, `confianca`, `detalhes`, fingerprint da regra e escopo (`unidade`/`consolidado`). O consolidado deve continuar resolvendo o professor no grau de rede, sem repetir linhas por unidade.
- [ ] Revalidar privilégios: a função de leitura permanece acessível somente conforme o contrato atual, e qualquer materialização/reconciliação continua restrita ao contexto de serviço.

Critério de saída: o caso Jonathan produz seis linhas mensais e seis de ciclo, com duas linhas `sem_base` transparentes; os demais professores não mudam de classificação nem de valor.

### Fase 3 — Tornar materialização e recuperação observáveis

- [ ] Manter a guarda de seis pilares como invariável de segurança. Ela não deve ser removida para “deixar passar” uma grade incompleta.
- [ ] Adicionar preflight/diagnóstico que identifique `professor_id`, métricas ausentes, unidade, competência e periodicidade antes da falha; registrar isso na execução sem esconder o erro.
- [ ] Garantir que a mudança no fingerprint do produtor faça o cron diário reprocessar o mês aberto e os escopos afetados, preservando snapshots append-only e sem reescrever competências fechadas.
- [ ] Executar, somente após aprovação da implementação, uma reconciliação controlada do mês aberto pelo caminho service-only já existente. Não inserir snapshots manualmente via SQL e não alterar diretamente a tabela de snapshots.
- [ ] Verificar remotamente, em modo leitura, a equação `roster ativo = professores no leitor = professores no snapshot publicado/aberto` para Barra, Campo Grande, Recreio e consolidado.

Critério de saída: as execuções de Barra e consolidado deixam de registrar `HEALTH_SCORE_V3_PILARES_INCOMPLETOS`; o caso atual passa a registrar 20/20 e 44/44, sem criar ranking oficial enquanto a publicação continuar parcial.

### Fase 4 — Corrigir o contrato de competência do ciclo

- [ ] Em `src/lib/healthScoreProfessorV3Periodos.ts`, expor uma referência de consulta distinta do mês representativo usado apenas para a seleção visual.
- [ ] Para o ciclo que contém o mês corrente, consultar o mês corrente como referência (`Jun-Ago/2026` aberto → agosto/2026), independentemente de o usuário ter selecionado o primeiro mês do ciclo no controle.
- [ ] Para ciclos fechados, usar a competência canônica do próprio ciclo e exigir `fechado/oficial`; não relaxar o status do leitor para fazer período histórico parecer aberto.
- [ ] Alinhar `useHealthScoreProfessorV3Performance.ts` e `TabPerformanceProfessores.tsx` para que a mesma referência seja usada após troca de unidade, mensal/ciclo, ano e reload.
- [ ] Criar testes unitários/contratuais para a virada Dez-Jan-Fev, ciclo atual aberto, ciclo histórico fechado e seleção explícita de `Jun-Ago`.

Critério de saída: selecionar `Jun / Jul / Ago` não produz zero retratos por enviar junho ao leitor; a etiqueta continua sendo do ciclo e a fonte continua sendo a leitura canônica do ciclo.

### Fase 5 — Tornar a UI resiliente à cobertura parcial

- [ ] Alterar apenas o tratamento de cobertura parcial bem-sucedida: o banner deve informar quantos professores estão sem retrato, mas a tabela e os filtros devem continuar disponíveis.
- [ ] Usar `healthV3SnapshotsAtivos`/`mergeHealthScoreV3ActiveRoster` para mostrar o professor ausente com estado explícito `sem_base`, sem incluir nota, ranking ou classificação saudável.
- [ ] Manter erro de RPC como erro de leitura com retry; não transformar erro técnico em `sem_base` nem em nota zero.
- [ ] Manter `healthV3SnapshotUnavailable` distinguível de cobertura parcial; se a resposta não fornecer nenhum retrato, a UX deve explicar preparação/indisponibilidade e não publicar ranking.
- [ ] Garantir que os seletores de unidade, competência, ciclo/mensal, busca e status permaneçam montados mesmo quando houver um professor sem retrato.

Arquivos esperados: `src/components/App/Professores/TabPerformanceProfessores.tsx`, `src/hooks/useHealthScoreProfessorV3Performance.ts` e testes de consumidor/normalização já existentes, com um teste de regressão do retorno antecipado.

### Fase 6 — Regressão da página inteira e E2E

- [ ] `Performance / Consolidado / Ciclo`: lista completa, sem alerta de cobertura para o caso corrigido, estados de publicação e ranking coerentes.
- [ ] `Performance / Barra / Ciclo`: 20 professores; Jonathan aparece como `sem_base` apenas nos pilares sem fonte, sem sumir da lista.
- [ ] `Performance / Consolidado / Mensal`: 44 professores; troca Mensal ↔ Ciclo sem tela vazia e sem perda dos filtros.
- [ ] Selecionar explicitamente `Jun-Ago`, trocar unidade, recarregar a página e repetir a consulta; o resultado deve permanecer estável.
- [ ] `Carteira`: carteira contratual continua visível mesmo se o enriquecimento V3 estiver parcial; a ausência do Health Score não pode apagar carteiras nem alunos.
- [ ] Smoke autenticado em Cadastro, Agenda, 360°, Divergências, Checklists e Configurações: aba monta, consulta própria responde, filtros principais funcionam e não surgem erros no console.
- [ ] Após cada fluxo, validar DOM, console, chamadas RPC relevantes e estabilidade depois de reload. HTTP 200 isolado não será considerado prova E2E.

Comandos esperados na implementação: testes focados do Node, fixture PostgreSQL disponível, `npm run build` e o roteiro E2E no navegador real. O teste remoto deve ser somente leitura até a etapa de rollout autorizada.

## Gates de rollout

1. Testes vermelhos adicionados e passando após a alteração do produtor.
2. Fixture PostgreSQL prova seis pilares, `sem_base` honesto e cobertura por roster/unidade.
3. Testes do leitor provam mensal, ciclo aberto, ciclo fechado e competência de referência estável.
4. Build e testes de consumidores passam; nenhuma alteração nas abas saudáveis fora do escopo é necessária.
5. E2E autenticado prova Performance, Carteira e smoke das demais abas, incluindo reload.
6. Auditoria remota confirma execuções sem erro e cobertura integral antes de qualquer promoção.
7. Só depois desses gates: commit intencional, push e eventual deploy, em etapa separada e com aprovação explícita.

## Não fazer

- Não esconder o alerta simplesmente removendo a validação.
- Não inserir uma linha manual para Jonathan, copiar snapshot de outra unidade ou executar backfill sintético.
- Não transformar `sem_base` em zero, não habilitar ranking parcial e não relaxar o status de snapshots históricos.
- Não reescrever snapshots fechados nem alterar o ciclo de configuração ativa.
- Não refatorar o carregamento comum de `ProfessoresPage.tsx` sem evidência de regressão; Performance e Carteira já possuem leitores próprios.

## Estado desta investigação

- Nenhum código de aplicação foi alterado.
- Nenhuma migração foi aplicada e nenhum dado remoto foi escrito.
- O único arquivo novo previsto por este plano é este documento; as alterações existentes de Alunos no worktree foram preservadas e não fazem parte desta investigação.
