# Auditoria Completa de Performance do LA Report e Plano de Ação

> **Para agentes de implementação:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** eliminar timeouts e carregamentos frios de 10 a 13 segundos, preservar os contratos canônicos e tornar o desempenho do LA Report mensurável e bloqueável antes de cada publicação.

**Arquitetura:** a correção proposta separa três problemas que estavam misturados: integridade da fonte histórica, custo da competência aberta e duplicação de carregamento no frontend. Competências fechadas já são lidas da tabela pré-calculada `dados_mensais`; não será criada outra materialização. O caminho vivo será primeiro simplificado e medido, depois receberá cache somente nas superfícies cujo SLA de frescor for aprovado, e só será reescrito de forma set-based se o uso operacional exigir leitura imediatamente atualizada. Nenhuma fase altera a semântica dos KPIs, os pesos do Health Score, configurações ativas ou snapshots fechados sem uma aprovação funcional separada.

**Stack técnico:** React 19, TypeScript, Vite, Supabase JS, PostgREST, PostgreSQL, PL/pgSQL, pg_stat_statements, pg_cron, Playwright e Node Test Runner.

---

## 1. Identificação da auditoria

| Campo | Valor |
| --- | --- |
| Data | 04/08/2026 |
| Revisão | 4 — consumidor remoto revalidado, materialização redundante removida e decisão de frescor da competência aberta explicitada |
| Sistema | LA Report |
| Frontend auditado | `https://la-performance-report.vercel.app` |
| Backend auditado | `https://ouqwbbermlzqqvtqwlul.supabase.co` |
| Fonte de código considerada | `origin/main` |
| Commit remoto auditado | `ecacdfb32cc92709e48ff53f3c5ce53ac37af151` |
| Perfil do teste | usuário administrador autenticado |
| Modalidade | produção, somente leitura |
| Escritas realizadas no banco | nenhuma |
| Alterações realizadas no frontend | nenhuma durante a auditoria |
| Trace Playwright local | `.playwright-cli/traces/trace-1785884683324.trace` |
| Log de rede local | `.playwright-cli/traces/trace-1785884683324.network` |

As credenciais utilizadas não são registradas neste documento. Elas devem ser fornecidas por variável de ambiente ou sessão autenticada e nunca versionadas no repositório.

### 1.1 Estado do repositório durante a leitura

O `main` local estava em `182811abe1c3ffcb69a147d77199fb0947987b1b`. A referência remota foi atualizada por `git fetch origin main`, sem merge nem alteração da worktree, para `ecacdfb32cc92709e48ff53f3c5ce53ac37af151`. Como a produção acompanha o remoto, as referências de arquivo e linha desta revisão foram extraídas desse `origin/main`, evitando conclusões baseadas em uma cópia local defasada.

### 1.2 Escopo

A auditoria cobriu:

- carregamento autenticado das principais rotas do sistema;
- chamadas HTTP, REST e RPC iniciadas por cada página;
- diferença entre carregamento frio e navegação interna aquecida;
- erros HTTP e erros PostgREST reproduzidos;
- contratos e encadeamentos das RPCs críticas;
- `pg_stat_statements`, timeouts de papéis, locks, cron jobs e triggers;
- logs do PostgreSQL no intervalo da auditoria;
- estrutura de carregamento do frontend e seus pontos de serialização;
- riscos funcionais encontrados durante o teste de performance;
- plano de ação com fases, sprints, testes, gates e rollback.

### 1.3 Limitações metodológicas

- Os tempos representam amostras reais, e não percentis estatísticos de uma janela longa.
- `pg_stat_statements` contém estatísticas acumuladas desde o último reset, cuja data não foi inferida.
- O `EXPLAIN (ANALYZE, BUFFERS)` executa a consulta. Por segurança, os planos pesados foram medidos apenas uma vez; eles não devem ser repetidos em produção durante horário operacional.
- A ausência de lock aguardando no instante da consulta não exclui contenção em outros momentos.
- O trace local não é versionado por ser binário e conter detalhes de rede. O procedimento de reprodução está documentado ao final.

---

## 2. Conclusão executiva

O problema é real, sistêmico e reproduzível. Não é causado principalmente por Service Worker, Simple Browser ou cache visual.

O carregamento frio combina seis fatores:

1. bootstrap duplicado de usuário e permissões;
2. no mês corrente aberto, o consolidado de Alunos executa três RPCs unitárias sequenciais e a cadeia percorre aproximadamente 1,36 milhão de buffers compartilhados;
3. waterfalls no Dashboard e no Analytics;
4. RPCs pesadas que encostam ou ultrapassam o `statement_timeout` efetivo;
5. metadados de volatilidade incorretos em funções de leitura muito chamadas;
6. no histórico fechado, `dados_mensais` é rápido, mas seu mapper referencia campos de segmentação inexistentes e ainda recebe sobreposição financeira de outra RPC.

O resultado observado foi:

- carregamentos frios entre 10 e 13 segundos nas superfícies críticas;
- Analytics iniciando 70 chamadas em uma única abertura;
- `get_kpis_professor_periodo_canonico_v3` retornando HTTP 500 próximo do limite de 8 segundos do papel `authenticated`;
- `get_kpis_alunos_canonicos` e o overload periódico do Health Score podendo consumir até 15 segundos porque já receberam um override local de timeout;
- variação da mesma RPC entre menos de 1 segundo e mais de 8 segundos;
- consultas do Health Score com spill em armazenamento temporário;
- páginas que ficam vazias porque o erro de autenticação ou de uma RPC bloqueia toda a cadeia;
- erros funcionais independentes na Retenção e no guard de Tráfego Pago.

Depois que caches de memória e sessão estavam aquecidos, as navegações internas para Alunos, Analytics e Professores ficaram próximas de 0,4 segundo. Isso isola parte do problema no bootstrap frio, no fan-out inicial e no custo das consultas não aquecidas. A revisão do consumidor acrescenta uma distinção essencial: junho e julho fechados não passam pela RPC pesada de Alunos; agosto aberto passa. Portanto, integridade do histórico e performance do mês atual precisam de soluções diferentes.

### 2.1 Classificação dos achados

| ID | Severidade | Achado | Impacto |
| --- | --- | --- | --- |
| PERF-P0-01 | P0 | Health Score executa cadeia de wrappers legados e chega a 14,65 s | erro 500 e página de Professores indisponível |
| PERF-P0-02 | P0 | KPI vivo de alunos faz trabalho físico desproporcional; no consolidado aberto, três chamadas unitárias sequenciais consumiram 4,56 s e 1,36 milhão de buffer hits | Dashboard, Analytics, Alunos, Administrativo e parte da Retenção lentos ou indisponíveis no mês corrente |
| PERF-P0-03 | P0 | bootstrap de autenticação consulta usuário e permissões múltiplas vezes | telas vazias, redirecionamentos e timeout de 5 s |
| PERF-P0-04 | P0 | Dashboard possui waterfall entre Gestão, Comercial, Professores e histórico | uma RPC lenta retém todas as seções posteriores |
| SEC-P0-01 | P0 | job 5 guarda um JWT de `service_role` literal em `cron.job.command` | segredo privilegiado persistido fora do Vault; exige remoção e rotação controlada |
| PERF-P1-01 | P1 | Analytics repete a mesma fonte para competência, comparativos e série histórica | 70 chamadas e pressão desnecessária no banco |
| PERF-P1-02 | P1 | 49 cron jobs ativos, com grupos sincronizados em cada minuto | picos de CPU, I/O, WAL e variação de latência |
| PERF-P1-03 | P1 | Retenção consulta relação inexistente entre `movimentacoes_admin` e `alunos` | duas respostas HTTP 400 em toda abertura |
| PERF-P1-04 | P1 | Tráfego Pago redireciona antes de o usuário terminar de carregar | usuário permitido pode voltar ao Dashboard |
| PERF-P1-05 | P1 | `get_kpis_alunos_canonicos`, sua base `v131` e `get_financeiro_faturas_emusys` são leituras `VOLATILE` sem DML identificado | metadado incorreto; experimento barato deve preceder qualquer reescrita, mas o ganho ainda não foi provado |
| PERF-P1-06 | P1 | timeouts locais de 15 s já foram aplicados às duas leituras mais pesadas | band-aid mascara a severidade e torna o comportamento diferente entre RPCs |
| DATA-P0-01 | P0 | competência fechada é lida diretamente de `dados_mensais`, embora a documentação governe `fechamento_mensal_snapshots`; o mapper ainda referencia colunas inexistentes e produz zeros | o caminho histórico é rápido, mas pode publicar segmentações e valores divergentes; integridade deve ser corrigida antes de qualquer rollout compartilhado |
| PERF-P2-01 | P2 | Agenda prefetches dois dias após o carregamento principal | três RPCs competindo pouco depois do primeiro paint |
| PERF-P2-02 | P2 | consultas duplicadas em Projetos e hooks independentes sem cache compartilhado | latência e tráfego adicionais |
| PERF-P2-03 | P2 | avisos do adviser: índices, RLS, bloat e estratégia de conexões Auth | agravantes de escala, não causa raiz isolada |

---

## 3. Teste de frontend com Playwright

### 3.1 Definições

- **Carregamento frio:** navegação direta com `page.goto`, obrigando bootstrap da aplicação, autenticação e dados da rota.
- **Navegação aquecida:** troca de rota dentro da SPA após sessão, módulos e caches em memória já estarem disponíveis.
- **Network idle falso:** a página não ficou sem atividade de rede dentro da janela máxima de 12 segundos.

### 3.2 Matriz completa de rotas

| URL | Tempo observado | Chamadas capturadas | Resultado principal |
| --- | ---: | ---: | --- |
| `/app` | 12.865 ms | 20 | não atingiu network idle; três leituras canônicas de alunos |
| `/app/gestao-mensal` | 12.825 ms | 70 | não atingiu network idle; repetição de alunos e financeiro |
| `/app/alunos` | 12.904 ms | 34 | não atingiu network idle; quatro fontes operacionais pesadas |
| `/app/professores` | 10.281 ms | — | RPC de professor retornou HTTP 500 após 8.150 ms |
| `/app/metas` | 1.625 ms | — | carregamento aceitável na amostra |
| `/app/config` | 1.542 ms | — | carregamento aceitável na amostra |
| `/app/comercial` | 2.518 ms | — | carregamento intermediário, sem timeout reproduzido |
| `/app/administrativo` | 10.636 ms | 25 | não atingiu network idle; três leituras de alunos |
| `/app/pre-atendimento` | 2.042 ms | — | carregamento aceitável na amostra |
| `/app/campanhas` | 2.023 ms | — | carregamento aceitável na amostra |
| `/app/trafego-pago` | 10.609 ms | — | redirecionou para `/app` |
| `/app/agenda` | 6.087 ms | — | três chamadas de `get_agenda_dia` |
| `/app/sucesso-aluno` | 10.633 ms | — | `fetchUsuario` expirou |
| `/app/salas` | 10.612 ms | — | `fetchUsuario` expirou |
| `/app/projetos` | 2.088 ms | — | consultas de projetos repetidas |
| `/app/automacoes` | 1.812 ms | — | carregamento aceitável na amostra |
| `/app/admin/usuarios` | 1.544 ms | — | carregamento aceitável na amostra |
| `/app/admin/permissoes` | 1.629 ms | — | carregamento aceitável na amostra |
| `/app/apresentacoes-2025` | 1.827 ms | — | carregamento aceitável na amostra |
| `/app/retencao` | 1.556 ms | — | duas respostas HTTP 400 por relação inexistente |

Todos os caminhos usam como base `https://la-performance-report.vercel.app`.

### 3.3 Chamadas mais lentas por rota

#### Dashboard — `/app`

Endpoint: `POST https://ouqwbbermlzqqvtqwlul.supabase.co/rest/v1/rpc/get_kpis_alunos_canonicos`

- 7.030 ms;
- 1.722 ms;
- a leitura de `vw_alertas_inteligentes` levou 1.484 ms.

Em um segundo carregamento frio, as três unidades levaram 2.739 ms, 1.039 ms e 1.650 ms. O frontend espera uma unidade terminar antes de iniciar a próxima, acumulando aproximadamente 5,4 segundos apenas nessa etapa.

#### Analytics — `/app/gestao-mensal`

- `get_kpis_alunos_canonicos`: 5.137 ms, 2.383 ms e 1.352 ms;
- `get_financeiro_faturas_emusys`: chamadas repetidas de 526 ms, 338 ms, 313 ms, 206 ms, 197 ms e 184 ms, entre outras;
- 70 chamadas totais no carregamento frio.

#### Alunos — `/app/alunos`

- `get_kpis_alunos_canonicos`: 4.862 ms;
- `get_kpis_alunos_admin_operacional`: 4.563 ms;
- `get_kpis_turmas_canonicos_v1`: 2.261 ms;
- `vw_turmas_implicitas`: 1.867 ms.

#### Professores — `/app/professores`

Endpoint: `POST https://ouqwbbermlzqqvtqwlul.supabase.co/rest/v1/rpc/get_kpis_professor_periodo_canonico_v3`

- duração: 8.150 ms;
- status: HTTP 500;
- código PostgreSQL: `57014`;
- mensagem: `canceling statement due to statement timeout`.

