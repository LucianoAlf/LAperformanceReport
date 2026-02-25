/**
 * Verificar quantos alunos realmente existem no CSV de matrículas
 * E comparar com a base
 */

const fs = require('fs');

const CSV_MATRICULAS = 'C:/Users/hugog/Downloads/matricula_cg.csv';

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

console.log('🔍 ANÁLISE DO CSV DE MATRÍCULAS\n');

try {
  const content = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(content);
  
  console.log(`📊 Total de linhas no arquivo: ${lines.length}`);
  
  let totalRegistros = 0;
  const alunosMap = new Map();
  const statusCount = {};
  
  // Processar a partir da linha 2 (cabeçalho)
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25 && values[3]) { // Tem nome do aluno
      totalRegistros++;
      
      const nome = values[3];
      const curso = values[2];
      const professor = values[0];
      const status = values[18] || 'Em Andamento'; // Motivo da Interrupção
      
      // Contar status
      statusCount[status] = (statusCount[status] || 0) + 1;
      
      // Agrupar por aluno
      const key = normalizarNome(nome);
      if (!alunosMap.has(key)) {
        alunosMap.set(key, {
          nome: nome,
          matriculas: []
        });
      }
      alunosMap.get(key).matriculas.push({ curso, professor, status });
    }
  }
  
  console.log(`\n📈 ESTATÍSTICAS DO CSV:`);
  console.log(`   Total de registros: ${totalRegistros}`);
  console.log(`   Alunos únicos: ${alunosMap.size}`);
  
  console.log(`\n📋 DISTRIBUIÇÃO POR STATUS:`);
  for (const [status, count] of Object.entries(statusCount)) {
    console.log(`   ${status || '(vazio)'}: ${count}`);
  }
  
  // Contar alunos com múltiplas matrículas
  let multiplasMatriculas = 0;
  const alunosComMultiplas = [];
  
  alunosMap.forEach((aluno, key) => {
    if (aluno.matriculas.length > 1) {
      multiplasMatriculas++;
      alunosComMultiplas.push({
        nome: aluno.nome,
        quantidade: aluno.matriculas.length,
        cursos: aluno.matriculas.map(m => m.curso)
      });
    }
  });
  
  console.log(`\n👥 ALUNOS COM MÚLTIPLAS MATRÍCULAS: ${multiplasMatriculas}`);
  
  if (alunosComMultiplas.length > 0) {
    console.log(`\n   Lista (primeiros 10):`);
    alunosComMultiplas.slice(0, 10).forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.nome} (${a.quantidade} cursos)`);
      a.cursos.forEach((c, j) => console.log(`      ${j + 1}. ${c}`));
    });
  }
  
  // COMPARAÇÃO COM A BASE
  console.log(`\n\n🔍 COMPARAÇÃO COM A BASE DE DADOS:`);
  console.log(`   CSV (Emusys): ${alunosMap.size} alunos únicos`);
  console.log(`   Base de dados: 462 alunos únicos`);
  console.log(`   Diferença: ${462 - alunosMap.size} alunos`);
  
  if (alunosMap.size < 462) {
    console.log(`\n   ⚠️ O CSV tem ${462 - alunosMap.size} alunos A MENOS que a base!`);
  }
  
} catch (error) {
  console.error('❌ Erro:', error.message);
}
