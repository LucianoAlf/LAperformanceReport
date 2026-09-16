# Levantamento PIX Automático — LA Music (v6, regra final pós-auditoria cruzada)

**Janela:** 90 dias, só **MENSALIDADES** (`numero_parcela` preenchido — taxa de matrícula e passaporte fora). **Universo:** 1.170 matrículas ativas → **clientes pagantes** (responsável; senão, o próprio aluno). Fontes: `emusys_faturas` e `financeiro_emusys_lancamentos` (espelhos diários da API Emusys), `emusys_matriculas_estado_atual`.

**Sobre a tarifa:** o campo `tarifa_meio_pagamento` é **valor em R$ por parcela** (em torno de R$ 4,46 na faixa recorrente), **não percentual**. Tarifa = 0 = cobrança que não passou pela operadora.

---

## Regra final (auditoria cruzada LA Report × Super Folha)

- **NÃO MEXE:** todas as mensalidades dos 90 dias pagas em `Cartão de Crédito` **sem bandeira e com tarifa > 0** (gateway), sem parcela vencida há mais de 5 dias. **Um mês fora disso já manda para a migração.** Cliente novo (0–1 mensalidade) com contrato cadastrado no crédito fica fora também (pouco histórico, a forma cadastrada manda).
- **JÁ MIGROU:** Pix Automático cadastrado **e a última mensalidade veio Pix com tarifa** (o sistema cobrou de verdade). Não basta o cadastro.
- **AUTORIZAÇÃO PENDENTE:** Pix Automático cadastrado, mas a última mensalidade veio Pix **sem tarifa** (baixa manual) ou por outra forma — provavelmente o cliente nunca autorizou o débito. Grupo próprio, entra na cobrança da equipe.
- **PRECISA MIGRAR:** todo o resto (Pix solto, cheque, boleto, dinheiro, transferência, débito, maquininha — cartão com bandeira ou tarifa 0 —, qualquer mês fora do padrão, vencida > 5 dias).
- **EXCEÇÃO:** empresa/convênio (Sbacem financeiro) à parte.
- **NÃO PAGANTE:** bolsa integral / mensalidade 0 / sem fatura — fora da migração.

## A prova: recorrente × maquininha × Pix manual

| Sinal | A: cartão recorrente (c.a. ativa) | C: sem cobrança automática | Pix Automático cadastrado |
|---|---:|---:|---:|
| Tarifa = 0 | 2 de 1.555 (**0,1%**) | 17 de 80 (**21%**) | — |
| Bandeira na forma (Visa/MC) | 1 de 1.555 (**0,06%**) | 14 de 80 (**18%**) | — |
| Lançamento `Nome (BANDEIRA Crédito)`, conta nula | não | **sim (provados)** | — |

| Pix Automático (48 matrículas cadastradas) | n |
|---|---:|
| Última mensalidade Pix **com tarifa** (sistema cobrou) | 27 (→ JÁ MIGROU — CG 7, REC 10, BAR 10 clientes) |
| Última mensalidade Pix **sem tarifa** (baixa manual) | 19 |
| Última mensalidade outra forma | 2 |
| **Total cadastrado mas não cobrando** | **21 famílias → AUTORIZAÇÃO PENDENTE** (CG 6, REC 9, BAR 6) |

Prova nominal da maquininha nos lançamentos (conta nula, baixa no dia): `Gilberto Barbosa (VISA Crédito)` ×12, `José Campos (MASTERCARD Crédito)` ×6, `Renan Barros (MASTERCARD Crédito)` ×12, `Lisane Nogueira (VISA Crédito)`.

---

## Tabela final por unidade (clientes pagantes / matrículas)

### Campo Grande — 353 clientes pagantes (463 matrículas)

| Grupo | Clientes | Matrículas |
|---|---:|---:|
| Não mexe (crédito gateway em dia) | 110 | 144 |
| Já no PIX automático (cobrando) | 7 | 7 |
| Autorização pendente (cadastrado, baixa manual) | 6 | 8 |
| Precisa migrar | 230 | 285 |
| Exceção | 0 | 0 |
| **Total pagante** | **353** | **444** |
| Não pagante (à parte) | 14 | 19 |
| **Total geral** | **367** | **463** ✓ |

