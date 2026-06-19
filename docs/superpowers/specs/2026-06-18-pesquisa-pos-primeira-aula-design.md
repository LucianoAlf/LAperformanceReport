# Spec — Pesquisa Pós-1ª Aula (Sucesso do Aluno)

**Data:** 2026-06-18  
**Módulo:** Sucesso do Aluno → Aba "Pesquisas"  
**Autor:** Luciano / Fabíola

---

## Contexto

Após a primeira aula de um aluno calouro, a equipe de Sucesso do Aluno quer enviar uma pesquisa de satisfação via WhatsApp. O fluxo é **semi-automático**: o sistema detecta candidatos automaticamente, mas o disparo é manual após revisão humana. O gerente da unidade é notificado quando o aluno responder. As respostas ficam armazenadas como base para P3 (pesquisas de 1 mês e 3 meses).

---

## Escopo

**Inclui:**
- Refatoração de `PesquisaEvasaoTab` → `PesquisasTab` com sub-navegação
- Nova seção "Pós-1ª Aula" dentro de `PesquisasTab`
- Nova tabela `pesquisas_whatsapp` no banco
- Nova RPC `get_candidatos_pesquisa_primeira_aula`
- Nova edge function `enviar-pesquisa-pos-primeira-aula`
- Notificação ao gerente da unidade quando aluno responder (via n8n)

**Não inclui (futuro — P3):**
- Pesquisas de 1 mês e 3 meses
- Histórico de avaliações na ficha do aluno
- Refatoração da aba "Evasão" (mantida intacta)

---

## Definição de Calouro

Calouro válido para receber a pesquisa — todos os critérios devem ser verdadeiros:

1. `alunos.is_segundo_curso = false` — exclui matrículas paralelas (segundo instrumento simultâneo); cada matrícula tem seu próprio `aluno_id`, então a pesquisa vai apenas para a matrícula principal
2. `alunos.status = 'ativo'`
3. Teve registro em `aluno_presenca` com `nr_da_aula = 1` **e** `data_aula >= alunos.data_matricula` (evita aulas de reposição com `nr=1` de turma anterior) dentro da janela configurável na UI (padrão 7 dias)
4. Não possui `pesquisas_whatsapp` com `tipo = 'pos_primeira_aula'` e `enviado_ok = true` **para este `aluno_id`**

**Observação:** o filtro de "calouro" usa apenas a janela de `data_aula` (configurável na UI). Não há um filtro fixo em `data_matricula` — alunos que demoraram mais para ter a primeira aula (ex: matrícula em férias) aparecem normalmente; a revisão manual cobre casos atípicos.

---

## Banco de Dados

### Nova tabela `pesquisas_whatsapp`

```sql
CREATE TABLE pesquisas_whatsapp (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id        uuid NOT NULL REFERENCES alunos(id),   -- verificar tipo: pode ser integer (ver database.types.ts)
  unidade_id      uuid NOT NULL REFERENCES unidades(id), -- necessário para lookup n8n sem cruzar unidades
  tipo            text NOT NULL CHECK (tipo IN ('pos_primeira_aula', 'pos_um_mes', 'pos_tres_meses', 'evasao')),
  data_matricula  date NOT NULL,          -- data de matrícula no momento do envio; permite reenvio em novo contrato
  remote_jid      text,                   -- identificador UAZAPI do contato; chave de lookup na resposta
  enviado_em      timestamptz,
  enviado_ok      boolean NOT NULL DEFAULT false,
  erro_detalhes   text,                   -- preenchido em falha; registro nunca é deletado
  nota            integer CHECK (nota BETWEEN 1 AND 5),
  comentario      text,
  respondido_em   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, tipo, data_matricula)
);
```

### Nova RPC `get_candidatos_pesquisa_primeira_aula`

**Parâmetros:** `p_unidade_id uuid`, `p_janela_dias integer DEFAULT 7`

**Retorna** alunos que satisfazem todos os critérios de calouro acima.

**Colunas retornadas:**

| Coluna | Origem |
|--------|--------|
| `aluno_id` | `alunos.id` |
| `unidade_id` | `alunos.unidade_id` |
| `nome` | `alunos.nome` |
| `unidade_nome` | `unidades.nome` |
| `curso_nome` | `cursos.nome` via `alunos.curso_id` |
| `professor_nome` | `professores.nome` via `alunos.professor_id` |
| `data_primeira_aula` | `aluno_presenca.data_aula` onde `nr_da_aula=1` |
| `data_matricula` | `alunos.data_matricula` |
| `whatsapp_jid` | `admin_conversas.whatsapp_jid` via JOIN em `aluno_id` (fonte do `remote_jid` para envio) |

