# Relatorio tecnico - fontes canonicas de KPIs de alunos

Data: 2026-06-10  
Projeto Supabase validado via MCP: `ouqwbbermlzqqvtqwlul`  
Escopo: jornada do aluno pos-matricula, KPIs executivos de alunos, financeiro derivado de alunos, retencao, relatorios administrativos e base para deprecacao futura.

## 1. Resumo executivo

O trabalho principal foi separar definitivamente duas coisas que estavam misturadas:

1. **Snapshot historico fechado**: valores oficiais de meses fechados.
2. **Calculo vivo operacional**: valores do mes atual aberto, que precisam mudar conforme entram alunos, bandas, evasoes, inadimplencias e renovacoes.

A regra atual ficou assim:

| Situacao | Fonte oficial |
|---|---|
| Competencia fechada | `dados_mensais`, protegida por `competencias_mensais` |
| Mes atual aberto | fonte viva canonica em `alunos` + `movimentacoes_admin` + tabelas de apoio |
| Mes passado aberto com snapshot | `dados_mensais` como preliminar, sem tratar como fechamento historico |
| Mes passado aberto sem snapshot | indisponivel/preliminar; nao recalcular silenciosamente como historico |

O resultado pratico:

- Maio/2026 foi fechado e protegido nas tres unidades.
- Junho/2026 segue aberto e vivo.
- Cards executivos de alunos em Dashboard, Analytics/Gestao, Administrativo e Pagina Alunos passaram a consumir o contrato canonico.
- O relatorio diario administrativo por WhatsApp foi atualizado para buscar KPIs de alunos pela RPC canonica.
- Retencao, renovacoes, reajuste medio, MRR perdido e tempo de permanencia foram saneados para reduzir divergencias entre tela, relatorio e operacao.

Ponto importante para o Hugo: **a deprecacao ainda nao deve remover objetos antigos agora**. Ja existem substitutos canonicos para o nucleo de alunos, mas ainda ha consumidores operacionais e legados que precisam passar por checklist antes de qualquer `DROP`.

## 2. Arquitetura de governanca criada antes da unificacao

Antes de mexer nas fontes do frontend, foi criado o conceito de competencia fechada para proteger `dados_mensais`.

### Objetos principais

| Objeto | Papel |
|---|---|
| `dados_mensais` | Snapshot historico/oficial do mes fechado |
| `competencias_mensais` | Estado de fechamento por unidade/ano/mes |
| `competencias_bloqueios_log` | Log persistente de tentativa de escrita bloqueada |
| `dados_mensais_retificacoes` | Fluxo formal de retificacao historica |
| `assert_competencia_aberta` | Guarda usada por writers para impedir overwrite de mes fechado |
| `fechar_competencia` | Fecha uma competencia usando o snapshot existente |

### Protecao aplicada

Foram protegidos os principais writers de `dados_mensais` por wrappers/guards:

- `fechar_dados_mensais`
- `recalcular_dados_mensais`
- `snapshot_dados_mensais`
- `upsert_dados_mensais`
- `sync_evasao_to_dados_mensais`

Regra de negocio: **mes fechado nao pode ser recalculado por botao, cron, trigger, RPC antiga ou fallback de frontend**. Qualquer correcao historica deve virar retificacao formal.

### Estado confirmado

Maio/2026 esta fechado nas tres unidades:

| Unidade | Status | Fechado por |
|---|---|---|
| Barra | `fechado` | `alf/admin-master` |
| Campo Grande | `fechado` | `alf/admin-master` |
| Recreio | `fechado` | `alf/admin-master` |

Junho/2026 continua aberto/preliminar.

## 3. Contrato canonico atual

Hoje existem duas materializacoes do mesmo contrato:

1. **Frontend/hook**: `src/hooks/useKPIsAlunosCanonicos.ts`
2. **Backend/RPC**: `public.get_kpis_alunos_canonicos(uuid, integer, integer)`

O frontend usa o hook para as telas interativas. As Edge Functions e relatorios server-side usam a RPC. As duas camadas foram alinhadas para a mesma regra de negocio, mas ainda existe duplicacao de logica. Recomendacao futura: consolidar cada vez mais no backend/RPC para reduzir risco de drift.

### Arquivos principais no frontend

