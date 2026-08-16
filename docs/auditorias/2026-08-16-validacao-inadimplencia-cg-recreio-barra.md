# Validação da inadimplência — Campo Grande, Recreio e Barra

Data da leitura canônica: 16/08/2026
Data de corte: `2026-08-16`
Fonte canônica: `public.get_inadimplencia_canonica(uuid, date)`
Projeto Supabase: `ouqwbbermlzqqvtqwlul`

## Limite desta validação

Os três arquivos atuais de 16/08 encontrados em Downloads são todos de Campo
Grande. A sessão autenticada do Chrome não estava disponível nesta execução
para baixar novos relatórios do Emusys. Portanto, Recreio e Barra foram
consultados no canônico, mas ainda não têm um confronto oficial de planilha
nesta rodada.

Não foi inferido que “não há fatura” a partir da ausência de arquivo.

## Arquivos encontrados

| Arquivo | Competência identificada | Registros | Total sem juros | Unidade identificada pelo conteúdo |
|---|---:|---:|---:|---|
| `Relatorio_Contas_Receber_16_08_2026.xlsx` | 06/2026 | 6 | R$ 2.682,00 | Campo Grande |
| `Relatorio_Contas_Receber_16_08_2026 (1).xlsx` | 07/2026 | 8 | R$ 3.576,00 | Campo Grande |
| `Relatorio_Contas_Receber_16_08_2026 (2).xlsx` | 08/2026 | 3 | R$ 1.341,00 | Campo Grande |

Os totais foram lidos da linha `TOTAL:` e conferidos pela soma das linhas de
R$ 447,00. As planilhas não foram modificadas.

## Campo Grande — confronto

| Competência | Planilha Emusys | Canônico confirmado | Diferença | Resultado |
|---|---:|---:|---:|---|
| 06/2026 | 6 / R$ 2.682,00 | 4 / R$ 1.788,00 | -2 / -R$ 894,00 | regra de universo: dois ex-alunos ficam fora da cobrança |
| 07/2026 | 8 / R$ 3.576,00 | 8 / R$ 3.576,00 | 0 | bateu integralmente |
| 08/2026 | 3 / R$ 1.341,00 | 3 / R$ 1.341,00 | 0 | bateu integralmente |

O canônico de Campo Grande retornou 15 faturas confirmadas, 11 matrículas,
R$ 6.705,00 original e R$ 6.910,14 atualizado. A diferença de junho não é
uma divergência escondida de valor: o relatório do Emusys traz seis faturas,
mas a regra operacional aprovada admite somente alunos com matrícula atual
ativa ou trancada. As duas linhas excluídas são contexto de dívida antiga e não
entram na lista principal de cobrança.

## Leitura canônica das outras unidades

| Unidade | Status | Faturas confirmadas | Original | Atualizado | Frescor | Reconciliação fora da cobrança |
|---|---|---:|---:|---:|---|---|
| Recreio | `partial` | 4 | R$ 1.910,87 | R$ 1.954,03 | 3/3 competências frescas | 12 identidades inválidas; 24 issues; 0 `source_missing` |
| Barra | `partial` | 18 | R$ 7.501,00 | R$ 7.671,40 | 3/3 competências frescas | 4 `source_missing`; 16 identidades inválidas; 22 issues |

Distribuição dos itens confirmados:

| Unidade | Competência | Faturas | Original | Atualizado |
|---|---:|---:|---:|---:|
| Recreio | 08/2026 | 4 | R$ 1.910,87 | R$ 1.954,03 |
| Barra | 07/2026 | 1 | R$ 397,00 | R$ 408,51 |
| Barra | 08/2026 | 17 | R$ 7.104,00 | R$ 7.262,89 |

Esses valores são a leitura canônica confirmada, não uma prova de igualdade
com a tela do Emusys. A prova item a item de Recreio e Barra depende das
planilhas atuais ou de uma consulta viva autorizada ao Emusys.

## Como concluir a validação das duas unidades

Exportar no Emusys, para cada unidade:

1. Contas a Receber → Em Atraso;
2. competência junho/2026, julho/2026 e agosto/2026;
3. exportar XLSX mantendo vencimento, situação, aluno, fatura e valor;
4. salvar com nomes explícitos, por exemplo:
   `Relatorio_Contas_Receber_16_08_2026_Recreio.xlsx` e
   `Relatorio_Contas_Receber_16_08_2026_Barra.xlsx`;
5. enviar/colocar os arquivos em Downloads para o próximo confronto.

O próximo confronto deve comparar, por unidade e competência:

- quantidade de linhas;
- soma do valor sem juros;
- IDs/nome e competência quando disponíveis;
- itens no Emusys que ficaram fora por ex-aluno, identidade inválida ou
  `source_missing`;
- divergência de `juros_e_multa` separadamente do principal.

Enquanto esses arquivos não existirem, não declarar Recreio ou Barra “batidos”
nem “errados”. O estado `partial` deve permanecer visível e as linhas de
reconciliação não podem ser liberadas para cobrança.
