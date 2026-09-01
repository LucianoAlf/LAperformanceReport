# Anamnese por pessoa — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a anamnese pertencer à pessoa, e não à matrícula, de modo que quem faz vários cursos preencha uma vez só e a anamnese apareça em todos os cursos.

**Architecture:** `anamneses` ganha `pessoa_chave` derivada; `aluno_id` permanece como procedência. A identidade mora em um único lugar (`vw_aluno_pessoa_chave` + `fn_pessoa_chave_aluno`). `alunos.anamnese_preenchida` vira espelho mantido por três gatilhos. A leitura passa por uma RPC única. O aviso ao professor cobre todos os professores da pessoa, disparado por varredura diária com data de corte.

**Tech Stack:** PostgreSQL (Supabase), React 19 + TypeScript, Deno (edge functions), `node --test` para testes.

**Spec:** `docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md`

**Task no board:** LAPE-19

## Global Constraints

- **Identidade é sempre o par `(unidade_id, pessoa_chave)`.** `emusys_student_id` sozinho não identifica pessoa: 91 ids aparecem em 2+ unidades, os 91 com nomes diferentes.
- **Timezone BRT (UTC-3)** em qualquer data de negócio. `CURRENT_DATE` no banco é UTC — usar `(now() at time zone 'America/Sao_Paulo')::date`.
- **Toda função recriada precisa de `revoke execute ... from anon` nominal**, além do `public`. O projeto tem `ALTER DEFAULT PRIVILEGES` concedendo EXECUTE a `anon` em funções novas. ACL correta de RPC de app: `{postgres=X, authenticated=X, service_role=X}`. Conferir com `select proacl from pg_proc where proname='...'`.
- **Toda view nova:** `revoke all ... from public, anon, authenticated` e **depois** `grant select`. Conferir `relacl` — o correto para view de leitura é `authenticated=r`.
- **Validar RPC/RLS como `authenticated`**, com `set local role authenticated` + `set local request.jwt.claims`, nos três perfis (admin, unidade, professor). Nunca só como `service_role`, que ignora RLS.
- **Migration aplicada por MCP precisa do arquivo versionado no mesmo dia**, em `supabase/migrations/`.
- `CREATE OR REPLACE` com lista de parâmetros diferente cria overload novo — dropar a assinatura antiga no mesmo commit e conferir que `select oid::regprocedure from pg_proc where proname='...'` devolve uma linha só.
- Rodar a suíte com `npm test` antes de cada commit que toque em arquivo já coberto por ela.

---

### Task 1: Identidade da pessoa (view, função, coluna, backfill)

**Files:**
- Create: `supabase/migrations/20260902090000_anamnese_pessoa_chave.sql`
- Create: `tests/anamnesePessoaChave.test.mjs`

**Interfaces:**
- Produces: `vw_aluno_pessoa_chave (aluno_id int, unidade_id uuid, pessoa_chave text)`; `fn_pessoa_chave_aluno(p_aluno_id integer) returns text`; coluna `anamneses.pessoa_chave text`; trigger `trg_anamnese_pessoa_chave`.

- [ ] **Step 1: Escrever o teste de contrato da migration**

```javascript
// tests/anamnesePessoaChave.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902090000_anamnese_pessoa_chave.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('a regra de identidade vive em UM lugar (a view), e a funcao le a view', () => {
  assert.ok(existsSync(migrationUrl), 'migration deve existir');
  const source = sql();
  assert.match(source, /create or replace view public\.vw_aluno_pessoa_chave/i);
  // a funcao NAO reimplementa o case: ela consulta a view
  const fn = source.slice(source.indexOf('function public.fn_pessoa_chave_aluno'));
  assert.match(fn, /from public\.vw_aluno_pessoa_chave/i);
  assert.doesNotMatch(fn.slice(0, fn.indexOf('$function$', 40) + 1), /emusys_student_id/i);
});

test('sem id do Emusys a chave e local: e nunca cai em nome', () => {
  const source = sql();
  assert.match(source, /'local:'\s*\|\|/i);
  assert.doesNotMatch(source, /nome_normalizado|lower\(btrim\(a\.nome\)\)/i);
});

test('pessoa_chave da anamnese e derivada por trigger, nunca escrita a mao', () => {
  const source = sql();
  assert.match(source, /before insert or update of aluno_id on public\.anamneses/i);
});

test('view de leitura nao nasce com privilegio de escrita (ALTER DEFAULT PRIVILEGES)', () => {
  const source = sql();
  assert.match(source, /revoke all on public\.vw_aluno_pessoa_chave from public, anon, authenticated/i);
  assert.match(source, /grant select on public\.vw_aluno_pessoa_chave to authenticated, service_role/i);
});

test('funcao nova revoga anon nominalmente, nao so public', () => {
  const source = sql();
  assert.match(source, /revoke execute on function public\.fn_pessoa_chave_aluno\(integer\) from anon/i);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/anamnesePessoaChave.test.mjs`
Expected: FAIL — "migration deve existir".

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260902090000_anamnese_pessoa_chave.sql
-- LAPE-19 — a anamnese passa a pertencer a pessoa, nao a matricula.
-- Spec: docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md
--
-- IDENTIDADE: o par (unidade_id, pessoa_chave). emusys_student_id SOZINHO nao
-- identifica pessoa -- medido em 01/09/2026: 91 ids aparecem em 2+ unidades e os
-- 91 tem NOMES DIFERENTES. E colisao entre bases separadas do Emusys.

create or replace view public.vw_aluno_pessoa_chave as
select
  a.id as aluno_id,
  a.unidade_id,
  case
    when nullif(btrim(a.emusys_student_id), '') is not null
      then 'emusys:' || btrim(a.emusys_student_id)
    else 'local:' || a.id::text
  end as pessoa_chave
from public.alunos a;

revoke all on public.vw_aluno_pessoa_chave from public, anon, authenticated;
grant select on public.vw_aluno_pessoa_chave to authenticated, service_role;

comment on view public.vw_aluno_pessoa_chave is
  'Fonte unica da identidade de pessoa. Comparar SEMPRE junto com unidade_id.';

create or replace function public.fn_pessoa_chave_aluno(p_aluno_id integer)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.pessoa_chave from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;
$function$;

revoke execute on function public.fn_pessoa_chave_aluno(integer) from public;
revoke execute on function public.fn_pessoa_chave_aluno(integer) from anon;
grant execute on function public.fn_pessoa_chave_aluno(integer) to authenticated, service_role;

alter table public.anamneses add column if not exists pessoa_chave text;

comment on column public.anamneses.aluno_id is
  'Matricula onde a anamnese foi respondida (PROCEDENCIA). Nao e o dono do dado: '
  'a anamnese pertence a pessoa, identificada por (unidade_id, pessoa_chave).';

create or replace function public.fn_anamnese_define_pessoa_chave()
returns trigger
language plpgsql
as $function$
begin
  new.pessoa_chave := case
    when new.aluno_id is null then null
    else public.fn_pessoa_chave_aluno(new.aluno_id)
  end;
  return new;
end;
$function$;

drop trigger if exists trg_anamnese_pessoa_chave on public.anamneses;
create trigger trg_anamnese_pessoa_chave
  before insert or update of aluno_id on public.anamneses
  for each row execute function public.fn_anamnese_define_pessoa_chave();

