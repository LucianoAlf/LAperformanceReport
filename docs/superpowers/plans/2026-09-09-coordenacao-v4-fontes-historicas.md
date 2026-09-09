# Coordenação V4: Fontes e Histórico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o conteúdo V4 usar os mesmos fechamentos de origem dos relatórios gerenciais, corrigir as divergências conhecidas e emitir novas versões de Jun–Ago e Set–Nov sem reescrever histórico.

**Architecture:** O produtor V4 combina a fotografia do Health Score com agregados determinísticos de carteira, presença, comercial e movimentações. Meses fechados são reconciliados com os documentos mensais/gerenciais; ciclo soma numeradores e denominadores dos meses transcorridos, e qualquer falta de origem bloqueia a publicação em vez de fabricar zero.

**Tech Stack:** PostgreSQL 17, JSONB, Supabase snapshots, Node test runner e Docker.

---

## Arquivos e responsabilidades

- Create: `tests/relatorioCoordenacaoFontesV4.test.mjs` — invariantes estáticos e linguagem de ausência.
- Create: `tests/relatorioCoordenacaoFontesV4Postgres.test.mjs` — fixtures para carteira regular, presença acumulada, matrículas, anulações e valores nulos.
- Modify: `supabase/migrations/20260909031111_relatorio_coordenacao_fontes_v4.sql` — produtores determinísticos e substituição do conteúdo V4.
- Create: `docs/auditorias/2026-09-09-paridade-coordenacao-jun-ago.md` — equações e divergências reconciliadas por unidade.

### Task 1: Escrever regressões de negócio em vermelho

**Files:**

- Create: `tests/relatorioCoordenacaoFontesV4.test.mjs`
- Create: `tests/relatorioCoordenacaoFontesV4Postgres.test.mjs`

- [ ] **Step 1: Testar ausência versus zero**

```sql
-- Professor com origem comercial completa e nenhuma matrícula: 0.
-- Professor sem documento/fonte comercial reconciliável: null e publicação bloqueada.
select payload #>> '{professores,0,operacional,matriculas_comerciais}';
select payload #>  '{professores,1,operacional,matriculas_comerciais}';
```

Expected: primeiro valor `0`; segundo valor JSON `null`, nunca `0` por `coalesce` genérico.

- [ ] **Step 2: Testar carteira sem atividade extra e média mensal do ciclo**

```sql
-- Junho: 10 regulares + 2 extras; julho: 14 regulares; agosto: 12 regulares.
-- Ciclo esperado: (10 + 14 + 12) / 3 = 12, não 14, não 38 e não 12+extras.
select (documento #>> '{professores,0,metricas,numero_alunos,valor}')::numeric;
```

Expected: `12.00`; a amostra e o detalhe registram três competências observadas.

- [ ] **Step 3: Testar presença acumulada por numerador/denominador**

```sql
-- Setembro: 8/10; outubro: 9/10; novembro ainda futuro.
-- Esperado em outubro: 17/20 = 85%, nunca média de percentuais e nunca novembro.
```

Também testar professor sem aulas elegíveis: motivo operacional claro e fora do contador de pendências.

- [ ] **Step 4: Testar movimentação anulada e MRR desconhecido**

```sql
-- Uma evasão válida de R$ 400, uma anulada de R$ 300 e uma válida sem valor.
-- Esperado: duas saídas válidas; MRR conhecido R$ 400; uma pendência monetária.
```

O movimento sem valor deve guardar `valor_mrr: null`; `anulado=true` não pode aparecer nem somar.

- [ ] **Step 5: Testar Valdo e a definição de Matriculador**

```sql
-- Jun–Ago Campo Grande: Valdo = 6 matrículas comerciais atribuídas;
-- taxa de conversão permanece uma métrica separada.
```

O teste deve falhar se o produtor usar `matriculas_pos_exp` como quantidade de matrículas ou casar professor apenas pelo nome.

