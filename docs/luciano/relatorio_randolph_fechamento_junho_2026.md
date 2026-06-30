# Relatório Randolph - Fechamento Junho/2026

Data de elaboração: 30/06/2026
Sistema: LA Report
Competência crítica: Junho/2026
Objetivo: documentar a dor, as evidências, as decisões técnicas, o que foi implementado e as mitigações para evitar regressão no fechamento mensal.

---

## 1. Resumo executivo

O LA Report chegou ao fim de junho com os dados operacionais praticamente canônicos, depois de várias correções envolvendo Emusys, relatórios comerciais, relatórios administrativos, KPIs, alunos, matrículas, transferências, inadimplência e regras de negócio.

A maior dor agora é preservar esse retrato de junho sem repetir problemas antigos de virada de mês. Em meses anteriores, o sistema perdeu ou alterou números históricos porque parte dos relatórios voltava a beber de `dados_mensais`, snapshots antigos, cálculos legados ou recálculos vivos depois que o mês já tinha virado.

O trabalho feito nesta etapa cria uma camada de fechamento mensal auditável:

- preview read-only antes de qualquer gravação;
- snapshot mensal por domínio;
- auditoria de gravação;
- bloqueio de escritores legados para usuários comuns;
- função guardada para gravar fechamento somente via `service_role`;
- função de compatibilidade para atualizar `dados_mensais` somente a partir do snapshot aprovado;
- preservação da distinção entre dado canônico e dado legado.

Importante: o fechamento oficial de junho ainda não foi gravado automaticamente. A infraestrutura foi criada, validada e protegida, mas a gravação final deve acontecer somente depois do último sync/movimento do dia 30/06/2026, com confirmação explícita.

---

## 2. A dor original

### 2.1 Snapshot virava o mês e mudava os dados

O histórico do projeto mostrou um problema recorrente: ao virar o mês, relatórios de competências anteriores eram recalculados com base viva ou com tabelas antigas, alterando o que deveria ser um retrato fechado.

Isso impacta diretamente:

- relatório comercial;
- relatório administrativo;
- relatório gerencial;
- relatório de coordenação;
- KPIs de alunos;
- KPIs de matrículas;
- KPIs de renovação;
- KPIs de evasão;
- metas;
- Programa Matriculador+ LA;
- Programa Fideliza+;
- dashboards e analytics.

O risco era chegar em 01/07/2026 e não conseguir mais reproduzir junho com os números validados no dia 30/06/2026.

### 2.2 Havia múltiplas fontes competindo

Durante junho, identificamos várias fontes concorrentes:

- Emusys `/matriculas`;
- tabelas vivas do LA Report;
- RPCs canônicas;
- `dados_mensais`;
- snapshots antigos;
- cálculos legados no frontend;
- edge functions de relatório;
- syncs e backfills.

A regra adotada foi: Emusys é fonte externa canônica para dados vindos do Emusys, mas o LA Report mantém regras internas de negócio onde necessário.

Exemplos:

- parcela canônica: mensalidade menos desconto condicional;
- fatura paga com juros/multa: ainda depende de endpoint de faturas do Emusys;
- aluno transferido: entra na unidade como ativo/entrada administrativa, mas não como matrícula nova comercial;
- banda/projeto: não deve inflar base de alunos quando o aluno já tem matrícula regular;
- trancado, evadido, aviso prévio e não renovação têm regras próprias no LA Report.

---

## 3. Evidências principais levantadas

### 3.1 Relatórios administrativos divergindo

O relatório administrativo do Recreio em 26/06/2026 estava validado com:

- Ativos: 334
- Pagantes: 323
- Não Pagantes: 11
- Matrículas Ativas: 417
- Banda: 58
- 2º curso: 25

Depois, o relatório de 27/06/2026 apareceu com:

- Ativos: 334
- Pagantes: 324
- Não Pagantes: 10
- Matrículas Ativas: 421
- Banda: 62
- 2º curso: 25

