# Central de notificações do professor — desenho

**Pedido:** prof. Isaque, 17/09/2026 (no Emusys isso é uma aba própria; hoje o professor
precisa abrir o Emusys para saber que a aula mudou, que um aluno pediu aviso prévio, etc.).
**Decidido com o Alf:** 17–18/09/2026. **Levantamento do LA Report:**
`docs/auditorias/2026-09-17-levantamento-eventos-emusys-rpcs.md` (repo LAperformanceReport).

## Decisões fechadas

1. **WhatsApp só do que muda o dia do professor**: aula de hoje ou de amanhã, e aniversariante
   do dia. O resto entra no resumo do bom-dia. **Tudo** fica na tela.
2. **Sino no topo do Início + tela própria.** A barra de baixo já tem 5 itens.
3. **Fonte = banco principal.** Uma tabela de eventos (append-only), preenchida por **gatilhos**
   no instante da mudança, com uma RPC por cima. Descartados: preencher pelas edge functions
   (mais peças em outro repositório, e a aula continua dependendo do pull) e consulta ao vivo
   (a `aulas_emusys` só guarda o estado atual, então o "antes" se perde; e pesa a cada abertura).
4. **Divisão:** o LA Report (dono das tabelas) faz a tabela, os gatilhos, a carga inicial, a RPC
   de serviço e a de aniversários. O LA Teacher faz a porta do app, o "já li", o sino, a tela e o
   disparo do Fábio.
5. **Ordem:** o contrato abaixo é fechado primeiro. Os dois lados trabalham em paralelo; a tela
   nasce com dados de exemplo no formato do contrato e troca a fonte quando a base ficar pronta.
6. **Troca de sala está FORA** (o Alf, 18/09: "não é relevante para a gente").

## Os tipos da v1

| tipo | quando nasce | para qual professor | observação |
|---|---|---|---|
| `aula_reagendada` | início da aula mudou | professor(es) da aula antes **e** depois | antes→depois de data/hora |
| `aula_cancelada` | `cancelada` passou de false para true | professor(es) da aula | com o motivo quando houver (36% têm); **sem** "quem cancelou" (só 21 de 1.987 têm autor) |
| `professor_trocado` | professor da aula ou do aluno mudou | quem **saiu** e quem **entrou** (uma linha de audiência cada) | `participacao` = `saiu` / `entrou` |
| `experimental_marcada` | experimental criada (ou reagendada) para o professor | `professor_experimental_id` | reagendamento/cancelamento de experimental também sai como `aula_reagendada`/`aula_cancelada` se a aula estiver em `aulas_emusys` — sem duplicar |
| `aluno_novo` | matrícula nova com jornada ligando o aluno ao professor | professor da jornada | a ligação nasce da jornada, não só da matrícula |
| `aviso_previo` | aviso adicionado, editado ou removido | professor(es) da jornada do aluno | `mudanca.depois.acao` = `adicionado`/`editado`/`removido`; motivo (categoria) + data prevista |
| `matricula_trancada` | status virou trancada | professor(es) da jornada | período do trancamento |
| `matricula_encerrada` | status virou inativa | professor(es) da jornada | `interrompida` / `concluida` |
| `matricula_alterada` | curso, disciplina ou turma mudou | professor(es) antes e depois | vai a descrição que o Emusys manda; antes→depois quando a jornada permitir |
| aniversário do dia / do mês | **não é evento** — calculado na leitura | professor da jornada | RPC própria (abaixo) |

**Janela das aulas:** só geram evento aulas cujo início (antes **ou** depois) está entre
**ontem e +14 dias**. Uma remarcação da grade inteira para daqui a 3 meses não vira 40
notificações.

**Nunca no payload:** valor, parcela ou qualquer dado financeiro; dado de saúde; `observacoes`
livres do aviso prévio (texto livre pode trazer as duas coisas); payload bruto de webhook;
presença/falta de aluno.

## O contrato

### Tabela (LA Report)

Nome sugerido: `eventos_operacionais` + `eventos_operacionais_audiencia` (evento ↔ professor,
com `participacao`). Obrigatório:

- `evento_id text` **único**, derivado do fato e da versão (regra do levantamento: aula =
  unidade + `emusys_aula_id` + tipo + hash antes/depois; aviso = unidade +
  `emusys_aviso_previo_id` + ação + hash; matrícula = unidade + matrícula + mudança + hash; troca
  = UUID de `aluno_professor_transicoes`). Nunca o id do envelope do webhook. Gravar o mesmo fato
  duas vezes = `on conflict do nothing`.
