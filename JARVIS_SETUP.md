# 🤖 JARVIS - Configuração e Uso

## ⚙️ Configuração Necessária

### 1. Obter API Key do Google Gemini

1. Acesse: https://makersuite.google.com/app/apikey
2. Faça login com sua conta Google
3. Clique em "Create API Key"
4. Copie a API key gerada

### 2. Configurar no Supabase

**Opção A: Via Dashboard (Recomendado)**
1. Acesse: https://supabase.com/dashboard/project/ouqwbbermlzqqvtqwlul
2. Vá em: **Settings** → **Edge Functions** → **Secrets**
3. Clique em **Add new secret**
4. Nome: `GEMINI_API_KEY`
5. Valor: Cole sua API key do Gemini
6. Clique em **Save**

**Opção B: Via CLI**
```bash
supabase secrets set GEMINI_API_KEY=sua-api-key-aqui --project-ref ouqwbbermlzqqvtqwlul
```

### 3. Verificar Funcionamento

Após configurar, teste a Edge Function:

```bash
curl -X POST \
  https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/jarvis-chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus" \
  -d '{"message": "Olá JARVIS, me apresente a LA Music School"}'
```

Resposta esperada:
```json
{
  "reply": "Olá, senhor! A LA Music School é uma rede de escolas de música..."
}
```

## 🎤 Como Usar o JARVIS

### Modo 1: Wake Word (Recomendado)

**Ativação Direta:**
- Diga: **"Jarvis, qual a previsão do tempo?"**
- O JARVIS processa imediatamente

**Ativação em Dois Passos:**
1. Diga: **"Jarvis"**
2. JARVIS responde: "Sim, senhor?"
3. Fale seu comando
4. Aguarda até 10 segundos

### Modo 2: Manual

1. Clique no botão JARVIS (canto inferior direito)
2. Clique no microfone central
3. Fale seu comando

### Controles

- **⚡ Power** - Liga/desliga wake word
- **🔇 Mute** - Silencia respostas de voz
- **🗑️ Limpar** - Reseta histórico
- **❌ Fechar** - Minimiza (mantém wake word ativo)

## 🎯 Estados do JARVIS

| Estado | Cor | Descrição |
|--------|-----|-----------|
| **Sleeping** | Azul escuro | Ouvindo passivamente por "Jarvis" |
| **Idle** | Cyan | Pronto para receber comando |
| **Listening** | Cyan pulsante | Capturando sua fala |
| **Thinking** | Roxo | Processando com IA |
| **Speaking** | Verde | Respondendo em voz |

## 🐛 Troubleshooting

### "Erro 500" ao chamar JARVIS
- **Causa**: GEMINI_API_KEY não configurada
- **Solução**: Siga os passos de configuração acima

### Wake Word não funciona
- **Causa**: Navegador não suporta ou microfone bloqueado
- **Solução**: 
  - Use Chrome/Edge (melhor suporte)
  - Permita acesso ao microfone
  - Use modo manual como alternativa

### "Speech recognition error: aborted"
- **Causa**: Normal quando troca de estado
- **Solução**: Ignorar, já tratado automaticamente

### JARVIS não responde
- **Causa**: Timeout de 10 segundos
- **Solução**: Fale mais rápido ou reative dizendo "Jarvis"

## 📊 Dados Técnicos

- **Edge Function**: `jarvis-chat`
- **Modelo IA**: Google Gemini Pro
- **Idioma**: Português BR
- **Max tokens**: 500 por resposta
- **Temperature**: 0.7
- **Wake words**: jarvis, jarves, jarvi, jarbas, járvis

## 🔐 Segurança

- ✅ JWT verification **desabilitado** (acesso público)
- ✅ CORS habilitado
- ✅ API key armazenada como secret no Supabase
- ✅ Nunca exposta no frontend

## 📝 Exemplos de Comandos

- "Jarvis, quantas unidades a LA Music tem?"
- "Jarvis, qual o horário de funcionamento?"
- "Jarvis, me explique sobre os cursos"
- "Jarvis, como faço para matricular?"
- "Jarvis, qual a diferença entre as unidades?"

---

**Desenvolvido para LA Music School Performance Report 2025** 🎵
