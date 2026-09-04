# Reenvio dos briefings de anamnese (2026-09-04)

## O problema

De junho a 31/08/2026 o aviso de anamnese ao professor entregou **36 de 201 briefings
(18%)**. Não foi um incidente único — foram quatro falhas diferentes do canal de WhatsApp
da Sol, encadeadas:

| Período | Falha | Briefings perdidos |
|---|---|---|
| jun–jul | `HTTP 500` do provedor e `422 Session status is not as expected` | 17 |
| 10–11/08 | `503 Not connected to WhatsApp` — sessão caída | 13 |
| 11–13/08 | `Connection refused` — bridge local fora do ar | 19 |
| 13–31/08 | worker morto por `PermissionError` em `/opt/LA-Organizer/.env`; backlog marcado como descartado em 31/08 | 114 |

Corrigido em **31/08 entre 19:53 e 21:03**. Desde então o canal está em 100% (medido em
04/09: 6 anamneses no dia, todas entregues em ~60 segundos).

O `console.warn` do formulário — hipótese original registrada na LAPE-20 — explica **1**
caso em 186. O problema era o canal, não o gatilho.

## O escopo

**160 briefings**, para **160 pessoas** e **34 professores**. Deles, **56 têm informação
de saúde** (diagnóstico, medicação contínua, cuidado médico ou necessidade de apoio).

Fonte única do escopo: [`candidatos.sql`](candidatos.sql). Exclusões deliberadas:

- **Adriana Mesquita (62) e Fabricio Costa (55)** — 4 briefings. Estão cadastrados no
  Emusys, mas com o campo telefone **vazio** lá; o número que temos é digitado à mão no
  LA Report e não há como conferir. Decisão do Hugo: não enviar.
- **Anamnese 9 (Liv Ribeiro Oliveira, 25/06)** — a mesma pessoa preencheu de novo em
  13/08 (anamnese 126). Vale a mais recente.
- **Professor do outro curso da mesma pessoa** (21 casos). A anamnese é por pessoa desde
  o LAPE-19, mas avisar todos os professores é a **Task 7, descartada** pelo Luciano em
  01/09 (agosto teve 182 anamneses; seria enxurrada). Incluí-los aqui seria implementar
  por outra porta uma decisão que foi recusada.
- **Anamneses das últimas 48h e qualquer par com linha viva na fila** — são do fluxo
  normal. Sem essa guarda o reenvio duplicaria o envio em andamento: medido em 04/09,
  entre salvar a anamnese e o worker entregá-la passa cerca de 1 minuto, e nessa janela
  ela aparece como "pendente".

## Telefones corrigidos antes de montar

Conferidos contra `emusys_matriculas_estado_atual.payload_snapshot` (campo
`contrato_atual.disciplinas[].telefone_professor`, sync de 04/09 02:40). Aplicado em
04/09 com os números confirmados pelo Hugo:

| Professor | Antes | Agora |
|---|---|---|
| Gabriel Antony Alves de Araújo | 5521968976482 | 5521990893875 |
| Ramon Pina Morais | **21999998888** (placeholder digitado à mão) | 5521999715997 |
| Jeyson Gaia Ramos | 5521974410167 | 5521997418669 |

⚠️ `professores.telefone_whatsapp` é preenchido **só** pela tela de Professores. Nenhum
sync alimenta esse campo, e só 10 dos 60 professores confirmaram o próprio número.

## O ritmo

Dois tetos ao mesmo tempo: **50 por dia** e **3 por professor por dia**, um a cada
10 minutos, das 9h às 18h BRT, em dias úteis. Fecha em 6 dias, com os casos de saúde
saindo nos dois primeiros:

```
2026-09-08   50 msgs  (40 com saúde, 34 professores)
2026-09-09   50 msgs  (16 com saúde, 27 professores)
2026-09-10   39 msgs
2026-09-11   15 msgs
2026-09-14    5 msgs
2026-09-15    1 msg
```

O teto por professor é o que mais importa: sem ele, o Gabriel Antony receberia 11
mensagens no mesmo dia, e é isso que faz alguém denunciar — não o intervalo entre elas.

⚠️ **Por que o ritmo lento não é frescura:** o número da Sol (+55 21 3955-4415) também
manda os relatórios diários das 3 unidades, o relatório de presença, o aviso prévio e
**toda a operação de caixa**. Um bloqueio ali não atrasa briefing — para o financeiro.

## Ordem de execução

1. ✅ **Patch da edge aplicado** no repo `la-teacher` (04/09/2026), com testes:
   `modo-reenvio.test.mjs` (17 casos) e `fronteira.test.mjs` (18 casos).
   O que mudou está em [`PATCH-notificar-anamnese-modo-reenvio.md`](PATCH-notificar-anamnese-modo-reenvio.md).
2. ⏳ **Deployar** — mudança em produção, exige OK explícito:
   ```bash
   cd "OneDrive/Desktop/Projects/LA Music/la-teacher"
   node supabase/functions/notificar-anamnese/modo-reenvio.test.mjs
   node supabase/functions/notificar-anamnese/fronteira.test.mjs
   supabase functions deploy notificar-anamnese \
     --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
   ```
   ⚠️ `--no-verify-jwt` não é opcional: a edge está com `verify_jwt: false` hoje, e
   deploy pelo MCP reseta para `true` sem ler o `config.toml` — foi assim que o
   `sync-inadimplencia-emusys` e o `sync-presenca-emusys` morreram em 401 silencioso.
3. **Conferir o texto** com `--preview=3`.
4. **Executar.**

```bash
# 1. plano (não toca em nada) — regenera cronograma.csv
node scripts/reenvio-anamnese/reenviar-briefings-anamnese.mjs --inicio=2026-09-08

# 2. ver o texto que o professor receberia (dry_run na edge, nada é gravado)
node scripts/reenvio-anamnese/reenviar-briefings-anamnese.mjs --preview=3

# 3. executar
node scripts/reenvio-anamnese/reenviar-briefings-anamnese.mjs \
  --inicio=2026-09-08 --executar --confirmo-envio
```

Flags: `--por-dia`, `--por-professor`, `--intervalo`, `--inicio`.

## As travas

- **Sem `--executar --confirmo-envio`, nada acontece.** O modo padrão só lê e escreve o CSV.
- **Piloto antes do lote.** Cria a primeira linha, relê do banco e confere que
  `agendada_para` ficou no futuro. Se a edge em produção ignorar o parâmetro (versão sem
  o patch), o script **reagenda aquela linha à força e aborta** — ela não sai.
- **Professor sem telefone aborta tudo**, em vez de pular em silêncio.
- **A trava anti-duplicata da própria edge** recusa criar linha quando já existe uma viva.

## Depois de executar

```sql
-- acompanhar o lote
select date(agendada_para at time zone 'America/Sao_Paulo') as dia, status, count(*)
from fila_anamnese_sol_hermes
where metadata->>'modo' = 'reenvio'
group by 1, 2 order by 1, 2;

-- nada pode ficar preso: linha vencida ainda em sol_pendente
select count(*) from fila_anamnese_sol_hermes
where metadata->>'modo' = 'reenvio'
  and status = 'sol_pendente' and agendada_para < now() - interval '30 minutes';
```

Falha de envio agora acende no Telegram (tópico **Logs** do SOL Core): o worker sai com
`SystemExit(1)` e o `cron-alerta.py` posta. Mas **fila parada não alarma** — o gatilho é
"job falhou", não "linha envelhecendo". Por isso a segunda query acima.
