# Fechamento Canonico Junho/2026 - Design

**Data:** 2026-06-30
**Status:** Draft para aprovacao
**Autor:** Codex + Luciano

## Problema

O LA Report chegou no fim de junho com as fontes vivas bem mais canonicas do que nos meses anteriores, mas ainda nao existe um fechamento historico completo e seguro para preservar junho depois da virada para julho.

O risco principal e conhecido: ao virar o mes, telas, relatorios e filtros historicos podem voltar a ler snapshot antigo, tabela incompleta ou regra legada. Isso ja causou perda/distorcao de dados em meses anteriores.

A auditoria read-only de 2026-06-30 mostrou:

- `dados_mensais` existe, mas esta incompleto para junho/2026.
- `competencias_mensais` nao tem junho/2026 fechado.
- `relatorios_diarios` esta vazio.
- `programa_matriculador_historico` esta vazio.
- `programa_fideliza_historico` esta vazio.
- Nao ha cron ativo de fechamento mensal/snapshot mensal.
- A fonte administrativa e a fonte executiva viva concordam em alunos ativos/pagantes, mas divergem em algumas contagens de matriculas/banda.
- A fonte executiva viva ainda retorna `tempo_permanencia`/`ltv_medio` como zero.

## Objetivo

Criar um fluxo de fechamento de junho/2026 que preserve, por unidade e consolidado, o retrato canonico do mes para:

- Dashboard;
- Analytics;
- pagina operacional do Comercial;
- pagina operacional do Administrativo;
- relatorio administrativo diario/mensal;
- relatorio gerencial;
- relatorio de coordenacao/professores;
- Matriculador+ LA;
- Fideliza+ LA;
- metas e comparativos historicos.

O fechamento precisa permitir voltar para junho depois da virada do mes e ver os mesmos numeros aprovados.

## Nao-objetivos

- Nao implementar faturamento realizado com juros/multa enquanto o Emusys nao liberar endpoint de faturas.
- Nao mudar regra de negocio de ativos, pagantes, trancados, evasao, nao renovacao, banda ou segundo curso sem aprovacao do Luciano.
- Nao reabrir ou recalcular meses anteriores nesta fase.
- Nao criar tabela redundante se uma tabela canonica existente resolver o dominio.
- Nao usar `dados_mensais` como verdade completa se ele so comportar KPIs compactos.
- Nao rodar sync, backfill ou snapshot automatico sem preview e aprovacao humana.

## Decisoes De Negocio Ja Alinhadas

### Corte oficial

O corte oficial de junho deve acontecer perto de 22:00 BRT.

Como os crons de `sync-matriculas-emusys` rodam depois disso, o fechamento precisa registrar explicitamente:

- horario do corte;
- fonte usada;
- payload/hash do que foi fechado;
- responsavel;
- unidade;
- status.

### Financeiro de junho

Ate o endpoint de faturas existir, o financeiro de junho usa:

- parcela canonica;
- faturamento previsto;
- status de inadimplencia disponivel hoje no contrato/matricula.

Nao entram como realizado oficial:

- valor realmente pago;
- juros;
- multa;
- perda de desconto por atraso.

### Alunos administrativos

Para o relatorio administrativo operacional:

- aluno regular trancado continua na carteira conforme regra atual;
- banda/projeto conta apenas quando ativo;
- trancamento de banda nao deve inflar matricula ativa de banda;
- transferencia deve aparecer separada de matricula nova comercial.

### Historico/LTV

Evadidos historicos continuam importantes para tempo de permanencia e LTV.

Nao se deve apagar ou reclassificar historico apenas para bater com nomenclatura do Emusys. O LA Report mantem sua regra de negocio, e o Emusys entra como fonte externa a ser traduzida.

### Programas

Matriculador+ LA e Fideliza+ LA entram no fechamento como dominios proprios. Eles nao devem ficar escondidos dentro de um payload generico sem leitura especifica.

## Fontes Canonicas Por Dominio

| Dominio | Fonte viva para preview | Destino historico preferido | Observacao |
| --- | --- | --- | --- |
| Administrativo operacional | `get_kpis_alunos_admin_operacional` | `dados_mensais` + complemento se necessario | Fonte validada para ativos/pagantes/trancados/matriculas administrativas |
| Executivo alunos/financeiro previsto | `get_kpis_alunos_canonicos` | `dados_mensais` + complemento se necessario | Bloqueado ate resolver LTV/tempo e divergencia de matriculas/banda |
| Comercial | `get_kpis_comercial_canonicos_v2` | snapshot/complemento de fechamento | Deve preservar leitura Emusys + presenca/vinculo |
| Relatorio administrativo | `relatorio-admin-whatsapp`/RPCs internas atuais | snapshot textual + estruturado | Precisa guardar texto gerado e dados estruturados |
| Relatorio gerencial | `get_dados_relatorio_gerencial` | snapshot/complemento de fechamento | Deve preservar KPIs usados no PDF/WhatsApp |
| Coordenacao/professores | `get_dados_relatorio_coordenacao` e fontes de professores | snapshot/complemento de fechamento | Antes de fechar, auditar Exp -> Mat, evasoes, presenca e health |
| Matriculador+ LA | `get_programa_matriculador_dados` | `programa_matriculador_historico` | Tabela existe, esta vazia; funcao viva de salvar mensal nao apareceu |
| Fideliza+ LA | `get_programa_fideliza_dados` | `programa_fideliza_historico` | Tabela existe, esta vazia; funcao viva trimestral existe |
| Metas | `metas`, `metas_kpi`, configs dos programas | snapshot de resultado contra meta | Nao sobrescrever meta; capturar a meta vigente no fechamento |

