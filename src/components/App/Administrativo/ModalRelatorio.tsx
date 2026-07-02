import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Copy, Check, RotateCcw, FileText, Calendar, RefreshCw, AlertTriangle, LogOut, Sparkles, Loader2, Send, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { MovimentacaoAdmin, ResumoMes } from './AdministrativoPage';
import { copyTextToClipboard, getManualCopyShortcut } from '@/lib/clipboard';
import { fetchKPIsAlunosCanonicos } from '@/hooks/useKPIsAlunosCanonicos';
import {
  aplicarFallbacksRetencao,
  calcularReajusteMedioCanonico,
  calcularRetencaoOperacionalCanonica,
  consolidarRetencaoOperacional,
  isRenovacaoConfirmadaOperacional,
  pagantesMapFromKPIsCanonicos,
  unidadesFromKPIsCanonicos,
  valorPerdidoMovimentacao,
} from '@/lib/retencaoOperacionalCanonica';
import {
  calcularKpisMensaisAdministrativos,
  valorPerdidoRelatorioMensal,
} from '@/lib/relatorioMensalAdministrativo';
import { filtrarRetencaoCanonica } from '@/lib/atividadesExtras';
import {
  direcaoTransferenciaNaUnidade,
  isAlunoNovoForaComercial,
  isAlunoNovoPaganteAdministrativo,
  isAlunoTransferenciaAdministrativa,
  transferenciaPertenceAUnidade,
  transferenciaRecebidaNaUnidade,
} from '@/lib/administrativoTransferencias';
import { isCompetenciaNoPeriodo } from '@/lib/renovacoesAntecipadas';

// Mapeamento de UUIDs para nomes de unidade
const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

const tipoEvasaoLabels: Record<string, string> = {
  interrompido: 'Interrompido',
  interrompido_2_curso: 'Interrompido 2º Curso',
  interrompido_bolsista: 'Interrompido Bolsista',
  interrompido_banda: 'Interrompido Banda',
  transferencia: 'Transferência',
};

function inicioMesISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function fimMesISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
}

function isMesAtual(ano: number, mes: number): boolean {
  const hoje = new Date();
  return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
}

