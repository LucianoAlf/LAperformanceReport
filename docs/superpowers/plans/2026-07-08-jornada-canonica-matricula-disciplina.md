# Jornada Canonica por Matricula Disciplina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada canonica de jornada por matricula/disciplina, alimentada por Emusys, com leitura por aluno, professor, marcos e presenca enriquecida.

**Architecture:** A fonte oficial sera a tabela `aluno_jornada_matricula_disciplina`, com upsert central compartilhado por webhooks e sync. Presenca/falta fica em views enriquecidas, sem alterar a posicao oficial da jornada. As telas consomem views/RPCs em vez de recalcular aula atual localmente.

**Tech Stack:** Supabase Postgres migrations, Supabase Edge Functions em Deno/TypeScript, React/Vite, Supabase JS.

---

## File Structure

- Create: `supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql`
  - Cria tabela canonica, indices, RLS backend-only, views e RPCs finas.
  - Adiciona colunas opcionais em `aulas_emusys` para guardar `qtd_aulas_contrato` e `matricula_disciplina_id`.
- Create: `supabase/functions/_shared/jornada-canonica.ts`
  - Normaliza payloads de `/matriculas` e webhooks.
  - Resolve aluno, curso e professor locais.
  - Calcula `proxima_aula_numero` e `percentual_jornada`.
  - Faz upsert idempotente em `aluno_jornada_matricula_disciplina`.
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`
  - Chama o helper depois dos handlers existentes.
  - Trata `matricula_alterada`.
  - Mantem log de evento ignorado apenas para eventos sem handler real.
- Modify: `supabase/functions/sync-matriculas-emusys/index.ts`
  - Chama o helper para cada matricula retornada por `/matriculas`.
  - Registra resumo de jornadas atualizadas por unidade.
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`
  - Persiste `matricula_disciplina_id` e `qtd_aulas_contrato` em `aulas_emusys`.
- Create: `src/hooks/useJornadaAluno.ts`
  - Hook para ficha do aluno e Sucesso do Aluno.
- Create: `src/hooks/useJornadaProfessor.ts`
  - Hook para Professores e base do LA Teacher.
- Modify: `src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx`
  - Mostra posicao por contrato/disciplina.
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`
  - Mantem fase por tempo e adiciona leitura de posicao real quando abrir detalhe.
- Modify: `src/components/App/SucessoCliente/MarcosJornadaSection.tsx`
  - Nao troca a Edge de primeira; apenas prepara a leitura para futuro consumo de `vw_jornada_marcos`.
- Test/verify:
  - `npm run build`
  - `supabase db push --dry-run` quando CLI estiver autenticado.
  - Deploy das Edge Functions modificadas.

---

## Task 1: Migration da camada canonica

**Files:**
- Create: `supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql`

- [ ] **Step 1: Criar a migration com tabela, indices, colunas auxiliares, views e RPCs**

Create this file:

```sql
-- Jornada canonica por matricula/disciplina.
-- Fonte oficial: Emusys /matriculas + webhooks de matricula.

create table if not exists public.aluno_jornada_matricula_disciplina (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_aluno_id bigint,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint not null,
  emusys_disciplina_id bigint,
  curso_id integer references public.cursos(id) on delete set null,
  curso_nome_emusys text,
  professor_id integer references public.professores(id) on delete set null,
  emusys_professor_id bigint,
  professor_nome_emusys text,
  status_matricula text not null default 'desconhecido',
  qtd_contratos integer,
  nr_aulas_contratadas integer,
  nr_aulas_passadas integer,
  nr_aulas_futuras integer,
  proxima_aula_numero integer,
  percentual_jornada numeric(8,2),
  data_primeira_aula timestamptz,
  data_ultima_aula timestamptz,
  dia_semana text,
  horario text,
  fonte_ultima_atualizacao text not null,
  ultima_sincronizacao_emusys timestamptz not null default now(),
  payload_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_jornada_matricula_disciplina_status_chk
    check (status_matricula in ('ativa', 'trancada', 'finalizada', 'inativa', 'desconhecido')),
  constraint aluno_jornada_matricula_disciplina_percentual_chk
    check (percentual_jornada is null or (percentual_jornada >= 0 and percentual_jornada <= 100)),
  constraint aluno_jornada_matricula_disciplina_unq
    unique (unidade_id, emusys_matricula_disciplina_id)
);

create index if not exists idx_jornada_aluno_unidade_aluno
  on public.aluno_jornada_matricula_disciplina (unidade_id, aluno_id);

