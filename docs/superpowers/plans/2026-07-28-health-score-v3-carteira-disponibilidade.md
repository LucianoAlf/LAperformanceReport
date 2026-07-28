# Plano - Health Score V3 com carteira proporcional a disponibilidade

**Referencia:** `docs/superpowers/specs/2026-07-28-health-score-v3-carteira-disponibilidade-design.md`

## Task 1 - Congelar contrato em testes

- Criar testes para politica versionada, P50/P75 e vigencia Jun-Ago.
- Testar calculo deterministico de horas e hash.
- Testar maturacao, disponibilidade ausente e carteira zero.
- Testar que meta por curso nao compoe a meta total.
- Testar que atribuicoes nao pontuaveis nao bloqueiam os agregadores.
- Confirmar que nenhum consumidor e alterado.

## Task 2 - Criar politica e funcoes canonicas

- Criar tabela privada e versionada de politica da carteira por disponibilidade.
- Inserir as tres taxas aprovadas.
- Criar funcao deterministica para normalizar disponibilidade e calcular horas.
- Criar funcao versionada da metrica total de carteira.
- Restringir grants a papeis internos necessarios.

## Task 3 - Corrigir materializador V3

- Usar a metrica total de carteira no pilar `numero_alunos`.
- Manter linhas por curso como diagnostico.
- Manter `media_turma` segmentada sem mudanca de formula.
- Filtrar estados bloqueantes apenas entre atribuicoes pontuaveis.
- Persistir parametros, hash e estado no detalhe do snapshot.
- Preservar o encadeamento append-only das revisoes.

## Task 4 - Aplicar e rematerializar julho

- Aplicar a migration no projeto LA Report.
- Materializar julho/2026 nas tres unidades.
- Nao alterar snapshots fechados.
- Nao trocar fonte de consumidores.

## Task 5 - Gerar entregaveis

- Comparativo V4 anterior x nova simulacao.
- Parciais, cobertura media, distribuicao e delta por professor.
- Folha de conferencia por unidade.
- Lista de vinculos sem disponibilidade.
- Comparativo nominal de Isaque, Erick, Peterson e Gabriel Antony.

## Task 6 - Verificar

- Rodar testes focados da V3.
- Rodar suite completa e build.
- Conferir schema, grants e advisors relevantes.
- Conferir que views/RPCs consumidoras nao mudaram.
- Registrar paths e resultado no relatorio de execucao.

## Gate final

Parar apos os relatorios. A rematerializacao posterior a revisao da coordenacao
e o cutover de telas dependem de nova autorizacao.
