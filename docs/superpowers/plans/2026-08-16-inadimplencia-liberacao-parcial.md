# Inadimplência Canônica com Liberação Parcial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o contrato canônico v3 de inadimplência, liberando para cobrança apenas faturas confirmadas em snapshots frescos, mantendo `source_missing` em quarentena e fazendo LA Report, exportação e Sol consumirem exatamente a mesma verdade.

**Architecture:** A RPC `public.get_inadimplencia_canonica(uuid,date)` continua sendo a única leitura financeira operacional. Ela seleciona o último snapshot completo e fresco de cada competência relevante, cruza a fatura pela identidade exata `unidade_id + emusys_matricula_id` com o estado operacional do aluno, classifica cada `canonical_fatura_id` como confirmado ou em quarentena e publica o gate explícito em `operational`. O cliente TypeScript, a exportação e `sol_caixa_inadimplentes` obedecem `collection_allowed` e `fresh_until`; nenhum consumidor reimplementa status, juros ou reconciliação.

**Tech Stack:** PostgreSQL 17/Supabase migrations e RPCs, Supabase Edge Functions em Deno/TypeScript, React 19 + TypeScript + Vite, testes `node:test`, Deno test, fixture PostgreSQL descartável em Docker, Supabase CLI e Vercel CLI.

---

## Regras de execução

- Trabalhar somente em `D:\2026\LA-performance-report\.worktrees\inadimplencia-liberacao-parcial`, branch `fix/inadimplencia-liberacao-parcial`.
- Não alterar migrations já aplicadas. Criar migrations aditivas com `supabase migration new`, conferir o nome gerado e só então renomear para um timestamp livre se necessário.
- Antes de criar migrations, executar `git fetch origin`, comparar `origin/main` e interromper para replanejar timestamps se já existir migration com timestamp igual ou posterior a `20260816184837`.
- Não usar `supabase db push --include-all` nem qualquer atalho para contornar drift.
- Não alterar `verify_jwt=false` de `export-contas-receber`; a função já possui autenticação própria.
- Não tocar em `sol_caixa_lancar_recebimento`, `sol_caixa_abrir`, `sol_caixa_fechar` ou `sol_caixa_casar_parcela`.
- Não enviar mensagens automáticas pela Sol durante implementação ou validação.
- A página “Faturas de Alunos” A+C é um subprojeto posterior e não entra neste diff.
- Cada tarefa segue RED → GREEN → REFACTOR e termina em commit pequeno, salvo quando o passo declara explicitamente que depende do próximo.

## Contrato de referência

Campos de servidor em `snake_case` e correspondentes do cliente em `camelCase`:

| Servidor | Cliente | Regra |
|---|---|---|
| `schema_version` | `schemaVersion` | `3` para o novo contrato |
| `status` | `status` | `ok`, `partial`, `stale`, `incomplete` |
| `operational.collection_allowed` | `collectionAllowed` | único gate de cobrança, ainda sujeito ao relógio |
| `operational.collection_scope` | `collectionScope` | `confirmed_only` ou `blocked` |
| `operational.block_reasons` | `blockReasons` | motivos enumerados e estáveis |
| `freshness.fresh_until` | `freshUntil` | expiração local obrigatória |
| `reconciliation.source_missing_count` | `sourceMissingCount` | IDs canônicos em quarentena |
| `reconciliation.source_missing_open_count` | `sourceMissingOpenCount` | contexto anterior `aberta`, nunca dívida confirmada |
| `reconciliation.source_missing_other_count` | `sourceMissingOtherCount` | demais contextos anteriores, nunca dívida confirmada |

Precedência do estado: `stale` → `incomplete` → `partial` → `ok`. Em `stale` e `incomplete`, `items=[]`, totais zerados, `collection_allowed=false`. Em `partial`, `items` e totais contêm apenas confirmados, `collection_allowed=true`, `collection_scope='confirmed_only'`, e `source_missing` aparece apenas em `reconciliation`.

## Task 1: Estabilizar a prova de drift no Windows

**Files:**

- Modify: `tests/inadimplenciaMigrationDrift.test.mjs`
- Test: `tests/inadimplenciaMigrationDrift.test.mjs`

- [ ] **Step 1: Reproduzir a falha de baseline**

Run:

```powershell
node --test tests/inadimplenciaMigrationDrift.test.mjs
```

Expected: falha de hash para migration cujo conteúdo lógico é igual ao ledger, mas cujos bytes locais foram convertidos para CRLF pela worktree do Windows.

- [ ] **Step 2: Normalizar somente a fronteira de comparação do teste**

Substituir a construção dos bytes locais por:

```js
const normalizedLocalBytes = Buffer.from(
  fs.readFileSync(migration, 'utf8').replace(/\r\n/g, '\n'),
);
const remoteStatementBytes = Buffer.concat([
  normalizedLocalBytes,
  Buffer.from('\r\n'),
]);
```

Não editar nenhuma migration existente e não mudar os hashes esperados do ledger.

- [ ] **Step 3: Confirmar que a prova volta a passar**

Run:

```powershell
node --test tests/inadimplenciaMigrationDrift.test.mjs
git diff --check
```

Expected: teste verde e nenhum whitespace error.

- [ ] **Step 4: Commit isolado**

```powershell
git add tests/inadimplenciaMigrationDrift.test.mjs
git commit -m "test(financeiro): normalizar EOL na prova de migrations"
```

## Task 2: Especificar o contrato v3 em testes antes do SQL

**Files:**

- Modify: `tests/inadimplenciaCanonicaContract.test.mjs`
- Modify: `tests/inadimplenciaCanonicaPostgres.test.mjs`
- Modify: `tests/inadimplenciaConsumidoresCanonicos.test.mjs`
- Create later: `supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql`

- [ ] **Step 1: Fazer o teste de contrato apontar para a migration v3 ainda ausente**

No resolvedor da migration efetiva, exigir que a última migration canônica seja `20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql`. Adicionar assertions para:

```js
assert.match(source, /'schema_version',\s*3/i);
assert.match(source, /'partial'/i);
assert.match(source, /'collection_allowed'/i);
assert.match(source, /'collection_scope'/i);
assert.match(source, /'block_reasons'/i);
assert.match(source, /vw_alunos_estado_operacional_v131/i);
assert.match(source, /entra_financeiro_ativo\s+is\s+true/i);
assert.match(source, /eh_trancamento_atual\s+is\s+true/i);
assert.match(source, /source_missing_open_count/i);
assert.match(source, /source_missing_other_count/i);
assert.match(source, /duplicate_confirmed_fatura/i);
assert.match(source, /invalid_invoice_identity/i);
```

Também exigir que o SQL não autorize cobrança por nome ou apenas por `emusys_student_id`.

Substituir as assertions legadas que tratam `canonical_fatura_id` como chave global por assertions que exigem a chave escopada:

```js
assert.match(source, /partition\s+by\s+\w+\.unidade_id\s*,\s*\w+\.canonical_fatura_id/i);
assert.doesNotMatch(source, /partition\s+by\s+\w+\.canonical_fatura_id\s*(?:\)|order)/i);
```

- [ ] **Step 2: Tornar a fixture PostgreSQL fiel ao estado operacional**

Em `fixtureSchema`:

1. adicionar a coluna `updated_at timestamptz` em `alunos`, necessária para a RPC da Sol;
2. adicionar `nome`, `whatsapp` e `telefone` em `alunos`;
3. criar uma tabela mínima `emusys_matriculas_estado_atual` com `unidade_id`,
   `emusys_matricula_id`, `aluno_id`, `status_emusys`, `motivo_inativa`,
   `status_local_resolvido` e `sincronizado_em`;
4. criar uma view mínima `vw_alunos_estado_operacional_v131` com `aluno_id`,
   `unidade_id`, `emusys_matricula_id`, `raw_encontrado`, `status_emusys`,
   `status_operacional`, `entra_financeiro_ativo` e
   `eh_trancamento_atual`;
5. derivar o estado primeiro da linha exata em
   `emusys_matriculas_estado_atual`; usar `alunos.status` somente quando não
   houver estado Emusys.

O teste deve provar que a RPC consulta a view, sem depender do texto legado de `alunos.status`.

- [ ] **Step 3: Adicionar cenário RED de liberação parcial**

No snapshot fresco da unidade A, inserir três IDs distintos:

```text
F1: source_missing=false, status=aberta, matrícula ativa, R$ 100
F2: source_missing=true,  status=aberta, matrícula ativa, R$ 200
F3: source_missing=true,  status=paga,   matrícula ativa, R$ 300
```

Asserções:

```js
assert.equal(result.schema_version, 3);
assert.equal(result.status, 'partial');
assert.equal(result.operational.collection_allowed, true);
assert.equal(result.operational.collection_scope, 'confirmed_only');
assert.deepEqual(result.operational.block_reasons, []);
assert.deepEqual(result.items.map((item) => item.canonical_fatura_id), [F1]);
assert.equal(result.totals.total_faturas, 1);
assert.equal(result.totals.total_original, 100);
assert.equal(result.reconciliation.source_missing_count, 2);
assert.equal(result.reconciliation.source_missing_open_count, 1);
assert.equal(result.reconciliation.source_missing_other_count, 1);
```

