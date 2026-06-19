# Pesquisa Pós-1ª Aula — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar pesquisa de satisfação pós-1ª aula com 3 botões WhatsApp — fluxo semi-automático (detecção on-demand → revisão humana → envio manual) e notificação automática ao gerente quando aluno responder.

**Architecture:** Cinco camadas independentes, cada uma testável sozinha: (1) migration cria tabela `pesquisas_whatsapp` + RPC de detecção de calouros; (2) edge function `enviar-pesquisa-pos-primeira-aula` envia mensagem interativa com botões via UAZAPI; (3) edge function `processar-resposta-pesquisa` recebe webhook UAZAPI de botão, atualiza pesquisa e notifica gerente; (4) hook + componentes React implementam fluxo visual; (5) `TabSucessoAluno` refatora aba "Pesquisa Evasão" → "Pesquisas" com sub-navegação.

**Tech Stack:** Deno + Supabase edge functions, UAZAPI interactive buttons, React 19 + TypeScript 5.8, Supabase PostgreSQL RPC, Tailwind CSS + Radix UI, Sonner toasts, date-fns

## Global Constraints

- `alunos.id` é `integer` (não uuid) — todas as FKs para `alunos` usam tipo `integer`
- `unidades.id` é `uuid`
- `aluno_presenca` NÃO tem coluna `nr_da_aula` — usar `MIN(data_aula)` com `status = 'presente'` para detectar primeira aula
- Caixa UAZAPI da pesquisa: lookup por `departamento = 'sucesso_aluno'` em `whatsapp_caixas`
- Nunca deletar `pesquisas_whatsapp` — falhas ficam em `erro_detalhes`, `enviado_ok = false`
- Botões: `{ id: 'ruim', text: '😞 Ruim' }`, `{ id: 'regular', text: '😐 Regular' }`, `{ id: 'gostei', text: '😊 Gostei' }` → nota interna: 1, 3, 5
- Timezone BRT (UTC-3) — datas de negócio sempre comparadas em BRT
- Idioma do código: variáveis e comentários em português
- Edge functions: `@ts-nocheck`, Deno std `0.177.0`, supabase-js `@2`, env vars `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Commits sem `Co-Authored-By`

---

## Mapa de Arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/20260618_pesquisas_whatsapp.sql` | Criar |
| `supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts` | Criar |
| `supabase/functions/processar-resposta-pesquisa/index.ts` | Criar |
| `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts` | Criar |
| `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx` | Criar |
| `src/components/App/SucessoCliente/PesquisasTab.tsx` | Criar |
| `src/components/App/SucessoCliente/index.ts` | Modificar (add export) |
| `src/components/App/SucessoCliente/TabSucessoAluno.tsx` | Modificar (swap import + label + render) |

---

### Task 1: Migração — `pesquisas_whatsapp` + `telefone_gerente` + RPC

**Files:**
- Create: `supabase/migrations/20260618_pesquisas_whatsapp.sql`

**Interfaces:**
- Produces:
  - Tabela `pesquisas_whatsapp`
  - Coluna `unidades.telefone_gerente text`
  - Função `get_candidatos_pesquisa_primeira_aula(p_unidade_id uuid, p_janela_dias integer) RETURNS TABLE(...)`

