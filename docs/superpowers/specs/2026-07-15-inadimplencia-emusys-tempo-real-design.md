# Inadimplência em tempo real (Lista de Alunos) - desenho aprovado

## Objetivo

O banner de alerta "Inadimplência" na Lista de Alunos (`TabelaAlunos.tsx`, `inadimplenciaInfo`, linhas ~299-343) e o filtro correspondente em `AlunosPage.tsx` (`filtros.status_pagamento === 'inadimplente'`, linhas ~1141-1149) hoje são alimentados pelo campo `alunos.status_pagamento`, preenchido manualmente pela equipe e resetado todo mês (`TabelaAlunos.tsx` linhas ~1141-1246). Na prática, o banner mostra inadimplentes do mês passado — mesmo depois de todo mundo já ter pago. O Emusys já retorna, por matrícula, o campo `contrato_atual.inadimplente` (booleano) e o `contrato_atual.valor_mensalidade` (valor real cobrado). O pedido (Arthur/Luciano) é que esse banner reflita a situação real e atual, e que a equipe também veja quando o valor da parcela cadastrado aqui diverge do valor real cobrado pelo Emusys.

## Escopo

Só o banner de Inadimplência, o filtro correspondente e a coluna de valor na Lista de Alunos. **Não** muda a métrica oficial de "Inadimplência %" usada em Dashboard/Resumo/relatórios — essa continua vindo do `status_pagamento` manual, fonte canônica documentada em `docs/METRICAS.md`. Trocar a fonte de uma métrica oficial é decisão de negócio separada, fora deste desenho. Também não altera `status_pagamento` nem `valor_parcela` automaticamente — qualquer correção continua manual, pela Ficha do Aluno (`ModalFichaAluno.tsx`) ou pela edição inline já existente.

**Só matrícula com `status = 'ativo'` entra na conta** — mesma regra que já existe hoje (`isMatriculaAtivaParaInadimplencia`, `TabelaAlunos.tsx:88-90`, exclui trancado explicitamente). A sync busca só `GET /matriculas?status=ativa` no Emusys — não busca trancada, não precisa.

## Arquitetura

### 1. Tabela `inadimplencia_emusys_cache`

Uma linha por matrícula ativa (grão = matrícula, igual ao resto do sistema; o agrupamento por pessoa acontece depois, no merge):

```
unidade_id uuid
emusys_matricula_id text
inadimplente boolean
valor_mensalidade_emusys numeric
forma_pagamento_emusys text
atualizado_em timestamptz
UNIQUE (unidade_id, emusys_matricula_id)
```

RLS: fechado por padrão, leitura só para `authenticated`. Sem escrita client-side (só a edge function, via `service_role`).

### 2. Edge function `sync-inadimplencia-emusys` + cron

Mesmo padrão de `sync-matriculas-emusys`: **uma unidade por invocação** (parâmetro `?u=cg|recreio|barra`), não as 3 juntas — evita estourar o timeout de 150s e o rate limit de 60 req/min da API do Emusys. Pagina `GET /matriculas?status=ativa` **até o fim** (todas as páginas, sem erro), extrai `contrato_atual.inadimplente`, `contrato_atual.valor_mensalidade`, `contrato_atual.forma_pagamento`, upsert em `inadimplencia_emusys_cache` por `(unidade_id, emusys_matricula_id)`. Só depois de paginar com sucesso até o fim, remove do cache dessa unidade as matrículas que não vieram na resposta (evita ficar com fantasma de matrícula trancada/finalizada). **Se a paginação falhar no meio** (timeout, erro numa página), a function não faz o delete-diff — só faz upsert do que já buscou com sucesso até ali e loga a falha, pra não apagar matrícula legítima por causa de um fetch incompleto.

**Guarda contra chamadas repetidas:** se `atualizado_em` da unidade for de menos de 5 minutos atrás, a function retorna sem rechamar a API do Emusys (protege contra clique duplo no botão "Atualizar agora" ou várias pessoas clicando ao mesmo tempo).

Cron (`pg_cron`), 3 jobs por unidade × 3 horários/dia (08h, 13h, 18h BRT), com o mesmo espaçamento de 20min entre unidades já usado em `sync-matriculas-emusys` (ex.: CG em xx:00, Recreio em xx:20, Barra em xx:40 — confirmado em `cron.job`). **A frequência de 3x/dia é nova**, não é cópia do cron existente — `sync-matriculas-emusys` roda só 1x/dia (02h); aqui optamos por mais vezes por ser dado de inadimplência, que a equipe quer mais fresco. Reaproveita os secrets já existentes `EMUSYS_TOKEN_CG/RECREIO/BARRA`.

