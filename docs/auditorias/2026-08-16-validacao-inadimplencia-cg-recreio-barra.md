# Validação da inadimplência — Campo Grande, Recreio e Barra

Data da leitura: 16/08/2026
Data de corte: `2026-08-16`
Fonte de faturas: `public.sync_run_items` (último snapshot completo por competência)
Fonte de estado: `public.vw_alunos_estado_operacional_v131`
Contrato de leitura: `public.get_inadimplencia_canonica(uuid, date)`
Projeto Supabase: `ouqwbbermlzqqvtqwlul`

## Regra usada nesta validação

Para a lista principal de cobrança entram somente faturas `aberta`, vencidas,
`source_missing = false`, com vínculo exato de unidade + matrícula + aluno e
aluno atualmente `ativo`. Alunos `evadido` e `trancado` ficam fora da cobrança
principal, mas continuam no histórico/reconciliação. A janela operacional é
junho, julho e agosto de 2026.

Os valores abaixo são sem juros e multas, exatamente como nos XLSX do Emusys.
Os seis arquivos foram lidos somente em memória e não foram modificados.

## Arquivos recebidos

| Unidade | Arquivo | Competência | Registros | Total sem juros |
|---|---|---:|---:|---:|
| Campo Grande | `Relatorio_Contas_Receber_16_08_2026.xlsx` | 06/2026 | 6 | R$ 2.682,00 |
| Campo Grande | `Relatorio_Contas_Receber_16_08_2026 (1).xlsx` | 07/2026 | 8 | R$ 3.576,00 |
| Campo Grande | `Relatorio_Contas_Receber_16_08_2026 (2).xlsx` | 08/2026 | 3 | R$ 1.341,00 |
| Recreio | `Relatorio_Contas_Receber_16_08_2026_RECREIO.xlsx` | 06/2026 | 1 | R$ 480,00 |
| Recreio | `Relatorio_Contas_Receber_16_08_2026_RECREIO2.xlsx` | 07/2026 | 1 | R$ 480,00 |
| Recreio | `Relatorio_Contas_Receber_16_08_2026_RECREIO3.xlsx` | 08/2026 | 5 | R$ 2.390,87 |
| Barra | `Relatorio_Contas_Receber_16_08_2026 (5).xlsx` | 06/2026 | 0 | — |
| Barra | `Relatorio_Contas_Receber_16_08_2026 (4).xlsx` | 07/2026 | 1 | R$ 397,00 |
| Barra | `Relatorio_Contas_Receber_16_08_2026 (3).xlsx` | 08/2026 | 18 | R$ 7.579,00 |

O arquivo vazio da Barra foi tratado como competência sem registros, não como
arquivo ausente.

## Confronto por unidade e competência

| Unidade | Competência | Emusys | Elegíveis após regra | Diferença explicada |
|---|---:|---:|---:|---|
| Campo Grande | 06/2026 | 6 / R$ 2.682,00 | 4 / R$ 1.788,00 | Claudia Alves da Fonseca e Pedro Gabriel Michel Oliveira: `evadido` |
| Campo Grande | 07/2026 | 8 / R$ 3.576,00 | 8 / R$ 3.576,00 | bateu |
| Campo Grande | 08/2026 | 3 / R$ 1.341,00 | 3 / R$ 1.341,00 | bateu |
| Recreio | 06/2026 | 1 / R$ 480,00 | 0 / R$ 0,00 | Cherley França: `evadido` |
| Recreio | 07/2026 | 1 / R$ 480,00 | 0 / R$ 0,00 | Ísis Gonçalves dos Santos: `evadido` |
| Recreio | 08/2026 | 5 / R$ 2.390,87 | 4 / R$ 1.910,87 | Ísis Gonçalves dos Santos: `evadido` |
| Barra | 06/2026 | 0 / — | 0 / — | sem registros no XLSX |
| Barra | 07/2026 | 1 / R$ 397,00 | 1 / R$ 397,00 | bateu |
| Barra | 08/2026 | 18 / R$ 7.579,00 | 18 / R$ 7.579,00 | Manuela resolvida pela matrícula `841` → aluno Emusys `1254` |

### Observações sobre trancados e evadidos

- Nenhum dos alunos listados no XLSX da Barra está atualmente trancado ou
  evadido; os 18 itens de agosto permanecem elegíveis.
- No Recreio, as três linhas de Ísis/Cherley que ficam fora estão identificadas
  como `evadido`, não como erro de valor ou pagamento.
- A alteração aplicada à RPC remove trancados do radar principal. Eles não são
  apagados e continuam disponíveis na reconciliação/histórico.

## Correção aplicada antes da validação

A fatura da Manuela, R$ 475,00, existia no snapshot do Emusys com matrícula
`841` e aluno `1254`. A linha local tinha a matrícula, estava ativa, mas o
campo local `emusys_student_id` estava nulo. A migration
`20260816213000_inadimplencia_exclui_trancados_repara_matricula.sql` reparou
somente vínculos determinísticos por matrícula única e atualizou a RPC para
usar apenas alunos ativos.

Não foi feito backfill por nome, não foi marcado `source_missing` como pago e
nenhuma fatura foi apagada.

## Gate de frescor

Na consulta das 17:28 no horário de Brasília, o snapshot mais recente já havia
passado o `stale_after` das três competências. A RPC retornou deliberadamente:

- `status = stale`;
- `operational.collection_allowed = false`;
- `collection_scope = blocked`;
- `block_reasons = ["stale_competencia"]`;
- `items = []` e totais zerados.

Isso é o comportamento de segurança esperado: a conciliação estrutural está
verde, mas a cobrança não deve consumir um snapshot expirado. É necessário um
novo sync completo das três competências antes de liberar a lista operacional.

## Próximo gate antes do front-end

1. Rodar um sync controlado de junho, julho e agosto.
2. Confirmar que a RPC volta para `partial` ou `ok`, com
   `collection_allowed = true`.
3. Conferir os totais esperados: Recreio R$ 1.910,87 em agosto; Barra
   R$ 397,00 em julho e R$ 7.579,00 em agosto; Campo Grande R$ 1.788,00 em
   junho, R$ 3.576,00 em julho e R$ 1.341,00 em agosto.
4. Só então a página A+C de Faturas de Alunos e a integração da Sol devem
   consumir a leitura canônica liberada.
