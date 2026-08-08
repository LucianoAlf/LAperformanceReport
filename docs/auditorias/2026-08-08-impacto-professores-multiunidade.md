# Health Score V3 — impacto do Consolidado real

Data da leitura: 08/08/2026. Competência: agosto/2026, periodicidade mensal.

## Decisão e escopo

O Health Score V3 **não teve fórmula, pesos, metas, cobertura, maturidade ou classificação alterados**.
O ajuste em validação é exclusivamente de leitura: o filtro Consolidado passa a consumir o retrato
`escopo = consolidado` já calculado no banco, em vez da antiga junção, no cliente, de respostas por
unidade.

O leitor antigo fazia chamadas unitárias em sequência, não definia `ORDER BY` para as unidades e
normalizava por `professor_id`. Para quem leciona em mais de uma unidade, uma linha podia combinar
o score de uma unidade com métricas de outra. Como a ordem do banco não é contrato, esse resultado
também podia variar entre carregamentos.

O leitor atual chama uma única vez
`get_health_score_professor_v3_performance_snapshot_v3(competencia, null, periodicidade)`.
O contrato devolve o consolidado real. A migration de estabilidade adiciona ordem explícita por
`professor_id, metrica`, sem alterar dado algum.

## Cobertura medida

- 28 professores lecionam em mais de uma unidade em agosto.
- 23 atuam em duas unidades; 5, em três unidades.
- 27 têm score no snapshot consolidado; 1 (Ana Beatriz Paz de Almeida) está sem score, com
  cobertura 0%, o que é uma condição real de cobertura, não erro de leitura.
- Todos os registros listados abaixo vieram da última revisão materializada de agosto. As seis
  métricas são os pilares: retenção, permanência, conversão experimental→matrícula, média/turma,
  número de alunos (diagnóstico) e presença.

`—` representa ausência de evidência no retrato, não zero.