Uma repetição posterior da mesma família concluiu em aproximadamente 950 ms. Essa dispersão demonstra sensibilidade a cache, I/O temporário e carga concorrente; não é estabilidade.

#### Administrativo — `/app/administrativo`

- `get_kpis_alunos_canonicos`: 5.053 ms, 2.555 ms e 1.231 ms.

#### Agenda — `/app/agenda`

- `get_agenda_dia`: 2.933 ms, 2.919 ms e 1.107 ms.

O primeiro pedido é o dia visível. Os outros dois são prefetches dos dias anterior e posterior.

### 3.4 Navegação aquecida

| Rota | Tempo | Chamadas | Chamada mais lenta |
| --- | ---: | ---: | ---: |
| `/app/alunos` | 397 ms | 10 | 275 ms |
| `/app/gestao-mensal` | 401 ms | 5 | 91 ms |
| `/app/professores` | 395 ms | 5 | 142 ms |

Conclusão: o bundle e a renderização não são o gargalo dominante. O maior custo está na recomposição fria da sessão e dos dados.

---

## 4. Auditoria das RPCs

### 4.1 Estatísticas acumuladas

As linhas abaixo agregam variantes de consulta da mesma família em `pg_stat_statements`.

| RPC | Chamadas | Tempo total | Média ponderada | Máximo |
| --- | ---: | ---: | ---: | ---: |
| `get_health_score_professor_v3_performance` | 1.003 | 2.583.828,1 ms | 2.576,1 ms | 14.652,8 ms |
| `get_kpis_alunos_canonicos` | 838 | 1.822.620,9 ms | 2.175,0 ms | 9.688,2 ms |
| `get_kpis_professor_periodo_canonico_v3` | 1.686 | 1.836.284,4 ms | 1.089,1 ms | 7.962,2 ms |
| `get_kpis_comercial_canonicos_v2` | 5.837 | 4.649.279,6 ms | 796,5 ms | 7.912,3 ms |
| `get_kpis_turmas_canonicos_v1` | 80 | 61.972,3 ms | 774,7 ms | 6.566,1 ms |
| `get_kpis_alunos_admin_operacional` | 2.138 | 1.117.285,8 ms | 522,6 ms | 7.266,9 ms |
| `get_agenda_dia` | 678 | 130.654,9 ms | 192,7 ms | 2.339,7 ms |
| `get_financeiro_faturas_emusys` | 4.023 | 217.971,4 ms | 54,2 ms | 3.577,0 ms |

Esses valores não são p95. Ainda assim, os máximos mostram que cinco famílias chegam perto ou ultrapassam o limite de 8 segundos do usuário autenticado.

### 4.2 Assinaturas, volatilidade e timeout

| Função | Assinatura | Tipo | Volatilidade | Timeout local |
| --- | --- | --- | --- | --- |
| `get_agenda_dia` | `(date, uuid)` | SQL | stable | padrão do papel |
| `get_financeiro_faturas_emusys` | `(uuid, integer, integer)` | PL/pgSQL | volatile | padrão do papel |
| `get_health_score_professor_v3_performance` | `(date, uuid)` | PL/pgSQL | stable | padrão do papel |
| `get_health_score_professor_v3_performance` | `(date, uuid, text)` | SQL | stable | 15 s |
| `get_kpis_alunos_admin_operacional` | `(uuid, integer, integer)` | PL/pgSQL | stable | padrão do papel |
| `get_kpis_alunos_canonicos_base_v131` | `(uuid, integer, integer, jsonb)` | PL/pgSQL | volatile | padrão do papel |
| `get_kpis_alunos_canonicos` | `(uuid, integer, integer)` | PL/pgSQL | volatile | 15 s |
| `get_kpis_comercial_canonicos_v2` | `(uuid, integer, integer, text, date)` | SQL | stable | padrão do papel |
| `get_kpis_professor_periodo_canonico_v3` | `(integer, integer, uuid, date, date)` | SQL | stable | padrão do papel |
| `get_kpis_turmas_canonicos_v1` | `(integer, integer, uuid, date, date)` | PL/pgSQL | stable | padrão do papel |

Timeouts dos papéis:

| Papel | Configuração |
| --- | --- |
| `anon` | `statement_timeout=3s` |
| `authenticated` | `statement_timeout=8s` |
| `authenticator` | `statement_timeout=8s`, `lock_timeout=8s` |
| `service_role` | sem override local |

#### 4.2.1 Volatilidade declarada incorretamente

A inspeção de `pg_proc` e de `pg_get_functiondef` confirmou três funções de leitura marcadas como `VOLATILE`, sem `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE` ou `COPY` no corpo vigente:

| Função | Linguagem | Volatilidade atual | Escrita encontrada | Local versionado da definição vigente |
| --- | --- | --- | --- | --- |
| `get_kpis_alunos_canonicos(uuid, integer, integer)` | PL/pgSQL | volatile | não | `supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql:1277-1290` |
| `get_kpis_alunos_canonicos_base_v131(uuid, integer, integer, jsonb)` | PL/pgSQL | volatile | não | assinatura de quatro argumentos observada no catálogo; `origin/main` registra apenas a renomeação da versão de três argumentos em `supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql:1257-1275`, caracterizando drift a reconciliar |
| `get_financeiro_faturas_emusys(uuid, integer, integer)` | PL/pgSQL | volatile | não | `supabase/migrations/20260707213500_p25_financeiro_faturas_ticket_aluno_unico.sql:7-16` |

Esse é um defeito real de contrato e deve ser o primeiro experimento de banco depois do baseline. A cadeia de alunos não deve ser reescrita antes de medir uma migration que reclassifique como `STABLE` todas as leituras compatíveis do caminho, com o corpo e o resultado inalterados.

Limite técnico importante: as três funções são PL/pgSQL. Diferentemente de uma função SQL simples, trocar apenas `VOLATILE` por `STABLE` não faz o PostgreSQL inlinear automaticamente o corpo PL/pgSQL. Além disso, a RPC do PostgREST normalmente invoca a função uma vez por statement. Portanto, a reclassificação pode melhorar decisões de planejamento, consistência de snapshot e reutilização em consultas compostas, mas o ganho de latência precisa ser medido; ele não pode ser apresentado antecipadamente como solução dos 12 segundos.

Na rechecagem posterior à coleta inicial, `pg_stat_statements` já registrava 4.031 chamadas de `get_financeiro_faturas_emusys`, 1.010 da família do Health Score e 855 de `get_kpis_alunos_canonicos`. Os números da seção 4.1 permanecem congelados como fotografia do baseline original.

#### 4.2.2 Timeout efetivo e band-aids já aplicados

O limite global de 8 segundos explica a falha de `get_kpis_professor_periodo_canonico_v3` observada em aproximadamente 8.150 ms. Porém, ele não é o limite efetivo de todas as RPCs:

- `get_health_score_professor_v3_performance(date, uuid, text)` recebeu `statement_timeout='15s'` em `supabase/migrations/20260804224000_health_score_v3_performance_timeout_local.sql:8`;
- `get_kpis_alunos_canonicos(uuid, integer, integer)` recebeu `statement_timeout='15s'` em `supabase/migrations/20260804225000_kpis_alunos_canonicos_timeout_local.sql:4`;
- `get_kpis_professor_periodo_canonico_v3` continua sujeito aos 8 segundos do papel autenticado.

Isso explica a assimetria observada: Dashboard e páginas dependentes de Alunos podem esperar 10–13 segundos sem necessariamente receber HTTP 500, enquanto a leitura de KPI de professor falha perto de 8 segundos. O sistema já foi diagnosticado com o band-aid de 15 segundos ativo. A recomendação correta não é simplesmente “não aumentar o timeout”: é instrumentar o timeout efetivo por RPC, remover os overrides apenas depois da otimização e usar sua existência como evidência de dívida técnica, não como performance aceitável.

#### 4.2.3 Custo físico direto e limite do Sprint 4A

Uma rechecagem somente leitura com `EXPLAIN (ANALYZE, BUFFERS)` confirmou que o gargalo de Alunos está dentro da função, e não apenas no número de roundtrips:

| Chamada | Recorte | Tempo aquecido | Shared buffer hits |
| --- | --- | ---: | ---: |
| `get_kpis_alunos_canonicos` | Campo Grande, julho/2026 | 2.350,95 ms | 696.275 |
| `get_kpis_alunos_canonicos` | consolidado, julho/2026 | 4.277,70 ms | 1.312.152 |
| `get_kpis_comercial_canonicos_v2` | Campo Grande, julho/2026 | 52,88 ms | 6.454 |
| `get_kpis_alunos_canonicos` | consolidado direto com `null`, agosto/2026 | 3.921 ms | 1.347.074 |
| `get_kpis_alunos_canonicos` | três unidades sequenciais, agosto/2026 | 4.562 ms | 1.357.214 |

As duas linhas de agosto foram incorporadas da revisão técnica externa e validadas contra o fluxo efetivo de `origin/main`; não foram reexecutadas nesta revisão para evitar repetir `EXPLAIN ANALYZE` pesado em produção. As linhas de julho pertencem à coleta anterior desta auditoria.

Nesta amostra, Alunos consumiu aproximadamente **108 vezes mais buffers** e **44 vezes mais tempo** que Comercial no mesmo recorte unitário. Os números exatos variam com cache e concorrência, mas a ordem de grandeza não.

Correção da revisão 4: em `origin/main`, `fetchKPIsAlunosVivosCanonicos` não usa `p_unidade_id = null`. Quando o escopo é `todos`, ele lista as unidades ativas e executa um `for` sequencial, aguardando uma RPC por unidade (`src/lib/kpisAlunosVivosCanonicos.ts:379-397`). A medição direta com `null` era um benchmark de banco, não uma reprodução fiel do consumidor.

A chamada consolidada direta economizou aproximadamente 14% e dois roundtrips em relação às três chamadas sequenciais, mas ambas fizeram praticamente o mesmo trabalho físico: cerca de 1,35 milhão de buffer hits. Logo, trocar o laço por `null` é uma melhoria reversível e válida, condicionada a paridade exata, porém não resolve o budget sozinha. Cache e single-flight eliminam repetições de chave idêntica; eles não deduplicam três unidades com argumentos diferentes.

Conclusão do gate: não existe atalho de materialização a criar para meses fechados, pois `fetchKPIsAlunosCanonicos` já lê `dados_mensais` nesse ramo. Para o mês corrente, depois do Sprint 4A resta uma decisão de produto: aceitar um cache com SLA explícito nas superfícies gerenciais ou executar o Sprint 4B para preservar atualização operacional imediata.

### 4.3 Planos de execução amostrados

#### `get_kpis_professor_periodo_canonico_v3`

Recorte: Campo Grande, agosto/2026.

- 33 linhas;
- 495 ms em execução aquecida;
- 132.661 shared buffer hits;
- 570 blocos temporários lidos;
- 571 blocos temporários escritos.

Mesmo quando termina rápido, a quantidade de buffers e o uso de armazenamento temporário são altos para um endpoint chamado durante o primeiro paint.

#### `get_health_score_professor_v3_performance`

Recorte: Campo Grande, agosto/2026, periodicidade mensal.

- 187 linhas;
- 7.825,6 ms;
- 365.363 shared buffer hits;
- 912 blocos temporários lidos;
- 914 blocos temporários escritos.

Essa consulta termina apenas 174 ms antes do limite de 8 segundos do papel autenticado. Qualquer checkpoint, cache miss ou concorrência adicional pode fazê-la falhar.

### 4.4 Cadeia atual do Health Score

O corpo ativo da função de três argumentos possui apenas 1.809 caracteres porque delega o trabalho para backups funcionais sucessivos:

```text
get_health_score_professor_v3_performance
└─ get_hs_prof_v3_performance_before_scope_fix_20260804
   └─ get_hs_prof_v3_performance_before_pillar_coverage_20260803
      └─ get_hs_prof_v3_performance_payload_base_20260803
         └─ get_hs_prof_v3_performance_comp_legacy_20260803
            └─ get_health_score_professor_v3_performance_base_comparabilidade
               ├─ get_hs_prof_v3_performance_base_comp_legacy_20260803
               └─ get_health_score_professor_v3_projecao_viva_coerente
```

Endereços relevantes:

- `supabase/migrations/20260804223000_health_score_v3_performance_aberta_otimizada.sql:297-333`;
- `supabase/migrations/20260804120000_health_score_v3_cobertura_pilares_canonica.sql:194-231`;
- `supabase/migrations/20260803231500_health_score_v3_performance_payload.sql:10-85`;
- `supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql:466-613`;
- `supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql:62-107`.

O padrão append-only preservou o histórico funcional, mas tornou o caminho de leitura cada vez mais profundo. A correção deve manter as funções antigas como oráculo e rollback, porém retirar essa cadeia do caminho quente.

### 4.5 Cadeia atual dos KPIs de alunos

```text
get_kpis_alunos_canonicos
├─ get_kpis_alunos_admin_operacional
│  └─ get_kpis_alunos_admin_operacional_impl_v2
└─ get_kpis_alunos_canonicos_base_v131
   ├─ get_kpis_alunos_canonicos_base_p01t
   ├─ get_kpis_alunos_vinculos_vivo_canonico
   └─ get_tempo_permanencia
```

