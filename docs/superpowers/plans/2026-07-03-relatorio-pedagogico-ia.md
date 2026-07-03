# Relatório Pedagógico com IA — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implementar fase a fase (0 → 3). Cada fase deve compilar (`npm run build`) antes de avançar.

**Goal:** Gerar, com IA, um relatório pedagógico do aluno a partir do conteúdo real das aulas (campo `anotacoes` do Emusys), escrito na voz da equipe pedagógica, com escolha de período (mensal / semestral / anual / intervalo livre no calendário). O texto é um **rascunho editável** que o coordenador revisa antes de imprimir/enviar, é **salvo no banco** (histórico + reuso futuro pelo agente Fábio no WhatsApp) e usa **Gemini 3 Flash** (padrão do projeto).

**Architecture:**
```
Aba "Histórico Pedagógico" (ModalFichaAluno)
  → seletor de período → botão "Gerar com IA"
      → supabase.functions.invoke('gerar-relatorio-pedagogico', { aluno_id, periodo })
          → edge (service_role): RPC get_relatorio_pedagogico_aluno(aluno, ini, fim)
          → monta prompt (voz pedagógica, anti-alucinação, privacidade de turma)
          → Gemini 3 Flash → JSON estruturado (por instrumento + geral + atenção + próximos passos)
          → INSERT em relatorios_pedagogicos
      → front mostra em editor → coordenador ajusta → salva edição → Imprimir (template atual)
Fase 4 (depois): Fábio reusa a mesma tabela/edge p/ enviar ao responsável via WhatsApp.
```

**Tech Stack:** Supabase (PostgreSQL + RLS + Edge Functions/Deno), React 19 + TypeScript + Vite, Tailwind, Sonner (toasts), Lucide icons. Fonte de dados única = RPC `get_relatorio_pedagogico_aluno` (já existe; será estendida com período).

## Decisões (validadas com o Luciano — 2026-07-03)
- Rascunho **editável** → depois imprime.
- **Salvar** em tabela (`relatorios_pedagogicos`) — histórico + reuso Fábio.
- Modelo: **Gemini 3 Flash** (`gemini-3-flash-preview`).
- Estrutura: **por instrumento + visão geral + pontos de atenção + próximos passos**.

## Global Constraints
- Projeto **sem suíte de testes** automatizados → verificação = `npm run build` (checagem TS) + teste manual.
- **Banco:** frontend passa por `src/lib/supabase.ts` (sem React Query; hooks/effects customizados).
- **Migrations/edge:** aplicar via MCP Supabase (`apply_migration`, `deploy_edge_function`), project_id `ouqwbbermlzqqvtqwlul`. **Confirmar com o usuário antes de aplicar migration** em produção.
- **RLS por unidade (padrão `metas`):** `is_admin() OR (unidade_id = get_user_unidade_id())`.
- **Trigger updated_at:** função genérica existente `set_updated_at()`.
- **Idioma:** variáveis, funções e comentários em português.
- Commit só dos arquivos da feature (não tocar em mudanças não relacionadas no working tree).

## Regras de conteúdo (embutir no prompt)
1. **Anti-alucinação:** escrever **apenas** com base nas anotações do período. Poucas/nenhuma aula → declarar isso; não inventar evolução.
2. **Privacidade de turma:** anotações de aula em grupo podem citar outros alunos → focar **exclusivamente** no aluno do relatório e **nunca** expor nomes de terceiros.
3. **Voz:** equipe pedagógica escrevendo ao responsável — acolhedor e profissional; citar o professor de cada instrumento.

---

### Fase 0: RPC com filtro de período

**Files:** migration `estender_get_relatorio_pedagogico_periodo`.

- [ ] Estender `public.get_relatorio_pedagogico_aluno(p_aluno_id integer, p_data_inicio date default null, p_data_fim date default null)`.
- [ ] Filtrar o CTE `aulas` por `ae.data_aula >= p_data_inicio` (quando não nulo) e `<= p_data_fim` (quando não nulo). Nulls = comportamento atual (tudo).
- [ ] Incluir no JSON de saída um bloco `periodo` (`{ data_inicio, data_fim }`) para rastreabilidade.
- [ ] Manter `grant execute ... to anon, authenticated`. Compatível com o frontend atual (params opcionais).

### Fase 1: Tabela `relatorios_pedagogicos`

