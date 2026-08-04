# Pesquisa de Evasão — Subprojeto C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformar respostas produtivas revisadas em classificação humana multirrótulo, comparação com o motivo anterior, ações e desfechos auditáveis, enquanto o primeiro envio passa a ser sinalizado em D+1 e continua manual.

**Architecture:** três migrations aditivas introduzem uma trilha versionada de classificação, governam `aluno_acoes`, criam desfechos append-only e expõem RPCs de leitura/escrita; uma quarta migration faz o cutover do escritor legado somente depois do frontend. A conversa recebe um bloco próprio de classificação e ação, enquanto a aba Respostas passa a consumir o read model novo. A regra D+1 é aplicada pelo banco e repetida pela Edge antes da prévia, sem cron nem disparo automático.

**Tech Stack:** PostgreSQL/Supabase, RLS e RPCs `SECURITY DEFINER`, Deno/TypeScript, React 19, Vite, Node test runner e fixture PostgreSQL 17

---

## Decisões vinculantes

1. Revisão textual e classificação analítica são operações separadas.
2. A classificação é multirrótulo, versionada e confirmada por pessoa.
3. O motivo cadastrado, os eventos originais e a revisão textual nunca são sobrescritos.
4. `categoria_resposta` e `sentimento` são legadas, vazias e não recebem backfill.
5. `aluno_acoes` perde a policy ampla de escrita; o navegador escreve somente por RPC.
6. D+1 significa 10h BRT do dia seguinte à data da saída.
7. D+1 libera apenas o botão manual; não cria pesquisa nem envia WhatsApp.
8. Lembrete automático à família permanece desligado.
9. IA fica fora do código desta entrega; evolução futura será somente sugestão com confirmação humana.
10. Migrations versionadas entram por `supabase db push`, nunca por `apply_migration` do MCP.

## Estrutura de arquivos

**Criar:**

- `supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql` — tabelas, constraints, append-only, extensão e RLS de `aluno_acoes`.
- `supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql` — classificação, ações, desfechos e read models governados.
- `supabase/migrations/20260804224500_pesquisa_evasao_subprojeto_c_d1.sql` — RPC v3 de listagem e regra D+1 server-side.
- `supabase/migrations/20260804230000_pesquisa_evasao_subprojeto_c_cutover_legado.sql` — revogação do escritor legado após o frontend.
- `tests/pesquisaEvasaoSubprojetoCSchema.test.mjs` — contratos de schema, ACL e legado.
- `tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs` — contratos das RPCs e concorrência.
- `tests/pesquisaEvasaoSubprojetoCD1.test.mjs` — cálculo D+1 e ausência de automação.
- `tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs` — integração da conversa, fila e analytics.
- `tests/fixtures/pesquisa_evasao_subprojeto_c_pg17.sql` — prova transacional em PostgreSQL 17.
- `tests/helpers/runPesquisaEvasaoSubprojetoCPg17Fixture.mjs` — runner descartável da fixture.
- `src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts` — leitura e comandos governados.
- `src/components/App/SucessoCliente/ClassificacaoPesquisaEvasao.tsx` — formulário e histórico da classificação.
- `src/components/App/SucessoCliente/AcoesPesquisaEvasao.tsx` — ações, conclusão e desfecho.
- `docs/runbooks/pesquisa-evasao-subprojeto-c-rollout.md` — rollout, smoke, observabilidade e recuperação.

**Modificar:**

- `src/components/App/SucessoCliente/pesquisaEvasao.types.ts` — contratos tipados.
- `src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx` — montar classificação e ações após as rodadas.
- `src/components/App/SucessoCliente/hooks/useRespostasEvasao.ts` — trocar o escritor legado pelo read model v1.
- `src/components/App/SucessoCliente/RespostasEvasaoTab.tsx` — analytics multirrótulo sem classificação por clique.
- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx` — RPC v3, estado `Aguardando D+1` e horário elegível.
- `src/lib/pesquisaEvasao.ts` — taxonomia e agregações multirrótulo.
- `supabase/functions/enviar-pesquisa-evasao/index.ts` — exigir D+1 em envio produtivo, preservando teste.
- `docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md` — marcar as decisões abertas de C como resolvidas e referenciar a spec dedicada.

## Task 1: Fixar os contratos do schema e o baseline legado

**Files:**
- Create: `tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`
- Test: `supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql`
- Reference: `supabase/migrations/20260214_sucesso_aluno_fase1_tabelas.sql`
- Reference: `supabase/migrations/20260803163419_pesquisa_evasao_analise_respostas.sql`

- [ ] **Step 1: Escrever o teste que exige tabelas versionadas, categorias fechadas e campos legados intocados**

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(root,
  'supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql');
const legacyPath = resolve(root,
  'supabase/migrations/20260803163419_pesquisa_evasao_analise_respostas.sql');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('classificacao e desfecho sao versionados e append-only', () => {
  const sql = read(migrationPath);
  assert.ok(sql, 'migration estrutural do Subprojeto C ainda nao existe');
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_classificacoes/i);
  assert.match(sql, /unique\s*\(pesquisa_id, versao\)/i);
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_classificacao_categorias/i);
  assert.match(sql, /primary key\s*\(classificacao_id, categoria\)/i);
  assert.match(sql, /create table if not exists public\.pesquisa_evasao_desfechos/i);
  assert.match(sql, /before update or delete[\s\S]*fn_pesquisa_evasao_c_append_only/i);
});

test('aluno_acoes perde escrita direta e preserva leitura interna', () => {
  const sql = read(migrationPath);
  assert.match(sql, /drop policy if exists "Authenticated users can manage actions"/i);
  assert.match(sql, /create policy aluno_acoes_leitura_interna/i);
  assert.match(sql, /fn_pesquisa_evasao_usuario_interno_ativo\(\)/i);
  assert.match(sql, /revoke insert, update, delete on public\.aluno_acoes from authenticated/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*aluno_acoes[\s\S]*for all/i);
});

test('colunas legadas nao recebem backfill nem novo escritor', () => {
  const sql = read(migrationPath);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*categoria_resposta/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*sentimento/i);
  const legacy = read(legacyPath);
  assert.match(legacy, /classificar_resposta_evasao/i);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha pela migration ausente**

Run: `node --test tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`

Expected: FAIL em `migration estrutural do Subprojeto C ainda nao existe`.

- [ ] **Step 3: Criar a migration estrutural com o contrato exato**

```sql
create table if not exists public.pesquisa_evasao_classificacoes (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null check (versao > 0),
  analise_id uuid not null references public.pesquisa_evasao_analises(id),
  analise_versao_max integer not null check (analise_versao_max > 0),
  relacao_motivo text not null check (relacao_motivo in (
    'confirmou', 'confirmou_parcialmente', 'complementou', 'divergiu',
    'sem_motivo_anterior', 'inconclusivo', 'invalido'
  )),
  justificativa text not null default '' check (char_length(justificativa) <= 1000),
  sucede_classificacao_id uuid references public.pesquisa_evasao_classificacoes(id),
  revisor_usuario_id integer not null references public.usuarios(id),
  revisor_auth_user_id uuid not null,
  revisado_em timestamptz not null default clock_timestamp(),
  unique (pesquisa_id, versao)
);

create table if not exists public.pesquisa_evasao_classificacao_categorias (
  classificacao_id uuid not null
    references public.pesquisa_evasao_classificacoes(id),
  categoria text not null check (categoria in (
    'financeiro', 'tempo_horario', 'saude', 'desanimo',
    'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
    'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida'
  )),
  primary key (classificacao_id, categoria)
);

create table if not exists public.pesquisa_evasao_desfechos (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  classificacao_id uuid not null
    references public.pesquisa_evasao_classificacoes(id),
  desfecho text not null check (desfecho in (
    'recuperou', 'prometeu_voltar', 'confirmou_saida'
  )),
  observacao text not null default '' check (char_length(observacao) <= 1000),
  sucede_desfecho_id uuid references public.pesquisa_evasao_desfechos(id),
  registrado_por_usuario_id integer not null references public.usuarios(id),
  registrado_por_auth_user_id uuid not null,
  registrado_em timestamptz not null default clock_timestamp()
);