Validar em `unknown_invoices` os campos `last_known_status`, `last_known_valor_original`, `source_missing_reason`, `source_missing_detected_at` e `sync_completed_at`.

- [ ] **Step 4: Adicionar cenário RED de isolamento por ID canônico**

Inserir duas linhas com o mesmo `canonical_fatura_id`: uma confirmada e uma `source_missing`. Esperar:

```js
assert.equal(result.status, 'partial');
assert.equal(result.operational.collection_allowed, true);
assert.equal(result.reconciliation.duplicate_fatura_count, 0);
assert.equal(result.reconciliation.source_missing_count, 1);
assert.equal(result.items.some((item) => item.canonical_fatura_id === mixedId), false);
```

O grupo inteiro fica em quarentena; a ocorrência confirmada concorrente não pode entrar em `items`.

- [ ] **Step 5: Separar fórmula de juros do cenário de duplicidade**

Alterar o cenário “formula de juros” para possuir um único item confirmado com 30 dias, `valor_original=100`. Esperar `status='ok'`, `multa_pct=0.02`, `mora_pct_mes=0.01` e `valor_atualizado=103.00`.

Manter outro cenário com duas linhas confirmadas do mesmo ID e exigir:

```js
assert.equal(result.status, 'incomplete');
assert.equal(result.operational.collection_allowed, false);
assert.equal(result.operational.collection_scope, 'blocked');
assert.deepEqual(result.operational.block_reasons, ['duplicate_confirmed_fatura']);
assert.deepEqual(result.items, []);
assert.equal(result.totals.total_faturas, 0);
```

O cenário legado com o mesmo ID em `UNIT_A` e `UNIT_B` deve passar a esperar duas faturas independentes e `duplicate_fatura_count=0`. A duplicidade bloqueante precisa ocorrer dentro da mesma unidade.

- [ ] **Step 6: Endurecer identidade e estado operacional**

Adicionar casos independentes:

- `emusys_matricula_id=null`, mas `emusys_student_id` encontra aluno atual:
  `partial`, motivo `invalid_invoice_identity`, fatura isolada e demais
  confirmados preservados;
- matrícula exata cujo estado Emusys é inativo apesar de `alunos.status='ativo'`: excluída;
- matrícula exata cujo estado Emusys é ativo apesar de `alunos.status='trancado'`: incluída;
- matrícula Emusys `trancada`: incluída no recorte financeiro, sem alterar o
  significado compartilhado de `entra_financeiro_ativo`;
- matrícula Emusys `inativa`, tanto `interrompida` quanto `concluida`: excluída;
- `arquivado_em` preenchido: excluída;
- reingresso com raw Emusys `ativa|trancada` e `data_saida` histórica:
  incluído; sem raw Emusys, `data_saida` preenchida continua excluindo;
- fatura de matrícula anterior/inativa, conhecida exatamente e pertencente à
  mesma pessoa que possui outra matrícula atual `ativa|trancada`: incluída;
- fatura de matrícula anterior quando a pessoa não possui nenhuma matrícula
  atual: excluída como carteira futura de ex-aluno;
- matrícula exata conhecida, mas `emusys_student_id` da fatura divergente do
  dono local: identidade inválida em quarentena, nunca cobrança;
- IDs Emusys iguais em unidades distintas: somente `unidade_id + emusys_matricula_id` associa a fatura;
- aluno com dois cursos para a mesma matrícula: uma única matrícula financeira nos totais.

- [ ] **Step 7: Preservar os gates já existentes**

Atualizar expectativas antigas para que:

- uma competência necessária vencida e stale resulte `stale`, `collection_allowed=false`, itens vazios;
- competência futura stale não bloqueie;
- fatura paga no snapshot mais recente não seja dívida;
- a janela seja exatamente mês corrente + dois meses-calendário anteriores;
- autorização anônima falhe, authenticated veja apenas unidades permitidas e service role possa consultar consolidado.

- [ ] **Step 8: Executar os testes e confirmar RED pelo motivo certo**

```powershell
node --test tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
```

Expected: falhas por migration v3 ausente e semântica `partial` ainda não implementada; a fixture PostgreSQL deve subir, sem erro estrutural alheio aos novos requisitos.

Não fazer commit enquanto os testes estiverem RED; a criação do SQL na Task 3 completa este ciclo TDD.

## Task 3: Implementar `get_inadimplencia_canonica` v3

**Files:**

- Create: `supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql`
- Test: `tests/inadimplenciaCanonicaContract.test.mjs`
- Test: `tests/inadimplenciaCanonicaPostgres.test.mjs`

- [ ] **Step 1: Revalidar branch, origem e ledger antes de criar a migration**

```powershell
git fetch origin
git status --short
git log --oneline --decorate -5
Get-ChildItem -LiteralPath supabase\migrations -Filter '*.sql' |
  Sort-Object Name |
  Select-Object -Last 12 -ExpandProperty Name
supabase migration list --linked
```

Expected: worktree contém somente as mudanças de teste RED; ledger remoto não contém uma migration conflitante. Se `origin/main` avançou em arquivos deste plano ou surgiu timestamp `>= 20260816184837`, parar, integrar/revisar e renumerar as duas migrations novas e as referências dos testes antes de continuar.

- [ ] **Step 2: Criar a migration pela CLI e fixar o nome verificado**

```powershell
supabase migration new inadimplencia_canonica_liberacao_parcial_v3
Get-ChildItem -LiteralPath supabase\migrations -Filter '*_inadimplencia_canonica_liberacao_parcial_v3.sql' |
  Select-Object FullName,Length,LastWriteTime
```

Confirmar que há exatamente um arquivo novo e vazio. Confirmar que o destino `supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql` não existe; então renomear somente esse arquivo para o destino. Nunca substituir um arquivo existente.

- [ ] **Step 3: Preservar assinatura e autorização da RPC**

Copiar a assinatura pública atual sem criar overload:

```sql
create or replace function public.get_inadimplencia_canonica(
  p_unidade_id uuid default null,
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
```

No início, manter a política atual:

- `service_role` pode consultar uma unidade ou consolidado;
- authenticated precisa ser admin ou ter acesso à unidade por `get_user_unidade_ids()`;
- chamada sem unidade só é permitida ao papel já autorizado pelo contrato atual;
- qualquer outro papel recebe exceção de autorização.

- [ ] **Step 4: Selecionar a janela e o último snapshot elegível**

Construir CTEs com responsabilidades separadas:

```text
parametros
janela_competencias             -- date_trunc(mês da data de corte) - 2 months até mês atual
runs_elegiveis                   -- live, succeeded, snapshot_complete=true, unidades_concluidas=3
ultimo_run_por_competencia       -- row_number por competência, completed_at desc
linhas_ultimo_snapshot           -- somente run vencedor e unidade solicitada/autorizada
```

Somente linhas com `competencia` dentro da janela e `data_vencimento < p_as_of_date` participam. Competências futuras e o quarto mês para trás não entram nem contaminam o frescor.

Uma competência é necessária quando o último snapshot contém ao menos uma linha vencida relevante para o universo operacional: `status='aberta'` ou `source_missing=true` ou metadado de identidade inválido associado a candidato ativo. Para cada competência necessária, usar `sync_runs.stale_after`; `fresh_until` é o menor `stale_after` entre elas. Se não houver competência necessária, retornar zero dívida com `status='ok'` e `fresh_until=null`.

- [ ] **Step 5: Separar identidade da fatura do papel atual da pessoa**

Criar `pessoas_financeiramente_atuais` como conjunto distinto por
`unidade_id + emusys_student_id`. O campo compartilhado
`entra_financeiro_ativo` não muda; o papel financeiro atual inclui o
trancamento por regra contratual:

```sql
select distinct
  estado.unidade_id,
  btrim(a.emusys_student_id) as emusys_student_id
from public.vw_alunos_estado_operacional_v131 estado
join public.alunos a on a.id = estado.aluno_id
where (
    estado.entra_financeiro_ativo is true
    or estado.eh_trancamento_atual is true
  )
  and a.arquivado_em is null
  and (
    (estado.raw_encontrado is true
      and estado.status_emusys in ('ativa', 'trancada'))
    or
    (estado.raw_encontrado is not true
      and estado.status_operacional in ('ativo', 'trancado')
      and a.data_saida is null)
  )
```

O estado v1.3.1 atual prevalece sobre `data_saida` legado para não excluir
reingresso. `status_emusys='inativa'` nunca entra. A classificação
`aluno|ex_aluno` de `/crm/aniversariantes` será apenas prova de reconciliação;
não será chamada pela RPC nem criará nova fonte de elegibilidade.

Separadamente, `matriculas_locais_conhecidas` deve manter
`unidade_id + emusys_matricula_id + emusys_student_id`. Uma fatura confirmada
exige simultaneamente:

```text
matrícula da fatura conhecida exatamente na unidade
AND student_id da fatura = dono local da matrícula
AND unidade + student_id pertence a pessoas_financeiramente_atuais
```

Assim, dois cursos não duplicam fatura nem total; uma dívida de matrícula
anterior pode entrar após reingresso, mas `emusys_student_id` nunca substitui o
casamento exato da matrícula e nome nunca entra nessa condição.

