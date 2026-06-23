# Sincronização com Emusys — novos endpoints e backfills

**Data:** 2026-06-22
**Contexto:** O Emusys lançou a API v1.2.0 (21/06/2026) com `GET /matriculas` (pull de contrato) e `id_aluno`/`id_lead` nas aulas. Esta sessão usou esses endpoints para diagnosticar e corrigir divergências entre o Emusys e o LA Report.

---

## 1. Os novos endpoints e o que destravaram

| Endpoint / campo (novo em 21/06) | Para que serve |
|---|---|
| `GET /matriculas` | **Pull de contrato** — antes só chegava por webhook. Traz aluno, responsável, `contrato_atual` (datas, valores, disciplinas, professor) e `qtd_contratos`. |
| `id_aluno` / `id_lead` em `/aulas` | Vincula aula↔pessoa por **ID** (antes era só nome/telefone, frágil). |
| `GET /pessoas/buscar` | Busca pessoa por email/CPF/telefone. |
| `GET /crm/metricas` | Funil oficial do CRM por ano. |

Referência completa atualizada na skill `emusys-api` (v1.2.0).

---

## 2. Diagnóstico — alinhamento das 3 unidades (antes das correções)

Emusys ativas: Barra 254 / CG 539 / Recreio 416.

| Dimensão | Barra | CG | Recreio | Geral |
|---|---|---|---|---|
| Cadastro/Status (aluno ativo bate) | 97,4% | 96,2% | 97,9% | **97,0%** |
| numero_renovacoes (=qtd ou qtd−1) | 82,9% | 84,5% | 80,4% | **82,9%** |
| 2º curso (is_segundo_curso) | 100% | 45,5% | 34,6% | **45,8%** |
| data_fim_contrato (=Emusys, não nulo) | 2,5% | 9,5% | 10,8% | **8,2%** |

**Leitura:** a base de alunos é confiável (~97%); os campos de contrato (data_fim, renovações, 2º curso) estavam furados — exatamente o que os endpoints novos corrigem.

---

## 3. O que foi EXECUTADO (corrigido)

### 3.1 `data_fim_contrato` + `emusys_matricula_id` (backfill, via psql, transação)
- **1.016 linhas atualizadas** (3 unidades, ativos). Valor copiado direto da API (`contrato_atual.data_original_ultima_aula`).
- Casamento determinístico em 3 camadas: por `matricula_id` (152) → nome 1:1 (685) → **pessoa+curso para desambiguar 2º curso** (179).
- **Resultado:** `data_fim` 8%→**97,6%** (1159/1187); `emusys_matricula_id` 19%→**92%** (1091/1187, entrou de carona).
- 28 ficaram de fora (analisados na seção 4).

### 3.2 Conciliação de experimentais — junho (fila 40→0)
- Os 40 casos da fila de "Conciliação de Experimentais" foram classificados cruzando `/aulas?lead_id` (presença/cancelamento real) + `/matriculas` (`aluno.lead_id` = conversão).
- **39 decididos automaticamente** (`decidido_por='auto:api_emusys'`): 31 realizada-sem-matrícula, 3 com-matrícula, 4 faltou, 2 cancelada. `ON CONFLICT DO NOTHING` preservou as decisões humanas existentes.
- 1 (Ravi Marques) tratado à parte — ver seção 5.
- Efeito: fila junho **40→0**; `realizadas_sem_presenca_confirmada` 38→0.

### 3.3 Curso nulo nas experimentais (168→0)
- **152 preenchidas** com instrumento real: **65 da aula real** (`/aulas` curso_nome) + **87 do lead** (`leads.curso_interesse_id`, fallback). Regra: a aula manda; o lead entra quando a aula vem genérica.
- **16 restantes** (sem instrumento em nenhuma fonte — lead criado sem curso + aula genérica) → atribuídas ao novo curso **"Aula Experimental" (id 45, `is_projeto_banda=false`)**, criado para os colaboradores identificarem e completarem. Esse curso só tem lead, 0 alunos.

