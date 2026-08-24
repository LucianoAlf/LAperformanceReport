# Auditoria Backend — Módulo Bandas (cruzada contra a spec)

**Data:** 2026-08-24
**Escopo:** auditoria read-only (SELECT-only) do backend do módulo Bandas, feita no banco real (projeto `LA Performance Report`, ref `ouqwbbermlzqqvtqwlul`), antes da construção do frontend.
**Contexto:** backend construído por Claude (tabelas + RPCs); frontend será construído consumindo as RPCs via Supabase client. A página deve **nascer populada** com as bandas já existentes.

> ⚠️ **Não existe nenhuma migration no repo** (`supabase/migrations/`) para este módulo — tudo foi aplicado direto no banco. Pedir dump para versionamento.

---

## ✅ O que está BOM

- **6 tabelas criadas**: `banda`, `banda_integrante`, `banda_evento`, `banda_evento_participante`, `banda_repertorio`, `banda_curso_depara` — com PKs, UNIQUEs (`banda.turma_chave`, `banda_integrante(banda_id, aluno_id)`, `banda_evento_participante(evento_id, banda_id)`) e índices bem cobertos (`idx_banda_unidade_curso`, `idx_banda_evento_unidade_data`, `idx_banda_integrante_banda`, `idx_banda_integrante_aluno`, `idx_banda_repertorio_banda`, `idx_banda_evento_part_*`).
- **14 das 15 RPCs do contrato existem**, todas `SECURITY DEFINER` com `search_path=public` fixado (proteção correta contra search_path hijack) e defaults batendo 1:1 com a spec (`p_unidade_id NULL`, `p_min_integrantes=3`, `p_status 'ensaiando'` etc.).
- **Design de roster vivo**: integrantes derivam de `alunos` via `turma_chave` (`unidade|curso|dia|horário|prof`, calculada por `banda_chave_turma`), e `banda_integrante` é só overlay (instrumento/função/observações). Por isso a página **nasce populada**: **47 bandas** (Recreio 23, Campo Grande 19, Barra 5), 100% com produtor e horário preenchidos.
- `banda_reconciliar_turmas` é idempotente (`on conflict (turma_chave) do nothing`), como a spec pede.
- KPIs ao vivo funcionam: 129 alunos em banda (Barra 12, CG 48, Recreio 69), permanência média por unidade (5,8 / 11,1 / 6,4 meses).
- `banda_curso_depara` populada com os 3 cursos de banda: Power Kids (25), Minha Banda Para Sempre (33), GarageBand (38).

---

## 🔴 CRÍTICO — corrigir no backend ANTES do frontend

### 1. Roster conta evadidos e inativos como integrantes

Todas as RPCs de leitura filtram só `coalesce(al.is_ex_aluno,false)=false` — mas o sync do Emusys muda `status` **sem** mexer em `is_ex_aluno` (regra canônica: o sync ignora `status`).

**Medido no banco:** 21 integrantes fantasmas (13 `evadido` + 8 `inativo`) distribuídos em 12+ bandas. Caso extremo: banda 43 ("Minha Banda Para Sempre · Quinta 16h", Campo Grande) aparece com **5 integrantes e todos são evadidos** — zero ativos reais.

**RPCs afetadas:** `bandas_listar`, `banda_integrantes`, `banda_detalhe`, `bandas_kpis` (os 129 incluem os 21 fantasmas), `bandas_para_garimpar` (banda vazia de verdade não aparece como "com vaga").

**Fix sugerido:** filtrar `al.status = 'ativo'` (ou excluir `evadido`/`inativo`/`trancado` — pela regra canônica, trancado também não conta) nas 5 RPCs.

### 2. `anon` tem GRANT EXECUTE em TODAS as RPCs — inclusive as de escrita

`banda_evento_criar`, `banda_integrante_upsert`, `banda_atualizar_identidade` e `banda_repertorio_adicionar` são chamáveis **sem login**, só com a anon key (que é pública no bundle do app). E `banda_integrantes` devolve `responsavel_telefone`/`whatsapp` (PII, majoritariamente de menores) para `anon`.

