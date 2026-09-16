# Rastreio Google Ads — Fase 0 (medir a sobrevivência do texto)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descobrir, com o tráfego real do Google e sem escrever código, se um identificador de origem colocado no texto pré-preenchido do WhatsApp sobrevive até chegar ao Chatwoot.

**Architecture:** Nenhum código. Prefixar a frase de abertura já existente de cada campanha do Google com um marcador de origem, esperar 7 dias e contar quantas conversas chegaram com ele. A informação fica só na conversa do Chatwoot — não entra no banco nesta fase.

**Tech Stack:** Google Ads (configuração), Supabase LAReport (`leads`), Supabase Sol (`sol_chatwoot_mensagens`, espelho do Chatwoot).

**Spec:** `docs/superpowers/specs/2026-09-15-rastreio-google-ads-design.md`

## Global Constraints

- **Não trocar a frase — prefixar.** A frase nova é `Vim pelo Google. ` + a frase atual, verbatim. Trocar a frase inteira exigiria decidir marca (Kids × School), que não está declarada nas campanhas P.Max e seria chute.
- **Marcador exato:** `Vim pelo Google.` — é por essa string que a medição e, depois, a Fase 1 vão procurar. Não variar capitalização entre campanhas.
- **Inboxes da medição:** `147` (Barra), `148` (CG), `155` (Recreio). São as únicas com texto pré-preenchido; as de secretaria (168, 179, 180) têm zero e não entram.
- **Baseline:** ~6 leads de Google/dia (551 em 90 dias) = **~42 em 7 dias**.
- **Cortes de decisão:** ≥25 conversas com o marcador → seguir para a Fase 1. <13 → abandonar o texto e ir para número dedicado por unidade. Entre 13 e 24 → estender por mais 7 dias.
- **Não mexer em verba, lance, público ou criativo.** Só a URL de destino. Qualquer outra alteração contamina a medição e atrapalha o gestor.

---

### Task 1: Descobrir o destino atual das 3 campanhas

**Files:** nenhum — inspeção na conta do Google Ads.

**Interfaces:**
- Produces: para cada uma das 3 campanhas P.Max, a **URL final atual** literal. As Tasks 2 e 3 dependem dela.

- [ ] **Step 1: Abrir a conta e listar as URLs finais**

Conta `717-909-7170` (⚠️ acessar direto — **nunca** enviar `login-customer-id`; o MCC `164-091-0901` não gerencia essa conta, e enviá-lo dá 403).

Campanhas a inspecionar:
- `[P.MAX] [LEADS] [CPA] [RECREIO] 03.06.2025`
- `[P.MAX] [LEADS] [BARRA] 03.06.2025`
- `[CG] [P.MAX] [LEADS] 18.10.2025`

Para cada uma, anotar a URL final de cada grupo de ativos.

- [ ] **Step 2: Classificar em qual ramo estamos**

| O que a URL é | Ramo | Consequência |
|---|---|---|
| `https://wa.me/55...?text=...` | **A** | Mudança só na conta do Google Ads. Task 3A. |
| Uma página do site | **B** | Mudança no site, e ⚠️ **mais cara** — ver Task 3B |
| Mapa / ligação / sem URL | **C** | Esses cliques nunca serão rastreáveis por texto. Registrar quanto da verba está aqui e seguir só com os outros |

⚠️ **Por que o ramo B é mais caro:** o site já manda `Estava no site da LA Music School e gostaria...` para **todo mundo**. Se o Google cai no site, o tráfego pago fica indistinguível do orgânico. Nesse ramo é preciso passar `?origem=google` na URL do anúncio e o site ler esse parâmetro para trocar a frase — o que é código no site, não configuração.

- [ ] **Step 3: Verificar a marcação automática**

Em `Configurações da conta → Marcação automática`. ⚠️ Se estiver **desligada**, a Fase 0 ainda funciona (ela não usa gclid), mas as Fases 2 e 3 estão mortas até ser ligada. Anotar o estado.

- [ ] **Step 4: Registrar o resultado na task**

```
lume_add_note LAPE-35 — ramo (A/B/C), URLs literais encontradas, estado da marcação automática
```

---

### Task 2: Montar as URLs novas

**Files:** nenhum — preparação, sem aplicar.

**Interfaces:**
- Consumes: as URLs literais da Task 1.
- Produces: as 3 URLs novas, já codificadas, para a Task 3.

- [ ] **Step 1: Aplicar o prefixo a cada frase**

Regra: `Vim pelo Google. ` + frase atual, sem alterar nada do que já existe.

Exemplo, partindo das frases que hoje chegam ao Chatwoot:

