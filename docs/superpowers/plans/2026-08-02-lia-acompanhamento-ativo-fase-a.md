# Lia — Acompanhamento Ativo da Pesquisa de Evasão, Fase A Implementation Plan

> **Execução:** seguir as tarefas sequencialmente na `main` local, com commits
> normais, sem worktree, branch ou PR por tarefa. Migration, deploy de Edge e
> envio de WhatsApp continuam exigindo autorização explícita separada.

**Goal:** Entregar alertas privados, idempotentes e auditáveis para resposta nova, rodada nova após revisão e opt-out, sempre somente à pessoa que enviou a pesquisa, com piloto obrigatório no número do Alf antes de liberar Fabi e Jéssica.

**Architecture:** O Postgres registra o fato imutável e uma entrega privada em outbox na mesma transação em que a mensagem substantiva é classificada. A outbox usa um cadastro governado por `usuarios.id`, nunca `usuarios.telefone` em tempo de execução, e fica bloqueada para produção até o piloto. Uma Edge Function backend-only, acordada por `pg_cron`, reclama no máximo uma entrega por RPC atômica e envia diretamente pela caixa 3 no mesmo `POST /send/text` da UAZAPI que já atende Fabi e Jéssica; não existe worker, unit ou rota nova no bridge.

**Tech Stack:** PostgreSQL 17/Supabase/RLS, PL/pgSQL, Supabase Edge Functions/Deno, `pg_cron`, `pg_net`, Vault, Deno Test e Node `node:test`.

---

## Escopo fechado

**Ponto de retomada:** Tasks 1 a 4 são histórico concluído e não devem ser
reexecutadas. A próxima implementação começa na Task 5, removendo o transporte
rejeitado antes de criar o dispatcher Edge.

Incluído nesta fase:

- outbox de `resposta_nova`, `rodada_nova_pos_revisao` e `opt_out`;
- um alerta por pesquisa e versão da rodada;
- destinatário exclusivamente igual a `pesquisa_evasao.executado_por_usuario_id`;
- cadastro governado dos destinos privados de Alf, Jéssica e Fabi;
- fila administrativa para operador inativo, destino ausente ou resultado ambíguo;
- piloto ponta a ponta no número governado do Alf;
- link autenticado para a tela do Sucesso do Aluno;
- dispatcher Edge pela caixa 3, acionamento por `pg_cron` e observabilidade sanitizada.

Fora desta fase:

- D+3, resumo privado e estados/filtros de follow-up, que pertencem à Fase B;
- coortes, histórico de KPI e grupo, que pertencem à Fase C;
- follow-up automático à família, que pertence à Fase D e segue desligado;
- classificação de causa ou conteúdo da resposta, que pertence ao Subprojeto C;
- notificação cruzada entre Fabi e Jéssica;
- reestruturação geral de Lia, Sol, Fábio ou Telegram.
- deep link para abrir a pesquisa exata e os quatro componentes de frontend
  necessários para isso;
- ajuste visual da consolidação duplicada na conversa.

## Evidência e decisões reconciliadas em 03/08/2026

- Projeto de produção confirmado: `ouqwbbermlzqqvtqwlul`.
- Alias estável de produção confirmado na Vercel:
  `https://la-performance-report.vercel.app`.
- Alf: `usuarios.id=2`, destino `5521981278047`.
- Jéssica: `usuarios.id=29`, destino `5521984695110`.
- Fabi: `usuarios.id=30`, destino `5521994696489`.
- Os três usuários estão ativos e possuem `auth_user_id`.
- O primeiro alerta entregue usa somente o destino do Alf.
- Alertas produtivos permanecem bloqueados até o piloto ser aceito.
- Operador inativo vai para fila administrativa, nunca para grupo ou colega.
- O dispatcher envia entre 08:00 e 20:00 BRT. Fora dessa janela, mantém a entrega pendente.
- Resultado ambíguo do transporte não é reenviado automaticamente.
- `modo_teste=true` não gera alerta produtivo; o piloto usa uma RPC própria e ambiente `teste`.
- A caixa 3 é `Lia - Sucesso do Aluno`, usa o número de origem
  `+55 21 2342-5316` e já entregou 88 notificações confirmadas para Fabi e
  Jéssica com `whatsapp_message_id`.
- A UAZAPI apresenta o nome interno incorreto `Sol - Sucesso do Aluno`, mas o
  fingerprint do token coincide com a caixa 3 e com o bridge da Lia. Não existe
  compartilhamento de sessão.
- Número, URL e webhook `caixa_id=3` coincidem entre UAZAPI e banco; o perfil no
  provedor é `La Music`, com avatar da Lia. A caixa 1 é a instância ainda
  nomeada `teste sol`; a caixa 2 usa WAHA, outro número e outra sessão.
- Maria Financeiro, Fábio Pedagógico e Tom LA Organizer são instâncias
  distintas e não cadastradas em `whatsapp_caixas`.
- O transporte produtivo existente é backend-to-provider: Edge Function → caixa
  3 → UAZAPI `/send/text`. A Fase A o reaproveita sem passar pelo bridge 3001.
- A migration estrutural já foi aplicada em produção como versão remota
  `20260803124754`; `alertas_producao_liberados=false` e ainda não existe cron,
  piloto ou ativação. O dispatcher existe somente no checkout local.
- Jéssica enviou duas pesquisas produtivas em 03/08/2026, às 10:52 e 10:55
  BRT. Ambas nasceram em `multipartes_v2` e estavam `sem_resposta` no
  preflight. Se responderem antes da ativação, as entregas ficam em
  `aguardando_liberacao`, fora do claim.
- A Fase A não modifica nem publica `webhook-whatsapp-inbox`. Até a ativação, a
  equipe acompanha respostas reais diretamente na tela.
- `usuarios.id=29` foi corrigido para `Jéssica`; snapshots dos dois envios
  anteriores continuam com o valor histórico original.

## Mapa de arquivos

**Já criados e preservados:**

- `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql` — cadastro governado, eventos, entregas, produtor, claims e piloto, com produção bloqueada.
- `tests/liaAlertasPrivadosFaseA.test.mjs` — contrato estático e execução da fixture PostgreSQL 17.
- `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql` — prova real de idempotência, isolamento, roteamento e RLS.
- `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md` — rollout em gates e evidências.

**Implementados localmente no transporte revisado:**

- `supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql` — adiciona
  `caixa_id=3` à auditoria da outbox, expõe a caixa no claim e troca códigos de
  falha do bridge por códigos do provedor.
- `supabase/functions/processar-alertas-lia/index.ts` — endpoint backend-only que
  reclama uma entrega, usa exatamente a caixa 3 e registra o desfecho.
- `supabase/functions/processar-alertas-lia/dispatcher.ts` — núcleo testável,
  sem dependência do runtime HTTP.
