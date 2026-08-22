# Sol Caixa V3 — abertura e fechamento

**Estado:** especificação para migration e runtime; não aplicada.  
**Base:** `20260822230000_sol_caixa_abrir_trava_fechamento_pendente.sql`.  
**Dono:** Alfredo (implementação) · Sol (auditoria de contrato).  
**Fora desta mudança:** `STRICT=1`, credencial do bridge, lançamento histórico e o R$ 720 antigo.

## Objetivo

Levar abertura e fechamento ao mesmo trilho V3 das demais mutações:

```
resolver canônico/snapshot → preview persistido → "pode" único
→ approval vinculado → revalidação do snapshot no banco
→ consumo único → RPC auditada e idempotente
```

Não existe abertura ou fechamento automático. `não fecha`/`não abre` cancela o preview; não muda caixa.

## Não criar uma segunda pendência

`sol_caixa_abertura_pendente` e o payload `pendencia` de `20260822230000` permanecem compatíveis. Eles não são o approval V3 e não devem ser atualizados para simular um.

Quando uma abertura encontrar um caixa anterior aberto, o runtime apresenta primeiro **um preview V3 de fechamento daquele dia pendente**. Só depois de confirmado e fechado pode criar o preview de abertura solicitado. Isso preserva o fail-closed já em produção.

## Operações e payload canônicos

Novas operações de preview:

| Operação | Categoria | Forma | Valor do preview |
|---|---|---|---|
| `abrir_caixa` | `abertura_caixa` | `nao_aplicavel` | saldo inicial proposto |
| `fechar_caixa` | `fechamento_caixa` | `nao_aplicavel` | saldo final calculado |

Campos obrigatórios para executar:

```json
{
  "unidade_id": "uuid",
  "grupo_jid": "grupo@g.us",
  "data_caixa": "YYYY-MM-DD",
  "ator_numero": "somente dígitos",
  "ator_papel": "grupo",
  "conferido_por": "nome exibido",
  "idempotency_key": "sol-caixa:v3:<operacao>:<unidade>:<data>:<evento>",
  "v3_preview_id": "uuid",
  "v3_preview_hash": "sha256",
  "v3_approval_id": "uuid",
  "v3_approval_event_hash": "sha256",
  "v3_actor_id_hash": "sha256",
  "snapshot_hash": "sha256",
  "snapshot_caixa_diario_id": "uuid ou null"
}
```

`valor`, `forma` e `categoria` continuam no payload para o ledger V3; são os valores tabelados acima, não uma forma fictícia de pagamento.

## Snapshot de abertura

O resolver, em leitura, devolve e grava no preview:

```json
{
  "operacao": "abrir_caixa",
  "unidade_id": "uuid",
  "data_caixa": "YYYY-MM-DD",
  "caixa_hoje": null,
  "caixa_anterior_aberto": null,
  "ultimo_fechado_id": "uuid ou null",
  "ultimo_fechado_data": "YYYY-MM-DD ou null",
  "saldo_inicial_proposto": 62.80
}
```

Se houver qualquer caixa anterior aberto, o resolver retorna `fechamento_pendente_dia_anterior` com o mesmo objeto `pendencia` de `20260822230000`; não gera preview de abertura.

Na execução, dentro de transação e com lock, o banco confirma novamente: não existe caixa no dia, não existe caixa anterior aberto e o último saldo fechado ainda produz o mesmo saldo inicial. Divergência recusa sem consumir approval: `snapshot_caixa_ja_existe`, `snapshot_fechamento_anterior_pendente` ou `snapshot_saldo_inicial_mudou`.

## Snapshot de fechamento

O resolver, em leitura, devolve e grava no preview:

```json
{
  "operacao": "fechar_caixa",
  "unidade_id": "uuid",
  "data_caixa": "YYYY-MM-DD",
  "caixa_diario_id": "uuid",
  "status": "aberto",
  "saldo_inicial_cofre": 62.80,
  "cofre_entradas": 100.00,
  "cofre_saidas": 20.00,
  "saldo_final_calculado": 142.80,
  "movimentos_por_ambiente": {
    "cofre": 3,
    "venda": 7
  }
}
```

Na execução, o banco bloqueia o `caixas_diarios` alvo, recompõe entradas/saídas e a **contagem de movimentos por ambiente** em `caixa_movimentacoes`, e compara **id, data, unidade, status, valores e contagens** com o snapshot. Qualquer movimento entre preview e `pode` — inclusive Pix/cartão em `venda`, que não altera o cofre — força novo preview (`snapshot_caixa_nao_aberto`, `snapshot_caixa_divergente`, `snapshot_saldo_mudou`).

## Hash, expiração e consumo

- `snapshot_hash` é `sha256` da serialização `jsonb::text` do objeto de snapshot, construído no banco. Nenhum hash vindo do bridge é autoridade.
- O preview expira no menor entre quatro horas após sua criação e o fim do dia operacional em `America/Sao_Paulo`. Não há UTC hardcoded.
- O validador de abertura/fechamento verifica preview, grupo, ator, approval, hash, expiração e snapshot **antes** de inserir em `sol_caixa_v3_approval_consumos_v1`.
- O consumo usa o mesmo `approval_id` único do V3. Snapshot recusado não queima o `pode`; concorrência deixa uma execução vencedora e a outra recebe `approval_v3_ja_consumido` ou o resultado idempotente.

## Persistência e idempotência

A migration cria `sol_caixa_v3_caixa_operacoes_v1` apenas como ledger de execução, sem substituir `sol_caixa_abertura_pendente`:

```
id, unidade_id, data_caixa, operacao, caixa_diario_id,
preview_id, approval_id, idempotency_key, snapshot_hash,
resultado, criado_em
```

Índices únicos:

```
(idempotency_key)
(unidade_id, data_caixa, operacao)
```

Repetir a mesma requisição devolve o resultado previamente gravado; uma segunda aprovação para a mesma abertura/fechamento devolve `ja_aberto`/`ja_fechado` sem nova mutação. Toda recusa e sucesso entra em `sol_caixa_lancamento_auditoria` com operação, preview e approval.

**Reabertura não entra nesta V3.** O fluxo humano já existente, registrado em `caixa_reaberturas_log`, continua fora de escopo. Enquanto não houver contrato próprio para reabertura, a V3 não cria uma segunda operação `abrir_caixa`/`fechar_caixa` no mesmo dia; o índice único preserva essa fronteira.

## Autorização

Esta entrega não cria seed de atores para `abrir_caixa`/`fechar_caixa` nem abre exceção de permissão. Cada execução continua obrigada a passar por `sol_caixa_autorizar_payload_v1`; a configuração de grupo financeiro oficial/matriz de autorizados é pré-requisito operacional da aplicação. Se a matriz não autorizar o ator, a V3 falha fechada antes de qualquer consumo ou mutação.

## RPCs propostas

| RPC | Faz | Não faz |
|---|---|---|
| `sol_caixa_resolver_abertura_v3(jsonb)` | lê e monta snapshot | não cria caixa |
| `sol_caixa_resolver_fechamento_v3(jsonb)` | lê e monta snapshot | não fecha caixa |
| `sol_caixa_abrir_v3(jsonb)` | valida approval/snapshot e abre | não reescolhe saldo |
| `sol_caixa_fechar_v3(jsonb)` | valida approval/snapshot e fecha | não usa saldo cacheado |
| `sol_caixa_v3_cancelar_preview_v1(jsonb)` | marca preview cancelado | não consome approval |

Os grants serão somente para o papel do runtime restrito/relay e `service_role` enquanto a migração de credencial não terminou; nunca `anon`/`authenticated`/`public`.

## Pré-requisito da remoção de rabiolas

Antes de implantar o runtime que remove as leituras REST diretas, a mesma frente do LA Report cria a RPC read-only `sol_caixa_resolver_composto_aluno_v1(jsonb)`.

Entrada mínima: `unidade_id`, `aluno_nome`, `competencia` e `valor_total`. Ela consulta a fonte canônica por trás de `sol_faturas_alunos_v1`, devolve apenas um conjunto de duas ou mais faturas cuja soma fecha exatamente o total, com aluno canônico, competência e itens normalizados. Nenhum match único ou soma divergente vira preview: retorna `ok:false` com motivo classificável. O bridge nunca volta a ler `alunos` ou `emusys_faturas` por REST.

O retorno `itens[]` usa exatamente o shape consumido pelo multi-aluno: ao menos `ordem`, `aluno_id`, `aluno_nome`, `responsavel_financeiro`, `competencia`, `categoria`, `valor`, `canonical_fatura_id`, `descricao` e `fatura`. Assim lote, snapshot e runtime não precisam saber se a composição nasceu de itens explícitos ou do resolver composto. Se dois ou mais subconjuntos canônicos fecharem o mesmo total, o resultado é `ok:false`, `motivo:'composicao_ambigua'`: não escolhe por ordem, primeiro nome ou heurística.

O runtime também remove `sol_caixa_corrigir_forma_recebimento`: correção de forma passa exclusivamente por `sol_caixa_corrigir_movimento_v1` com preview/approval V3; se o ledger V3 não estiver disponível, falha fechado.

## Mudança mínima no runtime

1. Comando de abrir/fechar chama resolver e publica o preview V3 persistido.
2. `pode` registra approval e chama apenas a RPC V3 correspondente.
3. `não abre`/`não fecha` cancela o preview persistido e limpa a pendência em memória.
4. Não usa `sol_caixa_abrir`, `sol_caixa_fechar` nem `sol_caixa_pendencia_resolver` para executar a mutação nova.
5. A pendência pré-existente de 22/08 é usada somente para orientar o fechamento anterior obrigatório.

## Critérios de aceite (migration + runtime)

1. Abertura normal; replay da mesma mensagem; duas aprovações concorrentes.
2. Fechamento normal; replay; duas aprovações concorrentes.
3. Movimento entre preview e `pode` bloqueia fechamento e não consome approval.
4. Caixa anterior aberto bloqueia abertura e oferece fechamento pendente primeiro.
5. Caixa já aberto/fechado retorna resultado idempotente, sem segunda linha em `caixas_diarios` ou segunda auditoria de mutação.
6. Grupo/unidade/ator/preview/hash/approval divergentes são recusados.
7. `não abre`/`não fecha` não altera `caixas_diarios`, `caixa_movimentacoes` ou consumos.
8. Composto: parcela dividida em dois comprovantes; pagador diferente do responsável; parcela + passaporte; João/Pedro; e dois subconjuntos válidos retornando `composicao_ambigua`.
9. Fechamento: uma venda Pix/cartão entre preview e `pode` bloqueia por divergência de contagem, sem consumir approval.
10. Matriz E2E real: uma abertura e um fechamento em cada grupo financeiro oficial, depois de canário autorizado.

## Gate de promoção

Migration aplicada e testes SQL verdes → runtime em modo shadow/preview no grupo-canário → canário real com rollback → E2E das três unidades. Nada nesta spec libera `STRICT=1` ou troca a credencial do bridge.
