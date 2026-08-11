import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, addDays, parseISO, startOfWeek } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { AulaAgenda } from './useAgendaDia';

interface Params {
  /** Qualquer dia da semana — o hook resolve para a segunda-feira */
  data: string;
  unidadeId: string | null;
}

/**
 * Carrega a agenda de uma semana inteira (seg-sab) em UMA chamada RPC.
 * Substitui 6 chamadas individuais de useAgendaDia na visao Semana.
 * Retorna um mapa dia -> aulas para distribuir as colunas.
 */
export function useAgendaSemana({ data, unidadeId }: Params) {
  const inicioSemana = useMemo(() => {
    const d = parseISO(data);
    return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [data]);

  const cacheRef = useRef(new Map<string, Map<string, AulaAgenda[]>>());
  const chaveCache = `${unidadeId ?? 'todas'}|${inicioSemana}`;
  const emCache = cacheRef.current.get(chaveCache);

  const [aulasPorDia, setAulasPorDia] = useState<Map<string, AulaAgenda[]>>(emCache ?? new Map());
  const [carregando, setCarregando] = useState(emCache === undefined);
  const [erro, setErro] = useState<string | null>(null);
  const idRequisicaoRef = useRef(0);

  const buscar = useCallback(async () => {
    const inicioDaBusca = inicioSemana;
    const unidadeIdDaBusca = unidadeId;
    const chaveDaBusca = `${unidadeIdDaBusca ?? 'todas'}|${inicioDaBusca}`;
    const minhaRequisicaoId = ++idRequisicaoRef.current;
    const aindaValida = () => idRequisicaoRef.current === minhaRequisicaoId;

    const doCache = cacheRef.current.get(chaveDaBusca);
    if (doCache) setAulasPorDia(doCache);
    setCarregando(doCache === undefined);
    setErro(null);

    const { data: linhas, error } = await supabase.rpc('get_agenda_semana', {
      p_data_inicio: inicioDaBusca,
      p_unidade_id: unidadeIdDaBusca,
    });

    if (!aindaValida()) return;

    if (error) {
      setErro(error.message);
      setAulasPorDia(new Map());
      setCarregando(false);
      return;
    }

    // Distribui as linhas por dia usando o campo data_aula
    const mapa = new Map<string, AulaAgenda[]>();
    for (const linha of (linhas || []) as unknown as Array<AulaAgenda & { data_aula: string }>) {
      const dia = linha.data_aula;
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia)!.push(linha);
    }

    cacheRef.current.set(chaveDaBusca, mapa);
    setAulasPorDia(mapa);
    setCarregando(false);
  }, [inicioSemana, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  /** Retorna as aulas de um dia especifico da semana */
  const aulasDoDia = useCallback(
    (dia: string): AulaAgenda[] => aulasPorDia.get(dia) ?? [],
    [aulasPorDia],
  );

  /** Lista dos 6 dias da semana (seg-sab) */
  const dias = useMemo(
    () => Array.from({ length: 6 }, (_, i) => format(addDays(parseISO(inicioSemana), i), 'yyyy-MM-dd')),
    [inicioSemana],
  );

  return { aulasPorDia, aulasDoDia, dias, carregando, erro, recarregar: buscar };
}
