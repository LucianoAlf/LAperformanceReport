# Passagem de bastão — frente Sol / Caixa V4 → Alfredo

**Data:** 10/09/2026
**Decisão do Alf:** Alfredo assume integralmente a frente da Sol — diagnóstico, código, banco,
runtime, rollout, monitoramento e estabilização. Este documento encerra a atuação anterior como
writer da frente.

> Tudo abaixo foi **conferido no vivo** no momento da escrita, não presumido.
> **Nenhuma mutação foi feita para produzir este handoff** — só `SELECT`, `git`/`gh` de leitura e
> leitura de log/estado na VPS.

---

## 1. PR, branch, head, base, mergeability, checks

| campo | valor |
|---|---|
| PR | **#414**, `OPEN`, `mergeable=MERGEABLE`, `mergeState=CLEAN` |
| branch | `feat/sol-v4-agent-first-envelope` |
| head | **`a602d15b6d039c327f59a499768d465a16ab4bdb`** |
| base | `main` = `d90ea03c185b6d8f1063a11e845b3aa4a8b918a0` |
| divergência | branch **5 commits à frente** · **main 6 commits à frente** da branch |
| checks | 7 verdes: `suite`, `ensaio-sql`, `postgres`, `refs`, `scan`, `Vercel`, `Vercel Preview Comments` |

**Commits da branch (mais novo primeiro):**

```
a602d15b  fix(sol): persistir ciclo de vida dos previews V3
c05cf270  fix(sol): os dois falsos-verdes do caminho financeiro e o contrato de categoria
f2cd21ea  fix(sol): corrigir a forma nao pode desfazer a fatura que a humana ja corrigiu
e7280b53  fix(sol): os quatro buracos do gate — midia, 2o turno, fixtures reais, total recusado
168c3bcc  feat(sol): a V4 vira envelope estruturado e chama o Core direto
```

⚠️ **Duas divergências em relação ao checkpoint recebido:**

1. O checkpoint falava em **8 checks**; ao vivo são **7**.
2. A **`main` andou 6 commits** depois do último CI da branch (evasão, comercial, aviso prévio).
   O `CLEAN` é de agora, mas o **verde do CI é de um merge com uma main mais velha** — vale
   revalidar antes do merge.

---

## 2. Diff exato ainda não promovido

15 arquivos, **+2.584 / −34** contra `origin/main`.

**Migrations (3 — nenhuma aplicada):**

```
supabase/migrations/20260910160000_homonimo_devolve_a_lista_de_candidatos.sql
supabase/migrations/20260910161000_resolver_envelope_estruturado_v1.sql
supabase/migrations/20260910213000_preview_v3_tem_estado_terminal.sql
supabase/rollbacks/20260910213000_preview_v3_tem_estado_terminal_ROLLBACK.sql
```

**Runtime e manifesto:**

```
vps/la-hq/sol/runtime/caixa-financeiro.cjs      (+591)
vps/la-hq/sol/runtime/RUNTIME_BASELINE.sha256
```

**Testes:**

```
tests/sol-runtime/agent-first-envelope-e2e.cjs           (novo, 428)
tests/sol-runtime/correcao-forma-preserva-fatura-e2e.cjs (novo, 162)
tests/sol-caixa/ensaio-envelope-estruturado.sql          (novo, 272)
tests/sol-caixa/ensaio-preview-estado-v3.sql             (novo, 171)
tests/sol-caixa/ensaio-seed.sql
tests/sol-caixa/ensaio-subir.sh
tests/sol-caixa/ensaio-verificar-cadeia.sql
tests/sol-caixa/ensaio-cadeia-e-atomicidade.sql
```

**CI:** `.github/workflows/sol-caixa-suite.yml`

---

## 3. Migrations pendentes — são **três**, não uma

> ⚠️ Correção ao checkpoint recebido. E a **ordem importa**.

### a) `20260910160000_homonimo_devolve_a_lista_de_candidatos.sql`

- **Objeto:** `create or replace function public.sol_caixa_resolver_pagamento_itens_v1(uuid, jsonb, numeric, date)`
- **O que corrige:** `jsonb 'null'` não é SQL NULL, então `is null` era sempre falso e a lista de
  homônimos nunca chegava à consultora. Medido: `sol_caixa_responsavel_aluno(CG,'Alice')` devolve
  7 candidatos e o resolver entregava `candidatos: null`.