**Precedente no repo:** `supabase/migrations/20260822210000_revoga_anon_rpcs_sol_item8.sql` (revogou anon das RPCs da Sol pelo mesmo motivo).

**Fix sugerido:** `REVOKE EXECUTE FROM anon` em todas as `banda%`, mantendo só `authenticated`.

---

## 🟠 IMPORTANTE — afeta "nascer completa"

### 3. `cursos.capacidade_maxima` é NULL nos 3 cursos de banda

`bandas_para_garimpar` retorna `capacidade: null, vagas: 0` para sempre. A aba Garimpar nasce manca sem esse dado (ou sem um default por curso).

### 4. Sem cron para `banda_reconciliar_turmas`

A spec prevê cron ("idempotente; p/ cron"). Verificado `cron.job`: **nada agendado**. Sem isso, turma nova de banda não vira banda sozinha.

### 5. Falta `banda_repertorio_importar_cifraclub`

Está na lista de RPCs da spec e **não existe** no banco. Aba Repertório nasce sem a importação.

### 6. Fila de conciliação sem saída

`banda_conciliacao_roster` (fila da Jéssica) lista divergências, mas **não há RPC para resolver** (marcar `ativo=false`/`data_saida` — o `banda_integrante_upsert` sempre força `ativo=true`). A fila nunca esvazia. Mesmo gap para **editar/cancelar evento** e **remover música do repertório** — confirmar se entra no escopo.

### 7. Risco de design na `turma_chave`: troca de produtor cria banda nova

A chave inclui o professor (`...|horario|prof`). Se o produtor da turma trocar, `banda_reconciliar_turmas` cria uma **banda nova** (chave nova) em vez de atualizar a existente → duplicata, e a banda antiga fica com roster zerado (todos caem na fila de conciliação). Avaliar casar a reconciliação por `unidade+curso+dia+horário` e apenas **atualizar** o `produtor_professor_id` da banda existente.

---

## 🟡 PONTOS DE ATENÇÃO (frontend contorna, mas registrar)

- **RLS ativo com ZERO políticas** nas 6 tabelas (fail-closed). Correto como defesa, mas significa: o frontend **nunca** pode fazer `supabase.from('banda')` — só `supabase.rpc(...)`.
- **Sem FKs** para `unidades`, `cursos`, `professores`, `alunos`, `salas` — a integridade referencial depende inteiramente das RPCs.
- **Sem CHECKs de domínio**: `banda_evento.tipo` (ensaio/show), `banda_evento.status`, `banda_repertorio.status` e `banda_integrante.funcao` aceitam qualquer texto. Validar com zod no frontend; idealmente o banco trava.
- **Backend não versionado nem documentado**: nada em `supabase/migrations/` e nada nos docs canônicos (`docs/MAPA-SISTEMA.md`, `docs/REGRAS-DE-NEGOCIO.md`, `docs/METRICAS.md`) — o CLAUDE.md exige manter os quatro atualizados no mesmo commit ao mexer em páginas/RPCs.
- **47/47 bandas com `precisa_revisar_nome=true`** — esperado (nomes auto-gerados tipo "Power Kids · Terça 20h", `origem_nome='default'`). A UI precisa destacar a badge e a ação de renomear via `banda_atualizar_identidade` (que já zera o flag e marca `origem_nome='manual'`).
- `bandas_kpis` **não retorna "ocupação"** (KPI pedido na spec do dashboard) — depende do item 3 (capacidade_maxima).

---

## Contrato de RPCs — status individual

