# Classificação semântica das faturas de alunos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor e apresentar corretamente o tipo de cada fatura de aluno, separando parcelas de passaporte/taxa de matrícula, lojinha/produto, ingressos e avulsas.

**Architecture:** O SQL canônico derivará o tipo a partir do payload sincronizado do Emusys, usando `numero_parcela` antes da descrição e preservando os valores originais. O adaptador TypeScript validará os novos campos e o React usará o tipo para filtrar e escolher rótulos financeiros, mantendo forma de pagamento como dimensão independente.

**Tech Stack:** PostgreSQL/Supabase migration, TypeScript, React, Tailwind/design system existente, Node test runner.

---

### Task 1: Travar o contrato canônico com testes

**Files:**
- Create: `tests/faturasAlunosTipoFatura.test.mjs`
- Test: `supabase/migrations/20260817161500_financeiro_faturas_reconciliacao_classificacao_origem.sql`
- Test: `supabase/migrations/20260817181117_financeiro_faturas_reconciliacao_remove_motivo_stale.sql`

- [x] **Step 1: Write the failing tests**

  Criar testes que leiam a migration nova quando ela existir e afirmem que o contrato expõe `tipo_fatura`, `numero_parcela` e `total_parcelas_contrato`, que a regra testa `numero_parcela is not null` antes de `passaporte`, e que os cinco rótulos canônicos aparecem na classificação. Também afirmar que o adaptador e a página usam `tipo_fatura`.