- **Dependências:** nenhuma nova. Autocontida (`create or replace` puro).
- **ACL esperada:** `revoke ... from public, anon, authenticated` → `grant ... to service_role, sol_acesso_restrito`
- **Pós-condição:** coberta pelo ensaio (checks 5 e 7 do `ensaio-envelope-estruturado.sql`).
- **Rollback:** `drop function public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date);`
- ⚠️ Produção **já tem** essa função (md5 do corpo `3d63bdc1…`); esta migration a **substitui**.

### b) `20260910161000_resolver_envelope_estruturado_v1.sql`

- **Objeto:** `create or replace function public.sol_caixa_resolver_envelope_v1(uuid, jsonb)` —
  **não existe em produção** (conferido: `0`).
- **O que faz:** recebe `pagador / valor_total / forma / itens[{aluno, categorias[], competencias[]}]`,
  expande pagador → **PESSOAS** (colapsa matrícula), reúne as faturas da janela e devolve a
  **combinação única** que fecha o total no centavo. Duas combinações → devolve alternativas e
  **pergunta**. Zero → recusa dizendo quanto achou. Teto de 16 faturas com recusa explícita.
- **Dependências:** `sol_caixa_responsavel_aluno`, `sol_caixa_aluno_por_responsavel`,
  `sol_faturas_alunos_v1`, `financeiro_classificar_tipo_fatura_v1` (indireta, via envelope).
- **ACL esperada:** mesma régua — `anon` NÃO, `authenticated` NÃO, `service_role` SIM,
  `sol_acesso_restrito` SIM.
- **Pós-condição:** ensaio `ENVELOPE OK — 13 verificações` (inclui ACL como check 8).
- **Rollback:** `drop function public.sol_caixa_resolver_envelope_v1(uuid, jsonb);`

### c) `20260910213000_preview_v3_tem_estado_terminal.sql`

- **Objetos:** cria `sol_caixa_v3_finalizar_preview_v1(jsonb)` (**não existe** em produção: `0`) e
  **recria `sol_caixa_v3_validar_approval_v1`**.
- **Pós-condições:** quatro `raise exception` — finalizador criado, validador com guarda de estado,
  validador com guarda de idade, finalizador não exposto.
- **Rollback:** arquivo executável próprio, `supabase/rollbacks/20260910213000_..._ROLLBACK.sql`,
  que dropa o finalizador, reaplica `20260821093045_sol_caixa_v3_validator_operacao_campos_grupo_ator.sql`
  e **confere o resultado** (`ROLLBACK INCOMPLETO: finalizador V3 ainda existe`).

> 🔴 **Ela muda um hash da cadeia 16/16.** `sol_caixa_v3_validar_approval_v1` vai de
> **`2f274032638f6ecc73deeaaf75a5f14a`** (vivo em produção agora) para
> **`715a577da13f677465d4e85ea784a222`**. O manifesto do ensaio já foi atualizado no PR.
> É a **única** das três que altera função pré-existente do cofre V3 — merece o gate mais apertado.

---

## 4. Artefato de runtime a publicar

| | |
|---|---|
| artefato | `vps/la-hq/sol/runtime/caixa-financeiro.cjs` |
| caminho na VPS | `/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs` |
| **hash a publicar** (head do PR) | **`be4b3a7974c5f218…`** |
| **hash vivo hoje** | **`0059033dd28d764a…`** (publicado 10/09 14:41 UTC) |
| manifesto no PR | `0059033dd28d764a…` — documenta o **vivo** |
| serviço | `hermes-gateway-sol.service` — systemd **`--user` do usuário `sol`**, não unit de sistema |

**Restart mínimo:**

```bash
sudo -u sol XDG_RUNTIME_DIR=/run/user/$(id -u sol) \
  systemctl --user restart hermes-gateway-sol.service
```

**Conferência pós-publicação:** `sha256sum` na VPS = hash do repo; `is-active` = `active`;
`NRestarts` sem crescer; `curl 127.0.0.1:3000/health` = `HTTP 200`.

**Rollback do runtime:**

```bash
cp -p /home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs.bak-promocao-v4-20260910-140139 \
      /home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs
# + restart. Hash de volta a a7ef7ad7… (artefato pré-promoção, íntegro)
```

> ⚠️ O `RUNTIME_BASELINE.sha256` precisa ser atualizado para `be4b3a79…` **no mesmo commit da
> promoção**. Se ficar apontando para o hash antigo, o `paridade.sh` passa a acusar
> *"runtime fora do Git"* sem haver patch nenhum — alarme que dá lobo ensina a ignorar o alarme.

---

## 5. Estado atual de produção

**Ledger — aplicadas hoje:**

