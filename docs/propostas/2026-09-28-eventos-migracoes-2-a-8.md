# Proposta de migrações 2–9 — módulo Eventos (v2, revisada — aguardando aprovação do Alf)

**Status: NADA aplicado. SQL completo para revisão.** Depois do ok, cada bloco vira um arquivo
`supabase/migrations/20260929xxxxxx_<nome>.sql` na ordem abaixo.

## O que mudou da v1 para a v2 (revisão do irmão + decisões do Alf)

- 🔴 **M4 reescrita contra produção**: a colisão entre unidades **já está resolvida** —
  `fn_evento_pessoa_chave(aluno_id, evento_id)` prefixa `ext:<unidade>|` quando o aluno é de
  fora (medido em produção 28/09). Saem do plano: troca da UNIQUE e a mudança de `onConflict`.
  Ficam: `tipo`/`titulo`/`CHECK` e `unidade_origem_id` **só informativa** (selo na tela).
  As funções de deriva partem do `prosrc` atual — nada da PR #526 se perde.
- 🔴 **M2: `fn_evento_origem_escrita` NÃO é mais revogada de `authenticated`** — os triggers de
  confirmação (M2) e de convite (M6) rodam como invoker e a chamam; revogar quebraria toda
  confirmação e todo convite. A função é inofensiva (lê settings).
- 🟡 **M2: header forjável bloqueado** — do header `x-origem-escrita` só entram `la_report` e
  `planilha`. `familia` e `la_teacher` só via GUC `app.origem_escrita`, que o cliente REST não
  consegue setar (só RPC interna).
- 🟡 **M2: colunas técnicas ignoradas no diff** — `updated_at` e `drive_*` não geram linha de
  log (o cron do Drive carimba `drive_sincronizado_em` a cada rodada).
- 🟡 **M3/M7: validação de "mesmo evento"** — ponte convidado×participação, check-in por bloco
  e staff×bloco agora recusam cruzamento entre eventos.
- 🟡 **M6: histórico nunca sobrescrito** — policies só de SELECT e INSERT; UPDATE/DELETE
  revogados de `authenticated`.
- 🆕 **M9 (nova): bilheteria** — a decisão "limite de convidados" virou **cota de cortesias por
  aluno por evento + ingressos vendidos acima dela**, com 3 canais gravando na mesma tabela,
  provedor por unidade (Recreio/CG = Rede, Barra = PagBank), reserva com expiração e lotação
  por bloco.

---

## M2 — Auditoria completa em `evento_*` + `confirmado_origem`

`audit_log` já é a casa única de auditoria do sistema (mesma tabela de `movimentacoes_admin`).
O que falta hoje: **nenhum trigger** em `evento_*` (medido 28/09) e o `fn_audit_log` genérico só
distingue `manual`/`system` — não sabe se escreveu a tela, o LA Teacher ou a planilha.

Canal da escrita resolvido por dois caminhos, sem mexer em RLS:
1. header PostgREST `x-origem-escrita` — **whitelist `la_report`|`planilha`** (é forjável;
   `familia` nunca pode vir daqui);
2. GUC `app.origem_escrita` via `set_config(..., true)` dentro de RPC — vocabulário completo
   (`la_teacher` no sync, `familia` no futuro canal da família). O GUC é confiável porque o
   PostgREST não expõe `set_config` ao cliente.