### Recreio — 290 clientes pagantes (423 matrículas)

| Grupo | Clientes | Matrículas |
|---|---:|---:|
| Não mexe | 184 | 277 |
| Já no PIX automático | 10 | 11 |
| Autorização pendente | 9 | 12 |
| Precisa migrar | 87 | 123 |
| **Total pagante** | **290** | **423** ✓ |
| **Total geral** | **290** | **423** ✓ |

### Barra — 204 clientes pagantes (284 matrículas)

| Grupo | Clientes | Matrículas |
|---|---:|---:|
| Não mexe | 143 | 199 |
| Já no PIX automático | 10 | 16 |
| Autorização pendente | 6 | 6 |
| Precisa migrar | 44 | 57 |
| Exceção | 1 | 3 |
| **Total pagante** | **204** | **281** |
| Não pagante (à parte) | 3 | 3 |
| **Total geral** | **207** | **284** ✓ |

**Total a migrar: 361 clientes** (230 CG + 87 REC + 44 BAR) + **21 famílias em autorização pendente** para a equipe resolver. Conferências fecham por unidade ✓.

**Δ v5 → v6:** 27 dos 42 "já migrou por cadastro" continuam migrados; 21 viram "autorização pendente" e saem de ambos os lados. Não mexe: 446 → 437 (CG 110→110, REC 195→184 −11, BAR 141→143 +2) pela regra endurecida (qualquer mês fora do padrão migra) e pela retirada da regra permissiva de PIX automático. Precisa migrar: 357 → 361.

---

## Precisa migrar — forma mais recente (informativo)

| Forma mais recente | CG | REC | BAR | Total |
|---|---:|---:|---:|---:|
| Pix solto | 155 | 45 | 14 | 214 |
| Cartão (dinâmica avulsa/atrasada) | 15 | 20 | 20 | 55 |
| Sem pagamento na janela (com mensalidade) | 30 | 11 | 7 | 48 |
| Cheque Pré Datado | 14 | 10 | 0 | 24 |
| Boleto | 7 | 0 | 0 | 7 |
| Débito | 4 | 0 | 0 | 4 |
| Maquininha provada (tarifa 0 ± bandeira) | 4 | 0 | 1 | 5 |
| Dinheiro | 1 | 1 | 2 | 4 |
| **Total** | **230** | **87** | **44** | **361** |

---

## Casos provados individualmente

**Maquininha confirmada (MIGRA):**
- **Gilberto de O Barbosa** (Luiza Barbosa, mids 2262/2465, CG): 12 lançamentos `Gilberto Barbosa (VISA Crédito)` conta nula, faturas com bandeira e antecipadas, tarifa 0.
- **José Luiz Campos** (Aila e Sofia Campos, mids 2542/2543, CG): 6 lançamentos `José Campos (MASTERCARD Crédito)` conta nula.
- **Renan Lira Barros** (CG): 12 lançamentos `Renan Barros (MASTERCARD Crédito)` conta nula, 4 mensalidades antecipadas, tarifa 0.

**Cartão recorrente sem campo `cobranca_automatica` (NÃO MEXE):**
- **Marcelo Tristão Batista** (Eduardo, mid 1309, CG): 3 mensalidades no vencimento, sem bandeira, tarifa R$ ~4,5 — lançamento genérico caindo na conta da operadora.
- **Tainis Damasceno** (Nikolas, mid 1958, CG) e **Andréa Chagas** (Eduardo Chagas, mid 655, BAR): mesmo padrão.
- **Erika Brito de Souza** (mid 2366, CG, contrato vazio): 3/3 no vencimento, sem bandeira, tarifa na faixa do gateway — indistinguível do grupo A.

## À parte

