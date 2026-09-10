# Coordenação Jun–Ago/2026 — auditoria independente e reconciliação

> Registro histórico intermediário (14:51 UTC). A divergência de presença abaixo foi corrigida em nova versão, preservando estes documentos. Para estado atual, resultados finais e gates de publicação/IA, consultar [registro de liberação](2026-09-09-coordenacao-release.md). Este parecer não autoriza premiação antecipada em conflito com a decisão D+30.

## Parecer

A retificação formal de Health Score foi confirmada: 117 snapshots oficiais, todos e somente os comparáveis expostos pelo leitor, sem duplicidade de professor/escopo. Os quatro documentos coincidem com o leitor em IDs, scores, publicação, competência/cutoff e 720 linhas de métricas.

**O gate de convergência total da presença entre unidades e consolidado permanece aberto.** Há divergência real de universo, não de arredondamento: dois vínculos locais atualmente inativos retiram 1 presença e 6 eventos elegíveis dos documentos das unidades, embora os eventos estejam no consolidado. A fonte canônica conserva esses eventos. A recomendação é separar universo de presença histórica de roster atual/ranking, sem excluir evidência válida nem promover esses vínculos ao ranking.

Matrículas comerciais, saídas e MRR conhecido foram reconciliados com as fontes atuais, sem forçar os valores esperados.

## Escopo e momento da evidência

- Worktree: `D:/2026/LA-performance-report/.worktrees/merge-professores-ciclo-canonico`.
- Branch observada: `fix/coordenacao-confiabilidade-total`; HEAD `19878d577266921ff3719484318bf32deda436a9`. Há mudanças concorrentes de outro agente; foram preservadas.
- Projeto consultado: `ouqwbbermlzqqvtqwlul`.
- Consulta inicial às 14:33 UTC ainda encontrou 12 oficiais antigos. A retificação feita pelo operador ocorreu às **14:36:07.748535 UTC / 11:36:07 BRT**.
- Reconciliação dos novos documentos realizada após a retificação; última checagem de oficiais/funções às **14:51:33 UTC / 11:51:33 BRT de 09/09/2026**.
- Migrations presentes no histórico: `20260909142301_coordenacao_confiabilidade_total` e `20260909143251_coordenacao_presenca_amostra_observada`. O nome planejado `20260909150000` não é o nome aplicado da correction.
- Todas as consultas remotas desta auditoria foram envolvidas em `BEGIN READ ONLY`, com `statement_timeout` local de 15–25 segundos e `ROLLBACK`. Não se chamou retificador, closer, materializador ou outra função de escrita.
- Única escrita desta etapa: este arquivo. Sem alteração de migration, aplicação, teste ou banco; sem commit.
- Evidências abaixo contêm agregados e identificadores técnicos, sem dados pessoais de alunos. Não houve nova prova de navegador nesta auditoria; o vínculo com a UI foi verificado pelo código do consumidor e pela RPC real.

## Documentos conferidos

Todos são `relatorio_coordenacao_ciclo`, seletor ano=2026/mês=6, período 01/06–31/08, cutoff 31/08/2026, status documental `retificado`, publicação do ciclo `oficial`.

| Escopo | Documento | Versão | Criado em UTC |
| --- | --- | ---: | --- |
| Consolidado | 5634401c-f352-4bdb-b42b-a0b3c1917e4c | 10 | 14:37:29.579156 |
| Campo Grande | 12c00c8f-7491-4a59-bde9-6dcda4237f49 | 10 | 14:37:41.296650 |
| Barra | dce4dc56-d60d-4ae8-b8c8-37c89604866a | 8 | 14:37:47.938328 |
| Recreio | e2e0b92a-df40-445e-9d15-cd5463483c75 | 8 | 14:37:53.946845 |

Os quatro hashes conferem com `hash_jsonb_canonico(payload - 'documento')`; as quatro versões são as mais recentes da respectiva chave consultada; todos os `supersede_id` apontam para documentos anteriores ainda existentes.

| Escopo | SHA-256 do conteúdo |
| --- | --- |
| Consolidado | 693c021034bd5b3498ab9883eead1c0d8239e2f05fcf13960c042870fd5b101c |
| Campo Grande | 84dee725a2eb8381874c009c00b45bf347384ba4923fda5e9e1b375e24623614 |
| Barra | 1949b996460b9b6dd221937fa9145b4f725fcbe43acfcac4fda991aa5663d914 |
| Recreio | 95e2db1d95d2c49ffe69edd908934fd6c3fef1f05da7125787be18c93c8b184c |