A análise mostrou que parte da diferença vinha de bandas/projetos sendo tratadas de maneira inadequada. Foi reforçada a regra: não existe "trancamento em banda" como categoria operacional para inflar contagem; se o aluno sai da banda, a matrícula de banda deve sair da contagem ativa de banda, sem mexer no aluno regular.

### 3.2 Barra teve variação legítima, mas precisava estar clara

Na Barra, houve diferença entre 26/06 e 27/06:

26/06:

- Ativos: 235
- Pagantes: 233
- Matrículas Ativas: 259
- Banda: 10
- 2º curso: 14

27/06:

- Ativos: 237
- Pagantes: 235
- Matrículas Ativas: 263
- Banda: 12
- 2º curso: 14
- Novos no mês: 12
- Transferências recebidas no mês: 1
- Entradas administrativas: 13

A leitura aceita foi: relatório de 27/06 está coerente desde que a transferência fique explícita no relatório e nos indicadores. Transferência entra na unidade, mas não pode contaminar matrícula nova comercial.

### 3.3 Inadimplentes saltaram de aproximadamente 16 para 40

Foi identificado que o alerta/lista de inadimplentes estava incluindo alunos com status inadequado:

- trancado;
- evadido;
- inativo;
- registros históricos.

Regra validada pelo negócio: inadimplência operacional deve considerar aluno/matrícula ativa. Trancado, evadido e inativo não entram como inadimplentes operacionais.

### 3.4 Tempo de permanência e LTV apareceram quebrados em uma página

Na página operacional do administrativo, tempo médio de permanência e LTV de evasões chegaram a aparecer zerados ou vazios, enquanto analytics estava correto.

Isso indicava consumo de fonte divergente. A correção feita alinhou a RPC canônica para preservar finanças e tempo/LTV por unidade a partir da fonte correta, sem ressuscitar cálculo legado.

### 3.5 Parte de professores ainda exigia cautela

Na aba de professores, métricas como retenção 100%, evasões 0 e Exp -> Mat 100% pareciam boas demais e foram tratadas com cautela. A decisão foi não mexer em regra de negócio de professores sem auditoria com coordenadores, porque pode haver regra de negócio já combinada.

---

## 4. Fonte canônica e fronteiras de decisão

### 4.1 Emusys

O Emusys passou a fornecer dados importantes por `/matriculas`, incluindo:

- aluno;
- matrícula;
- curso;
- professor;
- horário;
- turma;
- parcela;
- status de inadimplência no contrato;
- foto;
- campos personalizados como Instagram;
- dados de contrato.

O Emusys ainda não fornece de forma suficiente, até esta etapa:

- faturas detalhadas;
- valor efetivamente pago com juros/multa;
- baixa de pagamento detalhada por fatura;
- todos os dados necessários para faturamento contábil final.

Por isso, financeiro de junho deve permanecer como faturamento previsto por parcela canônica. Faturamento realizado com juros/multa deve aguardar endpoint de faturas.

### 4.2 LA Report

O LA Report mantém regras internas que não podem ser sobrescritas cegamente:

- classificação de matrícula regular, banda, segundo curso, coral;
- aluno trancado;
- aluno evadido;
- não renovação;
- aviso prévio;
- transferência;
- bolsista integral/parcial;
- métricas administrativas e comerciais;
- metas e programas internos.

### 4.3 Regra de ouro

O sync deve preencher automaticamente campos seguros, mas divergências de regra de negócio devem cair em conciliação ou exigir decisão humana. O objetivo não é copiar tudo do Emusys; é colocar cada dado no lugar certo dentro do LA Report.

---

## 5. O que foi implementado

### 5.1 P01U/P01V - alinhamento de KPIs canônicos administrativos

Foram aplicadas migrações para alinhar `get_kpis_alunos_canonicos(...)` com a fonte administrativa operacional canônica, preservando os campos financeiros onde já estavam corretos.

