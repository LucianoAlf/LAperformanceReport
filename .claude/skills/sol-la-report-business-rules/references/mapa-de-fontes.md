# Mapa de Fontes da Sol — RPC/view canônica por pergunta

Verificado contra produção (`ouqwbbermlzqqvtqwlul`) em **2026-08-18**.

**Regra de ouro:** a Sol **chama a RPC**. Não monta `SELECT` em cima de `alunos`,
`movimentacoes_admin` ou `emusys_faturas` para responder pergunta de KPI. Quando só
existe view, use o SELECT mínimo desta página **sem alterar o critério**.

---

## 0. Por que o número não batia (evidência)

Barra, agosto/2026, mesma pergunta — "quantos alunos ativos?":

| Como se pergunta ao banco | Resultado |
|---|---|
| `get_kpis_alunos_admin_operacional` → `totais.alunos_ativos` | **246** ✅ |
| `select count(*) from alunos where status='ativo'` | 271 |
| idem, `and is_segundo_curso=false` | 257 |
| `select count(distinct nome) ... status='ativo'` | 246 (coincidência) |

O `count(distinct nome)` **acerta na Barra e erra em Campo Grande** (dá 418, canônico 417) —
há 9 grupos de linhas duplicadas vivas no banco (mesma pessoa, mesmo `curso_id`). Nenhuma
aproximação manual é confiável. Números canônicos de hoje:

| Unidade | ativos | pagantes |
|---|---|---|
| Barra | 246 | 244 |
| Campo Grande | 417 | 387 |
| Recreio | 336 | 326 |

---

## 1. Contagem de alunos por unidade

### Fonte canônica — a MESMA do relatório diário das 20h

```
get_kpis_alunos_admin_operacional(p_unidade_id uuid, p_ano int, p_mes int) → jsonb
```

É exatamente o que a edge `relatorio-admin-whatsapp` chama (função
`fetchKPIsAlunosRelatorioAdmin`). Ler `payload->'totais'` (ou `por_unidade[0]`;
o relatório tenta `totais` e cai em `por_unidade[0]`). `p_unidade_id = NULL` → consolidado.

**Campos-chave em `totais`:**

| Campo | Significado |
|---|---|
| `alunos_ativos` | **o número oficial** (246 na Barra) |
| `alunos_pagantes` | base de churn, ticket e inadimplência % |
| `alunos_nao_pagantes` | bolsista integral + isento |
| `alunos_trancados` | trancado **não** é ativo |
| `bolsistas_integrais` / `bolsistas_parciais` | parcial **não** conta como pagante |
| `bolsistas_integrais_regulares` / `_segundo_curso` | recorte do integral |
| `novas_matriculas` | alunos novos da competência |
| `matriculas_ativas` | matrículas, não pessoas (271 na Barra) |
| `matriculas_base_alunos_ativos`, `matriculas_banda`, `matriculas_2_curso`, `matriculas_coral` | as 4 parcelas que somam `matriculas_ativas` |
| `matriculas_trancadas` | |
| `alunos_com_2_curso`, `alunos_com_exatamente_2_cursos` / `_3_cursos`, `alunos_com_4_ou_mais_cursos` | |
| `alunos_kids` / `alunos_school` | Kids ≤11 · School ≥12 |
| `identidade_emusys_cobertura_pct`, `linhas_identidade_pendente` | saúde do dado; se cobertura cair, avisar |

**Critério canônico de "ativo":** pessoa (`nome` + `unidade_id`) com matrícula
**acadêmica** ativa. Fora: trancado, quem faz **só** banda ou **só** coral, e as
atividades extra-acadêmicas. `alunos` é tabela de **matrículas**, não de pessoas —
2 cursos = 2 linhas. Por isso contar linha infla.

⚠️ **`evasoes` NÃO existe neste payload.** O relatório mapeia `totalCampo('evasoes')`,
que volta `undefined` → 0. Evasão vem do item 1.2.

### 1.2 Evasões, renovações, não-renovações, trancamentos, aviso prévio

Não há RPC — o relatório monta isso em TypeScript sobre `movimentacoes_admin`.
A Sol usa a view canônica **`movimentacoes_admin_vigentes`** (= tabela `WHERE NOT anulado`).

