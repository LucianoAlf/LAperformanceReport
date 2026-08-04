# Post-Mortem: Relatórios diários não disparados — Sol bridge offline (2026-08-03)

> **Status:** Resolvido em 2026-08-04 ~08:18 BRT por Alfredo (agente IA da VPS).
> **Severidade:** Média — relatórios gerados mas não entregues; sem perda de dados.
> **Impacto:** 6 relatórios (3 admin + 3 comercial, Barra/Campo Grande/Recreio) ficaram pendentes na fila por ~11h até reenvio manual.

## Timeline (UTC = BRT−3)

| Horário (BRT) | Evento |
|---|---|
| 03/08 ~17:00 | Meta aplica restrição no número da Sol (552121700723). Sessão WhatsApp é desautorizada. |
| 03/08 ~17:00–23:59 | Bridge Hermes entra em crash loop: `❌ Logged out` × 81 tentativas. Pasta `session/` é esvaziada e renomeada para `session.invalid-20260803T235950Z`. **Sem watchdog/supervisor**, a bridge fica caída. |
| 03/08 20:00 (23:00 UTC) | Cron dispara `send-lareport-adm-hermes.py --send`. Textos gerados via `dry_run` da edge function ✅. Envio WhatsApp falha: `bridge_unavailable: [Errno 111] Connection refused` (nada escutando em `127.0.0.1:3000`). |
| 03/08 20:05 (23:05 UTC) | Cron dispara `send-lareport-comercial-hermes.py --send`. Mesmo erro — 3 comerciais falham. |
| 03/08 20:57–21:12 | `processar-mensagens-agendadas` (edge function, caminho legado WAHA) tenta reenviar via WAHA. Sessão WAHA `PAUSED_SOL_V2_HERMES_NATIVE_20260727` não existe mais (404). 8 tentativas, todas marcadas `erro: destravado: preso em enviando`. |
| 03/08 23:59 | Iniciado re-pareamento manual (QR exibido, aguardando scan). |
| 04/08 00:04 | `hermes-gateway-sol.service` (systemd --user do sol) para em estado `failed`: "WhatsApp is enabled but not paired (no creds.json)". |
| 04/08 ~08:15 | **Alfredo** sobe `sol-openclaw-report-bridge.service` (systemd), porta 3000 responde `/health`. Testa envio privado ✅. |
| 04/08 08:17–08:18 | Alfredo reenvia os 6 relatórios pendentes via bridge nova. Todos gravados como `enviada` na `fila_relatorios_whatsapp`. |

## Causa raiz

Duas falhas combinadas:

1. **Restrição Meta** derrubou a sessão WhatsApp da Sol. Isso é externo e inevitável — acontece periodicamente.
2. **Runtime Hermes da Sol removido sem substituição**: o gateway `hermes-gateway-sol.service` e a bridge `bridge.js --port 3000` não estavam rodando. Diferentemente do `lareport-sol-worker` e do `sol-group-ingest` (que têm watchdog no cron a cada minuto), **a bridge WhatsApp não tinha supervisor** — caiu e ficou caída até intervenção manual.

**Não foi** problema da edge function, nem do cron, nem da geração do relatório. Os textos foram gerados corretamente. Só o envio WhatsApp falhou porque o endpoint local `127.0.0.1:3000/send-report` (consumido pelos scripts Python `send-lareport-*-hermes.py` via `lareport_whatsapp_single.py`) estava fora do ar.

## Caminho legado WAHA (ruído, não causa)

A edge function `processar-mensagens-agendadas` tentou reenviar via WAHA (caixa Sol, `provedor='waha'`, sessão `PAUSED_SOL_V2_HERMES_NATIVE_20260727`). Essa sessão não existe mais no servidor WAHA desde 27/07 (404) — a WAHA foi aposentada em favor da bridge nativa Hermes. O erro "destravado: preso em enviando" (8 tentativas) é **caminho legado morto** e pode ser ignorado. A caixa Sol no banco ainda aponta para WAHA; considerar atualizar para refletir o runtime atual ou desativar o reenvio via `processar-mensagens-agendadas` para evitar ruído futuro.

