# Classificacao Task 0 - Fechamento Junho 2026

Data da auditoria: 2026-06-30.

Escopo desta classificacao: inventario e leitura. Nenhuma tabela, RPC ou dado de producao foi alterado.

## Resultado Curto

Junho/2026 ainda nao esta blindado para fechamento historico completo.

O banco ja tem pecas importantes de governanca e historico, mas elas nao estao preenchidas de forma suficiente para preservar junho:

- `competencias_mensais`: 0 linhas para junho/2026.
- `dados_mensais`: 2 linhas para junho/2026, apenas Campo Grande e Recreio, e com valores antigos/incompletos.
- `relatorios_diarios`: 0 linhas.
- `programa_matriculador_historico`: 0 linhas.
- `programa_fideliza_historico`: 0 linhas.

Conclusao: nao devemos assumir que o fechamento atual protege junho. Tambem nao devemos criar tabela nova antes de decidir se reaproveitamos `dados_mensais` + uma tabela complementar de snapshot completo.

## Tabelas E Classificacao

### `competencias_mensais`

Classificacao: governanca canonica de fechamento.

Uso correto:

- marcar competencia aberta/fechada por unidade, ano e mes;
- bloquear alteracoes indevidas em competencia fechada;
- registrar lote, horario, responsavel e motivo.

Estado atual:

- usada para maio/2026;
- sem linhas para junho/2026.

Decisao:

- reutilizar obrigatoriamente no fechamento de junho;
- nao criar outra tabela de status de competencia.

### `dados_mensais`

Classificacao: snapshot mensal compacto/legado-controlado.

Uso correto:

- guardar KPIs executivos compactos por unidade/mes;
- alimentar telas historicas que ja esperam esse formato.

Limite:

- nao guarda retrato completo dos relatorios;
- nao guarda detalhes de comercial, Matriculador+, Fideliza+, professor, coordenacao, listas e evidencias;
- hoje tem apenas 2 linhas de junho/2026 e valores antigos.

Decisao:

- manter e reaproveitar para os KPIs compactos;
- nao tratar como snapshot completo de fechamento;
- para junho, so escrever nele depois de preview/validacao, nunca por recalculo solto.

### `dados_mensais_retificacoes`

Classificacao: auditoria/retificacao de `dados_mensais`.

Uso correto:

- registrar antes/depois/diff quando um dado mensal fechado precisa ser retificado.

Limite:

- nao e snapshot principal;
- nao substitui congelamento de junho.

Decisao:

- manter para rollback/auditoria;
- nao usar como destino principal do fechamento.

### `relatorios_diarios`

Classificacao: estrutura diaria existente, hoje nao populada.

Uso correto possivel:

- guardar snapshots diarios do relatorio administrativo/comercial.

Estado atual:

- 0 linhas em producao.

Limite:

- nao cobre todos os dominios de fechamento mensal;
- nao esta integrada ao fluxo atual de relatorios.

Decisao:

- nao usar como base unica do fechamento de junho sem implementacao e validacao;
- pode servir em fase posterior para historico diario.

### `programa_matriculador_historico`

Classificacao: destino historico correto para Matriculador+.

Estado atual:

- tabela existe;
- 0 linhas;
- funcao local antiga `salvar_historico_mensal_matriculador` aparece em migracao, mas nao apareceu como funcao viva no banco.

Decisao:

- reaproveitar a tabela;
- antes de escrever, criar/alinhar RPC guardada se a funcao estiver ausente em producao;
- nao criar outra tabela de historico do Matriculador+.

### `programa_fideliza_historico`

Classificacao: destino historico correto para Fideliza+.

Estado atual:

- tabela existe;
- 0 linhas;
- funcao viva `salvar_historico_trimestral_fideliza(p_ano, p_trimestre)` existe.

Decisao:

- reaproveitar;
- confirmar se o fechamento de junho deve gravar o trimestre ou tambem precisa de leitura mensal complementar.

### Metas e configuracoes

Tabelas relacionadas:

- `metas`
- `metas_kpi`
- `aluno_metas`
- `professor_metas`
- `metas_comerciais`
- `programa_matriculador_config`
- `programa_fideliza_config`
- `simulacoes_metas`

Classificacao: configuracao/referencia, nao snapshot.

Decisao:

