# Auditoria de KPIs de Professores - 11/07/2026

## Objetivo

Garantir que Dashboard, Analytics, pagina de Professores, modais e relatorios usem a mesma fonte por competencia para os indicadores pedagogicos, com prioridade para `media de alunos por turma`.

## Fonte canonica

RPC: `get_kpis_professor_periodo_canonico`

Helper de consumo no frontend: `src/lib/professoresKpisCanonicos.ts`

Regra oficial da media:

- A carteira total pode incluir projetos e bandas.
- A media pedagogica exclui cursos marcados com `cursos.is_projeto_banda = true`.
- O mesmo aluno conta uma vez dentro da mesma turma regular.
- Se o aluno estiver em duas turmas regulares diferentes, ocupa uma vaga em cada turma.
- `media_alunos_turma = soma(alunos_via_turmas) / soma(turmas_elegiveis_media)`.
- Totais de unidade e consolidado sao ponderados pelos numeradores e denominadores. Nao se calcula media de medias.

## Consumidores alinhados

| Superficie | Indicadores alinhados |
| --- | --- |
| Dashboard | professores ativos, carteira media, renovacao e media por turma |
| Professores - Cadastro | alunos, turmas e media por turma por professor/unidade |
| Professores - Performance | carteira, turmas, media, presenca, renovacao, evasoes e conversao |
| Professores - Carteira | resumo oficial e entradas do Health Score |
| Analytics - Professores | cards, rankings, conversao e retencao |
| Modal individual | resumo atual e evolucao mensal pela mesma RPC |
| Modal de turmas | resumo oficial recebido da fonte canonica; detalhe operacional apenas para conferencia |
| Relatorio da coordenacao | totais ponderados de media, conversao, renovacao, presenca e evasoes |
| Hooks compartilhados | `useKPIsProfessor` e `useProfessoresPerformance` |

As fontes legadas `vw_turmas_implicitas`, `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_kpis_professor_historico` e `professores_performance` deixaram de alimentar as superficies ativas auditadas.

## Correcoes executadas

1. Criado um helper unico para chamar, normalizar, consolidar e totalizar a RPC canonica.
2. Removidos recalculos locais de media de alunos por turma.
3. Corrigidos totais agregados: media, conversao e renovacao agora usam soma dos numeradores dividida pela soma dos denominadores.
4. Dashboard, Analytics, cadastro, carteira, performance e modais passaram a consumir a mesma competencia.
5. Historico dos graficos de professor deixou de usar a view mensal que, apesar do nome, refletia apenas o estado corrente.
6. A lista de experimentais do modal individual passou a usar o bruto Emusys que sustenta a conversao canonica.
7. O relatorio da coordenacao foi encapsulado por uma nova versao da RPC, preservando o payload e corrigindo os totais.

## Evidencias no banco

A paridade entre a agregacao da RPC canonica e o relatorio da coordenacao foi conferida para Barra, Campo Grande e Recreio, em junho e julho de 2026. Media por turma, conversao, renovacao e evasoes pedagogicas coincidiram em todas as seis combinacoes de unidade/competencia.

Exemplos conferidos em junho:

- Barra: media `1,18`, conversao `80%`, renovacao `100%`.
- Campo Grande: media `1,53`, conversao `55,56%`, renovacao `94,44%`.
- Recreio: media `1,23`, conversao `47,62%`, renovacao `100%`.

A diferenca entre evasoes administrativas e evasoes pedagogicas e intencional: o KPI do professor considera apenas motivos configurados para o score pedagogico.

## Evidencias no navegador

Com Barra e julho/2026 selecionados:

- Dashboard: `Media Alunos/Turma 1,2`.
- Professores - Cadastro: media consolidada `1,17` antes do arredondamento do Dashboard.
- Professores - Performance: ranking liderado por Daiana com `2,0`.
- Analytics - Professores: card global `1,2` e o mesmo ranking da Performance.

Nao houve erro de execucao nas telas auditadas. Permanecem avisos preexistentes de dimensionamento do Recharts e uso do Tailwind CDN no ambiente local.

## Achados residuais

### 1. Ausencia de dado versus zero

A RPC atual devolve `0` quando nao existe denominador de presenca, conversao ou renovacao. Para conversao e renovacao o frontend consegue inferir ausencia pelo denominador. Para presenca, o denominador nao e exposto.

Decisao pendente: ausencia de presenca deve aparecer como `-` e redistribuir o peso do Health Score, ou deve valer `0`? Nao foi adotada uma regra silenciosa.

### 2. Historico ainda depende da atribuicao atual

A carteira historica da RPC usa o professor atual do aluno. Uma troca futura de professor pode reatribuir meses anteriores. A camada de transicoes criada recentemente preserva trocas novas, mas ainda nao existe snapshot mensal completo para reconstruir todo o passado.

### 3. NPS e fator de demanda nao sao historicos

`nps_medio` vem do cadastro atual de professores e o fator de demanda vem da view atual. Ao selecionar uma competencia passada, esses dois indicadores podem continuar mostrando o estado corrente.

### 4. Relacionamentos professor-unidade incompletos

Foram encontrados professores com dados canonicos no mes, mas sem relacionamento ativo correspondente:

- Vicente Pinheiro Neto - Campo Grande.
- Erick Osmy (mesclado 54) - Recreio.
- Willian Luiz Barros Ribeiro - Recreio.

Esses vinculos nao foram criados automaticamente porque exigem confirmacao operacional.

### 5. Conversao acima de 100%

E possivel uma experimental confirmada gerar mais de uma matricula/curso. Por isso a taxa bruta pode superar 100%. A tabela mantem o valor transparente e o Health Score limita a contribuicao dessa metrica a 100%.

## Verificacao automatizada

- `node --test tests/professoresKpisCanonicos.test.mjs tests/professoresKpisAppCanonicos.test.mjs`: 13 testes aprovados.
- `npm run build`: concluido com sucesso.
- `git diff --check`: sem erro de whitespace.
