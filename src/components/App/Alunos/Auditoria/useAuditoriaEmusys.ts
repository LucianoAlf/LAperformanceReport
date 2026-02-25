import { supabase } from '@/lib/supabase';
import { normalizarNome, type AlunoEmusys, type ParseResult } from './parseEmusysFile';

// ========== Tipos ==========

export interface AlunoDB {
    id: number;
    nome: string;
    status: string;
    is_segundo_curso: boolean;
    curso_nome: string | null;
    valor_parcela: number | null;
}

export interface Divergencia {
    nome: string;
    nomeDB?: string;
    tipo: 'faltante_db' | 'faltante_crm' | 'status_errado' | 'curso_faltando' | 'duplicata' | 'valor_divergente';
    detalhes: string;
    cursosCRM?: string[];
    cursosDB?: string[];
    statusDB?: string;
    ids?: number[];
    valorCRM?: number;
    valorDB?: number;
}

export interface RelatorioAuditoria {
    resumo: {
        totalEmusys: number;
        totalDB: number;
        totalRowsEmusys: number;
        totalRowsDB: number;
    };
    faltantesDB: Divergencia[];
    faltantesCRM: Divergencia[];
    statusErrado: Divergencia[];
    cursosFaltando: Divergencia[];
    duplicatas: Divergencia[];
    valoresDivergentes: Divergencia[];
    timestamp: string;
}

// ========== Hook ==========

function findBestMatchKey(emusysKey: string, dbKeys: string[]): string | undefined {
    if (dbKeys.includes(emusysKey)) return emusysKey;

    // Evitar falsos positivos com nomes muito curtos.
    const MIN_LENGTH_TOLERANCE = 12;

    for (const dbKey of dbKeys) {
        if ((dbKey.startsWith(emusysKey) && emusysKey.length >= MIN_LENGTH_TOLERANCE) ||
            (emusysKey.startsWith(dbKey) && dbKey.length >= MIN_LENGTH_TOLERANCE)) {
            return dbKey;
        }
    }
    return undefined;
}

