# Lia Fase B — rollout do follow-up de 72 horas

## Estado inicial

- projeto de produção: `ouqwbbermlzqqvtqwlul`;
- Fase A ativa e saudável, com caixa 3, outbox, dispatcher e cron por minuto;
- Fase B bloqueada por `followup_72h_liberado=false`;
- nenhum novo cron, bridge, fila de relatório ou webhook inbound faz parte do
  rollout;
- o follow-up automático à família permanece desligado;
- caso real de aceite: pesquisa de Ezequiel FernandoFerreira de almeida,
  vencimento em 06/08/2026 10:55:54 BRT e primeiro resumo elegível em
  07/08/2026 09:00 BRT.

## Cadência aprovada

- a fila da tela muda exatamente em `enviado_em + 72 hours`;
- o WhatsApp recebe um resumo por operador e por dia, às 09:00 BRT;
- o resumo agrupa tudo que venceu desde o resumo anterior;
- a idempotência diária usa
  `followup_3d_operador:{usuario_id}:{YYYYMMDD}`;
- um caso que vence depois do resumo diário permanece visível na tela e entra
  no resumo do dia seguinte;
- o texto lista no máximo dez alunos, informa a quantidade restante e leva à
  fila filtrada.

## Restrições antes do rollout

- não aplicar migration, publicar Edge ou frontend sem autorização do Alf;
- não criar a migration de ativação antes do piloto aceito;
- não tocar em `webhook-whatsapp-inbox` ou `enviar-pesquisa-evasao`;
- não enviar follow-up automático à família;
- preservar os alertas da Fase A mesmo se o produtor da Fase B falhar.

## Gates previstos

1. migration estrutural com `followup_72h_liberado=false`;
2. Edge compatível e produtor inerte;
3. frontend depois das RPCs;
4. piloto exclusivo no destino governado do Alf;
5. diff e hash da migration de ativação;
6. ativação e observação do primeiro resumo real.

## Rollback direcionado

O primeiro passo de contenção é definir `followup_72h_liberado=false`. Em caso
de regressão da Edge, republicar a versão anterior de `processar-alertas-lia`.
As ações manuais, resumos e itens já auditados não são apagados pelo rollback.

## Evidências locais

Pendente da execução das Tasks 2 a 7.
