import { useState, useEffect } from 'react';
import { X, Users, Clock, MapPin, BookOpen, User, Edit, Calendar, Save, Loader2, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { TurmaGrade } from './types';

interface Sala {
  id: number;
  nome: string;
  capacidade_maxima: number;
  cursos_permitidos: string[] | null;
}

interface ModalDetalhesTurmaProps {
  turma: TurmaGrade;
  aberto: boolean;
  onClose: () => void;
  onEditar?: () => void;
  onSalaVinculada?: () => void;
}

export function ModalDetalhesTurma({ turma, aberto, onClose, onEditar, onSalaVinculada }: ModalDetalhesTurmaProps) {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaIdSelecionada, setSalaIdSelecionada] = useState<string>(turma.sala_id?.toString() || '');
  const [salvando, setSalvando] = useState(false);
  const [modoEdicaoSala, setModoEdicaoSala] = useState(false);
  const [loadingSalas, setLoadingSalas] = useState(false);

  // Carregar salas da unidade quando abrir modo edição
  useEffect(() => {
    if (modoEdicaoSala && turma.unidade_id) {
      carregarSalas();
    }
  }, [modoEdicaoSala, turma.unidade_id]);

  // Reset ao fechar
  useEffect(() => {
    if (!aberto) {
      setModoEdicaoSala(false);
      setSalaIdSelecionada(turma.sala_id?.toString() || '');
    }
  }, [aberto, turma.sala_id]);

  async function carregarSalas() {
    setLoadingSalas(true);
    try {
      const { data, error } = await supabase
        .from('salas')
        .select('id, nome, capacidade_maxima, cursos_permitidos')
        .eq('unidade_id', turma.unidade_id)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setSalas(data || []);
    } catch (error) {
      console.error('Erro ao carregar salas:', error);
    } finally {
      setLoadingSalas(false);
    }
  }

  async function handleVincularSala() {
    if (!salaIdSelecionada) return;

    setSalvando(true);
    try {
      // Verificar se já existe uma turma explícita para este horário
      const { data: turmaExistente } = await supabase
        .from('turmas_explicitas')
        .select('id')
        .eq('unidade_id', turma.unidade_id)
        .eq('professor_id', turma.professor_id)
        .eq('dia_semana', turma.dia_semana)
        .eq('horario_inicio', turma.horario_inicio)
        .maybeSingle();

      const salaId = parseInt(salaIdSelecionada);
      const salaSelecionada = salas.find(s => s.id === salaId);

      if (turmaExistente) {
        // Atualizar turma existente
        const { error } = await supabase
          .from('turmas_explicitas')
          .update({ 
            sala_id: salaId,
            capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
            updated_at: new Date().toISOString()
          })
          .eq('id', turmaExistente.id);

        if (error) throw error;
      } else {
        // Criar nova turma explícita
        const { error } = await supabase
          .from('turmas_explicitas')
          .insert({
            tipo: 'turma',
            nome: `${turma.curso_nome} - ${turma.professor_nome}`,
            professor_id: turma.professor_id,
            curso_id: turma.curso_id,
            dia_semana: turma.dia_semana,
            horario_inicio: turma.horario_inicio,
            sala_id: salaId,
            unidade_id: turma.unidade_id,
            capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
            ativo: true
          });

        if (error) throw error;
      }

      setModoEdicaoSala(false);
      onSalaVinculada?.();
    } catch (error) {
      console.error('Erro ao vincular sala:', error);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  // Calcular ocupação
  const ocupacao = turma.sala_capacidade > 0 
    ? Math.round((turma.num_alunos / turma.sala_capacidade) * 100) 
    : 0;

  // Cor da ocupação
  const corOcupacao = ocupacao >= 90 
    ? 'text-red-400 bg-red-500/20' 
    : ocupacao >= 70 
      ? 'text-amber-400 bg-amber-500/20'
      : 'text-emerald-400 bg-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {turma.nome || `Turma ${turma.id}`}
              </h3>
              <p className="text-sm text-slate-400">{turma.unidade_nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-4">
          {/* Horário */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            <Clock className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase">Horário</p>
              <p className="text-white font-medium">
                {turma.dia_semana}, {turma.horario_inicio} - {turma.horario_fim}
              </p>
            </div>
          </div>

          {/* Professor */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            <User className="w-5 h-5 text-violet-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase">Professor</p>
              <p className="text-white font-medium">{turma.professor_nome}</p>
            </div>
          </div>

          {/* Sala */}
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-emerald-400" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 uppercase">Sala</p>
                {!modoEdicaoSala ? (
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${turma.sala_id ? 'text-white' : 'text-amber-400'}`}>
                      {turma.sala_id ? turma.sala_nome : 'Não vinculada'}
                    </p>
                    {!turma.sala_id && (
                      <span className="text-xs text-amber-400/70">(clique para vincular)</span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {loadingSalas ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Carregando salas...</span>
                      </div>
                    ) : (
                      <Select value={salaIdSelecionada} onValueChange={setSalaIdSelecionada}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione uma sala" />
                        </SelectTrigger>
                        <SelectContent>
                          {salas.map((sala) => (
                            <SelectItem key={sala.id} value={sala.id.toString()}>
                              {sala.nome} (cap. {sala.capacidade_maxima})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setModoEdicaoSala(false)}
                        disabled={salvando}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleVincularSala}
                        disabled={!salaIdSelecionada || salvando}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {salvando ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-1" />
                            Vincular Sala
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {!modoEdicaoSala && (
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-1 rounded-lg ${corOcupacao}`}>
                    <span className="text-sm font-medium">
                      {turma.num_alunos}/{turma.sala_capacidade}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setModoEdicaoSala(true)}
                    className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  >
                    <Building2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Ocupação */}
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase">Ocupação</span>
              </div>
              <span className={`text-sm font-bold ${
                ocupacao >= 90 ? 'text-red-400' :
                ocupacao >= 70 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {ocupacao}%
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  ocupacao >= 90 ? 'bg-red-500' :
                  ocupacao >= 70 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(ocupacao, 100)}%` }}
              />
            </div>
          </div>

          {/* Curso */}
          {turma.curso_nome && (
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
              <BookOpen className="w-5 h-5 text-pink-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase">Curso</p>
                <p className="text-white font-medium">{turma.curso_nome}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Fechar
          </button>
          {onEditar && (
            <button
              onClick={onEditar}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors"
            >
              <Edit size={16} />
              Editar Turma
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModalDetalhesTurma;
