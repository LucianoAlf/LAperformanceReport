# Auditoria de RPCs, telas e timeouts — 08/09/2026

## Resultado executivo

O erro do relatório mensal administrativo de agosto foi reproduzido e corrigido
na fonte canônica. Os três documentos voltaram a ser gerados pela mesma Edge
Function usada pela tela, sem fallback manual e sem escrita no Emusys.

A auditoria de performance encontrou duas causas diferentes:

1. `/app/alunos` fazia duas leituras da mesma inadimplência: uma chamada direta a
   `get_inadimplencia_canonica` e outra dentro de
   `get_faturas_alunos_financeiro_v1`;
2. o job 129, `orquestrar-historico-professor`, reconstruía um manifesto histórico
   grande em rajadas e competia com as RPCs das telas. Esse pico explica a
   combinação observada de falha financeira, Média/Turma indisponível e Sozinhos
   igual a zero: a interface falhou fechada quando as leituras canônicas
   expiraram; zero não era uma medição válida de turmas.

O relatório de coordenação V3 continua sendo uma dívida independente: ele duplica
cadeias caras de Health Score e KPI de professor e ainda excede o timeout de 8 s.
Ele não participa do botão de relatório mensal administrativo e não foi mascarado
por aumento de timeout.

## 1. Incidente do relatório mensal de agosto

### 1.1 Causa raiz

- Barra e Campo Grande tinham a base financeira explícita nos snapshots
  `alunos_executivo`, mas `get_relatorio_admin_mensal_rico_v1` procurava apenas a
  versão antiga do snapshot gerencial. A RPC recusava corretamente publicar um
  ticket sem denominador financeiro confiável.
- No Recreio, a retificação anterior do churn retirou oito movimentos de uma
  fotografia que continha somente sete deles. O movimento de Caetano Leão foi
  criado depois do snapshot original e nunca esteve nos 30 casos de origem.
  Portanto, o cálculo coerente é `30 - 7 = 23` evasões acadêmicas pagantes;
  somadas às seis não renovações, são 29 saídas e `29 / 334 = 8,68%`.
- Daniel Duque foi conferido no Emusys como interrupção real de agosto. Retirá-lo
  apenas para chegar a 8,38% produziria um relatório internamente falso.

### 1.2 Correção aplicada

Migration
`20260908170000_relatorio_admin_agosto_2026_integridade_e_base_financeira.sql`:

- permite à RPC rica reutilizar o último snapshot `alunos_executivo` da mesma
  competência, somente quando o denominador financeiro explícito e o hash são
  válidos;
- preserva a diferença semântica entre pagantes administrativos e alunos da base
  financeira do ticket médio;
- cria novas versões append-only dos snapshots de agosto do Recreio;
- atualiza apenas a tabela mutável de compatibilidade `dados_mensais` de 28/8,38
  para 29/8,68;
- não altera nem remove snapshots anteriores e não escreve no Emusys.

### 1.3 Prova pelo caminho real de produção

| Unidade | HTTP | Ativos | Pagantes administrativos | Matrículas | Churn | Base do ticket | Ticket médio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Barra | 200 | 260 | 256 | 285 | 2,34% | 256 | R$ 446,30 |
| Campo Grande | 200 | 410 | 382 | 477 | 7,85% | 382 | R$ 398,87 |
| Recreio | 200 | 344 | 334 | 422 | 8,68% | 325 | R$ 445,38 |

As três respostas passaram pela RPC de produção e pelo formatador da
`relatorio-admin-whatsapp`. O fato de o Recreio ter 334 pagantes administrativos
e base financeira 325 não é divergência: são universos diferentes. O ticket usa
alunos com cobrança, incluindo inadimplentes, e exclui as categorias dispensadas
pela regra financeira; não usa simplesmente “ativos” nem “quem pagou”.

### 1.4 Revalidação do ticket após a liberação do relatório

Uma nova conferência, feita depois de a unidade conseguir gerar o documento,
encontrou duas colunas com semânticas diferentes:

- `dados_mensais.ticket_medio = 433,38` é o campo legado de compatibilidade. Ele
  corresponde à conta antiga `144.748,92 / 334` e não pode ser usado como ticket
  financeiro do fechamento;
- `dados_mensais.ticket_medio_contratual = 445,38`, com
  `mrr_contratual = 144.749,17` e `ticket_denominador_pagantes = 325`, é a leitura
  financeira explícita e vigente.

O caminho do botão foi conferido ponta a ponta no código: o modal chama a Edge em
`dry_run_mensal_admin`, a Edge chama `get_relatorio_admin_mensal_rico_v1`, e o
formatador imprime exclusivamente
`payload.indicadores_financeiros.ticket_medio`. A RPC de produção devolveu
`445,38`; o snapshot oficial mais recente também contém `445,38`. Foi acrescentado
um teste de regressão que injeta simultaneamente `433,38` no resumo legado e
`445,38` nos indicadores financeiros e exige que apenas `445,38` seja publicado.

## 2. Fotografia das RPCs

`pg_stat_statements` estava acumulado desde 18/08/2026. Os valores abaixo são
médias e máximos observados, não p95.

| Família | Chamadas | Média | Máximo | Leitura |
| --- | ---: | ---: | ---: | --- |
| `get_faturas_alunos_financeiro_v1` | 609 | 2.891 ms | 7.947 ms | crítica, encosta no limite |
| `get_inadimplencia_canonica` | 506 | 2.315 ms | 7.903 ms | crítica, era duplicada em Alunos |
| `get_kpis_professor_periodo_canonico_v3` | 374 | 2.660 ms | 7.991 ms | crítica e variável |
| `get_situacao_alunos_v1` | 380 | 1.357 ms | 6.628 ms | pesada pelo volume retornado |
| `get_kpis_turmas_canonicos_v2` | 826 | 1.266 ms | 7.509 ms | hoje rápida, vulnerável à saturação |
| `get_kpis_alunos_canonicos` | 1.751 | 708 ms | 15.566 ms | melhorou, mas ainda tem cauda longa |
| Health Score V3 snapshot | 505 | 822 ms | 5.222 ms | consumidor caro |
| KPIs administrativos | 1.120 | 248 ms | 5.755 ms | normalmente saudável |
| permanência | 495 | 425 ms | 4.605 ms | normalmente saudável |
| relatório de coordenação V3 | 26 | 5.210 ms | 7.634 ms | timeout ao compor dependências |

### 2.1 Medição ao vivo por unidade

| Escopo | Inadimplência | Faturas | Turmas | Admin | Alunos canônicos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Barra | 1.651 ms | 1.852 ms | 283 ms | 145 ms | 201 ms |
| Campo Grande | 781 ms | 1.057 ms | 204 ms | 122 ms | 259 ms |
| Recreio | 603 ms | 727 ms | 267 ms | 274 ms | 209 ms |
| Consolidado | 1.990 ms | 2.320 ms | 369 ms | 133 ms | 389 ms |

No Recreio, permanência respondeu em 87 ms; a RPC de professor variou entre
3.225 e 6.668 ms; `get_situacao_alunos_v1` levou 1.345 ms e devolveu cerca de
635 KB. O relatório de coordenação V1/V2/V3 expirou entre 8,1 e 8,3 s.

Comparado à auditoria de 04/08, alunos, administrativo e turmas estão muito mais
rápidos no estado normal. As correções anteriores não desapareceram. A regressão
operacional foi a soma da leitura financeira duplicada com a rajada do job
histórico; Health Score/coordenação continuam como dívida estrutural.

## 3. Leitura financeira única em `/app/alunos`

Migration
`20260908173000_alunos_financeiro_leitura_unica.sql` acrescenta, sem remover
campos, `inadimplencia_canonica` ao JSON de
`get_faturas_alunos_financeiro_v1`. A página Alunos passa a consumir esse bloco e
deixa de chamar `get_inadimplencia_canonica` separadamente.

