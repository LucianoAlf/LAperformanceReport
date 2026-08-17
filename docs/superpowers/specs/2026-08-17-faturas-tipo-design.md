# Classificação semântica das faturas de alunos

## Objetivo

Separar, na leitura canônica e na página `/app/faturas`, a mensalidade parcelada dos demais lançamentos financeiros vindos do Emusys. O caso de referência é a fatura da Isabela Villarinho Chaves Xavier: o passaporte de R$400 deve continuar sendo R$400, mas não pode ser apresentado como uma parcela mensal de R$480.

## Regra canônica

`numero_parcela` é o discriminador autoritativo para mensalidade regular: quando vier preenchido, `tipo_fatura` será `parcela`, mesmo que `total_parcelas_contrato` também esteja preenchido.

Quando `numero_parcela` for nulo, a classificação usa a descrição original do Emusys, nesta ordem:

1. `passaporte_taxa_matricula`: descrição contendo `passaporte` ou `taxa de matrícula`/`taxa de matricula`;
2. `lojinha_produto`: venda de estoque ou descrição de produto, instrumento, acessório, livro, apostila, caderno ou palheta;
3. `venda_ingressos`: ingresso ou evento/session;
4. `avulsa_outro`: qualquer lançamento não parcelado que não se enquadre acima.

O contrato JSON expõe `tipo_fatura`, `numero_parcela` e `total_parcelas_contrato` nos itens normais e de reconciliação. A classificação não altera status, valores, pagamentos, histórico ou dados do Emusys.

## Apresentação

A forma de pagamento permanece independente do tipo da fatura. A tabela terá um identificador visual de tipo e um filtro `Tipo da fatura`, além do filtro existente `Forma de pagamento`.

Para `parcela`, a tela mantém os rótulos contratuais: valor com desconto, valor sem desconto condicional e valor atualizado/pago. Para os demais tipos, a tela usa `Valor da fatura` e `Valor pago` ou `Valor atualizado`, evitando sugerir que o lançamento possui uma mensalidade contratual. A descrição original continua disponível nos detalhes.

## Segurança semântica

O valor mensal da matrícula não será copiado para uma fatura avulsa. A parcela de R$480 continuará vindo como uma linha própria de `parcela`; o passaporte de R$400 continuará vindo como `passaporte_taxa_matricula`. A página global pode mostrar todos os tipos, e o filtro permite que a equipe veja somente parcelas quando estiver tratando mensalidades.

## Validação

Os testes devem comprovar a precedência de `numero_parcela`, a classificação do passaporte da Isabela, a independência entre tipo e forma de pagamento, os rótulos condicionais de valores e a presença dos campos nos caminhos normais e de reconciliação.
