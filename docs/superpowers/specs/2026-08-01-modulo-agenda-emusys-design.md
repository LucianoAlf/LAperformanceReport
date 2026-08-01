# Módulo Agenda (espelho enriquecido do Emusys) — design

**Data:** 2026-08-01
**Status:** aprovado para implementação
**Maquete:** https://claude.ai/code/artifact/e57a4e1d-fb86-47e8-9185-0f0d5caaebe9

## Problema

O Emusys tem uma tela de Agenda (timeline por professor, com régua do horário atual) que a operação usa
todo dia. Ela tem duas limitações: obriga trocar de escola para ver outra unidade, e não conhece nada do
que só existe no LA Report — risco de evasão, inadimplência, nota da pesquisa pós-1ª aula.

O LA Report já guarda a agenda inteira das 3 unidades em `aulas_emusys`, mas não a exibe em lugar nenhum.

## Escopo

**Entra:** módulo próprio em `/app/agenda`; visão Dia; agrupamento por professor ou por sala; filtro de
unidade; navegação livre entre dias (passado e futuro); régua do horário atual em tempo real; painel de
detalhe da aula com dados do aluno e enriquecimento do LA Report.

**Fica fora (fase 2):** cancelar e reagendar aula (a API suporta — `POST /aulas/cancelar`,
`PATCH /aulas/reagendar`); visão Semana.

**Não entra:** backfill da janela histórica incompleta (ver "Integridade do histórico").

## Fontes de dados

Tudo já existe e é alimentado por crons ativos. **Nenhum cron novo, nenhuma chamada nova à API do Emusys.**

| Dado | Origem | Como é alimentado hoje |
|---|---|---|
| Aulas (horário, duração, curso, turma, sala, professor, nº da aula, cancelada, reagendada, justificada, anotações) | `aulas_emusys` | `sync-grade-futura-emusys` (madrugada, janela de 35 dias) + `sync-presenca-emusys` modo metadados (`sync-metadados-aulas-15m-u0/u1/u2`, a cada 15 min) |
| Presença batida | `aluno_presenca` | `sync-presenca-emusys` (após a aula) |
| Risco de evasão | `vw_risco_evasao_atual` | cron `calcular-risco-evasao-3d` |
| Inadimplência | `aluno_jornada_matricula_disciplina.inadimplente_emusys` | `sync-matriculas-emusys` (02h BRT) |
| Nota da pesquisa 1ª aula | `pesquisas_whatsapp` | `processar-resposta-pesquisa` |

**Frescor:** o dado da agenda tem até 15 min de atraso. A tela exibe "Sincronizado há X min" a partir do
último `created_at` da unidade. Não haverá botão de "atualizar agora": `GET /aulas` sem filtro de data
custa ~9s e o rate limit é de 60 req/min — não vale expor esse gatilho ao usuário.

A régua vermelha é independente disso: é o relógio do cliente, `setInterval` de 30 s.

## Decisões de arquitetura

### 1. Vínculo aula↔aluno: tabela nova `aula_alunos`

**Problema:** a grade futura não sabe quem é o aluno. `aluno_presenca` só ganha linha depois da aula
acontecer (o `sync-grade-futura` popula `aulas_emusys` explicitamente "sem escrever presenças"). Em
04/08/2026, 136 aulas em Recreio e 0 alunos vinculados. Sem isso o card mostra "Guitarra · Slash · aula 22"
sem dizer de quem — perde o principal da tela do Emusys.

**Solução:** persistir o `alunos[]` que a resposta do `GET /aulas` **já traz** e que o sync hoje descarta
(só conta em `qtd_alunos`). Nenhuma chamada extra à API.

**Onde persistir — decisão consciente contra o DRY:** `aluno_presenca` já tem as colunas necessárias
(`aula_emusys_id`, `aluno_id`, `curso_nome`, `turma_nome`, `sala_nome`), mas **não** será reusada. Aquela
tabela é a fonte de verdade da presença: alimenta os KPIs de frequência do professor e o fluxo de
confirmação por WhatsApp (`token`, `mensagem_uazapi_id`, `respondido_por`, `status`). Inserir linhas de
aula futura ali contamina os dois. O custo de não reusar é uma tabela pequena; o custo de reusar é risco
em produção com vários consumidores ativos. Fica a tabela nova.

