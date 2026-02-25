/**
 * Extrair JSON usando abordagem de índices diretos
 */

const fs = require('fs');

const inputFile = './alunos-base-completo.json';
const outputFile = './alunos-base-puro.json';

console.log('🔧 Extraindo JSON...\n');

try {
  let content = fs.readFileSync(inputFile, 'utf-8');
  
  // Remover aspas externas se existirem
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }
  
  // Converter \n em novas linhas reais
  content = content.replace(/\\n/g, '\n');
  
  console.log('Procurando por JSON array...');
  
  // Encontrar o início do array: [
  const startIdx = content.indexOf('[{"nome"');
  if (startIdx === -1) {
    console.error('❌ Não encontrou início do array');
    process.exit(1);
  }
  
  // Encontrar o final do array: }]</untrusted-data
  const endIdx = content.indexOf('}]</untrusted-data');
  if (endIdx === -1) {
    console.error('❌ Não encontrou fim do array');
    process.exit(1);
  }
  
  // Extrair array JSON (incluindo os ]})
  const jsonContent = content.substring(startIdx, endIdx + 2);
  
  console.log(`✓ Encontrado: ${jsonContent.length} caracteres`);
  console.log('Primeiros 100 caracteres:', jsonContent.substring(0, 100));
  
  // Parsear
  const alunos = JSON.parse(jsonContent);
  console.log(`\n✓ Parseado com sucesso: ${alunos.length} alunos`);
  
  // Salvar
  fs.writeFileSync(outputFile, JSON.stringify(alunos, null, 2), 'utf-8');
  console.log(`✓ Salvo em: ${outputFile}`);
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
