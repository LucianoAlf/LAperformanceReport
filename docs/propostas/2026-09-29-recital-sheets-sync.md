# Frente 2 — Planilhas do Recital no Drive (sync com o LA Report) — desenho para aprovação

> Status: **APROVADO COM AJUSTES (2026-09-29)**. Branch/PR separado da bilheteria.
> Sem n8n — tudo em Edge Function. Ajustes incorporados: (a) a edge **cria** a
> pasta de cada professor (hoje só Isaque tem) e **compartilha com o e-mail dele**
> como leitor — sem depender de herança; sem e-mail cadastrado → log + aviso à
> equipe; (b) a planilha da unidade é compartilhada **explicitamente** com uma
> lista configurável de e-mails da equipe — a pasta da unidade hoje só tem o dono;
> (c) a Fase 1 já escreve na ordem **ler → aplicar edições → reescrever** — nunca
> reescrita cega; (d) cron 15 min + botão manual (sem 5 min).

## Estrutura do Drive (já existe)

```
Recitais LA Music 2026/          (id 1s7pchXIKrzpwtCKyguZedG-VXd8ho2Re)
├── Barra/
│   └── Recital 2026/            (id 11Gb_klDaisjWlTyeF_YvwjLG57aMeAOK)
│       ├── Planilha GERAL da unidade          ← nova (equipe)
│       └── Isaque/                            (id 1EgwvWF6i7mpLnSlssTYsH8ScHcVStaxt)
│           └── Planilha do professor          ← nova (só dele)
├── Campo Grande/  (mesmo padrão)
└── Recreio/       (mesmo padrão)
```

> ⚠️ Correção de ID: `11Gb_klDaisjWlTyeF_YvwjLG57aMeAOK` é a pasta **"Recital 2026"
> da Barra**; a pasta do Isaque é `1EgwvWF6i7mpLnSlssTYsH8ScHcVStaxt`. Hoje só o
> Isaque tem pasta de professor — a edge cria as demais.

Duas planilhas por contexto: **uma geral por unidade** (equipe) e **uma por
professor** dentro da pasta dele.

## Planilha da UNIDADE (equipe)

Nome: `Recital 2026 — <Unidade> — Geral`. Abas no espírito da planilha atual:

### Aba `Alunos` (uma linha por participação)

| Coluna | Fonte | Editável? (Fase 2) |
|---|---|---|
| Ordem | posição na grade | ✅ (ordem/horário manual) |
| Aluno | `alunos.nome` | ❌ sempre |
| Curso | `cursos.nome` | ❌ |
| Professor | professor da apresentação | ❌ |
| Unidade origem | selo "de fora" (`unidade_origem_id`) | ❌ |
| Música | `evento_apresentacao` | ✅ |
| Artista | idem | ✅ |
| Duração (s) | idem | ✅ |
| Playback | anexo recebido? (bool) | ❌ (vem do Drive) |
| Link/URL | campo de link | ✅ |
| Rider/palco | `detalhes`/necessidades | ✅ |
| Obs mapa | observação operacional | ✅ |
| Convidados (qtd) | `evento_participacao.convidados` | ✅ |
| Participa? | `status` | ❌ |
| Formatura | `formatura` + tipo | ❌ |
| Relatório anual | status do relatório | ❌ |

### Aba `Ordem` (grade por bloco)

| Bloco | Data | Início | Ordem | Quem/Número | Música | Duração | Tipo |
|---|---|---|---|---|---|---|---|
| B1 | 20/12 | 10:00 | 1 | Bento — Violão | ... | 180 | aluno |
| B1 | 20/12 | 10:03 | — | Abertura | — | — | abertura |

Linhas `tipo<>aluno` entram como "número do programa" (sem dados de aluno).
Editável na Fase 2: ordem e `horario_inicial`/duração manual.

### Aba `Convidados` (por bloco)

| Bloco | Convidado | Aluno(s) vinculado(s) | Entrada | Check-in |
|---|---|---|---|---|
| B1 | Maria Silva | Bento | cortesia | 10:05 |

**LGPD:** nome + vínculo apenas. Nada de contato de comprador, documento,
telefone ou e-mail de convidado. (Quando a M9 entrar, `tipo_entrada` aparece
como "vendido"; dados da venda nunca vão para planilha de professor.)

### Aba `Staff`

| Nome | Função | Bloco |
|---|---|---|
| Arthur | credenciamento | B1 |

## Planilha do PROFESSOR (na pasta dele)

Nome: `Recital 2026 — <Professor>`. Uma aba `Meus alunos` — só as apresentações
dele, colada no que falta preencher:

| Aluno | Música | Artista | Duração | Playback | Link | Rider | Obs | Relatório | Pendências |
|---|---|---|---|---|---|---|---|---|---|
| Billy | ✅ Sweet Child | Guns | 210 | ✅ anexado | — | amp+2 mic | chegar cedo | ✅ aprovado | — |
| Lara | ⬜ — | — | — | ⬜ falta | — | — | — | ⏳ pendente | música, playback, relatório |

- Coluna **Pendências** é calculada: lista o que falta (`música`, `duração`,
  `playback`, `rider`, `relatório anual`) — é o "o que falta" que ele precisa agir;
- **Sempre só leitura**: Aluno, Curso, Unidade, Professor, Relatório, Playback
  (o arquivo em si — ele anexa na pasta dele, a edge só marca o status);
- Fase 2 editável: Música, Artista, Duração, Link, Rider, Obs.

## Sync — frequência e mecanismo

**FASE 1 (somente leitura, LA Report → Sheets):**
- Edge `recital-sheets-sync` chamada por **cron a cada 15 min** (`*/15 * * * *`),
  mesma auth da `recital-drive-sync` (Bearer service_role **ou** `x-sync-token`
  do Vault, comparação em tempo constante — padrão já existente);
- **+ botão "Atualizar planilhas"** na tela do evento (chama a mesma edge com o
  Bearer do service — para a equipe forçar refresh antes de reunião);
- ⚠️ **Ordem do ciclo já é a da mão dupla** (decisão do Alf — não implementar
  reescrita cega que destrua edição existente): cada ciclo (1) **lê** o estado
  atual das abas, (2) aplica/considera as edições conforme a arquitetura da
  fase — na Fase 1 a planilha está protegida, então "aplicar" = detectar e
  logar divergência, nunca aceitar; (3) só então **reescreve** as abas por
  completo (espelho, idempotente); `updated_at` de referência vai numa célula
  de rodapé ("espelho de 28/09 20:15");
- Planilha protegida contra edição: `protectedRanges` via API — o service
  account escreve, professor/equipe só leem.

**FASE 2 (mão dupla, depois da Fase 1 estável):**
- Mesma edge passa a ler de volta as colunas editáveis;
- **Conflito otimista por `updated_at`**: a célula espelhada carrega o
  `updated_at` da linha; se o banco mudou depois do que a planilha leu, o valor
  editado vai para uma aba `⚠ Revisão` (conflito exposto, nunca sobrescreve) e
  entra como pendência visual pra equipe resolver no LA Report;
- Toda escrita vinda da planilha usa `origem='planilha'` (já no vocabulário do
  GUC/audit da M2) — rastro completo no `audit_log`;
- Frequência da volta: a cada 15 min na mesma passada, ou sob demanda.

## Como o professor recebe o acesso

1. A edge **cria a pasta do professor** dentro do `Recital 2026` da unidade
   quando ela não existe (hoje só Isaque tem) e **compartilha a planilha com o
   e-mail cadastrado dele** como leitor — acesso explícito, não herdado;
2. **Sem e-mail cadastrado** → a edge não falha nem compartilha errado: loga
   `sem_email_professor` e a pendência aparece para a equipe resolver o cadastro;
3. O link aparece no card do professor na tela do evento no LA Report (e depois
   no LA Teacher);
4. **Planilha da unidade**: criada na pasta `Recital 2026` da unidade e
   compartilhada **explicitamente** com uma **lista configurável de e-mails da
   equipe** daquela unidade (a pasta hoje só tem o dono — não contar com herança);
   professores não recebem a geral;
5. Fallback: falha de API do Drive num item não derruba o ciclo — loga
   `drive_erro` por professor e segue com os demais.

## O que NÃO entra

- n8n (decisão do Alf — tudo Edge Function);
- contato/documento de convidado ou comprador em planilha de professor (LGPD);
- edição de aluno/curso/professor/unidade/relatório pela planilha (nunca);
- escrita direta na planilha pela equipe (planilha é espelho — quem muda muda
  no LA Report; na Fase 2 só os campos editáveis voltam);
- M9/bilheteria nas planilhas (frente separada).

## Ordem de implementação (depois do ok)

1. Edge `recital-sheets-sync` Fase 1: auth padrão, gera/atualiza as 4 abas da
   planilha da unidade + a aba `Meus alunos` de cada professor, protege ranges,
   cron 15min;
2. Smoke: rodar contra a pasta da Barra (já tem a do Isaque com o playback do
   Billy — valida o caso real);
3. Fase 2 depois de estável em campo.
