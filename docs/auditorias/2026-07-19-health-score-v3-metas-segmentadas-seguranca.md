# Health Score V3 - Seguranca e desempenho das metas segmentadas

Data da auditoria: 20/07/2026

Escopo: configuracao segmentada V3, atribuicoes formais, diagnosticos,
snapshots e simulacao privada. A configuracao V3 nao foi ativada.

## Veredito

O Gate 11 esta aprovado para validacao visual. A camada segmentada preserva
isolamento de dados, imutabilidade de configuracoes ativas e snapshots
fechados, e desempenho compativel com a leitura operacional atual.

Esta aprovacao nao autoriza o cutover. A versao 2 permanece ativa; a versao 3
permanece em `rascunho`, sem matriz de metas inventada e sem ranking oficial.

## Acesso e isolamento

| Papel | Resultado |
|---|---|
| `anon` | sem acesso e zero privilegio de tabela nas cinco tabelas auditadas |
| `authenticated` | sem DML e zero privilegio direto de tabela |
| `service_role` | leitura das bases privadas e escrita somente no log de simulacao |

As RPCs de leitura segmentada, o materializador e as rotinas de configuracao
sao `SECURITY DEFINER` com `search_path` fixo em `public, pg_temp`. As RPCs de
leitura e materializacao nao concedem `EXECUTE` a `anon` ou `authenticated`.

As quatro RPCs administrativas de ciclo de vida continuam acessiveis ao papel
`authenticated`, mas passam pelo guard
`fn_health_score_professor_v3_ator_gerenciador()`. Ele exige usuario ativo e a
permissao funcional `professores.editar`. `service_role` e `postgres` sao os
unicos bypasses deliberados.

O cliente MCP executa como `postgres`; por isso ele nao reproduz com fidelidade
uma sessao JWT negativa de navegador. A definicao do guard, os grants e as ACLs
foram verificados neste Gate. O bloqueio real para usuario sem permissao sera
revalidado no navegador autenticado no Gate 12.

## Imutabilidade

A imutabilidade foi aprovada em uma fixture transacional descartavel. O teste
criou uma meta de rascunho, um snapshot provisorio e um segmento, fechou o
snapshot pelo canal controlado e tentou tres mutacoes indevidas.

| Tentativa | Resultado |
|---|---|
| Inserir meta segmentada na configuracao ativa | bloqueada |
| Apagar meta referenciada por snapshot fechado | bloqueada |
| Alterar segmento de snapshot fechado | bloqueada |

Os bloqueios foram produzidos pelos triggers
`trg_health_score_professor_v3_config_meta_segmentada_imutavel` e
`trg_health_score_professor_v3_snapshot_segmento_imutavel`. A consistencia
entre meta, unidade, curso e modalidade tambem permanece protegida por
`trg_health_score_v3_snapshot_segmento_config_consistente`.

Toda a fixture foi executada entre `BEGIN` e `ROLLBACK`; nenhum dado de teste
permaneceu no banco.

## Indices

Todos os indices encontrados estavam validos:

| Tabela | Indices validos |
|---|---:|
| `health_score_professor_v3_config_metas_curso_modalidade` | 5 |
| `health_score_professor_v3_config_simulacoes` | 2 |
| `health_score_professor_v3_snapshot_metrica_diagnosticos` | 3 |
| `health_score_professor_v3_snapshot_metrica_segmentos` | 8 |
| `professor_unidade_curso_modalidade` | 8 |

Ha chaves unicas para o grao configuracao/unidade/curso/modalidade e para o
grao snapshot/unidade/curso/modalidade, alem dos indices de escopo usados na
conciliacao e materializacao.

## Desempenho remoto

As medicoes foram feitas com `EXPLAIN (ANALYZE, BUFFERS)` no banco remoto,
competencia julho/2026 e rascunho V3.

| Recorte | Tempo | Linhas | Shared hits |
|---|---:|---:|---:|
| Barra | 270,708 ms | 38 | 95.875 |
| Campo Grande | 386,944 ms | 64 | 133.197 |
| Recreio | 369,473 ms | 48 | 134.112 |
| Consolidado | 869,318 ms | 92 | 265.075 |
| Simulacao completa | 1.633,844 ms | 1 | 441.231 |

O baseline historico do Gate 4 era aproximadamente 236 ms por unidade. As tres
unidades permaneceram abaixo de duas vezes esse baseline e na mesma ordem de
grandeza. O consolidado percorre as tres unidades e permaneceu abaixo de um
segundo. A simulacao usa a RPC agregada em lote; nao executa uma chamada por
professor e seu registro de benchmark foi revertido.

## Governanca preservada

- configuracao ativa: versao 2, inalterada;
- configuracao segmentada: versao 3, `rascunho`;
- nenhuma meta segmentada foi inventada;
- nenhuma simulacao foi publicada;
- nenhum snapshot fechado foi reescrito;
- nenhuma permissao direta foi aberta a `anon` ou `authenticated`;
- a V3 continua nao ativada.

## Proxima etapa

O Gate 12 deve validar o fluxo no navegador autenticado, incluindo permissao
real, responsividade, ausencia de sobreposicoes e nao regressao dos
consumidores atuais. Somente depois dessa evidencia visual o trabalho pode ser
considerado concluido tecnicamente; a ativacao continua sendo uma decisao de
homologacao separada.
