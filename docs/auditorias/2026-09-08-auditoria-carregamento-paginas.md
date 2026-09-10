# Auditoria de carregamento de páginas — 2026-09-08

Auditoria executada com agent browser (Chrome DevTools MCP) em `http://localhost:5175` apontando para
o Supabase de produção, logado como admin consolidado, com interceptação de `fetch` (`window.__netlog`)
para medir cada chamada Supabase (endpoint, status, duração) + pg_stat_statements no banco.

⚠️ A varredura todo em ambiente **dev** (React StrictMode dobra efeitos — toda chamada aparece ×2 no
mínimo). Contagens "×4/×6/×12" indicam N componentes independentes puxando o mesmo dado mesmo em
produção; o ×2 residual é artefato de dev.

## Sumário executivo

| # | Achado | Página(s) | Gravidade |
|---|--------|-----------|-----------|
| 1 | **Modo Ciclo de Professores 100% sem dado**: RPC `get_health_score_professor_v3_performance_snapshot_v3(p_periodicidade='ciclo')` retorna 0 linhas para 2026-09 porque snapshot de ciclo nunca é materializado pela automação | Professores (Performance) | 🔴 Crítica |
| 2 | **`get_kpis_professor_periodo_canonico_v3` estoura `statement_timeout=8s` (role authenticated)** — medido 8142 ms → HTTP 500 na carga fria; cards de Professores do Dashboard ficam "-—"/"Aguardando dados"/"Sem base" | Dashboard (seção Professores) | 🔴 Crítica (intermitente) |
| 3 | **Página Retenção quebrada**: embeds `cursos(...)` direto em `movimentacoes_admin` — não existe FK (`PGRST200`). 4 chamadas 400 a cada load | Retenção (`PlanilhaRetencao.tsx`) | 🔴 Crítica |
| 4 | **N+1 pesado no Analytics**: 138 chamadas — `competencias_mensais` ×32, `dados_mensais` ×28, `fechamento_mensal_snapshots` ×26, `get_kpis_alunos_canonicos` ×12 (~19,6 s somados), `unidades` ×9 | Analytics (Gestão Mensal) | 🟠 Alta |
| 5 | **Relatório Diário com coluna inexistente**: `relatorios_diarios.data_relatorio` não existe (real: `data_referencia`) → 400 42703 | Relatórios > Diário | 🟠 Alta |
| 6 | **`vw_renovacao_ciclos?unidade_id=eq` + `null` literal** → `22P02 invalid input syntax uuid` — chamada quebrada no bootstrap (perfil ainda carregando) | Administrativo (Cobertura de Renovação) | 🟠 Alta (flicker/erro silencioso) |
| 7 | **`get_faturas_alunos_financeiro_v1` pesada**: 5,7 s a pior chamada na carga (2 chamadas ~11,7 s somados) — flerta com o timeout de 8 s | Faturas, Alunos | 🟠 Alta |
| 8 | **Boot de Campanhas estalou em ~10 s** em TODAS as chamadas (usuarios, dados_mensais, campanhas_config...) — padrão de trava de refresh de token (supabase-js) | Campanhas (intermitente) | 🟡 Média |
| 9 | **Camada transversal disparada a cada página**: `usuarios` ×3, `permissoes` ×3, `unidades` ×3, `campanhas_config` ×2, `conversas_campanha` ×2, `automacao_invariantes` ×2, `dados_mensais(ano)` ×2-4 — Providers/contextos sem cache compartilhado | Todas | 🟡 Média |
| 10 | **Dashboard soma no cliente**: chama `get_kpis_alunos_canonicos` 1× por unidade (3×) em vez de 1× consolidado | Dashboard | 🟡 Média |
| 11 | Banco: **102 políticas RLS sem `(select auth.*())`** (initplan por linha), 467 políticas permissivas múltiplas, 238 FKs sem índice, 405 índices não usados | Transversal | 🟡 Média (escala) |
| 12 | `vw_health_score_professor_v3_parcial_operacional` absurdamente pesada: **59,5 s** p/ uma consulta com LIMIT 5 | (usada por relatório coordenação?) | 🟡 Média (latente) |
| 13 | Tráfego Pago: menu aparece na sidebar mas a guarda redireciona p/ /app (lista fixa de e-mails diverge do menu) | Tráfego Pago | 🔵 Baixa |