```sql
create table aula_alunos (
  id            bigserial primary key,
  aula_emusys_id integer not null references aulas_emusys(id) on delete cascade,
  unidade_id    uuid not null references unidades(id),
  aluno_id      uuid references alunos(id),      -- null quando é lead (experimental)
  emusys_aluno_id integer,                        -- id_aluno da API
  lead_id       integer,                          -- id_lead da API (0/null se já é aluno)
  nome          text not null,                    -- snapshot: nome_aluno da API
  telefone      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (aula_emusys_id, nome)
);
```

`unique (aula_emusys_id, nome)` e não `(aula_emusys_id, aluno_id)` porque `aluno_id` pode ser null em
experimental — um `unique` com null não deduplica no Postgres. RLS por unidade, no padrão de `metas`.

Forward-only: vale para as aulas sincronizadas a partir do deploy. Aulas passadas continuam sem vínculo
próprio e usam `aluno_presenca` (que já tem o aluno, para os dias em que a presença foi batida).

### 2. Sync: uma edge alterada, zero cron novo

`sync-grade-futura-emusys` passa a fazer upsert em `aula_alunos` a partir de `aula.alunos[]`, no mesmo laço
em que já calcula `qtd_alunos`. `sync-presenca-emusys` (modo metadados) faz o mesmo, para que reagendamentos
e alunos incluídos depois sejam refletidos dentro da janela de 15 min.

Ambos os crons já existem e continuam com o mesmo agendamento.

### 3. Leitura: uma RPC que já devolve agrupado

`aulas_emusys` guarda **uma linha por aluno** em aulas de turma — é como a API do Emusys devolve — e ainda
duplica `tipo=turma` + `tipo=individual` no mesmo horário. Exemplo real: turma `C_Ter_18` da Lohana, terça
04/08 às 18:00, sala Palavra Cantada — **5 linhas**. Renderizar linha a linha empilha 5 cards idênticos.

A RPC `get_agenda_dia(p_unidade_id uuid, p_data date)` resolve isso no SQL e devolve as aulas já agrupadas
por `(professor_nome, sala_nome, data_hora_inicio, duracao_minutos)`, com os alunos aninhados em `jsonb` e o
enriquecimento junto. `p_unidade_id` null = todas as unidades que o usuário pode ver.

Cada item devolvido:

```
{
  chave, professor_nome, professor_id, sala_nome, curso_nome, turma_nome,
  data_hora_inicio, data_hora_fim, duracao_minutos,
  categoria, tipo, cancelada, justificada, reagendada, data_hora_inicio_original,
  nr_da_aula, qtd_alunos, anotacoes, professor_presenca,
  alunos: [ { aluno_id, nome, idade, responsavel_nome, responsavel_telefone,
              status_presenca, risco_pct, inadimplente, nota_pesquisa, data_ultima_aula } ]
}
```

**De onde vêm os alunos:** a RPC monta `alunos[]` unindo `aula_alunos` (vínculo da grade, forward-only) com
`aluno_presenca` (que já tem o aluno nos dias em que a presença foi batida), deduplicando por `aluno_id`.
Assim o dia futuro mostra quem vai ter aula e o dia passado mostra quem teve, mesmo antes do deploy do
item 1. `status_presenca` só vem de `aluno_presenca` e é null no futuro.

Volume: 130–180 aulas por unidade por dia, ~450 no consolidado. Uma chamada por dia navegado.

O agrupamento e os joins ficam no SQL para que o componente não faça malabarismo com as linhas duplicadas.

## Integridade do histórico

Investigado em 01/08/2026. **O passado é retido** — não existe cron, trigger ou edge que delete
`aulas_emusys` de dias passados, e a evidência confirma: 18/07 já passou há duas semanas e segue com
125 (Barra) / 174 (CG) / 82 (Recreio) aulas.

Existe, porém, um **buraco conhecido**:

| Janela | Estado |
|---|---|
| até 18/07/2026 | íntegro |
| 19/07 a 26/07/2026 | **zero linhas**, nas 3 unidades, 8 dias seguidos |
| 27/07 a 01/08/2026 | resíduo (1 a 31 aulas/dia) |
| 03/08/2026 em diante | íntegro |

