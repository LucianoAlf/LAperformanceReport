import * as XLSX from 'xlsx';

export interface AlunoEmusys {
    nome: string;
    cursos: string[];
}

/**
 * Normaliza um nome para comparação:
 * - lowercase
 * - remove acentos
 * - trim
 * - remove espaços duplos
 * - remove conteúdo entre parênteses (ex: "(Marquinhos)")
 */
export function normalizarNome(nome: string): string {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parse do arquivo de alunos ativos do Emusys (alunos_ativos_XX.xlsx)
 * Colunas esperadas: Aluno(a), Curso(s), Data Matric.
 */
function parseAlunosAtivos(data: any[]): Map<string, AlunoEmusys> {
    const map = new Map<string, AlunoEmusys>();

    for (const row of data) {
        const nomeRaw = row['Aluno(a)'] || row['Aluno'] || row['Nome do Aluno'] || '';
        const nome = nomeRaw.trim().replace(/\s+/g, ' ');
        if (!nome) continue;

        const cursosRaw = row['Curso(s)'] || row['Curso'] || '';
        const cursos = String(cursosRaw)
            .split(/[\n]|(?:\s+\/\s+)/)
            .map((c: string) => c.trim())
            .filter((c: string) => c.length > 0);

        const key = normalizarNome(nome);
        if (map.has(key)) {
            const existing = map.get(key)!;
            for (const c of cursos) {
                if (!existing.cursos.includes(c)) existing.cursos.push(c);
            }
        } else {
            map.set(key, { nome, cursos });
        }
    }

    return map;
}

/**
 * Parse do arquivo de matrículas do Emusys (matricula_XX.xlsx)
 * Colunas esperadas: Nome do Aluno, Curso, Professor(es), Data da Matrícula
 */
function parseMatriculas(data: any[]): Map<string, AlunoEmusys> {
    const map = new Map<string, AlunoEmusys>();

    for (const row of data) {
        const nomeRaw = row['Nome do Aluno'] || row['Aluno(a)'] || row['Aluno'] || '';
        const nome = nomeRaw.trim().replace(/\s+/g, ' ');
        if (!nome) continue;

        const curso = (row['Curso'] || '').trim();
        const key = normalizarNome(nome);

        if (map.has(key)) {
            const existing = map.get(key)!;
            if (curso && !existing.cursos.includes(curso)) existing.cursos.push(curso);
        } else {
            map.set(key, { nome, cursos: curso ? [curso] : [] });
        }
    }

    return map;
}

/**
 * Lê um arquivo XLSX/CSV e retorna os dados como array de objetos
 */
export async function readFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet);
                resolve(json);
            } catch (err) {
                reject(new Error('Erro ao ler arquivo: ' + (err as Error).message));
            }
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsArrayBuffer(file);
    });
}

export interface ParseResult {
    alunosAtivos: Map<string, AlunoEmusys>;
    matriculas: Map<string, AlunoEmusys>;
    totalRowsAtivos: number;
    totalRowsMatriculas: number;
}

/**
 * Parse dos dois arquivos do Emusys
 */
export async function parseEmusysFiles(
    fileAlunos: File,
    fileMatriculas?: File
): Promise<ParseResult> {
    const dataAlunos = await readFile(fileAlunos);
    const alunosAtivos = parseAlunosAtivos(dataAlunos);

    let matriculas = new Map<string, AlunoEmusys>();
    let totalRowsMatriculas = 0;

    if (fileMatriculas) {
        const dataMatriculas = await readFile(fileMatriculas);
        matriculas = parseMatriculas(dataMatriculas);
        totalRowsMatriculas = dataMatriculas.length;
    }

    return {
        alunosAtivos,
        matriculas,
        totalRowsAtivos: dataAlunos.length,
        totalRowsMatriculas
    };
}