-- Backfill das 219 linhas existentes.
update public.anamneses an
   set pessoa_chave = v.pessoa_chave
  from public.vw_aluno_pessoa_chave v
 where v.aluno_id = an.aluno_id
   and an.pessoa_chave is distinct from v.pessoa_chave;

create index if not exists idx_anamneses_pessoa
  on public.anamneses (unidade_id, pessoa_chave)
  where pessoa_chave is not null;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/anamnesePessoaChave.test.mjs`
Expected: PASS (5 casos).

- [ ] **Step 5: Aplicar no banco e verificar o backfill**

Aplicar por `mcp__supabase__apply_migration` (name: `anamnese_pessoa_chave`). Depois rodar:

```sql
select
  count(*) as total,
  count(*) filter (where pessoa_chave is null) as sem_chave,
  count(*) filter (where pessoa_chave like 'emusys:%') as por_emusys,
  count(*) filter (where pessoa_chave like 'local:%') as por_fallback
from anamneses;
```

Esperado: `total = 219`, `sem_chave = 6` (as de `vinculo_status='pendente'`, que não têm `aluno_id`), o resto distribuído entre `emusys:` e `local:`. Se `sem_chave` for maior que 6, **parar** — significa `aluno_id` apontando para aluno inexistente.

- [ ] **Step 6: Provar que a chave não atravessa unidade**

```sql
select count(*) as pessoas_distintas_que_compartilham_id
from (
  select pessoa_chave from vw_aluno_pessoa_chave
  group by pessoa_chave having count(distinct unidade_id) > 1
) x;
```

Esperado: **91**. Este número não é defeito — é a prova de que comparar `pessoa_chave` **sem** `unidade_id` juntaria pessoas diferentes. Registrar o valor obtido no commit.

- [ ] **Step 7: Conferir as ACLs**

```sql
select proname, proacl from pg_proc where proname = 'fn_pessoa_chave_aluno';
select relname, relacl from pg_class where relname = 'vw_aluno_pessoa_chave';
```

Esperado: função sem `anon=X`; view com `authenticated=r` apenas (nunca `arwdDxtm`).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260902090000_anamnese_pessoa_chave.sql tests/anamnesePessoaChave.test.mjs
git commit -m "feat(anamnese): identidade de pessoa como fonte unica (LAPE-19)"
```

---

### Task 2: Espelho de `anamnese_preenchida` por pessoa

**Files:**
- Create: `supabase/migrations/20260902093000_anamnese_espelho_por_pessoa.sql`
- Create: `tests/anamneseEspelhoPessoa.test.mjs`

**Interfaces:**
- Consumes: `vw_aluno_pessoa_chave`, `fn_pessoa_chave_aluno` (Task 1).
- Produces: `fn_sincronizar_anamnese_preenchida_pessoa(p_unidade_id uuid, p_pessoa_chave text) returns integer`; triggers `trg_anamnese_atualiza_aluno`, `trg_vincular_anamnese_na_matricula` e `trg_alunos_vinculo_emusys_anamnese`.

- [ ] **Step 1: Escrever o teste de contrato**

```javascript
// tests/anamneseEspelhoPessoa.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902093000_anamnese_espelho_por_pessoa.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('o espelho e recalculado tambem quando o vinculo Emusys chega DEPOIS', () => {
  // Bug identico ao de motivo_saida_id (corrigido em 20/08/2026): trigger so de
  // INSERT deixa para tras a linha que ganhou emusys_student_id pelo sync.
  const source = sql();
  assert.match(source, /update of emusys_student_id on public\.alunos/i);
});

test('o espelho so LIGA o flag, nunca desliga em massa', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('fn_sincronizar_anamnese_preenchida_pessoa'));
  assert.match(fn, /set\s+anamnese_preenchida = true/i);
  assert.doesNotMatch(fn, /set\s+anamnese_preenchida = false/i);
});

test('a propagacao e escopada por unidade E pessoa, nunca so por pessoa', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('fn_sincronizar_anamnese_preenchida_pessoa'));
  const where = fn.slice(fn.indexOf('update public.alunos'));
  assert.match(where, /unidade_id\s*=\s*p_unidade_id/i);
  assert.match(where, /pessoa_chave\s*=\s*p_pessoa_chave/i);
});

test('a anamnese vigente e a completa mais recente', () => {
  const source = sql();
  assert.match(source, /status\s*=\s*'completa'/i);
  assert.match(source, /order by created_at desc/i);
});

test('vincular anamnese pendente por nome continua exigindo unidade e tipo', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('fn_vincular_anamnese_pendente'));
  assert.match(fn, /unidade_id\s*=\s*new\.unidade_id/i);
  assert.match(fn, /tipo_formulario\s*=\s*new\.classificacao/i);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/anamneseEspelhoPessoa.test.mjs`
Expected: FAIL — migration não existe.

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260902093000_anamnese_espelho_por_pessoa.sql
-- LAPE-19 — alunos.anamnese_preenchida vira ESPELHO da anamnese da pessoa.
--
-- Por que o flag continua existindo: tres consumidores o leem sem passar pela
-- ficha (filtro da Lista, Conciliacao e features_churn_alunos_ativos).

create or replace function public.fn_sincronizar_anamnese_preenchida_pessoa(
  p_unidade_id uuid,
  p_pessoa_chave text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anam public.anamneses%rowtype;
  v_linhas integer := 0;
begin
  if p_unidade_id is null or p_pessoa_chave is null then
    return 0;
  end if;

  select * into v_anam
    from public.anamneses
   where unidade_id = p_unidade_id
     and pessoa_chave = p_pessoa_chave
     and status = 'completa'
   order by created_at desc
   limit 1;

  if not found then
    return 0;
  end if;

  update public.alunos a
     set anamnese_preenchida = true,
         anamnese_preenchida_em = coalesce(a.anamnese_preenchida_em, v_anam.created_at, now()),
         temperamento_codinome = v_anam.temperamento_codinome,
         updated_at = now()
    from public.vw_aluno_pessoa_chave v
   where v.aluno_id = a.id
     and a.unidade_id = p_unidade_id
     and v.pessoa_chave = p_pessoa_chave
     and (a.anamnese_preenchida is distinct from true
          or a.temperamento_codinome is distinct from v_anam.temperamento_codinome);

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$function$;

revoke execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) from public;
revoke execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) from anon;
grant execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) to service_role;

-- Gatilho 1: anamnese criada ou completada.
create or replace function public.fn_atualizar_aluno_anamnese()
returns trigger
language plpgsql
as $function$
begin
  if new.aluno_id is not null and new.status = 'completa' then
    perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, new.pessoa_chave);
  end if;
  return new;
end;
$function$;

-- Gatilho 2: matricula nova. Continua adotando anamnese orfa por nome
-- (unidade + tipo), e passa a herdar tambem a anamnese ja vinculada da pessoa.
create or replace function public.fn_vincular_anamnese_pendente()
returns trigger
language plpgsql
as $function$
declare
  v_chave text;
begin
  update public.anamneses set
    aluno_id = new.id,
    vinculo_status = 'vinculado'
  where vinculo_status = 'pendente'
    and aluno_id is null
    and unidade_id = new.unidade_id
    and lower(btrim(nome_aluno)) = lower(btrim(new.nome))
    and tipo_formulario = new.classificacao;

  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;

  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;

