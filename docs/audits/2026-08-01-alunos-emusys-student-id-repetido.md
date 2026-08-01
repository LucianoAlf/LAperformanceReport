# Auditoria somente leitura — repetição de alunos do Emusys

**Data:** 01/08/2026

**Produção consultada:** `ouqwbbermlzqqvtqwlul`

**Escopo:** `alunos`, health operacional, carteira e movimentações de saída
**Alterações no banco:** nenhuma

## Conclusão

Repetir `emusys_student_id` em `alunos` não prova, sozinho, duplicação de sincronização. O identificador é escopado por unidade e uma pessoa pode ter várias matrículas, cursos e professores. A chave usada nesta auditoria foi `unidade_id + emusys_student_id`; a duplicação técnica confirmada exige também o mesmo `emusys_matricula_id` não nulo.

Foram encontrados:

- 183 pessoas com mais de uma linha local, totalizando 403 linhas;
- 148 grupos totalmente explicados por matrículas Emusys distintas;
- 5 matrículas exatamente duplicadas, totalizando 10 linhas;
- 30 grupos legados ambíguos, porque ao menos uma linha não possui `emusys_matricula_id` e não permite concluir duplicação apenas pelo banco atual.

Portanto, o problema confirmado existe, mas é bem menor que os 183 grupos aparentes. Nenhuma linha foi corrigida nesta auditoria.

## Duplicações técnicas confirmadas

| Emusys aluno | Emusys matrícula | IDs locais | Situação |
|---|---:|---|---|
| 1133 | 744 | 1473, 1591 | João Pedro Costa, duas linhas ativas idênticas |
| 1177 | 784 | 1646, 1656 | Leonardo Imperial, duas linhas ativas idênticas |
| 2062 | 1392 | 942, 1486 | Sofia Fernández Rêgo, inativo + evadido |
| 2093 | 1422 | 1551, 1585 | Matheus Lopes de Medeiros, ativo + inativo |
| 3352 | 2414 | 1052, 1361 | Plínio da Silva Bezerra Neto, duas linhas inativas |

As duplicações exatas acrescentam **2 linhas ativas indevidas** à base atual: uma de João Pedro Costa e uma de Leonardo Imperial.

## Casos Pedro citados no achado inicial

- Pedro Gabriel da França Rocha Pinto (`351`, `1331`, `1435`) possui três `emusys_matricula_id` distintos (`962`, `332`, `1747`), cursos e professores diferentes. É múltipla matrícula, não duplicação de sincronização confirmada.
- Pedro Gabriel de Melo Alexandre (`663`, `1097`, `1098`) possui duas linhas legadas sem matrícula Emusys e uma matrícula `1090`. O conjunto é ambíguo e não pode ser apagado ou fundido sem reconstruir o histórico de matrícula.

## Impactos medidos

### Contagem da base

- 1.186 linhas ativas em `alunos` no momento da consulta;
- 1.109 linhas ativas com `emusys_student_id`;
- 934 pessoas ativas distintas por `unidade_id + emusys_student_id`;
- 77 linhas ativas sem `emusys_student_id`;
- diferença bruta de 175 linhas entre matrícula e pessoa, mas a maior parte representa cursos/matrículas legítimos;
- inflação ativa tecnicamente confirmada por matrícula duplicada: 2 linhas.

### Carteira do professor

Entre pessoas ativas com mais de uma linha local:

- 148 pessoas aparecem em 323 linhas ativas;
- 141 têm mais de um curso;
- 125 têm mais de um professor.

Isso confirma que a carteira é majoritariamente granular por matrícula/curso. Contar `alunos.id` como pessoa infla indicadores pessoais; deduplicar tudo por `emusys_student_id`, por outro lado, apagaria carteiras legítimas. O consumidor deve declarar se mede pessoa, matrícula ou vínculo professor-curso.

### Health score

A view operacional de health possui 277 linhas para 164 pessoas que têm repetição local, uma diferença de 113 linhas. Isso é compatível com cálculo por matrícula. Nos cinco grupos de duplicação exata, há 4 linhas de health para 3 matrículas lógicas; os dois duplicados ativos confirmados são o risco objetivo de inflação a tratar em investigação própria.

### Pesquisa de evasão

- julho/2026 não possui nenhuma pessoa com duas movimentações válidas de saída;
- somente uma saída de julho pertence a uma pessoa com múltiplas linhas em `alunos`;
- em todo 2026, 7 pessoas possuem mais de uma movimentação válida de saída;
- ainda não havia pesquisa produtiva para esses sete casos na consulta.

A fila opera no grão da movimentação. O bloqueio `pesquisa_aberta_no_mesmo_numero` reduz o risco depois que uma pesquisa produtiva já foi aberta, mas não elimina uma corrida entre duas movimentações elegíveis da mesma família. Antes de automatizar disparos, o domínio precisa de uma chave explícita de pessoa/família ou de uma trava transacional por caixa + telefone + janela.

## Próxima investigação recomendada

Sem corrigir dados ainda:

1. reconstruir os 30 grupos ambíguos usando histórico de matrícula do Emusys por unidade;
2. encontrar a origem das cinco matrículas exatamente duplicadas no sincronizador;
3. revisar contadores que pretendem medir pessoas e hoje contam `alunos.id`;
4. revisar health e carteira declarando o grão de cada indicador;
5. endurecer a unicidade de `unidade_id + emusys_matricula_id` somente depois de classificar legado, reativações e matrículas nulas;
6. criar proteção de envio por família/telefone que seja atômica, preservando irmãos e múltiplos cursos.