alter table public.aluno_acoes
  add column if not exists pesquisa_evasao_id uuid
    references public.pesquisa_evasao(id),
  add column if not exists classificacao_evasao_id uuid
    references public.pesquisa_evasao_classificacoes(id),
  add column if not exists professor_id integer references public.professores(id),
  add column if not exists estado text not null default 'pendente',
  add column if not exists prazo_em timestamptz,
  add column if not exists criado_por_usuario_id integer references public.usuarios(id),
  add column if not exists concluida_por_usuario_id integer references public.usuarios(id),
  add column if not exists concluida_por_auth_user_id uuid,
  add column if not exists concluida_em timestamptz;

alter table public.aluno_acoes drop constraint if exists aluno_acoes_tipo_check;
alter table public.aluno_acoes add constraint aluno_acoes_tipo_check check (tipo in (
  'ligacao', 'whatsapp', 'reuniao', 'observacao', 'plano_ia', 'email',
  'visita', 'retorno_familia', 'encaminhar_coordenacao',
  'encaminhar_financeiro', 'vincular_professor', 'tentativa_retencao',
  'solucao_oferecida', 'outro'
));
alter table public.aluno_acoes add constraint aluno_acoes_estado_check
  check (estado in ('pendente', 'realizada', 'cancelada')) not valid;
alter table public.aluno_acoes validate constraint aluno_acoes_estado_check;

create or replace function public.fn_pesquisa_evasao_c_append_only()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'PESQUISA_EVASAO_C_APPEND_ONLY: % nao permite %',
    tg_table_name, tg_op using errcode = '55000';
end
$$;

create trigger trg_pesquisa_evasao_classificacoes_append_only
before update or delete on public.pesquisa_evasao_classificacoes
for each row execute function public.fn_pesquisa_evasao_c_append_only();
create trigger trg_pesquisa_evasao_classificacao_categorias_append_only
before update or delete on public.pesquisa_evasao_classificacao_categorias
for each row execute function public.fn_pesquisa_evasao_c_append_only();
create trigger trg_pesquisa_evasao_desfechos_append_only
before update or delete on public.pesquisa_evasao_desfechos
for each row execute function public.fn_pesquisa_evasao_c_append_only();
```

Acrescentar os índices e comentários explícitos:

```sql
create index if not exists idx_pesquisa_evasao_classificacoes_pesquisa_versao
  on public.pesquisa_evasao_classificacoes (pesquisa_id, versao desc);
create index if not exists idx_pesquisa_evasao_desfechos_pesquisa_data
  on public.pesquisa_evasao_desfechos (pesquisa_id, registrado_em desc);
create index if not exists idx_aluno_acoes_evasao_estado_prazo
  on public.aluno_acoes (pesquisa_evasao_id, estado, prazo_em)
  where pesquisa_evasao_id is not null;

comment on column public.pesquisa_evasao.categoria_resposta is
  'LEGADO: vazio no baseline de 04/08/2026; substituido pela classificacao versionada do Subprojeto C.';
comment on column public.pesquisa_evasao.sentimento is
  'LEGADO: vazio no baseline de 04/08/2026; sem escritor no Subprojeto C.';
```

- [ ] **Step 4: Fechar RLS e grants**

Na mesma migration, aplicar exatamente a ACL abaixo em cada tabela nova e em
`aluno_acoes`:

```sql
alter table public.pesquisa_evasao_classificacoes enable row level security;
alter table public.pesquisa_evasao_classificacao_categorias enable row level security;
alter table public.pesquisa_evasao_desfechos enable row level security;
alter table public.aluno_acoes enable row level security;

create policy pesquisa_evasao_classificacoes_leitura_interna
on public.pesquisa_evasao_classificacoes for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());
create policy pesquisa_evasao_classificacao_categorias_leitura_interna
on public.pesquisa_evasao_classificacao_categorias for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());
create policy pesquisa_evasao_desfechos_leitura_interna
on public.pesquisa_evasao_desfechos for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

drop policy if exists "Authenticated users can manage actions"
  on public.aluno_acoes;
drop policy if exists aluno_acoes_leitura_interna on public.aluno_acoes;
create policy aluno_acoes_leitura_interna
on public.aluno_acoes for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

revoke all on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos from public, anon, authenticated,
  mila_acesso_restrito, sol_acesso_restrito, fabio_agent,
  lia_acesso_restrito;
grant select on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos to authenticated;
grant select, insert on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos to service_role;

revoke insert, update, delete on public.aluno_acoes from authenticated,
  anon, mila_acesso_restrito, sol_acesso_restrito, fabio_agent,
  lia_acesso_restrito;
grant select on public.aluno_acoes to authenticated, service_role;
grant insert, update on public.aluno_acoes to service_role;
revoke all on function public.fn_pesquisa_evasao_c_append_only()
  from public, anon, authenticated;
```

- [ ] **Step 5: Executar o teste de contrato**

Run: `node --test tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`

Expected: 3 testes passando.

- [ ] **Step 6: Commit**

```bash
git add tests/pesquisaEvasaoSubprojetoCSchema.test.mjs supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql
git commit -m "feat: criar trilha analitica da pesquisa de evasao"
```

## Task 2: Implementar classificação humana atômica e read model

**Files:**
- Create: `tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`
- Create: `supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql`
- Test: `tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`

- [ ] **Step 1: Escrever os testes de contrato das RPCs**

O arquivo deve verificar as assinaturas:

```js
const signatures = [
  /registrar_classificacao_pesquisa_evasao_v1\s*\(\s*p_pesquisa_id\s+uuid\s*,\s*p_analise_id\s+uuid\s*,\s*p_categorias\s+text\[\]\s*,\s*p_relacao_motivo\s+text\s*,\s*p_justificativa\s+text(?:\s+default\s+'')?\s*\)/i,
  /obter_dados_classificacao_pesquisa_evasao_v1\s*\(\s*p_pesquisa_id\s+uuid\s*\)/i,
  /listar_respostas_evasao_analytics_v1\s*\(/i,
];
for (const signature of signatures) assert.match(sql, signature);
assert.match(sql, /for update[\s\S]*pesquisa_evasao/i);
assert.match(sql, /modo_teste[\s\S]*PESQUISA_EVASAO_C_TESTE_PROIBIDO/i);
assert.match(sql, /status\s*=\s*'revisada'/i);
assert.match(sql, /PESQUISA_EVASAO_C_CONVERSA_ATUALIZADA/i);
assert.match(sql, /unnest\s*\(\s*p_categorias\s*\)/i);
assert.match(sql, /revisor_auth_user_id[\s\S]*auth\.uid\(\)/i);
```

Também verificar que `inconclusivo`, `resposta_invalida` e `outro` possuem as
regras de coerência da spec, e que nenhuma RPC atualiza `categoria_resposta` ou
`sentimento`.

- [ ] **Step 2: Rodar e observar a falha pela migration ausente**

Run: `node --test tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`

Expected: FAIL porque `20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql`
ainda não existe.

- [ ] **Step 3: Implementar a RPC de classificação com identidade server-side**

O corpo deve seguir esta sequência concreta:

```sql
create or replace function public.registrar_classificacao_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_analise_id uuid,
  p_categorias text[],
  p_relacao_motivo text,
  p_justificativa text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_analise public.pesquisa_evasao_analises%rowtype;
  v_anterior public.pesquisa_evasao_classificacoes%rowtype;
  v_categorias text[];
  v_id uuid;
  v_versao integer;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;
  select * into strict v_usuario from public.usuarios
  where auth_user_id = auth.uid() and ativo = true;
  select * into strict v_pesquisa from public.pesquisa_evasao
  where id = p_pesquisa_id for update;
  if v_pesquisa.modo_teste then
    raise exception 'PESQUISA_EVASAO_C_TESTE_PROIBIDO' using errcode = '22023';
  end if;
  select * into strict v_analise
  from public.pesquisa_evasao_analises
  where pesquisa_id = p_pesquisa_id
  order by versao desc limit 1;
  if v_analise.id is distinct from p_analise_id or v_analise.status <> 'revisada' then
    raise exception 'PESQUISA_EVASAO_C_CONVERSA_ATUALIZADA' using errcode = '40001';
  end if;
  select array_agg(distinct categoria order by categoria)
  into v_categorias from unnest(p_categorias) categoria;
  if coalesce(cardinality(v_categorias), 0) = 0 then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_OBRIGATORIA' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_categorias) c where c not in (
    'financeiro', 'tempo_horario', 'saude', 'desanimo',
    'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
    'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida'
  )) then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_INVALIDA' using errcode = '22023';
  end if;
  if ('inconclusivo' = any(v_categorias) or 'resposta_invalida' = any(v_categorias))
     and cardinality(v_categorias) <> 1 then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_EXCLUSIVA' using errcode = '22023';
  end if;
  if 'outro' = any(v_categorias) and nullif(btrim(p_justificativa), '') is null then
    raise exception 'PESQUISA_EVASAO_C_JUSTIFICATIVA_OBRIGATORIA' using errcode = '22023';
  end if;
  if char_length(coalesce(p_justificativa, '')) > 1000 then
    raise exception 'PESQUISA_EVASAO_C_JUSTIFICATIVA_LONGA' using errcode = '22023';
  end if;
  if p_relacao_motivo not in (
    'confirmou', 'confirmou_parcialmente', 'complementou', 'divergiu',
    'sem_motivo_anterior', 'inconclusivo', 'invalido'
  ) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INVALIDA' using errcode = '22023';
  end if;
  if p_relacao_motivo = 'sem_motivo_anterior'
     and nullif(btrim(v_pesquisa.motivo_cadastrado), '') is not null then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if p_relacao_motivo = 'inconclusivo' and not ('inconclusivo' = any(v_categorias)) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if p_relacao_motivo = 'invalido' and not ('resposta_invalida' = any(v_categorias)) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if 'inconclusivo' = any(v_categorias) and p_relacao_motivo <> 'inconclusivo' then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if 'resposta_invalida' = any(v_categorias) and p_relacao_motivo <> 'invalido' then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  select * into v_anterior from public.pesquisa_evasao_classificacoes
  where pesquisa_id = p_pesquisa_id order by versao desc limit 1;
  v_versao := coalesce(v_anterior.versao, 0) + 1;
  insert into public.pesquisa_evasao_classificacoes (
    pesquisa_id, versao, analise_id, analise_versao_max, relacao_motivo,
    justificativa, sucede_classificacao_id, revisor_usuario_id,
    revisor_auth_user_id
  ) values (
    p_pesquisa_id, v_versao, v_analise.id, v_analise.versao,
    p_relacao_motivo, coalesce(p_justificativa, ''), v_anterior.id,
    v_usuario.id, auth.uid()
  ) returning id into v_id;
  insert into public.pesquisa_evasao_classificacao_categorias
    (classificacao_id, categoria)
  select v_id, categoria from unnest(v_categorias) categoria;
  return jsonb_build_object(
    'classificacao_id', v_id,
    'pesquisa_id', p_pesquisa_id,
    'versao', v_versao,
    'analise_versao_max', v_analise.versao
  );
