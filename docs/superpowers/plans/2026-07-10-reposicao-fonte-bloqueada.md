# Aulas de reposicao - Decisao de fonte para o MVP

**Status:** bloqueada por ausencia de fonte comprovada. Nenhuma tabela ou dado de reposicao sera inventado.

## Evidencias

- `/professores` nao retorna reposicoes.
- `/matriculas` nao retorna reposicao marcada.
- `/aulas` retorna `justificada`, mas esse campo descreve a falta de origem e nao identifica data/horario da reposicao.
- Aulas com `categoria = extra` nao possuem, nos exemplos auditados, chave que as ligue a uma falta ou indique que sao reposicoes.
- As rotas candidatas `/reposicoes`, `/aulas/reposicoes`, `/aulas/reposicao`, `/aulas_a_repor` e `/aulas/repor` foram rejeitadas pela API como endpoint invalido.

## Criterio para desbloqueio

Retomar a Feature 2 somente quando houver pelo menos uma destas evidencias:

1. endpoint oficial que liste a reposicao marcada com aluno, professor, unidade, data e horario; ou
2. campo/chave documentada em `/aulas` que identifique a aula de reposicao e sua aula de origem; ou
3. webhook real com esse contrato, validado com payload de producao.

`justificada = true` isoladamente nao atende ao contrato e nao deve gerar uma reposicao presumida.