-- Gatilho 3 (NOVO): o vinculo com o Emusys pode chegar depois, pelo sync.
create or replace function public.fn_alunos_vinculo_emusys_anamnese()
returns trigger
language plpgsql
as $function$
declare
  v_chave text;
begin
  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;
  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;

drop trigger if exists trg_alunos_vinculo_emusys_anamnese on public.alunos;
create trigger trg_alunos_vinculo_emusys_anamnese
  after update of emusys_student_id on public.alunos
  for each row
  when (new.emusys_student_id is distinct from old.emusys_student_id)
  execute function public.fn_alunos_vinculo_emusys_anamnese();

-- Recalculo geral. Seguro: medido em 01/09/2026, ha 0 linhas com o flag true
-- sem anamnese vinculada, entao o recalculo so liga.
do $$
declare r record;
begin
  for r in
    select distinct unidade_id, pessoa_chave
      from public.anamneses
     where status = 'completa' and pessoa_chave is not null
  loop
    perform public.fn_sincronizar_anamnese_preenchida_pessoa(r.unidade_id, r.pessoa_chave);
  end loop;
end $$;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/anamneseEspelhoPessoa.test.mjs`
Expected: PASS (5 casos).

- [ ] **Step 5: Medir ANTES de aplicar**

```sql
select count(*) filter (where anamnese_preenchida) as com_flag,
       count(*) as linhas
from alunos where arquivado_em is null;
```

Anotar o valor. Esperado hoje: `com_flag = 212`.

- [ ] **Step 6: Aplicar e conferir o delta**

Aplicar por `apply_migration` (name: `anamnese_espelho_por_pessoa`) e repetir a query do Step 5.

Esperado: `com_flag = 233` (212 + 21). Se subir mais que 21, **parar e investigar** — pode ser chave colidindo entre unidades. Conferir com:

```sql
select a.id, a.nome, a.unidade_id, v.pessoa_chave
from alunos a join vw_aluno_pessoa_chave v on v.aluno_id = a.id
where a.anamnese_preenchida and not exists (
  select 1 from anamneses an
  where an.unidade_id = a.unidade_id and an.pessoa_chave = v.pessoa_chave and an.status='completa')
limit 20;
```

Esperado: **0 linhas** (ninguém com flag sem anamnese da própria pessoa/unidade).

- [ ] **Step 7: Smoke da propagação em transação com ROLLBACK**

```sql
begin;
-- pega uma pessoa multi-curso que ja tem anamnese
with alvo as (
  select v.unidade_id, v.pessoa_chave
  from anamneses an join vw_aluno_pessoa_chave v
    on v.unidade_id = an.unidade_id and v.pessoa_chave = an.pessoa_chave
  where an.status='completa' group by 1,2 having count(distinct v.aluno_id) > 1 limit 1
)
select fn_sincronizar_anamnese_preenchida_pessoa(unidade_id, pessoa_chave) as linhas_tocadas from alvo;
rollback;
```

Esperado: retorno `0` (já está sincronizado pelo recálculo) — prova de idempotência.

- [ ] **Step 8: Provar que matrícula nova herda na hora (caso 2 do spec)**

```sql
begin;
-- clona uma matricula de pessoa que ja tem anamnese, simulando curso novo
insert into alunos (nome, unidade_id, emusys_student_id, status, classificacao, curso_id, data_matricula)
select a.nome, a.unidade_id, a.emusys_student_id, 'ativo', a.classificacao, a.curso_id, current_date
  from alunos a where a.id = 886
returning id, anamnese_preenchida;
rollback;
```

Esperado: a linha nova volta com `anamnese_preenchida = true` **no próprio RETURNING** — o gatilho 2 rodou no INSERT. Se voltar `false` ou `null`, o trigger não está pegando a anamnese da pessoa (provável `pessoa_chave` nula na anamnese de origem).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260902093000_anamnese_espelho_por_pessoa.sql tests/anamneseEspelhoPessoa.test.mjs
git commit -m "feat(anamnese): espelho de anamnese_preenchida por pessoa (LAPE-19)"
```

---

### Task 3: RPC de leitura `get_anamnese_aluno` e link público sem professor

**Files:**
- Create: `supabase/migrations/20260902100000_get_anamnese_aluno.sql`
- Create: `tests/getAnamneseAluno.test.mjs`

**Interfaces:**
- Consumes: `vw_aluno_pessoa_chave` (Task 1).
- Produces: `get_anamnese_aluno(p_aluno_id integer) returns jsonb` com as chaves `anamnese` (row completa + `anamnese_respostas_perfil`), `procedencia` (`{aluno_id, curso_nome, respondida_em, e_esta_matricula bool}`) e `anteriores` (array de `{id, created_at, tipo_formulario}`).

- [ ] **Step 1: Escrever o teste de contrato**

```javascript
// tests/getAnamneseAluno.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902100000_get_anamnese_aluno.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('a RPC devolve procedencia junto com a anamnese', () => {
  const source = sql();
  assert.match(source, /create or replace function public\.get_anamnese_aluno\(p_aluno_id integer\)/i);
  assert.match(source, /'procedencia'/);
  assert.match(source, /'e_esta_matricula'/);
});

test('a RPC resolve por pessoa, nunca por aluno_id direto', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('function public.get_anamnese_aluno'));
  assert.match(fn, /vw_aluno_pessoa_chave/i);
  assert.doesNotMatch(fn, /where an\.aluno_id = p_aluno_id/i);
});

test('anteriores sao expostas como historico, sem sumir', () => {
  const source = sql();
  assert.match(source, /'anteriores'/);
});

test('link publico deixa de expor professor da matricula de origem', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('function public.get_anamnese_publica'));
  assert.match(fn, /'professor_nome',\s*null/i);
});

test('as duas funcoes revogam anon nominalmente', () => {
  const source = sql();
  assert.match(source, /revoke execute on function public\.get_anamnese_aluno\(integer\) from anon/i);
  // get_anamnese_publica e chamada pelo app externo com a anon key: mantem anon
  assert.match(source, /grant execute on function public\.get_anamnese_publica\(text\) to anon/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/getAnamneseAluno.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Escrever a migration**

```sql
-- supabase/migrations/20260902100000_get_anamnese_aluno.sql
-- LAPE-19 — fonte unica de leitura da anamnese. Ficha, link publico e texto de
-- WhatsApp passam a ler daqui, para nao reimplementarem a resolucao cada um.

