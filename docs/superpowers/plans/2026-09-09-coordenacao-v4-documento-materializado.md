# Coordenação V4: Documento Materializado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar, sem cortar consumidores, um documento V4 versionado e rápido para cada unidade/consolidado, competência e periodicidade da Coordenação.

**Architecture:** O conteúdo ainda nasce do contrato V3 somente durante a materialização, nunca durante o clique. A tabela de fechamentos existente guarda mensal e ciclo em domínios separados; o leitor público apenas autoriza o escopo, localiza a última versão V4 e valida seu hash.

**Tech Stack:** PostgreSQL 17, Supabase CLI/MCP, pgcrypto, Node test runner e Docker.

---

## Arquivos e responsabilidades

- Create: `tests/relatorioCoordenacaoDocumentoV4.test.mjs` — contrato estático, ACL, domínios e ausência de recomposição no leitor.
- Create: `tests/relatorioCoordenacaoDocumentoV4Postgres.test.mjs` — fixture PostgreSQL real para versão, hash, idempotência, concorrência e leitura.
- Modify: `supabase/migrations/20260909031109_relatorio_coordenacao_documento_v4.sql` — infraestrutura aditiva, produtor em sombra, materializador e leitor V4.
- Create: `docs/auditorias/2026-09-09-relatorio-coordenacao-v4-shadow.md` — resultados da carga em sombra e tempos de leitura.

### Task 1: Fixar o contrato em testes vermelhos

**Files:**

- Create: `tests/relatorioCoordenacaoDocumentoV4.test.mjs`
- Create: `tests/relatorioCoordenacaoDocumentoV4Postgres.test.mjs`

- [ ] **Step 1: Escrever o teste estático da migration**

```js
const sql = readFileSync(migrationPath, 'utf8');
assert.match(sql, /'relatorio_coordenacao_ciclo'/);
assert.match(sql, /schema_version[^\n]+4/i);
assert.match(sql, /pg_advisory_xact_lock/i);
assert.match(sql, /hash_jsonb_canonico\s*\(v_conteudo\)/i);
assert.match(sql, /revoke all on function public\.montar_relatorio_coordenacao_conteudo_v4/i);
assert.doesNotMatch(readerBody, /montar_relatorio_coordenacao_payload_v3/i);
assert.doesNotMatch(readerBody, /get_kpis_professor_periodo/i);
```

- [ ] **Step 2: Escrever a fixture de idempotência e versionamento**

```sql
select public.materializar_relatorio_coordenacao_documento_v4(
  '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', null
);
select public.materializar_relatorio_coordenacao_documento_v4(
  '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', null
);
-- Esperado: uma versão, pois o conteúdo não mudou.
update fixture_v3 set valor = 2;
select public.materializar_relatorio_coordenacao_documento_v4(
  '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', null
);
-- Esperado: duas versões; a segunda referencia a primeira em documento.supersede_id.
```

- [ ] **Step 3: Escrever os casos de ciclo, consolidado e ACL**

```sql
set local role authenticated;
select public.get_relatorio_coordenacao_documento_v4(
  '10000000-0000-0000-0000-000000000001', 2026, 9, 'ciclo'
);
-- Esperado com permissão: schema_version=4 e periodicidade=ciclo.
-- Esperado sem professores.ver: SQLSTATE 42501.

set local role anon;
select public.get_relatorio_coordenacao_documento_v4(null, 2026, 9, 'ciclo');
-- Esperado: permission denied.
```

- [ ] **Step 4: Rodar os testes e confirmar a falha correta**

Run:

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoDocumentoV4.test.mjs tests/relatorioCoordenacaoDocumentoV4Postgres.test.mjs
```

Expected: FAIL porque as quatro funções V4 e o domínio de ciclo ainda não existem.

### Task 2: Implementar armazenamento e leitura em sombra

**Files:**

- Modify: `supabase/migrations/20260909031109_relatorio_coordenacao_documento_v4.sql`

- [ ] **Step 1: Ampliar o domínio e criar o índice de leitura**

```sql
alter table public.fechamento_mensal_snapshots
  drop constraint if exists fechamento_mensal_snapshots_dominio_check;

alter table public.fechamento_mensal_snapshots
  add constraint fechamento_mensal_snapshots_dominio_check check (
    dominio = any (array[
      'alunos_admin', 'alunos_executivo', 'comercial', 'retencao',
      'renovacoes', 'professores', 'relatorio_admin',
      'relatorio_admin_mensal', 'relatorio_comercial_mensal',
      'relatorio_gerencial', 'relatorio_coordenacao',
      'relatorio_coordenacao_ciclo', 'metas', 'programa_matriculador',
      'programa_fideliza', 'compatibilidade_dados_mensais'
    ]::text[])
  );