- `supabase/functions/processar-alertas-lia/dispatcher.test.ts` — contratos de
  envio único, confirmação, ambiguidade e log sanitizado.
- `tests/liaAlertasDispatcherEdge.test.mjs` — contrato estático do pacote, do
  `verify_jwt=true` e da ausência de bridge/worker.

**Removidos ou revertidos no corte de arquitetura:**

- `scripts/process_lia_alert_queue.py`;
- `tests/test_process_lia_alert_queue.py`;
- `scripts/systemd/lia-alertas-privados.service`;
- `scripts/systemd/lia-alertas-privados.timer`;
- `scripts/lia-whatsapp-bridge/` e
  `tests/liaWhatsappAlertSingleMessage.test.mjs`;
- alterações da Fase A em `scripts/lareport_whatsapp_single.py` e
  `tests/test_lareport_whatsapp_single.py`; esses dois arquivos pertencem ao
  transporte de relatórios existente e devem voltar ao contrato `/send-report`
  da Sol.

**Modificar:**

- `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md` — manter a spec sincronizada com evidências de implementação.
- `docs/MAPA-SISTEMA.md` — documentar outbox, dispatcher Edge e fronteira com o motor de relatórios.

**Criar somente depois do piloto aceito:**

- `supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql` — liberar entregas produtivas e agendar o dispatcher. Este arquivo não pode existir antes do aceite do piloto.

## Contrato físico

### `lia_destinos_privados`

Uma linha ativa por `usuario_id + canal`, com histórico de rotações:

```sql
create table public.lia_destinos_privados (
  id uuid primary key default gen_random_uuid(),
  usuario_id integer not null references public.usuarios(id),
  canal text not null default 'whatsapp'
    check (canal = 'whatsapp'),
  destino_normalizado text not null
    check (destino_normalizado ~ '^[0-9]{12,15}$'),
  fonte_verificacao text not null,
  verificado_em timestamptz not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz,
  check ((ativo and desativado_em is null) or not ativo)
);

create unique index lia_destinos_privados_usuario_ativo_uidx
  on public.lia_destinos_privados (usuario_id, canal)
  where ativo;
```

O seed inicial é versionado e não consulta `usuarios.telefone`:

```sql
insert into public.lia_destinos_privados (
  usuario_id,
  destino_normalizado,
  fonte_verificacao,
  verificado_em
) values
  (2,  '5521981278047', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03'),
  (29, '5521984695110', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03'),
  (30, '5521994696489', 'decisao_alf_2026_08_02', '2026-08-02 00:00:00-03');
```

### `lia_alertas_configuracao`

Uma linha de configuração, backend-only:

```sql
create table public.lia_alertas_configuracao (
  id smallint primary key default 1 check (id = 1),
  app_base_url text not null
    check (app_base_url ~ '^https://'),
  alertas_producao_liberados boolean not null default false,
  atualizado_em timestamptz not null default now()
);

insert into public.lia_alertas_configuracao (
  id,
  app_base_url,
  alertas_producao_liberados
) values (
  1,
  'https://la-performance-report.vercel.app',
  false
);
```

### `lia_pesquisa_eventos`

O evento não contém resposta, telefone, transcrição ou motivo da evasão:

```sql
create table public.lia_pesquisa_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'resposta_nova',
    'rodada_nova_pos_revisao',
    'opt_out'
  )),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  analise_versao integer not null,
  operador_usuario_id integer references public.usuarios(id),
  aluno_nome_snapshot text not null,
  unidade_id uuid not null references public.unidades(id),
  unidade_nome_snapshot text not null,
  ocorrido_em timestamptz not null,
  idempotency_key text not null unique,
  criado_em timestamptz not null default now()
);

create unique index lia_pesquisa_eventos_resposta_rodada_uidx
  on public.lia_pesquisa_eventos (
    pesquisa_id,
    analise_versao,
    ambiente
  )
  where tipo in ('resposta_nova', 'rodada_nova_pos_revisao');

create unique index lia_pesquisa_eventos_opt_out_rodada_uidx
  on public.lia_pesquisa_eventos (
    pesquisa_id,
    analise_versao,
    ambiente
  )
  where tipo = 'opt_out';
```

### `lia_alertas_privados`

Uma entrega por evento; o destino usado é congelado e a tabela é backend-only:

```sql
create table public.lia_alertas_privados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique
    references public.lia_pesquisa_eventos(id),
  destinatario_usuario_id integer references public.usuarios(id),
  destino_id uuid references public.lia_destinos_privados(id),
  destino_snapshot text,
  template_codigo text not null,
  template_versao integer not null default 1,
  mensagem_renderizada text,
  status text not null check (status in (
    'aguardando_liberacao',
    'pendente',
    'processando',
    'enviado',
    'falha',
    'resultado_ambiguo',
    'fila_administrativa'
  )),
  motivo_pendencia text,
  tentativas integer not null default 0 check (tentativas >= 0),
  claim_token uuid,
  claimed_em timestamptz,
  provider_message_id text,
  enviado_em timestamptz,
  erro_codigo text,
  expurgado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    status not in ('aguardando_liberacao', 'pendente', 'processando')
    or (
      destinatario_usuario_id is not null
      and destino_id is not null
      and destino_snapshot is not null
      and mensagem_renderizada is not null
    )
  )
);
```

Todas as quatro tabelas têm RLS ativa, zero policies de cliente e grants apenas
para `service_role`. Uma RPC sanitizada de fila administrativa retorna somente
evento, aluno, unidade, operador, tipo e motivo; nunca destino ou mensagem.
Uma rotina diária zera `destino_snapshot` e `mensagem_renderizada` das entregas
terminais após 30 dias e grava `expurgado_em`, preservando somente metadados de
auditoria.

## Regras do produtor

O trigger roda em `pesquisa_evasao_mensagens` após insert e após mudança de
`substantividade`:

```sql
create trigger trg_lia_evento_pesquisa_evasao
after insert or update of substantividade
on public.pesquisa_evasao_mensagens
for each row execute function public.fn_lia_evento_pesquisa_evasao();
```

Critérios:

```text
direcao = entrada
resolution_status = resolvida
pesquisa_id e analise_versao preenchidos
substantividade entrou em conteudo_substantivo ou opt_out
pesquisa produtiva (modo_teste = false)
```

Classificação:

```text
opt_out                                      -> opt_out
conteúdo com rodada anterior revisada        -> rodada_nova_pos_revisao
demais primeiros conteúdos da rodada         -> resposta_nova
```

Chaves:

```text
resposta_nova:{pesquisa_id}:{analise_versao}
rodada_nova_pos_revisao:{pesquisa_id}:{analise_versao}
opt_out:{pesquisa_id}:{analise_versao}
```