## Documento versus leitor do painel

Fonte: `get_health_score_professor_v3_performance_snapshot_v3('2026-08-01', unidade_id, 'ciclo')`. Agosto é a competência final do ciclo; junho é o seletor do documento, não uma revisão mensal concorrente.

Consumidor real: [useHealthScoreProfessorV3Performance.ts](../../src/hooks/useHealthScoreProfessorV3Performance.ts), linha 24. A tabela de Performance usa esses snapshots e `mergeHealthScoreV3ActiveRoster` em [TabPerformanceProfessores.tsx](../../src/components/App/Professores/TabPerformanceProfessores.tsx), linhas 798–819.

| Escopo | Professores documento/leitor | Comparáveis = oficiais = ranking | Parciais | Métricas comparadas |
| --- | ---: | ---: | ---: | ---: |
| Consolidado | 44 / 44 | 43 | 0 | 264 |
| Campo Grande | 32 / 32 | 31 | 0 | 192 |
| Barra | 20 / 20 | 19 | 0 | 120 |
| Recreio | 24 / 24 | 24 | 0 | 144 |

Resultados: zero IDs ausentes/excedentes; zero diferenças em `score`, `score_comparavel`, `score_observado`, `score_exibivel`, comparabilidade, estado de publicação e habilitação do ranking. Zero diferenças em data de corte e competência. Zero diferenças em valor bruto, numerador, denominador, amostra e peso efetivo das 720 métricas. Detalhes de presença também são iguais.

O ranking foi comparado como conjunto de **professor_id + score**, nos dois sentidos, contra os comparáveis oficiais habilitados do leitor: zero faltantes, excedentes ou duplicados. Os 117 são registros professor/escopo, não 117 pessoas distintas. As demais três linhas do leitor não foram promovidas ao ranking.

## Presença: paridade local confirmada, aditividade global não

### Valores atualmente publicados

| Escopo | Presenças / elegíveis | Percentual | Professores com eventos | Ocorrências observadas / fora do cálculo |
| --- | ---: | ---: | ---: | ---: |
| Consolidado | 8900 / 11937 | 74,6% | 44 | 12756 / 819 |
| Campo Grande | 3533 / 4906 | 72,0% | 31 | 5514 / 608 |
| Barra | 2036 / 2719 | 74,9% | 20 | 2806 / 87 |
| Recreio | 3330 / 4306 | 77,3% | 24 | 4425 / 119 |

Os numeradores/denominadores acima coincidem com a soma das métricas do leitor no respectivo roster. Uma comparação adicional com `get_health_score_professor_v3_presenca_periodo_v2`, **restrita aos IDs presentes naquele leitor**, também deu zero diferenças nos quatro escopos.

Amostra observada abaixo de 10 não foi apagada: há uma linha 1–9 no consolidado e uma na Barra, ambas não publicáveis como métrica de score. Para o professor 60, consolidado=5/9=55,56% e Barra=4/4=100%; são observações, não elegibilidade para pontuação de presença.

### Causa exata da diferença de 1/6

| Professor ID | Unidade omitida no roster local | Presenças / elegíveis omitidos | Outras ocorrências fora do cálculo | Vínculo local atual | Vínculo ativo que mantém o professor no consolidado |
| --- | --- | ---: | ---: | --- | --- |
| 19 | Campo Grande | 0 / 1 | 3 | emusys_ativo=false; ignorado | Barra |
| 60 | Recreio | 1 / 5 | 2 | emusys_ativo=false; pendente | Barra |

Ambos têm professor global ativo. A fonte confirma 4 ocorrências para o primeiro vínculo e 7 para o segundo, sem flags de incompletude/conflito. Só 1 e 5, respectivamente, pertencem ao denominador válido.

A soma local é **8899/11931**. Adicionando os dois vínculos históricos: numerador +1, denominador +6, observadas +11 e fora do cálculo +5. Resultado exato: **8900/11937**, 12756 observadas e 819 fora do cálculo.

### Onde o universo é reduzido

