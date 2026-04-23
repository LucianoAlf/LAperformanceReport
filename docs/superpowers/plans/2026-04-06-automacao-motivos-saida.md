# Automacao Motivos de Saida via Webhook Emusys

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o Emusys envia um webhook de finalizacao ou trancamento de matricula, o sistema deve automaticamente inserir um registro em `movimentacoes_admin` com o motivo de saida mapeado, para que apareca nos graficos de Analytics. Alem disso, armazenar o `matricula_id` do Emusys para cruzamento confiavel por ID.

**Architecture:** (1) Nova coluna `emusys_matricula_id` na tabela `alunos` para vincular aluno ao ID de matricula do Emusys. (2) Workflow n8n `matricula_nova` passa a salvar o `matricula_id`. (3) Edge function Supabase recebe o payload do n8n, faz match do aluno priorizando `emusys_matricula_id` (fallback por nome), mapeia o motivo texto livre para `motivo_saida_id`/`motivo_trancamento_id` via fuzzy match, e insere em `movimentacoes_admin`.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), n8n (HTTP Request node), PostgreSQL

---

## Dados de Referencia

### motivos_saida (para finalizacao/evasao)
| id | nome |
|----|------|
| 1 | Dificuldade financeira |
| 2 | Falta de tempo |
| 3 | Mudanca de endereco |
| 5 | Desistencia |
| 6 | Priorizar estudos regulares |
| 7 | Inadimplencia |
| 8 | Incompatibilidade de horario |
| 9 | Problemas familiares |
| 10 | Encontrou escola mais acessivel |
| 11 | Sem retorno apos contato |
| 12 | Outro |
| 13 | Insatisfacao |
| 14 | Desanimo |
| 15 | Problema de Saude |

### motivos_trancamento (para trancamento)
| id | nome |
|----|------|
| 1 | Viagem |
| 2 | Problemas de saude |
| 3 | Cirurgia |
| 4 | Falta de tempo temporaria |
| 5 | Problemas financeiros temporarios |
| 6 | Ferias escolares |
| 7 | Vestibular/ENEM |
| 8 | Mudanca temporaria |
| 9 | Questoes familiares |
| 10 | Outro |

### movimentacoes_admin (colunas relevantes)
- `unidade_id` (uuid, NOT NULL)
- `data` (date, NOT NULL)
- `tipo` (varchar, NOT NULL) - valores: 'evasao', 'nao_renovacao', 'aviso_previo', 'trancamento'
- `aluno_nome` (varchar, NOT NULL)
- `aluno_id` (integer, nullable)
- `professor_id` (integer, nullable)
- `curso_id` (integer, nullable)
- `motivo` (text, nullable) - texto livre original
- `motivo_saida_id` (integer, FK motivos_saida, nullable)
- `motivo_trancamento_id` (integer, FK motivos_trancamento, nullable)
- `tempo_permanencia_meses` (integer, nullable)
- `valor_parcela_evasao` (numeric, nullable)
- `previsao_retorno` (date, nullable) - util para trancamento

### Unidades (mapeamento escola_id Emusys -> unidade_id Supabase)
- escola_id 39 = "LA Music School Campo Grande" -> `2ec861f6-023f-4d7b-9927-3960ad8c2a92`
- escola_id 40 = "LA Music School Recreio" -> `95553e96-971b-4590-a6eb-0201d013c14d`
- escola_id 316 = "LA Music School Barra" -> `368d47f5-2d88-4475-bc14-ba084a9a348e`

### Payload do Emusys (exemplos reais)

**matricula_trancamento:**
```json
{
  "evento": "matricula_trancamento",
  "escola_id": 316,
  "escola_nome": "LA Music School Barra",
  "trancamento": {
    "id": 0,
    "motivo": "Viagem para visitar o filho",
    "data_inicial": "2026-04-08",
    "data_final": "2026-05-05"
  },
  "matricula": {
    "matricula_id": 680,
    "nome_aluno": "Sandra Maria Gomes Carvalho",
    "nome_curso": "Piano",
    "lead_id": 4567,
    "disciplinas": [{
      "id_professor": 881,
      "nome_professor": "Leonardo Castro"
    }]
  }
}
```

**matricula_finalizacao (provavel - baseado no padrao):**
```json
{
  "evento": "matricula_finalizacao",
  "escola_id": 39,
  "finalizacao": {
    "motivo": "...",
    "observacoes": "..."
  },
  "matricula": { ... }
}
```

---

## File Structure

