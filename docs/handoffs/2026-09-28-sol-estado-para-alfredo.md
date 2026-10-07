# Sol — estado em 28/09/2026 (handoff para o Alfredo)

> **Para quem:** Alfredo, que retoma a Sol depois de uma semana em outra frente.
> **Resumo em uma linha:** a Sol saiu da sombra. As três unidades rodam a V4 (agente com
> ferramentas) em produção, a ferramenta executa dentro da ponte do WhatsApp (um caixa só
> em memória), qualquer membro do grupo financeiro pode pedir à Sol, e a venda de lojinha
> voltou a lançar por texto. Nada está pendente de merge.
>
> Histórico detalhado dos dias anteriores: `docs/handoffs/2026-09-27-sol-caixa-incidentes-e-cheques.md`
> (§7 e §8 cobrem 28/09). Regras permanentes: entradas de 28/09 no `CLAUDE.md`.

---

## 1. O que está rodando (la-hq, usuário `sol`)

| Peça | Caminho | sha256 (8) |
|---|---|---|
| Runtime do caixa | `/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs` | ver `deploy-manifest.json` |
| Executor das ferramentas (**novo**) | `…/caixa-ingestao/caixa-tool-executor.cjs` | idem |
| Ponte WhatsApp | `/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js` | idem |
| Regra de conversa em grupo | `…/whatsapp-bridge/group-engagement.cjs` | idem |
| Servidor de ferramentas (MCP) | `/home/sol/.openclaw/workspace/scripts/sol-portas-mcp.mjs` | idem |

A fonte da verdade dos hashes é `vps/la-hq/sol/runtime/deploy-manifest.json` + `RUNTIME_BASELINE.sha256`.
**Antes de qualquer deploy, confira o hash vivo contra o manifesto** (`sha256sum`): se divergir,
alguém aplicou patch sem versionar — pare e investigue.

**Configuração que mudou hoje (fora do repo):**
- `~/.config/systemd/user/hermes-gateway-sol.service.d/30-sol-caixa-v4-canario.conf` e
  `31-sol-caixa-tools-canario.conf`: agora com os **três** grupos financeiros (antes só o Recreio).
  Backups `*.bak-20260928T134655Z-antes-fora-da-sombra`.
- `~/.hermes/profiles/sol/.env`: `SOL_CAIXA_FINANCE_GROUPS` entre aspas (o `|` sem aspas
  quebrava quem faz `source` do arquivo — 21 mil linhas de erro desde 13/09; zero desde hoje).
- `~/.hermes/profiles/sol/config.yaml`: `agent.disabled_toolsets: [clarify]` — a ferramenta de
  pergunta com opções do framework saía com rodapé em inglês ("Reply with the number…").

**Deploy na ponte (obrigatório desde 28/09):** backup com sufixo comum (`cp -p X X.bak-<SUFIXO>` em cada arquivo), instalar, e rodar
`bash vps/la-hq/sol/scripts/fumaca-ponte.sh --reiniciar --rollback-de <SUFIXO>` (na VPS). Ela confere conexão, código no disco = código rodando, três chamadas a `/caixa/tool` recusadas antes de qualquer envio, a ponte de pé depois delas e o log do gateway; se falhar, restaura os `*.bak-<SUFIXO>` e reinicia. Saída 0 = ok.

**Rollback rápido do modo agente:** voltar os dois `.conf` para só o Recreio (ou vazio),
`systemctl --user -M sol@ daemon-reload && systemctl --user -M sol@ restart hermes-gateway-sol`.

---

## 2. Como uma mensagem de grupo financeiro é tratada hoje

1. **Foto/PDF** → caminho do caixa (OCR → V4 tenta casar fatura → se não achar, o caminho
   antigo monta o card). É por onde entram quase todas as vendas de lojinha (17 de 19 em set).
2. **"pode" / complemento de card** → determinístico, nunca passa pelo modelo.
3. **Texto que CHAMA a Sol** ("Sol, …", menção, ou continuação de quem a chamou) → agente
   (Hermes) com as ferramentas `caixa_*`.
4. **Texto que NÃO chama a Sol** ("PG pix parcela 09/2026 aluno Fulano R$ 456,00") → caminho
   automático (roteador V4 dentro do runtime → card), como CG sempre fez.
   ⚠️ Sem essa divisão, ligar as ferramentas em CG faria a regra de grupo descartar os ditados.
   A pergunta "chamou a Sol?" usa `group-engagement.prever()`, que não mexe na janela.

---

## 3. O que mudou em 28/09 (PRs #521 → #525)

| PR | O quê |
|---|---|
| #521 | Valor do modelo lido como dinheiro brasileiro (`402.5` → 4025) corrigido (`valorDoModelo`); "Setembro" normalizado para 09/2026; a ferramenta passou a dizer o que aconteceu (`estado`: executado / card_publicado / mensagem_publicada / nada_aconteceu). |
| #522 | **Fora da sombra.** Ferramenta executa na ponte (`POST /caixa/tool`); divisão chamou/não chamou; total recusado vira rascunho completável; pagamento entendido nunca termina em silêncio; migration `20260928180000` (janela até o mês declarado +2 e `fonte_indisponivel` honesto). |
| #523 | Correção de incidente: a rota nova derrubou a ponte ~2 min (ver §5). |
| #524 | **Permissão:** migration `20260928200000` — no grupo financeiro oficial qualquer membro pode pedir à Sol (antes a porta das ferramentas só aceitava diretoria + administrativo; foi o que barrou a Kailane no sábado). Um interruptor para as duas camadas: `sol_caixa_unidade_policy.autoriza_qualquer_membro` (ligado nas 3). |
| #525 | **Lojinha por texto/ferramenta de volta** + roteador mais estável + correção de um defeito meu do mesmo dia (migration `20260928210000`). Detalhe no §4. |

