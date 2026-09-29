# Presença: como sai do Report e chega ao Emusys (estado em 29/09/2026)

Para quem vai mexer em presença pelo LA Teacher ou pelo Fábio. Este documento explica o circuito como ele roda hoje e o que mudou em 29/09. O desenho original do escritor está em [`docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md`](../plans/2026-09-25-presenca-escrita-emusys-desenho.md).

## 1. O circuito, de ponta a ponta

```
Tela (Agenda / LA Teacher / Fábio)
  └─ app_criar_comando_presenca_v1(request_id, tipo, ...)    → presenca_comandos + presenca_comando_itens
  └─ app_aplicar_comando_presenca_v1(request_id)             → grava aluno_presenca / aulas_emusys
        ├─ presenca_acao_eventos: 'item_aplicado' (1 por item)  ← é a FILA do escritor
        └─ fn_presenca_professor_por_aluno_presente_v1         ← NOVO em 29/09 (seção 3)
              │
              ▼  gatilho trg_presenca_emusys_escritor_evento (pg_net) + cron a cada 5 min
Edge presenca-emusys-escritor  (Report → Emusys, PATCH na API 1.7.0)
  └─ livro presenca_emusys_escrita (1 linha por decisão: escrito, ja_coerente, pulado_*, erro)
```

O sentido contrário, Emusys → Report, é outra peça: `sync-presenca-emusys` e o sync de metadados a cada 15 minutos. Esse sync **não** passa por comando e **não** gera evento.

### Tipos de comando e a fonte que cada um grava

| `tipo` do comando | Quem chama | `fonte` gravada |
|---|---|---|
| `agenda_chamada` | Chamada da Agenda (secretaria) | `agenda_secretaria` |
| `professor_aula`, `professor_dia`, `professor_dia_remover` | Botões de professor na Agenda | `agenda_secretaria` |
| `la_teacher_aula` | Professor no LA Teacher | `professor_la_teacher` |
| `fabio_audio_aula` | Fábio, pelo áudio | `fabio_audio` |
| `fabio_manual_aula` | Fábio, lançamento manual | `professor_la_teacher` |
| `fabio_aula` | Fábio, pelo WhatsApp | `professor_whatsapp` |

⚠️ **Presença nova que precisa chegar ao Emusys tem de passar por comando.** Um INSERT direto em `aluno_presenca` não gera `item_aplicado`, e sem esse evento o escritor nunca envia nada.

## 2. Como o escritor decide (regra em `_shared/presenca-escrita-decisao.ts`)

- **Descoberta do que falta enviar:** eventos `item_aplicado` dos últimos 7 dias que ainda não têm linha no livro `presenca_emusys_escrita`.
- **Ritmo:** 1,1 s entre chamadas, com nova tentativa em 5xx e 429 (o Emusys limita cerca de 120 chamadas por minuto).
- **Orçamento:** 120 s por rodada, compartilhado pelas 3 unidades. CG roda primeiro.
- **Precedência por fonte, nos dois sentidos:**
  - `agenda_secretaria` pode corrigir uma marcação humana feita no Emusys (presente ↔ falta);
  - `professor_la_teacher`, `fabio_audio` e as demais fontes **só preenchem** o que está sem resposta no Emusys. Marcação humana diferente vira `conflito_marca_humana` e não é escrita;
  - fonte `emusys` nunca é escrita de volta (proteção contra laço).
- **Falta justificada não é enviada** (`pulado_sem_canal_justificada`): a API não tem campo para isso.
- **Professor**, pela função `processarEventosProfessor`: evento com `aluno_id` nulo e `professor_id` preenchido. Com `aula_id` preenchido, vale só para aquela aula. Com `aula_id` nulo, vale para o dia inteiro, expandido para as aulas do professor na data. O valor enviado é o `aulas_emusys.professor_presenca` **vigente**, não o `status_novo` do evento.

## 3. O que mudou em 29/09/2026

### 3a. O escritor parou em CG e no Recreio (commit `7e4c8f9e`)

- **Causa:** o PostgREST corta toda leitura em cerca de 1.000 linhas, sem avisar. O livro passou desse tamanho. Os ids recentes sumiram da lista de "já feitos", e o escritor passou a reprocessar sempre os mesmos 200 itens antigos, estourando o orçamento antes de chegar aos novos.
- **Efeito:** CG ficou sem enviar desde 26/09 e o Recreio desde 28/09 (93 e 68 eventos pendentes).
- **Correção:** toda leitura de fila do escritor passou a usar `lerTodasAsPaginas` (páginas de 1.000, ordenadas por `id`). Erro de leitura agora aborta com `LEITURA_FALHOU` em vez de virar lista vazia.
- ⚠️ **Consulta nova no escritor que possa passar de 1.000 linhas precisa de paginação.**

### 3b. Aluno presente marca o professor presente, também no Emusys (migration `20260929195956`)

**Pedido do Arthur (Barra):** *"se eu der a presença para o aluno, logo o professor veio também"*. Caso real: Jairo presente na aula das 16h do Erick, e o Erick com ❌ no Emusys.

