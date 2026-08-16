# Inadimplência canônica — liberação parcial segura

Data: 16/08/2026
Projeto Supabase: `ouqwbbermlzqqvtqwlul`
Subprojeto: contrato canônico e consumidores operacionais

## Decisão aprovada

A existência de faturas `source_missing` não bloqueará toda a operação. A
leitura canônica poderá liberar somente as faturas confirmadas no snapshot
fresco e manter cada fatura não confirmada em quarentena, fora de listas,
totais e ações de cobrança.

Essa é uma liberação parcial explícita, não uma redução de segurança:

- fatura confirmada pode ser cobrada;
- fatura em quarentena não pode ser cobrada;
- `source_missing` continua significando “não confirmada na origem neste
  snapshot”, nunca “paga”;
- snapshot velho, identidade inválida ou duplicidade não isolável continuam
  bloqueando a leitura inteira;
- a Sol consome o contrato canônico do LA Report e não cria sincronização ou
  regra financeira própria.

## Escopo e ordem de entrega

Este subprojeto entrega:

1. contrato v3 de `get_inadimplencia_canonica`;
2. consumo seguro no LA Report, na exportação e em
   `sol_caixa_inadimplentes`;
3. testes de contrato, PostgreSQL e interface;
4. validação controlada contra o Emusys;
5. handoff autocontido para o Claude ligar e testar a Sol.

A página “Faturas de Alunos” é o subprojeto seguinte. A direção visual já foi
escolhida como **A+C**: página dedicada com a hierarquia visual da opção A e
atalhos contextuais em Alunos e Comercial. Ela terá especificação e plano
próprios e não bloqueará esta liberação operacional.

## Fonte, grão e identidade

- Fonte persistida: último snapshot `live`, `succeeded`, completo e fresco de
  `sync_runs` + `sync_run_items`.
- Grão da saída: uma fatura Emusys canônica vencida.
- Chave da fatura: `canonical_fatura_id`, sempre escopada pela unidade.
- Vínculo operacional apto a cobrança: `unidade_id + emusys_matricula_id`.
- `unidade_id + emusys_student_id` pode localizar um candidato para
  reconciliação quando a matrícula está ausente, mas nunca autoriza cobrança;
  nome nunca é chave automática.
- Universo de alunos: `vw_alunos_estado_operacional_v131.entra_financeiro_ativo
  = true`, unido a `alunos`, com `arquivado_em IS NULL` e `data_saida IS NULL`.
  O campo local `alunos.status` fica somente como fallback já encapsulado pela
  view operacional.
- Janela: mês da data de corte e as duas competências anteriores. Em
  agosto/2026, portanto, junho, julho e agosto — não 90 dias móveis.
- Vencimento: `data_vencimento < p_as_of_date`. A carência operacional da Sol
  permanece uma filtragem posterior e não altera a verdade financeira.

Alunos inativos, evadidos, arquivados ou com saída registrada ficam fora desta
lista. A futura carteira de ex-alunos devedores é outro produto e não será
inferida nesta entrega.

## Classificação de cada fatura

Uma fatura entra em `items` e nos totais confirmados somente quando todas as
condições abaixo forem verdadeiras:

```text
snapshot live completo e fresco
AND status = 'aberta'
AND source_missing = false
AND data_vencimento < data de corte
AND competência dentro da janela de três meses
AND matrícula local ativa e não arquivada
AND identidade válida
AND canonical_fatura_id sem duplicidade confirmada
```

Regras de isolamento:

1. Se qualquer ocorrência do mesmo `canonical_fatura_id` estiver
   `source_missing=true`, todo esse ID fica em quarentena. Uma ocorrência
   confirmada concorrente não autoriza cobrança desse mesmo ID.
2. Um grupo em quarentena por `source_missing` não transforma, sozinho, a
   leitura inteira em erro de duplicidade.
3. Duas ou mais ocorrências confirmadas do mesmo ID, sem `source_missing`, são
   duplicidade de integridade e bloqueiam a leitura inteira.
4. Metadado de identidade inválido bloqueia a leitura inteira até ser
   corrigido. Não haverá fallback inventado por nome.
