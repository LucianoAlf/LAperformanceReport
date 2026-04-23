/**
 * Script READ-ONLY: Compara dados CRM (Excel) vs Supabase para CG
 * NAO faz nenhuma alteracao no banco de dados
 */

const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EgOYotaC7ZKwhY1nx23nmg_c_vn3JU4';
const CG_UNIDADE_ID = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizar(nome) {
  return (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function fetchAllAlunos() {
  const pageSize = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('alunos')
      .select('id, nome, curso_id, is_segundo_curso, data_matricula, cursos(nome)')
      .eq('unidade_id', CG_UNIDADE_ID)
      .eq('status', 'ativo')
      .range(from, from + pageSize - 1);

    if (error) throw new Error('Supabase error: ' + error.message);
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}

async function main() {
  console.log('=== Comparacao CRM vs Supabase - Campo Grande ===\n');

  // 1. Ler Excel alunos_ativos
  console.log('Lendo alunos_ativos_cg.xlsx...');
  const wbAlunos = XLSX.readFile('C:\\Users\\hugog\\Downloads\\alunos_ativos_cg.xlsx');
  const sheetAlunos = wbAlunos.Sheets[wbAlunos.SheetNames[0]];
  const alunosCrm = XLSX.utils.sheet_to_json(sheetAlunos);
  console.log(`  -> ${alunosCrm.length} alunos no CRM\n`);

  // 2. Ler Excel matriculas
  console.log('Lendo matricula_cg.xlsx...');
  const wbMat = XLSX.readFile('C:\\Users\\hugog\\Downloads\\matricula_cg.xlsx');
  const sheetMat = wbMat.Sheets[wbMat.SheetNames[0]];
  const matriculasCrm = XLSX.utils.sheet_to_json(sheetMat);
  console.log(`  -> ${matriculasCrm.length} matriculas no CRM\n`);

  // 3. Buscar dados do Supabase
  console.log('Buscando dados do Supabase...');
  const alunosDb = await fetchAllAlunos();
  console.log(`  -> ${alunosDb.length} registros ativos no DB\n`);

  if (alunosDb.length === 0) {
    console.log('AVISO: Supabase retornou 0 registros (RLS pode estar bloqueando).');
    console.log('Tentando via JSON local...\n');

    // Fallback: check if db-alunos-cg-export.json exists
    if (fs.existsSync('scripts/db-alunos-cg-export.json')) {
      const localData = JSON.parse(fs.readFileSync('scripts/db-alunos-cg-export.json', 'utf8'));
      console.log(`  -> Carregado ${localData.length} registros ativos do JSON local`);
      // Also load inactive/evaded students for cross-reference
      let inativosData = [];
      if (fs.existsSync('scripts/db-inativos-cg-export.json')) {
        inativosData = JSON.parse(fs.readFileSync('scripts/db-inativos-cg-export.json', 'utf8'));
        console.log(`  -> Carregado ${inativosData.length} registros inativos/evadidos do JSON local\n`);
      } else {
        console.log('  -> AVISO: Sem arquivo de inativos (db-inativos-cg-export.json)\n');
      }
      return runComparison(alunosCrm, matriculasCrm, localData, inativosData);
    }
    console.log('ERRO: Sem dados do DB para comparar. Gere o arquivo scripts/db-alunos-cg-export.json primeiro.');
    process.exit(1);
  }

  // Map supabase data to simple format
  const dbData = alunosDb.map(a => ({
    id: a.id,
    nome: a.nome,
    curso: a.cursos ? a.cursos.nome : null,
    is_segundo_curso: a.is_segundo_curso,
    data_matricula: a.data_matricula,
  }));

  return runComparison(alunosCrm, matriculasCrm, dbData, []);
}

function runComparison(alunosCrm, matriculasCrm, dbData, inativosData = []) {
  // Detectar nomes de colunas do Excel
  const keys = Object.keys(alunosCrm[0] || {});
  const colNomeAluno = keys.find(k => k.toLowerCase().includes('aluno') || k.toLowerCase().includes('nome'));
  const colCursos = keys.find(k => k.toLowerCase().includes('curso'));

  console.log(`Colunas detectadas: nome="${colNomeAluno}", cursos="${colCursos}"\n`);

  // Mapa CRM: nome normalizado -> { nome original, cursos }
  const crmMap = new Map();
  for (const row of alunosCrm) {
    const nomeOriginal = String(row[colNomeAluno] || '').trim();
    const norm = normalizar(nomeOriginal);
    if (!norm) continue;
    const cursosStr = String(row[colCursos] || '').trim();
    // Split by / or newlines
    const cursosList = cursosStr.split(/\s*[\/\n]\s*/).map(c => c.trim()).filter(Boolean);
    crmMap.set(norm, { nome: nomeOriginal, cursos: cursosList, cursosStr: cursosList.join(' / ') });
  }

  // Mapa DB: nome normalizado -> { nome, registros[] }
  const dbMap = new Map();
  for (const a of dbData) {
    const norm = normalizar(a.nome);
    if (!dbMap.has(norm)) {
      dbMap.set(norm, { nome: a.nome, registros: [] });
    }
    dbMap.get(norm).registros.push({
      id: a.id,
      curso: a.curso || '(NULL)',
      is_segundo_curso: a.is_segundo_curso,
      data_matricula: a.data_matricula,
    });
  }

  // Mapa de inativos/evadidos: nome normalizado -> { nome, status, registros[] }
  const inativosMap = new Map();
  for (const a of inativosData) {
    const norm = normalizar(a.nome);
    if (!inativosMap.has(norm)) {
      inativosMap.set(norm, { nome: a.nome, registros: [] });
    }
    inativosMap.get(norm).registros.push({
      id: a.id,
      curso: a.curso || '(NULL)',
      status: a.status,
      is_segundo_curso: a.is_segundo_curso,
    });
  }

  // Comparar
  const faltantesNoDB = [];       // nao existe no DB de jeito nenhum
  const statusErradoDB = [];      // existe no DB mas com status errado (evadido/inativo/trancado)
  const nomeDiferenteDB = [];     // possivelmente mesmo aluno com nome ligeiramente diferente
  const faltantesNoCRM = [];
  const diferencasCurso = [];

  // CRM -> DB
  for (const [norm, crm] of crmMap) {
    if (!dbMap.has(norm)) {
      // Nao esta ativo no DB - verificar se existe com outro status
      if (inativosMap.has(norm)) {
        const inativo = inativosMap.get(norm);
        const statuses = [...new Set(inativo.registros.map(r => r.status))];
        const cursos = [...new Set(inativo.registros.map(r => r.curso))];
        statusErradoDB.push({
          nome: crm.nome,
          cursosCrm: crm.cursosStr,
          statusDb: statuses.join(', '),
          cursosDb: cursos.join(' / '),
          ids: inativo.registros.map(r => r.id),
        });
      } else {
        faltantesNoDB.push(crm);
      }
    } else {
      const db = dbMap.get(norm);
      const cursosDb = db.registros.map(r => r.curso).sort();
      const cursosCrm = crm.cursos.sort();
      if (cursosDb.length !== cursosCrm.length) {
        diferencasCurso.push({
          nome: crm.nome,
          cursosCrm: crm.cursosStr,
          cursosDb: cursosDb.join(' / '),
          qtdCrm: cursosCrm.length,
          qtdDb: cursosDb.length,
        });
      }
    }
  }

  // DB -> CRM
  for (const [norm, db] of dbMap) {
    if (!crmMap.has(norm)) {
      faltantesNoCRM.push(db);
    }
  }

  // Anomalias internas do DB
  const duplicatas = [];
  const segundoCursoErrado = [];
  const orfaos = [];
  const cursoNull = [];

  for (const [norm, db] of dbMap) {
    const regs = db.registros;
    const seen = new Map();
    for (const r of regs) {
      const key = `${r.curso}-${r.is_segundo_curso}`;
      if (seen.has(key)) {
        duplicatas.push({ nome: db.nome, curso: r.curso, is_segundo: r.is_segundo_curso, ids: [seen.get(key).id, r.id] });
      } else {
        seen.set(key, r);
      }
    }
    const primeiros = regs.filter(r => !r.is_segundo_curso);
    if (primeiros.length > 1) {
      const distinct = new Set(primeiros.map(r => r.curso));
      if (distinct.size > 1) {
        segundoCursoErrado.push({
          nome: db.nome,
          cursos: primeiros.map(r => `${r.curso} (id:${r.id})`).join(' + ')
        });
      }
    }
    const temPrimeiro = regs.some(r => !r.is_segundo_curso);
    const temSegundo = regs.some(r => r.is_segundo_curso);
    if (temSegundo && !temPrimeiro) {
      orfaos.push({ nome: db.nome, cursos: regs.map(r => r.curso).join(', ') });
    }
    for (const r of regs) {
      if (r.curso === '(NULL)') {
        cursoNull.push({ nome: db.nome, id: r.id, is_segundo: r.is_segundo_curso });
      }
    }
  }

  // Output
  const lines = [];
  const log = (s) => { console.log(s); lines.push(s); };

  log('================================================');
  log('           RELATORIO DE DIVERGENCIAS');
  log('           Campo Grande - Fev/2026');
  log('================================================');
  log('');
  log('## RESUMO QUANTITATIVO');
  log('');
  log(`| Fonte              | Alunos Unicos | Total Registros |`);
  log(`|--------------------|---------------|-----------------|`);
  log(`| CRM (Excel)        | ${crmMap.size}             | ${matriculasCrm.length}               |`);
  log(`| Supabase DB        | ${dbMap.size}             | ${dbData.length}               |`);
  log(`| Faltantes no DB    | ${faltantesNoDB.length}              |                 |`);
  log(`| Status errado DB   | ${statusErradoDB.length}              |                 |`);
  log(`| Faltantes no CRM   | ${faltantesNoCRM.length}             |                 |`);
  log(`| Dif. de Cursos     | ${diferencasCurso.length}             |                 |`);
  log(`| Duplicatas DB      | ${duplicatas.length}              |                 |`);
  log(`| Classif. Errada    | ${segundoCursoErrado.length}              |                 |`);
  log(`| 2o Curso Orfao     | ${orfaos.length}              |                 |`);
  log(`| Curso NULL         | ${cursoNull.length}              |                 |`);
  log('');

  log('## ALUNOS ATIVOS NO CRM MAS COM STATUS ERRADO NO DB (precisam ser reativados)');
  log('');
  if (statusErradoDB.length === 0) {
    log('  Nenhum encontrado.');
  } else {
    statusErradoDB.sort((a, b) => a.nome.localeCompare(b.nome));
    for (const a of statusErradoDB) {
      log(`  - ${a.nome} | Status DB: ${a.statusDb} | Cursos CRM: ${a.cursosCrm} | Cursos DB: ${a.cursosDb} | IDs: ${a.ids.join(', ')}`);
    }
  }
  log('');

  log('## ALUNOS NO CRM MAS INEXISTENTES NO DB (cadastrar do zero)');
  log('');
  if (faltantesNoDB.length === 0) {
    log('  Nenhum encontrado.');
  } else {
    faltantesNoDB.sort((a, b) => a.nome.localeCompare(b.nome));
    for (const a of faltantesNoDB) {
      log(`  - ${a.nome} | Cursos: ${a.cursosStr}`);
    }
  }
  log('');

  log('## ALUNOS NO DB MAS NAO NO CRM (possivel evasao nao registrada)');
  log('');
  if (faltantesNoCRM.length === 0) {
    log('  Nenhum encontrado.');
  } else {
    faltantesNoCRM.sort((a, b) => a.nome.localeCompare(b.nome));
    for (const a of faltantesNoCRM) {
      const cursosStr = a.registros.map(r => r.curso).join(' / ');
      log(`  - ${a.nome} | Cursos DB: ${cursosStr}`);
    }
  }
  log('');

  log('## DIFERENCAS DE CURSOS (aluno existe em ambos mas qtd de cursos difere)');
  log('');
  if (diferencasCurso.length === 0) {
    log('  Nenhuma encontrada.');
  } else {
    diferencasCurso.sort((a, b) => a.nome.localeCompare(b.nome));
    for (const d of diferencasCurso) {
      log(`  - ${d.nome}`);
      log(`    CRM (${d.qtdCrm}): ${d.cursosCrm}`);
      log(`    DB  (${d.qtdDb}): ${d.cursosDb}`);
    }
  }
  log('');

  log('## ANOMALIAS INTERNAS DO DB');
  log('');

  log('### Duplicatas (mesmo aluno, mesmo curso, mesmo tipo):');
  if (duplicatas.length === 0) { log('  Nenhuma.'); }
  else { for (const d of duplicatas) log(`  - ${d.nome} | ${d.curso} | segundo=${d.is_segundo} | IDs: ${d.ids.join(', ')}`); }
  log('');

  log('### Classificacao errada (2+ primeiro_curso cursos diferentes para mesmo aluno):');
  if (segundoCursoErrado.length === 0) { log('  Nenhuma.'); }
  else { for (const s of segundoCursoErrado) log(`  - ${s.nome}: ${s.cursos}`); }
  log('');

  log('### Segundo curso orfao (sem primeiro_curso):');
  if (orfaos.length === 0) { log('  Nenhum.'); }
  else { for (const o of orfaos) log(`  - ${o.nome} | Cursos: ${o.cursos}`); }
  log('');

  log('### Alunos com curso_id NULL:');
  if (cursoNull.length === 0) { log('  Nenhum.'); }
  else { for (const c of cursoNull) log(`  - ${c.nome} (id: ${c.id})`); }
  log('');

  log('================================================');
  log('  FIM DO RELATORIO - Nenhuma alteracao foi feita');
  log('================================================');

  // Save report
  fs.writeFileSync('scripts/RELATORIO-DIVERGENCIAS-CG-FEV2026.md', lines.join('\n'));
  console.log('\n>> Relatorio salvo em scripts/RELATORIO-DIVERGENCIAS-CG-FEV2026.md');
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
