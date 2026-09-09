# Coordenação V4: Cutover dos Relatórios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer painel, relatório narrativo e quatro relatórios determinísticos lerem a mesma versão V4, com linguagem simples, Top 10 e sem zeros fabricados.

**Architecture:** O nome V3 permanece como wrapper de compatibilidade, mas passa a devolver o documento V4 já materializado. Modal e Edge leem explicitamente o V4; números são sempre formatados de modo determinístico e a IA recebe somente sinais qualitativos.

**Tech Stack:** React, TypeScript, Supabase Edge Functions/Deno, PostgreSQL, Node test runner, Vite, Playwright e Vercel.

---

## Arquivos e responsabilidades

- Create: `tests/relatorioCoordenacaoCutoverV4.test.mjs` — contrato dos cinco relatórios, Top 10, linguagem pública e null.
- Create: `tests/relatorioCoordenacaoCutoverV4Postgres.test.mjs` — wrapper atômico e leitor rápido.
- Modify: `supabase/migrations/20260909031112_relatorio_coordenacao_cutover_v4.sql` — wrapper V3 e agendamento diário V4.
- Modify: `src/lib/relatorioCoordenacaoCanonico.ts` — schema V4, Top 10 e formatação sem zero falso.
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx` — leitura V4 e pinagem do documento.
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts` — leitura V4, números determinísticos e vocabulário público.
- Modify: `src/types/database.types.ts` — assinatura gerada do leitor V4.
- Create: `docs/auditorias/2026-09-09-coordenacao-v4-producao.md` — prova SQL, API e navegador.

### Task 1: Escrever regressões do cutover em vermelho

**Files:**

- Create: `tests/relatorioCoordenacaoCutoverV4.test.mjs`
- Create: `tests/relatorioCoordenacaoCutoverV4Postgres.test.mjs`

- [ ] **Step 1: Testar os cinco consumidores**

```js
assert.match(modal, /get_relatorio_coordenacao_documento_v4/);
assert.match(edge, /get_relatorio_coordenacao_documento_v4/);
assert.match(sql, /get_relatorio_coordenacao_documento_v4/);
assert.doesNotMatch(readerV3Body, /montar_relatorio_coordenacao_payload_v3/);
```

- [ ] **Step 2: Testar Top 10 em todos os blocos aplicáveis**

Gerar fixture com 12 professores e afirmar dez linhas em Maior Carteira, Maior Volume de Turmas, Média/Turma, Permanência, Retenção, Presença, Matriculador e Conversão.

- [ ] **Step 3: Testar linguagem pública**

```js
for (const termo of ['canônico', 'RPC', 'snapshot', 'migration', 'dados em auditoria']) {
  assert.doesNotMatch(relatorio.toLowerCase(), new RegExp(termo.toLowerCase()));
}
assert.match(relatorio, /Ciclo em acompanhamento/);
assert.match(relatorio, /Ordem do painel/);
assert.doesNotMatch(relatorio, /premiação oficial[\s\S]*1\./i);
```

- [ ] **Step 4: Testar null monetário e contagem ausente**

O movimento com `valor_mrr:null` deve exibir `Valor não informado`; um Matriculador sem origem não entra no Top 10 e nunca aparece com zero.

- [ ] **Step 5: Rodar os testes em vermelho**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoCutoverV4.test.mjs tests/relatorioCoordenacaoCutoverV4Postgres.test.mjs
```

Expected: FAIL porque consumidores ainda chamam V3, schema 4 é rejeitado e dois rankings de carteira limitam em cinco.

### Task 2: Implementar cutover atômico de banco

**Files:**

- Modify: `supabase/migrations/20260909031112_relatorio_coordenacao_cutover_v4.sql`

- [ ] **Step 1: Transformar V3 em wrapper de compatibilidade**

```sql
create or replace function public.get_relatorio_coordenacao_canonico_v3(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_periodicidade text default 'mensal'
) returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $function$
  select public.get_relatorio_coordenacao_documento_v4(
    p_unidade_id, p_ano, p_mes, p_periodicidade
  );
$function$;
```

Preservar os grants atuais do V3. O wrapper não pode conter consulta operacional.

- [ ] **Step 2: Criar o job diário do documento V4**

Criar wrapper `executar_relatorio_coordenacao_documento_v4_diario()` para três unidades e consolidado, mensal aberto e ciclo aberto. Escalonar após a materialização do Health Score; advisory lock e idempotência evitam versões duplicadas.

- [ ] **Step 3: Rodar o PostgreSQL em verde**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
node --test tests/relatorioCoordenacaoCutoverV4Postgres.test.mjs tests/relatorioCoordenacaoDocumentoV4Postgres.test.mjs tests/professoresCicloVivoPresencaTop10Postgres.test.mjs
```

Expected: PASS; V3 e V4 devolvem o mesmo `documento.id`, e o produtor V3 da era anterior não é chamado.

### Task 3: Atualizar formatadores e Edge

**Files:**

- Modify: `src/lib/relatorioCoordenacaoCanonico.ts`
- Modify: `src/components/App/Professores/ModalRelatorioCoordenacao.tsx`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Aceitar schema V4 e fixar identidade do documento**