SELECT canônico mínimo (Barra, ago/2026 — confere: 6 evasões, 11 renovações confirmadas,
0 não-renovações, 3 trancamentos, 9 avisos prévios):

```sql
with base as (
  select m.*, c.nome as curso_nome, c.is_projeto_banda,
         coalesce(date_trunc('month', m.competencia_referencia)::date,
                  date_trunc('month', m.data)::date) as comp
  from movimentacoes_admin_vigentes m
  left join cursos c on c.id = m.curso_id
  where m.unidade_id = $1
),
acad as (                                    -- retenção é só do acadêmico
  select * from base
  where not (coalesce(is_projeto_banda,false)
    or unaccent_imutavel(lower(coalesce(curso_nome,'')))
       ~ 'canto coral|power kids|minha banda|garageband|percussion kids')
)
select
  count(*) filter (where tipo='evasao'        and comp = $2) as evasoes,
  count(*) filter (where tipo='nao_renovacao' and comp = $2) as nao_renovacoes,
  count(*) filter (where tipo='renovacao'     and comp = $2
                   and renovacao_status in ('confirmada','antecipada_confirmada')) as renovacoes,
  count(*) filter (where tipo='trancamento'   and comp = $2) as trancamentos,
  count(*) filter (where tipo='aviso_previo'
                   and mes_saida >= $2 and mes_saida < ($2::date + interval '2 months')) as avisos_previos
from acad;                                   -- $2 = primeiro dia da competência
```

Critérios que **não** podem ser mudados:
- **Competência da renovação = mês da 1ª AULA do novo ciclo**, não o mês do lançamento.
  Por isso agrupar por `competencia_referencia`, com fallback em `data`.
- **Aviso prévio cobre 2 meses** (vigente + seguinte) e **não** é evasão, **nem** entra no
  denominador da renovação.
- Taxa de renovação = `renovacoes / (renovacoes + nao_renovacoes)`. O relatório soma ainda
  as `renovacao` da competência **sem** status confirmado como "pendentes" no denominador.
- Churn = `evasoes / alunos_pagantes`.
- ⚠️ A taxa de renovação **infla por construção**: não renovar é um não-evento (o Emusys não
  manda webhook). Jun–ago/2026: 196 renovações contra 16 não-renovações, nenhuma via webhook.
  Se a pergunta for "quantos contratos venceram e não renovaram", use `vw_renovacao_ciclos`
  (denominador = contratos que terminam na competência), não a taxa.

⏸️ **Corrigido na v107 e REVERTIDO na v108 no mesmo dia (2026-08-18), por decisão do Alf.**
A edge lia `movimentacoes_admin` **crua**, sem filtrar `anulado` — e isso **não era dano
latente, estava ativo**. Reproduzindo a
lógica exata da edge contra o relatório de 17/08 (que bateu nas 3 unidades):

| Unidade | Realizadas | Previsto | Taxa |
|---|---|---|---|
| Recreio | 39 → **35** | 50 → **46** | 78,0% → **76,1%** |
| Barra | 12 (sem efeito) | 12 | 100,0% |
| Campo Grande | 29 (sem efeito) | 35 | 82,9% |

As 4 anuladas do Recreio entravam como realizadas **e** no previsto. Set/2026 já tinha
mais 3 esperando. Barra e CG não tinham anulada em agosto — por isso não mudariam.

**Por que reverteu:** a equipe validou o relatório de 17/08 com 39/50/78,0%. Se o de 18/08
saísse 35/46/76,1% sem aviso, a queda seria lida como "relatório quebrado" — número certo
que aparece sem explicação vira número errado na prática. O fix só volta depois que a
equipe do Recreio confirmar as 4 duplicatas de agosto. Evidência forte para a conversa:
**3 das 4 (Arthur de Carvalho, João Francisco e Sofia Gonçalves) aparecem em DOBRO no
próprio relatório de 17/08** — contadas no total de agosto E listadas como "Renovações
Antecipadas" de setembro. A 4ª é Noah Pincelli (registro idêntico ao mantido, aluno com
matrícula única). ⚠️ **Enquanto a v108 estiver no ar, o relatório do Recreio está
inflado DE PROPÓSITO** — a Sol, que lê a view `_vigentes`, vai divergir dele em -4
realizadas / -4 previsto, e nesse caso é a SOL que está certa.

