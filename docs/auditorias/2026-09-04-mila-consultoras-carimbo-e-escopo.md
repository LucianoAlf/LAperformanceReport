# A Mila não respondeu à Daiana nem à Kailane — e o que apareceu por baixo

**04/09/2026.** Investigação a pedido do Luciano depois de as duas escreverem e
não receberem resposta. O sintoma tinha uma causa simples; embaixo dela havia
duas falhas de escopo que ninguém tinha visto.

## Linha do tempo (BRT)

| hora | o quê |
|---|---|
| 15:23 | Daiana: *"Oi, Mila. Tudo bem?"* → `consultor_acordou` ✅ → `reply_error: hermes_exit_1` |
| 15:24 | Daiana: *"me passa as experimentais que temos hoje no Recreio?"* → mesmo erro |
| 15:25 | Kailane: *"quantos alunos de agosto pra cá ainda não têm contrato assinado?"* → mesmo erro |
| 15:37 | Vitória: *"Oi Mila!! Tudo bem? 😊"* → mesmo erro |
| **15:48** | **fix do modelo do perfil** (ver abaixo) |
| 15:52–16:00 | Vitória volta a escrever e **a Mila responde** — 5 respostas seguidas |
| 16:28/16:29 | Mila responde à Daiana e à Kailane com o que ficou pendente |

**O gatilho nunca foi o problema:** as três mensagens acordaram a Mila
(`motivo: chamada_pelo_nome`). O que quebrou foi o passo seguinte.

## 1. Por que não respondeu — perfil sem autenticação de modelo

O perfil `mila-consultor-readonly` estava em `xai-oauth / grok-4-fast-reasoning`,
e o `auth.json` dele era **cópia do da raiz, sem `access_token` nem
`refresh_token`** (só o `mila-sdr` tinha o par completo). Toda chamada caía em
`Primary auth failed → fallback openai-codex → HTTP 401`.

Ninguém tinha visto porque **nenhuma consultora havia escrito ainda** — zero
sessões `consultor-v2` no perfil. Ele foi liberado para o time num estado que
nunca tinha sido exercitado.

**Corrigido:** `openai-api / gpt-5.4-mini` (chave já no `.env` do perfil, sem
OAuth para expirar). Backup `config.yaml.bak-20260904T184827Z-pre-openai-api`.
⚠️ `gpt-4.1-mini` não serve neste Hermes (400 em `reasoning.effort`).

> **Regra:** antes de liberar um perfil Hermes para gente, rodar
> `hermes chat -Q -q "ok"` naquele `HERMES_HOME` e exigir `rc=0` **sem** aviso de
> fallback. Dez segundos que teriam evitado o dia inteiro.

## 2. 🔴 O carimbo não chegava — todas falavam como DIRETORIA

Com o modelo funcionando, a Mila passou a responder *"a base me devolveu **sem
unidade**"*. `sem_unidade` é o que as RPCs devolvem para quem tem
`unidade_id NULL` — ou seja, **diretoria**.

**Causa:** o Hermes **não propaga o ambiente do processo para o servidor MCP**.
Medido com um probe: chegam **12 variáveis**, e `MILA_CONSULTOR_TELEFONE` não
está entre elas. O wrapper então caía no telefone do arquivo de segredo, que é
o do Luciano (diretoria, unidade global).

**Consequência real, não teórica:** perguntada pela Vitória *"quem vai ganhar o
Matriculador + LA?"*, a Mila respondeu com o ranking **das três unidades**,
contando o desempenho da Daiana e da Kailane. O isolamento por unidade — a
primeira regra do desenho — não estava valendo.

⚠️ **A prova que eu tinha feito em 04/09 de manhã era falsa:** eu chamei o
wrapper `.sh` **direto**, com o env na mão, e ele carimbou certo. O caminho real
é Hermes → MCP, e é nele que o env some. É a mesma armadilha já registrada no
`CLAUDE.md` sobre a Sol (validar com o lançador mockado).

