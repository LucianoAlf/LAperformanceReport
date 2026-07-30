# Execucao - ciclo de matriculas Emusys v1.3.1

Data: 2026-07-30

## Veredito

Implantacao concluida e validada para a base operacional viva.

A origem Emusys agora e materializada por unidade e matricula, e a camada
semantica resolve explicitamente:

| Estado Emusys | Estado operacional | Base viva | Movimento |
|---|---|---:|---|
| `ativa` | ativo | sim | nenhum |
| `trancada` | trancado | nao | trancamento, somente com data real |
| `inativa` + `interrompida` | inativo | nao | evasao/interrupcao |
| `inativa` + `concluida` | inativo | nao | conclusao/nao renovacao |
| desconhecido ou ambiguo | auditoria | nao | nenhum automatico |

IDs Emusys permanecem escopados por `unidade_id`. Nenhuma data historica e
inventada a partir do GET atual.

## Carga sincronizada

Foram materializadas 4.813 matriculas:

| Unidade | Ativas | Trancadas | Interrompidas | Concluidas | Total |
|---|---:|---:|---:|---:|---:|
| Barra | 263 | 6 | 476 | 69 | 814 |
| Campo Grande | 495 | 18 | 1.809 | 193 | 2.515 |
| Recreio | 429 | 2 | 915 | 138 | 1.484 |
| **Total** | **1.187** | **26** | **3.200** | **400** | **4.813** |

O materializador terminou sem rejeicoes e sem estado ambiguo.

## Numeros operacionais atuais

Validacao visual autenticada em Dashboard, Analytics, Administrativo, Alunos e
Carteira de Professores:

- 1.007 pessoas ativas;
- 965 pagantes;
- 1.177 matriculas ativas;
- 25 pessoas trancadas atualmente;
- 43 professores com carteira pedagogica;
- 1.184 relacoes canonicas pessoa-professor;
- MRR da carteira: R$ 415.997,62.

Os graos sao intencionalmente diferentes:

- 1.187 e o total bruto de matriculas `ativa` no payload atual;
- 1.177 e o total operacional de matriculas depois da resolucao/deduplicacao;
- 1.007 e o total de pessoas canonicas ativas;
- 1.184 e o total de relacoes pessoa-professor da carteira pedagogica;
- trancamentos atuais podem ter mais linhas de matricula do que pessoas.

## Consumidores alinhados

- Dashboard e Analytics usam a RPC canonica de KPIs de alunos.
- Administrativo separa ativos atuais, trancados atuais e movimentos no periodo.
- Alunos usa as RPCs canonicas de populacao viva e trancamento.
- Sucesso do Aluno, fidelizacao e churn atual filtram somente a base ativa.
- Presenca e marcos de jornada buscam alunos ativos pela RPC canonica.
- Carteira de Professores usa a carteira pedagogica canonica por pessoa; a RPC
  financeira de enriquecimento tambem passou a filtrar o estado operacional.
- Relatorio administrativo e agente de BI recebem a mesma semantica.
- Fabio e LA Teacher continuam ancorados na jornada ativa, sem troca de contrato.

## Banco e desempenho

Migrations finais desta rodada:

- `20260730131000_otimiza_estado_operacional_v131.sql`
- `20260730132000_carteira_professores_estado_operacional_v131.sql`
- `20260730133000_hardening_carteira_professores_v131.sql`

O join do estado atual deixou de converter a coluna indexada. O Dashboard, que
antes atingia timeout `57014`, respondeu HTTP 200 em aproximadamente 1,35 s.
A carteira financeira respondeu HTTP 200 no navegador depois do cutover.

O acesso anonimo a `get_carteira_professores(uuid)` foi removido;
`authenticated` e `service_role` foram preservados. O `search_path` da funcao
foi fixado. O advisor de seguranca nao aponta alerta nos objetos desta entrega.

Os avisos de indices sem uso sao informativos e esperados logo apos a criacao;
os indices foram mantidos para os fallbacks de identidade.

## Protecoes preservadas

- snapshots mensais e snapshots do Health Score fechados nao foram reescritos;
- `aulas_emusys.anotacoes_fabio` nao foi tocada;
- estado desconhecido nunca cai silenciosamente para ativo;
- conclusao nao vira evasao;
- trancamento nao entra em denominador operacional vivo;
- helpers usados por frontend, CHECK, trigger ou default mantiveram os grants
  necessarios.

## Verificacao

- 50/50 testes focados do ciclo de matricula;
- 25/25 testes de regressao de aluno, LA Teacher, Fabio, carteira, comercial e
  relatorio gerencial;
- 620/620 testes da suite ampla do repositorio;
- 20/20 testes Deno dos resolvedores de ciclo e jornada;
- build Vite concluido;
- Dashboard, Analytics, Administrativo, Alunos e Carteira sem erro de console;
- relatorio administrativo mensal gerado em preview com os mesmos KPIs.

O build preserva avisos preexistentes de chunks grandes e imports circulares do
Recharts. Eles nao foram introduzidos por esta entrega e nao alteraram o
resultado dos testes.

## Rollback

O rollback funcional e por consumidor:

1. restaurar a definicao anterior da RPC afetada;
2. manter a tabela bruta e a view semantica para auditoria;
3. nao apagar carga historica;
4. nao reabrir snapshots fechados.

As mudancas sao aditivas e o payload bruto foi preservado para reprocessamento.