## Causa-raiz detalhada — Professores / Ciclo (achado #1)

**Sintoma**: no modo Ciclo (Set/Out/Nov, competência 2026-09), TODOS os professores mostram "—
SEM BASE OPERACIONAL" e cada métrica "Dados em auditoria" (`fonte_canonica_indisponivel`). Modo
Mensal funciona (score 99 Renan etc.).

**Cadeia**: 

1. `TabPerformanceProfessores.tsx` → `useHealthScoreProfessorV3Performance` → RPC
   `get_health_score_professor_v3_performance_snapshot_v3(p_competencia, p_unidade_id, p_periodicidade)`.
2. A RPC lê apenas snapshots **materializados** (`health_score_professor_v3_snapshots` + métricas).
   Medido: `mensal` = 264 linhas; `ciclo` = **0 linhas** (a página inteira renderiza "sem base" em
   ~91 ms — erro "rápido e silencioso").
3. A materialização diária (`pg_cron`, 4 jobs 06:30–06:45 UTC) chama
   `executar_health_score_professor_v3_job_escopo` — que tem `'mensal'` **hardcoded** na chamada de
   `executar_health_score_professor_v3_escopo_diario(...)`. `ciclo` NUNCA é materializado por
   automação (histórico de execuções `materializacao_execucoes.periodicidade='ciclo'` = vazio).
4. Os snapshots de ciclo existentes (Jul 19–22 e Ago 9–13 + fechamento do ciclo em 04/09) foram
   corridas pontuais/manuais. Por isso "funcionava direito" até o ciclo Jun–Ago fechar: o ciclo novo
   (2026-SET-NOV, já existe na tabela `health_score_professor_v3_ciclos` com estado `aberto`) nunca
   ganhou snapshot.
5. **O dado vivo existe e está computável**: `get_health_score_professor_v3_projecao_viva('2026-09-01',
   null, 'ciclo')` retorna 265 linhas / 46 professores. O banner da própria tela promete
   ("Health Score em andamento usa os dados já disponíveis da competência").

### Opções de correção (discutir antes de mexer — mudança de banco exige aprovação)

| Opção | O quê | Prós | Riscos/Cuidados |
|-------|-------|------|-----------------|
| **A (recomendada)** | Estender o job diário p/ materializar também `periodicidade='ciclo'` (chamada extra em `executar_health_score_professor_v3_job_escopo`) | Alinha com o desenho: snapshot provisório/em_maturação durante ciclo aberto já existia em Jul/Ago; RPC/frontend não mudam; custo roda em cron (sem timeout de tela) | Migration = aprovação. Conferir que ciclo aberto grava `estado='provisorio'/'em_maturacao'` e `ranking_habilitado=false` (não vazar premiação antes de fechar — regra da tela) |
| B | RPC/função com fallback: sem snapshot de ciclo p/ a competência, computar da projeção viva | Zero mudança na automação | **A projeção viva custa ~8,4 s no consolidado** — estoura o statement_timeout=8s da role authenticated. Só viável se a projeção for otimizada primeiro |
| C | Frontend: em ciclo & snapshot vazio, chamar caminho vivo/cacheado (ex.: tabela de retrato, não a view bruta) | Zero banco | Mais uma fonte de verdade no frontend; as views parciais são muito pesadas (parcial_operacional 59,5 s) — precisa de camada de retrato |

Recomendação: **A + (depois) otimização da projeção viva**. A já resolve 100% do sintoma com um caminho
já provado pela própria tabela de snapshots.

## Causa-raiz detalhada — Timeout do KPI de professores (achado #2)