```sql
-- origem da escrita: GUC confiavel > header (whitelist) > presenca de JWT
create or replace function public.fn_evento_origem_escrita()
returns text language plpgsql stable
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_headers text;
  v_header  text;
  v_guc     text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '');
    if v_headers is not null and v_headers <> '' then
      v_header := v_headers::jsonb ->> 'x-origem-escrita';
    end if;
    v_guc := nullif(current_setting('app.origem_escrita', true), '');
  exception when others then
    v_header := null;
    v_guc    := null;
  end;

  -- GUC so existe dentro de RPC (set_config com is_local=true): aceita o vocabulario inteiro
  if v_guc in ('la_teacher', 'familia', 'planilha', 'sistema', 'la_report') then
    return v_guc;
  end if;
  -- header e forjavel: so quem poderia ser outro sistema. 'familia' daqui seria confirmacao
  -- de familia falsificada — nunca entra.
  if v_header in ('la_report', 'planilha') then
    return v_header;
  end if;
  return case when auth.uid() is not null then 'la_report' else 'sistema' end;
end;
$$;
-- NAO revogar de authenticated: fn_evento_participacao_confirmado_em e
-- fn_evento_comunicacao_deriva rodam como INVOKER e a chamam — revogar quebraria
-- toda confirmacao e todo convite. A funcao so le settings; e inofensiva.
revoke all on function public.fn_evento_origem_escrita() from public, anon;
grant execute on function public.fn_evento_origem_escrita() to authenticated, service_role;

-- igual ao fn_audit_log de movimentacoes_admin, mas com origem por canal e
-- ignorando colunas tecnicas no diff
create or replace function public.fn_evento_audit_log()
returns trigger language plpgsql security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_auth_uid uuid;
  v_usuario  text;
  v_old      jsonb;
  v_new      jsonb;
  v_reg_id   text;
  v_claims   text;
  -- carimbos de maquina: um update que so toca neles nao e evento auditavel
  -- (o cron do Drive re-carimba drive_sincronizado_em a cada rodada).
  c_ignoradas constant text[] := array[
    'updated_at',
    'drive_sincronizado_em', 'drive_erro', 'drive_playback_path', 'drive_file_id'];
begin
  begin
    v_claims := current_setting('request.jwt.claims', true);
    if v_claims is not null and v_claims <> '' then
      v_usuario := v_claims::jsonb ->> 'email';
      declare v_sub text;
      begin
        v_sub := v_claims::jsonb ->> 'sub';
        if v_sub ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_auth_uid := v_sub::uuid;
        end if;
      end;
    end if;
  exception when others then
    v_auth_uid := null;
    v_usuario  := null;
  end;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (v_old - c_ignoradas) = (v_new - c_ignoradas) then
    return new;
  end if;

  v_reg_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;

  begin
    insert into public.audit_log
      (id, tabela, registro_id_text, acao, dados_antigos, dados_novos, usuario, auth_user_id, origem, created_at)
    values
      (gen_random_uuid(), tg_table_name, v_reg_id, tg_op, v_old, v_new,
       coalesce(v_usuario, 'system'), v_auth_uid, public.fn_evento_origem_escrita(), now());
  exception when others then
    raise warning '[audit_evento] falhou ao registrar %.%: %', tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;
revoke all on function public.fn_evento_audit_log() from public, anon, authenticated;

create trigger trg_audit_evento
  after insert or update or delete on public.evento
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_bloco
  after insert or update or delete on public.evento_bloco
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_apresentacao
  after insert or update or delete on public.evento_apresentacao
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_apresentacao_item
  after insert or update or delete on public.evento_apresentacao_item
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_participacao
  after insert or update or delete on public.evento_participacao
  for each row execute function public.fn_evento_audit_log();

-- quem carimbou o 'participa': familia ou equipe
alter table public.evento_participacao
  add column if not exists confirmado_origem text
  check (confirmado_origem in ('familia', 'equipe'));
comment on column public.evento_participacao.confirmado_origem is
  'Quem marcou participa: familia (canal da familia) ou equipe (coordenacao/planilha). '
  'Sem ele, o professor nao distingue confirmacao real de marcacao administrativa.';

-- backfill honesto: os 263 da Barra foram marcados pela equipe em lote
update public.evento_participacao
   set confirmado_origem = 'equipe'
 where confirmado_em is not null and confirmado_origem is null;

-- o trigger de confirmado_em passa a carimbar a origem junto
create or replace function public.fn_evento_participacao_confirmado_em()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' and new.status = 'participa' then
    new.confirmado_em     := coalesce(new.confirmado_em, now());
    new.confirmado_origem := coalesce(
      new.confirmado_origem,
      case when public.fn_evento_origem_escrita() = 'familia' then 'familia' else 'equipe' end);
  elsif tg_op = 'UPDATE'
        and new.status = 'participa'
        and old.status is distinct from 'participa' then
    new.confirmado_em     := now();
    new.confirmado_origem := case
      when public.fn_evento_origem_escrita() = 'familia' then 'familia' else 'equipe' end;
  end if;
  return new;
end;
$$;
```

**Acompanha fora do SQL:** `src/lib/supabase.ts` ganha header global `x-origem-escrita: la_report`
(1 linha, `global.headers` do client); `evento_recital_sincronizar_v1` ganha
`perform set_config('app.origem_escrita', 'la_teacher', true)` na abertura.

---

## M3 — Convidados nominais: cortesias + ponte de irmãos + credenciamento por bloco

Pela decisão do Alf (28/09), o "limite de convidados" é a **cota de cortesias por aluno**,
configurada **por evento** (cada unidade define a sua — ex.: Campo Grande 2, Recreio 4).
Tudo acima da cortesia é **ingresso vendido** — a parte de venda mora na M9; aqui nasce a
estrutura que os dois tipos dividem: o convidado nominal.

