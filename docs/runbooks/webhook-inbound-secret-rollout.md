# Rollout — segredo inbound por caixa

> **BLOQUEIO DE ROLLOUT: NÃO IMPLANTAR O ENFORCEMENT DA TASK 3.**
>
> O deploy só pode começar depois de **todas as caixas ativas** terem um hash
> ativo em `whatsapp_caixa_webhook_secrets` e a URL correspondente estar
> atualizada no provedor com o segredo daquela caixa. Antecipar o deploy interrompe
> a inbox administrativa, o CRM, a pesquisa de evasão e a pesquisa pós-1ª aula.

## Estado atual

- Task 1: implementação local de diagnóstico sanitizado concluída; deploy fora
  do escopo desta task.
- Task 2: migration local de segredo backend-only e expurgo concluída; ainda
  não aplicada em produção.
- Task 3: autenticação local antes do payload e da service role; **não publicar**.
- Task 4: monitor autenticado e configurador seguro implementados localmente;
  nenhum deploy nem provisionamento foi executado.
- Task 5: provisionamento e corte coordenado ainda pendentes e bloqueados pelos
  achados da auditoria abaixo.

## Auditoria somente leitura da configuração atual — 02/08/2026

A leitura consultou as três caixas ativas e, quando a credencial cadastrada
permitiu, o estado efetivo no provedor. Nenhum token, segredo ou valor de query
foi copiado para este documento. O `webhook_url` do banco foi tratado apenas
como metadado: ele não prova o estado configurado no provedor.

| Caixa | Provedor | ID do webhook | Resultado efetivo no provedor | Destino | Situação antes do provisionamento |
|---|---|---|---|---|---|
| caixa 1 — Mila teste | UAZAPI | desconhecido | consulta recusada com HTTP 401; quantidade de webhooks desconhecida | desconhecido | **bloqueada**: corrigir a credencial e repetir a auditoria |
| caixa 2 — Sol | WAHA | desconhecido | a sessão cadastrada não foi encontrada (HTTP 404); a listagem atual não contém sessão correspondente nem sessão operacional | desconhecido | **bloqueada**: corrigir o vínculo da sessão e repetir a auditoria |
| caixa 3 — Lia - Sucesso do Aluno | UAZAPI | `r0cf4360375a7ff` | exatamente um webhook, habilitado, com `messages` e `messages_update` e sem exclusão de eco administrativo | produção (`ouqwbbermlzqqvtqwlul`), caixa compatível | apta à futura rotação; ainda sem segredo, como esperado antes do corte |

As três URLs registradas no banco usam o host/path de produção. Na única caixa
que pôde ser comprovada diretamente no provedor (caixa 3), não há destino para a
branch `p01c-staging` (`nzwqjepncrtufpykjita`) nem outro ambiente. Para as caixas
1 e 2, duplicidade, webhook órfão e destino não produtivo **não podem ser
descartados** até a nova auditoria; portanto não existe autorização para
provisioná-las nem para ativar o enforcement global.

O configurador local falha fechado quando a UAZAPI devolve mais de um webhook.
Ele não apaga duplicados nem escolhe um destino no improviso. A autorização
administrativa usa o mesmo contrato vigente de administração das caixas:
usuário autenticado, ativo e com `usuarios.perfil = 'admin'`; não foi criado um
novo RBAC apenas para esta task.

## Pré-condições obrigatórias para o futuro rollout

1. confirmar a lista completa de caixas ativas;
2. aplicar a migration da Task 2 e verificar o validador anônimo booleano;
3. configurar `WEBHOOK_HEALTH_TOKEN` distinto dos segredos de caixa;
4. publicar monitor e configurador compatíveis;
5. gerar um segredo forte por caixa, persistindo somente o SHA-256;
6. atualizar e verificar a URL de webhook de cada caixa no provedor;
7. provar que não existe caixa ativa sem hash ou sem URL atualizada;
8. só então publicar o webhook que exige autenticação.

Não registrar no runbook o segredo bruto, a URL completa com query secreta ou
tokens UAZAPI/WAHA. Evidências devem conter apenas IDs, contagens, estado do hash
e host/path redigidos.