| Arquivo | Papel |
|---|---|
| `src/hooks/useKPIsAlunosCanonicos.ts` | Contrato principal consumido pelas telas |
| `src/lib/kpisAlunosVivosCanonicos.ts` | Calculo vivo do mes atual aberto |
| `src/hooks/useKPIsGestao.ts` | Adapter da Gestao para o contrato canonico |
| `src/hooks/useKPIsRetencao.ts` | Adapter de Retencao para snapshot/vivo canonico |
| `src/lib/retencaoOperacionalCanonica.ts` | Regras de renovacao, evasao, MRR perdido, reajuste e permanencia |
| `src/lib/renovacoesAntecipadas.ts` | Competencia efetiva de renovacao antecipada |
| `src/lib/fidelizaCanonico.ts` | Overlay canonico parcial do Fideliza+ |

### RPCs/funcoes principais

| Funcao | Status | Observacao |
|---|---|---|
| `public.get_kpis_alunos_canonicos` | Canonica | `SECURITY DEFINER`, `search_path=public, pg_temp` |
| `public.get_kpis_alunos_financeiro_vivo_canonico` | Canonica financeira viva | Aplica ticket/MRR/inadimplencia/reajuste canonicos |
| `public.get_dados_relatorio_gerencial` | Wrapper saneado | Chama `get_kpis_alunos_canonicos` |
| `public.get_dados_retencao_ia` | Wrapper saneado | Chama `get_kpis_alunos_canonicos` |
| `public.get_programa_fideliza_dados` | Pendente/parcial | Ainda tem logica propria trimestral e usa `renovacoes` |
| `public.get_carteira_professores` | Operacional | Carteira viva por professor, nao KPI historico |

Funcoes de rollback/legado ainda existem:

- `get_dados_relatorio_gerencial_legacy_p01g`
- `get_dados_retencao_ia_legacy_p01g`
- `get_kpis_alunos_canonicos_base_p01q`
- `get_kpis_alunos_canonicos_base_p01t`

Essas funcoes nao devem ser chamadas por produto novo. Elas existem para compatibilidade/rollback e so devem ser removidas depois de checklist de deprecacao.

## 4. Regras de negocio canonicas

### 4.1 Alunos Ativos

Definicao: **pessoas unicas ativas/trancadas**.

Inclui:

- pagantes;
- bolsistas integrais;
- bolsistas parciais;
- aluno que esta somente em banda/projeto.

Nao duplica:

- segundo curso;
- multiplas matriculas;
- multiplos vinculos da mesma pessoa.

Deduplicacao operacional no calculo vivo:

```text
lower(trim(nome)) + unidade_id
```

No codigo local, isso esta em `pessoaKey` dentro de `src/lib/kpisAlunosVivosCanonicos.ts`.

### 4.2 Matriculas Ativas

Definicao: **vinculos/matriculas ativas**.

Inclui:

- curso regular;
- segundo curso;
- banda/projeto;
- coral;
- bolsistas;
- pagantes.

Pode ser maior que `alunos_ativos`.

Regra especifica alinhada com o Alf no Recreio:

- `matriculas_2_curso` conta vinculos de segundo curso.
- Se dois alunos fazem terceiro curso, a contagem pode aparecer como `22 alunos + 2 extras = 24 matriculas`.
- Para relatorio, a recomendacao e exibir o breakdown quando houver extras.

### 4.3 Alunos Pagantes

Definicao: **pessoas unicas com MRR recorrente pagante > 0**.

Nao duplica:

- segundo curso no denominador;
- multiplas matriculas da mesma pessoa.

### 4.4 MRR / Faturamento previsto

Definicao: soma das parcelas recorrentes pagantes elegiveis.

Inclui:

- curso regular pagante;
- segundo curso pagante.

Exclui do ticket/MRR executivo quando a regra de tipo indica que nao entra:

- bolsista integral;
- bolsista parcial;
- banda/projeto/coral quando nao e parcela recorrente executiva;
- parcelas zeradas.

### 4.5 Ticket Medio Executivo

Formula:

```text
ticket_medio = MRR recorrente elegivel / pessoas pagantes
```

Exemplo validado:

- um aluno unico com tres cursos pagantes de R$ 400 conta como **1 pessoa pagante** e **R$ 1.200 de MRR**;
- isso aumenta o ticket medio porque representa mais receita por pessoa.

Nao entram no ticket medio:

- banda/projeto/coral;
- bolsista integral;
- bolsista parcial;
- aluno sem parcela recorrente;
- renovacao zerada/negativa usada como retencao.

### 4.6 Kids / School

Definicao: mesma base de `alunos_ativos`.

Regra:

```text
Kids + School + Sem classificacao = Alunos Ativos
```

O calculo vivo usa idade atual disponivel para classificar:

- Kids: idade <= 11
- School: idade >= 12
- Sem classificacao: sem idade

Observacao sobre historico fechado:

- `dados_mensais` ainda nao tem colunas oficiais `alunos_kids` e `alunos_school`.
- Campo Grande/Maio 2026 foi exibido com segmentacao reconstruida e nota visual: Kids 202, School 294.
- Essa reconstrucao foi aceita como evidencia operacional, mas **nao e snapshot canonico definitivo**.
- Proxima evolucao de schema deve adicionar `alunos_kids` e `alunos_school` ao fechamento.

### 4.7 Bolsistas

O sistema passou a expor breakdown:

- `bolsistas_integrais`
- `bolsistas_integrais_regulares`
- `bolsistas_integrais_segundo_curso`
- `bolsistas_parciais`

Motivo: Recreio mostrou o caso em que havia 7 bolsistas integrais regulares + 2 bolsistas integrais em segundo curso. O total operacional e 9, mas o relatorio precisa explicar a composicao.

### 4.8 Renovacoes

Regra corrigida:

- Renovacao importada automaticamente do Emusys **nao vira realizada por si so**.
- Ela entra como pendente de validacao DM.
- So vira renovacao realizada quando houver confirmacao operacional:
  - agente;
  - valor anterior/novo ou forma de pagamento;
  - status operacional confirmado.

Status usados:

- `pendente_validacao`
- `confirmada`
- `antecipada_pendente`
- `antecipada_confirmada`

### 4.9 Renovacoes antecipadas

Decisao de negocio:

```text
competencia efetiva da renovacao antecipada = mes da primeira aula do novo ciclo
```

Exemplo: se a renovacao foi capturada em junho, mas a primeira aula do novo ciclo e em agosto, ela aparece na aba de renovacoes antecipadas em junho, mas so entra como renovacao efetiva em agosto.

Isso evita contaminar:

- renovacoes do mes atual;
- taxa de renovacao do mes atual;
- relatorio diario administrativo.

### 4.10 Reajuste Medio

Regra canonica em `percentualReajusteMedioCanonico`:

Nao entra no calculo:

- banda;
- projeto;
- coral;
- bolsista;
- renovacao sem confirmacao operacional;
- renovacao zerada;
- reducao de valor;
- valor anterior <= 0;
- valor novo <= valor anterior.

Formula por renovacao valida:

```text
(valor_novo - valor_anterior) / valor_anterior
```

Consolidado:

- deve ser ponderado por quantidade de reajustes validos, nao media simples de unidade.
- isso ja foi tratado no consolidado do hook canonico.

### 4.11 Evasoes / Churn / MRR perdido / Tempo de permanencia

Fonte operacional:

- `movimentacoes_admin`

Regras saneadas:

- `evasao` e `nao_renovacao` entram na perda;
- transferencia deve ser tratada separadamente quando identificada;
- aviso previo dado em um mes nao entra como evasao desse mes se a saida efetiva for futura;
- MRR perdido usa `valor_parcela_evasao`, `valor_parcela_anterior`, `valor_parcela_novo` ou fallback do aluno;
- tempo de permanencia usa campo materializado quando existir ou calcula por `data_matricula` ate a data da movimentacao.

Melhoria estrutural aplicada:

- trigger `trg_preencher_campos_retencao_movimentacoes_admin` ativo em `movimentacoes_admin`;
- funcao `preencher_campos_retencao_movimentacoes_admin` com `SECURITY DEFINER` e `search_path=public, pg_temp`;
- objetivo: novas evasoes/nao-renovacoes nascerem com `valor_parcela_evasao` e `tempo_permanencia_meses` preenchidos quando possivel.

## 5. Fontes antigas e problemas corrigidos

### 5.1 `vw_kpis_gestao_mensal`

Problema observado:

- retornava 516 ativos em Campo Grande/Junho, enquanto a regra correta por pessoa unica era 479 naquele momento.
- misturava base de vinculo/matricula com base de pessoa.

Status atual:

- nao deve ser fonte cega de alunos ativos, pagantes, ticket, MRR ou Kids/School.
- continua existindo como objeto legado/candidato futuro a deprecacao.

### 5.2 `vw_dashboard_unidade`

Problema observado:

- tambem retornava alunos ativos pela base antiga.

Status atual:

- nao e fonte canonica dos cards executivos.
- ainda pode aparecer em componente legado isolado (`TabDashboard`) ou areas historicas antigas.

### 5.3 `vw_kpis_retencao_mensal`