| Arquivo | Responsabilidade |
|---------|-----------------|
| Migration SQL | Adicionar coluna `emusys_matricula_id` na tabela `alunos` |
| (n8n) No `Inserir Aluno no Supabase3` e `Atualizar Aluno Existente3` | Salvar `matricula_id` do Emusys na nova coluna |
| `supabase/functions/registrar-movimentacao-webhook/index.ts` | Edge function que recebe payload do n8n, match por ID (fallback nome), insere em movimentacoes_admin |
| (n8n) Nos novos no workflow `ZzuR9slRx8UqXg9N` | HTTP Request apos update de status para chamar a edge function |

---

### Task 0: Coluna emusys_matricula_id + Workflow salvar matricula_id

**Objetivo:** Criar infraestrutura para cruzamento por ID de matricula do Emusys.

- [ ] **Step 1: Migration - adicionar coluna**

```sql
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS emusys_matricula_id integer;
CREATE INDEX IF NOT EXISTS idx_alunos_emusys_matricula_id ON alunos(emusys_matricula_id) WHERE emusys_matricula_id IS NOT NULL;
COMMENT ON COLUMN alunos.emusys_matricula_id IS 'ID da matricula no Emusys (matricula.matricula_id do webhook)';
```

Executar via MCP Supabase `apply_migration` ou `execute_sql`.

- [ ] **Step 2: Backfill - popular matriculas existentes via automacao_log**

Nao temos historico do matricula_id no banco. Os novos webhooks vao preencher automaticamente. Para os alunos existentes, o campo ficara NULL ate serem atualizados por um novo evento (renovacao, trancamento, finalizacao).

- [ ] **Step 3: n8n - Atualizar no `Inserir Aluno no Supabase3`**

No workflow `WF_Matricula_Funcional`, o no Postgres `Inserir Aluno no Supabase3` deve incluir o campo `emusys_matricula_id` no INSERT:

- Adicionar coluna `emusys_matricula_id` ao INSERT
- Valor: `{{ $('info base3').item.json.aluno.id_matricula }}`

Isso garante que novos alunos ja tenham o ID salvo.

- [ ] **Step 4: n8n - Atualizar no `Atualizar Aluno Existente3`**

O no `Atualizar Aluno Existente3` deve tambem setar `emusys_matricula_id` no UPDATE, caso o aluno ja exista mas nao tenha o campo preenchido:

- Adicionar `emusys_matricula_id = {{ $('info base3').item.json.aluno.id_matricula }}` ao UPDATE

- [ ] **Step 5: n8n - Atualizar nos de trancamento e finalizacao**

Os nos `Atualizar Status: Trancado3` e `Atualizar Status: Evadido3` tambem devem setar `emusys_matricula_id` caso esteja NULL:

```sql
UPDATE alunos
SET status = 'trancado', emusys_matricula_id = COALESCE(emusys_matricula_id, :matricula_id)
WHERE nome ILIKE :nome_aluno AND unidade_id = :unidade_id
```

- [ ] **Step 6: Testar com proxima execucao**

Aguardar proximo webhook de `matricula_nova` e verificar:

```sql
SELECT id, nome, emusys_matricula_id FROM alunos ORDER BY created_at DESC LIMIT 5;
```

---

### Task 1: Edge Function - registrar-movimentacao-webhook

**Files:**
- Create: `supabase/functions/registrar-movimentacao-webhook/index.ts`

- [ ] **Step 1: Criar a edge function com mapeamento de motivos**

