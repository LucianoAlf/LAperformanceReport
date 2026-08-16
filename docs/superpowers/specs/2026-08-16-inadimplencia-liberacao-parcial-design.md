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
- snapshot velho, status financeiro desconhecido ou duplicidade confirmada não
  isolável continuam bloqueando a leitura inteira;
- identidade opcional inválida (`matricula_id`, `aluno_id` ou `contrato_id`)
  fica auditada em `validation_issues` e em quarentena; ela não derruba a
  coleta nem autoriza cobrança daquela fatura;
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

Nota de versão documental: o anexo `api_emusys (2).json` informa OpenAPI
`1.2.2`; ele confirma `/matriculas` e `/faturas`, mas é anterior a
`/crm/aniversariantes` v1.3.0 e à semântica de matrícula v1.3.1. Ausência nesse
snapshot antigo não será interpretada como ausência na API atual; para esses
dois pontos prevalecem o changelog/GitBook atual e o comportamento versionado
no sync. O snapshot já versionado no repositório,
`docs/api_emusys_v1.4.0.json`, contém `trancamento_ativo`, `motivo_inativa` e
`/crm/aniversariantes`.

- Fonte persistida: último snapshot `live`, `succeeded`, completo e fresco de
  `sync_runs` + `sync_run_items`.
- Grão da saída: uma fatura Emusys canônica vencida.
- Chave da fatura: `canonical_fatura_id`, sempre escopada pela unidade.
- Identidade da dívida: a fatura precisa casar exatamente com
  `unidade_id + emusys_matricula_id`, e a matrícula conhecida precisa pertencer
  ao mesmo `unidade_id + emusys_student_id` informado na fatura.
- `unidade_id + emusys_student_id` pode localizar um candidato para
  reconciliação quando a matrícula está ausente, mas nunca autoriza cobrança;
  nome nunca é chave automática.
- Universo financeiro: pessoa com **qualquer** matrícula atual `ativa` ou
  `trancada` na mesma unidade, identificada por
  `unidade_id + emusys_student_id`. A matrícula que prova o papel atual deve
  estar não arquivada. `entra_financeiro_ativo` continua significando apenas
  `ativa` para os demais consumidores; a RPC financeira acrescenta
  `eh_trancamento_atual=true` sem alterar a view compartilhada.
- Quando há estado v1.3.1 sincronizado (`raw_encontrado=true`), ele prevalece:
  `status_emusys IN ('ativa', 'trancada')` autoriza o recorte financeiro mesmo
  se uma `data_saida` histórica permaneceu na linha local após reingresso.
  `status_emusys='inativa'`, com motivo `interrompida` ou `concluida`, fica fora.
  Sem estado Emusys atual, o fallback local só aceita `ativo|trancado` com
  `data_saida IS NULL`.
- Janela: mês da data de corte e as duas competências anteriores. Em
  agosto/2026, portanto, junho, julho e agosto — não 90 dias móveis.
- Vencimento/verdade financeira: `data_vencimento < p_as_of_date`, isto é,
  **D+0** segundo o contrato oficial de `contrato_atual.inadimplente` do
  Emusys. Esse universo alimenta consulta, totais financeiros e a página de
  Faturas.
- Cobrança amigável: **D+2**, aplicada depois do gate canônico por Farmer e
  `sol_caixa_inadimplentes` com `dias_atraso >= 2`. A carência não altera a
  verdade financeira D+0 e o booleano D+0 do Emusys nunca autoriza contato por
  si só.

Quem não possui nenhuma matrícula atual `ativa|trancada` fica fora desta lista,
mesmo que exista fatura antiga na janela. `data_saida` não pode, sozinha,
transformar um reingresso confirmado pelo Emusys em ex-aluno. A classificação
oficial `aluno|ex_aluno` de
`GET /crm/aniversariantes` será usada como prova de reconciliação, não como uma
segunda dependência operacional: o endpoint é orientado a aniversários e a
mesma verdade de ciclo de vida já chega pelo sync de `GET /matriculas`. A futura
carteira de ex-alunos devedores continua sendo outro produto.

