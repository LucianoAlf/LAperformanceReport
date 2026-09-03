# Scripts da la-hq — usuário `mila`

Espelho versionado do que roda em `/home/mila/.openclaw/workspace/scripts/`
no servidor **la-hq** (89.116.73.186). Trabalho em produção conta como
entregue: script alterado no VPS precisa vir para cá no mesmo dia.

## `push-instagram-sessoes.py`

Empurra `ig_sessions.json` da bridge de Instagram para a edge
`ingerir-instagram-sessoes` do LA Report (Mapa de Sinais / A1).

- **cron:** `20 * * * *` no crontab do usuário `mila`
- **secret:** `/home/mila/.openclaw/secrets/radar-instagram.env` (600, mila:mila),
  só com `INSTAGRAM_BRIDGE_TOKEN`. **Não** é o `instagram.env`, que guarda os
  tokens da Meta e não deve ser tocado por isto.
- **log:** `/home/mila/.openclaw/logs/push-instagram-sessoes.log`

⚠️ **Roda como `mila`, não como `sol`.** O arquivo é 644, mas `/home/mila` é
`700` — o diretório barra a travessia. Afrouxar a permissão do home de outro
usuário só para caber num cron existente seria o remendo errado.

⚠️ **Consequência:** a `mila` não alcança `/home/sol/.openclaw/workspace/scripts/cron-alerta.py`
(home do `sol` é 750), então **este cron não posta falha no tópico Logs do
Telegram**. A prova de vida é do lado do banco:
`select max(capturado_em) from instagram_sessoes`.

⚠️ Sai com erro **sem enviar** quando o JSON está inválido (a bridge reescreve o
arquivo o tempo todo) ou quando não há sessão nenhuma. Meia foto viraria
"o Instagram esvaziou"; a edge tem a mesma guarda do outro lado (422 em foto
vazia).
