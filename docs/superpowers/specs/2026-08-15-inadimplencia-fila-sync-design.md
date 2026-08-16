# Fila única do sync financeiro Emusys

Data: 15/08/2026  
Projeto Supabase: `ouqwbbermlzqqvtqwlul`  
Branch: `fix/inadimplencia-canonica-frescor`

## Decisão já aprovada

Toda atualização persistente de faturas passa por uma única fila no banco. Um
job representa uma competência completa e o worker coleta Campo Grande,
Recreio e Barra em sequência. O snapshot só é publicado depois que as três
unidades terminarem completas; não existe publicação parcial.

O gate de uma unidade/competência será uma sonda read-only contra o Emusys. Ela
não cria `sync_run`, não altera o espelho e não publica snapshot. Sua finalidade
é permitir a comparação item a item antes de qualquer automação.

## Evidência que motivou o desenho

- há três crons diretos ativos, cada um chamando `sync-faturas-emusys` sem fila;
- em 16/08, agosto falhou com HTTP 429 no Recreio;
- julho falha repetidamente com HTTP 429 e o último snapshot completo é de
  08/08;
- junho tem snapshot completo de 19/07 e saiu da janela automática;
- IDs opcionais inválidos (`matricula_id`, `contrato_id`, `aluno_id`) abortam a
  competência inteira, embora a fatura possua ID próprio válido;
- o rate limiter atual existe somente na memória de uma invocação e não
  coordena concorrência entre crons/processos.

## Alternativas consideradas

### A. Um job global por competência — escolhida

O worker processa as três unidades serialmente e publica uma única fotografia.
É compatível com a invariável atual de `snapshot_complete=true` e mantém a
publicação atômica. Em caso de 429, o job volta para espera persistente e a
tentativa recomeça depois do backoff.

### B. Um job por unidade com agregador

Reduz chamadas repetidas quando a terceira unidade recebe 429, mas exige
staging durável de payload, coordenação de três leases e expiração de partes.
Também aumenta o risco de misturar coletas feitas em instantes muito
diferentes. Fica fora deste checkpoint.

### C. Apenas mudar horários e aumentar retries

Não resolve concorrência, não cobre competências antigas dinamicamente e
repete rajadas dentro da mesma invocação. Foi rejeitada.

## Componentes

### `financeiro_sync_queue`

Fila durável com uma linha por job e estados `pending`, `running`,
`retry_wait`, `succeeded` e `failed`. Guarda competência, prioridade, origem,
solicitante, tentativas, próximo horário elegível, lease, run publicado,
classificação do erro e timestamps.

Um índice parcial impede mais de um job ativo por competência. Outro índice
parcial atende o claim por estado e `next_attempt_at`. RLS fica ativa sem
política pública; somente RPCs `SECURITY DEFINER` explicitamente concedidas ao
`service_role` operam a fila.

### RPCs privadas da fila

- enqueue idempotente de competências explícitas;
- descoberta do backlog: atual, anterior, seguinte e toda competência cujo
  último snapshot completo ainda contenha fatura aberta ou `source_missing`;
- claim atômico com `FOR UPDATE SKIP LOCKED`, lease curto e no máximo um worker
  global em `running`;
- conclusão com `sync_run_id`;
- retry persistente com backoff exponencial limitado e respeito ao maior
  `Retry-After` recebido;
- falha terminal depois do limite ou para erro estrutural não recuperável;
- recuperação de lease expirado sem manter transação aberta durante HTTP.

As RPCs de caixa da Sol não são chamadas nem alteradas.

### Coletor Emusys

O intervalo mínimo de 1,2 segundo continua valendo dentro de uma tentativa.
HTTP 429 deixa de executar cinco retries imediatos: o coletor lança erro
tipado com `retry_after_ms`, e o worker devolve o job para `retry_wait`.
Falhas transitórias de rede/5xx seguem o mesmo caminho; violações estruturais
de paginação, ID obrigatório ou data são terminais.

`id` da fatura e `data_vencimento` permanecem obrigatórios. IDs opcionais
inválidos viram `null` e uma lista auditável de avisos. A linha é preservada no
snapshot, mas o vínculo inválido não é inventado. A leitura canônica trata
fatura com aviso de identidade como reconciliação pendente e não a entrega
para cobrança.

### Edge Functions

`sync-faturas-emusys` mantém `verify_jwt=true` e ganha dois modos:

1. `worker`: reclama um job da fila e executa no máximo uma competência;
2. `probe`: somente `service_role`, uma unidade/competência, coleta e devolve
   manifesto/itens sem qualquer escrita.

`refresh-contas-receber` mantém seu segredo interno, enfileira as competências
pedidas ou o backlog canônico e pode acordar um único worker. O retorno expõe
o estado do job, `next_attempt_at`, erro e `sync_run_id`, sem transformar 429
em sucesso aparente.

## Automação e rollout

Os três crons diretos são neutralizados quando a fila entra. Nenhum cron novo
é ativado neste checkpoint. Após o gate item a item, uma migration separada
poderá criar um único dispatcher periódico. O cron da Sol permanece desligado
até a leitura canônica e a comparação com o Emusys ficarem verdes.

## Testes e critérios de aceite

1. fixture PostgreSQL prova enqueue idempotente, claim concorrente, lease,
   backoff, limite de tentativas, backlog de junho e ACL;
2. testes unitários provam 429 tipado/`Retry-After` e ID opcional inválido sem
   abortar a competência;
3. contrato garante publicação apenas por job reclamado e preserva
   `verify_jwt=true`;
4. migration neutraliza somente os três crons diretos conhecidos e não cria
   automação nova;
5. sonda de uma unidade não chama `start_financeiro_sync_run` nem
   `publish_financeiro_sync_run`;
6. antes de liberar cron, Campo Grande ou outra unidade escolhida é comparada
   item a item com a tela real do Emusys para a mesma competência.

## Fora de escopo

- RPCs operacionais do caixa da Sol;
- tratar `source_missing` como pagamento;
- publicação parcial por unidade;
- ligar o cron da Sol ou o dispatcher financeiro antes do gate;
- alterar `verify_jwt` de `sync-faturas-emusys`.
