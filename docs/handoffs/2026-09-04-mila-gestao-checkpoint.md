# Mila de gestão — checkpoint vivo (04/09/2026, noite)

Onde a frente parou, o que está no ar, o que falta. **Ler antes de retomar.**
Plano e histórico completos em `docs/superpowers/specs/2026-09-04-mila-gestao-plano.md`.

---

## Onde estamos

| camada | quem | estado |
|---|---|---|
| **Alicerce** | governança, RPCs canônicas, carimbo, escopo | ✅ fechado |
| **1º andar — operacional** | as 3 consultoras (Vitória/CG, Daiana/Recreio, Kailane/Barra) | ✅ **no ar, é onde estamos** |
| **2º andar — tática** | gerentes de unidade | ❌ não existe |
| **3º andar — estratégica** | diretoria | 🟡 só tráfego pago e radar; sem relatório próprio |

O 1º andar está **completo nas quatro capacidades**: ela responde, ela escreve
no cadastro, ela manda sozinha (2×/dia + cutucada horária), e ela fala por elas
com cliente e professor mediante aprovação.

---

## O que está no ar

### 17 ferramentas (MCP `mila-gestao-tools`)

**Leitura (7):** `minha_pauta` · `agenda_do_dia` · `fechamento_do_dia` ·
`numeros_do_mes` · `estrelas_matriculador` · `ficha_lead` · `pendencias_comerciais`
**Escrita no cadastro (6):** `registrar_curso_interesse` · `registrar_motivo_perda` ·
`registrar_canal_origem` · `registrar_consultor` · `anotar_lead` · `fechar_sinal`
**Recado (4):** `propor_recado` · `revisar_recado` · `recado_pendente` · `enviar_recado`
**Tráfego (3, só diretoria):** `trafego_por_canal` · `trafego_por_criativo` · `publicos_reativacao`

### 4 crons (user `mila`, VPS em UTC)

| cron | horário BRT | o quê |
|---|---|---|
| `30 11 * * 1-6` | 08:30 | briefing do dia |
| `0 12-21 * * 1-6` | 09h–18h | cutucada (R18 preso no bot + R7 promessa sem retorno) |
| `30 21 * * 1-6` | 18:30 | fechamento do dia + o mês contra a meta |
| `*/5 * * * *` | sempre | vigia: avisa no tópico Logs quando a Mila falha ou cala |

⚠️ **O Luciano ia conferir os horários com as meninas** — ajustar quando ele disser.

### Perfis Hermes

| perfil | quem cai nele | particularidade |
|---|---|---|
| `mila-consultor-readonly` | `pode_editar=false` (20 colaboradores) | produção; **envia de verdade** |
| raiz `/home/mila/.hermes` | diretoria (Luciano, Hugo, Anne Susan) + Telegram | — |
| `mila-shadow` | só o script de teste | `MILA_GESTAO_DRY_RUN: "1"` no config |
| `mila-sdr` | leads | intocado |

---

## Regras de negócio que ficaram travadas (não reabrir sem medir)

- **Matrícula do comercial** = `matriculas_comerciais_v1`, que **replica o
  predicado do relatório**: fora 2º curso, bolsista, banda/coral, transferência,
  sem parcela, arquivada; agrupa por pessoa+data. Ago/2026: **CG 24 · REC 23 ·
  BAR 19**, idêntico ao relatório da equipe.
- **Show-up** = experimentais **+ visitas**. ⚠️ visita não tem confirmação de
  comparecimento (100% fica `agendada`) e só CG registra.
- **Mês fechado vem do snapshot**, não do vivo. O vivo dava 279 leads e 61
  experimentais em ago/REC contra 278 e 51 do relatório.
- **Experimental**: situação resolvida pela AULA (`vw_experimental_situacao_v1`),
  com estado `reagendada`. A edge não marca mais "realizada" antes da aula ocorrer.
- **Escopo**: só a unidade de quem pergunta. Sempre.

---

## O que falta