create index if not exists idx_jornada_aluno_unidade_professor
  on public.aluno_jornada_matricula_disciplina (unidade_id, professor_id);

create index if not exists idx_jornada_aluno_unidade_status
  on public.aluno_jornada_matricula_disciplina (unidade_id, status_matricula);

create index if not exists idx_jornada_aluno_unidade_proxima
  on public.aluno_jornada_matricula_disciplina (unidade_id, proxima_aula_numero);

create index if not exists idx_jornada_aluno_unidade_ultima
  on public.aluno_jornada_matricula_disciplina (unidade_id, data_ultima_aula);

drop trigger if exists trg_aluno_jornada_matricula_disciplina_updated_at
  on public.aluno_jornada_matricula_disciplina;

create trigger trg_aluno_jornada_matricula_disciplina_updated_at
  before update on public.aluno_jornada_matricula_disciplina
  for each row
  execute function public.update_updated_at_column();

alter table public.aluno_jornada_matricula_disciplina enable row level security;

drop policy if exists "service_role_all_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina;

create policy "service_role_all_aluno_jornada_matricula_disciplina"
  on public.aluno_jornada_matricula_disciplina
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.aulas_emusys
  add column if not exists matricula_disciplina_id bigint,
  add column if not exists qtd_aulas_contrato integer;

create index if not exists idx_aulas_emusys_matricula_disciplina
  on public.aulas_emusys (unidade_id, matricula_disciplina_id)
  where matricula_disciplina_id is not null;

create or replace view public.vw_jornada_aluno_atual as
select
  j.id,
  j.unidade_id,
  u.nome as unidade_nome,
  j.aluno_id,
  a.nome as aluno_nome,
  a.telefone,
  a.whatsapp,
  a.responsavel_nome,
  a.responsavel_telefone,
  j.emusys_aluno_id,
  j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id,
  j.emusys_disciplina_id,
  j.curso_id,
  coalesce(c.nome, j.curso_nome_emusys) as curso_nome,
  j.curso_nome_emusys,
  j.professor_id,
  coalesce(p.nome, j.professor_nome_emusys) as professor_nome,
  j.emusys_professor_id,
  j.professor_nome_emusys,
  j.status_matricula,
  j.qtd_contratos,
  j.nr_aulas_contratadas,
  j.nr_aulas_passadas,
  j.nr_aulas_futuras,
  j.proxima_aula_numero,
  j.percentual_jornada,
  case
    when j.nr_aulas_contratadas is null then null
    when coalesce(j.nr_aulas_futuras, 0) > 0 and j.proxima_aula_numero is not null
      then 'Aula ' || j.proxima_aula_numero || '/' || j.nr_aulas_contratadas
    when coalesce(j.nr_aulas_passadas, 0) >= j.nr_aulas_contratadas
      then j.nr_aulas_contratadas || '/' || j.nr_aulas_contratadas || ' concluida'
    else coalesce(j.nr_aulas_passadas, 0) || '/' || j.nr_aulas_contratadas
  end as jornada_label,
  j.data_primeira_aula,
  j.data_ultima_aula,
  j.dia_semana,
  j.horario,
  j.fonte_ultima_atualizacao,
  j.ultima_sincronizacao_emusys,
  j.updated_at
from public.aluno_jornada_matricula_disciplina j
left join public.unidades u on u.id = j.unidade_id
left join public.alunos a on a.id = j.aluno_id
left join public.cursos c on c.id = j.curso_id
left join public.professores p on p.id = j.professor_id
where j.status_matricula = 'ativa';

create or replace view public.vw_jornada_aluno_com_presenca as
select
  j.*,
  count(ap.id) filter (where ap.status = 'presente')::integer as presencas,
  count(ap.id) filter (where ap.status = 'ausente')::integer as faltas,
  count(ap.id)::integer as aulas_com_presenca_registrada,
  case
    when count(ap.id) = 0 then null
    else round(
      100.0 * count(ap.id) filter (where ap.status = 'presente') / nullif(count(ap.id), 0),
      2
    )
  end as percentual_presenca_contrato,
  max(ap.data_aula) as ultima_aula_registrada
from public.vw_jornada_aluno_atual j
left join public.aluno_presenca ap
  on ap.aluno_id = j.aluno_id
 and ap.unidade_id = j.unidade_id
left join public.aulas_emusys ae
  on ae.id = ap.aula_emusys_id
 and (
   ae.matricula_disciplina_id = j.emusys_matricula_disciplina_id
   or (
     ae.matricula_disciplina_id is null
     and ae.curso_emusys_id = j.emusys_disciplina_id
   )
 )