| RPC | Spec | Banco | Observação |
|---|---|---|---|
| `bandas_listar(p_unidade_id?, p_status?)` | ✅ | ✅ | ⚠️ conta evadidos/inativos (item 1) |
| `banda_detalhe(p_banda_id)` | ✅ | ✅ | ⚠️ idem na contagem |
| `banda_integrantes(p_banda_id)` | ✅ | ✅ | ⚠️ idem; retorna `status_aluno` (frontend pode exibir) |
| `bandas_kpis(p_unidade_id?, p_min_integrantes=3)` | ✅ | ✅ | ⚠️ inflado; sem "ocupação" |
| `bandas_para_garimpar(p_unidade_id?, p_min_integrantes=3)` | ✅ | ✅ | ⚠️ `vagas=0` sempre (capacidade NULL) |
| `banda_eventos_listar(p_unidade_id?, p_desde?)` | ✅ | ✅ | ok (tabela vazia hoje) |
| `banda_evento_participantes(p_evento_id)` | ✅ | ✅ | ok |
| `banda_repertorio_listar(p_banda_id)` | ✅ | ✅ | ok (tabela vazia hoje) |
| `banda_atualizar_identidade(...)` | ✅ | ✅ | zera `precisa_revisar_nome` ao renomear ✅ |
| `banda_integrante_upsert(...)` | ✅ | ✅ | ⚠️ sempre `ativo=true` — não desativa |
| `banda_evento_criar(...)` | ✅ | ✅ | sem validação de `tipo`/domínio |
| `banda_repertorio_adicionar(...)` | ✅ | ✅ | ok |
| `banda_repertorio_importar_cifraclub` | ✅ | ❌ | **não existe** |
| `banda_conciliacao_roster(p_unidade_id?)` | ✅ | ✅ | ⚠️ sem RPC de resolução |
| `banda_reconciliar_turmas()` | ✅ | ✅ | ⚠️ sem cron; risco duplicata p/ troca de prof |
| `banda_chave_turma(...)` | — | ✅ | helper interno (não está na spec, ok) |

---

## Frontend — pontos de integração verificados e prontos

- Todos os componentes da spec existem em `src/components/ui/`: `page-filter-bar.tsx`, `page-tabs.tsx`, `UnidadeFilter.tsx`, `AutocompleteAluno.tsx`, `combobox-nome.tsx`, `Paginacao.tsx`, `ImageCropUpload.tsx`, `DonutChart.tsx`, `DistributionChart.tsx`, `BarChartHorizontal.tsx`, `KPICard.tsx`, `KPIGrid.tsx`, `time-picker-24h.tsx`, `date-picker.tsx`, `calendar.tsx`, `ModalConfirmacao.tsx`, `AlertBanner.tsx`, `Typography.tsx`, `select.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `checkbox.tsx`, `switch.tsx`, `badge.tsx`.
  - **Observação:** o barrel `src/components/ui/index.ts` só exporta 14 deles — o padrão real do código é import direto (`@/components/ui/button`). Seguir o padrão existente, não alterar o barrel.
- **Sidebar:** entrada vai no array `operacional` em `src/components/App/Layout/AppSidebar.tsx` logo após Alunos (`/app/alunos`, linha 87), + entrada no `prefetchMap` (linhas 48-68).
- **Router:** padrão lazy com named export em `src/router.tsx`, espelhando `AlunosPage` (linha 98).

---

## Resumo de pendências para o backend (Claude)

| # | Item | Severidade | Bloqueia frontend? |
|---|---|---|---|
| 1 | Filtrar `status='ativo'` nos rosters (5 RPCs) | 🔴 | **Sim** |
| 2 | `REVOKE EXECUTE FROM anon` em todas as `banda%` | 🔴 | **Sim** (segurança) |
| 3 | Preencher `capacidade_maxima` dos 3 cursos | 🟠 | Garimpar nasce manco |
| 4 | Cron para `banda_reconciliar_turmas` | 🟠 | Não |
| 5 | Criar `banda_repertorio_importar_cifraclub` | 🟠 | Aba Repertório sem importação |
| 6 | RPC de resolução da conciliação (desativar integrante) | 🟠 | Fila da Jéssica sem ação |
| 7 | Decidir comportamento ao trocar produtor (turma_chave) | 🟠 | Não (risco futuro) |
| 8 | Dump das migrations p/ `supabase/migrations/` + atualizar docs canônicos | 🟡 | Não |
| 9 | CHECKs de domínio (tipo evento, status) | 🟡 | Frontend valida com zod |

Os itens **1 e 2 são bloqueadores**. O resto o frontend contorna com zod e estados vazios.
