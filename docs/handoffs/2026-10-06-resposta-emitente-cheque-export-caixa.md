# Resposta — campos de cheque no export-caixa-movimentacoes (06/10/2026)

Pergunta: `2026-10-06-pergunta-emitente-do-cheque-no-export-caixa.md`

## Resumo

| Campo pedido | Status |
|---|---|
| `cheque_numero` / `cheque_banco` | ✅ já vêm no export |
| `cheque_bom_para` | ✅ campo exportado — veio `null` porque **a Sol mandou null**; ver §3 |
| `faturas` do cheque multi-parcela | ✅ **já vêm** — em `faturas_vinculadas[]`; ver §4 |
| `cheque_emitente_nome` | 🟡 pronto do nosso lado; falta a Sol enviar |
| `cheque_emitente_documento_hash` | 🟡 pronto do nosso lado; falta a Sol enviar |
| `cheque_agencia` / `cheque_conta` | 🟡 pronto do nosso lado; falta a Sol enviar |

## 1. O que mudou hoje (nosso lado, já aplicado)

Migration `20261006120000_caixa_cheque_emitente_cmc7` + deploy do
`export-caixa-movimentacoes`:

- 4 colunas novas em `caixa_movimentacoes` (todas nullable, nada quebra):
  `cheque_emitente_nome`, `cheque_emitente_documento_hash`,
  `cheque_agencia`, `cheque_conta`.
- As duas RPCs de lançamento (`sol_caixa_lancar_recebimento` e
  `sol_caixa_lancar_recebimento_lote_v1`) passam a gravar esses campos quando
  vierem no payload — no lote, por item (`itens[i]`, mesmo lugar de
  `cheque_numero`).
- O export emite os 4 campos em toda linha (`null` enquanto a Sol não mandar).

**Segurança do documento:** a RPC só grava o campo se vier hex de 64 chars —
isto é, HMAC-SHA256 já aplicado (`sol_cheque_documento_hash_v1`, mesma chave
`emusys_cpf_hmac_key_v1` da Vault que vocês já usam para resolver CPF).
Qualquer outra coisa vira `null`. **Documento em claro nunca é gravado nem
exportado.**

## 2. Por que emitente/agência/conta não existiam

A leitura do cheque (`caixa-cheques.cjs` na Sol) prova por código o CMC-7 de
30 dígitos — banco+agência+conta+número conferidos com o impresso — e lê o
emitente (nome IMPRESSO no rodapé; o nome à mão é o beneficiário). Mas até
hoje isso era **efêmero**: usado para resolver a fatura e descartado. O banco
só recebia numero/banco/bom-para. As colunas e o encanamento agora existem;
**falta a Sol incluir os campos no payload de lançamento** — é um acréscimo
por item:

```json
{
  "cheque_numero": "000212",
  "cheque_banco": "033",
  "cheque_bom_para": "2026-10-20",
  "cheque_emitente_nome": "Fulano de Tal",
  "cheque_emitente_documento_hash": "<64 hex>",
  "cheque_agencia": "1234",
  "cheque_conta": "12345678-9"
}
```

⚠️ **`emitente` ≠ `responsavel_financeiro`.** O emitente é quem assina o
cheque (pode ser qualquer pessoa); o responsável vem do cadastro. Não inferir
um pelo outro — o campo só existe se a Sol leu e provou no papel.

## 3. Por que `cheque_bom_para` chegou vazio

O campo existe ponta a ponta (payload → RPC → coluna → export). Conferimos
os 13 cheques lançados em 06/10: **a Sol mandou `cheque_bom_para: null` em
todos** — inclusive o nº 850047 (Banco do Brasil, Luci Machado Viegas), cujo
payload de lançamento está auditado em `sol_caixa_lancamento_auditoria`.

Duas leituras possíveis:

- **À vista:** cheque à vista não tem bom-para — `null` é a resposta certa.
  A data impressa vai em `cheque_data_ref` no item do lote (veio
  `2026-10-05`, dia do depósito).
- **Pré-datado:** se algum desses for pré-datado, a Sol não está repassando
  a data — a decisão de parcela dela já usa o bom-para ("data mais próxima do
  bom-para/lote"), então o dado existe no runtime dela; falta só mapear no
  payload. Vale o mesmo acréscimo do §2.

Resumo: o encanamento está pronto; a régua "à vista → null, pré-datado →
data" precisa ser confirmada/mplementada do lado da Sol.

## 4. Cheque cobrindo múltiplas faturas — já sai

O caso citado (Santander nº 000008, R$ 800, 2 parcelas, Júlia e Matheus
Lopes de Medeiros / Recreio): a movimentação tem `fatura_id = null` **de
propósito** — não há uma única fatura. Os vínculos reais moram em
`caixa_movimentacao_faturas` (2 linhas → `emusys_fatura_id` **26532** Teclado
10/2026 e **27666** Bateria 10/2026) e o export já emite **todas** no campo
`faturas_vinculadas[]`:

```json
"faturas_vinculadas": [
  { "fatura_id": "…", "emusys_fatura_id": "26532",
    "emusys_matricula_id": "…", "emusys_student_id": "…" },
  { "fatura_id": "…", "emusys_fatura_id": "27666",
    "emusys_matricula_id": "…", "emusys_student_id": "…" }
]
```

`aluno_nome`/`emusys_fatura_id` de topo ficam `null` justamente porque não há
UM aluno/uma fatura — a resposta certa é a lista. Se o `la-caixa-sync` de
vocês ainda não lê `faturas_vinculadas`, é esse o campo a consumir (existe
desde o modelo de pagamento composto; itens simples trazem 1 elemento).

## 5. Contrato do export (inalterado)

```
POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/export-caixa-movimentacoes
x-super-folha-sync-secret: <mesmo segredo de sempre>
{ "competencia": "2026-10-01" }   ou   { "data_inicio": "…", "data_fim": "…", "unidade_id": … }
```

Campos novos são só acréscimos na mesma linha — quem não conhece ignora.

## Pendente do lado da Sol (não é Super Folha nem export)

1. Mandar `cheque_emitente_nome`, `cheque_emitente_documento_hash` (HMAC, já
   computado na leitura), `cheque_agencia`, `cheque_conta` no payload de
   lançamento — lote (por item) e simples (topo).
2. Mandar `cheque_bom_para` com a data impressa quando o cheque for
   pré-datado (à vista pode seguir `null`).

Até lá os campos vêm `null` — comportamento esperado, não bug.