- **Exceção:** Sbacem financeiro (BAR, 1 cliente / 3 matrículas: 637, 802, 867 — boleto, empresa).
- **Não pagantes:** CG 14 (16 bolsa integral + 3 mensalidade zero), REC 0, BAR 3.
- **Bandas fundidas:** 107 matrículas de banda somadas no cliente existente.
- **Tolerância 5 dias à vencida:** tira 1 cliente da migração (BAR, cobrança do mês processando).

## Notas de qualidade interna

- Tarifa é **R$ por parcela** (ca. R$ 4,46), não % — corrigido após auditoria.
- Repasse da operadora cai no financeiro ~25–35 dias depois do pagamento; match fatura↔lançamento por data/valor.
- `emusys_matricula_id` só é único por unidade — todo join filtra `unidade_id`.

## v8 — RPC corrigida (segurança + 3 fixes de regra) (2026-09-16)

### P0 SEGURANÇA (aplicado)

`_compute_*`, `refresh_*` e `get_pix_migracao_v1` tinham EXECUTE para `anon` e `authenticated` — qualquer um com a chave pública extraía nomes e formas de pagamento. Corrigido:

| Objeto | anon | authenticated | service_role |
|---|:-:|:-:|:-:|
| `_compute_pix_migracao_v1` | ✗ | ✗ | ✓ |
| `refresh_pix_migracao_snapshot` | ✗ | ✗ | ✓ |
| `get_pix_migracao_v1` | ✗ | ✗ | ✓ |
| `pix_migracao_snapshot` (SELECT) | ✗ | ✗ | ✓ |
| `_compute_situacao_alunos_v1` | ✗ | ✗ | ✓ |
| `refresh_situacao_alunos_snapshot` | ✗ | ✗ | ✓ |
| `situacao_alunos_snapshot` (SELECT) | ✗ | ✗ | ✓ |
| `get_situacao_alunos_v1` | ✗ | ✓ | ✓ |
| `get_situacao_alunos_resumo_v1` | ✗ | ✓ | ✓ |

As RPCs públicas `get_situacao_alunos_v1` e `get_situacao_alunos_resumo_v1` seguem acessíveis a `authenticated` (o app precisa). `get_pix_migracao_v1` é só `service_role` (o TOM).

### 3 fixes de regra

1. **ORDEM:** `inadimplente` vem ANTES de `pouco histórico`. `pouco histórico → não mexe` só vale com 0 mensalidades E matrícula < 45 dias. Com 1 mensalidade fora do cartão → migrar.
2. **FALLBACK de fatia:** nunca cair em `pix_avulso` por padrão. Criadas `cartao_com_falha` (última no cartão com tarifa mas migrou por vencida/misto/1 mensalidade) e `sem_historico` (sem pagamento e sem forma cadastrada). `Transferência` → `pix_avulso`.
3. **migracao_parcial:** flag boolean. True quando Pix Automático cadastrado E `qtde_pix_com_tarifa > 0` (o automático cobrou pelo menos uma vez) mas a categoria é `autorizacao_pendente` (última veio manual). Distingue "registrado mas nunca autorizado" de "automático funcionou e depois caiu pra baixa manual".

**Bug extra achado e corrigido:** o `CASE WHEN not (lista de OR)` da fatia avaliava NULL quando condições tinham NULL (ex.: `cobranca_automatica_cadastrada=null`), fazendo 183 clientes CG com `fatia=NULL` mesmo sendo `migrar`. Corrigido invertendo a lógica para `CASE WHEN (non-migrar) THEN null ELSE (computa fatia)`.

### Totais v8 — clientes pagantes

| Un | Não mexe | Já migrou | Aut. pendente | Migrar | Inadimpl. | Não pagante | Exceção | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CG | 112 | 7 | 6 | 226 | 8 | 14 | 0 | 373 |
| REC | 192 | 10 | 9 | 76 | 3 | 0 | 0 | 291 |
| BAR | 148 | 10 | 7 | 38 | 2 | 3 | 1 | 209 |

Soma das categorias = total de clientes (fecha).

### Fatias (categoria = `migrar`)

