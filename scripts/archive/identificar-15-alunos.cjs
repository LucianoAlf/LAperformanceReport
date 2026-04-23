/**
 * Identificar os 15 alunos que estão no CSV mas faltam na base
 */

const fs = require('fs');

const CSV_MATRICULAS = 'C:/Users/hugog/Downloads/matricula_cg.csv';
const ALUNOS_BASE_FILE = './alunos-base-cg.json';

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

// Carregar dados da base
function carregarDadosBase() {
  const content = fs.readFileSync(ALUNOS_BASE_FILE, 'utf-8');
  const startMarker = content.indexOf('[{');
  const endMarker = content.lastIndexOf('}]');
  const jsonContent = content.substring(startMarker, endMarker + 2);
  return JSON.parse(jsonContent);
}

console.log('🔍 IDENTIFICANDO OS 15 ALUNOS FALTANTES\n');

try {
  // Carregar alunos da base
  const alunosBase = carregarDadosBase();
  const nomesBase = new Set(alunosBase.map(a => normalizarNome(a.nome)));
  
  console.log(`✓ ${alunosBase.length} alunos na base carregados`);
  
  // Processar CSV
  const content = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(content);
  
  const alunosCSV = [];
  
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25 && values[3]) {
      const nome = values[3];
      const nomeNormalizado = normalizarNome(nome);
      
      if (!nomesBase.has(nomeNormalizado)) {
        alunosCSV.push({
          nome: nome,
          curso: values[2],
          professor: values[0],
          dataMatricula: values[1],
          telefone: values[16],
          email: values[15]
        });
      }
    }
  }
  
  console.log(`\n❌ ALUNOS FALTANDO NA BASE: ${alunosCSV.length}\n`);
  console.log('='.repeat(80));
  
  alunosCSV.forEach((a, i) => {
    console.log(`\n${i + 1}. ${a.nome}`);
    console.log(`   Curso: ${a.curso}`);
    console.log(`   Professor: ${a.professor}`);
    console.log(`   Data Matrícula: ${a.dataMatricula}`);
    console.log(`   Telefone: ${a.telefone || 'N/A'}`);
    console.log(`   Email: ${a.email || 'N/A'}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Total: ${alunosCSV.length} alunos faltantes`);
  
  // Salvar lista em arquivo
  fs.writeFileSync('./alunos-faltantes-cg.json', JSON.stringify(alunosCSV, null, 2));
  console.log('\n✅ Lista salva em: alunos-faltantes-cg.json');
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  console.error(error.stack);
}