Arquivos de migração:

- `20260630173000_p01u_alinha_kpis_canonicos_admin_tempo.sql`
- `20260630174500_p01v_corrige_tempo_permanencia_por_unidade.sql`

Resultado validado por unidade depois da correção:

Barra:

- ativos: 237
- pagantes: 235
- não pagantes: 2
- matrículas: 263
- banda: 12
- 2º curso: 14
- novas: 12
- inadimplentes ativos: 4
- valor inadimplente: R$ 2.087,00
- tempo permanência: 13,6

Campo Grande:

- ativos: 469
- pagantes: 436
- não pagantes: 33
- matrículas: 539
- banda: 44
- 2º curso: 26
- novas: 12
- inadimplentes ativos: 31
- valor inadimplente: R$ 11.161,00
- tempo permanência: 19,6

Recreio:

- ativos: 334
- pagantes: 323
- não pagantes: 11
- matrículas: 417
- banda: 58
- 2º curso: 25
- novas: 17
- inadimplentes ativos: 2
- valor inadimplente: R$ 815,00
- tempo permanência: 14,9

Consolidado:

- ativos: 1.040
- pagantes: 994
- não pagantes: 46
- trancados: 17
- matrículas: 1.219
- banda: 114
- 2º curso: 65
- novas: 41
- bolsistas integrais: 27
- bolsistas parciais: 17
- tempo permanência: 16,5
- LTV médio: R$ 6.981,48

### 5.2 P09A/P09B - preview de fechamento mensal

Foi criada a função read-only:

```sql
public.preview_fechamento_mensal(
  p_ano int,
  p_mes int,
  p_unidade_id uuid default null,
  p_incluir_payloads boolean default true
) returns jsonb
```

Objetivo:

- juntar os domínios relevantes do mês;
- comparar dados canônicos com compatibilidade mensal;
- apontar bloqueios e alertas;
- não gravar nada;
- permitir auditoria antes do fechamento.

Resultado validado para junho:

- `status_geral = aprovavel`
- `bloqueios_total = 0`
- `alertas_total = 6`

Alertas esperados:

- ausência/divergência de `dados_mensais` em algumas unidades;
- ausência de registro formal em `competencias_mensais`;
- observações de programas que ainda não têm snapshot mensal dedicado perfeito.

Esses alertas não bloqueiam o fechamento porque a fonte canônica viva foi validada, mas devem aparecer no relatório para auditoria.

### 5.3 P09C/P09D - tabelas de snapshot e auditoria

Foram criadas estruturas para persistir o retrato fechado:

- `public.fechamento_mensal_snapshots`
- `public.fechamento_mensal_auditoria`
- `public.hash_jsonb_canonico(jsonb)`

Domínios previstos:

- `alunos_admin`
- `alunos_executivo`
- `comercial`
- `retencao`
- `renovacoes`
- `professores`
- `relatorio_admin`
- `relatorio_gerencial`
- `relatorio_coordenacao`
- `metas`
- `programa_matriculador`
- `programa_fideliza`
- `compatibilidade_dados_mensais`

Permissões:

- `authenticated` pode ler;
- escrita apenas por `service_role`;
- RLS habilitada.

### 5.4 P09E - gravação guardada do snapshot

Foi criada a função:

```sql
public.gravar_snapshot_fechamento_mensal(
  p_ano int,
  p_mes int,
  p_unidade_id uuid default null,
  p_observacao text default null,
  p_confirmar_alertas boolean default false
) returns jsonb
```

Guardrails:

- chama o preview antes de gravar;
- bloqueia se houver bloqueios;
- exige confirmação explícita se houver alertas;
- não sobrescreve snapshot aprovado/fechado;
- grava auditoria;
- grava payload e hash canônico;
- só `service_role` executa.

Importante: essa função foi criada e validada, mas ainda não foi executada para fechar junho.

### 5.5 P09F - compatibilidade com `dados_mensais`

