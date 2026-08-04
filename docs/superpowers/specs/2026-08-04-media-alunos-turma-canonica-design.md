# Média de Alunos por Turma — Fonte Canônica Única

## Objetivo

Garantir que **Média de Alunos por Turma** mostre o mesmo numerador, denominador e valor em Gestão de Alunos, Dashboard, Analytics e Professores quando unidade e competência forem iguais.

## Causa da divergência

O commit `6af6b62` migrou Dashboard, Analytics e Professores para o cálculo canônico por competência, mas Gestão de Alunos continuou calculando a fotografia operacional atual pela `vw_turmas_implicitas`. Além disso, o cadastro principal de Professores passou a consultar o mês corrente com `new Date()`, independentemente da competência exibida.

Assim, telas com o mesmo rótulo passaram a comparar universos e competências diferentes.

## Definição da métrica

A métrica pertence ao domínio de **turmas e ocupações contratadas**, não ao de presença nem exclusivamente ao de professores.

- `ocupacoes_elegiveis`: quantidade de pares distintos `pessoa + turma regular` vigentes na competência.
- A chave da turma considera unidade, curso, dia da semana e horário.
- `turmas_elegiveis`: quantidade de turmas regulares distintas com ocupação vigente.
- Cursos marcados como projeto ou banda não entram na meta pedagógica.
- `media_alunos_turma = ocupacoes_elegiveis / turmas_elegiveis`.
- O consolidado soma ocupações e turmas antes da divisão; não calcula média das médias dos professores ou das unidades.
- Presença, falta, reposição e data de lançamento da chamada não alteram o tamanho contratado da turma.

Para competência fechada, a fotografia usa a vigência no último dia do período e preserva o histórico auditado. Para competência aberta, usa o estado vivo daquela competência.

## Arquitetura

### Contrato de banco

Criar a RPC versionada `get_kpis_turmas_canonicos_v1`, com os parâmetros:

- `p_unidade_id uuid`, nulo para consolidado;
- `p_ano integer`;
- `p_mes integer`;
- `p_data_inicio date`, opcional;
- `p_data_fim date`, opcional.

O grão do contrato é uma linha por `unidade + professor` na competência. Consumidores de unidade ou consolidado somam os numeradores e denominadores dessas linhas. O contrato retorna, no mínimo:

- `unidade_id`;
- `professor_id`;
- `ocupacoes_elegiveis`;
- `turmas_elegiveis`;
- `media_alunos_turma`;
- `competencia_status` (`aberta` ou `fechada`);
- `fonte` e `regra_versao` para auditoria.

A implementação extrai a regra já homologada no Health Score V3 para uma base neutra de turmas. `get_kpis_professor_periodo_canonico_v3` passa a consumir essa mesma base para os campos de média por turma; os demais pilares do professor permanecem inalterados.

### Contrato frontend

Criar um cliente único do domínio de turmas. Todos os consumidores enviam explicitamente unidade, ano, mês e intervalo selecionados e recebem numerador, denominador e média.

Consumidores:

- Gestão de Alunos;
- Dashboard;
- Analytics > Professores;
- Professores: cards, tabela, carteira, performance e relatórios;
- relatórios gerencial e de coordenação que publicam a mesma métrica.

Nenhuma tela pode recalcular a média localmente pela `vw_turmas_implicitas`, usar `new Date()` no lugar da competência selecionada ou publicar média simples das médias individuais.

## Estado operacional

A `vw_turmas_implicitas` continua disponível para Gestão de Turmas, distribuição, listas e diagnóstico da operação atual. Caso a interface mostre sua média ampla, o rótulo deve ser **Ocupação operacional atual**, sem reutilizar o nome do KPI canônico.

## Falhas e compatibilidade

- Falha na RPC canônica resulta em estado indisponível e mensagem de erro observável.
- Não existe fallback silencioso para view, cache ou mês corrente.
- A migração é aditiva e versionada; contratos antigos permanecem disponíveis durante o corte.
- O corte só ocorre após comparação de resultados entre a RPC nova e a regra V3 homologada.

## Testes e critérios de aceite

1. Campo Grande, julho de 2026, apresenta o mesmo numerador, denominador e média nas quatro áreas.
2. Trocar unidade ou competência altera todas as telas de forma coerente.
3. Competência fechada não muda por alterações posteriores da carteira.
4. Competência aberta acompanha mudanças válidas de matrícula e horário.
5. Banda e projetos permanecem fora da média pedagógica e disponíveis na carga operacional.
6. Consolidado é calculado por `soma(ocupações) / soma(turmas)`.
7. Gestão de Alunos não consulta `vw_turmas_implicitas` para preencher `Média/Turma`.
8. Professores não força o mês corrente quando existe competência selecionada.
9. Falha da fonte canônica não produz outro valor sob o mesmo rótulo.
10. Os exemplos homologados de junho de 2026 permanecem estáveis: Daiana em Campo Grande `18/6 = 3,00`; Ramon no Recreio `13/13 = 1,00`; Akeem no Recreio `49/40 = 1,23`.

## Validação e publicação

- Executar testes de contrato SQL e de consumidores frontend.
- Comparar a nova RPC com a V3 homologada por unidade e competência.
- Validar Campo Grande/julho em preview autenticado.
- Publicar migração antes do frontend.
- Fazer smoke test nas quatro telas após o deploy.