- fechamento deve capturar o resultado contra a meta vigente;
- nao sobrescrever metas no fechamento;
- nao duplicar estrutura de metas.

### Views `vw_*`

Classificacao: derivadas/consultas, nao persistencia.

Decisao:

- podem ajudar no preview;
- nao servem como fonte congelada se dependem de tabelas vivas.

### Historicos operacionais

Tabelas relacionadas:

- `alunos_historico`
- `turmas_historico`
- `crm_lead_historico`
- `historico_pagamentos`

Classificacao: logs/eventos auxiliares.

Decisao:

- podem ser evidencias para auditoria;
- nao substituem snapshot mensal consolidado.

## RPCs E Classificacao

### Guardas de competencia

RPCs:

- `assert_competencia_aberta`
- `fechar_competencia`
- `log_competencia_bloqueio`

Classificacao: canonicas para governanca.

Decisao:

- reutilizar;
- fechamento de junho deve registrar competencia por unidade e lote.

### Writers antigos/compactos de `dados_mensais`

RPCs:

- `recalcular_dados_mensais`
- `recalcular_dados_mensais_unguarded`
- `snapshot_dados_mensais`
- `snapshot_dados_mensais_unguarded`
- `fechar_dados_mensais`
- `fechar_dados_mensais_unguarded`
- `upsert_dados_mensais`
- `upsert_dados_mensais_unguarded`

Classificacao: sensiveis/risco alto.

Decisao:

- nao rodar automaticamente no fechamento de junho sem preview e comparacao;
- se forem usadas, precisam receber valores canonicos ja aprovados;
- evitar que `recalcular_dados_mensais` reanime regra antiga.

### Fontes vivas/canonicas atuais

RPCs e hooks principais encontrados:

- `get_kpis_alunos_admin_operacional`
- `get_kpis_alunos_canonicos`
- `get_kpis_comercial_canonicos_v2`
- `get_dados_relatorio_gerencial`
- `get_dados_relatorio_coordenacao`
- `get_programa_matriculador_dados`
- `get_programa_fideliza_dados`

Classificacao: candidatas para preview canonico de fechamento.

Decisao:

- usar para montar o preview do fechamento de junho;
- comparar com relatorios manuais validados antes de escrever historico.

## Cron E Corte

Crons ativos relevantes:

- relatorio diario: 23:00 UTC em dias uteis, equivalente a 20:00 BRT.
- relatorio sabado: 19:00 UTC, equivalente a 16:00 BRT.
- sync de matriculas Emusys: 02:00, 02:20 e 02:40 UTC, equivalente a 23:00, 23:20 e 23:40 BRT do dia anterior.
- sync de presenca: horarios noturnos separados por unidade.

Nao foi encontrado cron ativo de `snapshot_dados_mensais`, `fechar_dados_mensais` ou `recalcular_dados_mensais`.

Decisao:

- corte oficial de junho as 22:00 BRT deve ser fluxo explicito e auditado;
- cuidado: os syncs de matriculas rodam depois das 22:00 BRT, entao podem alterar base viva depois do corte se nao houver congelamento.

## Recomendacao Para Task 1

Antes de qualquer escrita em producao:

1. Criar preview de fechamento de junho por unidade usando as fontes vivas canonicas atuais.
2. Comparar preview contra os relatorios validados de junho.
3. Definir destino de persistencia:
   - `dados_mensais` para KPIs compactos;
   - `programa_matriculador_historico` para Matriculador+;
   - `programa_fideliza_historico` para Fideliza+;
   - se faltar retrato completo, criar uma tabela complementar unica de snapshot completo, nao redundante com `dados_mensais`.
4. So depois criar/aplicar RPC guardada de fechamento, com lote, hash do payload, responsavel e fonte.

## Bloqueios/Alertas

- `dados_mensais` de junho esta incompleto e nao pode ser considerado fechado.
- `programa_matriculador_historico` e `programa_fideliza_historico` existem mas estao vazios.
- `relatorios_diarios` existe mas esta vazio.
- `competencias_mensais` nao tem junho.
- A funcao viva de salvar historico mensal do Matriculador+ nao apareceu no banco, embora exista migracao local antiga com esse nome.
- Qualquer rotina de fechamento precisa evitar recalcular por regra antiga.
