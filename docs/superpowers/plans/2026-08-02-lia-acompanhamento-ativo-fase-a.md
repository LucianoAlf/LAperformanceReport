# Lia — Acompanhamento Ativo da Pesquisa de Evasão, Fase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar alertas privados, idempotentes e auditáveis para resposta nova, rodada nova após revisão e opt-out, sempre somente à pessoa que enviou a pesquisa, com piloto obrigatório no número do Alf antes de liberar Fabi e Jessica.

**Architecture:** O Postgres registra o fato imutável e uma entrega privada em outbox na mesma transação em que a mensagem substantiva é classificada. A outbox usa um cadastro governado por `usuarios.id`, nunca `usuarios.telefone` em tempo de execução, e fica bloqueada para produção até o piloto. Um worker pequeno na VPS reclama uma entrega por RPC atômica e reutiliza apenas o transporte single-message do Hermes; ele não lê respostas, não decide destinatário e não escreve nas filas de relatório existentes.

**Tech Stack:** PostgreSQL 17/Supabase/RLS, PL/pgSQL, Python 3 `unittest`, Node `node:test`, React 19/React Router, Hermes WhatsApp bridge, systemd.

---

## Escopo fechado

Incluído nesta fase:

- outbox de `resposta_nova`, `rodada_nova_pos_revisao` e `opt_out`;
- um alerta por pesquisa e versão da rodada;
- destinatário exclusivamente igual a `pesquisa_evasao.executado_por_usuario_id`;
- cadastro governado dos destinos privados de Alf, Jessica e Fabi;
- fila administrativa para operador inativo, destino ausente ou resultado ambíguo;
- piloto ponta a ponta no número governado do Alf;
- link autenticado para a pesquisa correta;
- worker VPS/Hermes e observabilidade sanitizada.

Fora desta fase:

- D+3, resumo privado e estados/filtros de follow-up, que pertencem à Fase B;
- coortes, histórico de KPI e grupo, que pertencem à Fase C;
- follow-up automático à família, que pertence à Fase D e segue desligado;
- classificação de causa ou conteúdo da resposta, que pertence ao Subprojeto C;
- notificação cruzada entre Fabi e Jessica;
- reestruturação geral de Lia, Sol, Fábio ou Telegram.

## Evidência e decisões congeladas em 02/08/2026

- Projeto de produção confirmado: `ouqwbbermlzqqvtqwlul`.
- Alias estável de produção confirmado na Vercel:
  `https://la-performance-report.vercel.app`.
- Alf: `usuarios.id=2`, destino `5521981278047`.
- Jessica: `usuarios.id=29`, destino `5521984695110`.
- Fabi: `usuarios.id=30`, destino `5521994696489`.
- Os três usuários estão ativos e possuem `auth_user_id`.
- O primeiro alerta entregue usa somente o destino do Alf.
- Alertas produtivos permanecem bloqueados até o piloto ser aceito.
- Operador inativo vai para fila administrativa, nunca para grupo ou colega.
- O worker envia entre 08:00 e 20:00 BRT. Fora dessa janela, mantém a entrega pendente.
- Resultado ambíguo do transporte não é reenviado automaticamente.
- `modo_teste=true` não gera alerta produtivo; o piloto usa uma RPC própria e ambiente `teste`.

## Mapa de arquivos

**Criar:**

- `supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql` — cadastro governado, eventos, entregas, produtor, claims e piloto, com produção bloqueada.
- `tests/liaAlertasPrivadosFaseA.test.mjs` — contrato estático e execução da fixture PostgreSQL 17.
- `tests/fixtures/lia_alertas_privados_fase_a_pg17.sql` — prova real de idempotência, isolamento, roteamento e RLS.
- `scripts/process_lia_alert_queue.py` — adaptador de transporte da outbox para o bridge Hermes.
- `tests/test_process_lia_alert_queue.py` — contrato do worker e falhas ambíguas.
- `scripts/systemd/lia-alertas-privados.service` — execução one-shot do worker.
- `scripts/systemd/lia-alertas-privados.timer` — polling a cada minuto.
- `tests/liaAlertasDeepLink.test.mjs` — contrato do link autenticado para a pesquisa.
- `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md` — rollout em gates e evidências.

**Modificar:**