group by
  j.id, j.unidade_id, j.unidade_nome, j.aluno_id, j.aluno_nome, j.telefone, j.whatsapp,
  j.responsavel_nome, j.responsavel_telefone, j.emusys_aluno_id, j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id, j.emusys_disciplina_id, j.curso_id, j.curso_nome,
  j.curso_nome_emusys, j.professor_id, j.professor_nome, j.emusys_professor_id,
  j.professor_nome_emusys, j.status_matricula, j.qtd_contratos, j.nr_aulas_contratadas,
  j.nr_aulas_passadas, j.nr_aulas_futuras, j.proxima_aula_numero, j.percentual_jornada,
  j.jornada_label, j.data_primeira_aula, j.data_ultima_aula, j.dia_semana, j.horario,
  j.fonte_ultima_atualizacao, j.ultima_sincronizacao_emusys, j.updated_at;

create or replace view public.vw_jornada_professor_atual as
select *
from public.vw_jornada_aluno_com_presenca
where professor_id is not null;

create or replace view public.vw_jornada_marcos as
select
  *,
  case
    when proxima_aula_numero = 1 then 'primeira_aula'
    when proxima_aula_numero in (15, 21) then 'marco_aula'
    when nr_aulas_futuras is not null and nr_aulas_futuras <= 4 then 'perto_renovacao'
    else 'jornada'
  end as tipo_marco
from public.vw_jornada_aluno_com_presenca;

create or replace function public.get_jornada_aluno(p_aluno_id integer)
returns setof public.vw_jornada_aluno_com_presenca
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.vw_jornada_aluno_com_presenca
  where aluno_id = p_aluno_id
  order by curso_nome, emusys_matricula_disciplina_id;
$$;

create or replace function public.get_jornada_professor(p_professor_id integer)
returns setof public.vw_jornada_professor_atual
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.vw_jornada_professor_atual
  where professor_id = p_professor_id
  order by aluno_nome, curso_nome;
$$;
```

- [ ] **Step 2: Validar sintaxe da migration localmente**

Run:

```bash
supabase db push --dry-run
```

Expected:

```text
Dry run completed
```

If the local Supabase CLI cannot authenticate, run:

```bash
supabase link --project-ref ouqwbbermlzqqvtqwlul
supabase db push --dry-run
```

- [ ] **Step 3: Commit da migration**

Run:

```bash
git add supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql
git commit -m "feat(jornada): cria camada canonica por matricula disciplina"
```

---

## Task 2: Helper compartilhado de jornada canonica

**Files:**
- Create: `supabase/functions/_shared/jornada-canonica.ts`

- [ ] **Step 1: Criar helper com normalizacao, resolvers e upsert**

Create this file:

```ts
type SupabaseClientLike = {
  from: (table: string) => any;
};

export interface JornadaDisciplinaInput {
  matriculaDisciplinaId: number | null;
  disciplinaId: number | null;
  nome: string | null;
  nomeProfessor: string | null;
  professorEmusysId: number | null;
  nrAulasContratadas: number | null;
  nrAulasPassadas: number | null;
  nrAulasFuturas: number | null;
  dataHoraPrimeiraAula: string | null;
  dataHoraUltimaAula: string | null;
  diaSemana: string | null;
  horario: string | null;
  raw: any;
}