```typescript
// supabase/functions/registrar-movimentacao-webhook/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Mapeamento fuzzy: palavras-chave -> motivo_saida_id
const MOTIVOS_SAIDA_MAP: Record<string, number[]> = {
  // id 1 - Dificuldade financeira
  'financ': [1],
  'dinheiro': [1],
  'pagar': [1],
  'caro': [1],
  'custo': [1],
  // id 2 - Falta de tempo
  'tempo': [2],
  'horario': [2, 8],
  'agenda': [2],
  // id 3 - Mudanca de endereco
  'mudanc': [3],
  'mudar': [3],
  'enderec': [3],
  'cidade': [3],
  'bairro': [3],
  // id 5 - Desistencia
  'desist': [5],
  'desanimo': [14],
  'motivac': [14],
  // id 6 - Priorizar estudos
  'estudo': [6],
  'escola': [6],
  'faculdade': [6],
  'vestibular': [6],
  'enem': [6],
  // id 7 - Inadimplencia
  'inadimpl': [7],
  'devendo': [7],
  'atraso': [7],
  // id 8 - Incompatibilidade de horario
  'incompatib': [8],
  // id 9 - Problemas familiares
  'familia': [9],
  'familiar': [9],
  // id 10 - Encontrou escola mais acessivel
  'outra escola': [10],
  'mais barato': [10],
  'acessivel': [10],
  // id 13 - Insatisfacao
  'insatisf': [13],
  'insatisfeit': [13],
  'reclama': [13],
  // id 15 - Problema de Saude
  'saude': [15],
  'saúde': [15],
  'doenc': [15],
  'doente': [15],
  'cirurgia': [15],
  'hospital': [15],
  'medic': [15],
}

// Mapeamento fuzzy: palavras-chave -> motivo_trancamento_id
const MOTIVOS_TRANCAMENTO_MAP: Record<string, number[]> = {
  'viag': [1],
  'viagem': [1],
  'viajar': [1],
  'saude': [2],
  'saúde': [2],
  'doenc': [2],
  'doente': [2],
  'cirurgia': [3],
  'operac': [3],
  'tempo': [4],
  'agenda': [4],
  'financ': [5],
  'dinheiro': [5],
  'pagar': [5],
  'feria': [6],
  'ferias': [6],
  'vestibular': [7],
  'enem': [7],
  'prova': [7],
  'mudanc': [8],
  'mudar': [8],
  'familia': [9],
  'familiar': [9],
  'obra': [10],
  'reform': [10],
}

function mapMotivo(texto: string, mapa: Record<string, number[]>): number {
  if (!texto) return getDefaultId(mapa)
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let bestMatch: number | null = null
  let bestLength = 0

  for (const [keyword, ids] of Object.entries(mapa)) {
    const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(normalizedKeyword) && normalizedKeyword.length > bestLength) {
      bestMatch = ids[0]
      bestLength = normalizedKeyword.length
    }
  }

  return bestMatch ?? getDefaultId(mapa)
}

function getDefaultId(mapa: Record<string, number[]>): number {
  // "Outro" = 12 para saida, 10 para trancamento
  return mapa === MOTIVOS_SAIDA_MAP ? 12 : 10
}

const UNIDADE_MAP: Record<number, string> = {
  39: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',   // CG
  40: '95553e96-971b-4590-a6eb-0201d013c14d',   // Recreio
  316: '368d47f5-2d88-4475-bc14-ba084a9a348e',  // Barra
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const {
      evento,
      escola_id,
      matricula,
      trancamento,
      finalizacao,
    } = payload

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const unidade_id = UNIDADE_MAP[escola_id]
    if (!unidade_id) {
      return new Response(
        JSON.stringify({ error: `escola_id ${escola_id} nao mapeada` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aluno_nome = matricula?.nome_aluno || 'Desconhecido'
    const matricula_id = matricula?.matricula_id || null
    const professor_id_emusys = matricula?.disciplinas?.[0]?.id_professor || null
    const curso_nome = matricula?.nome_curso?.trim() || null

    // Match do aluno: priorizar emusys_matricula_id, fallback por nome + unidade
    let aluno_id: number | null = null
    let match_method = 'none'

    // 1. Tentar por emusys_matricula_id (mais confiavel)
    if (matricula_id) {
      const { data: alunoById } = await supabase
        .from('alunos')
        .select('id')
        .eq('emusys_matricula_id', matricula_id)
        .limit(1)
        .single()
      if (alunoById) {
        aluno_id = alunoById.id
        match_method = 'emusys_matricula_id'
      }
    }

    // 2. Fallback: match por nome + unidade (comportamento atual)
    if (!aluno_id) {
      const { data: alunoByName } = await supabase
        .from('alunos')
        .select('id')
        .eq('unidade_id', unidade_id)
        .ilike('nome', aluno_nome)
        .limit(1)
        .single()
      if (alunoByName) {
        aluno_id = alunoByName.id
        match_method = 'nome'
      }
    }

    // Buscar professor_id no nosso banco pelo id do emusys ou nome
    let professor_id: number | null = null
    if (professor_id_emusys) {
      const profNome = matricula?.disciplinas?.[0]?.nome_professor
      if (profNome) {
        const { data: profData } = await supabase
          .from('professores')
          .select('id')
          .ilike('nome', profNome)
          .limit(1)
          .single()
        if (profData) professor_id = profData.id
      }
    }

    // Buscar curso_id
    let curso_id: number | null = null
    if (curso_nome) {
      const { data: cursoData } = await supabase
        .from('cursos')
        .select('id')
        .ilike('nome', `%${curso_nome}%`)
        .limit(1)
        .single()
      if (cursoData) curso_id = cursoData.id
    }

    // Calcular tempo de permanencia
    let tempo_permanencia_meses: number | null = null
    if (matricula?.data_matricula) {
      const dataMatricula = new Date(matricula.data_matricula)
      const agora = new Date()
      tempo_permanencia_meses = Math.round(
        (agora.getTime() - dataMatricula.getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
    }

    let registro: Record<string, any> = {
      unidade_id,
      data: new Date().toISOString().split('T')[0],
      aluno_nome,
      aluno_id,
      professor_id,
      curso_id,
      tempo_permanencia_meses,
      created_at: new Date().toISOString(),
    }

    if (evento === 'matricula_finalizacao') {
      const motivoTexto = finalizacao?.motivo || finalizacao?.observacoes || ''
      const motivo_saida_id = mapMotivo(motivoTexto, MOTIVOS_SAIDA_MAP)

      registro = {
        ...registro,
        tipo: 'evasao',
        motivo: motivoTexto || null,
        motivo_saida_id,
        valor_parcela_evasao: matricula?.valor || null,
      }
    } else if (evento === 'matricula_trancamento') {
      const motivoTexto = trancamento?.motivo || ''
      const motivo_trancamento_id = mapMotivo(motivoTexto, MOTIVOS_TRANCAMENTO_MAP)

      registro = {
        ...registro,
        tipo: 'trancamento',
        motivo: motivoTexto || null,
        motivo_trancamento_id,
        previsao_retorno: trancamento?.data_final || null,
      }
    } else {
      return new Response(
        JSON.stringify({ error: `evento ${evento} nao suportado` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar duplicata (mesmo aluno + tipo + data)
    const { data: existente } = await supabase
      .from('movimentacoes_admin')
      .select('id')
      .eq('aluno_nome', aluno_nome)
      .eq('tipo', registro.tipo)
      .eq('data', registro.data)
      .eq('unidade_id', unidade_id)
      .limit(1)
      .single()

    if (existente) {
      return new Response(
        JSON.stringify({ status: 'duplicado', id: existente.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: inserted, error } = await supabase
      .from('movimentacoes_admin')
      .insert(registro)
      .select('id')
      .single()

    if (error) {
      console.error('Erro ao inserir movimentacao:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ status: 'ok', id: inserted.id, motivo_mapeado: registro.motivo_saida_id || registro.motivo_trancamento_id, match_method }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Erro geral:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

- [ ] **Step 2: Deploy da edge function**

```bash
supabase functions deploy registrar-movimentacao-webhook --project-ref ouqwbbermlzqqvtqwlul
```

Ou via MCP Supabase `deploy_edge_function`.

- [ ] **Step 3: Testar com curl (trancamento)**

```bash
curl -X POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/registrar-movimentacao-webhook \
  -H "Authorization: Bearer SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "evento": "matricula_trancamento",
    "escola_id": 316,
    "trancamento": { "motivo": "Viagem para visitar o filho", "data_inicial": "2026-04-08", "data_final": "2026-05-05" },
    "matricula": { "nome_aluno": "Teste Automacao", "nome_curso": "Piano", "data_matricula": "2025-01-01", "disciplinas": [{ "id_professor": 881, "nome_professor": "Leonardo Castro" }] }
  }'