Além de chamar subfunções pesadas, o wrapper percorre JSON para substituir e recompor totais. No modo consolidado vivo, o navegador lista unidades ativas e faz uma chamada sequencial para cada uma. A execução direta com `p_unidade_id = null` existe e foi medida como alternativa, mas não é o caminho atual de `origin/main`. As duas formas confirmam que o custo físico intrínseco da cadeia permanece acima do budget.

Endereços:

- `supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql:1277-1475`;
- `supabase/migrations/20260731164500_restringe_kpis_admin_operacional.sql:106-124`;
- `supabase/migrations/20260731163353_relatorio_admin_canonico_multicurso_trancamentos.sql:8-440`;
- `supabase/migrations/20260609_p01t_breakdown_bolsistas_segundo_curso_rpc.sql:26-253`;
- `supabase/migrations/20260507_get_tempo_permanencia_wrapper.sql:6-40`.

### 4.6 Cadeia atual dos KPIs de professor

`get_kpis_professor_periodo_canonico_v3` combina:

- `get_kpis_professor_periodo_canonico_v2`;
- `get_saidas_professor_periodo_agregadas_v1`;
- `get_fator_demanda_professor_periodo_canonico_v1`.

Definição atual: `supabase/migrations/20260715232057_otimiza_kpis_professor_canonico_v3.sql:96`.

---

## 5. Achados exatos no frontend

### 5.1 Bootstrap duplicado de autenticação

Arquivo: `src/contexts/AuthContext.tsx`.

- `fetchUsuario`: linhas 70-158;
- timeout manual de 5 segundos: linhas 79-83;
- `fetchPermissoes`: linhas 161-190;
- primeira carga via `getSession`: linhas 240-270;
- segunda carga via `onAuthStateChange`: linhas 274-299.

No carregamento frio da Retenção foram observadas três consultas idênticas a `usuarios` e três a `permissoes`. `getSession` e o evento inicial de autenticação podem disputar o mesmo bootstrap. Não existe cache de promise ou chave de sessão que faça deduplicação.

Impactos:

- aumento do número de roundtrips em toda rota fria;
- timeout de 5 segundos convertendo lentidão em `usuario=null`;
- risco de guards redirecionarem antes de o perfil ficar disponível;
- carregamento completo de todas as permissões para o perfil administrativo em cada repetição.

### 5.2 Consolidado vivo de alunos em laço sequencial

Arquivo: `src/lib/kpisAlunosVivosCanonicos.ts:362-398`.

O helper atual consulta uma unidade diretamente; para “todos”, lista as unidades ativas e aguarda uma RPC por unidade:

```ts
const porUnidade: unknown[] = [];
for (const unidade of unidades || []) {
  const resultado = await consultarUnidade(String(unidade.id));
  if (resultado.error) throw resultado.error;
  porUnidade.push(...(resultado.data?.por_unidade || []));
}
```

Uma chamada direta com `p_unidade_id = null` já é aceita pelo banco e reduziu a medição de agosto de 4.562 ms para 3.921 ms. O ganho aproximado de 14% e dois roundtrips é útil, mas o custo físico permaneceu praticamente igual. O Sprint 4A deve provar paridade integral antes de trocar o consumer e deduplicar chamadas idênticas entre consumers; usar `Promise.all` sobre unidades aumentaria concorrência sem reduzir o trabalho total.

Arquivo: `src/hooks/useKPIsAlunosCanonicos.ts:358-438`.

O caminho acima só é usado quando o recorte é o mês atual, aberto e sem fechamento (`:365-400`). Competências fechadas ou intervalos históricos consultam diretamente `dados_mensais` (`:402-428`) e depois aplicam a sobreposição de `get_financeiro_faturas_emusys`. Portanto, criar outra materialização para junho/julho seria duplicar uma solução que já existe; o problema histórico é a integridade do reader, não o tempo da RPC viva.

### 5.3 Waterfall no Dashboard

Arquivo: `src/components/App/Dashboard/DashboardPage.tsx`.

Ordem atual:

1. `vw_alertas_inteligentes`: linhas 429-439;
2. `fetchKPIsAlunosCanonicos`: linhas 445-451;
3. comercial: linhas 474-552;
4. professor e turmas: linhas 554-625;
5. evolução histórica: a partir da linha 628.

Apesar de haver `Promise.all` dentro de cada bloco, os blocos são serializados por `await`. Se alunos demora 7 segundos, Comercial e Professores nem começam durante esses 7 segundos.

### 5.4 Fan-out no Analytics

Arquivo: `src/components/GestaoMensal/TabGestao.tsx`.

- competência atual: linhas 345-385;
- histórico selecionado: linhas 488-520;
- mês anterior: linhas 586-640;
- mesmo mês do ano anterior: linhas 647-675;
- complemento financeiro atual: linhas 1158-1206;
- série financeira de até 12 competências: linhas 1208-1234.

Outros consumidores independentes:

- `src/hooks/useKPIsGestao.ts:105-137`;
- `src/hooks/useKPIsRetencao.ts:182`;
- `src/components/GestaoMensal/TabRetencao.tsx:170`.

Como `fetchKPIsAlunosCanonicos` não possui cache compartilhado de curta duração nem deduplicação de requisições em andamento, montagens simultâneas podem repetir a mesma consulta. No mês corrente isso repete a cadeia viva pesada; em competência fechada repete o `select` rápido em `dados_mensais` e a sobreposição financeira, que deve ser medida separadamente.

### 5.5 Cache parcial na camada de professores

Arquivo: `src/lib/professoresKpisCanonicos.ts:157-191`.

Essa camada já possui cache de 15 segundos e mapa de consultas em andamento. Ela explica a diferença entre a primeira abertura e a navegação aquecida, mas não reduz o custo da primeira chamada nem o custo da RPC no servidor.

### 5.6 Health Score consolidado também sequencial

Arquivo: `src/hooks/useHealthScoreProfessorV3Performance.ts`.

- chamada da RPC: linhas 20-31 e 85-96;
- laço consolidado sequencial: linhas 101-115.

O padrão é equivalente ao de alunos: cada unidade espera a anterior terminar.

### 5.7 Prefetch da Agenda

Arquivo: `src/components/App/Agenda/AgendaPage.tsx:131-145`.

Após o dia atual terminar, a página aguarda 300 ms e solicita o dia seguinte e o anterior. O comportamento é funcional, mas em uma instalação sob pressão esses pedidos devem ser adiados até o navegador ficar ocioso ou até interação do usuário.

### 5.8 Retenção com relação inexistente

Arquivo: `src/components/App/Retencao/PlanilhaRetencao.tsx:99-129`.

As duas consultas pedem `alunos(nome)` a partir de `movimentacoes_admin`. O PostgREST respondeu:

```text
PGRST200: Could not find a relationship between 'movimentacoes_admin' and 'alunos' in the schema cache
```

Endpoints afetados:

```text
GET /rest/v1/movimentacoes_admin?...alunos(nome)...tipo=in.(evasao,nao_renovacao,aviso_previo)
GET /rest/v1/movimentacoes_admin?...alunos(nome)...tipo=eq.renovacao
```

Ambos retornaram HTTP 400. Isso é erro funcional, não apenas lentidão.

### 5.9 Guard de Tráfego Pago

Arquivo: `src/router.tsx:39-49`.

`TrafegoPagoGuard` lê `usuario?.email` e redireciona imediatamente quando o usuário ainda não existe. Ele não espera `loading` do contexto. No teste, uma conta permitida foi redirecionada para `/app`, comportamento compatível com corrida de autenticação.

---

## 6. Cron jobs, triggers, locks e pressão operacional

### 6.1 Cron jobs

Foram encontrados 49 jobs ativos.

- 3 executam a cada minuto;
- 4 executam a cada 5 minutos.

Jobs a cada minuto:

| Job ID | Nome |
| ---: | --- |
| 5 | `processar-mensagens-agendadas` |
| 86 | `processar-conversa-evasao-cada-minuto` |
| 88 | `lia-alertas-privados-dispatcher-minuto` |

Jobs a cada 5 minutos:

| Job ID | Nome |
| ---: | --- |
| 9 | `warm-enviar-mensagem-admin` |
| 21 | `reset-sol-stuck-messages` |
| 34 | `fabio-retry-fila` |
| 82 | `sol-hermes-report-watchdog-5min` |

Endereços conhecidos:

- `supabase/functions/processar-mensagens-agendadas/index.ts`;
- `supabase/migrations/20260801191500_pesquisa_evasao_consolidacao_worker.sql:185`;
- `supabase/migrations/20260802184500_pesquisa_evasao_consolidacao_cron_token_compat.sql:8`;
- `supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql:124-130`;
- `supabase/migrations/20260729233000_sol_hermes_watchdog_retry_health.sql:271-277`.

O job 5 merece tratamento imediato: a leitura de `cron.job.command` mostrou um JWT de `service_role` escrito literalmente no comando. O valor foi deliberadamente omitido desta auditoria. O endereço exato é o registro ativo `cron.job.jobid = 5`, `jobname = 'processar-mensagens-agendadas'`. Não foi encontrada migration versionada que reproduza o comando atual, o que também caracteriza drift entre banco e repositório. A correção está detalhada no Sprint 8 e deve remover o literal antes de qualquer ajuste de frequência.

### 6.2 Checkpoints e erros de log

Na janela aproximada de 23:15 a 23:26 UTC:

- checkpoint concluído às 23:18:11: 1.709 buffers escritos, 171,488 s;
- checkpoint iniciado às 23:20 e concluído às 23:23:39: 1.982 buffers, 199,373 s;
- erro `column "canal" does not exist` às 23:25:47, evento `cfac0937-019d-4c54-98d0-b25f985cd49e`;
- violação de unicidade em `idx_fila_sol_hermes_dia_tipo` às 23:24:11, evento `1845974f-f40a-4fe0-974f-5c0ccf44ca0a`.

O índice está definido em `supabase/migrations/20260727_enable_comercial_hermes_auto_queue.sql:29-31`. O produtor versionado é `public.sol_hermes_report_enqueue`, em `supabase/migrations/20260727_enable_comercial_hermes_auto_queue.sql:35-126`: ele faz `NOT EXISTS` antes do `INSERT`, mas não possui `ON CONFLICT`. Duas transações concorrentes podem aprovar o teste de ausência e disputar o índice parcial, explicando a violação observada.

O evento de `canal` veio sem `statement`, `detail`, `hint` ou `context` no feed de logs do PostgreSQL. Portanto, a função/consulta responsável ainda não pode ser atribuída de forma auditável. Os cron jobs 5, 34, 82, 86 e 88 terminaram com sucesso na mesma janela; associar o erro a um deles seria especulação. O Sprint 8 exige capturar o statement ou correlacionar API/Edge logs antes de alterar schema.

Esses eventos não provam que cada timeout foi causado por checkpoint, mas demonstram pressão sustentada de escrita e jobs com erro durante a mesma janela em que as leituras variaram fortemente.

### 6.3 Triggers

`information_schema.triggers` possui uma linha por evento. Por isso a tabela diferencia eventos registrados de nomes distintos.

| Tabela | Eventos | Triggers distintos |
| --- | ---: | ---: |
| `alunos` | 21 | 11 |
| `leads` | 14 | 7 |
| `movimentacoes_admin` | 10 | 4 |
| `pesquisa_evasao_mensagens` | 8 | 6 |
| `projeto_tarefas` | 8 | 5 |
| `projetos` | 8 | 5 |
| `dados_mensais` | 7 | 3 |
| `renovacoes_legado` | 6 | 3 |
| `health_score_professor_v3_snapshot_metrica_segmentos` | 5 | 2 |
| `config_health_score_professor` | 4 | 2 |
| `cursos` | 4 | 2 |
| `loja_produtos` | 4 | 2 |
| `metas` | 4 | 2 |
| `metas_legado` | 4 | 2 |
| `professor_360_ocorrencias` | 4 | 2 |

As RPCs GET não disparam triggers de DML. Portanto, triggers não são a causa direta dos timeouts de leitura. Eles aumentam, porém, o custo de sincronizações concorrentes e a geração de WAL.

### 6.4 Locks e conexões

No instante da leitura:

- locks não concedidos: 0;
- locks registrados: 235;
- sessões ativas: 2;
- sessões idle: 22;
- sessões idle in transaction: 1.

Não havia deadlock nem lock aguardando. Uma consulta de diagnóstico a `pg_stat_user_functions` chegou a perder a conexão por timeout, mostrando que a saturação não estava limitada às RPCs da interface.

### 6.5 Advisers secundários

O Supabase Performance Advisor também sinalizou:

- FKs sem índice em várias tabelas;
- múltiplas policies permissivas para a mesma operação;
- índices idênticos `idx_turmas_alunos_turma` e `idx_turmas_alunos_turma_id`;
- bloat em `net._http_response`;
- Auth configurado com máximo absoluto de 10 conexões.

Referências:

- `https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys`;
- `https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies`;
- `https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index`;
- `https://supabase.com/docs/guides/deployment/going-into-prod`.

Esses itens devem ser tratados depois dos P0. Criar índices indiscriminadamente antes de ler os planos pode piorar escrita, vacuum e armazenamento.

---

## 7. Modelo causal