Consequência explícita do reingresso: uma fatura da matrícula anterior pode
entrar, dentro da janela de três competências, quando a matrícula da própria
fatura for conhecida exatamente, pertencer à mesma pessoa e essa pessoa tiver
outra matrícula atual `ativa|trancada`. O `emusys_student_id` prova o papel
atual, mas nunca substitui o casamento exato da fatura.

## Classificação de cada fatura

Uma fatura entra em `items` e nos totais confirmados somente quando todas as
condições abaixo forem verdadeiras:

```text
snapshot live completo e fresco
AND status = 'aberta'
AND source_missing = false
AND data_vencimento < data de corte
AND competência dentro da janela de três meses
AND matrícula da fatura conhecida exatamente e pertencente à mesma pessoa
AND pessoa com alguma matrícula atual ativa ou trancada na unidade
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
4. Metadado opcional de identidade inválido é isolado por
   `canonical_fatura_id`, registrado em `validation_issues` e
   `invalid_identity_invoices`, e fica fora de itens e totais. Os demais
   confirmados continuam disponíveis em `partial`. Não haverá fallback
   inventado por nome ou `emusys_student_id`.
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
  "status": "ok | partial | stale | incomplete | error",
  "fonte": "sync_run_items",
  "unidade_id": "uuid | null",
  "as_of_date": "YYYY-MM-DD",
  "avaliado_em": "timestamp",
  "policy": {
    "student_scope": "exact_invoice_enrollment + current_student_role(active_or_locked); raw Emusys atual prevalece sobre data_saida legado",
    "delinquency_rule": "d_plus_0",
    "collection_grace_days": 2,
    "competencias_inicio": "YYYY-MM-01",
    "competencia_fim": "YYYY-MM-01"
  },
  "operational": {
    "collection_allowed": true,
    "collection_scope": "confirmed_only | blocked",
    "consumer_must_apply_collection_grace": true,
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
| `partial` | snapshots frescos; há `source_missing`, identidade inválida isolável e/ou contato local não unívoco | `true` | somente confirmados; contato apenas dos resolvidos |
| `stale` | ao menos uma competência necessária fora do frescor | `false` | `items=[]` e totais zerados |
| `incomplete` | duplicidade confirmada ou falha estrutural não isolável | `false` | `items=[]` e totais zerados |

A precedência será `stale` → `incomplete` → `partial` → `ok`. Consumidores
devem obedecer a `operational.collection_allowed`; não devem reinterpretar o
texto de `status`. Também devem invalidar ações quando o relógio ultrapassar
`freshness.fresh_until` sem uma nova leitura.

Os valores bloqueantes de `operational.block_reasons` serão estáveis:
`stale_competencia` e `duplicate_confirmed_fatura`. Em `partial`,
`block_reasons` ficará vazio porque cada pendência foi isolada; os motivos
continuarão registrados em `reconciliation`.

`operational.collection_allowed=true` significa que o conjunto confirmado
passou pelos gates de integridade e frescor. Não significa que toda fatura D+0
já possa receber contato: `consumer_must_apply_collection_grace=true` obriga o
consumidor operacional a aplicar `policy.collection_grace_days=2`. Além disso,
cada item publica `aluno_id_canonico` e `contact_resolution_status`. Só
`contact_resolution_status='resolved'` com um único `aluno_id_canonico` pode
ser enriquecido para contato; `missing|ambiguous` permanece no total financeiro
D+0 e entra em `reconciliation.contact_resolution_pending_count`.

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
- a resposta ao vivo de `GET /faturas` também fornece `juros_e_multa` e
  `desconto_aplicado` calculados dinamicamente. O sync deve preservar esses
  campos como evidência da origem, mas a régua contratual acima continua sendo
  o único cálculo canônico; o gate de produção compara os dois e explica toda
  divergência por item.

Resultado do gate de 16/08/2026: embora a OpenAPI descreva esses campos como
dinâmicos, o payload vivo das três faturas vencidas de Campo Grande em agosto
retornou explicitamente `juros_e_multa=0` e `desconto_aplicado=0`. A fórmula
contratual calculou R$ 10,58 por fatura de R$ 447 vencida há 11 dias. Portanto,
os campos da API ficam preservados como evidência, mas não substituem o cálculo
canônico enquanto essa divergência existir.

## Consumidores

### LA Report — Alunos e Farmer

- O normalizador aceitará `schema_version=3` e o estado `partial`.
- Alertas e filtro serão liberados quando
  `operational.collection_allowed=true` e `fresh_until` ainda estiver válido.
- A Lista de Alunos exibirá o universo financeiro D+0, sem prometer contato,
  por exemplo: “15 inadimplências confirmadas (D+0) — leitura financeira
  disponível”. O Farmer exibirá somente elegíveis D+2 como “cobrança amigável
  D+2”.
- O banner separará visualmente o confirmado das quarentenas, por exemplo:
  “15 inadimplências confirmadas (D+0)” e
  “16 faturas aguardando reconciliação — fora da cobrança”.
- Contato local ausente ou ambíguo terá aviso próprio: a fatura continua no
  total financeiro D+0, mas não entra no Farmer D+2.
- Ações e totais nunca incluirão itens de reconciliação.
- `stale`, `incomplete` e erro continuarão sem lista acionável.

### Exportação

O modo de exportação de inadimplência exportará `ok` ou `partial` quando
`collection_allowed=true`. O manifesto registrará `schema_version`, `status`,
`collection_scope`, `fresh_until`, `delinquency_rule=d_plus_0`,
`collection_grace_days=2`, `collection_grace_applied=false`, contagem de
confirmados e contagem em reconciliação. A exportação conterá somente itens
confirmados e não será, sozinha, autorização para contato.

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
confirmados; em `stale` ou `incomplete`, devolverá lista vazia. Antes de
agregar, aplicará `dias_atraso >= p_carencia_dias`, cujo default e valor
operacional aprovado são `2`.

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
7. identidade opcional inválida → `partial`, fatura em quarentena e demais
   confirmados preservados;
8. uma competência stale → `stale`, bloqueio total;
9. pessoa com alguma matrícula atual `ativa|trancada` entra; sem nenhuma
   matrícula atual, fica fora como ex-aluno;
10. reingresso com estado Emusys atual `ativa|trancada` não é excluído por
    `data_saida` histórica; no fallback sem raw, `data_saida` continua
    excluindo;
11. fatura da matrícula anterior só entra se a matrícula for conhecida
    exatamente, pertencer à mesma pessoa e houver outra matrícula atual dessa
    pessoa; divergência de `student_id` fica em quarentena;
12. somente mês corrente e dois anteriores;
13. cálculo por fatura de multa e mora com arredondamento;
14. Lista de Alunos mostra confirmados D+0 sem prometer cobrança; Farmer mostra
    somente D+2 e aviso separado no estado `partial`;
15. exportação parcial contém somente confirmados e manifesto explícito;
16. Sol retorna somente confirmados em `partial` e vazio em `stale` ou
    `incomplete`;
17. matrícula ausente localizada apenas por `emusys_student_id` fica em
    reconciliação e nunca é cobrada;
18. parâmetros de juros diferentes do contrato são rejeitados pela RPC da
    Sol;
19. ACL impede chamada anônima e mantém acesso administrativo/service role.
20. exatamente um cadastro atual publica `aluno_id_canonico` resolvido;
    zero/múltiplos cadastros não são desempates por ordenação, permanecem nos
    totais D+0 e ficam fora do contato D+2;
21. reingresso usa o cadastro atual como contato, nunca a linha histórica da
    matrícula devedora.

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
   IDs, vencimentos e `valor_original` sem juros devem coincidir; a mesma
   consulta ao vivo também confrontará `juros_e_multa` e `desconto_aplicado`
   contra os campos preservados e a fórmula contratual, explicando qualquer
   divergência por item;
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
- detalhe/histórico por matrícula consultado ao vivo com
  `GET /faturas?matricula_id=...`, sem janela de datas, paginação por cursor e
  limite máximo de 50; IDs continuam escopados pela unidade;
- fallback de detalhe também poderá usar `aluno_id` ou `contrato_id` somente
  como filtros explícitos e auditados, nunca como casamento automático entre
  unidades;
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