| Fatia | CG | REC | BAR | Total |
|---|---:|---:|---:|---:|
| pix_avulso | 162 | 45 | 14 | 221 |
| cartao_com_falha | 14 | 20 | 20 | 54 |
| cheque | 15 | 10 | 0 | 25 |
| cartao_avulso | 8 | 0 | 1 | 9 |
| boleto | 8 | 0 | 0 | 8 |
| dinheiro | 1 | 1 | 2 | 4 |
| sem_historico | 18 | 1 | 1 | 20 |
| **Total** | **226** | **76** | **38** | **340** |

### migracao_parcial (flag)

| Un | aut. pendente com parcial=true | aut. pendente sem parcial | ja_migrou (todos parcial=true) |
|---|---:|---:|---:|
| CG | 2 | 4 | 7 |
| REC | 2 | 7 | 10 |
| BAR | 1 | 6 | 10 |

5 famílias têm `migracao_parcial=true` em `autorizacao_pendente` — o Pix Auto funcionou pelo menos uma vez mas a última veio manual. As outras 17 nunca tiveram Pix com tarifa.

### Diferenciais v7 → v8 (quanto cada fix mudou)

**Fix 1 (inadimplente antes de pouco histórico):**
- CG: inadimplente 5→8 (+3), nao_mexe 121→112 (-9). 3 clientes saíram de "nao_mexe" (pouco histórico com cadastro cartão mas matrícula ≥ 45 dias) e foram para "inadimplente". Os outros 6 que saíram do nao_mexe foram para migrar (1 mensalidade fora do cartão).
- BAR: inadimplente 0→2 (+2). Mesma regra.
- REC: inadimplente 3→3 (0). Sem mudança.

**Fix 2 (fallback pix_avulso → cartao_com_falha + sem_historico):**
- CG: pix_avulso 187→162 (-25). 14 foram para cartao_com_falha, 18 para sem_historico. 7 entraram no pix_avulso vindos do nao_mexe (fix 1).
- REC: pix_avulso 54→45 (-9). 20 foram para cartao_com_falha, 1 para sem_historico.
- BAR: pix_avulso 22→14 (-8). 20 foram para cartao_com_falha, 1 para sem_historico.

**Fix 3 (migracao_parcial flag):** não muda categorias, só adiciona a flag. 5 famílias marcadas.

**Bug fix (fatia NULL):** 183 CG + 36 REC + 6 BAR linhas que tinham `fatia=NULL` agora têm fatia correta (pix_avulso na maioria, pois a forma era Pix).

### 3 exemplos por fatia nova (só nomes)

**cartao_com_falha:** Adriana Hilária Pereira (Maria Luiza Hilária Durão), Christiano Freitas de Almeida (Isabella Pereira Freitas de Almeida), Julio Guidi Lima da Rocha (Antonia Scudio/Guilherme Mendes Guidi da Rocha).

**sem_historico:** Adriana Mesquita dos Santos Vilas Boas (Adriana/João Pedro Mesquita Vilas Boas), Amanda Figueiredo Guimarães (Vanderson Nascimento Gomes de Araújo), Andrea De Cássia Ramos De Oliveira Neves (João Victor/Pedro Victor Ramos Coelho).

### Migrations

- Repo: `supabase/migrations/20260916120000_pix_migracao_v1_fix3.sql` (v7 original) + `supabase/migrations/20260916160000_pix_migracao_regras_fix.sql` (v8 fixes).
- Banco: aplicadas como `20260916120000_pix_migracao_v1_fix3`, `20260916130000_seguranca_revoke_anon`, `20260916140000_regrant_rpc_publicas`, `20260916150000_fix_pix_rpc_anon`, `20260916160000_pix_migracao_regras_fix_p1`, `_p2`, `_p3`, `_p4_fatia_null`.

## Próximos passos

1. Conferir contas no banco e os casos na tela do Emusys.
2. TOM consome `get_pix_migracao_v1` — 1ª fatia: `pix_avulso` (221 clientes).