```sql
-- cota de cortesias por aluno, por evento (NULL = sem cota configurada ainda)
alter table public.evento
  add column if not exists cortesias_por_aluno integer
  check (cortesias_por_aluno is null or cortesias_por_aluno >= 0);
comment on column public.evento.cortesias_por_aluno is
  'Quantas entradas de CORTESIA cada participante pode nomear. Acima dela e ingresso '
  'vendido (M9). NULL = a unidade ainda nao definiu — a tela trata como "sem teto".';

create table public.evento_convidado (
  id          bigint generated always as identity primary key,
  evento_id   bigint not null references public.evento(id) on delete cascade,
  unidade_id  uuid   not null references public.unidades(id),
  nome        text   not null,
  documento   text,
  observacao  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.evento_convidado is
  'Convidado NOMINAL do evento — cortesia ou ingresso vendido (tipo_entrada, M9). '
  'Pertence ao evento; o vinculo com quem o convidou fica na ponte '
  'evento_convidado_participacao — irmaos dividem a mesma linha de convidado.';

-- unidade vem do evento, como nas tabelas irmaes (RLS por unidade)
create or replace function public.fn_evento_convidado_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_convidado: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_deriva
  before insert or update of evento_id on public.evento_convidado
  for each row execute function public.fn_evento_convidado_deriva();
create trigger trg_evento_convidado_touch
  before update on public.evento_convidado
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_convidado
  after insert or update or delete on public.evento_convidado
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado enable row level security;
create policy evento_convidado_escopada on public.evento_convidado
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));

-- a ponte: um convidado pode ser "a convite de" varios participantes (irmaos)
create table public.evento_convidado_participacao (
  convidado_id    bigint not null references public.evento_convidado(id) on delete cascade,
  participacao_id bigint not null references public.evento_participacao(id) on delete cascade,
  primary key (convidado_id, participacao_id)
);
comment on table public.evento_convidado_participacao is
  'Quem convidou quem. Dois irmaos apontam para o MESMO convidado — credenciamento conta '
  'a pessoa uma vez, e a lista mostra a familia inteira.';

-- MESMO EVENTO: convidado do evento A nunca se liga a participacao do evento B
create or replace function public.fn_evento_convidado_participacao_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select p.evento_id from public.evento_participacao p where p.id = new.participacao_id)
  then
    raise exception 'evento_convidado_participacao: convidado e participacao sao de eventos diferentes'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_participacao_deriva
  before insert or update on public.evento_convidado_participacao
  for each row execute function public.fn_evento_convidado_participacao_deriva();
create trigger trg_audit_evento_convidado_participacao
  after insert or update or delete on public.evento_convidado_participacao
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado_participacao enable row level security;
create policy evento_convidado_participacao_escopada on public.evento_convidado_participacao
  for all using (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  ) with check (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  );

-- credenciamento por BLOCO: evento de varios dias cobija o mesmo convidado em cada dia
create table public.evento_convidado_checkin (
  convidado_id bigint not null references public.evento_convidado(id) on delete cascade,
  bloco_id     bigint not null references public.evento_bloco(id) on delete cascade,
  checkin_em   timestamptz not null default now(),
  primary key (convidado_id, bloco_id)
);
comment on table public.evento_convidado_checkin is
  'Chegada do convidado por bloco/dia — a Barra tem 2 dias, o mesmo convidado entra nos dois.';

-- MESMO EVENTO: o bloco tem que pertencer ao evento do convidado.
-- (A regra "vendido so entra pago" NAO fica aqui: a tabela de vendas nasce na M9 —
-- ela sobrescreve esta funcao la, e a M3 aplicada sozinha continua funcionando.)
create or replace function public.fn_evento_convidado_checkin_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
  then
    raise exception 'evento_convidado_checkin: bloco nao e do evento do convidado'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_checkin_deriva
  before insert or update on public.evento_convidado_checkin
  for each row execute function public.fn_evento_convidado_checkin_deriva();
create trigger trg_audit_evento_convidado_checkin
  after insert or update or delete on public.evento_convidado_checkin
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado_checkin enable row level security;
create policy evento_convidado_checkin_escopada on public.evento_convidado_checkin
  for all using (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  ) with check (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  );

-- a cota e por PARTICIPANTE, contando so CORTESIAS: constraint trigger no COMMIT
-- (lote insere varios de uma vez). Vendidos nao entram na conta — sao da M9.
create or replace function public.fn_evento_convidado_cortesia()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_limite integer;
  v_total  integer;
begin
  select e.cortesias_por_aluno
    into v_limite
    from public.evento_participacao p
    join public.evento e on e.id = p.evento_id
   where p.id = new.participacao_id;

  if v_limite is null then
    return null;  -- unidade ainda nao definiu a cota
  end if;

  select count(*) into v_total
    from public.evento_convidado_participacao cp
    join public.evento_convidado c on c.id = cp.convidado_id
   where cp.participacao_id = new.participacao_id
     and c.tipo_entrada = 'cortesia';

  if v_total > v_limite then
    raise exception 'Este aluno ja chegou a cota de % cortesias — o restante e ingresso vendido.',
      v_limite using errcode = 'P0001';
  end if;
  return null;
end;
$$;
create constraint trigger trg_evento_convidado_cortesia
  after insert on public.evento_convidado_participacao
  deferrable initially deferred
  for each row execute function public.fn_evento_convidado_cortesia();
```

⚠️ **A cota de cortesias conta `tipo_entrada`**, criado na M9 — a M9 vem na mesma entrega.
Se a M3 for sozinha, rode antes: `alter table evento_convidado add column tipo_entrada text
not null default 'cortesia' check (tipo_entrada in ('cortesia','vendido'))`.