- [ ] **Step 1: Criar a migration**

  Criar `supabase/migrations/20260618_pesquisas_whatsapp.sql`:

  ```sql
  -- 1. Coluna telefone_gerente em unidades (para notificação ao gerente)
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS telefone_gerente text;

  -- 2. Tabela pesquisas_whatsapp
  CREATE TABLE IF NOT EXISTS pesquisas_whatsapp (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aluno_id        integer NOT NULL REFERENCES alunos(id),
    unidade_id      uuid NOT NULL REFERENCES unidades(id),
    tipo            text NOT NULL CHECK (tipo IN ('pos_primeira_aula', 'pos_um_mes', 'pos_tres_meses', 'evasao')),
    data_matricula  date NOT NULL,
    remote_jid      text,
    enviado_em      timestamptz,
    enviado_ok      boolean NOT NULL DEFAULT false,
    erro_detalhes   text,
    nota            integer CHECK (nota BETWEEN 1 AND 5),
    respondido_em   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (aluno_id, tipo, data_matricula)
  );

  -- 3. RLS
  ALTER TABLE pesquisas_whatsapp ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "service_role_all" ON pesquisas_whatsapp
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  CREATE POLICY "authenticated_select" ON pesquisas_whatsapp
    FOR SELECT TO authenticated USING (true);

  -- 4. RPC get_candidatos_pesquisa_primeira_aula
  -- Retorna calouros que tiveram a primeira aula presente dentro da janela
  -- e ainda não receberam a pesquisa.
  -- Detecção de "primeira aula": MIN(data_aula) com status='presente'
  -- e data_aula >= data_matricula (evita reposições de turma anterior).
  CREATE OR REPLACE FUNCTION get_candidatos_pesquisa_primeira_aula(
    p_unidade_id  uuid,
    p_janela_dias integer DEFAULT 7
  )
  RETURNS TABLE (
    aluno_id           integer,
    unidade_id         uuid,
    nome               text,
    unidade_nome       text,
    curso_nome         text,
    professor_nome     text,
    data_primeira_aula date,
    data_matricula     date,
    whatsapp_jid       text
  )
  LANGUAGE sql
  STABLE
  AS $$
    WITH primeira_aula AS (
      SELECT
        ap.aluno_id,
        MIN(ap.data_aula) AS data_primeira_aula
      FROM aluno_presenca ap
      JOIN alunos a ON a.id = ap.aluno_id
      WHERE ap.status = 'presente'
        AND ap.data_aula >= a.data_matricula
        AND ap.unidade_id = p_unidade_id
        AND ap.data_aula >= (CURRENT_DATE - (p_janela_dias || ' days')::interval)
      GROUP BY ap.aluno_id
    )
    SELECT
      a.id                   AS aluno_id,
      a.unidade_id           AS unidade_id,
      a.nome::text           AS nome,
      u.nome::text           AS unidade_nome,
      c.nome::text           AS curso_nome,
      p.nome::text           AS professor_nome,
      pa.data_primeira_aula  AS data_primeira_aula,
      a.data_matricula       AS data_matricula,
      COALESCE(
        ac.whatsapp_jid,
        CASE
          WHEN a.whatsapp IS NOT NULL AND a.whatsapp <> ''
            THEN '55' || regexp_replace(a.whatsapp, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          WHEN a.telefone IS NOT NULL AND a.telefone <> ''
            THEN '55' || regexp_replace(a.telefone, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          ELSE NULL
        END
      )                      AS whatsapp_jid
    FROM alunos a
    JOIN primeira_aula pa ON pa.aluno_id = a.id
    JOIN unidades u ON u.id = a.unidade_id
    LEFT JOIN cursos c ON c.id = a.curso_id
    LEFT JOIN professores p ON p.id = a.professor_id
    LEFT JOIN LATERAL (
      SELECT ac2.whatsapp_jid
      FROM admin_conversas ac2
      JOIN whatsapp_caixas wc ON wc.id = ac2.caixa_id
      WHERE ac2.aluno_id = a.id
        AND wc.departamento = 'sucesso_aluno'
      ORDER BY ac2.created_at DESC
      LIMIT 1
    ) ac ON true
    WHERE a.is_segundo_curso = false
      AND a.status = 'ativo'
      AND a.unidade_id = p_unidade_id
      AND NOT EXISTS (
        SELECT 1 FROM pesquisas_whatsapp pw
        WHERE pw.aluno_id = a.id
          AND pw.tipo = 'pos_primeira_aula'
          AND pw.enviado_ok = true
      )
  $$;
  ```

- [ ] **Step 2: Aplicar via MCP**

  Usar `mcp__supabase__apply_migration` com o conteúdo acima. Confirmar com o usuário antes de executar.

- [ ] **Step 3: Verificar migration aplicada**

  ```sql
  SELECT COUNT(*) FROM pesquisas_whatsapp;
  -- Esperado: 0 (tabela vazia, sem erro)

  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'unidades' AND column_name = 'telefone_gerente';
  -- Esperado: 1 linha
  ```