Para fatura sem matrícula válida, `emusys_student_id` pode apenas localizar um aluno operacional ativo para produzir uma pendência de identidade auditável; ele nunca coloca a fatura em `items`, nunca autoriza casamento e não derruba os demais confirmados.

- [ ] **Step 6: Classificar por chave escopada à unidade**

Agrupar por:

```sql
group by unidade_id, canonical_fatura_id
```

Produzir por grupo:

```text
tem_source_missing
confirmed_count
tem_identidade_invalida
last_known_status
last_known_valor_original
```

As regras são:

```text
tem_source_missing = true
  => grupo inteiro em unknown_invoices; nunca duplicidade; nunca items

tem_source_missing = false AND confirmed_count > 1
  => duplicate_confirmed_fatura; bloqueio global

tem_identidade_invalida = true
  => invalid_identity_invoices/validation_issues; quarentena isolada; nunca items

confirmed_count = 1 AND identidade válida
  => candidato confirmado
```

Metadado opcional de identidade inválida é isolável porque a fatura conserva `unidade_id + canonical_fatura_id`. Ele produz `partial`, assim como `source_missing`, e não bloqueia os demais confirmados. Somente falha estrutural que impeça identificar a própria fatura ou duplicidade confirmada não isolável bloqueia globalmente.

O mesmo `canonical_fatura_id` em unidades diferentes não é duplicidade; o teste deve exigir particionamento por `unidade_id, canonical_fatura_id`.

Para contagens de `source_missing`, contar grupos, não linhas. Se um grupo tiver qualquer ocorrência cujo `last_known_status='aberta'`, ele entra em `source_missing_open_count`; caso contrário entra em `source_missing_other_count`. A soma das duas contagens deve ser igual a `source_missing_count`.

- [ ] **Step 7: Calcular valor somente nos candidatos confirmados**

Aplicar por fatura, com arredondamento antes da soma:

```sql
dias_atraso := greatest(p_as_of_date - data_vencimento, 0);
valor_atualizado := round(
  valor_original * (
    1::numeric
    + 0.02::numeric
    + 0.01::numeric * dias_atraso::numeric / 30::numeric
  ),
  2
);
```

`valor_original` é o valor cheio da fatura após perda do desconto condicional. Não somar `juros_e_multa` vindo do snapshot e não aceitar taxa de consumidor. O mapper deve preservar `juros_e_multa` e `desconto_aplicado` recebidos do Emusys como evidência; a comparação com o valor dinâmico ao vivo ocorre no gate produtivo.

- [ ] **Step 8: Montar estado, gate e payload atômico**

Calcular os flags globais e a precedência:

```sql
case
  when competencias_stale > 0 then 'stale'
  when duplicate_fatura_count > 0 then 'incomplete'
  when source_missing_count > 0
    or invalid_identity_invoice_count > 0 then 'partial'
  else 'ok'
end
```

Montar `operational`:

```text
ok/partial   => collection_allowed=true,  collection_scope=confirmed_only,
                consumer_must_apply_collection_grace=true
stale/error  => collection_allowed=false, collection_scope=blocked
```

O bloco `policy` também fixa `delinquency_rule=d_plus_0` e `collection_grace_days=2`. `collection_allowed` libera o conjunto confirmado pelo gate; não autoriza contatar cada item antes de aplicar a carência.

`block_reasons` usa somente os valores bloqueantes estáveis e em ordem fixa:

1. `stale_competencia`;
2. `duplicate_confirmed_fatura`.

Em `stale` ou `incomplete`, construir `items` como `[]` e todos os campos de `totals` como zero. Em `ok` ou `partial`, agregar somente candidatos confirmados. Nunca produzir payload `incomplete` com itens acionáveis.

`unknown_invoices` deve conter somente metadados de investigação:

```json
{
  "unidade_id": "uuid",
  "canonical_fatura_id": "uuid",
  "emusys_fatura_id": "texto",
  "emusys_matricula_id": "texto ou null",
  "emusys_student_id": "texto ou null",
  "competencia": "YYYY-MM-01",
  "data_vencimento": "YYYY-MM-DD",
  "last_known_status": "status anterior observado",
  "last_known_valor_original": 100,
  "source_missing_reason": "texto",
  "source_missing_detected_at": "timestamp",
  "sync_completed_at": "timestamp"
}
```

- [ ] **Step 9: Finalizar comentário e ACL**

```sql
comment on function public.get_inadimplencia_canonica(uuid, date) is
  'Contrato v3: verdade financeira D+0, carencia operacional D+2, gate de frescor e quarentena isolada.';

revoke all on function public.get_inadimplencia_canonica(uuid, date)
  from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, date)
  to authenticated, service_role;
```

Preservar qualquer revoke adicional existente que seja mais restritivo; não conceder a `anon`.

- [ ] **Step 10: Rodar GREEN e revisar o SQL**

```powershell
node --test tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
git diff --check
```

Expected: todos verdes; o teste PostgreSQL executa em PostgreSQL 17 real, sem skip quando Docker está disponível.

Revisar ainda:

```powershell
rg -n "source_missing.*pag|pag.*source_missing|emusys_student_id.*items|nome.*join" supabase\migrations\20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql
rg -n "security definer|set search_path|revoke all|grant execute" supabase\migrations\20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql
```

- [ ] **Step 11: Commit do contrato canônico e seus testes**

```powershell
git add supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
git commit -m "feat(financeiro): liberar inadimplencia confirmada com seguranca"
```

## Task 4: Migrar o cliente canônico TypeScript

**Files:**

- Modify: `src/lib/inadimplenciaCanonica.ts`
- Modify: `src/lib/inadimplenciaCanonica.test.ts`

- [ ] **Step 1: Escrever os testes RED do normalizador e do relógio**

Alterar o payload de teste principal para `schema_version: 3` e acrescentar:

```ts
operational: {
  collection_allowed: true,
  collection_scope: 'confirmed_only',
  consumer_must_apply_collection_grace: true,
  block_reasons: [],
},
policy: {
  delinquency_rule: 'd_plus_0',
  collection_grace_days: 2,
},
reconciliation: {
  source_missing_count: 1,
  source_missing_open_count: 1,
  source_missing_other_count: 0,
  duplicate_fatura_count: 0,
  invalid_identity_invoice_count: 0,
  validation_issue_count: 0,
},
```

Adicionar testes para:

1. `partial` fresco preserva itens confirmados e permite uso do conjunto após a carência do consumidor;
2. `partial` após `freshUntil` falha fechado sem precisar aguardar refetch;
3. `stale`, `incomplete`, `error` e `loading` nunca permitem cobrança;
4. schema v3 sem `operational`, com `collection_allowed` não booleano ou scope inválido vira `error` e descarta itens;
5. durante o rollout, schema v2 `ok` continua normalizado com gate seguro derivado; schema v2 `incomplete` continua bloqueado;
6. `sourceMissingOpenCount` e `sourceMissingOtherCount` são expostos sem entrar na soma financeira;
7. v3 sem `delinquency_rule=d_plus_0`, `collection_grace_days=2` ou `consumer_must_apply_collection_grace=true` falha fechado;
8. identidade opcional inválida pode coexistir com confirmados em `partial` sem entrar em itens/totais.

Assinatura do helper:

```ts
export function podeCobrarInadimplenciaCanonica(
  state: InadimplenciaCanonicaState,
  agora = new Date(),
): boolean
```

- [ ] **Step 2: Confirmar RED**

```powershell
deno test src/lib/inadimplenciaCanonica.test.ts
```

Expected: falhas por ausência de `partial`, campos operacionais e helper de expiração.

- [ ] **Step 3: Expandir tipos e estado vazio**

Adicionar:

```ts
export type InadimplenciaCanonicaStatus =
  | 'loading' | 'ok' | 'partial' | 'stale' | 'incomplete' | 'error';

export type InadimplenciaCollectionScope = 'confirmed_only' | 'blocked';
export type InadimplenciaBlockReason =
  | 'stale_competencia'
  | 'duplicate_confirmed_fatura'
  | 'invalid_invoice_identity';

// Em InadimplenciaCanonicaState:
collectionAllowed: boolean;
collectionScope: InadimplenciaCollectionScope;
delinquencyRule: 'd_plus_0';
collectionGraceDays: number;
consumerMustApplyCollectionGrace: boolean;
blockReasons: InadimplenciaBlockReason[];
sourceMissingOpenCount: number;
sourceMissingOtherCount: number;
```

No estado loading/error, usar `collectionAllowed=false`, `collectionScope='blocked'`, carência segura de 2 dias, arrays vazios e contagens zero.

- [ ] **Step 4: Normalizar v3 de modo estrito e v2 de modo conservador**

Para `schema_version===3`, validar `operational` e aceitar itens apenas quando o payload permite cobrança. Para v2 durante a propagação:

```text
status=ok         => collectionAllowed=true, confirmed_only
qualquer outro    => collectionAllowed=false, blocked
```

O fallback v2 é temporário e não converte `incomplete` em `partial`. Payload desconhecido, inconsistente ou com itens em estado bloqueado deve retornar `status='error'`, `items=[]` e erro descritivo.

- [ ] **Step 5: Implementar o gate com expiração**

