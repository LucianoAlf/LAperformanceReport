/**
 * Extrair JSON do arquivo MCP e salvar puro
 */

const fs = require('fs');

const inputFile = './alunos-base-completo.json';
const outputFile = './alunos-base-puro.json';

console.log('🔧 Extraindo JSON do arquivo MCP...\n');

try {
  const content = fs.readFileSync(inputFile, 'utf-8');
  
  // O arquivo MCP tem formato especial com escaped characters
  // Vamos encontrar o array JSON diretamente
  
  // Procurar pelo padrão: <untrusted-data-xxx>\n[...]\n</untrusted-data-xxx>
  const dataMatch = content.match(/<untrusted-data-[a-f0-9-]+>\n?([\s\S]*?)\n?<\/untrusted-data-[a-f0-9-]+>/);
  
  if (!dataMatch) {
    console.error('❌ Não encontrou marcadores untrusted-data');
    
    // Tentar outro approach - procurar por [{...}]
    const arrayMatch = content.match(/\[\{[\s\S]*telefone[\s\S]*\}\]/);
    if (arrayMatch) {
      console.log('✓ Encontrado array JSON alternativo');
      fs.writeFileSync(outputFile, arrayMatch[0], 'utf-8');
      console.log(`✓ Salvo em: ${outputFile}`);
      process.exit(0);
    }
    
    console.error('❌ Também não encontrou array JSON direto');
    process.exit(1);
  }
  
  let jsonContent = dataMatch[1].trim();
  
  // Se o conteúdo estiver escapado (com \" em vez de "), precisamos tratar
  if (jsonContent.startsWith('\\"') || jsonContent.includes('\\"Below is')) {
    console.log('Detectado formato com escaping, tentando limpar...');
    // Remover os escapes
    jsonContent = jsonContent.replace(/\\"/g, '"');
  }
  
  // Tentar parsear
  try {
    const alunos = JSON.parse(jsonContent);
    console.log(`✓ JSON parseado com sucesso: ${alunos.length} alunos`);
    
    // Salvar puro
    fs.writeFileSync(outputFile, JSON.stringify(alunos, null, 2), 'utf-8');
    console.log(`✓ Salvo em: ${outputFile}`);
  } catch (e) {
    console.error('❌ Erro ao parsear:', e.message);
    console.log('\nPrimeiros 200 caracteres do conteúdo:');
    console.log(jsonContent.substring(0, 200));
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
