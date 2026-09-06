# Contrato por pessoa com IDs locais duplicados

## Objetivo

Corrigir a leitura de assinatura por pessoa quando uma matrícula acadêmica ativa não
possui `alunos.emusys_matricula_id`, mas a matrícula e o contrato estão identificados
na jornada canônica e em `aluno_contratos_emusys`.

## Causa confirmada

`get_situacao_alunos_v1` já abria todos os elementos de `aluno_ids_locais`, porém o
CTE `matriculas_relevantes` procurava a observação exclusivamente por
`alunos.emusys_matricula_id`. Quando esse campo estava nulo em uma das linhas
locais, a observação existente deixava de casar e `stats` criava um falso
`nao_verificado`.

O predicado exato que perdia a matrícula era:

```sql
left join lateral (
  select ace.*
  from public.aluno_contratos_emusys ace
  where ace.unidade_id = p_unidade_id
    and ace.emusys_matricula_id = a.emusys_matricula_id::text
  order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
  limit 1
) obs on a.emusys_matricula_id is not null
```

No Davi, a linha acadêmica local `1504` tinha
`alunos.emusys_matricula_id=null`, embora a jornada identificasse a matrícula `825`
e a observação `825/2283=true` existisse. Na Ana Luiza, a linha local `1621`
também tinha ID de matrícula nulo, enquanto a jornada identificava `2531` e a
observação `2531/4048=true` existia. A perda acontecia antes da contagem de
assinaturas, na condição `obs on ... is not null` acima.

Na medição de 06/09/2026 havia 172 pessoas com mais de um `alunos.id`; 146 tinham
mais de um ID local ativo: Barra 25, Campo Grande 51 e Recreio 70. Antes da
migration, somente os dois casos reportados estavam em `nao_verificado`; ambos
possuíam todas as observações e contratos assinados.

## Desenho escolhido

1. Manter `alunos` + `vw_alunos_estado_operacional_v131` como a contagem local de
   matrículas acadêmicas ativas e manter a dispensa explícita por
   `cursos.is_projeto_banda`.
2. Para todos os `aluno_ids_locais` da pessoa, buscar em
   `aluno_jornada_matricula_disciplina` as matrículas Emusys ativas e acadêmicas,
   deduplicadas por `(unidade_id, pessoa_chave, emusys_matricula_id)`.
3. Usar as identidades da jornada quando sua contagem for igual à contagem local
   relevante. Essa igualdade é a prova de cobertura; se não houver igualdade, a RPC
   conserva o caminho local atual e continua fechando em `nao_verificado` quando
   faltar identidade ou observação.
4. Depois de escolher as matrículas, casar a observação pela chave exata
   `(unidade_id, emusys_matricula_id)`. Nenhuma observação é reutilizada para duas
   matrículas.

Esse desenho evita a alternativa insegura de simplesmente pegar a observação mais
recente da pessoa, que poderia repetir um contrato e esconder outro não assinado.

## Estados e segurança

A precedência não muda: `dispensado` → `nao_verificado` → `sem_contrato` →
`nao_assinado` → `assinado`. A função continua `SECURITY DEFINER`, conserva a
autorização existente e os mesmos grants; não há escrita de dados nem alteração no
Emusys.

## Validação

- Fixture PostgreSQL com dois cadastros locais duplicados: acadêmico + banda e dois
  cursos acadêmicos.
- Contraprova em que um dos dois contratos acadêmicos muda para `false`; a pessoa
  deve sair como `nao_assinado`, provando que os contratos não foram duplicados.
- Comparação de todas as pessoas nas três unidades antes da migration: somente os
  dois falsos `nao_verificado` podem mudar.
- Após publicação: RPC deve devolver `assinado`, `contrato_dado_fresco=true` e zero
  contratos não verificados para os dois casos; grants e definição de segurança
  devem permanecer iguais.

### Resultado em produção — 06/09/2026

- Ana Luiza Marques Paiva: 2 relevantes, 2 assinadas, 0 não verificadas,
  `assinado`, `contrato_dado_fresco=true`.
- Davi Lima Queiroz: 1 acadêmica relevante, 1 assinada, 0 não verificadas,
  `assinado`, `contrato_dado_fresco=true`; a Garage Band permanece dispensada.
- Varredura das 146 pessoas com mais de um ID local ativo: zero
  `nao_verificado` nas três unidades.
- A simulação integral anterior à publicação mostrou somente essas duas mudanças
  de estado; nenhum contrato foi reaproveitado para outra matrícula.