create or replace function public.get_anamnese_aluno(p_aluno_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_chave    text;
  v_unidade  uuid;
  v_anam     public.anamneses%rowtype;
  v_curso    text;
  v_resp     jsonb;
  v_ant      jsonb;
begin
  select v.pessoa_chave, v.unidade_id into v_chave, v_unidade
    from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;

  if v_chave is null then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  select * into v_anam
    from public.anamneses
   where unidade_id = v_unidade and pessoa_chave = v_chave and status = 'completa'
   order by created_at desc limit 1;

  if not found then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  select c.nome into v_curso
    from public.alunos a left join public.cursos c on c.id = a.curso_id
   where a.id = v_anam.aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pergunta_numero', r.pergunta_numero,
           'resposta_posicao', r.resposta_posicao) order by r.pergunta_numero), '[]'::jsonb)
    into v_resp
    from public.anamnese_respostas_perfil r where r.anamnese_id = v_anam.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'created_at', x.created_at, 'tipo_formulario', x.tipo_formulario)
           order by x.created_at desc), '[]'::jsonb)
    into v_ant
    from public.anamneses x
   where x.unidade_id = v_unidade and x.pessoa_chave = v_chave
     and x.status = 'completa' and x.id <> v_anam.id;

  return jsonb_build_object(
    'anamnese', to_jsonb(v_anam) || jsonb_build_object('anamnese_respostas_perfil', v_resp),
    'procedencia', jsonb_build_object(
      'aluno_id', v_anam.aluno_id,
      'curso_nome', v_curso,
      'respondida_em', v_anam.created_at,
      'e_esta_matricula', v_anam.aluno_id = p_aluno_id
    ),
    'anteriores', v_ant
  );
end;
$function$;

revoke execute on function public.get_anamnese_aluno(integer) from public;
revoke execute on function public.get_anamnese_aluno(integer) from anon;
grant execute on function public.get_anamnese_aluno(integer) to authenticated, service_role;
```

Em seguida, no mesmo arquivo, recriar `get_anamnese_publica` a partir do corpo atual (`select pg_get_functiondef('public.get_anamnese_publica(text)'::regprocedure)`), trocando **apenas** a chave `professor_nome` por `null`:

```sql
-- A pagina publica e aberta por TOKEN e nao sabe quem esta do outro lado, entao
-- nao existe "professor do contexto de quem abriu". Exibir o professor da
-- matricula de origem mostraria o professor do outro curso.
    'professor_nome', null,
```

E reafirmar a ACL (a função é chamada pelo app externo com a anon key):

```sql
revoke execute on function public.get_anamnese_publica(text) from public;
grant execute on function public.get_anamnese_publica(text) to anon, authenticated, service_role;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/getAnamneseAluno.test.mjs`
Expected: PASS (5 casos).

- [ ] **Step 5: Aplicar e validar como `authenticated`**

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<auth_user_id de admin>","role":"authenticated"}';
-- aluno que herda (nao e a matricula de origem)
select jsonb_pretty(get_anamnese_aluno(2353));
rollback;
```

Esperado: `anamnese` preenchida, `procedencia.e_esta_matricula = false`, `procedencia.curso_nome = 'Bateria'`.

Repetir com um usuário de unidade e um professor. Um aluno de **outra** unidade deve continuar respeitando a RLS da ficha (a RPC é `SECURITY DEFINER`; o escopo de quem pode abrir a ficha continua sendo do chamador).

- [ ] **Step 6: Conferir ACL das duas funções**

```sql
select proname, proacl from pg_proc
where proname in ('get_anamnese_aluno','get_anamnese_publica');
```

Esperado: `get_anamnese_aluno` sem `anon=X`; `get_anamnese_publica` **com** `anon=X` (o app externo depende dela).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902100000_get_anamnese_aluno.sql tests/getAnamneseAluno.test.mjs
git commit -m "feat(anamnese): RPC unica de leitura por pessoa + link publico sem professor (LAPE-19)"
```

---

### Task 4: Vínculo manual e convite passam a raciocinar por pessoa

**Files:**
- Create: `supabase/migrations/20260902103000_anamnese_vinculo_e_convite_por_pessoa.sql`
- Create: `tests/anamneseVinculoConvitePessoa.test.mjs`

**Interfaces:**
- Consumes: `vw_aluno_pessoa_chave`, `fn_sincronizar_anamnese_preenchida_pessoa` (Tasks 1 e 2).
- Produces: `vincular_anamnese_aluno` e `gerar_convite_anamnese` com as assinaturas **inalteradas** (nenhum parâmetro novo — o consumidor externo não pode quebrar).

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/anamneseVinculoConvitePessoa.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902103000_anamnese_vinculo_e_convite_por_pessoa.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('vincular a outra matricula da MESMA pessoa vira no-op, nao erro', () => {
  const source = sql();
  assert.match(source, /'ja_vale_para_esta_pessoa'/);
});

test('vincular a matricula de OUTRA pessoa continua recusado', () => {
  const source = sql();
  assert.match(source, /'ja_vinculada_a_outro_aluno'/);
});

test('convite vivo e procurado por pessoa, senao a secretaria gera dois links', () => {
  const source = sql();
  const fn = source.slice(source.indexOf('function public.gerar_convite_anamnese'));
  assert.match(fn, /vw_aluno_pessoa_chave/i);
});

test('assinaturas nao mudam (consumidor externo nao pode quebrar)', () => {
  const source = sql();
  // parametro novo com DEFAULT criaria overload ambiguo: e o incidente do
  // upsert_lead em 11/08/2026, que derrubou o webhook de leads por 21h.
  assert.match(source, /function public\.vincular_anamnese_aluno\(p_anamnese_id integer, p_aluno_id integer\)/i);
  assert.match(
    source,
    /function public\.gerar_convite_anamnese\(p_tipo_formulario character varying, p_unidade_id uuid, p_nome_aluno text, p_aluno_id integer DEFAULT NULL::integer, p_telefone_aluno text DEFAULT NULL::text, p_data_nascimento date DEFAULT NULL::date\)/i,
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/anamneseVinculoConvitePessoa.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Escrever a migration**

Ler o corpo vigente das duas funções (`select pg_get_functiondef('public.vincular_anamnese_aluno(integer,integer)'::regprocedure)` e idem para `gerar_convite_anamnese`) e aplicar as mudanças mínimas abaixo, **mantendo as assinaturas**:

Em `vincular_anamnese_aluno`, trocar o bloco de recusa por:

```sql
  -- Ja vinculada: recusa so quando e OUTRA pessoa. Outra matricula da mesma
  -- pessoa ja esta coberta pela propagacao -- responder erro ali seria mentira.
  if v_anam.aluno_id is not null and v_anam.aluno_id <> p_aluno_id then
    if (select v1.pessoa_chave = v2.pessoa_chave and v1.unidade_id = v2.unidade_id
          from public.vw_aluno_pessoa_chave v1, public.vw_aluno_pessoa_chave v2
         where v1.aluno_id = v_anam.aluno_id and v2.aluno_id = p_aluno_id) then
      return jsonb_build_object('ok', true, 'no_op', 'ja_vale_para_esta_pessoa',
                                'anamnese_id', p_anamnese_id,
                                'aluno_id_origem', v_anam.aluno_id);
    end if;
    return jsonb_build_object('ok', false, 'erro', 'ja_vinculada_a_outro_aluno',
                              'aluno_id_atual', v_anam.aluno_id);
  end if;
```

E, no fim da função, trocar o `UPDATE alunos` direto pela chamada ao espelho:

```sql
  perform public.fn_sincronizar_anamnese_preenchida_pessoa(
    v_anam.unidade_id,
    (select pessoa_chave from public.vw_aluno_pessoa_chave where aluno_id = p_aluno_id));
