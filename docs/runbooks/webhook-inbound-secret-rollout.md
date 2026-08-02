# Rollout — segredo inbound por caixa

> **BLOQUEIO DE ROLLOUT: NÃO IMPLANTAR O ENFORCEMENT DA TASK 3.**
>
> O deploy só pode começar depois de **toda caixa que efetivamente chama o
> webhook** ter hash ativo em `whatsapp_caixa_webhook_secrets` e URL no provedor
> com o segredo correspondente. Na configuração observada em 02/08/2026, isso
> significa somente a caixa 3. Antecipar o enforcement interrompe a inbox
> administrativa, o CRM, a pesquisa de evasão e a pesquisa pós-1ª aula.

> Estado de compatibilidade em 02/08/2026: o webhook pode receber a variavel
> `WEBHOOK_INBOUND_SECRET_ENFORCEMENT`, mas seu padrao e desligado. O rollout
> multipartes pode publicar o webhook assim sem exigir segredo da caixa 3.
> Ativar a variavel continua bloqueado ate provisionar o hash e atualizar o
> webhook do provedor.

## Estado atual

- Task 1: implementação local de diagnóstico sanitizado concluída; deploy fora
  do escopo desta task.
- Task 2: migration local de segredo backend-only e expurgo concluída; ainda
  não aplicada em produção.
- Task 3: autenticação local antes do payload e da service role; **não publicar**.
- Task 4: monitor autenticado e configurador seguro implementados localmente;
  nenhum deploy nem provisionamento foi executado.
- Task 5: critério de corte reconciliado com a operação real; execução em
  produção continua aguardando autorização explícita do Alf.

## Auditoria somente leitura da configuração atual — 02/08/2026

A leitura consultou as três caixas cadastradas e, quando a credencial permitiu,
o estado efetivo no provedor. Nenhum token, segredo ou valor de query foi
copiado para este documento. O `webhook_url` do banco é apenas metadado e não
prova que o provedor chama aquele destino.

| Caixa | Uso real | Evidência no provedor | Tráfego no LA Report | Decisão para o corte |
|---|---|---|---|---|
| caixa 1 — Mila teste | cadastro futuro; a Mila atual usa Chatwoot | credencial UAZAPI cadastrada retorna HTTP 401; nenhum webhook efetivo foi comprovado | 0 em `admin_conversas`, 0 em `crm_conversas` e 0 em pesquisas de evasão | manter `ativo=true`, não provisionar e não bloquear o corte |
| caixa 2 — Sol | cadastro futuro; a Sol atual roda no Hermes | sessão WAHA cadastrada retorna HTTP 404 e não existe sessão operacional correspondente | 0 em `admin_conversas`, 0 em `crm_conversas` e 0 em pesquisas de evasão | manter `ativo=true`, não provisionar e não bloquear o corte |
| caixa 3 — Lia - Sucesso do Aluno | única caixa em uso real | exatamente um webhook UAZAPI (`r0cf4360375a7ff`), habilitado, com `messages` e `messages_update`, apontando para produção | 124 conversas administrativas; última atividade em 02/08/2026 11:30 BRT; pesquisas de evasão presentes | provisionar o segredo apenas para a caixa 3 antes do enforcement |

Na caixa 3 não existe destino para a branch `p01c-staging`
(`nzwqjepncrtufpykjita`) nem outro ambiente. O HTTP 401 da caixa 1 e o HTTP 404
da caixa 2 refletem o estado operacional esperado: não há instância ativa do
outro lado e, portanto, elas não chamam o inbound. **Não desativar as caixas 1 e
2**; os cadastros serão usados no futuro.

### Inventário de dependências nas caixas 1 e 2

Auditoria somente leitura, sem alteração de configuração:

- 104 Edge Functions implantadas foram inspecionadas; nenhuma fixa ou seleciona
  `caixa_id` 1 ou 2. O único texto encontrado foi o exemplo de query
  `?caixa_id=1` em um comentário do próprio inbound;
- o cron `monitor-saude-webhook` chama somente a Edge do monitor e não fixa as
  caixas 1 ou 2;
- funções PostgreSQL não contêm referência estática a esses IDs;
- `agentes.tools`, prompts de agentes e `dashboard_config` não contêm referência
  a `caixa_id` 1 ou 2;
- as caixas 1 e 2 têm zero linhas em `admin_conversas`, `crm_conversas`,
  `pesquisa_evasao`, `pesquisa_evasao_mensagens` e
  `pesquisa_evasao_previews`.

Conclusão: não foi encontrado fluxo silenciosamente dependente das caixas 1 ou
2. A caixa 3 é a única integrante do corte atual.

## Monitor de ativação futura

O monitor local deixa de usar `whatsapp_caixas.ativo` ou o `webhook_url` do
banco como prova de operação. A cada execução ele:

1. lê a configuração efetiva dos webhooks da UAZAPI e da sessão WAHA;
2. cruza caixas com webhook habilitado para o inbound de produção contra hashes
   ativos em `whatsapp_caixa_webhook_secrets`;
3. alerta por caixa se houver webhook efetivo sem hash, sem query secret, com
   destino divergente/duplicado ou se um hash ativo perder seu webhook;
4. só executa o health do inbound para webhook efetivo já coberto por hash.

HTTP 401/404 de caixa sem hash é tratado como caixa futura desconectada e não
gera falso alerta. Assim que a credencial/sessão passar a expor um webhook
efetivo, a ausência de hash passa a gerar alerta, independentemente da flag
`ativo`.

A WAHA também permite webhook global por variável de ambiente, e a documentação
oficial informa que essa configuração não aparece no `GET /api/sessions/`.
Portanto, antes de ativar a caixa 2, a equipe deve confirmar manualmente a
configuração global da instalação e usar webhook de sessão auditável no corte:
https://waha.devlike.pro/docs/how-to/config/#global-webhooks

## Pré-condições obrigatórias para o futuro rollout

1. reconfirmar por leitura que a caixa 3 continua sendo a única com webhook
   efetivo e tráfego;
2. aplicar a migration da Task 2 e verificar o validador anônimo booleano;
3. configurar `WEBHOOK_HEALTH_TOKEN` distinto do segredo de caixa;
4. publicar monitor e configurador compatíveis;
5. provisionar o segredo apenas para a caixa 3, persistindo somente SHA-256;
6. consultar a UAZAPI e confirmar que o único webhook da caixa 3 contém a query
   secreta, sem copiar o valor;
7. provar pelo monitor que todo webhook efetivo está coberto por hash;
8. só então publicar o webhook que exige autenticação.

Não registrar no runbook o segredo bruto, a URL completa com query secreta ou
tokens UAZAPI/WAHA. Evidências devem conter apenas IDs, contagens, estado do hash
e host/path redigidos.

## Ativação futura das caixas 1 e 2

Antes de conectar instância, sessão ou webhook de qualquer uma delas:

1. auditar o provedor e remover destino duplicado/órfão;
2. provisionar um segredo exclusivo e manter somente o hash no banco;
3. configurar a URL do provedor com o segredo;
4. confirmar que o monitor reconhece webhook efetivo coberto por hash;
5. só então liberar tráfego real.

Esse procedimento é obrigatório mesmo que `whatsapp_caixas.ativo` já esteja
`true`.