O insert com `on conflict do nothing`, combinado com os dois índices parciais,
garante que texto, áudio transcrito, mudança posterior do estado da rodada e
reentrega do provedor não criem dois alertas de resposta para a mesma rodada.
Opt-out continua sendo um fato próprio e pode coexistir com um alerta de
resposta anterior da mesma rodada.

## Cópias determinísticas da Fase A

```text
🔔 *Resposta recebida — Pesquisa de evasão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família respondeu à pesquisa que você enviou. O conteúdo permanece protegido no LA Report.

👉 {{link_sucesso_aluno}}
```

```text
🔔 *Nova rodada após revisão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família enviou novo conteúdo depois da revisão. O caso voltou para a fila e precisa de uma nova leitura.

👉 {{link_sucesso_aluno}}
```

```text
🔕 *Família recusou novos contatos — Pesquisa de evasão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família pediu para não receber novas mensagens desta pesquisa. O caso foi bloqueado para follow-up.

👉 {{link_sucesso_aluno}}
```

`{{link_sucesso_aluno}}` é:

```text
https://la-performance-report.vercel.app/app/sucesso-aluno
```

## Task 1: Fixar o contrato em testes vermelhos — CONCLUÍDA, NÃO REEXECUTAR

**Files:**

- Create: `tests/liaAlertasPrivadosFaseA.test.mjs`
- Create: `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`

- [ ] **Step 1: Escrever o teste estático vermelho**

