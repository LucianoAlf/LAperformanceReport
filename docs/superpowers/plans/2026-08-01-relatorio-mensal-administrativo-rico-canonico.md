# Relatorio Mensal Administrativo Rico E Canonico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o botao do Relatorio Mensal Administrativo reproduzir o modelo rico de junho com os dados fechados de julho, acrescentando multicurso e trancamentos sem alterar qualquer snapshot.

**Architecture:** Uma nova RPC estavel e somente leitura compoe o payload mensal fechado com as duas fotografias-base exatas que ele referencia, valida unidade, competencia e hashes, e devolve apenas os indicadores necessarios ao documento. O unico campo omitido em julho, `trancamentos_periodo`, e reconstruido pela fonte canonica com corte em `capturado_em` e verificacao da auditoria; competencias futuras passam a captura-lo no payload. A Edge continua sendo a produtora unica do texto; o renderizador puro recebe esse payload enriquecido, preserva o modelo de junho e falha fechado diante de divergencias.

**Tech Stack:** PostgreSQL/Supabase RPC, Supabase Edge Functions em Deno/TypeScript, Node test runner, Deno tests e React ja integrado ao modo manual mensal.

---

### Task 1: Leitura rica sem alterar o fechamento

**Files:**
- Create: `tests/relatorioAdminMensalRicoCanonico.test.mjs`
- Create: `supabase/migrations/20260801140115_relatorio_admin_mensal_rico_canonico.sql`

- [ ] **Step 1: Escrever o teste RED do contrato SQL**

Criar um teste que leia a nova migration com `readSqlContract` e exija uma funcao administrativa separada, referencias exatas e ausencia de escrita:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { maskSqlStringLiterals, readSqlContract } from './helpers/sqlContractHelpers.mjs';

const migration = readSqlContract(
  import.meta.url,
  'supabase/migrations/20260801140115_relatorio_admin_mensal_rico_canonico.sql',
);

test('leitura mensal administrativa compoe somente snapshots fechados referenciados', () => {
  assert.equal(migration.exists, true, 'migration de leitura rica ainda nao existe');
  const sql = maskSqlStringLiterals(migration.executable);
  assert.match(sql, /get_relatorio_admin_mensal_rico_v1/i);
  assert.match(migration.source, /fontes[\s\S]*alunos_admin[\s\S]*snapshot_id/i);
  assert.match(migration.source, /fontes[\s\S]*relatorio_gerencial[\s\S]*snapshot_id/i);
  assert.match(sql, /status\s*=\s*'fechado'/i);
  assert.match(sql, /hash_jsonb_canonico/i);
  assert.match(sql, /pode_gerar_relatorio_admin_v1/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\b[\s\S]*fechamento_mensal_snapshots/i);
});

