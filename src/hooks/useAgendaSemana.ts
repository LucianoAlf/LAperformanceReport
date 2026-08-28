import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, addDays, parseISO, startOfWeek } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { presencaInicial, type AgendaDiaV2, type AulaAgenda, type PresencaEnvelopeAgenda } from './useAgendaDia';

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

  const cacheRef = useRef(new Map<string, Map<string, AgendaDiaV2>>());
  const chaveCache = `${unidadeId ?? 'todas'}|${inicioSemana}`;
  const emCache = cacheRef.current.get(chaveCache);

  const [agendaPorDia, setAgendaPorDia] = useState<Map<string, AgendaDiaV2>>(emCache ?? new Map());
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
    if (doCache) setAgendaPorDia(doCache);
    else setAgendaPorDia(new Map());
    setCarregando(doCache === undefined);
    setErro(null);

    const { data: resposta, error } = await supabase.rpc('get_agenda_semana_v2', {
      p_data_inicio: inicioDaBusca,
      p_unidade_id: unidadeIdDaBusca,
    });

    if (!aindaValida()) return;

    if (error) {
      setErro(error.message);
      setAgendaPorDia(new Map());
      setCarregando(false);
      return;
    }

    const mapa = new Map<string, AgendaDiaV2>();
    for (const [dia, envelope] of Object.entries((resposta ?? {}) as Record<string, AgendaDiaV2>)) {
      if (!envelope || !Array.isArray(envelope.aulas) || !Array.isArray(envelope.ocorrencias)) {
        setErro(`Contrato invalido da Agenda semanal v2 em ${dia}`);
        setAgendaPorDia(new Map());
        setCarregando(false);
        return;
      }
      mapa.set(dia, envelope);
    }

    cacheRef.current.set(chaveDaBusca, mapa);
    setAgendaPorDia(mapa);
    setCarregando(false);
  }, [inicioSemana, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  /** Retorna as aulas de um dia especifico da semana */
  const aulasDoDia = useCallback(
    (dia: string): AulaAgenda[] => agendaPorDia.get(dia)?.aulas ?? [],
    [agendaPorDia],
  );

  const presencaDoDia = useCallback(
    (dia: string): PresencaEnvelopeAgenda => agendaPorDia.get(dia) ?? presencaInicial,
    [agendaPorDia],
  );

  /** Lista dos 6 dias da semana (seg-sab) */
  const dias = useMemo(
    () => Array.from({ length: 6 }, (_, i) => format(addDays(parseISO(inicioSemana), i), 'yyyy-MM-dd')),
    [inicioSemana],
  );

  return { agendaPorDia, aulasDoDia, presencaDoDia, dias, carregando, erro, recarregar: buscar };
}
