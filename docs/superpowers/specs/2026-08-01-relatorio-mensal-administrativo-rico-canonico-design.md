# Relatorio mensal administrativo rico e canonico

**Data:** 2026-08-01

## Objetivo

Gerar o Relatorio Mensal Administrativo com o mesmo modelo publico usado em junho de 2026, preservando sua riqueza de detalhes, mas usando exclusivamente os dados fechados e verificaveis da competencia. O novo modelo acrescenta o detalhamento multicurso e a relacao dos trancamentos atuais sem alterar, retificar ou recriar o fechamento de julho.

## Escopo desta etapa

- Alterar somente o Relatorio Mensal Administrativo gerado manualmente pelo botao.
- Usar o relatorio de junho como contrato de ordem, linguagem, secoes e campos.
- Acrescentar o quadro multicurso e a relacao detalhada de trancamentos.
- Validar primeiro a competencia julho de 2026 da unidade Recreio.
- Nao alterar o Relatorio Mensal Comercial, o Relatorio Gerencial, o relatorio da Coordenacao ou os relatorios diarios nesta etapa.
- Nao fazer push, abrir PR ou merge antes da validacao posterior dos relatorios Administrativo e Comercial.

## Regra de imutabilidade

Os snapshots fechados de julho permanecem intactos. Esta entrega nao:

- atualiza payload ou hash de snapshot;
- cria versao retificada de julho;
- recalcula julho a partir do estado vivo de agosto;
- troca a versao oficial da competencia;
- executa backfill de aluno ou movimentacao.

O snapshot mensal administrativo e a fotografia fechada do relatorio gerencial sao apenas fontes de leitura. O texto final e um artefato regeneravel.

## Arquitetura

O botao continua chamando o modo mensal administrativo da Edge Function `relatorio-admin-whatsapp`. A Edge deixa de formatar apenas o resumo atual e passa a receber um envelope de leitura composto por:

1. o payload fechado de `relatorio_admin_mensal` de julho;
2. os indicadores financeiros, de retencao e as metas da fotografia fechada de `relatorio_gerencial` que o proprio payload mensal referencia;
3. exclusivamente para o campo omitido `trancamentos_periodo`, uma reconstrucao das movimentacoes canonicas de trancamento limitada a competencia e a `capturado_em` do documento mensal.

A camada de leitura deve localizar as duas fotografias-base pelos `snapshot_id` gravados em `fontes.alunos_admin` e `fontes.relatorio_gerencial`, e nao pela versao mais recente encontrada no momento da consulta. Antes de devolver os dados, deve confirmar para ambas:

- mesma unidade, ano e mes;
- status fechado;
- hash atual igual ao hash armazenado na linha;
- hash igual ao registrado pela referencia do payload mensal.

Essa composicao e somente leitura. Se qualquer vinculo, hash ou bloco obrigatorio estiver ausente, o relatorio falha fechado com uma mensagem publica compreensivel. A unica reconstrucao historica permitida e `trancamentos_periodo`: ela conta `movimentacoes_admin` criadas ate `capturado_em` e falha se `audit_log` registrar insercao retroativa, alteracao ou exclusao posterior ao fechamento que possa mudar o recorte. Os demais campos nao possuem fallback para tabelas vivas.

O GET atual do Emusys nao e usado para reconstruir julho, pois poderia refletir o estado de agosto. A relacao dos trancamentos atuais ja esta congelada em `trancamentos_detalhados`. Para competencias futuras, o produtor mensal passa a capturar `trancamentos_periodo` no proprio payload antes do fechamento.

## Contrato visual publico

O relatorio de junho e o modelo ouro. Julho preserva:

- cabecalho, unidade, competencia e nomes da equipe;
- mesma ordem de secoes;
- mesmos emojis, separadores e estilo de listas;
- formatacao brasileira de moeda, percentual, data e hora;
- detalhes individuais de renovacoes, nao renovacoes, avisos previos e evasoes;
- encerramento com data e hora de geracao;
- ausencia de nomes de RPCs, endpoints, snapshots, hashes ou termos internos.
- ausencia de marcadores de paginacao como `(1/2)`, `(2/2)` ou equivalentes.

As secoes aparecem na seguinte ordem:

1. Alunos;
2. Matriculas;
3. Trancamentos atuais;
4. KPIs financeiros;
5. KPIs de retencao;
6. Metas Fideliza+ LA;
7. Renovacoes do mes;
8. Nao renovacoes do mes;
9. Avisos previos para sair no mes seguinte;
10. Evasoes do mes;
11. Data e hora de geracao.

## Alunos

A secao preserva os campos do modelo de junho e explicita os tres conceitos de trancamento:

- ativos;
- pagantes;
- nao pagantes;
- bolsistas, com integrais e parciais;
- trancados no fechamento, no grao de pessoa;
- matriculas trancadas no fechamento;
- trancamentos ocorridos durante a competencia;
- novos no mes;
- transferencias recebidas;
- entrada total de novos alunos.

Uma pessoa com ao menos uma matricula academica ativa e pagante continua contando como ativa e pagante mesmo que outra matricula esteja trancada. Banda e bolsa nao tornam a pessoa pagante. Uma matricula trancada nao entra nas matriculas ativas nem financeiras.

## Matriculas e multicurso

A secao preserva a linha de matriculas ativas e explica sua composicao:

- matriculas-base;
- matriculas de banda;
- matriculas academicas adicionais;
- alunos com exatamente dois cursos;
- alunos com exatamente tres cursos;
- alunos com quatro ou mais cursos;
- coral.

Cada curso academico ativo equivale a uma matricula. Uma pessoa com tres cursos possui uma matricula-base e duas matriculas adicionais. Banda permanece separada das matriculas academicas adicionais.

## Trancamentos atuais

O relatorio lista cada matricula trancada na data de fechamento da competencia. Para julho, a data de referencia e `31/07/2026`, mesmo que o texto seja gerado em agosto.

Cada item mostra:

- nome do aluno;
- curso;
- inicio do trancamento;
- tempo trancado em dias ate a data de fechamento;
- retorno previsto;
- situacao da politica;
- motivo.

As faixas publicas sao:

- ate 30 dias: `PERIODO CONTRATUAL`;
- de 31 a 60 dias: `EXTENSAO GERENCIAL`;
- acima de 60 dias: `FORA DA POLITICA`;
- sem data de inicio: `DATA DE INICIO AUSENTE`.

## KPIs financeiros

O relatorio mantem os cinco indicadores do modelo de junho:

- Ticket Medio;
- Faturamento Previsto;
- MRR Atual;
- LTV, exibido como `Tempo x Ticket`;
- Tempo de Permanencia.

Os valores vem da fotografia gerencial fechada que serviu de fonte ao relatorio mensal. O formatador nao recalcula esses KPIs usando dados vivos.

## KPIs de retencao

O relatorio mantem:

- Churn Rate;
- Taxa de Renovacao;
- Reajuste Medio;
- Inadimplencia;
- MRR Perdido;
- Total de Evasoes;
- Nao Renovacoes.

As regras de apresentacao sao:

- churn usa apenas perdas de pessoas pagantes da base; bolsa, banda e encerramento de curso adicional nao entram no denominador nem viram perda de pessoa;
- inadimplencia usa pessoas pagantes com parcela vencida em aberto divididas pelas pessoas pagantes, sem classificar bolsistas como inadimplentes;
- total de evasoes administrativas soma as interrupcoes de matricula da competencia e as nao renovacoes, sem dupla contagem;
- MRR perdido e reajuste medio usam os valores congelados na fotografia gerencial.

