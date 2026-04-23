/**
 * Análise de Alunos/Matrículas Faltantes - Campo Grande
 * Compara CSV de Matrículas com dados reais da base
 */

const fs = require('fs');

const CSV_MATRICULAS = 'C:/Users/hugog/Downloads/matricula_cg.csv';

// Dados reais da base (obtidos via SQL)
const alunosBase = [
  {"nome":"Adriana Christine da Silva","data_nascimento":"2012-08-01","curso_id":14,"professor_atual_id":28,"status":"ativo"},{"nome":"Adriana Mesquita dos Santos Vilas Boas","data_nascimento":"1972-02-16","curso_id":16,"professor_atual_id":34,"status":"ativo"},{"nome":"Adriana Vitor Pim","data_nascimento":"1972-01-19","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Ágatha Da Silva De Souza","data_nascimento":"2007-07-24","curso_id":18,"professor_atual_id":33,"status":"ativo"},{"nome":"Águedha Silva Furtado","data_nascimento":"2012-03-02","curso_id":14,"professor_atual_id":40,"status":"ativo"},{"nome":"Ailla Goulart Caldeira","data_nascimento":"2006-08-23","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Alexandre Ayres Filho","data_nascimento":"2013-08-31","curso_id":16,"professor_atual_id":34,"status":"ativo"},{"nome":"Alexandre Ribeiro de Oliveira","data_nascimento":"1997-08-26","curso_id":27,"professor_atual_id":37,"status":"ativo"},{"nome":"Alexandre Wallace Bispo Oliveira","data_nascimento":"2000-05-12","curso_id":14,"professor_atual_id":28,"status":"ativo"},{"nome":"Alice Cardoso de Farias","data_nascimento":"2014-05-09","curso_id":6,"professor_atual_id":25,"status":"ativo"},{"nome":"Alice Castro Figueiredo","data_nascimento":"2017-04-29","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Alice dos Anjos Nogueira","data_nascimento":"2017-06-01","curso_id":6,"professor_atual_id":8,"status":"ativo"},{"nome":"Alice Marques Migone Maestri","data_nascimento":"2012-02-13","curso_id":null,"professor_atual_id":36,"status":"ativo"},{"nome":"Alice Rodrigues de Santana","data_nascimento":"2020-09-29","curso_id":4,"professor_atual_id":30,"status":"ativo"},{"nome":"Alice Roza Baltar","data_nascimento":"2017-06-07","curso_id":6,"professor_atual_id":20,"status":"ativo"},{"nome":"Alice Sales da Cunha Mattos","data_nascimento":"2013-02-12","curso_id":27,"professor_atual_id":14,"status":"ativo"},{"nome":"Alice Serra de Souza Rangel Soares","data_nascimento":"2018-09-13","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Alice Viana de Carvalho","data_nascimento":"2010-02-24","curso_id":18,"professor_atual_id":19,"status":"aviso_previo"},{"nome":"Alicia Castro Santiago Gonzaga","data_nascimento":"2015-05-11","curso_id":16,"professor_atual_id":30,"status":"ativo"},{"nome":"Amanda de Souza Rogemonte","data_nascimento":"2010-04-07","curso_id":6,"professor_atual_id":8,"status":"ativo"},{"nome":"Amanda Sales Borges dos Reis","data_nascimento":"2012-06-04","curso_id":14,"professor_atual_id":35,"status":"ativo"},{"nome":"Ana Beatriz Da Conceição Pereira","data_nascimento":"2007-11-28","curso_id":6,"professor_atual_id":8,"status":"ativo"},{"nome":"Ana Clara Lima Santos Pinto","data_nascimento":"2015-11-25","curso_id":6,"professor_atual_id":8,"status":"ativo"},{"nome":"Ana Clara Teixeira Nogueira","data_nascimento":"2013-01-21","curso_id":14,"professor_atual_id":35,"status":"ativo"},{"nome":"Ana Mel Henrique da Silva","data_nascimento":"2014-10-26","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Ana Victoria Padiglione Rosa","data_nascimento":"2011-01-25","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Anderson Cherem de Mello","data_nascimento":"1979-07-19","curso_id":6,"professor_atual_id":3,"status":"ativo"},{"nome":"André Luiz Rodrigues Marques","data_nascimento":"1987-05-30","curso_id":27,"professor_atual_id":14,"status":"ativo"},{"nome":"André Vitor Soares da Silva","data_nascimento":"2009-05-31","curso_id":12,"professor_atual_id":13,"status":"ativo"},{"nome":"Andréa Sales Borges dos Reis","data_nascimento":"1976-08-05","curso_id":14,"professor_atual_id":35,"status":"ativo"},{"nome":"Andressa Dávila de Canha Pontes","data_nascimento":"1997-06-11","curso_id":6,"professor_atual_id":43,"status":"ativo"},{"nome":"Andressa Gabriele Lourenço Vasconcelos de Souza","data_nascimento":"1991-03-07","curso_id":6,"professor_atual_id":8,"status":"aviso_previo"},{"nome":"Anna Clara Ferreira Brito","data_nascimento":"2018-10-11","curso_id":4,"professor_atual_id":25,"status":"ativo"},{"nome":"Anna Klara de Abreu Coutinho","data_nascimento":"2013-11-04","curso_id":6,"professor_atual_id":20,"status":"ativo"},{"nome":"Anne Krissya Cordeiro da Silva Noé","data_nascimento":"1995-01-03","curso_id":18,"professor_atual_id":34,"status":"ativo"},{"nome":"Anne Krissya Cordeiro da Silva Noé","data_nascimento":"1995-01-03","curso_id":6,"professor_atual_id":3,"status":"ativo"},{"nome":"Anthony de Andrade Vasques","data_nascimento":"2021-01-27","curso_id":4,"professor_atual_id":18,"status":"ativo"},{"nome":"Antonia Scudio Guidi da Rocha","data_nascimento":"2014-10-01","curso_id":14,"professor_atual_id":30,"status":"ativo"},{"nome":"Antonia Simone Lima Alves","data_nascimento":"1986-12-14","curso_id":6,"professor_atual_id":8,"status":"ativo"},{"nome":"Antônio Carlos Romero Andrade","data_nascimento":"2019-05-06","curso_id":27,"professor_atual_id":31,"status":"ativo"},{"nome":"Antônio José da Silva Delgado","data_nascimento":"2008-10-20","curso_id":16,"professor_atual_id":42,"status":"ativo"},{"nome":"Antonio Thales da Silva Maria","data_nascimento":"2012-02-22","curso_id":27,"professor_atual_id":31,"status":"ativo"},{"nome":"Antônio Villa Barros","data_nascimento":"2014-11-14","curso_id":6,"professor_atual_id":27,"status":"ativo"},{"nome":"Antônio Villa Barros","data_nascimento":"2014-11-14","curso_id":14,"professor_atual_id":36,"status":"ativo"},{"nome":"Arthur Da Hora Marinho","data_nascimento":"2015-10-09","curso_id":27,"professor_atual_id":2,"status":"ativo"},{"nome":"Arthur De Jesus Lindo Braga","data_nascimento":"2015-03-21","curso_id":4,"professor_atual_id":2,"status":"ativo"},{"nome":"Arthur Ennes Sarto Amorim","data_nascimento":"2019-10-17","curso_id":4,"professor_atual_id":42,"status":"ativo"},{"nome":"Arthur Felipe de Mattos","data_nascimento":"2017-02-08","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Arthur Gabriel de Lima Cardoso","data_nascimento":"2015-03-13","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Arthur Lee Cardozo Dias","data_nascimento":"2023-07-14","curso_id":4,"professor_atual_id":2,"status":"ativo"},{"nome":"Arthur Martins de Oliveira","data_nascimento":"2023-03-14","curso_id":null,"professor_atual_id":30,"status":"ativo"},{"nome":"Arthur Rocha de Almeida","data_nascimento":"2015-12-16","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Arthur Serpa Arcoverde","data_nascimento":"2018-06-20","curso_id":27,"professor_atual_id":37,"status":"ativo"},{"nome":"Arthur Souza Del Bosco","data_nascimento":"2021-01-05","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Aurora Paixão da Costa Buarque","data_nascimento":"2024-07-01","curso_id":null,"professor_atual_id":30,"status":"ativo"},{"nome":"Ayres Nishio Da Silva Junior","data_nascimento":"1992-09-04","curso_id":14,"professor_atual_id":35,"status":"ativo"},{"nome":"Barbara Ribeiro Alves","data_nascimento":"2001-10-17","curso_id":14,"professor_atual_id":35,"status":"ativo"},{"nome":"Beatriz Arruda de Azevedo","data_nascimento":"2015-03-24","curso_id":16,"professor_atual_id":33,"status":"ativo"},{"nome":"Beatriz Azevedo Teixeira Frossard","data_nascimento":"1992-05-04","curso_id":6,"professor_atual_id":3,"status":"ativo"},{"nome":"Beatriz Cardoso Schmitz","data_nascimento":"2012-07-22","curso_id":6,"professor_atual_id":27,"status":"ativo"},{"nome":"Beatriz Rodrigues de Sá","data_nascimento":"2025-05-06","curso_id":2,"professor_atual_id":18,"status":"ativo"},{"nome":"Beatriz Souza","data_nascimento":"1991-04-06","curso_id":27,"professor_atual_id":14,"status":"ativo"},{"nome":"Bella da Silva Lins","data_nascimento":"2021-07-20","curso_id":4,"professor_atual_id":25,"status":"ativo"},{"nome":"Benício Benjamim de Jesus Filgueiras","data_nascimento":"2015-01-22","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Benício de Souza Amaral Costa","data_nascimento":"2019-09-16","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Benjamim Soares Vieira","data_nascimento":"2015-12-14","curso_id":16,"professor_atual_id":15,"status":"ativo"},{"nome":"Benjamin da Silva Barbosa","data_nascimento":"2019-02-06","curso_id":18,"professor_atual_id":15,"status":"ativo"},{"nome":"Bento Cabral do Nascimento","data_nascimento":"2015-03-04","curso_id":27,"professor_atual_id":2,"status":"ativo"},{"nome":"Bernardo Ferreira Bittencourt","data_nascimento":"2020-07-21","curso_id":27,"professor_atual_id":7,"status":"ativo"},{"nome":"Bernardo Xavier Veras Mascarenhas de Castro","data_nascimento":"2013-03-01","curso_id":27,"professor_atual_id":37,"status":"ativo"},{"nome":"Brenda Pereira Dias","data_nascimento":"2013-06-12","curso_id":6,"professor_atual_id":20,"status":"ativo"}
];

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

