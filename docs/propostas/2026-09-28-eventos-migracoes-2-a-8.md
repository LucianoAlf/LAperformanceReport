# Proposta de migrações 2–8 — módulo Eventos (aguardando aprovação do Alf)

**Status: NADA aplicado. SQL completo para revisão.** Depois do ok, cada bloco vira um arquivo
`supabase/migrations/20260929xxxxxx_<nome>.sql` na ordem abaixo.

## O que mudou no desenho depois da PR #526 do Hugo (mergeada 28/09)

- **Grupo já existe** — `evento_apresentacao.grupo_id` + RPCs `evento_apresentacao_juntar_v1` /
  `evento_apresentacao_separar_v1` + trigger deferido "número inteiro fica no mesmo bloco".
  Não recrio tabela de participantes: a migração 4 cobre **só** número sem aluno e unidade de origem.
- **Colisão real encontrada**: `pessoa_chave` = `emusys:<student_id>` colide entre unidades
  (91 ids repetidos com nomes diferentes, medido no `evento_apresentacao_adicionar_v1`). A trigger
  `fn_evento_apresentacao_deriva` grava `unidade_id` **do evento**, não do aluno — aluno do Recreio
  na grade da Barra ficaria indistinguível de um barrense com o mesmo emusys-id. Por isso a M4 e a
  correção de `evento_participacao` levam `unidade_origem_id` e a UNIQUE passa a incluí-lo.
- **Consequência fora do SQL** (precisa de PR coordenada com o Hugo): `definirParticipacaoEmLote`
  faz `upsert ... onConflict: 'evento_id,pessoa_chave'` — se a UNIQUE mudar, o onConflict muda junto;
  `evento_apresentacao_juntar_v1` e `evento_recital_sincronizar_v1` buscam por `pessoa_chave`+`curso_id`
  e devem passar a filtrar `unidade_origem_id`.

---

## M2 — Auditoria completa em `evento_*` + `confirmado_origem`

`audit_log` já é a casa única de auditoria do sistema (mesma tabela de `movimentacoes_admin`).
O que falta hoje: **nenhum trigger** em `evento_*` (medido 28/09) e o `fn_audit_log` genérico só
distingue `manual`/`system` — não sabe se escreveu a tela, o LA Teacher ou a planilha.

Canal da escrita resolvido por dois caminhos, sem mexer em RLS:
1. header PostgREST `x-origem-escrita` (o client do LA Report passa a mandar `la_report`;
   a edge de Sheets futura mandará `planilha`);
2. GUC `app.origem_escrita` via `set_config(..., true)` dentro de RPC — `evento_recital_sincronizar_v1`
   marca `la_teacher`; confirmação da família (futura) marca `familia`.

```sql
-- origem da escrita: header > GUC da RPC > presenca de JWT
create or replace function public.fn_evento_origem_escrita()
returns text language plpgsql stable
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_headers text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '');
  exception when others then
    v_headers := null;
  end;
  return coalesce(
    case when v_headers is not null and v_headers <> ''
      then v_headers::jsonb ->> 'x-origem-escrita' end,
    nullif(current_setting('app.origem_escrita', true), ''),
    case when auth.uid() is not null then 'la_report' else 'sistema' end
  );
end;
$$;
revoke all on function public.fn_evento_origem_escrita() from public, anon, authenticated;

-- igual ao fn_audit_log de movimentacoes_admin, mas com origem por canal
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

  -- update que so tocou updated_at nao e um evento auditavel
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
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

## M3 — Convidados nominais (tabela-ponte, irmãos, credenciamento por bloco)

```sql
-- teto configuravel por evento (NULL = sem teto)
alter table public.evento
  add column if not exists limite_convidados_por_aluno integer
  check (limite_convidados_por_aluno is null or limite_convidados_por_aluno > 0);
comment on column public.evento.limite_convidados_por_aluno is
  'Quantos convidados cada participante pode nomear. NULL = sem teto.';

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
  'Convidado NOMINAL do evento. Pertence ao evento; o vinculo com quem o convidou fica na '
  'ponte evento_convidado_participacao — irmaos dividem a mesma linha de convidado.';

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

-- o teto e por PARTICIPANTE: constraint trigger no COMMIT (lote insere varios de uma vez)
create or replace function public.fn_evento_convidado_limite()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_limite integer;
  v_total  integer;
begin
  select e.limite_convidados_por_aluno
    into v_limite
    from public.evento_participacao p
    join public.evento e on e.id = p.evento_id
   where p.id = new.participacao_id;

  if v_limite is null then
    return null;
  end if;

  select count(*) into v_total
    from public.evento_convidado_participacao cp
   where cp.participacao_id = new.participacao_id;

  if v_total > v_limite then
    raise exception 'Este aluno ja chegou ao limite de % convidados.', v_limite
      using errcode = 'P0001',
            hint = 'O limite e por aluno, configurado no evento. Irmaos devem dividir a mesma lista.';
  end if;
  return null;
end;
$$;
create constraint trigger trg_evento_convidado_limite
  after insert on public.evento_convidado_participacao
  deferrable initially deferred
  for each row execute function public.fn_evento_convidado_limite();