```
20260910143509  20260909193500_a_lista_plana_que_o_lote_ja_sabe_consumir
20260910143656  20260909193500_a_lista_plana_byte_a_byte_do_repo
20260910143810  20260909210000_o_envelope_de_faturas_e_construido_uma_vez
20260910144021  20260909232000_resolver_pagamento_autocontido
20260910201200  agradecimento_evasao_alguem_respondeu      (outra frente)
```

**Nenhuma das 3 migrations do PR está no ledger.**

| objeto | estado em produção |
|---|---|
| `sol_caixa_resolver_envelope_v1` | **não existe** |
| `sol_caixa_v3_finalizar_preview_v1` | **não existe** |
| `sol_caixa_v3_validar_approval_v1` | existe, md5 `2f274032…` |
| `sol_caixa_resolver_pagamento_itens_v1` | existe, md5 `3d63bdc1…` |

**Runtime e serviço:**

- `caixa-financeiro.cjs` = `0059033dd28d764a`, sem alteração desde 10/09 14:41 UTC
- `hermes-gateway-sol.service` = `active`, `NRestarts=0`, ativo desde 10/09 14:41
- bridge WhatsApp: `HTTP 200` em `127.0.0.1:3000/health`
- 140 backups `.bak-*` do runtime preservados

**Flags no ambiente do processo:**

- `SOL_CAIXA_CLASSIFICADOR_V3_SHADOW=1`
- **`SOL_CAIXA_V4_CANARIO` não definida → canário DESLIGADO**
- `SOL_CAIXA_V4_SHADOW` não definida → shadow **ligado** (default)

**Erros relevantes (24h, `caixa.log`):** **nenhum** evento de erro, falha, recusa, `sem_v3`,
`indisponivel`, `manual_review` ou `nao_entendi`.

**Segredos (apenas nome e local autorizado):** `OPENCODE_ZEN_API_KEY` em
`/home/sol/.hermes/profiles/sol/caixa-ingestao/.secrets/zen.env` (arquivo `600` do usuário `sol`).

---

## 6. Contrato do canário

**Ligar um único grupo**

```
SOL_CAIXA_V4_CANARIO=<chatId>     # no ambiente do gateway, + restart
```

É **lista** separada por vírgula. Vazia ou ausente = ninguém.
Booleano não existe de propósito: *flip global em dinheiro não é canário, é aposta.*

**Desligar imediatamente**

Remover a variável + restart. **Sem deploy, sem migration.**

**Eventos que provam sucesso**

- `agent_first_resolveu` seguido de `preview_multi_aluno_enviado`
- **uma** pendência viva por comprovante
- `preview_sucedido_por_correcao` quando houver 2º turno
- aprovação explícita gerando recibo persistido

**Eventos que exigem rollback**

- `agent_first_erro_resolver` recorrente
- mais de uma pendência viva para o mesmo comprovante
- card sem `preview_id` / `preview_hash`
- escrita sem `"pode"` explícito
- ausência de recibo / auditoria
- ACL fora da régua (`anon` ou `authenticated` com EXECUTE)

**Fail-safe já embutido**

Sem decisão, sem envelope, erro no Core ou não-resolveu → devolve `null` e **o caminho de hoje
assume**. Exceção deliberada: `valor_total_recusado` **encerra e pede o total** — não cede ao
legado, porque o legado produz exatamente o card parcial errado.

---

## 7. Casos obrigatórios — onde cada um está provado

| caso | onde | estado |
|---|---|---|
| dois cursos, formas distintas | `correcao-forma-preserva-fatura-e2e.cjs` F1 + mutante | ✅ com mutante |
| correção em dois turnos | `agent-first-envelope-e2e.cjs` F10, pelo `handle()` real | ✅ |
| card antigo recusado / **1** preview aprovável | F10 (`preview_sucedido_por_correcao`, 1 pendência) + mutante B | ✅ com mutante |
| aprovação explícita | rail V3 inalterado + `ensaio-cadeia-e-atomicidade.sql` (B) | ✅ |
| atomicidade | ensaio C: falha injetada no 2º insert, zero delta | ✅ |
| recibo persistido | `20260910213000` + `ensaio-preview-estado-v3.sql` | ⚠️ **commit do Alfredo — não validado aqui** |
| total recusado não vira card parcial | F11 + **mutante A** (reproduz o R$ 357 do legado) | ✅ com mutante |

**Marcadores do último CI verde da branch:**
`ENVELOPE OK — 13 verificacoes` · `CADEIA OK — 16/16` · `ENSAIO OK — 10 verificacoes` ·
`CADEIA E ATOMICIDADE: ok` · `ROLLBACK conferido` · suíte **37 verdes · 4 pulados · 0 vermelhos**.