⚠️ **Cota por participante, não por família**: irmãos que dividem a mesma lista contam o mesmo
convidado **duas vezes** (uma por irmão) — é o desenho "por aluno" aprovado. Se a equipe
decidir "por família" (família Ximenes = 10 cabeças total, não 10 por aluno), a contagem muda
para convidados únicos da união dos irmãos — mais trabalho, porque "família" não existe no banco.

---

## M4 — Número sem aluno + selo de unidade de origem (v2 — reescrito contra produção)

**O que a produção já resolve** (medido 28/09, `pg_get_functiondef`): as derivas chamam
`fn_evento_pessoa_chave(aluno_id, evento_id)`, que devolve `ext:<unidade_id>|<pessoa_chave>`
para aluno de outra unidade. A identidade cross-unidade **já não colide** — por isso a v2
**não toca em UNIQUE nem em `onConflict`**. `unidade_origem_id` fica só como selo informativo
pra tela ("aluno de fora"), porque ler o prefixo `ext:` da chave funciona mas é frágil.

```sql
alter table public.evento_apresentacao
  add column if not exists tipo text not null default 'aluno'
    check (tipo in ('aluno', 'abertura', 'encerramento', 'intervalo', 'professores', 'outro')),
  add column if not exists titulo text,
  add column if not exists unidade_origem_id uuid references public.unidades(id);

comment on column public.evento_apresentacao.tipo is
  'aluno = apresentacao de (pessoa, curso) — certificado e canal do LA Teacher. Os demais sao '
  'numeros do programa sem aluno (abertura, banda de professores, intervalo), com titulo livre.';
comment on column public.evento_apresentacao.unidade_origem_id is
  'Unidade ONDE o aluno estuda — so informativa, para a tela sinalizar "aluno de fora". '
  'A identidade ja e unica: pessoa_chave vem prefixada ext:<unidade>| pela '
  'fn_evento_pessoa_chave.';

-- solta NOT NULL so para quem nao e aluno; o CHECK amarra os dois lados
alter table public.evento_apresentacao
  alter column aluno_id     drop not null,
  alter column pessoa_chave drop not null,
  alter column curso_id     drop not null;

alter table public.evento_apresentacao
  add constraint evento_apresentacao_aluno_coerente check (
    (tipo = 'aluno'  and aluno_id is not null and pessoa_chave is not null and curso_id is not null)
    or
    (tipo <> 'aluno' and aluno_id is null and pessoa_chave is null and curso_id is null
                     and titulo is not null)
  );

-- deriva: MESMO prosrc de producao + duas linhas novas (guarda de tipo e selo de origem).
-- fn_evento_pessoa_chave ja devolve 'ext:<unidade>|...' para aluno de fora — a UNIQUE atual
-- continua correta e nao e tocada.
create or replace function public.fn_evento_apresentacao_deriva()
returns trigger language plpgsql
as $$
begin
  select b.evento_id, e.unidade_id
    into new.evento_id, new.unidade_id
    from public.evento_bloco b
    join public.evento e on e.id = b.evento_id
   where b.id = new.bloco_id;
  if new.evento_id is null then
    raise exception 'evento_apresentacao: bloco % nao existe', new.bloco_id;
  end if;

  -- numero sem aluno: evento_id/unidade_id (do bloco) seguem derivados — sem eles a linha
  -- fica fora da RLS por unidade — mas nao ha pessoa/curso/origem a resolver.
  if new.tipo is distinct from 'aluno' then
    return new;
  end if;

  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  select a.unidade_id into new.unidade_origem_id
    from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_apresentacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;

-- backfill do selo
update public.evento_apresentacao ap
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = ap.aluno_id
   and ap.unidade_origem_id is null;

-- mesmo selo na participacao (a aba Alunos tambem sinaliza "de fora")
alter table public.evento_participacao
  add column if not exists unidade_origem_id uuid references public.unidades(id);
update public.evento_participacao p
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = p.aluno_id
   and p.unidade_origem_id is null;

-- MESMO prosrc de producao + o selo de origem
create or replace function public.fn_evento_participacao_deriva()
returns trigger language plpgsql
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  select a.unidade_id into new.unidade_origem_id
    from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;
```

