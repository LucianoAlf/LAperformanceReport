# Renovacoes Pendentes e Antecipadas no Lancamento Rapido

Data: 2026-06-13

## Objetivo

Permitir que a equipe registre manualmente renovacoes pendentes e renovacoes antecipadas quando elas nao chegarem automaticamente pelo Emusys, sem criar fonte paralela e sem contaminar relatorios do mes.

## Fonte Canonica

A fonte permanece `movimentacoes_admin`.

Campos usados:

- `tipo = 'renovacao'`
- `renovacao_status`
- `renovacao_antecipada`
- `competencia_referencia`
- `renovacao_primeira_aula_novo_ciclo`

Nao foi proposta tabela nova para esta etapa.

## Modos de Lancamento

### Renovacao

- Salva como `renovacao_status = 'confirmada'`.
- Conta como renovacao realizada na competencia selecionada.
- Cai na aba `Renovacoes`.

### Renovacao Pendente

- Salva como `renovacao_status = 'pendente_validacao'`.
- Nao conta como realizada ate validacao operacional.
- Cai na aba `Renovacoes pendentes`.

### Renovacao Antecipada

- Salva como `renovacao_status = 'antecipada_pendente'`.
- Salva `renovacao_antecipada = true`.
- Exige primeira aula do novo ciclo.
- Define `competencia_referencia` pelo mes da primeira aula.
- Nao conta no relatorio do mes de captura.
- Cai na aba `Renovacoes antecipadas`.

## Relatorios

Os relatorios seguem a regra ja validada:

- Renovacao pendente nao entra como realizada.
- Renovacao antecipada nao entra no mes de captura.
- Renovacao antecipada entra apenas na competencia efetiva.
- Renovacao confirmada entra como realizada.

## Protecao Contra Duplicidade

Antes de criar uma renovacao manual nova, o frontend consulta se ja existe renovacao para:

- mesmo aluno;
- mesma unidade;
- mesma competencia;
- mesmo curso, quando o curso estiver informado.

Se existir, o usuario deve editar o registro existente em vez de criar outro.

## Escopo Negativo

Esta etapa nao deve:

- criar tabela nova;
- alterar `dados_mensais`;
- recalcular historico;
- aplicar backfill;
- mudar regra de relatorio;
- sobrescrever eventos vindos do Emusys.