```ts
export function podeCobrarInadimplenciaCanonica(state, agora = new Date()) {
  if (!state.collectionAllowed) return false;
  if (!state.freshUntil) return true;
  const limite = Date.parse(state.freshUntil);
  return Number.isFinite(limite) && agora.getTime() < limite;
}
```

Usar comparação estrita: no instante igual a `freshUntil`, a cobrança já está bloqueada.

- [ ] **Step 6: Fazer agregadores obedecerem ao helper**

`indexarInadimplenciaPorMatricula` e `montarAlertasInadimplenciaCanonica` devem retornar coleção vazia quando `podeCobrarInadimplenciaCanonica` for falso. Eles não leem `unknown_invoices` e não recalculam juros. A indexação da Lista de Alunos preserva a verdade D+0; `montarAlertasInadimplenciaCanonica` aplica exclusivamente `state.collectionGraceDays=2`. Nenhum consumidor pode sobrescrever a carência.

- [ ] **Step 7: Rodar GREEN e commit**

```powershell
deno test src/lib/inadimplenciaCanonica.test.ts
npx tsc --noEmit
git diff --check
git add src/lib/inadimplenciaCanonica.ts src/lib/inadimplenciaCanonica.test.ts
git commit -m "feat(financeiro): normalizar gate canonico v3"
```

## Task 5: Liberar confirmados no LA Report e manter bloqueios visíveis

**Files:**

- Modify: `src/components/App/Alunos/AlunosPage.tsx`
- Modify: `src/components/App/Alunos/TabelaAlunos.tsx`
- Modify: `src/components/App/Administrativo/PainelFarmer/hooks/useAlertas.ts`
- Modify: `src/components/App/Administrativo/PainelFarmer/DashboardTab.tsx`
- Modify: `tests/inadimplenciaCanonicaFrontend.test.mjs`
- Modify: `tests/inadimplenciaConsumidoresCanonicos.test.mjs`

- [ ] **Step 1: Escrever os testes RED dos consumidores**

Atualizar os testes estáticos para exigir importação e uso de `podeCobrarInadimplenciaCanonica`, aceitar `partial` como acionável somente pelo gate e proibir decisões por `status === 'ok'` isolado.

Exigir no banner da Lista de Alunos os textos sem misturar universos nem prometer contato D+0:

```text
texto principal = totalMatriculas + “inadimplências confirmadas (D+0) — leitura financeira disponível”
texto secundário = sourceMissingCount + “faturas aguardando reconciliação — fora da cobrança”
texto identidade = invalidIdentityInvoiceCount + “faturas com identidade inválida aguardando conciliação — fora da cobrança”
texto contato = contactResolutionPendingCount + “faturas confirmadas sem contato local unívoco”
```

Exigir no Farmer:

- alerta de “cobrança amigável D+2” somente com itens confirmados cujo `dias_atraso >= 2`;
- aviso separado e não bloqueante para reconciliação;
- aviso bloqueante distinto para `stale`, `incomplete` e `error`;
- nenhuma frase “nenhuma cobrança é liberada com leitura parcial”.

Exigir que o botão “Filtrar ativos inadimplentes” só apareça quando o gate está válido e que o filtro seja desligado quando o frescor expira.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/inadimplenciaCanonicaFrontend.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
```

- [ ] **Step 3: Trocar o critério da Lista de Alunos pelo gate canônico**

Em `AlunosPage.tsx`:

- importar `podeCobrarInadimplenciaCanonica`;
- substituir `inadimplenciaAtual.status === 'ok'` pelo helper;
- manter o índice por `unidade_id + emusys_matricula_id`;
- nunca associar por nome ou `emusys_student_id`;
- no filtro `inadimplente_emusys_live`, remover a segunda decisão por `alunos.status==='ativo'`; o universo ativo já vem da view canônica e o filtro deve olhar somente os flags derivados de `items` enquanto o gate estiver válido;
- quando o gate estiver falso, zerar os flags derivados de inadimplência nos alunos e impedir que o filtro legado reaproveite valores de uma leitura anterior.

Adicionar um timer de expiração vinculado a `freshUntil`. O timer só é armado se a leitura está permitida e o limite é futuro; ao vencer, deve recarregar a leitura canônica ou, se a rede falhar, invalidar localmente o gate e limpar/desativar o filtro. Limpar o timer no unmount e na troca de unidade. Não criar polling apertado quando o limite já estiver vencido.

- [ ] **Step 4: Renderizar o banner operacional sem ambiguidade**

Em `TabelaAlunos.tsx`, derivar `cobrancaLiberada` pelo helper, não pelo texto de `status`.

Estados:

```text
ok + confirmados:
  banner de cobrança confirmada

partial:
  linha principal com quantidade/valor confirmado D+0 e “leitura financeira disponível”
  linha secundária âmbar com sourceMissingCount e “fora da cobrança”
  linha secundária âmbar com invalidIdentityInvoiceCount e “fora da cobrança”
  linha secundária âmbar com contactResolutionPendingCount, deixando explícito que permanece no financeiro D+0 mas não entra no contato D+2

stale:
  “Dados de inadimplência desatualizados — lista bloqueada”

incomplete:
  “Leitura financeira inválida — cobrança bloqueada” + blockReasons amigáveis

error:
  falha de leitura, nenhuma ação financeira
```

Somente `totalMatriculas`, `totalFaturas` e `totalAtualizado` do canônico alimentam a parte confirmada. `sourceMissingCount` nunca compõe valor ou quantidade de inadimplentes.

- [ ] **Step 5: Manter “Atualizar agora” fiel à fila**

Preservar o fluxo `atualizar-inadimplencia-emusys` → `refresh-contas-receber`. Ajustar somente se os testes mostrarem lacuna:

- `succeeded + snapshot_complete=true` é sucesso;
- `pending`, `running` e `retry_wait` são “em processamento” e mostram `next_attempt_at`;
- HTTP 429 nunca gera toast de sucesso;
- erro estrutural mostra falha;
- `onRecarregar()` ocorre após a resposta para buscar `status`, contagens e `freshUntil` reais;
- o texto “última sincronização” continua vindo do snapshot publicado, nunca do clique.

- [ ] **Step 6: Migrar o Farmer**

Em `useAlertas.ts`:

- usar `podeCobrarInadimplenciaCanonica(estadoCanonico)` para decidir a consulta de alunos;
- consultar alunos somente por `items[].aluno_id_canonico` cujo `contact_resolution_status='resolved'`;
- manter unidade na query e remover qualquer desempate local por matrícula, nome, `student_id`, `is_segundo_curso` ou ordenação; a RPC publica o único ID apto a fornecer contato;
- zero ou múltiplos candidatos atuais preservam a fatura nos totais D+0, mas publicam `aluno_id_canonico=null`, entram em `contactResolutionPendingCount` e ficam fora da carteira D+2;
- se o gate expirar, limpar `inadimplentes` e agendar uma única releitura; cancelar timer ao trocar unidade/unmount.
- deixar `montarAlertasInadimplenciaCanonica` aplicar `state.collectionGraceDays`; uma fatura com 1 dia fica na consulta financeira D+0, mas não entra no Farmer, enquanto 2 dias entra. O hook não duplica nem sobrescreve essa regra.

Em `DashboardTab.tsx`, renderizar `partial` como cobrança amigável D+2 disponível, com avisos separados de `source_missing`, identidade inválida e contato não unívoco. `stale`, `incomplete` e `error` continuam bloqueantes.

- [ ] **Step 7: Rodar GREEN, typecheck e build focal**

```powershell
deno test src/lib/inadimplenciaCanonica.test.ts
node --test tests/inadimplenciaCanonicaFrontend.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
npx tsc --noEmit
npm run build
git diff --check
```

- [ ] **Step 8: Commit dos consumidores visuais**

```powershell
git add src/components/App/Alunos/AlunosPage.tsx src/components/App/Alunos/TabelaAlunos.tsx src/components/App/Administrativo/PainelFarmer/hooks/useAlertas.ts src/components/App/Administrativo/PainelFarmer/DashboardTab.tsx tests/inadimplenciaCanonicaFrontend.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
git commit -m "feat(alunos): exibir cobranca confirmada e reconciliacao separadas"
```

## Task 6: Tornar a exportação consumidora explícita do contrato v3

**Files:**

- Create: `supabase/functions/_shared/inadimplenciaCanonicaExport.ts`
- Create: `supabase/functions/_shared/inadimplenciaCanonicaExport.test.ts`
- Modify: `supabase/functions/export-contas-receber/index.ts`
- Modify: `tests/contasReceberExport.test.mjs`
- Modify: `tests/inadimplenciaConsumidoresCanonicos.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Criar testes RED para um parser puro de exportação**

Definir o contrato do helper:

```ts
export async function prepararExportacaoInadimplenciaCanonica(
  payload: unknown,
  contexto: {
    unidadeId: string | null;
    asOfDate: string | null;
    agoraMs?: number;
  },
): Promise<{ itens: Record<string, unknown>[]; manifesto: Record<string, unknown> }>
```

Casos obrigatórios em `inadimplenciaCanonicaExport.test.ts`:

1. `ok` v3, permitido e fresco exporta confirmados;
2. `partial` v3, permitido e fresco exporta somente `items`, não `unknown_invoices`;
3. `partial` com `collection_allowed=false` é rejeitado;
4. `stale` e `incomplete` são rejeitados;
5. `fresh_until` inválido ou `agoraMs >= fresh_until` é rejeitado;
6. manifesto de `partial` contém `schema_version`, `status`, `collection_scope`, `fresh_until`, `delinquency_rule`, `collection_grace_days`, `collection_grace_applied=false`, `confirmed_invoice_count`, `source_missing_count`, `invalid_identity_invoice_count` e hash estável;
7. identificador numérico JavaScript inseguro é rejeitado; IDs textuais grandes são preservados.

O manifesto esperado contém:

```json
{
  "modo": "inadimplencia",
  "schema_version": 3,
  "status": "partial",
  "collection_allowed": true,
  "collection_scope": "confirmed_only",
  "fresh_until": "timestamp",
  "delinquency_rule": "d_plus_0",
  "collection_grace_days": 2,
  "collection_grace_applied": false,
  "confirmed_invoice_count": 1,
  "source_missing_count": 2,
  "invalid_identity_invoice_count": 1,
  "is_fresh": true
}
```

- [ ] **Step 2: Incluir o teste Deno no pipeline e confirmar RED**

Adicionar `supabase/functions/_shared/inadimplenciaCanonicaExport.test.ts` à lista do script `pretest` em `package.json`.

```powershell
deno test supabase/functions/_shared/inadimplenciaCanonicaExport.test.ts
```

- [ ] **Step 3: Implementar o helper puro**

Reusar `sha256` de `supabase/functions/_shared/contasReceberExport.ts`. Validar de forma estrita:

```text
schema_version = 3
status in (ok, partial)
operational.collection_allowed = true
operational.collection_scope = confirmed_only
operational.consumer_must_apply_collection_grace = true
policy.delinquency_rule = d_plus_0
policy.collection_grace_days = 2
fresh_until ausente somente quando competencias_necessarias = 0;
caso presente, Date.parse válido e agoraMs < limite
items é array de objetos confirmados
```

Mapear cada item mantendo IDs como texto e forçando `status='aberta'`, `source_missing=false`. Não aceitar nem visitar `reconciliation.unknown_invoices` ao construir linhas.

O hash deve cobrir `schema_version`, `status`, unidade, data de corte, scope, `fresh_until`, regra D+0, carência D+2 ainda não aplicada, contagens e itens ordenados por `unidade_id + canonical_fatura_id`.

- [ ] **Step 4: Simplificar a Edge Function**

Em `export-contas-receber/index.ts`, manter a chamada da RPC e delegar parsing/manifesto ao helper. Não alterar:

- autenticação por `x-super-folha-sync-secret`;
- modo `snapshot` e suas regras;
- `verify_jwt=false` em `supabase/config.toml`;
- códigos 400 para input inválido e 409 para leitura financeira não acionável.

O modo `inadimplencia` passa `Date.now()` implicitamente e retorna `{ success: true, manifesto, itens }` somente após o helper validar o gate.

- [ ] **Step 5: Atualizar contratos estáticos**

Em `tests/inadimplenciaConsumidoresCanonicos.test.mjs`, substituir a expectativa antiga `status !== 'ok'` por evidência de uso do helper e dos campos `collection_allowed`/`collection_scope`.

Em `tests/contasReceberExport.test.mjs`, manter todos os testes do modo snapshot e acrescentar a proteção de que `source_missing` não entra no export canônico.

- [ ] **Step 6: Rodar GREEN e commit**

```powershell
deno test supabase/functions/_shared/inadimplenciaCanonicaExport.test.ts
node --test tests/contasReceberExport.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
npm test
git diff --check
git add supabase/functions/_shared/inadimplenciaCanonicaExport.ts supabase/functions/_shared/inadimplenciaCanonicaExport.test.ts supabase/functions/export-contas-receber/index.ts tests/contasReceberExport.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs package.json
git commit -m "feat(financeiro): exportar somente inadimplencia confirmada"
```

## Task 7: Fazer `sol_caixa_inadimplentes` consumir o gate v3

**Files:**

- Create: `supabase/migrations/20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql`
- Modify: `tests/inadimplenciaCanonicaPostgres.test.mjs`
- Modify: `tests/inadimplenciaConsumidoresCanonicos.test.mjs`

- [ ] **Step 1: Escrever os testes RED da Sol na fixture PostgreSQL real**

Adicionar a futura migration da Sol à lista carregada pela fixture e criar um helper:

```js
function callSolAs(container, role, unitId, options = {}) {
  const {
    carenciaDias = 2,
    multaPct = 0.02,
    moraPctMes = 0.01,
    graveDias = 30,
    criticoDias = 40,
  } = options;
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    select public.sol_caixa_inadimplentes(
      '${unitId}'::uuid,
      ${carenciaDias}, ${multaPct}, ${moraPctMes}, ${graveDias}, ${criticoDias}
    )::text;
  `);
}
```

Casos RED:

1. canônico `partial` com uma confirmada, uma `source_missing` e uma identidade inválida: Sol retorna apenas a matrícula confirmada elegível em D+2;
2. resposta expõe `canonical_status='partial'`, `collection_allowed=true`, `collection_scope='confirmed_only'`, `fresh_until` e `source_missing_count=1`;
3. canônico `stale` ou `incomplete`: `collection_allowed=false`, `alunos=[]`, totais zero;
4. `p_multa_pct<>0.02` ou `p_mora_pct_mes<>0.01`: exceção explícita de política;
5. item só localizável por `emusys_student_id`: nunca enriquecido/cobrado;
6. mesma matrícula em unidades diferentes: apenas a unidade pedida;
7. dois cursos para a mesma matrícula: um único contato pelo `aluno_id_canonico` já resolvido, sem escolha ou desempate local;
8. `anon` e `authenticated` não podem executar; `service_role` pode;
9. nenhuma das quatro RPCs protegidas de caixa aparece na migration;
10. fatura com 1 dia de atraso permanece na verdade D+0, mas não entra na Sol com `p_carencia_dias=2`; fatura com 2 dias entra.

- [ ] **Step 2: Confirmar RED**

```powershell
node --test tests/inadimplenciaCanonicaPostgres.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
```

Expected: migration nova ausente e contrato atual da Sol bloqueia `partial`.

- [ ] **Step 3: Criar a migration da Sol pela CLI**

```powershell
supabase migration new sol_caixa_inadimplentes_liberacao_parcial_v3
Get-ChildItem -LiteralPath supabase\migrations -Filter '*_sol_caixa_inadimplentes_liberacao_parcial_v3.sql' |
  Select-Object FullName,Length,LastWriteTime
```

Confirmar arquivo único e vazio, confirmar que `20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql` não existe e renomear somente o arquivo recém-criado. Se o timestamp não estiver mais livre, parar e renumerar este plano/testes.

- [ ] **Step 4: Fixar a política contratual antes de ler dados**

Preservar exatamente a assinatura existente. No início da função:

```sql
if p_multa_pct is distinct from 0.02::numeric
   or p_mora_pct_mes is distinct from 0.01::numeric then
  raise exception using
    errcode = '22023',
    message = 'politica financeira invalida: use multa 0.02 e mora mensal 0.01';