## Fix aplicado (Alfredo)

1. Criou `sol-openclaw-report-bridge.service` — **systemd de usuário do root no servidor `alfredo` (187.127.9.25)**, NÃO na la-hq. Script: `/root/.openclaw/workspace/tools/sol-openclaw-report-bridge.cjs`. Escuta `127.0.0.1:3000` no alfredo, expõe `POST /send-report` (payload `{number|jid|target|to, text|texto|message}`) e tem worker que processa a fila `fila_relatorios_sol_hermes` (status `sol_pendente`). Envia pelo número da Sol via OpenClaw gateway (`openclaw message send --channel whatsapp`).
2. Validou `/health` → `{"ok":true,"service":"sol-openclaw-report-bridge","workerEnabled":true}`.
3. Reenviou os 6 relatórios pendentes (08:17–08:18 BRT) — todos `enviada` na `fila_relatorios_whatsapp`.
4. Marcou comercial Recreio antigo como coberto pelo envio Sol/Hermes (anti-duplicata).
5. Adicionou `+5521964171223` (Hugo) e já tinha `+5521981278047` (Luciano/Alf) na `allowFrom` do canal WhatsApp em `/root/.openclaw/openclaw.json` (alfredo) — sem isso, envio DM é bloqueado ("not listed in the configured WhatsApp allowFrom policy"). Backup: `openclaw.json.bak-antes-hugo-allowFrom-20260804`.

## ⚠️ RISCO PENDENTE — cron de amanhã vai falhar de novo

Os scripts na **la-hq** (`send-lareport-adm-hermes.py` / `send-lareport-comercial-hermes.py`) chamam `http://127.0.0.1:3000/send-report` **na la-hq** (default de `lareport_whatsapp_single.py`, que inclusive valida que a URL seja loopback). Na la-hq **não há nada escutando na 3000** — a bridge nova está no **alfredo**. Crontab do user `sol` na la-hq segue ativo (`0 23 * * 1-5` admin, `5 23 * * 1-5` comercial) e os scripts/env não foram alterados.

**Opções de fix definitivo:**
a. Tunel/forward `la-hq:3000 → alfredo:3000` (autossh/socat com supervisor), ou
b. Mover a geração/envio dos relatórios diários para o alfredo (cron lá ou task agendada da própria Sol no OpenClaw), desativando o crontab da la-hq, ou
c. Adaptar os scripts para inserir na `fila_relatorios_sol_hermes` (fila que o worker da bridge nova já processa) em vez de chamar a bridge direto.

Enquanto nenhuma for feita, o cron das 20:00/20:05 BRT vai gerar os textos e falhar no envio com `Connection refused`, como em 03/08.

## Lições

1. ** toda bridge crítica precisa de supervisor** (systemd `Restart=always` ou watchdog no cron). A bridge WhatsApp da Sol era a única sem supervisor — buraco fechado pelo Alfredo.
2. **Caminho legado WAHA deve ser desativado** na caixa Sol do banco para evitar ruído de "destravado: preso em enviando" quando o runtime real é Hermes nativo.
3. **Monitoramento de bridge offline**: se a porta 3000 não responder, os relatórios vão falhar silenciosamente (só log na VPS, sem alerta). Considerar health-check que avise Hugo/Luciano se a bridge cair.

## Referências

- Scripts: `/home/sol/.openclaw/workspace/scripts/send-lareport-adm-hermes.py`, `send-lareport-comercial-hermes.py`, `lareport_whatsapp_single.py`
- Bridge: `/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js` (endpoint `/send-report` na porta 3000)
- Cron (user sol): `0 23 * * 1-5` (admin), `5 23 * * 1-5` (comercial) — 20:00/20:05 BRT seg-sex
- Logs: `/home/sol/.openclaw/workspace/logs/lareport-adm-hermes.log`, `lareport-comercial-hermes.log`
- Fila: tabela `fila_relatorios_whatsapp` (Supabase)
- Audit: `/home/sol/.openclaw/workspace/outputs/lareport-adm-hermes/adm-hermes-2026-08-03-230049.json`
