# Chamada na Agenda + Motor de Presença — Spec para validação

**Data:** 2026-08-11 · **Status:** aguardando validação do Alf · **Mock aprovado:** `docs/mockups/chamada-agenda.html`

> Decisões de produto já tomadas com o Hugo nesta data; pontos que mexem em
> indicador estão marcados como **[VALIDAR ALF]**.

---

## 1. Problema

1. **Fallback assassino:** o Emusys só tem `presente`/`ausente`, e `ausente` é o
   **default** de toda aula sem chamada. Hoje uma política de confiabilidade
   (`presenca_politicas_confiabilidade`, ativa até 2099) transforma esse ausente
   em `falta_confirmada`. Resultado real: aluno que FOI à aula recebe mensagem
   de cobrança porque a equipe esqueceu de lançar a chamada.
2. **Falta justificada não existe por aluno.** A API do Emusys só expõe
   `justificada` no nível da AULA (423 aulas em 60 dias, 100% não-canceladas).
   A `aluno_presenca_administrativo` existe, mas é cópia cega da flag da aula
   (10.877 linhas, 100% fonte `emusys`, zero manual) e nenhum consumidor lê.
3. **Reposição não tem elo.** A operação repõe **reagendando a aula original**
   (confirmado pelo Hugo). O sync já captura `reagendada` +
   `data_hora_inicio_original` (607 reagendadas/60d, 100% com data original),
   mas nada liga a falta/cancelamento à reposição. Passivo de reposições é
   invisível: ninguém sabe quantas aulas a escola deve.
4. **Sem enforcement:** ninguém é cobrado pelas aulas sem chamada.

## 2. Decisões de produto (validadas com Hugo, 11/08/2026)

| # | Decisão |
|---|---|
| D1 | Operador da ferramenta = **secretaria/coordenação** na página Agenda do Report. Teacher segue com a chamada dele no LA Teacher. |
| D2 | **Falta justificada conta como falta** nos indicadores (denominador intacto). Ganha rótulo, motivo, evidência e crédito de reposição. |
| D3 | **Cancelamento é ação da AULA** (não do aluno), com **motivo livre obrigatório** (chips são só sugestão) e **anexo de evidência opcional**. Ninguém toma falta; pacote estica; cada aluno ganha crédito. |
| D4 | **Reagendamento = reposição.** A secretaria reagenda a aula original no Emusys; o motor casa pelo elo direto (mesma aula, `data_hora_inicio_original`). Reagendamento sem crédito aberto = logística, não mexe em saldo. |
| D5 | **Indeterminado é o default visível.** Sem ação humana, o aluno fica cinza ("sem destino") — o ausente do Emusys não vira falta sozinho. **[VALIDAR ALF — muda denominador, ver §7]** |
| D6 | **Digest diário no WhatsApp admin**: "aulas de ontem sem destino" — só os indeterminados. Reusa o cano existente (`relatorio-admin-whatsapp` + fila + bridge). |
| D7 | Falta justificada tem **motivo obrigatório + upload de evidência** (atestado). Fica vinculada à falta. |
| D8 | Transições no tempo: falta → justificada → reposta. Toda mudança = retificação com autor/motivo/timestamp (tabela `aluno_presenca_retificacoes` já existe). |
| D9 | **Cancelamento por aluno: ESTACIONADO.** Hugo vai perguntar à equipe (caso: aluno sofreu acidente, turma vem). Se necessário, entra depois sem redesenhar — seria um cancelamento no grão aluno+aula com mesma mecânica de crédito. |
| D10 | O Report vira **autoridade de presença**; o Emusys vira fonte de agenda/grade e evidência de presença — nunca veredito. |

## 3. Máquina de estados

```
INDETERMINADO (default, cinza) ── ação humana ──┬─► PRESENTE (final)
                                                ├─► FALTA ──(+motivo+evid.)─► FALTA_JUSTIFICADA
                                                │        (crédito pendente)         │
                                                │        reagendamento chega        │
                                                │        do Emusys                  ▼
                                                │                              REPOSTA (crédito consumido)
AULA: ATIVA ─► CANCELADA (motivo obrigatório; crédito p/ cada aluno)
             ─► REAGENDADA (move no tempo; consome créditos abertos dos alunos)
```