⚠️ **As 46 anuladas são TODAS `tipo='renovacao'`.** Por isso quem filtra só
`evasao`/`nao_renovacao`/`aviso_previo` não é afetado hoje — mas é exposição latente, porque
nada impede anular outro tipo.

🔴 **O frontend ainda lê a tabela crua** em ~20 pontos, e **nenhum** usa a view — inclusive
telas que contam renovação (`ModalRelatorio`, `RelatorioDiario`, `ModalDetalhesRetencao`,
`TabelaAlunos`, `ModalFichaAluno`). Então a **tela pode discordar do relatório diário** até
essa frente ser feita. Se a Sol divergir da tela, provavelmente é a tela que está inflada.

---

## 2. Financeiro do aluno

### 2.1 Faturas / parcelas

**A Sol chama `sol_faturas_alunos_v1` — não a `get_faturas_alunos_financeiro_v1`.**
Mesmos parâmetros, mesmo payload; o wrapper só resolve o guard de JWT (ver §5).

```
sol_faturas_alunos_v1(
  p_unidade_id uuid    = NULL,               -- NULL = todas as unidades
  p_ano        int     = ano atual (BRT),
  p_mes        int     = mês atual (BRT),
  p_modo_periodo text  = 'janela_3',         -- 'janela_3' (3 meses) | 'competencia'
  p_status     text    = 'todas',
  p_as_of_date date    = hoje (BRT)
) → jsonb        -- delega para get_faturas_alunos_financeiro_v1, sem mudar regra
```

`p_status` ∈ `todas | pagas | em_aberto | em_atraso_d0 | a_vencer | canceladas | cobranca_d2 | reconciliacao`.
⚠️ **Nunca passar `NULL` explícito** em `p_modo_periodo`/`p_status`/`p_as_of_date` — o guard
rejeita (`p_as_of_date nao pode estar no futuro`). Omita para usar o default.
⚠️ `p_as_of_date` **no futuro é recusado** — é o que garante que o valor com multa/mora seja auditável.

Topo do payload: `items`, `totais`, `periodo`, `status`, `as_of_date`, `fonte`,
`freshness`, `operational`, `reconciliation`, `schema_version`.

**`totais`** traz `{quantidade, valor}` por bucket: `todas`, `pagas`, `em_aberto`,
`a_vencer`, `em_atraso_d0`, `cobranca_d2`, `canceladas`, `visao_atual`.

**Cada item:**

| Campo | Observação |
|---|---|
| `aluno.{id,nome,curso_nome,estado_operacional}` | |
| `status` | `paga` / `aberta` / … |
| `competencia` | 1º dia do mês |
| `data_vencimento`, `data_pagamento` | |
| `valores.valor_com_desconto` | **o que o aluno deve/pagou** |
| `valores.valor_sem_desconto_condicional` | cheio sem o desconto de pontualidade |
| `valores.valor_pago`, `valor_hoje` | |
| `valores.multa`, `valores.mora`, `juros_e_multa_snapshot` | |
| `tipo_fatura` | ⚠️ **mensalidade vs `passaporte_taxa_matricula` vs evento** |
| `numero_parcela`, `total_parcelas_contrato` | |
| `forma_pagamento.{nome,fonte,rotulo}` | |
| `cobranca.{d0, d2_elegivel, motivo_nao_elegivel}` | fila de cobrança |
| `emusys_fatura_id`, `emusys_matricula_id`, `emusys_student_id`, `emusys_contrato_id`, `canonical_fatura_id` | |
| `sync_completed_at`, `sync_fresh_until` | frescor do dado |

⚠️ **`emusys_student_id` sozinho não casa aluno↔mensalidade** — casa passaporte e ingresso
também, e faz aluno devendo parecer em dia. Filtrar por `tipo_fatura` ou pela descrição
`^Parcela MM/AAAA`.
⚠️ `valor_original` do Emusys é **valor de tabela** (todo CG = 447); só o líquido reflete o contratado.