1. A função de presença v2.4 lê ocorrências canônicas por unidade e faz união do roster com os professores encontrados nas ocorrências. Portanto, preserva os dois vínculos históricos. Ver [correction](../../supabase/migrations/20260909143251_coordenacao_presenca_amostra_observada.sql), linhas 58–132, especialmente a união com `observada`.
2. O leitor-base `get_health_score_professor_v3_performance_snapshot_v1` exige vínculo **atual** com `pu.emusys_ativo=true` e status diferente de `ignorado`. Na unidade exige também `pu.unidade_id=p_unidade_id`; no consolidado basta um vínculo ativo em qualquer unidade. A definição aplicada foi consultada em `pg_proc`; o filtro está também em [reader](../../supabase/migrations/20260806143000_health_score_v3_performance_snapshot_reader.sql), linhas 72–79.
3. O espelho do documento recebe esse roster do leitor. O wrapper soma presença exclusivamente sobre `jsonb_array_elements(v_conteudo -> 'professores')`: [correction](../../supabase/migrations/20260909143251_coordenacao_presenca_amostra_observada.sql), linhas 292–322, e publica esses totais nas linhas 395–405.
4. O renderer [relatorioCoordenacaoCanonico.ts](../../src/lib/relatorioCoordenacaoCanonico.ts), linhas 578–605, mostra os totais recebidos e usa o mesmo universo para a legenda de professores. Não é arredondamento de frontend: a exclusão já está no payload SQL.

### Recorte recomendado, sem implementação nesta auditoria

Manter equipe atual, scores e rankings **44/32/20/24** separados do universo de **ocorrências de presença atribuídas à unidade no período**. Agregar presença canônica com o mesmo intervalo/cutoff para todas as unidades, incluindo fatos válidos de vínculos históricos; tornar esses fatos consultáveis em seção suplementar sem ranking.

A consulta independente sem o filtro de roster local retornou:

| Escopo | Presenças / elegíveis canônicos | Professores com eventos no universo de presença |
| --- | ---: | ---: |
| Campo Grande | 3533 / 4907 | 32 = 31 atuais + 1 histórico |
| Barra | 2036 / 2719 | 20 |
| Recreio | 3331 / 4311 | 25 = 24 atuais + 1 histórico |
| Soma das unidades | **8900 / 11937** | Não somar pessoas entre unidades |
| Consolidado | **8900 / 11937** | 44 pessoas distintas |

Não há professor com denominador positivo fora dos 44 IDs do roster da rede nessa fonte consultada. Portanto, aqui tanto o universo de fatos da fonte quanto o universo dos 44 professores, desdobrado por unidade histórica, produzem os mesmos totais.

A implementação futura deve:

- Usar uma única definição de universo de presença nos agregados, drill-down e documentos. Somar numeradores/denominadores antes de calcular percentuais; não tirar média de percentuais.
- Preservar o roster/ranking atual; não reativar vínculos nem inserir os dois professores no ranking local para fazer a soma fechar.
- Distinguir na legenda “professores da equipe atual” de “professores com eventos na unidade”. Evitar “25 de 24” no Recreio. A união equipe atual + vínculos observados teria 33 IDs em CG (um sem eventos) e 25 no Recreio, mas **não deve substituir silenciosamente** o total da equipe.
- Congelar a evidência suplementar e sua proveniência na nova versão documental; não buscar fatos vivos apenas no renderer para completar documento fechado.
- Fazer eventual correção mediante nova versão documental formal, preservando os quatro documentos auditados. Não reduzir o consolidado para 8899/11931: isso apagaria 6 eventos válidos do recorte.
- Acrescentar fixtures de professor ativo em uma unidade com presença histórica noutra inativa/ignorada; verificar igualdade exata da soma das unidades, flags, seção suplementar, amostra mínima e ranking inalterado.

## Fontes gerenciais

### Matrículas comerciais

`relatorio_coordenacao_matriculas_v4` delega para `relatorio_coordenacao_matriculas_base_v4`, que lê documentos comerciais fechados com `professor_experimental_id_fechado`. Não se usou professor atual do cadastro do aluno para reatribuir histórico.

Foram conferidos os nove documentos de origem, todos versão 2: zero ausências ou divergências de hash/versão; 162 itens; zero itens sem a chave de autoria congelada. Captura dessas fontes: 09/09/2026 08:11:27.627295 UTC.