- [ ] **Step 4: Testar RPC**

  ```sql
  SELECT * FROM get_candidatos_pesquisa_primeira_aula(
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid,  -- CG
    30
  );
  ```
  Esperado: retorna 0 ou mais linhas sem erro. Se retornar erro de coluna, revisar JOINs conforme schema atual.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20260618_pesquisas_whatsapp.sql
  git commit -m "feat(db): tabela pesquisas_whatsapp + RPC candidatos pós-1ª aula + unidades.telefone_gerente"
  ```

---

### Task 2: Edge Function `enviar-pesquisa-pos-primeira-aula`

Recebe lista de alunos do frontend, faz upsert em `pesquisas_whatsapp`, envia mensagem com botões via UAZAPI e registra na Caixa de Entrada.

**Files:**
- Create: `supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts`

**Interfaces:**
- Consumes:
  - `pesquisas_whatsapp` (upsert via `aluno_id,tipo,data_matricula`)
  - `whatsapp_caixas` (lookup por `departamento='sucesso_aluno' + unidade_id`)
  - `admin_conversas` + `admin_mensagens` (registro do envio)
- Payload de entrada: `{ alunos: [{ aluno_id: number, unidade_id: string, whatsapp_jid: string, nome: string, data_matricula: string }] }`
- Payload de saída: `{ resultados: [{ aluno_id: number, ok: boolean, erro?: string }] }`

- [ ] **Step 1: Verificar endpoint UAZAPI para botões**

  Testar com curl usando as credenciais da caixa "Sol - Sucesso do Aluno":
  ```bash
  curl -X POST https://<UAZAPI_URL>/send/buttons \
    -H "token: <UAZAPI_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "number": "5521966583325",
      "text": "Teste de botão",
      "buttons": [
        {"id": "ruim", "text": "😞 Ruim"},
        {"id": "regular", "text": "😐 Regular"},
        {"id": "gostei", "text": "😊 Gostei"}
      ]
    }'
  ```
  Confirmar: (a) endpoint correto (`/send/buttons` ou `/message/sendButtons`) e (b) formato do `buttons` array. Ajustar a constante `ENDPOINT_BOTOES` na edge se necessário.

- [ ] **Step 2: Criar a edge function**

  Criar `supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts`:

  ```typescript
  // @ts-nocheck
  import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const DEPARTAMENTO = 'sucesso_aluno';
  // Ajustar se o endpoint real for diferente (verificar no Step 1)
  const ENDPOINT_BOTOES = '/send/buttons';

  const BOTOES = [
    { id: 'ruim',    text: '😞 Ruim' },
    { id: 'regular', text: '😐 Regular' },
    { id: 'gostei',  text: '😊 Gostei' },
  ];

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  async function enviarBotoes(baseUrl, token, numero, nomeAluno) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const primeiroNome = String(nomeAluno || '').trim().split(' ')[0] || 'aluno';
      const body = {
        number: numero,
        text: `Olá, ${primeiroNome}! 🎵 Como foi sua primeira aula na LA Music?`,
        buttons: BOTOES,
        delay: 500,
        readchat: true,
      };
      const resp = await fetch(`${baseUrl}${ENDPOINT_BOTOES}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await resp.json().catch(() => ({}));
      const messageId = data.id || data.messageid || data.key?.id || null;
      return { ok: resp.ok && !data.error, data, messageId };
    } catch (e) {
      return { ok: false, data: { error: e instanceof Error ? e.message : String(e) }, messageId: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function registrarNaCaixa(supabase, { alunoId, unidadeId, jid, conteudo, caixaId, messageId, status }) {
    try {
      let conversaId = null;
      const { data: conv } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('aluno_id', alunoId)
        .eq('unidade_id', unidadeId)
        .eq('departamento', DEPARTAMENTO)
        .maybeSingle();

      if (conv) {
        conversaId = conv.id;
      } else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({
            aluno_id: alunoId,
            unidade_id: unidadeId,
            departamento: DEPARTAMENTO,
            caixa_id: caixaId,
            whatsapp_jid: jid,
            status: 'aberta',
          })
          .select('id')
          .single();
        conversaId = nova?.id || null;
      }

      if (!conversaId) return;

      await supabase.from('admin_mensagens').insert({
        conversa_id: conversaId,
        aluno_id: alunoId,
        direcao: 'saida',
        tipo: 'texto',
        conteudo,
        remetente: 'admin',
        remetente_nome: 'Pesquisa Pós-1ª Aula (automático)',
        status_entrega: status,
        whatsapp_message_id: messageId || null,
      });

      await supabase.from('admin_conversas')
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: conteudo.substring(0, 100),
          whatsapp_jid: jid,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
    } catch (e) {
      console.error('[enviar-pesquisa] erro ao registrar na caixa:', e);
    }
  }

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      const { alunos } = await req.json();
      if (!Array.isArray(alunos) || alunos.length === 0) {
        return new Response(JSON.stringify({ error: 'alunos obrigatorio e nao pode ser vazio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const resultados = [];

      // Agrupar por unidade para minimizar lookups de caixa
      const porUnidade = {};
      for (const aluno of alunos) {
        if (!porUnidade[aluno.unidade_id]) porUnidade[aluno.unidade_id] = [];
        porUnidade[aluno.unidade_id].push(aluno);
      }

      for (const [unidadeId, grupo] of Object.entries(porUnidade)) {
        // Lookup caixa por unidade; fallback para primeira caixa sucesso_aluno ativa
        let caixa = null;
        const { data: caixaUnidade } = await supabase
          .from('whatsapp_caixas')
          .select('id, uazapi_url, uazapi_token')
          .eq('departamento', DEPARTAMENTO)
          .eq('unidade_id', unidadeId)
          .eq('ativo', true)
          .maybeSingle();

        if (caixaUnidade) {
          caixa = caixaUnidade;
        } else {
          const { data: caixaGeral } = await supabase
            .from('whatsapp_caixas')
            .select('id, uazapi_url, uazapi_token')
            .eq('departamento', DEPARTAMENTO)
            .eq('ativo', true)
            .limit(1)
            .maybeSingle();
          caixa = caixaGeral;
        }

        if (!caixa) {
          for (const a of grupo) {
            resultados.push({ aluno_id: a.aluno_id, ok: false, erro: 'caixa_sucesso_aluno_nao_encontrada' });
          }
          continue;
        }

        let baseUrl = caixa.uazapi_url || '';
        if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
        baseUrl = baseUrl.replace(/\/+$/, '');
        const token = caixa.uazapi_token;

        for (const aluno of grupo) {
          const { aluno_id, unidade_id, whatsapp_jid, nome, data_matricula } = aluno;

          if (!whatsapp_jid) {
            resultados.push({ aluno_id, ok: false, erro: 'sem_contato' });
            continue;
          }

          // Upsert: cria ou reutiliza linha de tentativa anterior (ON CONFLICT mantém idempotência)
          const { error: upsertErr } = await supabase
            .from('pesquisas_whatsapp')
            .upsert(
              { aluno_id, unidade_id, tipo: 'pos_primeira_aula', data_matricula, enviado_ok: false, erro_detalhes: null },
              { onConflict: 'aluno_id,tipo,data_matricula' }
            );

          if (upsertErr) {
            console.error('[enviar-pesquisa] upsert erro:', upsertErr);
            resultados.push({ aluno_id, ok: false, erro: upsertErr.message });
            continue;
          }

          // numero para UAZAPI: sem "@s.whatsapp.net"
          const numero = whatsapp_jid.replace('@s.whatsapp.net', '');
          const primeiroNome = String(nome || '').trim().split(' ')[0] || '';
          const textoMensagem = `Olá, ${primeiroNome}! 🎵 Como foi sua primeira aula na LA Music?`;
          const resultado = await enviarBotoes(baseUrl, token, numero, nome);

          if (resultado.ok) {
            await supabase
              .from('pesquisas_whatsapp')
              .update({ enviado_ok: true, enviado_em: new Date().toISOString(), remote_jid: whatsapp_jid })
              .eq('aluno_id', aluno_id)
              .eq('tipo', 'pos_primeira_aula')
              .eq('data_matricula', data_matricula);

            await registrarNaCaixa(supabase, {
              alunoId: aluno_id,
              unidadeId: unidade_id,
              jid: whatsapp_jid,
              conteudo: textoMensagem,
              caixaId: caixa.id,
              messageId: resultado.messageId,
              status: 'enviada',
            });

            resultados.push({ aluno_id, ok: true });
          } else {
            await supabase
              .from('pesquisas_whatsapp')
              .update({ erro_detalhes: JSON.stringify(resultado.data) })
              .eq('aluno_id', aluno_id)
              .eq('tipo', 'pos_primeira_aula')
              .eq('data_matricula', data_matricula);

            resultados.push({ aluno_id, ok: false, erro: resultado.data?.error || 'falha_envio' });
          }
        }
      }

      return new Response(JSON.stringify({ resultados }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[enviar-pesquisa] erro:', error);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });
  ```

- [ ] **Step 3: Deploy via MCP**

  Usar `mcp__supabase__deploy_edge_function`:
  - `function_slug`: `enviar-pesquisa-pos-primeira-aula`
  - `verify_jwt`: `false`

- [ ] **Step 4: Testar com curl**

  ```bash
  curl -X POST https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/enviar-pesquisa-pos-primeira-aula \
    -H "Content-Type: application/json" \
    -d '{
      "alunos": [{
        "aluno_id": 1,
        "unidade_id": "2ec861f6-023f-4d7b-9927-3960ad8c2a92",
        "whatsapp_jid": "5521966583325@s.whatsapp.net",
        "nome": "Teste",
        "data_matricula": "2026-01-01"
      }]
    }'
  ```
  Esperado: `resultados[0].ok = true` e mensagem com 3 botões chega no WhatsApp de teste.
  Se `/send/buttons` retornar 404, testar `/message/sendButtons` e corrigir `ENDPOINT_BOTOES`.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/functions/enviar-pesquisa-pos-primeira-aula/
  git commit -m "feat(edge): enviar-pesquisa-pos-primeira-aula — botoes UAZAPI + upsert pesquisas_whatsapp"
  ```

---

### Task 3: Edge Function `processar-resposta-pesquisa`

Recebe webhook UAZAPI de mensagem entrante, detecta se é resposta de botão de pesquisa, atualiza `pesquisas_whatsapp` e notifica gerente via WhatsApp.

**Files:**
- Create: `supabase/functions/processar-resposta-pesquisa/index.ts`

**Interfaces:**
- Consumes:
  - `pesquisas_whatsapp` (update: `nota`, `respondido_em`)
  - `whatsapp_caixas` (lookup por `uazapi_token` do payload para obter `unidade_id`)
  - `alunos` (nome, `cursos.nome`)
  - `unidades` (`telefone_gerente`)
- Payload de entrada: webhook UAZAPI com `buttonId` no campo `message.buttonsResponseMessage.selectedButtonId`
- Payload de saída: `{ ok: true, nota: number }` ou `{ ignorado: true, motivo: string }`

- [ ] **Step 1: Verificar formato do webhook UAZAPI para botão**

  Após Task 2 Step 4 (mensagem de teste com botões enviada), tocar um botão no WhatsApp de teste e inspecionar o payload UAZAPI. Verificar:
  - Caminho para o `buttonId`: `message.buttonsResponseMessage.selectedButtonId` vs `message.templateButtonReplyMessage.selectedId`
  - Caminho para `remoteJid`: `data.key.remoteJid` vs `key.remoteJid`
  - Campo de identificação da caixa: `apikey`, `instance`, ou header `X-Apikey`

  Ajustar as constantes de path na edge function conforme o resultado.

- [ ] **Step 2: Criar a edge function**

  Criar `supabase/functions/processar-resposta-pesquisa/index.ts`:

  ```typescript
  // @ts-nocheck
  import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const DEPARTAMENTO = 'sucesso_aluno';
  const JANELA_RESPOSTA_DIAS = 7;

  // Mapeamento botao → nota armazenada
  const NOTA_POR_BOTAO = { ruim: 1, regular: 3, gostei: 5 };
  const LABEL_POR_BOTAO = { ruim: '😞 Ruim', regular: '😐 Regular', gostei: '😊 Gostei' };

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  async function enviarTexto(baseUrl, token, numero, texto) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({ number: numero, text: texto, delay: 500, readchat: true }),
        signal: controller.signal,
      });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok && !data.error };
    } catch (e) {
      return { ok: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const payload = await req.json();
      console.log('[processar-resposta] payload:', JSON.stringify(payload).substring(0, 600));

      // Extrair buttonId — tentar múltiplos caminhos (UAZAPI vs Evolution API)
      const msg = payload?.data?.message || payload?.message;
      const buttonId =
        msg?.buttonsResponseMessage?.selectedButtonId ||
        msg?.templateButtonReplyMessage?.selectedId ||
        null;

      if (!buttonId) {
        // Mensagem normal, não é resposta de botão — ignorar
        return new Response(JSON.stringify({ ignorado: true, motivo: 'sem_botao' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const nota = NOTA_POR_BOTAO[buttonId];
      if (!nota) {
        return new Response(JSON.stringify({ ignorado: true, motivo: 'botao_desconhecido', buttonId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extrair remoteJid do remetente
      const remoteJid =
        payload?.data?.key?.remoteJid ||
        payload?.key?.remoteJid ||
        null;

      if (!remoteJid) {
        console.error('[processar-resposta] remoteJid ausente');
        return new Response(JSON.stringify({ erro: 'remote_jid_ausente' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Identificar caixa pelo token do payload → obtém unidade_id
      const apikey = payload?.apikey || payload?.instance || req.headers.get('x-apikey') || null;
      let unidadeId = null;
      let caixaBaseUrl = null;
      let caixaToken = null;

      if (apikey) {
        const { data: caixa } = await supabase
          .from('whatsapp_caixas')
          .select('id, uazapi_url, uazapi_token, unidade_id')
          .eq('uazapi_token', apikey)
          .maybeSingle();
        if (caixa) {
          unidadeId = caixa.unidade_id;
          let url = caixa.uazapi_url || '';
          if (url && !url.startsWith('http')) url = 'https://' + url;
          caixaBaseUrl = url.replace(/\/+$/, '');
          caixaToken = caixa.uazapi_token;
        }
      }

      // Lookup pesquisa pendente
      const limiteEnvio = new Date(Date.now() - JANELA_RESPOSTA_DIAS * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('pesquisas_whatsapp')
        .select('id, aluno_id, unidade_id')
        .eq('remote_jid', remoteJid)
        .eq('tipo', 'pos_primeira_aula')
        .eq('enviado_ok', true)
        .is('nota', null)
        .gte('enviado_em', limiteEnvio)
        .order('created_at', { ascending: false })
        .limit(1);

      if (unidadeId) query = query.eq('unidade_id', unidadeId);

      const { data: pesquisa } = await query.maybeSingle();

      if (!pesquisa) {
        console.log('[processar-resposta] pesquisa nao encontrada para jid:', remoteJid);
        return new Response(JSON.stringify({ ignorado: true, motivo: 'pesquisa_nao_encontrada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Registrar nota
      await supabase
        .from('pesquisas_whatsapp')
        .update({ nota, respondido_em: new Date().toISOString() })
        .eq('id', pesquisa.id);

      // Buscar dados do aluno para a notificação
      const { data: aluno } = await supabase
        .from('alunos')
        .select('nome, cursos(nome)')
        .eq('id', pesquisa.aluno_id)
        .maybeSingle();

      const pesquisaUnidadeId = pesquisa.unidade_id;
      const { data: unidade } = await supabase
        .from('unidades')
        .select('telefone_gerente')
        .eq('id', pesquisaUnidadeId)
        .maybeSingle();

      const telefoneGerente = unidade?.telefone_gerente;
      if (!telefoneGerente) {
        console.warn('[processar-resposta] telefone_gerente nao cadastrado para unidade:', pesquisaUnidadeId);
        return new Response(JSON.stringify({ ok: true, nota, aviso: 'gerente_sem_telefone' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fallback de caixa caso o apikey nao tenha sido identificado
      if (!caixaBaseUrl || !caixaToken) {
        const { data: caixaFallback } = await supabase
          .from('whatsapp_caixas')
          .select('uazapi_url, uazapi_token')
          .eq('departamento', DEPARTAMENTO)
          .eq('ativo', true)
          .limit(1)
          .maybeSingle();
        if (caixaFallback) {
          let url = caixaFallback.uazapi_url || '';
          if (url && !url.startsWith('http')) url = 'https://' + url;
          caixaBaseUrl = url.replace(/\/+$/, '');
          caixaToken = caixaFallback.uazapi_token;
        }
      }

      if (caixaBaseUrl && caixaToken) {
        const nomeAluno = aluno?.nome || 'Aluno';
        const primeiroNome = nomeAluno.split(' ')[0];
        const cursoNome = aluno?.cursos?.nome || '';
        const labelBotao = LABEL_POR_BOTAO[buttonId] || buttonId;
        const textoGerente = `Feedback de ${primeiroNome}${cursoNome ? ` (${cursoNome})` : ''}: ${labelBotao}`;

        const numGerente = String(telefoneGerente).replace(/[^0-9]/g, '');
        const numFinal = numGerente.startsWith('55') ? numGerente : '55' + numGerente;
        await enviarTexto(caixaBaseUrl, caixaToken, numFinal, textoGerente);
        console.log('[processar-resposta] gerente notificado:', numFinal);
      }

      return new Response(JSON.stringify({ ok: true, nota, pesquisa_id: pesquisa.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[processar-resposta] erro:', error);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });
  ```

- [ ] **Step 3: Deploy via MCP**

  Usar `mcp__supabase__deploy_edge_function`:
  - `function_slug`: `processar-resposta-pesquisa`
  - `verify_jwt`: `false`

- [ ] **Step 4: Registrar webhook no UAZAPI**

  Na configuração da caixa "Sol - Sucesso do Aluno" no painel UAZAPI, adicionar webhook de mensagens entrantes apontando para:
  ```
  https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-resposta-pesquisa
  ```
  Se UAZAPI suportar apenas UM webhook por caixa, verificar qual é o handler atual de mensagens entrantes e integrar a lógica de pesquisa nele (em vez de edge separada).

- [ ] **Step 5: Testar ponta a ponta**

  1. Enviar pesquisa para número de teste (Task 2 Step 4)
  2. Tocar o botão "😊 Gostei" no WhatsApp
  3. Verificar banco:
     ```sql
     SELECT nota, respondido_em FROM pesquisas_whatsapp
     WHERE tipo = 'pos_primeira_aula'
     ORDER BY created_at DESC LIMIT 1;
     -- Esperado: nota = 5, respondido_em preenchido
     ```
  4. Verificar: gerente recebe mensagem "Feedback de Teste: 😊 Gostei" no WhatsApp
  5. Se botão não for detectado, revisar caminho do `buttonId` no payload (Step 1)

- [ ] **Step 6: Commit**

  ```bash
  git add supabase/functions/processar-resposta-pesquisa/
  git commit -m "feat(edge): processar-resposta-pesquisa — botao UAZAPI, atualiza nota, notifica gerente"
  ```

---

### Task 4: Frontend — Hook + `PesquisaPrimeiraAulaTab` + `PesquisasTab`

**Files:**
- Create: `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts`
- Create: `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx`
- Create: `src/components/App/SucessoCliente/PesquisasTab.tsx`
- Modify: `src/components/App/SucessoCliente/index.ts`

**Interfaces:**
- Hook expõe: `{ candidatos: CandidatoPesquisa[], loading: boolean, enviando: boolean, resultados: ResultadoEnvio[], buscarCandidatos(janelaDias: number): void, enviar(selecionados: CandidatoPesquisa[]): void }`
- `PesquisasTab` props: `{ unidadeAtual: UnidadeId }`
- `PesquisaPrimeiraAulaTab` props: `{ unidadeAtual: UnidadeId }`

- [ ] **Step 1: Criar `usePesquisaPrimeiraAula.ts`**

  Criar `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts`:

  ```typescript
  import { useState, useCallback } from 'react';
  import { supabase } from '@/lib/supabase';
  import { toast } from 'sonner';
  import type { UnidadeId } from '@/components/ui/UnidadeFilter';

  export interface CandidatoPesquisa {
    aluno_id: number;
    unidade_id: string;
    nome: string;
    unidade_nome: string;
    curso_nome: string | null;
    professor_nome: string | null;
    data_primeira_aula: string;
    data_matricula: string;
    whatsapp_jid: string | null;
  }

  export interface ResultadoEnvio {
    aluno_id: number;
    ok: boolean;
    erro?: string;
  }

  export function usePesquisaPrimeiraAula(unidadeAtual: UnidadeId) {
    const [candidatos, setCandidatos] = useState<CandidatoPesquisa[]>([]);
    const [loading, setLoading] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [resultados, setResultados] = useState<ResultadoEnvio[]>([]);

    const buscarCandidatos = useCallback(async (janelaDias: number) => {
      if (unidadeAtual === 'todos') {
        toast.error('Selecione uma unidade para buscar candidatos');
        return;
      }
      setLoading(true);
      setResultados([]);
      try {
        const { data, error } = await supabase.rpc('get_candidatos_pesquisa_primeira_aula', {
          p_unidade_id: unidadeAtual,
          p_janela_dias: janelaDias,
        });
        if (error) throw error;
        setCandidatos((data as CandidatoPesquisa[]) || []);
      } catch (err: any) {
        toast.error('Erro ao buscar candidatos: ' + (err.message || 'Erro desconhecido'));
        setCandidatos([]);
      } finally {
        setLoading(false);
      }
    }, [unidadeAtual]);

    const enviar = useCallback(async (selecionados: CandidatoPesquisa[]) => {
      if (selecionados.length === 0) return;
      setEnviando(true);
      try {
        const { data, error } = await supabase.functions.invoke('enviar-pesquisa-pos-primeira-aula', {
          body: {
            alunos: selecionados.map(a => ({
              aluno_id: a.aluno_id,
              unidade_id: a.unidade_id,
              whatsapp_jid: a.whatsapp_jid,
              nome: a.nome,
              data_matricula: a.data_matricula,
            })),
          },
        });
        if (error) throw error;

        const resultadosData: ResultadoEnvio[] = (data as any)?.resultados || [];
        setResultados(resultadosData);

        const enviados = resultadosData.filter(r => r.ok).length;
        const falhas = resultadosData.filter(r => !r.ok).length;
        if (enviados > 0) toast.success(`${enviados} pesquisa${enviados > 1 ? 's' : ''} enviada${enviados > 1 ? 's' : ''}`);
        if (falhas > 0) toast.error(`${falhas} envio${falhas > 1 ? 's' : ''} falhou`);

        // Remover enviados com sucesso da lista
        const idsEnviados = new Set(resultadosData.filter(r => r.ok).map(r => r.aluno_id));
        setCandidatos(prev => prev.filter(c => !idsEnviados.has(c.aluno_id)));
      } catch (err: any) {
        toast.error('Erro ao enviar pesquisas: ' + (err.message || 'Erro desconhecido'));
      } finally {
        setEnviando(false);
      }
    }, []);

    return { candidatos, loading, enviando, resultados, buscarCandidatos, enviar };
  }
  ```

- [ ] **Step 2: Criar `PesquisaPrimeiraAulaTab.tsx`**

  Criar `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx`:

  ```tsx
  import { useState, useEffect } from 'react';
  import { format } from 'date-fns';
  import { ptBR } from 'date-fns/locale';
  import { Send, Loader2, RefreshCw, Phone } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import type { UnidadeId } from '@/components/ui/UnidadeFilter';
  import { usePesquisaPrimeiraAula, type CandidatoPesquisa } from './hooks/usePesquisaPrimeiraAula';

  interface Props {
    unidadeAtual: UnidadeId;
  }

  function formatarJid(jid: string | null): string {
    if (!jid) return '—';
    const numero = jid.replace('@s.whatsapp.net', '');
    const d = numero.replace(/\D/g, '');
    // Formato BR: 55 + DDD(2) + 9(1) + 8 dígitos = 13 chars
    if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return numero;
  }

  export function PesquisaPrimeiraAulaTab({ unidadeAtual }: Props) {
    const [janelaDias, setJanelaDias] = useState<number>(7);
    const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
    const { candidatos, loading, enviando, resultados, buscarCandidatos, enviar } = usePesquisaPrimeiraAula(unidadeAtual);

    // Selecionar todos ao carregar candidatos (exceto sem contato)
    useEffect(() => {
      setSelecionados(new Set(candidatos.filter(c => c.whatsapp_jid).map(c => c.aluno_id)));
    }, [candidatos]);

    // Buscar ao montar e ao mudar janela ou unidade
    useEffect(() => {
      if (unidadeAtual !== 'todos') {
        buscarCandidatos(janelaDias);
      }
    }, [janelaDias, unidadeAtual]);

    const toggleSelecionado = (alunoId: number) => {
      setSelecionados(prev => {
        const next = new Set(prev);
        next.has(alunoId) ? next.delete(alunoId) : next.add(alunoId);
        return next;
      });
    };

    const candidatosComContato = candidatos.filter(c => c.whatsapp_jid);
    const todosSelecionados = candidatosComContato.length > 0 && candidatosComContato.every(c => selecionados.has(c.aluno_id));
    const selecionadosList = candidatos.filter(c => selecionados.has(c.aluno_id));
    const resultadoPorId = new Map(resultados.map(r => [r.aluno_id, r]));

    if (unidadeAtual === 'todos') {
      return (
        <div className="flex items-center justify-center py-20 text-slate-400">
          Selecione uma unidade para gerenciar pesquisas
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Cabeçalho com seletor de janela e botão enviar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Select value={String(janelaDias)} onValueChange={v => setJanelaDias(Number(v))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="14">Últimos 14 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-400">
              {loading
                ? 'Buscando...'
                : `${candidatos.length} candidato${candidatos.length !== 1 ? 's' : ''} encontrado${candidatos.length !== 1 ? 's' : ''}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => buscarCandidatos(janelaDias)}
              disabled={loading}
              className="text-slate-400"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <Button
            onClick={() => enviar(selecionadosList)}
            disabled={enviando || selecionadosList.length === 0}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar pesquisa ({selecionadosList.length})
          </Button>
        </div>

        {/* Tabela de candidatos */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/80 border-b border-slate-700">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={e =>
                        setSelecionados(
                          e.target.checked
                            ? new Set(candidatosComContato.map(c => c.aluno_id))
                            : new Set()
                        )
                      }
                      className="w-4 h-4 accent-violet-500"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Curso</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">1ª Aula</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Contato</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-violet-500 mx-auto" />
                    </td>
                  </tr>
                ) : candidatos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Nenhum calouro com primeira aula nos últimos {janelaDias} dias pendente de pesquisa
                    </td>
                  </tr>
                ) : (
                  candidatos.map(c => {
                    const resultado = resultadoPorId.get(c.aluno_id);
                    const semContato = !c.whatsapp_jid;
                    return (
                      <tr
                        key={c.aluno_id}
                        className={`transition-colors ${resultado?.erro ? 'bg-red-900/10' : 'hover:bg-slate-700/30'}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selecionados.has(c.aluno_id) && !semContato}
                            disabled={semContato}
                            onChange={() => !semContato && toggleSelecionado(c.aluno_id)}
                            className="w-4 h-4 accent-violet-500 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{c.nome}</td>
                        <td className="px-4 py-3 text-slate-300">{c.curso_nome || '—'}</td>
                        <td className="px-4 py-3 text-slate-300">{c.professor_nome || '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-300">
                          {format(new Date(c.data_primeira_aula + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-4 py-3">
                          {semContato ? (
                            <span className="text-xs text-red-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              Sem contato
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300 font-mono">{formatarJid(c.whatsapp_jid)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {resultado ? (
                            resultado.ok ? (
                              <span className="text-xs text-green-400">Enviado ✓</span>
                            ) : (
                              <span className="text-xs text-red-400" title={resultado.erro}>
                                Erro ✗
                              </span>
                            )
                          ) : semContato ? (
                            <span className="text-xs text-slate-500">—</span>
                          ) : (
                            <span className="text-xs text-slate-500">Pendente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Criar `PesquisasTab.tsx`**

  Criar `src/components/App/SucessoCliente/PesquisasTab.tsx`:

  ```tsx
  import { useState } from 'react';
  import { Star, UserX } from 'lucide-react';
  import type { UnidadeId } from '@/components/ui/UnidadeFilter';
  import { PesquisaPrimeiraAulaTab } from './PesquisaPrimeiraAulaTab';
  import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';

  type SubAba = 'pos_primeira_aula' | 'evasao';

  interface Props {
    unidadeAtual: UnidadeId;
  }

  export function PesquisasTab({ unidadeAtual }: Props) {
    const [subAba, setSubAba] = useState<SubAba>('pos_primeira_aula');

    return (
      <div className="space-y-4">
        {/* Sub-navegação interna */}
        <div className="flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 w-fit">
          <button
            onClick={() => setSubAba('pos_primeira_aula')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subAba === 'pos_primeira_aula'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Star className="w-4 h-4" />
            Pós-1ª Aula
          </button>
          <button
            onClick={() => setSubAba('evasao')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subAba === 'evasao'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <UserX className="w-4 h-4" />
            Evasão
          </button>
        </div>

        {subAba === 'pos_primeira_aula' && <PesquisaPrimeiraAulaTab unidadeAtual={unidadeAtual} />}
        {subAba === 'evasao' && <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />}
      </div>
    );
  }
  ```

- [ ] **Step 4: Atualizar `index.ts`**

  Abrir `src/components/App/SucessoCliente/index.ts` e adicionar:
  ```typescript
  export { PesquisasTab } from './PesquisasTab';
  ```

- [ ] **Step 5: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```
  Esperado: 0 erros nos arquivos novos. Erros pré-existentes em outros módulos podem ser ignorados.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts
  git add src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx
  git add src/components/App/SucessoCliente/PesquisasTab.tsx
  git add src/components/App/SucessoCliente/index.ts
  git commit -m "feat(ui): PesquisasTab sub-nav Pos-1a-Aula/Evasao + PesquisaPrimeiraAulaTab + hook"
  ```

---

### Task 5: Integrar `PesquisasTab` em `TabSucessoAluno`

Três mudanças cirúrgicas em `TabSucessoAluno.tsx`: import, label da aba, render.

**Files:**
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`

**Interfaces:**
- Sem mudança de API — apenas troca de componente e texto da aba

- [ ] **Step 1: Trocar import**

  Em `TabSucessoAluno.tsx` linha 18, substituir:
  ```typescript
  import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';
  ```
  por:
  ```typescript
  import { PesquisasTab } from './PesquisasTab';
  ```

- [ ] **Step 2: Atualizar label da aba**

  Encontrar o botão da aba pesquisa (em torno da linha 405–415). O texto atual é:
  ```tsx
  <FileQuestion className="w-4 h-4" />
  Pesquisa Evasão
  ```
  Substituir por:
  ```tsx
  <FileQuestion className="w-4 h-4" />
  Pesquisas
  ```

- [ ] **Step 3: Atualizar render**

  Encontrar (em torno da linha 697–700):
  ```tsx
  {subAba === 'pesquisa' && (
    <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />
  )}
  ```
  Substituir por:
  ```tsx
  {subAba === 'pesquisa' && (
    <PesquisasTab unidadeAtual={unidadeAtual} />
  )}
  ```

- [ ] **Step 4: Verificar TypeScript + iniciar dev server**

  ```bash
  npx tsc --noEmit
  npm run dev
  ```

- [ ] **Step 5: Testar no browser**

  1. Abrir "Sucesso do Aluno"
  2. Clicar na aba "Pesquisas" — verificar que aparece (antes era "Pesquisa Evasão")
  3. Verificar sub-tabs "Pós-1ª Aula" | "Evasão"
  4. Clicar "Evasão" — deve funcionar igual a antes
  5. Clicar "Pós-1ª Aula" com unidade selecionada — tabela carrega candidatos (pode estar vazia)
  6. Com unidade "Todos" — exibe mensagem "Selecione uma unidade"

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/App/SucessoCliente/TabSucessoAluno.tsx
  git commit -m "feat(ui): TabSucessoAluno — aba Pesquisas com sub-navegacao (Pos-1a-Aula / Evasao)"
  ```

---

## Checklist de Self-Review

- [x] Tabela `pesquisas_whatsapp` com `UNIQUE(aluno_id, tipo, data_matricula)` → Task 1
- [x] `aluno_id` como `integer` (confirmado via schema real) → Task 1
- [x] `unidades.telefone_gerente` criada → Task 1
- [x] RPC usa `MIN(data_aula)` com `status='presente'` (sem `nr_da_aula` que não existe) → Task 1
- [x] RPC filtra `is_segundo_curso=false`, `status='ativo'`, `enviado_ok=true` exclusão → Task 1
- [x] Edge envia botões UAZAPI (3 opções, endpoint a verificar no Step 1) → Task 2
- [x] Upsert com `enviado_ok=false` antes do envio → Task 2
- [x] Caixa lookup por `departamento + unidade_id` com fallback → Task 2
- [x] `remote_jid` salvo após sucesso → Task 2
- [x] `erro_detalhes` em falha, sem DELETE → Task 2
- [x] Registro em `admin_conversas/admin_mensagens` → Task 2
- [x] Edge sem n8n — UAZAPI webhook direto → Task 3
- [x] Parse de `buttonId` em múltiplos caminhos de campo → Task 3
- [x] Lookup `remote_jid + unidade_id + nota IS NULL + janela 7 dias` → Task 3
- [x] Notificação gerente com `telefone_gerente` + fallback de caixa → Task 3
- [x] `PesquisasTab` com sub-nav Pós-1ª Aula / Evasão → Task 4
- [x] `PesquisaPrimeiraAulaTab`: seletor janela, tabela, checkboxes, botão envio → Task 4
- [x] Todos com contato selecionados por padrão; sem contato desabilitado → Task 4
- [x] Estado vazio e feedback por linha (Enviado ✓ / Erro ✗) → Task 4
- [x] `TabSucessoAluno` atualizado com 3 mudanças cirúrgicas → Task 5

**Nota para Task 3 Step 4:** Se UAZAPI suportar apenas um webhook por caixa, contactar o usuário antes de prosseguir — precisará integrar a lógica na edge existente em vez de criar webhook separado.
