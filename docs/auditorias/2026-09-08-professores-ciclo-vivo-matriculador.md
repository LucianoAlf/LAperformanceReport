# Auditoria — professores: ciclo vivo, Matriculador e Cadastro leve

Data da execução: 08/09/2026 (BRT).

## Decisão implementada

- **Matriculador** passou a usar `operacional.matriculas_comerciais`, calculado por `matriculas_comerciais_v1` e atribuído ao professor da experimental. A métrica de conversão permanece separada: taxa, numerador e amostra não foram alterados.
- **Ciclo aberto** recebe snapshots diários de acompanhamento. Ele não é ranking oficial enquanto não fechar: `estado_publicacao = ciclo_em_acompanhamento` e `ranking_habilitado = false`.
- A aba **Cadastro** não abre mais a cadeia ampla de KPI de performance. Ela lê apenas carteira e turmas pela RPC `get_kpis_professores_cadastro_canonicos_v1`.
- A apresentação deixa de chamar indisponibilidade de dado de “Dados em auditoria”. A ausência de retrato recebe motivo semântico; evidência canônica existente continua visível.

## Contraprova nominal — Valdo Delfino, Campo Grande, Jun–Ago/2026

Os seis registros comerciais atribuídos a Valdo na fonte canônica são:

| Data | Aluno | Curso |
| --- | --- | --- |
| 12/06 | Diogo Gomes Santos Caffonso de Moraes | Violão |
| 13/06 | Sabrina Maria Gomes Santos | Violão |
| 15/07 | Pérola Teixeira da Cruz | Violão |
| 15/07 | Renato Borges da Silva | Guitarra |
| 18/07 | Lucas Andrade de Castro | Guitarra |
| 29/08 | Bruno Correa Bastos | Violão |

Leitura pós-migration do contrato `get_relatorio_coordenacao_canonico_v3`:

| Professor | Matrículas comerciais | Numerador de conversão | Taxa de conversão |
| --- | ---: | ---: | ---: |
| Valdo Delfino | 6 | 1 | 33,33% |
| Caio Tenório de Araújo | 3 | 1 | 50,00% |

Isso preserva a diferença de negócio: Matriculador ordena pelo volume comercial, não por uma taxa que favorece amostras pequenas.

## Carga inicial do ciclo Set–Nov/2026

Os quatro escopos foram materializados em produção em 08/09/2026, sem professor incompleto ou configuração inconsistente:

| Escopo | Início BRT | Snapshots criados |
| --- | --- | ---: |
| Barra | 20:35:30 | 20 |
| Campo Grande | 20:35:46 | 32 |
| Recreio | 20:35:57 | 24 |
| Consolidado | 20:36:07 | 44 |

Os jobs diários ativos são escalonados em UTC: Campo Grande 06:50, Barra 06:55, Recreio 07:00 e consolidado 07:05. Todos gravam o ciclo `2026-SET-NOV` como acompanhamento, sem habilitar ranking oficial.

## Timeout do Cadastro

A causa não era falta de dado: a página chamava uma RPC de performance ampla para mostrar somente carteira e turmas. A nova leitura única mantém o mesmo contrato de acesso e usa `get_carteira_professor_periodo_canonica` uma vez. Em produção, a leitura do Recreio retornou 24 professores em aproximadamente 213 ms, abaixo do teto que antes causava `57014`.

## Verificações

- Regressões unitárias e PostgreSQL novas passaram.
- Suíte completa: 520 testes aprovados, 0 falhas; pós-teste: 14 aprovados, 0 falhas.
- `deno check` das duas Edge Functions passou.
- Build de produção passou.
- `git diff --check` passou.
- Edge Functions publicadas: `gemini-relatorio-coordenacao` versão 90 e `gemini-ranking-professores` versão 57, preservando suas configurações de autenticação existentes.

Não houve escrita no Emusys, alteração de pesos/fórmula do Health Score, nem reescrita de ciclo fechado.