test('payload rico normaliza financeiro retencao metas e trancamentos do periodo', () => {
  assert.match(migration.source, /indicadores_financeiros/i);
  assert.match(migration.source, /indicadores_retencao/i);
  assert.match(migration.source, /metas_fideliza/i);
  assert.match(migration.source, /trancamentos_periodo/i);
  assert.match(migration.source, /movimentacoes_admin/i);
  assert.match(migration.source, /audit_log/i);
  assert.match(migration.source, /capturado_em/i);
  assert.match(migration.source, /TRANCAMENTOS_MENSAL_DIVERGENTE/i);
  assert.match(migration.source, /inadimplentes[\s\S]*alunos_pagantes/i);
  assert.match(migration.source, /evasoes_base_alunos[\s\S]*nao_renovacoes/i);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run:

```powershell
node --test tests/relatorioAdminMensalRicoCanonico.test.mjs
```

Expected: FAIL com `migration de leitura rica ainda nao existe`.

- [ ] **Step 3: Implementar a RPC de composicao somente leitura**

Criar `public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) returns jsonb` como `stable security definer`. O corpo deve:

```sql
-- 1. Autorizar a unidade.
v_autorizado := public.pode_gerar_relatorio_admin_v1(p_unidade_id);
if auth.role() <> 'service_role'
   and session_user not in ('postgres', 'supabase_admin')
   and coalesce(v_autorizado, false) is not true then
  raise exception 'ACESSO_NEGADO_RELATORIO_MENSAL';
end if;

-- 2. Ler o documento mensal fechado e conferir seu hash.
select * into v_mensal
from public.fechamento_mensal_snapshots s
where s.unidade_id = p_unidade_id
  and s.ano = p_ano and s.mes = p_mes
  and s.escopo = 'unidade'
  and s.dominio = 'relatorio_admin_mensal'
  and s.status = 'fechado'
order by s.versao desc
limit 1;

if v_mensal.id is null
   or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash then
  raise exception 'RELATORIO_ADMIN_MENSAL_FECHADO_INVALIDO';
end if;

-- 3. Resolver as duas referencias exatas gravadas no documento.
v_admin_id := nullif(v_mensal.payload#>>'{fontes,alunos_admin,snapshot_id}', '')::uuid;
v_admin_hash := nullif(v_mensal.payload#>>'{fontes,alunos_admin,payload_hash}', '');
v_gerencial_id := nullif(v_mensal.payload#>>'{fontes,relatorio_gerencial,snapshot_id}', '')::uuid;
v_gerencial_hash := nullif(v_mensal.payload#>>'{fontes,relatorio_gerencial,payload_hash}', '');
```

Para cada referencia, selecionar por `id`, exigir a mesma unidade/competencia, o dominio correto e `status = 'fechado'`, e comparar `hash_jsonb_canonico(payload)`, `payload_hash` da linha e hash gravado no documento mensal.

Normalizar os blocos fechados:

```sql
v_financeiro := coalesce(
  v_gerencial.payload#>'{financeiro_faturas_emusys,totais}',
  v_gerencial.payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
  '{}'::jsonb
);
v_gestao := case jsonb_typeof(v_gerencial.payload->'kpis_gestao')
  when 'array' then coalesce(v_gerencial.payload->'kpis_gestao'->0, '{}'::jsonb)
  when 'object' then v_gerencial.payload->'kpis_gestao'
  else '{}'::jsonb
end;
v_retencao := case jsonb_typeof(v_gerencial.payload->'kpis_retencao')
  when 'array' then coalesce(v_gerencial.payload->'kpis_retencao'->0, '{}'::jsonb)
  when 'object' then v_gerencial.payload->'kpis_retencao'
  else '{}'::jsonb
end;
```

Converter `metas_kpi` em objeto por `tipo`. Aceitar somente as duas formas ja congeladas no dominio gerencial: array de `{ tipo, valor }` ou objeto indexado por tipo. Ausencia dos quatro tipos `churn_rate`, `inadimplencia`, `taxa_renovacao` e `reajuste_medio` deve falhar fechado.

Para `trancamentos_periodo`, primeiro usar `resumo.trancamentos_periodo` quando o documento futuro ja o possuir. Para julho, onde o campo inexiste, verificar `audit_log` antes de contar. A verificacao procura `INSERT`, `UPDATE` ou `DELETE` posterior a `v_mensal.capturado_em` cujo `dados_antigos` ou `dados_novos` identifique a mesma unidade, `tipo = 'trancamento'` e competencia mensal; insercoes so bloqueiam quando o registro novo tenta entrar retroativamente no recorte fechado. Se existir qualquer linha relevante, levantar `TRANCAMENTOS_MENSAL_DIVERGENTE`. Sem divergencia, contar:

```sql
select count(*)::integer into v_trancamentos_periodo
from public.movimentacoes_admin m
where m.unidade_id = p_unidade_id
  and m.tipo = 'trancamento'
  and coalesce(m.competencia_referencia, m.data) >= make_date(p_ano, p_mes, 1)
  and coalesce(m.competencia_referencia, m.data) < (make_date(p_ano, p_mes, 1) + interval '1 month')::date
  and m.created_at <= v_mensal.capturado_em;
```

Retornar o mesmo envelope da RPC mensal existente, mas com o payload enriquecido por:

```sql
jsonb_build_object(
  'trancamentos_periodo', v_trancamentos_periodo,
  'indicadores_financeiros', jsonb_build_object(
    'ticket_medio', nullif(v_financeiro->>'ticket_medio', '')::numeric,
    'faturamento_previsto', nullif(v_financeiro->>'faturamento_previsto', '')::numeric,
    'mrr_atual', nullif(v_financeiro->>'mrr_atual', '')::numeric,
    'ltv_medio', nullif(v_gestao->>'ltv_medio', '')::numeric,
    'tempo_permanencia', coalesce(
      nullif(v_gestao->>'tempo_permanencia_medio', '')::numeric,
      nullif(v_gestao->>'tempo_permanencia', '')::numeric
    )
  ),
  'indicadores_retencao', jsonb_build_object(
    'churn_rate', round(
      (coalesce((v_retencao->>'evasoes_base_alunos')::numeric, 0)
       + coalesce((v_mensal.payload#>>'{resumo,nao_renovacoes}')::numeric, 0))
      / nullif((v_mensal.payload#>>'{resumo,alunos_pagantes}')::numeric, 0) * 100,
      2
    ),
    'taxa_renovacao', nullif(v_retencao->>'taxa_renovacao', '')::numeric,
    'reajuste_medio', nullif(v_gestao->>'reajuste_medio', '')::numeric,
    'inadimplentes', coalesce((v_gestao->>'inadimplentes')::integer, 0),
    'inadimplencia', round(
      coalesce((v_gestao->>'inadimplentes')::numeric, 0)
      / nullif((v_mensal.payload#>>'{resumo,alunos_pagantes}')::numeric, 0) * 100,
      2
    ),
    'mrr_perdido', nullif(v_retencao->>'mrr_perdido', '')::numeric,
    'total_evasoes', (v_mensal.payload#>>'{resumo,evasoes}')::integer,
    'nao_renovacoes', (v_mensal.payload#>>'{resumo,nao_renovacoes}')::integer,
    'renovacoes_previstas', nullif(v_retencao->>'renovacoes_previstas', '')::integer,
    'renovacoes_realizadas', nullif(v_retencao->>'renovacoes_realizadas', '')::integer
  ),
  'metas_fideliza', v_metas
)
```

Revogar execucao de `public` e `anon`; conceder a `authenticated` e `service_role`.

Envolver tambem `montar_relatorio_admin_mensal_payload_v1` para competencias futuras: chamar a versao-base existente, contar os trancamentos da competencia ate `capturado_em` e gravar o valor em `resumo.trancamentos_periodo` antes que um novo documento seja fechado. Esse wrapper nao e executado contra julho e nao altera snapshots existentes.

- [ ] **Step 4: Rodar o contrato GREEN e a regressao SQL existente**

Run:

```powershell
node --test tests/relatorioAdminMensalRicoCanonico.test.mjs tests/relatoriosMensaisFechamentoCanonico.test.mjs tests/relatoriosMensaisCorrecaoAdminCanonico.test.mjs tests/relatoriosMensaisEvasaoSegundoCurso.test.mjs
```

Expected: todos os testes aprovados.

- [ ] **Step 5: Commit da leitura rica**

```powershell
git add tests/relatorioAdminMensalRicoCanonico.test.mjs supabase/migrations/20260801140115_relatorio_admin_mensal_rico_canonico.sql
git commit -m "feat: compor leitura rica do mensal administrativo"
```

### Task 2: Renderizador no modelo ouro de junho

**Files:**
- Modify: `supabase/functions/_shared/relatorios-mensais-canonicos.test.ts`
- Modify: `supabase/functions/_shared/relatorios-mensais-canonicos.ts`

- [ ] **Step 1: Escrever testes RED da riqueza e da ordem das secoes**

Adicionar uma fixture administrativa com `gerado_em`, equipe, indicadores, metas, uma renovacao, uma nao renovacao, um aviso, uma evasao e dois trancamentos. Exigir:

```ts
assertStringIncludes(texto, "📊 *RELATÓRIO MENSAL ADMINISTRATIVO*");
assertStringIncludes(texto, "👥 Por Fernanda e Daiana");
assertStringIncludes(texto, "• Matrículas Ativas: *430* (344 base alunos + 59 banda + 27 adicionais)");
assertStringIncludes(texto, "• Alunos com 3 cursos: *1*");
assertStringIncludes(texto, "⏸️ *TRANCAMENTOS ATUAIS");
assertStringIncludes(texto, "Retorno previsto: 31/07/2026");
assertStringIncludes(texto, "💰 *KPIs FINANCEIROS*");
assertStringIncludes(texto, "• Faturamento Previsto: *R$ 142.925,20*");
assertStringIncludes(texto, "• LTV (Tempo × Ticket): *R$ 6.692,34*");
assertStringIncludes(texto, "📈 *KPIs DE RETENÇÃO*");
assertStringIncludes(texto, "• Inadimplência: *1,2%*");
assertStringIncludes(texto, "🎯 *METAS FIDELIZA+ LA*");
assertStringIncludes(texto, "Forma de PG: C.R");
assertStringIncludes(texto, "⚠️ *AVISOS PRÉVIOS para sair em AGOSTO*");
assertStringIncludes(texto, "📅 Gerado em: 01/08/2026 às 10:30");
```

Comparar os indices de cada titulo para provar a ordem aprovada. Proibir termos internos:

```ts
for (const proibido of ["snapshot", "payload", "get_", "rpc", "endpoint", "hash", "v1"]) {
  assertFalse(texto.toLowerCase().includes(proibido));
}
assertFalse(/\(\d+\/\d+\)/.test(texto));
```

- [ ] **Step 2: Escrever testes RED de invariantes e evasoes**

Exigir que o renderizador lance erro quando quantidade oficial divergir de detalhes de renovacoes, nao renovacoes ou avisos. Para evasoes, provar que `5` interrupcoes mais `2` nao renovacoes produzem total e sete itens, com a quebra por tipo.

Run:

```powershell
deno test supabase/functions/_shared/relatorios-mensais-canonicos.test.ts
```

Expected: FAIL porque o renderizador atual e resumido e nao possui os indicadores ou o modelo de junho.

- [ ] **Step 3: Implementar helpers puros de apresentacao**

Adicionar helpers locais para:

```ts
function equipeAdministrativa(unidade: JsonObject): string;
function mesSeguinte(payload: JsonObject): string;
function percentualInteiro(value: unknown): string;
function gerarBarraMeta(atual: number, meta: number, inversa: boolean): string;
function validarQuantidade(nome: string, total: unknown, itens: JsonObject[]): void;
function classificarEvasao(item: JsonObject): string;
function dataHoraBrasil(value: unknown): string;
```

`equipeAdministrativa` combina gerente e farmers, remove duplicatas sem diferenciar maiusculas/minusculas e usa `Equipe Administrativa` apenas quando ambos estiverem vazios.

`dataHoraBrasil` interpreta ISO explicitamente no fuso `America/Sao_Paulo` e imprime `dd/MM/yyyy às HH:mm`.

- [ ] **Step 4: Substituir somente o formatador administrativo**

Reescrever `formatarRelatorioAdminMensalCanonico` com a ordem da especificacao. Manter `formatarRelatorioComercialMensalCanonico` byte a byte inalterado nesta tarefa.

As listas devem usar estes campos:

```ts
// Renovacao
aluno_nome, valor_parcela_anterior, valor_parcela_novo,
forma_pagamento, agente_comercial

// Nao renovacao
aluno_nome, valor_parcela_anterior, valor_parcela_novo,
professor, motivo

// Aviso
aluno_nome, motivo, professor

// Evasao
aluno_nome, tipo_evasao, valor_perdido, motivo, professor
```

A lista de evasoes concatena `payload.evasoes` com `payload.nao_renovacoes`, marcando os itens da segunda lista como `nao_renovou`. A quebra soma os itens por classificacao e o total precisa ser igual a `resumo.evasoes`.

O relatorio termina apenas com a data/hora de geracao e o separador. Nao incluir rodape de fonte ou diagnostico tecnico.

- [ ] **Step 5: Rodar GREEN e confirmar que o Comercial nao mudou**

Run:

```powershell
deno test supabase/functions/_shared/relatorios-mensais-canonicos.test.ts
git diff -- supabase/functions/_shared/relatorios-mensais-canonicos.ts
```

Expected: testes aprovados e diff limitado ao formatador administrativo e helpers compartilhados necessarios.

- [ ] **Step 6: Commit do modelo publico**

```powershell
git add supabase/functions/_shared/relatorios-mensais-canonicos.ts supabase/functions/_shared/relatorios-mensais-canonicos.test.ts
git commit -m "feat: restaurar riqueza do mensal administrativo"
```

### Task 3: Edge administrativa usa a leitura rica

**Files:**
- Modify: `tests/relatoriosMensaisBotoesCanonicos.test.mjs`
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`

- [ ] **Step 1: Escrever teste RED de roteamento sem afetar o Comercial**

Exigir no teste de contrato:

```js
assert.match(edge, /dry_run_mensal_admin[\s\S]*get_relatorio_admin_mensal_rico_v1/i);
assert.match(edge, /dry_run_mensal_comercial[\s\S]*get_relatorio_mensal_canonico_v1/i);
assert.match(edge, /gerado_em[\s\S]*new Date\(\)\.toISOString\(\)/i);
```

Run:

```powershell
node --test tests/relatoriosMensaisBotoesCanonicos.test.mjs
```

Expected: FAIL porque os dois modos ainda chamam a RPC generica.

- [ ] **Step 2: Integrar a RPC administrativa**

No ramo mensal da Edge, escolher a RPC por tipo:

```ts
const rpcMensal = tipo === 'administrativo'
  ? 'get_relatorio_admin_mensal_rico_v1'
  : 'get_relatorio_mensal_canonico_v1';

const rpcParams = tipo === 'administrativo'
  ? { p_unidade_id: payload.unidade, p_ano: payload.ano, p_mes: payload.mes }
  : { p_tipo: tipo, p_unidade_id: payload.unidade, p_ano: payload.ano, p_mes: payload.mes };
```

Antes de chamar o formatador administrativo, criar um novo objeto sem mutar o retorno:

```ts
const dadosPublicos = tipo === 'administrativo'
  ? { ...dados, gerado_em: new Date().toISOString() }
  : dados;
```

Erros internos de hash, referencia ou bloco ausente devem sair como `O fechamento administrativo deste mes esta inconsistente. Avise o suporte.` sem expor o codigo tecnico.

- [ ] **Step 3: Rodar testes e checks direcionados**

Run:

```powershell
node --test tests/relatoriosMensaisBotoesCanonicos.test.mjs tests/relatorioAdminMensalRicoCanonico.test.mjs
deno test supabase/functions/_shared/relatorios-mensais-canonicos.test.ts
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
```

Expected: todos aprovados.

- [ ] **Step 4: Commit da integracao administrativa**

```powershell
git add tests/relatoriosMensaisBotoesCanonicos.test.mjs supabase/functions/relatorio-admin-whatsapp/index.ts
git commit -m "fix: servir mensal administrativo rico pela edge"
```

### Task 4: Verificacao integral e previa real do Recreio

**Files:**
- No tracked files added.

- [ ] **Step 1: Executar a regressao completa direcionada**

Run:

```powershell
node --test tests/relatorioAdminMensalRicoCanonico.test.mjs tests/relatoriosMensaisFechamentoCanonico.test.mjs tests/relatoriosMensaisCorrecaoAdminCanonico.test.mjs tests/relatoriosMensaisEvasaoSegundoCurso.test.mjs tests/relatoriosMensaisBotoesCanonicos.test.mjs
deno test supabase/functions/_shared/relatorios-mensais-canonicos.test.ts
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
npm run build
git diff --check
```

Expected: exit 0 em todos; warnings antigos de bundle nao contam como falha, mas devem ser relatados.

- [ ] **Step 2: Conferir o projeto remoto e as fontes fechadas em modo somente leitura**

Confirmar a URL do projeto e consultar o documento mensal do Recreio e seus dois IDs referenciados. A consulta deve retornar somente:

```sql
with unidade as (
  select id from public.unidades where lower(nome) = 'recreio' limit 1
), mensal as (
  select s.*
  from public.fechamento_mensal_snapshots s
  join unidade u on u.id = s.unidade_id
  where s.ano = 2026 and s.mes = 7
    and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc
  limit 1
), referencias as (
  select id from mensal
  union all
  select (payload#>>'{fontes,alunos_admin,snapshot_id}')::uuid from mensal
  union all
  select (payload#>>'{fontes,relatorio_gerencial,snapshot_id}')::uuid from mensal
)
select s.id, s.unidade_id, s.ano, s.mes, s.dominio, s.versao, s.status,
       s.payload_hash,
       public.hash_jsonb_canonico(s.payload) = s.payload_hash as hash_valido,
       s.payload
from public.fechamento_mensal_snapshots s
where s.id in (select id from referencias)
order by s.dominio;
```

Nao executar `insert`, `update`, `delete`, captura ou retificacao.

- [ ] **Step 3: Gerar a previa local com os dados fechados**

Montar em memoria o mesmo payload que a nova RPC retornara, chamar `formatarRelatorioAdminMensalCanonico` com `gerado_em` fixo e salvar a saida apenas como artefato temporario fora do Git. Conferir estes invariantes do Recreio:

```text
Ativos 344; pagantes 336; nao pagantes 8.
Matriculas ativas 430 = 344 base + 59 banda + 27 adicionais.
25 pessoas com 2 cursos; 1 com 3 cursos; 0 com 4 ou mais.
3 alunos e 3 matriculas trancadas no fechamento.
3 trancamentos no periodo, reconstruidos sem alteracao posterior na auditoria.
23 renovacoes; 2 nao renovacoes; 10 avisos para agosto.
7 evasoes detalhadas = 5 interrupcoes + 2 nao renovacoes.
Ticket 449,15; faturamento 142.925,20; MRR 141.032,20.
Churn 1,8%; inadimplencia 1,2%; MRR perdido 2.412,85.
```

Confirmar tambem a matriz das tres unidades: Barra `5 no periodo / 6 alunos / 6 matriculas`, Recreio `3/3/3` e Campo Grande `18/16/17`, sempre com zero alteracoes posteriores ao fechamento.

- [ ] **Step 4: Entregar a previa ao usuario e parar para aceite**

Apresentar o texto integral do Recreio e um quadro curto de comparacao com o diario de 31/07. Nao aplicar migration nem publicar nova versao da Edge antes desse aceite.

### Task 5: Publicacao administrativa apos aceite da previa

**Files:**
- Modify: `docs/METRICAS.md`

- [ ] **Step 1: Confirmar novamente que a migration e somente leitura**

Run:

```powershell
rg -n "\b(insert|update|delete)\b" supabase/migrations/20260801140115_relatorio_admin_mensal_rico_canonico.sql
git diff --check
```

Expected: nenhuma escrita em `fechamento_mensal_snapshots`; apenas `create function`, ACL e comentarios.

- [ ] **Step 2: Aplicar a migration aditiva e validar a RPC**

Aplicar `20260801140115_relatorio_admin_mensal_rico_canonico.sql` no projeto confirmado. Depois chamar a RPC como `service_role` para Recreio/julho e confirmar `status = fechado`, os mesmos IDs/hashes e o payload rico, sem qualquer nova linha de snapshot.

- [ ] **Step 3: Publicar somente a Edge administrativa compartilhada**

Publicar `relatorio-admin-whatsapp` preservando a configuracao JWT vigente. Nao publicar frontend nem alterar o modo Comercial.

- [ ] **Step 4: Smoke test autenticado do botao administrativo**

Gerar julho pelo botao do Recreio e comparar o texto com a previa aprovada. Confirmar uma unica mensagem de relatorio, datas brasileiras e ausencia de termos tecnicos.

- [ ] **Step 5: Atualizar a documentacao e verificar novamente**

Registrar em `docs/METRICAS.md` que o mensal administrativo le o documento fechado e as duas fotografias-base referenciadas, sem recalculo vivo. Repetir testes, Deno check, build e `git diff --check`.

- [ ] **Step 6: Commit local da documentacao**

```powershell
git add docs/METRICAS.md
git commit -m "docs: registrar mensal administrativo rico"
```

Nao fazer push, abrir PR ou merge. Depois do aceite administrativo, iniciar um plano separado para o Relatorio Mensal Comercial.