```

Esperado: `{ "status": "ok", "id": ..., "motivo_mapeado": 1 }` (Viagem = motivo_trancamento_id 1)

- [ ] **Step 4: Testar com curl (finalizacao)**

```bash
curl -X POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/registrar-movimentacao-webhook \
  -H "Authorization: Bearer SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "evento": "matricula_finalizacao",
    "escola_id": 39,
    "finalizacao": { "motivo": "Problemas financeiros" },
    "matricula": { "nome_aluno": "Teste Finalizacao", "nome_curso": "Bateria", "data_matricula": "2024-06-01", "disciplinas": [{ "id_professor": 240, "nome_professor": "Willian De Andrade Da Silva" }] }
  }'
```

Esperado: `{ "status": "ok", "id": ..., "motivo_mapeado": 1 }` (financ -> Dificuldade financeira = 1)

- [ ] **Step 5: Limpar registros de teste**

```sql
DELETE FROM movimentacoes_admin WHERE aluno_nome IN ('Teste Automacao', 'Teste Finalizacao');
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/registrar-movimentacao-webhook/
git commit -m "feat: edge function para registrar movimentacao via webhook Emusys"
```

---

### Task 2: Adicionar nos de HTTP Request no workflow n8n

**Alteracoes no workflow:** `WF_Matricula_Funcional` (ID: `ZzuR9slRx8UqXg9N`)

- [ ] **Step 1: Adicionar HTTP Request apos `Atualizar Status: Evadido3`**

No n8n, abrir o workflow `WF_Matricula_Funcional`:

1. Adicionar um no **HTTP Request** apos `Atualizar Status: Evadido3` (antes de `Log: Evadido`)
2. Configurar:
   - **Method:** POST
   - **URL:** `https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/registrar-movimentacao-webhook`
   - **Authentication:** Header Auth
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer {{ $env.SUPABASE_ANON_KEY }}`  (ou usar a service role key)
   - **Body Content Type:** JSON
   - **Body:**
   ```json
   {
     "evento": "matricula_finalizacao",
     "escola_id": {{ $('Webhook').item.json.body.escola_id }},
     "finalizacao": {{ JSON.stringify($('Webhook').item.json.body.finalizacao || {}) }},
     "matricula": {{ JSON.stringify($('Webhook').item.json.body.matricula) }}
   }
   ```
