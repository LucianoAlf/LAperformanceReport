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
- Tasks 4 e 5: monitor autenticado, configurador seguro, provisionamento e corte
  coordenado ainda pendentes.

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
