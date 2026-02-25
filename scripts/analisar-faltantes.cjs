/**
 * Análise Completa de Alunos Faltantes - Campo Grande
 * Compara CSV do Emusys com dados reais da base
 */

const fs = require('fs');

const CSV_MATRICULAS = 'C:/Users/hugog/Downloads/matricula_cg.csv';
const ALUNOS_BASE_FILE = './alunos-base-cg.json';

// Parse CSV com campos multiline
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

// Normalizar nome para comparação
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

// Carregar dados da base do arquivo JSON
function carregarDadosBase() {
  console.log('📂 Carregando dados da base...\n');
  
  const content = fs.readFileSync(ALUNOS_BASE_FILE, 'utf-8');
  
  // Extrair o array JSON - procurar pelo conteúdo entre os marcadores
  const startMarker = content.indexOf('[{');
  const endMarker = content.lastIndexOf('}]');
  
  if (startMarker === -1 || endMarker === -1) {
    console.error('❌ Não foi possível encontrar array JSON no arquivo');
    return [];
  }
  
  const jsonContent = content.substring(startMarker, endMarker + 2);
  
  try {
    const alunos = JSON.parse(jsonContent);
    console.log(`✓ ${alunos.length} alunos carregados da base`);
    return alunos;
  } catch (e) {
    console.error('❌ Erro ao parsear JSON:', e.message);
    return [];
  }
}

// Processar CSV de Matrículas
function processarMatriculas() {
  console.log('\n📊 Processando CSV de Matrículas...\n');
  
  const content = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(content);
  
  const matriculas = [];
  
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25) {
      const matricula = {
        professor: values[0] || '',
        dataMatricula: values[1] || '',
        curso: values[2] || '',
        aluno: values[3] || '',
        idade: values[4] || '',
        responsavel: values[6] || '',
        email: values[15] || '',
        telefone: values[16] || '',
        motivoInterrupcao: values[18] || '',
        mensalidade: values[14] || '',
        diaSemana: values[23] || '',
        horario: values[24] || '',
        modalidade: values[22] || '',
        nomeNormalizado: normalizarNome(values[3])
      };
      
      if (matricula.aluno && matricula.curso) {
        matriculas.push(matricula);
      }
    }
  }
  
  // Agrupar por aluno
  const alunosMap = new Map();
  matriculas.forEach(m => {
    const key = m.nomeNormalizado;
    if (!alunosMap.has(key)) {
      alunosMap.set(key, {
        nome: m.aluno,
        nomeNormalizado: key,
        matriculas: []
      });
    }
    alunosMap.get(key).matriculas.push(m);
  });
  
  console.log(`✓ ${matriculas.length} matrículas processadas`);
  console.log(`✓ ${alunosMap.size} alunos únicos no CSV`);
  
  return { matriculas, alunosMap };
}

// Comparar CSV com base
function compararDados(alunosMap, alunosBase) {
  console.log('\n🔍 Comparando dados...\n');
  
  // Criar Set de nomes da base (normalizados)
  const nomesBase = new Set(alunosBase.map(a => normalizarNome(a.nome)));
  
  // Verificar cada aluno do CSV
  const faltantes = [];
  const encontrados = [];
  const segundosCursos = [];
  
  alunosMap.forEach((aluno, key) => {
    if (!nomesBase.has(key)) {
      faltantes.push(aluno);
    } else {
      encontrados.push(aluno);
      
      // Verificar se tem múltiplas matrículas (possível segundo curso)
      if (aluno.matriculas.length > 1) {
        const alunoBase = alunosBase.filter(b => normalizarNome(b.nome) === key);
        // Se tem mais matrículas no CSV do que na base
        if (aluno.matriculas.length > alunoBase.length) {
          segundosCursos.push({
            nome: aluno.nome,
            matriculasCSV: aluno.matriculas,
            quantidadeBase: alunoBase.length
          });
        }
      }
    }
  });
  
  return { faltantes, encontrados, segundosCursos, totalCSV: alunosMap.size };
}

// Gerar relatório completo
function gerarRelatorio(resultado, alunosBase) {
  const { faltantes, segundosCursos, totalCSV } = resultado;
  
  const relatorio = {
    data: new Date().toISOString(),
    resumo: {
      totalCSV: totalCSV,
      totalBase: alunosBase.length,
      faltantes: faltantes.length,
      segundosCursos: segundosCursos.length
    },
    faltantes: faltantes,
    segundosCursos: segundosCursos
  };
  
  // Salvar relatório em JSON
  fs.writeFileSync('./relatorio-faltantes-cg.json', JSON.stringify(relatorio, null, 2));
  
  // Imprimir resumo
  console.log('\n' + '='.repeat(70));
  console.log('📋 RELATÓRIO DE ALUNOS/MATRÍCULAS FALTANTES');
  console.log('='.repeat(70));
  
  console.log(`\n📊 RESUMO:`);
  console.log(`  • Alunos no CSV: ${totalCSV}`);
  console.log(`  • Alunos na base: ${alunosBase.length}`);
  console.log(`  • Alunos faltando: ${faltantes.length}`);
  console.log(`  • Possíveis segundos cursos: ${segundosCursos.length}`);
  
  if (faltantes.length > 0) {
    console.log(`\n❌ ALUNOS COMPLETAMENTE FALTANDO (${faltantes.length}):\n`);
    faltantes.forEach((a, i) => {
      console.log(`${i + 1}. ${a.nome}`);
      a.matriculas.forEach((m, j) => {
        console.log(`   Curso: ${m.curso}`);
        console.log(`   Professor: ${m.professor}`);
      });
    });
  }
  
  if (segundosCursos.length > 0) {
    console.log(`\n⚠️  POSSÍVEIS SEGUNDOS CURSOS (${segundosCursos.length}):\n`);
    segundosCursos.forEach((s, i) => {
      console.log(`${i + 1}. ${s.nome}`);
      console.log(`   Matrículas no CSV: ${s.matriculasCSV.length}`);
      console.log(`   Matrículas na base: ${s.quantidadeBase}`);
      s.matriculasCSV.forEach((m, j) => {
        console.log(`   ${j + 1}. ${m.curso}`);
      });
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Relatório salvo em: relatorio-faltantes-cg.json');
}

// Executar
console.log('🔍 ANÁLISE DE ALUNOS FALTANTES - CAMPO GRANDE\n');

try {
  const alunosBase = carregarDadosBase();
  
  if (alunosBase.length === 0) {
    console.error('❌ Não foi possível carregar dados da base');
    process.exit(1);
  }
  
  const { alunosMap } = processarMatriculas();
  const resultado = compararDados(alunosMap, alunosBase);
  gerarRelatorio(resultado, alunosBase);
  
} catch (error) {
  console.error('❌ Erro:', error);
  process.exit(1);
}