⚠️ **O que a v2 NÃO faz** (saíram do plano por obsoleto): troca das UNIQUEs, mudança de
`onConflict` no front, filtro extra em `juntar_v1`/sync — a chave `ext:` já resolveu tudo isso.
`grupo_id` (PR #526) é ortogonal e intocado.

---

## M5 — Formatura

```sql
alter table public.evento_participacao
  add column if not exists formatura boolean not null default false,
  add column if not exists formatura_tipo text
    check (formatura_tipo in ('kids', 'la')),
  add constraint evento_participacao_formatura_coerente
    check (formatura = false or formatura_tipo is not null);
comment on column public.evento_participacao.formatura is
  'Este aluno se FORMA neste recital (Kids -> LA ou conclusao). Marca a participacao, '
  'nao a apresentacao: e da pessoa, vale para todos os cursos dela no evento.';
```

## M6 — Convite enviado à família (histórico — só entra, nunca edita)

```sql
create table public.evento_comunicacao (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references public.evento_participacao(id) on delete cascade,
  unidade_id      uuid   not null references public.unidades(id),
  canal           text   not null
    check (canal in ('whatsapp', 'email', 'impresso', 'pessoalmente', 'outro')),
  texto           text,
  enviado_em      timestamptz not null default now(),
  enviado_por     uuid,          -- auth.users.id, null quando automatico (aprovado)
  origem          text           -- canal da escrita, mesmo vocabulario do audit
);
comment on table public.evento_comunicacao is
  'Cada envio de convite/comunicado a familia e UMA linha — historico, nunca sobrescrito. '
  'Ligado a participacao (pessoa no evento), nao a apresentacao.';

create or replace function public.fn_evento_comunicacao_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select p.unidade_id into new.unidade_id
    from public.evento_participacao p where p.id = new.participacao_id;
  if new.unidade_id is null then
    raise exception 'evento_comunicacao: participacao % nao existe', new.participacao_id
      using errcode = 'P0001';
  end if;
  new.enviado_por := coalesce(new.enviado_por, auth.uid());
  new.origem      := coalesce(new.origem, public.fn_evento_origem_escrita());
  return new;
end;
$$;
create trigger trg_evento_comunicacao_deriva
  before insert on public.evento_comunicacao
  for each row execute function public.fn_evento_comunicacao_deriva();
create trigger trg_audit_evento_comunicacao
  after insert or update or delete on public.evento_comunicacao
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_comunicacao enable row level security;
-- historico nunca sobrescrito: SELECT e INSERT apenas, sem UPDATE/DELETE em lugar nenhum
create policy evento_comunicacao_leitura on public.evento_comunicacao
  for select using (is_admin() or unidade_id in (select get_user_unidade_ids()));
create policy evento_comunicacao_escrita on public.evento_comunicacao
  for insert with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
revoke update, delete on public.evento_comunicacao from authenticated;
```

## M7 — Escala de staff do evento

```sql
create table public.evento_staff (
  id               bigint generated always as identity primary key,
  evento_id        bigint not null references public.evento(id) on delete cascade,
  unidade_id       uuid   not null references public.unidades(id),
  staff_unidade_id uuid   not null references public.staff_unidade(id),
  funcao           text   not null check (funcao in (
    'roadie_palco', 'roadie_extra', 'higienizacao', 'controle_horario',
    'credenciamento', 'boas_vindas', 'saida', 'outro')),
  funcao_outra     text,   -- obrigatorio quando funcao='outro'
  bloco_id         bigint references public.evento_bloco(id) on delete cascade,  -- null = o evento todo
  observacao       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (funcao <> 'outro' or funcao_outra is not null)
);
comment on table public.evento_staff is
  'Escala de staff do evento. bloco_id null = funcao do evento inteiro (credenciamento, '
  'boas-vindas); preenchido = funcao daquele bloco (roadie de palco do bloco 2).';

create or replace function public.fn_evento_staff_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_staff: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  -- MESMO EVENTO: bloco preenchido tem que ser deste evento
  if new.bloco_id is not null and
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_staff: bloco % nao e do evento %', new.bloco_id, new.evento_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_staff_deriva
  before insert or update of evento_id, bloco_id on public.evento_staff
  for each row execute function public.fn_evento_staff_deriva();
create trigger trg_evento_staff_touch
  before update on public.evento_staff
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_staff
  after insert or update or delete on public.evento_staff
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_staff enable row level security;
create policy evento_staff_escopada on public.evento_staff
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
```

## M8 — Professor no palco / professor de apoio

```sql
alter table public.evento_apresentacao
  add column if not exists professor_palco_id integer references public.professores(id),
  add column if not exists professor_apoio_id integer references public.professores(id),
  add constraint evento_apresentacao_professores_distintos
    check (professor_palco_id is null
           or professor_apoio_id is null
           or professor_palco_id <> professor_apoio_id);
comment on column public.evento_apresentacao.professor_palco_id is
  'Professor que SOBE ao palco junto (toca/canta com o aluno). professor_id continua sendo '
  'o dono pedagogico que lanca o relatorio no LA Teacher — sao papeis diferentes.';
comment on column public.evento_apresentacao.professor_apoio_id is
  'Professor de apoio (prepara entra/sai, afina, acompanha nos bastidores).';
```

---

## M9 — Bilheteria (nova — decisão do Alf, 28/09)

**Regras aprovadas na conversa**: cortesias por aluno por evento (M3); acima dela, ingresso
**vendido nominal** — os dois terminam na mesma lista da porta (`evento_convidado`), com
`tipo_entrada` visível no check-in. Lotação por bloco; venda bloqueia ao lotar. Preço unitário
+ pacotes de desconto + espaço pra meia-entrada. Três canais (`online`/`balcao`/`porta`) na
**mesma** tabela; provedor por evento (Recreio/CG → Rede; Barra → PagBank "Nummy"). Reserva
expira (~15 min) se o link não for pago.

```sql
-- lotacao por bloco (NULL = sem teto — espaco aberto)
alter table public.evento_bloco
  add column if not exists capacidade integer
  check (capacidade is null or capacidade > 0);

-- provedor por evento (o evento e de UMA unidade; a conta e texto livre: 'Nummy' na Barra)
alter table public.evento
  add column if not exists provedor_pagamento text
    check (provedor_pagamento in ('rede', 'pagbank')),
  add column if not exists provedor_conta text;

-- tabela de preco: unitario + meia (vago ate a equipe/juridico confirmar a lei) + pacotes
create table public.evento_ingresso_preco (
  evento_id      bigint primary key references public.evento(id) on delete cascade,
  preco_unitario numeric(10,2) not null check (preco_unitario >= 0),
  preco_meia     numeric(10,2) check (preco_meia is null or preco_meia >= 0),
  updated_at     timestamptz not null default now()
);
comment on table public.evento_ingresso_preco is
  'Preco do ingresso por evento. preco_meia NULL = sem meia configurada (confirmar com '
  'juridico se evento cultural pago exige meia para estudante/idoso/PcD).';

create table public.evento_ingresso_pacote (
  id                bigint generated always as identity primary key,
  evento_id         bigint not null references public.evento(id) on delete cascade,
  quantidade_minima integer not null check (quantidade_minima > 1),
  desconto_pct      numeric(5,2) not null check (desconto_pct > 0 and desconto_pct <= 100),
  unique (evento_id, quantidade_minima)
);
comment on table public.evento_ingresso_pacote is
  'Pacotes de desconto por evento: a partir de N ingressos, X% off (ex.: 10+ -> 20%).';

-- a venda: TODOS os canais na mesma tabela
create table public.evento_ingresso_venda (
  id                bigint generated always as identity primary key,
  evento_id         bigint not null references public.evento(id) on delete cascade,
  unidade_id        uuid   not null references public.unidades(id),
  participacao_id   bigint references public.evento_participacao(id) on delete set null,
  comprador_nome    text   not null,
  comprador_contato text,
  quantidade        integer not null check (quantidade > 0),
  meia_entrada      integer not null default 0
    check (meia_entrada >= 0 and meia_entrada <= quantidade),
  valor_unitario    numeric(10,2) not null check (valor_unitario >= 0),
  valor_meia        numeric(10,2) check (valor_meia is null or valor_meia >= 0),
  desconto_pct      numeric(5,2) not null default 0 check (desconto_pct between 0 and 100),
  valor_bruto       numeric(10,2) generated always as (
    (quantidade - meia_entrada) * valor_unitario + meia_entrada * coalesce(valor_meia, 0)
  ) stored,
  -- valor_final gravado (nao gerado): a equipe pode ajustar centavos na hora sem mentir o pct
  valor_final       numeric(10,2) not null check (valor_final >= 0),
  forma_pagamento   text not null
    check (forma_pagamento in ('pix', 'cartao_credito', 'cartao_debito', 'dinheiro',
                               'link_pagamento', 'outro')),
  canal             text not null check (canal in ('online', 'balcao', 'porta')),
  provedor          text check (provedor in ('rede', 'pagbank')),
  -- reservado = lugar segurado aguardando pagamento (link/QR) OU pendencia manual da equipe;
  -- pago/cancelado/reembolsado sao finais. Reserva com expiracao libera o lugar sozinha.
  status            text not null default 'reservado'
    check (status in ('reservado', 'pago', 'cancelado', 'reembolsado')),
  reserva_expira_em timestamptz,  -- NULL = pendencia manual, nao expira sozinha
  provedor_ref      text,         -- id do pedido/link/QR no gateway
  observacao        text,
  registrado_por    uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.evento_ingresso_venda is
  'Toda venda de ingresso — online (webhook confirma), balcao e porta (equipe registra; '
  'Pix por QR dinamico do gateway, cartao na maquininha com conciliacao depois). '
  'Participacao vinculada e opcional: venda avulsa de publico existe.';

create or replace function public.fn_evento_ingresso_venda_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_ingresso_venda: evento % nao existe', new.evento_id
      using errcode = 'P0001';
  end if;
  -- participacao vinculada, quando ha, e deste evento
  if new.participacao_id is not null and
     (select p.evento_id from public.evento_participacao p where p.id = new.participacao_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_ingresso_venda: participacao nao e deste evento'
      using errcode = 'P0001';
  end if;
  new.registrado_por := coalesce(new.registrado_por, auth.uid());
  new.provedor       := coalesce(new.provedor,
                         (select e.provedor_pagamento from public.evento e
                           where e.id = new.evento_id));
  return new;
end;
$$;
create trigger trg_evento_ingresso_venda_deriva
  before insert or update of evento_id, participacao_id on public.evento_ingresso_venda
  for each row execute function public.fn_evento_ingresso_venda_deriva();
create trigger trg_evento_ingresso_venda_touch
  before update on public.evento_ingresso_venda
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_ingresso_venda
  after insert or update or delete on public.evento_ingresso_venda
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_ingresso_preco
  after insert or update or delete on public.evento_ingresso_preco
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_ingresso_pacote
  after insert or update or delete on public.evento_ingresso_pacote
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_ingresso_venda enable row level security;
create policy evento_ingresso_venda_escopada on public.evento_ingresso_venda
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
-- preco/pacote: leitura por unidade do evento
alter table public.evento_ingresso_preco enable row level security;
alter table public.evento_ingresso_pacote enable row level security;
create policy evento_ingresso_preco_escopada on public.evento_ingresso_preco
  for all using (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())))
  with check (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())));
create policy evento_ingresso_pacote_escopada on public.evento_ingresso_pacote
  for all using (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())))
  with check (
    is_admin() or exists (select 1 from public.evento e
      where e.id = evento_id and e.unidade_id in (select get_user_unidade_ids())));

-- o ingresso vendido e um convidado nominal — cortesia e venda na mesma lista da porta
alter table public.evento_convidado
  add column if not exists tipo_entrada text not null default 'cortesia'
    check (tipo_entrada in ('cortesia', 'vendido')),
  add column if not exists venda_id bigint
    references public.evento_ingresso_venda(id) on delete set null,
  add column if not exists meia_entrada boolean not null default false,
  -- bloco que a pessoa vai assistir (NULL = ainda sem credenciamento definido)
  add column if not exists bloco_id bigint references public.evento_bloco(id) on delete set null,
  add constraint evento_convidado_entrada_coerente check (
    (tipo_entrada = 'vendido'  and venda_id is not null)
    or (tipo_entrada = 'cortesia' and venda_id is null)
  );

-- deriva v2 do convidado: unidade do evento + bloco do MESMO evento quando preenchido
create or replace function public.fn_evento_convidado_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_convidado: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  if new.bloco_id is not null and
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_convidado: bloco nao e deste evento' using errcode = 'P0001';
  end if;
  -- a venda ligada tambem e deste evento
  if new.venda_id is not null and
     (select v.evento_id from public.evento_ingresso_venda v where v.id = new.venda_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_convidado: venda nao e deste evento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- o check-in da M3 ganha a regra do vendido: ingresso vendido so entra com a venda PAGA
create or replace function public.fn_evento_convidado_checkin_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
  then
    raise exception 'evento_convidado_checkin: bloco nao e do evento do convidado'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.evento_convidado c
      join public.evento_ingresso_venda v on v.id = c.venda_id
     where c.id = new.convidado_id
       and v.status <> 'pago'
  ) then
    raise exception 'Ingresso vendido so entra com a venda paga.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- lotacao por bloco: cortesias + vendas vivas (pagas ou reservadas nao expiradas)
create or replace view public.vw_evento_bloco_lotacao as
select b.id as bloco_id,
       b.evento_id,
       b.capacidade,
       count(*) filter (where c.tipo_entrada = 'cortesia')                    as cortesias,
       count(*) filter (where v.status = 'pago')                              as vendidos_pagos,
       count(*) filter (where v.status = 'reservado'
                          and (v.reserva_expira_em is null
                               or v.reserva_expira_em > now()))               as reservas_ativas,
       b.capacidade
         - count(*) filter (where c.tipo_entrada = 'cortesia')
         - count(*) filter (where v.status = 'pago'
                             or (v.status = 'reservado'
                                 and (v.reserva_expira_em is null
                                      or v.reserva_expira_em > now())))       as livres
  from public.evento_bloco b
  left join public.evento_convidado c on c.bloco_id = b.id
  left join public.evento_ingresso_venda v on v.id = c.venda_id
 group by b.id, b.evento_id, b.capacidade;
comment on view public.vw_evento_bloco_lotacao is
  'Lugares por bloco. Convidado sem bloco_id (ainda nao credenciado) nao conta em bloco '
  'nenhum — a reserva segura pelo convidado nominal criado na venda. livres NULL = sem teto.';

-- reserva nao paga expira sozinha (cron a cada 5 min; o audit da M2 registra a baixa)
select cron.schedule(
  'bilheteria-expira-reservas',
  '*/5 * * * *',
  $$update public.evento_ingresso_venda
       set status = 'cancelado', updated_at = now()
     where status = 'reservado'
       and reserva_expira_em is not null
       and reserva_expira_em < now()$$);
```

### Fluxo de venda (desenho)

| Canal | Como paga | Confirmação |
|---|---|---|
| `online` | link do gateway (Pix+cartão) enviado no WhatsApp/botão do evento | webhook → `pago` + convidados nominais gerados |
| `balcao` | Pix por **QR dinâmico** do gateway na tela; cartão na maquininha | Pix: webhook/automático. Cartão: equipe marca `pago`, API de vendas concilia depois |
| `porta` | igual ao balcão | igual + check-in do convidado na mesma tela |

- Os ingressos nominais (`evento_convidado` `tipo_entrada='vendido'` + `venda_id`) são criados
  **junto da venda** — a reserva segura o lugar desde o link. `cancelado`/`reembolsado` libera.
- Check-in do vendido exige `venda.status='pago'` — já no trigger da M3.
- **Nada de chave Pix fixa** — QR sempre dinâmico pelo gateway, ou confirmação vira extrato na mão.

### Provedores — verificado na documentação (28/09)

- **Nenhuma integração de gateway existe neste repo/banco** (busca 28/09: `financeiro_emusys_*`,
  `loja_vendas`, `historico_pagamentos` são outra coisa). A API Rede "Gestão de Vendas" do
  projeto Super Folha é **consulta** (conciliação) — vendas/recebíveis, não emissão de link.
- **PagBank (Barra) — caminho completo confirmado**: Orders API cria pedido com `qr_codes`
  (Pix dinâmico, uso único, `expiration_date` no pedido — a expiração da reserva sai de graça),
  `notification_urls` por pedido (webhook por transação), checkout para link, cartão e Pix.
  Requisito operacional: **chave Pix ativa na conta "Nummy"**.
- **Rede / e.Rede (Recreio, CG) — Pix e cartão por API confirmados** no manual vigente
  (23/03/2026): `POST /v2/transactions` com `kind=pix` devolve QR (imagem base64 + EMV
  copia-e-cola + validade); cartão idem, com postback/callback. **Atenção ao webhook do Pix**:
  o registro da URL de notificação é feito pelo **call center da Rede** (CNPJ + PV), não por
  endpoint — agendar cedo. Ressalva da documentação do SDK: Pix via e.Rede pode exigir
  **conta Itaú** atrelada ao PV — confirmar com a Rede se o PV de cada unidade está habilitado;
  se não estiver, o Recreio cai no fallback (link gerado no portal + registro manual).
- **Prioridade pelo calendário**: Rede primeiro (Recreio 13/11), PagBank depois (Barra 28/11).
  Nos dois casos o desenho da venda não muda — `provedor` + `provedor_ref` guardam qual gateway
  e qual pedido confirmou o pagamento.

### Telas mínimas (desenho, ainda sem código)

1. **Aba Bilheteria** no detalhe do evento: KPIs (cortesias usadas/cota, vendidos, faturamento
   bruto/líquido, `livres` por bloco), botão Nova venda (comprador, aluno vinculado opcional,
   qtd/meia, canal, forma → gera link/QR se o provedor estiver configurado), lista de vendas
   com status e ações (marcar pago, cancelar, reembolsar).
2. **Check-in**: `tipo_entrada` e selo de meia na lista da porta; modo porta = venda + check-in
   na mesma tela.
3. Config do evento (ModalEditar): cortesias por aluno, capacidade por bloco, tabela de preço,
   provedor.

---

## Resumo para aprovação

| # | Escopo | Toca produção? | Risco |
|---|--------|----------------|-------|
| 2 | audit_log em 5 tabelas + `confirmado_origem` | triggers novas, 1 coluna | baixo — trigger tolerante a falha (warning, não exception) |
| 3 | convidados nominais + ponte + check-in por bloco + cota de cortesias | 3 tabelas novas, 1 coluna em `evento` | baixo — nada existente muda |
| 4 | `tipo`/`titulo`/`unidade_origem_id` + NOT NULL flexível | solta NOT NULL, troca derivas | baixo — UNIQUE/`onConflict` **não** mudam; derivas = prosrc atual + 2 linhas |
| 5 | `formatura` + `formatura_tipo` | 2 colunas | baixo |
| 6 | `evento_comunicacao` histórico | 1 tabela, só SELECT/INSERT | baixo |
| 7 | `evento_staff` | 1 tabela | baixo |
| 8 | `professor_palco_id`/`professor_apoio_id` | 2 colunas + CHECK | baixo |
| 9 | bilheteria: capacidade, preço, pacote, venda, tipo_entrada | 3 tabelas + colunas + view + cron | médio — frente nova; provedor depende de doc/verificação de API |

**Decisões já respondidas** (não precisam de nova palavra): cota de cortesias é **por aluno**
com venda acima dela; `enviado_por` nullable; `_teste` do Drive na lixeira.

**O que ainda falta de pessoa (não trava aprovação do SQL):**
- Valores de cortesia por evento, preço, pacotes e capacidade dos espaços → **equipe** (tudo é
  parâmetro — sistema nasce pronto, vocês preenchem).
- Meia-entrada é obrigação legal para evento cultural pago? → **confirmar com William/jurídico**
  antes de publicar preço (`preco_meia`/`meia_entrada` já guardam o lugar).
- Habilitações nas contas (não é doc, é conta): **Pix ativo na PagBank "Nummy"** e **Pix/Itaú
  no PV da Rede** de Recreio e CG + registro do webhook de Pix pelo call center → **equipe/financeiro**.