export interface JornadaMatriculaInput {
  unidadeId: string;
  fonte: string;
  statusMatricula: string | null;
  emusysAlunoId: number | null;
  emusysMatriculaId: number | null;
  nomeAluno: string | null;
  dataNascimentoAluno: string | null;
  qtdContratos: number | null;
  disciplinas: JornadaDisciplinaInput[];
  raw: any;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function statusCanonico(status: string | null): string {
  const normalized = String(status || '').toLowerCase();
  if (['ativa', 'ativo', 'matriculada', 'em andamento'].includes(normalized)) return 'ativa';
  if (['trancada', 'trancado'].includes(normalized)) return 'trancada';
  if (['finalizada', 'finalizado', 'evadida', 'evadido', 'inativa', 'inativo'].includes(normalized)) return 'finalizada';
  return 'desconhecido';
}

function parseDateTime(value: string | null): string | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calcularProximaAula(passadas: number | null, futuras: number | null): number | null {
  if (passadas == null) return null;
  if ((futuras ?? 0) <= 0) return null;
  return passadas + 1;
}

function calcularPercentual(passadas: number | null, contratadas: number | null): number | null {
  if (passadas == null || contratadas == null || contratadas <= 0) return null;
  return Math.round((passadas / contratadas) * 10000) / 100;
}

function primeiraAgenda(disciplina: any): { diaSemana: string | null; horario: string | null } {
  const agendamento = Array.isArray(disciplina?.agendamentos) ? disciplina.agendamentos[0] : null;
  return {
    diaSemana: textOrNull(agendamento?.dia_da_semana_nome ?? agendamento?.dia_da_semana),
    horario: textOrNull(agendamento?.horario),
  };
}

function extractDisciplinaWebhook(disciplina: any): JornadaDisciplinaInput {
  const agenda = primeiraAgenda(disciplina);
  return {
    matriculaDisciplinaId: numberOrNull(disciplina?.matricula_disciplina_id ?? disciplina?.id),
    disciplinaId: numberOrNull(disciplina?.disciplina_id),
    nome: textOrNull(disciplina?.nome),
    nomeProfessor: textOrNull(disciplina?.nome_professor),
    professorEmusysId: numberOrNull(disciplina?.id_professor),
    nrAulasContratadas: numberOrNull(disciplina?.nr_aulas_contratadas),
    nrAulasPassadas: numberOrNull(disciplina?.nr_aulas_passadas),
    nrAulasFuturas: numberOrNull(disciplina?.nr_aulas_futuras),
    dataHoraPrimeiraAula: textOrNull(disciplina?.data_hora_primeira_aula),
    dataHoraUltimaAula: textOrNull(disciplina?.data_hora_ultima_aula),
    diaSemana: agenda.diaSemana,
    horario: agenda.horario,
    raw: disciplina,
  };
}

function extractDisciplinaMatriculasApi(disciplina: any): JornadaDisciplinaInput {
  const agenda = primeiraAgenda(disciplina);
  return {
    matriculaDisciplinaId: numberOrNull(disciplina?.matricula_disciplina_id ?? disciplina?.id),
    disciplinaId: numberOrNull(disciplina?.disciplina_id),
    nome: textOrNull(disciplina?.nome),
    nomeProfessor: textOrNull(disciplina?.nome_professor),
    professorEmusysId: numberOrNull(disciplina?.id_professor),
    nrAulasContratadas: numberOrNull(disciplina?.nr_aulas_contratadas),
    nrAulasPassadas: numberOrNull(disciplina?.nr_aulas_passadas),
    nrAulasFuturas: numberOrNull(disciplina?.nr_aulas_futuras),
    dataHoraPrimeiraAula: textOrNull(disciplina?.data_hora_primeira_aula),
    dataHoraUltimaAula: textOrNull(disciplina?.data_hora_ultima_aula),
    diaSemana: agenda.diaSemana,
    horario: agenda.horario,
    raw: disciplina,
  };
}

export function buildJornadaInputFromWebhook(body: any, unidadeId: string, fonte = 'webhook'): JornadaMatriculaInput | null {
  const matricula = body?.matricula;
  if (!matricula) return null;
  const disciplinasRaw = Array.isArray(matricula.disciplinas) ? matricula.disciplinas : [];
  return {
    unidadeId,
    fonte,
    statusMatricula: textOrNull(matricula.status ?? body?.evento),
    emusysAlunoId: numberOrNull(matricula.aluno_id ?? matricula.id_aluno),
    emusysMatriculaId: numberOrNull(matricula.matricula_id ?? matricula.id),
    nomeAluno: textOrNull(matricula.nome_aluno),
    dataNascimentoAluno: textOrNull(matricula.data_nascimento_aluno),
    qtdContratos: numberOrNull(matricula.qtd_contratos),
    disciplinas: disciplinasRaw.map(extractDisciplinaWebhook).filter(d => d.matriculaDisciplinaId != null),
    raw: body,
  };
}

export function buildJornadaInputFromMatriculaApi(mat: any, unidadeId: string, fonte = 'sync-matriculas-emusys'): JornadaMatriculaInput | null {
  if (!mat) return null;
  const contrato = mat.contrato_atual || {};
  const disciplinasRaw = Array.isArray(contrato.disciplinas) ? contrato.disciplinas : [];
  return {
    unidadeId,
    fonte,
    statusMatricula: textOrNull(mat.status),
    emusysAlunoId: numberOrNull(mat.aluno?.id),
    emusysMatriculaId: numberOrNull(mat.id),
    nomeAluno: textOrNull(mat.aluno?.nome),
    dataNascimentoAluno: textOrNull(mat.aluno?.data_nascimento),
    qtdContratos: numberOrNull(mat.qtd_contratos),
    disciplinas: disciplinasRaw.map(extractDisciplinaMatriculasApi).filter(d => d.matriculaDisciplinaId != null),
    raw: mat,
  };
}

async function resolveAlunoId(supabase: SupabaseClientLike, input: JornadaMatriculaInput): Promise<number | null> {
  if (input.emusysMatriculaId != null) {
    const { data } = await supabase
      .from('alunos')
      .select('id')
      .eq('unidade_id', input.unidadeId)
      .eq('emusys_matricula_id', String(input.emusysMatriculaId))
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (input.emusysAlunoId != null) {
    const { data } = await supabase
      .from('alunos')
      .select('id')
      .eq('unidade_id', input.unidadeId)
      .eq('emusys_student_id', String(input.emusysAlunoId))
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

async function resolveCursoId(supabase: SupabaseClientLike, unidadeId: string, disciplinaId: number | null): Promise<number | null> {
  if (disciplinaId == null) return null;
  const { data } = await supabase
    .from('curso_emusys_depara')
    .select('curso_id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_disciplina_id', disciplinaId)
    .maybeSingle();
  return data?.curso_id ?? null;
}

async function resolveProfessorId(supabase: SupabaseClientLike, unidadeId: string, professorEmusysId: number | null): Promise<number | null> {
  if (professorEmusysId == null) return null;
  const { data } = await supabase
    .from('professores_unidades')
    .select('professor_id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_id', professorEmusysId)
    .maybeSingle();
  return data?.professor_id ?? null;
}

export async function upsertJornadaMatriculaDisciplina(
  supabase: SupabaseClientLike,
  input: JornadaMatriculaInput
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const result = { updated: 0, skipped: 0, errors: [] as string[] };
  if (input.disciplinas.length === 0) return result;

  const alunoId = await resolveAlunoId(supabase, input);
  const rows: any[] = [];

  for (const disciplina of input.disciplinas) {
    if (disciplina.matriculaDisciplinaId == null) {
      result.skipped += 1;
      continue;
    }

    const [cursoId, professorId] = await Promise.all([
      resolveCursoId(supabase, input.unidadeId, disciplina.disciplinaId),
      resolveProfessorId(supabase, input.unidadeId, disciplina.professorEmusysId),
    ]);

    rows.push({
      unidade_id: input.unidadeId,
      aluno_id: alunoId,
      emusys_aluno_id: input.emusysAlunoId,
      emusys_matricula_id: input.emusysMatriculaId,
      emusys_matricula_disciplina_id: disciplina.matriculaDisciplinaId,
      emusys_disciplina_id: disciplina.disciplinaId,
      curso_id: cursoId,
      curso_nome_emusys: disciplina.nome,
      professor_id: professorId,
      emusys_professor_id: disciplina.professorEmusysId,
      professor_nome_emusys: disciplina.nomeProfessor,
      status_matricula: statusCanonico(input.statusMatricula),
      qtd_contratos: input.qtdContratos,
      nr_aulas_contratadas: disciplina.nrAulasContratadas,
      nr_aulas_passadas: disciplina.nrAulasPassadas,
      nr_aulas_futuras: disciplina.nrAulasFuturas,
      proxima_aula_numero: calcularProximaAula(disciplina.nrAulasPassadas, disciplina.nrAulasFuturas),
      percentual_jornada: calcularPercentual(disciplina.nrAulasPassadas, disciplina.nrAulasContratadas),
      data_primeira_aula: parseDateTime(disciplina.dataHoraPrimeiraAula),
      data_ultima_aula: parseDateTime(disciplina.dataHoraUltimaAula),
      dia_semana: disciplina.diaSemana,
      horario: disciplina.horario,
      fonte_ultima_atualizacao: input.fonte,
      ultima_sincronizacao_emusys: new Date().toISOString(),
      payload_snapshot: {
        matricula: {
          id: input.emusysMatriculaId,
          aluno_id: input.emusysAlunoId,
          status: input.statusMatricula,
          qtd_contratos: input.qtdContratos,
        },
        disciplina: disciplina.raw,
      },
    });
  }

  if (rows.length === 0) return result;

  const { error } = await supabase
    .from('aluno_jornada_matricula_disciplina')
    .upsert(rows, { onConflict: 'unidade_id,emusys_matricula_disciplina_id' });

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  result.updated = rows.length;
  return result;
}
```

- [ ] **Step 2: Rodar checagem TypeScript via build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 3: Commit do helper**

Run:

```bash
git add supabase/functions/_shared/jornada-canonica.ts
git commit -m "feat(jornada): adiciona helper canonico Emusys"
```

---

## Task 3: Integrar `processar-matricula-emusys`

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`

- [ ] **Step 1: Importar helper compartilhado**

At the top with the other imports, add:

```ts
import {
  buildJornadaInputFromWebhook,
  upsertJornadaMatriculaDisciplina,
} from '../_shared/jornada-canonica.ts';
```

- [ ] **Step 2: Criar wrapper seguro para upsert da jornada**

Add this function near the helper/resolver section:

```ts
async function sincronizarJornadaCanonicaWebhook(supabase: any, p: Payload): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const input = buildJornadaInputFromWebhook(p.rawPayload, p.unidadeId, `webhook:${p.evento}`);
  if (!input) return { updated: 0, skipped: 0, errors: ['payload_sem_matricula'] };
  const result = await upsertJornadaMatriculaDisciplina(supabase, input);
  if (result.errors.length > 0) {
    console.error(`[${VERSAO}] jornada canonica falhou`, result.errors);
  }
  return result;
}
```

- [ ] **Step 3: Adicionar handler para `matricula_alterada`**

Add this function near the existing handlers:

```ts
async function handleMatriculaAlterada(supabase: any, p: Payload) {
  const jornada = await sincronizarJornadaCanonicaWebhook(supabase, p);
  const result = {
    action: 'jornada_matricula_alterada_atualizada',
    jornada,
    emusys_matricula_id: p.matriculaIdEmusys,
  };

  await gravarLog(supabase, {
    evento: p.evento,
    acao: result.action,
    aluno_nome: p.nomeAluno || '(desconhecido)',
    unidade_nome: p.unidadeNome ?? undefined,
    payload_bruto: p.rawPayload,
    idempotency_key: null,
    invariantes: [],
    detalhes: { ...result, version: VERSAO },
    workflow_id: 'processar-matricula-emusys',
    execution_id: new Date().toISOString(),
  });

  return result;
}
```

- [ ] **Step 4: Chamar o upsert de jornada nos handlers existentes**

For each of these handlers, right before their `return result`, add:

```ts
const jornada = await sincronizarJornadaCanonicaWebhook(supabase, p);
result.jornada = jornada;
```

Apply to:

- `handleMatriculaNova`
- `handleRenovacao`
- `handleTrancamento`
- `handleEvasao`

- [ ] **Step 5: Adicionar case no switch**

In the `switch (p.evento)` block, add:

```ts
case 'matricula_alterada':
  result = await handleMatriculaAlterada(supabase, p);
  break;
```

- [ ] **Step 6: Rodar build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 7: Deploy da Edge Function**

Run:

```bash
supabase functions deploy processar-matricula-emusys --project-ref ouqwbbermlzqqvtqwlul
```

Expected:

```text
Deployed Functions on project ouqwbbermlzqqvtqwlul: processar-matricula-emusys
```

- [ ] **Step 8: Commit**

Run:

```bash
git add supabase/functions/processar-matricula-emusys/index.ts
git commit -m "feat(jornada): processa alteracoes de matricula Emusys"
```

---

## Task 4: Integrar `sync-matriculas-emusys`

**Files:**
- Modify: `supabase/functions/sync-matriculas-emusys/index.ts`

- [ ] **Step 1: Importar helper**

At the top with imports, add:

```ts
import {
  buildJornadaInputFromMatriculaApi,
  upsertJornadaMatriculaDisciplina,
} from '../_shared/jornada-canonica.ts';
```

- [ ] **Step 2: Adicionar contador ao resumo**

Change the `resumo` initialization to include:

```ts
const resumo: any = { modo: 'sugestao', unidade: u.nome, auto: 0, fila: {}, atributos: {}, jornadas: { atualizadas: 0, puladas: 0, erros: 0 }, erros: 0 };
```

- [ ] **Step 3: Upsertar jornadas logo apos buscar `/matriculas`**

After:

```ts
const { porId, ativasPorNome } = await fetchTodasMatriculas(u.token);
```

Add:

```ts
for (const mat of porId.values()) {
  const input = buildJornadaInputFromMatriculaApi(mat, u.id, 'sync-matriculas-emusys');
  if (!input) continue;
  const jornada = await upsertJornadaMatriculaDisciplina(supabase, input);
  resumo.jornadas.atualizadas += jornada.updated;
  resumo.jornadas.puladas += jornada.skipped;
  resumo.jornadas.erros += jornada.errors.length;
}
```

- [ ] **Step 4: Rodar build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 5: Deploy da Edge Function**

Run:

```bash
supabase functions deploy sync-matriculas-emusys --project-ref ouqwbbermlzqqvtqwlul
```

Expected:

```text
Deployed Functions on project ouqwbbermlzqqvtqwlul: sync-matriculas-emusys
```

- [ ] **Step 6: Smoke por unidade sem aplicar regras destrutivas**

Run one unit at a time:

```powershell
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=recreio" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=barra" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=cg" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
```

Expected in each JSON response:

```json
{
  "jornadas": {
    "erros": 0
  }
}
```

- [ ] **Step 7: Commit**

Run:

```bash
git add supabase/functions/sync-matriculas-emusys/index.ts
git commit -m "feat(jornada): sincroniza jornadas no sync de matriculas"
```

---

## Task 5: Persistir contrato da aula em `sync-presenca-emusys`

**Files:**
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`

- [ ] **Step 1: Persistir campos novos em `aulas_emusys`**

In the `.upsert({ ... })` into `aulas_emusys`, after `nr_da_aula: aula.nr_da_aula,` add:

```ts
matricula_disciplina_id: aula.matricula_disciplina_id,
qtd_aulas_contrato: aula.qtd_aulas_contrato,
```

- [ ] **Step 2: Rodar build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 3: Deploy**

Run:

```bash
supabase functions deploy sync-presenca-emusys --project-ref ouqwbbermlzqqvtqwlul
```

Expected:

```text
Deployed Functions on project ouqwbbermlzqqvtqwlul: sync-presenca-emusys
```

- [ ] **Step 4: Commit**

Run:

```bash
git add supabase/functions/sync-presenca-emusys/index.ts
git commit -m "feat(jornada): salva contrato da aula Emusys"
```

---

## Task 6: Hooks de leitura para UI e LA Teacher

**Files:**
- Create: `src/hooks/useJornadaAluno.ts`
- Create: `src/hooks/useJornadaProfessor.ts`

- [ ] **Step 1: Criar hook `useJornadaAluno`**

Create `src/hooks/useJornadaAluno.ts`:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface JornadaAlunoItem {
  id: string;
  aluno_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  status_matricula: string;
  nr_aulas_contratadas: number | null;
  nr_aulas_passadas: number | null;
  nr_aulas_futuras: number | null;
  proxima_aula_numero: number | null;
  percentual_jornada: number | null;
  jornada_label: string | null;
  presencas: number | null;
  faltas: number | null;
  percentual_presenca_contrato: number | null;
  data_primeira_aula: string | null;
  data_ultima_aula: string | null;
  dia_semana: string | null;
  horario: string | null;
}

export function useJornadaAluno(alunoId?: number | null) {
  const [data, setData] = useState<JornadaAlunoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!alunoId) {
        setData([]);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: rows, error: rpcError } = await supabase.rpc('get_jornada_aluno', {
        p_aluno_id: alunoId,
      });

      if (!alive) return;

      if (rpcError) {
        setError(rpcError.message);
        setData([]);
      } else {
        setData((rows || []) as JornadaAlunoItem[]);
      }

      setLoading(false);
    }

    load();
    return () => { alive = false; };
  }, [alunoId]);

  return { data, loading, error };
}
```

- [ ] **Step 2: Criar hook `useJornadaProfessor`**

Create `src/hooks/useJornadaProfessor.ts`:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { JornadaAlunoItem } from './useJornadaAluno';

export function useJornadaProfessor(professorId?: number | null) {
  const [data, setData] = useState<JornadaAlunoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!professorId) {
        setData([]);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: rows, error: rpcError } = await supabase.rpc('get_jornada_professor', {
        p_professor_id: professorId,
      });

      if (!alive) return;

      if (rpcError) {
        setError(rpcError.message);
        setData([]);
      } else {
        setData((rows || []) as JornadaAlunoItem[]);
      }

      setLoading(false);
    }

    load();
    return () => { alive = false; };
  }, [professorId]);

