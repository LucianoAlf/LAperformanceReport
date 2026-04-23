const XLSX = require('xlsx');
const fs = require('fs');

// ========== 1. Parse Emusys Excel ==========
const wb = XLSX.readFile('C:\\Users\\hugog\\Downloads\\alunos_ativos_cg.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

const emusys = new Map();
for (const r of rows) {
    const nome = (r['Aluno(a)'] || '').trim().replace(/\s+/g, ' ');
    if (!nome) continue;
    const cursos = (r['Curso(s)'] || '').split(/[\n]|(?:\s+\/\s+)/).map(c => c.trim()).filter(c => c.length > 0);
    if (emusys.has(nome)) { for (const c of cursos) emusys.get(nome).add(c); }
    else { emusys.set(nome, new Set(cursos)); }
}

// ========== 2. DB data (inline from Supabase query) ==========
const dbRaw = JSON.parse(fs.readFileSync('C:\\Users\\hugog\\.gemini\\antigravity\\brain\\1ffd8b76-9aad-4edc-bb15-7285f3321923\\.system_generated\\steps\\42\\output.txt', 'utf8'));
// Extract JSON from the untrusted-data wrapper
const jsonMatch = dbRaw.match(/\[[\s\S]*\]/);
const dbData = JSON.parse(jsonMatch[0]);

// Group by name
const db = new Map();
for (const r of dbData) {
    const nome = r.nome.trim();
    if (!db.has(nome)) db.set(nome, []);
    db.get(nome).push(r);
}

// ========== 3. Normalize for comparison ==========
function normName(n) { return n.toUpperCase().replace(/\s+/g, ' ').trim(); }

const emusysNorm = new Map();
for (const [nome, cursos] of emusys) { emusysNorm.set(normName(nome), { nome, cursos }); }

const dbNorm = new Map();
for (const [nome, records] of db) { dbNorm.set(normName(nome), { nome, records }); }

// ========== 4. Compare ==========
const report = {
    emusys_total_unique: emusys.size,
    emusys_total_rows: rows.length,
    db_total_unique: db.size,
    db_total_rows: dbData.length,
    status_errado: [], // Emusys=ativo, DB=nao ativo
    faltantes_db: [],  // No Emusys but not in DB
    faltantes_crm: [], // In DB but not in Emusys
    diff_cursos: [],   // Different course counts
    duplicatas: [],    // Same student, same course, same type
    classif_errada: [], // Multiple primeiro_curso
    orfao_2curso: [],  // segundo_curso without primeiro_curso
    curso_null: [],    // curso_id is null
    novos_no_db: [],   // New students added since last audit
};

// A) Alunos no Emusys mas nao no DB
for (const [normNome, data] of emusysNorm) {
    if (!dbNorm.has(normNome)) {
        report.faltantes_db.push({ nome: data.nome, cursos: [...data.cursos].sort() });
    }
}

// B) Alunos no DB mas nao no Emusys (only active ones)
for (const [normNome, data] of dbNorm) {
    const hasActive = data.records.some(r => r.status === 'ativo');
    if (hasActive && !emusysNorm.has(normNome)) {
        const cursos = [...new Set(data.records.filter(r => r.curso_nome).map(r => r.curso_nome))].sort();
        report.faltantes_crm.push({ nome: data.nome, cursos_db: cursos });
    }
}

// C) Alunos ativos no Emusys mas com status errado no DB
for (const [normNome, eData] of emusysNorm) {
    if (!dbNorm.has(normNome)) continue;
    const dbRecords = dbNorm.get(normNome).records;
    const nonActive = dbRecords.filter(r => r.status !== 'ativo');
    const hasActive = dbRecords.some(r => r.status === 'ativo');
    if (nonActive.length > 0 && !hasActive) {
        const statuses = [...new Set(nonActive.map(r => r.status))];
        const cursosDB = [...new Set(dbRecords.filter(r => r.curso_nome).map(r => r.curso_nome))].sort();
        const cursosEmusys = [...eData.cursos].sort();
        const ids = dbRecords.map(r => r.id);
        report.status_errado.push({
            nome: eData.nome,
            status_db: statuses.join(' / '),
            cursos_crm: cursosEmusys,
            cursos_db: cursosDB,
            ids
        });
    }
}

// D) Diferenças de cursos
for (const [normNome, eData] of emusysNorm) {
    if (!dbNorm.has(normNome)) continue;
    const dbRecords = dbNorm.get(normNome).records;
    // Only compare if at least one is active
    if (!dbRecords.some(r => r.status === 'ativo')) continue;

    const cursosEmusys = [...eData.cursos].sort();
    const cursosDB = dbRecords.filter(r => r.curso_nome).map(r => r.curso_nome).sort();
    const uniqueCursosDB = [...new Set(cursosDB)].sort();

    if (cursosEmusys.length !== uniqueCursosDB.length) {
        report.diff_cursos.push({
            nome: eData.nome,
            crm_count: cursosEmusys.length,
            crm_cursos: cursosEmusys,
            db_count: uniqueCursosDB.length,
            db_cursos: uniqueCursosDB
        });
    }
}

// E) Anomalias internas do DB
// Duplicatas: same name, same course, same is_segundo_curso
for (const [nome, records] of db) {
    const seen = {};
    for (const r of records) {
        const key = `${r.curso_nome}|${r.is_segundo_curso}`;
        if (!seen[key]) seen[key] = [];
        seen[key].push(r.id);
    }
    for (const [key, ids] of Object.entries(seen)) {
        if (ids.length > 1) {
            const [curso, tipo] = key.split('|');
            report.duplicatas.push({ nome, curso, segundo: tipo, ids });
        }
    }
}

// Classificação errada: 2+ primeiro_curso records com cursos diferentes
for (const [nome, records] of db) {
    const primeiros = records.filter(r => !r.is_segundo_curso && r.curso_nome);
    if (primeiros.length > 1) {
        const uniqueCursos = new Set(primeiros.map(r => r.curso_nome));
        if (uniqueCursos.size > 1) {
            report.classif_errada.push({
                nome,
                cursos: primeiros.map(r => `${r.curso_nome} (id:${r.id})`)
            });
        }
    }
}

// Segundo curso órfão
for (const [nome, records] of db) {
    const temPrimeiro = records.some(r => !r.is_segundo_curso && r.status === 'ativo');
    const segundos = records.filter(r => r.is_segundo_curso && r.status === 'ativo');
    if (!temPrimeiro && segundos.length > 0) {
        report.orfao_2curso.push({ nome, cursos: segundos.map(r => r.curso_nome) });
    }
}

// Curso NULL
for (const [nome, records] of db) {
    for (const r of records) {
        if (!r.curso_nome && r.status === 'ativo') {
            report.curso_null.push({ nome, id: r.id });
        }
    }
}

// ========== 5. Print Report ==========
console.log('================================================');
console.log('           RELATORIO DE DIVERGENCIAS');
console.log('           Campo Grande - Fev/2026');
console.log('================================================');
console.log('');
console.log('## RESUMO QUANTITATIVO');
console.log('');
console.log('| Fonte              | Alunos Unicos | Total Registros |');
console.log('|--------------------|---------------|-----------------|');
console.log(`| CRM (Excel)        | ${report.emusys_total_unique.toString().padStart(13)} | ${report.emusys_total_rows.toString().padStart(15)} |`);
console.log(`| Supabase DB        | ${report.db_total_unique.toString().padStart(13)} | ${report.db_total_rows.toString().padStart(15)} |`);
console.log(`| Faltantes no DB    | ${report.faltantes_db.length.toString().padStart(13)} |                 |`);
console.log(`| Status errado DB   | ${report.status_errado.length.toString().padStart(13)} |                 |`);
console.log(`| Faltantes no CRM   | ${report.faltantes_crm.length.toString().padStart(13)} |                 |`);
console.log(`| Dif. de Cursos     | ${report.diff_cursos.length.toString().padStart(13)} |                 |`);
console.log(`| Duplicatas DB      | ${report.duplicatas.length.toString().padStart(13)} |                 |`);
console.log(`| Classif. Errada    | ${report.classif_errada.length.toString().padStart(13)} |                 |`);
console.log(`| 2o Curso Orfao     | ${report.orfao_2curso.length.toString().padStart(13)} |                 |`);
console.log(`| Curso NULL         | ${report.curso_null.length.toString().padStart(13)} |                 |`);

console.log('');
console.log('## ALUNOS ATIVOS NO CRM MAS COM STATUS ERRADO NO DB (precisam ser reativados)');
console.log('');
for (const a of report.status_errado.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} | Status DB: ${a.status_db} | Cursos CRM: ${a.cursos_crm.join(' / ')} | Cursos DB: ${a.cursos_db.join(' / ')} | IDs: ${a.ids.join(', ')}`);
}

console.log('');
console.log('## ALUNOS NO CRM MAS INEXISTENTES NO DB (cadastrar do zero)');
console.log('');
for (const a of report.faltantes_db.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} | Cursos: ${a.cursos.join(' / ')}`);
}