| Unidade | Frase atual (medida no espelho) | Frase nova |
|---|---|---|
| Recreio | `Quero informações das aulas de música na LA Music Kids Recreio` | `Vim pelo Google. Quero informações das aulas de música na LA Music Kids Recreio` |
| CG | `Quero informações das aulas de música na LA Music Kids Campo Grande` | `Vim pelo Google. Quero informações das aulas de música na LA Music Kids Campo Grande` |
| Barra | `Quero informações sobre a LA Music Kids unidade Centro Metropolitano Barra` | `Vim pelo Google. Quero informações sobre a LA Music Kids unidade Centro Metropolitano Barra` |

⚠️ **Usar a frase que a Task 1 encontrou na conta, não esta tabela.** Estas são as frases que *chegam*, inferidas do espelho do Chatwoot; a conta pode ter outra redação, e o que vale é o que está lá.

- [ ] **Step 2: Codificar para URL**

O prefixo codificado é `Vim%20pelo%20Google.%20`. Montar cada URL como:

```
https://wa.me/<numero>?text=Vim%20pelo%20Google.%20<resto-ja-codificado-como-esta-hoje>
```

Não recodificar o resto da string — copiar exatamente como está na conta e só inserir o prefixo depois de `text=`.

- [ ] **Step 3: Testar as 3 URLs no navegador, antes de aplicar**

Colar cada URL no navegador. Verificar:
- abre o WhatsApp no número **daquela unidade**;
- a mensagem aparece começando com `Vim pelo Google.`;
- os acentos aparecem corretos (`informações`, não `informa%C3%A7%C3%B5es` nem `informaÃ§Ãµes`).

⚠️ **Não enviar a mensagem.** Enviar criaria um lead falso na inbox de produção e sujaria a própria medição.

---

### Task 3A: Aplicar — ramo WhatsApp direto

**Executar apenas se a Task 1 classificou como ramo A.**

**Files:** nenhum — configuração na conta do Google Ads.

- [ ] **Step 1: Trocar a URL final de cada campanha**

Substituir a URL final pelos valores da Task 2, uma campanha por vez. ⚠️ Não alterar mais nada — verba, lance, público e ativos ficam intocados.

- [ ] **Step 2: Anotar a data e a hora exatas da troca**

É o marco zero da medição. Sem ela, a janela de 7 dias fica ambígua e a comparação com o baseline não fecha.

- [ ] **Step 3: Confirmar que a campanha continua veiculando**

No dia seguinte, conferir que houve impressões e cliques nas 3 campanhas. ⚠️ URL final inválida **derruba o anúncio** — e um anúncio parado daria "zero conversas com o marcador" por um motivo que não tem nada a ver com o texto sobreviver.

Query de confirmação (Supabase LAReport):

```sql
select dia, campanha_nome, gasto, cliques
from google_ads_metricas_diarias
where dia >= current_date - 2
order by dia desc, gasto desc;
```

Esperado: as 3 campanhas com gasto e cliques no dia seguinte à troca, na mesma ordem de grandeza dos dias anteriores.

- [ ] **Step 4: Mover a task**

```
lume_move_task LAPE-35 → doing, com nota da data/hora do marco zero
```

---

### Task 3B: Aplicar — ramo site

**Executar apenas se a Task 1 classificou como ramo B.**

**Files:**
- Modify: o código do site que monta o link do botão de WhatsApp (localizar na Task 1 — não está neste repositório).

- [ ] **Step 1: Acrescentar o parâmetro na URL do anúncio**

Na conta do Google Ads, trocar a URL final para incluir `?origem=google` (ou acrescentar à query string existente).

- [ ] **Step 2: Fazer o site ler o parâmetro e trocar a frase**

O botão de WhatsApp passa a montar o texto assim:

```
origem = new URLSearchParams(location.search).get('origem')
prefixo = origem === 'google' ? 'Vim pelo Google. ' : ''
texto = prefixo + fraseAtualDaUnidade
```

⚠️ Guardar em `sessionStorage` no carregamento da página: o visitante pode navegar para outra página antes de clicar, e aí o parâmetro já saiu da URL.

- [ ] **Step 3: Testar as duas entradas**

- Abrir a página **com** `?origem=google` → o botão tem que gerar a mensagem com o prefixo.
- Abrir a página **sem** o parâmetro → a mensagem tem que sair exatamente como hoje, sem prefixo.

⚠️ O segundo teste é o que protege o tráfego orgânico: se o prefixo vazar para quem não veio do Google, a medição inteira mente para cima.

- [ ] **Step 4: Publicar e anotar data/hora exatas**

- [ ] **Step 5: Confirmar veiculação** — mesma query e mesmo critério do Step 3 da Task 3A.

---

### Task 4: Medir no dia 7

**Files:** nenhum — duas consultas, em dois bancos diferentes.

⚠️ São bancos separados: as mensagens vivem no Supabase **da Sol** e os leads no **LAReport**. Não há join possível; são duas contagens comparadas à mão.