create index if not exists idx_fechamento_coordenacao_v4_lookup
  on public.fechamento_mensal_snapshots
    (ano, mes, dominio, escopo, unidade_id, versao desc)
  where dominio in ('relatorio_coordenacao', 'relatorio_coordenacao_ciclo')
    and status in ('preview', 'aprovado', 'fechado', 'retificado')
    and payload @> '{"schema_version":4}'::jsonb;
```

- [ ] **Step 2: Criar o produtor privado de conteúdo**

```sql
create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
begin
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA' using errcode = '22023';
  end if;
  v_base := public.get_relatorio_coordenacao_canonico_v3(
    p_unidade_id, p_ano, p_mes, p_periodicidade
  );
  if v_base is null or jsonb_typeof(v_base->'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO' using errcode = '22023';
  end if;
  return jsonb_set(v_base, '{schema_version}', '4'::jsonb, true);
end;
$function$;
```

Revogar `PUBLIC`, `anon` e `authenticated`; conceder execução somente a `service_role`.

- [ ] **Step 3: Criar o materializador append-only e idempotente**

```sql
create or replace function public.materializar_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_status text default 'preview',
  p_observacao text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
```

Validar mês/status, adquirir `pg_advisory_xact_lock(hashtextextended(chave, 0))`, produzir conteúdo, calcular `hash_jsonb_canonico(v_conteudo)`, retornar a versão existente se o hash não mudou e, caso mude, inserir a próxima versão. O payload final deve acrescentar:

```sql
jsonb_build_object('documento', jsonb_build_object(
  'id', v_id,
  'versao', v_versao,
  'hash', v_hash,
  'status', p_status,
  'gerado_em', v_agora,
  'supersede_id', v_anterior_id
))
```

O `payload_hash` da tabela deve ser o hash do conteúdo sem `documento`, para que metadados de gravação não destruam a idempotência.

- [ ] **Step 4: Criar o leitor V4 sem recomposição**

```sql
create or replace function public.get_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
```

O leitor chama `fn_health_score_professor_v3_ator_leitura`, seleciona a maior versão V4 do domínio correspondente e valida:

```sql
if v_snapshot.payload_hash is distinct from
   public.hash_jsonb_canonico(v_snapshot.payload - 'documento') then
  raise exception 'RELATORIO_COORDENACAO_V4_HASH_INVALIDO' using errcode = '22000';
end if;
```

Ele não chama produtor, KPI ou tabela operacional. Revogar todos e conceder somente `authenticated` e `service_role`.

- [ ] **Step 5: Rodar os testes V4 em verde**

Run:

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoDocumentoV4.test.mjs tests/relatorioCoordenacaoDocumentoV4Postgres.test.mjs
```

Expected: PASS; recaptura idêntica mantém uma versão, conteúdo alterado cria nova versão e leitor não executa o produtor.

- [ ] **Step 6: Commit da fundação**

```powershell
git add tests/relatorioCoordenacaoDocumentoV4*.mjs supabase/migrations/20260909031109_relatorio_coordenacao_documento_v4.sql
git commit -m "feat(professores): materializa documento v4 da coordenacao"
```

### Task 3: Validar sombra local e remotamente

**Files:**

- Create: `docs/auditorias/2026-09-09-relatorio-coordenacao-v4-shadow.md`

- [ ] **Step 1: Rodar regressões locais relacionadas**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoDocumentoV4*.test.mjs tests/relatorioCoordenacaoSnapshotCanonico*.test.mjs tests/relatoriosCoordenacaoPeriodicidadeV3*.test.mjs
git diff --check
```

Expected: PASS e nenhuma alteração de consumidor.

- [ ] **Step 2: Aplicar somente a migration aditiva**

Conferir `supabase migration list --local`, ledger remoto e advisors. Aplicar `relatorio_coordenacao_documento_v4`; não aplicar ainda as migrations de fontes e cutover.

- [ ] **Step 3: Materializar amostra em sombra**

Executar como `service_role` os quatro escopos de Set–Nov/2026 e uma amostra Jun–Ago/2026. Medir o leitor V4 com `explain (analyze, buffers, format json)` e confirmar que o plano usa `idx_fechamento_coordenacao_v4_lookup`.

- [ ] **Step 4: Registrar evidência sem dados pessoais**

Documentar quantidade de professores, hash, versão, tempo de produção, tempo de leitura e comparação de totais V3×V4. Não registrar nomes de alunos.

- [ ] **Step 5: Commit da auditoria de sombra**

```powershell
git add docs/auditorias/2026-09-09-relatorio-coordenacao-v4-shadow.md
git commit -m "docs(professores): registra sombra do documento v4"
```

## Revisão do plano

- O primeiro corte é apenas aditivo e não altera painel, Edge Functions ou relatórios atuais.
- O leitor V4 não recompõe dados e não pode estourar timeout por abrir a cadeia operacional.
- Hash, versão, supersessão, ACL, RLS existente, ciclo/consolidado e idempotência têm testes PostgreSQL reais.
- Nenhum valor de negócio é corrigido nesta etapa; isso pertence ao plano de fontes.