### Próximo passo natural
1. **2º andar (gerentes)** — nada construído. É o salto de camada.
2. **Ranking/metas por consultora** — possível agora que `consultor_id` está 100%.
3. **Alerta de queda de desempenho** — precisa de ~2 semanas de série.

### Pendências conhecidas, com o porquê
- **Visita sem comparecimento**: ninguém marca quem veio. Ou alguém passa a
  marcar, ou o show-up continua sendo "agendado no mês".
- **`emusys_aula_id` de EVENTO**: quando o webhook grava id de evento no lugar do
  id da aula, a situação não cruza com a grade e cai no status gravado. Dívida
  antiga do webhook de experimental.
- **Google Ads por termo de busca** — declarado fora de escopo, para depois.
- **Calendário escolar** — 0 linhas; recesso ainda é tratado como dado faltando
  por quem não sabe.
- **Sazonalidade** e **"acompanhar pendência até o responsável assumir"** — não
  começados.

---

## Cicatrizes do dia (não repetir)

1. 🔴 **O Hermes NÃO propaga env do processo para o MCP.** Chegam 12 variáveis.
   Qualquer coisa que o servidor de ferramentas precise saber tem que ir pelo
   bloco `env:` do `mcp_servers` no config do perfil, que **interpola**.
   Custou dois incidentes no mesmo dia: o carimbo (todas falavam como diretoria)
   e o modo sombra (mandou WhatsApp real para o professor Erick e a lead Jullyane).
2. 🔴 **Arquivo de segredo sobrescreve o `env:` do perfil** — o `source` atribui
   incondicionalmente. O wrapper captura antes e restaura depois (carimbo e DRY).
3. 🔴 **Validar no caminho REAL, não no wrapper.** A prova de isolamento feita
   chamando o `.sh` direto passou, e a cadeia Hermes→MCP estava quebrada.
4. 🔴 **Antes de liberar perfil Hermes para gente**, rodar `hermes chat -q "ok"`
   naquele `HERMES_HOME` e exigir `rc=0` sem aviso de fallback. O perfil das
   consultoras estava morto (xai-oauth) e ninguém viu porque ninguém tinha escrito.
5. ⚠️ **Formato é molde, não instrução.** "Formato de WhatsApp, curto" produzia
   texto corrido. O envelope leva o molde literal.
6. ⚠️ **O proxy do Chatwoot devolve 403 sem User-Agent explícito** — 200 no curl,
   403 no cliente HTTP sem UA. Parece permissão de token e não é.
7. ⚠️ **Não inventar regra quando o relatório já tem a canônica.** Meu filtro de
   "passaporte pago" divergiu do relatório em Recreio e Barra.

---

## Como testar antes de mexer

```bash
sudo -u mila /usr/bin/python3 /home/mila/.openclaw/workspace/scripts/mila-shadow.py --listar
sudo -u mila /usr/bin/python3 /home/mila/.openclaw/workspace/scripts/mila-shadow.py
```

10 cenários multi-turno no caminho real, com checagens: pauta, agenda, mês
fechado, mês corrente, isolamento, ranking, ficha, recado (professor e cliente),
troca de texto e **conversa solta de 6 turnos sem citação**.

⚠️ Roda no perfil `mila-shadow`. **Nunca apontar o shadow para o perfil de
produção** — foi assim que saiu mensagem de verdade em 04/09.

---

## O fio da conversa (dúvida do Luciano, respondida)

A consultora **não precisa citar/marcar** a mensagem da Mila. A sessão é **por
pessoa** (`consultor-v2-<telefone>`), então o histórico já é o fio — ela pausa,
pergunta outra coisa, volta e diz "muda aquilo", e a Mila sabe do que se trata.
Provado: 6 turnos soltos → 1 recado, 2 revisões acumuladas.

A citação é característica da **Maria**, porque ela trabalha em grupo com várias
propostas abertas ao mesmo tempo — lá a citação desambigua qual proposta e qual
chat. A Mila conversa uma a uma. `recado_pendente` só entra quando o fio se
perde de verdade (reinício, sumiço longo); se nem assim, ela pergunta.
