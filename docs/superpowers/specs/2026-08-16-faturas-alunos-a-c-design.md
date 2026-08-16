# Faturas de Alunos — especificação de produto A+C

Data: 16/08/2026
Status: implementação e prova autenticada de produção concluídas
Projeto: LA Report
Supabase: `ouqwbbermlzqqvtqwlul`

## Decisão aprovada

A experiência será **A+C**:

- **A — página dedicada:** a fonte principal de navegação e contexto financeiro
  operacional será `/app/faturas` (rótulo: **Faturas de Alunos**);
- **C — atalhos contextuais:** Alunos e Comercial terão links que levam à página
  já filtrada pela unidade, aluno ou situação;
- a hierarquia visual segue a opção A do mockup: cards de resumo, faixa de
  frescor, filtros, tabela e detalhe lateral;
- a página é operacional de faturas de alunos. Ela não é um módulo de contas a
  pagar, fluxo de caixa ou planejamento financeiro estratégico.

## Por que a página é separada

Hoje a Lista de Alunos mistura cadastro, operação, status manual e sinais
financeiros. A inadimplência canônica já foi corrigida, mas a equipe precisa de
um lugar para consultar a fatura que originou cada número, seu vencimento,
matrícula, competência, valor e estado de reconciliação.

A página separada permite:

1. explicar de onde vem cada alerta;
2. manter a Lista de Alunos rápida e operacional;
3. diferenciar dívida confirmada de fatura em reconciliação;
4. preservar histórico sem colocar ex-alunos na cobrança operacional;
5. permitir que Sol, Claude e consumidores futuros apontem para a mesma leitura
   canônica sem criar sincronizações paralelas.

## Escopo da primeira entrega

### Incluído

- rota protegida `/app/faturas`;
- entrada na navegação operacional, próxima de **Alunos**;
- cards de resumo por unidade:
  - inadimplência confirmada D+0;
  - elegível para cobrança amigável D+2;
  - valor original;
  - valor atualizado pelo contrato;
  - faturas aguardando reconciliação;
- filtro por unidade, situação, competência da janela, aluno e curso;
- tabela de faturas confirmadas, uma linha por fatura canônica;
- drawer/modal de detalhe da fatura;
- estado parcial explícito para `source_missing` e identidade inválida;
- atalhos em Alunos e Comercial com filtros preservados na URL;
- loading, vazio, erro, stale e partial com mensagens honestas;
- testes de normalização, filtros, frescor, estado partial e navegação;
- prova visual autenticada após reload, sem dados hardcoded.

### Fora da primeira entrega

- disparar cobrança, WhatsApp, e-mail ou qualquer mensagem;
- editar status, pagar, cancelar, renegociar ou conciliar uma fatura;
- alterar as RPCs de caixa da Sol;
- criar um sync próprio no frontend ou no projeto do Claude;
- remover a aba legada **Importar Alunos** sem uma decisão de migração própria;
- exibir dívida de ex-aluno na lista operacional de cobrança;
- inventar uma lista de histórico completo usando apenas o snapshot de três
  competências.

## Fonte de dados e contrato

### Lista operacional

Para a primeira entrega, a página consulta somente a RPC autenticada:

```sql
public.get_inadimplencia_canonica(
  p_unidade_id uuid,
  p_as_of_date date
) returns jsonb
```

No navegador, usar a sessão autenticada do Supabase. Nunca colocar
`service_role` no bundle, no browser, no log ou no prompt do Claude.

O contrato publicado é `schema_version = 3` e possui, no mínimo:

```text
status: ok | partial | stale | incomplete | error
operational.collection_allowed
operational.collection_scope
freshness.fresh_until
freshness.competencias_frescas
freshness.competencias_stale
reconciliation.source_missing_count
reconciliation.invalid_identity_invoice_count
reconciliation.validation_issue_count
totals.total_faturas
totals.total_matriculas
totals.total_original
totals.total_atualizado
items[]
```

O frontend deve tratar `operational.collection_allowed` e `fresh_until` como
gate. Não deve reinterpretar `status`, aceitar snapshot velho silenciosamente
ou fazer fallback para `emusys_faturas`, `sync_run_items`,
`inadimplente_emusys`, nome, telefone ou `emusys_student_id`.

### Regra financeira

- janela operacional: mês atual e os dois meses-calendário anteriores;
- em 16/08/2026: junho, julho e agosto de 2026;
- verdade financeira: `status = aberta` e vencimento anterior à data de corte;
- `source_missing` nunca significa paga: fica em reconciliação;
- pessoa atual: matrícula Emusys `ativa` na mesma unidade;
- ex-aluno sem matrícula atual fica fora da lista operacional;
- trancado e evadido ficam fora da cobrança principal, preservados no histórico
  e na reconciliação;
- cobrança amigável só depois de D+2, no consumidor operacional;
- valor atualizado exibido pelo contrato:

```text
valor_original × (1 + 0,02 + 0,01 × dias_atraso / 30)
```

O valor deve ser consumido do canônico. A UI pode mostrar os campos vivos do
Emusys como evidência em um detalhe futuro, mas não deve recalcular uma segunda
verdade para cobrança.

### Histórico completo e ex-alunos

O histórico completo é uma segunda camada, não uma extensão silenciosa da lista
de cobrança. Quando for implementado, deverá usar um endpoint backend seguro
que consulte o Emusys por `matricula_id`, `aluno_id` ou `contrato_id`, com
paginação e trilha de origem. O token do Emusys nunca vai para o browser.

