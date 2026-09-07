# Sol — as três frentes, e o incidente que o restart revelou

**Data:** 07/09/2026 · **Decisão do Alf:** por partes — corrigir, trazer, e só depois voltar com o planejamento da arquitetura.

---

## 1. O incidente — resolvido, mas vale entender

### O que estava errado

Dois problemas, um dentro do outro.

**(a) O shadow V4 nunca rodou.** `caixa-financeiro.cjs` foi patcheado em **05/09 19:30**; o gateway estava de pé desde **01/09**. O processo nunca recarregou, então o código do roteador V4 — transporte HTTPS direto, foto do contexto, prompt corrigido, minimax-m3 — **nunca entrou em memória**. Zero decisões em sombra, numa frente que existe exatamente para acumular placar.

Eu reportei "está no ar" em 05/09 sem conferir que o processo tinha recarregado. **Código no disco não é código rodando.**

**(b) O gateway não subiria mais.** Ao reiniciar em 07/09 02:14, ele entrou em loop:

```
PermissionError: [Errno 13] Permission denied:
  '/home/sol/.hermes/profiles/sol/logs/agent.log'
Gateway (re)started 6 times in 120s — backing off
```

O `agent.log` estava **`root:root`**, modificado 05/09 19:41 — um comando meu rodou como root e escreveu nele; a rotação criou o arquivo novo com o dono errado.

🔴 **O processo antigo seguia vivo só porque já tinha o file handle aberto.** Ele quebraria em **qualquer** restart — reboot, atualização, queda de energia — e a Sol ficaria muda sem ninguém saber por quê. Ficou nesse estado por 2 dias.

### O que foi feito

| | |
|---|---|
| dono do `agent.log` | corrigido para `sol:sol` |
| varredura de dono errado nos caminhos que ela escreve | **196 arquivos** corrigidos; hoje são **0** |
| gateway | `active / running / NRestarts=0` |
| WhatsApp | `✅ WhatsApp connected!` |
| indisponibilidade | 02:14 → 02:16 UTC, domingo de madrugada |

### E cinco crons que estavam mortos em silêncio

Investigando os erros que sobraram, apareceram **cinco jobs do Hermes travados desde 03/09** pela guarda de drift:

> `[drift_skip:silent] Skipped to prevent unintended spend: global inference config drifted since this job was created`

| job | |
|---|---|
| `Heartbeat — Aluno em risco silencioso` | alerta operacional |
| `LA Report — Auditoria diária de crons` | ⚠️ **o vigia que pegaria outros crons quebrados** |
| `LA Report — Auditoria de conversas (caixa de entrada)` | |
| `Sol — Monitor Aniversário Secretaria` | |
| `sol-brain-supabase-keepalive` | |

Não é bug: é uma trava de segurança do Hermes. O job guarda a config de inferência de quando foi criado; se a config global muda (aqui, a troca de provedor), ele se recusa a rodar para não gastar sem querer. O remédio está na própria mensagem — fixar provider e modelo no job.

Os cinco foram fixados em `openai-codex` / `gpt-5.6-luna`, conferido no `jobs.json`.

⚠️ **A ironia que vale registrar:** um dos travados era a *auditoria de crons* — o vigia estava entre os mortos, então nada avisaria que os outros quatro estavam parados. Vigia que depende da mesma config que ele vigia tem esse ponto cego.

---

## 2. As três frentes

### Frente 1 — Replay do V4, para recuperar a semana

Em vez de esperar mais cinco dias de sombra, passar a **semana inteira de mensagens dos 3 grupos financeiros** pelo `rotearMensagemV4` **offline**, comprovante por comprovante, comparando com o que o runtime de fato fez. Objetivo: **virar a chave o mais breve possível**.

**Pendente de verificação antes de montar:** onde as mensagens estão guardadas e se preservam o contexto que o roteador precisa (a foto do contexto por `messageId` foi justamente um dos patches de 05/09). Se o contexto histórico não estiver completo, o replay mede o julgamento do roteador mas não a fidelidade do contexto — e isso precisa ser dito no placar, não escondido.

### Frente 2 — As 4 camadas no administrativo

Alicerce · 1º andar (contexto → interpretação → orientação) · 2º (padrões → aprendizados → estratégia) · 3º (ação e execução).

Nasceu na Sol, foi construída primeiro na Mila. **Hoje a Sol tem só o caixa** — alicerce e um pedaço do 3º andar (executa lançamento). Falta o 1º andar do domínio administrativo (inadimplência, ocupação, aviso prévio, anamnese), o 2º inteiro, e o resto do 3º.

Três públicos, três recortes:

| camada de decisão | quem |
|---|---|
| operacional | atendimento administrativo, no dia a dia |
| tático | gerente da unidade |
| estratégico | Luciano |

Precisa de **base de conhecimento própria**, como a comercial — mesmo desenho: blocos em `base_conhecimento_blocos`, gate por telefone no servidor, público hierárquico.

### Frente 3 — As conversas do WhatsApp

*"Tudo o que a Mila tem hoje a Sol pode ter, só que no universo dela."* Cliente respondeu e ninguém voltou; promessa de retorno não cumprida; alerta e produtividade sobre o atendimento.

É o que destravou a Mila em 06/09 — o Chatwoot deixou de ser sistema separado e virou dado. Para a Sol vale mais, porque a relação inteira com o aluno mora lá.

**O que já existe e transfere direto:**

- `varrer-conversas-chatwoot.py` — espelho de status/última mensagem, de 30 em 30 min
- `fn_lead_estado_pauta_v1` — o veredito `cobrar | pedir_motivo | oferecer_fechar`
- a lição da Daiana: **um relatório que lê só o próprio sistema acusa errado quem trabalha certo**

---

## 3. Ordem e método

Por partes: corrigir → trazer → medir. O replay do V4 vem primeiro porque destrava uma decisão que já está esperando há uma semana.

⚠️ E vale a regra que saiu do incidente: **depois de patchear runtime de processo longo, comparar o `mtime` do arquivo com o `lstart` do processo.** Sem isso, "está no ar" é uma frase, não um fato.