### 2.2 Inadimplência

**A Sol chama `sol_inadimplencia_v1`** (wrapper; delega para `get_inadimplencia_canonica`).

```
sol_inadimplencia_v1(p_unidade_id uuid = NULL, p_as_of_date date = hoje BRT) → jsonb
```

⚠️ **Não use `sol_caixa_inadimplentes`** apesar do nome. Ela exige
`collection_scope = 'confirmed_only'` e a canônica hoje devolve
`confirmed_active_d2_3_competencias` → sai em erro. É do fluxo de caixa, não de consulta.

⚠️ **Conferir sempre o `status` do payload.** Medido em 18/08 para CG: `partial` — a foto
não estava completa. `partial` / `stale` / `incomplete` **têm que ser ditos na resposta**,
não escondidos atrás do número.

Topo: `items`, `totals`, `operational`, `policy`, `freshness`, `status`, `as_of_date`,
`reconciliation`, `unidade_id`, `error`.

Item: `status`, `dias_atraso`, `valor_original`, `valor_com_desconto`,
`valor_atualizado` (**com multa e mora**), `multa`, `mora`, `multa_pct`, `mora_pct_mes`,
`desconto_condicional_perdido`, `data_vencimento`, `competencia`, `descricao`,
`aluno_id_canonico`, `contact_resolution_status`, `emusys_fatura_id`, `run_id`.

`operational.collection_allowed` diz se a fila de cobrança pode rodar;
`block_reasons` explica quando não. **Escopo:** só aluno matriculado e ativo entra na fila
D+2 — trancado, evadido e ex-aluno ficam fora da cobrança, mas seguem no histórico.

**% de inadimplência (canônico):** `qtd_inadimplentes / alunos_pagantes * 100`, com
`alunos_pagantes` vindo do item 1.

### 2.3 Responsável financeiro

Não há RPC. Duas fontes, nesta ordem:

```sql
-- 1) responsável declarado na matrícula
select nome, responsavel_nome, responsavel_telefone, responsavel_parentesco,
       telefone, email, data_nascimento
from alunos where id = $1;

-- 2) contatos adicionais (principal primeiro)
select nome, telefone, parentesco, principal
from aluno_contatos where aluno_id = $1 order by principal desc;
```

⚠️ Responsável ≠ aluno muda o texto das automações (3ª pessoa). Um aluno pode ter **duas
conversas** no mesmo departamento (uma no `responsavel_telefone`, outra no dele).

---

## 3. Cadastro / curso do aluno

### 3.1 Achar aluno

```
buscar_alunos_ativos_atuais_canonicos(p_termo text, p_unidade_id uuid, p_limite int)
```
→ `id, nome, nome_normalizado, unidade_id, unidade_codigo, classificacao, status,
valor_parcela, data_matricula, curso_id, professor_atual_id`

Ficha mais rica (curso, professor, dia/horário, agente):

```
maria_lareport_buscar_alunos(p_busca text, p_unidade_id uuid, p_limit int)
```
→ `aluno_id, aluno_nome, unidade_nome, status, classificacao, curso_nome, professor_nome,
dia_aula, horario_aula, valor_parcela, valor_passaporte, data_matricula, agente_comercial,
consultor_nome, tipo_matricula`

Ambas rodam sem JWT. Para prontuário completo existe a view `vw_prontuario_aluno`.
Para o estado operacional vivo, `vw_jornada_aluno_atual` (20+ consumidores — **não alterar**).

### 3.2 Cursos do aluno

Uma pessoa = N linhas em `alunos` (1 com `is_segundo_curso=false` + N com `true`):

```sql
select a.id, a.nome, c.nome as curso, a.is_segundo_curso, a.status,
       a.valor_parcela, a.professor_id
from alunos a left join cursos c on c.id = a.curso_id
where a.unidade_id = $1 and a.nome = $2
order by a.is_segundo_curso, a.id;
```

### 3.3 Detectar linha duplicada

Duplicata = mesma pessoa (`nome` + `unidade_id`) com o **mesmo `curso_id`** em 2+ linhas.
Curso **diferente** é segundo curso legítimo, não duplicata.

