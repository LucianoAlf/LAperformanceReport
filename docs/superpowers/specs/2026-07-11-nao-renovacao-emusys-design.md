# Nao renovacao Emusys - desenho aprovado

## Objetivo

Espelhar uma nao renovacao no LA Report sem depender de um webhook especifico do Emusys, mantendo separadas as saidas por cancelamento e por fim de contrato sem renovacao.

## Regra canonica aprovada

Uma matricula deve virar `nao_renovacao` automaticamente somente quando todas as condicoes abaixo forem verdadeiras:

1. existe uma movimentacao `renovacao` pendente para a mesma unidade, aluno e matricula Emusys;
2. o `GET /matriculas` do Emusys devolve essa matricula com status `finalizada`;
3. a renovacao ainda nao foi convertida em `nao_renovacao`.

Se a equipe ja registrou uma `nao_renovacao` manual para o mesmo aluno e competencia, o registro humano e preservado e enriquecido com o ID da matricula Emusys. A renovacao pendente supersedida e removida, sem duplicar a saida.

Uma matricula `finalizada` sem renovacao pendente nao sera classificada automaticamente como nao renovacao. Ela permanece no fluxo de finalizacao/cancelamento ou na fila de conciliacao.

## Operacao atomica

Uma RPC do banco sera a unica operacao de conversao. Ela:

- bloqueia a movimentacao pendente durante a decisao;
- valida unidade, aluno, tipo e status pendente;
- converte a movimentacao existente para `nao_renovacao` sem criar duplicata ou preserva o registro manual ja existente;
- preserva a competencia da renovacao;
- preenche motivo, observacao e origem da decisao;
- atualiza o aluno para `inativo`, com `data_saida`;
- encerra a divergencia de status correspondente quando a origem for o sync.

## Consumidores

- A pagina Administrativa oferece `Nao renovou` na renovacao pendente e reutiliza o formulario de nao renovacao para capturar motivo e observacoes.
- `sync-matriculas-emusys` chama a mesma RPC quando encontrar a combinacao aprovada.
- Relatorios continuam consumindo `movimentacoes_admin`, que ja e a fonte canonica de renovacao e nao renovacao.

## Protecoes

- Nenhuma tabela nova de negocio.
- Nenhuma finalizacao generica e convertida sem renovacao pendente.
- A operacao e idempotente.
- Falhas na conversao automatica entram no resumo/log do sync e nao interrompem a reconciliacao das demais matriculas.

## Verificacao

- Teste unitario da decisao automatica.
- Teste de contrato da migration/RPC.
- Teste de contrato da UI para a acao `Nao renovou`.
- Smoke transacional com `BEGIN`/`ROLLBACK` no banco remoto.
- Build e checagem Deno das Edge Functions alteradas.