---

## 4. Lojinha (o último ajuste do dia)

**Sintoma:** "Venda de corda para a aluna X Valor:60 reais pix" não gerava card.
**Raízes, medidas contra modelo e banco reais:**
1. A V4 mandava toda venda à busca de fatura; lojinha quase nunca tem fatura → "não achei".
   Agora: tenta a fatura primeiro (**Campo Grande emite fatura de lojinha** — "1 palheta caveira"),
   e só sem fatura (ou com a cópia atualizando) monta o card de lojinha sem vínculo
   (`abrirFluxoAgentFirstLojinha`, mesmo cofre V3 e mesmo "pode"). Foto segue no legado, que é provado.
2. "60 reais" / "Valor: 60" não contavam como valor escrito → recusa falsa. Corrigido em `_numerosDoTexto`.
3. Roteador (`minimax-m3`) às vezes gastava os 2000 tokens raciocinando e devolvia vazio
   (`finish_reason=length`) → silêncio. Agora `max_tokens` 4000, limite 25 s e **uma nova tentativa**.
4. O modelo lia "Venda Kailane" (a funcionária que vendeu) como segunda aluna. Instrução do
   roteador ganhou a regra "Venda Fulano = quem vendeu". Medido depois: **14/14 frases reais
   certas, 0 vazias, p90 3,9 s**; o capotraste que falhava 3 em 4 passou 4 em 4.
5. "caderno" e "bolsa" entraram no catálogo de produtos; "caderno de cordas" é caderno, não corda.
6. Quem mandou a mensagem não vira o comprador (mesma regra do caminho de foto).

**Defeito meu, corrigido no mesmo dia:** a migration `20260928180000` usava `least(v_fim, …)`
e, **sem mês declarado**, `least(NULL, x) = x` fazia a janela sempre avançar 2 meses — o universo
ganhava faturas futuras e a fonte parecia sempre desatualizada. `20260928210000` corrige.
Nenhum lançamento foi gravado no intervalo (0 movimentações de 13:00 UTC até a correção).

---

## 5. Incidente do deploy (28/09, 14:03 UTC, ~2 min)

A rota `/caixa/tool` lia `SOL_CAIXA_LIVE`, que mora **dentro de `startSocket()`** — o bloco do
caixa na ponte não é indentado e parece nível de módulo, mas não é. A primeira chamada
(o meu teste de fumaça) levantou `ReferenceError` numa rota async sem try/catch e derrubou a
ponte. Nenhuma mensagem de grupo chegou no intervalo. Hoje a rota alcança o executor pelo
gancho de módulo `_caixaToolRota` e tem try/catch no corpo inteiro.
**Lições:** a ponte não tem teste que a carregue — rota nova nela exige fumaça logo após o deploy
com rollback pronto; e `pkill -f "bridge.js --port 3000"` dentro de `ssh '…'` casa com o próprio
comando SSH (use `pgrep -f "node .*bridge[.]js"`).

---

## 6. Testes

- Suíte: `SOL_CAIXA_V3_LEDGER_FAKE=1 SOL_CAIXA_V3_LEDGER_MODE=production SOL_CAIXA_V3_LEDGER_STRICT=0 SOL_CAIXA_V4_SHADOW=0 bash tests/sol-runtime/rodar-suite.sh` → 77 verdes, 4 pulados, 0 vermelhos.
  **Rode sempre com `FAKE=1`** (senão escreve no ledger V3 de produção).
- Novos: `total-recusado-vira-rascunho-e2e`, `pagamento-entendido-nao-fica-mudo-e2e`,
  `caixa-tool-executor.test`, `group-engagement-prever.test`, `lojinha-texto-e-ferramenta-e2e`.
- Os testes do MCP sobem uma ponte falsa com o **executor real** (`tests/sol-runtime/_ponte-falsa.cjs`).
- Bateria real (modelo e banco reais, envio e gravação desligados) documentada no handoff de 27/09 §8
  e aqui no §4. Os scripts ficaram fora do repo de propósito (usam nomes reais de alunos).

---

## 7. O que NÃO está provado com mensagem real (acompanhar nos próximos dias)

- Ferramentas em Campo Grande e na Barra (até hoje só o Recreio usava).
- Rascunho de total recusado completado por uma resposta real.
- Venda de lojinha por texto e pela ferramenta em produção.
- Permissão ampliada (Kailane, Krissya, Rose pedindo à Sol).

Onde olhar: `/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log` (passos `caixa_tool`,
`preview_agent_first_lojinha`, `agent_first_nao_resolveu_avisado`, `agent_first_roteador_vazio_nova_tentativa`)
e `logs/agent.log` (chamadas de ferramenta do agente).

---

## 8. Abertos conhecidos

1. **Quando a Sol pergunta algo e a pessoa responde sem citar**, só quem chamou a Sol continua a
   conversa; os outros precisam começar com "Sol,". É de propósito (evita a Sol se meter em
   conversa entre colegas), e o texto enviado à equipe orienta isso.
2. **Estorno pela conversa não desempata lançamentos iguais** (mesmo valor/forma/categoria).
3. **Card de quitação** sugere "de X a Y", e nenhum caminho trata essa resposta.
4. **Cheques:** o primeiro "pode" real num card de cheque ainda não aconteceu.
5. **CG:** movimentação `0a2e91a7…` (Pix R$ 397 de 26/09) com descrição errada e sem fatura; R$ 380 da
   Iolanda (parcela 10/2026) nunca lançado — agora a busca acha a fatura de outubro; basta reenviar.
6. `npm run mapa:banco` não foi rodado depois das migrations de 26–28/09 (precisa da senha do `postgres`).