- `src/components/App/SucessoCliente/SucessoClientePage.tsx` — abrir Acompanhamento a partir do link.
- `src/components/App/SucessoCliente/TabSucessoAluno.tsx` — abrir a seção Pesquisas.
- `src/components/App/SucessoCliente/PesquisasTab.tsx` — abrir a subaba Evasão.
- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx` — expandir a pesquisa informada no link.
- `docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md` — manter a spec sincronizada com evidências de implementação.
- `docs/MAPA-SISTEMA.md` — documentar outbox, worker e fronteira com o motor de relatórios.

**Criar somente depois do piloto aceito:**

- `supabase/migrations/20260803093000_lia_alertas_privados_fase_a_ativacao.sql` — liberar entregas produtivas. Este arquivo não pode existir antes do aceite do piloto, para não ser aplicado acidentalmente junto da migration estrutural.

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

👉 {{link_caso}}
```

```text
🔔 *Nova rodada após revisão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família enviou novo conteúdo depois da revisão. O caso voltou para a fila e precisa de uma nova leitura.

👉 {{link_caso}}
```

```text
🔕 *Família recusou novos contatos — Pesquisa de evasão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família pediu para não receber novas mensagens desta pesquisa. O caso foi bloqueado para follow-up.

👉 {{link_caso}}
```

`{{link_caso}}` é:

```text
https://la-performance-report.vercel.app/app/sucesso-aluno?pesquisa_evasao_id={{pesquisa_id}}
```

## Task 1: Fixar o contrato em testes vermelhos

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

## Task 2: Criar schema, destinos governados e proteção de acesso

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

## Task 3: Produzir eventos idempotentes no momento certo

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
  p_unidade_nome text,
  p_pesquisa_id uuid
)` como
`SECURITY DEFINER`, `search_path = public, pg_temp`, exclusiva do
`service_role` e das funções internas. Ela escolhe somente as três cópias
aprovadas e monta o link com `app_base_url`.

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
outro operador nem lista fixa de Fabi/Jessica.

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

## Task 4: Criar claim, conclusão, falha e piloto controlado

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

## Task 5: Implementar o worker VPS/Hermes

**Files:**

- Create: `scripts/process_lia_alert_queue.py`
- Create: `tests/test_process_lia_alert_queue.py`
- Create: `scripts/systemd/lia-alertas-privados.service`
- Create: `scripts/systemd/lia-alertas-privados.timer`

- [ ] **Step 1: Escrever testes vermelhos do worker**

Cobrir com `unittest.mock`:

```python
import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from process_lia_alert_queue import process_once

WORKER_ID = '10000000-0000-4000-8000-000000000099'
CLAIM = {
    'alerta_id': '20000000-0000-4000-8000-000000000001',
    'claim_token': '30000000-0000-4000-8000-000000000001',
    'destino': '5521981278047',
    'mensagem': 'Alerta operacional',
    'evento_tipo': 'resposta_nova',
    'ambiente': 'teste',
}

class FakeApi:
    def __init__(self, claim):
        self.claim = claim
        self.claim_filters = []
        self.completed = []
        self.failed = []

    def claim_one(self, worker_id, alerta_id=None):
        self.claim_filters.append(alerta_id)
        return self.claim[0] if self.claim else None

    def complete(self, alerta_id, claim_token, message_id):
        self.completed.append((alerta_id, claim_token, message_id))

    def fail(self, alerta_id, claim_token, error_code, resultado_ambiguo):
        self.failed.append({
            'alerta_id': alerta_id,
            'claim_token': claim_token,
            'error_code': error_code,
            'resultado_ambiguo': resultado_ambiguo,
        })

