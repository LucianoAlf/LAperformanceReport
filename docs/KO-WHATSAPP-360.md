# K.O. - Integração WhatsApp Professor 360°

## Objetivo
Notificar automaticamente os professores via WhatsApp quando uma ocorrência for registrada no sistema 360°.

## Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Farmer/Coordenador registra ocorrência no sistema           │
│     - Professor, Unidade, Tipo, Data, Descrição, Registrado por │
├─────────────────────────────────────────────────────────────────┤
│  2. Sistema salva no banco de dados (Supabase)                  │
│     - Tabela: professor_360_ocorrencias                         │
├─────────────────────────────────────────────────────────────────┤
│  3. Trigger/Edge Function dispara notificação WhatsApp          │
│     - Busca telefone do professor na tabela professores         │
│     - Formata mensagem com dados da ocorrência                  │
│     - Envia via API WhatsApp (Evolution API / Z-API / etc)      │
├─────────────────────────────────────────────────────────────────┤
│  4. Atualiza status de envio na ocorrência                      │
│     - whatsapp_enviado: true/false                              │
│     - whatsapp_enviado_em: timestamp                            │
└─────────────────────────────────────────────────────────────────┘
```

## Modelo de Mensagem WhatsApp

```
🔔 *LA Music - Avaliação 360°*

Olá, {nome_professor}!

Uma ocorrência foi registrada em seu perfil:

📋 *Tipo:* {tipo_ocorrencia}
📅 *Data:* {data_ocorrencia}
🏢 *Unidade:* {unidade}
👤 *Registrado por:* {registrado_por}

📝 *Observação:*
{descricao}

---
Em caso de dúvidas, procure a coordenação.
```

## Requisitos Técnicos

### 1. Banco de Dados
Adicionar colunas na tabela `professor_360_ocorrencias`:
```sql
ALTER TABLE professor_360_ocorrencias ADD COLUMN IF NOT EXISTS 
  whatsapp_enviado BOOLEAN DEFAULT FALSE;

ALTER TABLE professor_360_ocorrencias ADD COLUMN IF NOT EXISTS 
  whatsapp_enviado_em TIMESTAMP WITH TIME ZONE;

ALTER TABLE professor_360_ocorrencias ADD COLUMN IF NOT EXISTS 
  whatsapp_erro TEXT;
```

### 2. Tabela Professores
Garantir que a tabela `professores` tenha o campo de telefone:
```sql
-- Verificar se existe
SELECT telefone FROM professores LIMIT 1;

-- Se não existir, adicionar
ALTER TABLE professores ADD COLUMN IF NOT EXISTS 
  telefone VARCHAR(20);
```

### 3. Edge Function (Supabase)
Criar Edge Function para envio de WhatsApp:

```typescript
// supabase/functions/enviar-whatsapp-360/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHATSAPP_API_URL = Deno.env.get('WHATSAPP_API_URL')
const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY')
const WHATSAPP_INSTANCE = Deno.env.get('WHATSAPP_INSTANCE')

serve(async (req) => {
  const { ocorrencia_id } = await req.json()
  
  // Buscar dados da ocorrência
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  const { data: ocorrencia } = await supabase
    .from('professor_360_ocorrencias')
    .select(`
      *,
      professor:professores(nome, telefone),
      criterio:professor_360_criterios(nome),
      unidade:unidades(nome)
    `)
    .eq('id', ocorrencia_id)
    .single()
  
  if (!ocorrencia?.professor?.telefone) {
    return new Response(JSON.stringify({ error: 'Telefone não encontrado' }), { status: 400 })
  }
  
  // Formatar mensagem
  const mensagem = `🔔 *LA Music - Avaliação 360°*

Olá, ${ocorrencia.professor.nome}!

Uma ocorrência foi registrada em seu perfil:

📋 *Tipo:* ${ocorrencia.criterio.nome}
📅 *Data:* ${new Date(ocorrencia.data_ocorrencia).toLocaleDateString('pt-BR')}
🏢 *Unidade:* ${ocorrencia.unidade.nome}
👤 *Registrado por:* ${ocorrencia.registrado_por_nome || 'Sistema'}

📝 *Observação:*
${ocorrencia.descricao || 'Sem observação adicional'}

---
Em caso de dúvidas, procure a coordenação.`

  // Enviar via API WhatsApp
  try {
    const response = await fetch(`${WHATSAPP_API_URL}/message/sendText/${WHATSAPP_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': WHATSAPP_API_KEY
      },
      body: JSON.stringify({
        number: ocorrencia.professor.telefone.replace(/\D/g, ''),
        text: mensagem
      })
    })
    
    // Atualizar status
    await supabase
      .from('professor_360_ocorrencias')
      .update({
        whatsapp_enviado: true,
        whatsapp_enviado_em: new Date().toISOString()
      })
      .eq('id', ocorrencia_id)
    
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error) {
    await supabase
      .from('professor_360_ocorrencias')
      .update({
        whatsapp_enviado: false,
        whatsapp_erro: error.message
      })
      .eq('id', ocorrencia_id)
    
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

### 4. Trigger no Banco
Criar trigger para chamar a Edge Function automaticamente:

```sql
-- Função que chama a Edge Function
CREATE OR REPLACE FUNCTION notify_whatsapp_360()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/enviar-whatsapp-360',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := json_build_object('ocorrencia_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER trigger_whatsapp_360
AFTER INSERT ON professor_360_ocorrencias
FOR EACH ROW
EXECUTE FUNCTION notify_whatsapp_360();
```

## Variáveis de Ambiente Necessárias

```env
# Supabase Edge Functions
WHATSAPP_API_URL=https://api.evolution-api.com  # ou Z-API, etc
WHATSAPP_API_KEY=sua_api_key
WHATSAPP_INSTANCE=la_music_360
```

## Opções de API WhatsApp

1. **Evolution API** (self-hosted, gratuito)
   - https://github.com/EvolutionAPI/evolution-api
   
2. **Z-API** (pago, mais estável)
   - https://z-api.io/
   
3. **Twilio** (pago, enterprise)
   - https://www.twilio.com/whatsapp

## Próximos Passos

1. [ ] Escolher provedor de API WhatsApp
2. [ ] Configurar instância/conta
3. [ ] Adicionar colunas no banco de dados
4. [ ] Criar Edge Function no Supabase
5. [ ] Configurar variáveis de ambiente
6. [ ] Criar trigger no banco
7. [ ] Testar fluxo completo
8. [ ] Adicionar indicador visual no frontend (ícone WhatsApp na tabela)

## Considerações

- **Horário de envio**: Considerar não enviar notificações fora do horário comercial
- **Rate limiting**: Respeitar limites da API WhatsApp
- **Fallback**: Se WhatsApp falhar, considerar envio por email
- **Logs**: Manter histórico de envios para auditoria
