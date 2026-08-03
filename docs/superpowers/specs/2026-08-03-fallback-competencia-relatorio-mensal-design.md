# Fallback de competência no relatório mensal

**Data:** 2026-08-03
**Status:** aprovado para implementação

## Problema

Apertar "gerar relatório mensal" com a competência em um mês sem fechamento devolve `409` e a
tela mostra apenas `Erro ao gerar relatorio administrativo`. Não há pista de qual mês funcionaria.

Hoje é 03/08/2026 e **só julho/2026 está fechado**, nos domínios `relatorio_admin_mensal` e
`relatorio_comercial_mensal`, nas três unidades. Com a tela abrindo no mês corrente, o botão
falha por padrão — foi o que aconteceu com o Arthur.

Duas causas se somam:

1. A edge responde `409` sem dizer qual competência está disponível.
2. O front descarta o corpo da resposta. `supabase.functions.invoke` converte qualquer não-2xx
   em `FunctionsHttpError` e **não entrega o corpo** — é preciso ler `error.context` (a `Response`)
   e chamar `.json()`. Os dois chamadores caem direto na mensagem genérica.

## Comportamento desejado

Quando a competência pedida não tem fechamento, o sistema oferece o último mês fechado
**anterior ou igual** ao pedido e só gera após confirmação explícita:

> **Agosto/2026 ainda não fechou.** Gerar o relatório de **JULHO/2026**?

Pedir junho/2026 continua falhando: não existe fechamento de junho, e julho seria andar para
frente no tempo. Sem nenhum mês anterior fechado, mantém-se o erro atual, sem oferta.

Uma única tentativa de fallback — a confirmação não encadeia para um terceiro mês.

## Arquitetura

Três mudanças, nenhum objeto novo no banco.

### 1. Edge `relatorio-admin-whatsapp` — resposta 409 enriquecida

Escopo: apenas o bloco dos modos `dry_run_mensal_admin` e `dry_run_mensal_comercial`
([index.ts:2044](../../../supabase/functions/relatorio-admin-whatsapp/index.ts#L2044) em diante).

No ramo de erro que hoje devolve 409 ([index.ts:2102-2113](../../../supabase/functions/relatorio-admin-whatsapp/index.ts#L2102)),
antes de responder, consultar o último fechamento disponível com o client `service_role` que já
existe no escopo ([index.ts:2037](../../../supabase/functions/relatorio-admin-whatsapp/index.ts#L2037)):

```
select ano, mes
from fechamento_mensal_snapshots
where dominio = <'relatorio_admin_mensal' | 'relatorio_comercial_mensal'>
  and unidade_id = <payload.unidade>
  and status = 'fechado'
  and escopo = 'unidade'
  and (ano < p_ano or (ano = p_ano and mes <= p_mes))
order by ano desc, mes desc
limit 1
```

Resposta (status **continua 409**):

```json
{ "success": false,
  "motivo": "fechamento_indisponivel",
  "error": "O fechamento oficial deste mês ainda não está disponível.",
  "competencia_solicitada": { "ano": 2026, "mes": 8 },
  "fallback": { "ano": 2026, "mes": 7, "rotulo": "JULHO/2026" } }
```

`fallback` é `null` quando não há mês anterior fechado. O ramo `ACESSO_NEGADO` → `403` fica
intocado.

**Por que não uma RPC nova.** O guard de acesso já foi aplicado quando o código chega aqui:
`get_relatorio_admin_mensal_rico_base_v1` chama `pode_gerar_relatorio_admin_v1` e lança
`ACESSO_NEGADO` **antes** de olhar o snapshot. Chegar ao ramo "não existe fechamento" prova que o
usuário tem acesso à unidade. Uma RPC dedicada só reproteria o que já está protegido.

### 2. Front — confirmação antes de trocar

`ModalRelatorio.tsx` ([gerarRelatorioMensal, l.886](../../../src/components/App/Administrativo/ModalRelatorio.tsx#L886))
e `ComercialPage.tsx` ([gerarRelatorioMensal, l.3174](../../../src/components/App/Comercial/ComercialPage.tsx#L3174))
passam a:

1. Ler o corpo do 409 via `error.context.json()`, tolerando falha de parse (cai na mensagem atual).
2. Com `fallback` presente, abrir o `ModalConfirmacao` já existente
   (`tipo: 'warning'`, `textoConfirmar: 'Gerar <ROTULO>'`).
3. Na confirmação, reenviar o mesmo `modo` com o `ano`/`mes` do fallback.
4. Na recusa, fechar sem gerar.

O texto gerado já carrega a competência no cabeçalho (`📅 JULHO/2026`), então o relatório
continua autoexplicativo depois de copiado.

### 3. Nada muda no envio automático

Os únicos modos mensais são os dois `dry_run_*`, ambos de visualização e com autenticação
obrigatória. O modo `cron` é o relatório **diário** e não compartilha esse caminho. Nenhum envio
automático passa a usar fallback.

## Risco de deploy

`relatorio-admin-whatsapp` tem `verify_jwt = false` no `supabase/config.toml`. `deploy_edge_function`
pelo MCP **ignora o config.toml e reseta o flag para `true`**. Se isso passar, o gateway devolve 401
antes do código rodar e o **relatório diário para de sair em silêncio** — o `pg_cron` marca
`succeeded` porque só avalia se o `net.http_post` foi enfileirado (precedente:
`sync-inadimplencia-emusys`, 13 dias quebrada).

Obrigatório: passar `verify_jwt: false` explícito no deploy e, depois, confirmar que uma chamada
real respondeu 200 — não basta ver que a função subiu.

## Testes

**Edge (por modo, admin e comercial):**
- competência sem fechamento, com mês anterior fechado → 409 com `fallback` preenchido
- competência sem fechamento, sem nenhum anterior → 409 com `fallback: null`
- competência fechada → 200, caminho atual inalterado
- unidade fora do escopo do usuário → 403, sem vazar `fallback`

**Front:** confirmar gera a competência do fallback; recusar não dispara chamada; 409 sem
`fallback` mostra a mensagem de erro; corpo ilegível não quebra a tela.

**Validação de acesso:** rodar com `set local role authenticated` e JWT real nos três perfis
(admin, unidade, professor). Nunca validar como `service_role`, que ignora RLS.

## Fora de escopo

- Como os fechamentos mensais são criados ou agendados.
- O número de alunos ativos de julho (241). O snapshot é imutável e continua sendo a foto de
  31/07 21:12 BRT; a divergência com a operação está documentada à parte.