| Unidade | Junho | Julho | Agosto | Total |
| --- | ---: | ---: | ---: | ---: |
| Campo Grande | 13 | 14 | 24 | 51 |
| Barra | 13 | 19 | 19 | 51 |
| Recreio | 20 | 17 | 23 | 60 |
| Consolidado | 46 | 50 | 66 | **162** |

Zero divergências entre a atribuição comercial de cada professor no documento e `por_professor` da fonte atual. Zero matrículas sem professor na fonte.

Controles solicitados: professor ID 36 (Valdo) = **9**, sendo 6 CG + 3 Recreio; professor ID 52 (Erick) = **19**, sendo 8 Barra + 11 Recreio. Documento e fonte concordam. São matrículas comerciais atribuídas, não o numerador de conversão experimental do Health Score.

### Saídas e MRR

A fonte `relatorio_coordenacao_saidas_v4(unidade, '2026-06-01', '2026-08-31')` coincidiu integralmente com os agregados `saidas_retencao` de cada documento. A lista nominal de movimentos foi removida do resultado retornado pela consulta.

Uma segunda consulta agregou diretamente `movimentacoes_admin`, com os mesmos filtros: evasão/não renovação no período, `is_movimentacao_admin_retencao_valida`, não anulado, não segundo curso; valor conhecido = `coalesce(valor_parcela_evasao, valor_parcela_anterior)`. Resultado idêntico:

| Escopo | Saídas | Evasões | Não renovações | MRR conhecido | Valores ausentes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Campo Grande | 84 | 62 | 22 | R$ 31.165,00 | 0 |
| Barra | 19 | 16 | 3 | R$ 6.776,00 | 3 |
| Recreio | 49 | 41 | 8 | R$ 15.589,95 | 11 |
| Consolidado | **152** | **119** | **33** | **R$ 53.530,95** | **14** |

São eventos de saída, não uma contagem deduplicada de pessoas. O MRR é conhecido/parcial: os 14 ausentes não foram imputados como perda zero. Subconjunto atribuível ao professor: 15 saídas, R$ 4.365,00 conhecidos e 4 valores ausentes; não confundir esse subconjunto com 152/R$ 53.530,95.

## Revisão independente do SQL core

Arquivo: [20260909142301_coordenacao_confiabilidade_total.sql](../../supabase/migrations/20260909142301_coordenacao_confiabilidade_total.sql).

Os corpos locais e aplicados conferem após normalizar CRLF e aparar whitespace externo:

| Função | MD5 do corpo normalizado |
| --- | --- |
| fechar_health_score_professor_v3_ciclo | 579af36dde1e2dfbdc035da94c55e4d4 |
| retificar_coordenacao_jun_ago_2026 | e4820032aebdb315366ad45995366144 |

### Invariantes confirmadas na execução observada

- A constraint permite `invalidado` somente com `invalidado_em` não nulo, `publicavel=false` e `ranking_habilitado=false`; para outros estados preserva a regra original. Não exige apagar `publicado` histórico.
- Os triggers de imutabilidade de snapshots e métricas continuam habilitados. A invalidação formal preserva identidade, valores, configuração e `publicado`; não há DELETE na retificação.
- Os 12 oficiais antigos estão invalidados, todos com `publicado=true` preservado, zero flags inválidas. A criação original continua em 04/09/2026.
- Os 117 novos oficiais têm competência 01/08/2026, ciclo e limites 01/06–31/08 corretos. Seus 702 registros de métricas não têm cutoff explícito divergente; presença e conversão têm cutoff preenchido/correto em todos.
- Zero origem incorreta; zero diferenças de score/cobertura/configuração entre novo snapshot e origem indicada em `snapshot_evidencia_origem_id`; zero revisão diferente de origem+1.
- Closer ordena candidatos por competência antes de revisão (linhas 339–342 e 427–430). Ambos calculam nova revisão dentro da mesma competência, professor, unidade e periodicidade (449–454 e 1261–1266).
- Ambos usam IDs reais retornados pelo leitor comparável, não apenas `score_exibivel` (317–323 e 1213–1227). A igualdade de conjuntos foi verificada depois da execução, além da contagem 117/117.
- A publicação do ciclo ocorre depois dos inserts e da conferência de contagem, sem tratamento que engula falha. A transação não executa o antigo DO de dados junto da DDL.
- O retificador está negado a `anon` e `authenticated`, autorizado a `service_role`, com guarda no corpo. O closer é autorizado a `authenticated`, mas chama o gerenciador de permissão no início.
- A retificação é uma operação explícita de nova revisão, **não idempotente**. Não deve ser repetida apenas como “verificação”.