```text
abertura fria
  ├─ getSession
  ├─ onAuthStateChange
  │   └─ usuário + permissões duplicados
  └─ rota
      ├─ mês atual aberto
      │   └─ três RPCs unitárias sequenciais
      │       └─ 1,36 milhão de buffer hits / 4,56 s na amostra direta
      ├─ competência fechada ou histórica
      │   └─ dados_mensais [0,14 ms / 5 buffer hits na consulta medida]
      │       └─ mapper com aliases ausentes + sobreposição financeira
      ├─ Dashboard/Analytics  [waterfall]
      └─ comparativos/gráficos/prefetch
          ↓
RPCs em camadas + JSON + temp spill no caminho vivo
          ↓
cron e checkpoints aumentam variância de I/O
          ↓
statement_timeout authenticated = 8 s
  ├─ KPI professor: 8 s efetivos → HTTP 500 próximo de 8,15 s
  └─ Alunos/Health periódico: override local de 15 s → espera mascarada de 10–13 s
          ↓
HTTP 500, tela vazia, redirecionamento ou conteúdo inicial tardio
```

---

## 8. Arquitetura alvo

1. Um bootstrap autenticado por sessão, compartilhado por todos os consumers.
2. Metadados de função corretos e medidos antes de qualquer reescrita de regra canônica.
3. Uma chamada por domínio e competência no consolidado vivo, com paridade comprovada e deduplicação de requisições idênticas.
4. Competências fechadas servidas por uma única fonte de fechamento definida no contrato. O reader atual de `dados_mensais` deve ser reconciliado com `fechamento_mensal_snapshots`; não criar outra materialização.
5. Competência aberta calculada ao vivo na tela operacional de Alunos; Dashboard e Analytics podem usar cache curto somente com SLA de frescor, invalidação e idade visível aprovados.
6. Um núcleo SQL direto para Health Score, preservando o contrato público e as funções antigas apenas como oráculo/rollback, depois do caminho compartilhado de Alunos.
7. Dashboard com seções independentes: Gestão, Comercial, Professores e histórico podem carregar sem bloquear umas às outras.
8. Comparativos e séries históricas carregados depois do conteúdo principal.
9. Cache curto e deduplicação de promises por chave canônica no frontend.
10. Performance budget em CI e smoke autenticado pós-deploy.
11. Cron jobs escalonados, com backlog e duração monitorados.

Invariantes obrigatórias:

- não alterar os números canônicos;
- não considerar os overrides atuais de 15 segundos como solução ou budget aceitável;
- não transformar erro em fallback legado silencioso;
- não alterar pesos, metas ou regras do Health Score nesta iniciativa;
- não sobrescrever snapshots fechados;
- não criar uma segunda materialização: `dados_mensais` e `fechamento_mensal_snapshots` já precisam ser reconciliados;
- não servir competência aberta desatualizada sem SLA de frescor aprovado e observável;
- manter configurações ativas imutáveis;
- manter recortes por unidade e consolidado idênticos ao contrato vigente;
- permitir rollback por função/migration sem perda de dados.

---

## 9. Plano de ação por fases e sprints

Os blocos abaixo detalham frentes técnicas. A **ordem de execução normativa** está na seção 11 e prioriza alcance, reversibilidade e risco; o número histórico do sprint não deve ser usado sozinho como prioridade.

### Fase 0 — Baseline, segurança e reprodutibilidade

#### Sprint 0: Harness de performance e gates

**Objetivo:** transformar os achados manuais em teste repetível antes de alterar SQL ou frontend.

**Arquivos:**

- Criar: `playwright.config.ts`
- Criar: `tests/e2e/performance-critical-routes.spec.ts`
- Criar: `scripts/auditar-performance-rpcs.mjs`
- Criar: `tests/performanceBudgetContracts.test.mjs`
- Criar: `artifacts/performance/.gitkeep`
- Modificar: `package.json`

- [ ] **Passo 1: adicionar scripts explícitos**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:performance-contract": "node --test tests/performanceBudgetContracts.test.mjs",
    "test:e2e:performance": "playwright test tests/e2e/performance-critical-routes.spec.ts",
    "audit:performance:rpcs": "node scripts/auditar-performance-rpcs.mjs"
  }
}
```

- [ ] **Passo 2: criar teste E2E com storage state externo**

O teste deve recusar execução se `PLAYWRIGHT_STORAGE_STATE` não estiver definido, abrir as rotas críticas, registrar requests/responses e falhar em qualquer HTTP 400/500 de origem Supabase.

```ts
const CRITICAL_ROUTES = [
  '/app',
  '/app/gestao-mensal',
  '/app/alunos',
  '/app/professores',
  '/app/administrativo',
  '/app/agenda',
  '/app/retencao',
];

const BUDGET_MS: Record<string, number> = {
  '/app': 3000,
  '/app/gestao-mensal': 3000,
  '/app/alunos': 3000,
  '/app/professores': 3000,
  '/app/administrativo': 3000,
  '/app/agenda': 2500,
  '/app/retencao': 2000,
};
```

- [ ] **Passo 3: registrar JSON de baseline**

Cada rota deve gerar `artifacts/performance/<timestamp>-<route>.json` com duração, total de requests, RPCs, status e maior duração. Tokens e headers de autorização devem ser removidos antes da gravação.

- [ ] **Passo 4: validar falha contra a produção atual**

```powershell
npm run test:e2e:performance
```

Resultado esperado antes das correções: falha de budget nas rotas críticas e/ou erro 400/500 reproduzido.

- [ ] **Passo 5: validar contratos existentes**

```powershell
node --test tests/healthScoreProfessorV3Performance.test.mjs tests/professoresKpisCanonicos.test.mjs tests/turmasKpisCanonicos.test.mjs
npm run build
```

Resultado esperado: testes funcionais e build aprovados antes da intervenção.

- [ ] **Passo 6: commit isolado**

```powershell
git add package.json playwright.config.ts tests/e2e/performance-critical-routes.spec.ts scripts/auditar-performance-rpcs.mjs tests/performanceBudgetContracts.test.mjs artifacts/performance/.gitkeep
git commit -m "test(performance): add critical route budgets"
```

**Gate de saída:** baseline reproduzível, nenhum segredo versionado e falha atual documentada.

---

### Fase 1 — Corrigir erros funcionais que contaminam a medição

#### Sprint 1: Retenção, Tráfego Pago e bootstrap consistente

**Arquivos:**

- Modificar: `src/components/App/Retencao/PlanilhaRetencao.tsx:90-130`
- Modificar: `src/router.tsx:39-49`
- Criar: `tests/retencaoPostgrestRelationship.test.mjs`
- Criar: `tests/trafegoPagoGuardLoading.test.mjs`

- [ ] **Passo 1: escrever o teste de contrato da Retenção**

O teste deve falhar se `PlanilhaRetencao.tsx` voltar a selecionar `alunos(nome)` diretamente de `movimentacoes_admin`.

```js
assert.doesNotMatch(source, /movimentacoes_admin[\s\S]*alunos\(nome\)/);
assert.match(source, /aluno_nome/);
```

- [ ] **Passo 2: remover a relação inexistente**

Usar `movimentacoes_admin.aluno_nome` como primeira fonte. Para linhas antigas sem nome, buscar `alunos` em uma segunda consulta por conjunto único de `aluno_id`, nunca uma consulta por linha.

- [ ] **Passo 3: escrever o teste do guard**

O teste deve exigir estado de carregamento antes de qualquer `<Navigate>`.

```js
assert.match(source, /const\s*\{[^}]*loading[^}]*\}\s*=\s*useAuth\(\)/);
assert.match(source, /if\s*\(loading\)\s*return\s*<PageLoader/);
```

- [ ] **Passo 4: corrigir o guard**

```tsx
function TrafegoPagoGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth();
  if (loading) return <PageLoader />;
  const email = usuario?.email?.toLowerCase();
  if (!email || !TRAFEGO_PAGO_EMAILS.includes(email)) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Passo 5: executar testes e build**

```powershell
node --test tests/retencaoPostgrestRelationship.test.mjs tests/trafegoPagoGuardLoading.test.mjs
npm run build
```

Resultado esperado: testes aprovados e build concluído.

- [ ] **Passo 6: smoke Playwright**

Abrir `/app/retencao` e `/app/trafego-pago`. Resultado esperado: zero HTTP 400 e nenhuma volta indevida para `/app`.

- [ ] **Passo 7: commit isolado**

```powershell
git add src/components/App/Retencao/PlanilhaRetencao.tsx src/router.tsx tests/retencaoPostgrestRelationship.test.mjs tests/trafegoPagoGuardLoading.test.mjs
git commit -m "fix(app): remove retention errors and auth guard race"
```

**Rollback:** reverter o commit. Nenhuma migration é necessária.

---

### Fase 1A — Correções de catálogo e teste do menor remédio

#### Sprint 1A: Volatilidade correta e timeout explicitamente medido

**Objetivo:** testar primeiro a mudança de menor custo, sem alterar uma linha da regra canônica nem o payload das RPCs.

**Arquivos:**

- Criar: `supabase/migrations/20260805083000_read_rpcs_stable_metadata.sql`
- Criar: `tests/rpcVolatilityContractPostgres.test.mjs`
- Criar: `scripts/benchmark-rpc-volatility-timeout.mjs`
- Criar: `docs/auditorias/artefatos/2026-08-05-rpc-volatility-before-after.json`

- [ ] **Passo 1: congelar o baseline por assinatura**

Guardar `pg_get_functiondef`, `provolatile`, `proparallel`, `proconfig`, plano, buffers, tempo aquecido e tempo frio das assinaturas exatas. O artefato deve diferenciar o timeout do papel e o timeout local da função.

- [ ] **Passo 2: auditar a cadeia transitiva antes do `ALTER FUNCTION`**

Confirmar ausência de escrita, sequência, relógio volátil usado como regra de negócio e SQL dinâmico com efeito lateral em:

- `get_kpis_alunos_canonicos(uuid, integer, integer)`;
- `get_kpis_alunos_canonicos_base_v131(uuid, integer, integer, jsonb)` observado no catálogo;
- `get_kpis_alunos_admin_operacional(uuid, integer, integer)`;
- `get_financeiro_faturas_emusys(uuid, integer, integer)`.

A assinatura de quatro argumentos de `base_v131` precisa primeiro ser reconciliada com o repositório, pois não existe definição equivalente em `origin/main`. A migration não pode adivinhar nem substituir seu corpo.

- [ ] **Passo 3: escrever o teste que falha no estado atual**

O teste PostgreSQL deve exigir `STABLE` apenas para as funções comprovadamente read-only, comparar `pg_get_functiondef` antes/depois removendo somente a cláusula de volatilidade e provar que nenhuma tabela foi modificada durante a matriz de chamadas.

- [ ] **Passo 4: reclassificar sem reescrever**

Usar `ALTER FUNCTION ... STABLE` nas assinaturas aprovadas. Não converter PL/pgSQL para SQL, não mexer nas CTEs, não alterar grants, `SECURITY DEFINER`, `search_path`, payload, arredondamentos ou timeout nesta migration.

- [ ] **Passo 5: medir com e sem o override de 15 segundos em ambiente descartável**

Executar quatro cenários na branch Supabase/local: volatilidade atual + 15 s; `STABLE` + 15 s; `STABLE` + timeout do papel; e `STABLE` com carga concorrente controlada. O cenário sem override serve para revelar falhas; ele não autoriza remover o timeout de produção antes dos demais sprints.

- [ ] **Passo 6: gate de decisão**

Se a reclassificação, combinada à consolidação e deduplicação do Sprint 4A, cumprir os budgets sem divergência, o Sprint 4B pode ser cancelado. Se o ganho for marginal, manter a correção de contrato e registrar que PL/pgSQL não foi inlineado. O próximo passo depende do SLA de frescor aprovado: cache curto nas superfícies gerenciais ou Sprint 4B para o caminho operacional vivo.

**Critérios de aceite:**

- igualdade estrutural de `jsonb` após normalização apenas de timestamps técnicos explicitamente identificados;
- zero escrita observada;
- plano e tempos antes/depois anexados;
- nenhum timeout aumentado;
- rollback ensaiado com `ALTER FUNCTION ... VOLATILE` e restauração do `proconfig` anterior.

**Estimativa:** 0,5–1 dia. **Risco:** baixo/médio, desde que executado primeiro em branch e que a assinatura em drift seja reconciliada.

---

### Fase 2 — Caminho crítico do Health Score e Professores

#### Sprint 2: Núcleo set-based do Health Score

**Arquivos:**

- Criar: `supabase/migrations/20260805090000_health_score_v3_performance_core_v1.sql`
- Criar: `tests/healthScoreProfessorV3PerformanceCore.test.mjs`
- Criar: `tests/healthScoreProfessorV3PerformanceCorePostgres.test.mjs`
- Criar: `scripts/auditar-health-score-v3-performance-core.mjs`
- Modificar: `src/hooks/useHealthScoreProfessorV3Performance.ts:13-124`

- [ ] **Passo 1: escrever teste de paridade antes da função nova**

O teste deve comparar, por professor/unidade/competência/periodicidade, todos os campos públicos das funções antiga e nova para:

- Barra, Campo Grande e Recreio;
- junho, julho e agosto de 2026;
- mensal e ciclo.