Regras de precedência (já existentes, estender):
- Humano (teacher, secretaria, manual) **nunca** é sobrescrito pelo sync
  (`upsert_presenca_emusys_bruta` já tem o `WHERE respondido_por IN (...)`).
- Divergência evidência bruta × status final = **badge de conflito**, não
  sobrescrita (~20 casos/60d hoje; volume vai crescer com a ferramenta).
- `respondido_por` ganha novo valor: `'agenda_secretaria'`.

## 4. Modelagem de dados

### 4.1 Presença do aluno
- `aluno_presenca.status_presenca`: CHECK passa a aceitar `'falta_justificada'`
  (além de `presente`, `falta`). `status` legado segue `ausente` para
  compatibilidade com consumidores atuais.
- `respondido_por`: CHECK ganha `'agenda_secretaria'`.

### 4.2 Justificativa administrativa (por aluno) — expandir `aluno_presenca_administrativo`
- Novas colunas: `motivo text`, `evidencia_path text`, `autor_usuario_id int`,
  `autor_auth_user_id uuid`.
- Fonte ganha `'agenda_secretaria'`.
- Hoje ninguém consome a tabela — vira o detalhe da justificativa (motivo +
  evidência + autor), enquanto o status fica em `aluno_presenca`.

### 4.3 Cancelamento com motivo — `aulas_emusys`
- Novas colunas: `cancelada_origem text` (`emusys`|`agenda_secretaria`),
  `cancelada_motivo text`, `cancelada_evidencia_path text`,
  `cancelada_por_usuario_id int`, `cancelada_em timestamptz`.
- **Proteção de sync:** o `sync-presenca-emusys` não pode desfazer
  cancelamento humano (`cancelada_origem = 'agenda_secretaria'` vence; se o
  Emusys reativar a aula, registrar conflito em vez de reabrir silenciosamente).

### 4.4 Créditos de reposição — tabela nova `aluno_reposicoes`
```
id uuid pk
unidade_id uuid not null
aluno_id int not null
aula_origem_id int not null references aulas_emusys(id)
origem text not null check (origem in ('falta_justificada','cancelamento'))
status text not null default 'pendente'
  check (status in ('pendente','agendada','realizada','expirada','cancelada'))
motivo text                -- herdado da justificativa/cancelamento
evidencia_path text
aula_reposicao_id int references aulas_emusys(id)   -- preenchido no casamento
agendada_em timestamptz
realizada_em timestamptz
expira_em date               -- prazo de validade [VALIDAR ALF: existe prazo?]
created_at / updated_at
unique (aluno_id, aula_origem_id, origem)
```

### 4.5 Casamento do crédito (motor)
1. **Elo direto:** aula chega do sync com `reagendada = true` e
   `data_hora_inicio_original` → é a mesma linha (`aulas_emusys.id`), casamento
   por aula_origem + aluno. Validado nos dados: 607/607 reagendadas têm data
   original.
2. **Rede (canceladas):** reposição de aula cancelada pode nascer como aula
   nova → casamento por aluno + matrícula-disciplina + janela de datas
   (heurística, marca `agendada` com confiança menor e permite correção manual).
3. Reagendamento sem crédito aberto = logística, ignora.

### 4.6 Evidências
- Bucket Supabase Storage **`presenca-evidencias`** (privado, URL assinada —
  mesma regra de mídia privada do domínio aluno). Sem bucket público.

## 5. Backend — RPCs e jobs

| Artefato | Papel |
|---|---|
| `app_registrar_chamada_agenda(aula_id, itens jsonb)` | Chamada em lote: por aluno `{aluno_id, status, motivo?, evidencia_path?}`. Valida unidade/permissão, grava retificação ao alterar existente, gera crédito quando `falta_justificada`. |
| `app_cancelar_aula(aula_id, motivo, evidencia_path?, escopo)` | Marca cancelada + motivo + origem humana; gera 1 crédito por aluno do roster; `escopo = 'aula' \| 'unidade_dia'` (vendaval). |
| `app_justificar_falta(aluno_presenca_id, motivo, evidencia_path?)` | Transição falta → justificada com retificação + crédito. |
| Job/RPC `casar_reposicoes()` | Roda após o sync de presença: consome créditos por elo direto e rede. |
| Digest diário | Novo `tipo_relatorio` no cano existente (`fila_relatorios_whatsapp` + bridge): "Aulas de ontem sem destino: N" + lista. Cron segue o padrão dos relatórios admin. |
| `get_agenda_dia` v2 | Passa a trazer por aluno: `respondido_por`, motivo, evidência, `emusys_presenca_bruta` (badge de conflito), saldo de reposições; por aula: motivo de cancelamento. |

