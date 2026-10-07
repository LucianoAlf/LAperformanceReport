# Handoff — Sol: conversa sobre o lote de cheques pelo agente (06/10/2026)

**Para:** quem mexe no runtime do caixa da Sol, na ponte e no Super Folha.
**Regra:** sem CPF, CMC-7, nome real, telefone ou valor real. Casos descritos por forma.

## 1. O que deu errado em 06/10

| Unidade | O que a equipe fez | O que a Sol fez | Raiz |
|---|---|---|---|
| Recreio | Postou o PDF de 5 cheques 3 vezes | Leu de novo e repostou a lista inteira a cada envio | O "mesmo PDF" só era reconhecido com card **vivo** (30 min). Sem cheque ✅ não há card, então nunca reconhecia |
| Recreio | Cheque 1: o número impresso que a Sol mostrou era o que a equipe digitou | "CMC-7 e o impresso divergem", sem saída | Nenhum caminho para a equipe **confirmar** número/valor |
| Recreio | Cheque 2: um cheque de R$ 800 pagando as parcelas de 2 irmãos | "mais de uma parcela possível" | 1 cheque = 1 fatura no código; empate de irmãos virava ❓ |
| Recreio | Cheque 3 digitado como "SA000170" | Tratou como número diferente de 000170 | Sem equivalência (série e zeros à esquerda) |
| Recreio | Lista "CONTROLE DE CHEQUES" com número, valor e aluno | Não usou a lista e disse coisas erradas | Só o atalho "N é da Fulana" citando a lista era entendido |
| CG | Respondeu ao card: "Sol,\n\nO Cheque 2 é da X\n\nO Cheque 5 é do Y\n\nO Cheque 6 é da Z" | "Não entendi essa — responde *aluno: Nome Completo*" | Regex exigia a frase **começando** pelo número; o texto caía na guarda genérica da ponte |
| CG | Sem citar / fala entre colegas citando a Sol | "Não entendi. Para abrir o caixa…" | Orientação genérica para qualquer citação de mensagem da Sol |
| CG | Reenviou o PDF porque "o card saiu da janela" | Leu de novo, abriu outro card | O preview V3 vence em 30 min (banco recusa aprovação mais velha); nada republicava o card |

**Por que o agente não entrava:** as ferramentas do caixa estão **desligadas** desde 29/09 (`SOL_CAIXA_TOOLS_CANARIO` vazio, volta à V3 por decisão do Alf). Todo texto caía no caminho determinístico.

## 2. Desenho (agent-first, raiz)

- **Determinístico, como antes:** leitura do PDF (visão + prova CMC-7/extenso), decisão por fatura, card V3, "pode" e "não".
- **Do agente:** a **conversa** sobre o lote aberto. A ponte manda ao agente a fala que (a) cita qualquer mensagem do lote, enquanto o lote vive (expediente, 14 h — sem a janela de 3 min); (b) chama a Sol com lote aberto; ou (c) escreve o número de um cheque do lote (a lista digitada). "pode"/"não" nunca vão ao agente. A fala chega com `[lote_cheques_aberto: …]`.
- **Ferramentas** (MCP `sol-portas` → `POST /caixa/tool` → `caixa-tool-executor` → handler único da ponte), capacidade `cheques` (todo grupo financeiro oficial; o interruptor fino é o `agente` do `cheques.json`):
  - `cheques_lote_estado` — o lote: cada cheque, situação explicada, leituras divergentes, parcelas, família sugerida. Só leitura.
  - `cheques_atribuir` — de quem é cada cheque, 1 ou N alunos (irmãos), `competencia` e `forma_paga` opcionais; aceita o cheque pela ordem ou pelo número impresso.
  - `cheques_confirmar_leitura` — número/valor que a equipe olhou no cheque.
  - `cheques_marcar_conferencia` — "só confere, não lança".
