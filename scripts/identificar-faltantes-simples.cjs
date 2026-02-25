/**
 * Identificar alunos faltantes - usando regex direto no arquivo
 */

const fs = require('fs');

const CSV_MATRICULAS = 'C:/Users/hugog/Downloads/matricula_cg.csv';
const ALUNOS_BASE_FILE = './alunos-base-completo.json';

// Parse CSV
function parseCSV(content) {
  const lines = content.split('\n');
  const result = [];
  let currentRow = '';
  let inQuotes = false;
  
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      }
      currentRow += char;
    }
    
    if (!inQuotes) {
      if (currentRow.trim()) {
        result.push(currentRow);
      }
      currentRow = '';
    } else {
      currentRow += '\n';
    }
  }
  
  return result;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values.map(v => v.replace(/^"|"$/g, '').trim());
}

function normalizarNome(nome) {
  if (!nome) return '';
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log('🔍 IDENTIFICANDO ALUNOS FALTANTES\n');

try {
  // Extrair nomes da base - abordagem simples
  const baseContent = fs.readFileSync(ALUNOS_BASE_FILE, 'utf-8');
  
  // Encontrar todos os nomes no arquivo da base usando regex
  // Padrão: "nome":"Nome do Aluno"
  const nomeMatches = baseContent.match(/"nome":"([^"]+)"/g);
  
  if (!nomeMatches) {
    console.error('❌ Não encontrou nomes na base');
    process.exit(1);
  }
  
  // Extrair nomes e normalizar
  const nomesBase = new Set();
  const nomesOriginais = {};
  
  nomeMatches.forEach(match => {
    const nome = match.replace(/"nome":"/, '').replace(/"$/, '');
    const normalizado = normalizarNome(nome);
    nomesBase.add(normalizado);
    nomesOriginais[normalizado] = nome;
  });
  
  console.log(`✓ ${nomesBase.size} nomes únicos na base\n`);
  
  // Processar CSV
  const csvContent = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(csvContent);
  
  const faltantes = [];
  const encontrados = [];
  
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25 && values[3]) {
      const nome = values[3];
      const nomeNormalizado = normalizarNome(nome);
      
      if (!nomesBase.has(nomeNormalizado)) {
        faltantes.push({
          nome: nome,
          curso: values[2],
          professor: values[0],
          dataMatricula: values[1]
        });
      } else {
        encontrados.push(nome);
      }
    }
  }
  
  console.log('='.repeat(80));
  console.log('❌ ALUNOS FALTANDO NA BASE:\n');
  console.log(`Total: ${faltantes.length} alunos\n`);
  
  if (faltantes.length > 0) {
    faltantes.forEach((a, i) => {
      console.log(`${String(i + 1).padStart(2, '0')}. ${a.nome}`);
      console.log(`    Curso: ${a.curso}`);
      console.log(`    Professor: ${a.professor}`);
      console.log(`    Data Matrícula: ${a.dataMatricula}\n`);
    });
    
    // Salvar lista
    fs.writeFileSync('./alunos-faltantes.json', JSON.stringify(faltantes, null, 2));
    console.log('💾 Lista salva em: alunos-faltantes.json');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Resumo:`);
  console.log(`   Alunos no CSV: ${faltantes.length + encontrados.length}`);
  console.log(`   Na base: ${encontrados.length}`);
  console.log(`   Faltantes: ${faltantes.length}`);
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  console.error(error.stack);
}