**Por que não funcionava antes.** O gatilho `trg_professor_presente_quando_aluno_presente` (em `aluno_presenca`) já punha o professor como `presente`, mas:
- gravava `professor_presenca_origem` nula. Origem nula não é protegida por `fn_proteger_decisao_humana_aula`, então o sync de 15 minutos trazia o "ausente" do Emusys de volta;
- não gravava evento, então o escritor nunca enviava.

**Como funciona agora.** No fim de `app_aplicar_comando_presenca_v1`, a função `fn_presenca_professor_por_aluno_presente_v1(request_id)` faz o seguinte:
1. **Procura as aulas do comando com aluno presente** (`item_aplicado` com `status_novo='presente'`).
2. **Inclui as gêmeas:** junta as aulas do mesmo professor, na mesma unidade e com o mesmo `data_hora_inicio`. O Emusys duplica o horário em `turma` e `individual`.
3. **Marca o professor** com `professor_presenca='presente'` e `professor_presenca_origem='aluno_presente'`, **somente onde a origem é nula**.
4. **Grava a fila:** um `item_aplicado` de professor (`aluno_id` nulo, `aula_id` e `professor_id` preenchidos) no **mesmo `request_id`**, antes do evento `concluido`.

**Guardas:**
- **Decisão da secretaria não é alterada:** origem `agenda_secretaria`, seja presente ou ausente, fica como está.
- **`aluno_presente` não tem precedência:** como não é `agenda_secretaria`, o escritor só preenche professor sem resposta no Emusys e nunca sobrescreve uma falta marcada lá.
- **A contagem da tela não muda:** `itens_aplicados` continua igual.
- **Reexecução não duplica.**
- **Falha não trava a chamada do aluno:** vai para `automacao_log` com `evento='presenca_professor_por_aluno'` e `status='erro'`, junto com o `request_id`.

**Tela:** a fonte `aluno_presente` aparece como "Aluno presente na aula" (`src/lib/presencaCanonica.ts`).

**Retroativo:** a regra foi aplicada às marcações de 29/09 (62 aulas: 3 enviadas ao Emusys, 59 já estavam certas lá, 0 conflitos) e aos 6 comandos da semana que ainda tinham professor ausente (16 aulas).

**Limitações conhecidas:**
- Desmarcar o aluno depois **não** desmarca o professor. O ajuste é pelo botão de professor da Agenda.
- Presença que vem do próprio Emusys não passa por comando, então a regra não a alcança. O gatilho antigo continua existindo para ela, mas só no Report.

## 4. O que isso significa para o LA Teacher e o Fábio

- **Marcar aluno presente pelo LA Teacher ou pelo Fábio (`la_teacher_aula`, `fabio_*`) já marca o professor.** Nenhum código a mais é necessário: a regra roda dentro de `app_aplicar_comando_presenca_v1`, que os dois já usam.
- **A anotação do Fábio (`aulas_emusys.anotacoes_fabio`, `registrar_aula_fabio`) não é tocada.** É outra coluna, com outra proteção (`trg_proteger_anotacoes_fabio`).
- **Tipo novo de comando que marque aluno presente herda a regra automaticamente**, desde que grave `item_aplicado` com `aluno_id` e `status_novo='presente'`.
- ⚠️ **Não reescrever `app_aplicar_comando_presenca_v1` a partir de uma migration antiga.** Ela precisa manter a chamada a `fn_presenca_professor_por_aluno_presente_v1` antes do `update public.presenca_comandos set status = ...`. Um `create or replace` feito a partir de um arquivo velho apaga essa chamada sem avisar.

## 5. Consultas de checagem

Eventos pendentes, isto é, sem linha no livro, por unidade. O número deve ficar perto de 0 poucos minutos depois das marcações:

```sql
select e.unidade_id, count(*)
from presenca_acao_eventos e
where e.tipo = 'item_aplicado' and e.fonte <> 'emusys'
  and e.criado_em > now() - interval '7 days'
  and not exists (select 1 from presenca_emusys_escrita w
                  where w.presenca_evento_id = e.id and w.decisao <> 'seria_escrito')
group by 1;
```

Resultado da regra do professor. Um aumento de `conflito_marca_humana` ou `erro` merece investigação:

```sql
select w.decisao, w.motivo, count(*)
from presenca_emusys_escrita w
join presenca_acao_eventos e on e.id = w.presenca_evento_id and e.aluno_id is null
join aulas_emusys ae on ae.id = e.aula_id
where ae.professor_presenca_origem = 'aluno_presente'
  and e.criado_em > now() - interval '2 days'
group by 1, 2 order by 3 desc;
```

Falhas da função nova:

```sql
select created_at, detalhes from automacao_log
where evento = 'presenca_professor_por_aluno' order by created_at desc limit 20;
```

## 6. Em aberto

- **Não há alarme** para "evento pendente há mais de 30 minutos". A falha de 26 a 28/09 ficou calada por 3 dias.
- **Envio direto no clique**, com a fila como reserva, foi discutido e não implementado. Hoje a latência é de até cerca de 5 minutos, pelo gatilho `pg_net` mais o cron.