| Professor | Unidades | Score por unidade | Score consolidado | Cob. | Ret. | Perm. | Exp→Mat | Média/turma | Alunos | Presença |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Alexandre de Sá Ritta do Espirito Santo | Campo Grande, Recreio | 99,25; 85,57 | 97,88 | 40% | 100% | 11,49 | 25% | 1,53 | 41 | 92,86% |
| Ana Beatriz Paz de Almeida | Barra, Campo Grande, Recreio | —; 56,00; 47,06 | — | 0% | 100% | — | 0% | 1,27 | 12 | 50% |
| Caio Tenório de Araújo | Campo Grande, Recreio | 91,38; 84,56 | 94,38 | 40% | 100% | 10,65 | 33,33% | 1,40 | 49 | 80% |
| Daiana Pacifico da Silva dos Anjos | Barra, Campo Grande | 92,46; 93,84 | 95,46 | 40% | 100% | 10,91 | 50% | 2,46 | 32 | 100% |
| Erick Cosme da Silva | Barra, Recreio | 55,69; 83,25 | 82,02 | 40% | 100% | — | 100% | 1,06 | 35 | 81,08% |
| Gabriel Santos Teixeira da Silva | Barra, Campo Grande | 88,50; 71,11 | 86,92 | 40% | 100% | 8,86 | 66,67% | 1,59 | 39 | 57,14% |
| Isaque Mendes da Silva | Barra, Recreio | 87,71; 76,17 | 89,53 | 60% | 100% | 10,47 | 0% | 1,03 | 34 | 71,43% |
| Israel Rocha da Silva | Campo Grande, Recreio | 93,17; 83,34 | 89,25 | 60% | 100% | 10,01 | 33,33% | 1,04 | 26 | 76,92% |
| Jeyson Gaia Ramos | Barra, Campo Grande | 88,75; 87,50 | 87,50 | 40% | 100% | 13,31 | 50% | 1,00 | 7 | 100% |
| Joel de Salles Gouveia Filho | Barra, Campo Grande, Recreio | 100,00; 69,94; 93,85 | 100,00 | 40% | 100% | 15,44 | 28,57% | 1,22 | 34 | 60% |
| Kaio Felipe Rodrigues Cabral | Campo Grande, Recreio | 93,46; 71,58 | 84,10 | 60% | 100% | 10,22 | 66,67% | 1,50 | 47 | 41,67% |
| Larissa Bheattriz Barbosa Santos | Barra, Recreio | 77,41; 77,17 | 77,24 | 60% | 100% | 7,61 | 50% | 1,19 | 44 | 78,95% |
| Leonardo Castro | Barra, Campo Grande | —; 79,53 | 78,47 | 60% | 100% | 7,32 | 66,67% | 1,00 | 21 | 81,82% |
| Leticia de Almeida Palmeira | Campo Grande, Recreio | 79,17; 83,72 | 90,46 | 40% | 100% | 9,71 | 50% | 1,34 | 46 | 82,93% |
| Lohana Leopoldo de Araújo | Barra, Campo Grande, Recreio | 91,46; 79,59; 86,99 | 92,79 | 40% | 100% | 10,27 | 25% | 1,41 | 46 | 88,89% |
| Lucas Amorim Souza | Barra, Campo Grande | —; 58,18 | 84,41 | 40% | 100% | — | 0% | 1,25 | 9 | 45,45% |
| Marcos Delfino Serafim | Campo Grande, Recreio | —; 66,67 | 100,00 | 20% | 100% | — | 0% | 1,25 | 12 | 60% |
| Matheus dos Santos Silva de Oliveira | Campo Grande, Recreio | 94,04; 80,65 | 88,61 | 60% | 100% | 9,72 | 0% | 1,38 | 25 | 79,17% |
| Matheus Felipe Lourenço | Campo Grande, Recreio | 100,00; 70,11 | 100,00 | 40% | 100% | 12,64 | 33,33% | 1,54 | 20 | 88,89% |
| Matheus Lana da Silva | Barra, Recreio | 87,60; 84,56 | 91,26 | 60% | 100% | 12,66 | 16,67% | 1,03 | 35 | 72,22% |
| Matheus Reis | Barra, Campo Grande, Recreio | —; 90,28; 66,67 | 89,77 | 40% | 100% | — | 25% | 1,09 | 11 | 100% |
| Pedro Sérgio Figueiredo da Glória | Barra, Campo Grande | 99,88; 70,80 | 99,13 | 40% | 100% | 11,79 | 0% | 1,33 | 38 | 70% |
| Peterson Biancamano | Barra, Campo Grande | 100,00; 96,70 | 100,00 | 40% | 100% | 14,51 | 50% | 1,35 | 35 | 76,92% |
| Ramon Pina Morais | Campo Grande, Recreio | 100,00; 92,31 | 100,00 | 40% | 100% | 14,24 | — | 1,00 | 52 | 83,33% |
| Renan Amorim Guimarães | Campo Grande, Recreio | 100,00; 88,94 | 99,63 | 40% | 100% | 11,91 | 50% | 1,67 | 28 | 100% |
| Valdo Delfino | Campo Grande, Recreio | 87,29; 66,67 | 87,67 | 40% | 100% | 9,04 | 25% | 1,16 | 37 | 63,64% |
| Willer Arruda Machado | Barra, Campo Grande, Recreio | —; 70,26; 76,52 | 79,38 | 40% | 100% | 7,05 | 66,67% | 1,13 | 33 | 92% |
| Willian De Andrade Da Silva | Barra, Recreio | 84,16; 93,36 | 91,20 | 60% | 100% | 11,43 | 66,67% | 1,11 | 41 | 50% |

## Casos para a coordenação

Os exemplos de histórico levantados para Jeyson, Matheus dos Santos, Alexandre, Marcos Delfino,
Matheus Reis, Willer e Ana Beatriz não devem ser apresentados como uma conversão numérica
antes/depois sem fixar competência e revisão: os valores que circularam referiam-se a leituras
anteriores e/ou a unidade específica. A tabela acima é o retrato canônico de agosto e é a base
correta para validação antes da publicação.

O risco concreto corrigido é de composição: um professor multiunidade deixa de receber uma linha
híbrida e passa a receber uma única linha da rede, com score e seis pilares provenientes do mesmo
snapshot consolidado. Para professor de uma única unidade, este ajuste não altera o significado da
leitura.

## Gate de publicação

1. Aplicar a ordenação determinística no leitor de snapshots.
2. Executar o leitor novo em shadow mode contra o snapshot consolidado, comparando estrutura,
   professor e seis métricas — não contra a antiga junção híbrida.
3. Validar autenticado em Barra, Campo Grande, Recreio e Consolidado.
4. Publicar somente se a Performance não cair no cálculo vivo e se a Carteira continuar isolando
   enriquecimentos indisponíveis sem rotular professor como `sem base` por erro técnico.