## Arquitetura Proposta

### 1. Preview read-only

Antes de qualquer escrita, gerar preview por unidade e dominio.

O preview deve trazer:

- fonte;
- horario da leitura;
- unidade;
- payload resumido;
- payload completo;
- diferenca contra `dados_mensais` quando existir;
- alertas/bloqueios.

### 2. Validacao humana

O preview precisa mostrar claramente:

- "aprovavel";
- "bloqueado";
- "precisa revisar".

Junho so pode ser persistido quando:

- ativos/pagantes/matriculas/banda estiverem reconciliados;
- LTV/tempo de permanencia nao estiverem zerados indevidamente;
- comercial estiver coerente com os relatórios validados;
- Matriculador+ LA e Fideliza+ LA tiverem fonte definida;
- as metas vigentes estiverem capturadas.

### 3. Persistencia por destino correto

Nao existe uma unica resposta para tudo:

- `competencias_mensais` governa status de fechamento.
- `dados_mensais` guarda KPIs compactos historicos.
- `programa_matriculador_historico` guarda resultado do Matriculador+ LA.
- `programa_fideliza_historico` guarda resultado do Fideliza+ LA.
- Se faltar retrato completo para relatorios/listas/hashes, criar uma tabela complementar unica de snapshot mensal por dominio.

### 4. Bloqueio contra regressao

Depois de fechado:

- filtro historico de junho deve ler o fechamento, nao fonte viva;
- julho continua vivo;
- writers legados nao podem sobrescrever junho sem retificacao formal;
- qualquer retificacao deve gerar auditoria com antes/depois/diff.

## Invariantes

Estas regras nao podem quebrar:

1. Campo Grande, Barra e Recreio devem fechar juntas ou com status explicito por unidade.
2. Mes fechado nao pode ser recalculado silenciosamente.
3. Tela historica nao pode fazer fallback vivo silencioso para competencia fechada.
4. `dados_mensais` nao pode ser atualizado com regra antiga.
5. O fechamento deve preservar a fonte e o hash do payload.
6. Programas e metas nao podem ficar fora do snapshot de junho.
7. Retificacao precisa ser explicita e auditada.

## Bloqueios Antes Da Implementacao

### B1 - Divergencia administrativa x executiva

Baseline atual:

- Campo Grande:
  - admin: `matriculas_ativas=539`, `matriculas_banda=44`;
  - executivo: `matriculas_ativas=540`, `matriculas_banda=45`.
- Recreio:
  - admin: `matriculas_ativas=417`, `matriculas_banda=58`;
  - executivo: `matriculas_ativas=414`, `matriculas_banda=55`.

Antes de persistir junho, decidir qual fonte manda por tipo de KPI ou alinhar as RPCs.

### B2 - LTV/tempo zerado

`get_kpis_alunos_canonicos` retorna `tempo_permanencia=0` e `ltv_medio=0`.

Isso nao pode virar snapshot oficial de retencao/LTV.

### B3 - `dados_mensais` antigo/incompleto

Junho/2026 em `dados_mensais`:

- nao tem Barra;
- Campo Grande e Recreio estao antigos;
- bolsistas e ticket aparecem incompletos;
- nao pode ser fonte oficial atual.

### B4 - Historicos dos programas vazios

`programa_matriculador_historico` e `programa_fideliza_historico` estao vazios.

Fechamento de junho precisa decidir como popular sem duplicar arquitetura.

## Criterios De Aceite

### Antes de fechar

- Existe tela/comando de preview read-only por unidade.
- Preview mostra as tres unidades.
- Preview explicita fonte e bloqueios.
- Nao existe escrita em producao ao gerar preview.

### Durante fechamento

- Fechamento grava status em `competencias_mensais`.
- Fechamento grava KPIs compactos em `dados_mensais` com valores aprovados.
- Fechamento grava Matriculador+ LA no historico proprio.
- Fechamento grava Fideliza+ LA no historico proprio.
- Se existir tabela complementar, ela grava payload completo por dominio e hash.

### Depois do fechamento

- Filtro junho retorna sempre o mesmo retrato aprovado.
- Filtro julho continua vivo.
- Relatorios administrativo, comercial, gerencial e coordenacao conseguem ser gerados para junho sem depender da base viva.
- Retificacao de junho exige fluxo auditado.

## Plano De Execucao Recomendado

1. Resolver B1 e B2 sem escrever fechamento.
2. Criar preview de fechamento por unidade/dominio.
3. Comparar preview com relatorios ja validados.
4. Decidir se tabela complementar e necessaria.
5. Implementar RPC guardada de fechamento.
6. Implementar leitura historica no front.
7. Fazer fechamento assistido de junho perto de 22:00 BRT.
8. Validar dashboards e relatorios voltando para junho.

## Perguntas Para Aprovacao

1. Para contagem historica de matriculas/banda, a fonte oficial deve ser a administrativa operacional ou a executiva?
2. O relatorio de coordenacao/professores precisa entrar no fechamento de junho agora, ou pode ser fechado em uma segunda leva depois que a auditoria de professores terminar?
3. O Fideliza+ LA deve fechar junho como parte do trimestre atual ou precisa de snapshot mensal tambem?
4. A UI de fechamento deve ficar acessivel apenas para Luciano/Hugo/admin-master?