- **O código valida** (o LLM só interpreta): parcela pelo **mesmo resolvedor do banco** (`sol_cheque_resolver_fatura_v1`); combinação de uma parcela por aluno com **soma no centavo** (régua do "pode", `valorDoBanco`); empate → mês estritamente mais próximo do bom-para/lote, senão pergunta; nome passado tem de estar na fala (ou na família sugerida); número/valor confirmados têm de estar na fala **e** ter sido lidos pela visão (papel, CMC-7 ou extenso) — a pessoa escolhe entre o que foi lido, não cria número; quem confirmou/informou fica no card e no estado.
- **Toda mudança republica o card** do estado: os cards antigos do lote morrem antes (preview V3 `rejected` + fora das pendências) — nunca dois aprováveis com o mesmo cheque. PDF de hoje reenviado: card vivo → aponta; vencido → republica sem reler. "pode" em card vencido → nada grava, card renovado ("venceu — nada foi lançado").
- **Irmãos sem ninguém falar:** emitente resolvido, empate entre parcelas de 2–4 alunos, e existe combinação única (ou a do mês estritamente mais próximo) que fecha no centavo → ✅ "um cheque só para 2 parcelas".
- **1 cheque → N faturas = UMA movimentação** do valor do cheque ligada às N faturas. Lançamento simples já aceita `fatura_ids`; dentro do lote exige a migration `20261006200000` (§5).
- **Desfecho honesto:** `cheques_estado` → `consulta`; mudança → `card_publicado` só com preview aprovável **desta** chamada, senão `mensagem_publicada`/`nada_aconteceu`, com `resultados` por cheque (`ok`, `motivo`, `motivo_humano`, `situacao_final`, `aviso`). Ex.: dois cheques para a mesma parcela → aceito, mas nenhum entra, com aviso.
- **Atalhos de regex:** com `agente: true`, o atalho "N é da Fulana"/"N foi cheque" **não roda** (a fala vai ao agente; se mesmo assim chegar, silêncio). Com `agente: false` é o fallback, como antes. A ponte não responde mais "Não entendi… abrir o caixa" nem "aluno: Nome" a quem cita mensagem de lote de cheques.

## 3. Arquivos

| Arquivo | Mudança |
|---|---|
| `vps/la-hq/sol/runtime/caixa-cheques.cjs` | estado do lote, conversa, 4 operações, combinação de parcelas, republicação, `numeroEquivalente`, leituras separadas, `conferencia`, PDF repetido sem reler, "pode" em card vencido |
| `vps/la-hq/sol/runtime/caixa-financeiro.cjs` | `publicarCartaoCheques`, `republicarLoteCheques`, `ferramentaCheques`, `chequesConversa`, `citaLoteCheques`; `fatura_ids` no card simples (`derivarVinculo` fonte `cheque_multi_fatura`) e no item do lote; hook pós-"pode" (`registrarLancamento`) |
| `vps/la-hq/sol/runtime/caixa-tool-executor.cjs` | ações `cheques_*`, estado `consulta`, `resultados`/`lote` na resposta |
| `vps/la-hq/sol/scripts/sol-portas-mcp.mjs` | 4 ferramentas, capacidade `cheques` |
| `vps/la-hq/sol/runtime/bridge.js` | rota da conversa do lote ao agente, `[lote_cheques_aberto]`, engajamento sem janela de 3 min para o lote, sem orientação genérica ao citar lote |
| `vps/la-hq/sol/runtime/cheques-sombra-cli.cjs` | sombra: malote real + roteiro de falas pelas ferramentas reais, sem enviar e sem gravar |
| `supabase/migrations/20261006200000_sol_lote_cheque_varias_faturas.sql` (+ rollback) | validador do lote aceita item com `fatura_ids` |
| `tests/sol-runtime/cheques-conversa-agente-e2e.cjs` | casos de 06/10 com dados inventados |
| `tests/sol-runtime/sql/lote-cheque-varias-faturas.sh` | prova da migration em Postgres descartável |

## 4. Super Folha (verificado, só leitura)

Caminho: caixa da Sol → `export-caixa-movimentacoes` → edge `la-caixa-sync` (cron 11:20 e de hora em hora 12:20–23:20) → `la_caixa_movimentacoes_aplicar` → gatilho `financeiro_cheques_do_caixa_sol` → `financeiro_cheques` com situação **`a_depositar`**. Usa `cheque_numero/banco/bom_para` estruturados (descrição só de reserva). Nada no SF dá baixa em `contas_receber` a partir do cheque; vira `depositado` quando um depósito do Open Finance casa por **número e valor** (`financeiro_cheques_religar`). Contagem em 06/10: **zero** cheques no caixa da Sol e no SF (o primeiro "pode" real de cheque ainda não aconteceu).

Gaps (nenhum alterado; para decisão):
1. A conciliação do caixa da Sol (regra `por_cheques`) marca **conciliado** pelo lançamento do Emusys na "Conta Cheques", sem depósito visto.
2. Duas movimentações com o mesmo número nunca casariam com o depósito (por isso 1 cheque = 1 movimentação, acima). Reforço sugerido no SF: `religar` aceitar a soma por (banco, número, unidade).
3. `contas_receber` família cheque chega `recebido` do Emusys antes de compensar (661/661) — em fluxo de caixa/DRE tratar "recebido em cheque sem `depositado`" como a compensar.
4. `cheque_banco` sem validação no LA Report; o SF exige 3 dígitos (CHECK). A Sol manda o código da CMC-7 (ok hoje). Validar `^[0-9]{3}$` nas RPCs.
5. A conciliação ainda olha a descrição por regex, não `cheque_numero`.
6. Trava de cheque duplicado no banco (`migration-drafts/20260930090000…`) não aplicada.
7. Sem evento bancário de cheque capturado desde 26–27/09, embora o cron marque sucesso.