- [ ] **Step 1: Contar as conversas que chegaram com o marcador**

Supabase Sol. Trocar `DATA_HORA_DA_TROCA` pelo marco zero anotado na Task 3.

```sql
with primeiras as (
  select distinct on (conversa_id) conversa_id, inbox_id, texto, data_hora
  from sol_chatwoot_mensagens
  where autor_tipo = 'contact'
    and texto is not null
    and data_hora >= 'DATA_HORA_DA_TROCA'
  order by conversa_id, data_hora asc
)
select
  inbox_id,
  count(*) as conversas_novas,
  count(*) filter (where texto ilike '%vim pelo google%') as com_marcador,
  count(*) filter (where texto ~* '(quero informa|estava no site).*(la music|unidade)') as com_prefill_qualquer
from primeiras
where inbox_id in (147, 148, 155)
group by rollup (inbox_id)
order by inbox_id nulls last;
```

A linha com `inbox_id` nulo é o total.

- [ ] **Step 2: Contar os leads declarados como Google no mesmo período**

Supabase LAReport, mesma data de corte:

```sql
select count(*) as leads_google_declarados
from leads
where canal_origem_id = 3
  and origem_registro = 'funil'
  and created_at >= 'DATA_HORA_DA_TROCA';
```

- [ ] **Step 3: Ler o resultado pela tabela de desfechos**

| Resultado | Leitura |
|---|---|
| `com_marcador` ≈ `leads_google_declarados` | o texto sobrevive **e** a declaração manual é razoável |
| `com_marcador` muito abaixo | ou o texto morre, ou os declarados não eram Google — indistinguível sem a Fase 1 |
| `com_marcador` **acima** dos declarados | o texto sobrevive e a declaração manual **subconta** o Google |

⚠️ **Antes de concluir qualquer coisa, conferir o denominador da veiculação:** se as campanhas gastaram muito menos que o normal na semana, o número baixo é de tráfego, não de sobrevivência do texto.

```sql
select sum(gasto) gasto_janela, sum(cliques) cliques_janela
from google_ads_metricas_diarias
where dia >= 'DATA_DA_TROCA'::date;
```

- [ ] **Step 4: Inspecionar as edições, não só a contagem**

```sql
with primeiras as (
  select distinct on (conversa_id) conversa_id, texto
  from sol_chatwoot_mensagens
  where autor_tipo='contact' and texto is not null
    and data_hora >= 'DATA_HORA_DA_TROCA'
  order by conversa_id, data_hora asc
)
select texto, count(*) n
from primeiras
where texto ~* '(vim pelo|quero informa|estava no site)'
group by 1 order by n desc;
```

O que procurar: gente que apagou **só o prefixo** e manteve o resto. Se isso aparecer, o problema não é o texto pré-preenchido em geral — é o prefixo parecer estranho, e a Fase 2 precisa de outra redação para o código.

---

### Task 5: Decidir e registrar

**Files:**
- Modify: `daily-notes/AAAA-MM-DD.md` (append, nunca sobrescrever)

- [ ] **Step 1: Aplicar o corte**

| `com_marcador` em 7 dias | Decisão |
|---|---|
| ≥ 25 | Seguir para a Fase 1 (LAPE-36). Escrever o plano da Fase 1 |
| 13 a 24 | Estender a medição por mais 7 dias e reavaliar |
| < 13 | Abandonar o texto. Reabrir a decisão de número de WhatsApp dedicado por unidade |

- [ ] **Step 2: Registrar no daily-note**

Números medidos, decisão tomada e o motivo. ⚠️ Reler o arquivo do dia **imediatamente antes** de escrever e anexar com `cat >>` — outras sessões escrevem no mesmo arquivo.

- [ ] **Step 3: Fechar a task**

```
lume_move_task LAPE-35 → review, com os números na nota
```

- [ ] **Step 4: Atualizar a spec com o resultado medido**

Acrescentar o número real à seção 4 (Fase 0) da spec. O "~99%" de hoje é histórico de outra origem; depois desta fase existe o número do tráfego do Google, e é ele que deve ser citado daqui em diante.

---

## Por que este plano para aqui

As Fases 1–3 **não** estão planejadas de propósito:

- A Fase 1 depende do **resultado** desta, que leva 7 dias. Planejá-la agora seria detalhar código sobre uma premissa não confirmada — e se o texto não sobreviver, o plano inteiro vira lixo.
- A Fase 1 também depende de **qual ramo** a Task 1 revelar: no ramo B, a detecção precisa distinguir tráfego pago de orgânico dentro do mesmo site, o que muda a regra de reconhecimento.
- As Fases 2 e 3 dependem da marcação automática (Task 1, Step 3) e de um domínio para a página-pedágio, que ainda não existe.

O plano da Fase 1 deve ser escrito **depois** da Task 5, com os números na mão.