end
$$;
```

- [ ] **Step 4: Implementar os read models sem expor teste ou classificação desatualizada como vigente**

`obter_dados_classificacao_pesquisa_evasao_v1(uuid)` retorna JSON com
`analise_atual`, `classificacao_atual`, `classificacao_desatualizada`,
`historico_classificacoes`, `acoes` e `desfecho_atual`. A classificação é
vigente somente quando `analise_versao_max` é igual à maior versão de análise
da pesquisa e essa análise está `revisada`.

`listar_respostas_evasao_analytics_v1(uuid, integer, integer)` retorna uma linha
por pesquisa produtiva com motivo anterior, categorias `text[]`, relação,
versão, estado vigente, contagem de ações e desfecho atual. Não lê
`categoria_resposta` nem `sentimento`.

O read model também deriva `estado_operacional` com esta precedência:

```sql
case
  when ultima_analise.id is null or ultima_analise.status <> 'revisada'
    then 'aguardando_revisao_textual'
  when ultima_classificacao.id is null
    or not public.fn_pesquisa_evasao_c_classificacao_vigente(
      pe.id, ultima_classificacao.id
    )
    then 'aguardando_classificacao'
  when coalesce(acoes_pendentes.total, 0) > 0
    then 'acao_pendente'
  when ultimo_desfecho.id is null
    then 'em_acompanhamento'
  else 'encerrado'
end as estado_operacional
```

Usar um helper único para a regra de vigência:

```sql
create or replace function public.fn_pesquisa_evasao_c_classificacao_vigente(
  p_pesquisa_id uuid,
  p_classificacao_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pesquisa_evasao pe
    join public.pesquisa_evasao_classificacoes pc
      on pc.pesquisa_id = pe.id and pc.id = p_classificacao_id
    join lateral (
      select pea.versao, pea.status
      from public.pesquisa_evasao_analises pea
      where pea.pesquisa_id = pe.id
      order by pea.versao desc
      limit 1
    ) ultima_analise on true
    where pe.id = p_pesquisa_id
      and pe.modo_teste = false
      and pc.id = (
        select pc2.id
        from public.pesquisa_evasao_classificacoes pc2
        where pc2.pesquisa_id = pe.id
        order by pc2.versao desc
        limit 1
      )
      and pc.analise_versao_max = ultima_analise.versao
      and ultima_analise.status = 'revisada'
  )
$$;
```

O read model individual deve montar o envelope sem depender de tabela aberta:

```sql
create or replace function public.obter_dados_classificacao_pesquisa_evasao_v1(
  p_pesquisa_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'pesquisa_id', pe.id,
    'motivo_cadastrado', pe.motivo_cadastrado,
    'modo_teste', pe.modo_teste,
    'analise_atual', case when ua.id is null then null else jsonb_build_object(
      'id', ua.id, 'versao', ua.versao, 'status', ua.status,
      'texto_consolidado', ua.texto_consolidado, 'revisado_em', ua.revisado_em
    ) end,
    'classificacao_atual', case when uc.id is null then null else jsonb_build_object(
      'id', uc.id, 'versao', uc.versao,
      'analise_versao_max', uc.analise_versao_max,
      'relacao_motivo', uc.relacao_motivo,
      'justificativa', uc.justificativa,
      'categorias', coalesce(categorias.itens, '[]'::jsonb),
      'revisor_usuario_id', uc.revisor_usuario_id,
      'revisor_nome', ru.nome, 'revisado_em', uc.revisado_em
    ) end,
    'classificacao_desatualizada',
      uc.id is not null and not public.fn_pesquisa_evasao_c_classificacao_vigente(pe.id, uc.id),
    'historico_classificacoes', coalesce(historico.itens, '[]'::jsonb),
    'acoes', coalesce(acoes.itens, '[]'::jsonb),
    'desfecho_atual', desfecho.item
  ) into v_resultado
  from public.pesquisa_evasao pe
  left join lateral (
    select pea.* from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id order by pea.versao desc limit 1
  ) ua on true
  left join lateral (
    select pc.* from public.pesquisa_evasao_classificacoes pc
    where pc.pesquisa_id = pe.id order by pc.versao desc limit 1
  ) uc on true
  left join public.usuarios ru on ru.id = uc.revisor_usuario_id
  left join lateral (
    select jsonb_agg(pcc.categoria order by pcc.categoria) itens
    from public.pesquisa_evasao_classificacao_categorias pcc
    where pcc.classificacao_id = uc.id
  ) categorias on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', pc.id, 'versao', pc.versao,
      'analise_versao_max', pc.analise_versao_max,
      'relacao_motivo', pc.relacao_motivo,
      'justificativa', pc.justificativa,
      'categorias', coalesce((
        select jsonb_agg(pcc.categoria order by pcc.categoria)
        from public.pesquisa_evasao_classificacao_categorias pcc
        where pcc.classificacao_id = pc.id
      ), '[]'::jsonb),
      'revisor_usuario_id', pc.revisor_usuario_id,
      'revisor_nome', hru.nome,
      'revisado_em', pc.revisado_em
    ) order by pc.versao desc) itens
    from public.pesquisa_evasao_classificacoes pc
    join public.usuarios hru on hru.id = pc.revisor_usuario_id
    where pc.pesquisa_id = pe.id
  ) historico on true
  left join lateral (
    select jsonb_agg(to_jsonb(aa) order by aa.created_at desc) itens
    from public.aluno_acoes aa where aa.pesquisa_evasao_id = pe.id
  ) acoes on true
  left join lateral (
    select to_jsonb(pd) item from public.pesquisa_evasao_desfechos pd
    where pd.pesquisa_id = pe.id order by pd.registrado_em desc limit 1
  ) desfecho on true
  where pe.id = p_pesquisa_id;
  if v_resultado is null then
    raise exception 'PESQUISA_EVASAO_C_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;
  return v_resultado;