Para o Recreio em julho, a apresentacao esperada e coerente com `4` interrupcoes regulares mais `2` nao renovacoes sobre `336` pagantes para o churn, e `4` pagantes inadimplentes sobre `336` pagantes para a inadimplencia. Evasoes administrativas totalizam `7`: cinco interrupcoes registradas, incluindo uma bolsa, mais duas nao renovacoes.

## Metas Fideliza+ LA

A secao conserva os quatro cards textuais e as barras do modelo de junho:

- Churn Premiado;
- Inadimplencia Zero;
- Max Renovacao;
- Reajuste Campeao.

O valor atual usa os KPIs fechados. A meta exibida usa a configuracao congelada para a unidade e a competencia na fotografia gerencial, em vez de constantes escritas no frontend. Indicadores em que menor e melhor usam comparacao inversa; renovacao e reajuste usam comparacao direta.

## Renovacoes

A secao mostra total previsto, realizadas e percentual. Cada renovacao preserva:

- nome;
- parcela anterior;
- parcela nova;
- percentual de reajuste;
- forma de pagamento;
- agente.

O total realizado deve ser igual ao numero de itens detalhados. Divergencia bloqueia o texto em vez de publicar uma lista parcial.

## Nao renovacoes

A secao mostra total e percentual. Cada item preserva:

- nome;
- parcela anterior e nova;
- professor;
- motivo.

O total deve ser igual ao numero de itens detalhados.

## Avisos previos

A secao usa como titulo o mes de saida seguinte a competencia. Para julho, publica somente avisos com saida prevista em agosto.

Cada item mostra nome, motivo e professor. O total deve ser igual ao detalhamento. Avisos com saida em setembro nao podem ser rotulados ou contados como avisos para agosto.

## Evasoes

A secao mostra:

- total administrativo do mes;
- nao renovou;
- interrompido regular;
- interrompido segundo curso;
- interrompido bolsista;
- interrompido banda;
- transferencia, quando aplicavel.

A lista detalhada cobre o mesmo total apresentado. As nao renovacoes aparecem classificadas como tal na lista de evasoes, mesmo que tambem possuam a secao operacional propria. Isso evita publicar total `7` acompanhado por apenas cinco nomes.

Cada item mostra nome, motivo, parcela e professor quando esses dados existirem no fechamento.

## Tratamento de ausencia e divergencia

- Campo opcional ausente usa `N/A` ou `Nao informado`, conforme o modelo publico.
- Total oficial diferente do numero de itens impede a publicacao daquela versao do texto.
- Fonte ausente, hash invalido ou competencia divergente retorna erro publico sem detalhes tecnicos.
- Nenhum erro pode acionar consulta a agosto para completar julho.
- O texto nunca mostra nomes internos de tabelas, funcoes, endpoints ou fontes.

## Validacao e aceite

A implementacao deve seguir TDD e provar:

- a mesma ordem e riqueza de secoes do modelo de junho;
- os acrescimos de multicurso e trancamentos;
- calculo dos dias de trancamento na data de fechamento;
- distincao entre nao pagante, bolsista e inadimplente;
- metas lidas da competencia fechada;
- renovacoes com valores, pagamento e agente;
- somente dez avisos para agosto no Recreio;
- sete evasoes e sete itens detalhados no Recreio;
- ausencia de termos tecnicos no texto;
- nenhuma alteracao no Relatorio Mensal Comercial.
- reconstrucao auditada de `trancamentos_periodo`: Barra `5`, Recreio `3` e Campo Grande `18`;
- trancamentos atuais preservados: Barra `6 alunos / 6 matriculas`, Recreio `3/3` e Campo Grande `16/17`;
- nenhum marcador de paginacao inserido no texto.

O aceite funcional ocorre com uma previa do Recreio de julho comparada, secao por secao, ao modelo de junho e ao relatorio administrativo diario de 31/07/2026. A publicacao da Edge administrativa so ocorre depois da aprovacao dessa previa. O trabalho do Comercial comeca depois desse aceite.