```

⚠️ **Detalhe do trigger de limite**: conta links por `participacao_id` — irmãos que dividem a lista
furam o teto juntos (é o desejado: a família é uma, mas se a regra for "10 por aluno" mesmo quando
dividida, avisar que mudo a contagem para por-convidado-único-entram-duas-vezes).

---

## M4 — Número sem aluno + unidade de origem (o caso da PR do Hugo)

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
  'Unidade ONDE o aluno estuda. Diferente de unidade_id (unidade do evento) quando ele toca '
  'fora de casa — ex.: aluno do Recreio no recital da Barra.';

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

-- deriva unidade_origem do ALUNO (nao do evento); numero sem aluno pula a parte de pessoa,
-- mas evento_id/unidade_id (do bloco) sao derivados para TODO tipo — sem eles a linha fica
-- fora da RLS por unidade
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

  if new.tipo is distinct from 'aluno' then
    return new;  -- numero sem aluno: sem pessoa/curso/origem, mas com evento e unidade
  end if;

  new.pessoa_chave := public.fn_pessoa_chave_aluno(new.aluno_id);
  select a.unidade_id into new.unidade_origem_id
    from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_apresentacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;
```

```sql
-- backfill: todo mundo ate aqui e da propria unidade do evento
update public.evento_apresentacao ap
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = ap.aluno_id
   and ap.unidade_origem_id is null;

-- a UNIQUE passa a incluir a unidade de origem: pessoa_chave colide entre unidades
alter table public.evento_apresentacao
  drop constraint evento_apresentacao_pessoa_curso_unica;
alter table public.evento_apresentacao
  add constraint evento_apresentacao_pessoa_curso_unica
  unique (evento_id, unidade_origem_id, pessoa_chave, curso_id);

-- mesmo tratamento na participacao: aluno de fora TAMBEM tem participacao/checkin
alter table public.evento_participacao
  add column if not exists unidade_origem_id uuid references public.unidades(id);
update public.evento_participacao p
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = p.aluno_id
   and p.unidade_origem_id is null;

create or replace function public.fn_evento_participacao_deriva()
returns trigger language plpgsql
as $$
begin
  new.pessoa_chave := public.fn_pessoa_chave_aluno(new.aluno_id);
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  select a.unidade_id into new.unidade_origem_id from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;

alter table public.evento_participacao
  drop constraint evento_participacao_pessoa_unica;
alter table public.evento_participacao
  add constraint evento_participacao_pessoa_unica
  unique (evento_id, unidade_origem_id, pessoa_chave);
```

⚠️ **Pontos de atenção da M4** (o motivo de ser revisão, não deploy):
1. `unidade_origem_id` nullable nas duas — NOT NULL só entra depois que o botão de
   aluno-de-outra-unidade estiver no ar (o backfill cobre 100% dos atuais, mas deixo a coluna
   aberta para a PR do Hugo não quebrar no meio do caminho).
2. `evento_apresentacao_juntar_v1` e `evento_recital_sincronizar_v1` buscam por
   `pessoa_chave`+`curso_id` — com origem cruzada precisam filtrar `unidade_origem_id`
   (mudança coordenada com a PR do Hugo, senão o match pode pegar o homônimo errado).
3. O `upsert` do front (`onConflict: 'evento_id,pessoa_chave'`) passa a ser
   `evento_id,unidade_origem_id,pessoa_chave` — 1 linha em `useEventos.ts`.
4. `grupo_id` (número com vários alunos) **não muda** — é ortogonal: grupo pode misturar
   unidades de origem sem custo extra.

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

## M6 — Convite enviado à família (histórico)

```sql
create table public.evento_comunicacao (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references public.evento_participacao(id) on delete cascade,
  unidade_id      uuid   not null references public.unidades(id),
  canal           text   not null
    check (canal in ('whatsapp', 'email', 'impresso', 'pessoalmente', 'outro')),
  texto           text,
  enviado_em      timestamptz not null default now(),
  enviado_por     uuid,          -- auth.users.id, null quando automatico
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
create policy evento_comunicacao_escopada on public.evento_comunicacao
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
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
  return new;
end;
$$;
create trigger trg_evento_staff_deriva
  before insert or update of evento_id on public.evento_staff
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

## Resumo para aprovação

| # | Escopo | Toca produção? | Risco |
|---|--------|----------------|-------|
| 2 | audit_log em 5 tabelas + `confirmado_origem` | triggers novas, 1 coluna | baixo — trigger tolerante a falha (warning, não exception) |
| 3 | convidados nominais + ponte + check-in por bloco + teto por evento | 3 tabelas novas, 1 coluna em `evento` | baixo — nada existente muda |
| 4 | `tipo`/`titulo`/`unidade_origem_id` + NOT NULL flex + UNIQUE com origem | **mexe constraint viva** | médio — exige PR coordenada no front/RPCs (`onConflict`, `juntar`, sync) |
| 5 | `formatura` + `formatura_tipo` | 2 colunas | baixo |
| 6 | `evento_comunicacao` histórico | 1 tabela | baixo |
| 7 | `evento_staff` | 1 tabela | baixo |
| 8 | `professor_palco_id`/`professor_apoio_id` | 2 colunas + CHECK | baixo |

Decisões que preciso de você marcando antes de aplicar:
- **M3**: limite é por participante (irmãos dividindo furam juntos) ou por convidado?
- **M4**: a troca da UNIQUE é a parte que encosta na PR do Hugo — prefere aplicar antes ou depois
  dele mergear o botão de unidade cruzada?
- **M6**: `enviado_por` fica nullable mesmo (envios automáticos futuros não têm usuário)?