Prova em produção após a migration: HTTP 200 em 2.594 ms, payload de 334.618
bytes, `inadimplencia_canonica.schema_version = 4`, estado parcial explícito,
`collection_allowed = true` e 120 itens. Erro ou bloco ausente continua bloqueando
cobrança; a mudança não converte falha em dado válido.

## 4. Reconstrução histórica do professor

### 4.1 Causa raiz medida

O cron job 129 roda aos minutos 07 e 37. A versão anterior disparava uma sequência
de partições por unidade. O preparo do manifesto lia o histórico inteiro de cada
unidade e inseria milhares de linhas numa única transação. Em 08/09, uma rodada
fez 11 chamadas e a 12ª expirou; o banco registrou SQLSTATE `57014` dentro de
`preparar_manifesto_reconstrucao_professor_v2`.

O job foi desligado pelo kill switch durante a investigação. O baseline publicado
permaneceu disponível; a pausa impediu somente a reconstrução de manutenção.

### 4.2 Correção de raiz

- 128 partições por unidade, em vez de 32;
- manifesto preparado por partição e em transações retomáveis;
- índices de cobertura para roster e aulas;
- microlotes de 250 linhas, com cursor durável em `roster_staging_id`;
- seleção “identidade primeiro”: calcula quais pessoas pertencem à partição e só
  então busca suas aulas pelos índices;
- no máximo duas partições por ciclo global, pausa de 1 s e rotação da unidade
  inicial a cada janela de 30 minutos;
- qualquer erro continua visível no retorno e nos logs; não é promovido a sucesso.

Na consulta que havia expirado, o plano antigo de seleção levou 3.242,7 ms. O
protótipo identidade-primeiro, antes mesmo dos novos índices, levou 1.189,2 ms.

### 4.3 Canários controlados

Com o cron ainda pausado, passaram duas partições consecutivas em cada unidade:

| Unidade | Partições | Resultado | Duração do ciclo |
| --- | --- | --- | ---: |
| Barra | 15 e 16 | 2/2 concluídas | 10.031 ms |
| Recreio | 6 e 7 | 2/2 concluídas | 15.408 ms |
| Campo Grande | 29 e 30 | 2/2 concluídas | 21.715 ms |

O kill switch foi religado às 14:34:15 UTC. A primeira rodada automática, às
14:37 UTC, processou exatamente duas partições do Recreio e terminou em 10.115
ms. Campo Grande e Barra apenas tiveram o estado lido, sem consumir o orçamento.
Não houve `PREPARO_MANIFESTO_FALHOU`, `57014` nem erro do orquestrador na janela
do canário. O rollout do job ficou ativo com esse limite.

## 5. Pendência P1: relatório de coordenação

`get_relatorio_coordenacao_canonico_v3` chama a cadeia V2 e volta a consultar
Health Score/KPI de professor. No mês corrente, a composição repete dependências
que isoladamente já variam entre 3 e 7 s. Aumentar `statement_timeout` apenas
retardaria a falha e elevaria a competição com as telas.

Próximo trabalho recomendado: produzir uma única fotografia canônica por
competência e fazer V1/V2/V3 lerem a mesma base, eliminando chamadas duplicadas.
Até isso ser implementado e medido, essa RPC deve ser tratada como indisponível
quando expirar, nunca como relatório vazio.

## 6. Gates executados

- fixture PostgreSQL do relatório/ticket: 5/5, incluindo a conta
  `144.749,17 / 325 = 445,38`;
- regressão do formatador mensal: 7/7;
- testes de contrato da leitura financeira única;
- testes de particionamento, retomada e orçamento do orquestrador;
- suíte integral com Docker: pré-testes 49/49, 10/10 e 29/29; suíte principal
  506/506, sem falha e sem skip;
- `deno check` das três Edges envolvidas;
- geração real dos três relatórios mensais;
- canários reais da reconstrução nas três unidades;
- build de produção concluído (4.843 módulos); permanecem somente os avisos já
  conhecidos de chunks/Recharts.
