# Handoff — LA Report: Professores, KPIs canônicos e relatórios

**Data:** 08/08/2026  
**Origem:** Codex  
**Destino:** próximo chat no Claude  
**Repositório:** `LucianoAlf/LAperformanceReport`  
**Produção / branch remota de referência:** `origin/main` no commit `8d049d5b1481d7b191000ddc2bd37a4eb759c463`.

## 1. Objetivo deste documento

Este é o estado de passagem para continuar o trabalho sem rediagnosticar o que já foi provado.
Ele separa:

- correções **já publicadas**;
- decisões de negócio que não podem ser reinterpretadas;
- evidências e limites conhecidos;
- pendências reais, na ordem segura de execução.

Não trate branches, worktrees ou documentos antigos como prova de publicação. A referência é sempre
`origin/main` e a validação no ambiente produtivo.

---

## 2. Regras de negócio e guardrails inegociáveis

### Health Score Professor V3

1. **Não alterar a fórmula do V3.** Isto inclui métricas, pesos, metas, critérios de cobertura,
   maturidade, classificação, configuração ativa e regras de comparabilidade.
2. Configuração ativa e snapshot fechado são imutáveis. Mudança de regra passa por rascunho,
   simulação e ativação governada; não por edição direta.
3. Correção de **leitura** pode mudar o número que a tela exibe quando ela antes misturava registros
   de escopos diferentes. Isso não é mudança de fórmula, mas deve ser documentado e auditável.
4. Ausência de dado só pode ser exibida como `sem base`, `em maturação` ou equivalente depois de uma
   leitura bem-sucedida. Falha técnica deve aparecer como **dados indisponíveis**, nunca como atributo
   do professor.

### Fonte e fechamento de Alunos

1. **Emusys é a fonte de verdade** do Grupo LA; o LA Report é espelho.
2. MRR de gestão é `valor da parcela × alunos pagantes`, incluindo inadimplentes. Não confundir com
   valor efetivamente recebido (financeiro / caixa).
3. Estado e fato têm tempos diferentes:
   - **estado** é retrato da virada; não deve ser recalculado no passado usando estado atual;
   - **fato** usa a data do evento e pode chegar após a virada, dentro da carência;
   - competência fechada não pode ser recalculada cegamente pela função viva.
4. Evasão considerada na gestão: somente saída de aluno pagante regular; bolsista, segundo curso,
   banda e projeto não entram. MRR perdido usa a parcela cheia do aluno elegível que saiu.

---

## 3. O que foi corrigido e publicado

### 3.1 Performance de Professores: recuperação do caminho crítico

**Problema original.** A página chamava
`get_health_score_professor_v3_performance` para recalcular dezenas de professores durante o clique.
O recálculo podia consumir aproximadamente 10,8–11,7 s, enquanto o papel `authenticated` tinha
`statement_timeout` de 8 s. Resultado: HTTP 500, página sem nomes/KPIs e efeito cascata em chamadas
da mesma tela.

**Correção publicada.**

- Leitor de snapshot direto: `get_health_score_professor_v3_performance_snapshot_v3`.
- Leitura estável por `professor_id, metrica`; não depende da ordem implícita de `UNION ALL`.
- Metadados de retrato no contrato: quando calculado, execução, estado e defasagem.
- Para competência aberta, a tela consome o último retrato permitido; não aciona recálculo síncrono
  pelo clique.
- A referência de desempenho medida para leitura pura de snapshot foi cerca de **514 ms**; o objetivo
  era ficar abaixo de 1 s, não aumentar timeout do usuário.

**Arquivos/migrations principais na `main`:**

- `supabase/migrations/20260808194000_health_score_v3_snapshot_reader_ordem_estavel.sql`
- `tests/healthScoreProfessorV3SnapshotReader.test.mjs`
- commit `2a0733c7` — estabilização do leitor e cron V3.

### 3.2 Agosto/2026 materializado e cron de prevenção

O incidente de agosto aconteceu porque não havia snapshots do mês aberto. A materialização é
append-only; por isso a execução precisou ser explícita por escopo, sem repetir a Barra.

**Estado operacional validado durante a recuperação:**

| Escopo | Linhas do leitor | Professores |
|---|---:|---:|
| Barra | 114 | 19 |
| Campo Grande | 192 | 32 |
| Recreio | 144 | 24 |
| Consolidado | 258 | 43 |

**Cron publicado.**

- Materializa diariamente apenas a competência aberta;
- usa fingerprint para registrar `sem_alteracao`, sem gerar revisão física duplicada;
- exige escopo explícito (`unidade` ou `consolidado`), evitando que `unidade_id = null` replique
  unidades já materializadas;
- registra execução, status, snapshot IDs, erro e ator;
- alerta Alf e Hugo via o fluxo existente de WhatsApp se a materialização falhar.

**Arquivos principais:**

- `supabase/migrations/20260808193000_health_score_v3_cron_diario_idempotente.sql`
- `supabase/functions/projeto-alertas-whatsapp/index.ts`
- `tests/healthScoreProfessorV3CronDiario.test.mjs`
- `tests/healthScoreProfessorV3Alert.test.mjs`
- commit `7369d26c` — alerta do cron.