5. O estado anterior de uma fatura `source_missing` — inclusive `aberta` ou
   `paga` — será apenas contexto de reconciliação. Ele nunca entra nos totais
   nem decide cobrança.

## Contrato canônico v3

`public.get_inadimplencia_canonica(uuid, date)` continuará retornando `jsonb`,
com os mesmos parâmetros e ACL atuais. A alteração é aditiva e incompatível
somente para consumidores que validam a lista fechada de estados; todos os
consumidores conhecidos serão migrados no mesmo rollout.

Forma resumida:

```json
{
  "schema_version": 3,
  "status": "ok | partial | stale | incomplete",
  "fonte": "sync_run_items",
  "unidade_id": "uuid | null",
  "as_of_date": "YYYY-MM-DD",
  "avaliado_em": "timestamp",
  "policy": {
    "student_scope": "vw_alunos_estado_operacional_v131.entra_financeiro_ativo=true AND arquivado_em IS NULL AND data_saida IS NULL",
    "competencias_inicio": "YYYY-MM-01",
    "competencia_fim": "YYYY-MM-01"
  },
  "operational": {
    "collection_allowed": true,
    "collection_scope": "confirmed_only | blocked",
    "block_reasons": []
  },
  "freshness": {
    "policy": "sync_runs.stale_after",
    "competencias_necessarias": 3,
    "competencias_frescas": 3,
    "competencias_stale": 0,
    "ultimo_sync_mais_antigo": "timestamp",
    "fresh_until": "timestamp",
    "competencias": []
  },
  "reconciliation": {
    "status": "clear | pending",
    "source_missing_count": 0,
    "source_missing_open_count": 0,
    "source_missing_other_count": 0,
    "duplicate_fatura_count": 0,
    "invalid_identity_invoice_count": 0,
    "validation_issue_count": 0,
    "unknown_invoices": [],
    "duplicate_invoices": [],
    "invalid_identity_invoices": []
  },
  "totals": {
    "total_faturas": 0,
    "total_matriculas": 0,
    "total_original": 0,
    "total_atualizado": 0,
    "maior_atraso": 0
  },
  "items": []
}
```

### Semântica dos estados

| Estado | Condição | `collection_allowed` | Saída operacional |
|---|---|---:|---|
| `ok` | snapshots frescos e nenhuma pendência | `true` | todos os confirmados |
| `partial` | snapshots frescos; a única pendência global é `source_missing` isolável | `true` | somente confirmados |
| `stale` | ao menos uma competência necessária fora do frescor | `false` | `items=[]` e totais zerados |
| `incomplete` | identidade inválida ou duplicidade confirmada não isolável | `false` | `items=[]` e totais zerados |

A precedência será `stale` → `incomplete` → `partial` → `ok`. Consumidores
devem obedecer a `operational.collection_allowed`; não devem reinterpretar o
texto de `status`. Também devem invalidar ações quando o relógio ultrapassar
`freshness.fresh_until` sem uma nova leitura.

Os valores de `operational.block_reasons` serão estáveis e enumerados:
`stale_competencia`, `duplicate_confirmed_fatura` e `invalid_invoice_identity`.
Em `partial`, `block_reasons` ficará vazio porque a pendência isolada não
bloqueia; o motivo continuará registrado em `reconciliation`.

Em `partial`, `totals` e `items` descrevem exclusivamente os confirmados. Os
valores em `reconciliation.unknown_invoices` são metadados de investigação e
não podem ser somados como dívida.

Cada item de `unknown_invoices` preservará IDs, competência, data de
vencimento, `last_known_status`, `last_known_valor_original`, motivo e
timestamps de detecção/sync. Os nomes `last_known_*` deixam explícito que esses
campos são contexto do snapshot anterior, não a situação financeira atual.

`competencias_necessarias` representa as competências da janela que possuem
fatura vencida relevante no último snapshot, portanto pode ser menor que três.
Os valores `3` do exemplo acima são ilustrativos.

## Regra contratual de valor

