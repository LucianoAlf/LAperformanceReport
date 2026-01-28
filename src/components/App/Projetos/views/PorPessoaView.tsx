import React, { useState } from 'react';
import { Check, Loader2, User, Users } from 'lucide-react';
import { useTarefasPorPessoa, useToggleTarefaConcluida } from '../../../../hooks/useProjetos';
import { ModalDetalhesProjeto } from '../components';

interface PorPessoaViewProps {
  unidadeSelecionada: string;
}

// Cores para avatares
const avatarColors = [
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-indigo-500 to-purple-500',
];

// Função para calcular urgência do prazo
function calcularUrgenciaPrazo(prazo?: string): 'normal' | 'alerta' | 'urgente' {
  if (!prazo) return 'normal';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataPrazo = new Date(prazo + 'T00:00:00');
  const diffDias = Math.ceil((dataPrazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return 'urgente'; // Atrasada
  if (diffDias === 0) return 'alerta'; // Vence hoje
  return 'normal';
}

// Função para formatar data
function formatarPrazo(prazo?: string): string {
  if (!prazo) return '';
  const data = new Date(prazo + 'T00:00:00');
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function PorPessoaView({ unidadeSelecionada }: PorPessoaViewProps) {
  // Hooks de dados
  const { data: pessoas, loading, refetch } = useTarefasPorPessoa(unidadeSelecionada);
  const { toggleConcluida, loading: toggling } = useToggleTarefaConcluida();

  // Estados locais
  const [projetoDetalhesId, setProjetoDetalhesId] = useState<number | null>(null);
  const [tarefaToggling, setTarefaToggling] = useState<number | null>(null);

  // Handler para toggle de tarefa
  const handleToggleTarefa = async (tarefaId: number, statusAtual: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTarefaToggling(tarefaId);
    try {
      await toggleConcluida(tarefaId, statusAtual === 'concluida');
      refetch();
    } catch (err) {
      console.error('Erro ao alternar tarefa:', err);
    } finally {
      setTarefaToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (pessoas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Users className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">Nenhuma tarefa atribuída</p>
        <p className="text-sm">Atribua responsáveis às tarefas dos projetos</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {pessoas.map((pessoa, index) => {
          const corAvatar = avatarColors[index % avatarColors.length];
          const inicial = pessoa.nome.charAt(0).toUpperCase();
          
          return (
            <div 
              key={pessoa.id}
              className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-800/30">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${corAvatar} flex items-center justify-center text-white font-bold text-lg`}>
                  {inicial}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white">{pessoa.nome}</h3>
                  <span className="text-sm text-slate-400 flex items-center gap-1">
                    {pessoa.tipo === 'professor' ? '🎵' : <User className="w-3 h-3" />}
                    {pessoa.cargo || (pessoa.tipo === 'professor' ? 'Professor' : 'Usuário')}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-white">{pessoa.tarefasPendentes}</div>
                  <div className="text-xs text-slate-500">
                    {pessoa.tarefasPendentes === 1 ? 'pendente' : 'pendentes'}
                  </div>
                  {pessoa.tarefasConcluidas > 0 && (
                    <div className="text-xs text-emerald-400">
                      +{pessoa.tarefasConcluidas} concluída{pessoa.tarefasConcluidas > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Tarefas */}
              <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                {pessoa.tarefas.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    Nenhuma tarefa atribuída
                  </div>
                ) : (
                  pessoa.tarefas.map((tarefa) => {
                    const isConcluida = tarefa.status === 'concluida';
                    const urgencia = isConcluida ? 'normal' : calcularUrgenciaPrazo(tarefa.prazo);
                    const isToggling = tarefaToggling === tarefa.id;
                    
                    return (
                      <div 
                        key={tarefa.id}
                        onClick={() => setProjetoDetalhesId(tarefa.projeto_id)}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 
                          hover:bg-slate-800/50 transition-colors cursor-pointer
                          ${isConcluida ? 'opacity-60' : ''}
                        `}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={(e) => handleToggleTarefa(tarefa.id, tarefa.status, e)}
                          disabled={isToggling}
                          className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                            transition-colors
                            ${isConcluida 
                              ? 'bg-emerald-500 border-emerald-500' 
                              : 'border-slate-600 hover:border-slate-500'
                            }
                            ${isToggling ? 'opacity-50' : ''}
                          `}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3 h-3 text-white animate-spin" />
                          ) : isConcluida ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : null}
                        </button>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${isConcluida ? 'line-through text-slate-500' : 'text-white'}`}>
                            {tarefa.titulo}
                          </div>
                          <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <span 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: tarefa.projeto_tipo_cor || '#8b5cf6' }}
                            />
                            {tarefa.projeto_nome}
                          </div>
                        </div>

                        {/* Prazo */}
                        {isConcluida ? (
                          <span className="text-emerald-400 text-xs">✓</span>
                        ) : tarefa.prazo ? (
                          <span className={`
                            text-xs px-2 py-1 rounded
                            ${urgencia === 'urgente' 
                              ? 'bg-rose-500/20 text-rose-400' 
                              : urgencia === 'alerta'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-700/50 text-slate-400'
                            }
                          `}>
                            {urgencia === 'urgente' && '⚠️ '}
                            {urgencia === 'alerta' && '⏰ '}
                            {formatarPrazo(tarefa.prazo)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Detalhes do Projeto */}
      <ModalDetalhesProjeto
        isOpen={!!projetoDetalhesId}
        projetoId={projetoDetalhesId}
        onClose={() => setProjetoDetalhesId(null)}
        onSuccess={refetch}
      />
    </>
  );
}

export default PorPessoaView;
