import { useState, useEffect, useMemo } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock, Users, Baby, GraduationCap, AlertTriangle, Info, Lock, Unlock, Headphones, MessageSquare, Timer, CheckCircle2, Building2, Inbox } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useMetasKPI } from '@/hooks/useMetasKPI';
import { getCompetenciaAbertaAlertCopy, useCompetenciaMensalStatus } from '@/hooks/useCompetenciaMensalStatus';
import { useChatwootAtendimentoInsights } from '@/hooks/useChatwootAtendimentoInsights';
import { useUnidades } from '@/hooks/useSupabase';
import {
  formatarDuracaoSegundos,
  type AgenteAtendimento,
  type CaixaAtendimento,
  type UnidadeAtendimento,
} from '@/lib/chatwootAtendimento';
import {
  fetchComercialOperacionalResumoV2,
  fetchExperimentaisDiagnosticoComercialV2,
} from '@/hooks/useComercialOperacionalResumoV2';
import {
  calcularFinanceiroMatriculasCanonicas,
  toComercialMoneyNumber as toNumber,
} from '@/lib/comercialMatriculasCanonicas';

interface TabComercialProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'leads' | 'experimentais' | 'matriculas' | 'atendimento';

const subTabs = [
  { id: 'leads' as const, label: 'Leads', icon: Phone },
  { id: 'experimentais' as const, label: 'Experimentais', icon: Calendar },
  { id: 'matriculas' as const, label: 'Matrículas', icon: UserPlus },
  { id: 'atendimento' as const, label: 'Atendimento', icon: Headphones },
];

interface DadosComercial {
  // Leads
  total_leads: number;
  leads_arquivados: number;
  leads_ativos: number;
  taxa_conversao_lead_exp: number;
  leads_por_canal: { name: string; value: number }[];
  leads_por_curso: { name: string; value: number }[];
  leads_serie_mensal: { name: string; leads: number }[];
  motivos_arquivamento: { name: string; value: number }[];
  
  // Experimentais
  experimentais_marcadas: number;
  experimentais_realizadas: number;
  faltaram: number;
  taxa_showup: number;
  taxa_conversao_exp_mat: number;
  experimentais_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  experimentais_por_canal: { name: string; value: number }[];
  experimentais_diagnostico_v2: {
    agendadasEventos: number;
    noShowStatusOperacional: number;
    realizadasStatusOperacional: number;
    realizadasPresencaConfirmada: number;
    statusOperacionalSemPresenca: number;
    semAlunoId: number;
    conversoesCanonicasComVinculoPresenca: number;
    conversoesPendentesVinculo: number;
    realizadasSemConversaoAparente: number;
    decisoesHumanasExcluidasDenominador: number;
    decisoesHumanasPendentesCanonizacao: number;
    taxaExpMatMinimaCanonica: number | null;
    taxaExpMatMaximaAposRevisao: number | null;
    denominadorTaxaExpMat: number;
    conversoesExpMatCanonicas: number;
    taxaExpMatCanonica: number | null;
    pendenciasTaxaExpMat: number;
    taxaExpMatLiberada: boolean;
    taxaExpMatStatus: string;
    presencasEmusysExperimentaisPresentes: number;
    presencasEmusysComFunil: number;
    presencasEmusysSemFunil: number;
  };
  
  // Matrículas
  novas_matriculas: number;
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_canal: { name: string; value: number }[];
  matriculas_por_canal_origem: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  matriculas_por_horario: { name: string; value: number }[];
  matriculas_por_faixa_etaria: { name: string; value: number }[];
  ticket_medio_passaporte: number;
  ticket_medio_parcela: number;
  qtd_passaportes_vendidos: number;
  motivos_nao_matricula: { name: string; value: number }[];
  
  // Faturamento
  faturamento_passaportes: number;
  faturamento_parcelas: number;
  faturamento_total: number;
  projecao_mensal: number;
}

// Interface para dados comparativos
interface DadosComparativo {
  total_leads: number;
  experimentais_realizadas: number;
  novas_matriculas: number;
  ticket_medio_parcela: number;
  ticket_medio_passaporte: number;
  label: string;
}

const experimentaisDiagnosticoVazio: DadosComercial['experimentais_diagnostico_v2'] = {
  agendadasEventos: 0,
  noShowStatusOperacional: 0,
  realizadasStatusOperacional: 0,
  realizadasPresencaConfirmada: 0,
  statusOperacionalSemPresenca: 0,
  semAlunoId: 0,
  conversoesCanonicasComVinculoPresenca: 0,
  conversoesPendentesVinculo: 0,
  realizadasSemConversaoAparente: 0,
  decisoesHumanasExcluidasDenominador: 0,
  decisoesHumanasPendentesCanonizacao: 0,
  taxaExpMatMinimaCanonica: null,
  taxaExpMatMaximaAposRevisao: null,
  denominadorTaxaExpMat: 0,
  conversoesExpMatCanonicas: 0,
  taxaExpMatCanonica: null,
  pendenciasTaxaExpMat: 0,
  taxaExpMatLiberada: false,
  taxaExpMatStatus: 'bloqueada_regra_canonica',
  presencasEmusysExperimentaisPresentes: 0,
  presencasEmusysComFunil: 0,
  presencasEmusysSemFunil: 0,
};

