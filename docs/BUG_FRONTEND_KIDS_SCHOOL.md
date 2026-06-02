# Bug do Frontend — Kids/School histórico

## Data
2026-06-01

## Problema
O dashboard calcula Kids/School dinamicamente usando `status` atual dos alunos. Para histórico (Maio/2026), isso está incorreto porque alunos que evadiram em Junho têm `status = 'evadido'` agora, mas estavam ativos em Maio.

## Evidência

### Cálculo incorreto (frontend — status atual)
```
Kids + School = 196 + 275 = 471
alunos_ativos = 496
Diferença = 25 alunos "perdidos"
```

### Cálculo correto (histórico — competência)
```
Kids + School = 203 + 292 = 495
alunos_ativos = 496
Diferença = 1 aluno (categoria banda/projeto, fora de Kids/School)
```

## Causa raiz
O frontend usa `status IN ('ativo', 'trancado')` para filtrar alunos. Isso funciona para o **mês atual**, mas para **mês fechado** (histórico), deve usar a regra de competência:

```
aluno estava ativo em Maio/2026 SE:
  data_matricula <= '2026-05-31'
  AND (
    data_saida IS NULL
    OR data_saida > '2026-05-31'
  )
```

## Impacto
Alunos que evadiram em Junho (ex: data_saida = '2026-06-01') estão sendo subtraídos de Maio incorretamente no dashboard.

## Correção recomendada
1. Para **mês atual**: manter `status` atual (aceitável)
2. Para **mês fechado** (histórico): usar regra de competência temporal
3. Ideal: usar `dados_mensais` como fonte para histórico (snapshot imutável)

## Nota sobre categorias
Kids/School exclui cursos `is_projeto_banda = true` (Minha Banda Para Sempre, Power Kids, etc.). Alunos que fazem SÓ banda não aparecem em Kids/School — isso é comportamento esperado, não bug.

Alunos que fazem banda + curso regular aparecem em Kids/School (contados pelo curso regular).

## Status
Documentado. Aguardando priorização para correção no frontend.