end if;
```

Os parâmetros permanecem por compatibilidade, mas nunca recalculam valor.

- [ ] **Step 5: Obedecer ao gate em vez de reinterpretar status**

Após chamar `get_inadimplencia_canonica`, ler:

```sql
v_canonical_status := coalesce(v_canonical->>'status', 'error');
v_collection_allowed := coalesce(
  (v_canonical #>> '{operational,collection_allowed}')::boolean,
  false
);
v_collection_scope := coalesce(
  v_canonical #>> '{operational,collection_scope}',
  'blocked'
);
```

Se `collection_allowed=false`, retornar lista e totais vazios com o diagnóstico canônico preservado. Se true, consumir exclusivamente `v_canonical->'items'`; não consultar `sync_run_items`, `emusys_faturas`, flag legado ou Emusys.

- [ ] **Step 6: Agregar contato por pessoa e preservar as matrículas exatas**

Agrupar a ação de contato por `unidade_id + aluno_id_canonico`, já filtrada pela carência canônica publicada, para que a mesma pessoa não receba ações duplicadas quando possui dívida em mais de uma matrícula. Preservar no payload a lista ordenada de `emusys_matricula_ids` e as faturas exatas que formam o total. O valor operacional é obrigatoriamente 2 e o payload deve expor `carencia_dias=2` e `canonical_delinquency_rule='d_plus_0'`. A Sol consome `aluno_id_canonico` somente quando `contact_resolution_status='resolved'`; não seleciona nem desempata cadastro por `emusys_student_id`.

Enriquecer com:

```text
item.unidade_id = alunos.unidade_id
AND item.aluno_id_canonico = alunos.id
AND item.contact_resolution_status = 'resolved'
```

Se houver zero ou mais de um cadastro atual da pessoa, o canônico publica contato pendente e a Sol não cria linha acionável. Isso nunca altera a soma financeira D+0. A matrícula exata da fatura já foi validada pelo canônico e deve permanecer no payload.

Se um item canônico resolvido não encontrar o `aluno_id_canonico` exato na unidade, colocá-lo em quarentena operacional (`cadastro_nao_encontrado`) sem contaminar as demais linhas. Nunca tentar resgatar por nome ou `student_id`.

- [ ] **Step 7: Publicar metadados suficientes para o Claude**

O payload retorna:

```json
{
  "status": "ok|partial|stale|incomplete|error",
  "canonical_status": "ok|partial|stale|incomplete|error",
  "collection_allowed": true,
  "collection_scope": "confirmed_only",
  "fresh_until": "timestamp|null",
  "source_missing_count": 0,
  "confirmados": {},
  "total_alunos": 0,
  "total_original": 0,
  "total_atualizado": 0,
  "faixas": { "critico": 0, "atencao": 0, "normal": 0 },
  "alunos": []
}
```

Em leitura permitida sem erro local, `status` preserva `canonical_status`, inclusive `partial`. Consumidores devem usar `collection_allowed`, não comparar apenas `status='ok'`.

- [ ] **Step 8: Preservar ACL e provar fronteira da Sol**

```sql
revoke all on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  to service_role;
```

Manter `security definer` e `set search_path = public, pg_temp`.

- [ ] **Step 9: Rodar GREEN e commit**

```powershell
node --test tests/inadimplenciaCanonicaPostgres.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
rg -n "sol_caixa_lancar_recebimento|sol_caixa_abrir|sol_caixa_fechar|sol_caixa_casar_parcela" supabase\migrations\20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql
git diff --check
```

Expected: testes verdes e o `rg` não retorna ocorrências.

```powershell
git add supabase/migrations/20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql tests/inadimplenciaCanonicaPostgres.test.mjs tests/inadimplenciaConsumidoresCanonicos.test.mjs
git commit -m "feat(sol): consumir liberacao parcial canonica"
```

## Task 8: Provar que a fila única cobre backlog, 429 e identidade inválida

**Files:**

- Verify: `supabase/functions/sync-faturas-emusys/index.ts`
- Verify: `supabase/functions/refresh-contas-receber/index.ts`
- Verify: `supabase/functions/_shared/faturasSync.ts`
- Verify: `supabase/functions/_shared/financeiroSyncQueue.ts`
- Verify: `supabase/migrations/20260816013455_financeiro_sync_queue.sql`
- Test: `tests/faturasSyncColeta.test.mjs`
- Test: `tests/faturasSyncFrescorContrato.test.mjs`
- Test: `tests/financeiroSyncQueueContract.test.mjs`
- Test: `tests/financeiroSyncQueuePostgres.test.mjs`
- Test: `tests/financeiroSyncWorker.test.mjs`

- [ ] **Step 1: Executar a suíte específica sem alterar produção**

```powershell
node --test tests/faturasSyncColeta.test.mjs tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs tests/financeiroSyncWorker.test.mjs
```

Expected:

- coletor pagina até `tem_mais=false` e preserva IDs como texto/bigint seguro;
- HTTP 429 respeita `Retry-After` e persiste `retry_wait/next_attempt_at`;
- somente um worker é reclamado por vez;
- backlog inclui competência antiga ainda aberta, inclusive junho/2026;
- identificador opcional inválido em `matricula_id` vira `payload._la_report.validation_issues`, não derruba toda a coleta;
- `juros_e_multa` e `desconto_aplicado` não zero são preservados no item e no payload do snapshot;
- erro de ID obrigatório continua falha estrutural;
- probe é read-only e exige service role.

- [ ] **Step 2: Fechar qualquer regressão somente por TDD**

Se um item acima falhar, primeiro adicionar/ajustar o menor teste reproduzível no arquivo correspondente; depois corrigir apenas o módulo da fila relacionado. Não criar segunda fila, segundo cron ou sync da Sol. A migration `20260816013455_financeiro_sync_queue.sql` já aplicada é somente leitura: qualquer correção SQL exige interromper esta tarefa, criar migration aditiva pela CLI, reservar novo timestamp e atualizar o dry-run da Task 10.

Reexecutar os cinco testes até GREEN. Se não houver falha, não gerar diff artificial nesta tarefa.

- [ ] **Step 3: Conferir que o botão passa pelo mesmo caminho**

```powershell
node --test tests/inadimplenciaCanonicaFrontend.test.mjs tests/faturasSyncFrescorContrato.test.mjs
rg -n "refresh-contas-receber|include_backlog|queue_status|next_attempt_at" supabase/functions/atualizar-inadimplencia-emusys/index.ts src/components/App/Alunos/TabelaAlunos.tsx
```

Expected: um único caminho `Atualizar agora` → orquestrador → fila → worker → snapshot completo.

- [ ] **Step 4: Commit somente se houve correção real**

Se a Task 8 gerou diff:

```powershell
git add supabase/functions/sync-faturas-emusys/index.ts supabase/functions/refresh-contas-receber/index.ts supabase/functions/_shared/faturasSync.ts supabase/functions/_shared/financeiroSyncQueue.ts tests/faturasSyncColeta.test.mjs tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs tests/financeiroSyncWorker.test.mjs
git commit -m "fix(financeiro): preservar fila unica no backlog Emusys"
```

## Task 9: Documentar a regra e executar a verificação local completa

**Files:**

- Modify: `docs/REGRAS-DE-NEGOCIO.md`
- Modify: `docs/METRICAS.md`
- Verify: all files changed since `700c1b4c`

- [ ] **Step 1: Atualizar as regras de negócio**

Em `docs/REGRAS-DE-NEGOCIO.md`, registrar de forma operacional:

- fonte: `get_inadimplencia_canonica`, alimentada por `sync_runs + sync_run_items`;
- universo: pessoa com qualquer matrícula atual `ativa|trancada`, sem
  arquivamento nessa matrícula atual; estado Emusys v1.3.1 prevalece sobre
  `data_saida` legado, que só exclui no fallback;
- identidade da dívida: matrícula exata conhecida e pertencente ao mesmo
  `unidade_id + emusys_student_id` atual;
- janela: mês corrente e dois meses-calendário anteriores;
- vencida: `data_vencimento < data de corte`;
- verdade financeira: D+0; cobrança amigável: D+2 em Farmer/Sol;
- identidade apta: `unidade_id + emusys_matricula_id` exata;
- `source_missing` significa não confirmada, nunca paga;
- `partial` libera somente confirmados; `source_missing` e identidade opcional inválida permanecem em quarentena;
- `stale`/`incomplete` bloqueiam tudo;
- valor atualizado: valor original × `(1 + 2% + 1% × dias/30)`, arredondado por fatura;
- ex-alunos devedores e competências anteriores à janela ficam fora desta carteira e terão produto próprio;
- Sol, LA Report e exportação não podem consultar uma fonte paralela.

- [ ] **Step 2: Atualizar o catálogo de métricas**

Em `docs/METRICAS.md`, definir:

```text
inadimplencias_confirmadas = count(distinct unidade_id, canonical_fatura_id) dos items
matriculas_inadimplentes = count(distinct unidade_id, emusys_matricula_id) dos items
valor_original_confirmado = sum(valor_original dos items)
valor_atualizado_confirmado = sum(valor_atualizado arredondado por item)
faturas_em_reconciliacao = reconciliation.source_missing_count + reconciliation.invalid_identity_invoice_count
frescor_valido = collection_allowed do servidor AND agora < fresh_until, quando presente
cobranca_amigavel_elegivel = item confirmado AND dias_atraso >= collection_grace_days (2)
```

Explicitar que contagens de reconciliação não entram nos quatro primeiros indicadores.

- [ ] **Step 3: Rodar toda a suíte em ambiente limpo da worktree**

```powershell
npm test
npm run build
git diff --check
git status --short
```

Expected: todos os testes Deno, Node e PostgreSQL verdes; build Vite concluído; somente arquivos deste plano alterados.

- [ ] **Step 4: Rodar verificações de segurança e contrato**

```powershell
rg -n "security definer" supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql supabase/migrations/20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql
rg -n "set search_path = public, pg_temp" supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql supabase/migrations/20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql
rg -n "grant execute|revoke all" supabase/migrations/20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql supabase/migrations/20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql
node --test tests/inadimplenciaMigrationDrift.test.mjs tests/financeiroSyncAuthorization.test.mjs
```

Revisar manualmente que nenhum payload, teste ou log contém token, telefone real, segredo interno ou chave service role.

- [ ] **Step 5: Commit da documentação**

```powershell
git add docs/REGRAS-DE-NEGOCIO.md docs/METRICAS.md
git commit -m "docs(financeiro): registrar contrato canonico v3"
```

- [ ] **Step 6: Registrar a evidência local antes do review**

```powershell
git status --short
git log --oneline --decorate 700c1b4c..HEAD
git diff --stat 700c1b4c..HEAD
git diff --check 700c1b4c..HEAD
```

Expected: worktree limpa; sequência de commits pequenos; nenhum arquivo fora do escopo.

## Task 10: Revisar, integrar e publicar o código sem contornar migrations

**Files:**

- Review: `git diff 700c1b4c..HEAD`
- Deploy: two new migrations, changed Edge Functions, Vercel frontend

- [ ] **Step 1: Executar revisão de código independente**

Usar `superpowers:requesting-code-review` sobre o diff completo. O review deve checar especialmente:

- `source_missing` nunca convertido em pagamento;
- chave escopada por unidade;
- nenhuma cobrança por student ID/nome;
- expiração local do gate;
- `stale`/`incomplete` com itens vazios;
- taxas contratuais fixas;
- ACLs e `search_path`;
- ausência de mudanças nas quatro RPCs protegidas da Sol;
- nenhuma ativação de cron ou mensagens.

Corrigir achados válidos com teste RED específico, reexecutar `npm test` e `npm run build`, e fazer commit corretivo separado.

- [ ] **Step 2: Revalidar origem antes do push**

```powershell
git fetch origin
git status --short
git log --oneline --left-right origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Se `origin/main` avançou em qualquer arquivo tocado, integrar a mudança na branch, revisar conflitos semanticamente e repetir toda a suíte. Não usar reset destrutivo.

- [ ] **Step 3: Publicar a branch**

```powershell
git push -u origin fix/inadimplencia-liberacao-parcial
```

Registrar o hash remoto da ponta e confirmar que é igual a `git rev-parse HEAD`.

- [ ] **Step 4: Integrar na main somente com ambos os worktrees limpos**

```powershell
git -C D:\2026\LA-performance-report status --short
git -C D:\2026\LA-performance-report fetch origin
git -C D:\2026\LA-performance-report pull --ff-only origin main
git -C D:\2026\LA-performance-report merge --no-ff fix/inadimplencia-liberacao-parcial -m "merge: inadimplencia canonica com liberacao parcial"
```

Se o checkout principal estiver sujo, parar e pedir direção; não guardar, apagar ou sobrescrever mudanças do usuário.

- [ ] **Step 5: Verificar o merge na main antes de publicar**

```powershell
npm test
npm run build
git diff --check HEAD^ HEAD
git status --short
```

Executar em `D:\2026\LA-performance-report`. Só continuar com tudo verde e main limpa.

- [ ] **Step 6: Push da main e conferência de hash**

```powershell
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Os hashes local e remoto devem coincidir.

- [ ] **Step 7: Fazer dry-run das migrations no projeto correto**

```powershell
supabase link --project-ref ouqwbbermlzqqvtqwlul
supabase migration list --linked
supabase db push --linked --dry-run
```

Expected: o dry-run lista somente:

```text
20260816184837_inadimplencia_canonica_liberacao_parcial_v3.sql
20260816184845_sol_caixa_inadimplentes_liberacao_parcial_v3.sql
```

Qualquer migration adicional, versão remota ausente ou drift interrompe o rollout; não usar `--include-all`.

- [ ] **Step 8: Aplicar migrations e validar o banco**

```powershell
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --level warning --fail-on error
```

Confirmar as duas versões como locais/remotas e revisar os advisors de segurança/performance do projeto. Um novo erro de segurança bloqueia a continuação; warnings preexistentes devem ser separados dos introduzidos pelo diff.

- [ ] **Step 9: Publicar somente as Edge Functions alteradas**

Obrigatória neste plano:

```powershell
supabase functions deploy export-contas-receber --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```

Se a Task 8 alterou funções da fila, publicar também:

```powershell
supabase functions deploy sync-faturas-emusys --project-ref ouqwbbermlzqqvtqwlul
supabase functions deploy refresh-contas-receber --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```

Não usar `--prune`. Conferir versão e logs de bundle; `export-contas-receber` e `refresh-contas-receber` preservam o contrato de autenticação interno atual.

- [ ] **Step 10: Publicar o frontend no projeto Vercel correto**

```powershell
vercel link --yes --project la-performance-report
vercel deploy --prod
```

Registrar URL, deployment id e estado `Ready`. Isso prova publicação, não prova o fluxo funcional; a prova funcional é a Task 11.

## Task 11: Executar o gate controlado contra o Emusys sem enviar cobranças

**Files:**

- Read: `C:\Users\Texeira\Downloads\Relatorio_Contas_Receber_16_08_2026.xlsx`
- Read: `C:\Users\Texeira\Downloads\Relatorio_Contas_Receber_16_08_2026 (1).xlsx`
- Read: `C:\Users\Texeira\Downloads\Relatorio_Contas_Receber_16_08_2026 (2).xlsx`
- Create: `docs/audits/2026-08-16-inadimplencia-canonica-v3-validacao.md`

Usar obrigatoriamente `spreadsheets:Spreadsheets` para abrir e reconciliar os três arquivos XLSX sem alterar os originais.

- [ ] **Step 1: Preparar credenciais sem expô-las**

Usar uma sessão autenticada/segredo já autorizado. Se a execução for por PowerShell, exigir as variáveis abaixo sem imprimir seus valores:

```powershell
if ([string]::IsNullOrWhiteSpace($env:LA_REPORT_SUPABASE_SERVICE_ROLE_KEY)) {
  throw 'LA_REPORT_SUPABASE_SERVICE_ROLE_KEY nao configurada'
}
$financeHeaders = @{
  Authorization = "Bearer $($env:LA_REPORT_SUPABASE_SERVICE_ROLE_KEY)"
  apikey = $env:LA_REPORT_SUPABASE_SERVICE_ROLE_KEY
  'Content-Type' = 'application/json'
}
```

Não salvar tokens no repo, histórico de shell, documento de auditoria ou saída enviada ao usuário.

- [ ] **Step 2: Rodar probe read-only de Campo Grande/agosto**

```powershell
$probeBody = @{
  mode = 'probe'
  competencias = @('2026-08-01')
  unidade = 'cg'
} | ConvertTo-Json

$probe = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys' `
  -Headers $financeHeaders `
  -Body $probeBody
```

Confirmar `ok=true`, `probe=true` e ausência de novo `sync_run_id`/snapshot publicado. Comparar item a item o probe com “Contas a Receber → Em Atraso → AGO 2026” do Emusys: fatura/matrícula, vencimento, status, `valor_original`, `juros_e_multa` dinâmico e `desconto_aplicado` dinâmico.

Baseline visual informado para Campo Grande em 16/08/2026, antes do recorte de alunos ativos:

```text
JUN/2026: R$ 2.682,00
JUL/2026: R$ 3.576,00
AGO/2026: R$ 1.341,00
```

Esses totais são referência do universo bruto do Emusys. Não exigir que o canônico ativo seja igual sem antes explicar, item a item, quais matrículas saíram por inatividade/arquivo/data de saída.

- [ ] **Step 3: Se o probe estiver verde, publicar uma competência completa**

```powershell
$enqueueAugust = @{
  mode = 'enqueue_and_work'
  competencias = @('2026-08-01')
  include_backlog = $false
  trigger_source = 'gate_inadimplencia_v3_agosto'
} | ConvertTo-Json

$augustJob = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys' `
  -Headers $financeHeaders `
  -Body $enqueueAugust
```

O snapshot publicado continua atômico para Campo Grande, Recreio e Barra. Se retornar `retry_wait`, respeitar `next_attempt_at`; não disparar chamadas paralelas e não fazer busy-loop. Se retornar erro estrutural, interromper e diagnosticar antes de publicar leitura.

- [ ] **Step 4: Comparar o snapshot publicado com o probe e o Emusys**

Verificar no banco/manifesto:

- run `live`, `succeeded`, `snapshot_complete=true`, `unidades_concluidas=3`;
- uma linha por fatura retornada, mantendo unidade;
- IDs inválidos opcionais preservados em `payload._la_report.validation_issues`;
- `juros_e_multa` e `desconto_aplicado` do probe preservados no snapshot, inclusive valores não zero;
- nenhuma linha partial de uma unidade publicada como snapshot completo;
- o conjunto bruto de CG/agosto coincide com o probe e a tela no mesmo instante.

- [ ] **Step 5: Enfileirar junho, julho e agosto com backlog**

Somente após agosto verde:

```powershell
$backlogBody = @{
  mode = 'enqueue_and_work'
  competencias = @('2026-06-01', '2026-07-01', '2026-08-01')
  include_backlog = $true
  trigger_source = 'gate_inadimplencia_v3_tres_competencias'
} | ConvertTo-Json

$backlogJob = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys' `
  -Headers $financeHeaders `
  -Body $backlogBody
```

Processar a fila sequencialmente com chamadas `mode='worker'`, uma por vez. Quando houver 429, aguardar o horário persistido em `next_attempt_at`; quando houver `identificador invalido em matricula_id`, confirmar que o item foi auditado/quarentenado, não descartado e não cobrado. Comunicar progresso ao usuário entre esperas; nenhuma espera bloqueante ultrapassa 60 segundos.

- [ ] **Step 6: Consultar o canônico de Campo Grande**

```powershell
$canonicalBody = @{
  p_unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  p_as_of_date = '2026-08-16'
} | ConvertTo-Json

$canonicalCg = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/rest/v1/rpc/get_inadimplencia_canonica' `
  -Headers $financeHeaders `
  -Body $canonicalBody
```

Validar:

- `schema_version=3`;
- `status` coerente com as pendências;
- `collection_allowed=true` somente em `ok|partial` e antes de `fresh_until`;
- `items` contém apenas abertas, vencidas e confirmadas, com matrícula da
  fatura conhecida exatamente e pessoa atualmente `aluno` por possuir alguma
  matrícula `ativa|trancada`;
- cada `source_missing` está somente em `unknown_invoices`;
- cada identidade opcional inválida está somente em `invalid_identity_invoices`/`validation_issues` e não bloqueia os demais confirmados;
- totais são a soma exata dos itens;
- `valor_atualizado` confere pela fórmula por item;
- `policy.delinquency_rule='d_plus_0'`, `policy.collection_grace_days=2` e `operational.consumer_must_apply_collection_grace=true`;
- junho, julho e agosto presentes quando têm dívida ativa; maio e anteriores ausentes.

- [ ] **Step 7: Reconciliar os dois universos sem mascarar diferença**

Usar a tela do Emusys e os três XLSX para produzir duas equações:

```text
Emusys bruto da competência
- pessoas sem qualquer matrícula atual ativa|trancada
- matrículas atuais arquivadas
- saídas no fallback sem estado Emusys atual
- matrícula da fatura desconhecida ou student_id divergente
- source_missing não confirmado
= itens canônicos confirmados

sum(valor_original dos itens canônicos)
= total_original canônico

itens canônicos D+0
- itens com dias_atraso < 2
= carteira amigável D+2 da Sol/Farmer
```

Toda diferença deve ter lista de `unidade_id + emusys_matricula_id + canonical_fatura_id` e um motivo verificável. Não aprovar por “total próximo”. Não usar nome como prova de identidade. Para cada fatura vencida, comparar também o `juros_e_multa` da consulta ao vivo com `valor_atualizado - valor_original`; a fórmula contratual continua prevalecendo, mas toda divergência deve ser explicada e registrada.

- [ ] **Step 8: Fazer dry-run da Sol sem mensagens**

```powershell
$solBody = @{
  p_unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  p_carencia_dias = 2
  p_multa_pct = 0.02
  p_mora_pct_mes = 0.01
  p_grave_dias = 30
  p_critico_dias = 40
} | ConvertTo-Json

$solCg = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/rest/v1/rpc/sol_caixa_inadimplentes' `
  -Headers $financeHeaders `
  -Body $solBody
```

Comparar alunos, matrículas, parcelas e valores da Sol aos mesmos `items` canônicos após `dias_atraso >= 2`. Provar o limite com ao menos um caso de 1 dia excluído e um de 2 dias incluído. Confirmar explicitamente que nenhuma função de envio/mensagem foi chamada.

- [ ] **Step 9: Validar exportação canônica**

Com `LA_REPORT_CONTAS_RECEBER_SECRET` disponível sem imprimir:

```powershell
if ([string]::IsNullOrWhiteSpace($env:LA_REPORT_CONTAS_RECEBER_SECRET)) {
  throw 'LA_REPORT_CONTAS_RECEBER_SECRET nao configurada'
}
$exportHeaders = @{
  'x-super-folha-sync-secret' = $env:LA_REPORT_CONTAS_RECEBER_SECRET
  'Content-Type' = 'application/json'
}
$exportBody = @{
  modo = 'inadimplencia'
  unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  as_of_date = '2026-08-16'
} | ConvertTo-Json
$exportCg = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/export-contas-receber' `
  -Headers $exportHeaders `
  -Body $exportBody
```

O manifesto e os itens devem coincidir com o canônico D+0; `source_missing` e identidade inválida não aparecem nas linhas. Confirmar `collection_grace_applied=false` para impedir que a exportação seja interpretada como carteira pronta para contato.

- [ ] **Step 10: Fazer prova autenticada no navegador**

Abrir produção em uma sessão real autenticada e validar Campo Grande em `/app/alunos`:

1. banner da Lista mostra confirmados D+0 e reconciliação em linhas distintas, sem a frase “cobrança liberada”;
2. em `partial`, o filtro de inadimplentes confirmados funciona;
3. nenhuma matrícula em `unknown_invoices` aparece filtrada;
4. “Atualizar agora” mostra `retry_wait` como processamento, nunca sucesso;
5. recarregar a página mantém os mesmos números;
6. após simular/aguardar expiração do frescor, ações ficam bloqueadas;
7. console sem erros novos e requests da RPC/Edge sem 4xx/5xx inesperados;
8. Farmer mostra somente elegíveis D+2, com título explícito “cobrança amigável D+2” e avisos separados.

Vercel `Ready` e HTTP 200 não substituem esta prova.

- [ ] **Step 11: Repetir o gate para Barra e Recreio**

Após Campo Grande verde, repetir a comparação bruta → recorte ativo → canônico → Sol → export para Barra e Recreio. Usar o mesmo instante de corte e registrar diferenças individualmente. Não ligar cron/mensagens mesmo se as três unidades estiverem verdes; a ativação continua sendo decisão humana posterior.

- [ ] **Step 12: Versionar a evidência sem PII ou segredos**

Criar `docs/audits/2026-08-16-inadimplencia-canonica-v3-validacao.md` com:

- hashes de commit/deploy/migrations;
- horários de cada snapshot;
- contagens e totais por unidade/competência;
- equação bruto → ativo → confirmado;
- quantidades por motivo de exclusão;
- hashes/IDs canônicos necessários à prova, sem telefone, token ou contato;
- resultado da Sol/export/UI;
- pendências remanescentes e decisão explícita de não ativar mensagens.

```powershell
git add docs/audits/2026-08-16-inadimplencia-canonica-v3-validacao.md
git commit -m "docs(financeiro): registrar gate produtivo da inadimplencia v3"
git push origin main
```

## Task 12: Entregar o contrato autocontido ao Claude para a Sol

**Files:**

- Create: `docs/handoffs/2026-08-16-sol-inadimplencia-canonica-v3.md`

- [ ] **Step 1: Escrever o handoff técnico sem fonte paralela**

O documento deve informar:

- endpoint único: `public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)`;
- cadeia: Sol → RPC da Sol → `get_inadimplencia_canonica` → snapshots;
- assinatura e exemplo de request sem segredo;
- semântica de `canonical_status`, `collection_allowed`, `collection_scope`, `fresh_until`, `source_missing_count`, totais, faixas e alunos;
- canônico é verdade financeira D+0; a RPC da Sol aplica obrigatoriamente a carência amigável D+2;
- `partial` é acionável somente nos itens retornados que já passaram por `p_carencia_dias=2`;
- `stale`, `incomplete`, `error`, frescor expirado ou `collection_allowed=false` impedem mensagens;
- taxas obrigatórias 0.02/0.01;
- proibição de consultar `sync_run_items`, `emusys_faturas`, booleano legado ou Emusys diretamente;
- proibição de disparar sync paralelo;
- não chamar as RPCs de caixa fora do fluxo já mantido pela Sol;
- primeira execução em dry-run, sem mensagem.

- [ ] **Step 2: Incluir checklist de validação do Claude**

Checklist mínimo:

```text
[ ] chamar uma unidade com carência 2 e taxas fixas
[ ] confirmar canonical_delinquency_rule=d_plus_0 e carencia_dias=2
[ ] rejeitar resposta se collection_allowed=false
[ ] rejeitar resposta se agora >= fresh_until
[ ] comparar total_alunos e total_atualizado com o gate assinado
[ ] confirmar source_missing_count apenas informativo
[ ] confirmar identidades inválidas apenas em diagnóstico, nunca em alunos
[ ] registrar payload/hash do dry-run
[ ] mostrar lista ao Alfredo para aprovação
[ ] não enviar mensagem até autorização explícita
```

- [ ] **Step 3: Gerar o prompt pronto para colar no Claude**

No final do handoff, incluir um prompt em português que mande o Claude:

1. ler o contrato versionado;
2. descartar/substituir qualquer `sol_caixa_inadimplentes` paralela criada do lado da Sol;
3. usar somente a RPC pública acordada;
4. executar dry-run de Campo Grande;
5. devolver comparação de itens/totais e gate, sem enviar mensagens;
6. parar se qualquer campo de segurança estiver ausente ou vencido.

- [ ] **Step 4: Revisar, versionar e entregar**

```powershell
rg -n "service_role|secret|token|telefone|whatsapp" docs/handoffs/2026-08-16-sol-inadimplencia-canonica-v3.md
git diff --check
git add docs/handoffs/2026-08-16-sol-inadimplencia-canonica-v3.md
git commit -m "docs(sol): entregar contrato canonico de inadimplencia v3"
git push origin main
```

O `rg` pode encontrar a palavra `service_role` como regra de permissão, mas não pode encontrar valor de chave, token, telefone ou WhatsApp real.

## Definition of Done

- [ ] migrations locais e remotas sem drift;
- [ ] canônico v3 coberto por PostgreSQL real;
- [ ] `partial` libera somente confirmados e mostra quarentena separada;
- [ ] `stale`/`incomplete` bloqueiam itens, totais e ações;
- [ ] LA Report, Farmer, exportação e Sol usam o mesmo gate;
- [ ] fila única provada para backlog, 429 e ID inválido;
- [ ] junho/julho/agosto comparados item a item com o Emusys;
- [ ] Campo Grande, Barra e Recreio validados em produção;
- [ ] nenhum envio automático realizado;
- [ ] branch, main, migrations, Edge e Vercel publicados e hashes registrados;
- [ ] handoff do Claude entregue;
- [ ] página “Faturas de Alunos” A+C permanece registrada como próximo subprojeto separado.