class ProcessLiaAlertQueueTest(unittest.TestCase):
    def test_claim_send_ack_once(self):
        api = FakeApi(claim=[CLAIM])
        with patch('process_lia_alert_queue.send_single_report', return_value={'message_id': 'MSG-1'}) as send:
            result = process_once(api, worker_id=WORKER_ID)
        self.assertEqual(result['status'], 'enviado')
        send.assert_called_once_with(CLAIM['destino'], CLAIM['mensagem'])
        self.assertEqual(api.completed, [(CLAIM['alerta_id'], CLAIM['claim_token'], 'MSG-1')])

    def test_timeout_is_ambiguous_and_is_not_retried(self):
        api = FakeApi(claim=[CLAIM])
        with patch('process_lia_alert_queue.send_single_report', side_effect=TimeoutError('timeout')) as send:
            result = process_once(api, worker_id=WORKER_ID)
        self.assertEqual(result['status'], 'resultado_ambiguo')
        self.assertEqual(send.call_count, 1)
        self.assertEqual(api.failed[0]['resultado_ambiguo'], True)

    def test_explicit_rejection_is_failure_and_is_not_requeued(self):
        api = FakeApi(claim=[CLAIM])
        with patch('process_lia_alert_queue.send_single_report', side_effect=RuntimeError('bridge_http_400')):
            result = process_once(api, worker_id=WORKER_ID)
        self.assertEqual(result['status'], 'falha')
        self.assertEqual(api.failed[0]['resultado_ambiguo'], False)

    def test_logs_do_not_contain_destination_or_message(self):
        api = FakeApi(claim=[CLAIM])
        output = io.StringIO()
        with redirect_stdout(output), patch('process_lia_alert_queue.send_single_report', return_value={'message_id': 'MSG-1'}):
            process_once(api, worker_id=WORKER_ID)
        self.assertNotIn(CLAIM['destino'], output.getvalue())
        self.assertNotIn(CLAIM['mensagem'], output.getvalue())

    def test_specific_alert_id_limits_pilot(self):
        api = FakeApi(claim=[CLAIM])
        with patch('process_lia_alert_queue.send_single_report', return_value={'message_id': 'MSG-1'}):
            process_once(api, worker_id=WORKER_ID, alerta_id=CLAIM['alerta_id'])
        self.assertEqual(api.claim_filters, [CLAIM['alerta_id']])
```

- [ ] **Step 2: Executar e confirmar falha**

```powershell
python -m unittest tests.test_process_lia_alert_queue -v
```

Expected: FAIL porque o worker ainda não existe.

- [ ] **Step 3: Implementar o worker**

O worker deve:

1. carregar somente `LA_REPORT_SUPABASE_URL`,
   `LA_REPORT_SERVICE_ROLE_KEY` e a URL loopback já governada pelo helper;
2. chamar `claim_lia_alerta_privado` com UUID de worker;
3. chamar `send_single_report(destino, mensagem)` uma única vez;
4. concluir com o `message_id` confirmado;
5. em timeout, conexão encerrada após POST, JSON inválido ou confirmação
   ambígua, gravar `resultado_ambiguo=true` e não repetir;
6. em falha explícita antes de aceitação, gravar erro fechado e não reabrir
   automaticamente nesta fase;
7. imprimir apenas `alerta_id`, tipo, ambiente, status e duração.

CLI:

```text
python scripts/process_lia_alert_queue.py --once
python scripts/process_lia_alert_queue.py --once --alerta-id <uuid>
```

Não suportar `--destino`, `--mensagem` ou fallback para tabela de usuários.

- [ ] **Step 4: Versionar as units sem ativá-las**

`scripts/systemd/lia-alertas-privados.service`:

```ini
[Unit]
Description=LA Report - alertas privados da Lia
After=network-online.target

[Service]
Type=oneshot
User=sol
WorkingDirectory=/opt/LA-Organizer/LA-performance-report
EnvironmentFile=/home/sol/.openclaw/gateway.systemd.env
ExecStart=/usr/bin/python3 scripts/process_lia_alert_queue.py --once
```

`scripts/systemd/lia-alertas-privados.timer`:

```ini
[Unit]
Description=Executa a outbox privada da Lia a cada minuto

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 5: Rodar testes**

```powershell
python -m unittest tests.test_process_lia_alert_queue tests.test_lareport_whatsapp_single -v
```

Expected: PASS; cada cenário contabiliza exatamente uma tentativa de bridge.

- [ ] **Step 6: Commit**

```powershell
git add scripts/process_lia_alert_queue.py scripts/systemd/lia-alertas-privados.service scripts/systemd/lia-alertas-privados.timer tests/test_process_lia_alert_queue.py
git commit -m "feat: transportar alertas privados da Lia pelo Hermes"
```

## Task 6: Fazer o link abrir a pesquisa correta

**Files:**

