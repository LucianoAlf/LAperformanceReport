import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, UserPlus, Loader2, Users, Clock, MapPin, BookOpen, CalendarClock, Music2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';

interface Turma {
  id?: number;
  unidade_id: string;
  professor_id: number;
  professor_nome: string;
  curso_id?: number;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  sala_id?: number;
  sala_nome?: string;
  capacidade_maxima?: number;
  total_alunos: number;
  nomes_alunos: string[];
  ids_alunos: number[];
}

interface Curso {
  id: number;
  nome: string;
}

interface ModalVincularAlunoTurmaProps {
  aluno: {
    id: number;
    nome: string;
    unidade_id: string;
    curso_id?: number | null;
    valor_parcela?: number | null;
    tipo_aluno?: string;
    tipo_matricula_id?: number | null;
    forma_pagamento_id?: number | null;
    dia_vencimento?: number;
    canal_origem_id?: number | null;
    data_nascimento?: string | null;
  };
  onClose: () => void;
  onSalvar: () => void;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function ModalVincularAlunoTurma({ aluno, onClose, onSalvar }: ModalVincularAlunoTurmaProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState<Turma | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [valorParcela, setValorParcela] = useState<number | null>(null);
  
  // Filtros
  const [filtroCurso, setFiltroCurso] = useState<string>('');
  const [filtroDia, setFiltroDia] = useState<string>('');

  // Carregar turmas e cursos
  useEffect(() => {
    carregarDados();
  }, [aluno.unidade_id]);

  async function carregarDados() {
    setCarregando(true);
    try {
      // Carregar turmas da unidade
      const { data: turmasData } = await supabase
        .from('vw_turmas_implicitas')
        .select('*')
        .eq('unidade_id', aluno.unidade_id)
        .order('dia_semana')
        .order('horario_inicio');

      if (turmasData) {
        setTurmas(turmasData);
      }

      // Carregar cursos
      const { data: cursosData } = await supabase
        .from('cursos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      if (cursosData) {
        setCursos(cursosData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setCarregando(false);
    }
  }

  // Filtrar turmas
  const turmasFiltradas = useMemo(() => {
    return turmas.filter(turma => {
      // Excluir turmas onde o aluno já está
      if (turma.ids_alunos?.includes(aluno.id)) return false;
      
      // Filtrar por busca (professor ou curso)
      if (busca) {
        const termoBusca = busca.toLowerCase();
        const matchProfessor = turma.professor_nome?.toLowerCase().includes(termoBusca);
        const matchCurso = turma.curso_nome?.toLowerCase().includes(termoBusca);
        if (!matchProfessor && !matchCurso) return false;
      }
      
      // Filtrar por curso
      if (filtroCurso && turma.curso_id?.toString() !== filtroCurso) return false;
      
      // Filtrar por dia
      if (filtroDia && turma.dia_semana !== filtroDia) return false;
      
      return true;
    });
  }, [turmas, busca, filtroCurso, filtroDia, aluno.id]);

  // Criar segundo curso
  async function handleVincular() {
    if (!turmaSelecionada) return;

    setSalvando(true);
    try {
      const dataHoje = new Date().toISOString().split('T')[0];
      const dataFimContrato = new Date();
      dataFimContrato.setFullYear(dataFimContrato.getFullYear() + 1);

      // Criar novo registro de aluno para o segundo/terceiro curso
      const { error } = await supabase.from('alunos').insert({
        nome: aluno.nome,
        unidade_id: aluno.unidade_id,
        data_nascimento: aluno.data_nascimento,
        status: 'ativo',
        tipo_aluno: aluno.tipo_aluno || 'pagante',
        tipo_matricula_id: aluno.tipo_matricula_id || 1,
        valor_parcela: valorParcela || aluno.valor_parcela,
        forma_pagamento_id: aluno.forma_pagamento_id,
        dia_vencimento: aluno.dia_vencimento || 5,
        data_matricula: dataHoje,
        data_inicio_contrato: dataHoje,
        data_fim_contrato: dataFimContrato.toISOString().split('T')[0],
        curso_id: turmaSelecionada.curso_id,
        professor_atual_id: turmaSelecionada.professor_id,
        dia_aula: turmaSelecionada.dia_semana,
        horario_aula: turmaSelecionada.horario_inicio,
        canal_origem_id: aluno.canal_origem_id,
        agente_comercial: user?.email || null,
        is_segundo_curso: true,
        is_ex_aluno: false,
        is_aluno_retorno: false,
      });

      if (error) throw error;

      toast.success('Aluno vinculado com sucesso!', `${aluno.nome} foi adicionado à turma de ${turmaSelecionada.curso_nome}.`);
      onSalvar();
      onClose();
    } catch (error: any) {
      console.error('Erro ao vincular aluno:', error);
      toast.error('Erro ao vincular', error.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Adicionar Curso</h2>
                <p className="text-sm text-slate-400">
                  Vincular <strong className="text-white">{aluno.nome}</strong> a uma turma
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="p-4 border-b border-slate-700 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por professor ou curso..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Select value={filtroCurso || 'todos'} onValueChange={(v) => setFiltroCurso(v === 'todos' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <BookOpen className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os cursos</SelectItem>
                {cursos.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filtroDia || 'todos'} onValueChange={(v) => setFiltroDia(v === 'todos' ? '' : v)}>
              <SelectTrigger className="w-[150px]">
                <CalendarClock className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Dia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os dias</SelectItem>
                {DIAS_SEMANA.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filtroCurso || filtroDia || busca) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setFiltroCurso('');
                  setFiltroDia('');
                  setBusca('');
                }}
                className="text-slate-400"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Lista de Turmas */}
        <div className="flex-1 overflow-y-auto p-4">
          {carregando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          ) : turmasFiltradas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma turma encontrada</p>
              <p className="text-sm">Tente ajustar os filtros</p>
            </div>
          ) : (
            <div className="space-y-2">
              {turmasFiltradas.map((turma, idx) => {
                const isSelected = turmaSelecionada?.professor_id === turma.professor_id &&
                                   turmaSelecionada?.dia_semana === turma.dia_semana &&
                                   turmaSelecionada?.horario_inicio === turma.horario_inicio;
                
                return (
                  <button
                    key={`${turma.professor_id}-${turma.dia_semana}-${turma.horario_inicio}-${idx}`}
                    onClick={() => setTurmaSelecionada(turma)}
                    className={`
                      w-full p-4 rounded-xl border text-left transition
                      ${isSelected 
                        ? 'bg-purple-500/20 border-purple-500' 
                        : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white">{turma.professor_nome}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-purple-400">{turma.curso_nome}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {turma.dia_semana} {turma.horario_inicio?.substring(0, 5)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {turma.sala_nome || 'Sem sala'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {turma.total_alunos}/{turma.capacidade_maxima || '?'} alunos
                          </span>
                        </div>
                        {turma.nomes_alunos && turma.nomes_alunos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {turma.nomes_alunos.slice(0, 4).map((nome, i) => (
                              <span key={i} className="bg-slate-600/50 text-slate-300 px-2 py-0.5 rounded text-xs">
                                {nome.split(' ')[0]}
                              </span>
                            ))}
                            {turma.nomes_alunos.length > 4 && (
                              <span className="text-xs text-slate-500">+{turma.nomes_alunos.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Valor da Parcela (quando turma selecionada) */}
        {turmaSelecionada && (
          <div className="p-4 border-t border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm text-slate-400 mb-1 block">Valor da Parcela (opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                  <Input
                    type="number"
                    value={valorParcela || ''}
                    onChange={(e) => setValorParcela(e.target.value ? parseFloat(e.target.value) : null)}
                    className="pl-10"
                    placeholder={aluno.valor_parcela?.toString() || '0'}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Se não informado, usará R$ {aluno.valor_parcela?.toLocaleString('pt-BR') || '0'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button 
            onClick={handleVincular} 
            disabled={!turmaSelecionada || salvando}
            className="bg-purple-600 hover:bg-purple-500"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Vinculando...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar à Turma
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
