# Relatorios mensais canonicos de julho de 2026

## Objetivo

Fazer os relatorios mensais Administrativo e Comercial consumirem uma fotografia completa e imutavel da competencia, sem recalcular julho a partir do estado vivo de agosto.

## Decisoes aprovadas

- Julho de 2026 e uma competencia encerrada e imutavel.
- Os snapshots aprovados em 31/07/2026 sao a ancora dos KPIs estruturais.
- O relatorio mensal Administrativo e o relatorio mensal Comercial continuam separados.
- Os botoes manuais recebem o texto de produtores no servidor; o navegador nao consulta tabelas nem recalcula KPIs para esses dois documentos.
- A IA nao participa desses dois relatorios.
- Falta de snapshot, hash divergente ou bloco obrigatorio ausente falha fechado. Nao existe fallback silencioso para dado vivo.

## Estado encontrado

Os dominios `alunos_admin`, `alunos_executivo`, `comercial` e `relatorio_gerencial` existem para Barra, Campo Grande e Recreio, com status `aprovado`. O administrativo contem a decomposicao multicurso completa. O comercial por unidade contem os KPIs principais, mas nao congela tickets nem a lista detalhada. Nenhuma linha de julho existe em `competencias_mensais`, e os snapshots ainda nao possuem `fechado_em`.

## Arquitetura

Uma migration aditiva cria dois dominios completos de documento, `relatorio_admin_mensal` e `relatorio_comercial_mensal`, dentro de `fechamento_mensal_snapshots`. Cada payload guarda os dados necessarios para renderizar o documento e os hashes dos snapshots-base usados na captura.

O fluxo de fechamento passa a ser:

1. validar os snapshots-base aprovados;
2. capturar os dois payloads mensais completos por unidade;
3. validar invariantes entre payload mensal e snapshots-base;
4. marcar snapshots e competencia como fechados;
5. bloquear alteracao ou exclusao de payload fechado.

Duas RPCs de leitura retornam exclusivamente os payloads fechados. A edge `relatorio-admin-whatsapp` usa essas RPCs, renderiza cada documento no servidor e devolve o texto em modos manuais separados. Os dois botoes passam a exibir exatamente esse texto.

## Contrato administrativo

O payload mensal administrativo preserva:

- ativos, pagantes, nao pagantes, bolsas e trancamentos;
- matriculas base, banda, adicionais, coral e distribuicao de pessoas por quantidade de cursos;
- financeiro fechado disponivel no snapshot gerencial;
- novos alunos e transferencias;
- renovacoes, nao renovacoes, avisos previos e evasoes;
- nomes e atributos exibidos nas listas, congelados no momento da captura.

Os totais estruturais devem ser iguais ao dominio `alunos_admin`. Divergencia bloqueia a captura.

## Contrato comercial

O payload mensal comercial preserva:

- leads, experimentais, matriculas e conversoes;
- pendencias de conciliacao como alerta, nunca como substituicao da taxa por `BLOQUEADA`;
- totais e tickets medios de passaportes e parcelas;
- distribuicoes por canal e curso;
- lista detalhada das matriculas comerciais canonicas;
- coorte agrupada por pessoa/unidade/data, excluindo segundo curso, banda, coral, bolsas e transferencias.

Leads, experimentais e quantidade de matriculas devem ser iguais ao dominio `comercial`. Divergencia bloqueia a captura.

## Imutabilidade e retificacao

Snapshots fechados nao podem ter payload, hash, unidade, competencia, dominio ou versao alterados e nao podem ser excluidos. O unico caminho de correcao futuro e inserir nova versao pelo fluxo formal de retificacao, preservando a anterior na auditoria.

Para julho, a captura dos dois documentos acontece antes da transicao dos snapshots aprovados para `fechado`. Nenhuma RPC viva e chamada depois dessa transicao para compor o documento.

## Autorizacao

- captura e fechamento: somente `service_role` ou `postgres`;
- leitura: usuario autenticado com permissao da unidade ou `service_role`;
- unidade obrigatoria para os documentos operacionais;
- nenhuma chave privilegiada e enviada ao navegador.

## Validacao

- testes PostgreSQL reais para captura, invariantes, ACL e imutabilidade;
- testes dos renderizadores com fixtures de julho;
- testes de contrato garantindo que os botoes nao consultam as tabelas operacionais;
- comparacao dos totais das tres unidades com os hashes e payloads aprovados;
- build e checks Deno antes da implantacao;
- leitura de producao apos a migration, sem gerar nova versao.

## Fora do corte urgente

O relatorio gerencial sera migrado depois dos dois mensais. Esta entrega nao altera o relatorio da Coordenacao nem os relatorios diarios automaticos.