```sql
select a.unidade_id, a.nome, a.curso_id, c.nome as curso,
       count(*) as linhas, array_agg(a.id order by a.id) as aluno_ids
from alunos a left join cursos c on c.id = a.curso_id
where a.status = 'ativo'
group by 1,2,3,4
having count(*) > 1
order by 5 desc;
```

⚠️ **Mesmo curso repetido NÃO é segundo curso.** Segundo curso é curso **diferente**
(Piano + Violão). Ninguém se matricula duas vezes em Teclado. O flag `is_segundo_curso=true`
está marcado em várias dessas linhas — o flag está **errado**, não é prova de nada.

**Mas o `having count(*) > 1` sozinho gera falso positivo.** O desempate é **dia + horário**:

```sql
-- acrescente ao group by acima:
count(distinct (a.dia_aula, a.horario_aula)) as slots_distintos
```

- `slots_distintos = 1` → **duplicata**. A pessoa não pode estar em duas aulas do mesmo
  curso na mesma sexta às 14h.
- `slots_distintos > 1` → **provavelmente legítimo**: 2 aulas por semana do mesmo curso.

Medido em 2026-08-18 — 9 grupos, e a distinção importa: **8 são duplicata** (mesmo dia e
mesma hora) e **1 é legítimo**. O legítimo é `Vitória da Silva Nobre` (Recreio, Canto IND,
ids 705/1006): Quarta 15h **e** Quinta 16h, mesmo professor, mesmo valor, `emusys_id`
consecutivos (1164/1165) — são duas aulas semanais, não erro de cadastro.

Pior caso real: `Vinícius Lopa Mendes Rezende de Macedo` (CG, Power Kids, ids 1433/1434/1788)
— **3 linhas**, todas Terça 17h, com 3 professores diferentes e `data_matricula` de 2018,
02/2026 e 05/2026. É triplicata, não terceiro curso.

**Impacto medido:** infla `matriculas_ativas` (conta linha). **Não** infla `alunos_ativos`
(a RPC agrupa por pessoa) nem `alunos_com_2_curso` (a RPC aplica o filtro acadêmico e é mais
conservadora que a contagem crua: diz 13 na Barra onde o `count` cru daria 23).

⚠️ A lixeira oficial é `alunos_arquivados`. **Nunca** criar `*_backup_<data>`.
Sol **não** arquiva — reporta.

---

## 4. Custos operacionais / contas a pagar

**Não existe módulo de contas a pagar neste banco.** Varredura em todos os schemas por
`custo|despesa|fornecedor|pagar|folha|salario|segur|conta_`: zero tabelas de custo.

Mas a pergunta do segurança **tem resposta aqui** — pelo caixa/cofre, não por contas a pagar:

```sql
select cm.data_movimento, cm.valor, cm.forma_pagamento, cm.descricao, cm.responsavel
from caixa_movimentacoes cm
where cm.categoria = 'seguranca' and cm.unidade_id = $1
order by cm.data_movimento desc;
```

`caixa_categorias` tem 8 slugs: `parcela`, `lojinha`, `passaporte`, `seguranca`,
`despesa`, `troco`, `retirada`, `outro` (`ambiente` ∈ `cofre` | `ambos`).

**Resposta medida para Campo Grande:** **R$ 100,00 por semana**, em dinheiro, saída de cofre.
7 lançamentos entre 10/06 e 12/08/2026, R$ 700 no total, sempre R$ 100.

⚠️ **É um livro-caixa, não a folha.** O registro é incompleto: 7 lançamentos em ~9 semanas,
com buracos (o de 24/06 foi lançado em 30/06; julho quase inteiro falta). Serve para dizer
**quanto** se paga (R$ 100/semana) — **não** para somar o custo do período.
`seguranca` só tem lançamento em **Campo Grande**; `despesa` só no Recreio (6 lançamentos).

**Fora do alcance da Sol:** contrato, vínculo, encargos ou folha do segurança. Se a pergunta
for "quanto custa o segurança por mês na contabilidade", isso é domínio da **Maria / Super
Folha** — a Sol responde o que o caixa registra e encaminha o resto, sem estimar.

---

## 5. Acesso da Sol — o que foi liberado e o que ainda falta