export async function executarAuditoria(
    parseResult: ParseResult,
    unidadeId: string
): Promise<RelatorioAuditoria> {
    // 1. Buscar alunos do DB para a unidade
    const { data: dbData, error } = await supabase
        .from('alunos')
        .select(`
      id, nome, status, is_segundo_curso, valor_parcela,
      cursos:curso_id!left(nome)
    `)
        .eq('unidade_id', unidadeId)
        .order('nome');

    if (error) throw new Error('Erro ao buscar alunos do banco: ' + error.message);

    const dbRaw: AlunoDB[] = (dbData || []).map((a: any) => ({
        id: a.id,
        nome: a.nome?.trim() || '',
        status: a.status,
        is_segundo_curso: a.is_segundo_curso,
        curso_nome: a.cursos?.nome || null,
        valor_parcela: a.valor_parcela,
    }));

    // 2. Agrupar DB por nome normalizado
    const dbMap = new Map<string, AlunoDB[]>();
    for (const a of dbRaw) {
        const key = normalizarNome(a.nome);
        if (!dbMap.has(key)) dbMap.set(key, []);
        dbMap.get(key)!.push(a);
    }

    // Contar nomes únicos no DB
    const dbUniqueNames = new Set<string>();
    for (const a of dbRaw) dbUniqueNames.add(normalizarNome(a.nome));

    const { alunosAtivos: emusys } = parseResult;

    const dbKeys = Array.from(dbMap.keys());
    const matchedDbKeys = new Set<string>();
    const emusysToDb = new Map<string, string>();

    for (const eKey of emusys.keys()) {
        const match = findBestMatchKey(eKey, dbKeys);
        if (match) {
            emusysToDb.set(eKey, match);
            matchedDbKeys.add(match);
        }
    }

    // 3. Comparar
    const faltantesDB: Divergencia[] = [];
    const faltantesCRM: Divergencia[] = [];
    const statusErrado: Divergencia[] = [];
    const cursosFaltando: Divergencia[] = [];
    const duplicatas: Divergencia[] = [];
    const valoresDivergentes: Divergencia[] = [];

    // A) Alunos no Emusys mas não no DB
    for (const [key, eData] of emusys) {
        if (!emusysToDb.has(key)) {
            faltantesDB.push({
                nome: eData.nome,
                tipo: 'faltante_db',
                detalhes: `Aluno ativo no Emusys mas não encontrado no banco de dados.`,
                cursosCRM: eData.cursos.sort(),
            });
        }
    }

    // B) Alunos ativos no DB mas não no Emusys
    for (const [key, records] of dbMap) {
        if (!matchedDbKeys.has(key)) {
            const hasActive = records.some(r => r.status === 'ativo');
            if (hasActive) {
                const cursos = [...new Set(records.filter(r => r.curso_nome).map(r => r.curso_nome!))].sort();
                faltantesCRM.push({
                    nome: records[0].nome,
                    tipo: 'faltante_crm',
                    detalhes: `Aluno ativo no banco mas não encontrado no relatório do Emusys. Possível evasão não registrada.`,
                    cursosDB: cursos,
                    ids: records.map(r => r.id),
                });
            }
        }
    }

    // C) Status divergente
    for (const [key, eData] of emusys) {
        const dbKey = emusysToDb.get(key);
        if (!dbKey) continue;

        const records = dbMap.get(dbKey)!;
        const hasActive = records.some(r => r.status === 'ativo');
        const nonActive = records.filter(r => r.status !== 'ativo');

        if (!hasActive && nonActive.length > 0) {
            const statuses = [...new Set(nonActive.map(r => r.status))];
            statusErrado.push({
                nome: eData.nome,
                nomeDB: records[0].nome,
                tipo: 'status_errado',
                detalhes: `Aluno ativo no Emusys mas com status "${statuses.join(', ')}" no banco.`,
                cursosCRM: eData.cursos.sort(),
                cursosDB: [...new Set(records.filter(r => r.curso_nome).map(r => r.curso_nome!))].sort(),
                statusDB: statuses.join(' / '),
                ids: records.map(r => r.id),
            });
        }
    }

    // D) Cursos faltando
    for (const [key, eData] of emusys) {
        const dbKey = emusysToDb.get(key);
        if (!dbKey) continue;

        const records = dbMap.get(dbKey)!;
        if (!records.some(r => r.status === 'ativo')) continue;

        const cursosEmusys = [...new Set(eData.cursos)].sort();
        const cursosDB = [...new Set(records.filter(r => r.curso_nome).map(r => r.curso_nome!))].sort();

        // Cursos no Emusys que não estão no DB
        const faltandoDB = cursosEmusys.filter(c => !cursosDB.some(d =>
            normalizarNome(c) === normalizarNome(d)
        ));

        if (faltandoDB.length > 0) {
            cursosFaltando.push({
                nome: eData.nome,
                tipo: 'curso_faltando',
                detalhes: `${faltandoDB.length} curso(s) no Emusys não encontrado(s) no banco: ${faltandoDB.join(', ')}`,
                cursosCRM: cursosEmusys,
                cursosDB,
            });
        }
    }

    // E) Duplicatas no DB
    for (const [key, records] of dbMap) {
        const seen: Record<string, number[]> = {};
        for (const r of records) {
            const dupKey = `${r.curso_nome}|${r.is_segundo_curso}`;
            if (!seen[dupKey]) seen[dupKey] = [];
            seen[dupKey].push(r.id);
        }
        for (const [dupKey, ids] of Object.entries(seen)) {
            if (ids.length > 1) {
                const [curso, tipo] = dupKey.split('|');
                duplicatas.push({
                    nome: records[0].nome,
                    tipo: 'duplicata',
                    detalhes: `Registro duplicado: curso "${curso}", segundo_curso=${tipo}. IDs: ${ids.join(', ')}`,
                    ids,
                });
            }
        }
    }

    return {
        resumo: {
            totalEmusys: emusys.size,
            totalDB: dbUniqueNames.size,
            totalRowsEmusys: parseResult.totalRowsAtivos,
            totalRowsDB: dbRaw.length,
        },
        faltantesDB,
        faltantesCRM,
        statusErrado,
        cursosFaltando,
        duplicatas,
        valoresDivergentes,
        timestamp: new Date().toISOString(),
    };
}
