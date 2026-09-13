import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import { useMetasKPI, type MetasKPI } from '@/hooks/useMetasKPI';
import { useAuth } from '@/contexts/AuthContext';
import { fetchKPIsAlunosCanonicos, type FonteKPIAlunos } from '@/hooks/useKPIsAlunosCanonicos';
import {
  fetchComercialOperacionalResumoV2,
  fetchExperimentaisDiagnosticoComercialV2,
  useComercialOperacionalResumoV2,
} from '@/hooks/useComercialOperacionalResumoV2';
import {
  ehMatriculaComercialCanonica,
  isTipoMatriculaForaNovaComercial,
} from '@/lib/comercialMatriculasCanonicas';
import { filtrarRetencaoCanonica } from '@/lib/atividadesExtras';
import { calcularTicketMedioCanonico } from '@/lib/ticketMedioCanonico';
import { anexarCursosMovimentacoesAdmin } from '@/lib/movimentacoesAdminCursos';
import { buscarResumoDashboardProfessoresCanonico } from '@/lib/dashboardProfessoresResumoCanonico';
import { useHealthScoreProfessorV3Performance } from '@/hooks/useHealthScoreProfessorV3Performance';
import { getHealthScoreV3Period, type HealthScoreV3Period } from '@/lib/healthScoreProfessorV3Periodos';

export interface OutletContextType {
  filtroAtivo: string | null;
  competencia: {
    filtro: CompetenciaFiltro;
    range: CompetenciaRange;
    anosDisponiveis: number[];
    setTipo: (tipo: TipoCompetencia) => void;
    setAno: (ano: number) => void;
    setMes: (mes: number) => void;
    setTrimestre: (trimestre: 1 | 2 | 3 | 4) => void;
    setSemestre: (semestre: 1 | 2) => void;
    setDataInicio: (data: Date | undefined) => void;
    setDataFim: (data: Date | undefined) => void;
  };
}

export interface DadosGestao {
  alunos_ativos: number;
  alunos_pagantes: number;
  matriculas_mes: number;
  evasoes_mes: number;
  ticket_medio: number;
}

export interface DadosComercial {
  leads_mes: number;
  experimentais_realizadas: number;
  experimentais_status_operacional?: number;
  taxa_conversao: number;
  taxa_exp_mat_liberada?: boolean;
  denominador_exp_mat?: number;
  conversoes_exp_mat?: number;
  pendencias_exp_mat?: number;
  ticket_passaporte: number;
}

export interface DadosProfessores {
  total_professores: number;
  media_alunos_professor: number;
  taxa_renovacao: number;
  media_alunos_turma: number | null;
  professores_ativos_ids: number[];
}

export interface Alerta {
  tipo_alerta: string;
  severidade: 'critico' | 'atencao' | 'informativo';
  unidade_id: string;
  unidade_nome: string;
  quantidade: number;
  descricao: string;
  detalhe: string;
  valor_atual: number | null;
  valor_meta: number | null;
  data_referencia: string;
}

export interface ResumoUnidade {
  unidade: string;
  unidade_id: string;
  alunos_ativos: number;
  alunos_pagantes: number;
  ticket_medio: number;
  ticket_denominador_pagantes?: number | null;
  ticket_denominador_faturas?: number;
  mrr_atual?: number;
  faturamento_previsto: number;
  tempo_medio: number;
}

export interface FonteKPIAlunosState {
  fonte: FonteKPIAlunos;
  label: string;
  alertas: string[];
}

/**
 * Contrato de leitura do Dashboard. Desktop e mobile consomem ESTE objeto —
 * nenhuma das duas telas refaz consulta nem recalcula KPI por conta própria.
 */