Foi criada a função:

```sql
public.atualizar_dados_mensais_por_snapshot(
  p_ano int,
  p_mes int,
  p_unidade_id uuid default null,
  p_dry_run boolean default true
) returns jsonb
```

Objetivo:

- atualizar `dados_mensais` somente depois do snapshot aprovado;
- manter compatibilidade com telas antigas;
- impedir que `dados_mensais` seja a fonte primária solta;
- `dry_run` por padrão.

### 5.6 P09G - bloqueio de writers legados

Foram revogados acessos de `PUBLIC`, `anon` e `authenticated` para funções legadas de escrita mensal:

- `snapshot_dados_mensais`
- `fechar_dados_mensais`
- `recalcular_dados_mensais`
- `upsert_dados_mensais`

`service_role` continua autorizado para operação controlada.

Objetivo: impedir que usuário comum, UI antiga ou rotina sem guarda regrave mês fechado ou parcialmente fechado.

---

## 6. Mitigações contra regressão

### 6.1 Fechamento só por função guardada

O fechamento de junho não deve ser feito por update direto em tabela. O caminho correto é:

1. rodar preview;
2. validar bloqueios/alertas;
3. gravar snapshot com confirmação explícita;
4. opcionalmente atualizar `dados_mensais` por compatibilidade usando o snapshot.

### 6.2 `dados_mensais` deixa de ser fonte de verdade

`dados_mensais` passa a ser compatibilidade, não fonte primária do fechamento.

### 6.3 Snapshot com hash

Cada payload gravado recebe hash. Isso permite detectar alteração posterior.

### 6.4 Auditoria

Toda gravação de snapshot passa por auditoria em tabela própria.

### 6.5 Bloqueio de caminhos legados

Funções antigas de escrita mensal foram bloqueadas para papéis comuns. Isso reduz o risco de uma tela antiga ou uma automação sobrescrever junho sem passar pela governança.

### 6.6 Financeiro realizado fica explicitamente limitado

Até existir endpoint de faturas, junho deve registrar:

- ticket e MRR por parcela canônica;
- inadimplência por status de contrato;
- faturamento previsto.

Não deve registrar como faturamento realizado com juros/multa, porque esse dado ainda não está disponível com granularidade suficiente.

---

## 7. Alterações incluídas neste pacote final

Além do commit de snapshot já enviado, este pacote final inclui 5 arquivos que tratam principalmente da regra de inadimplência operacional somente para alunos ativos.

Arquivos:

- `src/components/App/Alunos/AlunosPage.tsx`
- `src/components/App/Alunos/TabelaAlunos.tsx`
- `src/lib/kpisAlunosVivosCanonicos.ts`
- `supabase/functions/gerar-relatorio-aluno/index.ts`
- `supabase/functions/sync-matriculas-emusys/index.ts`

Resumo técnico:

- filtro de pagamento `inadimplente` agora exige `status = ativo`;
- alerta da tabela passa a escrever "alunos ativos inadimplentes";
- marcação em massa ignora trancados, evadidos e inativos;
- outros cursos só contam como inadimplentes se o curso estiver ativo;
- cálculo canônico de inadimplência também exige status ativo;
- sync Emusys não propõe `status_pagamento` para matrícula não ativa;
- relatório de aluno usa label de pagamento mais segura.

Motivo: impedir que trancados, evadidos e inativos entrem no alerta operacional de inadimplência.

---

## 8. Procedimento recomendado para fechamento oficial de junho

Esse procedimento deve ser executado somente depois do último sync/movimento de junho.

### 8.1 Preview final

```sql
select public.preview_fechamento_mensal(2026, 6, null, true);
```

Critério:

- `bloqueios_total = 0`
- alertas conhecidos e aceitos

### 8.2 Gravar snapshot oficial

Executar somente com confirmação explícita:

```sql
select public.gravar_snapshot_fechamento_mensal(
  2026,
  6,
  null,
  'Fechamento Junho/2026 aprovado após validação operacional LA Report e Emusys.',
  true
);
```

### 8.3 Atualizar compatibilidade `dados_mensais`

Primeiro dry-run:

```sql
select public.atualizar_dados_mensais_por_snapshot(2026, 6, null, true);
```

Depois, se o dry-run estiver correto:

```sql
select public.atualizar_dados_mensais_por_snapshot(2026, 6, null, false);
```

### 8.4 Não fazer

Não executar:

- writer legado manual;
- recálculo solto de `dados_mensais`;
- backfill mensal sem preview;
- sync de Emusys depois do snapshot sem tratar como retificação;
- alteração de regra de negócio no fechamento sem validação.

---

## 9. Pontos em aberto

### 9.1 Endpoint de faturas do Emusys

Ainda falta endpoint detalhado de faturas para:

- valor efetivamente pago;
- juros;
- multa;
- desconto perdido;
- data de pagamento;
- fatura vencida;
- fatura em aberto;
- faturamento realizado do mês.

Sem isso, o relatório financeiro mensal deve continuar usando faturamento previsto por parcela canônica.

### 9.2 Professores

A aba de professores ainda exige auditoria específica antes de mudanças de regra:

- alunos por professor;
- média por turma;
- retenção;
- presença;
- evasões;
- conversão experimental -> matrícula;
- custo/folha do professor versus MRR gerado.

Decisão tomada: não alterar regra de negócio de professores sem validação com coordenação.

### 9.3 Relatórios consumindo snapshot

As estruturas de snapshot já existem. A etapa seguinte é garantir que relatórios mensais fechados leiam snapshot aprovado quando a competência estiver fechada, e não base viva.

### 9.4 Retificação

Se junho for fechado e depois aparecer correção, o caminho correto deve ser retificação auditada, não sobrescrita silenciosa.

---

## 10. Checklist para auditoria do Hugo

### 10.1 Verificar commit de infraestrutura

Commit já enviado:

```text
c401724 feat: add canonical monthly closing safeguards
```

### 10.2 Conferir funções

Funções principais:

```sql
select proname
from pg_proc
where proname in (
  'preview_fechamento_mensal',
  'gravar_snapshot_fechamento_mensal',
  'atualizar_dados_mensais_por_snapshot',
  'hash_jsonb_canonico'
);
```

### 10.3 Conferir permissões

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in (
  'gravar_snapshot_fechamento_mensal',
  'atualizar_dados_mensais_por_snapshot',
  'snapshot_dados_mensais',
  'fechar_dados_mensais',
  'recalcular_dados_mensais',
  'upsert_dados_mensais'
)
order by routine_name, grantee;
```

Esperado:

- writers guardados: apenas `postgres`/`service_role`;
- funções legadas de escrita sem `anon`/`authenticated`.

### 10.4 Conferir se snapshot ainda não foi gravado

```sql
select ano, mes, count(*)
from public.fechamento_mensal_snapshots
where ano = 2026 and mes = 6
group by ano, mes;
```

Enquanto o fechamento oficial não for autorizado, deve retornar vazio.

### 10.5 Rodar preview

```sql
select public.preview_fechamento_mensal(2026, 6, null, false);
```

Esperado nesta etapa:

- `status_geral = aprovavel`
- `bloqueios_total = 0`

---

## 11. Conclusão

O objetivo desta etapa não foi fechar junho automaticamente. Foi criar a infraestrutura para fechar junho com segurança, preservar o retrato canônico e impedir que caminhos legados sobrescrevam dados já validados.

O sistema agora tem um caminho mais seguro:

- preview antes de escrever;
- snapshot auditável;
- bloqueio de writers legados;
- compatibilidade controlada;
- separação entre dados canônicos e dados históricos;
- decisão explícita para fechamento.

O próximo passo operacional é aguardar o último sync/movimento de junho e executar o fechamento oficial com confirmação explícita.