Essa camada poderá atender ex-alunos devedores e faturas anteriores à janela,
mas deverá usar rótulo próprio — **Histórico financeiro / cobrança de ex-aluno**
— e nunca contaminar `get_inadimplencia_canonica` ou a lista da Sol.

## Arquitetura da tela

### Cabeçalho

- título: **Faturas de Alunos**;
- subtítulo: “Faturas confirmadas, vencidas e em reconciliação”;
- seletor de unidade respeitando o contexto global;
- data de corte e indicador “sincronizado em … / válido até …”;
- botão de atualizar que apenas solicita o fluxo oficial de sync já existente;
  não criar fetch direto do Emusys no cliente.

### Cards

Os cards devem deixar explícita a diferença entre fato financeiro e ação de
cobrança:

1. **Confirmadas D+0** — número de faturas e valor original;
2. **Cobrança amigável D+2** — número de pessoas/faturas elegíveis;
3. **Valor atualizado** — soma canônica com multa e mora;
4. **Reconciliação** — `source_missing` + identidade inválida, sempre fora da
   cobrança.

Não usar o card de reconciliação para sugerir “pago” ou “inadimplente”. O texto
deve dizer “aguardando confirmação na origem”.

### Filtros

- busca por nome apenas como filtro visual de registros já retornados;
- unidade;
- competência: junho, julho, agosto e a janela publicada pelo payload;
- situação: todas, vencidas confirmadas, elegíveis D+2;
- curso;
- estado operacional: ativos (trancados e evadidos aparecem somente na
  reconciliação, quando houver fatura correspondente);
- botão limpar;
- query string compartilhável, por exemplo:
  `/app/faturas?unidade=<uuid>&competencia=2026-08-01&situacao=confirmadas`.

### Tabela

Grão: **uma linha por fatura canônica**, nunca uma linha por nome.

Colunas mínimas:

- aluno;
- unidade;
- curso;
- competência;
- vencimento;
- dias em atraso;
- situação Emusys;
- valor original;
- valor atualizado;
- matrícula Emusys;
- indicador de contato/resolução;
- ação “Ver detalhes”.

Duplicar a linha por segundo curso só quando forem duas faturas/duas
matrículas; nunca por uma simples duplicata da pessoa.

### Detalhe

O detalhe deve mostrar:

- nome e cadastro local resolvido;
- unidade e curso;
- IDs de fatura, matrícula e contrato, com rótulo técnico discreto;
- vencimento, competência e dias;
- valor original, multa, mora e total atualizado;
- fórmula contratual e data de corte;
- último sync e `fresh_until`;
- status atual: ativo;
- vínculo exato usado na reconciliação;
- link/atalho para a ficha do aluno;
- sem botão de cobrança ou alteração na primeira versão.

### Reconciliação

Quando houver pendências, mostrar uma seção separada:

- “N faturas aguardando reconciliação”;
- “M faturas com identidade inválida”;
- competência e IDs técnicos disponíveis;
- motivo e último status conhecido, quando existente;
- ação “abrir conciliação” somente se já houver destino operacional seguro;
- nenhuma dessas linhas entra em itens, totais confirmados ou contato.

## Estados da interface

| Estado | Comportamento |
|---|---|
| carregando | skeleton; não mostrar zero como se fosse resultado |
| `ok` | mostrar confirmados e indicar leitura completa |
| `partial` | liberar apenas confirmados; painel de reconciliação visível |
| `stale` | não mostrar lista acionável; explicar que o snapshot expirou |
| `incomplete` | bloquear lista acionável; explicar falha estrutural |
| `error` | mensagem de erro com retry; sem fallback silencioso |
| vazio | explicar “nenhuma fatura confirmada no recorte”, sem concluir que não existe dívida fora da janela |

## Integrações de navegação

- `AppSidebar`: novo item **Faturas** apontando para `/app/faturas`;
- `AlunosPage`: atalho a partir do card/banner da inadimplência e ação por
  aluno para abrir o recorte correspondente;
- `ComercialPage`: atalho discreto para faturas do aluno/matrícula, sem duplicar
  a consulta;
- `ModalFichaAluno`: o tab financeiro existente continua sendo perfil local;
  o link “Ver faturas canônicas” abre a página dedicada.

## Critérios de aceitação

1. a página abre autenticada em `/app/faturas`;
2. a leitura vem da RPC canônica e não de uma tabela de espelho no browser;
3. em `partial`, confirmados aparecem e quarentenas ficam separadas;
4. em `stale`/`incomplete`/erro, não aparece lista acionável nem zero enganoso;
5. o valor atualizado não é recalculado no componente;
6. os filtros preservam unidade e competência na URL;
7. o detalhe prova a matrícula e a fatura, não só o nome;
8. os atalhos de Alunos e Comercial chegam ao mesmo lugar;
9. não há segredo Emusys, service role, mensagem ou mutação financeira no
   cliente;
10. teste de reload mantém o estado e não reintroduz o banner legado;
11. UI funciona para Campo Grande, Recreio, Barra e consolidado autorizado;
12. números visualizados ficam acompanhados da data de corte e do frescor.

## Não confundir

- `get_inadimplencia_canonica`: leitura financeira D+0 por fatura/matrícula;
- `sol_caixa_inadimplentes`: consumidor backend da Sol, com carência D+2;
- `sync_run_items`: armazenamento do sync, não contrato do browser;
- `emusys_faturas`: não usar como fonte concorrente;
- `status_pagamento`: estado local/manual, não substitui fatura canônica;
- histórico de ex-aluno: produto posterior, não lista operacional.