export interface DashboardDados {
  loading: boolean;
  alertas: Alerta[];
  dadosGestao: DadosGestao | null;
  fonteKpisAlunos: FonteKPIAlunosState | null;
  dadosComercial: DadosComercial | null;
  dadosProfessores: DadosProfessores | null;
  evolucaoAlunos: { mes: string; valor: number }[];
  funilComercial: { etapa: string; valor: number; cor: string }[];
  resumoUnidades: ResumoUnidade[];
  metas: MetasKPI;
  labelPeriodo: string;
  unidade: string;
  competencia: OutletContextType['competencia'] | undefined;
  anosDisponiveis: number[];
  setTipo: ((tipo: TipoCompetencia) => void) | undefined;
  setAno: ((ano: number) => void) | undefined;
  setMes: ((mes: number) => void) | undefined;
  setTrimestre: ((trimestre: 1 | 2 | 3 | 4) => void) | undefined;
  setSemestre: ((semestre: 1 | 2) => void) | undefined;
  setDataInicio: ((data: Date | undefined) => void) | undefined;
  setDataFim: ((data: Date | undefined) => void) | undefined;
  leadsComercialV2: number | null;
  loadingLeadsComercialV2: boolean;
  errorLeadsComercialV2: string | null;
  healthScoreV3Enabled: boolean;
  healthScoreV3Loading: boolean;
  healthScoreV3Period: HealthScoreV3Period;
  healthScoreV3Summary: {
    score: number | null;
    visible: number;
    total: number;
    official: boolean;
  };
  taxaExpMatLiberada: boolean;
  taxaExpMatSemBase: boolean;
  modalMatriculas: boolean;
  setModalMatriculas: (aberto: boolean) => void;
  modalEvasoes: boolean;
  setModalEvasoes: (aberto: boolean) => void;
  modalExperimentais: boolean;
  setModalExperimentais: (aberto: boolean) => void;
  modalConversao: boolean;
  setModalConversao: (aberto: boolean) => void;
  dadosModalMatriculas: any[];
  dadosModalEvasoes: any[];
  dadosModalExperimentais: any[];
  dadosModalConversao: any[];
  carregandoModal: boolean;
  fetchMatriculas: () => Promise<void>;
  fetchEvasoes: () => Promise<void>;
  fetchExperimentais: () => Promise<void>;
  fetchConversao: () => Promise<void>;
}