```

Em `gerar_convite_anamnese`, trocar a busca de convite vivo por uma que enxergue a pessoa:

```sql
  select * into v_convite
    from anamnese_convites c
   where c.usado_em is null
     and c.revogado_em is null
     and (
       (p_aluno_id is not null and exists (
          select 1 from public.vw_aluno_pessoa_chave v1, public.vw_aluno_pessoa_chave v2
           where v1.aluno_id = c.aluno_id and v2.aluno_id = p_aluno_id
             and v1.unidade_id = v2.unidade_id and v1.pessoa_chave = v2.pessoa_chave))
       or (p_aluno_id is null and c.aluno_id is null
           and lower(c.nome_aluno) = lower(v_nome)
           and c.unidade_id = p_unidade_id)
     )
   order by c.criado_em desc
   limit 1
   for update;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/anamneseVinculoConvitePessoa.test.mjs`
Expected: PASS (4 casos).

- [ ] **Step 5: Aplicar e conferir que não nasceu overload**

```sql
select oid::regprocedure from pg_proc
where proname in ('vincular_anamnese_aluno','gerar_convite_anamnese');
```

Esperado: **exatamente duas linhas**, uma por função. Se aparecer uma terceira, dropar o órfão imediatamente — assinatura duplicada com `DEFAULT` derruba chamador posicional (n8n) com `function is not unique`.

- [ ] **Step 6: Smoke com ROLLBACK**

```sql
begin;
-- vincular a anamnese ja vinculada da pessoa a OUTRA matricula dela: no-op
select vincular_anamnese_aluno(
  (select id from anamneses where aluno_id = 886 and status='completa' limit 1), 2353);
rollback;
```

Esperado: `{"ok": true, "no_op": "ja_vale_para_esta_pessoa", ...}`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902103000_anamnese_vinculo_e_convite_por_pessoa.sql tests/anamneseVinculoConvitePessoa.test.mjs
git commit -m "feat(anamnese): vinculo manual e convite raciocinam por pessoa (LAPE-19)"
```

---

### Task 5: Ficha e Lista de Alunos leem por pessoa

**Files:**
- Modify: `src/components/App/Alunos/ModalFichaAluno.tsx:1140-1160` (fetch), `:1630-1700` (`montarTextoAnamnese`), `:2363-2490` (aba)
- Modify: `src/components/App/Alunos/AlunosPage.tsx:797-805` (diagnósticos da Lista)
- Create: `tests/anamnesePessoaFrontend.test.mjs`

**Interfaces:**
- Consumes: `get_anamnese_aluno(p_aluno_id)` (Task 3), que devolve `{anamnese, procedencia, anteriores}`.

- [ ] **Step 1: Escrever o teste de frontend**

```javascript
// tests/anamnesePessoaFrontend.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ficha = readFileSync(
  new URL('../src/components/App/Alunos/ModalFichaAluno.tsx', import.meta.url), 'utf8');
const lista = readFileSync(
  new URL('../src/components/App/Alunos/AlunosPage.tsx', import.meta.url), 'utf8');

test('a ficha le pela RPC unica, nao mais por aluno_id direto', () => {
  assert.match(ficha, /rpc\('get_anamnese_aluno'/);
  assert.doesNotMatch(ficha, /from\('anamneses'\)[\s\S]{0,200}eq\('aluno_id'/);
});

test('a ficha mostra a procedencia quando a anamnese veio de outra matricula', () => {
  assert.match(ficha, /procedencia/);
  assert.match(ficha, /e_esta_matricula/);
});

test('o texto de WhatsApp carrega a procedencia junto com a data', () => {
  const trecho = ficha.slice(ficha.indexOf('function montarTextoAnamnese'));
  assert.match(trecho.slice(0, 2000), /procedencia/);
});

test('a ficha indica que existe anamnese anterior, para nao parecer que sumiu', () => {
  assert.match(ficha, /anteriores/);
});

test('o filtro de diagnostico da Lista tambem enxerga por pessoa', () => {
  // AlunosPage lia anamneses por aluno_id: quarto consumidor, achado depois do spec.
  const trecho = lista.slice(lista.indexOf("from('anamneses')"));
  assert.match(trecho.slice(0, 400), /pessoa_chave/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/anamnesePessoaFrontend.test.mjs`
Expected: FAIL nos 5 casos.

- [ ] **Step 3: Trocar o fetch da ficha**

Em `ModalFichaAluno.tsx`, substituir o bloco de `:1140`:

```typescript
      const { data: anamneseRpc } = await supabase
        .rpc('get_anamnese_aluno', { p_aluno_id: aluno.id });

      const pacote = (anamneseRpc || {}) as {
        anamnese: AnamneseAluno | null;
        procedencia: { aluno_id: number; curso_nome: string | null; respondida_em: string; e_esta_matricula: boolean } | null;
        anteriores: { id: number; created_at: string; tipo_formulario: string }[];
      };
      setAnamnese(pacote.anamnese || null);
      setAnamneseProcedencia(pacote.procedencia || null);
      setAnamneseAnteriores(pacote.anteriores || []);
```

Declarar os dois estados novos junto de `const [anamnese, setAnamnese]` (`:955`).

- [ ] **Step 4: Adicionar a faixa de procedência na aba**

Logo no início do `<TabsContent value="anamnese">` (`:2363`), antes do card de temperamento:

```tsx
{anamnese && anamneseProcedencia && !anamneseProcedencia.e_esta_matricula && (
  <div className="rounded-xl border border-sky-800/60 bg-sky-950/40 p-3 text-sm text-sky-200">
    <span className="font-medium">Anamnese da pessoa.</span>{' '}
    Respondida em {formatarDataHora(anamneseProcedencia.respondida_em)}
    {anamneseProcedencia.curso_nome ? `, na matrícula de ${anamneseProcedencia.curso_nome}` : ''}.
    Vale para todos os cursos do aluno.
  </div>
)}
{anamneseAnteriores.length > 0 && (
  <p className="text-xs text-slate-400">
    Há {anamneseAnteriores.length} anamnese(s) anterior(es) desta pessoa — a mais recente é a exibida.
  </p>
)}
```

- [ ] **Step 5: Levar a procedência para o texto do WhatsApp**

Em `montarTextoAnamnese()` (`:1640`), trocar a linha de cabeçalho:

```typescript
    const proc = anamneseProcedencia && !anamneseProcedencia.e_esta_matricula && anamneseProcedencia.curso_nome
      ? `, na matrícula de ${anamneseProcedencia.curso_nome}`
      : '';
    linhas.push(`_Preenchida em ${formatarDataHora(anamnese.created_at)}${proc}${anamnese.entrevistador ? ` por ${anamnese.entrevistador}` : ''}_`);
```

- [ ] **Step 6: Corrigir o filtro de diagnóstico da Lista**

Em `AlunosPage.tsx:797`, a consulta busca `anamneses` por `aluno_id` e monta `diagnosticosPorAluno`. Trocar por leitura via `pessoa_chave`, para que o aluno que herda também apareça no filtro de diagnóstico:

```typescript
      const { data: chaves } = await supabase
        .from('vw_aluno_pessoa_chave')
        .select('aluno_id, unidade_id, pessoa_chave')
        .in('aluno_id', alunoIds);

      const chavePorAluno = new Map<number, string>();
      (chaves || []).forEach((c: any) => chavePorAluno.set(c.aluno_id, `${c.unidade_id}|${c.pessoa_chave}`));

      const { data: anamnesesLista } = await supabase
        .from('anamneses')
        .select('unidade_id, pessoa_chave, diagnosticos')
        .in('pessoa_chave', [...new Set((chaves || []).map((c: any) => c.pessoa_chave))])
        .eq('status', 'completa')
        .order('created_at', { ascending: false });

      const diagPorPessoa = new Map<string, string[]>();
      anamnesesLista?.forEach((registro: any) => {
        const chave = `${registro.unidade_id}|${registro.pessoa_chave}`;
        if (diagPorPessoa.has(chave)) return;   // a mais recente vence
        diagPorPessoa.set(chave, normalizarDiagnosticos(registro.diagnosticos));
      });
```

E, onde hoje se lê `diagnosticosPorAluno.get(a.id)` (`:853`), passar a resolver pela chave:

```typescript
          anamnese_diagnosticos: diagPorPessoa.get(chavePorAluno.get(a.id) || '') || [],
```

Extrair o corpo de normalização de diagnósticos que já existe no `forEach` para a função `normalizarDiagnosticos(valor: unknown): string[]`, no mesmo arquivo — ela passa a ser usada uma vez só, mas some a duplicação de leitura.

- [ ] **Step 7: Rodar testes e build**

Run: `node --test tests/anamnesePessoaFrontend.test.mjs && npm test && npx tsc --noEmit`
Expected: PASS nos 5 casos, suíte verde, zero erro de tipo.

- [ ] **Step 8: Conferir na tela**

Abrir a ficha do aluno **2353** (curso "Minha Banda Para Sempre", que hoje diz "Anamnese não preenchida"). Esperado: a aba mostra a anamnese com a faixa *"Anamnese da pessoa. Respondida em DD/MM, na matrícula de Bateria."*

- [ ] **Step 9: Commit**

```bash
git add src/components/App/Alunos/ModalFichaAluno.tsx src/components/App/Alunos/AlunosPage.tsx tests/anamnesePessoaFrontend.test.mjs
git commit -m "feat(anamnese): ficha e lista leem a anamnese da pessoa (LAPE-19)"
```

---

### Task 6: Conciliação deixa de cobrar a mesma pessoa N vezes

**Files:**
- Modify: `supabase/functions/sync-matriculas-emusys/index.ts:846-860` (`TIPOS_ATRIBUTO_POR_ALUNO` e `chaveAtributo`)
- Modify: `tests/alunosAtributosDivergenciasContrato.test.mjs`

**Interfaces:**
- Consumes: `alunos.anamnese_preenchida` já propagado (Task 2).

- [ ] **Step 1: Acrescentar o caso ao teste existente**

```javascript
test('anamnese_pendente e deduplicada por PESSOA, nao por matricula', () => {
  // pessoa sem anamnese com 3 cursos geraria 3 tarefas identicas na fila
  const linhas = [
    { aluno_id: 10, pessoa_chave: 'emusys:99', tipo_divergencia: 'anamnese_pendente', campo: 'anamnese_preenchida' },
    { aluno_id: 11, pessoa_chave: 'emusys:99', tipo_divergencia: 'anamnese_pendente', campo: 'anamnese_preenchida' },
    { aluno_id: 12, pessoa_chave: 'emusys:98', tipo_divergencia: 'anamnese_pendente', campo: 'anamnese_preenchida' },
  ];
  const saida = deduplicarDivergenciasAtributos(linhas);
  assert.equal(saida.length, 2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/alunosAtributosDivergenciasContrato.test.mjs`
Expected: FAIL — `3 !== 2`.

- [ ] **Step 3: Deduplicar por pessoa nesse tipo**

Em `chaveAtributo`, tratar `anamnese_pendente` à parte:

```typescript
const TIPOS_ATRIBUTO_POR_PESSOA = new Set(['anamnese_pendente']);

function chaveAtributo(row: any): string {
  if (TIPOS_ATRIBUTO_POR_PESSOA.has(row.tipo_divergencia)) {
    // A anamnese e da pessoa: cobrar uma vez por matricula seria pedir o mesmo
    // formulario N vezes. Sem pessoa_chave, cai no comportamento antigo.
    return `${row.pessoa_chave ?? `aluno:${row.aluno_id ?? -1}`}|pessoa|${row.tipo_divergencia}|${row.campo}`;
  }
  if (TIPOS_ATRIBUTO_POR_ALUNO.has(row.tipo_divergencia)) {
    return `${row.aluno_id ?? -1}|aluno|${row.tipo_divergencia}|${row.campo}`;
  }
  return `${row.aluno_id ?? -1}|${row.emusys_matricula_id ?? ''}|${row.tipo_divergencia}|${row.campo}`;
}
```

Remover `'anamnese_pendente'` de `TIPOS_ATRIBUTO_POR_ALUNO`, e popular `row.pessoa_chave` em `criarDivergenciaAtributo` a partir do aluno já carregado (`a.emusys_student_id`), com o mesmo `case` da view.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/alunosAtributosDivergenciasContrato.test.mjs`
Expected: PASS.

- [ ] **Step 5: Deployar a edge com `verify_jwt` conferido**

Conferir a entrada de `sync-matriculas-emusys` em `supabase/config.toml` **antes** de deployar — `deploy_edge_function` do MCP reseta `verify_jwt` para `true` e não lê o config. Depois do deploy, confirmar que o cron respondeu 200 (não basta a função ter subido; `pg_cron` marca `succeeded` só por enfileirar).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/sync-matriculas-emusys/index.ts tests/alunosAtributosDivergenciasContrato.test.mjs
git commit -m "fix(conciliacao): anamnese_pendente deduplicada por pessoa (LAPE-19)"
```

---

### Task 7: Aviso ao professor — todos os professores da pessoa

**Files:**
- Modify (repo `la-teacher`): `supabase/functions/notificar-anamnese/index.ts:466-670`
- Create: `supabase/migrations/20260902110000_varredura_briefing_anamnese.sql` (neste repo)
- Create: `tests/varreduraBriefingAnamnese.test.mjs`

**Interfaces:**
- Consumes: `vw_aluno_pessoa_chave` (Task 1); tabela `fila_anamnese_sol_hermes` com índice único parcial `(anamnese_id, professor_id)`.
- Produces: `fn_varrer_briefings_anamnese(p_data_corte date, p_limite integer default 20) returns integer`; cron `varrer-briefing-anamnese-diario`.

> ⚠️ **A edge `notificar-anamnese` vive no repositório `la-teacher` e é deployada de lá.** Não recriar o diretório neste repo: um `supabase functions deploy` daqui sobrescreveria a varredura de privacidade em silêncio. Ver `supabase/functions/notificar-anamnese/LEIA-ANTES-DE-DEPLOYAR.md`.

- [ ] **Step 1: No `la-teacher`, escrever o teste do destinatário**

⚠️ **Seguir o padrão do `fronteira.test.mjs` que já está lá: o teste extrai a função pura do próprio `index.ts` publicado e a importa por `data:text/javascript`.** Não criar arquivo `destinatarios.mjs` à parte — o comentário no topo do `fronteira.test.mjs` é explícito sobre o motivo: *"Copiá-las para cá seria testar uma cópia — e cópia que diverge da original é como a garantia deixa de valer"*.