**Fonte do `remote_jid` (ordem de prioridade):**
1. `admin_conversas.whatsapp_jid` via JOIN em `aluno_id` na caixa `departamento='sucesso_aluno'` — se já houver conversa prévia
2. Construído a partir de `alunos.whatsapp` ou `alunos.telefone`: formato `55{DDD}{NUMERO}@s.whatsapp.net` (11 dígitos sem `+` ou espaços)
3. Se nenhuma fonte disponível: aluno é marcado na UI como "sem contato" e excluído do payload de envio

O campo exato de telefone em `alunos` deve ser confirmado no schema antes da implementação.

---

## Edge Function: `enviar-pesquisa-pos-primeira-aula`

**Trigger:** chamada manual pelo frontend (botão "Enviar pesquisa"). Sem cron — disparo sempre intencional.

**Payload de entrada:**
```json
{
  "alunos": [
    {
      "aluno_id": "uuid-aqui",
      "unidade_id": "uuid-unidade",
      "whatsapp_jid": "5521999999999@s.whatsapp.net",
      "nome": "João",
      "data_matricula": "2026-05-10"
    }
  ]
}
```

**Fluxo por aluno:**
1. Upsert em `pesquisas_whatsapp` com `enviado_ok = false` (cria ou reutiliza linha de tentativa anterior via `ON CONFLICT (aluno_id, tipo, data_matricula) DO UPDATE SET enviado_ok = false`)
2. Busca caixa UAZAPI da unidade (`unidade_id + departamento = 'sucesso_aluno'`) — mesmo padrão de `enviar-boas-vindas-matricula`
3. Envia mensagem via UAZAPI usando `whatsapp_jid` como destino
4. Se sucesso: atualiza `enviado_em`, `enviado_ok = true`, `remote_jid = whatsapp_jid`
5. Se falha: atualiza `erro_detalhes` com mensagem do erro; `enviado_ok` permanece `false`

**Registro na Caixa de Entrada:** cada envio registrado em `admin_conversas` + `admin_mensagens` (departamento `sucesso_aluno`), seguindo padrão de `enviar-boas-vindas-matricula`.

**Formato da mensagem — interactive buttons (UAZAPI):**

Mensagem com 3 botões de resposta rápida:
```
Olá, {nome}! 🎵 Como foi sua primeira aula na LA Music?
```

| Botão | ID (payload) | Nota armazenada |
|-------|-------------|----------------|
| 😞 Ruim | `ruim` | 1 |
| 😐 Regular | `regular` | 3 |
| 😊 Gostei | `gostei` | 5 |

O aluno toca o botão — sem digitar nada. A resposta chega como mensagem estruturada com o `buttonId` no webhook UAZAPI.

---

## Captura de Resposta (edge function — sem n8n)

**Trigger:** webhook UAZAPI de mensagem entrante na caixa "Sol - Sucesso do Aluno" aponta para a edge function `processar-resposta-pesquisa`.

**Parsing da nota:**
- Lê `buttonId` do payload UAZAPI (campo da mensagem interativa)
- Mapeamento: `ruim` → 1, `regular` → 3, `gostei` → 5
- Se a mensagem não tiver `buttonId` (texto livre, áudio, etc.) → ignorada pela edge

**Lookup da pesquisa pendente:**
```sql
SELECT * FROM pesquisas_whatsapp
WHERE remote_jid = :jid_remetente
  AND unidade_id = :unidade_da_caixa
  AND tipo = 'pos_primeira_aula'
  AND enviado_ok = true
  AND nota IS NULL
  AND enviado_em > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 1
```

Se não encontrar → edge encerra sem erro (botão é de outra caixa ou pesquisa já respondida).

**Após parsing:** atualiza `pesquisas_whatsapp` com `nota`, `respondido_em = now()`

**Notificação ao gerente:**
- Lookup do número do gerente: `unidades.telefone_gerente` (confirmar campo durante implementação; criar se não existir)
- Conteúdo: `"Feedback de {nome_aluno} ({curso}): {label_botao}"` (ex: "Feedback de João (Violão): 😊 Gostei")
- Se `telefone_gerente` não cadastrado: log de erro, edge não trava
- Sem captura de comentário por ora

---

## Frontend

### Refatoração: `PesquisaEvasaoTab.tsx` → `PesquisasTab.tsx`

Sub-navegação interna (pills):
- **Pós-1ª Aula** ← nova, padrão ao abrir
- **Evasão** ← existente, sem alterações de lógica

### Seção "Pós-1ª Aula" — `PesquisaPrimeiraAulaTab.tsx`

**Cabeçalho:**
- Seletor de janela: "Últimos 7 dias / 14 dias / 30 dias" (filtra `data_aula` da 1ª aula)
- Contador: "X candidatos encontrados"
- Botão "Enviar pesquisa" (desabilitado se nenhum selecionado; spinner durante envio)

