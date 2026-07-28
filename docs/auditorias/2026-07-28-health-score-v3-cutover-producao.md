# Cutover de producao - Health Score Professor V3

**Data:** 28/07/2026
**Projeto:** `ouqwbbermlzqqvtqwlul`
**Competencia materializada:** julho/2026, periodicidade mensal
**Estado:** parcial em producao; ranking e premiacao bloqueados

## Linha de corte executada

1. Conversao restaurada para o ciclo de tres meses e mantida como
   `provisorio_ciclo`, visivel e fora da nota.
2. Cobertura minima da presenca alterada de 95% para 90% por regra versionada.
3. Materializacao de rede passou a produzir unidades e consolidado na mesma
   transacao.
4. Julho foi rematerializado nas tres unidades e no consolidado no mesmo lote.
5. Performance, modal e consumidores derivados passaram a ler exclusivamente
   a revisao governada do snapshot, sem recomputar pesos por views paralelas.

## Resultado governado

Todos os recortes abaixo pertencem ao lote criado em
`2026-07-28 22:34:32.170061+00`.

| Escopo | Professores | Scores exibiveis | Score medio | Cobertura media | Conversao pontuando | Ranking |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 20 | 15 | 78,84 | 62,25% | 0 | 0 |
| Campo Grande | 35 | 20 | 88,06 | 54,57% | 0 | 0 |
| Recreio | 28 | 18 | 81,21 | 58,39% | 0 | 0 |
| Consolidado | 50 | 33 | 84,24 | 62,60% | 0 | 0 |

As contagens acima foram reproduzidas pela RPC consumida pela tela,
`get_health_score_professor_v3_performance`, depois do cutover. Elas coincidem
com os snapshots governados.

## Casos de controle - Barra

| Professor | Score | Cobertura | Estado | Conversao |
|---|---:|---:|---|---|
| Isaque | 83,30 | 85% | parcial | fora da nota |
| Erick | Sem base | 25% | sem_base | fora da nota |
| Peterson | 96,44 | 85% | parcial | fora da nota |
| Gabriel Antony | 80,17 | 85% | parcial | fora da nota |

O modal devolveu seis metricas para cada caso, sem ranking habilitado e sem
converter ausencia de base em zero.

## Consumidores

| Consumidor | Contrato apos cutover | Rollback independente |
|---|---|---|
| Performance | `get_health_score_professor_v3_performance` governada | Desligar `VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED` |
| Modal individual | `get_health_score_professor_v3_snapshot_modal` governada | Desligar `VITE_HEALTH_SCORE_V3_MODAL_ENABLED` |
| Carteira | Mesma RPC governada de Performance | Ocultar campos V3 da Carteira |
| Dashboard e Analytics | Mesmo hook e coorte ativa de Performance | Ocultar resumo V3 |
| Relatorio individual | Payload do modal governado | Retirar bloco V3 do payload |
| Relatorio da coordenacao | Payload da Performance governada | Retirar bloco V3 do payload |
| Relatorio instantaneo | Performance governada; ranking falha fechado | Manter ranking indisponivel |
| Edge Functions de IA | Recebem payload ja governado do frontend | Retirar bloco V3 do payload |
| Fabio / LA Teacher | RPC pedagogica service-only | Permanecer sem consumo ate integracao externa |

## Garantias

- `sem_base`, cobertura insuficiente e metrica provisoria nao pontuam.
- Conversao do ciclo continua visivel, mas seu peso permanece indisponivel.
- Ranking e premiacao continuam desativados em todos os recortes parciais.
- Consolidado nao reutiliza revisao antiga de unidade.
- O frontend autenticado conserva acesso somente as RPCs de tela.
- `public` e `anon` nao executam as RPCs V3.
- Antes do hardening, as funcoes foram verificadas contra dependencias em
  `CHECK`, triggers e defaults.
- Nenhum snapshot fechado ou dado bruto foi reescrito.

## Migrations do corte

| Arquivo local | Versao registrada no remoto |
|---|---|
| `20260728223000_health_score_v3_cutover_rede_presenca90.sql` | `20260728221041` |
| `20260728224000_health_score_v3_cache_disponibilidade_materializacao.sql` | `20260728223354` |
| `20260728225000_health_score_v3_consumidores_snapshot_governado.sql` | `20260728224705` |

## Verificacao final

- suite V3: `285/285` testes aprovados;
- build Vite de producao concluido sem erro;
- paridade entre RPC de Performance e snapshot governado: zero divergencias
  nas 798 linhas comparadas entre Barra, Campo Grande, Recreio e consolidado;
- tempo observado da RPC de Performance: `85,03 ms` para Barra, com 120 linhas,
  e `51,52 ms` para o consolidado, com 300 linhas;
- as RPCs de Performance e modal continuam executaveis por `authenticated`
  porque sao as portas de leitura da interface; `public` e `anon` permanecem
  revogados;
- o advisor de seguranca continua reportando avisos amplos preexistentes no
  projeto. O corte nao criou tabelas nem alterou RLS e manteve as tabelas
  internas V3 inacessiveis diretamente ao frontend.

A validacao visual automatizada nao foi concluida porque a conexao com o Chrome
ficou indisponivel durante o fechamento. O cutover nao mudou componentes
visuais: preservou os nomes e contratos das RPCs consumidas pelo frontend e
trocou somente a origem dos dados para os snapshots governados.

## Itens deliberadamente adiados

- sync pontual de presenca de 27/06;
- cinco conciliacoes humanas de experimental;
- calibragem comparativa das escalas dos seis pilares;
- ferramenta de chamada da ADM;
- liberacao de ranking e premiacao antes do fechamento oficial do ciclo.

Esses itens nao alteram os numeros de julho publicados pela V3 neste cutover.