Adicionar `documento` e `origens` ao tipo; aceitar somente schema 4 no fluxo novo. Modal guarda o objeto recebido e usa o mesmo objeto para copiar, WhatsApp e regeneração visível.

- [ ] **Step 2: Remover coerções de null para zero**

```ts
function inteiroOuIndisponivel(valor: unknown): string {
  const numero = numeroOuNull(valor);
  return numero === null ? 'Não informado' : Math.round(numero).toLocaleString('pt-BR');
}
```

Usar variante opcional em MRR, Matriculador e totais cuja origem possa estar ausente. Zero só é formatado quando o JSON contém zero numérico.

- [ ] **Step 3: Aplicar limite 10 a todos os rankings**

Substituir `.slice(0, 5)` nos rankings de carteira e volume por `LIMITE_DESTAQUES_POR_INDICADOR`; manter alertas pedagógicos limitados a dez.

- [ ] **Step 4: Simplificar a linguagem pública**

Remover menções a “canônico”, “auditoria”, “snapshot”, “RPC”, “migration”, “pilar válido” e fontes internas. Mostrar apenas período, atualização, valor e motivo operacional compreensível. Ciclo aberto usa “em acompanhamento” e “ordem do painel”; ciclo fechado pode usar “ranking oficial”.

- [ ] **Step 5: Garantir IA apenas narrativa**

Edge chama V4, gera todos os nomes/números/rankings localmente e envia ao modelo somente sinais qualitativos para introdução, prioridades e ações. Validar o texto retornado contra a lista de termos proibidos antes de concatenar os blocos determinísticos.

- [ ] **Step 6: Rodar testes, Deno e build**

```powershell
node --test tests/relatorioCoordenacaoCutoverV4.test.mjs tests/relatoriosCoordenacaoCanonicosV2.test.mjs tests/relatoriosCoordenacaoPeriodicidadeV3.test.mjs
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
npm run build
```

Expected: PASS sem warnings novos; os cinco relatórios aceitam o mesmo documento V4.

- [ ] **Step 7: Commit dos consumidores**

```powershell
git add src/lib/relatorioCoordenacaoCanonico.ts src/components/App/Professores/ModalRelatorioCoordenacao.tsx supabase/functions/gemini-relatorio-coordenacao/index.ts src/types/database.types.ts tests/relatorioCoordenacaoCutoverV4*.mjs supabase/migrations/20260909031112_relatorio_coordenacao_cutover_v4.sql
git commit -m "feat(professores): corta relatorios da coordenacao para v4"
```

### Task 4: Verificar, publicar e provar no navegador

**Files:**

- Create: `docs/auditorias/2026-09-09-coordenacao-v4-producao.md`

- [ ] **Step 1: Rodar suíte completa limpa**

```powershell
$env:Path = 'C:\Users\Texeira\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:Path
npm test
npm run build
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
git diff --check
```

- [ ] **Step 2: Aplicar cutover somente após documentos validados**

Confirmar os 12 mensais Jun–Ago, quatro ciclos Jun–Ago e quatro ciclos Set–Nov V4. Aplicar a migration de cutover; em falha, o frontend atual continua intacto e o wrapper pode ser revertido para o leitor V4 anterior sem apagar documentos.

- [ ] **Step 3: Publicar Edge e frontend**

Deploy de `gemini-relatorio-coordenacao` com JWT vigente. Ligar explicitamente o worktree ao projeto Vercel `la-performance-report`, promover para produção e confirmar commit/hash do deployment.

- [ ] **Step 4: Validar SQL/API após reload**

Confirmar `documento.id/hash/versao` iguais nos cinco relatórios, latência abaixo do timeout e zero erros `57014`. Rodar security/performance advisors e registrar apenas novos avisos relacionados à mudança.

- [ ] **Step 5: Validar navegador autenticado**

No browser deixado pelo usuário, testar Barra, Campo Grande, Recreio e Consolidado; mensal junho/julho/agosto/setembro; ciclos Jun–Ago e Set–Nov. Abrir os cinco relatórios, conferir ordem, Top 10, Valdo = 6, presença acumulada, ausência de “Dados em auditoria” e console sem erro após reload.

- [ ] **Step 6: Registrar prova, revisar e integrar**

```powershell
git add docs/auditorias/2026-09-09-coordenacao-v4-producao.md
git commit -m "docs(professores): prova coordenacao v4 em producao"
git push origin fix/professores-ciclo-canonico
```

Usar revisão de código, verificação final e acabamento de branch antes do merge na `main`. Após merge, confirmar o deployment da `main` e repetir a prova curta no navegador.

## Revisão do plano

- Os cinco relatórios e o wrapper legado apontam para um único documento.
- Top 10, null, linguagem pública e distinção entre ordem diagnóstica e ranking oficial têm regressões.
- O cutover só acontece após carga e paridade; nenhuma consulta pesada fica no clique.
- Merge/deploy e prova real em navegador fazem parte da conclusão, conforme autorização do usuário.

