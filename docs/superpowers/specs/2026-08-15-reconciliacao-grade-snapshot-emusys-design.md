# Reconciliação completa da grade Emusys — design

## Decisão aprovada

Prevenir o reaparecimento de aulas e vínculos antigos na Agenda usando uma
fotografia completa do `GET /aulas` do Emusys. A correção é global para as três
unidades; o primeiro reparo de dados é somente Campo Grande, depois de uma
prévia atualizada e aprovada.

## Problema confirmado

O espelho local recebe e atualiza aulas que o Emusys devolve, mas não consegue
convergir quando uma aula some completamente da fotografia. A rotina futura
também excluía a data corrente do soft-cancelamento. Assim, uma troca de grade
no próprio dia podia deixar `aulas_emusys` e `aula_alunos_emusys` ativos mesmo
depois de a grade ter desaparecido do Emusys.

Há dois grãos diferentes e eles não podem ser misturados:

- aula: `aulas_emusys`, identificada por `unidade_id + emusys_id`;
- participante da aula: `aula_alunos_emusys`, identificado pela aula e pela
  chave externa do participante.

Uma mudança de participante remove somente o vínculo. Uma aula ausente da
fotografia completa pode ser cancelada logicamente, nunca apagada. Presença,
justificativa e retificação não são reescritas por esta reconciliação.

## Fontes e invariantes

- A fonte da Agenda é `aulas_emusys` + `aula_alunos_emusys`; a jornada
  contratual explica a matrícula, mas não recria um card de agenda.
- A identidade externa só é válida junto com `unidade_id`.
- O `GET /aulas` deve ser paginado integralmente. Uma resposta parcial, vazia
  ou inválida não autoriza nenhuma remoção ou cancelamento.
- Turmas podem vir repetidas por participante. A fotografia é agrupada por
  `emusys_id` e reúne todas as chaves de participantes antes de comparar.
- `aluno_presenca` humano é uma trava: fontes `agenda_secretaria`,
  `professor_la_teacher`, `fabio_audio` e `manual` impedem alteração automática
  daquele participante ou daquela aula.
- `ausente` bruto do Emusys não vira falta nem fecha chamada. Uma pendência real
  permanece pendente até haver decisão terminal válida.

## Desenho

### Fotografia compartilhada

Um helper puro em `_shared` transforma a resposta completa do Emusys em uma
lista estável de aulas:

```ts
type AulaSnapshotGrade = {
  emusys_id: number;
  aluno_chaves: string[];
};
```

Ele usa a mesma regra de `criarAlunoChave` já utilizada pelos dois syncs e une
as linhas repetidas de turma. A lista é ordenada, sem duplicatas, para tornar
o resultado idempotente e testável.

### Decisão transacional no banco

Uma nova RPC privada recebe `unidade`, janela, fotografia completa e
`p_dry_run`.

Para cada aula normal ativa de hoje em diante na janela, ela classifica:

1. `cancelar_aula_ausente`: a aula local não existe na fotografia completa e
   não há evidência humana. A escrita é `cancelada=true` com origem
   `sync_ausente_emusys`; roster e presenças permanecem como histórico.
2. `remover_vinculo_ausente`: a aula existe, mas aquele participante não
   aparece no roster devolvido e não há evidência humana dele. Somente a linha
   de `aula_alunos_emusys` é removida.
3. `preservar_marcacao_humana` ou `preservar_identidade_ambigua`: não escreve;
   devolve o motivo na prévia e, no modo aplicado, registra a decisão no log.

O modo padrão é prévia. O modo aplicado só roda com fotografia íntegra e não
faz `DELETE` de aula, de presença, de justificativa ou de retificação.

### Pontos de execução

- `sync-grade-futura-emusys`: após buscar a fotografia completa, chama a RPC
  para hoje e a janela futura; a antiga comparação direta deixa de conter a
  regra de decisão.
- `sync-presenca-emusys` no modo `metadados`: após upsert de aulas e roster,
  chama a mesma RPC para a data corrente e futuras. Como esse modo roda a cada
  15 minutos, mudanças de professor/horário sem webhook convergem no mesmo dia.
- `reconciliar-grade-aluno` v2 continua responsável por webhooks de matrícula:
  ele remove somente o vínculo individual e mantém a janela de ontem para
  absorver webhook atrasado. Não volta a cancelar a aula de colegas.

`alunos.professor_atual_id`, dia e horário são um cache operacional com revisão
humana. Esta entrega não os sobrescreve automaticamente nem os usa como fonte
da Agenda; a prévia expõe qualquer divergência futura para tratamento no fluxo
de revisão existente.

## Segurança e compatibilidade

A nova RPC é interna: `SECURITY DEFINER`, `search_path` fixo, sem execução para
`PUBLIC` ou `anon`, e liberada apenas a `service_role` e ao papel já necessário
para os consumidores internos. Não há nova rota de navegador, nem token Emusys
exposto ao cliente.

O payload é somente de IDs e chaves técnicas; nomes, telefone e o objeto bruto
do Emusys não entram no retorno operacional ou no log.

## Casos de aceitação

- Matheus não tem aula de sábado na fotografia: cards locais de sábado deixam
  de ser ativos; as linhas históricas não são apagadas.
- Gustavo permanece apenas na grade atual; o vínculo antigo com Matheus some.
- Luiz mantém a presença humana na aula atual com Valdo; o card antigo não
  permanece como segunda chamada.
- Moisés continua como uma pendência única real enquanto não houver decisão
  humana.
- Uma aula retornada sem aluno remove somente vínculo sem marcação humana.
- Falha de página, cursor inválido ou fotografia vazia retorna abortado e não
  muda a base.
- Repetir a mesma fotografia não produz nova alteração.

## Fora de escopo

Não há limpeza de passado anterior à janela segura, reclassificação automática
de presença, exclusão física de histórico nem sobrescrita de decisão humana.