- [x] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/faturasAlunosTipoFatura.test.mjs`

  Expected: FAIL porque a migration e o código atuais ainda não expõem os campos semânticos.

- [x] **Step 3: Keep the test focused on the public contract**

  Não testar a implementação privada por posição de coluna; testar apenas os nomes do JSON, a precedência da regra e os rótulos que consumidores precisam conhecer.

### Task 2: Adicionar classificação ao contrato SQL

**Files:**
- Create: `supabase/migrations/20260817192213_financeiro_faturas_tipo_canonico.sql`
- Create: `supabase/migrations/20260817193125_financeiro_faturas_tipo_canonico_set_based.sql`
- Test: `tests/faturasAlunosTipoFatura.test.mjs`

- [x] **Step 1: Criar uma migration versionada com `supabase migration new`**

  Run: `supabase migration new financeiro_faturas_tipo_canonico`

  Usar o arquivo gerado, sem renomear migrations já aplicadas.

- [x] **Step 2: Implementar a função de classificação**

  A migration deve adicionar uma função SQL estável que receba `numero_parcela` e `descricao` e retorne exatamente `parcela`, `passaporte_taxa_matricula`, `lojinha_produto`, `venda_ingressos` ou `avulsa_outro`, com esta precedência:

  ```sql
  case
    when p_numero_parcela is not null then 'parcela'
    when lower(coalesce(p_descricao, '')) like '%passaporte%'
      or lower(coalesce(p_descricao, '')) like '%taxa de matr%' then 'passaporte_taxa_matricula'
    when lower(coalesce(p_descricao, '')) like '%venda no controle de estoque%'
      or lower(coalesce(p_descricao, '')) like '%instrumento%'
      or lower(coalesce(p_descricao, '')) like '%acessor%'
      or lower(coalesce(p_descricao, '')) like '%livro%'
      or lower(coalesce(p_descricao, '')) like '%apostila%'
      or lower(coalesce(p_descricao, '')) like '%caderno%'
      or lower(coalesce(p_descricao, '')) like '%palheta%' then 'lojinha_produto'
    when lower(coalesce(p_descricao, '')) like '%ingresso%'
      or lower(coalesce(p_descricao, '')) like '%session%'
      or lower(coalesce(p_descricao, '')) like '%evento%' then 'venda_ingressos'
    else 'avulsa_outro'
  end
  ```

- [x] **Step 3: Enriquecer os itens normais e de reconciliação**

  Aplicar a função ao payload original do `sync_run_items`, usando o `unidade_id` e `emusys_fatura_id` do item para recuperar `payload->>'numero_parcela'` e `payload->>'total_parcelas_contrato'`. Acrescentar os três campos ao item sem remover campos existentes. O mesmo enriquecimento precisa ocorrer em `items` e `reconciliation.items`. A segunda migration faz o cruzamento em lote, sem uma consulta por fatura.

- [x] **Step 4: Preservar totais e valores**

  Não alterar `valor_original`, `valor_pago`, `desconto_condicional`, juros, status, decisão manual ou reconciliação. A migration deve ser somente uma extensão do JSON canônico.

- [x] **Step 5: Aplicar e validar a migration no Supabase**

  Aplicar a migration pelo fluxo versionado do projeto e consultar a RPC para o snapshot de agosto. Confirmar que a fatura Emusys `29774` da unidade Recreio retorna `tipo_fatura = passaporte_taxa_matricula`, `numero_parcela = null` e valor original 400, e que uma fatura mensal do mesmo aluno retorna `tipo_fatura = parcela` com `numero_parcela` preenchido.

### Task 3: Atualizar adaptador e filtro local

**Files:**
- Modify: `src/lib/faturasAlunosFinanceiras.ts`
- Modify: `tests/faturasAlunosFinanceirasAdapter.test.mjs`
- Test: `tests/faturasAlunosTipoFatura.test.mjs`

- [x] **Step 1: Escrever os casos de adaptador**

  Adicionar fixtures para `passaporte_taxa_matricula` e `parcela`, incluindo `numero_parcela` nulo/preenchido, e afirmar que o parser preserva `total_parcelas_contrato`.

- [x] **Step 2: Executar os testes para observar a falha**

  Run: `node --test tests/faturasAlunosFinanceirasAdapter.test.mjs tests/faturasAlunosTipoFatura.test.mjs`

  Expected: FAIL porque os tipos ainda não fazem parte das interfaces, parser e filtros.

- [x] **Step 3: Adicionar tipos e validação**

  Definir `FaturaFinanceiraTipo`, acrescentar `tipo_fatura`, `numero_parcela` e `total_parcelas_contrato` aos itens normais e de reconciliação, validar o enum no parser e aceitar inteiros nulos para os números de parcela.

- [x] **Step 4: Adicionar filtro local independente**

  Acrescentar `tipoFatura` ao filtro local e comparar com `item.tipo_fatura`; manter `pagamento` separado. O filtro de tipo deve funcionar mesmo quando a forma de pagamento for cartão, Pix ou ausente.

- [x] **Step 5: Executar os testes do adaptador**

  Run: `node --test tests/faturasAlunosFinanceirasAdapter.test.mjs tests/faturasAlunosTipoFatura.test.mjs`

  Expected: PASS.

### Task 4: Ajustar tabela, detalhes e filtro da página

**Files:**
- Modify: `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`
- Modify: `tests/faturasAlunosFinanceirasFrontend.test.mjs`
- Modify: `tests/faturasAlunosPage.test.mjs`

- [x] **Step 1: Escrever as asserções de UI**

  Cobrir `Tipo da fatura`, os cinco rótulos, o filtro separado da forma de pagamento, o badge de tipo na tabela e os rótulos `Valor da fatura`/`Valor pago` para não-parcelas.

- [x] **Step 2: Executar os testes para observar a falha**

  Run: `node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs`

  Expected: FAIL nos campos e rótulos ainda inexistentes.

- [x] **Step 3: Implementar o filtro visual**

  Ler/escrever o parâmetro `tipo`, gerar opções presentes nos itens e usar o `Select` do design system. A seleção deve coexistir com curso, forma de pagamento, busca e competência.

- [x] **Step 4: Implementar o identificador de tipo**

  Mostrar no cabeçalho/linha um badge com os rótulos humanos, com `Parcela` em destaque neutro, `Passaporte/Taxa de matrícula` em ciano, `Lojinha/Produto` em violeta, `Venda de ingressos` em âmbar e `Avulsa/Outro` em slate. A descrição continuará visível nos detalhes.

- [x] **Step 5: Condicionar os valores**

  Para `parcela`, manter os três valores contratuais. Para os demais tipos, substituir os rótulos de desconto por `Valor da fatura` e `Valor pago`/`Valor atualizado`, sem copiar o valor mensal da matrícula para o lançamento.

- [x] **Step 6: Executar os testes de frontend**

  Run: `node --test tests/faturasAlunosFinanceirasFrontend.test.mjs tests/faturasAlunosPage.test.mjs`

  Expected: PASS.

### Task 5: Verificação completa e entrega

**Files:**
- Verify: `src/lib/faturasAlunosFinanceiras.ts`
- Verify: `src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx`
- Verify: `supabase/migrations/20260817192213_financeiro_faturas_tipo_canonico.sql`
- Verify: `supabase/migrations/20260817193125_financeiro_faturas_tipo_canonico_set_based.sql`

- [x] **Step 1: Rodar a suíte completa**

  Run: `npm test`

  Expected: todos os testes PASS.

- [x] **Step 2: Gerar o build**

  Run: `npm run build`

  Expected: build Vite concluído; avisos de chunk existentes podem permanecer, mas sem erro de TypeScript ou compilação.

- [x] **Step 3: Fazer a prova real no banco**

  Consultar Recreio/agosto na RPC e registrar: Isabela passaporte R$400 classificado como `passaporte_taxa_matricula`; parcelas mensais separadas classificadas como `parcela`; forma de pagamento preservada independentemente do tipo; totais inalterados.

- [x] **Step 4: Verificar o diff e o estado do repositório**

  Run: `git diff --check; git status --short --branch`

  Expected: nenhum erro de whitespace e somente arquivos da especificação, migration, adaptador, página e testes.

- [x] **Step 5: Commitar e publicar**

  Run: `git add docs/superpowers/specs docs/superpowers/plans supabase/migrations src/lib/faturasAlunosFinanceiras.ts src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx tests && git commit -m "feat: classificar tipos de faturas de alunos" && git push origin main`

  Expected: commit criado e `main` sincronizada com `origin/main`.
