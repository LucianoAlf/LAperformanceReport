# Lia Fase B — Follow-up de 72 Horas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar toda pesquisa produtiva sem resposta válida há 72 horas numa fila auditável, avisar privadamente apenas quem a enviou por meio da infraestrutura da Lia já em produção e permitir conclusão ou dispensa manual pela tela.

**Architecture:** O prazo e o estado operacional serão derivados das fontes canônicas `pesquisa_evasao` e `pesquisa_evasao_mensagens`; somente a decisão manual e os resumos enviados ganharão tabelas próprias. O resumo reutilizará `lia_alertas_privados`, `processar-alertas-lia`, caixa 3 e o cron atual, com uma flag de ativação exclusiva da Fase B. A interface ganhará um painel próprio de follow-up para não alterar a RPC grande `listar_evadidos_para_pesquisa_v2` nem o fluxo de envio já usado por Fabi e Jéssica.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS e RPC `SECURITY DEFINER`, Supabase Edge Functions em Deno/TypeScript, React/TypeScript, Node test runner, fixture PostgreSQL 17.

---

## Limites e estado de partida

- Trabalhar na `main` local, conforme decisão do Alf; não criar worktree, branch ou PR sem pedido posterior.
- A `main` avançou durante a Task 1 por outra frente: os commits Emusys foram
  preservados e o commit documental da Fase B foi rebaseado e publicado pelo
  outro fluxo. As Tasks seguintes foram commitadas por caminho explícito, sem
  rebasear, reordenar ou misturar arquivos da outra execução.
- Esta etapa de planejamento não altera produção. Durante a execução, nenhuma migration, Edge Function, ativação, push ou envio de WhatsApp acontece sem o gate previsto neste documento.
- Projeto de produção reconfirmado em leitura: `ouqwbbermlzqqvtqwlul`.
- A Fase A está ativa: `processar-alertas-lia`, caixa 3 e o cron `lia-alertas-privados-dispatcher-minuto` já operam a cada minuto.
- A Fase B não altera `webhook-whatsapp-inbox`, `enviar-pesquisa-evasao`, o motor multipartes nem o cron de consolidação de respostas.
- O follow-up automático à família permanece desligado e não ganha código nesta fase.
- O estado `Follow-up pendente` inclui casos ainda não avisados e casos já avisados, até resposta válida, opt-out, realização ou dispensa. O selo secundário distingue `Follow-up avisado`.
- Interação não substantiva não retira o caso da fila; ela aparece como selo secundário `Interagiu sem resposta válida`.
- O resumo será consolidado uma vez por operador e por dia, às 09:00 BRT, agrupando todos os casos que venceram desde o resumo anterior. A pesquisa entra na tela exatamente em `enviado_em + 72 horas`; somente o aviso no WhatsApp espera o resumo diário. Um caso que vence às 11h de terça aparece na tela imediatamente e é avisado na manhã de quarta — consequência aceita pelo Alf.
- O resumo lista no máximo dez casos e informa a quantidade restante. Todos os casos incluídos ficam vinculados ao mesmo resumo, inclusive os que não aparecem nominalmente por ultrapassarem dez.
- O caso real de aceite é `pesquisa_evasao.id=4efcfd18-d1fc-4a35-8dc4-a80b36c3f527`, aluno Ezequiel FernandoFerreira de almeida, enviado por Jéssica (`usuarios.id=29`) em `2026-08-03 10:55:54 BRT`; vence em `2026-08-06 10:55:54 BRT`, depois do resumo de quinta, portanto deve entrar no resumo de sexta-feira, `2026-08-07 09:00 BRT`.

## Estado da execução local em 03/08/2026

- Tasks 1 a 7 implementadas e verificadas;
- migration estrutural mantida desligada por padrão;
- migration de ativação ainda não criada;
- nenhuma migration, Edge, interface ou mensagem desta fase publicada;
- Task 8 bloqueada até autorização separada e piloto presencial do Alf.

## Modelo de estado

O read model usa esta precedência, sem sobrescrever os estados técnicos do Subprojeto B:

1. `opt_out`: `opt_out_em` preenchido ou `resposta_status='recusada_opt_out'`;
2. estado de resposta existente: `respondendo`, `pronta_para_revisao`, `nova_rodada` ou `revisada`;
3. `followup_realizado`: ação manual terminal `realizado`;
4. `followup_dispensado`: ação manual terminal `dispensado`;
5. `followup_avisado`: 72 horas vencidas e resumo confirmado pelo provedor;
6. `followup_pendente`: 72 horas vencidas, elegível e ainda sem alerta confirmado;
7. `aguardando_resposta`: envio confirmado, prazo ainda não vencido.

O selo de auditoria `Enviado em ... por ...` é sempre exibido. A existência de mensagem de entrada sem `conteudo_substantivo` nem `opt_out` adiciona o selo `Interagiu sem resposta válida`, mas não substitui os estados 5 ou 6.

## Mapa de arquivos

### Criar