async function fetchKPIsAlunosAdminOperacionalRelatorio({
  unidadeId,
  ano,
  mes,
}: {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
}) {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
  const { data, error } = await supabase.rpc('get_kpis_alunos_admin_operacional', {
    p_unidade_id: unidadeFiltro,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) throw error;

  return (data?.por_unidade || []).map((row: any) => ({
    unidade_id: row.unidade_id,
    total_alunos_ativos: Number(row.alunos_ativos) || 0,
    total_alunos_pagantes: Number(row.alunos_pagantes) || 0,
    total_bolsistas_integrais: Number(row.bolsistas_integrais) || 0,
    total_bolsistas_integrais_regulares: Number(row.bolsistas_integrais_regulares) || 0,
    total_bolsistas_integrais_segundo_curso: Number(row.bolsistas_integrais_segundo_curso) || 0,
    total_bolsistas_parciais: Number(row.bolsistas_parciais) || 0,
    ticket_medio: 0,
    faturamento_previsto: 0,
    churn_rate: 0,
    tempo_permanencia_medio: 0,
    _matriculas_ativas: Number(row.matriculas_ativas) || 0,
    _matriculas_base_alunos_ativos: Number(row.matriculas_base_alunos_ativos) || 0,
    _matriculas_banda: Number(row.matriculas_banda) || 0,
    _matriculas_2_curso: Number(row.matriculas_2_curso) || 0,
    _alunos_com_2_curso: Number(row.alunos_com_2_curso) || 0,
    _matriculas_2_curso_extras: Number(row.matriculas_2_curso_extras) || 0,
    _alunos_coral: Number(row.matriculas_coral) || 0,
  }));
}

function labelTipoEvasao(tipo: string): string {
  return tipoEvasaoLabels[tipo] || tipo || 'Interrompido';
}

function formatarParcelaEvasaoDiaria(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return 'N/I';
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function classificarTipoEvasaoMovimentacao(e: any): string {
  const tipoInformado = String(e?.tipo_evasao || '').trim();
  if (tipoInformado) return tipoInformado;

  const aluno = e?.alunos || {};
  const tipoMatriculaId = Number(e?.tipo_matricula_id ?? aluno?.tipo_matricula_id ?? 0);
  const isSegundoCurso = Boolean(e?.is_segundo_curso ?? aluno?.is_segundo_curso);
  const tipoMovimento = String(e?.tipo || '').trim();
  const motivo = String(e?.motivo || '').toLowerCase();

  if (tipoMovimento === 'transferencia' || motivo.includes('transfer')) return 'transferencia';
  if (tipoMovimento === 'nao_renovacao') return 'nao_renovou';
  if (tipoMatriculaId === 5) return 'interrompido_banda';
  if (isSegundoCurso || tipoMatriculaId === 2) return 'interrompido_2_curso';
  if ([3, 4].includes(tipoMatriculaId)) return 'interrompido_bolsista';

  return 'interrompido';
}

function isMovimentoBaseAlunosParaRetencao(mov: any): boolean {
  if (mov?.tipo !== 'evasao') return true;

  const tipoEvasao = classificarTipoEvasaoMovimentacao(mov);
  return tipoEvasao === 'interrompido' || tipoEvasao === 'transferencia';
}

interface ModalRelatorioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumo: ResumoMes | null;
  renovacoes: MovimentacaoAdmin[];
  naoRenovacoes: MovimentacaoAdmin[];
  avisosPrevios: MovimentacaoAdmin[];
  evasoes: MovimentacaoAdmin[];
  transferencias: TransferenciaRelatorio[];
  competencia: string;
  unidade: string;
}

interface TransferenciaRelatorio {
  id: number;
  nome: string;
  data_matricula?: string | null;
  valor_parcela?: number | string | null;
  cursos?: { nome?: string | null } | null;
  professores?: { nome?: string | null } | null;
  unidades?: { codigo?: string | null; nome?: string | null } | null;
  transferencia?: {
    data_transferencia?: string | null;
    unidade_origem_nome?: string | null;
    unidade_origem_codigo?: string | null;
    unidade_destino_nome?: string | null;
    unidade_destino_codigo?: string | null;
    observacao?: string | null;
  } | null;
}

interface DadosRelatorioMensalAdministrativo {
  resumo: ResumoMes;
  renovacoes: MovimentacaoAdmin[];
  naoRenovacoes: MovimentacaoAdmin[];
  avisosPrevios: MovimentacaoAdmin[];
  evasoes: MovimentacaoAdmin[];
  transferencias: TransferenciaRelatorio[];
  ano: number;
  mes: number;
}

type TipoRelatorio = 'gerencial_ia' | 'diario' | 'mensal' | 'renovacoes' | 'avisos' | 'evasoes';

const tiposRelatorio: { id: TipoRelatorio; label: string; icon: React.ReactNode; desc: string; destaque?: boolean }[] = [
  { id: 'gerencial_ia', label: 'Relatório Gerencial com IA ✨', icon: <Sparkles className="w-5 h-5" />, desc: 'Análise completa com insights, comparativos e plano de ação', destaque: true },
  { id: 'diario', label: 'Relatório Diário', icon: <Calendar className="w-5 h-5" />, desc: 'Resumo do dia: alunos, renovações, avisos, evasões' },
  { id: 'mensal', label: 'Relatório Mensal', icon: <FileText className="w-5 h-5" />, desc: 'Análise completa: métricas, LTV, churn, ticket médio' },
  { id: 'renovacoes', label: 'Relatório de Renovações', icon: <RefreshCw className="w-5 h-5" />, desc: 'Lista detalhada de renovações com reajustes' },
  { id: 'avisos', label: 'Relatório de Avisos Prévios', icon: <AlertTriangle className="w-5 h-5" />, desc: 'Lista de alunos que vão sair com motivos' },
  { id: 'evasoes', label: 'Relatório de Evasões', icon: <LogOut className="w-5 h-5" />, desc: 'Lista detalhada de evasões com motivos' },
];

export function ModalRelatorio({ 
  open, 
  onOpenChange, 
  resumo, 
  renovacoes, 
  naoRenovacoes,
  avisosPrevios, 
  evasoes, 
  transferencias,
  competencia,
  unidade 
}: ModalRelatorioProps) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoRelatorio | null>(null);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [loadingIA, setLoadingIA] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);
  const [numeroTeste, setNumeroTeste] = useState('');
  const { usuario } = useAuth();

  const formatarBolsistasIntegrais = (resumoBase: ResumoMes | null = resumo) => {
    const regulares = resumoBase?.bolsistas_integrais_regulares || 0;
    const total = regulares || resumoBase?.bolsistas_integrais || 0;
    return `*${total}*`;
  };

  const formatarBolsistasIntegraisTexto = (resumoBase: ResumoMes | null = resumo) => {
    const regulares = resumoBase?.bolsistas_integrais_regulares || 0;
    const total = regulares || resumoBase?.bolsistas_integrais || 0;
    return `${total} integrais`;
  };

  const formatarMatriculasSegundoCurso = (resumoBase: ResumoMes | null = resumo) => {
    const total = resumoBase?.matriculas_2_curso || 0;
    const alunos = resumoBase?.alunos_com_2_curso || 0;
    const extras = resumoBase?.matriculas_2_curso_extras || 0;
    return alunos || extras
      ? `*${total}* (${alunos} alunos${extras ? ` + ${extras} extras` : ''})`
      : `*${total}*`;
  };

  const formatarMatriculasAtivas = (resumoBase: ResumoMes | null = resumo) => {
    const total = resumoBase?.matriculas_ativas || 0;
    const baseAlunos = resumoBase?.matriculas_base_alunos_ativos || resumoBase?.alunos_ativos || 0;
    const banda = resumoBase?.matriculas_banda || 0;
    const segundoCurso = resumoBase?.matriculas_2_curso || 0;
    return baseAlunos || banda || segundoCurso
      ? `*${total}* (${baseAlunos} base alunos + ${banda} banda + ${segundoCurso} 2o curso)`
      : `*${total}*`;
  };
  
  // Estado para período do relatório
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'hoje' | 'ontem' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado'>('hoje');
  const [relatorioDataInicio, setRelatorioDataInicio] = useState<Date>(new Date());
  const [relatorioDataFim, setRelatorioDataFim] = useState<Date>(new Date());

  // Toggle cron automático
  const [cronAtivo, setCronAtivo] = useState(false);
  const [loadingCron, setLoadingCron] = useState(false);

  // Carregar estado do cron quando modal abre
  React.useEffect(() => {
    if (open && unidade && unidade !== 'todos') {
      supabase
        .from('unidades')
        .select('relatorio_diario_cron_ativo')
        .eq('id', unidade)
        .single()
        .then(({ data }) => {
          setCronAtivo(data?.relatorio_diario_cron_ativo || false);
        });
    }
  }, [open, unidade]);

  const toggleCron = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!unidade || unidade === 'todos') return;
    setLoadingCron(true);
    const novoValor = !cronAtivo;
    const { error } = await supabase.rpc('toggle_relatorio_cron', {
      p_unidade_id: unidade,
      p_ativo: novoValor,
    });
    setLoadingCron(false);
    if (error) {
      toast.error('Erro ao atualizar configuração');
    } else {
      setCronAtivo(novoValor);
      toast.success(novoValor ? 'Envio automático ativado às 20h' : 'Envio automático desativado');
    }
  };

  const [ano, mes] = competencia.split('-').map(Number);
  const mesNome = new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hoje = new Date().toLocaleDateString('pt-BR');

  const obterCompetenciaGerencial = () => {
    if (relatorioPeriodo === 'mes_anterior') {
      return {
        anoRelatorio: relatorioDataInicio.getFullYear(),
        mesRelatorio: relatorioDataInicio.getMonth() + 1,
      };
    }

    if (relatorioPeriodo !== 'personalizado') {
      return { anoRelatorio: ano, mesRelatorio: mes };
    }

    const mesmoMes = relatorioDataInicio.getFullYear() === relatorioDataFim.getFullYear()
      && relatorioDataInicio.getMonth() === relatorioDataFim.getMonth();

    if (!mesmoMes) {
      throw new Error('O relatorio gerencial e mensal. Selecione um periodo personalizado dentro do mesmo mes.');
    }

    return {
      anoRelatorio: relatorioDataInicio.getFullYear(),
      mesRelatorio: relatorioDataInicio.getMonth() + 1,
    };
  };

  const obterCompetenciaMensalAdministrativa = () => {
    if (relatorioPeriodo === 'mes_anterior') {
      return {
        anoRelatorio: relatorioDataInicio.getFullYear(),
        mesRelatorio: relatorioDataInicio.getMonth() + 1,
        precisaBuscar: true,
      };
    }

    if (relatorioPeriodo !== 'personalizado') {
      return { anoRelatorio: ano, mesRelatorio: mes, precisaBuscar: true };
    }

    const mesmoMes = relatorioDataInicio.getFullYear() === relatorioDataFim.getFullYear()
      && relatorioDataInicio.getMonth() === relatorioDataFim.getMonth();

    if (!mesmoMes) {
      throw new Error('O relatorio mensal precisa estar dentro de uma unica competencia. Selecione datas do mesmo mes.');
    }

    return {
      anoRelatorio: relatorioDataInicio.getFullYear(),
      mesRelatorio: relatorioDataInicio.getMonth() + 1,
      precisaBuscar: true,
    };
  };

  async function buscarDadosMensaisAdministrativos(
    anoRelatorio: number,
    mesRelatorio: number
  ): Promise<DadosRelatorioMensalAdministrativo> {
    const dataInicioMes = inicioMesISO(anoRelatorio, mesRelatorio);
    const dataFimMes = fimMesISO(anoRelatorio, mesRelatorio);

    let query = supabase
      .from('movimentacoes_admin')
      .select('*, unidades!movimentacoes_admin_unidade_id_fkey(codigo)')
      .or(`and(data.gte.${dataInicioMes},data.lte.${dataFimMes}),and(competencia_referencia.gte.${dataInicioMes},competencia_referencia.lte.${dataFimMes})`)
      .order('data', { ascending: false });

    const mesSaidaDate = new Date(anoRelatorio, mesRelatorio, 1);
    const mesSaidaAno = mesSaidaDate.getFullYear();
    const mesSaidaMes = mesSaidaDate.getMonth() + 1;
    const mesSaidaStart = inicioMesISO(mesSaidaAno, mesSaidaMes);
    const mesSaidaEnd = fimMesISO(mesSaidaAno, mesSaidaMes);

    let queryAvisos = supabase
      .from('movimentacoes_admin')
      .select('*, unidades!movimentacoes_admin_unidade_id_fkey(codigo)')
      .eq('tipo', 'aviso_previo')
      .gte('mes_saida', mesSaidaStart)
      .lte('mes_saida', mesSaidaEnd)
      .order('data', { ascending: false });

    if (unidade !== 'todos') {
      query = query.eq('unidade_id', unidade);
      queryAvisos = queryAvisos.eq('unidade_id', unidade);
    }

    const [movResult, avisosResult, profsResult, fpResult, cursosResult] = await Promise.all([
      query,
      queryAvisos,
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('formas_pagamento').select('id, nome, sigla').order('nome'),
      supabase.from('cursos').select('id, nome, is_projeto_banda').order('nome'),
    ]);

    if (movResult.error) throw movResult.error;
    if (avisosResult.error) throw avisosResult.error;

    const idsJaPresentes = new Set((movResult.data || []).map((m: any) => m.id));
    const movCombinado = [
      ...(movResult.data || []),
      ...(avisosResult.data || []).filter((a: any) => !idsJaPresentes.has(a.id)),
    ];

    const alunosIds = movCombinado.filter((m: any) => m.aluno_id).map((m: any) => m.aluno_id) || [];
    let alunosMap = new Map<string, any>();
    if (alunosIds.length > 0) {
      const { data: alunosData } = await supabase
        .from('alunos')
        .select('id, classificacao, valor_parcela, data_matricula, data_saida, tipo_matricula_id, is_segundo_curso')
        .in('id', alunosIds);
      alunosMap = new Map((alunosData || []).map((a: any) => [String(a.id), a]));
    }

    const cursosMap = new Map((cursosResult.data || []).map((c: any) => [c.id, c]));
    const movDataComAlunos = movCombinado.map((m: any) => {
      const curso = m.curso_id ? cursosMap.get(m.curso_id) : null;
      return aplicarFallbacksRetencao({
        ...m,
        alunos: m.aluno_id ? alunosMap.get(String(m.aluno_id)) : null,
        curso_nome: curso?.nome || null,
        cursos: curso ? { nome: curso.nome, is_projeto_banda: curso.is_projeto_banda } : null,
      });
    });

    const isPeriodoAtual = isMesAtual(anoRelatorio, mesRelatorio);
    const kpisAlunosCanonicos = await fetchKPIsAlunosCanonicos({
      unidadeId: unidade,
      ano: anoRelatorio,
      mes: mesRelatorio,
    });

    let kpisData: any[] = [];
    if (isPeriodoAtual) {
      kpisData = await fetchKPIsAlunosAdminOperacionalRelatorio({
        unidadeId: unidade,
        ano: anoRelatorio,
        mes: mesRelatorio,
      });

      if (kpisAlunosCanonicos.fonte !== 'indisponivel') {
        const canonicosPorUnidade = new Map(
          kpisAlunosCanonicos.porUnidade.map(row => [row.unidade_id, row])
        );

        kpisData = kpisData.map((row: any) => {
          const canonico = canonicosPorUnidade.get(row.unidade_id);
          if (!canonico) return row;

          return {
            ...row,
            ticket_medio: canonico.ticketMedio,
            faturamento_previsto: canonico.faturamentoPrevisto,
            churn_rate: canonico.churnRate,
            tempo_permanencia_medio: canonico.tempoPermanencia,
            _matriculas_ativas: row._matriculas_ativas || canonico.matriculasAtivas,
            _matriculas_base_alunos_ativos: row._matriculas_base_alunos_ativos || canonico.matriculasBaseAlunosAtivos,
            _matriculas_banda: row._matriculas_banda || canonico.matriculasBanda,
            _matriculas_2_curso: row._matriculas_2_curso || canonico.matriculasSegundoCurso,
            _alunos_com_2_curso: row._alunos_com_2_curso || canonico.alunosComSegundoCurso,
            _matriculas_2_curso_extras: row._matriculas_2_curso_extras || canonico.matriculasSegundoCursoExtras,
            _alunos_coral: row._alunos_coral || canonico.matriculasCoral,
          };
        });
      }
    } else if (kpisAlunosCanonicos.fonte !== 'indisponivel') {
      kpisData = kpisAlunosCanonicos.porUnidade.map(row => ({
        unidade_id: row.unidade_id,
        total_alunos_ativos: row.alunosAtivos,
        total_alunos_pagantes: row.alunosPagantes,
        total_bolsistas_integrais: row.bolsistasIntegrais,
        total_bolsistas_integrais_regulares: row.bolsistasIntegraisRegulares,
        total_bolsistas_integrais_segundo_curso: row.bolsistasIntegraisSegundoCurso,
        total_bolsistas_parciais: row.bolsistasParciais,
        ticket_medio: row.ticketMedio,
        faturamento_previsto: row.faturamentoPrevisto,
        churn_rate: row.churnRate,
        tempo_permanencia_medio: row.tempoPermanencia,
        _matriculas_ativas: row.matriculasAtivas,
        _matriculas_base_alunos_ativos: row.matriculasBaseAlunosAtivos,
        _matriculas_banda: row.matriculasBanda,
        _matriculas_2_curso: row.matriculasSegundoCurso,
        _alunos_com_2_curso: row.alunosComSegundoCurso,
        _matriculas_2_curso_extras: row.matriculasSegundoCursoExtras,
        _alunos_coral: row.matriculasCoral,
      }));
    }

    if (!isPeriodoAtual && kpisAlunosCanonicos.fonte === 'indisponivel') {
      throw new Error(`Snapshot indisponivel para ${String(mesRelatorio).padStart(2, '0')}/${anoRelatorio}.`);
    }

    const snapshotMatriculas = kpisData.length > 0 && kpisData[0]._matriculas_ativas != null;
    let matriculasAtivas = 0;
    let matriculasBanda = 0;
    let matriculas2Curso = 0;
    let alunosCoral = 0;

    if (snapshotMatriculas) {
      matriculasAtivas = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_ativas || 0), 0);
      matriculasBanda = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_banda || 0), 0);
      matriculas2Curso = kpisData.reduce((acc: number, k: any) => acc + (k._matriculas_2_curso || 0), 0);
      alunosCoral = kpisData.reduce((acc: number, k: any) => acc + (k._alunos_coral || 0), 0);
    } else if (isPeriodoAtual) {
      let matriculasQuery = supabase
        .from('alunos')
        .select('id, is_segundo_curso, curso_id, cursos:curso_id!left(nome, is_projeto_banda)')
        .in('status', ['ativo', 'aviso_previo', 'trancado']);

      if (unidade !== 'todos') {
        matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
      }

      const { data: matriculasData } = await matriculasQuery;
      matriculasAtivas = matriculasData?.length || 0;
      matriculasBanda = matriculasData?.filter((m: any) => m.cursos?.is_projeto_banda).length || 0;
      matriculas2Curso = matriculasData?.filter((m: any) =>
        m.is_segundo_curso
        && !m.cursos?.is_projeto_banda
        && !m.cursos?.nome?.toLowerCase()?.includes('coral')
      ).length || 0;
      alunosCoral = matriculasData?.filter((m: any) =>
        m.cursos?.nome?.toLowerCase()?.includes('canto coral')
      ).length || 0;
    }

    const kpis = kpisData.reduce((acc, k) => ({
      alunos_ativos: (acc.alunos_ativos || 0) + (k.total_alunos_ativos || 0),
      alunos_pagantes: (acc.alunos_pagantes || 0) + (k.total_alunos_pagantes || 0),
      alunos_nao_pagantes: (acc.alunos_nao_pagantes || 0) + ((k.total_alunos_ativos || 0) - (k.total_alunos_pagantes || 0)),
      bolsistas_integrais: (acc.bolsistas_integrais || 0) + (k.total_bolsistas_integrais || 0),
      bolsistas_integrais_regulares: (acc.bolsistas_integrais_regulares || 0) + (k.total_bolsistas_integrais_regulares || 0),
      bolsistas_integrais_segundo_curso: (acc.bolsistas_integrais_segundo_curso || 0) + (k.total_bolsistas_integrais_segundo_curso || 0),
      bolsistas_parciais: (acc.bolsistas_parciais || 0) + (k.total_bolsistas_parciais || 0),
      matriculas_banda: matriculasBanda,
      matriculas_base_alunos_ativos: (acc.matriculas_base_alunos_ativos || 0) + (k._matriculas_base_alunos_ativos || 0),
      matriculas_2_curso: matriculas2Curso,
      alunos_com_2_curso: (acc.alunos_com_2_curso || 0) + (k._alunos_com_2_curso || 0),
      matriculas_2_curso_extras: (acc.matriculas_2_curso_extras || 0) + (k._matriculas_2_curso_extras || 0),
      alunos_coral: alunosCoral,
      faturamento: (acc.faturamento || 0) + (Number(k.faturamento_previsto) || 0),
      churn_rate: k.churn_rate || acc.churn_rate || 0,
      ltv_meses: Number(k.tempo_permanencia_medio) || acc.ltv_meses || 0,
    }), {} as any);

    const tempoPermanenciaCanonico = unidade === 'todos'
      ? Number(kpisAlunosCanonicos.tempoPermanencia) || 0
      : Number(kpisAlunosCanonicos.porUnidade.find(row => row.unidade_id === unidade)?.tempoPermanencia) || 0;

    if ((!kpis.ltv_meses || Number(kpis.ltv_meses) <= 0) && tempoPermanenciaCanonico > 0) {
      kpis.ltv_meses = tempoPermanenciaCanonico;
    }

    kpis.ticket_medio = kpis.alunos_pagantes > 0
      ? kpis.faturamento / kpis.alunos_pagantes
      : 0;

    const profMap = new Map((profsResult.data || []).map((p: any) => [p.id, p.nome]));
    const fpMap = new Map((fpResult.data || []).map((f: any) => [f.id, { nome: f.nome, sigla: f.sigla }]));
    const movimentacoesEnriquecidas = (movDataComAlunos || []).map((m: any) => ({
      ...m,
      professor_nome: m.professor_id ? profMap.get(m.professor_id) : undefined,
      forma_pagamento_nome: m.forma_pagamento_id ? (fpMap.get(m.forma_pagamento_id) as any)?.sigla : undefined,
    })) as MovimentacaoAdmin[];

    const movRetencaoCanonicas = filtrarRetencaoCanonica(movDataComAlunos)
      .filter(isMovimentoBaseAlunosParaRetencao);
    const trancamentos = movimentacoesEnriquecidas.filter(m => m.tipo === 'trancamento');
    const renovacoesDaCompetencia = movimentacoesEnriquecidas.filter(m =>
      m.tipo === 'renovacao' && isCompetenciaNoPeriodo(m, dataInicioMes, dataFimMes)
    );
    const renovacoes = renovacoesDaCompetencia.filter(isRenovacaoConfirmadaOperacional);
    const renovacoesPendentesConfirmacao = renovacoesDaCompetencia.filter(m => !isRenovacaoConfirmadaOperacional(m));
    const naoRenovacoes = movimentacoesEnriquecidas.filter(m => m.tipo === 'nao_renovacao');
    const avisosPrevios = movimentacoesEnriquecidas.filter(m => m.tipo === 'aviso_previo');
    const evasoes = movimentacoesEnriquecidas.filter(m => m.tipo === 'evasao');

    let novosAlunosQuery = supabase
      .from('alunos')
      .select('id, nome, data_matricula, unidade_id, valor_parcela, is_segundo_curso, tipo_matricula_id, agente_comercial, cursos(nome), professores:professor_atual_id(nome), tipos_matricula(codigo, conta_como_pagante), formas_pagamento:forma_pagamento_id(nome, sigla), unidades(codigo)')
      .gte('data_matricula', dataInicioMes)
      .lte('data_matricula', dataFimMes)
      .order('data_matricula', { ascending: false });

    if (unidade !== 'todos') {
      novosAlunosQuery = novosAlunosQuery.eq('unidade_id', unidade);
    }

    const { data: todosNovosData } = await novosAlunosQuery;
    const todosNovos = todosNovosData || [];

    let transferenciasHistorico: any[] = [];
    try {
      let transferenciasQuery = supabase
        .from('aluno_transferencias')
        .select('id, aluno_id, unidade_origem_id, unidade_destino_id, data_transferencia, observacao')
        .gte('data_transferencia', dataInicioMes)
        .lte('data_transferencia', dataFimMes)
        .order('data_transferencia', { ascending: false });

      if (unidade !== 'todos') {
        transferenciasQuery = transferenciasQuery.or(`unidade_origem_id.eq.${unidade},unidade_destino_id.eq.${unidade}`);
      }

      const { data: transferenciasData, error: transferenciasError } = await transferenciasQuery;
      if (transferenciasError) throw transferenciasError;
      transferenciasHistorico = transferenciasData || [];
    } catch (error: any) {
      if (!['PGRST205', '42P01'].includes(error?.code)) {
        console.warn('Historico de transferencias indisponivel:', error);
      }
    }

    const unidadeIdsTransferencia = Array.from(new Set(
      transferenciasHistorico
        .flatMap(t => [t.unidade_origem_id, t.unidade_destino_id])
        .filter(Boolean)
    ));
    let unidadesTransferenciaMap = new Map<string, { codigo?: string | null; nome?: string | null }>();

    if (unidadeIdsTransferencia.length > 0) {
      const { data: unidadesTransferenciaData } = await supabase
        .from('unidades')
        .select('id, codigo, nome')
        .in('id', unidadeIdsTransferencia);

      unidadesTransferenciaMap = new Map(
        (unidadesTransferenciaData || []).map((u: any) => [String(u.id), { codigo: u.codigo, nome: u.nome }])
      );
    }

    const alunoIdsTransferencia = Array.from(new Set(
      transferenciasHistorico.map((t: any) => t.aluno_id).filter(Boolean)
    ));
    let alunosTransferenciaMap = new Map<string, any>();

    if (alunoIdsTransferencia.length > 0) {
      const { data: alunosTransferenciaData } = await supabase
        .from('alunos')
        .select('id, nome, data_matricula, unidade_id, valor_parcela, is_segundo_curso, tipo_matricula_id, agente_comercial, cursos(nome), professores:professor_atual_id(nome), tipos_matricula(codigo, conta_como_pagante), formas_pagamento:forma_pagamento_id(nome, sigla), unidades(codigo, nome)')
        .in('id', alunoIdsTransferencia);

      alunosTransferenciaMap = new Map(
        (alunosTransferenciaData || []).map((a: any) => [String(a.id), a])
      );
    }

    const transferenciasAdministrativasPeriodo = transferenciasHistorico
      .map((t: any) => {
        const origem = unidadesTransferenciaMap.get(String(t.unidade_origem_id));
        const destino = unidadesTransferenciaMap.get(String(t.unidade_destino_id));
        const transferencia = {
          ...t,
          unidade_origem_nome: origem?.nome || null,
          unidade_origem_codigo: origem?.codigo || null,
          unidade_destino_nome: destino?.nome || null,
          unidade_destino_codigo: destino?.codigo || null,
          direcao: direcaoTransferenciaNaUnidade(t, unidade),
        };
        const aluno = alunosTransferenciaMap.get(String(t.aluno_id));

        return {
          ...(aluno || {
            id: Number(t.aluno_id) || t.id,
            nome: 'Aluno transferido',
            data_matricula: t.data_transferencia,
            valor_parcela: null,
            cursos: null,
            professores: null,
            unidades: {
              codigo: destino?.codigo || null,
              nome: destino?.nome || null,
            },
          }),
          transferencia,
        };
      })
      .filter((t: any) => transferenciaPertenceAUnidade(t.transferencia, unidade));

    const transferenciasRecebidasPeriodo = unidade === 'todos'
      ? transferenciasAdministrativasPeriodo
      : transferenciasAdministrativasPeriodo.filter((t: any) => (
          transferenciaRecebidaNaUnidade(t.transferencia, unidade)
        ));

    const novosAlunos = todosNovos.filter(isAlunoNovoPaganteAdministrativo);
    const novosSegundoCurso = todosNovos.filter((a: any) => a.is_segundo_curso).length;
    const novasTransferencias = transferenciasRecebidasPeriodo.length;
    const novosBolsistas = todosNovos.filter((a: any) =>
      isAlunoNovoForaComercial(a) && !isAlunoTransferenciaAdministrativa(a)
    ).length;

    const retencaoRows = calcularRetencaoOperacionalCanonica({
      movimentacoes: movRetencaoCanonicas,
      unidades: unidadesFromKPIsCanonicos(kpisAlunosCanonicos.porUnidade),
      alunosPagantesPorUnidade: pagantesMapFromKPIsCanonicos(kpisAlunosCanonicos.porUnidade),
      ano: anoRelatorio,
      mes: mesRelatorio,
    });

    const retConsolidado = consolidarRetencaoOperacional(retencaoRows, unidade, anoRelatorio, mesRelatorio);
    const naoRenovacoesCount = retConsolidado.nao_renovacoes || naoRenovacoes.length;
    const renovacoesRealizadasCount = retConsolidado.renovacoes_realizadas || renovacoes.length;
    const renovacoesPendentesCount = retConsolidado.renovacoes_pendentes || renovacoesPendentesConfirmacao.length;

    const resumoMensal: ResumoMes = {
      alunos_ativos: kpis.alunos_ativos || 0,
      alunos_pagantes: kpis.alunos_pagantes || 0,
      alunos_nao_pagantes: kpis.alunos_nao_pagantes || 0,
      alunos_trancados: trancamentos.length,
      bolsistas_integrais: kpis.bolsistas_integrais || 0,
      bolsistas_integrais_regulares: kpis.bolsistas_integrais_regulares || 0,
      bolsistas_integrais_segundo_curso: kpis.bolsistas_integrais_segundo_curso || 0,
      bolsistas_parciais: kpis.bolsistas_parciais || 0,
      alunos_novos: novosAlunos.length,
      matriculas_ativas: matriculasAtivas,
      matriculas_base_alunos_ativos: kpis.matriculas_base_alunos_ativos || 0,
      matriculas_banda: matriculasBanda,
      matriculas_2_curso: matriculas2Curso,
      alunos_com_2_curso: kpis.alunos_com_2_curso || 0,
      matriculas_2_curso_extras: kpis.matriculas_2_curso_extras || 0,
      alunos_coral: alunosCoral,
      renovacoes_previstas: renovacoesRealizadasCount + naoRenovacoesCount + renovacoesPendentesCount,
      renovacoes_realizadas: renovacoesRealizadasCount,
      renovacoes_pendentes: renovacoesPendentesCount,
      nao_renovacoes: naoRenovacoesCount,
      avisos_previos: retConsolidado.avisos_previos || avisosPrevios.length,
      evasoes_total: retConsolidado.total_evasoes || 0,
      evasoes_interrompido: retConsolidado.evasoes_interrompidas || 0,
      evasoes_nao_renovou: naoRenovacoesCount,
      ticket_medio: kpis.ticket_medio || 0,
      faturamento: kpis.faturamento || 0,
      churn_rate: kpis.churn_rate || 0,
      ltv_meses: kpis.ltv_meses || 0,
      mrr_perdido: retConsolidado.mrr_perdido || 0,
      novos_segundo_curso: novosSegundoCurso,
      novos_bolsistas: novosBolsistas,
      novas_transferencias: novasTransferencias,
    };

    return {
      resumo: resumoMensal,
      renovacoes,
      naoRenovacoes,
      avisosPrevios,
      evasoes,
      transferencias: transferenciasRecebidasPeriodo,
      ano: anoRelatorio,
      mes: mesRelatorio,
    };
  }

  async function gerarRelatorioGerencialIA(): Promise<string> {
    setLoadingIA(true);
    setErroIA(null);
    
    try {
      const { anoRelatorio, mesRelatorio } = obterCompetenciaGerencial();

      // Converter unidade para UUID se necessário
      let unidadeUUID: string | null = null;
      if (unidade && unidade !== 'todos') {
        // Se já é UUID, usa direto; senão, tenta mapear
        unidadeUUID = unidade.includes('-') ? unidade : null;
      }

      console.log('[ModalRelatorio] Gerando relatório gerencial IA');
      console.log('[ModalRelatorio] unidade recebida:', unidade);
      console.log('[ModalRelatorio] unidadeUUID:', unidadeUUID);
      console.log('[ModalRelatorio] ano:', anoRelatorio, 'mes:', mesRelatorio);

      // Buscar dados via função SQL
      const { data: dadosRelatorio, error: errorDados } = await supabase
        .rpc('get_dados_relatorio_gerencial', {
          p_unidade_id: unidadeUUID,
          p_ano: anoRelatorio,
          p_mes: mesRelatorio
        });

      if (errorDados) {
        console.error('Erro ao buscar dados:', errorDados);
        throw new Error('Erro ao buscar dados para o relatório');
      }

      console.log('[ModalRelatorio] Dados retornados:', dadosRelatorio);

      // Determinar nome da unidade
      const nomeUnidade = unidadeUUID 
        ? (UUID_NOME_MAP[unidadeUUID] || dadosRelatorio?.periodo?.unidade_nome || 'Unidade')
        : 'Consolidado';
      const isConsolidado = !unidadeUUID;

      console.log('[ModalRelatorio] nomeUnidade:', nomeUnidade);
      console.log('[ModalRelatorio] isConsolidado:', isConsolidado);

      // Chamar Edge Function
      const { data: responseData, error: errorEdge } = await supabase.functions.invoke(
        'gemini-relatorio-gerencial',
        {
          body: {
            dados: dadosRelatorio,
            unidade_nome: nomeUnidade,
            is_consolidado: isConsolidado
          }
        }
      );

      if (errorEdge) {
        console.error('Erro na Edge Function:', errorEdge);
        throw new Error('Erro ao gerar relatório com IA');
      }

      if (responseData?.success && responseData?.relatorio) {
        return responseData.relatorio;
      } else {
        throw new Error(responseData?.error || 'Resposta inválida da IA');
      }
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      setErroIA(mensagem);
      return `❌ Erro ao gerar relatório: ${mensagem}\n\nTente novamente em alguns instantes.`;
    } finally {
      setLoadingIA(false);
    }
  }

  async function gerarRelatorioDiario(): Promise<string> {
    // Usar a data selecionada pelo usuário (não hardcoded como hoje)
    const dataSelecionada = relatorioDataInicio;
    const dia = dataSelecionada.getDate().toString().padStart(2, '0');
    const mesNome = dataSelecionada.toLocaleString('pt-BR', { month: 'long' });
    const ano = dataSelecionada.getFullYear();
    
    // Para range de datas (personalizado com início e fim diferentes)
    const dataInicio = relatorioDataInicio;
    const dataFim = relatorioDataFim;
    const isRange = dataInicio.toDateString() !== dataFim.toDateString();
    
    // Buscar nome da unidade e farmers
    let unidadeNome = 'Unidade';
    let farmersNomes = 'Equipe Administrativa';
    
    if (unidade && unidade !== 'todos') {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, farmers_nomes')
        .eq('id', unidade)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        farmersNomes = unidadeData.farmers_nomes?.join(' e ') || 'Equipe Administrativa';
      }
    } else {
      unidadeNome = 'CONSOLIDADO';
      farmersNomes = 'Todas as Unidades';
    }

    // Compara datas como string YYYY-MM-DD (sem fuso, sem armadilha UTC).
    // O bug anterior usava new Date(dataStr) que parseia como UTC midnight —
    // em BRT (UTC-3) isso vira 21h do dia ANTERIOR, perdendo registros do dia atual.
    const dentroDoRange = (dataStr: string) => {
      if (!dataStr) return false;
      const apenasData = dataStr.split('T')[0];
      if (isRange) {
        return apenasData >= format(dataInicio, 'yyyy-MM-dd')
            && apenasData <= format(dataFim, 'yyyy-MM-dd');
      }
      return apenasData === format(dataSelecionada, 'yyyy-MM-dd');
    };

    const dataTransferencia = (item: TransferenciaRelatorio) =>
      item.transferencia?.data_transferencia || item.data_matricula || '';

    const transferenciasNoPeriodo = transferencias.filter(t => dentroDoRange(dataTransferencia(t)));
    const totalTransferenciasMes = transferencias.length || resumo?.novas_transferencias || 0;
    const totalEntradasAdministrativas = (resumo?.alunos_novos || 0) + totalTransferenciasMes;

    const labelUnidadeTransferencia = (
      nome?: string | null,
      codigo?: string | null,
      fallback = 'N/I'
    ) => nome || codigo || fallback;

    const formatarParcelaTransferencia = (valor?: number | string | null) => {
      const numero = Number(valor || 0);
      return numero > 0
        ? `R$ ${numero.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : 'N/I';
    };

    // Filtrar renovações do período selecionado
    const renovacoesHoje = renovacoes.filter(r => dentroDoRange(r.data));

    // Filtrar avisos prévios do período selecionado
    const avisosPreviosHoje = avisosPrevios.filter(a => dentroDoRange(a.data));

    // Filtrar evasões do período selecionado
    const evasoesHoje = evasoes.filter(e => dentroDoRange(e.data));

    // Calcular KPIs
    const totalBolsistas = (resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0);
    const taxaInadimplencia = resumo?.alunos_ativos 
      ? ((resumo?.alunos_nao_pagantes || 0) / resumo.alunos_ativos * 100)
      : 0;
    const taxaRenovacao = resumo?.renovacoes_previstas
      ? ((resumo?.renovacoes_realizadas || 0) / resumo.renovacoes_previstas * 100)
      : 0;

    // Formatar período para exibição
    const periodoTexto = isRange 
      ? `${dataInicio.toLocaleDateString('pt-BR')} a ${dataFim.toLocaleDateString('pt-BR')}`
      : `${dia}/${mesNome}/${ano}`;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📋 *RELATÓRIO DIÁRIO ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📆 ${periodoTexto}\n`;
    texto += `👥 ${farmersNomes}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `👥 *ALUNOS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ativos: *${resumo?.alunos_ativos || 0}*\n`;
    texto += `• Pagantes: *${resumo?.alunos_pagantes || 0}*\n`;
    texto += `• Não Pagantes: *${resumo?.alunos_nao_pagantes || 0}* (${taxaInadimplencia.toFixed(1)}%)\n`;
    texto += `- Bolsistas Integrais: ${formatarBolsistasIntegrais()}\n`;
    texto += `• Bolsistas Parciais: *${resumo?.bolsistas_parciais || 0}*\n`;
    texto += `• Trancados: *${resumo?.alunos_trancados || 0}*\n`;
    texto += `• Novos no mês: *${resumo?.alunos_novos || 0}*\n`;
    texto += `• Transferências recebidas no mês: *${totalTransferenciasMes}*\n`;
    texto += `• Entrada de novos alunos no mês: *${totalEntradasAdministrativas}* (${resumo?.alunos_novos || 0} novos + ${totalTransferenciasMes} transferência${totalTransferenciasMes !== 1 ? 's' : ''})\n\n`;

    texto += `📚 *MATRÍCULAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Matrículas Ativas: ${formatarMatriculasAtivas()}\n`;
    texto += `• Matrículas em Banda: *${resumo?.matriculas_banda || 0}*\n`;
    texto += `- Matriculas de 2o Curso: ${formatarMatriculasSegundoCurso()}\n`;
    texto += `• Alunos no Coral: *${resumo?.alunos_coral || 0}*\n\n`;

    texto += `🔄 *RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total previsto: *${resumo?.renovacoes_previstas || 0}*\n`;
    texto += `• Realizadas: *${resumo?.renovacoes_realizadas || 0}*\n`;
    texto += `• Pendentes: *${resumo?.renovacoes_pendentes || 0}*\n`;
    texto += `• Não Renovações: *${resumo?.nao_renovacoes || 0}*\n`;
    texto += `• Taxa de Renovação: *${taxaRenovacao.toFixed(1)}%*\n\n`;

    // Renovações do dia
    if (renovacoesHoje.length > 0) {
      texto += `✅ *RENOVAÇÕES DO DIA (${renovacoesHoje.length})*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      renovacoesHoje.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (*+${reajuste.toFixed(1)}%*)\n`;
        texto += `   Agente: ${r.agente_comercial || 'N/A'}\n\n`;
      });
    } else {
      texto += `✅ *RENOVAÇÕES DO DIA: 0*\n\n`;
    }

    // Não Renovações do dia
    const naoRenovacoesHoje = naoRenovacoes.filter(r => dentroDoRange(r.data));
    if (naoRenovacoesHoje.length > 0) {
      texto += `❌ *NÃO RENOVAÇÕES DO DIA (${naoRenovacoesHoje.length})*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      naoRenovacoesHoje.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (${reajuste.toFixed(1)}%)\n`;
        texto += `   Professor(a): ${r.professor_nome || 'N/A'}\n`;
        texto += `   Motivo: ${r.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `❌ *NÃO RENOVAÇÕES DO DIA: 0*\n\n`;
    }

    texto += `🔁 *TRANSFERÊNCIAS RECEBIDAS NO PERÍODO (${transferenciasNoPeriodo.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (transferenciasNoPeriodo.length === 0) {
      texto += `Nenhuma transferência recebida neste período.\n\n`;
    } else {
      transferenciasNoPeriodo.forEach((t, i) => {
        const origem = labelUnidadeTransferencia(
          t.transferencia?.unidade_origem_nome,
          t.transferencia?.unidade_origem_codigo,
          'Origem não informada'
        );
        const destino = labelUnidadeTransferencia(
          t.transferencia?.unidade_destino_nome,
          t.transferencia?.unidade_destino_codigo || t.unidades?.codigo,
          'Destino não informado'
        );
        texto += `${i + 1}) Nome: *${t.nome}*\n`;
        texto += `   Movimento: ${origem} → ${destino}\n`;
        texto += `   Curso: ${t.cursos?.nome || 'N/I'} | Prof: ${t.professores?.nome || 'N/I'}\n`;
        texto += `   Parcela: ${formatarParcelaTransferencia(t.valor_parcela)}\n\n`;
      });
    }

    // Avisos Prévios — buscar por mes_saida do mês seguinte
    const proximoMesDate = new Date(ano, dataSelecionada.getMonth() + 1, 1);
    const proximoMesNome = proximoMesDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const ultimoDiaProximoMes = new Date(proximoMesDate.getFullYear(), proximoMesDate.getMonth() + 1, 0).getDate();
    const mesSaidaStart = `${proximoMesDate.getFullYear()}-${String(proximoMesDate.getMonth() + 1).padStart(2, '0')}-01`;
    const mesSaidaEnd = `${proximoMesDate.getFullYear()}-${String(proximoMesDate.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaProximoMes).padStart(2, '0')}`;

    let queryAvisosRelatorio = supabase
      .from('movimentacoes_admin')
      .select('*')
      .eq('tipo', 'aviso_previo')
      .gte('mes_saida', mesSaidaStart)
      .lte('mes_saida', mesSaidaEnd)
      .order('data', { ascending: false });

    if (unidade && unidade !== 'todos') {
      queryAvisosRelatorio = queryAvisosRelatorio.eq('unidade_id', unidade);
    }

    const { data: avisosProximoMes } = await queryAvisosRelatorio;

    // Enriquecer com nome do professor (sem FK, buscar separadamente)
    const profIds = [...new Set((avisosProximoMes || []).map((a: any) => a.professor_id).filter(Boolean))];
    let profMapAvisos = new Map<number, string>();
    if (profIds.length > 0) {
      const { data: profs } = await supabase.from('professores').select('id, nome').in('id', profIds);
      (profs || []).forEach((p: any) => profMapAvisos.set(p.id, p.nome));
    }

    const avisosFiltrados = (avisosProximoMes || []).map((a: any) => ({
      ...a,
      professor_nome: a.professor_id ? profMapAvisos.get(a.professor_id) || null : null,
    }));

    texto += `⚠️ *AVISOS PRÉVIOS PARA SAIR EM ${proximoMesNome}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (avisosFiltrados.length === 0) {
      texto += `Nenhum aviso prévio registrado 🎉\n\n`;
    } else {
      avisosFiltrados.forEach((a: any, i: number) => {
        texto += `${i + 1}) Nome: *${a.aluno_nome}*\n`;
        texto += `   Motivo: ${a.motivo || 'Não informado'}\n`;
        texto += `   Parcela: R$ ${(a.valor_parcela_novo || 0).toFixed(2)}\n`;
        texto += `   Professor(a): ${a.professor_nome || 'N/A'}\n\n`;
      });
      texto += `● Total no mês: *${avisosFiltrados.length}*\n\n`;
    }

    // Evasões
    texto += `🚪 *EVASÕES (Saíram esse mês)*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const getTipoEvasao = classificarTipoEvasaoMovimentacao;
    texto += `• Total de evasões: *${evasoes.length + naoRenovacoes.length}*\n`;
    texto += `• Interrompido: *${evasoes.filter(e => getTipoEvasao(e) === 'interrompido').length}*\n`;
    texto += `• Interrompido 2º Curso: *${evasoes.filter(e => getTipoEvasao(e) === 'interrompido_2_curso').length}*\n`;
    texto += `• Interrompido Bolsista: *${evasoes.filter(e => getTipoEvasao(e) === 'interrompido_bolsista').length}*\n`;
    texto += `• Interrompido Banda: *${evasoes.filter(e => getTipoEvasao(e) === 'interrompido_banda').length}*\n`;
    texto += `• Não Renovou: *${naoRenovacoes.length}*\n`;
    texto += `• Transferência: *${evasoes.filter(e => getTipoEvasao(e) === 'transferencia').length}*\n\n`;

    if (evasoesHoje.length > 0) {
      texto += `Evasões do dia: *${evasoesHoje.length}*\n\n`;
      evasoesHoje.forEach((e, i) => {
        const tipo = getTipoEvasao(e);
        const parcela = valorPerdidoMovimentacao(e);
        texto += `${i + 1}) *${e.aluno_nome}*\n`;
        texto += `   Tipo: ${labelTipoEvasao(tipo)}\n`;
        texto += `   Parcela: ${formatarParcelaEvasaoDiaria(parcela)}\n`;
        texto += `   Motivo: ${e.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `Evasões do dia: *0*\n\n`;
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const agora = new Date();
    texto += `📅 Gerado em: ${agora.getDate().toString().padStart(2, '0')}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${agora.getFullYear()} às ${agora.getHours()}:${agora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  }

  async function gerarRelatorioMensal(): Promise<string> {
    const { anoRelatorio, mesRelatorio, precisaBuscar } = obterCompetenciaMensalAdministrativa();
    const dadosMensais = precisaBuscar
      ? await buscarDadosMensaisAdministrativos(anoRelatorio, mesRelatorio)
      : {
          resumo: resumo as ResumoMes,
          renovacoes,
          naoRenovacoes,
          avisosPrevios,
          evasoes,
          transferencias,
          ano,
          mes,
        };
    const resumoRelatorio = dadosMensais.resumo;
    const renovacoesRelatorio = dadosMensais.renovacoes || [];
    const naoRenovacoesRelatorio = dadosMensais.naoRenovacoes || [];
    const avisosPreviosRelatorio = dadosMensais.avisosPrevios || [];
    const evasoesRelatorio = dadosMensais.evasoes || [];
    const transferenciasRelatorio = dadosMensais.transferencias || [];
    const anoTextoRelatorio = dadosMensais.ano;
    const mesTextoRelatorio = dadosMensais.mes;
    const mesNomeUpper = new Date(anoTextoRelatorio, mesTextoRelatorio - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    // Buscar nome da unidade e farmers do banco
    let unidadeNome = 'CONSOLIDADO';
    let farmersNomes = 'Todas as Unidades';
    
    if (unidade && unidade !== 'todos') {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, farmers_nomes')
        .eq('id', unidade)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        farmersNomes = unidadeData.farmers_nomes?.join(' e ') || 'Equipe Administrativa';
      }
    }

    // Buscar metas do banco
    let metasQuery = supabase
      .from('metas_kpi')
      .select('tipo, valor')
      .eq('ano', anoTextoRelatorio)
      .eq('mes', mesTextoRelatorio);
    
    if (unidade && unidade !== 'todos') {
      metasQuery = metasQuery.eq('unidade_id', unidade);
    }
    
    const { data: metasData } = await metasQuery;
    
    // Mapear metas
    const metas: Record<string, number> = {};
    metasData?.forEach(m => {
      metas[m.tipo] = Number(m.valor);
    });
    
    // Calcular KPIs
    const reajusteMedio = calcularReajusteMedioCanonico(renovacoesRelatorio).media;

    const bolsistasIntegraisRelatorio = resumoRelatorio?.bolsistas_integrais_regulares || resumoRelatorio?.bolsistas_integrais || 0;
    const totalBolsistas = bolsistasIntegraisRelatorio + (resumoRelatorio?.bolsistas_parciais || 0);
    const taxaInadimplencia = resumoRelatorio?.alunos_ativos
      ? ((resumoRelatorio?.alunos_nao_pagantes || 0) / resumoRelatorio.alunos_ativos * 100)
      : 0;
    const taxaRenovacao = resumoRelatorio?.renovacoes_previstas && resumoRelatorio.renovacoes_previstas > 0
      ? ((resumoRelatorio?.renovacoes_realizadas || 0) / resumoRelatorio.renovacoes_previstas * 100)
      : 0;
    const {
      ticketMedio,
      mrrAtual,
      ltv,
      churnRate,
      mrrPerdido,
      tempoPermanenciaMeses,
    } = calcularKpisMensaisAdministrativos({
      resumo: resumoRelatorio,
      evasoes: evasoesRelatorio,
      naoRenovacoes: naoRenovacoesRelatorio,
    });

    // Função para gerar barra de progresso WhatsApp
    const gerarBarra = (atual: number, meta: number, inverso: boolean = false): string => {
      if (meta === 0) return '░░░░░░░░░░ 0%';
      const percentual = Math.min((atual / meta) * 100, 100);
      const blocos = Math.round(percentual / 10);
      const barra = '▓'.repeat(blocos) + '░'.repeat(10 - blocos);
      const status = inverso 
        ? (atual <= meta ? '✅' : '❌')
        : (atual >= meta ? '✅' : '⚠️');
      return `${barra} ${percentual.toFixed(0)}% ${status}`;
    };

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${anoTextoRelatorio}*\n`;
    texto += `👥 Por ${farmersNomes}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // SEÇÃO 1: ALUNOS
    texto += `👥 *ALUNOS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ativos: *${resumoRelatorio?.alunos_ativos || 0}*\n`;
    texto += `• Pagantes: *${resumoRelatorio?.alunos_pagantes || 0}*\n`;
    texto += `• Não Pagantes: *${resumoRelatorio?.alunos_nao_pagantes || 0}*\n`;
    texto += `- Bolsistas: *${totalBolsistas}* (${formatarBolsistasIntegraisTexto(resumoRelatorio)} + ${resumoRelatorio?.bolsistas_parciais || 0} parciais)\n`;
    texto += `• Trancados: *${resumoRelatorio?.alunos_trancados || 0}*\n`;
    texto += `• Novos no mês: *${resumoRelatorio?.alunos_novos || 0}*\n`;
    texto += `• Transferências recebidas no mês: *${transferenciasRelatorio.length || resumoRelatorio?.novas_transferencias || 0}*\n`;
    texto += `• Entrada de novos alunos no mês: *${(resumoRelatorio?.alunos_novos || 0) + (transferenciasRelatorio.length || resumoRelatorio?.novas_transferencias || 0)}*\n\n`;

    // SEÇÃO 2: MATRÍCULAS
    texto += `📚 *MATRÍCULAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Matrículas Ativas: ${formatarMatriculasAtivas(resumoRelatorio)}\n`;
    texto += `• Matrículas em Banda: *${resumoRelatorio?.matriculas_banda || 0}*\n`;
    texto += `- Matriculas de 2o Curso: ${formatarMatriculasSegundoCurso(resumoRelatorio)}\n`;

    // SEÇÃO 3: KPIs FINANCEIROS
    texto += `💰 *KPIs FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ticket Médio: *R$ ${ticketMedio.toFixed(2)}*\n`;
    texto += `• Faturamento Previsto: *R$ ${mrrAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• MRR Atual: *R$ ${mrrAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• LTV (Tempo × Ticket): *R$ ${ltv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• Tempo Permanência: *${tempoPermanenciaMeses.toFixed(1)} meses*\n\n`;

    // SEÇÃO 4: KPIs DE RETENÇÃO
    texto += `📈 *KPIs DE RETENÇÃO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Churn Rate: *${churnRate.toFixed(1)}%*\n`;
    texto += `• Taxa de Renovação: *${taxaRenovacao.toFixed(1)}%*\n`;
    texto += `• Reajuste Médio: *${reajusteMedio.toFixed(1)}%*\n`;
    texto += `• Inadimplência: *${taxaInadimplencia.toFixed(1)}%*\n`;
    texto += `• MRR Perdido: *R$ ${mrrPerdido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• Total Evasões: *${evasoesRelatorio.length}*\n`;
    texto += `• Não Renovações: *${naoRenovacoesRelatorio.length}*\n\n`;

    // SEÇÃO 5: BARRAS DE METAS (Fideliza+ LA)
    texto += `🎯 *METAS FIDELIZA+ LA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Churn (meta: abaixo de 3% para estrela, máximo 4%)
    const metaChurn = metas['churn_rate'] || 4;
    texto += `⭐ *Churn Premiado* (meta: <3%)\n`;
    texto += `   ${gerarBarra(100 - churnRate, 100 - 3, false)}\n`;
    texto += `   Atual: *${churnRate.toFixed(1)}%* | Meta: *<3%*\n\n`;
    
    // Inadimplência (meta: 0%)
    texto += `⭐ *Inadimplência Zero* (meta: 0%)\n`;
    texto += `   ${gerarBarra(100 - taxaInadimplencia, 100, false)}\n`;
    texto += `   Atual: *${taxaInadimplencia.toFixed(1)}%* | Meta: *0%*\n\n`;
    
    // Renovação (meta: 100%)
    const metaRenovacao = metas['taxa_renovacao'] || 90;
    texto += `⭐ *Max Renovação* (meta: 100%)\n`;
    texto += `   ${gerarBarra(taxaRenovacao, 100, false)}\n`;
    texto += `   Atual: *${taxaRenovacao.toFixed(1)}%* | Meta: *100%*\n\n`;
    
    // Reajuste (meta: >8.5%)
    const metaReajuste = metas['reajuste_medio'] || 9;
    texto += `⭐ *Reajuste Campeão* (meta: >8.5%)\n`;
    texto += `   ${gerarBarra(reajusteMedio, 8.5, false)}\n`;
    texto += `   Atual: *${reajusteMedio.toFixed(1)}%* | Meta: *>8.5%*\n\n`;

    // SEÇÃO 6: RENOVAÇÕES
    texto += `🔄 *RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total previsto: *${resumoRelatorio?.renovacoes_previstas || 0}*\n`;
    texto += `• Realizadas: *${renovacoesRelatorio.length}*\n`;
    texto += `• Porcentagem: *${taxaRenovacao.toFixed(0)}%*\n\n`;
    
    if (renovacoesRelatorio.length > 0) {
      renovacoesRelatorio.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   Parcela: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (${reajuste.toFixed(2)}%)\n`;
        texto += `   Forma de PG: ${r.forma_pagamento_nome || 'N/A'}\n`;
        texto += `   Agente: ${r.agente_comercial || 'N/A'}\n\n`;
      });
    }

    // SEÇÃO 7: NÃO RENOVAÇÕES
    texto += `❌ *NÃO RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total: *${naoRenovacoesRelatorio.length}*\n`;
    if (resumoRelatorio?.renovacoes_previstas && resumoRelatorio.renovacoes_previstas > 0) {
      const pctNaoRenov = (naoRenovacoesRelatorio.length / resumoRelatorio.renovacoes_previstas) * 100;
      texto += `• Porcentagem: *${pctNaoRenov.toFixed(0)}%*\n\n`;
    } else {
      texto += `\n`;
    }
    
    if (naoRenovacoesRelatorio.length > 0) {
      naoRenovacoesRelatorio.forEach((n, i) => {
        const reajuste = n.valor_parcela_anterior && n.valor_parcela_novo
          ? ((n.valor_parcela_novo - n.valor_parcela_anterior) / n.valor_parcela_anterior) * 100
          : 0;
        const reajusteLabel = reajuste === 0 ? '(Retenção)' : `(${reajuste.toFixed(2)}%)`;
        texto += `${i + 1}) Nome: *${n.aluno_nome}*\n`;
        texto += `   Parcela: R$ ${(n.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(n.valor_parcela_novo || 0).toFixed(2)} ${reajusteLabel}\n`;
        texto += `   Professor: ${n.professor_nome || 'N/A'}\n`;
        texto += `   Motivo: ${n.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `Nenhuma não renovação registrada 🎉\n\n`;
    }

    // SEÇÃO 8: AVISOS PRÉVIOS
    const proximoMes = new Date(anoTextoRelatorio, mesTextoRelatorio).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    texto += `⚠️ *AVISOS PRÉVIOS para sair em ${proximoMes}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total no mês: *${avisosPreviosRelatorio.length}*\n\n`;
    
    if (avisosPreviosRelatorio.length > 0) {
      avisosPreviosRelatorio.forEach((a, i) => {
        texto += `${i + 1}) Nome: *${a.aluno_nome}*\n`;
        texto += `   Motivo: ${a.motivo || 'Não informado'}\n`;
        texto += `   Prof: ${a.professor_nome || 'N/A'}\n\n`;
      });
    } else {
      texto += `Nenhum aviso prévio registrado 🎉\n\n`;
    }

    // SEÇÃO 9: EVASÕES
    texto += `🚪 *EVASÕES (Saíram no mês)*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const tipoEvasaoMensal = (e: any) => classificarTipoEvasaoMovimentacao(e);
    const interrompidos = evasoesRelatorio.filter(e => tipoEvasaoMensal(e) === 'interrompido').length;
    const interrompidos2Curso = evasoesRelatorio.filter(e => tipoEvasaoMensal(e) === 'interrompido_2_curso').length;
    const interrompidosBolsista = evasoesRelatorio.filter(e => tipoEvasaoMensal(e) === 'interrompido_bolsista').length;
    const interrompidosBanda = evasoesRelatorio.filter(e => tipoEvasaoMensal(e) === 'interrompido_banda').length;
    const naoRenovou = evasoesRelatorio.filter(e => tipoEvasaoMensal(e) === 'nao_renovou').length;
    
    texto += `• Total no mês: *${evasoesRelatorio.length}*\n`;
    texto += `• Não renovou: *${naoRenovou}*\n`;
    texto += `• Interrompido: *${interrompidos}*\n`;
    if (interrompidos2Curso > 0) texto += `• Interrompido 2º Curso: *${interrompidos2Curso}*\n`;
    if (interrompidosBolsista > 0) texto += `• Interrompido Bolsista: *${interrompidosBolsista}*\n`;
    if (interrompidosBanda > 0) texto += `• Interrompido Banda: *${interrompidosBanda}*\n`;
    texto += `\n`;
    
    if (evasoesRelatorio.length > 0) {
      evasoesRelatorio.forEach((e, i) => {
        const valorPerdido = valorPerdidoRelatorioMensal(e);
        texto += `${i + 1}) Nome: *${e.aluno_nome}*\n`;
        texto += `   Motivo: ${e.motivo || 'Não informado'}\n`;
        if (valorPerdido > 0) {
          texto += `   Parcela: R$ ${valorPerdido.toFixed(2)}\n`;
        }
        texto += `   Prof: ${e.professor_nome || 'N/A'}\n\n`;
      });
    } else {
      texto += `Nenhuma evasão registrada 🎉\n\n`;
    }

    const dataHora = new Date();
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  }

  async function obterDadosRelatorioAvulsoAdministrativo(): Promise<DadosRelatorioMensalAdministrativo> {
    const { anoRelatorio, mesRelatorio, precisaBuscar } = obterCompetenciaMensalAdministrativa();

    if (precisaBuscar) {
      return buscarDadosMensaisAdministrativos(anoRelatorio, mesRelatorio);
    }

    return {
      resumo: resumo as ResumoMes,
      renovacoes,
      naoRenovacoes,
      avisosPrevios,
      evasoes,
      transferencias,
      ano,
      mes,
    };
  }

  async function gerarRelatorioRenovacoes(): Promise<string> {
    const dadosMensais = await obterDadosRelatorioAvulsoAdministrativo();
    const renovacoesRelatorio = dadosMensais.renovacoes || [];
    const anoTextoRelatorio = dadosMensais.ano;
    const mesTextoRelatorio = dadosMensais.mes;
    const mesNomeUpper = new Date(anoTextoRelatorio, mesTextoRelatorio - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    const reajusteMedio = calcularReajusteMedioCanonico(renovacoesRelatorio).media;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `✅ *RELATÓRIO DE RENOVAÇÕES*\n`;
    texto += `📅 *${mesNomeUpper}/${anoTextoRelatorio}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${renovacoesRelatorio.length} renovações*\n`;
    texto += `Reajuste médio: *+${reajusteMedio.toFixed(1)}%*\n\n`;

    if (renovacoesRelatorio.length === 0) {
      texto += `Nenhuma renovação registrada neste período.\n\n`;
    } else {
      texto += `📋 *LISTA DE RENOVAÇÕES*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      renovacoesRelatorio.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        const dataFormatada = new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. *${r.aluno_nome}*\n`;
        texto += `   📅 ${dataFormatada}\n`;
        texto += `   💰 R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} → R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (*+${reajuste.toFixed(0)}%*)\n`;
        texto += `   💳 ${r.forma_pagamento_nome || 'N/A'} | 👤 ${r.agente_comercial || 'N/A'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  async function gerarRelatorioAvisos(): Promise<string> {
    const dadosMensais = await obterDadosRelatorioAvulsoAdministrativo();
    const avisosRelatorio = dadosMensais.avisosPrevios || [];
    const anoTextoRelatorio = dadosMensais.ano;
    const mesTextoRelatorio = dadosMensais.mes;
    const mesNomeUpper = new Date(anoTextoRelatorio, mesTextoRelatorio - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const perdaPotencial = avisosRelatorio.reduce((acc, a) => acc + (a.valor_parcela_novo || 0), 0);

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `⚠️ *RELATÓRIO DE AVISOS PRÉVIOS*\n`;
    texto += `📅 *${mesNomeUpper}/${anoTextoRelatorio}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${avisosRelatorio.length} avisos prévios*\n`;
    texto += `Perda potencial: *R$ ${perdaPotencial.toFixed(2)}/mês*\n\n`;

    if (avisosRelatorio.length === 0) {
      texto += `Nenhum aviso prévio registrado neste período. 🎉\n\n`;
    } else {
      texto += `📋 *LISTA DE AVISOS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      avisosRelatorio.forEach((a, i) => {
        const dataAviso = new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const mesSaida = a.mes_saida ? new Date(a.mes_saida).toLocaleDateString('pt-BR', { month: 'long' }) : 'N/A';
        texto += `${i + 1}. *${a.aluno_nome}*\n`;
        texto += `   📅 Aviso: ${dataAviso} | 📆 Sai em: ${mesSaida}\n`;
        texto += `   💰 R$ ${(a.valor_parcela_novo || 0).toFixed(2)} | 🎸 ${a.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${a.motivo || 'Sem motivo informado'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  async function gerarRelatorioEvasoes(): Promise<string> {
    const dadosMensais = await obterDadosRelatorioAvulsoAdministrativo();
    const evasoesRelatorio = dadosMensais.evasoes || [];
    const anoTextoRelatorio = dadosMensais.ano;
    const mesTextoRelatorio = dadosMensais.mes;
    const mesNomeUpper = new Date(anoTextoRelatorio, mesTextoRelatorio - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    const porTipo = evasoesRelatorio.reduce((acc, e) => {
      const tipo = classificarTipoEvasaoMovimentacao(e);
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mrrPerdido = evasoesRelatorio.reduce((acc, e) => acc + valorPerdidoRelatorioMensal(e), 0);

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🚪 *RELATÓRIO DE EVASÕES*\n`;
    texto += `📅 *${mesNomeUpper}/${anoTextoRelatorio}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${evasoesRelatorio.length} evasões*\n`;
    if (mrrPerdido > 0) {
      texto += `MRR Perdido: *R$ ${mrrPerdido.toFixed(2)}/mês*\n`;
    }
    texto += `\n`;

    if (Object.keys(porTipo).length > 0) {
      texto += `📈 *POR TIPO*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      Object.entries(porTipo).forEach(([tipo, count]) => {
        const label = tipo === 'nao_renovou'
          ? '❌ Não Renovou'
          : `⏸️ ${labelTipoEvasao(tipo)}`;
        texto += `• ${label}: *${count}*\n`;
      });
      texto += `\n`;
    }

    if (evasoesRelatorio.length === 0) {
      texto += `Nenhuma evasão registrada neste período. 🎉\n\n`;
    } else {
      texto += `📋 *LISTA DE EVASÕES*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      evasoesRelatorio.forEach((e, i) => {
        const tipo = classificarTipoEvasaoMovimentacao(e);
        const tipoLabel = tipo === 'nao_renovou'
          ? '❌ Não Renovou'
          : `⏸️ ${labelTipoEvasao(tipo)}`;
        const dataFormatada = new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. *${e.aluno_nome}*\n`;
        texto += `   📅 ${dataFormatada} | ${tipoLabel}\n`;
        const valorPerdido = valorPerdidoRelatorioMensal(e);
        if (valorPerdido > 0) {
          texto += `   💰 R$ ${valorPerdido.toFixed(2)}`;
          if (e.tempo_permanencia_meses) {
            texto += ` | ⏱️ ${e.tempo_permanencia_meses} meses`;
          }
          texto += `\n`;
        }
        texto += `   🎸 ${e.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${e.motivo || 'Sem motivo informado'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  async function handleSelecionarTipo(tipo: TipoRelatorio) {
    setTipoSelecionado(tipo);
    
    // Se for relatório gerencial IA, gera automaticamente
    if (tipo === 'gerencial_ia') {
      setTextoRelatorio('Gerando relatório com IA... ⏳');
      const texto = await gerarRelatorioGerencialIA();
      setTextoRelatorio(texto);
      return;
    }
    
    let texto = '';
    switch (tipo) {
      case 'diario':
        texto = await gerarRelatorioDiario();
        break;
      case 'mensal':
        texto = await gerarRelatorioMensal();
        break;
      case 'renovacoes':
        texto = await gerarRelatorioRenovacoes();
        break;
      case 'avisos':
        texto = await gerarRelatorioAvisos();
        break;
      case 'evasoes':
        texto = await gerarRelatorioEvasoes();
        break;
    }
    setTextoRelatorio(texto);
  }

  async function copiarRelatorio() {
    if (!textoRelatorio) return;

    const result = await copyTextToClipboard(textoRelatorio);

    if (result.ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      return;
    }

    console.error('Erro ao copiar relatório administrativo:', result.error);
    toast.error('Erro ao copiar', `Selecione o texto manualmente e pressione ${getManualCopyShortcut()}`);
  }

  function voltar() {
    setTipoSelecionado(null);
    setTextoRelatorio('');
    setEnviadoWhatsApp(false);
    setErroWhatsApp(null);
  }

  async function enviarWhatsAppGrupo() {
    if (!textoRelatorio || enviandoWhatsApp) return;
    
    setEnviandoWhatsApp(true);
    setErroWhatsApp(null);
    setEnviadoWhatsApp(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: textoRelatorio,
          tipoRelatorio: tipoSelecionado,
          unidade: unidade,
          competencia: competencia,
          ...(numeroTeste ? { numero_teste: numeroTeste } : {}),
        },
      });
      
      if (error) {
        console.error('[WhatsApp] Erro ao enviar:', error);
        setErroWhatsApp('Erro ao enviar mensagem');
        return;
      }
      
      if (data?.success || data?.partial) {
        console.log('[WhatsApp] ✅ Mensagem enviada!', data.resultados);
        setEnviadoWhatsApp(true);
        setTimeout(() => setEnviadoWhatsApp(false), 3000);
      } else {
        setErroWhatsApp(data?.error || 'Erro desconhecido');
      }
    } catch (err) {
      console.error('[WhatsApp] Erro inesperado:', err);
      setErroWhatsApp('Erro de conexão');
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-cyan-400" />
            {tipoSelecionado ? tiposRelatorio.find(t => t.id === tipoSelecionado)?.label : 'Gerar Relatório'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Gere, revise, copie ou envie relatorios administrativos da competencia selecionada.
          </DialogDescription>
        </DialogHeader>

        {!tipoSelecionado ? (
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
            {/* Seleção de Período */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">Período do Relatório</Label>
              
              {/* Botões de atalho - Simplificado: Ontem e Personalizado */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'ontem', label: 'Ontem' },
                  { id: 'mes_anterior', label: 'Mês anterior' },
                  { id: 'personalizado', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRelatorioPeriodo(p.id as typeof relatorioPeriodo);
                      const hojeDate = new Date();
                      if (p.id === 'ontem') {
                        const ontem = new Date(hojeDate);
                        ontem.setDate(ontem.getDate() - 1);
                        setRelatorioDataInicio(ontem);
                        setRelatorioDataFim(ontem);
                      } else if (p.id === 'mes_anterior') {
                        const inicioAnterior = new Date(hojeDate.getFullYear(), hojeDate.getMonth() - 1, 1);
                        const fimAnterior = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 0);
                        setRelatorioDataInicio(inicioAnterior);
                        setRelatorioDataFim(fimAnterior);
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      relatorioPeriodo === p.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              
              {/* Seletor de datas personalizado */}
              {relatorioPeriodo === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Início</Label>
                    <DatePicker
                      date={relatorioDataInicio}
                      onDateChange={(date) => date && setRelatorioDataInicio(date)}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Fim</Label>
                    <DatePicker
                      date={relatorioDataFim}
                      onDateChange={(date) => date && setRelatorioDataFim(date)}
                    />
                  </div>
                </div>
              )}
              
              {/* Exibir período selecionado */}
              <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {relatorioDataInicio.toLocaleDateString('pt-BR')} 
                {relatorioDataInicio.toDateString() !== relatorioDataFim.toDateString() && (
                  <> até {relatorioDataFim.toLocaleDateString('pt-BR')}</>
                )}
              </p>
            </div>

            <p className="text-slate-400 text-sm">Escolha o tipo de relatório:</p>
            {tiposRelatorio.map((tipo) => (
              <div
                role="button"
                tabIndex={0}
                key={tipo.id}
                onClick={() => handleSelecionarTipo(tipo.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelecionarTipo(tipo.id);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  tipo.destaque 
                    ? "bg-gradient-to-r from-violet-600/20 to-cyan-600/20 hover:from-violet-600/30 hover:to-cyan-600/30 border border-violet-500/50 hover:border-violet-400"
                    : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  tipo.destaque ? "bg-gradient-to-br from-violet-500 to-cyan-500 text-white" : "bg-slate-700/50 text-cyan-400"
                )}>
                  {tipo.icon}
                </div>
                <div className="flex-1">
                  <h3 className={cn("font-medium", tipo.destaque ? "text-violet-300" : "text-white")}>{tipo.label}</h3>
                  <p className="text-xs text-slate-400">{tipo.desc}</p>
                  {tipo.id === 'diario' && (
                    <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={toggleCron}
                        disabled={loadingCron || !unidade || unidade === 'todos'}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          cronAtivo ? "bg-emerald-600" : "bg-slate-600",
                          (!unidade || unidade === 'todos') && "opacity-40 cursor-not-allowed"
                        )}
                        title={!unidade || unidade === 'todos' ? 'Selecione uma unidade' : cronAtivo ? 'Desativar envio automático' : 'Ativar envio automático'}
                      >
                        <span className={cn(
                          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                          cronAtivo ? "translate-x-[18px]" : "translate-x-[3px]"
                        )} />
                      </button>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {cronAtivo ? 'Envio automático 20h ativo' : 'Envio automático 20h'}
                      </span>
                    </div>
                  )}
                </div>
                <span className={tipo.destaque ? "text-violet-400" : "text-slate-500"}>→</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="sm" onClick={voltar} className="text-slate-400 hover:text-white">
                ← Voltar
              </Button>
              <div className="flex items-center gap-2">
                {tipoSelecionado === 'gerencial_ia' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelecionarTipo('gerencial_ia')}
                    disabled={loadingIA}
                    className="text-violet-400 hover:text-violet-300"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    Regenerar
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelecionarTipo(tipoSelecionado)}
                  disabled={loadingIA}
                  className="text-slate-400 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Resetar
                </Button>
                <Button
                  onClick={copiarRelatorio}
                  disabled={loadingIA || !textoRelatorio}
                  className={cn(
                    'transition-all',
                    copiado ? 'bg-emerald-500' : 'bg-cyan-500 hover:bg-cyan-600'
                  )}
                >
                  {copiado ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>
                {usuario?.email === 'hugo@lamusic.com.br' && (
                  <input
                    type="text"
                    placeholder="Teste: 5521999999999"
                    value={numeroTeste}
                    onChange={e => setNumeroTeste(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900/60 border border-amber-500/30 rounded-lg text-xs text-white placeholder-slate-500 w-40"
                  />
                )}
                <Button
                  onClick={enviarWhatsAppGrupo}
                  disabled={loadingIA || enviandoWhatsApp || !textoRelatorio}
                  className={cn(
                    'transition-all',
                    enviadoWhatsApp 
                      ? 'bg-emerald-500' 
                      : erroWhatsApp 
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-600 hover:bg-green-700'
                  )}
                >
                  {enviandoWhatsApp ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : enviadoWhatsApp ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Enviado!
                    </>
                  ) : erroWhatsApp ? (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Tentar novamente
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      WhatsApp
                    </>
                  )}
                </Button>
              </div>
            </div>

            {erroWhatsApp && (
              <p className="text-xs text-red-400 mb-2">❌ {erroWhatsApp}</p>
            )}
            
            {loadingIA ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-800/50 rounded-xl border border-slate-700">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin mb-4" />
                <p className="text-violet-300 font-medium">Gerando relatório com IA...</p>
                <p className="text-slate-500 text-sm mt-1">Isso pode levar alguns segundos</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  💡 Você pode editar o texto antes de copiar
                </p>
                <Textarea
                  value={textoRelatorio}
                  onChange={(e) => setTextoRelatorio(e.target.value)}
                  className="flex-1 bg-slate-800 border-slate-700 font-mono text-sm min-h-[300px] resize-none"
                />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