O valor atualizado continuará sendo calculado uma única vez no canônico:

```text
valor_atualizado = valor_original ×
  (1 + 0,02 + 0,01 × dias_atraso / 30)
```

- `valor_original` representa o valor cheio após perda do desconto
  condicional;
- multa: 2%;
- mora: 1% ao mês pro rata die;
- arredondamento monetário por fatura em duas casas;
- o Emusys continua sendo a fonte do status; o cálculo local só apresenta o
  valor contratual na data de corte.

## Consumidores

### LA Report — Alunos e Farmer

- O normalizador aceitará `schema_version=3` e o estado `partial`.
- Alertas e filtro serão liberados quando
  `operational.collection_allowed=true` e `fresh_until` ainda estiver válido.
- O banner separará visualmente os dois universos, por exemplo:
  “15 inadimplências confirmadas — cobrança liberada” e
  “16 faturas aguardando reconciliação — fora da cobrança”.
- Ações e totais nunca incluirão itens de reconciliação.
- `stale`, `incomplete` e erro continuarão sem lista acionável.

### Exportação

O modo de exportação de inadimplência exportará `ok` ou `partial` quando
`collection_allowed=true`. O manifesto registrará `schema_version`, `status`,
`collection_scope`, `fresh_until`, contagem de confirmados e contagem em
reconciliação. A exportação conterá somente itens confirmados.

Relatórios financeiros que prometem fechamento completo não ganharão essa
exceção automaticamente; continuarão bloqueados se sua própria integridade
exigir fotografia completa.

### Sol

O ponto de entrada da Sol continuará sendo:

```text
public.sol_caixa_inadimplentes(
  p_unidade_id,
  p_carencia_dias,
  p_multa_pct,
  p_mora_pct_mes,
  p_grave_dias,
  p_critico_dias
)
```

Essa RPC chamará `get_inadimplencia_canonica` e obedecerá a
`operational.collection_allowed`. Em `partial`, agregará somente `items`
confirmados; em `stale` ou `incomplete`, devolverá lista vazia.

Os parâmetros `p_multa_pct` e `p_mora_pct_mes` serão mantidos apenas para
compatibilidade de assinatura. Os únicos valores aceitos serão `0.02` e
`0.01`; valor diferente produzirá erro explícito de política e jamais
recalculará a dívida fora do canônico.

O payload da Sol também exporá:

- `canonical_status`;
- `collection_allowed`;
- `collection_scope`;
- `fresh_until`;
- `source_missing_count`;
- totais confirmados e lista de alunos permitida.

A Sol não consultará `sync_run_items`, `emusys_faturas`, o booleano legado de
inadimplência ou o Emusys diretamente. Ela também não disparará um sync
paralelo. A RPC continuará executável somente por `service_role` e não serão
alteradas `sol_caixa_lancar_recebimento`, `sol_caixa_abrir`,
`sol_caixa_fechar` ou `sol_caixa_casar_parcela`.

## Atualização e erro

O botão “Atualizar agora” deve mostrar o resultado real da fila de sync:

- sucesso somente quando o job produzir snapshot completo;
- espera/backoff como estado em processamento, inclusive HTTP 429;
- erro estrutural como falha visível;
- nenhuma atualização otimista de “última sincronização” antes da publicação;
- após sucesso, nova leitura canônica para obter `status`, `fresh_until` e
  contagens atuais.

A liberação parcial não é autorização para usar snapshot velho. Se o sync
expirar, a cobrança volta a ser bloqueada até uma fotografia fresca.

## Migração e compatibilidade

- Criar migration aditiva; nenhum arquivo aplicado será reescrito.
- Atualizar o comentário e a documentação da RPC canônica.
- Preservar a verificação de admin/service role, `search_path`, grants e trilha
  de auditoria existentes.
- Atualizar `sol_caixa_inadimplentes` em migration separada no mesmo conjunto
  de rollout, sem tocar nas demais RPCs da Sol.
- Consumidor antigo que não reconheça `partial` continuará falhando fechado;
  isso é seguro durante propagação, embora não libere cobrança até sua versão
  ser atualizada.