- `supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql` — schema, read model, RPCs, produtor bloqueado e adaptação polimórfica da outbox.
- `supabase/migrations/20260804093000_lia_followup_72h_fase_b_ativacao.sql` — criado somente depois do piloto aceito; liga a produção da Fase B sem criar novo cron.
- `tests/fixtures/lia_followup_72h_fase_b_pg17.sql` — prova PostgreSQL real da regra de 72h, idempotência, isolamento e auditoria.
- `tests/liaFollowup72hFaseB.test.mjs` — contrato estrutural e invocação opcional da fixture PG17.
- `src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts` — leitura, paginação, filtros e ações manuais.
- `src/components/App/SucessoCliente/FilaFollowupEvasao.tsx` — painel, contador, filtros, estados e expansão da conversa.
- `src/components/App/SucessoCliente/ModalRegistrarFollowupEvasao.tsx` — confirmação auditável de realizado ou dispensado.
- `tests/pesquisaEvasaoFollowupFrontend.test.mjs` — contrato de integração da UI, URL e RPCs.
- `docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md` — preflight, piloto, ativação, rollback e observação do primeiro caso real.

### Modificar

- `supabase/functions/processar-alertas-lia/index.ts` — chamar o produtor da Fase B antes do claim normal, sem bloquear alertas da Fase A se o produtor falhar.
- `supabase/functions/processar-alertas-lia/dispatcher.ts` — aceitar `followup_3d_resumo` no tipo do claim; transporte permanece idêntico.
- `supabase/functions/processar-alertas-lia/dispatcher.test.ts` — provar compatibilidade do novo tipo e ausência de segundo envio.
- `tests/liaAlertasDispatcherEdge.test.mjs` — provar que o produtor é backend-only e que o webhook não entra no pacote.
- `src/components/App/SucessoCliente/pesquisaEvasao.types.ts` — tipos do read model e da ação manual.
- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx` — montar o painel e respeitar `filtro=followup_pendente` vindo do alerta.
- `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md` — registrar Fase A ativa e contrato final da cadência diária da Fase B.
- `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md` — apenas apontar que a Fase B ganhou runbook próprio; não reescrever as evidências da Fase A.

## Contratos físicos aprovados pelo plano

### `pesquisa_evasao_followup_acoes`

Uma linha terminal por pesquisa. A tabela não decide elegibilidade e não guarda telefone ou conteúdo da resposta.

```sql
create table public.pesquisa_evasao_followup_acoes (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null unique references public.pesquisa_evasao(id),
  acao text not null check (acao in ('realizado', 'dispensado')),
  canal text check (canal in ('whatsapp', 'telefone', 'outro')),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  operador_usuario_id integer not null references public.usuarios(id),
  operador_auth_user_id uuid not null,
  registrado_em timestamptz not null default clock_timestamp(),
  criado_em timestamptz not null default clock_timestamp(),
  check (
    (acao = 'realizado' and canal is not null)
    or (acao = 'dispensado' and canal is null)
  )
);
```

### `lia_followup_resumos`

Um resumo por operador, ambiente e data de corte BRT. O corpo completo permanece na outbox e segue o expurgo de 30 dias já ativo.

```sql
create table public.lia_followup_resumos (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  operador_usuario_id integer not null references public.usuarios(id),
  data_corte_brt date not null,
  total_casos integer not null check (total_casos > 0),
  idempotency_key text not null unique,
  criado_em timestamptz not null default clock_timestamp(),
  unique (operador_usuario_id, ambiente, data_corte_brt)
);
```

### `lia_followup_resumo_itens`

O vínculo audita quais pesquisas estavam no resumo. Não duplica nome, telefone, motivo ou resposta.

```sql
create table public.lia_followup_resumo_itens (
  resumo_id uuid not null references public.lia_followup_resumos(id),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  vencido_em_snapshot timestamptz not null,
  interacao_nao_substantiva_snapshot boolean not null,
  cancelado_em timestamptz,
  cancelamento_motivo text check (
    cancelamento_motivo is null
    or cancelamento_motivo in ('resposta_valida', 'opt_out', 'acao_manual')
  ),
  criado_em timestamptz not null default clock_timestamp(),
  primary key (resumo_id, pesquisa_id),
  unique (pesquisa_id, ambiente),
  check (
    (cancelado_em is null and cancelamento_motivo is null)
    or (cancelado_em is not null and cancelamento_motivo is not null)
  )
);
```

### Adaptação de `lia_alertas_privados`

```sql
alter table public.lia_alertas_privados
  add column followup_resumo_id uuid unique
  references public.lia_followup_resumos(id);

alter table public.lia_alertas_privados
  alter column evento_id drop not null;

alter table public.lia_alertas_privados
  add constraint lia_alertas_privados_origem_chk
  check (num_nonnulls(evento_id, followup_resumo_id) = 1);
```

Alertas da Fase A continuam com `evento_id`; resumos da Fase B usam `followup_resumo_id`. O claim retorna `evento_tipo='followup_3d_resumo'` e `ambiente` do resumo sem alterar o contrato consumido pela Edge.

---

### Task 1: Congelar o contrato da Fase B e corrigir a documentação de estado

**Files:**
- Create: `tests/liaFollowup72hFaseB.test.mjs`
- Create: `docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md`
- Modify: `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md`
- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`

- [ ] **Step 1: Escrever o teste estrutural vermelho**

