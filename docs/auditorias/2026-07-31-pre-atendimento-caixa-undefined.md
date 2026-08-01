# Pré-Atendimento — diagnóstico de `Caixa undefined`

Data: 31/07/2026

Escopo: investigação somente leitura, separada do Plano A da pesquisa de
evasão. Nenhuma função, dado ou configuração de produção foi alterada.

## Conclusão

O aviso `WhatsApp desconectado — Lia - Sucesso do Aluno • Caixa undefined não encontrada`
é um falso negativo do monitor de status. Ele não é produzido pela rota de
envio da Mila e, isoladamente, não bloqueia mensagens.

A causa está no contrato entre tela e Edge Function:

1. `ConversasTab.tsx` monta `useWhatsAppStatus(conversaSelecionada?.caixa_id)`
   mesmo quando nenhuma caixa válida chegou ao hook;
2. `useWhatsAppStatus.ts` chama `whatsapp-status` mesmo sem ID e simplesmente
   omite `caixa_id` do corpo;
3. `whatsapp-status/index.ts` não valida a presença do ID antes da consulta e
   devolve literalmente `Caixa ${caixa_id} não encontrada`, resultando em
   `Caixa undefined não encontrada`;
4. o banner concatena o nome conhecido da relação da conversa com esse erro.

Esses arquivos não possuem diff entre a `main` e o PR #16. O último commit
que tocou o status foi `25b7e34`, de 29/05/2026, confirmando o caráter
preexistente.

## Impacto sobre a Mila hoje

O banner não governa o botão de envio. O fluxo manual e o fluxo da Mila chamam
`enviar-mensagem-lead`; essa Edge relê `crm_conversas.caixa_id` e
`unidade_id` no servidor e só então resolve a credencial. Portanto, uma falha
do `whatsapp-status` no navegador não impede o backend de enviar.

A leitura agregada de produção mostrou:

- 12 conversas no CRM, 11 atribuídas à Mila;
- 8 conversas da Mila vinculadas à caixa 3 (`Lia - Sucesso do Aluno`);
- 1 conversa da Mila vinculada à caixa 2 (`Sol`);
- 2 conversas da Mila sem `caixa_id`, ambas de Campo Grande, ainda com status
  `aberta`, mas sem atividade desde 13/02/2026;
- a única caixa ativa com função `agente` é a caixa 1 (`Mila teste`), vinculada
  à Barra.

Isso revela um risco separado: nas duas conversas sem caixa, o resolver atual
tenta `funcao + unidade` e depois aceita qualquer caixa da função. Como não
há caixa de agente ativa de Campo Grande, uma nova resposta nelas pode cair no
fallback da caixa da Barra. O histórico mostra mensagens antigas da Mila como
lidas nessas conversas, então o fallback já permitiu envio; ele não garante,
porém, a caixa correta por unidade hoje.

## Correção recomendada como item próprio

1. Não chamar `whatsapp-status` enquanto `caixa_id` não for inteiro positivo;
   mostrar estado neutro de conversa/caixa não selecionada.
2. Validar `caixa_id` na Edge e responder `400` com erro de contrato, em vez de
   consultar com `undefined`.
3. Revisar as duas conversas abertas sem caixa e vincular/encerrar somente após
   validação operacional.
4. Para envios da Mila, falhar fechado quando existir unidade mas não existir
   caixa de agente daquela unidade; não cair silenciosamente em outra unidade.
5. Cobrir com testes o carregamento sem conversa, conversa com caixa, conversa
   sem caixa e ausência de caixa compatível com a unidade.