  return { data, loading, error };
}
```

- [ ] **Step 3: Rodar build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 4: Commit**

Run:

```bash
git add src/hooks/useJornadaAluno.ts src/hooks/useJornadaProfessor.ts
git commit -m "feat(jornada): adiciona hooks de leitura canonica"
```

---

## Task 7: Exibir jornada canonica na ficha de Sucesso do Aluno

**Files:**
- Modify: `src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx`

- [ ] **Step 1: Importar hook**

Add:

```ts
import { useJornadaAluno } from '@/hooks/useJornadaAluno';
```

- [ ] **Step 2: Carregar jornada no componente**

Inside the modal component, after the aluno data is available, add:

```ts
const { data: jornadas, loading: loadingJornadas } = useJornadaAluno(aluno?.id);
```

- [ ] **Step 3: Renderizar bloco compacto**

Add a section near the current journey/health information:

```tsx
<div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
  <h3 className="text-sm font-semibold text-white mb-3">Posicao no contrato</h3>
  {loadingJornadas ? (
    <p className="text-sm text-slate-400">Carregando jornada...</p>
  ) : jornadas.length === 0 ? (
    <p className="text-sm text-slate-400">Sem jornada canonica vinculada ainda.</p>
  ) : (
    <div className="space-y-2">
      {jornadas.map(jornada => (
        <div key={jornada.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-800/70 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-white">{jornada.curso_nome || 'Curso nao informado'}</p>
            <p className="text-xs text-slate-400">{jornada.professor_nome || 'Professor nao vinculado'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-cyan-300">{jornada.jornada_label || 'Sem contador'}</p>
            <p className="text-xs text-slate-400">
              {jornada.nr_aulas_passadas ?? 0} realizadas de {jornada.nr_aulas_contratadas ?? 0}
            </p>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 4: Rodar build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx
git commit -m "feat(jornada): mostra posicao canonica na ficha do aluno"
```

---

## Task 8: Backfill e validacao real

**Files:**
- No source file changes expected.

- [ ] **Step 1: Aplicar migration no remoto**

Run:

```bash
supabase db push --project-ref ouqwbbermlzqqvtqwlul
```

Expected:

```text
Finished supabase db push
```

- [ ] **Step 2: Rodar sync de matriculas nas tres unidades**

Run:

```powershell
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=recreio" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=barra" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
curl.exe -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-matriculas-emusys?u=cg" -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" -H "Content-Type: application/json"
```

Expected:

```json
{
  "jornadas": {
    "erros": 0
  }
}
```

- [ ] **Step 3: Conferir contagem por unidade**

Run in SQL editor or via `psql`:

```sql
select
  u.nome,
  count(*) as jornadas,
  count(*) filter (where status_matricula = 'ativa') as ativas,
  count(*) filter (where aluno_id is null) as sem_aluno_local,
  count(*) filter (where professor_id is null) as sem_professor_local,
  count(*) filter (where curso_id is null) as sem_curso_local
from public.aluno_jornada_matricula_disciplina j
join public.unidades u on u.id = j.unidade_id
group by u.nome
order by u.nome;
```

Expected:

```text
sem_aluno_local should be explainable by orphan/conciliacao cases
sem_professor_local and sem_curso_local should expose de-para gaps, not break sync
```

- [ ] **Step 4: Conferir aluno com duas disciplinas**

Run:

```sql
select aluno_nome, curso_nome, jornada_label, nr_aulas_passadas, nr_aulas_contratadas
from public.vw_jornada_aluno_atual
where aluno_id in (
  select aluno_id
  from public.vw_jornada_aluno_atual
  where aluno_id is not null
  group by aluno_id
  having count(*) > 1
)
order by aluno_nome, curso_nome
limit 20;
```

Expected:

```text
Same student can appear more than once, one row per course/discipline
```

- [ ] **Step 5: Commit validation note if a small doc is added**

If evidence is documented, create `docs/jornada-canonica-validacao-2026-07-08.md` and commit:

```bash
git add docs/jornada-canonica-validacao-2026-07-08.md
git commit -m "docs(jornada): registra validacao do backfill"
```

---

## Task 9: Final verification and push

**Files:**
- All files changed by previous tasks.

- [ ] **Step 1: Run build**

Run:

```bash
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 2: Check git state**

Run:

```bash
git status -sb
git log --oneline --max-count=10
```

Expected:

```text
working tree clean
local branch ahead of origin/main by implementation commits
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin main
```

Expected:

```text
main -> main
```

- [ ] **Step 4: User-facing summary**

Report:

```text
Camada canonica de jornada criada.
Webhook e sync alimentam uma linha por matricula/disciplina.
Presenca/falta entram como leitura enriquecida.
matricula_alterada passou a ser tratada.
Build passou.
Backfill executado nas tres unidades.
```

---

## Self-Review Notes

- Spec coverage:
  - Tabela canonica: Task 1.
  - Upsert central: Task 2.
  - `processar-matricula-emusys`: Task 3.
  - `matricula_alterada`: Task 3.
  - `sync-matriculas-emusys`: Task 4.
  - Presenca/falta como enriquecimento: Tasks 1 and 5.
  - Views/RPCs aluno/professor/marcos: Task 1.
  - UI inicial: Tasks 6 and 7.
  - Backfill e validacao: Task 8.
- The plan keeps `marcos-jornada` running while `vw_jornada_marcos` is validated.
- The plan does not alter financial, retention, ticket, MRR or report rules.
