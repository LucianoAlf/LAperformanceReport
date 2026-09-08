# A sombra da Mila SDR está parada desde 07/09 — as duas pernas de modelo caíram

**Data:** 08/09/2026 · **Escopo:** perfil `mila-sdr` (Hermes) na la-hq
**Impacto no cliente:** **ZERO** — quem atende o lead é o n8n, e ele está saudável.

---

## 0. Antes de tudo: qual Mila é essa

São duas coisas com o mesmo nome, e só uma quebrou.

| | **Mila SDR do n8n** | **Mila SDR do Hermes** |
|---|---|---|
| papel | **produção** — responde o lead de verdade | **sombra** — só simula e registra |
| onde | 3 workflows n8n ativos: `Agente SDR Mila CG` (`aHD4kJdzByLwFXA1`), `Recreio` (`gSHJHYMOYDQZqleW`), `da Barra` (`yko5HstPTze0gsIM`) | perfil `/home/mila/.hermes/profiles/mila-sdr`, chamado por `chatwoot-mila-bridge-lead.js` |
| alcance | as 3 unidades | **só a inbox 147 (Barra)** — `LEAD_INBOXES=147` |
| manda mensagem? | **sim** | **não** — `LEAD_MODE_ENABLED=false`, lido do processo vivo |
| saída | mensagem no Chatwoot | linha em `mila.chatwoot_simulations` |
| estado hoje | ✅ **saudável** — 6 execuções `success`, a última 16:27 | 🔴 **parada desde 07/09** |

⚠️ **A quebra é só a da sombra.** O bridge do Hermes, no caminho de lead, termina em
`return { action: 'not_sent', reason: 'lead_mode_disabled' }` — ele **nunca** envia. Nenhum
lead deixou de ser atendido, nenhum lead recebeu resposta errada.

O que se perde é **dado do estudo**: o experimento que compara a Mila do Hermes com a do
n8n parou de produzir amostra.

---

## 1. O tamanho do buraco

```sql
select (created_at at time zone 'America/Sao_Paulo')::date as dia,
       count(*) as linhas,
       count(*) filter (where coalesce(simulated_reply,'') <> '') as com_resposta
from mila.chatwoot_simulations
group by 1 order by 1 desc;
```

| dia | linhas | **com resposta** |
|---|---|---|
| 27/08 – 06/09 | 267 | **267** |
| **07/09** | 3 | **0** |
| **08/09** | 36 | **0** |

**39 leads passaram pela sombra desde 07/09 e nenhum foi simulado.** A linha é gravada,
mas `simulated_reply` vem vazio — por isso o problema não aparece como "sumiu": aparece
como estudo com amostra em branco, que é pior, porque uma contagem de linhas diz que
está tudo bem.

---

## 2. A causa: as duas pernas de modelo caíram, e uma já estava caída há semanas

O perfil `mila-sdr` tem primário e reserva:

```yaml
model:
  provider: openai-codex        # primário
  default: gpt-5.4-mini
fallback_model:
  provider: opencode-go         # reserva (OpenCode Zen)
  model: deepseek-v4-flash
```

**Chamadas de API que deram certo, por provedor e por dia** (`profiles/mila-sdr/logs/agent.log`):

| dia | `openai-codex` (primário) | `opencode-go` (reserva) |
|---|---|---|
| 01/09 | 0 | 53 |
| 02/09 | 0 | 55 |
| 03/09 | 0 | 61 |
| 04/09 | 0 | 66 |
| 05/09 | 0 | 26 |
| 06/09 | 0 | 13 |
| **07/09** | 0 | **0** |
| **08/09** | 0 | **0** |

🔴 **O primário não entrega uma única chamada há pelo menos uma semana.** A sombra
inteira estava rodando na **reserva** — e ninguém sabia, porque o resultado saía igual.

### Perna 1 — primário `openai-codex`, morto (crônico desde 26/08)

```
ERROR agent.conversation_loop: API call failed error_type=AuthenticationError
  provider=openai-codex base_url=https://chatgpt.com/backend-api/codex
  model=gpt-5.4-mini  summary=HTTP 401: Could not parse your authentication token
```

E, em paralelo, o próprio modelo é recusado:

```
Error code: 404 - The model gpt-5.4-mini does not exist or your team
  55638e74-0469-4be0-8206-b80c64b82fa7 does not have access to it
```

Ou seja: **credencial não parseia E o time não tem acesso ao modelo.** 36 ocorrências só
hoje; a primeira é de 26/08.

### Perna 2 — reserva `opencode-go`, quebrou em **07/09 às 15:53**

```
ERROR agent.conversation_loop: Non-retryable client error: Error code: 400 -
  {'type': 'error', 'error': {'type': 'MissingSessionID',
   'message': 'Error from provider (Console Go): Request is missing
               x-opencode-session and cannot be routed efficiently.'}}
```

O **OpenCode Zen passou a exigir o header `x-opencode-session`**, e o cliente do Hermes
não o manda. É **400, não-retentável** — falha na hora, as 3 tentativas não ajudam.
6 ocorrências em 07/09, **72 hoje**.

---

## 3. A lição que vale além deste caso

**A rede de segurança era a única coisa segurando o sistema, e por isso a queda do
primário nunca virou alarme.** Enquanto a reserva funcionou, tudo parecia normal: mesma
saída, mesmo volume, nenhum erro visível a quem olhava o resultado. O sistema só caiu
quando a *segunda* perna quebrou — e aí caiu inteiro, de uma vez.

⚠️ **Fallback que atende 100% do tráfego não é fallback: é o primário, sem ninguém ter
decidido isso.** Vale um vigia que compare o provedor **configurado** com o provedor que
**de fato respondeu** — é uma linha do `agent.log` (`provider=`), e teria acusado isso
em 01/09 em vez de 08/09.

⚠️ Alinhado com o que já sabíamos do OpenCode Zen: `User-Agent` obrigatório, 401 para
modelo inexistente, latência de 1s a 45s no mesmo request. Agora, mais um header
obrigatório. **É um provedor que muda o contrato sem aviso** — não deve ficar sozinho
num caminho que importa.

---

## 4. O que fazer (nenhuma ação tomada — é frente do Hugo)

Por ordem de esforço:

1. **Consertar o primário** (`openai-codex`): o 401 é de credencial e o 404 é de acesso
   ao `gpt-5.4-mini`. Precisa de reauth do Codex **e** confirmar o modelo liberado para
   o time. Isso sozinho já ressuscita a sombra.
2. **Trocar a reserva** por um provedor estável enquanto o Zen não é resolvido — o
   `x-opencode-session` é do cliente do Hermes, não é config nossa.
3. **Vigia de provedor efetivo** (ver §3) — barato e pega a classe inteira do problema.

⚠️ **Não mexi em nada.** O perfil `mila-sdr` é a Mila que atende cliente, e a instrução
vigente é não tocá-la.
