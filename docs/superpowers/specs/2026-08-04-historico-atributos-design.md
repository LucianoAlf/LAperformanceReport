# Histórico de Atributos (Log Temporal Genérico) — Design

**Status:** desenho aprovado para revisão; nenhum DDL executado ainda
**Prioridade:** modo sombra (log passivo) — não substitui nada em produção
**Projeto Supabase de produção auditado:** `ouqwbbermlzqqvtqwlul`
**Data:** 04/08/2026

## 1. Contexto

Durante a investigação de um relato do Arthur ("alunos trancados somem da
carteira do professor quando o mês fecha, e alunos que voltam de trancamento
aparecem no mês errado"), ficou provado que a causa raiz não é um bug pontual:
**nenhuma tabela do sistema guarda o status histórico de um aluno por data**.
Tudo que existe hoje é:

- `alunos.status` / `alunos.professor_atual_id` — campo mutável, só reflete
  "agora". Sem histórico.
- `aluno_jornada_matricula_disciplina.status_matricula` /
  `.professor_id` — idem, é a tabela canônica (multi-curso) e também não tem
  nenhum rastro de mudança.
- `movimentacoes_admin` — log de eventos com data real (trancamento, evasão,
  renovação, aviso prévio, não renovação), mas cobre só os eventos que um
  handler explícito decide gravar. Não cobre, por exemplo, o retorno de um
  trancamento (o Emusys não emite esse evento em lugar nenhum — confirmado na
  documentação oficial da API).
- `audit_log` — trigger genérico já existente, grava linha inteira
  (antes/depois em JSON) a cada `UPDATE` em `alunos` e outras tabelas. Prova
  o conceito (reconstruímos o histórico completo do aluno Pedro Cindra Feijó
  a partir dela), mas tem retenção de só 90 dias (cron `cleanup-audit-log`) e
  pesa **360 MB** hoje, porque grava a linha inteira em vez de só o campo que
  mudou.
- `fechamento_mensal_snapshots` / `dados_mensais` / `professor_carteira_mensal_canonica`
  — os fechamentos mensais canônicos do sistema. Todos guardam **só o
  agregado do mês** (ex: `"alunos_trancados": 25`), nunca o detalhe de quem
  compõe esse número nem quando cada mudança aconteceu dentro do mês.

Conclusão da investigação: qualquer relatório que hoje tenta responder "quem
estava em tal status num mês passado" está, na prática, olhando o status
**atual**, não o histórico — porque não existe outra fonte. Isso vale não só
para a carteira do professor, mas para qualquer entidade do negócio cujo
estado muda com o tempo (status do aluno, aula cancelada/reagendada, estágio
do lead no funil comercial etc.).

## 2. Objetivo

Criar um mecanismo **genérico e reutilizável** que registre, com data exata,
toda mudança de um campo relevante em qualquer tabela do sistema — sem
precisar desenhar uma tabela nova a cada novo campo que se decida rastrear.

Fase 1 (este documento) é **modo sombra**: a tabela só recebe gravações via
trigger. Nada no sistema lê dela. Nenhum relatório, RPC ou tela muda de
comportamento. O objetivo é acumular dado real por um tempo e confirmar que a
captura está correta antes de qualquer sistema passar a confiar nela.

## 3. Fora do escopo (nesta fase)

- Substituir `dados_mensais`, `fechamento_mensal_snapshots` ou
  `professor_carteira_mensal_canonica`. Esses continuam sendo a fonte oficial
  de relatório enquanto o log não for validado.
- Qualquer mudança de RPC, view, hook ou tela do frontend.
- Migrar o `audit_log` existente ou desligar sua retenção de 90 dias.
- Rastrear campos financeiros (`valor_parcela`, `forma_pagamento`,
  inadimplência) — fica para uma leva futura, depois de validar o padrão com
  os campos categóricos (status) primeiro.
- Backfill do histórico anterior a hoje (tratado à parte, seção 8).

## 4. A tabela — coluna por coluna

```sql
create table public.historico_atributos (
  id            uuid primary key default gen_random_uuid(),

  tabela        text not null,
  registro_id   text not null,
  atributo      text not null,
  valor         text,
  contexto      jsonb,

  valido_de     timestamptz not null,
  valido_ate    timestamptz,

  fonte         text not null,
  criado_em     timestamptz not null default now()
);
```

| Coluna | Tipo | O que grava | Exemplo real (Pedro Cindra Feijó) |
|---|---|---|---|
| `id` | `uuid` | Identificador único da linha. Não tem significado de negócio, só existe pra ter chave primária. | `a1b2c3d4-...` |
| `tabela` | `text` | Nome da tabela de origem onde a mudança aconteceu. Permite a mesma tabela de histórico servir pra `alunos`, `leads`, `aulas_emusys` etc. sem misturar. | `'alunos'` |
| `registro_id` | `text` | O `id` do registro que mudou, na tabela de origem. É `text` (não `integer`/`uuid` fixo) porque `alunos.id` é integer mas `leads.id` pode ser outro tipo — texto serve pra qualquer um. | `'870'` |
| `atributo` | `text` | Nome da coluna que mudou. Uma mesma linha de `alunos` pode gerar históricos separados pra `status` e pra `professor_atual_id` — cada mudança de campo é uma linha própria, não uma linha por registro. | `'status'` |
| `valor` | `text` | O valor **novo** daquele atributo, a partir do momento em que essa linha passou a valer. Sempre texto — evita ter uma coluna por tipo de dado (boolean, integer, texto) pra cada atributo diferente que a gente for rastreando. | `'trancado'` |
| `contexto` | `jsonb` | Dimensões extras que a gente quer poder filtrar sem precisar fazer JOIN de volta na tabela de origem (que pode já ter mudado desde então). Ex: guardar `unidade_id`, `curso_id`, `professor_id` no momento da mudança, mesmo que o atributo rastreado seja só `status`. Opcional — pode vir `null` se não precisar. | `{"unidade_id": "368d...", "professor_id": 6, "curso_id": 16}` |
| `valido_de` | `timestamptz` | A partir de quando esse valor passou a ser verdade. É preenchido com o instante em que o trigger disparou (a hora real da mudança no banco). | `'2026-06-01 14:13:16'` |
| `valido_ate` | `timestamptz` | Até quando esse valor foi verdade. **`NULL` significa "ainda vale agora"** — é a linha "aberta" daquele `(tabela, registro_id, atributo)`. Quando o valor muda de novo, essa coluna é preenchida com a data da próxima mudança, fechando o período. | `'2026-06-26 23:19:44'` (foi fechada quando ele voltou a ativo) |
| `fonte` | `text` | De onde veio essa gravação — sempre vai ser `'trigger:<nome_da_tabela>'` nesta fase, porque só os triggers escrevem aqui. Serve pra diferenciar de gravações futuras (ex: backfill) sem confundir a origem do dado. | `'trigger:alunos'` |
| `criado_em` | `timestamptz` | Quando a LINHA foi inserida no banco (auditoria da própria tabela de histórico, não do evento de negócio). Normalmente igual a `valido_de`, mas existe separado por disciplina — nunca se mistura "quando a mudança aconteceu" com "quando eu descobri/gravei ela". | `'2026-06-01 14:13:16.401'` |

### Índices

```sql
-- Garante que só existe 1 linha "aberta" (valido_ate IS NULL) por
-- (tabela, registro_id, atributo). Sem isso, um bug no trigger poderia
-- abrir duas linhas vivas ao mesmo tempo pro mesmo campo.
create unique index uq_historico_aberto
  on historico_atributos (tabela, registro_id, atributo)
  where valido_ate is null;

-- Acelera a pergunta "quem estava com status X numa data Y" —
-- é o índice que a consulta de reconstrução histórica vai usar.
create index ix_historico_consulta
  on historico_atributos (tabela, atributo, valor, valido_de, valido_ate);
```

## 5. A função genérica — o que ela faz, passo a passo

```sql
create or replace function public.fn_historizar_atributo()
returns trigger as $$
declare
  v_tabela text := TG_ARGV[0];
  v_campo text := TG_ARGV[1];
  v_registro_id text := (to_jsonb(NEW)->>'id');
  v_valor_novo text := (to_jsonb(NEW)->>v_campo);
  v_valor_antigo text := (to_jsonb(OLD)->>v_campo);
begin
  -- Passo 1: se o valor não mudou de verdade (ex: sync tocou a linha
  -- sem alterar o campo rastreado), não faz nada. Evita o ruído que
  -- vimos no audit_log genérico (linhas "trancado -> trancado" repetidas).
  if v_valor_antigo is not distinct from v_valor_novo then
    return NEW;
  end if;

  -- Passo 2: fecha a linha que estava valendo até agora (se existir).
  -- Na primeira mudança de um registro, não existe linha aberta ainda —
  -- esse UPDATE simplesmente não afeta nenhuma linha, sem erro.
  update public.historico_atributos
  set valido_ate = now()
  where tabela = v_tabela
    and registro_id = v_registro_id
    and atributo = v_campo
    and valido_ate is null;

  -- Passo 3: abre a linha nova, valendo a partir de agora.
  insert into public.historico_atributos (
    tabela, registro_id, atributo, valor, valido_de, fonte
  ) values (
    v_tabela, v_registro_id, v_campo, v_valor_novo, now(), 'trigger:' || v_tabela
  );

  return NEW;
exception when others then
  -- Passo 4 (proteção): se algo aqui der errado, NUNCA deixa isso
  -- quebrar a escrita original na tabela de negócio. O log é
  -- best-effort — perder uma linha de histórico é aceitável;
  -- travar um sync do Emusys por causa do log não é.
  raise warning 'fn_historizar_atributo falhou para %/%/%: %',
    v_tabela, v_registro_id, v_campo, sqlerrm;
  return NEW;
end;
$$ language plpgsql;
```

**Quando ela dispara:** nunca sozinha — sempre presa a um `AFTER UPDATE OF
<campo>` de uma tabela específica. O Postgres só chama o trigger quando
aquela coluna específica está na lista do `UPDATE` (mesmo que o valor final
seja igual — por isso o Passo 1 dentro da função é necessário como segunda
camada de proteção).

**Quem dispara ela:** qualquer coisa que faça `UPDATE` na tabela de origem —
o webhook `processar-matricula-emusys`, o sync noturno `sync-matriculas-emusys`,
uma edição manual feita por um admin na tela, uma correção manual via SQL.
Não importa a origem, o trigger reage à mudança da linha, não a quem mudou —
é por isso que esse mecanismo não pode ser implementado dentro de cada edge
function separadamente (qualquer caminho novo de escrita esqueceria de
registrar).

## 6. Os triggers da primeira leva

Cada trigger é uma linha de SQL — anexa a função genérica a um campo
específico de uma tabela específica.

```sql
-- 1. Status do aluno (tabela legada, mas ainda usada por vários KPIs)
create trigger trg_hist_alunos_status
after update of status on public.alunos
for each row execute function public.fn_historizar_atributo('alunos', 'status');

-- 2. Professor responsável (tabela legada)
create trigger trg_hist_alunos_professor
after update of professor_atual_id on public.alunos
for each row execute function public.fn_historizar_atributo('alunos', 'professor_atual_id');

-- 3. Status da matrícula-disciplina (tabela canônica multi-curso —
--    a que a Carteira e a Performance usam de verdade hoje)
create trigger trg_hist_jornada_status
after update of status_matricula on public.aluno_jornada_matricula_disciplina
for each row execute function public.fn_historizar_atributo('aluno_jornada_matricula_disciplina', 'status_matricula');

-- 4. Professor responsável (tabela canônica)
create trigger trg_hist_jornada_professor
after update of professor_id on public.aluno_jornada_matricula_disciplina
for each row execute function public.fn_historizar_atributo('aluno_jornada_matricula_disciplina', 'professor_id');

-- 5. Aula cancelada
create trigger trg_hist_aulas_cancelada
after update of cancelada on public.aulas_emusys
for each row execute function public.fn_historizar_atributo('aulas_emusys', 'cancelada');

-- 6. Estágio do lead no funil comercial — resolve, de quebra, o
--    problema já documentado em regras-negocio-canonicas.md §3.2
--    ("aula agendada em Maio e feita em Junho conta em Maio")
create trigger trg_hist_leads_status
after update of status on public.leads
for each row execute function public.fn_historizar_atributo('leads', 'status');
```

| # | Tabela | Campo | Por que entra na primeira leva |
|---|---|---|---|
| 1 | `alunos` | `status` | Origem do caso do Pedro/Lyanna/Caique. Vocabulário: `ativo`, `trancado`, `aviso_previo`, `evadido`, `nao_renovou` (regras-negocio-canonicas.md §1.4). |
| 2 | `alunos` | `professor_atual_id` | Resolve o caso original do Gabriel Antony (aluno trocou de professor e sumiu retroativamente de julho). |
| 3 | `aluno_jornada_matricula_disciplina` | `status_matricula` | É a tabela que a Carteira/Performance realmente consultam hoje. Sem histórico nela, o rastro de `alunos` sozinho não resolve o problema atual. |
| 4 | `aluno_jornada_matricula_disciplina` | `professor_id` | Mesma razão da 2, na tabela canônica. |
| 5 | `aulas_emusys` | `cancelada` | Pedido explícito seu — hoje não existe registro de quando/quantas aulas foram canceladas. |
| 6 | `leads` | `status` | Mesma classe de bug (atribuição de mês errada), já documentada como pendência conhecida no funil comercial. |

## 7. Exemplo de consulta que essa tabela passa a viabilizar

"Quem estava com aula cancelada em 15/07/2026?"

```sql
select registro_id as aula_id
from historico_atributos
where tabela = 'aulas_emusys'
  and atributo = 'cancelada'
  and valor = 'true'
  and valido_de <= '2026-07-15 23:59:59'
  and (valido_ate is null or valido_ate > '2026-07-15 23:59:59')
```

"Em que estágio o lead X estava em 10/07/2026?"

```sql
select valor as status_do_lead
from historico_atributos
where tabela = 'leads'
  and registro_id = '<lead_id>'
  and atributo = 'status'
  and valido_de <= '2026-07-10 23:59:59'
  and (valido_ate is null or valido_ate > '2026-07-10 23:59:59')
```

O padrão de consulta é sempre o mesmo, não importa o campo — é o mesmo motivo
pelo qual a tabela genérica vale a pena: quem for escrever essas consultas no
futuro não precisa aprender uma estrutura nova por domínio.

## 8. Custo medido (não estimado)

Números reais tirados do banco de produção em 04/08/2026:

| Métrica | Valor |
|---|---|
| Linhas em `alunos` | 1.615 |
| Linhas em `aluno_jornada_matricula_disciplina` | 4.855 |
| Eventos reais em `movimentacoes_admin` nos últimos 90 dias | 448 |
| Tamanho do `audit_log` genérico (JSON completo, 90 dias) | 360 MB |

`historico_atributos` grava só ~8 colunas escalares por linha (sem JSON da
linha inteira) e só quando o valor muda de fato — não a cada toque de sync.
Usando os 448 eventos/90 dias como proxy de volume real de mudança de
status, mesmo cobrindo os 6 campos da primeira leva, a projeção é de
centenas de linhas por trimestre, não milhares. Em anos de operação, o
tamanho fica na casa de poucos MB — ordens de grandeza abaixo do
`audit_log` existente.

Custo de escrita: o trigger só dispara quando a coluna rastreada está na
lista do `UPDATE` **e** o valor mudou de fato (dupla proteção: cláusula
`OF <campo>` no trigger + checagem `IS NOT DISTINCT FROM` dentro da função).
Na maioria dos `UPDATE`s que essas tabelas recebem (syncs noturnos
confirmando "nada mudou"), o trigger nem chega a fazer nenhuma escrita.

## 9. Plano de execução

1. Migration única: `create table historico_atributos` + índices + função
   `fn_historizar_atributo` + os 6 triggers da tabela da seção 6.
2. Sem backfill nesta primeira entrega — a tabela nasce vazia e começa a
   acumular dado a partir do deploy. (Backfill do `audit_log` de 90 dias e do
   `movimentacoes_admin` completo fica como frente separada, se decidido
   depois.)
3. Sem nenhuma mudança em RPC, view, hook ou componente React.
4. Critério de saída do modo sombra (decisão futura, não desta entrega):
   depois de um período observando os dados acumulados, decidir quais
   relatórios passam a consultar `historico_atributos` em vez do status
   "ao vivo" — a começar pela Carteira do Professor, que foi o caso que
   originou esta investigação.

## 10. Perguntas em aberto para revisão

- Confirmar se `leads.id` e `aulas_emusys.id` são mesmo os identificadores
  certos para `registro_id` (ou se `aulas_emusys` deveria referenciar
  `aula_alunos_emusys` em vez da aula em si, dado que uma aula de turma tem
  vários alunos).
- Definir, quando chegar a hora, o formato exato do JSON em `contexto` para
  cada tabela (quais dimensões vale a pena desnormalizar ali).
- Decidir se `historico_atributos` também deveria, no futuro, ganhar o campo
  `motivo` (hoje só disponível em `movimentacoes_admin`) via enriquecimento
  cruzado — fora do escopo desta entrega.
