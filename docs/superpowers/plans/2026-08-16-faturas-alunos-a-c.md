# Plano — Faturas de Alunos A+C

> Subprojeto de UI posterior ao contrato canônico de inadimplência. O design
> A+C foi aprovado pelo Alf em 16/08/2026. Este plano é o handoff de execução
> para o Claude; não autoriza alterar as RPCs da Sol.

## Objetivo

Entregar uma página dedicada `/app/faturas` para a equipe consultar faturas de
alunos com origem, frescor, competência, vínculo de matrícula e reconciliação,
mantendo atalhos contextuais em Alunos e Comercial.

## Estado de execução — 16/08/2026

- [x] adaptador canônico v3 e filtros determinísticos;
- [x] página dedicada, estados operacionais e detalhe por fatura;
- [x] rota, menu e atalhos A+C;
- [x] testes de contrato/interface e build de produção;
- [ ] prova autenticada em produção, console e estabilidade após reload.

## Pré-condições já concluídas

- contrato canônico v3 publicado em `get_inadimplencia_canonica`;
- fila/backoff do sync Emusys publicada e drenada;
- Campo Grande validado contra os relatórios de junho, julho e agosto;
- Sol preparada para consumir a leitura canônica, sem sync próprio;
- decisões de negócio: janela de três competências, somente aluno ativo no
  radar financeiro, trancado/evadido fora da cobrança principal, ex-aluno fora
  da cobrança operacional, `source_missing` em quarentena.

## Tarefas

### 1. Criar o adaptador de dados da página

Arquivos sugeridos:

- criar `src/lib/faturasAlunosCanonicas.ts`;
- criar `src/components/App/FaturasAlunos/types.ts`;
- criar testes em `tests/faturasAlunosCanonicas.test.mjs`.

O adaptador deve:

- chamar `get_inadimplencia_canonica` com a sessão autenticada;
- normalizar apenas `schema_version=3`;
- preservar `status`, `operational`, `freshness`, `reconciliation` e `items`;
- filtrar sem alterar a semântica dos dados;
- rejeitar payload inválido;
- não recalcular juros ou totais;
- não acessar tabelas de snapshot diretamente no browser.

### 2. Construir a página dedicada

Arquivos sugeridos:

- criar `src/components/App/FaturasAlunos/FaturasAlunosPage.tsx`;
- criar componentes locais para cards, filtros, tabela, detalhe e
  reconciliação;
- reutilizar `PageFilterBar`, `KPICard`, `PageTabs`, `Tooltip`, `Dialog` e o
  padrão visual existente.

Entregar os estados `loading`, `ok`, `partial`, `stale`, `incomplete`, `error` e
`empty`. A tabela deve ser por fatura canônica, não por nome.

### 3. Ligar a rota e a navegação

- adicionar import lazy e rota em `src/router.tsx`;
- adicionar `/app/faturas` ao `prefetchMap` e ao menu operacional em
  `src/components/App/Layout/AppSidebar.tsx`;
- garantir que autenticação e seleção de unidade global sejam respeitadas.

### 4. Ligar atalhos A+C

- adicionar atalho no `AlunosPage`/`TabelaAlunos` para abrir o recorte do aluno
  ou da unidade;
- adicionar atalho no `ComercialPage` somente onde já existe contexto de
  aluno/matrícula;
- adicionar link na aba financeira de `ModalFichaAluno`;
- não duplicar a consulta nem criar um painel financeiro paralelo.

### 5. Adicionar testes de interface e contrato

Cobrir:

- `partial` libera confirmados e separa reconciliação;
- `stale`/`incomplete` não exibem cobrança acionável;
- `source_missing` nunca vira “paga”;
- competência e unidade filtram somente linhas retornadas;
- fatura é identificada por unidade + matrícula + fatura;
- juros e totais vêm do payload;
- links geram query string correta;
- payload inválido não vira tela vazia enganosa.

### 6. Validar visualmente

- executar build e testes;
- abrir a página autenticada para as três unidades e consolidado autorizado;
- verificar browser DOM, console limpo e estabilidade depois de reload;
- conferir que os números visíveis mostram data de corte e frescor;
- registrar screenshots e o commit no handoff.

## Fase posterior: histórico completo

Não simular a tela histórica com o recorte de três meses. Antes de implementá-la,
criar um contrato backend seguro para consulta ao vivo do Emusys por
`matricula_id`, `aluno_id` ou `contrato_id`, com paginação, timeout, auditoria e
sem token no browser. Esse contrato poderá atender ex-alunos e faturas antigas
em uma área separada da cobrança operacional.

## Fronteiras

Não alterar:

- `sol_caixa_lancar_recebimento`;
- `sol_caixa_abrir`;
- `sol_caixa_fechar`;
- `sol_caixa_casar_parcela`;
- o worker de sync já publicado;
- regras de presença, agenda ou LA Teacher.

Não criar dados sintéticos de produção, não enviar mensagens e não liberar uma
ação de cobrança a partir de uma UI sem `collection_allowed` e frescor válido.
