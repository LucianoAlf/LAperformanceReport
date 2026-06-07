# Auditoria do Deploy Real — `processar-matricula-emusys`

## Data: 2026-06-06
## Status: read-only, sem UPDATE, sem migration

---

## Resumo Executivo

O deploy real da edge function **não está em v19/v20**: o projeto está rodando a função `processar-matricula-emusys` em **version 24**, cujo código retornado pelo Supabase MCP se identifica como **`v21`**.

Conclusão principal:

1. o código publicado está **à frente** do repo local (`v18`);
2. o deploy real **continua sem escrever `status_pagamento`**;
3. não há qualquer evidência no código publicado de que a edge esteja setando ou preservando `status_pagamento = 'sem_parcela'`;
4. a origem mais provável do `sem_parcela` está em **outro fluxo pós-edge** ou em **edição manual/admin**;
5. o deploy real continua atualizando contrato via `data_hora_primeira_aula` / `data_hora_ultima_aula`, então a fragilidade contratual permanece.

---

## Onde está o código efetivamente deployado

Via Supabase MCP:

- slug: `processar-matricula-emusys`
- status: `ACTIVE`
- version do deploy: `24`
- cabeçalho do código retornado: `v21`

Leitura:
- `version 24` = número interno de deploy do Supabase;
- `v21` = versão semântica mantida no próprio arquivo.

Ou seja:
- repo local: `v18`
- produção: pelo menos `v21`

---

## Diff relevante: `v18` local → `v21` publicado

### Mudanças novas no deploy real

#### v19
- deduplicação de `movimentacoes_admin` passa a considerar também `curso_id` no mês;
- `backfillMatriculaId` ganha guards para não sobrescrever vínculo existente e não duplicar `emusys_matricula_id`;
- `buscarAluno` melhora o fallback em finalização;
- `resolverCursoId` valida nome do curso quando encontra por `emusys_ids`.

#### v20
- captura `tipo_pagamento` do Emusys;
- grava esse valor em `forma_pagamento_id`;
- aplica no insert de aluno novo, insert de segundo curso e update de matrícula existente.

#### v21
- `converterLead` passa a gravar `lead_origem_id` no aluno;
- só preenche quando o campo está `null`.

---

## O que o deploy real faz com pagamento

### 1. Continua sem mexer em `status_pagamento`

Auditoria textual do código publicado:
- `status_pagamento` → **não aparece**
- `sem_parcela` → **não aparece**

Portanto:
- o deploy real **não seta** `status_pagamento = 'sem_parcela'`;
- o deploy real também **não preserva explicitamente** esse valor.

### 2. O que mudou de fato foi `forma_pagamento_id`

O deploy real introduziu:
- `tipoPagamento` no payload;
- `resolverFormaPagamento(...)`;
- gravação de `forma_pagamento_id`.

Isso melhora a captura do meio de pagamento, mas **não resolve status financeiro**.

---

## O que o deploy real faz com contrato

O comportamento continua essencialmente o mesmo do `v18`:

- `data_inicio_contrato` ← `disc.data_hora_primeira_aula`
- `data_fim_contrato` ← `disc.data_hora_ultima_aula`

Esse valor é gravado:
- no insert de novo aluno;
- no insert de segundo curso;
- no update de matrícula existente;
- no handler de renovação.

Conclusão:
- o bug de contrato desatualizado **continua plausível no deploy real**;
- a fonte ainda é um proxy operacional (agenda/aula), não um vínculo contratual/financeiro robusto.

---

## O que o deploy real faz com renovação

Mantém o mesmo desenho:

- localiza a matrícula via `buscarAluno(...)`;
- atualiza a linha existente em `alunos`;
- incrementa contagem de renovações;
- insere linha em `renovacoes` quando necessário.

Ou seja:
- renovação **não cria uma nova linha em `alunos`**;
- se o vínculo estiver errado, a renovação atualiza o registro errado ou deixa de atualizar o correto.

---

## Existe outro fluxo pós-edge alterando `status_pagamento`?

### Achado 1: frontend/admin consegue alterar `status_pagamento`

Há pelo menos dois fluxos explícitos no frontend:

1. edição manual da ficha do aluno:
   - `ModalFichaAluno.tsx` envia `status_pagamento: formData.status_pagamento`
   - existe opção de UI `sem_parcela`

2. operações em massa:
   - `TabelaAlunos.tsx` marca selecionados como `em_dia`
   - marca selecionados como `inadimplente`
   - faz reset mensal de `status_pagamento` para `null`

Isso prova que `status_pagamento` **não é exclusivamente controlado pela edge**.

### Achado 2: não encontrei no repo local backend que faça `UPDATE ... status_pagamento = 'sem_parcela'`

Busca textual em:
- `supabase/functions`
- `supabase/migrations`
- `src/`

Resultado:
- encontrei muito uso de `sem_parcela` em filtros e UI;
- encontrei edição manual via frontend;
- **não encontrei** rotina backend do repo local que escreva explicitamente `sem_parcela`.

Leitura:
- ou esse valor está sendo setado manualmente pela operação;
- ou existe fluxo externo / código não versionado no repo;
- ou já vem de dados legados anteriores e permanece sem correção.

---

## Causa mais provável neste momento

### Causa provável A — `status_pagamento` é mantido fora da edge

A edge publicada:
- cria/altera matrícula;
- atualiza curso, professor, contrato, `forma_pagamento_id`, `lead_origem_id`;
- **não governa pagamento**.

Então o `status_pagamento` parece estar em outro domínio operacional:
- admin/manual;
- rotina de fechamento/reset;
- processo financeiro separado;
- ou carga legada.

### Causa provável B — a edge atualiza contrato, mas não o status financeiro correspondente

Esse é o gap estrutural:

- contrato muda pela sync;
- `status_pagamento` não muda junto;
- resultado: aluno pode ficar com contrato vigente e aulas ativas, mas status financeiro antigo/errado.

Isso combina exatamente com os casos:
- Luciana
- Giane
- Davi

### Causa provável C — `sem_parcela` está sendo usado operacionalmente como “não tratar no mensal”

Como `sem_parcela` é editável na UI e excluído das views de MRR, há risco de ele estar sendo usado como:
- marcador operacional,
- atalho manual,
- ou categoria híbrida de exceção,

sem sincronização confiável com o financeiro real do Emusys.

---

## Veredito

O deploy real **não inocenta a arquitetura**, mas **inocenta a hipótese específica** de que a edge publicada v19/v20/v21 esteja explicitamente setando `sem_parcela`.

O cenário mais provável agora é:

1. a edge sync **não controla `status_pagamento`**;
2. outro fluxo humano ou batch controla esse campo;
3. como a edge atualiza contrato sem atualizar status financeiro, surgem divergências persistentes;
4. essas divergências derrubam MRR e ticket quando a view exclui `sem_parcela`.

---

## Próximo Passo Recomendado

1. mapear a **fonte operacional real** de `status_pagamento`:
   - tela admin,
   - job mensal,
   - rotina financeira,
   - ou processo externo;
2. levantar histórico/audit trail dos casos claros (`1676`, `1723`, `483`) para ver **quem gravou `sem_parcela`** e quando;
3. só depois decidir a correção:
   - centralizar `status_pagamento` na sync;
   - ou separar claramente domínio contratual vs domínio financeiro.