**Não foi ativado neste pacote:** fechamento mensal oficial no dia 5, ranking e retenção física de
snapshots. Estão documentados em pendências.

### 3.3 Consolidado de Professores: leitura híbrida corrigida

**Defeito antigo identificado.** O filtro Consolidado fazia consultas unitárias em sequência e
normalizava somente por professor. Em professor multiunidade, isso podia juntar score de uma unidade
com pilares de outra. Além disso, sem `ORDER BY` o resultado podia variar entre carregamentos.

**Correção.** O Consolidado passou a ler o retrato `escopo = consolidado` calculado no banco. A
ordenação determinística foi adicionada no leitor de snapshots. Não houve mudança de fórmula V3.

**Evidência:**

- agosto/2026 teve 28 professores multiunidade: 23 em duas unidades e 5 em três;
- 27 tinham score consolidado; Ana Beatriz estava sem score por cobertura 0%, condição real de
  cobertura, não erro de leitura;
- o documento de impacto traz score e os seis pilares por professor, unidade e consolidado.

**Documento canônico de impacto:**

- `docs/auditorias/2026-08-08-impacto-professores-multiunidade.md`

Não tentar forçar paridade entre score unitário e consolidado: são perguntas diferentes. A paridade
necessária é snapshot consolidado contra leitor consolidado.

### 3.4 Carteira de Professores: disponibilidade e apresentação

**Falhas encontradas.** A Carteira era apagada por RPCs complementares que podiam expirar; uma falha
chegou a produzir `PGRST202` para `get_contagem_trancados_professores`. Havia também divergência de
cabeçalho/colunas e rolagem vertical interna ruim.

**Correções publicadas.**

- A carteira contratual permanece visível se enriquecimentos opcionais expirarem; o dado faltante
  aparece como indisponível, não zera a página nem inventa `sem base`.
- Cabeçalho e células foram alinhados com a mesma estrutura de tabela da Performance.
- O cabeçalho integrado foi restaurado.
- A rolagem vertical interna `max-h-[70vh] overflow-auto` foi removida das abas Performance e
  Carteira. A página é quem rola verticalmente, como no Cadastro; a rolagem horizontal foi mantida
  para proteger as colunas largas.

**Commits principais:**

- `a03b10f0` — Carteira continua visível sob timeout opcional;
- `fffe5b54` — restauração do cabeçalho;
- `2fe0a6cd` e `a844487c` — régua, colunas e alinhamento;
- `8d049d5b` — rolagem vertical da página (último commit da `main` neste handoff).

**Testes associados:**

- `tests/professoresConsultasOpcionais.test.mjs`
- `tests/carteiraCabecalho.test.mjs`
- `tests/carteiraDisponibilidadeProgressiva.test.mjs`
- `tests/professoresRolagemPagina.test.mjs`

### 3.5 KPIs de Alunos: correção de desempenho já promovida

O diagnóstico provou que o gargalo não era fan-out de rede, CDN, materialização ou falta geral de
índices. A busca lateral em `aluno_jornada_matricula_disciplina` rodava 1.609 vezes sem índice em
`(unidade_id, emusys_matricula_id)`.

**Índice B1 promovido em produção:**

```sql
create index concurrently idx_jornada_unidade_emusys_matricula
on public.aluno_jornada_matricula_disciplina (unidade_id, emusys_matricula_id)
where emusys_matricula_id is not null;
```

Medição na branch de diagnóstico: consolidado aberto aquecido caiu de cerca de **5.190 ms / 1,30 M
shared hits** para **305 ms / 66 mil shared hits**, com paridade exata de 12 payloads. `VACUUM FULL`,
índice covering e reescrita ampla foram deliberadamente descartados do caminho crítico.

---

## 4. O que não pode ser considerado resolvido

### P0 — confirmar o comportamento real pós-deploy

O usuário confirmou visualmente que Performance e Carteira estão abrindo fluidas. Ainda assim, o
próximo chat deve registrar um smoke autenticado, no navegador, em:

1. Barra;
2. Campo Grande;
3. Recreio;
4. Consolidado.

Para cada um, conferir Performance e Carteira, ausência de HTTP 500, ausência de `sem base` falso,
dados contratuais preservados e rolagem vertical somente da página.

### P1 — eliminar a causa das RPCs auxiliares lentas

O hotfix impede que a Carteira suma, mas não torna rápidas as consultas abaixo:

- `get_kpis_professor_periodo_canonico_v3` — enriquecimento da Carteira;
- `get_kpis_turmas_canonicos_v2` — Média/Turma em Professores e Dashboard.

Elas já retornaram `57014 / canceling statement due to statement timeout` sob o papel
`authenticated`. Não aumentar o timeout como solução. Fazer diagnóstico como o de Alunos:

1. baseline com `EXPLAIN (ANALYZE, BUFFERS)` por unidade e consolidado;
2. localizar loop, scan repetido, spill ou índice faltante;
3. mudar uma causa por vez, com payload/paridade;
4. provar no navegador autenticado.

