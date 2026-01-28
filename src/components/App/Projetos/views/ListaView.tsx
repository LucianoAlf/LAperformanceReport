import { useState } from 'react';
import { 
  Eye,
  MoreHorizontal,
  Search,
  Filter,
  Loader2,
  FolderOpen,
  Edit,
  Trash2
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { useProjetos, useProjetoTipos } from '../../../../hooks/useProjetos';
import { ModalEditarProjeto, ModalConfirmarExclusao, ModalDetalhesProjeto } from '../components';
import type { Projeto, ProjetoStatus } from '../../../../types/projetos';

interface ListaViewProps {
  unidadeSelecionada: string;
  onNovoProjeto: () => void;
}

const statusConfig: Record<ProjetoStatus | 'atrasado', { label: string; icon: string; bg: string; text: string }> = {
  atrasado: { label: 'Atrasado', icon: '⚠️', bg: 'bg-rose-500/20', text: 'text-rose-400' },
  planejamento: { label: 'Planejamento', icon: '📝', bg: 'bg-violet-500/20', text: 'text-violet-400' },
  em_andamento: { label: 'Em Andamento', icon: '🔄', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  em_revisao: { label: 'Em Revisão', icon: '🔍', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  concluido: { label: 'Concluído', icon: '✅', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  cancelado: { label: 'Cancelado', icon: '❌', bg: 'bg-slate-500/20', text: 'text-slate-400' },
  pausado: { label: 'Pausado', icon: '⏸️', bg: 'bg-orange-500/20', text: 'text-orange-400' },
};

const avatarColors = [
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
];

// Função para formatar data
function formatarData(dataStr: string): string {
  const data = new Date(dataStr + 'T00:00:00');
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Função para calcular urgência do prazo
function calcularUrgencia(dataFim: string): 'normal' | 'alerta' | 'urgente' {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(dataFim + 'T00:00:00');
  const diffDias = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return 'urgente';
  if (diffDias <= 7) return 'alerta';
  return 'normal';
}

// Função para verificar se projeto está atrasado
function isProjetoAtrasado(projeto: Projeto): boolean {
  if (projeto.status === 'concluido' || projeto.status === 'cancelado') return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(projeto.data_fim + 'T00:00:00');
  return prazo < hoje;
}

export function ListaView({ unidadeSelecionada, onNovoProjeto }: ListaViewProps) {
  // Hooks de dados
  const { data: projetos, loading, refetch } = useProjetos(unidadeSelecionada);
  const { data: tipos } = useProjetoTipos();

  // Estados locais
  const [filtroAtivo, setFiltroAtivo] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [menuAberto, setMenuAberto] = useState<number | null>(null);
  
  // Estados dos modais
  const [projetoParaEditar, setProjetoParaEditar] = useState<Projeto | null>(null);
  const [projetoParaExcluir, setProjetoParaExcluir] = useState<Projeto | null>(null);
  const [projetoDetalhesId, setProjetoDetalhesId] = useState<number | null>(null);

  // Filtros de tipo baseados nos tipos reais
  const tiposFiltro = ['Todos', ...tipos.map(t => t.nome)];

  // Filtrar projetos
  const projetosFiltrados = projetos.filter(projeto => {
    // Filtro por tipo
    if (filtroAtivo !== 'Todos' && projeto.tipo?.nome !== filtroAtivo) {
      return false;
    }
    // Filtro por busca
    if (busca && !projeto.nome.toLowerCase().includes(busca.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {tiposFiltro.map((tipo) => (
            <button
              key={tipo}
              onClick={() => setFiltroAtivo(tipo)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition-all
                ${filtroAtivo === tipo
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-white'
                }
              `}
            >
              {tipo}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar projeto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 w-64"
            />
          </div>
          <Button variant="outline" size="icon" className="border-slate-700">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      )}

      {/* Lista vazia */}
      {!loading && projetosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Nenhum projeto encontrado</h3>
          <p className="text-slate-400 mb-4">
            {busca || filtroAtivo !== 'Todos' 
              ? 'Tente ajustar os filtros ou a busca'
              : 'Crie seu primeiro projeto para começar'}
          </p>
          {!busca && filtroAtivo === 'Todos' && (
            <Button onClick={onNovoProjeto} className="bg-violet-600 hover:bg-violet-500">
              + Novo Projeto
            </Button>
          )}
        </div>
      )}

      {/* Tabela */}
      {!loading && projetosFiltrados.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Projeto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipe</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progresso</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Prazo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {projetosFiltrados.map((projeto, index) => {
                const atrasado = isProjetoAtrasado(projeto);
                const statusKey = atrasado ? 'atrasado' : projeto.status;
                const status = statusConfig[statusKey];
                const urgencia = calcularUrgencia(projeto.data_fim);
                const equipeInicial = projeto.equipe?.slice(0, 3) || [];
                const maisEquipe = (projeto.equipe?.length || 0) - 3;
                
                return (
                  <tr key={projeto.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Projeto */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{ backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20` }}
                        >
                          {projeto.tipo?.icone || '📁'}
                        </div>
                        <div>
                          <div className="font-medium text-white">{projeto.nome}</div>
                          <div className="text-sm text-slate-400">
                            {projeto.tipo?.nome || 'Projeto'} • {projeto.unidade?.nome || 'Todas'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${status.bg} ${status.text}`}>
                        {status.icon} {status.label}
                      </span>
                    </td>

                    {/* Equipe */}
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        {equipeInicial.length > 0 ? (
                          <>
                            <div className="flex -space-x-2">
                              {equipeInicial.map((membro, i) => (
                                <div
                                  key={membro.id}
                                  className={`w-7 h-7 rounded-md bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-xs font-bold border-2 border-slate-900`}
                                  title={membro.pessoa?.nome || `Membro ${i + 1}`}
                                >
                                  {(membro.pessoa?.nome || 'M').charAt(0).toUpperCase()}
                                </div>
                              ))}
                            </div>
                            {maisEquipe > 0 && (
                              <span className="ml-2 text-xs text-slate-400">+{maisEquipe}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">Sem equipe</span>
                        )}
                      </div>
                    </td>

                    {/* Progresso */}
                    <td className="px-4 py-4">
                      <div className="w-28">
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-1">
                          <div 
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
                            style={{ width: `${projeto.progresso || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">
                          {projeto.progresso || 0}% • {projeto.tarefas_concluidas || 0}/{projeto.total_tarefas || 0} tarefas
                        </span>
                      </div>
                    </td>

                    {/* Prazo */}
                    <td className="px-4 py-4">
                      <span className={`text-sm whitespace-nowrap ${
                        urgencia === 'urgente' 
                          ? 'text-rose-400' 
                          : urgencia === 'alerta' 
                            ? 'text-amber-400' 
                            : 'text-slate-300'
                      }`}>
                        {formatarData(projeto.data_fim)}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 relative">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-white"
                          onClick={() => setProjetoDetalhesId(projeto.id)}
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-white"
                          onClick={() => setMenuAberto(menuAberto === projeto.id ? null : projeto.id)}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                        
                        {/* Menu dropdown */}
                        {menuAberto === projeto.id && (
                          <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1 min-w-[140px]">
                            <button
                              onClick={() => {
                                setProjetoParaEditar(projeto);
                                setMenuAberto(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4" />
                              Editar
                            </button>
                            <button
                              onClick={() => {
                                setProjetoParaExcluir(projeto);
                                setMenuAberto(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-rose-400 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modais */}
      <ModalEditarProjeto
        isOpen={!!projetoParaEditar}
        projeto={projetoParaEditar}
        onClose={() => setProjetoParaEditar(null)}
        onSuccess={refetch}
        onDelete={(p) => {
          setProjetoParaEditar(null);
          setProjetoParaExcluir(p);
        }}
      />

      <ModalConfirmarExclusao
        isOpen={!!projetoParaExcluir}
        projeto={projetoParaExcluir}
        onClose={() => setProjetoParaExcluir(null)}
        onSuccess={refetch}
      />

      <ModalDetalhesProjeto
        isOpen={!!projetoDetalhesId}
        projetoId={projetoDetalhesId}
        onClose={() => setProjetoDetalhesId(null)}
        onSuccess={refetch}
      />
    </div>
  );
}

export default ListaView;