### 3. Merge no carregamento de alunos (`AlunosPage.tsx`)

Pré-requisito: `emusys_matricula_id` **não está** no `selectFields` da query principal hoje (`AlunosPage.tsx:521-534`) — precisa ser adicionado ali primeiro, senão nem o aluno principal nem os itens de `outros_cursos` vão ter esse valor em runtime.

No ponto onde os alunos já são agrupados por pessoa e `outros_cursos` é montado (`AlunosPage.tsx:664-724`, bloco `alunosAgrupados`/`alunosComSegundoCurso`), fazer um segundo `select` em `inadimplencia_emusys_cache` da unidade e casar por `emusys_matricula_id` (presente tanto no aluno principal quanto em cada item de `outros_cursos`). Anexar dois campos novos — **sem tocar em `status_pagamento`/`valor_parcela`**:

- `inadimplente_emusys?: boolean` (no aluno principal e em cada `outros_cursos[i]`)
- `valor_mensalidade_emusys?: number` (idem)

Matrícula do cache sem correspondência em `alunos` (`emusys_matricula_id` que não bate com nenhuma linha nossa) é simplesmente ignorada no merge — não aparece na tela, não conta em nada. Não é tratado como erro (pode ser matrícula ainda não sincronizada/arquivada do nosso lado).

### 4. Frontend

- **Banner (`TabelaAlunos.tsx`, `inadimplenciaInfo`)**: troca `a.status_pagamento === 'inadimplente'` por `a.inadimplente_emusys === true` (e o mesmo em cada `outros_cursos`), mantendo a regra de só contar `status === 'ativo'`. Mostra "atualizado há Xh" com base no maior `atualizado_em` retornado no merge.
- **Botão "Atualizar agora"** no banner: chama a edge function da unidade atual via `supabase.functions.invoke`, desabilitado enquanto a chamada estiver em andamento (evita duplo clique), e recarrega os dados ao terminar.
- **Filtro (`AlunosPage.tsx`)**: novo campo `filtros.inadimplente_emusys_live` (boolean, independente do select `status_pagamento` que continua existindo pros outros valores como "em_dia"/"atrasado"). O clique no banner ativa esse novo filtro.
- **Coluna de valor da parcela**: quando `valor_mensalidade_emusys` diverge do `valor_parcela` cadastrado, mostra ícone de aviso (⚠️) com tooltip exibindo os dois valores lado a lado. Clicar abre a Ficha do Aluno pra correção manual — nada muda sozinho.

## Fora de escopo

- Métrica oficial de Inadimplência % (Dashboard/Resumo) — continua no `status_pagamento` manual.
- Matrícula trancada na conta de inadimplência (mesma exclusão de hoje).
- Atualização automática de `status_pagamento`/`valor_parcela` a partir da API.
- Qualquer nova tela/aba — tudo dentro da Lista de Alunos existente.

## Verificação

- `node --check` na edge function antes do deploy; comparar deployado vs. git via `get_edge_function` (protocolo já estabelecido no projeto).
- Rodar a sync manualmente para 1 unidade e conferir contagem de inadimplentes batendo com uma checagem manual na API (mesmo método usado nesta sessão para achar o bug de status da Elis).
- Testar o guard de 5 minutos: chamar a function duas vezes seguidas e confirmar que a segunda não bate na API do Emusys.
- Confirmar que `emusys_matricula_id` foi de fato adicionado ao `selectFields` de `AlunosPage.tsx` e chega populado no aluno principal e em cada `outros_cursos[i]`.
- Simular falha de paginação (ex.: derrubar a conexão na página 3 de uma unidade com muitas matrículas) e confirmar que o cache dessa unidade não perde registros — só não recebe o delete-diff daquela rodada.
- No frontend: abrir Lista de Alunos, conferir banner mostrando "atualizado há Xh", clicar "Atualizar agora" e ver o timestamp mudar; clicar no banner e conferir que o novo filtro `inadimplente_emusys_live` filtra certo; testar um aluno com `outros_cursos` (multi-instrumento) pra confirmar que o merge por matrícula funciona nos dois níveis; forçar uma divergência de valor conhecida e conferir que o ícone de aviso aparece com o tooltip correto.
- `npm run build` limpo.