```javascript
// la-teacher/supabase/functions/notificar-anamnese/destinatarios.test.mjs
//
// Roda sem rede e sem banco, como o fronteira.test.mjs:
//   node supabase/functions/notificar-anamnese/destinatarios.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(aqui, 'index.ts'), 'utf8');

// Extrai a funcao pura do arquivo publicado (mesma tecnica do fronteira.test.mjs).
const inicio = fonte.indexOf('function professoresDaPessoa');
assert.ok(inicio > -1, 'professoresDaPessoa deve existir no index.ts publicado');
const fim = fonte.indexOf('\n}', inicio) + 2;
const sandbox = fonte.slice(inicio, fim).replace(/:\s*[A-Za-z<>\[\]{}|\s,]+(?=[),=])/g, '')
  + '\nexport { professoresDaPessoa };';
const mod = await import('data:text/javascript,' + encodeURIComponent(sandbox));

test('devolve os professores distintos das matriculas ativas da pessoa', () => {
  const linhas = [
    { id: 1, professor: { id: 7, nome: 'Ana', telefone_whatsapp: '21999990000' } },
    { id: 2, professor: { id: 9, nome: 'Bia', telefone_whatsapp: '21999991111' } },
    { id: 3, professor: { id: 7, nome: 'Ana', telefone_whatsapp: '21999990000' } },
  ];
  assert.deepEqual(mod.professoresDaPessoa(linhas).map((p) => p.id), [7, 9]);
});

test('linha sem professor nao vira destinatario nulo', () => {
  assert.deepEqual(mod.professoresDaPessoa([{ id: 1, professor: null }]), []);
});

test('professor sem telefone e devolvido, para o erro ser registrado e nao sumir', () => {
  const saida = mod.professoresDaPessoa([{ id: 1, professor: { id: 7, nome: 'Ana', telefone_whatsapp: null } }]);
  assert.equal(saida.length, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (no `la-teacher`): `node --test supabase/functions/notificar-anamnese/destinatarios.test.mjs`
Expected: FAIL — "professoresDaPessoa deve existir no index.ts publicado".

- [ ] **Step 3: Implementar na edge**

Em `index.ts`, acrescentar a função pura (o teste a extrai daqui):

```typescript
function professoresDaPessoa(linhas: any[]) {
  const vistos = new Map<number, any>();
  for (const linha of linhas ?? []) {
    const p = linha?.professor;
    if (!p?.id) continue;          // linha sem professor nao vira destinatario nulo
    if (vistos.has(p.id)) continue;
    vistos.set(p.id, p);
  }
  return [...vistos.values()];
}
```

Trocar a resolução de `:534` (`const professor = anamnese.aluno?.professor`) por:

```typescript
    const { data: linhasDaPessoa } = await supabase
      .from("vw_aluno_pessoa_chave")
      .select(`
        aluno_id,
        aluno:alunos!aluno_id(
          id, status, arquivado_em, professor_atual_id,
          professor:professores!professor_atual_id(id, nome, telefone_whatsapp)
        )
      `)
      .eq("unidade_id", anamnese.unidade_id)
      .eq("pessoa_chave", anamnese.pessoa_chave);

    const ativas = (linhasDaPessoa ?? [])
      .map((l: any) => l.aluno)
      .filter((a: any) => a && !a.arquivado_em && String(a.status ?? "").toLowerCase() === "ativo");

    const professores = professoresDaPessoa(ativas);
    if (professores.length === 0) {
      return json({ ok: true, skipped: "pessoa sem professor atual em nenhuma matricula ativa" });
    }
```

Envolver o bloco de montagem e enfileiramento (`:547` até `:665`) num `for (const professor of professores) { ... }`, mantendo intactos: a varredura de privacidade, o registro em `notificacao_log` e o `upsert` na fila. O índice único parcial `(anamnese_id, professor_id)` garante que repetir é inofensivo.

- [ ] **Step 4: Rodar os dois testes da edge**

Run: `node --test supabase/functions/notificar-anamnese/destinatarios.test.mjs supabase/functions/notificar-anamnese/fronteira.test.mjs`
Expected: PASS — inclusive os 12 casos da fronteira de privacidade, que **não** podem regredir.

- [ ] **Step 5: Deployar a edge a partir do `la-teacher`**

```bash
supabase functions deploy notificar-anamnese --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```

- [ ] **Step 6: Escrever o teste da varredura (neste repo)**

```javascript
// tests/varreduraBriefingAnamnese.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902110000_varredura_briefing_anamnese.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('a data de corte e obrigatoria e sem ela a funcao nao varre nada', () => {
  // sem corte, a varredura despacharia o passado inteiro -- inclusive os 26
  // casos pre-existentes que o Luciano vetou.
  const source = sql();
  assert.match(source, /if p_data_corte is null then\s*return 0;/i);
});

test('so enfileira quem NAO tem linha na fila para aquele par', () => {
  const source = sql();
  assert.match(source, /not exists[\s\S]{0,200}fila_anamnese_sol_hermes/i);
});

test('tem teto por execucao, para uma falha nao virar enxurrada', () => {
  const source = sql();
  assert.match(source, /limit p_limite/i);
});