Problema observado:

- renovacoes automaticas do Emusys contaminavam realizadas;
- MRR perdido e permanencia podiam vir zerados;
- regras de aviso previo/competencia nao estavam alinhadas com operacao.

Status atual:

- Retencao viva usa `retencaoOperacionalCanonica`.
- Historico fechado usa `dados_mensais` para o resumo executivo.
- View segue candidata futura, mas nao remover ainda.

### 5.4 `renovacoes`

Problema observado:

- historicamente recebia renovacoes como `renovado`/realizadas de forma automatica.

Status atual:

- tela canonica e relatorio diario usam `movimentacoes_admin`.
- `processar-matricula-emusys` ainda grava tambem em `renovacoes`, agora com `status='pendente'`.
- portanto `renovacoes` **nao pode ser removida ainda** ate confirmar todos os consumidores.

## 6. Estado por tela

### 6.1 Dashboard

Status: migrado para fonte canonica nos cards executivos de alunos.

Fonte principal:

- `fetchKPIsAlunosCanonicos`
- `useKPIsGestao`

Comportamento:

- mes fechado: `dados_mensais`;
- mes atual aberto: calculo vivo canonico;
- badge/alerta indica fonte.

### 6.2 Analytics / Gestao

Status: migrado nos cards principais e graficos principais de alunos/financeiro/retencao.

Fontes:

- `fetchKPIsAlunosCanonicos`
- `calcularRetencaoOperacionalCanonica`
- `dados_mensais` para historico fechado/graficos historicos.

Ajustes feitos:

- ativos passaram a ser pessoa unica;
- Kids/School usam mesma base de ativos;
- ticket/MRR usam regra financeira canonica;
- reajuste medio filtra casos invalidos;
- retencao separa renovacoes realizadas, pendentes e antecipadas;
- LTV/MRR perdido usam valor/permanencia canonicos.

### 6.3 Pagina Alunos

Status: operacional vivo, alinhado com a regra canonica para cards-resumo.

Observacao:

- a listagem continua sendo operacional em `alunos`;
- isso e correto, porque a pagina de alunos e carteira viva;
- os cards de resumo foram alinhados para nao conflitar com Dashboard/Analytics.

### 6.4 Administrativo / Lancamentos

Status: migrado nos cards, resumo e detalhamento de retencao.

Fontes:

- `fetchKPIsAlunosCanonicos`
- `movimentacoes_admin`
- `calcularRetencaoOperacionalCanonica`
- `renovacoesAntecipadas`

Ajustes feitos:

- renovacoes automaticas caem como pendentes;
- renovacoes antecipadas ganharam aba propria;
- relatorio manual/preview usa os mesmos agregados;
- cards de MRR perdido, LTV e permanencia usam fallback canonico;
- breakdown de bolsistas e segundo curso foi preparado para explicar divergencias operacionais.

### 6.5 Relatorio diario administrativo por WhatsApp

Status: Edge Function ativa e atualizada.

Funcao:

- `relatorio-admin-whatsapp`

Fonte:

- chama `public.get_kpis_alunos_canonicos`;
- busca `movimentacoes_admin` para renovacoes/evasoes/avisos;
- aplica separacao de renovacoes confirmadas, pendentes e antecipadas;
- exibe breakdown de:
  - bolsistas integrais regulares + segundo curso;
  - matriculas ativas = base alunos + banda + segundo curso + coral;
  - segundo curso = alunos + extras, quando aplicavel.

Observacao:

- a funcao aparece ativa no projeto `ouqwbbermlzqqvtqwlul`.
- ainda assim, antes de deprecar tabelas antigas, recomenda-se rodar um relatorio automatico real em cada unidade e comparar com tela.

### 6.6 Fideliza+

Status: parcialmente saneado, ainda nao encerrado.

Fonte atual:

- `src/hooks/useFidelizaPrograma.ts` chama `get_programa_fideliza_dados`;
- `src/lib/fidelizaCanonico.ts` aplica overlay canonico em metricas trimestrais.

Risco:

- `get_programa_fideliza_dados` ainda usa `dados_mensais`, `movimentacoes_admin` e `renovacoes`;
- a funcao e `SECURITY DEFINER`, mas no banco esta sem `search_path` configurado;
- Q2 depende de Abril/Maio/Junho, e Abril/Maio ainda podem precisar saneamento de snapshot antes de validar o trimestre.

Decisao:

- nao deprecar nada de Fideliza+ ainda;
- fechar P0.2 depois de auditar e corrigir Abril/Maio.

