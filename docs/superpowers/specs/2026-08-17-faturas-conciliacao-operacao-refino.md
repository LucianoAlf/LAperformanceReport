# Faturas de alunos — conciliação e leitura operacional

## Decisões

- A competência selecionada continua sendo o recorte financeiro da página.
- `Em atraso` é o card financeiro D+0; a régua D+2 continua no contrato canônico da Sol e não aparece como ação nesta tela.
- O resumo financeiro conta faturas confirmadas na origem mesmo quando o vínculo local está pendente.
- Uma fatura `source_missing` continua fora dos totais: não observação na origem não prova pagamento, cancelamento ou baixa.
- Identidade pendente não libera cobrança. A equipe deve resolver o vínculo usando a unidade e o par de IDs Emusys, nunca o nome isolado.
- Faturas canceladas são apenas histórico da competência e não entram em aberto, atraso ou cobrança.

## Evidência da auditoria da Barra — agosto de 2026

No snapshot auditado inicialmente em 17/08 às 07:48 (horário de Brasília), havia 16 itens de conciliação. Após a migração, a RPC foi revalidada com um snapshot fresco concluído às 08:18; a contagem e os itens permaneceram os mesmos:

- 8 faturas confirmadas na origem, mas sem vínculo local exato, somavam R$ 4.661,99 em pagamentos. Esse valor explica exatamente a diferença dos pagos entre o LA Report e o resumo do Emusys.
- 5 faturas estavam `source_missing`, somando R$ 2.009,00 no snapshot. Permanecem fora até a origem confirmar o estado; não são tratadas como pagas.
- 3 faturas tinham aluno local resolvido, mas forma de pagamento ausente.
- A diferença de R$ 27,89 no atraso é o acréscimo de multa/mora do valor atualizado do LA Report em relação ao resumo original mostrado pelo Emusys.

## Comportamento da UI

- Cards financeiros são os filtros principais.
- Ação operacional única nesta página: abrir `Conciliação financeira`.
- `Canceladas — histórico` deixa explícito que o estado não compõe os totais.
- O aviso parcial é neutro e acionável: explica o que entra nos totais, o que fica fora e que a lista não é de cobrança.
- Cada pendência mostra fatura, status, vencimento, pagamento, valor original, valor pago/atualizado, unidade e IDs Emusys.

## Segurança financeira

A reconciliação é aditiva e preserva o histórico. Nenhuma linha é apagada, nenhuma fatura `source_missing` é convertida em paga e nenhuma identidade é inferida por nome. A carteira de cobrança continua com o gate canônico independente da contagem financeira.