test('o cron nasce com a data de corte fixada e manda Authorization junto do token', () => {
  const source = sql();
  assert.match(source, /Authorization/i);
  assert.match(source, /cron\.schedule\(\s*'varrer-briefing-anamnese-diario'/i);
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `node --test tests/varreduraBriefingAnamnese.test.mjs`
Expected: FAIL.

- [ ] **Step 8: Escrever a migration da varredura**

```sql
-- supabase/migrations/20260902110000_varredura_briefing_anamnese.sql
-- LAPE-19 — varredura diaria: existe professor ativo da pessoa sem briefing da
-- anamnese vigente? Existe porque o unico gatilho hoje e "anamnese salva",
-- disparado pelo app do formulario em fire-and-forget -- "aluno entrou em curso
-- novo" nao e evento para ninguem, e falha de envio morre num console.warn.

create or replace function public.fn_varrer_briefings_anamnese(
  p_data_corte date,
  p_limite integer default 20
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_enviados integer := 0;
  v_url text := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/notificar-anamnese';
begin
  -- Sem data de corte a varredura despacharia o historico inteiro. E veto
  -- explicito: o backfill nao envia mensagem.
  if p_data_corte is null then
    return 0;
  end if;

  for r in
    select distinct an.id as anamnese_id
      from public.anamneses an
      join public.vw_aluno_pessoa_chave v
        on v.unidade_id = an.unidade_id and v.pessoa_chave = an.pessoa_chave
      join public.alunos a
        on a.id = v.aluno_id
       and a.arquivado_em is null
       and lower(coalesce(a.status, '')) = 'ativo'
       and a.professor_atual_id is not null
     where an.status = 'completa'
       and an.created_at >= p_data_corte
       and not exists (
         select 1 from public.fila_anamnese_sol_hermes f
          where f.anamnese_id = an.id
            and f.professor_id = a.professor_atual_id
       )
     order by an.id
     limit p_limite
  loop
    -- Padrao dos crons deste projeto: segredo do vault, nunca hardcode.
    -- A anon key vai junto porque deploy pelo MCP reseta verify_jwt para true e
    -- derrubaria o cron em 401 silencioso (incidente sync-inadimplencia, 07/2026).
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
           where name = 'supabase_anon_key' limit 1
        )
      ),
      body := jsonb_build_object('anamnese_id', r.anamnese_id),
      timeout_milliseconds := 25000
    );
    v_enviados := v_enviados + 1;
  end loop;

  return v_enviados;
end;
$function$;

revoke execute on function public.fn_varrer_briefings_anamnese(date, integer) from public;
revoke execute on function public.fn_varrer_briefings_anamnese(date, integer) from anon;
grant execute on function public.fn_varrer_briefings_anamnese(date, integer) to service_role;

-- 11:20 UTC = 08:20 BRT. Data de corte = dia do deploy: nada anterior e tocado.
select cron.schedule(
  'varrer-briefing-anamnese-diario',
  '20 11 * * *',
  $cron$ select public.fn_varrer_briefings_anamnese(date '2026-09-02', 20); $cron$
);
```

- [ ] **Step 9: Rodar e ver passar**

Run: `node --test tests/varreduraBriefingAnamnese.test.mjs`
Expected: PASS (4 casos).

- [ ] **Step 10: Aplicar e provar que o histórico não é tocado**

```sql
-- dry-run mental: quantos pares a varredura enxergaria com e sem corte
select
  (select count(*) from fila_anamnese_sol_hermes) as fila_antes,
  (select fn_varrer_briefings_anamnese(null, 20)) as sem_corte_deve_ser_zero;
```

Esperado: `sem_corte_deve_ser_zero = 0`. Depois, conferir 24h após o primeiro run que `fila_anamnese_sol_hermes` **não** ganhou linhas de anamnese anterior a 2026-09-02:

```sql
select count(*) from fila_anamnese_sol_hermes f
join anamneses an on an.id = f.anamnese_id
where f.created_at > date '2026-09-02' and an.created_at < date '2026-09-02';
```

Esperado: **0**. Se for maior, desligar o cron (`select cron.unschedule('varrer-briefing-anamnese-diario')`) e investigar antes de qualquer outra coisa.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20260902110000_varredura_briefing_anamnese.sql tests/varreduraBriefingAnamnese.test.mjs
git commit -m "feat(anamnese): varredura diaria de briefing por professor, com data de corte (LAPE-19)"
```

---

### Task 8: Lista dos 7 e documentação

**Files:**
- Modify: `CLAUDE.md` (seção de integrações / domínio do aluno)
- Modify: `docs/MAPA-SISTEMA.md` (páginas Alunos e Sucesso do Aluno)
- Create: `docs/auditorias/2026-09-02-anamnese-por-pessoa-casos-sem-briefing.md`

- [ ] **Step 1: Gerar a lista dos 7 para a coordenação**

```sql
with vigente as (
  select an.id as anamnese_id, an.unidade_id, an.pessoa_chave, an.created_at,
         (select count(*) from jsonb_array_elements_text(coalesce(an.diagnosticos,'[]'::jsonb)) d(v)
           where upper(btrim(d.v)) not in ('NÃO','NAO','NENHUM','NENHUMA','-')) as diag_reais,
         row_number() over (partition by an.unidade_id, an.pessoa_chave order by an.created_at desc) as rn
    from anamneses an where an.status='completa'
)
select p.nome as professor, a.nome as aluno, c.nome as curso, u.nome as unidade, vg.anamnese_id
  from vigente vg
  join vw_aluno_pessoa_chave v on v.unidade_id = vg.unidade_id and v.pessoa_chave = vg.pessoa_chave
  join alunos a on a.id = v.aluno_id and a.arquivado_em is null and lower(coalesce(a.status,''))='ativo'
  join professores p on p.id = a.professor_atual_id
  join unidades u on u.id = a.unidade_id
  left join cursos c on c.id = a.curso_id
 where vg.rn = 1 and vg.diag_reais > 0
   and not exists (select 1 from fila_anamnese_sol_hermes f
                    where f.anamnese_id = vg.anamnese_id and f.professor_id = p.id)
 order by u.nome, p.nome;
```

Salvar o resultado em `docs/auditorias/2026-09-02-anamnese-por-pessoa-casos-sem-briefing.md`, **sem** conteúdo clínico — só professor, aluno, curso, unidade e o id da anamnese. Quem decide o envio é a coordenação, pelo botão "Enviar ao professor" na ficha.

- [ ] **Step 2: Atualizar `CLAUDE.md`**

Acrescentar, na seção do domínio do aluno, um parágrafo curto: a anamnese é **da pessoa** (`(unidade_id, pessoa_chave)`), `anamneses.aluno_id` é **procedência**, a leitura canônica é `get_anamnese_aluno`, e `emusys_student_id` sozinho não identifica pessoa (os 91 ids em 2+ unidades com nomes diferentes).

- [ ] **Step 3: Atualizar `docs/MAPA-SISTEMA.md`**

Nas páginas Alunos e Sucesso do Aluno, registrar a RPC nova e a varredura diária com sua data de corte.

- [ ] **Step 4: Registrar a mudança de insumo do modelo de churn**

Em `.claude/memory/dominio-alunos.md`, na seção do Risco de Evasão, acrescentar: a feature `anamnese_preenchida` de `features_churn_alunos_ativos` passou de "anamnese desta matrícula" para "anamnese desta pessoa" em 02/09/2026, mudando 21 linhas. O modelo foi treinado com a semântica antiga; roda diário e não quebra, mas quem for retreinar precisa saber que a série tem um degrau nessa data.

Conferir o tamanho real do degrau depois de aplicar:

```sql
select count(*) filter (where anamnese_preenchida) as com_anamnese,
       count(*) as ativos
from alunos where arquivado_em is null and lower(coalesce(status,'')) = 'ativo';
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/MAPA-SISTEMA.md docs/auditorias/2026-09-02-anamnese-por-pessoa-casos-sem-briefing.md
git commit -m "docs(anamnese): registra o modelo por pessoa e a lista para a coordenacao (LAPE-19)"
```

- [ ] **Step 7: Encerrar a frente**

Abrir PR da branch, mergear e apagar a branch local e remota. Frente encerrada = merge feito: PR aberto com código já aplicado em produção é risco ativo — o banco fica corrigido e a `main` fica com o código antigo.

---

## Verificação final (depois de todas as tasks)

- [ ] Aluno **2353** mostra a anamnese com a faixa de procedência.
- [ ] `select count(*) from alunos where anamnese_preenchida and arquivado_em is null` = **233** (212 + 21).
- [ ] `select count(*) from anamneses where pessoa_chave is null` = **6** (as de vínculo pendente).
- [ ] Nenhuma linha nova em `fila_anamnese_sol_hermes` referente a anamnese anterior à data de corte.
- [ ] `proacl` de `get_anamnese_aluno`, `fn_pessoa_chave_aluno`, `fn_sincronizar_anamnese_preenchida_pessoa` e `fn_varrer_briefings_anamnese` sem `anon=X`.
- [ ] `relacl` de `vw_aluno_pessoa_chave` = `authenticated=r` (nunca `arwdDxtm`).
- [ ] `select oid::regprocedure from pg_proc where proname in ('vincular_anamnese_aluno','gerar_convite_anamnese')` devolve exatamente 2 linhas.
- [ ] Os 12 casos de `fronteira.test.mjs` no `la-teacher` continuam passando.
