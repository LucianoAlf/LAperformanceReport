const XLSX = require('xlsx');

// ========== 1. Ler Excel de Alunos Ativos ==========
const wbAlunos = XLSX.readFile('C:\\Users\\hugog\\Downloads\\alunos_ativos_cg.xlsx');
const wsAlunos = wbAlunos.Sheets[wbAlunos.SheetNames[0]];
const alunosData = XLSX.utils.sheet_to_json(wsAlunos);

// ========== 2. Ler Excel de Matriculas ==========
const wbMatric = XLSX.readFile('C:\\Users\\hugog\\Downloads\\matricula_cg.xlsx');
const wsMatric = wbMatric.Sheets[wbMatric.SheetNames[0]];
const matricData = XLSX.utils.sheet_to_json(wsMatric);

// ========== 3. Processar alunos do Emusys ==========
function normalizeName(name) {
    if (!name) return '';
    return name.trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .trim();
}

function parseCursos(cursosStr) {
    if (!cursosStr) return [];
    // Cursos podem estar separados por \n ou por " / "
    return cursosStr.split(/[\n]|(?:\s*\/\s*)/)
        .map(c => c.trim())
        .filter(c => c.length > 0 && c !== 'Piano' || c === 'Piano') // keep all
        .filter(c => c.length > 0);
}

// Map: nome_normalizado -> { nome_original, cursos: Set }
const emusysAlunos = new Map();

for (const row of alunosData) {
    const nome = normalizeName(row['Aluno(a)']);
    if (!nome) continue;
    const cursos = parseCursos(row['Curso(s)']);

    if (emusysAlunos.has(nome)) {
        const existing = emusysAlunos.get(nome);
        for (const c of cursos) existing.cursos.add(c);
    } else {
        emusysAlunos.set(nome, {
            nome_original: row['Aluno(a)'].trim(),
            cursos: new Set(cursos)
        });
    }
}

// Also process matricula file for enrichment
const emusysMatriculas = new Map();
for (const row of matricData) {
    const nome = normalizeName(row['Nome do Aluno']);
    if (!nome) continue;
    const curso = row['Curso'] ? row['Curso'].trim() : null;

    if (emusysMatriculas.has(nome)) {
        if (curso) emusysMatriculas.get(nome).cursos.add(curso);
    } else {
        emusysMatriculas.set(nome, {
            nome_original: row['Nome do Aluno'].trim(),
            cursos: new Set(curso ? [curso] : [])
        });
    }
}

console.log('=== DADOS DO EMUSYS ===');
console.log('Alunos ativos (excel):', emusysAlunos.size);
console.log('Total registros alunos_ativos:', alunosData.length);
console.log('Matriculas (excel):', emusysMatriculas.size);
console.log('Total registros matricula:', matricData.length);

// Output unique names as JSON for comparison
const output = {
    emusys_alunos_ativos: [],
    emusys_matriculas: []
};

for (const [nome, data] of emusysAlunos) {
    output.emusys_alunos_ativos.push({
        nome: data.nome_original,
        cursos: [...data.cursos].sort()
    });
}

for (const [nome, data] of emusysMatriculas) {
    output.emusys_matriculas.push({
        nome: data.nome_original,
        cursos: [...data.cursos].sort()
    });
}

// Write to temp file for comparison
const fs = require('fs');
fs.writeFileSync('C:\\Users\\hugog\\Downloads\\emusys_cg_parsed.json', JSON.stringify(output, null, 2));
console.log('Dados salvos em emusys_cg_parsed.json');

// Print some sample names for verification
console.log('\n=== PRIMEIROS 10 ALUNOS ATIVOS (Emusys) ===');
output.emusys_alunos_ativos.slice(0, 10).forEach(a => {
    console.log(`  ${a.nome} | ${a.cursos.join(' / ')}`);
});

console.log('\n=== PRIMEIROS 10 MATRICULAS (Emusys) ===');
output.emusys_matriculas.slice(0, 10).forEach(a => {
    console.log(`  ${a.nome} | ${a.cursos.join(' / ')}`);
});