O padrão — mais linhas quanto mais recente o dia — indica um evento único de deleção por volta de 26/07,
seguido de reposição parcial pelo `sync-presenca-emusys` modo metadados, que varre alguns dias para trás.
A causa raiz não foi identificada e **não** está no código dos syncs.

**Decisão (Hugo, 01/08):** não fazer backfill agora. A navegação para trás fica livre, sem travar o passado.
Quando o dia consultado cair na janela 19/07–01/08, a tela exibe um aviso de dia incompleto em vez de
mostrar uma agenda vazia como se fosse verdade.

**Reparo opcional, quando quiser:** a edge `sync-presenca-emusys` aceita `data` e `dias` no corpo, então a
janela é reprocessável sob demanda, respeitando o rate limit de 60 req/min.

## Frontend

Rota `/app/agenda`, lazy, no padrão das demais entradas de `router.tsx`; item no `AppSidebar` com label
"Agenda" e ícone `CalendarClock`. Sem guard de e-mail — permissão pelo mesmo esquema das outras páginas
de operação.

| Componente | Responsabilidade |
|---|---|
| `AgendaPage` | Estado da tela: unidade, data, agrupamento (professor/sala), filtro "com aula". Chama o hook, monta KPIs, decide o aviso de dia incompleto. |
| `useAgendaDia` | Data fetching da RPC + cálculo do frescor ("sincronizado há X min"). Padrão dos demais hooks: Supabase direto, sem React Query. |
| `AgendaTimeline` | Trilhos por professor (ou sala), posicionamento dos cards por horário, alocação de faixas quando há colisão, régua do horário atual. |
| `AgendaCard` | Um bloco de aula. Cor e badge por estado: normal, experimental, reagendada, cancelada, sem aluno vinculado. |
| `AgendaDrawer` | Detalhe da aula selecionada: dados do aluno, badges de estado, bloco "Só no LA Report" (risco, financeiro, pesquisa), lista da turma quando houver mais de um aluno. |

Estados de exceção que a tela precisa tratar explicitamente, porque todos ocorrem nos dados reais:

- **Aula sem aluno vinculado** — rótulo da turma em itálico, cor neutra. É o estado de toda aula futura
  até o item 1 entrar em produção.
- **Dia sem nenhuma aula** — distinguir "não há aula neste dia" de "este dia está incompleto no banco"
  (janela 19/07–01/08).
- **Colisão de horário** — Isaque, 04/08: uma experimental de 30 min às 17:00 e uma turma cancelada às
  17:00. Faixas empilhadas dentro do trilho do professor.
- **Fora do horário de funcionamento** — antes das 08:00 ou depois das 22:00, a régua some e o KPI "em aula
  agora" mostra zero, não um valor enganoso.

Visual: tokens do LA Report (slate + emerald, dark e light), timeline horizontal de 08:00 a 22:00 com
scroll-x no container. O corpo da página nunca rola na horizontal.

## Testes

- **RPC:** turma com 5 linhas (`C_Ter_18`, Recreio, 04/08) colapsa em 1 item com 5 alunos; duplicação
  `turma`+`individual` no mesmo slot não gera 2 itens; dia sem aulas devolve vazio sem erro; `p_unidade_id`
  null devolve as 3 unidades.
- **Sync:** aula com 1 aluno, aula de turma com N alunos e experimental (aluno é lead, `aluno_id` null)
  gravam corretamente em `aula_alunos`; reprocessar o mesmo dia não duplica (idempotência do upsert).
- **Timeline:** duas aulas sobrepostas ocupam faixas distintas; a régua posiciona no minuto correto e some
  fora do expediente; card de aula cancelada não conta no KPI "em aula agora".

## Riscos

- `unique (aula_emusys_id, nome)` quebra se duas pessoas com nome idêntico estiverem na mesma turma. É raro
  e o efeito é perder uma das duas linhas, não corromper. Aceito; revisitar se aparecer.
- O snapshot de `nome` em `aula_alunos` não acompanha renomeação do aluno em `alunos`. Aceito: o nome serve
  para exibir a aula, e o `aluno_id` é a chave real para o enriquecimento.
- A janela histórica incompleta continua incompleta até alguém reprocessar. Documentado acima.