export function useDashboardDados(): DashboardDados {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dadosGestao, setDadosGestao] = useState<DadosGestao | null>(null);
  const [fonteKpisAlunos, setFonteKpisAlunos] = useState<FonteKPIAlunosState | null>(null);
  const [dadosComercial, setDadosComercial] = useState<DadosComercial | null>(null);
  const [dadosProfessores, setDadosProfessores] = useState<DadosProfessores | null>(null);
  const [evolucaoAlunos, setEvolucaoAlunos] = useState<{ mes: string; valor: number }[]>([]);
  const [funilComercial, setFunilComercial] = useState<{ etapa: string; valor: number; cor: string }[]>([]);
  const [resumoUnidades, setResumoUnidades] = useState<ResumoUnidade[]>([]);
  const [modalMatriculas, setModalMatriculas] = useState(false);
  const [modalEvasoes, setModalEvasoes] = useState(false);
  const [dadosModalMatriculas, setDadosModalMatriculas] = useState<any[]>([]);
  const [dadosModalEvasoes, setDadosModalEvasoes] = useState<any[]>([]);
  const [modalExperimentais, setModalExperimentais] = useState(false);
  const [dadosModalExperimentais, setDadosModalExperimentais] = useState<any[]>([]);
  const [modalConversao, setModalConversao] = useState(false);
  const [dadosModalConversao, setDadosModalConversao] = useState<any[]>([]);
  const [carregandoModal, setCarregandoModal] = useState(false);

  // Pegar filtros do contexto
  const context = useOutletContext<OutletContextType>();
  const { isAdmin, unidadeId } = useAuth();
  const filtroAtivo = context?.filtroAtivo ?? null;
  const competencia = context?.competencia;
  const ano = competencia?.filtro?.ano || new Date().getFullYear();
  // IMPORTANTE: usar mesInicio e mesFim do RANGE, não do filtro
  // O filtro.mes é o mês selecionado no dropdown, mas o range calcula o período correto
  const mesInicio = competencia?.range?.mesInicio || competencia?.filtro?.mes || new Date().getMonth() + 1;
  const mesFim = competencia?.range?.mesFim || mesInicio;
  const mes = mesInicio; // Para compatibilidade com código existente
  // Usuário de unidade NUNCA cai em 'todos'. `filtroAtivo` é null em duas situações
  // distintas — "admin escolheu consolidado" e "o auth ainda não carregou quem é o
  // usuário" — e o `|| 'todos'` antigo tratava as duas como consolidado. Para um perfil
  // de unidade isso pede a rede inteira em nome de quem só pode ver a própria unidade, e
  // os guards das RPCs recusam com 403 "unidade fora do escopo do usuario" (atinge
  // get_health_score_professor_v3_performance e get_conciliacao_experimentais_v2).
  // Mesmo padrão já usado em AdministrativoPage.tsx.
  const unidadeResolvida = isAdmin ? (filtroAtivo ?? 'todos') : unidadeId;
  const unidadePronta = unidadeResolvida !== null;
  const unidade = unidadeResolvida ?? 'todos';
  const labelPeriodo = { todos: 'Todos', diario: 'Dia', mensal: 'Mês', trimestral: 'Trim', semestral: 'Sem', anual: 'Ano', personalizado: 'Período' }[competencia?.filtro?.tipo || 'mensal'] || 'Mês';
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  
  // Funções de controle do filtro de competência
  const anosDisponiveis = competencia?.anosDisponiveis || [2023, 2024, 2025, 2026];
  const setTipo = competencia?.setTipo;
  const setAno = competencia?.setAno;
  const setMes = competencia?.setMes;
  const setTrimestre = competencia?.setTrimestre;
  const setSemestre = competencia?.setSemestre;
  const setDataInicio = competencia?.setDataInicio;
  const setDataFim = competencia?.setDataFim;
  const {
    leadsEntrantes: leadsComercialV2,
    loading: loadingLeadsComercialV2,
    error: errorLeadsComercialV2,
  } = useComercialOperacionalResumoV2({
    unidadeId: unidade,
    ano,
    mesInicio,
    mesFim,
    enabled: unidadePronta,
  });
  const healthScoreV3Periodicidade = competencia?.filtro?.tipo === 'trimestral'
    ? 'ciclo'
    : 'mensal';
  const healthScoreV3ReferenceMonth = healthScoreV3Periodicidade === 'ciclo'
    ? Math.min(12, mesInicio + 1)
    : mesInicio;
  const healthScoreV3Enabled = unidadePronta
    && (competencia?.filtro?.tipo === 'mensal'
      || competencia?.filtro?.tipo === 'trimestral');
  const healthScoreV3Period = useMemo(
    () => getHealthScoreV3Period(ano, healthScoreV3ReferenceMonth, healthScoreV3Periodicidade),
    [ano, healthScoreV3Periodicidade, healthScoreV3ReferenceMonth],
  );
  const {
    snapshots: healthScoreV3Snapshots,
    loading: healthScoreV3Loading,
  } = useHealthScoreProfessorV3Performance({
    competencia: `${ano}-${String(healthScoreV3ReferenceMonth).padStart(2, '0')}`,
    unidadeId: unidade === 'todos' ? null : unidade,
    periodicidade: healthScoreV3Periodicidade,
    enabled: healthScoreV3Enabled,
  });
  const healthScoreV3Summary = useMemo(() => {
    const professoresAtivos = new Set(dadosProfessores?.professores_ativos_ids ?? []);
    const snapshotsEquipe = healthScoreV3Snapshots.filter(
      (snapshot) => professoresAtivos.has(snapshot.professorId),
    );
    const visible = snapshotsEquipe.filter(
      (snapshot) => snapshot.scoreExibivel && snapshot.score !== null,
    );
    const score = visible.length > 0
      ? visible.reduce((total, snapshot) => total + Number(snapshot.score), 0) / visible.length
      : null;
    const official = visible.length > 0 && visible.every(
      (snapshot) => snapshot.estadoPublicacao === 'oficial',
    );
    return { score, visible: visible.length, total: snapshotsEquipe.length, official };
  }, [dadosProfessores?.professores_ativos_ids, healthScoreV3Snapshots]);

  // Fetch matrículas do período para o modal
  const fetchMatriculas = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('alunos')
        .select(`
          nome, data_matricula, valor_parcela,
          unidades:unidade_id!inner(nome),
          cursos:curso_id!left(nome, is_projeto_banda),
          tipos_matricula:tipo_matricula_id!left(codigo)
        `)
        .not('data_matricula', 'is', null)
        .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
        .gte('data_matricula', dataInicio)
        .lt('data_matricula', dataFimStr)
        .order('data_matricula', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      const filtrados = (data || []).filter((a: any) => {
        const codigo = a.tipos_matricula?.codigo;
        if (isTipoMatriculaForaNovaComercial(codigo)) return false;
        if (a.cursos?.is_projeto_banda) return false;
        if (a.cursos?.nome?.toLowerCase().includes('canto coral')) return false;
        return true;
      });
      setDadosModalMatriculas(filtrados.map((a: any) => ({
        nome: a.nome,
        unidade: a.unidades?.nome || '—',
        data_matricula: a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        curso: a.cursos?.nome || '—',
        valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : '—',
        _valor_raw: a.valor_parcela ? Number(a.valor_parcela) : 0,
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Fetch evasões do período para o modal
  const fetchEvasoes = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('movimentacoes_admin')
        .select(`
          aluno_nome, data, motivo, tipo, curso_id,
          unidades:unidade_id!inner(nome)
        `)
        .in('tipo', ['evasao', 'nao_renovacao'])
        .gte('data', dataInicio)
        .lt('data', dataFimStr)
        .order('data', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      const dataComCursos = await anexarCursosMovimentacoesAdmin(data || []);
      setDadosModalEvasoes(filtrarRetencaoCanonica(dataComCursos).map((m: any) => ({
        nome: m.aluno_nome || '—',
        unidade: m.unidades?.nome || '—',
        data_evasao: m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        tipo: m.tipo === 'evasao' ? 'Evasão' : 'Não Renovação',
        _tipo_raw: m.tipo,
        motivo: m.motivo || '—',
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Lista operacional para o modal; o KPI canônico usa a camada v2 de presença.
  const fetchExperimentais = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('leads')
        .select(`
          nome, telefone, data_contato, status, quantidade,
          unidades:unidade_id!inner(nome),
          cursos:curso_interesse_id!left(nome),
          canais_origem:canal_origem_id!left(nome)
        `)
        .in('status', ['experimental_realizada', 'compareceu', 'visita_escola'])
        .gte('data_contato', dataInicio)
        .lt('data_contato', dataFimStr)
        .order('data_contato', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalExperimentais((data || []).map((l: any) => ({
        nome: l.nome || '—',
        unidade: l.unidades?.nome || '—',
        data: l.data_contato ? new Date(l.data_contato + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
        curso: l.cursos?.nome || '—',
        canal: l.canais_origem?.nome || '—',
        status: l.status === 'visita_escola' ? 'Visita' : 'Realizada',
        _status_raw: l.status,
      })));
    } finally {
      setCarregandoModal(false);
    }
  };

  // Detalhe da Taxa de Conversão: leads que fizeram experimental no período,
  // classificados em "Matriculou" / "Não matriculou".
  // Espelha a fórmula: denominador = experimental_realizada=true; numerador = desses, status matriculado/convertido.
  const fetchConversao = async () => {
    setCarregandoModal(true);
    try {
      const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
      const dataFimStr = mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`;
      let query = supabase
        .from('leads')
        .select(`
          id, nome, telefone, data_contato, data_experimental, data_conversao, status, quantidade,
          experimental_realizada, faltou_experimental,
          unidades:unidade_id!inner(nome),
          cursos:curso_interesse_id!left(nome),
          canais_origem:canal_origem_id!left(nome)
        `)
        .eq('experimental_realizada', true)
        .gte('data_contato', dataInicio)
        .lt('data_contato', dataFimStr)
        .order('data_experimental', { ascending: false, nullsFirst: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data } = await query;
      setDadosModalConversao((data || []).map((l: any) => {
        const matriculou = ['matriculado', 'convertido'].includes(l.status || '');
        return {
          nome: l.nome || '—',
          unidade: l.unidades?.nome || '—',
          data_exp: l.data_experimental ? new Date(l.data_experimental + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
          data_matr: l.data_conversao ? new Date(l.data_conversao + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
          curso: l.cursos?.nome || '—',
          canal: l.canais_origem?.nome || '—',
          resultado: matriculou ? 'Matriculou' : 'Não matriculou',
          _matriculou: matriculou,
        };
      }));
    } finally {
      setCarregandoModal(false);
    }
  };

  useEffect(() => {
    // Sem unidade resolvida não há o que buscar: disparar aqui pediria a rede inteira em
    // nome de um usuário de unidade e voltaria 403. O efeito roda de novo quando o auth
    // resolve, porque `unidade` está nas dependências.
    if (!unidadePronta) return;

    async function fetchDados() {
      try {
        const hoje = new Date();
        const hojeAno = hoje.getFullYear();
        const hojeMes = hoje.getMonth() + 1;
        const isPeriodoAtual = ano === hojeAno && mesInicio === hojeMes && mesFim === hojeMes;

        // Buscar alertas inteligentes da nova view
        let alertasQuery = supabase
          .from('vw_alertas_inteligentes')
          .select('*');
        
        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          alertasQuery = alertasQuery.eq('unidade_id', unidade);
        }
        
        const { data: alertasData } = await alertasQuery.limit(10);

        if (alertasData) {
          setAlertas(alertasData as Alerta[]);
        }

        // ===== DADOS DE GESTÃO =====
        const kpisAlunos = await fetchKPIsAlunosCanonicos({
          unidadeId: unidade,
          ano,
          mes: mesInicio,
          mesFim,
        });

        setFonteKpisAlunos({
          fonte: kpisAlunos.fonte,
          label: kpisAlunos.fonteLabel,
          alertas: kpisAlunos.alertasFonte,
        });

        if (kpisAlunos.fonte !== 'indisponivel') {
          setDadosGestao({
            alunos_ativos: Math.round(kpisAlunos.alunosAtivos),
            alunos_pagantes: Math.round(kpisAlunos.alunosPagantes),
            matriculas_mes: kpisAlunos.novasMatriculas,
            evasoes_mes: kpisAlunos.evasoes,
            ticket_medio: kpisAlunos.ticketMedio,
          });
        } else {
          setDadosGestao(null);
          if (!isPeriodoAtual) {
            setResumoUnidades([]);
          }
        }

        // ===== DADOS COMERCIAIS =====
        // Fonte canônica v2. Não usar snapshots legados como fallback silencioso.
        setDadosComercial(null);
        setFunilComercial([]);

        try {
          const startDateComercial = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
          const endDateComercial = `${ano}-${String(mesFim).padStart(2, '0')}-${new Date(ano, mesFim, 0).getDate()}`;

          const [resumoComercialV2, diagnosticoExperimentaisV2] = await Promise.all([
            fetchComercialOperacionalResumoV2({
              unidadeId: unidade,
              ano,
              mesInicio,
              mesFim,
            }),
            fetchExperimentaisDiagnosticoComercialV2({
              unidadeId: unidade,
              ano,
              mesInicio,
              mesFim,
            }),
          ]);

          let passaporteQueryV2 = supabase
            .from('alunos')
            .select(`
              valor_passaporte,
              valor_parcela,
              is_segundo_curso,
              status,
              cursos:curso_id!left(nome, is_projeto_banda),
              tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio)
            `)
            .gte('data_matricula', startDateComercial)
            .lte('data_matricula', endDateComercial)
            .gt('valor_passaporte', 0);

          if (unidade !== 'todos') {
            passaporteQueryV2 = passaporteQueryV2.eq('unidade_id', unidade);
          }

          const { data: passaporteV2Data } = await passaporteQueryV2;
          const passaportesCanonicos = (passaporteV2Data || []).filter(ehMatriculaComercialCanonica);
          const ticketPassaporteV2 =
            passaportesCanonicos.length > 0
              ? passaportesCanonicos.reduce((sum: number, a: any) => sum + Number(a.valor_passaporte), 0) /
                passaportesCanonicos.length
              : 0;

          const matriculasCanonicas =
            kpisAlunos.fonte !== 'indisponivel' ? kpisAlunos.novasMatriculas : 0;

          setDadosComercial({
            leads_mes: resumoComercialV2.leadsEntrantes,
            experimentais_realizadas: diagnosticoExperimentaisV2.realizadasPresencaConfirmada,
            experimentais_status_operacional: diagnosticoExperimentaisV2.realizadasStatusOperacional,
            taxa_conversao: diagnosticoExperimentaisV2.taxaExpMatLiberada
              ? diagnosticoExperimentaisV2.taxaExpMatCanonica || 0
              : 0,
            taxa_exp_mat_liberada: diagnosticoExperimentaisV2.taxaExpMatLiberada,
            denominador_exp_mat: diagnosticoExperimentaisV2.denominadorTaxaExpMat,
            conversoes_exp_mat: diagnosticoExperimentaisV2.conversoesExpMatCanonicas,
            pendencias_exp_mat: diagnosticoExperimentaisV2.pendenciasTaxaExpMat,
            ticket_passaporte: Math.round(ticketPassaporteV2),
          });

          setFunilComercial([
            { etapa: 'Leads', valor: resumoComercialV2.leadsEntrantes, cor: '#3b82f6' },
            {
              etapa: 'Presença confirmada',
              valor: diagnosticoExperimentaisV2.realizadasPresencaConfirmada,
              cor: '#8b5cf6',
            },
            { etapa: 'Matrículas', valor: matriculasCanonicas, cor: '#10b981' },
          ]);
        } catch (err) {
          console.error('Erro ao aplicar camada comercial v2 no Dashboard:', err);
        }

        // ===== DADOS DE PROFESSORES =====
        // O Dashboard lê apenas os numeradores dos três cartões. A RPC enxuta
        // preserva a carteira, a média ponderada de turma e a renovação sem
        // recalcular presença e experimentais, que pertencem a outras telas.
        const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mesFim, 0).getDate();
        const endDate = `${ano}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
        const [profsR, profUnidR, resumoProfessores] = await Promise.all([
          supabase.from('professores').select('id, nome, ativo').eq('ativo', true),
          supabase
            .from('professores_unidades')
            .select('professor_id, unidade_id')
            .eq('emusys_ativo', true)
            .neq('validacao_status', 'ignorado'),
          buscarResumoDashboardProfessoresCanonico({
            ano,
            mes: mesInicio,
            unidadeId: unidade,
            dataInicio: startDate,
            dataFim: endDate,
          }),
        ]);

        const professoresAtivos = new Set((profsR.data || []).map((p: any) => Number(p.id)));
        const professoresRelacionados = new Set(
          (profUnidR.data || [])
            .filter((pu: any) => unidade === 'todos' || pu.unidade_id === unidade)
            .map((pu: any) => Number(pu.professor_id))
            .filter((id: number) => professoresAtivos.has(id))
        );
        const totalProfs = professoresRelacionados.size;
        const totalRenovacoes = resumoProfessores.renovacoes + resumoProfessores.nao_renovacoes;

        setDadosProfessores({
          total_professores: totalProfs,
          media_alunos_professor: totalProfs > 0
            ? Math.round((resumoProfessores.carteira_alunos / totalProfs) * 10) / 10
            : 0,
          taxa_renovacao: totalRenovacoes > 0
            ? (resumoProfessores.renovacoes / totalRenovacoes) * 100
            : 0,
          media_alunos_turma: resumoProfessores.turmas_elegiveis_media > 0
            ? resumoProfessores.alunos_via_turmas / resumoProfessores.turmas_elegiveis_media
            : 0,
          professores_ativos_ids: Array.from(professoresRelacionados),
        });

        // ===== EVOLUÇÃO DE ALUNOS ATIVOS (12 meses) =====
        // Histórico vem de dados_mensais; mês corrente vem da fonte canônica viva.
        // IMPORTANTE: Filtrar por unidade se não for consolidado
        let evolucaoQuery = supabase
          .from('dados_mensais')
          .select('ano, mes, alunos_ativos, unidade_id')
          .gte('ano', ano - 1)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true });

        if (unidade !== 'todos') {
          evolucaoQuery = evolucaoQuery.eq('unidade_id', unidade);
        }

        const { data: evolucaoData } = await evolucaoQuery;
        const ativosAtual = kpisAlunos.fonte !== 'indisponivel'
          ? Math.round(kpisAlunos.alunosAtivos)
          : 0;

        if (evolucaoData) {
          const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          // Excluir mês corrente do histórico — será sobrescrito pelo valor em tempo real
          const dadosHistoricos = evolucaoData.filter(
            (d: any) => !(d.ano === hojeAno && d.mes === hojeMes)
          );

          const agrupado = dadosHistoricos.reduce((acc: Record<string, number>, d: any) => {
            const key = `${mesesNomes[d.mes - 1]}/${String(d.ano).slice(-2)}`;
            acc[key] = (acc[key] || 0) + (d.alunos_ativos || 0);
            return acc;
          }, {});

          const keyAtual = `${mesesNomes[hojeMes - 1]}/${String(hojeAno).slice(-2)}`;
          agrupado[keyAtual] = ativosAtual;

          const evolucao = Object.entries(agrupado)
            .slice(-12)
            .map(([mes, valor]) => ({ mes, valor: valor as number }));

          setEvolucaoAlunos(evolucao);
        }

        // ===== RESUMO POR UNIDADE (do período selecionado) =====
        // Usar isPeriodoAtual já calculado acima para decidir fonte de dados
        // IMPORTANTE: Filtrar por unidade se não for consolidado

        if (kpisAlunos.fonte !== 'indisponivel') {
          // Para período atual, usar fonte canônica viva (dados em tempo real)
          const resumo: ResumoUnidade[] = kpisAlunos.porUnidade.map(row => ({
            unidade: row.unidade_nome,
            unidade_id: row.unidade_id,
            alunos_ativos: Math.round(row.alunosAtivos),
            alunos_pagantes: Math.round(row.alunosPagantes),
            ticket_medio: row.ticketMedio,
            ticket_denominador_pagantes: row.ticketDenominadorPagantes ?? null,
            ticket_denominador_faturas: row.ticketDenominadorFaturas,
            mrr_atual: row.mrr,
            faturamento_previsto: row.faturamentoPrevisto,
            tempo_medio: row.tempoPermanencia,
          }));
          setResumoUnidades(resumo);
        } else {
          // Para períodos históricos, usar dados_mensais
          // Filtrar unidades se não for consolidado
          let unidadesQuery = supabase
            .from('unidades')
            .select('id, nome')
            .eq('ativo', true);
          
          if (unidade !== 'todos') {
            unidadesQuery = unidadesQuery.eq('id', unidade);
          }
          
          const { data: unidadesData } = await unidadesQuery;

          if (unidadesData) {
            // Filtrar dados_mensais por unidade se não for consolidado
            let dadosMensaisQuery = supabase
              .from('dados_mensais')
              .select('*')
              .eq('ano', ano)
              .gte('mes', mes)
              .lte('mes', mesFim);
            
            if (unidade !== 'todos') {
              dadosMensaisQuery = dadosMensaisQuery.eq('unidade_id', unidade);
            }
            
            const { data: dadosMensaisUnidades } = await dadosMensaisQuery;

            if (dadosMensaisUnidades && dadosMensaisUnidades.length > 0) {
              const resumo: ResumoUnidade[] = unidadesData.map((u: any) => {
                const dadosUnidade = dadosMensaisUnidades.filter((d: any) => d.unidade_id === u.id);
                const alunosAtivos = dadosUnidade.reduce((acc: number, d: any) => acc + (d.alunos_ativos || 0), 0);
                const alunosPagantes = dadosUnidade.reduce((acc: number, d: any) => acc + (d.alunos_pagantes || 0), 0);
                const linhasTicket = dadosUnidade.map((d: any) => ({
                  mrr: Number(d.mrr_contratual ?? d.faturamento_estimado) || 0,
                  ticketMedio: Number(d.ticket_medio_contratual ?? d.ticket_medio) || 0,
                  ticketDenominadorPagantes: d.ticket_denominador_pagantes ?? null,
                }));
                const faturamento = linhasTicket.reduce((total, linha) => total + linha.mrr, 0);
                const ticketMedio = calcularTicketMedioCanonico(linhasTicket);
                const ticketDenominadorPagantes = dadosUnidade.every(
                  (d: any) => d.ticket_denominador_pagantes !== null && d.ticket_denominador_pagantes !== undefined
                )
                  ? dadosUnidade.reduce((total: number, d: any) => total + Number(d.ticket_denominador_pagantes), 0)
                  : null;

                return {
                  unidade: u.nome,
                  unidade_id: u.id,
                  alunos_ativos: alunosAtivos,
                  alunos_pagantes: alunosPagantes,
                  ticket_medio: ticketMedio,
                  ticket_denominador_pagantes: ticketDenominadorPagantes,
                  faturamento_previsto: faturamento,
                  tempo_medio: 0
                };
              });
              setResumoUnidades(resumo);
            } else {
              setResumoUnidades([]);
            }
          }
        }

      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFim, unidade, unidadePronta]);

  const taxaExpMatLiberada = dadosComercial?.taxa_exp_mat_liberada === true;
  const taxaExpMatSemBase = Boolean(
    dadosComercial &&
      !taxaExpMatLiberada &&
      (dadosComercial.denominador_exp_mat ?? 0) === 0 &&
      (dadosComercial.pendencias_exp_mat ?? 0) === 0,
  );

  return {
    loading,
    alertas,
    dadosGestao,
    fonteKpisAlunos,
    dadosComercial,
    dadosProfessores,
    evolucaoAlunos,
    funilComercial,
    resumoUnidades,
    metas,
    labelPeriodo,
    unidade,
    competencia,
    anosDisponiveis,
    setTipo,
    setAno,
    setMes,
    setTrimestre,
    setSemestre,
    setDataInicio,
    setDataFim,
    leadsComercialV2,
    loadingLeadsComercialV2,
    errorLeadsComercialV2,
    healthScoreV3Enabled,
    healthScoreV3Loading,
    healthScoreV3Period,
    healthScoreV3Summary,
    taxaExpMatLiberada,
    taxaExpMatSemBase,
    modalMatriculas,
    setModalMatriculas,
    modalEvasoes,
    setModalEvasoes,
    modalExperimentais,
    setModalExperimentais,
    modalConversao,
    setModalConversao,
    dadosModalMatriculas,
    dadosModalEvasoes,
    dadosModalExperimentais,
    dadosModalConversao,
    carregandoModal,
    fetchMatriculas,
    fetchEvasoes,
    fetchExperimentais,
    fetchConversao,
  };
}