---

## 8. Estado que existe só fora do repositório

> Nada foi apagado nem "arrumado". Apenas reportado.

**Na VPS la-hq**

| caminho / recurso | finalidade |
|---|---|
| container `sol-ensaio` (`postgres:17`, up ~45 min) | banco isolado do ensaio, descartável |
| `/tmp/sol-ensaio` | arquivos do ensaio enviados por `scp` |
| `/tmp/provacr` | artefatos da prova de CRLF (blobs LF + `todas.sql`) |
| `…/caixa-financeiro.cjs.bak-promocao-v4-20260910-140139` | **rollback do Core**, hash `a7ef7ad7…` |
| 140 backups `.bak-*` | histórico de artefatos do runtime |

> ⚠️ **O container `sol-ensaio` tem um `GRANT` extra** concedido de propósito para o teste negativo
> de ACL (`authenticated` em `sol_caixa_parcela_canonica_env_v1`). É teste isolado e some ao
> recriar o container — **não confie na ACL desse container sem recriá-lo**.

**Local — `D:\2026\LA-performance-report` (untracked, nada da frente Sol)**

```
docs/auditorias/2026-09-08-auditoria-carregamento-paginas.md
docs/handoffs/2026-09-09-sonoramente-chamada-calendario-agentes.md
docs/relatorios/
outputs/familias-pagantes-2026-09-10/
src/lib/consultaMemoria.ts
src/lib/movimentacoesAdmin.ts
```

**Temporários fora do repo (Git Bash `/tmp`)**

```
/tmp/ROLLBACK-V4.md          plano de rollback do Caixa V4 Core
/tmp/antes.cjs               artefato pré-promoção (a7ef7ad7)
/tmp/caixa-anterior.cjs      idem, cópia usada no A/B
/tmp/ok.cjs, /tmp/ok2.cjs    snapshots para os testes de mutante
/tmp/todas-ci.sql            concatenação de migrations do CI (reprodução)
/tmp/todas-teste.sql         idem, versão local
/tmp/cont.txt                hashes do container do ensaio
/tmp/blobs-lf.tgz            blobs LF usados na prova de CRLF
```

**Worktrees:** 33 ativas em `.worktrees/` — nenhuma da frente Sol; não foram tocadas.

**Head local** está em `c05cf270`, **1 commit atrás** do remoto (`a602d15b`).

---

## 9. Dívidas e riscos

### Bloqueadores reais

1. **`20260910213000` mexe no cofre V3.** Recria `sol_caixa_v3_validar_approval_v1`, que é uma das
   16 funções do manifesto — muda hash de cadeia, não periferia.
2. **A `main` andou 6 commits** depois do último CI da branch. O verde é de um merge mais velho.
3. **`RUNTIME_BASELINE` desatualizado em relação ao artefato a publicar** — atualizar no mesmo
   commit da promoção, senão o `paridade.sh` acusa "runtime fora do Git" sem haver patch.
4. **`ensaio-preview-estado-v3.sql` e o commit `a602d15b` não foram validados** por quem escreve
   este handoff.

### Melhorias, não bloqueadores

- Pagamento de **várias competências numa tacada** só funciona pelo envelope novo; o caminho em
  produção hoje recusa com `valor_declarado_nao_bate`.
- A **ambiguidade real** do caso Elis (duas matrículas, R$ 385 do Canto vs R$ 410,40 da Bateria) só
  é tratada pelo orquestrador do PR; o runtime em produção ainda resolve com um aviso.
- **O shadow V4 errou 3 de 4** no incidente de 10/09 (`corrigir_competencia` ✅, depois `nada`,
  `conversa` e `corrigir_forma` ❌). A V4 sozinha **não** teria salvado aquele caso.
- **Quatro armadilhas de escape** nesta frente: `printf '\echo'` (virou ESC), `grep '^\\echo'`
  (deu zero no arquivo certo), `\1` do `sed` sumindo duas vezes (`tr -d ''`, `sed 's|...||'`) e
  `\b` virando BACKSPACE literal. Onde der, usar ferramenta que não precisa de barra.

---

## 10. Confirmação final

- **Nenhuma mutação** foi feita para produzir este handoff: apenas `SELECT`, `git`/`gh` de leitura
  e leitura de log/estado na VPS.
- Nada aplicado, publicado, reiniciado, mergeado ou apagado.
- **A propriedade da frente da Sol está transferida ao Alfredo.** Nada mais será executado nela sem
  pedido nominal dele.
