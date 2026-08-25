# Bandas — calendário mensal de eventos

**Status:** aprovado pelo usuário em 2026-08-25.

## Objetivo

Adicionar à aba Eventos de Bandas uma visão mensal operacional, aberta por
padrão, sem remover nem alterar o comportamento da lista existente. O calendário
deve manter a linguagem visual do calendário de Projetos, mas continuar isolado
das consultas, entidades e modais desse outro domínio.

## Composição visual

A barra da aba mantém o botão `Novo evento` e recebe um toggle
`Lista / Calendário` no mesmo padrão compacto de cards/tabela já usado em
Bandas. A preferência fica salva em `localStorage`; na primeira visita, a visão
inicial é `Calendário`.

Na visão mensal, a composição segue Projetos:

- grade do mês à esquerda e painel do dia à direita em telas largas;
- botões de mês anterior, próximo e `Hoje`, com o mês centralizado;
- cabeçalho de domingo a sábado;
- dias adjacentes ao mês atual presentes e visualmente esmaecidos;
- dia de hoje destacado com o token primário do módulo;
- legenda de ensaio, show, realizado e cancelado;
- painel lateral com a data selecionada e todos os seus eventos;
- empilhamento vertical e rolagem horizontal da grade em telas estreitas.

O calendário de Projetos não será refatorado nesta entrega. O reaproveitamento é
da linguagem visual e dos padrões de interação; o componente atual de Projetos
permanece intocado porque está acoplado a `useProjetos`, `projeto_tarefas` e
`ModalDetalhesProjeto`.

## Dados e filtros

`EventosTab` passa a chamar `useBandaEventos(unidadeAtual, null)` uma única vez.
Assim, a mesma coleção alimenta lista e calendário, respeitando o filtro global
de unidade e permitindo navegar por meses passados.

O switch `Mostrar eventos passados` continua exclusivo da lista. Quando está
desligado, a lista filtra localmente eventos anteriores ao instante em que a aba
foi aberta; quando está ligado, exibe a coleção inteira. O switch não aparece na
visão calendário. Não serão adicionados filtros de banda ou tipo, pois eles não
existem atualmente na aba.

Os eventos serão agrupados pelo dia local de `data_inicio`, após o parse do
`timestamptz`. A construção da grade, navegação e formatação usarão `date-fns` e
`ptBR`; nenhuma biblioteca de calendário será adicionada.

## Eventos e estados

Cada evento aparece no dia de `data_inicio` como chip clicável, com hora e
título. Ensaio e show usam tratamentos semânticos distintos. O estado também é
perceptível: realizado recebe confirmação visual e cancelado fica esmaecido e
riscado. O painel do dia explicita tipo e status com os `Badge` variants já
existentes.

Até três chips ficam visíveis por célula. Havendo mais, o botão `+N` seleciona o
dia e mostra todos os eventos no painel lateral. O painel inicia no dia atual e
também pode ser atualizado pelo botão do número de cada dia.

## Interações

- Clique no espaço vazio de uma célula abre `ModalEventoBanda` em modo criação
  com a data daquela célula preenchida.
- Clique no número do dia apenas seleciona o dia no painel lateral.
- Clique em chip, tanto na grade quanto no painel, abre o evento no modal atual.
- Os chips e o botão `+N` interrompem a propagação para não abrirem uma criação.
- O botão `Novo evento` continua abrindo o modal sem data pré-selecionada.
- As ações atuais de editar, cancelar e excluir permanecem na lista. No
  calendário, o painel do dia reaproveita os mesmos callbacks e confirmações:
  eventos agendados oferecem editar, cancelar e excluir sem criar novos RPCs ou
  um segundo fluxo de persistência.

`ModalEventoBanda` recebe uma propriedade opcional `dataInicial`. Em criação,
ela inicializa somente a data; em edição, `evento.data_inicio` sempre prevalece.
Fechar e reabrir o modal reinicializa o formulário para impedir que uma data de
um clique anterior vaze para `Novo evento`.

## Estados de tela e acessibilidade

O loading continua centralizado. Na lista, o estado vazio atual permanece. No
calendário, a grade continua visível mesmo sem eventos para permitir agendamento
por clique.

Toggle, navegação, números dos dias, chips e `+N` são botões com rótulos
acessíveis, foco visível e títulos úteis. As células não dependem somente de cor:
tipo e status também aparecem como texto, ícone ou decoração. Eventos cancelados
continuam legíveis apesar da redução de ênfase.

## Limites

- Nenhum RPC, migration, tabela ou política de backend será alterado.
- Nenhuma dependência será adicionada.
- Somente a visão Mês será implementada.
- O calendário de Projetos não será modificado.
- Não haverá merge, push ou deploy automático nesta entrega.

## Verificação

O ciclo TDD cobre a grade mensal, agrupamento local dos eventos, limite de chips,
visão inicial, separação entre lista e calendário e preseleção da data no modal.
Depois do teste focado, serão executados `npm test`, `npm run build`,
`git diff --check` e uma validação em navegador autenticado ou local, incluindo
toggle, navegação, criação por dia, edição por chip e console sem erros.