3. Nomear o no: `Registrar Movimentacao - Evadido`

- [ ] **Step 2: Adicionar HTTP Request apos `Atualizar Status: Trancado3`**

1. Adicionar um no **HTTP Request** apos `Atualizar Status: Trancado3` (antes de `Log: Trancado`)
2. Mesma configuracao de autenticacao
3. **Body:**
   ```json
   {
     "evento": "matricula_trancamento",
     "escola_id": {{ $('Webhook').item.json.body.escola_id }},
     "trancamento": {{ JSON.stringify($('Webhook').item.json.body.trancamento || {}) }},
     "matricula": {{ JSON.stringify($('Webhook').item.json.body.matricula) }}
   }
   ```
4. Nomear o no: `Registrar Movimentacao - Trancado`

- [ ] **Step 3: Reconectar os nos**

Fluxo atualizado:
- `Atualizar Status: Evadido3` -> `Registrar Movimentacao - Evadido` -> `Log: Evadido`
- `Atualizar Status: Trancado3` -> `Registrar Movimentacao - Trancado` -> `Log: Trancado`

- [ ] **Step 4: Testar com execucao manual**

No n8n, usar "Test Workflow" com o payload de trancamento (copiar de uma execucao anterior). Verificar:
1. No Supabase, consultar `movimentacoes_admin` para ver se o registro foi criado
2. Verificar se o `motivo_trancamento_id` foi mapeado corretamente

- [ ] **Step 5: Ativar o workflow**

Salvar e garantir que o workflow continua ativo.

---

### Task 3: Validacao end-to-end

- [ ] **Step 1: Aguardar proximo evento real do Emusys**

Quando uma matricula for trancada ou finalizada no Emusys, verificar:

```sql
SELECT id, aluno_nome, tipo, motivo, motivo_saida_id, motivo_trancamento_id, data
FROM movimentacoes_admin
ORDER BY created_at DESC
LIMIT 5;
```

- [ ] **Step 2: Verificar no Analytics**

Acessar Analytics > Gestao > scroll ate "Motivos de Nao Renovacao" e "Motivos de Cancelamento". Os novos registros devem aparecer nos donut charts.

- [ ] **Step 3: Monitorar logs da edge function**

```sql
-- Via Supabase Dashboard > Edge Functions > registrar-movimentacao-webhook > Logs
-- Ou via MCP:
-- get_logs(project_id, service: 'edge_function', function_id: 'registrar-movimentacao-webhook')
```

---

## Notas importantes

1. **Payload de `matricula_finalizacao`**: Ainda nao temos um exemplo real. O campo de motivo pode estar em `finalizacao.motivo`, `finalizacao.observacoes`, ou em outro local. A edge function tenta ambos. Se o payload real for diferente, ajustar o parsing.

2. **Mapeamento fuzzy nao e perfeito**: Motivos como "Obras" vao cair em "Outro" (id 10 para trancamento). Se o Emusys usar motivos padronizados, podemos refinar o mapeamento.

3. **Duplicatas**: A edge function verifica duplicata por `aluno_nome + tipo + data + unidade_id` antes de inserir.

4. **Trancamento nao e evasao**: O tipo `trancamento` em `movimentacoes_admin` nao aparece nos graficos de "Motivos de Cancelamento" (que filtra por `evasao` e `nao_renovacao`). Se quiser mostrar trancamentos em um grafico separado, precisa ajustar o frontend.

5. **Match por ID vs Nome**: A edge function prioriza `emusys_matricula_id` para match do aluno. Enquanto a coluna estiver NULL (alunos antigos), o fallback por nome continua funcionando. Novos alunos terao o ID preenchido automaticamente pelo workflow de `matricula_nova`.

6. **Homonimos**: Felipe Alves Fontinele tem 2 registros no banco (id 768 e 1145). O match por nome pega o primeiro. Com `emusys_matricula_id` preenchido, o match sera inequivoco.