Campos numéricos devem aceitar apenas tolerância de `0.0001`; campos de estado, amostra, cobertura e motivo devem ser idênticos.

- [ ] **Passo 2: criar núcleo único**

Assinatura:

```sql
create function public.get_health_score_professor_v3_performance_core_v1(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text default 'mensal'
)
returns setof public.health_score_professor_v3_performance_result
language sql
stable
set search_path = public, pg_temp;
```

A implementação deve incorporar diretamente escopo, cobertura, comparabilidade e payload em CTEs set-based. Não pode chamar nenhuma função com prefixo `get_hs_prof_v3_performance_before_`, `*_legacy_*` ou a própria RPC pública.

- [ ] **Passo 3: manter contrato público como wrapper fino**

```sql
create or replace function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text default 'mensal'
)
returns setof public.health_score_professor_v3_performance_result
language sql
stable
set search_path = public, pg_temp
as $$
  select *
  from public.get_health_score_professor_v3_performance_core_v1(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  );
$$;
```

- [ ] **Passo 4: executar paridade em PostgreSQL descartável**

```powershell
node --test tests/healthScoreProfessorV3PerformanceCorePostgres.test.mjs
```

Resultado esperado: todos os recortes idênticos e nenhuma mutação de snapshots/configuração.

- [ ] **Passo 5: medir plano fora de produção**

Metas por unidade:

- execução aquecida menor que 800 ms;
- zero bloco temporário lido/escrito;
- redução mínima de 70% nos shared buffer hits em relação aos 365.363 observados;
- nenhum aumento de `statement_timeout`.

- [ ] **Passo 6: não misturar o laço consolidado com a reescrita do Health Score**

Este sprint otimiza apenas a leitura de uma unidade/escopo do Health Score. A referência anterior ao Sprint 3 estava incorreta. Deduplicação e o contrato consolidado de chamada única pertencem ao Sprint 4A; o reader histórico e sua integridade pertencem ao Anexo A; um eventual read model set-based vivo pertence ao Sprint 4B. Até esses gates, manter o comportamento funcional atual e não ampliar o fan-out por unidade.

- [ ] **Passo 7: executar suíte de regressão**

```powershell
node --test tests/healthScoreProfessorV3*.test.mjs tests/relatoriosCoordenacao*.test.mjs
npm run build
```

- [ ] **Passo 8: commit isolado**

```powershell
git add supabase/migrations/20260805090000_health_score_v3_performance_core_v1.sql tests/healthScoreProfessorV3PerformanceCore.test.mjs tests/healthScoreProfessorV3PerformanceCorePostgres.test.mjs scripts/auditar-health-score-v3-performance-core.mjs src/hooks/useHealthScoreProfessorV3Performance.ts
git commit -m "perf(health-score): flatten performance read model"
```

**Rollback:** restaurar o wrapper público para `get_hs_prof_v3_performance_before_scope_fix_20260804`. Não apagar a função core nem snapshots.

#### Sprint 3: Otimizar KPIs canônicos de professor

**Arquivos:**

- Criar: `supabase/migrations/20260805100000_kpis_professor_periodo_v4_performance.sql`
- Criar: `tests/professoresKpisV4Performance.test.mjs`
- Criar: `scripts/auditar-kpis-professor-v4.mjs`
- Modificar: `src/lib/professoresKpisCanonicos.ts:157-191`

- [ ] **Passo 1: congelar contrato V3 em fixture**

Guardar o resultado normalizado de todos os professores das três unidades para junho, julho e agosto. A fixture deve remover apenas timestamps técnicos.

- [ ] **Passo 2: criar V4 set-based**

A V4 deve calcular KPI base, saídas e fator de demanda numa única consulta com CTEs compartilhadas, sem executar três funções agregadoras completas sobre a mesma população.

- [ ] **Passo 3: provar paridade V3/V4**

```powershell
node --test tests/professoresKpisV4Performance.test.mjs
```

Resultado esperado: igualdade por professor e unidade.

- [ ] **Passo 4: medir budget**

Meta por unidade: p95 de laboratório menor que 600 ms, máximo menor que 1.500 ms, sem temp spill.

- [ ] **Passo 5: trocar um único consumer compartilhado**

Alterar somente `buscarKpisProfessoresCanonicos`; os demais consumidores continuam usando o helper e não conhecem a versão física da RPC.

- [ ] **Passo 6: regressão**

```powershell
node --test tests/professoresKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs tests/turmasKpisCanonicos.test.mjs
npm run build
```

- [ ] **Passo 7: commit isolado**

```powershell
git add supabase/migrations/20260805100000_kpis_professor_periodo_v4_performance.sql tests/professoresKpisV4Performance.test.mjs scripts/auditar-kpis-professor-v4.mjs src/lib/professoresKpisCanonicos.ts
git commit -m "perf(professores): consolidate canonical KPI query"
```

---

### Fase 3 — KPIs de alunos e leitura consolidada

#### Sprint 4A: Estabilização reversível do caminho de Alunos

**Objetivo:** reduzir roundtrips e repetições reais no mês corrente sem reimplementar a regra de quem conta como aluno, pagante, bolsista, segundo curso ou trancado.

**Arquivos:**

- Criar: `tests/kpisAlunosCanonicalSingleFlight.test.mjs`
- Criar: `tests/kpisAlunosConsolidadoSingleCall.test.mjs`
- Modificar: `src/lib/kpisAlunosVivosCanonicos.ts:362-398`
- Modificar: `src/hooks/useKPIsAlunosCanonicos.ts:358-438`

- [ ] **Passo 1: executar depois do Sprint 1A**

Usar como baseline o resultado da correção de volatilidade. Este sprint não altera nenhuma função canônica de banco.

- [ ] **Passo 2: provar que chamada consolidada e soma das unidades são equivalentes**

Comparar a resposta atual das três chamadas unitárias sequenciais com uma chamada `p_unidade_id = null` para Barra, Campo Grande, Recreio e consolidado em no mínimo seis competências. Inteiros, estados, listas e centavos devem coincidir exatamente. Se houver qualquer divergência, não trocar o consumer e abrir caso de integridade.

- [ ] **Passo 3: trocar o consolidado vivo por uma chamada única, somente após a paridade**

A medição de agosto indicou 3.921 ms e 1.347.074 hits com `null`, contra 4.562 ms e 1.357.214 hits no laço unitário. A troca elimina dois roundtrips e cerca de 14% do tempo medido, mas não deve ser vendida como solução completa. Não usar `Promise.all` sobre as unidades.

- [ ] **Passo 4: adicionar single-flight por chave canônica**

Chave: `fonte:escopo:unidadeId-ou-consolidado:ano:mes:mesFim`. Requisições simultâneas com a mesma chave devem compartilhar a mesma promise. Um TTL curto de 15 segundos pode proteger remounts acidentais, mas não é o cache com SLA do Sprint 4C. Financeiro deve compartilhar sua própria resposta; não deve ser incorporado à regra de alunos neste sprint.

- [ ] **Passo 5: preservar explicitamente os dois caminhos**

Adicionar testes que provem:

1. mês atual aberto chama a fonte viva;
2. competência fechada e intervalo histórico leem `dados_mensais`;
3. nenhuma materialização nova é criada;
4. a sobreposição financeira histórica continua explícita e mensurável;
5. ausência de `dados_mensais` permanece indisponível, sem fallback silencioso para o vivo.

- [ ] **Passo 6: validar paridade e medir as cinco superfícies**

Comparar Barra, Campo Grande, Recreio e consolidado em Dashboard, Analytics, Alunos, Administrativo e Retenção. Medir separadamente competência fechada e mês corrente aberto; misturar os dois esconderia o gargalo real.

- [ ] **Passo 7: gate de parada**

Se Sprint 1A + chamada única + single-flight cumprirem o budget frio no mês aberto, o Sprint 4B é cancelado. Se falharem, registrar separadamente banco, rede e renderização e executar o gate de frescor abaixo. A medição direta indica que a falha do budget é provável.

**Estimativa:** 1–2 dias. **Risco:** médio e reversível no frontend.

**Rollback:** restaurar o helper anterior e limpar apenas o cache em memória. Nenhuma regra ou migration canônica é removida.

#### Gate 4D: decisão de frescor por superfície

Este gate é uma decisão de produto, não uma escolha que o código possa fazer sozinho:

| Superfície | Necessidade operacional proposta | Caminho recomendado |
| --- | --- | --- |
| Alunos | refletir matrícula, trancamento e ajuste recém-lançados | fonte viva; executar Sprint 4B se o 4A não cumprir o budget |
| Administrativo operacional | confirmar alterações recentes antes de publicar | fonte viva por padrão; cache apenas com invalidação por evento comprovada |
| Dashboard | leitura gerencial, tolera pequena defasagem se declarada | Sprint 4C com SLA explícito, por exemplo até 10 minutos |
| Analytics | análise agregada, tolera pequena defasagem se declarada | Sprint 4C com SLA explícito, por exemplo até 10 minutos |
| Retenção | depende do uso: operacional ou analítico | classificar o fluxo antes de escolher 4B ou 4C |

O aceite deve registrar idade máxima, eventos que invalidam a chave, comportamento em erro e texto de transparência para o usuário. Sem essa decisão, o padrão seguro continua sendo cálculo vivo.

#### Hipótese descartada: Sprint 4A-bis de materialização

A proposta de criar `kpis_alunos_canonicos_materializado` foi removida do plano. `fetchKPIsAlunosCanonicos` já usa `dados_mensais` para competências fechadas e intervalos históricos; a consulta medida retornou as três unidades de julho em 0,143 ms de execução, com 5 buffer hits. Criar outra tabela não aceleraria o caminho vivo de agosto e duplicaria o mecanismo histórico. O problema desse ramo é tratado como integridade no Anexo A.

#### Sprint 4B: Read model set-based de Alunos — condicional e de alto risco

Este sprint só pode começar se o Sprint 4A falhar com evidência, o Gate 4D exigir atualização operacional imediata e o Anexo A estiver resolvido para impedir que uma mudança compartilhada propague número inconsistente. Ele não é uma tarefa de 2–3 dias: concentra a regra mais sensível do sistema e deve ser tratado como uma iniciativa própria.

**Escopo funcional em risco:**

- `get_kpis_alunos_canonicos`;
- `get_kpis_alunos_canonicos_base_v131`;
- `get_kpis_alunos_admin_operacional`;
- funções de vínculo vivo e tempo de permanência chamadas pela base;
- classificação de aluno ativo/pagante, bolsas, segundo curso, banda, trancamento, competência fechada e totais por unidade.

**Arquivos:**

- Criar: `supabase/migrations/20260806100000_kpis_alunos_canonicos_rede_v1.sql`
- Criar: `tests/kpisAlunosCanonicosRede.test.mjs`
- Criar: `tests/kpisAlunosCanonicosRedePostgres.test.mjs`
- Criar: `scripts/shadow-kpis-alunos-rede.mjs`
- Modificar, somente após o gate: `src/lib/kpisAlunosVivosCanonicos.ts:362-398`

- [ ] **Passo 1: reconciliar banco e migrations**

Eliminar primeiro o drift da assinatura `base_v131`. O código do banco de produção deve ter uma origem versionada íntegra antes de ser usado como matéria-prima de uma reescrita.

- [ ] **Passo 2: congelar a função atual como oráculo**

Não renomear nem editar o corpo do oráculo. Criar uma nova função com nome interno e contrato explícito. O wrapper público permanece apontando para a versão antiga durante todo o shadow.

- [ ] **Passo 3: montar corpus de paridade representativo**

Cobrir no mínimo seis competências, as três unidades e consolidado, incluindo: abertura e fechamento, trancamento iniciado/encerrado, bolsa integral/parcial, segundo/terceiro curso, banda, transferência, aviso prévio, evasão, não renovação, aluno sem vínculo e dados faltantes.

- [ ] **Passo 4: implementar o read model sem unificar financeiro**

A primeira versão deve reproduzir apenas o domínio de Alunos. Financeiro permanece em `get_financeiro_faturas_emusys`, depois de sua reclassificação como `STABLE` no Sprint 1A ser aprovada. Unificar os dois domínios adicionaria uma segunda regra sensível e deve ser uma decisão posterior, baseada em medição.

- [ ] **Passo 5: dual-read em sombra**

Executar função antiga e nova fora do caminho do usuário, armazenando somente hashes, tempos e diffs sanitizados. Exigir zero divergência para inteiros, flags, estados, listas e totais. A tolerância `0.0001` vale somente para decimais não monetários antes do arredondamento; dinheiro e valores publicados devem coincidir exatamente em centavos.

- [ ] **Passo 6: soak e revisão operacional**

Manter no mínimo dois dias úteis de shadow, incluindo uma recarga Emusys e uma mudança operacional real. Qualquer divergência cancela o cutover e vira caso de teste.

- [ ] **Passo 7: rollout protegido**

Publicar backend compatível sem consumer; depois habilitar por feature flag para uma unidade, uma superfície por vez. Não fazer cutover durante fechamento mensal nem junto com alterações de Health Score.

**Estimativa:** 7–10 dias úteis de implementação e paridade, mais 2 dias úteis de soak. **Risco:** alto/crítico para confiança nos números.