## Testes obrigatórios

1. snapshot fresco sem pendência → `ok`, cobrança liberada;
2. snapshot fresco com `source_missing` e itens confirmados → `partial`, apenas
   confirmados em `items` e totais;
3. `source_missing` cujo último status era `aberta` → fora da cobrança;
4. `source_missing` cujo último status era `paga` → fora da cobrança;
5. mesmo ID com linha confirmada e `source_missing` → ID inteiro em quarentena,
   sem bloqueio dos demais confirmados;
6. duplicidade entre linhas confirmadas → `incomplete`, bloqueio total;
7. identidade inválida → `incomplete`, bloqueio total;
8. uma competência stale → `stale`, bloqueio total;
9. somente aluno com `entra_financeiro_ativo=true`, não arquivado e sem
   `data_saida`;
10. somente mês corrente e dois anteriores;
11. cálculo por fatura de multa e mora com arredondamento;
12. LA Report mostra confirmados e aviso separado no estado `partial`;
13. exportação parcial contém somente confirmados e manifesto explícito;
14. Sol retorna somente confirmados em `partial` e vazio em `stale` ou
    `incomplete`;
15. matrícula ausente localizada apenas por `emusys_student_id` fica em
    reconciliação e nunca é cobrada;
16. parâmetros de juros diferentes do contrato são rejeitados pela RPC da
    Sol;
17. ACL impede chamada anônima e mantém acesso administrativo/service role.

Os testes de banco usarão PostgreSQL real com transação descartável/rollback,
incluindo duas unidades, IDs Emusys repetidos entre unidades e aluno com dois
cursos.

## Gate de produção e handoff para o Claude

Antes de ativar qualquer cobrança automática:

1. publicar migrations e frontend versionados;
2. executar a sonda read-only de uma unidade/competência e comparar o
   manifesto sem publicar snapshot parcial;
3. se a sonda estiver verde, enfileirar uma competência completa; a fila
   continua publicando Campo Grande, Recreio e Barra atomicamente;
4. comparar item a item os confirmados da unidade escolhida com a tela “Contas
   a Receber → Em Atraso” do Emusys para a mesma competência e instante;
   IDs, vencimentos e `valor_original` sem juros devem coincidir, enquanto o
   `valor_atualizado` é validado separadamente pela fórmula contratual;
5. provar que cada `source_missing` ficou fora dos itens/totais de cobrança;
6. chamar `sol_caixa_inadimplentes` e comparar seus alunos e valores com os
   mesmos itens canônicos;
7. testar a interface autenticada, recarregar a página e inspecionar erros de
   console/rede;
8. somente após o verde do usuário entregar ao Claude o prompt final com
   assinatura, exemplos reais, campos, proibições e checklist para ligar a
   Sol;
9. a primeira execução da Sol será teste sem envio automático. Mensagens de
   cobrança só serão habilitadas após conferência humana da lista.

## Subprojeto seguinte — Faturas de Alunos A+C

A página dedicada será a casa canônica da operação financeira do aluno, sem
virar um módulo genérico de contas a pagar. A direção aprovada contém:

- rota e item de navegação próprios: “Faturas de Alunos”;
- UI da opção A, com resumo, lista de faturas, estados e reconciliação;
- atalhos contextuais na Lista de Alunos e no Comercial, abrindo a página já
  filtrada;
- área explícita de “Aguardando reconciliação”, sem misturar com cobrança;
- permissões operacionais/administrativas; nenhuma informação financeira será
  enviada ao LA Teacher;
- evolução posterior para recebidas, passaportes e entradas, sem incluir
  contas a pagar da empresa.

Mover “Importar alunos” ou reorganizar outras abas exige auditoria de uso e
fica fora desta entrega.

## Fora de escopo

- carteira de cobrança de ex-alunos;
- inferir pagamento a partir de `source_missing`;
- sync próprio da Sol;
- acesso financeiro no LA Teacher;
- alteração das RPCs operacionais de caixa da Sol;
- ativar mensagens automáticas antes do gate humano;
- construir a página A+C neste mesmo plano.
