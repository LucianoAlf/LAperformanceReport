#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Script de teste isolado para a Mila no branch Supabase
 * Simula um webhook da UAZAPI e testa o fluxo completo
 * Uso: deno run --allow-net --allow-env test-mila-branch.ts
 */

const BRANCH_URL = 'https://dwkyjxilicecwzskfhgl.supabase.co';
const WEBHOOK_URL = `${BRANCH_URL}/functions/v1/webhook-whatsapp-inbox`;

// Simular payload UAZAPI com uma mensagem de teste
const testPayload = {
  key: {
    remoteJid: '5521999999999@s.whatsapp.net',
    id: `test-msg-${Date.now()}`,
    fromMe: false,
  },
  message: {
    conversation: 'Oi, tudo bem? Quero saber sobre aulas de violão',
  },
  pushName: 'Teste User',
  timestamp: Math.floor(Date.now() / 1000),
};

console.log('🧪 Testando Mila no branch isolado...\n');
console.log('📤 Enviando payload para webhook:');
console.log(JSON.stringify(testPayload, null, 2));
console.log(`\n🔗 URL: ${WEBHOOK_URL}\n`);

try {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testPayload),
  });

  const data = await response.json();

  console.log(`✅ Status: ${response.status}`);
  console.log('📥 Resposta do webhook:');
  console.log(JSON.stringify(data, null, 2));

  if (response.ok) {
    console.log('\n✨ Webhook processou com sucesso!');
    console.log('Próximos passos:');
    console.log('1. Verifique os logs do Supabase: https://supabase.com/dashboard/project/dwkyjxilicecwzskfhgl/logs');
    console.log('2. Verifique se o lead foi criado: SELECT * FROM leads WHERE whatsapp = \'5521999999999\'');
    console.log('3. Verifique se a conversa foi criada: SELECT * FROM crm_conversas');
    console.log('4. Verifique se a mensagem foi inserida: SELECT * FROM crm_mensagens');
    console.log('5. Verifique se a Mila respondeu: SELECT * FROM crm_mensagens WHERE remetente = \'mila\'');
  } else {
    console.log('\n❌ Erro no webhook!');
  }
} catch (error) {
  console.error('❌ Erro ao chamar webhook:', error.message);
  console.log('\nVerifique:');
  console.log('1. A URL do webhook está correta?');
  console.log('2. O branch Supabase está ativo?');
  console.log('3. As Edge Functions foram deployadas?');
}