**Rollback:** desligar a feature flag e voltar o wrapper/consumer ao oráculo. A função nova permanece instalada para diagnóstico; nenhuma migration aplicada é apagada.

#### Sprint 4C: cache com SLA para competência aberta — somente superfícies gerenciais

Este sprint é alternativa complementar ao 4B para Dashboard, Analytics e outros fluxos que o Gate 4D classificar como analíticos. Ele não substitui a fonte viva na tela operacional de Alunos.

- [ ] **Passo 1: aprovar o contrato de frescor**

Registrar idade máxima — proposta inicial: 10 minutos —, texto exibido ao usuário, política de stale fallback e eventos que forçam invalidação. Sem aceite funcional, não implementar.

- [ ] **Passo 2: armazenar o envelope exato da RPC viva**

O cache não recalcula nem remonta campos. A chave deve incluir unidade/escopo, ano, mês e versão do produtor; o valor deve incluir payload, `calculado_em`, `expira_em` e hash. O consolidado é uma chave própria. Aplicar ACL/RLS restritivas e impedir escrita do navegador.

- [ ] **Passo 3: atualizar fora do caminho crítico**

Refresh controlado depois das sincronizações de origem e, como rede de segurança, por worker escalonado dentro do SLA. Não adicionar mais um cron simultâneo aos grupos já congestionados sem antes executar o Sprint 8. Cache miss pode cair no oráculo vivo, mas deve registrar latência e nunca escrever durante uma transação de fechamento.

- [ ] **Passo 4: expor idade e invalidar por evento**

Dashboard e Analytics devem informar “atualizado há N minutos”. Matrícula, trancamento, retificação e sincronização que mudem a competência precisam invalidar ou atualizar a chave afetada. O teste deve provar que uma unidade não contamina outra.

- [ ] **Passo 5: rollout por superfície**

Ativar por feature flag primeiro no Dashboard de uma unidade, depois Analytics e consolidado. Medir hit rate, idade, p95 e paridade com o oráculo. A tela de Alunos permanece fora do rollout.

**Estimativa:** 2–4 dias, mais 1 dia útil de soak. **Risco:** médio; o risco principal é servir dado além do SLA ou invalidar a unidade errada.

**Rollback:** desligar a feature flag e voltar ao cálculo vivo. O cache pode permanecer vazio e sem consumer; nenhuma regra canônica é alterada.

---

### Fase 4 — Bootstrap e renderização do frontend

#### Sprint 5: Autenticação single-flight

**Arquivos:**

- Criar: `src/lib/authBootstrap.ts`
- Modificar: `src/contexts/AuthContext.tsx:60-300`
- Criar: `tests/authBootstrapSingleFlight.test.mjs`

- [ ] **Passo 1: escrever teste de concorrência**

Duas chamadas simultâneas com o mesmo `auth_user_id` devem compartilhar a mesma promise. O contador do mock de `usuarios` e `permissoes` deve permanecer em 1.

- [ ] **Passo 2: extrair bootstrap idempotente**

```ts
const inflight = new Map<string, Promise<AuthBootstrapResult>>();

export function bootstrapAuthSession(user: User): Promise<AuthBootstrapResult> {
  const key = user.id;
  const existing = inflight.get(key);
  if (existing) return existing;
  const request = loadAuthSession(user).finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
```

- [ ] **Passo 3: fazer `getSession` e `onAuthStateChange` consumirem o mesmo bootstrap**

Não criar usuário automaticamente durante uma corrida. O comportamento legado de provisionamento, se ainda necessário, deve ocorrer uma vez e continuar protegido pelas mesmas regras de autorização.

- [ ] **Passo 4: não usar timeout de 5 s como estado de usuário inexistente**

Timeout deve produzir estado explícito de erro recuperável com retry; não deve definir `usuario=null` silenciosamente.

- [ ] **Passo 5: testar**

```powershell
node --test tests/authBootstrapSingleFlight.test.mjs tests/trafegoPagoGuardLoading.test.mjs
npm run build
```

- [ ] **Passo 6: smoke frio**

Resultado esperado: uma consulta a `usuarios`, uma carga de permissões e nenhum `Erro no fetchUsuario: Timeout`.

- [ ] **Passo 7: commit isolado**

```powershell
git add src/lib/authBootstrap.ts src/contexts/AuthContext.tsx tests/authBootstrapSingleFlight.test.mjs
git commit -m "perf(auth): deduplicate session bootstrap"
```

#### Sprint 6: Dashboard e Analytics sem waterfall

**Arquivos:**

- Criar: `src/components/App/Dashboard/useDashboardSections.ts`
- Modificar: `src/components/App/Dashboard/DashboardPage.tsx:416-640`
- Criar: `src/components/GestaoMensal/useGestaoMensalPrimary.ts`
- Criar: `src/components/GestaoMensal/useGestaoMensalComparativos.ts`
- Modificar: `src/components/GestaoMensal/TabGestao.tsx:345-1234`
- Criar: `tests/dashboardSectionsLoading.test.mjs`
- Criar: `tests/gestaoMensalRequestDedup.test.mjs`

- [ ] **Passo 1: escrever teste de independência das seções**

Simular `alunos` lento e `comercial` rápido. Comercial deve renderizar antes de alunos concluir.

- [ ] **Passo 2: iniciar seções críticas em paralelo**

```ts
const [gestao, comercial, professores] = await Promise.allSettled([
  loadGestao(params),
  loadComercial(params),
  loadProfessores(params),
]);
```

Cada seção deve possuir loading e erro próprios. `Promise.allSettled` não substitui tratamento; cada resultado deve atualizar somente sua seção.

- [ ] **Passo 3: retirar alertas do caminho bloqueante**

`vw_alertas_inteligentes` deve carregar em paralelo e nunca impedir cards executivos.

- [ ] **Passo 4: separar comparativos do Analytics**

Competência selecionada forma o primeiro lote. Mês anterior, ano anterior e série de 12 meses formam lote secundário iniciado após o primeiro conteúdo visível.

- [ ] **Passo 5: impedir chamadas repetidas**

Todos os hooks devem usar o cache/single-flight criado no Sprint 4A. A mesma chave de competência não pode aparecer duas vezes em rede enquanto a primeira estiver em andamento.

- [ ] **Passo 6: testes e build**

```powershell
node --test tests/dashboardSectionsLoading.test.mjs tests/gestaoMensalRequestDedup.test.mjs
npm run build
```

- [ ] **Passo 7: budget Playwright**

Metas:

- Dashboard frio menor que 3 s;
- Analytics frio menor que 3 s para conteúdo primário;
- no máximo 20 chamadas iniciais no Analytics;
- zero HTTP 400/500.

- [ ] **Passo 8: commit isolado**

```powershell
git add src/components/App/Dashboard/useDashboardSections.ts src/components/App/Dashboard/DashboardPage.tsx src/components/GestaoMensal/useGestaoMensalPrimary.ts src/components/GestaoMensal/useGestaoMensalComparativos.ts src/components/GestaoMensal/TabGestao.tsx tests/dashboardSectionsLoading.test.mjs tests/gestaoMensalRequestDedup.test.mjs
git commit -m "perf(frontend): remove dashboard and analytics waterfalls"
```

#### Sprint 7: Prefetch de baixa prioridade

**Arquivos:**

- Modificar: `src/components/App/Agenda/AgendaPage.tsx:131-145`
- Modificar: `src/hooks/useAgendaDia.ts:179-195`
- Criar: `tests/agendaIdlePrefetch.test.mjs`

- [ ] **Passo 1: testar que prefetch não ocorre antes de idle**

O mock deve comprovar uma chamada principal e zero vizinhas antes de `requestIdleCallback` ou interação.

- [ ] **Passo 2: adiar vizinhos**

Usar `requestIdleCallback` com timeout máximo de 2 segundos e fallback para navegador incompatível. Cancelar ao trocar data/unidade.

- [ ] **Passo 3: testar e medir**

```powershell
node --test tests/agendaIdlePrefetch.test.mjs
npm run test:e2e:performance -- --grep Agenda
```

- [ ] **Passo 4: commit isolado**

```powershell
git add src/components/App/Agenda/AgendaPage.tsx src/hooks/useAgendaDia.ts tests/agendaIdlePrefetch.test.mjs
git commit -m "perf(agenda): defer neighbor prefetch until idle"
```

---

### Fase 5 — Carga de fundo, manutenção e observabilidade

#### Sprint 8: Escalonar cron, retirar segredo e corrigir jobs com erro

**Arquivos:**

- Criar: `scripts/auditar-erros-postgres-performance.mjs`
- Criar: `supabase/migrations/20260805120000_secure_and_stagger_high_frequency_crons.sql`
- Criar: `supabase/migrations/20260805121000_sol_hermes_enqueue_idempotente.sql`
- Criar: `tests/cronPerformanceStagger.test.mjs`
- Criar: `tests/cronSecretsGuard.test.mjs`
- Criar: `tests/solHermesEnqueueConcurrency.test.mjs`
- Substituir via migration: `public.sol_hermes_report_enqueue(text, text, text, text, text)`; origem vigente em `supabase/migrations/20260727_enable_comercial_hermes_auto_queue.sql:35-126`

- [ ] **Passo 1: mapear duração e backlog por job durante 24 horas**

Registrar `jobid`, início, fim, status e backlog. Não alterar cadência antes de confirmar SLA operacional.

- [ ] **Passo 2: identificar de forma reproduzível a origem do erro `canal`**

`scripts/auditar-erros-postgres-performance.mjs` deve consultar os logs PostgreSQL, API, Edge Function e Edge Runtime usando `SUPABASE_ACCESS_TOKEN`, sem gravar tokens nos artefatos. A janela inicial é `2026-08-04T23:25:40Z` a `2026-08-04T23:25:55Z`, ancorada no evento `cfac0937-019d-4c54-98d0-b25f985cd49e`.

Saída obrigatória: `jobid` ou request ID, endpoint/função, statement/context completo e arquivo versionado correspondente. Se o feed continuar sem statement/context, instrumentar somente o candidato confirmado em ambiente de branch e reproduzir ali. Nenhuma coluna ou função deve ser criada apenas para silenciar a mensagem.

- [ ] **Passo 3: tornar o enqueue Sol/Hermes atomicamente idempotente**

Na nova migration, substituir o corpo de `public.sol_hermes_report_enqueue` preservando assinatura, grants e payload. O `INSERT` deve usar o mesmo predicado do índice parcial:

```sql
on conflict (tipo_relatorio, unidade_id, jid, data_dia)
where status in ('sol_pendente', 'sol_enviando', 'enviada')
do nothing
```

O teste deve abrir duas transações concorrentes com a mesma chave e provar: nenhuma exceção, uma única linha ativa e `queued` total igual a 1.

- [ ] **Passo 4: retirar o JWT literal do job 5**

Provisionar no Vault um segredo dedicado, por exemplo `processar_mensagens_service_role_key`, e recriar `processar-mensagens-agendadas` para montar o header em runtime a partir de `vault.decrypted_secrets`. A migration e os testes não podem conter padrão `eyJ...`, chave de projeto ou token real.

Depois de inventariar todos os consumidores do `service_role`, rotacionar a credencial atual pelo painel/Management API do Supabase e atualizar os consumidores autorizados em uma janela controlada. O valor antigo não deve aparecer em commit, issue, trace ou relatório.

`tests/cronSecretsGuard.test.mjs` deve falhar se qualquer migration nova ou `cron.job.command` auditado contiver JWT literal.

- [ ] **Passo 5: escalonar jobs de cinco minutos**

Distribuição proposta:

```text
warm-enviar-mensagem-admin       1-59/5 * * * *
reset-sol-stuck-messages         2-59/5 * * * *
fabio-retry-fila                 3-59/5 * * * *
sol-hermes-report-watchdog-5min  4-59/5 * * * *
```

- [ ] **Passo 6: preservar jobs de um minuto até medir SLA**

Os três jobs de minuto permanecem ativos na primeira publicação. Se a medição comprovar folga, mover pesquisa de evasão para minutos pares e Lia para minutos ímpares em migration separada; mensageria agendada continua por minuto.

- [ ] **Passo 7: testes de contrato**

```powershell
node --test tests/cronPerformanceStagger.test.mjs tests/cronSecretsGuard.test.mjs tests/solHermesEnqueueConcurrency.test.mjs
```

Os testes devem garantir nomes únicos, expressões distintas, ausência de job duplicado, ausência de segredo literal e idempotência sob concorrência.

- [ ] **Passo 8: rollout em janela curta**

Aplicar fora do fechamento mensal. Observar backlog e erro por 30 minutos. Rollback imediato se qualquer fila aumentar continuamente ou ultrapassar o SLA vigente.

- [ ] **Passo 9: commit isolado**

```powershell
git add scripts/auditar-erros-postgres-performance.mjs supabase/migrations/20260805120000_secure_and_stagger_high_frequency_crons.sql supabase/migrations/20260805121000_sol_hermes_enqueue_idempotente.sql tests/cronPerformanceStagger.test.mjs tests/cronSecretsGuard.test.mjs tests/solHermesEnqueueConcurrency.test.mjs
git commit -m "perf(cron): secure and stagger background workloads"
```

#### Sprint 9: Índices e manutenção orientados por plano

