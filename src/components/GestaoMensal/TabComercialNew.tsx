import { useState, useEffect } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock, Users, Baby, GraduationCap, AlertTriangle, Info, Lock, Unlock } from 'lucide-react';
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
import {
  fetchComercialOperacionalResumoV2,
  fetchExperimentaisDiagnosticoComercialV2,
} from '@/hooks/useComercialOperacionalResumoV2';

interface TabComercialProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'leads' | 'experimentais' | 'matriculas';

const subTabs = [
  { id: 'leads' as const, label: 'Leads', icon: Phone },
  { id: 'experimentais' as const, label: 'Experimentais', icon: Calendar },
  { id: 'matriculas' as const, label: 'Matrículas', icon: UserPlus },
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
  taxaExpMatStatus: 'bloqueada_regra_canonica',
  presencasEmusysExperimentaisPresentes: 0,
  presencasEmusysComFunil: 0,
  presencasEmusysSemFunil: 0,
};

const toNumber = (valor: unknown): number => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    const normalizado = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
  }
  return 0;
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

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

const ehNovaMatriculaExecutiva = (matricula: any): boolean => {
  const tipo = firstRelation<any>(matricula.tipos_matricula);
  const cursoNome = ((matricula.cursos as any)?.nome || matricula.curso_nome || '').toLowerCase();
  const ehBanda =
    matricula.is_banda === true ||
    (matricula.cursos as any)?.is_projeto_banda === true ||
    cursoNome.includes('banda');
  const ehCoral = cursoNome.includes('canto coral');

  if (matricula.is_segundo_curso === true) return false;
  if (ehBanda || ehCoral) return false;
  if (tipo?.codigo === 'BOLSISTA_INT' || tipo?.codigo === 'BOLSISTA_PARC') return false;

  return (tipo?.conta_como_pagante === true || tipo?.entra_ticket_medio === true) &&
    toNumber(matricula.valor_parcela) > 0;
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

        // Buscar dados mensais para ticket de passaporte (dados históricos)
        let dadosMensaisQuery = supabase
          .from('dados_mensais')
          .select('ticket_medio_passaporte, faturamento_passaporte, unidade_id')
          .eq('ano', ano)
          .gte('mes', mesInicio)
          .lte('mes', mesFinal);

        if (unidade !== 'todos') {
          dadosMensaisQuery = dadosMensaisQuery.eq('unidade_id', unidade);
        }

        const { data: dadosMensaisData } = await dadosMensaisQuery;

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
        const matriculasExecutivas = matriculas.filter(ehNovaMatriculaExecutiva);

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

        // Matriculas por Horario (campo ainda nem sempre vem preenchido no cadastro do aluno)
        const horarioMap = new Map<string, number>();
        matriculasCanonicas.forEach(m => {
          const horarioPreferido = (m as any).horario_preferido;
          const hora = horarioPreferido ? (parseInt(horarioPreferido.split(':')[0]) < 12 ? 'Manha' : parseInt(horarioPreferido.split(':')[0]) < 18 ? 'Tarde' : 'Noite') : 'Nao informado';
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
        const matriculasComPassaporte = matriculasCanonicas.filter(m => toNumber(m.valor_passaporte) > 0);
        const matriculasComParcela = matriculasCanonicas.filter(m => toNumber(m.valor_parcela) > 0);
        const faturamentoPassaportes = matriculasComPassaporte.reduce((acc, m) => acc + toNumber(m.valor_passaporte), 0);
        const faturamentoParcelas = matriculasCanonicas.reduce((acc, m) => acc + toNumber(m.valor_parcela), 0);
        const ticketMedioPassaporte = matriculasComPassaporte.length > 0 ? faturamentoPassaportes / matriculasComPassaporte.length : 0;
        const ticketMedioParcela = matriculasComParcela.length > 0 ? faturamentoParcelas / matriculasComParcela.length : 0;

        setDados({
          // Leads
          total_leads: totalLeads,
          leads_arquivados: leadsArquivados,
          leads_ativos: totalLeadsLegado - leadsArquivados - expMarcadas,
          taxa_conversao_lead_exp: totalLeadsLegado > 0 ? (expRealizadas / totalLeadsLegado) * 100 : 0,
          leads_por_canal: leadsPorCanalV2,
          leads_por_curso: Array.from(cursosLeadMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          leads_serie_mensal: leadsSerieMensalV2,
          motivos_arquivamento: Array.from(motivosArqMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Experimentais
          experimentais_marcadas: expMarcadas + expRealizadas + faltaram,
          experimentais_realizadas: expRealizadas,
          faltaram: faltaram,
          taxa_showup: (expMarcadas + expRealizadas + faltaram) > 0 ? (expRealizadas / (expMarcadas + expRealizadas + faltaram)) * 100 : 0,
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
              label="Lead → Exp (legado)"
              value={dados.taxa_conversao_lead_exp}
              target={metas.taxa_lead_exp}
              format="percent"
              subvalue="Operacional; regra canônica em validação"
              variant="violet"
            />
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-cyan-300 flex-shrink-0 mt-0.5" />
            <p className="text-cyan-100 text-sm">
              <strong>Fonte canônica v2:</strong> Leads Entrantes, Leads por Canal e Série Mensal.
              Arquivados, ativos, curso de interesse e conversão Lead → Exp seguem como legado/pendente.
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
                <h4 className="text-cyan-100 font-semibold">Leitura operacional de experimentais</h4>
                <p className="text-cyan-100/80 text-sm">
                  Marcadas vêm do funil comercial. Realizadas confirmadas exigem aluno vinculado,
                  presença individual e aula experimental no Emusys. A taxa Exp → Mat segue bloqueada.
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 text-sm">
              <div>
                <dt className="text-slate-400">Realizadas confirmadas</dt>
                <dd className="text-white text-2xl font-bold">{experimentaisDiagnostico.realizadasPresencaConfirmada}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Realizadas pelo status</dt>
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
                <dt className="text-slate-400">Faixa em teste</dt>
                <dd className="text-amber-200 text-xl font-bold">
                  {formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatMinimaCanonica)}
                  {' - '}
                  {formatTaxaDiagnostica(experimentaisDiagnostico.taxaExpMatMaximaAposRevisao)}
                </dd>
                <p className="text-[11px] text-amber-200/80">Não é KPI oficial</p>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Calendar}
              label="Marcadas no funil"
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
              label="Faltas no funil"
              value={dados.faltaram}
              variant="rose"
            />
            <KPICard
              icon={Percent}
              label="Show-up do funil"
              value={dados.taxa_showup}
              format="percent"
              variant="violet"
            />
            <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 min-h-[112px] flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400 font-medium">Taxa Exp → Mat bloqueada</span>
                <Lock className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-200">Bloqueada</div>
                <p className="text-xs text-slate-400 mt-1">
                  Aguarda vínculo aluno → presença e decisões humanas antes de virar KPI oficial.
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
                title="Experimentais/Visitas por Canal (legado)"
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
                title="Experimentais por Professor (legado)"
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
    </div>
  );
}

export default TabComercialNew;