- `ocorreu_em` (quando aconteceu, se a fonte souber) e `detectado_em` (quando o banco viu).
- `origem`: `webhook` | `sincronizacao` | `carga_inicial`.
- índice de leitura `(professor_id, detectado_em desc, evento_id desc)` na audiência.
- `professor_id` = `professores.id` (o mesmo de `aulas_emusys.professor_id`), nunca `usuarios.id`.

**Gatilhos:** só agem quando o campo muda de verdade (`update of <coluna>` + `when (old.x is
distinct from new.x)`). Medido em 18/09: a `aulas_emusys` teve **1,2 milhão** de regravações
desde o último restart (o pull reescreve tudo a cada 15 min). Precedente na casa:
`trg_reagendamento_limpa_chamada_alunos` (`after update of data_hora_inicio`). O gatilho nunca
pode derrubar o sync: erro dentro dele vira aviso e segue.

**Carga inicial:** uma vez, os últimos **7 dias** (revisões de aula, `movimentacoes_admin`,
`lead_experimentais`, transições), com `origem = 'carga_inicial'`.

### RPC de serviço (LA Report) — quem chama: a porta do app e o Fábio

```sql
fn_eventos_operacionais_professor_v1(
  p_professor_id integer,           -- null = todos (só service_role; é o que o Fábio usa)
  p_desde timestamptz,              -- por detectado_em
  p_cursor_detectado_em timestamptz default null,
  p_cursor_evento_id text default null,
  p_limite integer default 50,      -- máx. 200
  p_tipos text[] default null
) returns jsonb
```

**Ordem e cursor por `detectado_em`, não por `ocorreu_em`.** O que o professor quer saber é "o
que eu ainda não vi", e o Fábio pergunta "o que apareceu desde a última rodada". `ocorreu_em`
vem nulo ou estimado em boa parte (pull e carga inicial), e ordenar por ele faria evento velho
recém-detectado cair no meio da lista já lida.

Devolve:

```json
{
  "itens": [
    {
      "evento_id": "u1:aula:123456:aula_reagendada:9f3c…",
      "tipo": "aula_reagendada",
      "professor_id": 42,
      "participacao": "responsavel",
      "ocorreu_em": "2026-09-18T13:40:00Z",
      "detectado_em": "2026-09-18T13:45:12Z",
      "origem": "sincronizacao",
      "unidade": { "id": "…", "nome": "Recreio" },
      "aluno": { "id": 987, "nome": "Lucas Silva" },
      "curso": "Teclado",
      "aula": { "emusys_id": 123456, "inicio": "2026-09-19T20:00:00Z",
                "fim": "2026-09-19T20:50:00Z", "turma": null },
      "mudanca": { "antes": { "inicio": "2026-09-19T18:00:00Z" },
                   "depois": { "inicio": "2026-09-19T20:00:00Z" } },
      "motivo": null,
      "detalhe": null
    }
  ],
  "proximo_cursor": { "detectado_em": "…", "evento_id": "…" }
}
```

- `participacao`: `responsavel` | `saiu` | `entrou`.
- `aluno`: `null` em aula de turma (a `aula.turma` vem preenchida).
- `aula`: `null` nos eventos de matrícula.
- `mudanca.antes`/`depois`: só as chaves que mudaram (`inicio`, `professor`, `curso`,
  `status`, `acao`, `data_prevista`, `periodo`).
- `detalhe`: texto curto vindo da fonte quando não há diff estruturado (ex.: a descrição de
  `matricula_alterada`).
- **Não vai no retorno:** `urgencia` (hoje/amanhã muda com o relógio; quem lê calcula pelo
  `aula.inicio` em horário de Brasília), `autor` e `confianca_fonte`.
- `revoke` de `public`/`anon`/`authenticated`; `grant execute` só para `service_role`.

### RPC de aniversários (LA Report)

```sql
fn_aniversariantes_do_professor_v1(p_professor_id integer, p_de date, p_ate date) returns jsonb
-- [{ "aluno": {id, nome}, "data_nascimento_dia_mes": "09-18", "idade_que_faz": 12, "curso": "…" }]
```

A regra de deduplicação é a do levantamento: pessoa = unidade + `emusys_student_id` (com o id
local como fallback), só matrícula operacional ativa (`vw_alunos_estado_operacional_v131`), fora
`arquivado_em`, ligação ao professor pela jornada. Intervalo que atravessa o ano (29/12 → 03/01)
tem que funcionar. Só `service_role`.

### Porta do app (LA Teacher)

