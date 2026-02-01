import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  XCircle,
  Trophy,
  Plus,
  Eye,
  Clock,
  UserX,
  Sparkles,
  Calendar,
  Building2,
  Search,
  Target,
  Monitor,
  Shirt,
  MessageCircle,
  Settings2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/Tooltip';
import { KPICard } from '@/components/ui/KPICard';
import { useProfessor360, Professor360Resumo, useConfig360 } from '@/hooks/useProfessor360';
import { Modal360Ocorrencia } from './Modal360Ocorrencia';
import { Modal360Detalhes } from './Modal360Detalhes';
import { Professor360Config } from './Professor360Config';
import { ModalWhatsAppPreview } from './ModalWhatsAppPreview';
import { supabase } from '@/lib/supabase';

interface Tab360ProfessoresProps {
  unidadeSelecionada: string;
  competencia: string;
  onCompetenciaChange?: (competencia: string) => void;
}

// Cores para status de ocorrências (sem ícone, apenas cor)
const getOcorrenciaColor = (qtd: number, tolerancia: number = 0) => {
  if (qtd === 0) return 'text-slate-500';
  if (qtd <= tolerancia) return 'text-amber-400';
  return 'text-rose-400';
};

// Cor da nota
const getNotaColor = (nota: number) => {
  if (nota >= 90) return 'text-emerald-400';
  if (nota >= 70) return 'text-amber-400';
  return 'text-rose-400';
};

const getNotaBg = (nota: number) => {
  if (nota >= 90) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (nota >= 70) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
};