Também auditar/normalizar a versão e os grants de `get_contagem_trancados_professores`, pois houve
drift entre banco, schema cache e repositório. Não abrir `get_carteira_professores` para `anon/PUBLIC`
sem decisão de segurança explícita.

### P2 — fechamento mensal oficial de Health Score

O cron diário do mês aberto está publicado. **Ainda não existe fechamento mensal oficial automatizado**
para junho/julho/agosto, nem promoção automática no dia 5.

Desenho aprovado, mas não executar sem novo gate:

- competência aberta: último retrato provisório/em maturação permitido;
- competência fechada: somente snapshot oficial;
- oficializar por clonagem da última revisão materializada, sem recálculo vivo do passado;
- toda a cobertura consumida pela tela deve ser clonada, incluindo maturação e sem-base;
- mensal não habilita ranking;
- paridade é entre snapshot de origem e snapshot oficial clonado, não contra cálculo vivo;
- antes de ligar a regra, oficializar retroativamente os meses existentes ou a tela passará a
  exibir `Fechamento indisponível` em meses consultados.

### P3 — ranking do ciclo

Ranking permanece exclusivo do ciclo oficial fechado. Não antecipar a publicação do ciclo
Jun/Jul/Ago sem decisão humana sobre agosto e comparabilidade. Não há motivo para mudar a fórmula
para fazer ranking aparecer.

### P4 — retenção/compactação de snapshots

A tabela de snapshots é append-only e grava múltiplos registros físicos por retrato lógico. A
retenção foi aprovada apenas em **modo simulação**: listar o que removeria, motivos, espaço e
recusados. Não ativar `DELETE` sem validação posterior. O materializador de revisão única é outro
trabalho, posterior à estabilidade do leitor/cron, usando a Barra como oráculo inicial.

### P5 — integridade de competência fechada no domínio de Alunos

Não tratar isto como performance:

- `dados_mensais` e snapshots divergiram em campos financeiros e de segmentação;
- campos ausentes em `dados_mensais` não podem virar zero — devem ser `null`/`—` e não compor soma;
- junho precisa preservar estado da versão 1 e combinar somente os fatos aprovados;
- captura de estado na virada e fatos no dia 5 são desenhos distintos;
- sem histórico de vigência no Emusys, estado passado não pode ser reconstruído com fidelidade.

Antes de retificação automática ou backfill, classificar os campos em `estado`, `fato` e `derivado`.
Campos de estado não são recalculados de competência passada usando dados presentes.

---

## 5. Ordem recomendada para o próximo chat

1. Fazer e registrar o smoke autenticado de Professores nas quatro visões.
2. Diagnosticar `get_kpis_turmas_canonicos_v2`; é a pendência que ainda afeta Professores e
   Dashboard.
3. Diagnosticar `get_kpis_professor_periodo_canonico_v3` e `get_contagem_trancados_professores`.
4. Só então retomar fechamento mensal oficial/retrospectivo e ranking.
5. Tratar os snapshots de Alunos e retificação de junho como frente separada; não misturar com o
   Health Score.

---

## 6. Estado de repositório e segurança de trabalho

- A `main` remota estava em `8d049d5b` neste handoff.
- Há vários worktrees/branches de outros chats. Não assumir que branch não integrada é pendência
  deste trabalho; confirmar dono, escopo e testes antes de mesclar.
- **Não usar** `diag-kpis-alunos-20260805` para trabalho de Professores. A frente de Alunos tem
  decisões e registros próprios.
- Criar uma branch/worktree dedicada por frente. Há histórico de alterações append-only e de
  migrations: misturar frentes torna rollback e auditoria perigosos.
- Não resetar, não fazer checkout destrutivo e não apagar dados/snapshots para "limpar" uma
  situação. Validar alvo e rollback antes de qualquer operação de banco.

---

## 7. Verificações realizadas no último rollout de UI

Para o commit `8d049d5b`:

- testes: 5/5 passaram (`professoresRolagemPagina`, `carteiraCabecalho`,
  `carteiraDisponibilidadeProgressiva`);
- `npm run build`: exit code 0;
- integração por fast-forward em worktree limpa, sem tocar nos worktrees de outros chats;
- bundle da produção Vercel foi inspecionado após deploy: as duas tabelas contêm
  `overflow-x-auto` e não contêm `max-h-[70vh]` no shell de Performance/Carteira.

Os avisos de chunks grandes/circularidade do Recharts existem no build e **não** foram introduzidos
por este rollout. São dívida técnica separada.

---

## 8. Comandos/consultas de orientação (não executar cegamente)

Verificar referência remota e mudanças não integradas:

```powershell
git fetch origin
git log --oneline --decorate -20 origin/main
git branch --no-merged origin/main
git worktree list
```

Ponto de partida para a pendência de Média/Turma:

```sql
explain (analyze, buffers)
select *
from public.get_kpis_turmas_canonicos_v2(/* parametros reais da tela */);
```

Não execute alteração, índice, `VACUUM FULL`, materialização ou retificação em produção antes de:

1. baseline e paridade;
2. branch de banco ou ambiente de teste;
3. aprovação explícita do Alf quando houver qualquer mudança de número exibido.