Criar o teste com os contratos que ainda não existem:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql',
);
const fixturePath = resolve(
  root,
  'tests/fixtures/lia_followup_72h_fase_b_pg17.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const sql = read(migrationPath);
const fixture = read(fixturePath);

test('fase B nasce desligada e não cria novo cron de transporte', () => {
  assert.match(sql, /followup_72h_liberado\s+boolean\s+not null\s+default false/i);
  assert.doesNotMatch(sql, /cron\.schedule/i);
  assert.match(sql, /interval '72 hours'/i);
  assert.match(sql, /America\/Sao_Paulo/i);
});

test('estado exclui teste, resposta válida e opt-out', () => {
  assert.match(sql, /modo_teste\s*=\s*false/i);
  assert.match(sql, /resposta_valida\s*=\s*false/i);
  assert.match(sql, /opt_out_em\s+is null/i);
  assert.match(sql, /recusada_opt_out/i);
});

test('resumo é privado, agrupado e idempotente por operador', () => {
  assert.match(sql, /create table public\.lia_followup_resumos/i);
  assert.match(sql, /create table public\.lia_followup_resumo_itens/i);
  assert.match(sql, /operador_usuario_id/i);
  assert.match(sql, /limit 10/i);
  assert.match(sql, /followup_3d_operador:/i);
  assert.match(sql, /data_corte_brt/i);
  assert.match(sql, /09:00/i);
  assert.doesNotMatch(sql, /usuarios\.telefone/i);
});

test('ação manual resolve o operador pelo JWT', () => {
  assert.match(sql, /registrar_followup_pesquisa_evasao_v1/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /fn_pesquisa_evasao_usuario_interno_ativo/i);
  assert.match(sql, /acao in \('realizado', 'dispensado'\)/i);
});

test('fixture executável cobre concorrência e isolamento', () => {
  assert.ok(fixture, `fixture ausente: ${fixturePath}`);
  for (const evidence of [
    /EZEQUIEL_DUE_AT_72H_OK/,
    /NON_SUBSTANTIVE_STAYS_PENDING_OK/,
    /OPT_OUT_BLOCKS_FOLLOWUP_OK/,
    /RESPONSE_BEFORE_CLAIM_CANCELS_OK/,
    /OPERATOR_ISOLATION_OK/,
    /MANUAL_ACTION_AUDIT_OK/,
    /LIA_FOLLOWUP_72H_FASE_B_PG17_OK/,
  ]) assert.match(fixture, evidence);
});
```

- [ ] **Step 2: Rodar o teste e confirmar vermelho**

Run:

```powershell
node --test tests/liaFollowup72hFaseB.test.mjs
```

Expected: FAIL porque migration e fixture ainda não existem.

- [ ] **Step 3: Atualizar a spec e iniciar o runbook**

Na spec, substituir o estado antigo da Fase A por:

```markdown
### 20.1 Estado reconciliado da Fase A em 03/08/2026

- outbox, dispatcher, caixa 3 e cron por minuto estão ativos em produção;
- alertas de resposta nova, rodada pós-revisão e opt-out foram validados;
- o primeiro alerta produtivo foi entregue à Jéssica sem eco na Caixa de Entrada;
- a Fase B reaproveita o mesmo transporte e não altera o webhook inbound.

### 20.2 Cadência da Fase B

- a fila muda de estado exatamente em `enviado_em + 72 horas`;
- o produtor agrupa uma vez por operador e por dia, às 09:00 BRT;
- casos vencidos depois do resumo ficam visíveis na tela imediatamente e entram no resumo da manhã seguinte;
- a chave de idempotência é `followup_3d_operador:{usuario_id}:{YYYYMMDD}`;
- o follow-up automático à família permanece fora desta fase.
```

No runbook novo, registrar desde o início:

```markdown
# Lia Fase B — rollout do follow-up de 72 horas

## Estado inicial

- projeto: `ouqwbbermlzqqvtqwlul`;
- Fase A ativa e saudável;
- Fase B bloqueada por `followup_72h_liberado=false`;
- nenhum novo cron, bridge, fila de relatório ou webhook inbound faz parte do rollout;
- caso real de aceite: Ezequiel, vencimento em 06/08/2026 10:55:54 BRT e primeiro resumo elegível em 07/08/2026 09:00 BRT.
```

- [ ] **Step 4: Commit da documentação e teste vermelho**

```powershell
git add docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md tests/liaFollowup72hFaseB.test.mjs
git commit -m "docs: planejar follow-up de 72h da Lia"
```

---

### Task 2: Criar schema privado, read model e ação manual

**Files:**
- Create: `supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql`
- Create: `tests/fixtures/lia_followup_72h_fase_b_pg17.sql`
- Modify: `tests/liaFollowup72hFaseB.test.mjs`

- [ ] **Step 1: Criar tabelas, flag e ACLs**

Implementar os três contratos físicos definidos no início do plano e adicionar:

```sql
alter table public.lia_alertas_configuracao
  add column followup_72h_liberado boolean not null default false;

alter table public.pesquisa_evasao_followup_acoes enable row level security;
alter table public.lia_followup_resumos enable row level security;
alter table public.lia_followup_resumo_itens enable row level security;

revoke all on table public.pesquisa_evasao_followup_acoes
  from public, anon, authenticated;
revoke all on table public.lia_followup_resumos
  from public, anon, authenticated;
revoke all on table public.lia_followup_resumo_itens
  from public, anon, authenticated;

grant all on table public.pesquisa_evasao_followup_acoes to service_role;
grant all on table public.lia_followup_resumos to service_role;
grant all on table public.lia_followup_resumo_itens to service_role;
```

Revogar também de `fabio_agent`, `lia_acesso_restrito`, `mila_acesso_restrito`, `sol_acesso_restrito`, `maria_lareport_rpc` e `ml_jobs`, se os roles existirem.

- [ ] **Step 2: Criar o read model único do estado**

Criar `fn_pesquisa_evasao_followup_estado(p_agora timestamptz)` como `STABLE SECURITY DEFINER`, restrita a `service_role` e a usuário interno ativo. Ela deve retornar:

```sql
returns table (
  pesquisa_id uuid,
  evasao_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  enviado_em timestamptz,
  vencido_em timestamptz,
  operador_usuario_id integer,
  operador_nome text,
  estado_visivel text,
  followup_pendente boolean,
  interagiu_sem_resposta_valida boolean,
  alerta_enviado_em timestamptz,
  acao text,
  acao_canal text,
  acao_observacao text,
  acao_registrada_em timestamptz,
  acao_operador_nome text
)
```

O núcleo de elegibilidade deve ser literal:

```sql
pe.modo_teste = false
and pe.envio_status in ('enviado', 'entregue', 'lido')
and pe.enviado_em is not null
and pe.resposta_valida = false
and pe.opt_out_em is null
and pe.resposta_status <> 'recusada_opt_out'
```

O prazo é `pe.enviado_em + interval '72 hours'`; não usar `current_date`, dias úteis nem data da evasão.

- [ ] **Step 3: Criar RPC paginada e contador**

Criar:

```sql
public.listar_followups_pesquisa_evasao_v1(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_estado text,
  p_ano integer,
  p_mes integer,
  p_busca text
)
```

Ela aceita `p_estado` em `todos`, `followup_pendente`, `followup_avisado`, `followup_realizado`, `followup_dispensado` e `aguardando_resposta`, limita página a 100 e retorna `total_count` junto dos campos do read model. O filtro `followup_pendente` usa `followup_pendente=true`, portanto inclui tanto ainda não avisado quanto avisado.

Criar também:

```sql
public.contar_followups_pesquisa_evasao_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns bigint
```

O contador usa o mesmo read model e conta `followup_pendente=true`.

- [ ] **Step 4: Criar RPC auditável para ação manual**

Criar:

```sql
public.registrar_followup_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_acao text,
  p_canal text,
  p_observacao text
)
returns table (
  pesquisa_id uuid,
  acao text,
  operador_usuario_id integer,
  registrado_em timestamptz
)
```

A função deve:

1. exigir `fn_pesquisa_evasao_usuario_interno_ativo()`;
2. resolver `usuarios.id` por `auth.uid()`;
3. travar a pesquisa com `FOR UPDATE`;
4. rejeitar teste, envio não confirmado, prazo não vencido, resposta válida e opt-out;
5. exigir canal para `realizado` e proibi-lo para `dispensado`;
6. inserir uma única linha;
7. retornar idempotentemente a mesma ação do mesmo registro;
8. levantar `PESQUISA_EVASAO_FOLLOWUP_CONFLITO` se já houver ação diferente.

Revogar de `public` e `anon`; conceder apenas a `authenticated` e `service_role`.

- [ ] **Step 5: Montar fixture PG17 com relógio fixo**

A fixture deve usar relógios fixos para provar o vencimento do Ezequiel em `2026-08-06 10:55:54 BRT`, sua entrada imediata na tela e sua inclusão apenas no resumo de `2026-08-07 09:00 BRT`. Incluir casos separados para:

- 71h59m59s: `aguardando_resposta`;
- 72h exatas: `followup_pendente`;
- `modo_teste=true`: excluído;
- `resposta_valida=true`: excluído;
- `opt_out_em` preenchido: excluído;
- abertura e adiamento: permanece pendente e recebe selo;
- realizado e dispensado: saem da contagem e preservam ator/hora;
- usuário `authenticated` não lê diretamente as três tabelas.

- [ ] **Step 6: Rodar testes estruturais e fixture**

```powershell
node --test tests/liaFollowup72hFaseB.test.mjs
$env:PESQUISA_EVASAO_PG17_CONTAINER='pesquisa-evasao-pg17'
node --test tests/liaFollowup72hFaseB.test.mjs
Remove-Item Env:PESQUISA_EVASAO_PG17_CONTAINER
```

Expected: todos os testes passam e a fixture imprime `LIA_FOLLOWUP_72H_FASE_B_PG17_OK`.

- [ ] **Step 7: Commit do domínio de follow-up**

```powershell
git add supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql tests/fixtures/lia_followup_72h_fase_b_pg17.sql tests/liaFollowup72hFaseB.test.mjs
git commit -m "feat: criar fila de follow-up de 72h"
```

---

### Task 3: Agrupar resumos e adaptar a outbox da Fase A

**Files:**
- Modify: `supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql`
- Modify: `tests/fixtures/lia_followup_72h_fase_b_pg17.sql`
- Modify: `tests/liaFollowup72hFaseB.test.mjs`

- [ ] **Step 1: Tornar a origem da outbox polimórfica sem quebrar a Fase A**

Aplicar o contrato `followup_resumo_id` e reescrever `fn_lia_claim_alerta_privado_em` para não depender de `JOIN` obrigatório com `lia_pesquisa_eventos`. O retorno permanece:

```sql
returns table (
  alerta_id uuid,
  claim_token uuid,
  destino text,
  mensagem text,
  evento_tipo text,
  ambiente text,
  caixa_id integer
)
```

No retorno:

```sql
coalesce(evento.tipo, 'followup_3d_resumo') as evento_tipo,
coalesce(evento.ambiente, resumo.ambiente) as ambiente
```

A revalidação de operador/destino deve partir de `alerta.destinatario_usuario_id`, funcionando para ambas as origens. Atualizar também `listar_lia_alertas_pendencias_administrativas` para usar `LEFT JOIN` nas duas origens; resumo administrativo retorna `pesquisa_id`, aluno e unidade nulos, sem expor sua lista.

- [ ] **Step 2: Criar o renderizador determinístico do resumo**

Criar `fn_lia_renderizar_resumo_followup(p_operador_usuario_id integer, p_agora timestamptz)` com esta cópia:

```text
⏰ *Pesquisas aguardando follow-up — 3 dias*