O teste deve exigir os arquivos, tabelas, seeds, RLS, grants, gatilho,
idempotência e bloqueio inicial:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('fase A nasce bloqueada e usa destinos governados', () => {
  const sql = read(migrationPath);
  assert.match(sql, /create table public\.lia_destinos_privados/i);
  assert.match(sql, /create table public\.lia_pesquisa_eventos/i);
  assert.match(sql, /create table public\.lia_alertas_privados/i);
  assert.match(sql, /alertas_producao_liberados[^;]+false/i);
  assert.match(sql, /\(2,\s*'5521981278047'/i);
  assert.match(sql, /\(29,\s*'5521984695110'/i);
  assert.match(sql, /\(30,\s*'5521994696489'/i);
  assert.doesNotMatch(sql, /coalesce\([^)]*usuarios\.telefone/i);
});

test('evento é por operador original e nunca faz fanout', () => {
  const sql = read(migrationPath);
  assert.match(sql, /executado_por_usuario_id/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.doesNotMatch(sql, /usuario_id\s+in\s*\(\s*29\s*,\s*30/i);
});
```

- [ ] **Step 2: Escrever a fixture PostgreSQL 17 vermelha**

A fixture deve preparar somente os stubs de `auth.role()`, `usuarios`,
`unidades`, `pesquisa_evasao`, `pesquisa_evasao_analises` e
`pesquisa_evasao_mensagens`, aplicar a migration e provar:

```sql
create or replace function public.fixture_assert(p_ok boolean, p_message text)
returns void language plpgsql as $fixture$
begin
  if not p_ok then raise exception 'FIXTURE_ASSERT: %', p_message; end if;
end;
$fixture$;

create or replace function public.fixture_pesquisa()
returns uuid language sql stable as $fixture$
  select '10000000-0000-4000-8000-000000000001'::uuid;
$fixture$;

-- dois fragmentos substantivos da mesma rodada => um evento e uma entrega
select fixture_assert(
  (select count(*) from public.lia_pesquisa_eventos
   where pesquisa_id = fixture_pesquisa() and analise_versao = 1) = 1,
  'uma rodada nao pode gerar dois alertas'
);

-- pesquisa enviada por 29 => somente destinatario 29
select fixture_assert(
  (select array_agg(distinct destinatario_usuario_id)
   from public.lia_alertas_privados) = array[29],
  'nao pode haver notificacao cruzada'
);

-- modo teste comum não gera evento produtivo
select fixture_assert(
  not exists (
    select 1 from public.lia_pesquisa_eventos where ambiente = 'teste'
  ),
  'teste comum nao pode entrar na outbox produtiva'
);
```

A última linha da fixture deve ser:

```sql
select 'PESQUISA_EVASAO_CLAIM_PG17_OK';
```

- [ ] **Step 3: Executar os testes e confirmar a falha**

Run:

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs
```

Expected: FAIL porque a migration e os contratos ainda não existem.

- [ ] **Step 4: Commit dos testes vermelhos**

```powershell
git add tests/liaAlertasPrivadosFaseA.test.mjs tests/fixtures/lia_alertas_privados_fase_a_pg17.sql
git commit -m "test: fixar contrato dos alertas privados da Lia"
```

## Task 2: Criar schema, destinos governados e proteção de acesso — CONCLUÍDA, NÃO REEXECUTAR

**Files:**

- Create: `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql`
- Modify: `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`

- [ ] **Step 1: Criar as quatro tabelas e os índices**

Usar exatamente o contrato físico deste plano e adicionar:

```sql
create index lia_alertas_privados_claim_idx
  on public.lia_alertas_privados (status, criado_em, id)
  where status = 'pendente';

create index lia_alertas_privados_admin_idx
  on public.lia_alertas_privados (atualizado_em desc, id)
  where status in ('fila_administrativa', 'falha', 'resultado_ambiguo');
```

- [ ] **Step 2: Aplicar RLS e ACL backend-only**

```sql
alter table public.lia_destinos_privados enable row level security;
alter table public.lia_alertas_configuracao enable row level security;
alter table public.lia_pesquisa_eventos enable row level security;
alter table public.lia_alertas_privados enable row level security;

revoke all on public.lia_destinos_privados from public, anon, authenticated;
revoke all on public.lia_alertas_configuracao from public, anon, authenticated;
revoke all on public.lia_pesquisa_eventos from public, anon, authenticated;
revoke all on public.lia_alertas_privados from public, anon, authenticated;

grant all on public.lia_destinos_privados to service_role;
grant all on public.lia_alertas_configuracao to service_role;
grant all on public.lia_pesquisa_eventos to service_role;
grant all on public.lia_alertas_privados to service_role;
```

Também revogar os roles de agentes existentes quando presentes:

```sql
do $block$
declare v_role text;
begin
  foreach v_role in array array[
    'fabio_agent', 'lia_acesso_restrito', 'mila_acesso_restrito',
    'sol_acesso_restrito', 'maria_lareport_rpc', 'ml_jobs'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on public.lia_destinos_privados, public.lia_alertas_configuracao, public.lia_pesquisa_eventos, public.lia_alertas_privados from %I',
        v_role
      );
    end if;
  end loop;
end;
$block$;
```

- [ ] **Step 3: Seedar os três destinos e a configuração bloqueada**

Usar os valores e a data congelados neste plano. A migration deve falhar se os
IDs 2, 29 ou 30 não existirem ou estiverem inativos; não procurar por nome ou
email e não atualizar `usuarios`.

- [ ] **Step 4: Criar o expurgo de 30 dias**

Criar `public.expurgar_lia_alertas_privados()` exclusiva do `service_role` e
agendá-la diariamente para atualizar apenas entregas terminais:

```sql
update public.lia_alertas_privados
set destino_snapshot = null,
    mensagem_renderizada = null,
    expurgado_em = now(),
    atualizado_em = now()
where status in ('enviado', 'falha', 'resultado_ambiguo', 'fila_administrativa')
  and atualizado_em < now() - interval '30 days'
  and expurgado_em is null;
```

O job guarda apenas a contagem expurgada; não registra os valores removidos.
Agendar às 03:20 BRT (`06:20 UTC`) com nome estável:

```sql
select cron.schedule(
  'lia-alertas-privados-expurgo-diario',
  '20 6 * * *',
  $$select public.expurgar_lia_alertas_privados();$$
);
```

- [ ] **Step 5: Executar contrato estático e fixture**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs
```

Expected: PASS para schema, seed, RLS e ACL; os testes do produtor ainda podem
permanecer vermelhos até a Task 3.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql tests/fixtures/lia_alertas_privados_fase_a_pg17.sql
git commit -m "feat: criar outbox privada governada da Lia"
```

## Task 3: Produzir eventos idempotentes no momento certo — CONCLUÍDA, NÃO REEXECUTAR

**Files:**

- Modify: `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql`
- Modify: `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`
- Modify: `tests/liaAlertasPrivadosFaseA.test.mjs`

- [ ] **Step 1: Escrever os cenários vermelhos do produtor**

Adicionar provas para:

```text
texto substantivo da rodada 1 -> resposta_nova
áudio indeterminado -> nenhum evento
mesmo áudio atualizado para conteúdo substantivo -> resposta_nova
segundo fragmento da rodada -> nenhum evento adicional
revisão concluída entre dois fragmentos da mesma rodada -> continua um alerta
rodada 2 após versão 1 revisada -> rodada_nova_pos_revisao
opt-out -> opt_out, nunca resposta_nova
conteúdo e opt-out na mesma rodada -> um alerta de resposta e um de opt-out
modo_teste -> nenhum evento produtivo
operador 29 -> somente destinatário 29
operador nulo/inativo -> fila_administrativa
```

- [ ] **Step 2: Implementar o renderizador determinístico**

Criar `public.fn_lia_renderizar_alerta_pesquisa(
  p_tipo text,
  p_aluno_nome text,
  p_unidade_nome text
)` como
`SECURITY DEFINER`, `search_path = public, pg_temp`, exclusiva do
`service_role` e das funções internas. Ela escolhe somente as três cópias
aprovadas e monta o link geral da tela do Sucesso do Aluno com `app_base_url`.

O retorno é um registro com:

```text
template_codigo
template_versao = 1
mensagem_renderizada
```

Nenhum parâmetro aceita resposta, transcrição, telefone ou motivo.

- [ ] **Step 3: Implementar `fn_lia_criar_evento_alerta`**

Fluxo mínimo:

```sql
insert into public.lia_pesquisa_eventos (
  tipo,
  ambiente,
  pesquisa_id,
  analise_versao,
  operador_usuario_id,
  aluno_nome_snapshot,
  unidade_id,
  unidade_nome_snapshot,
  ocorrido_em,
  idempotency_key
) values (
  p_tipo,
  p_ambiente,
  p_pesquisa_id,
  p_analise_versao,
  p_operador_usuario_id,
  p_aluno_nome,
  p_unidade_id,
  p_unidade_nome,
  p_ocorrido_em,
  p_idempotency_key
)
on conflict do nothing
returning id into v_evento_id;

if v_evento_id is null then
  return null;
end if;

select u.ativo, d.id, d.destino_normalizado
into v_usuario_ativo, v_destino_id, v_destino
from public.usuarios u
left join public.lia_destinos_privados d
  on d.usuario_id = u.id and d.canal = 'whatsapp' and d.ativo
where u.id = p_operador_usuario_id;

v_status := case
  when not coalesce(v_usuario_ativo, false) then 'fila_administrativa'
  when v_destino_id is null then 'fila_administrativa'
  when p_ambiente = 'teste' then 'pendente'
  when v_producao_liberada then 'pendente'
  else 'aguardando_liberacao'
end;
```

O insert da entrega usa somente `p_operador_usuario_id`; não há consulta a
outro operador nem lista fixa de Fabi/Jéssica.

- [ ] **Step 4: Implementar o trigger em mensagens**

`fn_lia_evento_pesquisa_evasao` deve:

1. ignorar linhas não resolvidas, outbound, não substantivas e `modo_teste`;
2. ignorar update que não entrou agora em `conteudo_substantivo` ou `opt_out`;
3. usar `new.analise_versao`;
4. verificar versão anterior `revisada` por `pesquisa_id`, nunca por nome;
5. chamar `fn_lia_criar_evento_alerta` com chave determinística;
6. retornar `new` sem alterar a mensagem append-only.

- [ ] **Step 5: Rodar a fixture completa**

```powershell
$env:PESQUISA_EVASAO_PG17_CONTAINER='pesquisa-evasao-pg17-local'
node --test tests/liaAlertasPrivadosFaseA.test.mjs
```

Expected: PASS e marcador `PESQUISA_EVASAO_CLAIM_PG17_OK`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql tests/liaAlertasPrivadosFaseA.test.mjs tests/fixtures/lia_alertas_privados_fase_a_pg17.sql
git commit -m "feat: produzir eventos privados da Lia por rodada"
```

## Task 4: Criar claim, conclusão, falha e piloto controlado — CONCLUÍDA, NÃO REEXECUTAR

**Files:**

- Modify: `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql`
- Modify: `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`
- Modify: `tests/liaAlertasPrivadosFaseA.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos das RPCs**

Exigir:

```text
anon/authenticated não executam claim nem leem destino
claim exige service_role
claim usa FOR UPDATE SKIP LOCKED
claim só roda entre 08:00 e 20:00 America/Sao_Paulo
claim revalida usuário e destino ativos
dois workers não reclamam a mesma entrega
processando abandonado vai para fila_administrativa, nunca volta sozinho
resultado ambíguo não volta a pendente
piloto exige pesquisa modo_teste e força destinatário id 2
piloto não libera produção
```

- [ ] **Step 2: Implementar o claim atômico**

Assinatura:

```sql
public.claim_lia_alerta_privado(
  p_worker_id uuid,
  p_alerta_id uuid default null
)
returns table (
  alerta_id uuid,
  claim_token uuid,
  destino text,
  mensagem text,
  evento_tipo text,
  ambiente text
)
```

O claim:

- rejeita `auth.role() <> 'service_role'`;
- retorna zero linhas fora de 08:00–20:00 BRT;
- usa `FOR UPDATE SKIP LOCKED`;
- só reclama `status='pendente'`;
- revalida o mesmo `destinatario_usuario_id` e `destino_id` ativos;
- muda para `processando`, incrementa `tentativas` e grava token/horário;
- nunca consulta `usuarios.telefone`.

- [ ] **Step 3: Implementar as RPCs de desfecho**

```sql
public.concluir_lia_alerta_privado(
  p_alerta_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
) returns boolean

public.falhar_lia_alerta_privado(
  p_alerta_id uuid,
  p_claim_token uuid,
  p_erro_codigo text,
  p_resultado_ambiguo boolean
) returns boolean
```

Regras:

```text
sucesso -> enviado + provider_message_id + enviado_em
falha explícita -> falha
timeout/resposta inválida após POST -> resultado_ambiguo
nenhum dos dois estados volta automaticamente para pendente
erro_codigo pertence a enum fechado e nunca guarda corpo do provedor
```

- [ ] **Step 4: Implementar a RPC de piloto**

```sql
public.enfileirar_lia_alerta_piloto(
  p_pesquisa_id uuid,
  p_tipo text default 'resposta_nova'
) returns uuid
```

Ela é exclusiva do `service_role`, exige `pesquisa_evasao.modo_teste=true`,
usa a versão mais recente da análise, grava `ambiente='teste'`, direciona
somente ao destino governado de `usuarios.id=2` e não altera
`alertas_producao_liberados`.

- [ ] **Step 5: Criar a RPC sanitizada da fila administrativa**

```sql
public.listar_lia_alertas_pendencias_administrativas(
  p_limite integer default 50
) returns table (
  alerta_id uuid,
  pesquisa_id uuid,
  evento_tipo text,
  aluno_nome text,
  unidade_nome text,
  operador_usuario_id integer,
  motivo text,
  criado_em timestamptz
)
```

Pode ser executada por usuário interno ativo e `service_role`; não retorna
destino, mensagem, resposta ou conteúdo consolidado.

- [ ] **Step 6: Rodar os testes e commitar**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs
git add supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql tests/liaAlertasPrivadosFaseA.test.mjs tests/fixtures/lia_alertas_privados_fase_a_pg17.sql
git commit -m "feat: adicionar claim seguro e piloto da Lia"
```

## Task 5: Retirar o transporte rejeitado e fixar o contrato Edge em vermelho — CONCLUÍDA LOCALMENTE

**Files:**

- Delete: `scripts/process_lia_alert_queue.py`
- Delete: `tests/test_process_lia_alert_queue.py`
- Delete: `scripts/systemd/lia-alertas-privados.service`
- Delete: `scripts/systemd/lia-alertas-privados.timer`
- Delete: `scripts/lia-whatsapp-bridge/alert-single-message.js`
- Delete: `scripts/lia-whatsapp-bridge/bridge-alert-single-message.patch`
- Delete: `tests/liaWhatsappAlertSingleMessage.test.mjs`
- Restore contract: `scripts/lareport_whatsapp_single.py`
- Restore contract: `tests/test_lareport_whatsapp_single.py`
- Modify: `tests/liaAlertasPrivadosFaseA.test.mjs`
- Create: `tests/liaAlertasDispatcherEdge.test.mjs`

- [ ] **Step 1: Remover somente os artefatos rejeitados**

Usar `apply_patch` para excluir os sete arquivos específicos acima. Não remover
outros helpers de relatório. Em `scripts/lareport_whatsapp_single.py`, restaurar:

```python
BRIDGE_REPORT_URL = os.environ.get(
    'LA_REPORT_WHATSAPP_SINGLE_URL',
    'http://127.0.0.1:3000/send-report',
)
```

e em `_validate_bridge_url` restaurar `parsed.path != '/send-report'`. O teste
correspondente volta a exigir `http://127.0.0.1:3000/send-report`.

- [ ] **Step 2: Remover do teste da fundação toda expectativa de VPS**

`tests/liaAlertasPrivadosFaseA.test.mjs` continua cobrindo migration, produtor,
claim, seeds, RLS e piloto. Remover imports e asserts de worker, service, timer e
patch do bridge. Adicionar a proteção negativa:

```js
for (const rejected of [
  'scripts/process_lia_alert_queue.py',
  'scripts/systemd/lia-alertas-privados.service',
  'scripts/systemd/lia-alertas-privados.timer',
  'scripts/lia-whatsapp-bridge/alert-single-message.js',
  'scripts/lia-whatsapp-bridge/bridge-alert-single-message.patch',
]) {
  assert.equal(existsSync(resolve(root, rejected)), false, `${rejected} deve sair`);
}
```

- [ ] **Step 3: Criar o teste estático vermelho do dispatcher**

`tests/liaAlertasDispatcherEdge.test.mjs` deve exigir:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = resolve(root, 'supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql');
const index = resolve(root, 'supabase/functions/processar-alertas-lia/index.ts');
const dispatcher = resolve(root, 'supabase/functions/processar-alertas-lia/dispatcher.ts');
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('dispatcher usa caixa 3 sem bridge ou fallback', () => {
  const source = `${read(index)}\n${read(dispatcher)}`;
  assert.match(source, /CAIXA_LIA_ID\s*=\s*3/);
  assert.match(source, /\/send\/text/);
  assert.match(source, /claim_lia_alerta_privado/);
  assert.match(source, /concluir_lia_alerta_privado/);
  assert.match(source, /falhar_lia_alerta_privado/);
  assert.doesNotMatch(source, /3000|3001|8657|send-alert|send-report/);
  assert.match(config, /\[functions\.processar-alertas-lia\][\s\S]*verify_jwt\s*=\s*true/);
});

test('migration audita a caixa e usa erros de provider', () => {
  const sql = read(migration);
  assert.match(sql, /add column caixa_id integer/i);
  assert.match(sql, /default 3/i);
  assert.match(sql, /provider_confirmacao_ambigua/i);
  assert.doesNotMatch(sql, /bridge_/i);
});
```

- [ ] **Step 4: Rodar a fase vermelha**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasDispatcherEdge.test.mjs
```

Expected: a fundação continua verde e o contrato do dispatcher falha porque a
migration e a Edge ainda não existem.

- [ ] **Step 5: Commit do corte de arquitetura e dos testes vermelhos**

```powershell
git add -A -- scripts/process_lia_alert_queue.py tests/test_process_lia_alert_queue.py scripts/systemd/lia-alertas-privados.service scripts/systemd/lia-alertas-privados.timer scripts/lia-whatsapp-bridge tests/liaWhatsappAlertSingleMessage.test.mjs scripts/lareport_whatsapp_single.py tests/test_lareport_whatsapp_single.py tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasDispatcherEdge.test.mjs
git commit -m "refactor: remover transporte paralelo dos alertas da Lia"
```

## Task 6: Adaptar a outbox para o dispatcher Edge — CONCLUÍDA LOCALMENTE

**Files:**

- Create: `supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql`
- Modify: `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql`
- Modify: `tests/liaAlertasDispatcherEdge.test.mjs`

- [ ] **Step 1: Acrescentar à fixture a auditoria da caixa**

Após aplicar a nova migration, a fixture deve provar:

```sql
select public.fixture_assert(
  not exists (
    select 1
    from public.lia_alertas_privados
    where caixa_id <> 3
  ),
  'toda entrega da Fase A deve auditar caixa_id=3'
);
```

Também deve chamar `falhar_lia_alerta_privado` com
`provider_confirmacao_ambigua` e rejeitar `bridge_timeout`.

- [ ] **Step 2: Criar a migration aditiva**

O início da migration é:

```sql
alter table public.lia_alertas_privados
  add column caixa_id integer;

update public.lia_alertas_privados
set caixa_id = 3
where caixa_id is null;

alter table public.lia_alertas_privados
  alter column caixa_id set default 3,
  alter column caixa_id set not null;

alter table public.lia_alertas_privados
  add constraint lia_alertas_privados_caixa_id_fkey
  foreign key (caixa_id) references public.whatsapp_caixas(id);
```

A migration falha fechado antes do `UPDATE` se a caixa 3 não existir, estiver
inativa ou não tiver `nome='Lia - Sucesso do Aluno'`. Ela não lê nem compara o
token em SQL.

- [ ] **Step 3: Substituir os códigos de falha do transporte**

Recriar `public.falhar_lia_alerta_privado(uuid, uuid, text, boolean)` preservando
o gate `service_role`, o match por `claim_token` e as transições atuais. A lista
aceita passa a ser exatamente:

```sql
if p_erro_codigo not in (
  'provider_timeout',
  'provider_conexao_encerrada',
  'provider_json_invalido',
  'provider_confirmacao_ambigua',
  'provider_rejeitado',
  'provider_http',
  'provider_configuracao',
  'provider_interno'
) then
  raise exception 'erro_codigo_invalido';
end if;
```

Nenhum estado `falha` ou `resultado_ambiguo` volta automaticamente a
`pendente`.

- [ ] **Step 4: Rodar fixture e contrato**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasDispatcherEdge.test.mjs
```

Expected: PASS no contrato estático; a fixture PostgreSQL 17 termina em
`PESQUISA_EVASAO_CLAIM_PG17_OK`.

- [ ] **Step 5: Commit da adaptação da outbox**

```powershell
git add supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql tests/fixtures/lia_alertas_privados_fase_a_pg17.sql tests/liaAlertasDispatcherEdge.test.mjs
git commit -m "feat: auditar transporte Edge dos alertas da Lia"
```

## Task 7: Implementar o dispatcher backend-only — CONCLUÍDA LOCALMENTE

**Files:**

- Create: `supabase/functions/processar-alertas-lia/dispatcher.ts`
- Create: `supabase/functions/processar-alertas-lia/dispatcher.test.ts`
- Create: `supabase/functions/processar-alertas-lia/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Escrever os testes vermelhos do núcleo**

Definir adapters injetáveis com este contrato:

```ts
export type ClaimAlerta = {
  alerta_id: string;
  claim_token: string;
  destino: string;
  mensagem: string;
  evento_tipo: 'resposta_nova' | 'rodada_nova_pos_revisao' | 'opt_out';
  ambiente: 'teste' | 'producao';
};

export type DispatcherAdapters = {
  claim(workerId: string, alertaId: string | null): Promise<ClaimAlerta | null>;
  buscarCaixaExata(caixaId: number): Promise<{
    id: number;
    nome: string;
    ativo: boolean;
    provedor: string;
    uazapi_url: string;
    uazapi_token: string;
  } | null>;
  fetchProvider(url: string, init: RequestInit): Promise<Response>;
  concluir(alertaId: string, claimToken: string, messageId: string): Promise<boolean>;
  falhar(alertaId: string, claimToken: string, codigo: string, ambiguo: boolean): Promise<boolean>;
  log(evento: Record<string, unknown>): void;
  agora(): number;
};
```

Os testes devem provar: nenhuma pendência não chama provedor; uma pendência faz
uma única chamada; usa somente caixa 3 ativa, UAZAPI e nome canônico; HTTP 2xx
com `messageid` conclui; HTTP explícito não 2xx falha sem retry; timeout, conexão
encerrada, JSON inválido e 2xx sem ID viram `resultado_ambiguo`; `alerta_id`
limita o piloto; logs não contêm destino, mensagem, token ou payload.

- [ ] **Step 2: Implementar o núcleo mínimo**

`processarUmAlerta` usa `CAIXA_LIA_ID = 3`, cria um UUID por invocação, chama
`claim` uma vez e valida a caixa de forma fechada:

```ts
export const CAIXA_LIA_ID = 3;

function validarCaixa(caixa: Awaited<ReturnType<DispatcherAdapters['buscarCaixaExata']>>) {
  if (!caixa || caixa.id !== CAIXA_LIA_ID || caixa.ativo !== true ||
      caixa.nome !== 'Lia - Sucesso do Aluno' || caixa.provedor !== 'uazapi' ||
      !caixa.uazapi_url || !caixa.uazapi_token) {
    throw new Error('provider_configuracao');
  }
  return caixa;
}
```

O POST é único:

```ts
await adapters.fetchProvider(`${baseUrl}/send/text`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', token: caixa.uazapi_token },
  body: JSON.stringify({
    number: claim.destino,
    text: claim.mensagem,
    delay: 500,
    readchat: true,
  }),
  signal: controller.signal,
});
```

Extrair ID apenas de `messageid`, `id`, `msgId`, `messageId` ou `key.id`. Não
iterar, não chunkar e não repetir o POST.

- [ ] **Step 3: Implementar o endpoint runtime**

`index.ts` aceita somente `POST`, depende de `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`, cria o client service-role e implementa os adapters
com as RPCs já existentes. O body permitido é somente:

```ts
type Body = { alerta_id?: string };
```

Qualquer campo `destino`, `mensagem`, `caixa_id` ou `retry` retorna `400`. O
`alerta_id` é opcional para cron e obrigatório no piloto manual. A resposta não
devolve destino, mensagem nem token.

- [ ] **Step 4: Fixar autenticação da Edge**

Adicionar a `supabase/config.toml`:

```toml
[functions.processar-alertas-lia]
verify_jwt = true
```

Além da validação do gateway, o endpoint rejeita JWT cujo claim `role` não seja
`service_role`. O `pg_cron` usará uma service-role key armazenada no Vault; a
chave não aparece em migration, teste, log ou documentação.

- [ ] **Step 5: Rodar testes**

```powershell
deno test supabase/functions/processar-alertas-lia/dispatcher.test.ts
node --test tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasDispatcherEdge.test.mjs
git diff --check
```

Expected: todos passam; cada teste contabiliza no máximo um POST ao provedor.

- [ ] **Step 6: Commit do dispatcher**

```powershell
git add supabase/functions/processar-alertas-lia supabase/config.toml tests/liaAlertasDispatcherEdge.test.mjs
git commit -m "feat: processar outbox da Lia pela caixa 3"
```

### Decisão de arquitetura consolidada

O dispatcher não usa nenhum bridge. Lia, Sol e Fábio continuam separados por
caixa, número, sessão e fila: a Fase A usa a caixa 3 e o número da Lia; Hermes
conversacional continua em `3001`; Sol continua em `3000`; Fábio continua em
`8657`. A indisponibilidade de um bridge não autoriza fallback para outro.

## Refinamentos adiados por decisão do Alf

O deep link para a pesquisa exata não pertence mais à Fase A. O alerta abre a
tela autenticada do Sucesso do Aluno sem parâmetro; a pessoa localiza o caso
pela lista. Também fica para depois o ajuste visual que evita repetir, ao mesmo
tempo, a lista de mensagens e a consolidação da rodada. Nenhum dos quatro
componentes de frontend citados na versão anterior deste plano será alterado.

## Task 8: Reescrever o runbook para o transporte existente — CONCLUÍDA LOCALMENTE

**Files:**

- Create: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md`

- [ ] **Step 1: Documentar gates obrigatórios**

O runbook deve conter:

```text
Gate 0 — preflight somente leitura
  project ref = ouqwbbermlzqqvtqwlul
  usuários 2, 29 e 30 ativos e telefones iguais aos seeds
  alias Vercel estável confirmado
  fundação lia_* presente, outbox vazia e nenhum dispatcher/cron existente
  caixa 3 ativa, nome canônico e origem +55 21 2342-5316
  fingerprint do token do banco igual ao da instância da Lia
  alertas_producao_liberados=false e outbox vazia
  nenhum cron lia-alertas-privados-dispatcher-minuto

Gate 1 — adaptação DDL, ainda bloqueada
  aplicar somente 20260803210000
  provar caixa_id=3 e códigos provider_*
  provar que nenhuma entrega foi criada ou enviada
  não criar a migration 20260803213000

Gate 2 — Edge publicada sem cron
  publicar processar-alertas-lia com verify_jwt=true
  provar 401/403 para anônimo, JWT inválido e usuário comum
  invocação service_role sem pendência retorna sem_pendencia
  não instalar worker, service, timer nem rota no bridge

Gate 3 — piloto Alf
  escolher pesquisa modo_teste
  chamar enfileirar_lia_alerta_piloto
  invocar a Edge uma vez com body contendo somente alerta_id
  confirmar uma mensagem no 5521981278047
  confirmar provider_message_id, caixa_id=3, template, versão e ambiente teste
  confirmar zero entrega para 29 ou 30

Gate 4 — autorização humana
  Alf aceita o piloto
  provisionar service_role no Vault sem registrar o valor
  somente então criar/aplicar 20260803213000
  ativar o pg_cron de um claim por minuto

Gate 5 — primeiro evento produtivo assistido
  confirmar destinatário = executado_por_usuario_id
  confirmar mensagem sem conteúdo da resposta
  confirmar link autenticado para a tela do Sucesso do Aluno
  confirmar que nenhum outro operador recebeu
```

Cada gate para e pede autorização antes de migration, deploy de Edge, escrita
remota ou envio de WhatsApp.

- [ ] **Step 2: Documentar rollback cirúrgico**

Antes do DDL, capturar triggers e grants afetados. Como a migration só adiciona
objetos, rollback:

```sql
drop trigger if exists trg_lia_evento_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
drop function if exists public.fn_lia_evento_pesquisa_evasao();
drop function if exists public.enfileirar_lia_alerta_piloto(uuid, text);
drop function if exists public.claim_lia_alerta_privado(uuid, uuid);
drop function if exists public.concluir_lia_alerta_privado(uuid, uuid, text);
drop function if exists public.falhar_lia_alerta_privado(uuid, uuid, text, boolean);
drop table if exists public.lia_alertas_privados;
drop table if exists public.lia_pesquisa_eventos;
drop table if exists public.lia_alertas_configuracao;
drop table if exists public.lia_destinos_privados;
```

O runbook deve alertar que o rollback de transporte começa desativando o
`pg_cron` e voltando `alertas_producao_liberados=false`, sem apagar eventos já
entregues antes de exportar a evidência. A Edge pode permanecer publicada e
inoperante enquanto não houver chamada autenticada.

- [ ] **Step 3: Registrar dívidas de higiene sem executá-las**

O runbook deve registrar separadamente:

1. migrar os números hardcoded de `notificar-primeira-aula-fabi`,
   `disparar-pesquisa-1a-aula-auto` e `enviar-boas-vindas-matricula` para
   `lia_destinos_privados` depois da estabilização;
2. renomear os rótulos UAZAPI `Sol - Sucesso do Aluno` e `teste sol` sem trocar
   sessão, número ou credencial;
3. rotacionar coordenadamente o instance token da caixa 3, exposto em print,
   atualizando todos os consumidores e provando o envio depois da rotação.

Nenhum desses três itens faz parte da implementação ou do piloto deste plano.

- [ ] **Step 4: Rodar a suíte local completa relevante**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs tests/pesquisaEvasao*.test.mjs
node --test tests/liaAlertasDispatcherEdge.test.mjs
deno test supabase/functions/processar-alertas-lia/dispatcher.test.ts
git diff --check
```

Expected: todos os testes passam e `git diff --check` não aponta whitespace
inválido.

- [ ] **Step 5: Commit documental**

```powershell
git add docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md docs/MAPA-SISTEMA.md docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md
git commit -m "docs: governar rollout dos alertas privados da Lia"
```

## Task 9: Ensaiar a adaptação DDL em ambiente descartável

**Files:**

- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`

- [ ] **Step 1: Criar projeto Supabase descartável autorizado**

Repetir o padrão aprovado no Plano A:

```text
schema-only de produção, somente leitura
roles e extensões iguais às de produção
migration repair do histórico
sem dados reais
uma única fixture estrutural sintética para whatsapp_caixas.id=3
sem credencial real, conversa, aluno, telefone de família ou segredo
```

- [ ] **Step 2: Reproduzir a fundação e aplicar somente a adaptação**

O ambiente recebe o schema atual de produção, que já contém a fundação remota
`20260803124754`, e depois aplica
`20260803210000_lia_alertas_dispatcher_edge.sql`. Não criar nem aplicar a
migration de ativação. Antes da adaptação, inserir somente a caixa estrutural
sintética `id=3`, `nome='Lia - Sucesso do Aluno'`, ativa, provedor `uazapi`, URL
não produtiva e credencial inválida. Isso satisfaz a precondição da migration
sem copiar configuração real.

- [ ] **Step 3: Rodar fixture estrutural e ACL**

Confirmar:

```text
authenticated/anon não leem destinos nem outbox
service_role executa claim
produção nasce bloqueada
seeds 2/29/30 são exatos
caixa_id da entrega é sempre 3
códigos bridge_* são rejeitados e códigos provider_* são aceitos
idempotência por pesquisa/rodada/tipo
modo teste comum não gera alerta produtivo
```

- [ ] **Step 4: Registrar evidências e destruir o ambiente**

Anotar project ref, hashes, contagens e confirmação de destruição no runbook.

- [ ] **Step 5: Commit**

```powershell
git add docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md
git commit -m "docs: registrar ensaio do dispatcher Edge da Lia"
```

## Task 10: Publicar, pilotar e só então criar a ativação

> Esta tarefa exige autorização separada para migration, deploy e envio. Não faz
> parte da implementação local automática.

**Files:**

- Create after pilot: `supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql`
- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`

- [ ] **Step 1: Aplicar Gate 1 e publicar Gate 2 sem cron**

Aplicar a migration de adaptação, publicar `processar-alertas-lia` com
`verify_jwt=true` e provar os bloqueios de autenticação. Não provisionar Vault,
não criar cron e parar antes do piloto.

- [ ] **Step 2: Enfileirar e entregar somente o piloto do Alf**

Invocar a Edge uma única vez com `{ "alerta_id": "<uuid-do-piloto>" }`, usando
credencial service-role apenas no ambiente de execução. Confirmar no banco e no
aparelho exatamente uma entrega de ambiente `teste`, `caixa_id=3` e
`provider_message_id` não vazio. A resposta HTTP não pode devolver destino nem
mensagem.

- [ ] **Step 3: Aguardar o aceite explícito do Alf**

Não criar a migration de ativação antes deste aceite.

- [ ] **Step 4: Escrever a migration de ativação**

Conteúdo mínimo:

Antes de aplicar, provisionar no Vault, por operação manual e sem literal em
arquivo, o segredo `lia_alertas_service_role_key`. A migration falha fechado se
esse nome não existir ou estiver vazio.

```sql
update public.lia_alertas_configuracao
set alertas_producao_liberados = true,
    atualizado_em = now()
where id = 1
  and alertas_producao_liberados = false;

update public.lia_alertas_privados alerta
set status = case
      when usuario.ativo = true and destino.id is not null then 'pendente'
      else 'fila_administrativa'
    end,
    motivo_pendencia = case
      when usuario.ativo is distinct from true then 'operador_inativo'
      when destino.id is null then 'destino_ausente'
      else null
    end,
    atualizado_em = now()
from public.lia_pesquisa_eventos evento
left join public.usuarios usuario
  on usuario.id = evento.operador_usuario_id
left join public.lia_destinos_privados destino
  on destino.usuario_id = evento.operador_usuario_id
 and destino.canal = 'whatsapp'
 and destino.ativo
where alerta.evento_id = evento.id
  and alerta.status = 'aguardando_liberacao';

do $block$
declare
  v_job record;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'lia_alertas_service_role_key'
      and nullif(decrypted_secret, '') is not null
  ) then
    raise exception 'lia_alertas_service_role_key_required';
  end if;

  for v_job in
    select jobid from cron.job
    where jobname = 'lia-alertas-privados-dispatcher-minuto'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'lia-alertas-privados-dispatcher-minuto',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-alertas-lia',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lia_alertas_service_role_key'
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$
  );
end;
$block$;
```

A migration não cria evento, não envia mensagem e não consulta
`usuarios.telefone`.

- [ ] **Step 5: Revisar diff e pedir autorização da ativação**

```powershell
git diff --check
git diff -- supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql
```

- [ ] **Step 6: Aplicar ativação, observar o cron e assistir ao primeiro caso**

Só depois de nova autorização. Se o destinatário não for o operador original,
se o conteúdo da resposta aparecer no alerta ou se outra pessoa receber, parar
sem corrigir em produção no improviso. Confirmar também uma única execução por
minuto, um único POST por execução e nenhuma chamada aos bridges.

- [ ] **Step 7: Commit final da ativação e evidência**

```powershell
git add supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md
git commit -m "feat: liberar alertas privados da Lia apos piloto"
```

## Critérios de aceite da Fase A

- Um fragmento substantivo ou áudio transcrito cria um único evento por rodada.
- Uma rodada posterior a qualquer versão revisada usa o alerta prioritário.
- Opt-out usa alerta próprio e não contém o texto da família.
- Fabi recebe somente casos enviados por Fabi.
- Jéssica recebe somente casos enviados por Jéssica.
- Operador inativo, ausente ou sem destino vai para fila administrativa.
- Nenhum fallback consulta `usuarios.telefone` em runtime.
- Nenhum alerta contém resposta, áudio, transcrição, telefone ou motivo.
- O primeiro envio é o piloto no destino governado do Alf.
- Produção só é liberada por migration criada depois do aceite do piloto.
- Resultado ambíguo não é reenviado.
- Toda entrega registra `caixa_id=3` e `provider_message_id` quando enviada.
- O dispatcher faz no máximo um POST por invocação e não chama bridge, worker,
  service ou timer da VPS.
- O link exige login e abre a tela do Sucesso do Aluno; localizar e expandir a
  pesquisa exata fica como melhoria posterior.
- `bi_messages_lamusic`, `fila_relatorios_whatsapp`,
  `fila_relatorios_sol_hermes` e `notificacao_*` não são fontes nem filas desta
  fase.
- Nenhuma decisão das Fases B, C ou D é antecipada.

## Condições de parada

Parar e reportar sem improvisar se:

- qualquer um dos IDs 2, 29 ou 30 não corresponder ao destino seedado;
- a migration estrutural nascer com produção liberada;
- a fixture permitir leitura de destino por `authenticated`, `anon` ou agente;
- o produtor gerar dois alertas para a mesma pesquisa/rodada/tipo;
- um evento de Fabi resolver Jéssica, ou vice-versa;
- a Edge exigir acesso ao conteúdo da resposta para enviar;
- a caixa 3 não confirmar mensagem única com `message_id`;
- o dispatcher tentar outra caixa ou qualquer bridge como fallback;
- o segredo de serviço aparecer em migration, diff, log ou resposta HTTP;
- o piloto tocar 29 ou 30;
- outra conversa estiver alterando os mesmos arquivos ou migrations.