### 6.7 Professores / Carteira

Status: operacional, fora do historico fechado.

Fonte:

- `get_carteira_professores`
- queries operacionais de `alunos`

Regra:

- nao tratar como KPI historico fechado;
- mostrar como carteira operacional ao vivo;
- se exibir total de alunos, usar definicao de pessoa unica quando for numero executivo.

Decisao:

- nao deprecar `get_carteira_professores`;
- P0.3 deve decidir contrato final.

### 6.8 Comercial / Leads / Funil

Status: fora do escopo deste pacote.

Nao foi migrado neste trabalho:

- leads;
- taxa de conversao;
- funil comercial;
- experimentais;
- matriculas comerciais;
- Programa Matriculador.

Essas areas continuam com suas proprias views/RPCs ate a frente P1/PComercial.

### 6.9 Relatorios IA / Gemini

Status: parcialmente protegido por wrappers canonicos, mas ainda precisa checklist antes de deprecacao.

O que foi saneado:

- `get_dados_relatorio_gerencial` agora injeta `kpis_gestao` a partir de `get_kpis_alunos_canonicos`;
- `get_dados_retencao_ia` tambem injeta o bloco canonico;
- as funcoes antigas foram preservadas como `_legacy_p01g`.

Como as Edge Functions Gemini funcionam:

- elas geralmente recebem um payload ja montado pelo frontend/RPC;
- portanto, a qualidade do relatorio depende da origem desse payload;
- `gemini-relatorio-gerencial` le os arrays `dados.kpis_gestao`, `dados.kpis_retencao` e `dados.kpis_comercial`.

Risco restante:

- cada Edge Function Gemini ainda precisa ser rastreada de ponta a ponta para confirmar quem monta o payload;
- Comercial/Leads ainda esta fora do P0.1;
- nao remover views legadas antes de verificar chamadas indiretas desses relatorios.

## 7. Evidencia tecnica atual

### 7.1 RPC de Campo Grande / Junho 2026

Consulta SELECT-only executada em 2026-06-10 via MCP Supabase no projeto `ouqwbbermlzqqvtqwlul`.

Resultado da RPC `get_kpis_alunos_canonicos(CG, 2026, 6)` no momento da consulta:

| Campo | Valor |
|---|---:|
| fonte | `vivo` |
| competencia_fechada | `false` |
| alunos_ativos | 480 |
| alunos_pagantes | 450 |
| ticket_medio | 389.94 |
| mrr | 175473.23 |
| matriculas_ativas | 546 |
| matriculas_banda | 39 |
| matriculas_2_curso | 27 |
| bolsistas_integrais | 16 |
| bolsistas_parciais | 14 |
| inadimplencia | 1.78 |
| reajuste_pct | 11.72 |

Observacao: esses numeros podem mudar no mesmo dia, porque Junho esta aberto e vivo.

### 7.2 RPC de Campo Grande / Maio 2026

Resultado da RPC `get_kpis_alunos_canonicos(CG, 2026, 5)`:

| Campo | Valor |
|---|---:|
| fonte | `dados_mensais` |
| competencia_fechada | `true` |
| alunos_ativos | 496 |
| alunos_pagantes | 470 |
| ticket_medio | 368.66 |
| mrr | 173270.20 |
| evasoes | 13 |
| churn_rate | 2.77 |
| matriculas_banda | 41 |

Isso confirma que mes fechado nao esta recalculando pela tabela viva.

### 7.3 Validacoes registradas durante a frente P0.1

Validacoes documentadas nos relatorios anteriores desta pasta:

| Validacao | Status registrado |
|---|---|
| Campo Grande/Junho aberto em Analytics | Ativos, pagantes, Kids/School, banda, novas e evasoes batendo na fonte viva |
| Campo Grande/Junho aberto em Dashboard | Pagantes, matriculas do mes, evasoes e ticket alinhados |
| Campo Grande/Junho aberto em Pagina Alunos | Matriculas, ativos, pagantes, segundo curso, banda e ticket alinhados |
| Campo Grande/Junho aberto em Administrativo | Ativos, pagantes, matriculas, bolsistas e novos alinhados |
| Campo Grande/Maio fechado | Lido de `dados_mensais`, sem recalculo vivo |
| Barra/Recreio Junho | Kids + School + sem classificacao fechando com alunos ativos |
| Build | `npm run build` registrado como passando nas etapas P0.1 anteriores |
| Relatorio WhatsApp | Edge Function ativa e usando RPC canonica para KPIs de alunos |