**Files:** migration `criar_relatorios_pedagogicos`.

- [ ] Confirmar com o usuário antes de aplicar.
- [ ] Criar tabela:
```sql
create table public.relatorios_pedagogicos (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       integer not null,
  pessoa_nome    text not null,
  unidade_id     uuid references public.unidades(id),
  periodo_tipo   text not null check (periodo_tipo in ('mensal','semestral','anual','custom')),
  data_inicio    date,
  data_fim       date,
  conteudo_json  jsonb,      -- estruturado (por instrumento + geral + atenção + próximos passos)
  conteudo_editado text,     -- texto final após edição humana (o que é impresso/enviado)
  modelo_ia      text,
  status         text not null default 'rascunho' check (status in ('rascunho','finalizado','enviado')),
  gerado_por     uuid,
  gerado_em      timestamptz not null default now(),
  editado_em     timestamptz,
  updated_at     timestamptz not null default now()
);
create index idx_relped_aluno on public.relatorios_pedagogicos(aluno_id);
create index idx_relped_unidade on public.relatorios_pedagogicos(unidade_id);
create trigger trg_relped_updated_at before update on public.relatorios_pedagogicos
  for each row execute function public.set_updated_at();
alter table public.relatorios_pedagogicos enable row level security;
-- RLS padrão metas: is_admin() OR unidade_id = get_user_unidade_id()
```
- [ ] Políticas RLS (select/insert/update) no padrão `metas`.

### Fase 2: Edge function `gerar-relatorio-pedagogico`

**Files:** `supabase/functions/gerar-relatorio-pedagogico/index.ts` + entry em `supabase/config.toml`.

- [ ] Estrutura no padrão `gerar-relatorio-aluno` (Deno.serve, CORS, try/catch, fallback).
- [ ] Client Supabase com `SUPABASE_SERVICE_ROLE_KEY` (precisa ler a RPC e inserir na tabela).
- [ ] Auth: validar `Authorization` (getUser) — só usuário logado gera.
- [ ] Payload: `{ aluno_id, periodo_tipo, data_inicio, data_fim }`.
- [ ] Chamar RPC `get_relatorio_pedagogico_aluno(aluno_id, data_inicio, data_fim)`.
- [ ] Montar prompt com as 3 regras de conteúdo; pedir **JSON** com: `{ instrumentos: [{ curso, professor, evolucao }], visao_geral, pontos_atencao, proximos_passos }`.
- [ ] Gemini `gemini-3-flash-preview`, `temperature ~0.6`, `maxOutputTokens ~2048`. Retry/backoff p/ 429/503.
- [ ] Parse do JSON (com fallback se vier texto solto). INSERT em `relatorios_pedagogicos` (status `rascunho`).
- [ ] Resposta: `{ success, relatorio_id, conteudo_json }`.

### Fase 3: Frontend (aba Histórico Pedagógico)

**Files:** `src/components/App/Alunos/ModalFichaAluno.tsx` (+ possível componente auxiliar).

- [ ] **Seletor de período**: Mês (mês/ano) / Semestre (1º/2º + ano) / Ano (ano civil) / Intervalo (2 datas). Converter em `data_inicio`/`data_fim`.
- [ ] Botão **"Gerar Relatório com IA"** → `functions.invoke` → loading.
- [ ] Renderizar o resultado num **editor** (textarea/rich) editável por seção; salvar edição em `conteudo_editado` (update na tabela).
- [ ] **Imprimir**: reusar `gerarRelatorioPedagogico` (template com logo/equipe), injetando o texto da IA em vez das anotações cruas.
- [ ] **Histórico**: listar relatórios já gerados do aluno (reabrir/reimprimir/editar).

### Fase 4 (fora deste escopo): Fábio / WhatsApp
A mesma tabela + edge alimentam o envio ao responsável (PDF/imagem) via WhatsApp. Sem regerar.

---

## Verificação
- `npm run build` a cada fase.
- Teste manual: gerar para um aluno Kids e um School, período mensal e custom; validar anti-alucinação (período sem aulas) e privacidade (aula de grupo).

## Docs a atualizar (mesmo commit)
- `docs/MAPA-SISTEMA.md`: nova aba/edge/RPC/tabela.
- `docs/MAPA-INTEGRACAO-EMUSYS.md`: uso pedagógico do campo `anotacoes`.
