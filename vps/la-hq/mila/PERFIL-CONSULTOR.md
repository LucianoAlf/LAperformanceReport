# Perfil Hermes das consultoras — `mila-consultor-readonly`

O perfil em que **20 colaboradores** caem quando falam com a Mila
(`pickHermesProfile(podeEditar)` → `pode_editar = false`). Diretoria (Luciano,
Hugo, Anne Susan) cai no perfil **raiz**. Estado vigente desde 04/09/2026.

Caminho na VPS la-hq: `/home/mila/.hermes/profiles/mila-consultor-readonly/`.

## config.yaml — o que precisa estar assim

```yaml
model:
  provider: openai-api          # NÃO xai-oauth: o auth.json deste perfil não tem
  default: gpt-5.4-mini         # refresh_token e morre em 401 (incidente 04/09)

mcp_servers:
  mila-gestao-tools:
    command: /home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh
    args: []
    env:                                              # 🔴 obrigatório
      MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}
      MILA_CARIMBO_OBRIGATORIO: "1"
  registrar-pedido:
    ...
```

**Só esses dois servidores.** Foram removidos `mila-acesso-lareport` (SQL cru),
`n8n`, `supabase-governance` e `chatwoot`: davam a qualquer colaborador acesso a
qualquer tabela e a qualquer conversa, por fora das tools escopadas. Com o SQL
cru presente, uma consultora leu o gasto de tráfego pago em 26 consultas diretas.

## Por que o bloco `env:` é obrigatório

**O Hermes não propaga o ambiente do processo para o servidor MCP** — chegam 12
variáveis, e `MILA_CONSULTOR_TELEFONE` (que o bridge exporta a cada mensagem)
não está entre elas. Sem o `env:`, o wrapper cai no telefone do arquivo de
segredo, que é o do Luciano: **diretoria, sem unidade, vendo as três**.

O bloco `env:` **interpola** variáveis do processo (provado com um probe), então
é ele que leva o carimbo certo. `MILA_CARIMBO_OBRIGATORIO=1` faz o wrapper
recusar iniciar sem carimbo, em vez de assumir diretoria em silêncio.

## Antes de liberar este perfil para alguém

```bash
sudo -u mila env HOME=/home/mila \
  HERMES_HOME=/home/mila/.hermes/profiles/mila-consultor-readonly \
  /home/mila/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main \
  chat -Q -q "Responda só: ok" --source tool
```

Exigir `rc=0` **e** ausência de `Primary auth failed`. Em 04/09 o perfil foi
liberado para o time sem esse teste e as três consultoras tomaram erro.

Prova de isolamento (rodar como uma consultora, com `MILA_CONSULTOR_TELEFONE`):
pedir tráfego pago e outra unidade. As duas têm que ser recusadas, e a unidade
dela tem que vir certa.