end
$$;
```

Para `listar_respostas_evasao_analytics_v1`, declarar campos escalares e usar
laterais para a última análise, a última classificação, categorias, ações e
desfecho. O `where` obrigatório é:

```sql
where pe.modo_teste = false
  and pe.resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
  and (p_unidade_id is null or pe.unidade_id = p_unidade_id)
  and (p_ano is null or extract(year from pe.data_evasao)::integer = p_ano)
  and (p_mes is null or extract(month from pe.data_evasao)::integer = p_mes)
```

- [ ] **Step 5: Aplicar ACL mínima às RPCs**

Revogar `PUBLIC` e `anon`; conceder execução a `authenticated` e
`service_role`; revogar execução de roles de agentes. As RPCs validam usuário
interno ativo dentro da função.

- [ ] **Step 6: Rodar os testes**

Run: `node --test tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`

Expected: todos passando.

- [ ] **Step 7: Commit**

```bash
git add tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql
git commit -m "feat: governar classificacao humana de evasao"
```

## Task 3: Governar ações e desfechos

**Files:**
- Modify: `tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`
- Modify: `supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql`

- [ ] **Step 1: Acrescentar testes que proíbem ação sem classificação vigente**

```js
test('acoes e desfechos exigem classificacao vigente e identidade server-side', () => {
  assert.match(sql, /registrar_acao_pesquisa_evasao_v1/i);
  assert.match(sql, /concluir_acao_pesquisa_evasao_v1/i);
  assert.match(sql, /registrar_desfecho_pesquisa_evasao_v1/i);
  assert.match(sql, /classificacao_evasao_id[\s\S]*analise_versao_max/i);
  assert.match(sql, /criado_por_usuario_id[\s\S]*auth\.uid\(\)/i);
  assert.match(sql, /professor_id[\s\S]*vincular_professor/i);
  assert.match(sql, /sucede_desfecho_id/i);
  assert.doesNotMatch(sql, /p_aluno_id|p_unidade_id|p_criado_por_usuario_id/i);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`

Expected: FAIL porque as três RPCs ainda não existem.

- [ ] **Step 3: Implementar `registrar_acao_pesquisa_evasao_v1`**

A assinatura aceita somente `pesquisa_id`, `classificacao_id`, `tipo`,
`descricao`, `prazo_em` e `professor_id`. A função resolve aluno, unidade,
usuário e nome no servidor; rejeita teste; exige que a classificação seja a
última e cubra a última análise revisada; exige `professor_id` apenas para
`vincular_professor`; insere `estado='pendente'`, `realizado_por=auth.uid()` e
`criado_por_usuario_id` resolvido.

```sql
create or replace function public.registrar_acao_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_classificacao_id uuid,
  p_tipo text,
  p_descricao text,
  p_prazo_em timestamptz default null,
  p_professor_id integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_id uuid;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;
  select * into strict v_usuario from public.usuarios
  where auth_user_id = auth.uid() and ativo = true;
  select * into strict v_pesquisa from public.pesquisa_evasao
  where id = p_pesquisa_id for update;
  if not public.fn_pesquisa_evasao_c_classificacao_vigente(
    p_pesquisa_id, p_classificacao_id
  ) then
    raise exception 'PESQUISA_EVASAO_C_CLASSIFICACAO_DESATUALIZADA'
      using errcode = '40001';
  end if;
  if v_pesquisa.aluno_id is null then
    raise exception 'PESQUISA_EVASAO_C_ALUNO_AUSENTE' using errcode = '22023';
  end if;
  if p_tipo not in (
    'retorno_familia', 'encaminhar_coordenacao', 'encaminhar_financeiro',
    'vincular_professor', 'tentativa_retencao', 'solucao_oferecida', 'outro'
  ) then
    raise exception 'PESQUISA_EVASAO_C_ACAO_INVALIDA' using errcode = '22023';
  end if;
  if nullif(btrim(p_descricao), '') is null or char_length(p_descricao) > 1000 then
    raise exception 'PESQUISA_EVASAO_C_DESCRICAO_INVALIDA' using errcode = '22023';
  end if;
  if (p_tipo = 'vincular_professor') is distinct from (p_professor_id is not null) then
    raise exception 'PESQUISA_EVASAO_C_PROFESSOR_INCOERENTE' using errcode = '22023';
  end if;
  if p_professor_id is not null
     and not exists (select 1 from public.professores where id = p_professor_id and ativo) then
    raise exception 'PESQUISA_EVASAO_C_PROFESSOR_INVALIDO' using errcode = '22023';
  end if;
  insert into public.aluno_acoes (
    aluno_id, unidade_id, tipo, descricao, realizado_por,
    realizado_por_nome, pesquisa_evasao_id, classificacao_evasao_id,
    professor_id, estado, prazo_em, criado_por_usuario_id
  ) values (
    v_pesquisa.aluno_id, v_pesquisa.unidade_id, p_tipo, btrim(p_descricao),
    auth.uid(), v_usuario.nome, p_pesquisa_id, p_classificacao_id,
    p_professor_id, 'pendente', p_prazo_em, v_usuario.id
  ) returning id into v_id;
  return v_id;
end
$$;
```

- [ ] **Step 4: Implementar `concluir_acao_pesquisa_evasao_v1`**

A assinatura aceita `acao_id`, estado final `realizada|cancelada` e observação.
Ela trava a ação, rejeita ação já terminal e grava `resultado`,
`concluida_por_usuario_id`, `concluida_por_auth_user_id` e `concluida_em`.

```sql
create or replace function public.concluir_acao_pesquisa_evasao_v1(
  p_acao_id uuid,
  p_estado text,
  p_observacao text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_acao public.aluno_acoes%rowtype;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;
  if p_estado not in ('realizada', 'cancelada')
     or char_length(coalesce(p_observacao, '')) > 1000 then
    raise exception 'PESQUISA_EVASAO_C_CONCLUSAO_INVALIDA' using errcode = '22023';
  end if;
  select * into strict v_usuario from public.usuarios
  where auth_user_id = auth.uid() and ativo = true;
  select * into strict v_acao from public.aluno_acoes
  where id = p_acao_id and pesquisa_evasao_id is not null for update;
  if v_acao.estado <> 'pendente' then
    raise exception 'PESQUISA_EVASAO_C_ACAO_JA_ENCERRADA' using errcode = '40001';
  end if;
  update public.aluno_acoes set
    estado = p_estado,
    resultado = nullif(btrim(p_observacao), ''),
    concluida_por_usuario_id = v_usuario.id,
    concluida_por_auth_user_id = auth.uid(),
    concluida_em = clock_timestamp()
  where id = p_acao_id;
  return jsonb_build_object('acao_id', p_acao_id, 'estado', p_estado);
end
$$;
```

- [ ] **Step 5: Implementar `registrar_desfecho_pesquisa_evasao_v1`**

A função trava a pesquisa, valida classificação vigente, busca o último
desfecho, insere nova linha apontando para `sucede_desfecho_id` e nunca atualiza
o evento anterior.

```sql
create or replace function public.registrar_desfecho_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_classificacao_id uuid,
  p_desfecho text,
  p_observacao text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_anterior uuid;
  v_id uuid;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;
  perform 1 from public.pesquisa_evasao where id = p_pesquisa_id for update;
  if not found then
    raise exception 'PESQUISA_EVASAO_C_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;
  if not public.fn_pesquisa_evasao_c_classificacao_vigente(
    p_pesquisa_id, p_classificacao_id
  ) then
    raise exception 'PESQUISA_EVASAO_C_CLASSIFICACAO_DESATUALIZADA'
      using errcode = '40001';
  end if;
  if p_desfecho not in ('recuperou', 'prometeu_voltar', 'confirmou_saida')
     or char_length(coalesce(p_observacao, '')) > 1000 then
    raise exception 'PESQUISA_EVASAO_C_DESFECHO_INVALIDO' using errcode = '22023';
  end if;
  select * into strict v_usuario from public.usuarios
  where auth_user_id = auth.uid() and ativo = true;
  select id into v_anterior from public.pesquisa_evasao_desfechos
  where pesquisa_id = p_pesquisa_id order by registrado_em desc, id desc limit 1;
  insert into public.pesquisa_evasao_desfechos (
    pesquisa_id, classificacao_id, desfecho, observacao,
    sucede_desfecho_id, registrado_por_usuario_id,
    registrado_por_auth_user_id
  ) values (
    p_pesquisa_id, p_classificacao_id, p_desfecho,
    coalesce(p_observacao, ''), v_anterior, v_usuario.id, auth.uid()
  ) returning id into v_id;
  return v_id;
end
$$;
```

- [ ] **Step 6: Rodar os testes e commitar**

Run: `node --test tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`

Expected: todos passando.

```bash
git add tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql
git commit -m "feat: registrar acoes e desfechos de evasao"
```

## Task 4: Provar o fluxo em PostgreSQL 17

**Files:**
- Create: `tests/fixtures/pesquisa_evasao_subprojeto_c_pg17.sql`
- Create: `tests/helpers/runPesquisaEvasaoSubprojetoCPg17Fixture.mjs`
- Modify: `tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs`

- [ ] **Step 1: Criar fixture mínima com pesquisa produtiva, pesquisa de teste e duas rodadas**

A fixture cria `auth.role()`, `auth.uid()`, roles estruturais, `usuarios`,
`pesquisa_evasao`, `pesquisa_evasao_analises`, `aluno_acoes`, `alunos`,
`unidades` e `professores`; inclui as duas migrations de C por `\ir`.

O cenário deve provar:

1. teste é rejeitado;
2. análise não revisada é rejeitada;
3. classificação multirrótulo é criada como versão 1;
4. repetir a classificação cria versão 2 e preserva a 1;
5. `outro` sem justificativa é rejeitado;
6. categoria inconclusiva combinada é rejeitada;
7. nova rodada torna a classificação anterior desatualizada;
8. ação resolve aluno e unidade no servidor;
9. ação é concluída com outro operador e ambos ficam auditados;
10. dois desfechos formam cadeia append-only;
11. update e delete das trilhas são rejeitados;
12. `authenticated` não insere diretamente em `aluno_acoes`;
13. `categoria_resposta` e `sentimento` continuam nulos.

Finalizar com:

```sql
\echo PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK
rollback;
```

- [ ] **Step 2: Criar runner seguro e autocontido**

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CONTAINER = /^pesquisa-evasao-pg17-[a-z0-9-]+$/;
const IMAGE = /^postgres:17(?:[-.][a-z0-9.-]+)?$/i;
const DATABASE = /^pesquisa_evasao_c_[0-9a-f]{16}$/;
const run = (container, args) => spawnSync('docker', ['exec', container, ...args], { encoding: 'utf8' });
const ok = (result, context) => {
  assert.equal(result.status, 0, `${context}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
};
const psql = (container, database, args = []) => run(container, [
  'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, ...args,
]);

export function runPesquisaEvasaoSubprojetoCPg17Fixture({
  container,
  fixturePath = '/workspace/tests/fixtures/pesquisa_evasao_subprojeto_c_pg17.sql',
} = {}) {
  assert.match(container ?? '', CONTAINER);
  const metadata = ok(spawnSync('docker', [
    'inspect', '--format', '{{.Config.Image}}|{{.State.Running}}', container,
  ], { encoding: 'utf8' }), 'falha ao inspecionar container');
  const [image, running] = metadata.split('|');
  assert.match(image ?? '', IMAGE);
  assert.equal(running, 'true');
  assert.match(ok(psql(container, 'postgres', ['-Atc', 'show server_version_num']),
    'falha ao consultar versao'), /^17\d{4}$/);
  const database = `pesquisa_evasao_c_${randomBytes(8).toString('hex')}`;
  assert.match(database, DATABASE);
  let created = false;
  let output = '';
  let failure;
  try {
    ok(run(container, ['createdb', '-U', 'postgres', database]), 'falha ao criar banco');
    created = true;
    const fixture = psql(container, database, ['-f', fixturePath]);
    output = ok(fixture, 'fixture do Subprojeto C falhou');
    assert.match(output, /PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK/);
  } catch (error) {
    failure = error;
  } finally {
    if (created) {
      const drop = run(container, ['dropdb', '--force', '-U', 'postgres', database]);
      if (drop.status !== 0 && !failure) failure = new Error(drop.stderr);
    }
  }
  if (failure) throw failure;
  assert.equal(ok(psql(container, 'postgres', [
    '-Atc', `select count(*) from pg_database where datname = '${database}'`,
  ]), 'falha ao confirmar remocao'), '0');
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(runPesquisaEvasaoSubprojetoCPg17Fixture({
    container: process.argv[2] ?? process.env.PESQUISA_EVASAO_PG17_CONTAINER,
  }));
}
```

- [ ] **Step 3: Integrar o runner ao teste Node**

```js
test('fixture do Subprojeto C passa em PostgreSQL 17 isolado', {
  skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER,
}, async () => {
  const { runPesquisaEvasaoSubprojetoCPg17Fixture } = await import(
    './helpers/runPesquisaEvasaoSubprojetoCPg17Fixture.mjs'
  );
  const output = runPesquisaEvasaoSubprojetoCPg17Fixture({
    container: process.env.PESQUISA_EVASAO_PG17_CONTAINER,
  });
  assert.match(output, /PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK/);
});
```

- [ ] **Step 4: Executar em PostgreSQL 17**

Run:

```powershell
$container = 'pesquisa-evasao-pg17-subprojeto-c'
docker run --name $container -e POSTGRES_PASSWORD=postgres -d postgres:17
docker cp . "$container`:/workspace"
$env:PESQUISA_EVASAO_PG17_CONTAINER = $container
node --test tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs
docker rm -f $container
```

Expected: fixture termina em `PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK`, banco
descartável é removido e o container é removido explicitamente.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/pesquisa_evasao_subprojeto_c_pg17.sql tests/helpers/runPesquisaEvasaoSubprojetoCPg17Fixture.mjs tests/pesquisaEvasaoSubprojetoCRpcs.test.mjs
git commit -m "test: provar fluxo analitico de evasao no postgres"
```

## Task 5: Criar contratos TypeScript e hook governado

**Files:**
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts`
- Create: `tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

- [ ] **Step 1: Escrever teste estático para impedir escrita direta**

```js
test('frontend de C usa somente RPCs governadas', () => {
  const source = `${read(paths.hook)}\n${read(paths.classificacao)}\n${read(paths.acoes)}`;
  for (const rpc of [
    'obter_dados_classificacao_pesquisa_evasao_v1',
    'registrar_classificacao_pesquisa_evasao_v1',
    'registrar_acao_pesquisa_evasao_v1',
    'concluir_acao_pesquisa_evasao_v1',
    'registrar_desfecho_pesquisa_evasao_v1',
  ]) assert.match(source, new RegExp(rpc));
  assert.doesNotMatch(source, /\.from\(['"](?:pesquisa_evasao_classificacoes|pesquisa_evasao_desfechos|aluno_acoes)['"]\)/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha pelos arquivos ausentes**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

Expected: FAIL no contrato das RPCs.

- [ ] **Step 3: Adicionar tipos fechados**

```ts
export const PESQUISA_EVASAO_CATEGORIAS = [
  'financeiro', 'tempo_horario', 'saude', 'desanimo',
  'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
  'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida',
] as const;
export type PesquisaEvasaoCategoria = typeof PESQUISA_EVASAO_CATEGORIAS[number];

export type PesquisaEvasaoRelacaoMotivo =
  | 'confirmou' | 'confirmou_parcialmente' | 'complementou' | 'divergiu'
  | 'sem_motivo_anterior' | 'inconclusivo' | 'invalido';

export type PesquisaEvasaoAcaoTipo =
  | 'retorno_familia' | 'encaminhar_coordenacao' | 'encaminhar_financeiro'
  | 'vincular_professor' | 'tentativa_retencao' | 'solucao_oferecida' | 'outro';

export type PesquisaEvasaoDesfecho =
  | 'recuperou' | 'prometeu_voltar' | 'confirmou_saida';

export interface PesquisaEvasaoClassificacaoVersao {
  id: string;
  versao: number;
  analise_versao_max: number;
  relacao_motivo: PesquisaEvasaoRelacaoMotivo;
  justificativa: string;
  categorias: PesquisaEvasaoCategoria[];
  revisor_usuario_id: number;
  revisor_nome: string;
  revisado_em: string;
}

export interface PesquisaEvasaoAcao {
  id: string;
  tipo: PesquisaEvasaoAcaoTipo;
  descricao: string;
  estado: 'pendente' | 'realizada' | 'cancelada';
  prazo_em: string | null;
  professor_id: number | null;
  criado_por_usuario_id: number;
  realizado_por_nome: string;
  created_at: string;
  concluida_em: string | null;
}

export interface PesquisaEvasaoClassificacaoDados {
  pesquisa_id: string;
  motivo_cadastrado: string | null;
  modo_teste: boolean;
  analise_atual: {
    id: string;
    versao: number;
    status: PesquisaEvasaoRodada['status'];
    texto_consolidado: string | null;
    revisado_em: string | null;
  } | null;
  classificacao_atual: PesquisaEvasaoClassificacaoVersao | null;
  classificacao_desatualizada: boolean;
  historico_classificacoes: PesquisaEvasaoClassificacaoVersao[];
  acoes: PesquisaEvasaoAcao[];
  desfecho_atual: {
    id: string;
    desfecho: PesquisaEvasaoDesfecho;
    observacao: string;
    registrado_em: string;
  } | null;
}
```

- [ ] **Step 4: Implementar o hook**

O hook expõe `carregar`, `classificar`, `criarAcao`, `concluirAcao` e
`registrarDesfecho`. Cada comando chama uma RPC e recarrega somente depois de
sucesso. Não há atualização otimista de classificação, pois conflito de versão
é parte do contrato.

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  PesquisaEvasaoAcaoTipo,
  PesquisaEvasaoCategoria,
  PesquisaEvasaoClassificacaoDados,
  PesquisaEvasaoDesfecho,
  PesquisaEvasaoRelacaoMotivo,
} from '../pesquisaEvasao.types';

export function useClassificacaoEvasao(pesquisaId: string, habilitado: boolean) {
  const [dados, setDados] = useState<PesquisaEvasaoClassificacaoDados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!habilitado) return;
    setCarregando(true);
    const { data, error } = await supabase.rpc(
      'obter_dados_classificacao_pesquisa_evasao_v1',
      { p_pesquisa_id: pesquisaId },
    );
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    setErro(null);
    setDados(data as PesquisaEvasaoClassificacaoDados);
  }, [habilitado, pesquisaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const executar = useCallback(async (
    rpc: string,
    parametros: Record<string, unknown>,
  ) => {
    const { data, error } = await supabase.rpc(rpc as never, parametros as never);
    if (error) return { ok: false as const, erro: error };
    await carregar();
    return { ok: true as const, data };
  }, [carregar]);

  return {
    dados, carregando, erro, carregar,
    classificar: (entrada: {
      analiseId: string;
      categorias: PesquisaEvasaoCategoria[];
      relacao: PesquisaEvasaoRelacaoMotivo;
      justificativa: string;
    }) => executar('registrar_classificacao_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_analise_id: entrada.analiseId,
      p_categorias: entrada.categorias,
      p_relacao_motivo: entrada.relacao,
      p_justificativa: entrada.justificativa,
    }),
    criarAcao: (entrada: {
      classificacaoId: string;
      tipo: PesquisaEvasaoAcaoTipo;
      descricao: string;
      prazoEm: string | null;
      professorId: number | null;
    }) => executar('registrar_acao_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_classificacao_id: entrada.classificacaoId,
      p_tipo: entrada.tipo,
      p_descricao: entrada.descricao,
      p_prazo_em: entrada.prazoEm,
      p_professor_id: entrada.professorId,
    }),
    concluirAcao: (acaoId: string, estado: 'realizada' | 'cancelada', observacao: string) =>
      executar('concluir_acao_pesquisa_evasao_v1', {
        p_acao_id: acaoId, p_estado: estado, p_observacao: observacao,
      }),
    registrarDesfecho: (
      classificacaoId: string,
      desfecho: PesquisaEvasaoDesfecho,
      observacao: string,
    ) => executar('registrar_desfecho_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_classificacao_id: classificacaoId,
      p_desfecho: desfecho,
      p_observacao: observacao,
    }),
  };
}
```

- [ ] **Step 5: Rodar teste e build**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs && npm run build`

Expected: teste passando e build com exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/App/SucessoCliente/pesquisaEvasao.types.ts src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs
git commit -m "feat: tipar classificacao e acoes de evasao"
```

## Task 6: Implementar classificação e ações na conversa

**Files:**
- Create: `src/components/App/SucessoCliente/ClassificacaoPesquisaEvasao.tsx`
- Create: `src/components/App/SucessoCliente/AcoesPesquisaEvasao.tsx`
- Modify: `src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx`
- Modify: `tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

- [ ] **Step 1: Acrescentar testes de comportamento visível**

Exigir no código os rótulos `Transformar resposta em dado`, `Motivo registrado`,
`A classificar`, `Conteúdo novo — reclassificar`, `Criar ação`, `Registrar
desfecho` e `Versões anteriores`; exigir multisseleção por checkbox e ausência
de `categoria_resposta`.

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

Expected: FAIL nos novos rótulos e componentes.

- [ ] **Step 3: Implementar o formulário de classificação**

O estado inicial vem da classificação atual. As regras do cliente espelham o
servidor:

```ts
const exclusiva = categoria === 'inconclusivo' || categoria === 'resposta_invalida';
setCategorias((atuais) => {
  if (atuais.includes(categoria)) return atuais.filter((item) => item !== categoria);
  if (exclusiva) return [categoria];
  return [...atuais.filter((item) => item !== 'inconclusivo' && item !== 'resposta_invalida'), categoria];
});
```

Desabilitar confirmação sem análise revisada, sem categoria, com `outro` sem
justificativa ou durante request. Em conflito `40001`, recarregar e informar
`Chegou conteúdo novo; confira a conversa antes de classificar novamente.`

- [ ] **Step 4: Implementar ações e desfechos**

O componente lista histórico e permite criar ação somente com classificação
vigente. O seletor de professor aparece apenas para `vincular_professor` e usa
ID do catálogo; concluir/cancelar exige confirmação; registrar desfecho sempre
cria evento novo.

- [ ] **Step 5: Montar os componentes depois da timeline**

Em `ConversaPesquisaEvasao.tsx`, renderizar `ClassificacaoPesquisaEvasao` para
pesquisa produtiva e somente quando existe rodada revisada. Renderizar
`AcoesPesquisaEvasao` depois da classificação. Pesquisa de teste mostra aviso
`Teste não gera classificação, ação ou indicador.`

- [ ] **Step 6: Rodar testes e build**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs && npm run build`

Expected: todos passando.

- [ ] **Step 7: Commit**

```bash
git add src/components/App/SucessoCliente/ClassificacaoPesquisaEvasao.tsx src/components/App/SucessoCliente/AcoesPesquisaEvasao.tsx src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs
git commit -m "feat: classificar e acompanhar respostas de evasao"
```

## Task 7: Migrar a aba Respostas para analytics multirrótulo

**Files:**
- Modify: `src/components/App/SucessoCliente/hooks/useRespostasEvasao.ts`
- Modify: `src/components/App/SucessoCliente/RespostasEvasaoTab.tsx`
- Modify: `src/lib/pesquisaEvasao.ts`
- Modify: `tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

- [ ] **Step 1: Escrever testes que eliminam a classificação por chip**

```js
assert.match(hook, /listar_respostas_evasao_analytics_v1/);
assert.doesNotMatch(hook, /classificar_resposta_evasao/);
assert.doesNotMatch(tab, /Tema declarado/);
assert.match(tab, /Causas relatadas/);
assert.match(tab, /Relação com o motivo registrado/);
assert.match(tab, /percentuais podem somar mais de 100%/i);
assert.match(tab, /amostra/i);
for (const estado of [
  'aguardando_revisao_textual', 'aguardando_classificacao',
  'acao_pendente', 'em_acompanhamento', 'encerrado',
]) assert.match(`${hook}\n${tab}`, new RegExp(estado));
```

- [ ] **Step 2: Rodar e confirmar a falha no protótipo atual**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs`

Expected: FAIL porque o hook ainda chama `classificar_resposta_evasao` e a aba
ainda mostra `Tema declarado`.

- [ ] **Step 3: Trocar o hook por leitura somente**

Remover atualização otimista e o método `classificar`. Consumir exclusivamente
`listar_respostas_evasao_analytics_v1`.

- [ ] **Step 4: Reescrever agregações puras**

`resumirRespostas` passa a contar cada categoria uma vez por pesquisa vigente,
agregar as sete relações e separar `inconclusivo`/`resposta_invalida`. Remover
`respostaConfirmaMotivo`, `temaDoMotivoRegistrado` e o mapa de igualdade como
fonte de KPI.

- [ ] **Step 5: Atualizar a aba**

Exibir distribuição multirrótulo, relação, cobertura, ações e desfechos. Mostrar
denominador, aviso de amostra pequena e nota explícita de que percentuais de
causa podem ultrapassar 100%. Casos desatualizados aparecem como pendência e
não entram na fotografia vigente.

Acrescentar contador e filtro pelos cinco `estado_operacional`; o filtro atua
na coleção devolvida pela RPC e abre a conversa correspondente sem criar uma
segunda fonte de estado.

- [ ] **Step 6: Verificar e commitar**

Run: `node --test tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs && npm run build`

Expected: todos passando e build com exit code 0.

```bash
git add src/components/App/SucessoCliente/hooks/useRespostasEvasao.ts src/components/App/SucessoCliente/RespostasEvasaoTab.tsx src/lib/pesquisaEvasao.ts tests/pesquisaEvasaoSubprojetoCFrontend.test.mjs
git commit -m "feat: mostrar analytics revisado de evasao"
```

## Task 8: Aplicar D+1 no banco, Edge e fila manual

**Files:**
- Create: `supabase/migrations/20260804224500_pesquisa_evasao_subprojeto_c_d1.sql`
- Create: `tests/pesquisaEvasaoSubprojetoCD1.test.mjs`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`

- [ ] **Step 1: Escrever o teste do relógio e da ausência de automação**

```js
assert.match(sql, /America\/Sao_Paulo/i);
assert.match(sql, /interval\s+'1 day'/i);
assert.match(sql, /time\s+'10:00'/i);
assert.match(sql, /aguardando_d1/i);
assert.match(sql, /listar_evadidos_para_pesquisa_v3/i);
assert.doesNotMatch(sql, /cron\.schedule|net\.http_post|pg_net|insert\s+into\s+public\.pesquisa_evasao\b/i);
assert.match(edge, /pode_enviar_pesquisa_evasao/);
assert.match(edge, /if\s*\(!request\.modo_teste\)/);
assert.match(frontend, /Aguardando D\+1/);
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/pesquisaEvasaoSubprojetoCD1.test.mjs`

Expected: FAIL pela migration e RPC v3 ausentes.

- [ ] **Step 3: Criar helper e listagem v3 sem quebrar v2**

```sql
create or replace function public.pesquisa_evasao_elegivel_a_partir_v1(
  p_data_evasao date
)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select ((p_data_evasao + interval '1 day')::date + time '10:00')
    at time zone 'America/Sao_Paulo'
$$;
```

Criar a v3 como wrapper compatível da v2, acrescentando o horário e substituindo
somente os dois campos de elegibilidade:

```sql
create or replace function public.listar_evadidos_para_pesquisa_v3(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer,
  p_busca text
)
returns table (
  total_count bigint, evasao_id integer, aluno_id integer, nome text,
  telefone text, curso text, professor text, tempo_meses integer,
  data_evasao date, motivo_catalogado text, motivo_legado text,
  pesquisa_producao_status text, pesquisa_producao_id uuid,
  resposta_producao_texto text, resposta_producao_audio_url text,
  resposta_producao_tipo text, respondido_producao_em timestamptz,
  is_menor boolean, responsavel_nome text, publico_tipo text,
  bloqueio_codigo text, elegivel_envio boolean, elegibilidade_regra text,
  elegivel_a_partir_em timestamptz, possui_historico_teste boolean,
  quantidade_testes bigint, ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v2.total_count, v2.evasao_id, v2.aluno_id, v2.nome, v2.telefone,
    v2.curso, v2.professor, v2.tempo_meses, v2.data_evasao,
    v2.motivo_catalogado, v2.motivo_legado, v2.pesquisa_producao_status,
    v2.pesquisa_producao_id, v2.resposta_producao_texto,
    v2.resposta_producao_audio_url, v2.resposta_producao_tipo,
    v2.respondido_producao_em, v2.is_menor, v2.responsavel_nome,
    v2.publico_tipo, v2.bloqueio_codigo,
    v2.elegivel_envio and now() >= prazo.elegivel_em,
    case
      when v2.elegivel_envio and now() < prazo.elegivel_em
        then 'aguardando_d1'
      else v2.elegibilidade_regra
    end,
    prazo.elegivel_em,
    v2.possui_historico_teste, v2.quantidade_testes, v2.ultimo_teste_em
  from public.listar_evadidos_para_pesquisa_v2(
    p_unidade_id, p_limite, p_offset, p_status, p_ano, p_mes, p_busca
  ) v2
  cross join lateral (
    select public.pesquisa_evasao_elegivel_a_partir_v1(v2.data_evasao)
      as elegivel_em
  ) prazo
$$;

create or replace function public.pode_enviar_pesquisa_evasao(
  p_evasao_id integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_data date;
begin
  if auth.role() <> 'service_role'
     and not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    return false;
  end if;
  select m.data into v_data
  from public.movimentacoes_admin m
  where m.id = p_evasao_id
    and m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id);
  return v_data is not null
    and now() >= public.pesquisa_evasao_elegivel_a_partir_v1(v_data);
end
$$;
```

Revogar `PUBLIC`, `anon` e roles de agentes nas duas funções; conceder a v3 e
`pode_enviar_pesquisa_evasao` somente a `authenticated` e `service_role`.

- [ ] **Step 4: Repetir a regra na Edge produtiva**

Antes de criar a prévia, apenas quando `modo_teste=false`, chamar
`pode_enviar_pesquisa_evasao`. Se retornar falso, responder 409 com
`Pesquisa elegível a partir de D+1 às 10h BRT`. Não alterar o caminho de teste,
destinatário, opt-out, idempotência ou provider.

```ts
if (!request.modo_teste) {
  const { data: podeEnviar, error: elegibilidadeError } = await supabase.rpc(
    'pode_enviar_pesquisa_evasao',
    { p_evasao_id: movimentacao.id },
  );
  if (elegibilidadeError) throw elegibilidadeError;
  if (podeEnviar !== true) {
    throw new ErroHttp(409, 'Pesquisa elegivel a partir de D+1 as 10h BRT');
  }
}
```

- [ ] **Step 5: Migrar a tela para v3**

Adicionar `elegivel_a_partir_em` ao tipo, chamar RPC v3 e mapear
`aguardando_d1` para `Aguardando D+1 — disponível em dd/MM às 10h`. A linha
continua visível com o botão desabilitado.

- [ ] **Step 6: Rodar testes focados e build**

Run:

```powershell
node --test tests/pesquisaEvasaoSubprojetoCD1.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoListagemSegura.test.mjs
npm run build
```

Expected: todos passando; nenhuma chamada de WhatsApp em teste.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260804224500_pesquisa_evasao_subprojeto_c_d1.sql tests/pesquisaEvasaoSubprojetoCD1.test.mjs supabase/functions/enviar-pesquisa-evasao/index.ts src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx src/components/App/SucessoCliente/pesquisaEvasao.types.ts
git commit -m "feat: sinalizar envio manual de evasao em d mais um"
```

## Task 9: Fazer cutover do escritor legado e documentar operação

**Files:**
- Create: `supabase/migrations/20260804230000_pesquisa_evasao_subprojeto_c_cutover_legado.sql`
- Create: `docs/runbooks/pesquisa-evasao-subprojeto-c-rollout.md`
- Modify: `docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md`
- Modify: `tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`

- [ ] **Step 1: Escrever teste do cutover**

```js
assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.classificar_resposta_evasao\s*\(\s*uuid\s*,\s*text\s*\)\s+from\s+authenticated/i);
assert.doesNotMatch(sql, /drop\s+column[\s\S]*(categoria_resposta|sentimento)/i);
assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao/i);
```

- [ ] **Step 2: Criar migration estritamente de ACL**

```sql
revoke execute on function public.classificar_resposta_evasao(uuid, text)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;

comment on column public.pesquisa_evasao.categoria_resposta is
  'LEGADO desde o Subprojeto C de 04/08/2026; vazio no cutover e sem novo escritor.';
comment on column public.pesquisa_evasao.sentimento is
  'LEGADO desde o Subprojeto C de 04/08/2026; vazio no cutover e sem novo escritor.';
```

- [ ] **Step 3: Atualizar a spec-mãe**

Na seção do Subprojeto C, substituir as decisões abertas por referência à spec
de 04/08: D+1 às 10h BRT com envio manual e lembrete automático à família
desligado. Não duplicar o desenho detalhado.

- [ ] **Step 4: Escrever o runbook com gates explícitos**

O runbook deve registrar:

1. baseline e contagens produtivas;
2. backup/PITR e artefato de rollback direcionado;
3. confirmação do project ref `ouqwbbermlzqqvtqwlul`;
4. `supabase db push --linked --dry-run` antes de cada push;
5. Gate A: schema/RLS/RPCs, sem frontend;
6. Gate B: smoke das RPCs com pesquisa de teste rejeitada e pesquisa produtiva
   revisada em `A classificar`, sem gravar classificação real;
7. Gate C: migration D+1, Edge compatível e teste de prévia em modo teste;
8. Gate D: frontend e inspeção da classificação sem salvar caso real;
9. Gate E: classificação controlada autorizada, ação e desfecho em registro
   escolhido por Alf;
10. Gate F: cutover do escritor legado;
11. verificação de Fase A/Fase B da Lia e respostas multipartes;
12. monitoramento e recuperação por camada.

O runbook declara que nenhum gate está autorizado por este plano.

- [ ] **Step 5: Rodar testes documentais**

Run: `node --test tests/pesquisaEvasaoSubprojetoCSchema.test.mjs`

Expected: todos passando.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260804230000_pesquisa_evasao_subprojeto_c_cutover_legado.sql docs/runbooks/pesquisa-evasao-subprojeto-c-rollout.md docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md tests/pesquisaEvasaoSubprojetoCSchema.test.mjs
git commit -m "docs: governar rollout do subprojeto c"
```

## Task 10: Verificação final local e revisão do diff

**Files:**
- Verify: todos os arquivos das Tasks 1 a 9

- [ ] **Step 1: Rodar a suíte focada completa**

```powershell
$files = @(Get-ChildItem tests\pesquisaEvasao*.test.mjs, tests\liaAlertas*.test.mjs | ForEach-Object { $_.FullName })
node --test $files
```

Expected: zero falhas; skips somente das fixtures que exigem PostgreSQL externo
quando a variável de container não estiver definida.

- [ ] **Step 2: Rodar a fixture PostgreSQL 17 novamente**

Usar o runner da Task 4 e confirmar o marcador
`PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK`.

- [ ] **Step 3: Gerar o build de produção**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Inspecionar escopo e segredos**

```powershell
git diff origin/main...HEAD --name-only
git diff --check origin/main...HEAD
rg -n "service_role|uazapi_token|waha_api_key|instance token|5521981278047" supabase src docs tests
```

Expected: nenhum valor real novo de segredo; o número interno não entra no
código de runtime; webhook, dispatcher da Lia, transcrição e worker multipartes
não aparecem no diff.

- [ ] **Step 5: Autorrevisar requisitos**

Confirmar, um a um:

- classificação multirrótulo e relação humana;
- classificação antiga preservada quando chega conteúdo novo;
- ações e desfechos auditáveis;
- `aluno_acoes` sem escrita direta;
- testes excluídos;
- legado vazio sem backfill;
- D+1 manual às 10h BRT;
- lembrete automático desligado;
- IA ausente do runtime;
- nenhum indicador de professor.

- [ ] **Step 6: Preparar handoff sem publicar**

Reportar commits, testes, build, riscos residuais e gates. Não executar
`supabase db push`, deploy de Edge, merge ou envio de WhatsApp sem autorização
específica de Alf.

## Ordem futura de rollout

1. Reconfirmar `ouqwbbermlzqqvtqwlul` e backup/PITR.
2. `supabase db push --linked --dry-run` e revisão das migrations estruturais.
3. Aplicar schema/RLS/RPCs por `supabase db push`.
4. Verificar ACLs, zero backfill legado e uma pesquisa revisada em
   `A classificar`.
5. Aplicar migration D+1; publicar Edge compatível; provar modo teste.
6. Publicar frontend; inspecionar classificação e analytics sem salvar caso
   real.
7. Com autorização, classificar um caso produtivo e registrar ação/desfecho de
   teste operacional escolhido por Alf.
8. Aplicar cutover do escritor legado.
9. Monitorar respostas, Lia Fase A/B e erros por janela acordada.

## Definition of Done

- [ ] As quatro camadas de evidência permanecem distinguíveis.
- [ ] Classificação aceita múltiplas categorias e uma relação explícita.
- [ ] Identidade, horário e versão da conversa vêm do servidor.
- [ ] Nova rodada revisada reabre classificação sem alterar versão anterior.
- [ ] Ações e desfechos possuem trilha auditável.
- [ ] `aluno_acoes` não aceita escrita direta de `authenticated`.
- [ ] `categoria_resposta` e `sentimento` continuam sem novos dados.
- [ ] Modo teste não entra no fluxo oficial nem nos indicadores.
- [ ] D+1 aparece na tela e é repetido pelo servidor sem automação.
- [ ] Lembrete automático à família permanece desligado.
- [ ] Analytics informa denominador e caráter multirrótulo.
- [ ] Nenhum indicador de professor é criado.
- [ ] Suíte focada, fixture PostgreSQL 17 e build passam.
- [ ] Runbook usa exclusivamente `supabase db push` para migrations versionadas.
- [ ] Produção permanece intocada até autorização separada.

## Autorrevisão do plano

| Requisito da spec | Cobertura |
|---|---|
| Quatro camadas preservadas | Tasks 1, 2 e fixture da Task 4 |
| Taxonomia multirrótulo e exclusividades | Tasks 1 e 2 |
| Relação humana com motivo anterior | Task 2 |
| Nova rodada reabre classificação | Tasks 2, 4 e 6 |
| Ações e professor somente por ID | Tasks 1, 3 e 6 |
| Desfechos append-only | Tasks 1, 3 e 4 |
| Estados e filas operacionais | Tasks 2, 6 e 7 |
| Analytics sem indicador de professor | Task 7 |
| D+1 manual às 10h BRT | Task 8 |
| Lembrete automático desligado | testes negativos da Task 8 e runbook da Task 9 |
| Campos legados sem backfill | Tasks 1 e 9 |
| Fechamento de `aluno_acoes` | Tasks 1 e 4 |
| IA somente como evolução futura | spec e verificação negativa da Task 10 |
| Rollout por `supabase db push` | Task 9 e ordem futura de rollout |

Gaps encontrados na autorrevisão: nenhum requisito funcional da spec ficou sem
task. O mapa de sinais, relatórios da Lia, automação do contato, IA e indicadores
de professor permanecem deliberadamente fora do plano.