### Riscos e limites remanescentes

**1. Presença não aditiva — bloqueia a alegação de convergência total atual.** Causa e números comprovados acima. Não é falha da soma ponderada nem dos 117 scores; o roster local corta fatos históricos antes da agregação documental.

**2. “Full cutoff” não está integralmente garantido pelo closer para futuras execuções.** A guarda `current_date < data_fim` permite fechar no próprio último dia, antes de todas as ocorrências desse dia. Além disso, a validação só rejeita `fim_recorte` quando a chave existe e sua data é diferente: chave ausente/null/vazia não acusa incompletude (366–374 e 1196–1207). Algumas métricas não usam essa chave, portanto a solução não é exigi-la indiscriminadamente: é definir o contrato de corte por fonte. Jun–Ago foi retificado em setembro e presença/conversão publicadas têm 31/08 explícito; não foi encontrada incompletude factual nesse recorte.

**3. Locks e teste de completude merecem reforço no closer geral.** Ele coordena famílias `health_score_v3_periodo:` e `health_score_professor_v3:` (284–315); o executor diário usa `health-score-professor-v3-diario:`, outra chave ([cron diário](../../supabase/migrations/20260808193000_health_score_v3_cron_diario_idempotente.sql), linha 261), e aceita somente o mês corrente. Não há prova de corrida nesta retificação histórica. A combinação de fechamento permitido no último dia e famílias diferentes é uma janela para concorrência no ciclo corrente. Além disso, “esperados” e “fechados” são ambos calculados sobre a interseção candidatos/materialização × IDs comparáveis: igualdade das contagens não prova isoladamente que nenhum comparável externo à interseção foi perdido. A reconciliação independente de conjuntos fechou essa lacuna para os 117 atuais; a guarda reutilizável deveria verificar também diferença de conjuntos.

**4. Evidência relacional não é copiada para os novos IDs oficiais.** Os dois loops copiam `snapshot_metricas` (474–487 e 1290–1307), mas não `snapshot_metrica_segmentos` nem `snapshot_metrica_diagnosticos`. Consulta aos 117 novos e suas origens mostrou:

| Evidência filha | Na origem materializada | Nos novos IDs oficiais |
| --- | ---: | ---: |
| Segmentos | 2480 | 0 |
| Diagnósticos | 284 | 0 |

Não houve apagamento: a origem continua existente e o retificador registra sua proveniência. O leitor agregado e os documentos conferidos não dependem dessas tabelas filhas, e não foi localizado consumidor direto em `src` além dos tipos gerados. Portanto, não se afirma regressão numérica/UI comprovada. O risco real é uma auditoria por ID oficial receber evidência detalhada vazia; deve haver cópia controlada ou resolução explícita e imutável pela origem.

**5. Imutabilidade do snapshot não implica roster histórico estável no leitor.** O filtro de vínculo ativo é consultado no presente mesmo para ciclo encerrado. Uma mudança posterior de vínculo pode alterar quem aparece no painel sem alterar qualquer snapshot. Isso já explica a diferença de universo entre escopos; um contrato de fechamento reprodutível deve separar equipe atual de evidência/roster congelados.

## Limites da verificação e próximo gate

Os 24 fixtures PostgreSQL anteriormente executados cobrem presença, wrapper documental e constraint/trigger de invalidação. Não constituem ensaio integral concorrente do retificador/closer. Nesta etapa read-only não se reexecutou função de escrita, nem mesmo sob rollback.

Próximo gate recomendado: nova definição explícita de universo de presença e evidência suplementar congelada, fixtures aditivos entre unidades, nova versão documental formal e prova de UI. **Não há indicação para descartar ou sobrescrever os 117 scores oficiais reconciliados.** A decisão pendente é o contrato de presença histórica versus equipe atual, não uma autorização implícita para alterar vínculos ou dados válidos.
