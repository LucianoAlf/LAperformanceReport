# Auditoria Formas de Pagamento — Fevereiro/2026

## Situação Atual

**TODOS os 244 alunos da Barra estão SEM forma de pagamento cadastrada no BD.**

## Mapeamento CSV → BD

| Forma no CSV | ID BD | Nome BD |
|--------------|-------|---------|
| `Cobrança Automática / Cartão de Crédito` | 1 | Crédito Recorrente |
| `Pagamento Recorrente / (Preferencial)` | 1 | Crédito Recorrente |
| `Cartão de Crédito` | 1 | Crédito Recorrente |
| `Cartão de Débito` | 1 | Crédito Recorrente |
| `Cheque ...` | 2 | Cheque |
| `Pix` | 3 | Pix |
| `Boleto` | 6 | Boleto (criado agora) |
| `Cobrança Automática / Boleto` | 6 | Boleto |

## Formas de Pagamento Disponíveis no BD

| ID | Nome | Sigla |
|----|------|-------|
| 1 | Crédito Recorrente | C.R |
| 2 | Cheque | CHQ |
| 3 | Pix | PIX |
| 4 | Dinheiro | DIN |
| 5 | Link | LNK |
| 6 | Boleto | BOL |

## Análise do CSV

### Distribuição por Forma de Pagamento:

Analisando o CSV `PARCELAS-ALUNOS-FEV.csv`:

- **Cobrança Automática / Cartão de Crédito** → maioria dos alunos
- **Cartão de Crédito** → pagamentos avulsos
- **Pagamento Recorrente / (Preferencial)** → alguns alunos
- **Pix** → poucos alunos
- **Cheque** → 2-3 alunos (Martina, Gabriela)
- **Boleto** → poucos alunos (Ana Paula, Lucas Cardoso)
- **Cartão de Débito** → 1 aluno (Arthur Titus - venda de palheta)

## Próximos Passos

1. **Extrair formas de pagamento do CSV** para cada aluno
2. **Atualizar BD** com a forma de pagamento correspondente
3. **Listar alunos sem forma de pagamento no CSV** para verificação manual

## Alunos que precisam verificação manual

Serão listados após análise completa do CSV.
