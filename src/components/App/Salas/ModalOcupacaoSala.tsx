// Modal de ocupação da sala com grade horária e horários livres

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, TrendingUp, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Sala } from './SalasPage';

interface TurmaOcupacao {
  id: number;
  dia_semana: string;
  horario_inicio: string;
  horario_fim: string;
  professor_nome: string;
  curso_nome: string;
  total_alunos: number;
}

interface ModalOcupacaoSalaProps {
  sala: Sala;
  unidadeNome: string;
  onClose: () => void;
  onAbrirGradeCompleta?: (salaId: number) => void;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIOS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

export function ModalOcupacaoSala({ sala, unidadeNome, onClose, onAbrirGradeCompleta }: ModalOcupacaoSalaProps) {
  const [turmas, setTurmas] = useState<TurmaOcupacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarTurmas();
  }, [sala.id]);

  async function carregarTurmas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vw_turmas_implicitas')
        .select('*')
        .eq('sala_id', sala.id)
        .eq('ativo', true);

      if (error) throw error;

      const turmasFormatadas: TurmaOcupacao[] = (data || []).map(t => ({
        id: t.id,
        dia_semana: t.dia_semana,
        horario_inicio: t.horario_inicio?.slice(0, 5) || '00:00',
        horario_fim: t.horario_fim?.slice(0, 5) || '01:00',
        professor_nome: t.professor_nome || 'Não definido',
        curso_nome: t.curso_nome || 'Não definido',
        total_alunos: t.total_alunos || 0
      }));

      setTurmas(turmasFormatadas);
    } catch (error) {
      console.error('Erro ao carregar turmas:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calcular estatísticas
  const totalTurmas = turmas.length;
  const horasOcupadas = totalTurmas; // Cada turma = 1 hora
  const horasDisponiveis = DIAS_SEMANA.length * HORARIOS.length;
  const taxaOcupacao = horasDisponiveis > 0 ? Math.round((horasOcupadas / horasDisponiveis) * 100) : 0;

  // Encontrar horários livres
  const horariosOcupados = new Set(
    turmas.map(t => `${t.dia_semana}-${t.horario_inicio}`)
  );

  const horariosLivres: { dia: string; horario: string }[] = [];
  for (const dia of DIAS_SEMANA) {
    for (const horario of HORARIOS) {
      if (!horariosOcupados.has(`${dia}-${horario}`)) {
        horariosLivres.push({ dia, horario });
        if (horariosLivres.length >= 10) break;
      }
    }
    if (horariosLivres.length >= 10) break;
  }

  // Verificar se há turma em um slot específico
  function getTurmaNoSlot(dia: string, horario: string): TurmaOcupacao | undefined {
    return turmas.find(t => t.dia_semana === dia && t.horario_inicio === horario);
  }

  // Cor da barra de ocupação
  function getCorOcupacao(taxa: number): string {
    if (taxa >= 80) return 'bg-red-500';
    if (taxa >= 60) return 'bg-amber-500';
    if (taxa >= 40) return 'bg-emerald-500';
    return 'bg-cyan-500';
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Calendar className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Ocupação - {sala.nome}
              </h2>
              <p className="text-sm text-slate-400">{unidadeNome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Total de Turmas</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{totalTurmas}</p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Horas Ocupadas</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{horasOcupadas}h</p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs">Capacidade</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{sala.capacidade_maxima} alunos</p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs">Taxa de Ocupação</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{taxaOcupacao}%</p>
                </div>
              </div>

              {/* Barra de ocupação */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Ocupação Semanal</span>
                  <span className="text-white font-medium">{horasOcupadas}h / {horasDisponiveis}h</span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getCorOcupacao(taxaOcupacao)} transition-all duration-500`}
                    style={{ width: `${taxaOcupacao}%` }}
                  />
                </div>
              </div>

              {/* Mini Grade Horária */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <h3 className="text-sm font-medium text-white mb-3">Grade Horária da Sala</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-slate-400 font-medium">Hora</th>
                        {DIAS_SEMANA.map(dia => (
                          <th key={dia} className="p-2 text-center text-slate-400 font-medium">
                            {dia.slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HORARIOS.map(horario => (
                        <tr key={horario} className="border-t border-slate-700/50">
                          <td className="p-2 text-slate-400">{horario}</td>
                          {DIAS_SEMANA.map(dia => {
                            const turma = getTurmaNoSlot(dia, horario);
                            return (
                              <td key={`${dia}-${horario}`} className="p-1">
                                {turma ? (
                                  <div 
                                    className="bg-cyan-500/30 border border-cyan-500/50 rounded p-1 text-center"
                                    title={`${turma.professor_nome} - ${turma.curso_nome}`}
                                  >
                                    <span className="text-cyan-300">🎵</span>
                                  </div>
                                ) : (
                                  <div className="bg-slate-700/30 rounded p-1 text-center">
                                    <span className="text-slate-600">-</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Horários Livres */}
              {horariosLivres.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-white mb-3">
                    Próximos Horários Livres
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {horariosLivres.slice(0, 8).map((slot, index) => (
                      <span 
                        key={index}
                        className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg"
                      >
                        {slot.dia.slice(0, 3)} {slot.horario}
                      </span>
                    ))}
                    {horariosLivres.length > 8 && (
                      <span className="px-3 py-1.5 text-slate-400 text-xs">
                        +{horariosLivres.length - 8} mais
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Fechar
          </button>
          {onAbrirGradeCompleta && (
            <button
              onClick={() => onAbrirGradeCompleta(sala.id)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Grade Completa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
