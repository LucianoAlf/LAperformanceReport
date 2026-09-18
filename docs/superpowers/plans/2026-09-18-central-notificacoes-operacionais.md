# Central de notificações operacionais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Criar a projeção canônica de eventos operacionais para professores, suas RPCs de serviço e aniversário e a carga inicial de sete dias, conforme o contrato fechado.

**Architecture:** Uma migration aditiva cria eventos_operacionais e sua tabela de audiência por professor. Gatilhos de fontes canônicas gravam fatos idempotentes, em bloco de exceção, para que uma falha de notificação não interrompa webhook ou sincronização. As consultas leem a audiência indexada e retornam JSON paginado por detectado_em; aniversários ficam em uma consulta independente.

**Tech Stack:** PostgreSQL/Supabase, migrations SQL versionadas, RLS, funções SECURITY DEFINER com search_path fixado, Node test runner e fixture PostgreSQL 17 em Docker.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| docs/superpowers/specs/2026-09-18-central-de-notificacoes-design.md | Contrato fechado, copiado para o repositório dono do banco. |
| supabase/functions/_shared/jornada-canonica.ts | Persistir somente a descrição curta permitida da alteração de matrícula. |
| supabase/migrations/<timestamp>_central_notificacoes_operacionais.sql | Tabelas, RLS, índices, helpers, gatilhos, RPCs e carga inicial. |
| tests/eventosOperacionaisProfessorPostgres.test.mjs | Fixture PG17 e provas de transição, deduplicação, isolamento de falha, ACL, paginação e aniversário. |
| docs/banco/* | Mapa gerado depois da migration aplicada. |
| docs/handoffs/2026-09-18-central-notificacoes-operacionais.md | Medições de produção, recorte de 24 h e exemplos anonimizados. |

### Task 1: Fixar contrato e teste vermelho

**Files:**
- Create: docs/superpowers/specs/2026-09-18-central-de-notificacoes-design.md
- Create: tests/eventosOperacionaisProfessorPostgres.test.mjs

- [x] **Step 1: Copiar a especificação fechada para este repositório**

~~~powershell
Copy-Item D:\la-teacher\docs\superpowers\specs\2026-09-18-central-de-notificacoes-design.md docs\superpowers\specs\2026-09-18-central-de-notificacoes-design.md
~~~

- [ ] **Step 2: Escrever a fixture que falha sem a migration**

~~~js
test('reagendamento dentro da janela cria audiência e regravação idêntica não cria outra', () => {
  const result = psql(container, [
    "update public.aulas_emusys set data_hora_inicio = '2026-09-19 20:00:00-03' where id = 101;",
    "update public.aulas_emusys set data_hora_inicio = '2026-09-19 20:00:00-03' where id = 101;",
    "select tipo, count(*) from public.eventos_operacionais group by tipo;",
  ].join('\\n'));
  assert.deepEqual(result.stdout.trim().split(/\\r?\\n/u), ['aula_reagendada|1']);
});
~~~

- [ ] **Step 3: Rodar o teste antes da migration**

Run: node --test tests/eventosOperacionaisProfessorPostgres.test.mjs  
Expected: FAIL porque as tabelas e RPCs ainda não existem.

### Task 2: Preservar apenas o detalhe permitido de matrícula alterada

**Files:**
- Modify: supabase/functions/_shared/jornada-canonica.ts
- Modify: tests/eventosOperacionaisProfessorPostgres.test.mjs

- [ ] **Step 1: Adicionar prova de contrato**

~~~js
assert.equal(JSON.parse(rpc.stdout.trim()).itens[0].detalhe, 'Alteração de turma');
assert.doesNotMatch(rpc.stdout, /observacoes|valor_parcela|payload_snapshot/i);
~~~

- [ ] **Step 2: Estender a entrada de jornada com descrição limitada**

~~~ts
alteracaoDescricaoEmusys: limitarTextoSeguro(raw?.alteracao?.descricao, 500),
// A linha projetada carrega apenas o campo seguro:
alteracao_descricao_emusys: input.alteracaoDescricaoEmusys ?? null,
~~~

O campo só é preenchido para webhook:matricula_alterada. Observações de aviso prévio, saúde, finanças e payload bruto não são copiados.

- [ ] **Step 3: Executar o teste**

Run: node --test tests/eventosOperacionaisProfessorPostgres.test.mjs  
Expected: o caso de detalhe permitido passa; os casos de gatilho seguem vermelhos.

### Task 3: Criar armazenamento, audiência e helper seguro

**Files:**
- Create: supabase/migrations/<timestamp>_central_notificacoes_operacionais.sql
- Modify: tests/eventosOperacionaisProfessorPostgres.test.mjs

- [ ] **Step 1: Criar tabelas append-only e índices de leitura**

~~~sql
create table public.eventos_operacionais (
  evento_id text primary key,
  tipo text not null check (tipo in (
    'aula_reagendada', 'aula_cancelada', 'professor_trocado',
    'experimental_marcada', 'aluno_novo', 'aviso_previo',
    'matricula_trancada', 'matricula_encerrada', 'matricula_alterada'
  )),
  ocorreu_em timestamptz,
  detectado_em timestamptz not null default now(),
  origem text not null check (origem in ('webhook', 'sincronizacao', 'carga_inicial')),
  unidade_id uuid not null references public.unidades(id),
  aluno_id integer references public.alunos(id) on delete set null,
  aula_id integer references public.aulas_emusys(id) on delete set null,
  curso text,
  aula jsonb,
  mudanca jsonb not null default '{}'::jsonb,
  motivo text,
  detalhe text,
  created_at timestamptz not null default now()
);

create table public.eventos_operacionais_audiencia (
  evento_id text not null references public.eventos_operacionais(evento_id) on delete cascade,
  professor_id integer not null references public.professores(id) on delete cascade,
  participacao text not null check (participacao in ('responsavel', 'saiu', 'entrou')),
  primary key (evento_id, professor_id)
);

create index idx_eventos_operacionais_audiencia_leitura
  on public.eventos_operacionais_audiencia (professor_id, evento_id);
create index idx_eventos_operacionais_detectado
  on public.eventos_operacionais (detectado_em desc, evento_id desc);
~~~

- [ ] **Step 2: Criar helper idempotente e não bloqueante**

~~~sql
create or replace function public.fn_eventos_operacionais_registrar(...)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.eventos_operacionais (...) values (...)
  on conflict (evento_id) do nothing;
  insert into public.eventos_operacionais_audiencia (...)
  select ... on conflict do nothing;
exception when others then
  raise warning 'EVENTOS_OPERACIONAIS_REGISTRO_FALHOU tipo=% sqlstate=%', p_tipo, sqlstate;
end;
$$;
~~~

O helper nomeia as colunas explicitamente, não recebe valor, parcela, observações livres ou payload bruto, e absorve a falha antes de retornar ao gatilho.

- [ ] **Step 3: Aplicar RLS e ACL estritos**

~~~sql
alter table public.eventos_operacionais enable row level security;
alter table public.eventos_operacionais_audiencia enable row level security;
revoke all on public.eventos_operacionais from public, anon, authenticated;
revoke all on public.eventos_operacionais_audiencia from public, anon, authenticated;
revoke all on function public.fn_eventos_operacionais_registrar(...) from public, anon, authenticated, service_role;
~~~

- [ ] **Step 4: Rodar o teste**

Run: node --test tests/eventosOperacionaisProfessorPostgres.test.mjs  
Expected: estrutura, ACL e deduplicação passam; gatilhos ainda falham.

### Task 4: Conectar gatilhos às fontes canônicas

**Files:**
- Modify: supabase/migrations/<timestamp>_central_notificacoes_operacionais.sql
- Modify: tests/eventosOperacionaisProfessorPostgres.test.mjs

- [ ] **Step 1: Criar gatilhos da agenda com janela de ontem a +14 dias**

~~~sql
create trigger trg_eventos_operacionais_aula_reagendada
after update of data_hora_inicio on public.aulas_emusys
for each row
when (old.data_hora_inicio is distinct from new.data_hora_inicio)
execute function public.trg_eventos_operacionais_aula_reagendada();

create trigger trg_eventos_operacionais_aula_cancelada
after update of cancelada on public.aulas_emusys
for each row
when (coalesce(old.cancelada, false) = false and coalesce(new.cancelada, false) = true)
execute function public.trg_eventos_operacionais_aula_cancelada();
~~~

As funções calculam a janela em America/Sao_Paulo com a data anterior ou nova. Regravação sem mudança e aula fora da janela não emitem evento.

- [ ] **Step 2: Criar professor_trocado para aula e jornada**

~~~sql
create trigger trg_eventos_operacionais_professor_aula
after update of professor_id on public.aulas_emusys
for each row
when (old.professor_id is distinct from new.professor_id)
execute function public.trg_eventos_operacionais_professor_aula();

create trigger trg_eventos_operacionais_professor_jornada
after insert on public.aluno_professor_transicoes
for each row execute function public.trg_eventos_operacionais_professor_jornada();
~~~

As funções emitem audiência saiu e entrou, descartam IDs nulos e não duplicam a mesma pessoa.

- [ ] **Step 3: Criar eventos de jornada, aviso e experimental**

~~~sql
create trigger trg_eventos_operacionais_jornada
after insert or update of fonte_ultima_atualizacao, professor_id, curso_id,
  curso_nome_emusys, status_matricula, emusys_disciplina_id
on public.aluno_jornada_matricula_disciplina
for each row execute function public.trg_eventos_operacionais_jornada();

create trigger trg_eventos_operacionais_aviso_previo
after insert or update of data, motivo, data_prevista_saida, mes_saida, emusys_aviso_previo_id
or delete on public.movimentacoes_admin
for each row execute function public.trg_eventos_operacionais_aviso_previo();

create trigger trg_eventos_operacionais_experimental
after insert or update of data_experimental, horario_experimental, professor_experimental_id, status
on public.lead_experimentais
for each row execute function public.trg_eventos_operacionais_experimental();
~~~

Jornada só gera aluno_novo, matrícula trancada, matrícula encerrada e matrícula alterada quando a origem é o webhook correspondente e houve alteração semântica. Experimental não duplica quando emusys_aula_id já resolve em aulas_emusys.

- [ ] **Step 4: Provar isolamento de falha e todos os tipos**

~~~js
test('falha ao registrar evento não derruba atualização da agenda', () => {
  const result = psql(container, [
    'alter table public.eventos_operacionais add constraint evento_teste_forca_erro check (false) not valid;',
    'alter table public.eventos_operacionais validate constraint evento_teste_forca_erro;',
    'update public.aulas_emusys set cancelada = true where id = 101;',
    'select cancelada from public.aulas_emusys where id = 101;',
  ].join('\\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 't');
});
~~~

Cobrir: reagendamento fora da janela, cancelamento, entrada/saída de professor, experimental, aluno novo pela jornada, três ações de aviso prévio, trancamento, encerramento, alteração de matrícula, ausência de observacoes e evento idempotente.

- [ ] **Step 5: Rodar a prova ponta a ponta**

Run: node --test tests/eventosOperacionaisProfessorPostgres.test.mjs  
Expected: PASS ou SKIP explícito somente se Docker estiver indisponível.

### Task 5: Expor RPCs e carga inicial

**Files:**
- Modify: supabase/migrations/<timestamp>_central_notificacoes_operacionais.sql
- Modify: tests/eventosOperacionaisProfessorPostgres.test.mjs

- [ ] **Step 1: Implementar a RPC de serviço**

~~~sql
create or replace function public.fn_eventos_operacionais_professor_v1(
  p_professor_id integer,
  p_desde timestamptz,
  p_cursor_detectado_em timestamptz default null,
  p_cursor_evento_id text default null,
  p_limite integer default 50,
  p_tipos text[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public;
~~~

Limitar em 1..200, validar cursor completo, ordenar por detectado_em desc e evento_id desc e retornar somente as chaves fechadas no contrato.

- [ ] **Step 2: Implementar a RPC de aniversários**

~~~sql
create or replace function public.fn_aniversariantes_do_professor_v1(
  p_professor_id integer,
  p_de date,
  p_ate date
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public;
~~~

Deduplicar por unidade + emusys_student_id, com fallback no aluno local; excluir arquivados; manter somente matrícula operacional ativa; e aceitar intervalo que atravessa o ano.

- [ ] **Step 3: Implementar carga inicial idempotente**

~~~sql
create or replace function public.fn_eventos_operacionais_carga_inicial_v1(
  p_desde timestamptz default now() - interval '7 days'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public;
~~~

A função lê revisões de aula, movimentações, experimentais e transições; usa origem=carga_inicial e os mesmos IDs. A execução será separada da DDL para medir custo num banco sob pressão.

- [ ] **Step 4: Validar paginação, filtro e aniversário**

~~~js
assert.equal(page1.itens.length, 50);
assert.deepEqual(page1.proximo_cursor, {
  detectado_em: page1.itens.at(-1).detectado_em,
  evento_id: page1.itens.at(-1).evento_id,
});
assert.equal(JSON.stringify(page1).includes('valor_parcela'), false);
assert.equal(JSON.stringify(aniversarios).includes('arquivado'), false);
~~~

- [ ] **Step 5: Executar a suíte relevante**

Run: node --test tests/eventosOperacionaisProfessorPostgres.test.mjs tests/passagemBastaoBackend.test.mjs tests/emusysMatriculasStatusV131Consumers.test.mjs  
Expected: PASS, com Docker indisponível marcado como SKIP pela fixture.

### Task 6: Validar em produção e documentar

**Files:**
- Modify: docs/banco/* via npm run mapa:banco
- Create: docs/handoffs/2026-09-18-central-notificacoes-operacionais.md

- [ ] **Step 1: Medir baseline do sync de grade**

~~~sql
select unidade_id, started_at, finished_at,
       extract(epoch from finished_at - started_at) * 1000 as duracao_ms
from public.presenca_sync_runs
where modo = 'metadados'
order by started_at desc
limit 30;
~~~

- [ ] **Step 2: Aplicar migration só após testes locais e revisão de SQL**

~~~text
Aplicar apenas a migration versionada; nenhuma Edge Function é publicada.
~~~

- [ ] **Step 3: Rodar carga inicial e medir consulta**

~~~sql
select public.fn_eventos_operacionais_carga_inicial_v1(now() - interval '7 days');
explain (analyze, buffers, format text)
select public.fn_eventos_operacionais_professor_v1(
  42, now() - interval '7 days', null, null, 50, null
);
~~~

Aceite: 50 itens para um professor em menos de 50 ms, com plano usando audiência e detectado_em.

- [ ] **Step 4: Comparar sync antes e depois nas três unidades**

~~~sql
select unidade_id,
       percentile_cont(0.5) within group (order by duracao_ms) as p50_ms,
       percentile_cont(0.9) within group (order by duracao_ms) as p90_ms
from (
  select unidade_id,
         extract(epoch from finished_at - started_at) * 1000 as duracao_ms
  from public.presenca_sync_runs
  where modo = 'metadados'
    and started_at >= now() - interval '24 hours'
) runs
group by unidade_id;
~~~

- [ ] **Step 5: Gerar mapa e relatório de 24 horas**

~~~bash
npm run mapa:banco
git add supabase/migrations tests supabase/functions/_shared docs
git commit -m "feat: add operational notifications projection"
~~~

O handoff registra migrations, assinaturas, índices, medições, contagem por tipo em 24 h e um payload de exemplo por tipo sem nome de aluno.
