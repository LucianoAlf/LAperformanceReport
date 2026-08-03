# Relatorios da Coordenacao Canonicos — Design

## Objetivo

Fazer os cinco relatorios da Coordenacao consumirem um unico contrato por unidade e competencia, sem recalculo no navegador e sem misturar dados vivos com o fechamento mensal.

## Decisoes aprovadas

- O Health Score V3 mensal continua visivel como diagnostico mesmo quando o ciclo ainda nao habilita ranking ou premiacao.
- O termo parcial descreve somente a governanca do Health Score; nao bloqueia carteira, presenca, retencao, permanencia, turmas ou movimentacoes.
- Ranking oficial permanece fechado enquanto `ranking_habilitado` for falso. O relatorio deve, ainda assim, informar quantos scores diagnosticos existem e a media visivel.
- Julho/2026 e uma competencia fechada. Os cinco relatorios devem ler a mesma revisao imutavel.
- A aba Carteira dos Professores permanece inalterada. O novo produtor reutiliza as mesmas fontes canonicas por competencia.

## Arquitetura

### Produtor canonico V2

`montar_relatorio_coordenacao_payload_v2(unidade, ano, mes)` combina:

- o Health Score V3 governado de `get_relatorio_coordenacao_canonico_v1`;
- carteira e turmas de `get_kpis_professor_periodo_canonico_v3`;
- saidas validas e atribuiveis de `get_saidas_professor_periodo_agregadas_v1`;
- agenda e sinais pedagogicos ja presentes no contrato V1.

O produtor retorna `schema_version = 2`, identifica fontes e regras e separa:

- alunos acompanhados nas carteiras, por professor;
- turmas totais;
- ocupacoes e turmas elegiveis para a media;
- evasoes e nao renovacoes totais;
- saidas atribuiveis ao professor;
- MRR perdido total e MRR atribuivel.

### Snapshot mensal

O payload V2 usa `fechamento_mensal_snapshots`, dominio `relatorio_coordenacao`, hash canonico e auditoria existente. Uma competencia historica somente e publicada se houver snapshot fechado e com hash valido. O mes atual continua vivo e recebe `imutavel = false`.

Fechar o relatorio nao promove Health Score parcial a oficial. O payload preserva `estado_publicacao` e `ranking_habilitado` de cada professor.

### Consumidores

- Relatorio mensal com IA: a Edge chama V2. Todos os numeros continuam deterministicos; a IA escreve somente narrativa.
- Ranking, Carteira e Carga, Presenca e Alertas e Retencao e Evasoes: o modal chama diretamente V2 e renderiza localmente o mesmo payload fechado.
- O prop operacional da tela nao define mais os numeros dos quatro relatorios instantaneos.

## Semantica dos cinco relatorios

### Mensal com IA

Mostra todos os professores, score diagnostico e cobertura. Explica uma unica vez que ranking/premiacao dependem do ciclo oficial.

### Ranking

Durante ciclo nao oficial, informa scores diagnosticos visiveis e media, mas nao publica classificacao ordinal. Quando o contrato trouxer ranking oficial, usa exclusivamente essa lista.

### Carteira e Carga

Publica separadamente total acompanhado nas carteiras, turmas totais, ocupacoes elegiveis, turmas elegiveis e media elegivel. Nao apresenta a media como divisao entre grandezas de graos diferentes.

### Presenca e Alertas

Usa exclusivamente a evidencia de presenca gravada no snapshot da competencia. Nao recalcula julho com o estado vivo posterior.

### Retencao e Evasoes

Separa volume total e atribuivel. Se publicar MRR total, lista todas as saidas que o compoem. A taxa do Health Score e nomeada `retencao atribuivel observada`, sem ser confundida com evasoes totais da unidade.

## Seguranca e auditoria

- Leitura usa `fn_health_score_professor_v3_ator_leitura`.
- Captura/fechamento e restrita a `service_role`, `postgres` ou `supabase_admin`.
- Snapshot fechado nao e sobrescrito; retificacao exige nova versao.
- Nenhum payload inclui dados financeiros de aluno, parcelas ou dados sensiveis. O MRR de evasao permanece agregado por professor.

## Validacao

- Testes unitarios de todos os renderizadores.
- Teste PostgreSQL real para snapshot, hash, imutabilidade e separacao de movimentos.
- Reproducao de Recreio julho/2026: 24 professores, carteira 417, presenca 65,9%, 5 evasoes, 2 nao renovacoes, 1 saida atribuivel, MRR total R$ 2.412,85 e MRR atribuivel R$ 395,00.
- Build e Deno check da Edge.
- Smoke de producao nos cinco botoes.