Você tem {{total}} pesquisa(s) enviada(s) sem resposta válida:

{{aluno}} — {{unidade}} — enviada em {{dd/mm HH:mm}}

{{quantidade_restante}}
👉 https://la-performance-report.vercel.app/app/sucesso-aluno?destino=pesquisas-evasao&filtro=followup_pendente
```

O SQL usa somente `aluno_nome`, `unidade_nome` e `enviado_em`, ordena pelo vencimento mais antigo e aplica `LIMIT 10`. Não inclui telefone, motivo, texto, áudio ou transcrição.

- [ ] **Step 3: Criar o produtor idempotente**

Criar:

```sql
public.produzir_lia_resumos_followup_72h(
  p_agora timestamptz default clock_timestamp()
)
returns table (
  resumos_criados integer,
  casos_vinculados integer
)
```

Regras obrigatórias:

- somente `service_role`;
- no-op se `followup_72h_liberado=false`;
- no-op antes de 09:00 BRT;
- `data_corte_brt=(p_agora at time zone 'America/Sao_Paulo')::date`;
- agrupar por `operador_usuario_id`;
- selecionar casos `followup_pendente=true` ainda ausentes de `lia_followup_resumo_itens` no ambiente de produção;
- inserir resumo e todos os itens na mesma transação;
- chave `followup_3d_operador:{usuario_id}:{YYYYMMDD}`;
- criar no máximo um resumo por operador e dia; execuções posteriores do cron no mesmo dia são no-op;
- um caso vencido depois das 09:00 permanece na fila da tela e só é agrupado no resumo do dia seguinte;
- resolver somente `lia_destinos_privados` ativo do operador;
- usar `caixa_id=3`;
- criar `lia_alertas_privados` em `pendente`, `aguardando_liberacao` ou `fila_administrativa` conforme as mesmas regras da Fase A;
- nunca consultar `usuarios.telefone` e nunca redirecionar para outro operador ou grupo.

- [ ] **Step 4: Criar piloto isolado**

Criar `enfileirar_lia_followup_piloto(p_pesquisa_id uuid)` exclusiva do `service_role`. Ela exige pesquisa `modo_teste=true`, força destinatário governado `usuarios.id=2`, usa `ambiente='teste'` e não ocupa a unicidade do ambiente produtivo.

- [ ] **Step 5: Provar resposta concorrente e falha sem repetição**

Na fixture:

1. produzir um resumo ainda bloqueado;
2. registrar resposta válida antes do claim;
3. executar o claim, que deve marcar o item inelegível com `cancelado_em` e
   `cancelamento_motivo`, recalcular `total_casos` e renderizar novamente a
   mensagem somente com itens ainda elegíveis;
4. se nenhum item restar, marcar o alerta `cancelado`, limpar os snapshots da
   entrega e não retorná-lo;
5. provar que alerta `resultado_ambiguo` ou `falha` não gera novo resumo para as mesmas pesquisas.

Para isso, acrescentar `cancelado` ao check de `lia_alertas_privados.status` e ao expurgo terminal, sem reenfileirar.

- [ ] **Step 6: Rodar os testes**

```powershell
node --test tests/liaFollowup72hFaseB.test.mjs tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasAtivacao.test.mjs
```

Expected: Fase B verde e nenhuma regressão nos contratos da Fase A.

- [ ] **Step 7: Commit da outbox compartilhada**

```powershell
git add supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql tests/fixtures/lia_followup_72h_fase_b_pg17.sql tests/liaFollowup72hFaseB.test.mjs
git commit -m "feat: agrupar follow-ups na outbox da Lia"
```

---

### Task 4: Fazer o dispatcher acordar o produtor sem quebrar a Fase A

**Files:**
- Modify: `supabase/functions/processar-alertas-lia/index.ts`
- Modify: `supabase/functions/processar-alertas-lia/dispatcher.ts`
- Modify: `supabase/functions/processar-alertas-lia/dispatcher.test.ts`
- Modify: `tests/liaAlertasDispatcherEdge.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Adicionar cobertura para:

```ts
Deno.test("follow-up usa o mesmo transporte e uma unica chamada", async () => {
  const claim = {
    alerta_id: crypto.randomUUID(),
    claim_token: crypto.randomUUID(),
    destino: "5521981278047",
    mensagem: "Resumo de follow-up",
    evento_tipo: "followup_3d_resumo" as const,
    ambiente: "teste" as const,
    caixa_id: 3,
  };
  const result = await processarUmAlerta(criarAdapters({ claim }), claim.alerta_id);
  assertEquals(result.status, "enviado");
  assertEquals(chamadasProvider, 1);
});
```

No teste Node, exigir `produzir_lia_resumos_followup_72h`, `verify_jwt=true` e ausência de `webhook-whatsapp-inbox` no pacote.

- [ ] **Step 2: Confirmar vermelho**

```powershell
deno test supabase/functions/processar-alertas-lia/dispatcher.test.ts
node --test tests/liaAlertasDispatcherEdge.test.mjs
```

Expected: FAIL porque o tipo e a chamada do produtor ainda não existem.

- [ ] **Step 3: Integrar produtor com falha isolada**

Depois da autenticação `service_role` e antes do claim, somente quando `alerta_id` não foi informado:

```ts
if (pedido.alertaId === null) {
  const { error: produtorError } = await supabase.rpc(
    "produzir_lia_resumos_followup_72h",
    { p_agora: new Date().toISOString() },
  );
  if (produtorError) {
    console.error(JSON.stringify({
      evento: "lia_followup_produtor",
      status: "erro",
      erro_codigo: "produtor_indisponivel",
    }));
  }
}
```

