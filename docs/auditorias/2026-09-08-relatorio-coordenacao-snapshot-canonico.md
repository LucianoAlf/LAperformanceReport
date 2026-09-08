# Relatório da Coordenação: paridade com a aba Performance

Data da correção: 08/09/2026

Escopo: Gestão de Professores, relatório mensal e ranking mensal/ciclo, três unidades

Períodos verificados: junho, julho, agosto e setembro de 2026; ciclos Jun–Ago e Set–Nov/2026

## Resultado

O relatório passa a consumir a mesma fotografia e o mesmo roster ativo que a aba Performance já apresenta. Ele não recalcula o Health Score, não reaplica configuração e não usa um ranking legado para decidir quem aparece.

Nenhuma fórmula, peso, meta, nota, regra de cobertura, configuração vigente ou snapshot fechado foi alterado.

## Decisão de apresentação

A ordem é exatamente a ordem operacional do painel:

1. professores comparáveis, por `score_comparavel` decrescente;
2. professores em maturação, por cobertura e quantidade de pilares válidos;
3. professores sem base operacional, por nome.

Portanto, um score observado maior não ultrapassa um professor comparável. A cobertura de 60% ou 40% não derruba nota nem exclui pessoa: ela explica em qual grupo o painel apresenta aquela leitura.

Todos os professores do roster ativo permanecem no relatório. Quem não tem score no recorte aparece em uma seção separada, “Sem nota no recorte — fora da classificação”, com a explicação de que não recebeu nota zero.

## Causa raiz

O gerador não era uma cópia do painel. O produtor V3 entrava no caminho legado `get_relatorio_coordenacao_canonico_v2`, que voltava a calcular Performance e outros agregados antes de o V3 substituir parte desses números pelo snapshot.

Em setembro, medido antes da correção:

| Leitura | Tempo |
|---|---:|
| snapshot usado diretamente pelo painel | cerca de 0,3 s |
| contexto legado V2 | cerca de 23,2 s |
| payload V3 completo | cerca de 24,4 s |
| sinais calculados sobre Performance viva | cerca de 11,7 s |

Isso explica os timeouts e também a divergência: painel e relatório partiam de produtores diferentes.

No ciclo Jun–Ago do Recreio havia um segundo problema de apresentação. O ciclo está fechado, mas as linhas persistidas misturam estados de publicação por professor. O painel mostra 23 scores e 1 professor sem score; o relatório antigo condicionava a lista ao `ranking_oficial` legado e podia reduzir a equipe a apenas Kaio e Isaque.

## Correções

- `montar_relatorio_coordenacao_payload_v3` lê `get_health_score_professor_v3_performance_snapshot_v3`, a fonte da aba Performance.
- O roster vem dos vínculos ativos de `professores` e `professores_unidades`; ausência de snapshot cria um estado explícito `sem_base_operacional`, nunca exclusão silenciosa.
- O contexto narrativo foi separado do produtor V1/V2. Sinais pedagógicos passam a derivar do snapshot e não executam novamente o motor de Performance.
- Os quatro contadores operacionais continuam cobrindo o período completo por uma leitura-base leve; ciclo não foi reduzido ao mês de corte.
- O relatório não depende de `ranking_oficial` para listar pessoas.
- Ciclo só é chamado de “oficial fechado” quando `publicacao_oficial=true` e `ranking_habilitado=true`; nos demais estados é “em acompanhamento”.
- O texto de recesso respeita esses mesmos gates: um ciclo já fechado nunca volta a dizer que ranking ou premiação aguardam fechamento.
- `Matriculador` usa `metricas.conversao.numerador`, a quantidade absoluta de matrículas. A taxa de conversão continua como indicador separado.
- Professor sem score fica visível, fora da classificação, sem repetição de métricas inexistentes e sem ser tratado como zero.
- `qualidade_dados.professores_sem_fonte` deriva do mesmo contador `sem_base_operacional` exibido no painel; campo ausente não vira falso zero na Edge.

## Prova de paridade

Foi executada uma matriz transacional, sem persistir mudanças, para as três unidades nos recortes de junho, julho, agosto, Jun–Ago e setembro: 15 combinações.

A mesma matriz foi repetida diretamente em produção depois da migration, comparando o payload público campo a campo com `get_health_score_professor_v3_performance_snapshot_v3`.

Em todas as 15 combinações:

- professores ausentes no relatório: 0;
- professores extras no relatório: 0;
- placeholders incorretos: 0;
- diferenças de score visível: 0;
- métricas ausentes ou extras: 0;
- diferenças em valor, numerador ou denominador: 0.

Detalhe dos recortes fechados:

| Unidade | Período | Roster no relatório | Com score | Sem score |
|---|---|---:|---:|---:|
| Barra | Jun | 20 | 19 | 1 |
| Barra | Jul | 20 | 19 | 1 |
| Barra | Ago | 20 | 20 | 0 |
| Barra | Jun–Ago | 20 | 20 | 0 |
| Campo Grande | Jun | 32 | 29 | 3 |
| Campo Grande | Jul | 32 | 31 | 1 |
| Campo Grande | Ago | 32 | 30 | 2 |
| Campo Grande | Jun–Ago | 32 | 31 | 1 |
| Recreio | Jun | 24 | 22 | 2 |
| Recreio | Jul | 24 | 24 | 0 |
| Recreio | Ago | 24 | 24 | 0 |
| Recreio | Jun–Ago | 24 | 23 | 1 |

No Recreio Jun–Ago, o relatório volta a conter os 24 professores: 23 com score e 1 explicitamente sem nota. Xande deixa de ser eliminado pelo recorte legado.

Na configuração vigente (`config_versao=5`), o snapshot canônico registra Kaio e Isaque com 2/2 pilares esperados e cobertura normalizada de 100%. O antigo texto 2/5 e 40% era produzido pelo caminho legado do relatório; não correspondia à fotografia exibida pelo painel e não foi preservado como uma segunda regra.

## Prova de performance

Todas as combinações da matriz transacional ficaram abaixo do limite de 8 segundos. As execuções normalmente ficaram entre 0,96 s e 1,92 s; o maior tempo observado no smoke ampliado foi 3,188 s. A matriz pós-migration em produção, com os 15 payloads e as 15 leituras de comparação, terminou em 24,4 s no total.

Setembro mensal também abre nas três unidades, com roster completo: Barra 20, Campo Grande 32 e Recreio 24.

O ciclo Set–Nov e outubro ainda não possuem snapshot de ciclo/período na data desta medição. Eles retornam rapidamente o roster completo em `sem_base_operacional`; isso significa “a fonte ainda não publicou score para esse recorte”, não timeout e não nota zero.

## Artefatos

- `20260908181141_relatorio_coordenacao_snapshot_canonico.sql`: troca a leitura recalculada pelo snapshot.
- `20260908183928_relatorio_coordenacao_remove_kpi_redundante.sql`: remove a segunda leitura ampla redundante.
- `20260908200000_relatorio_coordenacao_espelha_painel.sql`: fecha a paridade de período, roster, contexto leve e metadados de ciclo, com hashes e âncoras que abortam diante de deriva.
- `gemini-relatorio-coordenacao`: usa a lista completa e a ordenação do painel, mantém `Matriculador` e conversão separados.
- `tests/fixtures/relatorio-coordenacao-live-functions-20260908.sql`: snapshot somente de código PostgreSQL, sem dados de negócio. A suíte comum usa Docker e não lê credenciais de produção.

## Validação

- suíte completa: 49/49 Deno, 10/10 e 29/29 PostgreSQL e 517/517 regressões gerais;
- regressões específicas: 14/14 em Node/PostgreSQL Docker;
- Deno check da Edge: aprovado com resolução automática do diretório npm;
- build de produção: aprovado;
- nenhuma alteração na configuração ou nas fórmulas do Health Score.

## Estado do rollout

- migration `20260908200000_relatorio_coordenacao_espelha_painel` aplicada em produção; hash final de `montar_relatorio_coordenacao_payload_v3`: `c7aeb3256b177cf4fd782c5705f03ab7`;
- Edge `gemini-relatorio-coordenacao` publicada na versão 89, `ACTIVE`, preservando `verify_jwt=false`;
- matriz pós-migration: 15/15 recortes com zero perda de roster, placeholder incorreto, divergência de score ou divergência de métrica;
- implementação publicada na `main` no commit `d5594f12`;
- frontend publicado em produção no deployment Vercel `dpl_731gKucZsg1gfTjksjTnPxUcgccj`, com os aliases oficiais atualizados;
- prova autenticada no navegador: Recreio Jun–Ago mostrou 24/24 no painel e 24/24 no relatório, com a mesma ordem nas 24 posições, Xande presente, Marcos separado como sem nota, `Matriculador` por quantidade absoluta e conversão em bloco próprio;
- relatórios com IA de junho e agosto responderam HTTP 200 em 5,5 s e 5,0 s; ranking mensal de junho, julho, agosto e setembro abriu sem erro; outubro retornou os 24 professores explicitamente sem base, sem timeout e sem nota zero;
- recarga completa preservou autenticação, carregou 44/44 professores no consolidado e não registrou erro de console ou de página.

## Regra para manutenção

O relatório é consumidor da aba Performance, não um segundo motor de cálculo. Mudanças futuras devem partir do snapshot retornado por `get_health_score_professor_v3_performance_snapshot_v3` e do mesmo roster ativo. Estado de publicação controla o caráter oficial da classificação; não pode apagar uma pessoa que o painel decidiu mostrar.