**Arquivos:**

- Criar: `supabase/migrations/20260805130000_performance_indexes_verified.sql`
- Criar: `tests/performanceIndexesVerified.test.mjs`
- Criar: `docs/runbooks/manutencao-performance-postgres.md`

- [ ] **Passo 1: coletar planos das RPCs novas em branch Supabase**

Identificar scans com alto número de buffers. Criar somente índices que reduzam um plano medido.

- [ ] **Passo 2: remover índice duplicado com segurança**

Confirmar igualdade de definição e dependências entre `idx_turmas_alunos_turma` e `idx_turmas_alunos_turma_id`; remover apenas um em migration reversível.

- [ ] **Passo 3: tratar bloat fora do horário operacional**

Não executar `VACUUM FULL` em produção sem janela, pois ele bloqueia a tabela. Preferir ajuste de autovacuum e manutenção online quando possível.

- [ ] **Passo 4: revisar RLS apenas nas tabelas do caminho crítico**

Consolidar policies equivalentes sem reduzir autorização. Toda alteração deve ter teste de matriz de acesso `anon`, usuário de unidade, admin e `service_role`.

- [ ] **Passo 5: testar**

```powershell
node --test tests/performanceIndexesVerified.test.mjs
```

- [ ] **Passo 6: commit isolado**

```powershell
git add supabase/migrations/20260805130000_performance_indexes_verified.sql tests/performanceIndexesVerified.test.mjs docs/runbooks/manutencao-performance-postgres.md
git commit -m "perf(database): add plan verified indexes"
```

---

### Fase 6 — Gate de produção e encerramento

#### Sprint 10: Validação integrada e rollout progressivo

**Arquivos:**

- Criar: `docs/runbooks/performance-rollout-la-report.md`
- Criar: `scripts/validar-performance-pos-deploy.mjs`
- Modificar: `.github/workflows/performance-contract.yml`

- [ ] **Passo 1: executar todas as regressões funcionais**

```powershell
node --test tests/*.test.mjs
npm run build
git diff --check
```

Resultado esperado: todos aprovados.

- [ ] **Passo 2: executar matriz canônica**

Comparar antes/depois para Barra, Campo Grande, Recreio e consolidado, em junho, julho e agosto de 2026:

- alunos ativos/pagantes;
- ticket, MRR, inadimplência e churn;
- matrículas, evasões e retenção;
- carteira, média por turma e presença;
- Health Score, cobertura, pilares e estados;
- relatórios administrativo, comercial, gerencial e coordenação.

Resultado esperado: zero divergência não aprovada.

- [ ] **Passo 3: executar teste de carga controlado**

Rodar 10 usuários virtuais, ramp-up de 60 segundos, durante 10 minutos, nas rotas críticas. Não executar durante fechamento mensal.

Critérios:

- RPC crítica p95 menor que 1.500 ms;
- erro HTTP menor que 0,1%;
- zero `57014`;
- Dashboard e Analytics primários p95 menores que 3.000 ms;
- nenhuma regressão de número canônico.

- [ ] **Passo 4: publicar primeiro backend compatível**

As novas RPCs entram sem consumer. Validar permissões e paridade usando `authenticated`.

- [ ] **Passo 5: publicar frontend por consumer compartilhado**

Ordem: Professor → Alunos → Dashboard → Analytics → Administrativo. Observar 15 minutos entre etapas.

- [ ] **Passo 6: validar produção com Playwright**

```powershell
npm run test:e2e:performance
node scripts/validar-performance-pos-deploy.mjs
```

- [ ] **Passo 7: gate de 30 minutos**

Bloquear conclusão se houver:

- qualquer `57014`;
- qualquer HTTP 400/500 nas rotas críticas;
- p95 acima do budget;
- aumento contínuo de backlog;
- divergência canônica;
- falha de autenticação ou redirecionamento indevido.

- [ ] **Passo 8: commit documental final**

```powershell
git add docs/runbooks/performance-rollout-la-report.md scripts/validar-performance-pos-deploy.mjs .github/workflows/performance-contract.yml
git commit -m "ci(performance): enforce production performance gates"
```

---

## 10. Critérios finais de aceite

O trabalho só pode ser marcado como concluído quando todos forem verdadeiros:

- [ ] Dashboard frio p95 ≤ 3 s;
- [ ] Analytics primário frio p95 ≤ 3 s;
- [ ] Alunos, Professores e Administrativo frios p95 ≤ 3 s;
- [ ] RPCs críticas p95 ≤ 1,5 s;
- [ ] nenhum `57014` em 30 minutos de teste controlado;
- [ ] funções read-only do caminho crítico declaradas `STABLE`, com cadeia transitiva auditada e benchmark antes/depois anexado;
- [ ] timeout efetivo de cada RPC documentado; overrides de 15 s removidos após o budget ou mantidos apenas com responsável, justificativa e data de expiração explícitos;
- [ ] nenhuma resposta HTTP 400/500 na matriz de rotas;
- [ ] uma consulta de usuário e uma de permissões por bootstrap;
- [ ] Analytics com no máximo 20 requests iniciais;
- [ ] consolidado vivo sem loop de RPC por unidade no navegador, após paridade exata da chamada com `null`;
- [ ] nenhum temp spill nas RPCs novas sob massa atual;
- [ ] paridade canônica integral nas três unidades e consolidado;
- [ ] divergência entre `dados_mensais`, complemento financeiro, RPC diagnóstica e snapshot fechado do Anexo A resolvida com responsável, evidência de fechamento e decisão canônica registrada;
- [ ] nenhuma segunda materialização histórica criada; o reader fechado usa a fonte canônica decidida no Anexo A;
- [ ] cache da competência aberta, se autorizado, possui SLA de frescor, idade observável, chave por unidade/escopo, ACL restritiva e invalidação aprovada;
- [ ] tela de Alunos não recebe cache gerencial sem autorização operacional explícita;
- [ ] Sprint 4B formalmente cancelado somente se o 4A cumprir o budget vivo ou se todas as superfícies afetadas aceitarem o SLA do 4C; se executado, dual-read e soak sem divergência aprovados;
- [ ] Health Score com semântica, pesos, cobertura e snapshots preservados;
- [ ] cron jobs sem erro e backlog estável;
- [ ] nenhum `cron.job.command`, migration, teste, trace ou log versionado contém JWT ou segredo privilegiado literal;
- [ ] job 5 recriado com segredo dedicado no Vault e rotação da credencial anteriormente exposta confirmada após inventário de consumidores;
- [ ] build, testes, diff check, CI e smoke pós-deploy aprovados.

---

## 11. Ordem recomendada, esforço e risco

| Ordem | Sprint | Duração estimada | Risco | Dependência |
| ---: | --- | --- | --- | --- |
| 1 | Sprint 0 — harness | 0,5–1 dia | baixo | nenhuma |
| 2 | Sprint 1A — volatilidade e timeout | 0,5–1 dia | baixo/médio | Sprint 0 |
| 3 | Sprint 1 — erros funcionais | 0,5 dia | baixo | Sprint 0 |
| 4 | Sprint 4A — Alunos reversível | 1–2 dias | médio | Sprints 0 e 1A |
| 5 | Anexo A — integridade do fechamento | 1–3 dias | alto para confiança, baixo para performance | executar antes de alterar o reader histórico ou compartilhar nova fonte |
| 6 | Gate 4D — SLA de frescor por superfície | até 0,5 dia | decisão de produto | medição do Sprint 4A |
| 7 | Sprint 5 — auth | 1 dia | médio | Sprint 1 |
| 8 | Sprint 6 — waterfalls | 1–2 dias | médio | Sprints 4A e 5 |
| 9 | Sprint 4C — cache gerencial da competência aberta | 2–4 dias + 1 dia de soak | médio | somente para superfícies aprovadas no Gate 4D |
| 10 | Sprint 4B — read model vivo de Alunos | 7–10 dias + 2 dias de soak | alto/crítico | se o 4A falhar e a superfície exigir atualização imediata |
| 11 | Sprint 2 — Health Score core | 2–4 dias | alto | Sprints 0 e caminho de Alunos estabilizado; não executar junto com 4B |
| 12 | Sprint 3 — KPI professor | 1–2 dias | médio/alto | Sprint 0; pode seguir o Sprint 2 |
| 13 | Sprint 7 — Agenda | 0,5 dia | baixo | Sprint 0 |
| 14 | Sprint 8 — cron e segredo | 1–2 dias + observação | médio/alto | inventário de consumidores e backlog |
| 15 | Sprint 9 — índices | 1–2 dias | médio/alto | novos planos |
| 16 | Sprint 10 — rollout | 1–2 dias | médio | todos os sprints autorizados pelo gate |

O caminho crítico passa a ser: baseline → correção de volatilidade/medição de timeout → chamada consolidada e single-flight de Alunos → integridade do reader histórico → decisão de frescor por superfície → auth/waterfalls. Depois desse gate, Dashboard e Analytics podem seguir pelo 4C, enquanto Alunos segue pelo 4B se precisar refletir lançamentos imediatamente. Health Score vem depois porque afeta uma superfície principal, enquanto Alunos participa de cinco. Índices genéricos e tuning periférico não devem atrasar os P0.

---

## 12. Rollback geral

1. Todas as funções novas recebem novo nome interno.
2. O contrato público permanece estável e atua como wrapper.
3. Rollback de banco troca apenas o corpo do wrapper para a função anterior.
4. Snapshots e configurações não são apagados nem atualizados em massa.
5. Cada consumer frontend é publicado separadamente.
6. Se o p95 ou a taxa de erro piorar, reverter o consumer antes de remover qualquer função nova.
7. Jobs cron são alterados por migration com expressões anteriores registradas no runbook.
8. Nenhum rollback usa `git reset --hard`, exclusão de migration aplicada ou sobrescrita de histórico.

---

## 13. Comandos de reprodução da auditoria

### 13.1 Playwright

Usar sessão autenticada sem colocar senha em linha de comando versionada:

```powershell
$env:PLAYWRIGHT_STORAGE_STATE='C:\caminho-seguro\la-report-auth.json'
npm run test:e2e:performance
```

Para abrir o trace local existente:

```powershell
npx playwright show-trace .playwright-cli/traces/trace-1785884683324.trace
```

### 13.2 Banco — somente leitura

```sql
select calls, total_exec_time, mean_exec_time, max_exec_time, query
from pg_stat_statements
where query ilike '%get_kpis_alunos_canonicos%'
   or query ilike '%get_health_score_professor_v3_performance%'
   or query ilike '%get_kpis_professor_periodo_canonico_v3%'
order by max_exec_time desc;
```

```sql
select rolname, rolconfig
from pg_roles
where rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
```

Volatilidade, linguagem, paralelismo e timeout local por assinatura:

```sql
select p.oid::regprocedure::text as assinatura,
       l.lanname as linguagem,
       case p.provolatile
         when 'i' then 'immutable'
         when 's' then 'stable'
         else 'volatile'
       end as volatilidade,
       p.proparallel,
       p.proconfig,
       pg_get_functiondef(p.oid) ~* '\m(insert|update|delete|merge|truncate|copy)\M'
         as possui_palavra_de_escrita,
       md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'get_kpis_alunos_canonicos',
    'get_kpis_alunos_canonicos_base_v131',
    'get_kpis_alunos_admin_operacional',
    'get_financeiro_faturas_emusys',
    'get_health_score_professor_v3_performance'
  )
order by assinatura;
```

A busca por palavras de DML é triagem, não prova suficiente de read-only. Antes de reclassificar, é obrigatório revisar SQL dinâmico, funções chamadas, sequências e demais efeitos laterais da cadeia transitiva.

```sql
select count(*) filter (where active) as cron_ativos,
       count(*) filter (where active and schedule = '* * * * *') as a_cada_minuto,
       count(*) filter (where active and schedule = '*/5 * * * *') as a_cada_cinco_minutos
from cron.job;
```

Inventário completo de triggers, sem executar nenhuma função:

```sql
select event_object_schema,
       event_object_table,
       trigger_name,
       action_timing,
       string_agg(distinct event_manipulation, ', ' order by event_manipulation) as eventos,
       action_statement
from information_schema.triggers
where trigger_schema not in ('pg_catalog', 'information_schema')
group by event_object_schema,
         event_object_table,
         trigger_name,
         action_timing,
         action_statement
order by event_object_schema, event_object_table, trigger_name;
```

Sessões, transações antigas e locks não concedidos no instante da coleta:

```sql
select pid,
       usename,
       application_name,
       state,
       wait_event_type,
       wait_event,
       xact_start,
       query_start,
       left(query, 300) as query_excerpt
from pg_stat_activity
where datname = current_database()
order by coalesce(xact_start, query_start) nulls last;

select locktype,
       mode,
       granted,
       relation::regclass as relation,
       pid
from pg_locks
where not granted
order by pid, locktype, mode;
```

`EXPLAIN ANALYZE` deve ser executado em branch Supabase ou ambiente local com cópia representativa. Em produção, preferir `EXPLAIN (BUFFERS, FORMAT JSON)` sem `ANALYZE`, salvo janela aprovada.

---

## 14. Evidências e referências internas