A Edge continua executando `processarUmAlerta` mesmo se o produtor falhar. Assim, uma falha da Fase B nunca segura alertas de resposta da Fase A.

- [ ] **Step 4: Ampliar somente a união de tipos**

```ts
evento_tipo:
  | "resposta_nova"
  | "rodada_nova_pos_revisao"
  | "opt_out"
  | "followup_3d_resumo";
```

Não alterar provider, timeout, idempotência, caixa, headers, logs ou regra de resultado ambíguo.

- [ ] **Step 5: Rodar testes**

```powershell
deno test supabase/functions/processar-alertas-lia/dispatcher.test.ts
deno check supabase/functions/processar-alertas-lia/index.ts
node --test tests/liaAlertasDispatcherEdge.test.mjs tests/liaFollowup72hFaseB.test.mjs
```

- [ ] **Step 6: Commit da Edge compatível**

```powershell
git add supabase/functions/processar-alertas-lia/index.ts supabase/functions/processar-alertas-lia/dispatcher.ts supabase/functions/processar-alertas-lia/dispatcher.test.ts tests/liaAlertasDispatcherEdge.test.mjs
git commit -m "feat: produzir resumos de follow-up no dispatcher"
```

---

### Task 5: Criar hook, tipos e modal de ação manual

**Files:**
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts`
- Create: `src/components/App/SucessoCliente/ModalRegistrarFollowupEvasao.tsx`
- Create: `tests/pesquisaEvasaoFollowupFrontend.test.mjs`

- [ ] **Step 1: Escrever teste de contrato vermelho**

O teste deve exigir os três RPCs, estados, contador e ausência de escrita direta:

```js
test('frontend usa somente RPCs governadas', () => {
  const source = `${read(hook)}\n${read(modal)}`;
  assert.match(source, /listar_followups_pesquisa_evasao_v1/);
  assert.match(source, /contar_followups_pesquisa_evasao_v1/);
  assert.match(source, /registrar_followup_pesquisa_evasao_v1/);
  assert.doesNotMatch(source, /\.from\(['"]pesquisa_evasao_followup_acoes['"]\)/);
});
```

- [ ] **Step 2: Adicionar tipos exatos**

```ts
export type PesquisaEvasaoFollowupEstado =
  | 'aguardando_resposta'
  | 'followup_pendente'
  | 'followup_avisado'
  | 'followup_realizado'
  | 'followup_dispensado'
  | 'respondendo'
  | 'pronta_para_revisao'
  | 'nova_rodada'
  | 'revisada'
  | 'opt_out';

export interface PesquisaEvasaoFollowupItem {
  total_count: number;
  pesquisa_id: string;
  evasao_id: number;
  aluno_nome: string;
  unidade_id: string;
  unidade_nome: string;
  enviado_em: string;
  vencido_em: string;
  operador_usuario_id: number;
  operador_nome: string;
  estado_visivel: PesquisaEvasaoFollowupEstado;
  followup_pendente: boolean;
  interagiu_sem_resposta_valida: boolean;
  alerta_enviado_em: string | null;
  acao: 'realizado' | 'dispensado' | null;
  acao_canal: 'whatsapp' | 'telefone' | 'outro' | null;
  acao_observacao: string | null;
  acao_registrada_em: string | null;
  acao_operador_nome: string | null;
}
```

- [ ] **Step 3: Implementar o hook sem escrita direta**

O hook recebe unidade, ano, mês, busca, estado e página; expõe `itens`, `total`, `totalPendente`, `loading`, `recarregar` e `registrarAcao`. `registrarAcao` invoca apenas a RPC e recarrega lista/contador depois do sucesso.

- [ ] **Step 4: Implementar modal explícito**

O modal oferece dois modos:

- `Marcar como realizado`: canal obrigatório (`WhatsApp`, `Ligação`, `Outro`);
- `Dispensar follow-up`: sem canal;
- observação opcional com contador `0/500`;
- texto explica que a ação registra usuário e horário e não envia mensagem à família.

Não exibir ou editar telefone, caixa ou conteúdo da resposta.

- [ ] **Step 5: Rodar teste e build**

```powershell
node --test tests/pesquisaEvasaoFollowupFrontend.test.mjs
npm run build
```

- [ ] **Step 6: Commit da fundação de UI**

```powershell
git add src/components/App/SucessoCliente/pesquisaEvasao.types.ts src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts src/components/App/SucessoCliente/ModalRegistrarFollowupEvasao.tsx tests/pesquisaEvasaoFollowupFrontend.test.mjs
git commit -m "feat: adicionar ações manuais de follow-up"
```

---

### Task 6: Exibir fila, contador, filtros e estados

**Files:**
- Create: `src/components/App/SucessoCliente/FilaFollowupEvasao.tsx`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Modify: `tests/pesquisaEvasaoFollowupFrontend.test.mjs`

- [ ] **Step 1: Ampliar o teste de UI**

Exigir os textos:

```js
for (const label of [
  'Enviado em',
  'Aguardando resposta',
  'Follow-up pendente',
  'Follow-up avisado',
  'Follow-up realizado',
  'Interagiu sem resposta válida',
]) assert.match(source, new RegExp(label, 'i'));
```

Exigir ainda que `PesquisaEvasaoTab` monte `FilaFollowupEvasao` e leia `filtro=followup_pendente`.

- [ ] **Step 2: Implementar o painel próprio**

O painel deve conter:

- contador destacado `Follow-up pendente`;
- select `Pendentes`, `Avisados`, `Realizados`, `Dispensados`, `Aguardando resposta`, `Todos`;
- busca por aluno/unidade/operador;
- paginação de 50 itens;
- linha com aluno, unidade, envio, vencimento, operador, estado e ação;
- selo `Interagiu sem resposta válida` sem retirar a linha;
- selo permanente `Enviado em dd/MM HH:mm por Nome`;
- botões `Marcar realizado` e `Dispensar` somente para casos ainda pendentes;
- expansão de `ConversaPesquisaEvasao` para leitura protegida do caso.

- [ ] **Step 3: Integrar sem alterar a tabela antiga**

Montar o painel depois de `FilaRevisaoEvasao` e antes dos filtros da tabela de evadidos:

```tsx
<FilaFollowupEvasao
  unidadeAtual={unidadeAtual}
  ano={filtroAno}
  mes={filtroMes}
  filtroInicial={abrirFollowupPendente ? 'followup_pendente' : 'todos'}
  onAlteracao={carregarDados}
/>
```

Em `PesquisaEvasaoTab`, usar `useSearchParams()` e derivar:

```ts
const abrirFollowupPendente =
  searchParams.get('filtro') === 'followup_pendente';
```

Não alterar `listar_evadidos_para_pesquisa_v2`, `stats_pesquisa_evasao`, envio, prévia, modo teste ou fila de revisão.

- [ ] **Step 4: Rodar teste e build**

```powershell
node --test tests/pesquisaEvasaoFollowupFrontend.test.mjs
npm run build
```

- [ ] **Step 5: Smoke local visual**

Abrir `/app/sucesso-aluno?destino=pesquisas-evasao&filtro=followup_pendente` e provar:

1. aba Acompanhamento > Pesquisas > Evasão abre;
2. painel de follow-up abre filtrado;
3. contador e estado aparecem;
4. ação manual abre modal, mas não é confirmada contra produção;
5. tabela antiga, prévia e fila de revisão continuam visíveis.

- [ ] **Step 6: Commit da interface**

```powershell
git add src/components/App/SucessoCliente/FilaFollowupEvasao.tsx src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx tests/pesquisaEvasaoFollowupFrontend.test.mjs
git commit -m "feat: exibir fila de follow-up de evasão"
```

---

### Task 7: Verificação completa e preparação do rollout

**Files:**
- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md`
- Modify: `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md`

- [ ] **Step 1: Rodar suíte focada**

```powershell
node --test tests/liaFollowup72hFaseB.test.mjs tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasAtivacao.test.mjs tests/liaAlertasDispatcherEdge.test.mjs tests/pesquisaEvasaoFollowupFrontend.test.mjs
deno test supabase/functions/processar-alertas-lia/dispatcher.test.ts
deno check supabase/functions/processar-alertas-lia/index.ts
npm run build
```

Expected: tudo verde; teste PG17 pode aparecer como skip somente quando a variável do container não estiver definida.

- [ ] **Step 2: Rodar fixture PG17 obrigatória**

```powershell
$env:PESQUISA_EVASAO_PG17_CONTAINER='pesquisa-evasao-pg17'
node --test tests/liaFollowup72hFaseB.test.mjs
Remove-Item Env:PESQUISA_EVASAO_PG17_CONTAINER
```

Expected: `LIA_FOLLOWUP_72H_FASE_B_PG17_OK`.

- [ ] **Step 3: Revisar escopo do diff**

```powershell
git diff --stat HEAD~6..HEAD
git diff HEAD~6..HEAD -- supabase/functions/webhook-whatsapp-inbox supabase/functions/enviar-pesquisa-evasao
git status --short --branch
```

Expected: nenhum diff no webhook inbound ou na Edge de envio; somente migration Fase B, dispatcher da Lia, UI, testes e docs.

- [ ] **Step 4: Completar runbook com gates e rollback**

Registrar:

- hash e tamanho da migration estrutural;
- prova de `followup_72h_liberado=false`;
- prova de que o cron existente não mudou;
- piloto exclusivo no número governado do Alf;
- activation migration criada somente após aceite;
- rollback por objeto: desativar flag, remover chamada do produtor da Edge, preservar ações manuais e resumos já auditados;
- primeiro caso real: Ezequiel vence em 06/08 às 10:55:54 BRT e entra no resumo de 07/08 às 09:00 BRT;
- follow-up automático à família fora de escopo.

- [ ] **Step 5: Commit de fechamento local**

```powershell
git add docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md
git commit -m "docs: preparar rollout da Fase B da Lia"
```

Parar aqui. Não aplicar migration, publicar Edge, fazer push ou enviar WhatsApp sem autorização explícita do Alf.

---

### Task 8: Rollout governado da Fase B

**Files:**
- Create after pilot: `supabase/migrations/20260804093000_lia_followup_72h_fase_b_ativacao.sql`
- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-b-rollout.md`

Esta task só começa com autorização separada e presença do Alf.

- [ ] **Gate A: Migration estrutural, produção desligada**

Aplicar `20260804090000_lia_followup_72h_fase_b.sql` e confirmar:

```sql
select followup_72h_liberado
from public.lia_alertas_configuracao
where id = 1;
```

Expected: `false`.

Confirmar ainda que a pesquisa do Ezequiel está `aguardando_resposta`, que nenhuma outbox de follow-up foi criada e que os alertas da Fase A continuam reclamáveis.

- [ ] **Gate B: Edge compatível**

Publicar `processar-alertas-lia` com `verify_jwt=true`. Provar:

- anônimo 401;
- JWT inválido 401;
- usuário comum 403;
- `service_role` 200;
- alerta Fase A controlado continua funcionando;
- produtor retorna zero porque a flag está desligada;
- nenhum deploy do webhook inbound.

- [ ] **Gate C: Frontend**

Publicar o frontend depois das RPCs. Conferir painel, contador zero ou atual, filtros, link e modal. Não registrar ação num caso real durante o smoke.

- [ ] **Gate D: Piloto no número do Alf**

Usar uma pesquisa `modo_teste=true` e `enfileirar_lia_followup_piloto`. Confirmar:

- destino governado `usuarios.id=2`;
- caixa 3;
- uma tentativa;
- um `provider_message_id`;
- lista sem telefone, motivo ou conteúdo da resposta;
- nenhuma entrega para Jéssica/Fabi;
- nenhum eco na Caixa de Entrada;
- filtro do link abre a fila correta.

- [ ] **Gate E: Criar e revisar a activation migration**

Somente depois do aceite do piloto, criar:

```sql
do $block$
begin
  if not exists (
    select 1
    from public.lia_alertas_configuracao
    where id = 1
      and alertas_producao_liberados = true
      and followup_72h_liberado = false
  ) then
    raise exception 'estado_invalido_para_ativar_followup_72h';
  end if;
end;
$block$;

update public.lia_alertas_configuracao
set followup_72h_liberado = true,
    atualizado_em = clock_timestamp()
where id = 1;
```

Mostrar diff e hash antes de aplicar.

- [ ] **Gate F: Ativação e primeiro caso real**

Aplicar a activation migration e monitorar o cron. No vencimento do Ezequiel e no resumo diário seguinte, confirmar:

- entrada na fila às 72h;
- entrada na fila da tela em 06/08 às 10:55:54 BRT, sem aviso imediato;
- resumo destinado somente a Jéssica (`usuarios.id=29`) em 07/08 às 09:00 BRT;
- caixa 3;
- uma tentativa e `provider_message_id`;
- estado muda para `Follow-up avisado`, mas continua no contador pendente;
- nenhuma notificação para Fabi, Alf ou grupo;
- nenhuma mensagem automática à família.

Depois, Jéssica registra manualmente `realizado` ou `dispensado`; conferir operador, auth UID, canal quando aplicável e horário. O caso sai do contador, mas a auditoria permanece.

## Critérios finais de aceite

- Prazo calculado por 72 horas corridas desde `enviado_em`.
- Teste, resposta válida e opt-out nunca entram na fila produtiva.
- Interação não substantiva permanece pendente e claramente rotulada.
- Um resumo por operador/dia às 09:00 BRT, sem notificação cruzada.
- A entrega usa exatamente a outbox, caixa, dispatcher e cron da Fase A.
- A falha do produtor da Fase B não bloqueia alertas da Fase A.
- `Follow-up avisado` continua pendente até ação humana ou resposta válida.
- Ação manual registra operador, auth UID, horário, resultado e canal quando realizado.
- Frontend antigo funciona entre migration e deploy da UI.
- Follow-up automático à família permanece sem implementação e desligado.
