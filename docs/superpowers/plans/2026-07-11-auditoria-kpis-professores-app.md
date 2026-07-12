# Auditoria e convergencia dos KPIs de professores

## Objetivo

Fazer Dashboard, Analytics, Professores, modais e relatorios consumirem a mesma
fonte canonica por competencia: `get_kpis_professor_periodo_canonico`.

## Regras protegidas

- A media pedagogica exclui cursos marcados como projeto/banda.
- O numerador e a ocupacao distinta por aluno e turma regular.
- O denominador e a quantidade de turmas regulares elegiveis.
- Consolidado e calculado por soma dos numeradores dividida pela soma dos
  denominadores, nunca por media das medias dos professores.
- Conversao experimental usa a conciliacao canonica do Emusys.
- Retencao, evasao, presenca e MRR perdido preservam a competencia selecionada.

## Etapas

1. Criar helper tipado de leitura e consolidacao da RPC canonica.
2. Proteger em testes todos os consumidores ativos e o calculo ponderado.
3. Migrar Dashboard, Cadastro de Professores, Analytics e Carteira.
4. Alinhar os resumos dos modais com a RPC; manter listas detalhadas apenas como
   apoio operacional, sem recalcular KPI oficial localmente.
5. Auditar cada KPI contra as views legadas e registrar divergencias reais.
6. Rodar testes, build, comparacao no banco e verificacao visual.

## Fontes legadas que nao podem alimentar KPI oficial

- `vw_turmas_implicitas`
- `vw_kpis_professor_completo`
- `vw_kpis_professor_mensal`
- `vw_kpis_professor_historico`
- `vw_evasoes_professores`

Essas fontes podem continuar em fluxos operacionais que precisem de linhas
detalhadas, mas nao podem definir cards, rankings, graficos ou relatorios.