**Tabela de candidatos:**

| Coluna | Fonte |
|--------|-------|
| Nome | `aluno.nome` |
| Unidade | `unidade_nome` |
| Curso | `curso_nome` |
| Professor | `professor_nome` |
| 1ª Aula | `data_primeira_aula` (DD/MM/YYYY) |
| Contato | `whatsapp_jid` formatado como telefone |
| ✓ | checkbox |

**Comportamento:**
- Todos selecionados por padrão ao carregar
- Usuário pode desmarcar falsos positivos individualmente
- Após envio: linhas com sucesso somem; linhas com erro ficam marcadas em vermelho com tooltip do `erro_detalhes`
- Estado vazio: "Nenhum calouro com primeira aula nos últimos X dias pendente de pesquisa"

### Hook `usePesquisaPrimeiraAula.ts`
- Chama RPC `get_candidatos_pesquisa_primeira_aula` com `unidade_id` + `janela_dias`
- Expõe: `candidatos`, `loading`, `enviando`, `enviar(alunosSelecionados)`
- `enviar()` chama edge e atualiza estado local progressivamente

---

## Fluxo Completo

```
sync-presenca-emusys (22h BRT)
    ↓ popula aluno_presenca com nr_da_aula
Fabíola abre "Pesquisas > Pós-1ª Aula"
    ↓ RPC retorna candidatos (calouros com 1ª aula na janela, sem pesquisa enviada)
Fabíola revisa, desmarca falsos positivos
    ↓ clica "Enviar pesquisa"
Edge enviar-pesquisa-pos-primeira-aula
    ↓ upsert pesquisas_whatsapp + UAZAPI por unidade
    ↓ salva remote_jid + enviado_ok=true
Aluno toca botão no WhatsApp (dentro de 7 dias)
    ↓ UAZAPI webhook → edge processar-resposta-pesquisa
    ↓ lê buttonId do payload
    ↓ se sem buttonId: ignora (texto livre, áudio, etc.)
    ↓ lookup por remote_jid + unidade_id + nota IS NULL + janela 7 dias
    ↓ se não encontrar pesquisa: ignora
    ↓ mapeia buttonId → nota (ruim=1, regular=3, gostei=5)
    ↓ atualiza pesquisas_whatsapp
    ↓ notifica gerente da unidade via WhatsApp
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/YYYYMMDD_pesquisas_whatsapp.sql` | Criar tabela + RPC |
| `supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts` | Nova edge function |
| `supabase/functions/processar-resposta-pesquisa/index.ts` | Nova edge function (webhook UAZAPI entrada) |
| `src/components/App/SucessoCliente/PesquisasTab.tsx` | Renomear + sub-nav (wrapper) |
| `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx` | Novo componente |
| `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts` | Novo hook |
| `src/components/App/SucessoCliente/TabSucessoAluno.tsx` | Atualizar referência da aba |
| n8n | ~~Não usado para captura de resposta~~ — substituído por edge function |

---

## Itens a Confirmar na Implementação

1. **Tipo de `aluno_id`:** verificar `database.types.ts` — `uuid` ou `integer`
2. **Campo de telefone em `alunos`:** confirmar nome exato da coluna para construir JID quando não houver conversa prévia
3. **Campo de telefone do gerente em `unidades`:** verificar se existe `telefone_gerente` ou equivalente; criar coluna se não existir

## Limitação Conhecida

**Veterano em unidade diferente:** um aluno que estudou na unidade A, saiu, e se rematricula na unidade B terá `is_segundo_curso=false` e será elegível como calouro. Não há FK entre matrículas de unidades diferentes para cruzar o histórico. A revisão manual da Fabíola é a camada de proteção — ela pode desmarcar esses casos na tela. Corrigir estruturalmente depende da Camada 3 (histórico de contratos), pendência separada.

---

## Decisões de Design

- **Semi-automático intencional:** sem cron de envio — disparo sempre manual após revisão da Fabíola
- **`unidade_id` na tabela e no lookup:** evita que mensagem de aluno de uma unidade acione pesquisa de outra
- **UNIQUE (aluno_id, tipo, data_matricula):** permite reenvio em novo contrato sem duplicar por matrícula ativa
- **Janela de 7 dias no lookup n8n:** mensagens recebidas após 7 dias do envio são ignoradas — evita que conversas futuras do mesmo contato sejam interpretadas como resposta
- **Sem DELETE em falha:** `erro_detalhes` preserva auditoria; guard usa `enviado_ok = true` para decidir se pula
- **Sem backfill:** pesquisas cobrem apenas alunos a partir da data de deploy