- Modify: `src/components/App/SucessoCliente/SucessoClientePage.tsx`
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`
- Modify: `src/components/App/SucessoCliente/PesquisasTab.tsx`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Create: `tests/liaAlertasDeepLink.test.mjs`

- [ ] **Step 1: Escrever o teste vermelho**

Exigir a chave única `pesquisa_evasao_id`, propagada pelos quatro componentes, e
proibir qualquer token no link:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/components/App/SucessoCliente/SucessoClientePage.tsx', 'utf8');
const tab = readFileSync('src/components/App/SucessoCliente/TabSucessoAluno.tsx', 'utf8');
const pesquisas = readFileSync('src/components/App/SucessoCliente/PesquisasTab.tsx', 'utf8');
const evasao = readFileSync('src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql', 'utf8');

test('deep link abre acompanhamento, pesquisas, evasao e a linha correta', () => {
  assert.match(page, /useSearchParams/);
  assert.match(page, /pesquisa_evasao_id/);
  assert.match(tab, /focoPesquisaEvasaoId/);
  assert.match(pesquisas, /focoPesquisaEvasaoId/);
  assert.match(evasao, /setExpandido\(focoPesquisaEvasaoId\)/);
});

test('link nao carrega segredo ou resposta', () => {
  assert.doesNotMatch(migration, /token=|resposta_texto=|telefone=/i);
});
```

- [ ] **Step 2: Propagar o foco**

Em `SucessoClientePage.tsx`:

```tsx
const [searchParams] = useSearchParams();
const focoPesquisaEvasaoId = searchParams.get('pesquisa_evasao_id');

useEffect(() => {
  if (focoPesquisaEvasaoId) setAba('acompanhamento');
}, [focoPesquisaEvasaoId]);
```

Passar `focoPesquisaEvasaoId` por `TabSucessoAluno` e `PesquisasTab`. Cada
componente usa `useEffect` para selecionar `pesquisa` e `evasao`,
respectivamente. `PesquisaEvasaoTab` expande apenas se o UUID focado existir na
listagem carregada; caso contrário mostra aviso e mantém a tela funcional.

- [ ] **Step 3: Rodar testes e build**

```powershell
node --test tests/liaAlertasDeepLink.test.mjs tests/pesquisaEvasaoConversaFrontend.test.mjs
npm run build
```

Expected: PASS e build Vite sem erro.

- [ ] **Step 4: Commit**

```powershell
git add src/components/App/SucessoCliente/SucessoClientePage.tsx src/components/App/SucessoCliente/TabSucessoAluno.tsx src/components/App/SucessoCliente/PesquisasTab.tsx src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx tests/liaAlertasDeepLink.test.mjs
git commit -m "feat: abrir pesquisa de evasao pelo alerta da Lia"
```

## Task 7: Escrever o runbook e validar o pacote sem produção

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
  zero tabela/outbox anterior com o mesmo nome
  worker/timer ainda ausentes ou desativados

Gate 1 — DDL bloqueado
  aplicar somente 20260803090000
  provar RLS/ACL, seeds e alertas_producao_liberados=false
  não criar nem aplicar a migration 20260803093000

Gate 2 — VPS sem timer
  instalar worker e units
  não habilitar o timer
  health local do bridge single-message

Gate 3 — piloto Alf
  escolher pesquisa modo_teste
  chamar enfileirar_lia_alerta_piloto
  executar worker --once --alerta-id <id>
  confirmar uma mensagem no 5521981278047
  confirmar provider_message_id, template, versão e ambiente teste
  confirmar zero entrega para 29 ou 30

Gate 4 — autorização humana
  Alf aceita o piloto
  somente então criar/aplicar 20260803093000
  habilitar timer

Gate 5 — primeiro evento produtivo assistido
  confirmar destinatário = executado_por_usuario_id
  confirmar mensagem sem conteúdo da resposta
  confirmar link autenticado para a pesquisa
  confirmar que nenhum outro operador recebeu
```

Cada gate para e pede autorização antes de migration, escrita remota, instalação
na VPS ou envio de WhatsApp.

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

O runbook deve alertar que o rollback de transporte começa desabilitando o
timer, sem apagar eventos já entregues antes de exportar a evidência.

- [ ] **Step 3: Rodar a suíte local completa relevante**

```powershell
node --test tests/liaAlertasPrivadosFaseA.test.mjs tests/liaAlertasDeepLink.test.mjs tests/pesquisaEvasao*.test.mjs
python -m unittest tests.test_process_lia_alert_queue tests.test_lareport_whatsapp_single -v
npm run build
git diff --check
```

Expected: todos os testes passam, build passa e `git diff --check` não aponta
whitespace inválido.

- [ ] **Step 4: Commit documental**

```powershell
git add docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md docs/MAPA-SISTEMA.md docs/superpowers/specs/2026-08-02-lia-acompanhamento-ativo-pesquisa-evasao-design.md
git commit -m "docs: governar rollout dos alertas privados da Lia"
```

## Task 8: Ensaiar o DDL em ambiente descartável

**Files:**

- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`