Observacao: para Junho, os numeros mudam conforme a operacao. A validacao importante nao e congelar o valor, e sim garantir que as telas e relatorios bebem da mesma regra.

## 8. Objetos que NAO devem ser removidos ainda

| Objeto | Status | Motivo |
|---|---|---|
| `vw_kpis_gestao_mensal` | candidato futuro | ainda pode existir em objetos legados/rollback |
| `vw_dashboard_unidade` | candidato futuro | ainda existe componente legado isolado |
| `vw_kpis_retencao_mensal` | candidato futuro | substituir so depois de auditar todos os consumidores |
| `renovacoes` | nao remover | `processar-matricula-emusys` ainda escreve nela como legado pendente |
| `get_programa_fideliza_dados` | nao remover | Fideliza+ ainda depende dela |
| `get_carteira_professores` | nao remover | Professores/Carteira ainda depende dela |
| `vw_kpis_comercial_mensal` | fora do escopo | Comercial/Leads ainda nao migrado |
| `vw_kpis_comercial_historico` | fora do escopo | usado em historico/simulador/comercial |
| `vw_unidade_anual` | fora do escopo | usada por simulador/historico |
| `*_legacy_p01g` | manter temporariamente | rollback tecnico ate estabilizacao |

## 9. Checklist para deprecacao segura

Antes de remover qualquer view/tabela/RPC antiga:

1. Confirmar zero referencia no frontend.
2. Confirmar zero referencia em Edge Functions.
3. Confirmar zero referencia em RPCs/functions/views dependentes.
4. Confirmar zero referencia em cron/n8n/automacoes externas.
5. Confirmar que existe substituto canonico documentado.
6. Rodar comparativo visual em Dashboard, Analytics, Administrativo e Alunos.
7. Rodar relatorio automatico real de cada unidade.
8. Marcar objeto como deprecated antes de remover.
9. Manter janela de observacao.
10. So depois executar `DROP` com rollback definido.

## 10. Pendencias reais

### P0.2 - Fideliza+

Antes de declarar Fideliza+ 100% canonico:

- auditar Abril/2026 e Maio/2026;
- corrigir snapshots ou dados de origem que alimentam Q2;
- ajustar `get_programa_fideliza_dados` para `search_path=public, pg_temp`;
- decidir se trimestre fechado deve usar somente snapshots mensais fechados;
- remover dependencia da tabela `renovacoes` se ela for legada.

### P0.3 - Professores / Carteira

Definir contrato:

- carteira operacional ao vivo;
- ou KPI historico por competencia;
- ou ambos com labels claros.

Enquanto isso, nao misturar carteira de professor com snapshot historico.

### P0.4 - Deprecacao de legados

Criar plano com:

- inventario SQL de dependencias;
- matriz objeto -> consumidor;
- rename temporario para `_deprecated`;
- janela de observacao;
- rollback.

### P0.5 - Snapshot Kids/School

Adicionar ao fechamento futuro:

- `alunos_kids`
- `alunos_school`
- `alunos_sem_classificacao`

Calculo deve usar idade na data de corte da competencia, nao apenas `idade_atual`.

### P0.6 - Unificacao definitiva frontend/backend

Hoje existe regra canonica no frontend e tambem no backend.

Para reduzir risco futuro:

- migrar gradualmente o frontend para consumir a RPC `get_kpis_alunos_canonicos` tambem no mes aberto;
- ou gerar um pacote compartilhado/testado que garanta equivalencia;
- manter teste automatizado de Campo Grande/Junho, Barra/Junho e Recreio/Junho para detectar drift.

## 11. Recomendacao para o Hugo

O nucleo de KPIs executivos de alunos foi saneado:

- cards principais;
- fontes de alunos;
- ticket/MRR;
- inadimplencia;
- renovacoes;
- reajuste;
- retencao;
- relatorio diario administrativo;
- protecao de mes fechado.

Mas o banco ainda nao deve ser limpo no escuro. A fase certa agora e:

1. Fechar Fideliza+ depois da auditoria de Abril/Maio/Q2.
2. Fechar contrato de Professores/Carteira.
3. Rodar inventario de dependencias de todas as views/tabelas legadas.
4. Marcar deprecated.
5. Observar.
6. Remover somente depois de zero referencia confirmada.

Resumo direto: **a fonte canonica de alunos ja existe e esta em uso nas telas principais; a limpeza do legado agora precisa ser feita por inventario de dependencias, nao por intuicao.**
