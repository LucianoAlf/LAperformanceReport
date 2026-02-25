/**
 * Identificar os 15 alunos faltantes - comparação CSV vs Base
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

// Carregar dados da base do arquivo MCP
function carregarDadosBase() {
  let content = fs.readFileSync(ALUNOS_BASE_FILE, 'utf-8');
  
  // O arquivo tem o formato: "Below is...\n\n<untrusted-data>\n[{...}]\n</untrusted-data>"
  // Precisamos extrair apenas o array JSON
  
  // Tentar encontrar o array JSON entre os marcadores
  const dataMatch = content.match(/<untrusted-data-[a-f0-9-]+>\s*([\s\S]*?)\s*<\/untrusted-data-[a-f0-9-]+>/);
  
  if (dataMatch) {
    const jsonContent = dataMatch[1].trim();
    try {
      const alunos = JSON.parse(jsonContent);
      return alunos;
    } catch (e) {
      console.error('Erro ao parsear JSON extraído:', e.message);
    }
  }
  
  // Fallback: tentar encontrar o array diretamente
  const arrayMatch = content.match(/(\[\{[\s\S]*?\}\])/);
  if (arrayMatch) {
    try {
      const alunos = JSON.parse(arrayMatch[1]);
      return alunos;
    } catch (e) {
      console.error('Erro ao parsear JSON do fallback:', e.message);
    }
  }
  
  console.error('❌ Não foi possível extrair JSON do arquivo');
  return [];
}

console.log('🔍 IDENTIFICANDO OS 15 ALUNOS FALTANTES\n');
console.log('='.repeat(80));

try {
  // Carregar alunos da base
  const alunosBase = carregarDadosBase();
  
  if (alunosBase.length === 0) {
    console.error('❌ Não foi possível carregar dados da base');
    process.exit(1);
  }
  
  // Criar Set de nomes normalizados da base
  const nomesBase = new Set();
  const nomesBaseOriginal = {};
  
  alunosBase.forEach(a => {
    const nomeNormalizado = normalizarNome(a.nome);
    nomesBase.add(nomeNormalizado);
    nomesBaseOriginal[nomeNormalizado] = a.nome;
  });
  
  console.log(`✓ ${alunosBase.length} registros na base`);
  console.log(`✓ ${nomesBase.size} alunos únicos na base\n`);
  
  // Processar CSV
  const content = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(content);
  
  const alunosFaltantes = [];
  let totalCSV = 0;
  const alunosCSVSet = new Set();
  
  // Processar a partir da linha 2 (pular cabeçalho)
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25 && values[3]) {
      totalCSV++;
      const nome = values[3];
      const nomeNormalizado = normalizarNome(nome);
      
      alunosCSVSet.add(nomeNormalizado);
      
      // Se não existe na base, é faltante
      if (!nomesBase.has(nomeNormalizado)) {
        alunosFaltantes.push({
          nome: nome,
          nomeNormalizado: nomeNormalizado,
          curso: values[2],
          professor: values[0],
          dataMatricula: values[1],
          telefone: values[16] || '',
          email: values[15] || ''
        });
      }
    }
  }
  
  console.log(`📊 RESUMO DA COMPARAÇÃO:`);
  console.log(`   Total CSV: ${totalCSV} matrículas`);
  console.log(`   Alunos únicos CSV: ${alunosCSVSet.size}`);
  console.log(`   Alunos únicos Base: ${nomesBase.size}`);
  console.log(`   Alunos faltantes: ${alunosFaltantes.length}\n`);
  
  if (alunosFaltantes.length > 0) {
    console.log('❌ ALUNOS QUE ESTÃO NO CSV MAS FALTAM NA BASE:\n');
    console.log('-'.repeat(80));
    
    alunosFaltantes.forEach((a, i) => {
      console.log(`\n${String(i + 1).padStart(2, '0')}. ${a.nome}`);
      console.log(`    Curso: ${a.curso}`);
      console.log(`    Professor: ${a.professor}`);
      console.log(`    Data Matrícula: ${a.dataMatricula}`);
      if (a.telefone) console.log(`    Telefone: ${a.telefone}`);
      if (a.email) console.log(`    Email: ${a.email}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📋 Total de alunos faltantes: ${alunosFaltantes.length}`);
    
    // Salvar lista
    fs.writeFileSync('./lista-15-alunos-faltantes.json', JSON.stringify(alunosFaltantes, null, 2));
    console.log(`\n💾 Lista salva em: lista-15-alunos-faltantes.json`);
  } else {
    console.log('\n✅ Nenhum aluno faltante encontrado!');
  }
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  console.error(error.stack);
  process.exit(1);
}
