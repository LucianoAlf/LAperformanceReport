import { useState, useMemo } from 'react';

export type TipoCompetencia = 'mensal' | 'trimestral' | 'semestral' | 'anual';

export interface CompetenciaFiltro {
  tipo: TipoCompetencia;
  ano: number;
  mes: number;           // Para mensal
  trimestre: 1 | 2 | 3 | 4;    // Para trimestral
  semestre: 1 | 2;         // Para semestral
}

export interface CompetenciaRange {
  startDate: string;  // "2025-01-01"
  endDate: string;    // "2025-12-31"
  meses: number[];    // [1, 2, 3, ...]
  label: string;      // "Q4 2025" ou "Dez/2025"
  ano: number;
  mesInicio: number;
  mesFim: number;
}

const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MESES_CURTO = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

/**
 * Hook para gerenciar o filtro de competência (período)
 * Default: mês atual
 */
export function useCompetenciaFiltro() {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1; // 1-12

  const [filtro, setFiltro] = useState<CompetenciaFiltro>({
    tipo: 'mensal',
    ano: anoAtual,
    mes: mesAtual,
    trimestre: Math.ceil(mesAtual / 3) as 1 | 2 | 3 | 4,
    semestre: mesAtual <= 6 ? 1 : 2,
  });

  // Calcular range de datas baseado no filtro
  const range = useMemo<CompetenciaRange>(() => {
    const { tipo, ano, mes, trimestre, semestre } = filtro;

    let mesInicio: number;
    let mesFim: number;
    let label: string;

    switch (tipo) {
      case 'mensal':
        mesInicio = mes;
        mesFim = mes;
        label = `${MESES_CURTO[mes - 1]}/${ano}`;
        break;

      case 'trimestral':
        mesInicio = (trimestre - 1) * 3 + 1;
        mesFim = trimestre * 3;
        label = `Q${trimestre} ${ano}`;
        break;

      case 'semestral':
        mesInicio = semestre === 1 ? 1 : 7;
        mesFim = semestre === 1 ? 6 : 12;
        label = `${semestre}º Semestre ${ano}`;
        break;

      case 'anual':
        mesInicio = 1;
        mesFim = 12;
        label = `${ano}`;
        break;

      default:
        mesInicio = mes;
        mesFim = mes;
        label = `${MESES_CURTO[mes - 1]}/${ano}`;
    }

    // Gerar array de meses
    const meses: number[] = [];
    for (let m = mesInicio; m <= mesFim; m++) {
      meses.push(m);
    }

    // Formatar datas
    const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mesFim, 0).getDate();
    const endDate = `${ano}-${String(mesFim).padStart(2, '0')}-${ultimoDia}`;

    return {
      startDate,
      endDate,
      meses,
      label,
      ano,
      mesInicio,
      mesFim,
    };
  }, [filtro]);

  // Funções para atualizar o filtro
  const setTipo = (tipo: TipoCompetencia) => {
    setFiltro(prev => ({ ...prev, tipo }));
  };

  const setAno = (ano: number) => {
    setFiltro(prev => ({ ...prev, ano }));
  };

  const setMes = (mes: number) => {
    setFiltro(prev => ({ ...prev, mes }));
  };

  const setTrimestre = (trimestre: 1 | 2 | 3 | 4) => {
    setFiltro(prev => ({ ...prev, trimestre }));
  };

  const setSemestre = (semestre: 1 | 2) => {
    setFiltro(prev => ({ ...prev, semestre }));
  };

  // Anos disponíveis (2023 até ano atual)
  const anosDisponiveis = useMemo(() => {
    const anos: number[] = [];
    for (let a = anoAtual; a >= 2023; a--) {
      anos.push(a);
    }
    return anos;
  }, [anoAtual]);

  return {
    filtro,
    setFiltro,
    range,
    setTipo,
    setAno,
    setMes,
    setTrimestre,
    setSemestre,
    anosDisponiveis,
    MESES_NOME,
    MESES_CURTO,
  };
}

export default useCompetenciaFiltro;