`app_minhas_notificacoes_v1(p_cursor_detectado_em, p_cursor_evento_id, p_limite)`: resolve o
professor pelo login (como as outras `app_*`), chama a de serviço, junta os itens "do Fábio"
(tipos `fabio_*`, da nossa própria base), soma os aniversariantes do dia no topo e marca `lida` a partir da nossa tabela `notificacao_lida (professor_id, evento_id,
lida_em)`. Mais `app_marcar_notificacoes_lidas(p_evento_ids text[])` e
`app_notificacoes_nao_lidas()` (contador do sino).

### Aceite do lado do LA Report

- RPC de serviço com 50 itens de um professor: **< 50 ms** medidos no banco real (EXPLAIN).
- Tempo do job de sync da grade **antes × depois** dos gatilhos, nas três unidades.
- Teste por gatilho que falha sem ele (e um caso falso: regravar a aula sem mudar nada **não**
  gera evento).
- Relatório final com: migrations, assinaturas, índices, as medições acima e a contagem de
  eventos por tipo nas primeiras 24 h, com 1 exemplo de payload por tipo **sem nome de aluno**.

## Parte 3 — a tela "Novidades" (aprovada 18/09)

- **Sino** no `AppHeader`, entre o botão de tema e a foto, em toda tela que tem o cabeçalho.
  Número vermelho = não lidas (até "9+"); sem número quando zero.
- **Rota** `/app/novidades`. Lista da mais nova para a mais antiga, agrupada em Hoje / Ontem /
  data; **últimos 30 dias**. Cada linha: ícone por tipo, frase curta, detalhe, hora.
- **Aniversário de hoje** fixo no topo; "ver os do mês" abre a lista do mês.
- **Filtros:** Todas · Aulas · Alunos · Fábio.
- **Detalhe** ao tocar: bottom-sheet no celular (`z-50`, por cima da TabBar), janela no centro
  no desktop. Mostra antes → agora, motivo, "visto às HH:MM · pode levar até 15 min", e atalhos
  para a ficha do aluno e para a agenda.
- **Lida = ao abrir a tela**: tudo que a tela carregou vira lido e o sino zera; o destaque das
  novas fica até sair da tela.
- **Vazio:** "Nenhuma novidade nos últimos 30 dias. Quando algo mudar na sua agenda ou nos seus
  alunos, aparece aqui."
- **Desktop:** a mesma lista numa coluna central (sem esticar). Conferir 390×844 e 1400×900.
- **"Do Fábio" entra já na v1**, lido do que é nosso (devolutiva enviada, ficha no Emusys,
  cobrança). Não depende do LA Report: a tela nasce com dado real.

Frases por tipo (o aluno em turma vira o nome da turma):

| tipo | título | detalhe |
|---|---|---|
| `aula_reagendada` | Aula do Lucas mudou de horário | Amanhã · 18:00 → 20:00 |
| `aula_cancelada` | Aula de hoje cancelada | Lucas · 16:00 · motivo |
| `professor_trocado` (entrou) | Você assumiu a aula do Lucas | sáb 19/09 · 18:00 |
| `professor_trocado` (saiu) | A aula do Lucas passou para outro professor | sáb 19/09 · 18:00 |
| `experimental_marcada` | Experimental marcada | Nome · curso · data e hora |
| `aluno_novo` | Aluno novo: Pedro | curso · começa em |
| `aviso_previo` | Maria pediu aviso prévio (ou: retirou o aviso prévio) | sai em · motivo |
| `matricula_trancada` | Matrícula da Maria trancada | até DD/MM |
| `matricula_encerrada` | Maria encerrou a matrícula | concluída / interrompida |
| `matricula_alterada` | A matrícula do Lucas mudou | descrição do Emusys |

## Parte 4 — o Fábio (aprovada 18/09)

- **Na hora, no WhatsApp:** só `aula_reagendada`, `aula_cancelada`, `professor_trocado` e
  `experimental_marcada` cuja aula (antes ou depois) é **hoje ou amanhã** em horário de Brasília.
- **Agrupa:** tudo o que apareceu na mesma rodada para o mesmo professor vira **uma** mensagem.
- **Reconfere antes de enviar:** se o estado atual da aula já desfez a mudança, não manda.
- **Sem duplicata:** a fila trava por `evento_id`.
- **Silêncio das 22h às 7h:** o que chegar nesse intervalo vai para o bom-dia.
- **Bom-dia, bloco "Desde ontem":** aniversariante do dia, aluno novo, aviso prévio (motivo +
  data), trancada/encerrada, mudança de curso, e mudança de aula para depois de amanhã.
- **O Fábio responde sobre isso** ("o que mudou na minha agenda?", "alguém pediu pra sair?")
  lendo a mesma fonte da tela.
- **Só os 11 professores do teste** (`fn_professor_usa_app`).