- [ ] **Step 1: Criar projeto Supabase descartável autorizado**

Repetir o padrão aprovado no Plano A:

```text
schema-only de produção, somente leitura
roles e extensões iguais às de produção
migration repair do histórico
sem dados reais
sem caixas ou segredos
```

- [ ] **Step 2: Aplicar somente a migration estrutural**

Aplicar `20260803090000_lia_alertas_privados_fase_a.sql`. Não criar nem aplicar
a migration de ativação.

- [ ] **Step 3: Rodar fixture estrutural e ACL**

Confirmar:

```text
authenticated/anon não leem destinos nem outbox
service_role executa claim
produção nasce bloqueada
seeds 2/29/30 são exatos
idempotência por pesquisa/rodada/tipo
modo teste comum não gera alerta produtivo
```

- [ ] **Step 4: Registrar evidências e destruir o ambiente**

Anotar project ref, hashes, contagens e confirmação de destruição no runbook.

- [ ] **Step 5: Commit**

```powershell
git add docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md
git commit -m "docs: registrar ensaio DDL da fase A da Lia"
```

## Task 9: Executar o piloto e só então criar a ativação

> Esta tarefa exige autorização separada para migration, VPS e envio. Não faz
> parte da implementação local automática.

**Files:**

- Create after pilot: `supabase/migrations/20260803093000_lia_alertas_privados_fase_a_ativacao.sql`
- Modify: `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md`

- [ ] **Step 1: Aplicar Gate 1 e instalar Gate 2 sem timer**

Parar e reportar antes de cada escrita remota.

- [ ] **Step 2: Enfileirar e entregar somente o piloto do Alf**

Usar `--alerta-id` para impedir o worker de consumir qualquer outra linha.
Confirmar no banco e no aparelho exatamente uma entrega de ambiente `teste`.

- [ ] **Step 3: Aguardar o aceite explícito do Alf**

Não criar a migration de ativação antes deste aceite.

- [ ] **Step 4: Escrever a migration de ativação**

Conteúdo mínimo:

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
```

A migration não cria evento, não envia mensagem e não consulta
`usuarios.telefone`.

- [ ] **Step 5: Revisar diff e pedir autorização da ativação**

```powershell
git diff --check
git diff -- supabase/migrations/20260803093000_lia_alertas_privados_fase_a_ativacao.sql
```

- [ ] **Step 6: Aplicar ativação, habilitar timer e assistir ao primeiro caso**

Só depois de nova autorização. Se o destinatário não for o operador original,
se o conteúdo da resposta aparecer no alerta ou se outra pessoa receber, parar
sem corrigir em produção no improviso.

- [ ] **Step 7: Commit final da ativação e evidência**

```powershell
git add supabase/migrations/20260803093000_lia_alertas_privados_fase_a_ativacao.sql docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md
git commit -m "feat: liberar alertas privados da Lia apos piloto"
```

## Critérios de aceite da Fase A

- Um fragmento substantivo ou áudio transcrito cria um único evento por rodada.
- Uma rodada posterior a qualquer versão revisada usa o alerta prioritário.
- Opt-out usa alerta próprio e não contém o texto da família.
- Fabi recebe somente casos enviados por Fabi.
- Jessica recebe somente casos enviados por Jessica.
- Operador inativo, ausente ou sem destino vai para fila administrativa.
- Nenhum fallback consulta `usuarios.telefone` em runtime.
- Nenhum alerta contém resposta, áudio, transcrição, telefone ou motivo.
- O primeiro envio é o piloto no destino governado do Alf.
- Produção só é liberada por migration criada depois do aceite do piloto.
- Resultado ambíguo não é reenviado.
- O link exige login e abre a pesquisa correta.
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
- um evento de Fabi resolver Jessica, ou vice-versa;
- a VPS exigir acesso ao conteúdo da resposta para enviar;
- o bridge não confirmar mensagem única com `message_id`;
- o piloto tocar 29 ou 30;
- a Vercel publicar frontend antes do backend necessário ao deep link;
- outra conversa estiver alterando os mesmos arquivos ou migrations.