## 6. Frontend (mock aprovado como referência visual)

- **Visão Chamada** como 3ª aba da página Agenda (`Professores | Salas | Chamada`),
  com sub-visões **Dia / Semana / Lista** (sem Mês na fase 1).
- KPIs do dia: aulas, chamadas concluídas, **alunos sem destino**, canceladas.
- Banner do digest ("ontem fechou com N sem destino" → Lista filtrada).
- **Drawer lateral** (evolução do `AgendaDrawer`): ações da aula, chamada aluno
  a aluno com fotinha + "aula X de 40" + risco, reposições vinculadas,
  histórico de retificações da aula.
- Modais: `ModalJustificarFalta` (motivo + upload), `ModalCancelarAula`
  (motivo + upload + escopo unidade), `ModalReagendarAula` (fase 1: registra
  intenção; fase 2: chama `PATCH /aulas/reagendar` do Emusys).
- Badges na timeline (Professores/Salas): conflito Emusys×humano, reposição
  pendente, reposição consumida.
- Ícones Lucide (sem emoji): `Check`, `X`, `FileText`, `RotateCcw`,
  `AlertTriangle`, `Paperclip`.

## 7. Pontos para validar com o Alf **[VALIDAR ALF]**

1. **Fim do fallback:** desativar `ausencia_emusys_resultado='falta_confirmada'`
   por unidade quando o piloto entrar. `ausente` Emusys sem ação humana vira
   `indeterminado` (fora do denominador até ter destino). **Muda os números de
   frequência publicados** — é a decisão central do spec.
2. **Prazo do crédito de reposição:** expira? (30/60/90 dias, fim do contrato,
   ou nunca). Sugestão: começar sem expiração e medir o passivo.
3. **Cancelamento coletivo** (`escopo='unidade_dia'`): quem tem permissão?
   Sugestão: só admin/coordenação.
4. Falta justificada conta como falta (D2) — confirmar que o Sucesso do Aluno
   quer o rótulo separado nos relatórios (falta seca × justificada).

## 8. Rollout

1. **Fase 0** — este spec validado pelo Alf (nenhuma migration antes disso).
2. **Fase 1** — backend (§4, §5) + view semântica v1.3.
3. **Fase 2** — frontend (§6).
4. **Fase 3** — piloto em 1 unidade, convivendo com o Emusys; medir
   `chamadas feitas × indeterminados`; então cortar o fallback (item 7.1) e
   expandir para as 3 unidades.
5. **Fase 4 (opcional)** — reagendar/cancelar pelo Report chamando a API do
   Emusys (`POST /aulas/cancelar`, `PATCH /aulas/reagendar`), fechando o ciclo
   sem abrir o Emusys.

## 9. Pendências de negócio (não bloqueiam fase 0)

- **Cancelamento por aluno** (D9): Hugo consulta a equipe. Se vier, é o mesmo
  motor no grão aluno+aula.
- **Reposição de aluno de turma:** ritual da secretaria (encaixe em outra
  turma? aula avulsa?). O motor aguenta crédito aberto esperando; o casamento
  por rede cobre.
- **Significado da flag `justificada` de aula no Emusys** (423 em 60d, todas
  não-canceladas): confirmar com a operação; hoje a view semântica a exclui do
  denominador como `aula_justificada`.

## 10. Riscos residuais

- Sync do Emusys reativando aula cancelada localmente → mitigado por
  `cancelada_origem` + log de conflito (§4.3).
- Casamento por rede (canceladas) é heurístico → status `agendada` com
  confiança menor + correção manual na Lista.
- Volume de indeterminados no piloto pode ser alto nos primeiros dias → o
  digest é o mecanismo de pressão; medir antes de cortar o fallback.
