# Diagnóstico da Edge Function `processar-matricula-emusys`

## Data: 2026-06-06
## Status: análise read-only, sem UPDATE e sem migration

---

## Resumo Executivo

O problema principal **não é** a edge function gravar `status_pagamento = 'sem_parcela'` explicitamente.

O diagnóstico atual mostra:

1. A edge function **não define nem atualiza `status_pagamento` em nenhum handler**.
2. `status_pagamento` na tabela `alunos` tem **default de banco = `'em_dia'`**.
3. Mesmo assim, existem matrículas novas/ativas com `status_pagamento = 'sem_parcela'`.
4. Logo, o `sem_parcela` está vindo de **outra camada**:
   - código/deploy mais novo que o repositório local;
   - outro processo/job/update posterior;
   - operação manual/UI;
   - ou divergência entre código local e código efetivamente publicado.
5. A edge function **atualiza contrato usando `data_hora_primeira_aula` e `data_hora_ultima_aula` do payload**, não usando um objeto financeiro/contratual dedicado do Emusys.
6. Há um segundo problema estrutural: **o código local está em `v18`, mas o `automacao_log` mostra execuções `v19` e `v20` em produção**. Então o repositório local **não representa fielmente** o código hoje implantado.

---

## Achados Principais

### 1. `status_pagamento` não é escrito pela edge function local

Arquivo analisado:
<ref_file file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" />

Nos handlers:
- `handleMatriculaNova`
- `handleRenovacao`
- `handleTrancamento`
- `handleEvasao`

não existe qualquer `insert`/`update` para `status_pagamento`.

Trechos relevantes:
- criação de nova matrícula: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="503-529" />
- atualização de matrícula existente: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="477-498" />
- renovação: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="653-667" />

Conclusão:
- a função local não força `sem_parcela`;
- também não corrige `status_pagamento` com base no financeiro do Emusys.

---

### 2. O default do banco para `status_pagamento` é `em_dia`

Consulta no banco:

```sql
SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'alunos'
  AND column_name IN ('status_pagamento','data_inicio_contrato','data_fim_contrato','emusys_matricula_id');
```

Resultado:
- `status_pagamento` → default = `'em_dia'`

Logo:
- se a edge local insere uma matrícula nova sem informar `status_pagamento`,
- o esperado seria nascer como `em_dia`, não `sem_parcela`.

Isso reforça que o `sem_parcela` é produzido **fora do fluxo mostrado no código local**.

---

### 3. O código local e o código em produção divergem

No arquivo local:
- cabeçalho indica `v18`
- constante `VERSAO = 'v18'`

Referência:
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="1-4" />
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="53-57" />

Mas no `automacao_log` do banco:
- Giane (`1723`) foi processada por `version = 'v19'`
- Davi (`483`) teve renovação por `version = 'v20'`

Isso é um achado crítico:
- **o deploy em produção está mais novo do que o código no repo local**;
- qualquer conclusão sobre a causa exata do `sem_parcela` fica incompleta enquanto não auditarmos a versão publicada v19/v20.

---

### 4. Contrato é mapeado a partir de primeira/última aula

No `parsePayload`, a edge extrai:

- `dataInicioContrato = disc?.data_hora_primeira_aula`
- `dataFimContrato = disc?.data_hora_ultima_aula`

Referência:
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="147-173" />

E depois grava esses valores em `alunos`:
- nova matrícula: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="517-518" />
- atualização de matrícula existente: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="488-489" />
- renovação: <ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="662-663" />

Implicação:
- o sistema trata “contrato” como proxy de janela de aulas do payload;
- se o Emusys mandar `data_hora_ultima_aula` velha, incompleta, ou referente a ciclo anterior,
  o LA Report grava contrato desatualizado;
- isso explica o caso do Davi: renovado no Emusys, mas com `data_fim_contrato` antiga no LA Report.

---

### 5. Renovação atualiza matrícula existente, não cria novo registro

Em `handleRenovacao`:
- a função usa `buscarAluno(...)`
- se encontra a matrícula, atualiza `status = 'ativo'`, datas de contrato e metadados
- incrementa contador de renovação
- grava em `renovacoes`

Referência:
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="613-667" />
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="675-693" />

Conclusão:
- renovação **não cria nova linha** em `alunos`;
- se o vínculo com a matrícula estiver errado, a renovação pode atualizar o registro errado ou deixar o registro correto sem atualização.

---

### 6. O matching prioriza `emusys_matricula_id`, mas cai para nome+curso e nome+unidade

Regra de busca:
1. `emusys_matricula_id + unidade_id`
2. `nome + unidade + curso`
3. `nome + unidade` com priorização por principal/ativo

Referência:
<ref_snippet file="d:/2026/LA-performance-report/supabase/functions/processar-matricula-emusys/index.ts" lines="278-327" />