export function Tab360Professores({
  unidadeSelecionada,
  competencia,
  onCompetenciaChange,
}: Tab360ProfessoresProps) {
  const [busca, setBusca] = useState('');
  const [filtroNota, setFiltroNota] = useState<'todos' | 'acima' | 'abaixo'>('todos');
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState<Professor360Resumo | null>(null);
  const [professorSelecionado, setProfessorSelecionado] = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);
  
  // Estado para o modal de WhatsApp
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
  const [dadosWhatsApp, setDadosWhatsApp] = useState<{
    professorNome: string;
    professorWhatsApp: string | null;
    tipoOcorrencia: string;
    dataOcorrencia: string;
    unidadeNome: string;
    registradoPor: string;
    descricao: string | null;
  } | null>(null);

  const {
    criterios,
    avaliacoesCalculadas,
    professores,
    kpis,
    loading,
    createOcorrencia,
  } = useProfessor360(competencia, unidadeSelecionada === 'todos' ? undefined : unidadeSelecionada);

  const { config } = useConfig360();

  // Filtrar por busca e nota
  const avaliacoesFiltradas = useMemo(() => {
    let filtradas = avaliacoesCalculadas;

    // Filtrar por nota de corte
    if (filtroNota === 'acima') {
      filtradas = filtradas.filter(a => a.nota_final >= config.nota_minima_corte);
    } else if (filtroNota === 'abaixo') {
      filtradas = filtradas.filter(a => a.nota_final < config.nota_minima_corte);
    }

    // Filtrar por busca
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      filtradas = filtradas.filter(a => 
        a.professor_nome.toLowerCase().includes(termo) ||
        a.unidade_nome.toLowerCase().includes(termo) ||
        a.unidade_codigo.toLowerCase().includes(termo)
      );
    }

    return filtradas;
  }, [avaliacoesCalculadas, busca, filtroNota, config.nota_minima_corte]);

  // Gerar opções de competência (últimos 12 meses)
  const competenciaOptions = useMemo(() => {
    const options = [];
    const hoje = new Date();
    for (let i = 0; i < 12; i++) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const valor = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const label = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ valor, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  // Abrir modal de ocorrência com professor pré-selecionado
  const handleNovaOcorrencia = (professor?: any) => {
    setProfessorSelecionado(professor || null);
    setModalOcorrencia(true);
  };

  // Abrir modal de detalhes
  const handleVerDetalhes = (avaliacao: Professor360Resumo) => {
    setModalDetalhes(avaliacao);
  };

  // Salvar ocorrência
  const handleSalvarOcorrencia = async (data: any) => {
    try {
      const professor = professores.find(p => p.id === data.professor_id);
      const unidadesProf = professor?.unidades?.map((u: any) => u.id) || [];
      const criterio = criterios.find(c => c.id === parseInt(data.criterio_id));
      const unidade = professor?.unidades?.find((u: any) => u.id === data.unidade_id || u.unidade_id === data.unidade_id);
      
      // Buscar nome do colaborador que registrou (IDs devem corresponder ao Modal360Ocorrencia)
      const COLABORADORES = [
        { id: 'luciano', nome: 'Luciano Alf' },
        { id: 'gabriela', nome: 'Gabriela' },
        { id: 'jhonatan', nome: 'Jhonatan' },
        { id: 'fernanda', nome: 'Fernanda' },
        { id: 'daiana', nome: 'Daiana' },
        { id: 'eduarda', nome: 'Eduarda' },
        { id: 'arthur', nome: 'Arthur' },
        { id: 'vitoria', nome: 'Vitória' },
        { id: 'clayton', nome: 'Clayton' },
        { id: 'kailane', nome: 'Kailane' },
      ];
      const colaborador = COLABORADORES.find(c => c.id === data.registrado_por);
      
      await createOcorrencia(data, undefined, unidadesProf);
      
      // Preparar dados para o WhatsApp
      const professorNome = professor?.nome || '';
      const professorWhatsApp = professor?.telefone_whatsapp || null;
      const tipoOcorrencia = criterio?.nome || '';
      const dataOcorrencia = data.data_ocorrencia;
      const unidadeNome = unidade?.nome || unidade?.unidade_nome || '';
      const registradoPor = colaborador?.nome || '';
      const descricao = data.descricao;
      const toleranciaInfo = data.tolerancia_info;
      const minutosAtraso = data.minutos_atraso;
      const atrasoGrave = data.atraso_grave;
      
      // Montar mensagem com informação de tolerância
      const primeiroNome = professorNome.split(' ')[0];
      let mensagem = `🔔 *LA Music - Avaliação 360°*\n\n`;
      mensagem += `Olá, ${primeiroNome}!\n\n`;
      mensagem += `Uma ocorrência foi registrada em seu perfil:\n\n`;
      mensagem += `📋 *Tipo:* ${tipoOcorrencia}\n`;
      
      // Adicionar tempo de atraso se for pontualidade
      if (minutosAtraso) {
        mensagem += `⏱️ *Tempo de atraso:* ${minutosAtraso >= 60 ? '1 hora ou mais' : `${minutosAtraso} minutos`}\n`;
      }
      
      mensagem += `📅 *Data:* ${dataOcorrencia.split('-').reverse().join('/')}\n`;
      mensagem += `🏢 *Unidade:* ${unidadeNome}\n`;
      mensagem += `👤 *Registrado por:* ${registradoPor}\n`;
      
      // Adicionar info de tolerância/atraso grave
      if (atrasoGrave) {
        mensagem += `\n❌ *Atraso acima de 10 minutos!* Pontuação descontada: -${toleranciaInfo?.pontos_descontados || 0} pts (sem tolerância)\n`;
      } else if (toleranciaInfo) {
        if (toleranciaInfo.tolerancia_esgotada) {
          mensagem += `\n❌ *Tolerância esgotada!* Pontuação descontada: -${toleranciaInfo.pontos_descontados} pts\n`;
        } else if (toleranciaInfo.ultima_tolerancia) {
          mensagem += `\n⚠️ *Atenção:* Esta foi sua última tolerância (${toleranciaInfo.ocorrencia_numero}/${toleranciaInfo.tolerancia_total}). A próxima ocorrência descontará pontos.\n`;
        } else {
          mensagem += `\nℹ️ *Tolerância:* ${toleranciaInfo.ocorrencia_numero}/${toleranciaInfo.tolerancia_total} (ainda dentro da tolerância)\n`;
        }
      }
      
      if (descricao) {
        mensagem += `\n📝 *Observação:* ${descricao}\n`;
      }
      mensagem += `\n---\nEm caso de dúvidas, procure a coordenação.`;
      
      // Preparar dados para o modal de WhatsApp (prévia antes do envio)
      setDadosWhatsApp({
        professorNome,
        professorWhatsApp,
        tipoOcorrencia,
        dataOcorrencia,
        unidadeNome,
        registradoPor,
        descricao,
        toleranciaInfo,
        minutosAtraso,
        atrasoGrave,
      });
      
      setModalOcorrencia(false);
      setProfessorSelecionado(null);
      
      // Abrir modal de WhatsApp (para confirmação ou envio manual)
      setShowWhatsAppPreview(true);
    } catch (error) {
      console.error('Erro ao salvar ocorrência:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com filtros */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <Select value={competencia} onValueChange={onCompetenciaChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {competenciaOptions.map(opt => (
                  <SelectItem key={opt.valor} value={opt.valor}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar professor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>

          {/* Filtros de Nota */}
          <div className="flex gap-2 border-l border-slate-700 pl-3">
            <Button
              variant={filtroNota === 'todos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroNota('todos')}
              className={filtroNota === 'todos' ? 'bg-violet-600 hover:bg-violet-700' : ''}
            >
              Todos
            </Button>
            <Button
              variant={filtroNota === 'acima' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroNota('acima')}
              className={filtroNota === 'acima' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              Acima do corte
            </Button>
            <Button
              variant={filtroNota === 'abaixo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroNota('abaixo')}
              className={filtroNota === 'abaixo' ? 'bg-rose-600 hover:bg-rose-700' : ''}
            >
              Abaixo do corte
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowConfig(!showConfig)} 
            className="gap-2"
          >
            <Settings2 className="h-4 w-4" />
            {showConfig ? 'Ocultar Config' : 'Configurações'}
          </Button>
          <Button onClick={() => handleNovaOcorrencia()} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4" />
            Registrar Ocorrência
          </Button>
        </div>
      </div>

      {/* Nota de Corte - Informativo */}
      <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/30 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
            <Target className="h-5 w-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white">Nota de Corte: {config.nota_minima_corte || 80} pontos</h4>
            <p className="text-sm text-slate-400">
              Professores precisam atingir a nota mínima para participar do programa de gamificação
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-violet-400">{kpis.acimaDaMedia}</p>
            <p className="text-xs text-slate-500">acima do corte</p>
          </div>
        </div>
      </div>

      {/* Seção de Configurações (colapsável) */}
      {showConfig && (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-violet-400" />
              <h3 className="font-semibold text-white text-sm">
                Configurações do Professor 360°
              </h3>
            </div>
            <ChevronUp className="w-5 h-5 text-slate-400" />
          </button>
          <div className="px-6 pb-6">
            <Professor360Config />
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Média Geral"
          value={kpis.mediaNotas.toFixed(1)}
          icon={BarChart3}
          variant="violet"
          subvalue="pontos"
        />
        <KPICard
          label="Sem Ocorrências"
          value={kpis.semOcorrencia}
          icon={CheckCircle2}
          variant="emerald"
          subvalue="professores"
        />
        <KPICard
          label="Com Ocorrências"
          value={kpis.comOcorrencia}
          icon={AlertTriangle}
          variant="amber"
          subvalue="professores"
        />
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <p className="text-sm font-semibold text-white">Top 3</p>
          </div>
          <div className="space-y-2">
            {kpis.top3.map((prof, idx) => (
              <div key={`${prof.professor_id}-${prof.unidade_id}`} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0 ? "bg-yellow-400 text-yellow-900" :
                    idx === 1 ? "bg-gray-300 text-gray-700" :
                    "bg-orange-300 text-orange-800"
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-slate-300 truncate max-w-[100px]">{prof.professor_nome.split(' ')[0]}</span>
                </div>
                <span className="font-bold text-white">{prof.nota_final}</span>
              </div>
            ))}
            {kpis.top3.length === 0 && (
              <p className="text-xs text-slate-500">Nenhum dado</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Professores */}
      <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            Avaliações 360° - {competenciaOptions.find(c => c.valor === competencia)?.label}
          </h3>
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
            {avaliacoesFiltradas.length} avaliações
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Professor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Unidade</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Atrasos">
                    <Clock className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Faltas">
                    <UserX className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Organização de Sala">
                    <Building2 className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Dresscode">
                    <Shirt className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Cumprimento de Prazos">
                    <Calendar className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="EMUSYS">
                    <Monitor className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Tooltip content="Projetos (Bônus)">
                    <Sparkles className="h-4 w-4 mx-auto" />
                  </Tooltip>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nota</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {avaliacoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-500">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                avaliacoesFiltradas.map((avaliacao) => {
                  const atrasos = avaliacao.avaliacao?.qtd_atrasos || 0;
                  const faltas = avaliacao.avaliacao?.qtd_faltas || 0;
                  const organizacao = avaliacao.avaliacao?.qtd_organizacao_sala || 0;
                  const uniforme = avaliacao.avaliacao?.qtd_uniforme || 0;
                  const prazos = avaliacao.avaliacao?.qtd_prazos || 0;
                  const emusys = avaliacao.avaliacao?.qtd_emusys || 0;
                  const projetos = avaliacao.avaliacao?.qtd_projetos || 0;

                  const colorAtrasos = getOcorrenciaColor(atrasos, 2);
                  const colorFaltas = getOcorrenciaColor(faltas);
                  const colorOrganizacao = getOcorrenciaColor(organizacao);
                  const colorUniforme = getOcorrenciaColor(uniforme);
                  const colorPrazos = getOcorrenciaColor(prazos);
                  const colorEmusys = getOcorrenciaColor(emusys);

                  return (
                    <tr key={`${avaliacao.professor_id}-${avaliacao.unidade_id}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                            {avaliacao.professor_foto ? (
                              <img src={avaliacao.professor_foto} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-slate-400">
                                {avaliacao.professor_nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <span className="font-medium text-white">{avaliacao.professor_nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-1 text-xs font-medium bg-slate-700/50 text-slate-300 rounded">
                          {avaliacao.unidade_codigo}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorAtrasos}`}>
                          {atrasos}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorFaltas}`}>
                          {faltas}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorOrganizacao}`}>
                          {organizacao}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorUniforme}`}>
                          {uniforme}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorPrazos}`}>
                          {prazos}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${colorEmusys}`}>
                          {emusys}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        {projetos > 0 ? (
                          <span className="text-sm font-medium text-purple-400 flex items-center justify-center gap-1">
                            <Target className="w-4 h-4" /> {projetos}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-500">-</span>
                        )}
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`px-3 py-1 text-sm font-bold rounded-full border ${getNotaBg(avaliacao.nota_final)}`}>
                          {avaliacao.nota_final}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        {avaliacao.status === 'fechado' ? (
                          <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
                            Fechado
                          </span>
                        ) : avaliacao.status === 'avaliado' ? (
                          <span className="px-2 py-1 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded">
                            Avaliado
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-slate-700 text-slate-400 rounded">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="text-center px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {/* Ícone de observação - mostra última ocorrência */}
                          {avaliacao.avaliacao?.ultima_observacao && (
                            <Tooltip content={
                              <div className="max-w-[250px]">
                                <p className="font-medium text-white mb-1">Última observação:</p>
                                <p className="text-slate-300 text-xs">{avaliacao.avaliacao.ultima_observacao}</p>
                                {avaliacao.avaliacao.registrado_por && (
                                  <p className="text-slate-500 text-xs mt-1">Por: {avaliacao.avaliacao.registrado_por}</p>
                                )}
                              </div>
                            }>
                              <button className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-amber-400">
                                <MessageCircle className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Ver detalhes">
                            <button
                              onClick={() => handleVerDetalhes(avaliacao)}
                              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Nova ocorrência">
                            <button
                              onClick={() => handleNovaOcorrencia({
                                id: avaliacao.professor_id,
                                nome: avaliacao.professor_nome,
                                unidades: [{ id: avaliacao.unidade_id, nome: avaliacao.unidade_nome, codigo: avaliacao.unidade_codigo }]
                              })}
                              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Nova Ocorrência */}
      <Modal360Ocorrencia
        open={modalOcorrencia}
        onOpenChange={setModalOcorrencia}
        professores={professores}
        criterios={criterios}
        professorSelecionado={professorSelecionado}
        competencia={competencia}
        onSave={handleSalvarOcorrencia}
      />

      {/* Modal de Detalhes */}
      {modalDetalhes && (
        <Modal360Detalhes
          open={!!modalDetalhes}
          onOpenChange={(open) => !open && setModalDetalhes(null)}
          avaliacao={modalDetalhes}
          criterios={criterios}
          competencia={competencia}
          competenciaLabel={competenciaOptions.find(c => c.valor === competencia)?.label || ''}
        />
      )}

      {/* Modal de Preview do WhatsApp */}
      {dadosWhatsApp && (
        <ModalWhatsAppPreview
          open={showWhatsAppPreview}
          onOpenChange={setShowWhatsAppPreview}
          professorNome={dadosWhatsApp.professorNome}
          professorWhatsApp={dadosWhatsApp.professorWhatsApp}
          tipoOcorrencia={dadosWhatsApp.tipoOcorrencia}
          dataOcorrencia={dadosWhatsApp.dataOcorrencia}
          unidadeNome={dadosWhatsApp.unidadeNome}
          registradoPor={dadosWhatsApp.registradoPor}
          descricao={dadosWhatsApp.descricao}
        />
      )}
    </div>
  );
}

export default Tab360Professores;