- Role `authenticated` tem `statement_timeout = 8s`; `anon` = 3 s (pg_roles.rolconfig).
- `get_kpis_professor_periodo_canonico_v3(2026, 9, null, '2026-09-01', '2026-09-30')`:
  - Servidor, simulando JWT do admin: **2,19 s**; pg_stat: média 3,75 s (360 chamadas), **pior 7,991 s**
    = cortes exatos no timeout (várias morrem nos 8 s).
  - Browser, carga fria: **8142 ms → HTTP 500** (cards ficam "Aguardando dados"). Carga quente: 1,58 s (200).
- Conclusão: pleno de cache/plano frio estoura o teto. pg_stat mostra outras RPCs beirando: `get_faturas_alunos_financeiro_v1` pior 7,95 s; `app_minha_ponto` 7,96 s; `get_situacao_alunos_v1` 6,6 s; `get_cron_health` 5,7 s.
- Já existe mitigação parcial no banco (`alter function ... set plan_cache_mode = 'force_custom_plan'`) — ajuda, não resolve: a função é cara em si.

## Demais causas pontuais

- **Retenção (#3)**: `PlanilhaRetencao.tsx` (2 selects, evasões + renovações) embeda `cursos(nome,
  is_projeto_banda)` direto em `movimentacoes_admin`. A tabela só tem FK para motivos_saida,
  motivos_trancamento e unidades — **não tem FK p/ cursos** (nem p/ alunos). Correção: tirar o embed
  direto e usar o já existente via `alunos!left(..., cursos(...))`, ou lookup client-side (a tela já
  carrega cursos). Sem migration necessária.
- **Relatório Diário (#5)**: consulta `relatorios_diarios?data_relatorio=eq...`; coluna real é
  `data_referencia`. Só frontend.
- **Administrativo (#6)**: `useCoberturaRenovacao` recebe `unidadeId` null no primeiro render
  (perfil ainda não resolvido; comentário no próprio código admite "pode ser null inicialmente").
  O hook só trata `'todos'`; null escapa e vira `eq.null` → 22P02. Correção: tratar `null/undefined`
  como inativo/skip (ou `unidadeId != null && unidadeId !== 'todos'`).
- **Analytics (#4)**: `useDadosHistoricos`/página de Gestão Mensal dispara consultas por competência
  × unidade × componente. Precisa de agregação (uma query parametricamente ampla + agrupamento no
  cliente) — refator, não bug de dados.
- **Camada transversal (#9)**: `usuarios`, `permissoes`, `unidades`, `campanhas_config`,
  `conversas_campanha`, `automacao_invariantes`, `dados_mensais(anos)` disparam em **toda** navegação,
  várias vezes cada. Falta cache compartilhado (ex.: 1 provider que memoiza por sessão, ou TTL).
- **Banco perf transversal (#11)**: 102 `auth_rls_initplan` (políticas `auth.uid()` sem subselect) é o
  maior multiplicador silencioso de latência quando a massa cresce; corrigir é migration sweep
  (`auth.uid()` → `(select auth.uid())`) — barato e seguro, mas é migration (apreciação do Alf).

## Matriz página × estado (08/09/2026, consolidado, Set/2026)

| Página | Erros de rede | Chamadas Supabase | Observação |
|--------|---------------|-------------------|-----------|
| Dashboard | 1× 500 (timeout 8s) na carga fria; ok na quente | 34 | Professores block é o calcanhar |
| Professores (Performance) | nenhum HTTP — "quebra" é conteúdo vazio | 27–28 | Ciclo = 0 linhas (achado #1); RPC chamada 2× idêntica no mount (StrictMode) |
| Alunos | nenhum | 65 | `alunos` ×6, `get_faturas...` ~11,7 s somados |
| Comercial | nenhum | 41 | `leads` ×4 (máx 1,05 s) |
| Agenda | nenhum | 20 | `get_agenda_dia_v2` ×4 (~3,7 s somados) |
| Faturas | nenhum | 22 | RPC 5,7 s pior chamada |
| Sucesso do Aluno | nenhum | 26 | ok |
| Bandas | nenhum | 22 | `bandas_kpis` ×2 ~1,5 s |
| Administrativo | 2× 400 (`eq.null` uuid) | 47 | achado #6; `motivos_saida` ×6 |
| Metas | nenhum | 20 | ok |
| Analytics (Gestão Mensal) | nenhum | 138 | achado #4 — pior página do app |
| Configurações | nenhum | 26 | ok |
| Pré-Atendimento | nenhum | 42 | ok |
| Campanhas | nenhum (mas boot ~10 s global) | 27 | achado #8 (refresh de token?) |
| Tráfego Pago | — | — | guarda ejetou para /app (achado #13) |
| Time | nenhum | 22 | ok |
| Projetos | nenhum | 38 | `projetos` ×10 (~6,9 s somados) |
| Salas | nenhum | 24 | ok |
| Automações | nenhum | 18 | ok |
| Retenção | 4× 400 (PGRST200 FK cursos) | 26 | achado #3 — quebrada |
| Admin/Usuários | nenhum | 20 | ok |
| Entrada (menu) | nenhum | 16 | ok |
| Relatório Diário | 2× 400 (coluna errada) | 54 | achado #5 |
| Apresentações 2025 | nenhum | 20 | ok |

## Plano de correção sugerido (ordem de execução)

**Fase 0 — Sem banco, só frontend (libera hoje, sem risco de dado):**
1. Retenção: remover embed `cursos(...)` direto de `movimentacoes_admin` nas 2 queries do
   `PlanilhaRetencao.tsx` (usar o embed via `alunos` que já vem junto ou lookup por mapa). Teste: página abre sem 400.
2. Administrativo: blindejar `useCoberturaRenovacao` p/ `unidadeId == null` (skip, sem chamar).
3. Relatório Diário: `data_relatorio` → `data_referencia`.
4. Cache transversal: um provider único p/ `usuarios/permissoes/unidades/campanhas_config/
   conversas_campanha/automacao_invariantes/dados_mensais(ano)` com TTL (resolve o ×3–×4 de produção
   e abaixa ruído em toda navegação).

**Fase 1 — Ciclo de Professores (o problema central) — exige OK do Alf p/ migration:**
5. Opção A: `executar_health_score_professor_v3_job_escopo` materializa `ciclo` além de `mensal`
   (1 chamada extra por escopo). Validar antes em ambiente controlado: snapshots ficam
   `provisorio/em_maturacao`, `ranking_habilitado=false` até `fechar_health_score_professor_v3_ciclo`.
6. Antes do ciclo virar dado oficial, rodar UMA materialização manual do 2026-SET-NOV p/ ciclo abrir
   com dados (pode ser a mesma função de escopo, pela edge/service — ponto de aprovação).

**Fase 2 — Latência/Timeouts (SELECT first, plano depois):**
7. Perfilar `get_kpis_professor_periodo_canonico_v3` (EXPLAIN ANALYZE das CTEs mais caras), índices
   nas FKs usadas pelas políticas (238 FKs sem índice) e sweep `auth_rls_initplan` (102 políticas).
8. `get_faturas_alunos_financeiro_v1` e `vw_health_score_professor_v3_parcial_operacional` são as
   próximas bombas (7,95 s pior / 59,5 s) — criar retrato/tabela materializada p/ o parcial.
9. Analytics: agregar as chamadas por competência em lote (uma por bloco, agrupar no cliente).

**Fase 3 — Higiene:**
10. Tráfego Pago: alinhar sidebar × guarda (featured flag em vez de lista fixa, ou esconder do menu).
11. Campanhas: investigar a trava de ~10 s (provável refresh de sessão GoTrue lento — ver logs auth).
12. Remover StrictMode double-fire de efeitos custosos (ou aberto p/ decisão: desligar StrictMode de
    dev só nas páginas pesadas).

## O que NÃO foi feito (por trava de segurança)

- Nenhuma migration, INSERT, UPDATE, DROP ou re-materialização em produção — fases 1 e 2 aguardam
  aprovação explícita do Alf (ver `.claude/skills/sol-la-report-business-rules`).
- Página Tráfego Pago não auditada por dentro (conta logada fora da lista fixa de acesso).