**Corrigido** no `config.yaml` do perfil, onde o bloco `env:` **aceita
interpolação** (provado: `PROVA_INTERPOLA=5521968060404`):

```yaml
  mila-gestao-tools:
    command: /home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh
    env:
      MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}
      MILA_CARIMBO_OBRIGATORIO: "1"
```

E o wrapper virou **fail-closed**: com `MILA_CARIMBO_OBRIGATORIO=1`, carimbo
ausente é recusa de iniciar — nunca mais fallback silencioso para diretoria.

## 3. 🔴 SQL cru no perfil de 20 colaboradores

Mesmo com o carimbo certo, a Daiana perguntou pelo gasto de tráfego e **recebeu
o número** (R$ 992,00, Meta + Google). Ela não tem a ferramenta de tráfego — a
Mila leu por **SQL direto**: 26 chamadas ao MCP `mila-acesso-lareport`.

O perfil tinha 6 servidores MCP, e **20 pessoas** caem nele (administrativo, RH,
financeiro, pedagógico, marketing — todo `pode_editar = false`). Qualquer uma
podia ler qualquer tabela alcançável pelo papel `mila_acesso_restrito`.

**Corrigido:** removidos `mila-acesso-lareport`, `n8n`, `supabase-governance` e
`chatwoot`. Sobram `mila-gestao-tools` (as 12 tools escopadas) e
`registrar-pedido`. Backup `config.yaml.bak-*-pre-remover-mcps`.

**Prova depois:** *"No tráfego pago eu não consegui ver daqui. No Matriculador,
Campo Grande também não aparece pra mim neste acesso. O que veio foi o
Recreio."* Tráfego recusado, outra unidade recusada, unidade própria correta.

## 4. Agenda ≠ pauta (e a agenda estava incompleta)

A Daiana pediu *"as experimentais de hoje"* e a Mila respondeu com a **pauta**
(lead sem desfecho, "ligar HOJE"). Duas coisas:

- **Não existia ferramenta de agenda.** As RPCs do passo 5 já tinham o dado —
  viraram as tools `agenda_do_dia` e `fechamento_do_dia`. Nada novo no banco.
- **`mila_briefing_manha_v1` só contava `experimental_agendada`.** Às 15:23 as
  11 do Recreio já estavam realizadas/faltou/cancelada, então a agenda devolvia
  **zero** e a Mila caiu na pauta. Hoje traz todas com `situacao` de cada uma
  (migration `20260904153000`). O dia anda; a pergunta é sobre o dia inteiro.

## 5. Envio proativo: WAHA não, Chatwoot sim

`mila-proativa.py` enviava pela WAHA e tomava **403** — a chave do WAHA nesta VPS
só serve para *presence*. Passou a enviar **pelo Chatwoot**, como o próprio
bridge faz: a mensagem entra na conversa e a consultora vê tudo num fio só.

⚠️ **403 que despista:** o proxy do Chatwoot recusa o User-Agent padrão do Python
(`Python-urllib/3.x`). Mesma URL, mesmo token: **200 no curl, 403 no python**.
Parece permissão de token e não é. Todo cliente HTTP para o Chatwoot precisa
mandar `User-Agent`.

## O que ficou

- As duas perguntas de 15:23 foram respondidas às 16:28/16:29, com o dado certo
  e reconhecendo a demora. A da Kailane foi **"não tenho esse dado"** — contrato
  assinado não existe no banco, e ela preferiu não inventar.
- `mila-responder-pendente.py`: quando o bridge registrar `reply_error`, a Mila
  volta e responde em vez de a pessoa ter que repetir.

## Pendente

**Ninguém é avisado quando a Mila falha com uma pessoa.** O bridge escreve
`reply_error` no log e segue; as três ficaram no vácuo por ~1h e só soubemos
porque o Luciano olhou o WhatsApp. Falta alarme (tópico Logs do Telegram, como
os crons da Sol já fazem).
