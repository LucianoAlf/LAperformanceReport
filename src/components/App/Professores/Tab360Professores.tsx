import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  Trophy,
  Plus,
  Eye,
  Clock,
  UserX,
  Sparkles,
  Calendar,
  Building2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/Tooltip';
import { KPICard } from '@/components/ui/KPICard';
import { useProfessor360, Professor360Resumo } from '@/hooks/useProfessor360';
import { Modal360Ocorrencia } from './Modal360Ocorrencia';
import { Modal360Detalhes } from './Modal360Detalhes';

interface Tab360ProfessoresProps {
  unidadeSelecionada: string;
  competencia: string;
  onCompetenciaChange?: (competencia: string) => void;
}

// Cores para status de ocorrências
const getOcorrenciaStatus = (qtd: number, tolerancia: number = 0) => {
  if (qtd === 0) return { color: 'text-emerald-400', icon: '✅' };
  if (qtd <= tolerancia) return { color: 'text-amber-400', icon: '⚠️' };
  return { color: 'text-rose-400', icon: '❌' };
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
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState<Professor360Resumo | null>(null);
  const [professorSelecionado, setProfessorSelecionado] = useState<any>(null);

  const {
    criterios,
    avaliacoesCalculadas,
    professores,
    kpis,
    loading,
    createOcorrencia,
  } = useProfessor360(competencia, unidadeSelecionada === 'todas' ? undefined : unidadeSelecionada);

  // Filtrar por busca
  const avaliacoesFiltradas = useMemo(() => {
    if (!busca.trim()) return avaliacoesCalculadas;
    const termo = busca.toLowerCase();
    return avaliacoesCalculadas.filter(a => 
      a.professor_nome.toLowerCase().includes(termo) ||
      a.unidade_nome.toLowerCase().includes(termo) ||
      a.unidade_codigo.toLowerCase().includes(termo)
    );
  }, [avaliacoesCalculadas, busca]);

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
      
      await createOcorrencia(data, undefined, unidadesProf);
      setModalOcorrencia(false);
      setProfessorSelecionado(null);
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
        </div>

        <Button onClick={() => handleNovaOcorrencia()} className="gap-2 bg-violet-600 hover:bg-violet-700">
          <Plus className="h-4 w-4" />
          Registrar Ocorrência
        </Button>
      </div>

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
            {avaliacoesFiltradas.length} professor{avaliacoesFiltradas.length !== 1 ? 'es' : ''}
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
                  <Tooltip content="EMUSYS">
                    <span>💻</span>
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
                  <td colSpan={10} className="text-center py-12 text-slate-500">
                    Nenhum professor encontrado
                  </td>
                </tr>
              ) : (
                avaliacoesFiltradas.map((avaliacao) => {
                  const atrasos = avaliacao.avaliacao?.qtd_atrasos || 0;
                  const faltas = avaliacao.avaliacao?.qtd_faltas || 0;
                  const organizacao = avaliacao.avaliacao?.qtd_organizacao_sala || 0;
                  const emusys = avaliacao.avaliacao?.qtd_emusys || 0;
                  const projetos = avaliacao.avaliacao?.qtd_projetos || 0;

                  const statusAtrasos = getOcorrenciaStatus(atrasos, 2);
                  const statusFaltas = getOcorrenciaStatus(faltas);
                  const statusOrganizacao = getOcorrenciaStatus(organizacao);
                  const statusEmusys = getOcorrenciaStatus(emusys);

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
                        <span className={`text-sm font-medium ${statusAtrasos.color}`}>
                          {statusAtrasos.icon} {atrasos}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${statusFaltas.color}`}>
                          {statusFaltas.icon} {faltas}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${statusOrganizacao.color}`}>
                          {statusOrganizacao.icon} {organizacao}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        <span className={`text-sm font-medium ${statusEmusys.color}`}>
                          {statusEmusys.icon} {emusys}
                        </span>
                      </td>
                      <td className="text-center px-4 py-4">
                        {projetos > 0 ? (
                          <span className="text-sm font-medium text-purple-400">
                            🎯 {projetos}
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
    </div>
  );
}

export default Tab360Professores;
