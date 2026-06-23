
## PENDENTE DECISÃO (2026-06-23) — 1 lead com múltiplos alunos (família)
- **Fato confirmado**: 1 lead pode gerar N alunos distintos (responsável/família). Ex.: Nicolle Nunes (lead 7523) → Gabrielle + João Miguel; Hugo Rocha (8542) → Hugo + Vitor; Lhays (7415) → Levi + Lhays. `lead_experimentais` é granular por `nome_aluno` (1 linha por filho), mas o `lead_id` é o mesmo.
- **Decisão de negócio pendente (Hugo decidir)**: lead-família que matricula 2 filhos conta como **1 ou 2 conversões** na taxa Exp→Matrícula?
- **Risco atual**: a taxa do professor usa `leads.converteu` (flag por LEAD). Se 1 filho matricula, o lead vira convertido → as 2 experimentais do mesmo lead podem contar 2 conversões mesmo com 1 matrícula (inflação). A régua nova (RPC v2 `get_conciliacao_experimentais_v2`) tenta contar por aluno específico (`aluno_taxa_id`), mas o vínculo está furado → cai na fila p/ decisão humana (operador escolhe o aluno no modal).
- **Fonte correta do vínculo** (quando formos resolver): `aluno.lead_id` do `GET /matriculas` (vem POR aluno específico), NÃO o `id_lead` solto do `/aulas`. Backfill de origem NÃO fazer agora (decisão Hugo).

## SIMULAÇÃO 2026-06-23 — matching de lead por telefone NÃO funciona (testado)
- Simulado contra `/matriculas` real (1215 ativas, gabarito = leads que já têm `emusys_lead_id`): **64% do telefone do Emusys não casa nenhum lead nosso** + **18% de erro** (42/230) onde dava pra validar (casou lead errado).
- Erros são majoritariamente ids VIZINHOS (ex: nosso 12267 vs api 12268) = família/re-cadastro: mesmo telefone tem 2 leads (mãe+filho ou recadastro), telefone casa no errado. Nome desempata pouco (nome do lead às vezes é do responsável, não do aluno).
- **CONCLUSÃO**: NÃO reconstruir vínculo lead por telefone/nome. **Caminho certo (confirmado)**: gravar `emusys_student_id` (ponte 1:1 via `emusys_matricula_id` já existente, por unidade) + usar `aluno.lead_id` que o `/matriculas` entrega POR aluno específico. Ligação toda por ids do Emusys, sem inferência. (estimativa anterior de "0,8% risco" estava errada — media unicidade interna, não o casamento real com Emusys).

## EXECUTADO 2026-06-23 — Backfill ids do Emusys no aluno (interliga lead↔aluno por id)
- Criada coluna **`alunos.emusys_lead_id`** (text, sem FK — guarda `aluno.lead_id` do Emusys, namespaced por unidade). Migration `add_emusys_lead_id_to_alunos`.
- Backfill aluno-a-aluno via `/matriculas` (3 unidades), casando por **(unidade + emusys_matricula_id)**: gravou `emusys_student_id` (=`aluno.id`) e `emusys_lead_id` (=`aluno.lead_id`). **1174/1176 preenchidos** (99,8%; 2 sem match = matrícula fora da API). **Gabarito 10/10 batem** (emusys_lead_id == leads.emusys_lead_id do lead_origem_id existente). **Risco zero**: 100% aditivo, só preencheu campos vazios, NÃO tocou valor/status/tipo/curso/lead_origem_id; nenhum KPI/tela lê esses campos.
- **Por que por ID e não telefone**: simulação provou telefone falha (64% sem casar, 18% erro). ID do /matriculas é 1:1 por unidade, determinístico.
- **Costura agora fecha por id Emusys**: aluno.emusys_student_id ↔ pessoa; aluno.emusys_lead_id ↔ lead_experimentais.emusys_lead_id. Não depende do nosso leads.id.
- **PENDENTE**: ~349 alunos sem emusys_matricula_id (2ª rodada via `/pessoas/buscar` individual). lead_origem_id (FK nosso) segue cobrindo só 209 — descartado em favor do id Emusys. Família (1 lead → N alunos): contagem de conversão ainda a decidir.

## EXECUTADO 2026-06-23 (2ª rodada) — backfill ids dos faltantes por nome+nascimento
- 351 sem `emusys_student_id` (97 ativos, 254 inativos). Chave **nome_norm + data_nascimento + unidade** (agrupando por `aluno.id` distinto = pessoa). Simulação: **333 casaram pessoa única, 0 ambíguos de pessoas distintas** (nascimento desambigua irmãos/homônimos → risco zero), 18 sem match.
- Aplicado: `emusys_student_id`/`emusys_lead_id` sempre; `emusys_matricula_id` só quando 1 matrícula. **Cobertura final 1507/1525 (98,8%)**; restam **18 (7 ativos)** sem id (nome divergente / fora da API) → 2ª-2ª rodada via `/pessoas/buscar` por telefone, se quiser.
- Chave nome+nascimento+unidade = "a perfeita" (CPF não existe em `alunos`; telefone falhou). 100% aditivo, nenhum KPI/tela afetado.

## EXECUTADO 2026-06-23 (3ª rodada) — fechamento dos faltantes → 99% (1510/1525)
- Diagnóstico dos 18 por nome (sem nascimento): **3 recuperáveis** (nascimento com typo de ano, nome idêntico + 1 aluno_id único na unidade → preenchidos: Ana Julia 2066, Matheus 2093, Beatriz 1058) + **15 AUSENTES da API** (nome não existe no /matriculas).
- `/pessoas/buscar` por telefone também é furado (telefone da Marcela retornou outra pessoa "Lorena" — família/responsável). NÃO usar.
- Os **15 ausentes = 7 ativos (= os "ausente_api" da conciliação de matrículas) + 8 inativos antigos**. Não há id pra puxar — não existem no Emusys. Os 7 ativos são divergência de status (resolver na aba Conciliação, não backfill). emusys_matricula_id órfão em 2 casos (Pietro 2575, Pablo 795 — matrícula removida da API).
- **COBERTURA FINAL ids Emusys: 1510/1525 (99,0%)**. Costura lead↔aluno↔experimental por id do Emusys habilitada.
