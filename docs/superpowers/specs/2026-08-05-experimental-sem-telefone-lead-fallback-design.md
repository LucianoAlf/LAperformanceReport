# Experimental sem telefone — fallback de criação de lead + correção de sobrescrita em `leads.aluno_id`

## Contexto

O observador (`debug-webhook-emusys-observador`) assumiu a persistência das 3 experimentais
(`aula_experimental_criada/reagendada/cancelada`) em 04/08/2026, reimplementando as mesmas RPCs
que o n8n já chamava (`registrar_experimental`). Em 05/08/2026, uma experimental real (Juan
Vinicius Ribeiro de Almeida, Campo Grande) chegou com `aula.telefone = null` — e também
`lead_criado`/`lead_editado` do mesmo `emusys_lead_id` (14656) vieram sem telefone. A regra
atual (espelhada do n8n) descarta qualquer lead sem telefone antes de tentar a RPC
(`"sem telefone (mesma regra do n8n)"`), então a experimental nunca foi registrada em
`lead_experimentais` — nem lead, nem agendamento existem hoje pra esse aluno.

Investigação confirmou que **não é um caso isolado**: em 14 dias, 6 experimentais de crianças
chegaram sem telefone no payload (`aula.telefone` nulo/vazio), porque o telefone que aparece
nesse campo é o do responsável, e o Emusys às vezes não o preenche no cadastro da experimental.
Duas dessas (Arthur Abílio Greco, Eloá Azevedo de Oliveira) já tinham se perdido silenciosamente
antes mesmo do observador existir — o n8n tem a mesma regra e o mesmo buraco.

Também durante a investigação, apareceu um segundo problema, relacionado mas distinto: quando
dois irmãos (mesmo telefone do responsável, `emusys_lead_id` diferentes) matriculam em
sequência, `processar-matricula-emusys` (`converterLead`) encontra o **mesmo lead** pelo
telefone (fallback já existente: `emusys_lead_id → telefone → nome`) e sobrescreve
`leads.aluno_id`/`leads.emusys_lead_id` sem checar se já havia um valor. Caso real confirmado
no banco: lead `#8025` tem hoje `nome`/`emusys_lead_id` da Sophia (a irmã que converteu por
último), mas `aluno_id` ainda aponta para o Luiz Felipe (que converteu primeiro) — os dois
campos de referência ficaram apontando para pessoas diferentes dentro da mesma linha.

Auditoria dos dois lugares que leem `leads.aluno_id` para exibição (`ComercialPage.tsx`,
`relatorio-admin-whatsapp`) mostrou que ambos já têm um resolvedor `selecionarLeadParaAluno`
com fallback em cascata (`aluno_id → emusys_lead_id → telefone/responsavel_telefone`) e
pontuação de desempate — então a inconsistência em `leads.aluno_id` **não afeta hoje** a
contagem nem a exibição desses dois relatórios. A contagem de matrículas do funil vem de
`alunos` (por `data_matricula`), independente de `leads`. Por isso este design não inclui
mudança nesses consumidores.

## Objetivo

1. Garantir que uma aula experimental **sempre seja registrada** em `lead_experimentais`,
   mesmo quando `aula.telefone` vem vazio e não existe lead correspondente.
2. Parar a sobrescrita de `leads.aluno_id`/`leads.emusys_lead_id` quando um segundo irmão
   converte e casa com um lead que já pertencia a outra pessoa, evitando que a tabela `leads`
   acumule inconsistência entre esses dois campos.

## Fora de escopo (decidido explicitamente)

- **Resolver o gap Famílias/Irmãos por completo** (múltiplos leads por telefone, ou
  lead-família com N alunos) — fica como projeto futuro à parte.
- **Merge automático** quando o telefone do responsável aparecer depois e colidir com um
  lead-irmão já existente — não implementado agora (ver "Colisão de telefone" abaixo).
- **Mudar os consumidores de `leads.aluno_id`** (`ComercialPage.tsx`,
  `relatorio-admin-whatsapp`) — não é necessário, já se defendem via fallback próprio.
- **Mudar a regra geral de `lead_criado`/`lead_editado`** (que continuam ignorando lead sem
  telefone) — só o caminho da experimental ganha o fallback.

## Parte A — Fallback de lead sem telefone na experimental

**Onde:** `supabase/functions/debug-webhook-emusys-observador/index.ts`, função
`processarExperimental`, só para o evento `aula_experimental_criada`.

**Gatilho:** a chamada a `registrar_experimental` retorna
`{ success: false, reason: 'lead_not_found' }` **e** `aula.telefone` é nulo/vazio no payload
recebido.

**Comportamento:**

