# Métricas e Critérios — LA Music Performance Report

> **Propósito:** dicionário canônico das métricas do sistema — o que cada número significa e **exatamente quais filtros** entram no cálculo. Use antes de escrever query/RPC, montar KPI ou relatório.
>
> **Manutenção (obrigatória):** ao mudar a regra de cálculo de qualquer métrica, atualizar aqui no mesmo commit. Onde a página usa cada métrica → [`docs/MAPA-SISTEMA.md`](./MAPA-SISTEMA.md). Regras de negócio detalhadas → `.claude/memory/regras-negocio.md` e skill `sol-la-report-business-rules`.
>
> ⚠️ **Antes de "corrigir" qualquer critério aqui:** mudança em métrica afeta dashboards e metas. Validar com SELECT-only e confirmar com o Hugo (regra de colaborador). Ver seção [Inconsistências percebidas](#inconsistências-percebidas-a-decidir) no fim.
>
> Última atualização: 2026-07-30.

## Conceitos-base

- **`alunos` = matrículas, não pessoas.** Uma pessoa = `nome` + `unidade_id`. 2 cursos = 2 linhas (1 com `is_segundo_curso=false` + N com `true`). Contagens "por pessoa" deduplicam por `nome` (+`unidade_id`/`data_nascimento`).
- **Unidades:** CG (`2ec861f6…`), Recreio (`95553e96…`), Barra (`368d47f5…`).
- **Timezone:** BRT (UTC-3).

---

## Valor da parcela (mensalidade) — regra comercial

**Fórmula canônica (desde 2026-06-23, commits do Luciano `befdbbc`/`dfe349e`):**
```
valor_parcela = valor_cheio − desconto_condicional
```
- `valor_cheio` = `contrato_atual.valor_mensalidade` da API Emusys.
- `desconto_condicional` = subtraído (inclui a bolsa, no caso de bolsista parcial).
- **`desconto_fixo` NÃO entra na parcela** — fica gravado/auditado na coluna `alunos.desconto_fixo`, separado. É um desconto de pontualidade tratado à parte.
- Existe `liquido_financeiro = cheio − fixo − cond` **só para auditoria/divergência** (não é a parcela comercial).
- Aplicado nas edges `sync-matriculas-emusys` e `processar-matricula-emusys` (carimba `regra_valor_parcela='valor_mensalidade_menos_desconto_condicional'`). Se a parcela der ≤ 0 ou cheio ≤ 0 → fila `valor_divergente` (revisão humana).
- **Backfill 2026-06-23:** 535 alunos ativos/trancados (CG 399, Barra 116, Recreio 20) estavam na fórmula antiga (`cheio − fixo − cond`) e foram recalculados — `desconto_fixo` preservado. Nenhum de banda, nenhum travado, nenhum zerado.
- ⚠️ Regra **anterior** (até 22/06) era `cheio − fixo − cond` — obsoleta.

---

## Alunos

### Estado operacional da matrícula (Emusys v1.3.1)

A fonte atual é `vw_alunos_estado_operacional_v131`, resolvida por
`unidade_id + emusys_matricula_id`. O valor local de `alunos.status` é somente
compatibilidade quando ainda não existe estado Emusys associado.

| Estado Emusys | Estado operacional | Regra atual |
|---|---|---|
| `ativa` | `ativo` | entra na base viva |
| `trancada` | `trancado` | aparece em **Trancados agora**, fora dos denominadores ativos |
| `inativa` + `interrompida` | `evadido` | interrupção definitiva |
| `inativa` + `concluida` | `inativo` | contrato concluído/não renovação, não evasão |
| ausente ou ambíguo | `desconhecido` | auditoria; nunca presume ativo ou evasão |

Somente matrícula com status Emusys resolvido como `ativa` entra em carteira,
financeiro atual, presença, Health Score e churn atual. Trancamentos no período
continuam vindo de `movimentacoes_admin` e não são o mesmo indicador que
**Trancados agora**.

### Aluno pagante
`entra_financeiro_ativo = true` **E** `conta_como_pagante = true` **E**
`is_segundo_curso != true`.
- Fonte: `vw_alunos_estado_operacional_v131`. RPCs canônicas:
  `get_kpis_alunos_admin_operacional`,
  `get_kpis_alunos_financeiro_vivo_canonico` e
  `get_kpis_alunos_canonicos`.
- Bolsista integral **não** é pagante; bolsista parcial conta conforme `conta_como_pagante`.

### Aluno ativo / Carteira viva
`entra_base_ativa = true`, deduplicado pela identidade canônica de pessoa na
unidade. `trancado`, `aviso_previo`, `evadido`, `inativo` e `desconhecido` não
entram na carteira viva.
- A carteira do professor exige também `entra_carteira_professor = true`.
- Leitura atual: `get_alunos_ativos_atuais_canonicos` e
  `get_kpis_alunos_vinculos_vivo_canonico`.

### Bolsista
`tipo_matricula.codigo ∈ {BOLSISTA_INT (id 3), BOLSISTA_PARC (id 4)}`. Bolsista de **banda/projeto** é tratado à parte (não infla bolsistas regulares): bolsista real exige `is_projeto_banda != true` (`AlunosPage.tsx:630-633`).

### Segundo curso
`is_segundo_curso = true`. Mesma pessoa, curso adicional. **Excluído** de: pagantes, matrículas novas canônicas, ticket médio (dedup por pessoa). Conta separado (`total_bolsistas_integrais_segundo_curso` em `TabGestao`).

### Banda / Projeto
`cursos.is_projeto_banda = true`. **Exclui** o aluno de: médias de turma, carteira, score do professor, matrículas canônicas, LTV.

### Fonte histórica de uma competência encerrada (31/07/2026)

Ao ler mês passado, **a fonte canônica é `fechamento_mensal_snapshots`** (status
`aprovado`), não o cálculo vivo. As RPCs leem o estado **atual** do banco — recalcular
uma competência encerrada devolve o número de hoje, não o do fechamento.

Divergência medida em 31/07/2026 para junho, Campo Grande:

| Fonte | Alunos ativos |
|---|---|
| Snapshot (30/06) | **462** |
| `dados_mensais` | 462 |
| Recalculado ao vivo hoje | **422** |

Os 40 de diferença são regra nova (v1.3.1 do Emusys, 29/07: trancamento vigente saiu de
"ativa" — CG tem 18) somada a evasão real de julho. ⚠️ **Junho e julho não são
comparáveis** em alunos ativos sem essa nota.

⛔ Hoje **nenhuma tela lê o snapshot** — as que acertam acertam via `dados_mensais`. Ver
`docs/MAPA-SISTEMA.md` → "Fechamento mensal".

### Ticket médio (mensalidade)
Média de `valor_parcela` dos alunos com `entra_financeiro_ativo = true` **E**
`tipo_matricula.entra_ticket_medio = true` **E** `valor_parcela > 0`,
deduplicado por pessoa canônica e unidade.
- RPC: `get_kpis_alunos_financeiro_vivo_canonico`.
- ⚠️ A dedup por pessoa **soma** os cursos da pessoa no numerador mas conta a pessoa
  **uma vez** no denominador — então segundo curso **eleva** o ticket (é o que o
  `tipos_matricula` descreve: "eleva ticket médio, conta como 1 aluno"). Isso
  contradiz o texto de "Segundo curso" abaixo, que diz "excluído do ticket médio".
  Constatado no código em 31/07/2026; qual dos dois é a intenção não foi confirmado.

### MRR (mensalidade recorrente)
**Mesma base e mesmo filtro do ticket médio** — MRR é o numerador do ticket:
```
MRR = Σ valor_parcela
  WHERE tipos_matricula.entra_ticket_medio = true
    AND valor_parcela > 0
    AND arquivado_em IS NULL
    AND vw_alunos_estado_operacional_v131.entra_base_ativa = true
    AND (data_matricula IS NULL OR data_matricula <= data_corte)
    AND (data_saida  IS NULL OR data_saida  >  data_corte)
  agrupado por pessoa (nome + unidade)
```
com `valor_parcela = valor_cheio − desconto_condicional` (fórmula canônica acima).
- RPC: `get_kpis_alunos_financeiro_vivo_canonico`.
- **Banda, bolsista integral e bolsista parcial ficam de fora** — pelo flag, não por
  pagarem zero. Bolsista parcial paga e ainda assim não entra.
- `get_carteira_professores.mrr_total` segue esta regra desde 31/07/2026, sem a dedup por pessoa (ver abaixo).

### Ticket médio da carteira do professor (31/07/2026)
Mesmo critério de `entra_ticket_medio`, **sem a dedup por pessoa**: na carteira por
professor, aluno com 2 cursos é carteira dos 2 professores — deduplicar faria um deles
perder o aluno. Segundo curso (`entra_ticket_medio = true`) entra nos **dois** lados.
- RPC: `get_carteira_professores` → `ticket_medio`, com o denominador exposto em
  `alunos_ticket` (o card agregado divide `mrr_total` pela soma de `alunos_ticket`;
  média de médias não é média, e o headcount inclui quem não entra no ticket).
- **`mrr_total` segue a regra canônica desde 31/07/2026** (decisão do Luciano:
  "bolsista parcial não conta como aluno pagante"). É o numerador do ticket — mesmo
  filtro. Antes somava todo pagante e inflava R$ 2.433,50. A coluna `mrr_ticket`,
  criada horas antes no mesmo dia, virou redundante e foi removida.
- **Arquivado (`arquivado_em`) fora da base.** `fn_aluno_entra_base_ativa_v131` não
  filtra a lixeira; havia 5 matrículas arquivadas contando como carteira e somando
  R$ 1.210,00 de MRR. A RPC filtra explicitamente.
- **Trancado e inativo nunca estiveram aqui.** `vw_alunos_estado_operacional_v131` já
  os marca `entra_base_ativa = false`. ⚠️ Não confundir com `alunos.status`, que é só
  fallback e fica defasado: em 31/07/2026 havia 6 matrículas com status local
  `trancado`/`inativo` que o Emusys reportava como `ativa`.
- ⚠️ `total_alunos` é o **headcount inteiro** (inclui banda e bolsista) — é quantos
  alunos o professor atende. Nunca usar como denominador de ticket.
- Histórico: até 31/07/2026 a RPC aproximava a regra por `valor_parcela > 0` e o front
  ainda descartava esse valor, dividindo o MRR pelo headcount. Diluía o ticket de 24
  professores (Ramon Pina aparecia com R$ 108,59 tendo R$ 434,36).

### Ticket médio (passaporte / matrícula)
Média de `valor_passaporte > 0` das matrículas novas canônicas do período (exclui 2º curso, banda).
- `DashboardPage.tsx:435`, `ComercialPage.tsx:350`.

### Status de pagamento
`status_pagamento ∈ {em_dia, inadimplente, parcial, sem_parcela}`. Aberto/indefinido = `null`/`'-'`. Governança de `sem_parcela` em `Alunos/statusPagamentoGovernanca.ts` (considera presença recente ≤30 dias).

### Inadimplência operacional (regra nova, jun/2026)
Conta como inadimplente **somente** `entra_financeiro_ativo = true` **E**
`status_pagamento = 'inadimplente'` **E** `valor_parcela > 0`. **Trancado,
evadido, inativo e desconhecido NÃO entram** no alerta/contagem de
inadimplência operacional. O `sync-matriculas-emusys` não propõe
`status_pagamento` para matrícula não ativa.
- Motivo: inadimplentes haviam "saltado" de ~16 p/ ~40 por incluir trancado/evadido/histórico. Fonte: commit `restrict delinquency to active students`.
- **BANDA e bolsista integral permanecem `sem_parcela`** mesmo quando o Emusys retorna `em_dia` (migration `p08k`).

### Classificação de bolsista (KPI / MRR)
Usa o **`tipo_matricula_id` canônico** (`BOLSISTA_INT`/`BOLSISTA_PARC`), **não** o `tipo_aluno` legado — que pode estar contaminado (ex.: aluno marcado `bolsista_integral` em `tipo_aluno` mas pagante regular no contrato). RPC `get_kpis_alunos_admin_operacional`. Fonte: migration `admin_operacional_bolsista_por_tipo_canonico`.

### Kids vs School
Por idade: `idade ≤ 11` → **LA Music Kids**; `idade ≥ 12` → **LA Music School**. `TabGestao.tsx:811-812`. (Apenas alunos regulares — exclui banda e 2º curso.)

---

## Matrículas (novas)

**Matrícula nova canônica** = matrícula do período que **NÃO** é: 2º curso (`is_segundo_curso`), bolsista (`BOLSISTA_INT/PARC`), banda (`is_projeto_banda`), nem Canto Coral (`cursos.nome` contém "canto coral").
- `DashboardPage.tsx:207-209`, `TabGestao.tsx:736-739`, lib `comercialMatriculasCanonicas`.
- Fonte canônica atual: conciliação Emusys (`movimentacoes_admin` + `sync-matriculas-emusys`). Forms de Entrada gravam em `movimentacoes` legada.

---

## Comercial / Funil

### Etapas do lead (pipeline)
`status`: `novo → agendado/experimental_agendada → experimental_realizada / experimental_faltou → convertido/matriculado` (ou `arquivado`). Posição no pipeline dinâmico: `etapa_pipeline_id` (tabela `crm_pipeline_etapas`). Conciliação tem `etapa_canonica`.

### Experimental realizada
Depende do contexto:
- **Operacional/canal (inclui visita):** `status ∈ {experimental_realizada, compareceu, visita_escola}` (`DashboardPage.tsx:275`, `TabComercialNew.tsx:407`).
- **Por professor (estrito):** apenas `status = 'experimental_realizada'` (`TabComercialNew.tsx:387`).
- **Faltou:** `status = 'experimental_faltou'`.

#### Snapshot operacional Emusys

O adaptador puro `_shared/experimental-snapshot.ts` materializa uma linha por
aula experimental + participante. A chave de negócio é escopada pela unidade e
prefere os IDs externos `id_lead` e `id_aluno`; nome e telefone não criam
vínculo canônico. O `raw_key` também inclui a execução para preservar cada
fotografia recebida.

Na normalização temporal, cancelamento sempre prevalece. Antes do início da
aula em `America/Sao_Paulo`, inclusive quando o Emusys envia
`presenca='ausente'`, a situação é `agendada`. Depois do início,
`presente`/`matriculado` contam como presença, `faltou`/`ausente` como falta e
qualquer outro valor fica `sem_status`. A paginação só libera o lote quando
todas as páginas de `/aulas` terminam sem erro.

O denominador operacional do Emusys considera exclusivamente linhas com
`snapshot_ativo=true`. Uma nova execução completa é serializada por unidade,
inativa a fotografia vigente de cada chave recebida e insere uma nova versão,
sem sobrescrever `raw_key` ou execução anteriores. Enriquecimentos
locais conhecidos são herdados pela nova versão; `linhas_inativadas` conta
somente chaves ausentes do lote, enquanto `linhas_versionadas` informa as
chaves recebidas que ganharam nova fotografia. Linha histórica inativa nunca
volta a contar. A RPC operacional publica no `resumo`
`snapshot_atualizado_em`, `snapshot_execucao_id`, `snapshot_linhas_inativas` e
`snapshot_status`, permitindo que o consumidor diferencie zero real de
snapshot ausente ou sem cobertura completa do período.
Na leitura mensal, cobertura completa significa do primeiro dia do mês até
a data de referência limitada ao último dia da competência, mais sete dias.
Assim, um relatório de 30/07 exige cobertura até 06/08; uma consulta posterior
à competência limita a referência a 31/07 e exige, no máximo, 07/08.

A leitura authenticated com unidade explícita exige o guard `comercial.ver`.
Quando a unidade é nula, a RPC agrega somente as unidades aprovadas
individualmente pelo mesmo guard; `service_role` pode agregar todas. O frescor
agregado é `completo` apenas quando cada unidade incluída possui execução com
cobertura: o ID da execução fica nulo quando há mais de uma, o timestamp é o
mais antigo entre as coberturas escolhidas e as linhas inativadas são somadas.
A policy raw mostra somente versões ativas de unidades autorizadas. Mesmo
nessas linhas, `authenticated` recebe apenas `id`, `aluno_nome`, `data_aula`,
`horario_aula` e `situacao_operacional`; contatos, responsável, professor,
payload e colunas de vínculo ficam privados ao `service_role`. O payload
histórico foi saneado e novas versões persistem uma allowlist técnica:
`schema_version`, data, horário, cancelamento, ID da aula e `id_lead/id_aluno`.
Campos extensíveis do Emusys, anotações, e-mails e telefones não entram no
JSON. Durante o rollout, o writer legado ainda pode gravar sem
`participante_chave`, mas essas linhas nascem inativas e não aparecem aos
leitores authenticated. O writer canônico exige identidade e usa
exclusivamente a RPC de aplicação.

O writer canônico é o modo `experimentais` de `sync-presenca-emusys`, acessível
somente ao bearer interno. Usuário autenticado comum pode solicitar apenas
`presenca` para uma unidade exata autorizada por
`pode_sincronizar_presenca_emusys_v1`; modos internos e alvo múltiplo falham
antes do cliente administrativo e dos tokens do provedor. O chamador interno
informa uma única unidade por UUID e um intervalo explícito de até
45 dias; para o relatório mensal, a janela esperada é o início da competência
até D+7. Todas as páginas precisam terminar antes da chamada única a
`aplicar_snapshot_experimentais_emusys_admitido_v1`. A reconciliação posterior usa
somente `unidade + id_lead/id_aluno/aula` e nunca cria vínculo por nome ou
telefone. O modo `metadados` reaproveita exatamente as aulas que acabou de
gravar em `aulas_emusys`, sem segundo GET. Sua RPC de publicação adia o raw e
não reconcilia o lote quando existe uma leitura admitida sobreposta; fora
dessa janela, continua publicando normalmente. Falha real do snapshot torna a
chamada inteira malsucedida. Respostas operacionais publicam apenas execução e
contagens, sem PII ou payload bruto. O curso reconciliado depende do de-para
`curso_emusys_depara` escopado pela unidade; ausência de de-para resulta em
`curso_id = null`, sem fallback textual. Horários são comparados em
`HH:mm:ss`, derivados de uma normalização única que aceita o timestamp Emusys
com ou sem segundos.

A conciliação comercial P24 usa exclusivamente as linhas raw vigentes tanto na
evidência lateral de cada evento quanto nos totais por unidade. O vínculo usa
as colunas materializadas `emusys_lead_id` e `emusys_aluno_id`; payload, nome e
telefone não participam da identidade. Aluno Emusys já cadastrado é resolvido
por `alunos.emusys_student_id` e fica fora do denominador comercial quando não
houve conversão na competência. Um evento é
substituído por reagendamento quando existe, para o mesmo lead, um timestamp
posterior (`data_experimental + horario_experimental`) em estado conhecido:
agendada, realizada, convertida/matriculada, falta ou cancelamento. Presença ou
falta raw ativa na linha anterior prevalece sobre essa heurística, preservando
duas experimentais legítimas. A fachada mantém o cap de matrículas comerciais
P21, a deduplicação pequena P22 e a validação de usuário/unidade P23; o payload
identifica a evidência como `snapshot_ativo_p24`. O valor bruto `ausente` não
cria falta quando `situacao_operacional` é `agendada` ou `cancelada`.

### Taxa de conversão Experimental → Matrícula
- **No Dashboard/Comercial (frontend):** denominador `experimental_realizada = true`; numerador `status ∈ {matriculado, convertido}` (`DashboardPage.tsx:316-327`).
- **Canônica (professor):** RPC `get_experimentais_professor_canonicos_v1` + fonte `lead_experimentais` (1 linha por aula, presença real) — substituiu a contagem por `leads` que inflava a taxa. Denominador = `status ∈ {experimental_realizada, convertido}`; numerador = realizadas cujo lead converteu. Ver CLAUDE.md (Módulo de Professores).
- ⚠️ `taxa_exp_mat` e `taxa_conversao_exp` continuam indisponíveis para configuração de meta (`MetasPageNew.tsx:65/75`), mas isso não bloqueia o KPI diário. Havendo denominador, o relatório publica sempre a taxa e a fração da conciliação vigente; pendências aparecem como aviso `N pendências em auditoria`. Sem denominador, publica `SEM BASE`. O texto diário nunca usa `BLOQUEADA`.

### Orquestração e fontes do relatório comercial diário

Para cada unidade, `relatorio-admin-whatsapp` determina a data de referência em
`America/Sao_Paulo` e passa pelo gate
`emusys_experimentais_refresh_admissoes`. A chave é
`unidade + intervalo + origem + bucket de cinco minutos`; prévia e cron são
origens independentes. Uma chamada atualiza, equivalentes aguardam ou reutilizam
a mesma execução completa, e nenhuma delas abre segundo GET ou segunda versão.
Falha registrada bloqueia outro acesso ao provedor até o lease vencer. Lease
expirado permite recuperação; se a aplicação terminou antes de uma
interrupção na finalização, a própria admissão detecta a execução completa e a
reutiliza. Depois o fluxo atualiza o snapshot Emusys do primeiro dia do mês até
D+7 e aguarda sua conclusão antes de qualquer leitura. A geração é interrompida
se a resposta do sync for inválida ou se os agregados mensal e diário não
confirmarem `snapshot_status='completo'`, timestamp de atualização e o mesmo ID
de execução admitido. Não existe fallback para zero ou base transacional
parcial.

Atualização e reuso passam por `proteger_leitura_snapshot_experimentais_v1`
imediatamente antes das leituras. Sob o mesmo advisory lock do writer, a RPC
confirma em `emusys_experimentais_snapshot_publicacoes_vigentes` que execução e
cobertura continuam vigentes. Se o cron publicou primeiro, a admissão é
promovida atomicamente para uma execução nova; caso contrário, recebe lease de
sessenta segundos. Writers admitidos sobrepostos respeitam o mesmo lease e
aguardam com o lote já coletado, sem repetir o GET. As leituras paralelas têm
timeout de 45 segundos e a confirmação final, dez segundos, mantendo o limite
total abaixo desse lease.

O refresh servidor-servidor propaga um deadline absoluto de 160 segundos. A
paginação completa do Emusys tem teto de 60 segundos, a repetição do writer
protegido usa no máximo 70 segundos e preserva 30 segundos para carregar os
de-paras e reconciliar. As chamadas Supabase desse worker compartilham o mesmo
sinal de cancelamento. O chamador usa 180 segundos, deixando margem para a edge
encerrar e responder sem continuar órfã após o timeout externo.

Depois do preflight, as leituras canônicas são paralelas: KPIs mensais e diários
vêm de `get_kpis_comercial_canonicos_v2`; conversão e pendências, de
`get_conciliacao_experimentais_v2`; realizadas, faltas, agenda e frescor, de
`get_experimentais_emusys_operacional_v1`; metas, de `metas_kpi`; registros do
dia, de `leads`, `lead_experimentais` e `alunos`, usando intervalo semiaberto
BRT `[00:00, 00:00 do dia seguinte)`; e a lista detalhada, da coorte canônica de
novas matrículas. A mesma coleção agrupada `matriculasNovas` alimenta o total de
matrículas, todos os itens detalhados e os tickets de parcelas e passaportes.
Qualquer lookup por ID externo inclui primeiro `unidade_id`, inclusive quando o
gerador usa `service_role`, que ignora RLS. A agenda raw lê somente a execução
exata devolvida pelo preflight e valida o ID presente em cada linha. Uma segunda
leitura operacional após a consulta confirma que a execução não foi substituída
concorrentemente; divergência interrompe a geração em vez de misturar snapshots.

Na agenda futura, o curso é resolvido apenas por IDs estáveis e escopados pela
unidade: disciplina específica do snapshot, vínculo direto da experimental,
vínculo do lead Emusys na experimental e, por último, curso do lead. Nome e
telefone são somente exibição e nunca fazem join. A correção não inclui backfill
nem ajuste manual de dados de produção; em runtime, a escrita anterior à leitura
é exclusivamente a aplicação atômica do snapshot vigente.

No cron, `fila_relatorios_whatsapp.tipo_relatorio` diferencia
`relatorio_admin` de `relatorio_comercial`. A chave diária é
`tipo_relatorio + unidade_id + jid + data_dia`: os dois relatórios podem coexistir
no mesmo destino e cada tipo continua idempotente. Os modos `dry_run`,
`dry_run_comercial`, manual e cron mantêm seus contratos anteriores.

Na interface comercial, o relatório diário não recalcula métricas. Para uma
unidade específica, `ComercialPage.tsx` envia `modo='dry_run_comercial'`, a
unidade e `data_referencia` à edge e publica exatamente o `texto` de uma resposta
com `success=true`. A referência é obrigatória no `dry_run_comercial`: somente
`YYYY-MM-DD` com calendário real é aceito como data civil, sem convertê-la em um
instante artificial. Ausência, timestamp, offset ou data impossível retornam
`400`. Para `2026-07-30`, o documento usa o dia 30/07 e o snapshot cobre
`2026-07-01` a `2026-08-06`. O instante real de geração em
`America/Sao_Paulo` define a hora, o rodapé e o corte das próximas experimentais;
ele pode ser injetado somente no gerador interno para teste, nunca pelo payload.
O cron sem campo deriva data e hora desse instante. As consultas diárias por
`created_at` usam limites UTC derivados do início civil no fuso IANA, inclusive
em datas históricas com horário de verão. Falha da edge, resposta sem sucesso ou
texto ausente limpam a
prévia e mantêm copiar/enviar desabilitados; uma troca de unidade invalida a
resposta pendente. O texto exibido é também o único texto usado pela cópia e pelo
enfileiramento manual. Cada texto guarda sua origem (`tipo + unidade + período +
datas + competência`): uma mudança A→B ou A→todos bloqueia o uso imediatamente,
e o envio usa a unidade dessa origem, nunca a seleção corrente. Geração e envio
possuem IDs distintos para que respostas antigas não restaurem sucesso, erro ou
spinner depois de uma troca ou regeneração.

### Tickets do relatório comercial diário

O relatório diário calcula duas métricas separadas sobre a mesma coorte de
matrículas comerciais agrupada que alimenta a lista detalhada:

```text
Ticket médio das parcelas = soma das parcelas consolidadas positivas
                            / grupos com parcela positiva

Ticket médio dos passaportes = soma dos passaportes positivos
                               / grupos com passaporte positivo
```

O agrupamento ocorre antes do cálculo: um segundo curso pode acrescentar uma
parcela ao valor consolidado, mas não cria outro denominador. Um parser
monetário único aceita números e os formatos textuais reais do backend, como
`460,00`, `1.234,56` e `R$ 450,00`. Zero, nulo e valor inválido ficam fora
somente do denominador correspondente. Os valores e a soma bruta não são
arredondados antes da divisão; soma e média publicadas recebem duas casas
somente ao final. Internamente, o parser representa cada valor por inteiro
decimal (`BigInt + escala`), soma e divide de forma racional e aplica
arredondamento decimal half-up nos centavos; não usa `Math.round` sobre ponto
flutuante. A meta `metas_kpi.tipo='ticket_medio'`
é exibida exclusivamente ao lado do ticket das parcelas; não há meta canônica
de passaporte. Referência de aceite da Barra em julho/2026: parcelas
`R$ 6.819,00 / 16 = R$ 426,19` e passaportes
`R$ 7.142,00 / 16 = R$ 446,38`.

Essa regra é específica da coorte de novas matrículas do relatório comercial e
não substitui a regra financeira por fatura/competência do ticket geral da base
ativa descrita nas inconsistências deste documento.

### Próximas experimentais do relatório diário

A agenda vem somente do snapshot Emusys vigente. Uma participação entra quando
`snapshot_ativo=true`, `situacao='agendada'`, não está cancelada e seu início em
`America/Sao_Paulo` é estritamente posterior ao instante de geração e menor ou
igual a D+7. A conversão de data/hora usa as regras IANA de
`America/Sao_Paulo`, inclusive transições históricas, e uma referência temporal
inválida interrompe a geração. Evento do mesmo dia sem horário fica fora; em
data posterior ele pode entrar. A lista só remove duplicatas quando ambas as
linhas possuem e repetem `emusysAulaId + participanteChave`; homônimos e linhas
sem identidade estável são preservados. A ordenação é por data/horário/nome, o
limite é dez participações e o total excedente é informado.

### Taxa Lead → Experimental
Leads que agendaram/realizaram experimental ÷ total de leads do período.

---

## Retenção / Evasão

### Evasão (contagem e MRR perdido)
`movimentacoes_admin.tipo ∈ {evasao, nao_renovacao}` — **sem** `aviso_previo` nem `trancamento`.
- `DashboardPage.tsx:238`, `TabGestao.tsx:842`, `TabProfessoresNew.tsx:284` (MRR perdido = soma `valor_parcela`).

### Taxa de renovação
`renovacoes / (renovacoes + nao_renovacoes) × 100`. Renovação só conta se **confirmada** (`isRenovacaoConfirmadaOperacional`, exclui `pendente_validacao`). Renovação antecipada: `renovacao_antecipada=true` ou status `antecipada_*`.
- `AdministrativoPage.tsx:508/617`, `TabPerformanceProfessores.tsx:325`.
- Por professor: `renovacoes / contratos_a_vencer × 100` (`useProfessoresPerformance.ts:140`).

### Evasões que contam no score do professor
Apenas evasões cujo `motivos_saida.conta_score_professor = true`. Motivo `NULL` sem match em `motivos_saida` **não conta** (mudança documentada no CLAUDE.md). Alunos de `is_projeto_banda` excluídos (`filtrarRetencaoCanonica`).
- `ModalDetalhesEvasoes.tsx`, `useProfessoresPerformance.ts:76`.

### Tipos de movimentação (retenção)
`renovacao | nao_renovacao | aviso_previo | evasao | trancamento`. Para **retenção** agregam-se todos; para **evasão pura** só `evasao + nao_renovacao`.

### LTV / Tempo de permanência
Ex-alunos com **≥ 4 meses** e saída real (saiu de TODAS as matrículas). Exclui bolsistas, banda e 2º curso. Taxa de retorno = % pessoas com 2+ passagens.
- RPC `get_historico_ltv`; `ModalPermanenciaDetalhe.tsx`.

---

## Professores

### Health Score Professor V3 (0–100, ponderado)

O V3 é calculado e persistido no banco. Frontend, relatórios e agentes apenas leem o snapshot; não recalculam e não substituem ausência de base por zero.

| Pilar | Peso | Meta inicial | Grão/fonte canônica |
|---|---:|---:|---|
| Retenção atribuível | 25% | 90% | período matrícula-disciplina-professor exposto; `movimentacoes_admin` + `motivos_saida` |
| Permanência com o professor | 25% | 12 meses | vínculos encerrados de `vw_professor_periodos_efetivos_v3_sombra` |
| Conversão Exp→Mat | 15% | 70% | ciclo de 3 meses; experimental/evento no denominador e matrícula canônica em D+30 no numerador |
| Média de alunos/turma | 15% | segmentada | ocupações únicas de pessoas por turma regular elegível |
| Número de alunos | 10% | segmentada | pessoas canônicas únicas na carteira professor+unidade |
| Presença dos alunos | 10% | 80% | roster + `vw_aluno_presenca_semantica_v1` |

Nos pilares percentuais, a nota é o percentual real. Nos pilares com meta de
atingimento, a nota usa `min(100, valor_real / meta_versionada * 100)`.
Sliders alteram somente pesos; metas são campos separados. Uma configuração
ativa é imutável: alterações criam rascunho, passam por simulação e são
ativadas em ação separada. Snapshots fechados não são reescritos.

No ciclo Jun-Ago/2026, a Conversão Exp→Mat é exibida como
`provisorio_ciclo`, mas fica fora do score. O denominador não exige pessoa
canônica; identifica a experimental pelo evento ou lead. O numerador continua
exigindo pessoa e matrícula canônicas em D+30. A ativação do peso depende da
calibração conjunta das seis escalas no próximo ciclo.

#### Metas segmentadas de carteira e turma

Média/turma e Número de alunos não usam uma meta global no V3. Cada regra pertence a `unidade + curso + modalidade`, com modalidade canônica `turma` ou `individual`:

- `capacidade_maxima`: limite operacional do curso naquela unidade e modalidade;
- `meta_media_turma`: meta de ocupação por turma daquele segmento;
- `meta_carteira_curso`: meta de pessoas na carteira daquele segmento;
- curso não ofertado é declarado explicitamente, sem valores numéricos;
- curso formalmente atribuído e ainda sem alunos continua visível, mas não recebe nota zero nem penaliza o professor;
- quando surgir o primeiro vínculo ativo, a regra segmentada passa a ser pontuável;
- regra ausente ou atribuição ambígua produz `segmentacao_incompleta`, nunca fallback para meta global;
- capacidade excedida gera alerta operacional, sem cortar ocupação, valor bruto ou nota;
- o total de pessoas do professor continua vindo da carteira canônica e não pode ser inflado pela soma de cursos simultâneos.

A configuração segmentada segue o mesmo ciclo governado: rascunho, validação, simulação e ativação separada. Enquanto houver regra inválida, os comandos de salvar, simular e ativar permanecem bloqueados.

- Classificação inicial: **Saudável ≥ 70** · **Atenção 50–69** · **Crítico < 50**.
- Métrica sem base possui valor pontuável e nota `null`; seu peso sai temporariamente do denominador.
- Score exibível exige cobertura mínima de 60% e Retenção ou Permanência disponível.
- Parcial é visível, mas nunca rankeável ou premiável. Ranking existe somente em ciclo oficial fechado.
- Crescimento, fator de demanda e evasão duplicada pertencem à V2 histórica e não compõem o V3.

### Recortes mensal e por ciclo

Os ciclos fixos aprovados são **Jun-Ago**, **Set-Nov**, **Dez-Fev** e **Mar-Mai**. A RPC recebe a competência de referência selecionada e resolve o ciclo correspondente sem deslocar o mês.

- Número de alunos: mês = fechamento atual; ciclo = média dos fechamentos disponíveis e oficial somente com três meses.
- Média/turma: mês = ocupações/turmas elegíveis no mês; ciclo = soma das ocupações ÷ soma das turmas, nunca média simples das médias.
- Retenção e conversão: janela/ciclo definido no snapshot, com numerador e denominador preservados.
- Permanência: histórico acumulado de vínculos encerrados, não apenas os três meses do ciclo. Vínculos com menos de quatro meses ficam no histórico, mas não entram na média/nota.
- Presença: observado de junho/julho fica auditável; a pontuação contratual começa em 03/08/2026. Barra e Recreio podem contribuir conforme política versionada e cobertura mínima; Campo Grande permanece visível em auditoria e fora do score até nivelamento operacional.

### Health Score V2 (histórico/rollback)

A composição antiga (crescimento, média/turma, renovação, conversão, presença e evasões) permanece somente para histórico e rollback controlado durante a observação. Ela não é a fonte dos cards, relatórios e agentes V3 migrados.

### Taxa de presença (faixas)
Crítico < 70% · Atenção 70–79% · OK ≥ 80% (`ModalDetalhesPresenca.tsx`).

---

## Salas

- **Ocupação (%):** soma da `capacidade_maxima` das turmas ativas na sala ÷ `capacidade_maxima` da sala × 100.
- **Taxa de utilização (%):** `horas_ocupadas / horas_disponiveis × 100`, onde cada turma ativa = 1h e capacidade = `nº_salas × 73h/semana` (seg–sex 13h/dia + sáb 8h).
- Considera `turmas.ativo = true` e `salas.ativo = true`.

---

## Sucesso do Aluno

- **Health score do aluno / fase da jornada:** view `vw_aluno_sucesso_lista` (`health_score_numerico`, `health_status`, `fase_jornada`, `percentual_presenca`, `status_pagamento`). Recalculado por `calcular_health_score_alunos_batch`.
- **Faltas:** RPC `get_faltas_periodo` deduplica aulas Emusys (individual+turma) por `(aluno, dia, curso)`, priorizando a visão individual.
- **Pesquisa pós-1ª aula:** `pesquisas_whatsapp` `tipo='pos_primeira_aula'`; status `respondida/nao_respondida/pendente`. Régua da timeline: 1ª aula → 3 meses → evasão.

---

## Fechamento mensal / Governança de competência (jun/2026)

Para impedir que a virada de mês recalcule/altere competências já fechadas, o fechamento passou a ser **canônico e auditável**:

- **`dados_mensais` deixou de ser fonte de verdade** — virou camada de **compatibilidade** (telas antigas). A fonte do retrato fechado é o snapshot.
- **Fluxo oficial de fechamento** (só após o último sync/movimento do mês, com confirmação explícita):
  1. `preview_fechamento_mensal(ano, mes, unidade?, payloads?)` — **read-only**, junta domínios, aponta bloqueios/alertas. Não grava.
  2. `gravar_snapshot_fechamento_mensal(...)` — grava o retrato com **hash + auditoria**; só `service_role`; bloqueia se houver bloqueios; exige confirmação se houver alertas; não sobrescreve snapshot fechado.
  3. `atualizar_dados_mensais_por_snapshot(...)` — atualiza `dados_mensais` por compatibilidade a partir do snapshot aprovado (`dry_run` default).
- **Tabelas:** `fechamento_mensal_snapshots`, `fechamento_mensal_auditoria` (RLS: `authenticated` lê, escrita só `service_role`).
- **Writers legados bloqueados** para `anon`/`authenticated`: `snapshot_dados_mensais`, `fechar_dados_mensais`, `recalcular_dados_mensais`, `upsert_dados_mensais` (só `service_role`).
- **Financeiro do mês = faturamento PREVISTO por parcela canônica** (mensalidade − desconto condicional). Faturamento realizado com juros/multa aguarda endpoint de faturas do Emusys (ainda inexistente).
- Fonte: migrations `p09a`–`p09g` (`20260630*`), commit `c401724 feat: add canonical monthly closing safeguards`, relatório `docs/luciano/relatorio_randolph_fechamento_junho_2026.md`.
- ⚠️ Junho/2026 **ainda não foi fechado** — infraestrutura criada e validada (`preview` = `aprovavel`, 0 bloqueios), gravação pendente de autorização.

---

## Inconsistências percebidas (a decidir)

> Itens que notei ao mapear. **Não alterei nada** — são decisões de negócio. Sinalizando para você decidir se ajustamos.

1. **Snapshot Kids/School hardcoded** — `SEGMENTACAO_KIDS_SCHOOL_CG_MAIO_2026 = {kids:202, school:294}` fixo em `TabGestao.tsx:43-50`. É um valor reconstituído manualmente; se a fonte viva divergir, o histórico de CG/maio-2026 mostra número fixo. Candidato a remover quando a segmentação por idade estiver confiável no histórico.
2. **Valores placeholder na Retenção** — `useEvasoesData.ts` usa **churn médio fixo `4.86`** (`:88`) e **taxa de renovação fixa `80%`** (`:91`). Não são calculados; o dado real vem de `useProfessoresPerformance`. O dashboard de Retenção pode exibir números que não batem com Administrativo/Professores.
3. **Duas fontes de evasão/renovação** — Retenção (`useEvasoesData`) lê a tabela **legada `evasoes`**, enquanto Administrativo/Professores usam **`movimentacoes_admin`** (canônico). Risco de números divergentes entre as páginas.
4. **Conversão experimental calculada de 2 jeitos** — Dashboard/Comercial usam `leads.experimental_realizada`; o canônico do professor usa `lead_experimentais`. CLAUDE.md já registra que a fonte canônica virou `lead_experimentais` — o Dashboard pode estar com a taxa antiga (inflada). Vale alinhar.
5. **Métricas bloqueadas em Metas** — `taxa_exp_mat` e `taxa_conversao_exp` estão desativadas (`MetasPageNew.tsx`) aguardando regra canônica. Enquanto isso, não dá pra metar conversão de experimental.
6. **Forms de Entrada gravam em tabelas legadas** — `FormMatricula/Evasao/Renovacao` escrevem em `movimentacoes`/`renovacoes`/`evasoes`, não em `movimentacoes_admin`. Se ainda forem usados, geram dados fora do fluxo canônico Emusys.
7. **Ticket Médio: numerador precisa vir de fatura por competência, não de `alunos.valor_parcela`** — Clayton (07/07) reportou que o ticket médio do LA Report não bate com a planilha/Financeiro do Emusys que a ADM usa. Investigado: **não é passaporte/lojinha** (já descartados no cálculo atual — `alunos.valor_passaporte` é coluna separada, lojinha não existe em `alunos`). **Denominador "por pessoa" está correto** (regra validada pelo Alf, P3, não muda). A causa real é a **fonte do numerador**: o `alunos_ticket` da view `vw_kpis_gestao_mensal` (e as cópias equivalentes em `AlunosPage.tsx:682-696`, `kpisAlunosVivosCanonicos.ts:263,312`, `TabProfessoresNew.tsx:662-669` — "Ticket Médio Geral") somam o campo **cadastral estático `alunos.valor_parcela`**, mas a regra final (Alf, 07/07) exige o valor da **fatura da competência**: `valor_pago` se paga; valor devido atualizado (sem desconto de pontualidade perdido + juros/multa) se aberta/inadimplente. Validado ao vivo para Recreio jun/2026: previsto líquido calculado via fatura R$136.510,68 vs tela real da ADM R$136.475,68. `emusys_faturas` permanece o espelho atual, mas a exportação por competência agora lê exclusivamente o `sync_run_items` de um `sync_run_id` completo. Os quatro cálculos de Ticket Médio/LTV listados acima ainda não foram migrados. **Faturamento Previsto/MRR/ARR não são afetados**.

8. **Frescor financeiro não vem de timestamp de linha** — somente `sync_runs.run_type='live'`, `status='succeeded'`, `snapshot_complete=true` e `unidades_concluidas=3` prova frescor. O `baseline` derivado do legado serve para detectar ausências, mas nunca autoriza aplicação financeira por si só.
