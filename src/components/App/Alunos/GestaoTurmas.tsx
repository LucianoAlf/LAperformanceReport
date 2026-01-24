import { useState, useMemo, useEffect } from 'react';
import { RotateCcw, AlertTriangle, Plus, Calendar, Edit2, Trash2, Music, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import type { Turma } from './AlunosPage';

interface GestaoTurmasProps {
  turmas: Turma[];
  professores: {id: number, nome: string}[];
  salas: {id: number, nome: string, capacidade_maxima: number}[];
  onRecarregar: () => void;
  onEditarTurma?: (turma: Turma) => void;
  onExcluirTurma?: (turmaId: number) => void;
  onAdicionarAlunoTurma?: (turma: Turma) => void;
}

const DIAS_SEMANA = [
  { nome: 'Segunda-feira', valor: 'Segunda', cor: 'blue' },
  { nome: 'Terça-feira', valor: 'Terça', cor: 'green' },
  { nome: 'Quarta-feira', valor: 'Quarta', cor: 'yellow' },
  { nome: 'Quinta-feira', valor: 'Quinta', cor: 'purple' },
  { nome: 'Sexta-feira', valor: 'Sexta', cor: 'pink' },
  { nome: 'Sábado', valor: 'Sábado', cor: 'cyan' }
];

const EMOJIS_CURSO: Record<string, string> = {
  'Guitarra': '🎸',
  'Violão': '🎸',
  'Baixo': '🎸',
  'Piano': '🎹',
  'Teclado': '🎹',
  'Bateria': '🥁',
  'Canto': '🎤',
  'Violino': '🎻'
};

export function GestaoTurmas({ turmas, professores, salas, onRecarregar, onEditarTurma, onExcluirTurma, onAdicionarAlunoTurma }: GestaoTurmasProps) {
  const [filtros, setFiltros] = useState({
    professor_id: '',
    dia: '',
    sala_id: '',
    ocupacao: ''
  });
  const [turmaDetalhe, setTurmaDetalhe] = useState<Turma | null>(null);
  const [modoEdicaoSala, setModoEdicaoSala] = useState(false);
  const [salasDisponiveis, setSalasDisponiveis] = useState<{id: number, nome: string, capacidade_maxima: number}[]>([]);
  const [salaIdSelecionada, setSalaIdSelecionada] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregandoSalas, setCarregandoSalas] = useState(false);

  // Agrupar turmas por dia
  const turmasPorDia = useMemo(() => {
    let turmasFiltradas = [...turmas];

    if (filtros.professor_id) {
      turmasFiltradas = turmasFiltradas.filter(t => t.professor_id === parseInt(filtros.professor_id));
    }
    if (filtros.dia) {
      turmasFiltradas = turmasFiltradas.filter(t => t.dia_semana === filtros.dia);
    }
    if (filtros.ocupacao) {
      turmasFiltradas = turmasFiltradas.filter(t => {
        if (filtros.ocupacao === '1') return t.total_alunos === 1;
        if (filtros.ocupacao === '2') return t.total_alunos === 2;
        if (filtros.ocupacao === '3+') return t.total_alunos >= 3;
        if (filtros.ocupacao === '0') return t.total_alunos === 0;
        return true;
      });
    }

    const agrupado: Record<string, Turma[]> = {};
    DIAS_SEMANA.forEach(dia => {
      agrupado[dia.valor] = turmasFiltradas
        .filter(t => t.dia_semana === dia.valor)
        .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
    });
    return agrupado;
  }, [turmas, filtros]);

  // Carregar salas quando entrar em modo de edição
  useEffect(() => {
    if (modoEdicaoSala && turmaDetalhe) {
      carregarSalas();
    }
  }, [modoEdicaoSala, turmaDetalhe]);

  async function carregarSalas() {
    if (!turmaDetalhe?.unidade_id) return;
    
    setCarregandoSalas(true);
    try {
      const { data, error } = await supabase
        .from('salas')
        .select('id, nome, capacidade_maxima')
        .eq('unidade_id', turmaDetalhe.unidade_id)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setSalasDisponiveis(data || []);
      setSalaIdSelecionada(turmaDetalhe.sala_id || null);
    } catch (error) {
      console.error('Erro ao carregar salas:', error);
    } finally {
      setCarregandoSalas(false);
    }
  }

  async function handleVincularSala() {
    if (!turmaDetalhe || !salaIdSelecionada) return;

    setSalvando(true);
    try {
      const salaSelecionada = salasDisponiveis.find(s => s.id === salaIdSelecionada);
      
      // Verificar se já existe turma explícita
      const { data: turmaExistente } = await supabase
        .from('turmas_explicitas')
        .select('id')
        .eq('unidade_id', turmaDetalhe.unidade_id)
        .eq('professor_id', turmaDetalhe.professor_id)
        .eq('dia_semana', turmaDetalhe.dia_semana)
        .eq('horario_inicio', turmaDetalhe.horario_inicio)
        .single();

      if (turmaExistente) {
        // Atualizar turma existente
        const { error } = await supabase
          .from('turmas_explicitas')
          .update({
            sala_id: salaIdSelecionada,
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
            nome: `${turmaDetalhe.curso_nome} - ${turmaDetalhe.professor_nome}`,
            professor_id: turmaDetalhe.professor_id,
            curso_id: turmaDetalhe.curso_id,
            dia_semana: turmaDetalhe.dia_semana,
            horario_inicio: turmaDetalhe.horario_inicio,
            sala_id: salaIdSelecionada,
            unidade_id: turmaDetalhe.unidade_id,
            capacidade_maxima: salaSelecionada?.capacidade_maxima || 4,
            ativo: true
          });

        if (error) throw error;
      }

      // Fechar modal e recarregar dados
      setModoEdicaoSala(false);
      setTurmaDetalhe(null);
      onRecarregar();
    } catch (error) {
      console.error('Erro ao vincular sala:', error);
      alert('Erro ao vincular sala. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function limparFiltros() {
    setFiltros({
      professor_id: '',
      dia: '',
      sala_id: '',
      ocupacao: ''
    });
  }

  function getCorDia(cor: string) {
    const cores: Record<string, { bg: string, border: string, text: string, badge: string }> = {
      blue: { bg: 'bg-blue-600/20', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
      green: { bg: 'bg-green-600/20', border: 'border-green-500/30', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300' },
      yellow: { bg: 'bg-yellow-600/20', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' },
      purple: { bg: 'bg-purple-600/20', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
      pink: { bg: 'bg-pink-600/20', border: 'border-pink-500/30', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300' },
      cyan: { bg: 'bg-cyan-600/20', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300' }
    };
    return cores[cor] || cores.blue;
  }

  function getBadgeOcupacao(totalAlunos: number, capacidade: number = 4) {
    const isCheio = totalAlunos >= capacidade;
    
    if (totalAlunos === 1) {
      return (
        <span className="bg-red-500/30 text-red-400 px-2 py-0.5 rounded text-xs animate-pulse flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> 1/{capacidade} aluno
        </span>
      );
    }
    if (totalAlunos === 2) {
      return (
        <span className="bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded text-xs">
          2/{capacidade} alunos
        </span>
      );
    }
    if (isCheio) {
      return (
        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs">
          {totalAlunos}/{capacidade} ✓
        </span>
      );
    }
    return (
      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs">
        {totalAlunos}/{capacidade} alunos
      </span>
    );
  }

  function getEmojiCurso(curso: string | undefined) {
    if (!curso) return '🎵';
    return EMOJIS_CURSO[curso] || '🎵';
  }

  return (
    <>
      {/* Filtros */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={filtros.professor_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, professor_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Professor</SelectItem>
              {professores.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtros.dia || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, dia: value === "todos" ? "" : value })}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Dia</SelectItem>
              {DIAS_SEMANA.map(d => (
                <SelectItem key={d.valor} value={d.valor}>{d.valor}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtros.sala_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, sala_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Sala</SelectItem>
              {salas.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtros.ocupacao || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, ocupacao: value === "todos" ? "" : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Ocupação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Ocupação</SelectItem>
              <SelectItem value="1">1 aluno (sozinho)</SelectItem>
              <SelectItem value="2">2 alunos</SelectItem>
              <SelectItem value="3+">3+ alunos</SelectItem>
              <SelectItem value="0">Vazia</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={limparFiltros}
            className="h-10 bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Limpar
          </button>
        </div>
      </div>

      {/* Grid de Turmas por Dia */}
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {DIAS_SEMANA.map(dia => {
            const turmasDoDia = turmasPorDia[dia.valor] || [];
            const cores = getCorDia(dia.cor);
            
            return (
              <div key={dia.valor} className="bg-slate-700/30 rounded-xl border border-slate-600 overflow-hidden">
                {/* Header do dia */}
                <div className={`${cores.bg} border-b ${cores.border} px-4 py-3`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${cores.text} flex items-center gap-2`}>
                      <Calendar className="w-4 h-4" />
                      {dia.nome}
                    </h3>
                    <span className={`text-xs ${cores.badge} px-2 py-1 rounded`}>
                      {turmasDoDia.length} turmas
                    </span>
                  </div>
                </div>

                {/* Lista de turmas */}
                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                  {turmasDoDia.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Nenhuma turma neste dia
                    </p>
                  ) : (
                    turmasDoDia.map((turma, index) => {
                      const isSozinho = turma.total_alunos === 1;
                      
                      return (
                        <div
                          key={`${turma.professor_id}-${turma.horario_inicio}-${index}`}
                          onClick={() => setTurmaDetalhe(turma)}
                          className={`
                            rounded-lg p-3 border transition cursor-pointer
                            ${turma.tipo === 'explicita' ? 'border-l-4 border-l-emerald-500' : ''}
                            ${isSozinho 
                              ? 'bg-red-900/20 border-red-500/50 hover:border-red-400' 
                              : 'bg-slate-800 border-slate-600 hover:border-emerald-500/50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">
                                {turma.horario_inicio?.substring(0, 5)} - {turma.sala_nome || 'Sala'}
                              </span>
                              {turma.tipo === 'explicita' && turma.tipo_turma === 'banda' && (
                                <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                                  <Music className="w-3 h-3" />
                                  {turma.nome_turma || 'Banda'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {getBadgeOcupacao(turma.total_alunos, turma.capacidade_maxima || 4)}
                              {turma.tipo === 'explicita' && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onEditarTurma) {
                                        onEditarTurma(turma);
                                      }
                                    }}
                                    className="p-1 hover:bg-slate-700 rounded transition"
                                    title="Editar turma"
                                  >
                                    <Edit2 className="w-3 h-3 text-slate-400 hover:text-blue-400" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (turma.turma_explicita_id && onExcluirTurma) {
                                        if (confirm(`Deseja realmente excluir a turma "${turma.nome_turma || turma.curso_nome}"?`)) {
                                          onExcluirTurma(turma.turma_explicita_id);
                                        }
                                      }
                                    }}
                                    className="p-1 hover:bg-slate-700 rounded transition"
                                    title="Excluir turma"
                                  >
                                    <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-400" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{getEmojiCurso(turma.curso_nome)} {turma.curso_nome || 'Curso'}</span>
                            <span>•</span>
                            <span>{turma.professor_nome}</span>
                            {turma.tipo === 'explicita' && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-400">Turma Manual</span>
                              </>
                            )}
                          </div>

                          {/* Lista de alunos */}
                          {turma.nomes_alunos && turma.nomes_alunos.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {turma.total_alunos <= 3 ? (
                                turma.nomes_alunos.map((nome, i) => (
                                  <span
                                    key={i}
                                    className={`px-2 py-0.5 rounded text-xs ${
                                      isSozinho 
                                        ? 'bg-red-500/20 text-red-300' 
                                        : 'bg-purple-500/20 text-purple-300'
                                    }`}
                                  >
                                    {nome.split(' ')[0]}
                                  </span>
                                ))
                              ) : (
                                <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">
                                  +{turma.total_alunos} alunos
                                </span>
                              )}
                            </div>
                          )}

                          {/* Sugestão para turmas sozinhas */}
                          {isSozinho && (
                            <p className="text-xs text-red-400 mt-2">
                              💡 Sugestão: Verificar turmas próximas
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resumo de Salas */}
      <div className="p-4 border-t border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Capacidade por Sala</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {salas.map(sala => {
            const turmasNaSala = turmas.filter(t => t.sala_nome === sala.nome);
            const ocupacaoMedia = turmasNaSala.length > 0
              ? turmasNaSala.reduce((sum, t) => sum + t.total_alunos, 0) / turmasNaSala.length
              : 0;
            const percentual = (ocupacaoMedia / sala.capacidade_maxima) * 100;
            
            const corBarra = percentual >= 75 ? 'bg-emerald-500' 
              : percentual >= 50 ? 'bg-blue-500' 
              : percentual >= 25 ? 'bg-yellow-500' 
              : 'bg-red-500';
            
            const corTexto = percentual >= 75 ? 'text-emerald-400' 
              : percentual >= 50 ? 'text-blue-400' 
              : percentual >= 25 ? 'text-yellow-400' 
              : 'text-red-400';

            return (
              <div key={sala.id} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{sala.nome}</span>
                  <span className="text-xs text-slate-400">{turmasNaSala.length} turmas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-600 rounded-full h-2">
                    <div 
                      className={`${corBarra} h-2 rounded-full transition-all`} 
                      style={{ width: `${Math.min(100, percentual)}%` }}
                    />
                  </div>
                  <span className={`text-sm ${corTexto}`}>{sala.capacidade_maxima} max</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Detalhes da Turma */}
      {turmaDetalhe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 shadow-2xl">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Turma: {turmaDetalhe.dia_semana} {turmaDetalhe.horario_inicio?.substring(0, 5)}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {turmaDetalhe.sala_nome || 'Sala'} • {turmaDetalhe.curso_nome} • {turmaDetalhe.professor_nome}
                  </p>
                </div>
                <button
                  onClick={() => setTurmaDetalhe(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              {/* Seção de Sala */}
              <div className="mb-6 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-300 uppercase flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Sala
                  </span>
                  {!modoEdicaoSala && (
                    <button
                      onClick={() => setModoEdicaoSala(true)}
                      className="text-xs text-violet-400 hover:text-violet-300 transition"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {!modoEdicaoSala ? (
                  <div className="text-slate-300">
                    {turmaDetalhe.sala_nome || (
                      <span className="text-slate-500 text-sm">
                        Não vinculada <span className="text-xs">(clique para vincular)</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {carregandoSalas ? (
                      <div className="text-sm text-slate-400">Carregando salas...</div>
                    ) : (
                      <>
                        <Select
                          value={salaIdSelecionada?.toString() || ''}
                          onValueChange={(v) => setSalaIdSelecionada(parseInt(v))}
                        >
                          <SelectTrigger className="bg-slate-800 border-slate-600">
                            <SelectValue placeholder="Selecione uma sala" />
                          </SelectTrigger>
                          <SelectContent>
                            {salasDisponiveis.map(sala => (
                              <SelectItem key={sala.id} value={sala.id.toString()}>
                                {sala.nome} (cap. {sala.capacidade_maxima})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setModoEdicaoSala(false);
                              setSalaIdSelecionada(turmaDetalhe.sala_id || null);
                            }}
                            variant="outline"
                            size="sm"
                            disabled={salvando}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleVincularSala}
                            disabled={!salaIdSelecionada || salvando}
                            size="sm"
                            className="flex-1 bg-violet-600 hover:bg-violet-500"
                          >
                            {salvando ? 'Salvando...' : 'Vincular Sala'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-400">Capacidade:</span>
                {getBadgeOcupacao(turmaDetalhe.total_alunos, turmaDetalhe.capacidade_maxima || 4)}
              </div>
              
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Alunos na Turma</h3>
              <div className="space-y-2">
                {turmaDetalhe.nomes_alunos && turmaDetalhe.nomes_alunos.length > 0 ? (
                  turmaDetalhe.nomes_alunos.map((nome, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-sm font-bold">
                          {nome.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{nome}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-center py-4">Nenhum aluno nesta turma</p>
                )}
              </div>
              
              <button 
                onClick={() => {
                  if (onAdicionarAlunoTurma && turmaDetalhe) {
                    onAdicionarAlunoTurma(turmaDetalhe);
                    setTurmaDetalhe(null);
                  }
                }}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-500 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Aluno à Turma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