console.log('');
console.log('## ALUNOS NO DB MAS NAO NO CRM (possivel evasao nao registrada)');
console.log('');
for (const a of report.faltantes_crm.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} | Cursos DB: ${a.cursos_db.join(' / ')}`);
}

console.log('');
console.log('## DIFERENCAS DE CURSOS (aluno existe em ambos mas qtd de cursos difere)');
console.log('');
for (const a of report.diff_cursos.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome}`);
    console.log(`    CRM (${a.crm_count}): ${a.crm_cursos.join(' / ')}`);
    console.log(`    DB  (${a.db_count}): ${a.db_cursos.join(' / ')}`);
}

console.log('');
console.log('## ANOMALIAS INTERNAS DO DB');
console.log('');
console.log('### Duplicatas (mesmo aluno, mesmo curso, mesmo tipo):');
for (const a of report.duplicatas.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} | ${a.curso} | segundo=${a.segundo} | IDs: ${a.ids.join(', ')}`);
}

console.log('');
console.log('### Classificacao errada (2+ primeiro_curso cursos diferentes para mesmo aluno):');
for (const a of report.classif_errada.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome}: ${a.cursos.join(' + ')}`);
}

console.log('');
console.log('### Segundo curso orfao (sem primeiro_curso):');
for (const a of report.orfao_2curso.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} | Cursos: ${a.cursos.join(' / ')}`);
}

console.log('');
console.log('### Alunos com curso_id NULL:');
for (const a of report.curso_null.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`  - ${a.nome} (id: ${a.id})`);
}

console.log('');
console.log('================================================');
console.log('  FIM DO RELATORIO - Nenhuma alteracao foi feita');
console.log('================================================');
