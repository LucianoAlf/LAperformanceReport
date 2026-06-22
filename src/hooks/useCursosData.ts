import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface CursoInteresseRPC {
  curso?: string | null;
  leads?: number | string | null;
}

interface KPIsComercialCanonicosV2Payload {
  cursos_mais_procurados?: CursoInteresseRPC[] | null;
}

interface UnidadeRow {
  id: string;
  nome: string;
}

interface UnidadeAlvo {
  id: string;
  nome: string;
}

interface CursoRanking {
  curso: string;
  total: number;
  unidades: { [key: string]: number };
}

const UNIDADES_COMERCIAIS = ['Campo Grande', 'Recreio', 'Barra'];

function normalizarTexto(valor: string): string {
  return valor
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function toNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function adicionarCurso(
  ranking: Map<string, CursoRanking>,
  unidadeNome: string,
  item: CursoInteresseRPC,
) {
  const curso = item.curso?.trim() || 'Sem curso';
  const leads = toNumber(item.leads);

  if (leads <= 0) {
    return;
  }

  const atual = ranking.get(curso) || {
    curso,
    total: 0,
    unidades: {},
  };

  atual.total += leads;
  atual.unidades[unidadeNome] = (atual.unidades[unidadeNome] || 0) + leads;
  ranking.set(curso, atual);
}

export function useCursosData(ano: number = 2025, unidade: string = 'Consolidado') {
  const [cursos, setCursos] = useState<CursoRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolverUnidades = useCallback(async (): Promise<UnidadeAlvo[]> => {
    const { data, error: unidadesError } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true);

    if (unidadesError) {
      throw unidadesError;
    }

    const unidades = (data as UnidadeRow[] | null) || [];
    const unidadesComerciais = unidades.filter((row) =>
      UNIDADES_COMERCIAIS.some(
        (nomeUnidade) => normalizarTexto(row.nome) === normalizarTexto(nomeUnidade),
      ),
    );

    if (unidade === 'Consolidado') {
      return unidadesComerciais.map((row) => ({ id: row.id, nome: row.nome }));
    }

    const unidadeEncontrada = unidadesComerciais.find(
      (row) => normalizarTexto(row.nome) === normalizarTexto(unidade),
    );

    if (!unidadeEncontrada) {
      throw new Error(`Unidade comercial nao encontrada: ${unidade}`);
    }

    return [{ id: unidadeEncontrada.id, nome: unidadeEncontrada.nome }];
  }, [unidade]);

  const fetchCursos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const unidadesAlvo = await resolverUnidades();
      const ranking = new Map<string, CursoRanking>();

      for (let mes = 1; mes <= 12; mes += 1) {
        for (const unidadeAlvo of unidadesAlvo) {
          const { data, error: rpcError } = await supabase.rpc(
            'get_kpis_comercial_canonicos_v2',
            {
              p_unidade_id: unidadeAlvo.id,
              p_ano: ano,
              p_mes: mes,
              p_periodo: 'mensal',
              p_data: null,
            },
          );

          if (rpcError) {
            throw new Error(
              `Erro ao buscar cursos v2 ${ano}-${String(mes).padStart(2, '0')} (${unidadeAlvo.nome}): ${rpcError.message}`,
            );
          }

          const payload = data as KPIsComercialCanonicosV2Payload | null;
          const cursosMaisProcurados = Array.isArray(payload?.cursos_mais_procurados)
            ? payload.cursos_mais_procurados
            : [];

          cursosMaisProcurados.forEach((item) => adicionarCurso(ranking, unidadeAlvo.nome, item));
        }
      }

      setCursos(Array.from(ranking.values()).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      setCursos([]);
      setError(err?.message || 'Erro ao buscar interesse por curso v2');
      console.error('Erro ao buscar interesse por curso v2:', err);
    } finally {
      setLoading(false);
    }
  }, [ano, resolverUnidades]);

  useEffect(() => {
    fetchCursos();
  }, [fetchCursos]);

  return { cursos, loading, error };
}