- [ ] **Step 6: Rodar os testes em vermelho**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoFontesV4.test.mjs tests/relatorioCoordenacaoFontesV4Postgres.test.mjs
```

Expected: FAIL nos cinco comportamentos, pois o conteúdo V4 ainda espelha V3.

### Task 2: Implementar os agregadores determinísticos

**Files:**

- Modify: `supabase/migrations/20260909031111_relatorio_coordenacao_fontes_v4.sql`

- [ ] **Step 1: Criar a resolução de meses efetivamente transcorridos**

```sql
create or replace function public.relatorio_coordenacao_periodos_v4(
  p_ano integer, p_mes integer, p_periodicidade text, p_data_corte date
) returns table (competencia date, inicio date, fim date, ordinal integer)
language sql stable set search_path = public, pg_temp;
```

Mensal devolve uma linha. Ciclo devolve do início nominal até `least(p_data_corte, periodo_fim)`, sem criar outubro/novembro em setembro.

- [ ] **Step 2: Criar a carteira regular por competência**

```sql
create or replace function public.relatorio_coordenacao_carteira_v4(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodicidade text, p_data_corte date
) returns table (
  professor_id integer,
  carteira_media numeric,
  meses_observados integer,
  total_turmas integer,
  ocupacoes_elegiveis integer,
  turmas_elegiveis integer,
  media_alunos_turma numeric
)
```

Para cada mês, contar `distinct pessoa_chave` da função de detalhe, filtrando `not coalesce(cursos.is_projeto_banda,false)`. O ciclo usa `avg(carteira_mes)` e `sum(ocupacoes)/sum(turmas_elegiveis)`. Professor sem detalhe fica `null`; não usar `carteira_total_auditado` contaminado.

- [ ] **Step 3: Criar presença acumulada a partir das fotografias mensais**

```sql
create or replace function public.relatorio_coordenacao_presenca_v4(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodicidade text, p_data_corte date
) returns table (
  professor_id integer, numerador numeric, denominador numeric,
  valor numeric, amostra integer, motivo text, codigo text
)
```

Selecionar uma revisão mensal por professor/competência, somar somente numeradores e denominadores confirmados e calcular `100*numerador/denominador`. `calendario_sem_aulas_elegiveis` não é pendência; roster realmente incompleto continua motivo de ausência, sem porcentagem inventada.

- [ ] **Step 4: Criar matrículas comerciais por professor com reconciliação de origem**

```sql
create or replace function public.relatorio_coordenacao_matriculas_v4(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodicidade text, p_data_corte date
) returns table (professor_id integer, matriculas integer, origem_completa boolean)
```

Iterar unidades no consolidado, chamar `matriculas_comerciais_v1` uma vez por unidade/mês e usar `alunos.professor_experimental_id` como identidade. Para mês fechado, comparar o total com o documento comercial ou gerencial vigente. Divergência de total gera `RELATORIO_COORDENACAO_V4_COMERCIAL_DIVERGENTE`, não publicação parcial.

- [ ] **Step 5: Criar movimentações válidas sem coerção monetária**

```sql
create or replace function public.relatorio_coordenacao_saidas_v4(
  p_unidade_id uuid, p_inicio date, p_fim date
) returns jsonb
```

Aplicar `is_movimentacao_admin_retencao_valida`, `coalesce(anulado,false)=false` e exclusão de segundo curso. `valor_mrr` é `coalesce(valor_parcela_evasao, valor_parcela_anterior)` sem terceiro argumento. Somar apenas valores conhecidos e publicar `valores_mrr_pendentes`.

- [ ] **Step 6: Substituir o produtor V4, mantendo o V3 intacto**

`montar_relatorio_coordenacao_conteudo_v4` deve carregar a fotografia V3 uma vez e substituir deterministicamente os blocos `professores`, `carteira_carga`, `presenca`, `saidas_retencao` e `experimentais`. Cada professor recebe carteira corrigida, presença acumulada e Matriculador; conversão e score continuam vindos da fotografia do Health Score.

O envelope interno `origens` guarda IDs/hash/versão dos documentos usados, mas esse bloco não é renderizado em texto público.

- [ ] **Step 7: Rodar os testes em verde**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoFontesV4*.test.mjs tests/relatorioCoordenacaoDocumentoV4*.test.mjs
```

Expected: PASS para carteira, presença, Matriculador, anulação e null monetário.

- [ ] **Step 8: Commit dos produtores**

```powershell
git add tests/relatorioCoordenacaoFontesV4*.mjs supabase/migrations/20260909031111_relatorio_coordenacao_fontes_v4.sql
git commit -m "fix(professores): reconcilia fontes do documento v4"
```

### Task 3: Retificar Jun–Ago e carregar Set–Nov

**Files:**

- Create: `docs/auditorias/2026-09-09-paridade-coordenacao-jun-ago.md`

- [ ] **Step 1: Aplicar a migration de fontes após a sombra aprovada**

Executar advisors antes e depois. A migration só substitui produtores privados; não corta consumidores e não materializa automaticamente.

- [ ] **Step 2: Materializar versões novas fechadas**

Para junho, julho e agosto de 2026, gerar mensal das três unidades e consolidado com `status='retificado'`. Para Jun–Ago, gerar os quatro escopos de ciclo com `status='retificado'`. Nenhuma linha anterior é alterada.

- [ ] **Step 3: Materializar Set–Nov em andamento**

Gerar os quatro escopos com data de corte corrente e `status='preview'`. Confirmar período efetivo terminando em setembro em 09/09/2026, `ranking_habilitado=false` e ausência de outubro/novembro.

- [ ] **Step 4: Executar matriz de paridade**

Por unidade e consolidado, comparar fonte, período, universo, numerador, denominador e valor renderizado para carteira, média/turma, retenção, permanência, presença, matrículas, conversão e movimentações. Validar nominalmente Valdo = 6 em Campo Grande Jun–Ago.

- [ ] **Step 5: Registrar auditoria e commit**

```powershell
git add docs/auditorias/2026-09-09-paridade-coordenacao-jun-ago.md
git commit -m "docs(professores): registra paridade historica da coordenacao"
```

## Revisão do plano

- Percentuais de ciclo usam soma de numeradores/denominadores.
- Meses futuros não entram; ausência não vira zero.
- Atividade extra sai da carteira sem alterar fórmula do Health Score.
- Matriculador é quantidade comercial; conversão permanece separada.
- Anulados saem e MRR desconhecido permanece desconhecido.
- Relatórios gerenciais não são reescritos; divergência compartilhada bloqueia a nova versão até reconciliação.