## 5. Deploy (gate do Alf; nada aplicado)

Pré: PRs #592 → #597 mergeados; este PR rebaseado; `sha256sum` vivo × repo dos 6 artefatos (vivo em 06/10 = head do #597: `caixa-financeiro` `d40e1c2b…`, demais iguais ao repo).

1. Backup: `*.bak-<ts>-antes-prNNN` de `caixa-financeiro.cjs`, `caixa-cheques.cjs`, `caixa-tool-executor.cjs`, `cheques.json` (caixa-ingestao), `bridge.js` (whatsapp-bridge), `sol-portas-mcp.mjs` (workspace/scripts).
2. `install -o sol -g sol -m 0644` dos artefatos + `cheques-sombra-cli.cjs`. `cheques.json` **sem** `agente` ainda (= desligado): comportamento idêntico ao de hoje, exceto (a) PDF repetido sem reler, (b) "pode" em card vencido renova o card, (c) irmãos detectados sozinhos, (d) ponte não responde "não entendi" a quem cita lote.
3. A ponte: matar só `bridge.js --port 3000` (cuidado: `pkill -f` dentro de `ssh '…'` casa o próprio ssh — usar `pgrep -f 'node .*bridge.js --port 3000'`). Conferir `curl 127.0.0.1:3000/health` → `"status":"connected"` e `scriptHash`. Fumaça da rota: `POST /caixa/tool` com `cheques_estado` e ctx inválido → `contexto_invalido` (não derruba).
4. O MCP `sol-portas` é filho do gateway: as ferramentas novas só aparecem após reiniciar `hermes-gateway-sol` (user systemd) — fazer em janela calma, com o caixa sem card aberto.
5. Skill da Sol (`profiles/sol/skills/sol-caixa-agent-first/SKILL.md`, custodiada no `sol-openclaw-backup`): acrescentar a seção do Anexo A.
6. Ligar: `cheques.json` → `"agente": true` (sem reinício). Primeiro numa unidade, com o Alf acompanhando o próximo malote.
7. Migration `20261006200000`: aplicar só com ok do Alf (colisão conferida: nenhuma versão `20261006200000` em `schema_migrations`); depois `"lote_multi_fatura": true`.
8. Readback: hashes vivos × repo; `RUNTIME_BASELINE.sha256` e `deploy-manifest.json` no mesmo commit da promoção.

**Rollback:** `"agente": false` no `cheques.json` (instantâneo, volta ao atalho antigo); se preciso, os `.bak` + matar a ponte; migration: rollback em `supabase/rollbacks/` (antes, `lote_multi_fatura: false`).

## 6. Riscos

- O lote vive em memória: reinício da ponte perde a conversa do lote (o card V3 reidrata, a lista não). Mitigação: reenviar o PDF relê.
- O agente precisa chamar `cheques_lote_estado` antes de falar; a descrição e o contexto mandam, mas o modelo pode responder de memória. A bateria com modelo real **não** foi rodada (sem bancada de agente nesta frente).
- "Sem citar" com número de cheque na fala vai ao agente: uma conversa entre colegas que mencione um número de cheque do lote chega ao agente (que pode ficar em silêncio).
- O hook pós-"pode" depende do id do card; "pode" sem citação com um só card pendente também passa por ele (mesmo `alvo.previewId`).
- Ponte sem teste que a carregue (lição de 28/09): rota nova → fumaça logo após o deploy.

## Anexo A — seção para a skill `sol-caixa-agent-first`

```
## Lote de cheques (malote)
- Se a mensagem trouxer `[lote_cheques_aberto: ...]`, a pessoa está falando do lote de cheques. Chame `cheques_lote_estado` ANTES de responder.
- Valem nos três grupos (não dependem do canário do caixa).
- Fala da equipe em qualquer formato ("o 2 é da Fulana", lista com número/valor/aluno, "esse paga os dois irmãos"): use `cheques_atribuir` (vários cheques numa chamada; irmãos = vários nomes no mesmo cheque), `cheques_confirmar_leitura` (número/valor que a pessoa olhou no cheque), `cheques_marcar_conferencia` ("só confere, não lança"). Passe a mensagem exata em `p_texto_original` e os nomes como a pessoa escreveu.
- Leia `resultados`: para cada recusa, diga em uma linha o motivo humano e o que falta. Não repita o card: a ferramenta republica.
- Nunca diga que lançou: o lançamento é o "pode" humano citando o card.
- Conversa entre colegas (não pede nada à Sol): não responda.
- Linguagem simples, sem jargão (nada de CMC-7, preview, fatura_id).
```
