# KPIs Canonicos de Professores - Design

## Objetivo

Unificar card, tabela, modal, rankings e relatorios da coordenacao na mesma regra de negocio e na mesma competencia mensal.

## Regra aprovada pela coordenacao

- `carteira_alunos`: quantidade de vinculos de alunos sob responsabilidade do professor no fim da competencia, incluindo projetos e bandas.
- `total_turmas`: quantidade total de turmas/horarios sob responsabilidade do professor, incluindo projetos e bandas.
- `alunos_via_turmas`: ocupacoes elegiveis para a media pedagogica. O mesmo aluno conta em cada turma regular distinta em que estiver matriculado, mas nao duplica dentro da mesma turma.
- `turmas_elegiveis_media`: somente turmas regulares; exclui cursos com `cursos.is_projeto_banda = true`.
- `media_alunos_turma = alunos_via_turmas / turmas_elegiveis_media`.
- A fotografia de uma competencia usa alunos matriculados ate o ultimo dia do periodo e sem saida ate esse dia.

Exemplos validados no banco:

- Daiana, Campo Grande, junho/2026: 18 ocupacoes / 6 turmas elegiveis = 3,00.
- Ramon, Recreio, junho/2026: 45 vinculos e 22 turmas totais; 13 ocupacoes / 13 turmas elegiveis = 1,00.
- Akeem, Recreio, junho/2026: 57 vinculos e 44 turmas totais; 49 ocupacoes / 40 turmas elegiveis = 1,23.

## Fonte canonica

Uma RPC versionada no banco deve produzir os KPIs por professor, unidade e competencia. A chave de turma e formada por curso, dia da semana e horario. A chave de ocupacao combina aluno Emusys (ou id local como fallback) e turma.

O relatorio da coordenacao deve reutilizar essa RPC. A IA nao calcula metricas: recebe valores e rankings canonicos prontos.

## Consumidores

- `TabPerformanceProfessores`: lista, cards e rankings.
- `ModalDetalhesProfessorPerformance`: mesma competencia e mesmos valores da lista.
- `ModalRelatorioCoordenacao`: relatorios mensal e instantaneos.
- `gemini-relatorio-coordenacao`: narrativa sobre dados canonicos.
- Agentes/API/MCP: RPC publica como contrato de leitura.

## Compatibilidade

As views e RPCs legadas permanecem disponiveis, mas deixam de alimentar os consumidores corrigidos. A nova RPC explicita `turmas_elegiveis_media` para que o card possa mostrar a carga total sem contaminar a media pedagogica.

## Criterios de aceite

- Trocar a competencia altera carteira, turmas e media.
- Reabrir o modal sempre inicia na competencia da tela.
- Bandas/projetos aparecem na carga total, mas nao entram na media.
- Daiana junho/2026 retorna 18, 6, 18, 6 e 3,00 nos campos correspondentes.
- Ramon e Akeem preservam carga total e media regular conforme os exemplos.
- Card, modal, ranking e relatorio exibem os mesmos valores e ordenacao.