Medido por `has_function_privilege('sol_acesso_restrito', …)` e por execução real.
A falta de GRANT **era a causa-raiz** de ela escrever SQL à mão.

| RPC canônica | Estado |
|---|---|
| `get_kpis_alunos_admin_operacional` | ✅ **liberada 2026-08-18** |
| `get_kpis_alunos_canonicos` | ✅ liberada 2026-08-18 |
| `get_kpis_comercial_canonicos_v2` | ✅ liberada 2026-08-18 |
| `buscar_alunos_ativos_atuais_canonicos` | ✅ liberada 2026-08-18 |
| `maria_lareport_buscar_alunos` | ✅ liberada 2026-08-18 |
| `sol_caixa_quem_e`, `sol_caixa_resumo_do_dia` | ✅ já funcionavam |
| `sol_faturas_alunos_v1` | ✅ **criada 2026-08-18** — porta da Sol para faturas |
| `sol_inadimplencia_v1` | ✅ criada 2026-08-18 — porta da Sol para inadimplência |
| `get_faturas_alunos_financeiro_v1` (direto) | 🔴 segue barrada — usar o wrapper |
| `get_inadimplencia_canonica` (direto) | 🔴 segue barrada — usar o wrapper |
| `sol_caixa_inadimplentes` | 🔴 não usar (escopo incompatível, §2.2) |

Migrations: `20260818155800_grant_rpcs_canonicas_sol_acesso_restrito.sql` e
`20260818160319_sol_leitura_faturas_inadimplencia.sql`. Aprovadas pelo **Alf** em 2026-08-18.

**Por que wrapper e não corrigir o guard:** as canônicas servem a tela financeira em
produção; mexer no guard delas para encaixar a Sol arriscaria o escopo por unidade dos
usuários reais. Os wrappers são `SECURITY DEFINER`, delegam sem reimplementar regra, e
restauram o claim anterior no fim (validado: `auth.role()` volta a `NULL`, não vaza
`service_role` para o resto da transação). ACL conferida:
`{postgres=X, service_role=X, sol_acesso_restrito=X}` — `anon` e `authenticated` fora.

**O guard:** as funções de faturas/inadimplência exigem
`auth.role() in ('authenticated','service_role')`. `auth.role()` lê o **claim do JWT**, não o
papel do Postgres. Conexão direta como `sol_acesso_restrito` não tem JWT → `auth.role()` é
`NULL` → `42501 papel nao autorizado para consultar faturas`. Nenhum GRANT resolve isso.
(É o mesmo padrão que já derrubou `sync-inadimplencia-emusys` por 13 dias.)

### ⚠️ Item aberto (não é da Sol): o guard não é uma fronteira

O `auth.role() in ('authenticated','service_role')` das funções financeiras **não protege
nada**. Qualquer papel que possa chamar `set_config` se declara `service_role`:

```sql
select set_config('request.jwt.claims','{"role":"service_role"}', true);
-- auth.role() passa a devolver 'service_role' e a função libera. Testado, funciona.
```

Ele bloqueava o uso legítimo (a Sol) e não impede o ilegítimo. Os wrappers do §5 resolveram
o lado da Sol trocando o contorno anônimo por uma porta nomeada e revogável — **mas a
fragilidade em si continua**, e vale uma frente própria. A Sol **não deve** usar o
`set_config` direto: para ela existem `sol_faturas_alunos_v1` e `sol_inadimplencia_v1`.

---

## 6. Regra de conduta

1. Chamar a RPC. Se a RPC negar acesso, **dizer que negou** — nunca substituir por SQL próprio.
2. Não inventar critério: "ativo", "pagante" e "renovação" têm definição fixa acima.
3. Divergiu do relatório diário? Classificar (`validada` / `inferida` / `pendente` / `legado/bug`),
   mostrar evidência, **não corrigir sozinha**.
4. SELECT-only. `ALTER/CREATE/DROP/UPDATE/DELETE/INSERT`, migration, backfill e cron
   exigem aprovação explícita do Alf.
5. Sempre dizer **a que competência** o número se refere e **quando** o sync rodou
   (`sync_completed_at` / `snapshotEmusysEm`).
