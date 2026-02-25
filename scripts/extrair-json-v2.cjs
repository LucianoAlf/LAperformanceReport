/**
 * Extrair JSON do arquivo MCP - formato especial
 */

const fs = require('fs');

const inputFile = './alunos-base-completo.json';
const outputFile = './alunos-base-puro.json';

console.log('🔧 Extraindo JSON...\n');

try {
  // Ler como string crua
  let content = fs.readFileSync(inputFile, 'utf-8');
  
  // O arquivo tem tudo em uma linha com escaping
  // Formato: "Below is...\n\n<untrusted-data>\n[{...}]\n</untrusted-data>"
  
  // Remover a primeira e última aspas se existirem
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }
  
  // Substituir \n por newlines reais
  content = content.replace(/\\n/g, '\n');
  
  // Agora procurar pelo array JSON
  const lines = content.split('\n');
  let jsonArray = '';
  let capturing = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('[{')) {
      capturing = true;
      jsonArray = trimmed;
    } else if (capturing && trimmed.endsWith('}]')) {
      jsonArray += trimmed;
      capturing = false;
      break;
    } else if (capturing) {
      jsonArray += trimmed;
    }
  }
  
  if (!jsonArray) {
    // Tentar extrair diretamente do conteúdo
    const match = content.match(/(\[\{[\s\S]*telefone[\s\S]*?\}\])/);
    if (match) {
      jsonArray = match[1];
    }
  }
  
  if (!jsonArray) {
    console.error('❌ Não encontrou array JSON');
    process.exit(1);
  }
  
  console.log(`✓ Array JSON encontrado (${jsonArray.length} caracteres)`);
  
  // Parsear
  const alunos = JSON.parse(jsonArray);
  console.log(`✓ Parseado com sucesso: ${alunos.length} alunos`);
  
  // Salvar
  fs.writeFileSync(outputFile, JSON.stringify(alunos, null, 2), 'utf-8');
  console.log(`✓ Salvo em: ${outputFile}`);
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