### 3.4 Alunos ativos sem professor (3→0)
- Fernando Maciel → Rafael Akeem | Maria Clara → Jonathan (JOHN) | **Alexandre → Jeyson Gaia + curso corrigido de Violão para Cavaquinho** (matrícula API + experimental com o mesmo professor confirmam).
- Casados por `matricula_id` → professor da disciplina na API → nome exato no nosso banco (a tabela `professores` não tem `emusys_id`, casa por nome).

---

## 4. Os 28 ativos ainda sem `data_fim` — diagnóstico (não corrigidos ainda)

Não eram "ambíguos" simples; são 4 problemas distintos:

| Grupo | Qtd | O que é | Como resolver |
|---|---|---|---|
| Status defasado | 19 | Ativo no nosso, **trancado/finalizado na API** | Trancar/evadir conforme Emusys + data real |
| 2× na semana | 2 | Vitória (Canto 2×), Lorenzo (Bateria 2×) — **não é duplicata**, é aluno que faz 2 aulas/semana (2 matrículas legítimas, datas diferentes) | Preencher as 2 datas |
| Curso divergente | 3 | Martina, Miguel Antunes, Laura — curso nosso não bate o da API | Usar o curso da API |
| Nome incompleto | 4 | Lucas Keyne, Maite, Maria Eduarda Pery, Pedro Henrique — **mesmos alunos**, cadastro com nome truncado (gêmeo na API com nome completo) | Casar por nome parcial |

---

## 5. Descobertas e decisões importantes

### Caso Ravi Marques (lead 6721 / matrícula excluída)
Estava na fila como ambíguo. Investigação (API + log `automacao_log` + `alunos_arquivados`) provou: **matriculou de verdade em 05/06** (`matricula_nova`, curso Musicalização, R$467 → aluno 1754) e **saiu** (inativo → arquivado).
**Lição:** a API `/matriculas` (estado atual) **subconta conversões** — quem matriculou e saiu desaparece dela. Para conversão histórica, a fonte confiável é o **log `matricula_nova`**, não `/matriculas`.

### Mapa evento Emusys → nosso `status` (lido da fonte `processar-matricula-emusys`)
| Evento Emusys | Vira no nosso `status` | Outros efeitos |
|---|---|---|
| `matricula_nova` | `ativo` | lead → `convertido`; boas-vindas |
| `matricula_renovada` | `ativo` | `numero_renovacoes`++; cria `renovacoes` pendente |
| `matricula_trancada` | `trancado` | movimentação de trancamento |
| `matricula_finalizacao` | `evadido` | `data_saida`; passagem LTV se saiu de tudo |

- **Decisão:** **não criar status "finalizado"** — finalizada do Emusys = `evadido` no nosso (engloba "saiu no meio" + "completou"). Manter assim.

### Data do webhook é a data de processamento, não a data real
- `data_saida` (evasão) e `data_ultima_renovacao` (renovação) gravam `new Date()` = quando o webhook rodou, não quando o evento aconteceu. Se houver atraso/reenvio, a data fica errada.
- **A data real já vem no webhook** (`finalizacao.data_ultima_aula`) e **bate com a API em 90%** (62/69 finalizações). As 10% que diferem são reativações/re-finalizações — nesses o webhook é a fonte mais fiel ao evento.
- **Decisão:** trocar a fonte da `data_saida` na edge para `finalizacao.data_ultima_aula` — **adiado** (não aplicado nesta sessão). Backfill retroativo das datas erradas é possível via `automacao_log`.

---

## 6. Pendente

- **28 sem data_fim** — corrigir pelos 4 grupos da seção 4 (status defasado, 2×/semana, curso divergente, nome incompleto).
- **`is_segundo_curso`** — simulação pronta (via API, regra: instrumento mais antigo = principal, banda fora, duplicata à parte): **24 marcar + 21 desmarcar** (alta confiança) + 11 revisar. Aguardando OK.
- **Conciliação dos meses anteriores a junho** — mesma rotina, retroativa.
- **Trocar fonte da `data_saida` na edge** + backfill retroativo — adiado.
- **`numero_renovacoes`** — ❌ bloqueado: `qtd_contratos` da API é ambíguo (relação dispersa); fonte confiável seria o log `matricula_renovada`. Precisa esclarecimento do Emusys.

---

*Detalhe técnico operacional em `.claude/memory/pendencias-2026-06-22-divergencias-matriculas-emusys.md`.*