1. Cria um lead mínimo em `leads`:
   - `emusys_lead_id = aula.lead_id`
   - `nome = aula.nome_aluno`
   - `unidade_id` já resolvida pelo fluxo existente
   - `telefone = null`
   - `source_type = 'emusys'`
   - `status = 'novo'` (default da tabela; não é uma stub diferenciada — segue como qualquer
     lead novo, só sem telefone)
   - `etapa_pipeline_id = 5` (Experimental Agendada), mesmo valor que a RPC aplicaria
2. Chama `registrar_experimental` novamente com os mesmos argumentos — agora a RPC encontra o
   lead pela camada 1 (`emusys_lead_id`) e grava a linha em `lead_experimentais` normalmente.
3. Se a criação do lead falhar, loga `status='erro'` em `automacao_log` e não tenta de novo
   nesta mesma execução (o webhook responde 200 como hoje; falha vira aviso, não retry).

**Reagendamento e cancelamento não ganham esse fallback.** Só faz sentido criar lead a partir
de uma experimental nova (`criada`); reagendar ou cancelar algo que nunca existiu não deveria
criar um registro do zero.

**Colisão de telefone (decisão registrada, corrigida após ler o corpo real da RPC):** a
princípio a expectativa era que a colisão estourasse `idx_leads_telefone_unidade_unique` como
exceção. Não é o caso — `upsert_lead` (branch UPDATE, `p_source_type='emusys'`) já se protege
sozinha: só aceita o `p_telefone` recebido (`v_telefone_safe`) se **não existir outro lead ativo
na mesma unidade com esse telefone**; caso contrário, mantém o telefone atual do lead
(`COALESCE(v_telefone_safe, telefone)`) — silenciosamente, sem erro, `action:'updated'` como
se nada tivesse acontecido.

Por isso não há exceção para capturar. `processarLead` (mesmo arquivo,
`debug-webhook-emusys-observador/index.ts`) passa a fazer uma **checagem pós-RPC**: quando
`telefone` foi enviado (não nulo) e a chamada retorna sem erro, relê `leads.telefone` do
`lead_id` devolvido; se o valor no banco **não bate** com o `telefone` que foi enviado, é sinal
de que a RPC recusou a gravação por colisão. Nesse caso, o acao vira
`'colisao_telefone_familia'` (o handler principal do `serve()` passa a tratar isso como
`status='warn'`, junto às outras causas de warn já existentes) — registrado em `automacao_log`
para revisão manual futura, quando o projeto de família completo existir. Não há merge nem
duplicata forçada nesta fase — o lead-criança simplesmente continua sem telefone.

## Parte B — Parar de sobrescrever `leads.aluno_id`/`leads.emusys_lead_id`

**Onde:** `supabase/functions/processar-matricula-emusys/index.ts`, função `converterLead`.

**Mudança:** antes do `UPDATE` em `leads`, buscar o `aluno_id`/`emusys_lead_id` atuais da linha
encontrada (já temos `leadId` neste ponto). Só incluir cada um desses dois campos no objeto de
update se o valor atual for `NULL` — mesma guarda condicional que o próprio arquivo já usa para
`alunos.lead_origem_id` (`.is('lead_origem_id', null)`), agora espelhada para o lado do lead.

Os demais campos do update (`status`, `etapa_pipeline_id`, `converteu`, `data_conversao`,
`updated_at`) continuam sendo sempre atualizados — não fazem parte do problema.

`alunos.lead_origem_id` não muda: já funciona corretamente hoje (confirmado com matrículas de
julho/2026 — irmãos Alice/Felipe de Oliveira Mansur compartilham `lead_origem_id` idêntico).

## Testes

1. **Reprocessamento do caso real:** reenviar o payload salvo do Juan Vinicius (em
   `automacao_log`, evento `aula_experimental_criada`, 05/08) contra o observador em ambiente
   de teste e confirmar: lead criado com `telefone=null`, `emusys_lead_id=14656`; linha nova em
   `lead_experimentais` vinculada a esse lead.
2. **Duplicidade:** reenviar o mesmo payload duas vezes e confirmar que não cria um segundo
   lead nem uma segunda linha de experimental (a RPC já dedupa; o teste é sobre o fallback não
   quebrar essa garantia).
3. **Sobrescrita:** simular dois `matricula_nova` para o mesmo telefone (dois `emusys_lead_id`
   diferentes) e confirmar que, depois do segundo, `leads.aluno_id` e `leads.emusys_lead_id`
   continuam com o valor do primeiro — não trocam.
4. **Regressão dos consumidores:** conferir que `ComercialPage.tsx` e `relatorio-admin-whatsapp`
   continuam resolvendo corretamente os dois alunos do teste 3 (via `selecionarLeadParaAluno`),
   sem mudança de comportamento.
