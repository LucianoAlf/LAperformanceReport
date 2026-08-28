# Incidente 27/08/2026 — relatórios da Sol não saíram: `/tmp` com modo 755

**Impacto:** relatório **administrativo** e **comercial** não foram enviados aos 3
grupos no horário (20:00/20:05 BRT). O relatório de **pendência de presença** de
26/08 também ficou preso, e saiu com ~36h de atraso. Detectado pelo Luciano.

**Duração:** pelo menos desde 27/08 (o cron de 1 min da fila de presença já
falhava em 26/08 após as 09:00 — as linhas de 26/08 nasceram `sol_pendente` e não
avançaram).

---

## Causa-raiz

`/tmp` estava com modo **755** (`drwxr-xr-x`, root:root). O padrão do Linux é
**1777** (`drwxrwxrwt`). Com 755, **nenhum usuário não-root cria arquivo em
`/tmp`** — e os três crons de relatório usam `flock` com o lock ali:

```
flock: cannot open lock file /tmp/sol-lareport-adm-hermes.lock: Permission denied
flock: cannot open lock file /tmp/sol-lareport-comercial-hermes.lock: Permission denied
flock: cannot open lock file /tmp/sol-report-queue-hermes.lock: Permission denied
```

O `flock` falha **antes** de invocar o script. Por isso não havia rastro em
`fila_relatorios_whatsapp`: não é que o envio falhou — **o script nunca rodou**.

⚠️ **O que despistou:** os locks que já existiam de antes (`sol-group-ingest.lock`
de 27/07, `sol-anamnese-queue-hermes.lock` de 04/08, `sol-caixa-v3-shadow-worker.lock`
de 20/08) continuavam funcionando, porque abrir arquivo **existente** de que você
é dono não exige escrita no diretório. Só quebrou o que precisava **criar** o lock.
Ou seja: parte da automação da Sol seguia rodando normalmente enquanto os
relatórios morriam — o que faz "a Sol está no ar" ser uma conclusão errada.

**Quem mudou o `/tmp` para 755 é desconhecido.** Sem rastro de `chmod` no
histórico de nenhum usuário. `/usr/lib/tmpfiles.d/tmp.conf` declara
`D /tmp 1777 root root 30d`, mas quem **reaplica o modo** é o
`systemd-tmpfiles-setup.service`, que roda no **boot** — e a máquina está com
**19 semanas de uptime**. O `systemd-tmpfiles-clean.timer`, que está ativo, só
remove arquivo velho; **não corrige permissão**. Conclusão: o sistema **não ia se
curar sozinho**, e o dano era permanente até alguém olhar.

---

## Correção aplicada

1. **`chmod 1777 /tmp`** — restaura o padrão. Efeito imediato: a fila de presença
   drenou sozinha no minuto seguinte (4 linhas presas → `enviada` às 20:57 BRT).
2. **Relatórios disparados à mão** (admin + comercial), 3 grupos cada, todos
   `enviada` e confirmados em `fila_relatorios_whatsapp` para `data_dia=2026-08-27`.
3. **Locks tirados do `/tmp`** (correção estrutural). O crontab do `sol` passou a
   usar `/home/sol/.openclaw/workspace/locks/`, diretório do próprio usuário:

   ```
   /usr/bin/flock -n /home/sol/.openclaw/workspace/locks/sol-lareport-adm-hermes.lock ...
   /usr/bin/flock -n /home/sol/.openclaw/workspace/locks/sol-lareport-comercial-hermes.lock ...
   /usr/bin/flock -n /home/sol/.openclaw/workspace/locks/sol-report-queue-hermes.lock ...
   ```

   Backup do crontab anterior em `/root/crontab-sol.bak-20260828T000303Z`.

   **Validado com o cenário real de falha:** com `/tmp` forçado de volta a 755, o
   `flock` no caminho novo **funciona** e o mesmo comando apontando para `/tmp`
   **falha** com Permission denied. Os relatórios ficaram imunes a uma regressão
   do `/tmp`.

---

## Hipótese descartada

O deploy da edge `relatorio-admin-whatsapp` (v113, 27/08 21:19 UTC) foi feito
**1h40 antes** do horário do cron e era o suspeito natural. **Descartado com
prova:** (a) o `flock` falha antes de a edge ser chamada, então nenhum HTTP saiu;
(b) o relatório de **presença**, que não passa por edge nenhuma (é inteiro do
banco), estava travado do mesmo jeito; (c) ao rodar à mão depois do fix, a edge
gerou os 6 relatórios sem erro, CG inclusive.

⚠️ **Achado lateral, não relacionado:** em 26/08 o admin de **Campo Grande** falhou
com `"status": "erro_geracao", "error": "Erro interno do servidor"` enquanto Barra
e Recreio saíram. Foi **antes** deste incidente e **antes** do deploy; em 27/08 CG
gerou normal. Transiente, não investigado — se repetir, olhar os logs da edge na
janela das 23:00 UTC.

---

## Lições

1. **`flock` que não consegue criar o lock falha em SILÊNCIO para quem observa o
   banco.** Não há linha de erro em `fila_relatorios_whatsapp` porque o script não
   chega a existir. Ao investigar "o relatório não saiu", **ler o log do cron
   antes da fila** — a fila só conta a história de quem conseguiu começar.
2. **Lock de cron não deve morar em `/tmp`.** É diretório compartilhado, mutável
   por terceiros e limpo por rotina do sistema. Lock em diretório do próprio
   usuário do serviço não depende de permissão global.
3. **Permissão de `/tmp` só é reaplicada no boot.** Num host com uptime de meses,
   uma alteração acidental é permanente. Não contar com auto-cura.
4. **"A Sol está no ar" não prova que os relatórios estão saindo** — o gateway
   seguia rodando há 1d07h com os relatórios mortos há mais de um dia.