const calcularIdade = (matricula: any, anoReferencia: number, mesReferencia: number): number | null => {
  const idadeAtual = Number(matricula.idade_atual);
  if (Number.isFinite(idadeAtual) && idadeAtual > 0) return idadeAtual;

  if (!matricula.data_nascimento) return null;

  const nascimento = new Date(`${matricula.data_nascimento}T12:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;

  const referencia = new Date(anoReferencia, mesReferencia - 1, 1);
  let idade = referencia.getFullYear() - nascimento.getFullYear();
  const fezAniversario =
    referencia.getMonth() > nascimento.getMonth() ||
    (referencia.getMonth() === nascimento.getMonth() && referencia.getDate() >= nascimento.getDate());

  if (!fezAniversario) idade -= 1;
  return idade >= 0 ? idade : null;
};

const classificarEscolaMatricula = (
  matricula: any,
  anoReferencia: number,
  mesReferencia: number
): 'LAMK' | 'EMLA' | 'NAO_CLASSIFICADO' => {
  const classificacao = String(matricula.classificacao || matricula.tipo_matricula || '').toUpperCase();
  if (classificacao.includes('LAMK')) return 'LAMK';
  if (classificacao.includes('EMLA')) return 'EMLA';

  const idade = calcularIdade(matricula, anoReferencia, mesReferencia);
  if (idade !== null) return idade <= 11 ? 'LAMK' : 'EMLA';

  const cursoNome = String((matricula.cursos as any)?.nome || matricula.curso_nome || '').toLowerCase();
  if (cursoNome.includes('musicalizacao') || cursoNome.includes('musicalização')) return 'LAMK';

  return 'NAO_CLASSIFICADO';
};

// Cor da barra/chip de tempo por faixa de severidade (menor é melhor). Hex alinhados à
// paleta de charts do app (emerald/cyan/amber/rose).
function corTempoAtendimento(seg: number | null): string {
  if (seg === null || !Number.isFinite(seg)) return '#475569'; // slate-600 (sem amostra)
  if (seg < 3600) return '#10b981';   // < 1h  — ótimo
  if (seg < 14400) return '#06b6d4';  // 1–4h  — bom
  if (seg < 86400) return '#f59e0b';  // 4–24h — atenção
  return '#f43f5e';                    // > 24h — crítico
}

// Normaliza o nome de unidade (banco: "Campo Grande") para a chave usada nas caixas ("CG").
function chaveUnidadeAtendimento(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const n = nome.toLowerCase();
  if (n.includes('recreio')) return 'Recreio';
  if (n.includes('barra')) return 'Barra';
  if (n.includes('campo grande') || /\bcg\b/.test(n)) return 'CG';
  return null;
}

type LinhaAtendimento = AgenteAtendimento | CaixaAtendimento | UnidadeAtendimento;
type DimensaoAtendimento = 'unidade' | 'caixa' | 'agente';

const DIMS_ATENDIMENTO = [
  { id: 'unidade' as const, label: 'Unidade', icon: Building2 },
  { id: 'caixa' as const, label: 'Caixa de entrada', icon: Inbox },
  { id: 'agente' as const, label: 'Agente', icon: Users },
];
const HINTS_ATENDIMENTO: Record<DimensaoAtendimento, string> = {
  unidade: 'Agrupa as caixas por unidade (média ponderada por volume)',
  caixa: 'Uma linha por caixa de entrada (dado direto do Chatwoot)',
  agente: 'Uma linha por agente (dado direto do Chatwoot)',
};

export function TabComercialNew({ ano, mes, mesFim, unidade }: TabComercialProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('leads');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosComercial | null>(null);
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  const competenciaMensal = useCompetenciaMensalStatus({
    unidadeId: unidade,
    ano,
    mes,
  });
  const mesFechado = competenciaMensal.bloqueiaEscrita;
  const alertaCompetenciaAberta = getCompetenciaAbertaAlertCopy(ano, mes);
  const competenciaBadgeClasses = competenciaMensal.bloqueiaEscrita
    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
    : 'bg-slate-800/70 border-slate-600 text-slate-300';
  
  // Estados para comparativos históricos
  const [dadosMesAnterior, setDadosMesAnterior] = useState<DadosComparativo | null>(null);
  const [dadosAnoAnterior, setDadosAnoAnterior] = useState<DadosComparativo | null>(null);

  // Usar mesFim se fornecido, senão usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  // Performance de atendimento (Chatwoot) — fetch lazy, só quando a sub-aba está ativa.
  const atendimento = useChatwootAtendimentoInsights({
    ano,
    mesInicio,
    mesFim: mesFinal,
    enabled: activeSubTab === 'atendimento',
  });
  const [dimAtendimento, setDimAtendimento] = useState<DimensaoAtendimento>('unidade');
  const { data: unidadesData } = useUnidades();

  // Deriva a lista da dimensão ativa, aplica o filtro de unidade do topo e calcula KPIs/insight.
  const dadosAtendimento = useMemo(() => {
    const chaveUnidade = unidade === 'todos'
      ? null
      : chaveUnidadeAtendimento(unidadesData.find((u) => u.id === unidade)?.nome);

    let linhas: LinhaAtendimento[];
    let colLabel: string;
    let avisoAgenteSemUnidade = false;

    if (dimAtendimento === 'unidade') {
      linhas = atendimento.unidades;
      if (chaveUnidade) linhas = (linhas as UnidadeAtendimento[]).filter((l) => l.nome === chaveUnidade);
      colLabel = 'Unidade';
    } else if (dimAtendimento === 'caixa') {
      linhas = atendimento.caixas;
      if (chaveUnidade) linhas = (linhas as CaixaAtendimento[]).filter((l) => l.unidade === chaveUnidade);
      colLabel = 'Caixa';
    } else {
      // Agente: o Chatwoot não vincula agente a unidade → mostra todos, com aviso se houver filtro.
      linhas = atendimento.agentes;
      colLabel = 'Agente';
      avisoAgenteSemUnidade = !!chaveUnidade;
    }

    const totConversas = linhas.reduce((s, l) => s + l.conversas, 0);
    const totRespondidas = linhas.reduce((s, l) => s + l.amostraPrimeiraResposta, 0);

    // KPI de 1ª resposta = MEDIANA do conjunto (não é média das medianas). Usa a linha da
    // unidade filtrada, senão o geral (conta inteira). No modo agente, sempre geral.
    const kMediana = chaveUnidade
      ? (atendimento.unidades.find((u) => u.nome === chaveUnidade)?.primeiraRespostaMedianaSeg ?? null)
      : (atendimento.geral?.primeiraRespostaMedianaSeg ?? null);

    // Insight: pior 1ª resposta entre entidades com volume relevante (>=5) e mediana > 8h.
    const pior = linhas
      .filter((l) => l.primeiraRespostaMedianaSeg != null && l.conversas >= 5 && (l.primeiraRespostaMedianaSeg as number) >= 28800)
      .sort((a, b) => (b.primeiraRespostaMedianaSeg as number) - (a.primeiraRespostaMedianaSeg as number))[0] || null;

    // Arrays ordenados + máximos para as barras.
    const porConversas = [...linhas].sort((a, b) => b.conversas - a.conversas);
    const porResposta = linhas.filter((l) => l.primeiraRespostaMedianaSeg != null)
      .sort((a, b) => (b.primeiraRespostaMedianaSeg as number) - (a.primeiraRespostaMedianaSeg as number));
    const maxConv = Math.max(...porConversas.map((l) => l.conversas), 1);
    const maxResp = Math.max(...porResposta.map((l) => l.primeiraRespostaMedianaSeg as number), 1);

    return {
      linhas, colLabel, avisoAgenteSemUnidade, totConversas, totRespondidas, kMediana, pior,
      porConversas, porResposta, maxConv, maxResp,
    };
  }, [dimAtendimento, unidade, unidadesData, atendimento.unidades, atendimento.caixas, atendimento.agentes, atendimento.geral]);

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Calcular datas de início e fim do período
        const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mesFinal, 0).getDate();
        const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

        const resumoLeadsV2 = await fetchComercialOperacionalResumoV2({
          unidadeId: unidade,
          ano,
          mesInicio,
          mesFim: mesFinal,
        });
        const diagnosticoExperimentaisV2 = await fetchExperimentaisDiagnosticoComercialV2({
          unidadeId: unidade,
          ano,
          mesInicio,
          mesFim: mesFinal,
        });
        const experimentaisDiagnosticoV2 = {
          agendadasEventos: diagnosticoExperimentaisV2.agendadasEventos,
          noShowStatusOperacional: diagnosticoExperimentaisV2.noShowStatusOperacional,
          realizadasStatusOperacional: diagnosticoExperimentaisV2.realizadasStatusOperacional,
          realizadasPresencaConfirmada: diagnosticoExperimentaisV2.realizadasPresencaConfirmada,
          statusOperacionalSemPresenca: diagnosticoExperimentaisV2.statusOperacionalSemPresenca,
          semAlunoId: diagnosticoExperimentaisV2.semAlunoId,
          conversoesCanonicasComVinculoPresenca:
            diagnosticoExperimentaisV2.conversoesCanonicasComVinculoPresenca,
          conversoesPendentesVinculo: diagnosticoExperimentaisV2.conversoesPendentesVinculo,
          realizadasSemConversaoAparente:
            diagnosticoExperimentaisV2.realizadasSemConversaoAparente,
          decisoesHumanasExcluidasDenominador:
            diagnosticoExperimentaisV2.decisoesHumanasExcluidasDenominador,
          decisoesHumanasPendentesCanonizacao:
            diagnosticoExperimentaisV2.decisoesHumanasPendentesCanonizacao,
          taxaExpMatMinimaCanonica: diagnosticoExperimentaisV2.taxaExpMatMinimaCanonica,
          taxaExpMatMaximaAposRevisao: diagnosticoExperimentaisV2.taxaExpMatMaximaAposRevisao,
          denominadorTaxaExpMat: diagnosticoExperimentaisV2.denominadorTaxaExpMat,
          conversoesExpMatCanonicas: diagnosticoExperimentaisV2.conversoesExpMatCanonicas,
          taxaExpMatCanonica: diagnosticoExperimentaisV2.taxaExpMatCanonica,
          pendenciasTaxaExpMat: diagnosticoExperimentaisV2.pendenciasTaxaExpMat,
          taxaExpMatLiberada: diagnosticoExperimentaisV2.taxaExpMatLiberada,
          taxaExpMatStatus: diagnosticoExperimentaisV2.taxaExpMatStatus,
          presencasEmusysExperimentaisPresentes:
            diagnosticoExperimentaisV2.presencasEmusysExperimentaisPresentes,
          presencasEmusysComFunil: diagnosticoExperimentaisV2.presencasEmusysComFunil,
          presencasEmusysSemFunil: diagnosticoExperimentaisV2.presencasEmusysSemFunil,
        };
        const leadsPorCanalV2 = resumoLeadsV2.origemCanal.map((item) => ({
          name: item.canal,
          value: item.leads,
        }));
        const leadsSerieMensalV2 = resumoLeadsV2.seriesMensais.map((item) => ({
          name: getMesNomeCurto(item.mes),
          leads: item.leadsEntrantes,
        }));

        // ========== BUSCAR DADOS COMPARATIVOS V2 (somente Leads Entrantes) ==========
        const mesAnterior = mes === 1 ? 12 : mes - 1;
        const anoMesAnterior = mes === 1 ? ano - 1 : ano;
        const [resumoMesAnteriorV2, resumoAnoAnteriorV2] = await Promise.all([
          fetchComercialOperacionalResumoV2({
            unidadeId: unidade,
            ano: anoMesAnterior,
            mesInicio: mesAnterior,
            mesFim: mesAnterior,
          }),
          fetchComercialOperacionalResumoV2({
            unidadeId: unidade,
            ano: ano - 1,
            mesInicio: mes,
            mesFim: mes,
          }),
        ]);
        // Consolidar dados do mês anterior apenas com Leads v2.
        // Experimentais, matrículas e tickets não usam mais snapshot legado como comparativo.
        if (resumoMesAnteriorV2.leadsEntrantes > 0) {
          setDadosMesAnterior({
            total_leads: resumoMesAnteriorV2.leadsEntrantes,
            experimentais_realizadas: 0,
            novas_matriculas: 0,
            ticket_medio_parcela: 0,
            ticket_medio_passaporte: 0,
            label: `${getMesNomeCurto(mesAnterior)}/${String(anoMesAnterior).slice(2)}`,
          });
        } else {
          setDadosMesAnterior(null);
        }

        if (resumoAnoAnteriorV2.leadsEntrantes > 0) {
          setDadosAnoAnterior({
            total_leads: resumoAnoAnteriorV2.leadsEntrantes,
            experimentais_realizadas: 0,
            novas_matriculas: 0,
            ticket_medio_parcela: 0,
            ticket_medio_passaporte: 0,
            label: `${getMesNomeCurto(mes)}/${String(ano - 1).slice(2)}`,
          });
        } else {
          setDadosAnoAnterior(null);
        }

        // ========== DADOS TRANSACIONAIS DO PERIODO ==========
        // Buscar leads
        let leadsQuery = supabase
          .from('leads')
          .select(`
            *,
            canais_origem(nome),
            cursos(nome, is_projeto_banda),
            professores:professor_experimental_id(nome),
            motivos_arquivamento(nome),
            motivos_nao_matricula(nome)
          `)
          .gte('data_contato', startDate)
          .lte('data_contato', endDate);

        if (unidade !== 'todos') {
          leadsQuery = leadsQuery.eq('unidade_id', unidade);
        }

        const { data: leadsData, error: leadsError } = await leadsQuery;

        if (leadsError) throw leadsError;

        // Tickets e faturamento saem da base canonica de matriculas.

        // Buscar matrículas do mês
        let matriculasQuery = supabase
          .from('alunos')
          .select(`
            *,
            cursos(nome, is_projeto_banda),
            canais_origem(nome),
            professores:professor_atual_id(nome),
            tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio)
          `)
          .gte('data_matricula', startDate)
          .lte('data_matricula', endDate);

        if (unidade !== 'todos') {
          matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
        }

        const { data: matriculasData, error: matriculasError } = await matriculasQuery;

        if (matriculasError) throw matriculasError;

        const leads = leadsData || [];
        const matriculas = matriculasData || [];
        const financeiroMatriculas = calcularFinanceiroMatriculasCanonicas(matriculas);
        const matriculasExecutivas = financeiroMatriculas.matriculasCanonicas;

        // Processar Leads
        const totalLeadsLegado = leads.reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const totalLeads = resumoLeadsV2.leadsEntrantes;
        const leadsArquivados = leads.filter(l => l.arquivado === true).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const expMarcadas = leads.filter(l => l.status === 'experimental_agendada').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        // REGRA DE NEGÓCIO: Exp/Visita = realizada + visita_escola (não inclui agendada/faltou)
        const expRealizadas = leads.filter(l => ['experimental_realizada','compareceu','visita_escola'].includes(l.status)).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const faltaram = leads.filter(l => l.status === 'experimental_faltou').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const novasMatriculas = matriculasExecutivas.length;

        // Leads por Curso
        const cursosLeadMap = new Map<string, number>();
        leads.forEach(l => {
          const curso = (l.cursos as any)?.nome || 'Não informado';
          cursosLeadMap.set(curso, (cursosLeadMap.get(curso) || 0) + (l.quantidade || 1));
        });

        // Motivos Arquivamento
        const motivosArqMap = new Map<string, number>();
        leads.filter(l => l.arquivado).forEach(l => {
          const motivo = (l.motivos_arquivamento as any)?.nome || 'Outros';
          motivosArqMap.set(motivo, (motivosArqMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Experimentais por Professor - conta APENAS experimentais realizadas (não convertidos)
        // Regra: experimental_realizada = pessoa veio e fez aula experimental
        // Convertidos/matriculados são contados no gráfico de matrículas, não aqui
        const expProfMap = new Map<string, { id: number; total: number; convertidas: number }>();
        
        // Contar apenas experimentais realizadas (status = experimental_realizada)
        // NÃO incluir visita_escola (é visita, não experimental)
        // NÃO incluir convertido/matriculado (são matrículas, não experimentais)
        leads.filter(l => l.status === 'experimental_realizada').forEach(l => {
          const prof = (l.professores as any)?.nome || 'Sem Professor';
          const profId = l.professor_experimental_id || 0;
          const current = expProfMap.get(prof) || { id: profId, total: 0, convertidas: 0 };
          current.total += l.quantidade || 1;
          expProfMap.set(prof, current);
        });
        
        // Calcular conversões: matrículas que passaram por experimental (têm professor_experimental_id)
        leads.filter(l => ['matriculado','convertido'].includes(l.status) && l.professor_experimental_id).forEach(l => {
          const prof = (l.professores as any)?.nome || 'Sem Professor';
          const profId = l.professor_experimental_id || 0;
          const current = expProfMap.get(prof);
          if (current) {
            current.convertidas += l.quantidade || 1;
          }
        });

        // Exp/Visitas por Canal (origem das pessoas que fizeram experimental ou visita na escola)
        const expCanalMap = new Map<string, number>();
        leads.filter(l => ['experimental_realizada', 'compareceu', 'visita_escola'].includes(l.status)).forEach(l => {
          const canal = (l.canais_origem as any)?.nome || 'Outros';
          expCanalMap.set(canal, (expCanalMap.get(canal) || 0) + (l.quantidade || 1));
        });

        // Matriculas por Curso (mesma regra executiva canonica do Dashboard)
        const matriculasCanonicas = matriculasExecutivas;
        const cursoMatMap = new Map<string, number>();
        matriculasCanonicas.forEach(m => {
          const curso = (m as any).cursos?.nome || 'Nao informado';
          cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + 1);
        });

        // Matriculas por Canal (fonte canonica operacional: alunos.data_matricula)
        const canalMatMap = new Map<string, number>();
        matriculasCanonicas.forEach(m => {
          const canal = (m as any).canais_origem?.nome || 'Nao informado';
          canalMatMap.set(canal, (canalMatMap.get(canal) || 0) + 1);
        });

        // Matriculas por Professor (fonte canonica operacional: alunos.data_matricula)
        const profMatMap = new Map<string, { id: number; count: number }>();
        matriculasCanonicas.forEach(m => {
          const prof = (m as any).professores?.nome || 'Sem Professor';
          const profId = m.professor_atual_id || 0;
          const current = profMatMap.get(prof) || { id: profId, count: 0 };
          current.count += 1;
          profMatMap.set(prof, current);
        });

        // Matriculas por Horario (fonte canonica operacional: horario_aula do aluno)
        const horarioMap = new Map<string, number>();
        matriculasCanonicas.forEach(m => {
          const horarioAula = (m as any).horario_aula;
          const horaNumero = horarioAula ? parseInt(String(horarioAula).split(':')[0], 10) : NaN;
          const hora = Number.isFinite(horaNumero)
            ? horaNumero < 12
              ? 'Manha'
              : horaNumero < 18
                ? 'Tarde'
                : 'Noite'
            : 'Nao informado';
          horarioMap.set(hora, (horarioMap.get(hora) || 0) + 1);
        });

        // Matriculas por escola: prioriza classificacao calculada pelo banco; idade e curso sao fallback.
        const matriculasPorEscola = matriculasCanonicas.map((m) =>
          classificarEscolaMatricula(m, ano, mesFinal)
        );
        const matriculasLaKids = matriculasPorEscola.filter((escola) => escola === 'LAMK').length;
        const matriculasLaAdultos = matriculasPorEscola.filter((escola) => escola === 'EMLA').length;

        // Motivos de Não Matrícula (experimentais que não converteram)
        const motivosNaoMatMap = new Map<string, number>();
        leads.filter(l => l.status === 'experimental_nao_matriculou' || (l.status === 'experimental_realizada' && l.motivo_nao_matricula_id)).forEach(l => {
          const motivo = (l as any).motivos_nao_matricula?.nome || 'Não informado';
          motivosNaoMatMap.set(motivo, (motivosNaoMatMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Faturamento - fonte canonica operacional: alunos.data_matricula
        const {
          matriculasComPassaporte,
          faturamentoPassaportes,
          faturamentoParcelas,
          ticketMedioPassaporte,
          ticketMedioParcela,
        } = financeiroMatriculas;

        setDados({
          // Leads
          total_leads: totalLeads,
          leads_arquivados: leadsArquivados,
          leads_ativos: totalLeadsLegado - leadsArquivados - expMarcadas,
          taxa_conversao_lead_exp: totalLeads > 0
            ? (experimentaisDiagnosticoV2.realizadasPresencaConfirmada / totalLeads) * 100
            : 0,
          leads_por_canal: leadsPorCanalV2,
          leads_por_curso: Array.from(cursosLeadMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          leads_serie_mensal: leadsSerieMensalV2,
          motivos_arquivamento: Array.from(motivosArqMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Experimentais - fonte operacional v2/Emusys.
          // Status bruto fica no painel diagnostico; os cards usam a leitura validada.
          experimentais_marcadas: experimentaisDiagnosticoV2.agendadasEventos,
          experimentais_realizadas: experimentaisDiagnosticoV2.realizadasPresencaConfirmada,
          faltaram: experimentaisDiagnosticoV2.noShowStatusOperacional,
          taxa_showup:
            (experimentaisDiagnosticoV2.realizadasPresencaConfirmada + experimentaisDiagnosticoV2.noShowStatusOperacional) > 0
              ? (experimentaisDiagnosticoV2.realizadasPresencaConfirmada /
                (experimentaisDiagnosticoV2.realizadasPresencaConfirmada + experimentaisDiagnosticoV2.noShowStatusOperacional)) * 100
              : 0,
          // Exp -> Mat permanece bloqueada como KPI oficial ate regra canonica
          // de presenca/vinculo. Nao alimentar campo interno com taxa operacional.
          taxa_conversao_exp_mat: 0,
          experimentais_por_professor: Array.from(expProfMap.entries()).map(([nome, data]) => ({
            id: data.id,
            nome,
            valor: data.total,
            subvalor: `${data.convertidas} matrículas (${data.total > 0 ? ((data.convertidas / data.total) * 100).toFixed(0) : 0}%)`
          })).sort((a, b) => b.valor - a.valor),
          experimentais_por_canal: Array.from(expCanalMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          experimentais_diagnostico_v2: experimentaisDiagnosticoV2,
          
          // Matrículas
          novas_matriculas: novasMatriculas,
          matriculas_por_curso: Array.from(cursoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_canal: Array.from(canalMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_canal_origem: Array.from(canalMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_professor: Array.from(profMatMap.entries()).map(([nome, data]) => ({
            id: data.id,
            nome,
            valor: data.count,
          })).sort((a, b) => b.valor - a.valor),
          matriculas_por_horario: Array.from(horarioMap.entries()).map(([name, value]) => ({ name, value })),
          matriculas_por_faixa_etaria: [
            { name: 'LA Music Kids (até 11)', value: matriculasLaKids },
            { name: 'LA Music School (12+)', value: matriculasLaAdultos },
          ],
          ticket_medio_passaporte: ticketMedioPassaporte,
          ticket_medio_parcela: ticketMedioParcela,
          qtd_passaportes_vendidos: matriculasComPassaporte.length,
          motivos_nao_matricula: Array.from(motivosNaoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Faturamento
          faturamento_passaportes: faturamentoPassaportes,
          faturamento_parcelas: faturamentoParcelas,
          faturamento_total: faturamentoPassaportes + faturamentoParcelas,
          projecao_mensal: faturamentoParcelas * 12, // Projeção anual das parcelas
        });

      } catch (err) {
        console.error('Erro ao carregar dados comerciais:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFinal, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
      </div>
    );
  }

  // Componente de estado vazio informativo
  const EstadoVazio = ({ titulo, mensagem }: { titulo: string; mensagem: string }) => (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-8 text-center">
      <Info className="w-12 h-12 text-slate-500 mx-auto mb-3" />
      <h4 className="text-slate-300 font-medium mb-2">{titulo}</h4>
      <p className="text-slate-400 text-sm">{mensagem}</p>
    </div>
  );
  const experimentaisDiagnostico = {
    ...experimentaisDiagnosticoVazio,
    ...(dados.experimentais_diagnostico_v2 || {}),
  };
  const taxaExpMatSemBase =
    !experimentaisDiagnostico.taxaExpMatLiberada &&
    experimentaisDiagnostico.denominadorTaxaExpMat === 0 &&
    experimentaisDiagnostico.pendenciasTaxaExpMat === 0;
  const formatTaxaDiagnostica = (valor: number | null | undefined) =>
    typeof valor === 'number' && Number.isFinite(valor) ? `${valor.toFixed(1)}%` : '-';

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 flex-wrap">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeSubTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className={`min-h-9 px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 max-w-full ${competenciaBadgeClasses}`}
          title={competenciaMensal.tooltip}
        >
          {competenciaMensal.bloqueiaEscrita ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          <span className="min-w-0 truncate">{competenciaMensal.loading ? 'Validando competência' : competenciaMensal.badgeLabel}</span>
        </div>
      </div>

      {/* Sub-aba: Leads */}
      {activeSubTab === 'leads' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Phone}
              label="Leads Entrantes"
              value={dados.total_leads}
              target={metas.leads}
              format="number"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.total_leads, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.total_leads, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Archive}
              label="Leads Arquivados"
              value={dados.leads_arquivados}
              subvalue={`${dados.total_leads > 0 ? ((dados.leads_arquivados / dados.total_leads) * 100).toFixed(0) : 0}% do total`}
              variant="amber"
            />
            <KPICard
              icon={TrendingUp}
              label="Leads Ativos"
              value={dados.leads_ativos}
              variant="emerald"
            />
            <KPICard
              icon={Percent}
              label="Lead -> Exp v2"
              value={dados.taxa_conversao_lead_exp}
              target={metas.taxa_lead_exp}
              format="percent"
              subvalue="Leads v2 x realizadas Emusys"
              variant="violet"
            />
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-cyan-300 flex-shrink-0 mt-0.5" />
            <p className="text-cyan-100 text-sm">
              <strong>Fonte canônica v2:</strong> Leads Entrantes, Leads por Canal e Série Mensal.
              Arquivados, ativos e curso de interesse seguem como leitura operacional.
            </p>
          </div>

          {dados.leads_serie_mensal.length > 0 && (
            <EvolutionChart
              data={dados.leads_serie_mensal}
              lines={[
                { dataKey: 'leads', color: '#06b6d4', name: 'Leads Entrantes' },
              ]}
              title="Série Mensal de Leads Entrantes"
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {dados.leads_por_canal.length > 0 ? (
              <DistributionChart
                data={dados.leads_por_canal}
                title="Leads por Canal"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead registrado no período selecionado."
              />
            )}
            {dados.leads_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.leads_por_curso}
                title="Leads por Curso de Interesse"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead com curso de interesse registrado."
              />
            )}
            {dados.motivos_arquivamento.length > 0 ? (
              <DistributionChart
                data={dados.motivos_arquivamento}
                title="Motivos de Arquivamento"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead arquivado no período."
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Experimentais */}
      {activeSubTab === 'experimentais' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
              </p>
            </div>
          )}

          <div className="border border-cyan-500/30 bg-cyan-500/10 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-4">
              <Info className="w-5 h-5 text-cyan-300 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-cyan-100 font-semibold">Origem dos numeros de experimentais</h4>
                <p className="text-cyan-100/80 text-sm">
                  Eventos, realizadas e faltas usam o endpoint Emusys v2. A taxa Exp para Mat usa o
                  denominador canonico da conciliacao quando a competencia esta sem pendencias.
                  {experimentaisDiagnostico.taxaExpMatLiberada
                    ? ' A taxa Exp → Mat está liberada para esta competência.'
                    : taxaExpMatSemBase
                      ? ' Esta competencia ainda esta sem base de experimentais confirmadas.'
                      : ' A taxa Exp → Mat segue bloqueada para esta competência.'}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 text-sm">
              <div>
                <dt className="text-slate-400">KPI: realizadas</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.realizadasPresencaConfirmada}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Status Emusys</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.realizadasStatusOperacional}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Matrículas sem vínculo</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.conversoesPendentesVinculo}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Realizadas sem matrícula</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.realizadasSemConversaoAparente}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Diretas/duplicadas</dt>
                <dd className="text-white text-2xl font-bold">
                  {experimentaisDiagnostico.decisoesHumanasExcluidasDenominador}
                </dd>
                <p className="text-[11px] text-slate-400">não entram na taxa</p>
              </div>
              <div>
                <dt className="text-slate-400">Revisão humana</dt>
                <dd className="text-white text-2xl font-bold">
                  {experimentaisDiagnostico.decisoesHumanasPendentesCanonizacao}
                </dd>
                <p className="text-[11px] text-slate-400">cadastro/vínculo</p>
              </div>
              <div>
                <dt className="text-slate-400">Presença sem funil</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.presencasEmusysSemFunil}</dd>
              </div>
              <div>
                <dt className="text-slate-400">
                  {experimentaisDiagnostico.taxaExpMatLiberada ? 'Taxa oficial' : taxaExpMatSemBase ? 'Sem base' : 'Faixa em teste'}
                </dt>
                <dd className={cn(
                  'text-xl font-bold',
                  experimentaisDiagnostico.taxaExpMatLiberada ? 'text-emerald-300' : taxaExpMatSemBase ? 'text-slate-300' : 'text-amber-200'
                )}>
                  {experimentaisDiagnostico.taxaExpMatLiberada
                    ? formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatCanonica)
                    : taxaExpMatSemBase
                      ? 'Sem base'
                      : `${formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatMinimaCanonica)} - ${formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatMaximaAposRevisao)}`}
                </dd>
                <p className={cn(
                  'text-[11px]',
                  experimentaisDiagnostico.taxaExpMatLiberada ? 'text-emerald-200/80' : taxaExpMatSemBase ? 'text-slate-400' : 'text-amber-200/80'
                )}>
                  {experimentaisDiagnostico.taxaExpMatLiberada
                    ? `${experimentaisDiagnostico.conversoesExpMatCanonicas}/${experimentaisDiagnostico.denominadorTaxaExpMat}`
                    : taxaExpMatSemBase
                      ? '0 pendencias'
                      : 'Não é KPI oficial'}
                </p>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Calendar}
              label="Eventos Emusys"
              value={dados.experimentais_marcadas}
              variant="cyan"
            />
            <KPICard
              icon={Calendar}
              label="Realizadas confirmadas"
              value={experimentaisDiagnostico.realizadasPresencaConfirmada}
              format="number"
              variant="emerald"
            />
            <KPICard
              icon={XCircle}
              label="Faltas Emusys"
              value={dados.faltaram}
              variant="rose"
            />
            <KPICard
              icon={Percent}
              label="Show-up validado"
              value={dados.taxa_showup}
              format="percent"
              variant="violet"
            />
            <div className={cn(
              'bg-slate-800/70 border rounded-xl p-4 min-h-[112px] flex flex-col justify-between',
              experimentaisDiagnostico.taxaExpMatLiberada
                ? 'border-emerald-500/30'
                : taxaExpMatSemBase
                  ? 'border-cyan-500/30'
                  : 'border-slate-700'
            )}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400 font-medium">Taxa Exp → Mat</span>
                {experimentaisDiagnostico.taxaExpMatLiberada ? (
                  <Unlock className="w-4 h-4 text-emerald-300" />
                ) : taxaExpMatSemBase ? (
                  <Info className="w-4 h-4 text-cyan-300" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div>
                <div className={cn(
                  'text-2xl font-bold',
                  experimentaisDiagnostico.taxaExpMatLiberada ? 'text-emerald-300' : taxaExpMatSemBase ? 'text-cyan-200' : 'text-amber-200'
                )}>
                  {experimentaisDiagnostico.taxaExpMatLiberada
                    ? formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatCanonica)
                    : taxaExpMatSemBase
                      ? 'Sem base'
                      : 'Bloqueada'}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {experimentaisDiagnostico.taxaExpMatLiberada
                    ? `${experimentaisDiagnostico.conversoesExpMatCanonicas}/${experimentaisDiagnostico.denominadorTaxaExpMat} conversões confirmadas.`
                    : taxaExpMatSemBase
                      ? '0 pendencia(s); aguardando experimentais confirmadas.'
                      : 'Aguarda vínculo aluno → presença e decisões humanas antes de virar KPI oficial.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FunnelChart
              steps={[
                { label: 'Leads', value: dados.total_leads, color: '#06b6d4' },
                { label: 'Realizadas confirmadas', value: experimentaisDiagnostico.realizadasPresencaConfirmada, color: '#8b5cf6' },
                { label: 'Matrículas novas', value: dados.novas_matriculas, color: '#10b981' },
              ]}
              title="Funil diagnóstico (não KPI oficial)"
            />
            {dados.experimentais_por_canal.length > 0 ? (
              <DistributionChart
                data={dados.experimentais_por_canal}
                title="Experimentais/Visitas por Canal (operacional)"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma experimental com canal de origem registrado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.experimentais_por_professor.length > 0 ? (
              <RankingTable
                data={dados.experimentais_por_professor}
                title="Experimentais por Professor (operacional)"
                valorLabel="Aulas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma aula experimental com professor vinculado no período."
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Matrículas */}
      {activeSubTab === 'matriculas' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>{alertaCompetenciaAberta.titulo}:</strong> {alertaCompetenciaAberta.descricao}
              </p>
            </div>
          )}
          {/* Linha 1: Quantidade e Receitas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={UserPlus}
              label="Matrículas novas"
            value={dados.novas_matriculas}
            target={metas.matriculas}
            format="number"
            variant="emerald"
            />
            <KPICard
              icon={DollarSign}
              label="Receita Passaportes"
              value={formatCurrency(dados.faturamento_passaportes)}
              subvalue={`${dados.qtd_passaportes_vendidos} vendidos`}
              variant="cyan"
            />
            <KPICard
              icon={TrendingUp}
              label="MRR Novos"
              value={formatCurrency(dados.faturamento_parcelas)}
              subvalue="Receita recorrente"
              variant="amber"
            />
            <KPICard
              icon={Clock}
              label="Por Horário"
              value={dados.matriculas_por_horario.length > 0 ? dados.matriculas_por_horario[0].name : '-'}
              subvalue={dados.matriculas_por_horario.length > 0 ? `${dados.matriculas_por_horario[0].value} matrículas` : ''}
              variant="violet"
            />
          </div>

          {/* Linha 2: Tickets e Faixa Etária */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Ticket Passaporte"
              value={dados.ticket_medio_passaporte}
              format="currency"
              subvalue="Média por matrícula"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.ticket_medio_passaporte > 0 ? { valor: dadosMesAnterior.ticket_medio_passaporte, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.ticket_medio_passaporte > 0 ? { valor: dadosAnoAnterior.ticket_medio_passaporte, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Parcela"
              value={dados.ticket_medio_parcela}
              format="currency"
              subvalue="Média por matrícula"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.ticket_medio_parcela > 0 ? { valor: dadosMesAnterior.ticket_medio_parcela, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.ticket_medio_parcela > 0 ? { valor: dadosAnoAnterior.ticket_medio_parcela, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Baby}
              label="LA Music Kids"
              value={(dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('Kids'))?.value || 0}
              subvalue={`${dados.novas_matriculas > 0 ? (((dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('Kids'))?.value || 0) / dados.novas_matriculas * 100).toFixed(0) : 0}% das matrículas`}
              variant="rose"
            />
            <KPICard
              icon={GraduationCap}
              label="LA Music School"
              value={(dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('School'))?.value || 0}
              subvalue={`${dados.novas_matriculas > 0 ? (((dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('School'))?.value || 0) / dados.novas_matriculas * 100).toFixed(0) : 0}% das matrículas`}
              variant="violet"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.matriculas_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_curso}
                title="Matrículas por Curso"
              />
            ) : (
              <EstadoVazio
                titulo="Sem matrículas no período"
                mensagem={`Nenhuma matrícula registrada em ${getMesNomeCurto(mes)}/${ano}. Isso pode indicar período de baixa ou dados ainda não lançados.`}
              />
            )}
            {dados.matriculas_por_canal_origem.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_canal_origem}
                title="Matrículas por Canal de Origem"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma matrícula com canal de origem registrado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(dados.motivos_nao_matricula || []).length > 0 ? (
              <DistributionChart
                data={dados.motivos_nao_matricula || []}
                title="Motivos de Não Matrícula (Experimentais)"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum motivo de não matrícula registrado no período."
              />
            )}
            {(dados.matriculas_por_professor || []).length > 0 ? (
              <RankingTable
                data={dados.matriculas_por_professor || []}
                title="Ranking de Professores Matriculadores"
                valorLabel="Matrículas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de professores matriculadores"
                mensagem={`Nenhuma matrícula com professor vinculado em ${getMesNomeCurto(mes)}/${ano}.`}
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Atendimento (Chatwoot) */}
      {activeSubTab === 'atendimento' && (
        <div className="space-y-6">
          {/* Cabeçalho: seletor de dimensão + hint */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 border border-slate-700">
              {DIMS_ATENDIMENTO.map((d) => {
                const DimIcon = d.icon;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDimAtendimento(d.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2',
                      dimAtendimento === d.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    )}
                  >
                    <DimIcon size={15} />
                    {d.label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-500">{HINTS_ATENDIMENTO[dimAtendimento]}</span>
          </div>

          {/* Aviso: fonte + metodologia */}
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-cyan-300 flex-shrink-0 mt-0.5" />
            <p className="text-cyan-100 text-sm">
              <strong>Performance de atendimento (Chatwoot):</strong> considera as <strong>conversas criadas no período</strong> selecionado.
              A 1ª resposta é a <strong>mediana</strong> do tempo do <strong>handoff para o humano até o primeiro retorno</strong> —
              não conta o tempo em que o bot (Mila) segurou o lead. Tempos em relógio corrido (24/7): esperas na
              madrugada/fim de semana ainda entram (o desconto por horário comercial será ligado depois).
            </p>
          </div>

          {atendimento.loading && (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          )}

          {!atendimento.loading && atendimento.error && (
            <EstadoVazio
              titulo="Não foi possível carregar os dados de atendimento"
              mensagem={atendimento.error}
            />
          )}

          {!atendimento.loading && !atendimento.error && dadosAtendimento.linhas.length === 0 && (
            <EstadoVazio
              titulo="Sem atividade de atendimento no período"
              mensagem="Nenhum registro com conversas para esta dimensão no período/unidade selecionados."
            />
          )}

          {!atendimento.loading && !atendimento.error && dadosAtendimento.linhas.length > 0 && (
            <>
              {dadosAtendimento.avisoAgenteSemUnidade && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <p className="text-amber-200 text-xs">
                    O Chatwoot não vincula agente a unidade — no modo <strong>Agente</strong> os números são de toda a conta,
                    independente da unidade selecionada no topo. Use <strong>Caixa</strong> ou <strong>Unidade</strong> para recorte por unidade.
                  </p>
                </div>
              )}

              {/* KPIs da dimensão/unidade ativa */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KPICard
                  icon={MessageSquare}
                  label="Conversas no período"
                  value={dadosAtendimento.totConversas}
                  subvalue="abertas no mês selecionado"
                  format="number"
                  variant="violet"
                />
                <KPICard
                  icon={CheckCircle2}
                  label="Já respondidas"
                  value={dadosAtendimento.totRespondidas}
                  subvalue={`${dadosAtendimento.totConversas > 0 ? Math.round((dadosAtendimento.totRespondidas / dadosAtendimento.totConversas) * 100) : 0}% do total`}
                  format="number"
                  variant="cyan"
                />
                <KPICard
                  icon={Timer}
                  label="1ª Resposta (mediana)"
                  value={formatarDuracaoSegundos(dadosAtendimento.kMediana)}
                  subvalue="tempo típico até o 1º retorno"
                  variant="amber"
                />
              </div>

              {/* Insight automático (pior 1ª resposta com volume relevante) */}
              {dadosAtendimento.pior && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <p className="text-rose-100 text-sm">
                    <strong className="text-white">{dadosAtendimento.pior.nome}</strong> está com a 1ª resposta (mediana) em{' '}
                    <strong className="text-white">{formatarDuracaoSegundos(dadosAtendimento.pior.primeiraRespostaMedianaSeg)}</strong>{' '}
                    — o maior tempo entre {dadosAtendimento.colLabel.toLowerCase()}s com volume relevante ({dadosAtendimento.pior.conversas} conversas).
                  </p>
                </div>
              )}

              {/* Volume de conversas */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-white font-semibold text-sm">Volume de conversas</h3>
                  <span className="text-xs text-slate-500">quem concentra o atendimento</span>
                </div>
                <div className="space-y-2.5">
                  {dadosAtendimento.porConversas.map((l) => (
                    <div key={l.id} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-3">
                      <div className="text-xs text-slate-300 truncate" title={l.nome}>
                        {l.nome}
                        {'unidade' in l && l.unidade && <span className="text-slate-500 text-[10px] ml-1.5">{l.unidade}</span>}
                      </div>
                      <div className="h-5 bg-slate-700/40 rounded-md overflow-hidden">
                        <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max((l.conversas / dadosAtendimento.maxConv) * 100, 2)}%`, background: '#8b5cf6' }} />
                      </div>
                      <div className="text-xs font-semibold text-white tabular-nums whitespace-nowrap">
                        {l.conversas.toLocaleString('pt-BR')}
                        <span className="text-slate-500 font-normal text-[10px] ml-1.5">{l.amostraPrimeiraResposta} resp.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tempo até a 1ª resposta (mediana) */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-white font-semibold text-sm">Tempo até a 1ª resposta (mediana)</h3>
                  <span className="text-xs text-slate-500">menor é melhor</span>
                </div>
                <div className="space-y-2.5">
                  {dadosAtendimento.porResposta.map((l) => {
                    const v = l.primeiraRespostaMedianaSeg as number;
                    return (
                      <div key={l.id} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-3">
                        <div className="text-xs text-slate-300 truncate" title={l.nome}>
                          {l.nome}
                          {'unidade' in l && l.unidade && <span className="text-slate-500 text-[10px] ml-1.5">{l.unidade}</span>}
                        </div>
                        <div className="h-5 bg-slate-700/40 rounded-md overflow-hidden">
                          <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max((v / dadosAtendimento.maxResp) * 100, 2)}%`, background: corTempoAtendimento(v) }} />
                        </div>
                        <div className="text-xs font-semibold text-white tabular-nums whitespace-nowrap">{formatarDuracaoSegundos(v)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#10b981' }} /> &lt; 1h</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#06b6d4' }} /> 1–4h</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#f59e0b' }} /> 4–24h</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#f43f5e' }} /> &gt; 24h</span>
                </div>
              </div>

              {/* Tabela detalhada */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-white font-semibold">Detalhe por {dadosAtendimento.colLabel.toLowerCase()}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700/50">
                        <th className="text-left font-medium px-5 py-3">{dadosAtendimento.colLabel}</th>
                        <th className="text-right font-medium px-5 py-3">Conversas</th>
                        <th className="text-right font-medium px-5 py-3">Respondidas</th>
                        <th className="text-right font-medium px-5 py-3">
                          <span className="inline-flex items-center gap-1 justify-end">
                            1ª Resposta (mediana)
                            <span className="relative group">
                              <Info size={12} className="text-slate-500 hover:text-slate-300 cursor-help" />
                              <span className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-[11px] text-slate-200 normal-case tracking-normal font-normal whitespace-normal w-[240px] text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-xl pointer-events-none">
                                Mediana do tempo entre abertura e 1º retorno, só das conversas criadas no período. Resiste a conversas paradas.
                              </span>
                            </span>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosAtendimento.porConversas.map((l) => {
                        const cor = corTempoAtendimento(l.primeiraRespostaMedianaSeg);
                        return (
                          <tr key={l.id} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/20 transition-colors">
                            <td className="px-5 py-3 text-white font-medium">
                              {l.nome}
                              {'unidade' in l && l.unidade && <span className="text-slate-500 text-xs ml-2">{l.unidade}</span>}
                            </td>
                            <td className="px-5 py-3 text-right text-slate-200 tabular-nums">{l.conversas.toLocaleString('pt-BR')}</td>
                            <td className="px-5 py-3 text-right text-slate-200 tabular-nums">{l.amostraPrimeiraResposta.toLocaleString('pt-BR')}</td>
                            <td className="px-5 py-3 text-right tabular-nums">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: `${cor}1e`, color: cor }}>
                                {formatarDuracaoSegundos(l.primeiraRespostaMedianaSeg)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TabComercialNew;
