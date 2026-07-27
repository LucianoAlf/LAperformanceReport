# Health Score V3 - Revisao Segmentada do Ciclo Jun-Ago

**Data:** 2026-07-27  
**Status:** aprovado para planejamento tecnico  
**Autoridade da decisao:** Alf  
**Escopo:** lifecycle da configuracao V3 e vigencia das metas segmentadas

## 1. Decisao

As metas de `media_turma` e `numero_alunos`, segmentadas por
`unidade + curso + modalidade`, devem valer no ciclo:

- inicio: `2026-06-01`;
- fim: `2026-08-31`.

A mudanca deve nascer como uma nova revisao da configuracao. Nenhuma configuracao
anterior pode ser sobrescrita ou apagada.

## 2. Motivo

O recalculo das tres unidades nao pode ocorrer com as metas globais antigas nem
com `regra_ausente` nos pilares segmentados. Sem a revisao, `media_turma` e
`numero_alunos` deixam ate 25% do peso fora do score, tornando a comparacao
incompleta.

## 3. Ordem obrigatoria

1. Inventariar as configuracoes e snapshots existentes.
2. Criar uma nova revisao em `rascunho`, clonando pesos, metas globais e a matriz
   segmentada aprovada.
3. Fixar a vigencia da nova revisao em `2026-06-01` a `2026-08-31`.
4. Inventariar e resolver toda atribuicao formal pontuavel sem meta, nas tres
   unidades, depois de excluir os cursos nao pedagogicos.
5. Simular a revisao contra o ciclo aberto.
6. Validar que nao ha regra obrigatoria ausente, atribuicao pontuavel sem meta
   ou combinacao observada marcada como nao ofertada.
7. Ativar a nova revisao por uma operacao governada de substituicao do ciclo
   aberto.
8. Somente depois recalcular as tres unidades.

## 4. Preservacao historica

A substituicao retroativa deve:

- manter todas as linhas anteriores de configuracao;
- manter seus pesos, metas, matriz segmentada, justificativa, autor e carimbos;
- registrar qual revisao substituiu qual configuracao e por qual motivo;
- arquivar apenas a vigencia anterior que conflita com `Jun-Ago`;
- nao alterar a configuracao futura que comeca em `2026-09-01`;
- nao apagar, atualizar ou reutilizar snapshots fechados;
- nao modificar snapshots provisorios antes da etapa explicita de recalculo.

Se existir snapshot fechado entre junho e agosto, a ativacao deve parar e
reportar o conflito. Uma revisao fechada exige retificacao propria; nao pode ser
reescrita silenciosamente.

## 5. Lifecycle

O fluxo continua sendo:

`rascunho -> simulacao -> ativacao separada`

A configuracao ativa permanece imutavel para edicao comum. A operacao
retroativa e uma excecao governada, restrita a usuario com
`professores.editar`, protegida por lock transacional, justificativa obrigatoria
e trilha append-only.

A RPC atual de ativacao nao atende esse caso porque exige que a nova vigencia
comece depois de todas as versoes ativas. A implementacao deve criar uma
operacao especifica para substituir um ciclo ainda aberto, sem afrouxar o fluxo
normal.

## 6. Fontes das metas

A nova revisao deve clonar a matriz segmentada persistida e aprovada na
configuracao de origem. IDs de configuracao nao devem ser codificados no SQL:
a operacao recebe a origem explicitamente e valida que ela possui as seis
metricas e a matriz segmentada completa.

`Aula Experimental` (`curso_id = 45`) e um evento comercial, nao um curso da
carteira pedagogica. Ela deve ser classificada dessa forma no catalogo canonico
de cursos e ficar fora de:

- carteira pedagogica do professor;
- numero de alunos;
- media de alunos por turma;
- matriz de metas segmentadas da nova revisao.

A linha existente na configuracao V3 historica deve permanecer intacta para
auditoria, mas nao pode ser clonada para a revisao `Jun-Ago`. A exclusao nao
pode depender apenas da clonagem: o catalogo, as atribuicoes pontuaveis e as
RPCs de calculo devem consultar a mesma classificacao canonica.

Para `media_turma` e `numero_alunos`:

- `meta` global permanece `null`;
- `parametros.normalizacao` permanece
  `segmentada_unidade_curso_modalidade`;
- a nota vem exclusivamente da meta do segmento aplicavel;
- `regra_ausente` nunca recebe fallback global.

## 7. Gates

A ativacao da revisao `Jun-Ago` deve falhar quando houver:

- snapshot fechado no intervalo;
- peso total diferente de 100;
- menos ou mais de seis pilares;
- matriz segmentada ausente;
- atribuicao formal pontuavel sem meta;
- combinacao observada marcada como `nao_ofertada`;
- meta de media por turma maior que a capacidade maxima;
- simulacao ausente, vencida ou anterior a ultima alteracao;
- sobreposicao ativa nao declarada como substituida.

## 8. Auditoria esperada

Depois da ativacao, uma consulta deve demonstrar:

- nova revisao ativa de `2026-06-01` a `2026-08-31`;
- configuracao anterior preservada e marcada como substituida;
- configuracao de `2026-09-01` em diante intacta;
- matriz segmentada da nova revisao completa;
- zero alteracoes em snapshots fechados;
- junho, julho e agosto resolvendo a nova revisao;
- setembro resolvendo a configuracao futura.

## 9. Relacao com o recalculo

Esta revisao e pre-condicao do recalculo de retencao e do Health Score nas tres
unidades. O resultado a ser apresentado ao Alf deve usar a mesma configuracao
segmentada para todos os professores no ciclo `Jun-Ago`.

Nenhum consumidor visual deve trocar de fonte antes da comparacao dos
resultados, com destaque para Isaque, Erick, Peterson e Gabriel Antony.