Riscos desse desenho:
- se `emusys_matricula_id` estiver ausente no payload ou não bater,
  a edge cai para nome;
- em transferências internas ou reentradas, o match por nome pode confundir histórico operacional;
- isso não explica sozinho o `sem_parcela`, mas explica parte das ambiguidades de contrato/movimentação.

---

## O que verifiquei fora da edge

### Triggers na tabela `alunos`

Existe trigger `trg_alunos_calcular_campos`, mas a função `calcular_campos_aluno()`:
- calcula idade/classificação;
- calcula tempo de permanência;
- autodetecta banda/segundo curso;
- **não toca em `status_pagamento`**.

Portanto, trigger não é a fonte do `sem_parcela`.

### Rotinas que usam `status_pagamento`

Encontrei rotinas que marcam inadimplência:
- `marcar_inadimplentes_apos_vencimento`
- `rpc_marcar_inadimplentes`

Essas rotinas:
- só alteram de `NULL`/`em_dia` para `inadimplente`;
- explicitamente **não mexem** em registros com `sem_parcela`.

Logo, também não são a origem do problema.

---

## Hipótese Mais Forte Agora

### Hipótese A — deploy v19/v20 introduziu regra nova

Como o banco mostra execuções `v19` e `v20`, mas o repo só tem `v18`, a hipótese mais forte é:

- alguma mudança posterior passou a setar `status_pagamento = 'sem_parcela'`
  em matrícula nova ou renovação;
- essa lógica ainda não está no repositório local.

### Hipótese B — outro fluxo pós-sync altera `status_pagamento`

Possibilidades:
- job administrativo;
- automação externa;
- tela operacional;
- RPC/trigger não localizada ainda;
- correção manual em lote.

### Hipótese C — payload do Emusys não traz financeiro real

Mesmo sem escrever `sem_parcela`, a edge atual já é frágil porque:
- não consulta financeiro do Emusys;
- não extrai status de cobrança real;
- usa primeira/última aula como “contrato”.

Então, ainda que o `sem_parcela` venha de outro ponto, o desenho atual da sync é insuficiente.

---

## Impacto de Negócio

Se `status_pagamento = 'sem_parcela'` estiver errado em alunos regulares ativos:

- a view `vw_kpis_gestao_mensal` exclui esses alunos do MRR;
- ticket médio e MRR podem ficar subestimados;
- churn/inadimplência também ficam distorcidos.

Casos já fortes:
- Luciana (`1676`)
- Giane (`1723`)
- Davi (`483`)

E potencialmente outros com aula ativa e `sem_parcela`.

---

## Plano de Correção Recomendado

### Fase 1 — Auditoria do deploy real

Antes de corrigir qualquer código:

1. obter a **versão publicada** da edge function (`v19`/`v20`);
2. comparar com o arquivo local `v18`;
3. identificar exatamente onde a produção passou a diferir.

Sem isso, qualquer patch no repo local pode corrigir a versão errada.

### Fase 2 — Corrigir a fonte de verdade do financeiro

A sync deveria:

1. receber ou buscar do Emusys o **status financeiro real**;
2. gravar `status_pagamento` de forma explícita;
3. só usar `sem_parcela` quando houver prova de que a matrícula realmente não gera mensalidade recorrente.

Regra sugerida:
- `BANDA`, `BOLSISTA_INT`, `BOLSISTA_PARC` → podem ser `sem_parcela`/não pagante por regra
- `REGULAR` / `SEGUNDO_CURSO` com contrato vigente → **não podem cair em `sem_parcela` por default**

### Fase 3 — Contrato não pode depender só de primeira/última aula

Hoje:
- `data_inicio_contrato` e `data_fim_contrato` = primeira/última aula do payload

Melhor:
- usar campo contratual/financeiro dedicado do Emusys;
- se não existir, manter valor anterior quando o payload vier parcial;
- registrar log de inconsistência quando renovação vier sem datas contratuais confiáveis.

### Fase 4 — endurecer o matching

Prioridade:
1. `emusys_matricula_id`
2. match seguro por unidade+curso+nome
3. nunca usar fallback por nome para atualizar matrícula sensível sem trilha de auditoria forte

Especialmente importante para:
- transferências entre unidades;
- reentradas;
- múltiplas matrículas do mesmo aluno.

---

## Veredito

**Bug confirmado, mas a causa raiz ainda não está 100% no repositório local.**

O que já dá para afirmar com segurança:

- a edge local `v18` **não** escreve `status_pagamento`;
- o banco defaulta `status_pagamento` para `em_dia`;
- a produção está rodando `v19/v20`, não `v18`;
- contrato está sendo sincronizado por campos de aula, o que é frágil;
- o próximo passo certo é auditar o **código implantado** e não aplicar correção de banco agora.