// Processar CSV de Matrículas
function processarMatriculas() {
  console.log('📊 Processando CSV de Matrículas...\n');
  
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
  
  console.log(`✓ Total de matrículas: ${matriculas.length}`);
  console.log(`✓ Alunos únicos: ${alunosMap.size}`);
  
  return { matriculas, alunosMap };
}

// Comparar CSV com base
function compararDados(alunosMap) {
  console.log('\n🔍 Comparando com base de dados...\n');
  
  // Criar Set de nomes da base (normalizados)
  const nomesBase = new Set(alunosBase.map(a => normalizarNome(a.nome)));
  
  // Verificar cada aluno do CSV
  const faltantes = [];
  const encontrados = [];
  
  alunosMap.forEach((aluno, key) => {
    if (!nomesBase.has(key)) {
      faltantes.push(aluno);
    } else {
      encontrados.push(aluno);
    }
  });
  
  return { faltantes, encontrados, totalCSV: alunosMap.size };
}

// Gerar relatório
function gerarRelatorio(resultado) {
  const { faltantes, encontrados, totalCSV } = resultado;
  
  console.log('\n' + '='.repeat(70));
  console.log('📋 RELATÓRIO DE ALUNOS FALTANTES - CAMPO GRANDE');
  console.log('='.repeat(70));
  
  console.log(`\n📊 RESUMO:`);
  console.log(`  • Total no CSV: ${totalCSV} alunos`);
  console.log(`  • Na base: ${alunosBase.length} alunos`);
  console.log(`  • Encontrados: ${encontrados.length}`);
  console.log(`  • FALTANDO: ${faltantes.length}`);
  
  if (faltantes.length === 0) {
    console.log('\n✅ Todos os alunos do CSV já estão na base!');
  } else {
    console.log(`\n❌ ALUNOS FALTANDO (${faltantes.length}):\n`);
    
    faltantes.forEach((a, i) => {
      console.log(`${i + 1}. ${a.nome}`);
      a.matriculas.forEach((m, j) => {
        console.log(`   Curso: ${m.curso}`);
        console.log(`   Professor: ${m.professor}`);
        console.log(`   Status: ${m.motivoInterrupcao || 'Em Andamento'}`);
        console.log('');
      });
    });
  }
  
  // Verificar segundos cursos
  const segundosCursos = [];
  encontrados.forEach(a => {
    if (a.matriculas.length > 1) {
      const alunoBase = alunosBase.find(b => normalizarNome(b.nome) === a.nomeNormalizado);
      if (alunoBase && a.matriculas.length > 1) {
        // Verificar se todas as matrículas do CSV existem na base
        const cursosCSV = a.matriculas.map(m => normalizarNome(m.curso));
        // Se tem mais de 1 matrícula no CSV, pode ter segundo curso faltando
        if (a.matriculas.length > 1) {
          segundosCursos.push({
            nome: a.nome,
            matriculasCSV: a.matriculas,
            matriculasNaBase: 1 // Assumindo que só tem 1 na base
          });
        }
      }
    }
  });
  
  if (segundosCursos.length > 0) {
    console.log(`\n⚠️  POSSÍVEIS SEGUNDOS CURSOS (${segundosCursos.length}):\n`);
    segundosCursos.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. ${s.nome}`);
      s.matriculasCSV.forEach((m, j) => {
        console.log(`   ${j + 1}. ${m.curso}`);
      });
    });
  }
  
  console.log('\n' + '='.repeat(70));
}

// Executar
console.log('🔍 ANÁLISE DE ALUNOS/MATRÍCULAS FALTANTES - CG\n');

try {
  const { alunosMap } = processarMatriculas();
  const resultado = compararDados(alunosMap);
  gerarRelatorio(resultado);
} catch (error) {
  console.error('❌ Erro:', error);
}
