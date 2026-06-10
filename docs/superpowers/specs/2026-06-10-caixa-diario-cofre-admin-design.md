# Caixa Diario e Caixa-Cofre no Administrativo

Data: 2026-06-10

## Status

Design aprovado para Fase 1.

Ainda nao implementar sem plano tecnico separado.

## Objetivo

Criar no modulo Administrativo uma aba de caixa para fechamento financeiro diario por unidade.

A Fase 1 sera manual e operacional:

- a recepcao/admin abre o caixa do dia;
- registra entradas e saidas;
- confere saldo final;
- gera/envia manualmente um relatorio WhatsApp para o grupo financeiro da unidade.

Nao entram nesta fase:

- importacao de CSV;
- integracao automatica com Emusys/lojinha;
- envio automatico agendado;
- conciliacao bancaria;
- alteracao em KPIs historicos.

## Decisao de produto

O fechamento sera um unico relatorio financeiro diario por unidade, mas dividido em secoes semanticas:

1. Caixa-Cofre Dinheiro
2. Vendas / Caixa Diario
3. Conferencia final

Isso evita dois envios separados no WhatsApp, mas preserva a diferenca entre dinheiro fisico e vendas/recebimentos.

## Conceitos

### Caixa-Cofre Dinheiro

Controle de dinheiro fisico da unidade.

Campos principais:

- saldo inicial;
- entradas em dinheiro;
- saidas em dinheiro;
- saldo final calculado;
- saldo final conferido;
- responsavel/conferido por;
- observacoes.

Somente movimentacoes em dinheiro alteram o saldo fisico do cofre.

### Vendas / Caixa Diario

Registro operacional das vendas e recebimentos do dia.

Campos principais:

- categoria;
- descricao;
- forma de pagamento;
- valor;
- responsavel;
- observacoes.

Pix/cartao entram no relatorio financeiro do dia, mas nao alteram o saldo fisico do cofre.

## UI aprovada

Nova aba dentro de Administrativo:

- nome sugerido: `Caixa`;
- deve ficar ao lado das abas administrativas existentes;
- deve seguir o design system atual do LA Report;
- nao criar pagina separada nem landing page.

Estrutura visual:

1. Cabecalho
   - unidade;
   - data;
   - status: aberto / fechado;
   - operador/responsavel;
   - acoes: abrir caixa, historico, enviar WhatsApp.

2. Cards de resumo
   - saldo inicial cofre;
   - entradas dinheiro;
   - saidas dinheiro;
   - saldo final cofre;
   - vendas do dia.

3. Bloco Caixa-Cofre Dinheiro
   - tabela de entradas e saidas que afetam dinheiro fisico.

4. Bloco Vendas / Caixa Diario
   - tabela de vendas/recebimentos por forma de pagamento.

5. Formulario rapido
   - ambiente: cofre ou vendas;
   - tipo: entrada ou saida;
   - forma: dinheiro, pix, cartao, outro;
   - valor;
   - categoria;
   - descricao/motivo.

6. Preview do WhatsApp
   - deve mostrar exatamente como a mensagem sera enviada.

## Modelo do relatorio WhatsApp

Formato base:

```text
*FECHAMENTO DE CAIXA DE CAMPO GRANDE*
📆 10/06/2026

💰 *Caixa Cofre Dinheiro - CG*

Saldo inicial: *R$ 775,77*

🟢 *Entrada do dia:*
• R$ 80,00 - venda lojinha - camiseta

🔴 *Saida do dia:*
• R$ 100,00 - Segurança (Pagamento semanal do dia 27/05)
• R$ 100,00 - Segurança (Pagamento semanal 02/06)

🧾 *Vendas / Caixa Diario:*
• Dinheiro: R$ 80,00
• Pix: R$ 100,00
• Cartão: R$ 0,00

✅ *Saldo final caixa dia 10/06/2026:* R$ 655,77

Conferido por: *Gabriela*
_Gerado pelo LA Report_
```

O texto final deve evitar duplicar "Gerado pelo LA Report".

## Dados e persistencia

Fase 1 precisa de persistencia propria. Proposta de tabelas:

### `caixas_diarios`

Uma linha por unidade/data.

Campos sugeridos:

- `id uuid`;
- `unidade_id`;
- `data_caixa date`;
- `status text`: aberto, fechado;
- `saldo_inicial_cofre numeric`;
- `saldo_final_calculado numeric`;
- `saldo_final_conferido numeric`;
- `aberto_em timestamptz`;
- `aberto_por text`;
- `fechado_em timestamptz`;
- `fechado_por text`;
- `observacoes text`;
- timestamps.

Restricao:

- unica por `unidade_id`, `data_caixa`.

### `caixa_movimentacoes`

Movimentacoes do caixa.

Campos sugeridos:

- `id uuid`;
- `caixa_diario_id uuid`;
- `unidade_id`;
- `data_movimento date`;
- `ambiente text`: cofre, venda;
- `tipo text`: entrada, saida;
- `forma_pagamento text`: dinheiro, pix, cartao, cheque, transferencia, outro;
- `categoria text`: lojinha, seguranca, troco, retirada, despesa, outro;
- `descricao text`;
- `valor numeric`;
- `responsavel text`;
- `criado_por text`;
- timestamps.

Regra:

- somente `forma_pagamento = dinheiro` e `ambiente = cofre` altera saldo fisico do cofre.

## WhatsApp

Fase 1:

- botao manual "Enviar WhatsApp";
- gerar mensagem a partir dos dados salvos;
- enviar ao grupo financeiro da unidade.

Necessario cadastrar/configurar:

- JID do grupo financeiro por unidade;
- nome curto da unidade no relatorio: CG, Barra, Recreio;
- fallback seguro caso JID nao esteja configurado.

Fase futura:

- envio automatico semelhante ao relatorio diario administrativo;
- lembrete de caixa aberto sem fechamento;
- historico de envios e reenvio.

## Permissoes

Na Fase 1, acesso sugerido:

- admin master;
- usuarios administrativos da propria unidade;
- backend/service role para envio WhatsApp.

Sem permissao:

- professores;
- comercial nao administrativo;
- usuarios de outras unidades.

## Estados e validacoes

Estados:

- caixa inexistente;
- caixa aberto;
- caixa fechado.

Validacoes minimas:

- nao permitir dois caixas para mesma unidade/data;
- valor precisa ser maior que zero;
- saida exige motivo/descricao;
- fechamento exige responsavel/conferido por;
- ao fechar, salvar saldo calculado e saldo conferido.

Fase 1 pode permitir reabrir caixa apenas para admin master, se necessario. Caso contrario, retificacao fica para fase futura.

## Riscos

- Misturar pix/cartao com saldo fisico do cofre.
- Enviar relatorio sem JID correto do grupo financeiro.
- Fechar caixa sem responsavel/conferencia.
- Criar dados duplicados por unidade/data.
- Automatizar cedo demais antes de validar rotina manual.

## Fora de escopo da Fase 1

- Importar CSV;
- integrar com Emusys;
- integrar com estoque/lojinha;
- conciliacao bancaria;
- fechamento automatico;
- retificacao formal completa;
- dashboards financeiros consolidados.

## Proximo passo

Criar plano de implementacao com:

1. migration proposta;
2. componentes frontend;
3. funcao/Edge Function de envio WhatsApp;
4. checklist de QA manual;
5. rollback.