- Trace: `.playwright-cli/traces/trace-1785884683324.trace`;
- Network log: `.playwright-cli/traces/trace-1785884683324.network`;
- Health Score: `docs/HEALTH_SCORE_PROFESSOR_V3.md`;
- Auditoria junho/julho: `docs/audits/2026-08-02-health-score-v3-jun-jul.md`;
- Auditoria canônica de professores: `docs/auditorias/2026-07-11-auditoria-kpis-professores.md`;
- Mapa do sistema: `docs/MAPA-SISTEMA.md`;
- Métricas: `docs/METRICAS.md`;
- contrato histórico de fechamento: `docs/METRICAS.md:82-106`;
- consumer consolidado vivo de Alunos: `src/lib/kpisAlunosVivosCanonicos.ts:362-398`;
- seleção entre fonte viva e histórica: `src/hooks/useKPIsAlunosCanonicos.ts:358-438`;
- mapper de `dados_mensais`: `src/hooks/useKPIsAlunosCanonicos.ts:161-208`;
- wrapper canônico de Alunos: `supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql:1277-1475`;
- governança e hash dos snapshots: `supabase/migrations/20260630183500_p09c_fechamento_snapshots_tabelas.sql`;
- Runbook de crons: `docs/superpowers/prompts/monitor-crons-sync.md`.

### 14.1 Inventário dos 49 cron jobs ativos

Este inventário registra `jobid`, nome e expressão cron observados. Os comandos não são reproduzidos porque o job 5 contém um segredo literal. A lista é uma fotografia da auditoria e deve ser novamente coletada antes do Sprint 8.

| Job ID | Nome | Schedule |
| ---: | --- | --- |
| 1 | `alertas-tarefas-atrasadas` | `0 11,13,15,17,19,21,23 * * *` |
| 2 | `alertas-diarios` | `0 11 * * *` |
| 3 | `resumo-semanal` | `0 12 * * 1` |
| 5 | `processar-mensagens-agendadas` | `* * * * *` |
| 9 | `warm-enviar-mensagem-admin` | `*/5 * * * *` |
| 10 | `cleanup-bi-conversations` | `0 6 * * *` |
| 12 | `cleanup-audit-log` | `0 6 * * 0` |
| 14 | `sync-feriados-anual` | `0 12 1 1 *` |
| 15 | `sync-professores-emusys-semanal` | `0 7 * * 0` |
| 16 | `auditor-divergencias-cron` | `0 * * * *` |
| 17 | `sincronizar-grade-horaria` | `30 1 * * *` |
| 18 | `sync-presenca-cg` | `50 23 * * 1-5` |
| 19 | `sync-presenca-barra` | `50 22 * * 1-5` |
| 20 | `sync-presenca-recreio` | `52 23 * * 1-5` |
| 21 | `reset-sol-stuck-messages` | `*/5 * * * *` |
| 23 | `monitor-saude-webhook` | `*/10 * * * *` |
| 24 | `sync-matriculas-cg` | `0 2 * * *` |
| 25 | `sync-matriculas-recreio` | `20 2 * * *` |
| 26 | `sync-matriculas-barra` | `40 2 * * *` |
| 27 | `sync-presenca-cg-sabado` | `50 17 * * 6` |
| 28 | `sync-presenca-recreio-sabado` | `52 17 * * 6` |
| 29 | `sync-presenca-barra-sabado` | `50 18 * * 6` |
| 30 | `recalcular-health-score-alunos-diario` | `0 4 * * *` |
| 31 | `enriquecer-meta-ads-diario` | `10 8 * * *` |
| 32 | `notificar-primeira-aula-fabi-diario` | `0 11 * * *` |
| 33 | `disparar-pesquisa-1a-aula-diario` | `0 14 * * *` |
| 34 | `fabio-retry-fila` | `*/5 * * * *` |
| 38 | `sync-grade-futura-barra` | `0 23 * * 1-5` |
| 39 | `sync-grade-futura-cg` | `0 0 * * 2-6` |
| 40 | `sync-grade-futura-recreio` | `2 0 * * 2-6` |
| 41 | `sync-grade-futura-cg-sabado` | `0 18 * * 6` |
| 42 | `sync-grade-futura-recreio-sabado` | `2 18 * * 6` |
| 43 | `sync-grade-futura-barra-sabado` | `0 19 * * 6` |
| 59 | `sync-agenda-professor-emusys-u0` | `10 9 * * *` |
| 60 | `sync-agenda-professor-emusys-u1` | `20 9 * * *` |
| 61 | `sync-agenda-professor-emusys-u2` | `30 9 * * *` |
| 63 | `sync-metadados-aulas-15m-u0` | `0,15,30,45 * * * *` |
| 64 | `sync-metadados-aulas-15m-u1` | `5,20,35,50 * * * *` |
| 65 | `sync-metadados-aulas-15m-u2` | `10,25,40,55 * * * *` |
| 76 | `sync-professor-disciplinas-emusys-barra` | `15 9 * * *` |
| 77 | `sync-professor-disciplinas-emusys-recreio` | `35 9 * * *` |
| 78 | `sync-professor-disciplinas-emusys-campo-grande` | `55 9 * * *` |
| 82 | `sol-hermes-report-watchdog-5min` | `*/5 * * * *` |
| 83 | `fechamento-mensal-automatico` | `0 1 1 * *` |
| 84 | `varrer-atribuicao-meta-ads-diario` | `40 * * * *` |
| 86 | `processar-conversa-evasao-cada-minuto` | `* * * * *` |
| 87 | `lia-alertas-privados-expurgo-diario` | `20 6 * * *` |
| 88 | `lia-alertas-privados-dispatcher-minuto` | `* * * * *` |
| 89 | `extrair-contexto-experimental-hora` | `7 * * * *` |

---

## 15. Anexo A — Divergência de integridade entre as fontes de fechamento de Alunos

Este anexo não é um achado de performance. É um **bloqueador de integridade** com dono próprio. A revisão 4 corrigiu a descrição do fluxo: o frontend não chama `get_kpis_alunos_canonicos` para julho fechado; ele lê `dados_mensais` diretamente.

### 15.1 Fluxo real reproduzido em `origin/main`

`fetchKPIsAlunosCanonicos` executa:

1. consulta `competencias_mensais` para descobrir o status (`src/hooks/useKPIsAlunosCanonicos.ts:367-385`);
2. somente para o mês atual aberto, chama a fonte viva (`:387-400`);
3. para competência fechada, parcial ou intervalo histórico, faz `select *, unidades:unidade_id(nome)` em `dados_mensais` (`:402-428`);
4. depois do mapper, ainda aplica `get_financeiro_faturas_emusys` por `aplicarFinanceiroFaturasPeriodo` (`:417-418`).

Em produção, `dados_mensais` possuía 129 linhas e 296 kB no momento da rechecagem. O `EXPLAIN (ANALYZE, BUFFERS)` do recorte julho/2026, com join de unidades, retornou três linhas em 0,143 ms e 5 shared buffer hits. Portanto, esse ramo já é pré-calculado e não precisa de outra materialização para performance.

### 15.2 Defeito objetivo no mapper histórico

`mapDadosMensais` lê:

```ts
kids: n(row.la_music_kids || row.total_la_kids),
school: n(row.la_music_school || row.total_la_adultos),
semClassificacao: n(row.la_music_sem_classificacao || row.total_la_sem_classificacao),
```

Endereço: `src/hooks/useKPIsAlunosCanonicos.ts:161-208`, especialmente `:201-203`.

A inspeção de `information_schema.columns` em produção não encontrou nenhuma coluna de `dados_mensais` contendo `kids`, `school`, `adult`, `classif`, `matriculas_base` ou `bolsistas_integrais_regulares`. Assim, os aliases de segmentação acima são `undefined`; a função `n` os converte em zero. Isso explica objetivamente por que uma unidade com centenas de alunos pode exibir Kids/School zerados no caminho histórico.

Há duas nuances adicionais:

- `matriculasBaseAlunosAtivos` possui fallback para `alunos_ativos` no mapper atual (`:190`), portanto não deve ser confundido com o zero observado em outro envelope da RPC;
- MRR, ticket e faturamento podem ser substituídos depois pelo complemento de faturas, então divergência financeira não pode ser atribuída apenas a `dados_mensais` sem rastrear a sobreposição.

### 15.3 Divergência reproduzida com o fechamento governado

Recorte: Campo Grande, julho/2026, unidade `2ec861f6-023f-4d7b-9927-3960ad8c2a92`.

O snapshot mais recente de `fechamento_mensal_snapshots` para o mesmo domínio, unidade e competência estava em versão 1, status `fechado`, com 59 chaves. Uma execução direta da RPC viva, usada apenas como referência diagnóstica, retornou 37 chaves e o mesmo hash em duas chamadas consecutivas. Os conjuntos divergiam:

| Campo | RPC diagnóstica | Snapshot fechado |
| --- | ---: | ---: |
| `faturamento_realizado` | 155.050,29 | 149.495,58 |
| `mrr` | 155.050,29 | 154.939,58 |
| `arr` | 1.860.603,48 | 1.974.222,96 |
| `churn_rate` | 4,83% | 4,56% |
| `alunos_kids` | 0 | 166 |
| `alunos_school` | 0 | 256 |
| `alunos_trancados` | 0 | 16 |
| `matriculas_base_alunos_ativos` | 0 | 422 |
| `bolsistas_integrais_regulares` | 0 | 16 |

Esses números não demonstram que a RPC ou o snapshot seja correto. Demonstram que existem contratos concorrentes. O frontend atual ainda acrescenta um terceiro resultado possível: `dados_mensais` mapeado e depois sobreposto pelo financeiro.

### 15.4 Contrato documentado e decisão pendente

`docs/METRICAS.md:82-86` declara que uma competência encerrada deve ler `fechamento_mensal_snapshots`, porque recalcular o estado vivo devolve o número de hoje, não o número do fechamento. `docs/METRICAS.md:100-106` exige referência congelada e validação de unidade, competência, status e hash no relatório administrativo.

Já `fonteLabel('dados_mensais')` chama essa tabela de “Snapshot fechado” (`src/hooks/useKPIsAlunosCanonicos.ts:154-158`), apesar de ela não ser `fechamento_mensal_snapshots` e não conter todos os campos usados pelo mapper. Ou a implementação precisa migrar para o snapshot governado, ou a decisão arquitetural e o produtor de `dados_mensais` precisam ser formalmente atualizados. Manter os dois como se fossem equivalentes é incorreto.

### 15.5 Investigação obrigatória e correção

- [ ] atribuir responsável funcional do fechamento e responsáveis técnicos do reader e dos dois produtores;
- [ ] reconstruir fechamento, aprovação, retificações, sincronizações e lançamentos retroativos de Campo Grande/julho de 2026;
- [ ] rastrear separadamente o payload de `dados_mensais`, o complemento financeiro e o snapshot governado;
- [ ] reconciliar cada campo divergente com sua fonte primária, sem usar a tela atual como oráculo;
- [ ] confirmar por escrito qual fonte governa competência fechada;
- [ ] se `fechamento_mensal_snapshots` for confirmado, adaptar o reader ao seu envelope e preservar versões/retificações append-only;
- [ ] se `dados_mensais` for confirmado, preencher/versionar os campos obrigatórios, eliminar aliases inexistentes e atualizar a documentação e governança;
- [ ] adicionar teste de contrato que falhe quando o mapper referenciar coluna ausente;
- [ ] adicionar paridade para Campo Grande/julho de 2026 e uma competência sem retificação;
- [ ] validar Dashboard, Analytics, Alunos, Administrativo e Retenção antes do rollout.

### 15.6 Relação com performance

O Anexo A não autoriza criar outra tabela. O histórico já responde em menos de 1 ms no banco; a correção deve escolher e completar uma fonte, não duplicá-la. O Sprint 4B fica restrito ao cálculo vivo da competência aberta, e o Sprint 4C fica restrito ao cache com SLA das superfícies gerenciais.

---

## 16. Decisão recomendada

Iniciar pelo Sprint 0 e, em seguida, pelo Sprint 1A. A primeira hipótese de banco a ser testada é a correção de volatilidade, com o corpo das funções intacto e os timeouts efetivos visíveis no benchmark. O Sprint 1 pode rodar logo depois ou em paralelo, pois não altera o domínio canônico. Em seguida, executar o Sprint 4A para substituir o laço consolidado por uma chamada única somente após paridade e para deduplicar requisições idênticas.

Em paralelo, atribuir o Anexo A e corrigir a fonte histórica; isso é integridade, não performance. Se o 4A não cumprir o budget vivo, executar o Gate 4D. Superfícies gerenciais que aceitarem pequena defasagem seguem pelo Sprint 4C, com SLA declarado. A tela de Alunos e qualquer fluxo que precise refletir um lançamento imediatamente seguem pelo Sprint 4B. O 4B permanece uma iniciativa de alto risco, com oráculo legado, dual-read e soak.

Health Score e KPI de professor vêm depois do caminho compartilhado de Alunos. O frontend só deve migrar para qualquer RPC nova depois que paridade, budget e rollback tenham sido comprovados em ambiente isolado.

Não é recomendado continuar aplicando hotfixes diretamente nas funções públicas em cadeia. Esse padrão preserva compatibilidade no curto prazo, mas já demonstrou custo cumulativo suficiente para derrubar a experiência autenticada.
