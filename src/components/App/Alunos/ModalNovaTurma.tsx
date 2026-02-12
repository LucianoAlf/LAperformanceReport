import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, CheckCircle2, Loader2, Search, Music, Users, AlertTriangle, UserMinus, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { detectarConflitos } from '@/lib/conflitos';
import { gerarSugestoes, type Sugestao } from '@/lib/sugestoes-horarios';
import { calcularHorarioFim, gerarHorariosDisponiveis, type Conflito, type Turma as TurmaHorarios, type Sala } from '@/lib/horarios';
import type { DisponibilidadeSemanal } from '../Professores/types';
import { ListaConflitos } from '../Turmas/Conflitos';
import { ListaSugestoes } from '../Turmas/Sugestoes';
import type { Aluno, Turma } from './AlunosPage';

interface ModalNovaTurmaProps {
  onClose: () => void;
  onSalvar: () => void;
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string}[];
  salas: {id: number, nome: string, capacidade_maxima: number, unidade_id?: string}[];
  horarios: {id: number, nome: string, hora_inicio: string}[];
  unidadeAtual: string;
  alunosDisponiveis: Aluno[];
  turmasExistentes?: Turma[];
}

const DIAS_SEMANA = [
  { valor: 'Segunda', nome: 'Segunda-feira' },
  { valor: 'Terça', nome: 'Terça-feira' },
  { valor: 'Quarta', nome: 'Quarta-feira' },
  { valor: 'Quinta', nome: 'Quinta-feira' },
  { valor: 'Sexta', nome: 'Sexta-feira' },
  { valor: 'Sábado', nome: 'Sábado' },
];

export function ModalNovaTurma({
  onClose,
  onSalvar,
  professores,
  cursos,
  salas,
  horarios,
  unidadeAtual,
  alunosDisponiveis,
  turmasExistentes = []
}: ModalNovaTurmaProps) {
  const { isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [unidades, setUnidades] = useState<{value: string, label: string}[]>([]);
  const [buscaAluno, setBuscaAluno] = useState('');
  const [alunosSelecionados, setAlunosSelecionados] = useState<Aluno[]>([]);
  
  // Estados para conflitos e sugestões
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  const [disponibilidadeProfessor, setDisponibilidadeProfessor] = useState<DisponibilidadeSemanal | null>(null);
  
  const [formData, setFormData] = useState({
    tipo: 'turma' as 'turma' | 'banda',
    nome: '',
    professor_id: null as number | null,
    curso_id: null as number | null,
    dia_semana: '',
    horario: '',
    sala_id: null as number | null,
    unidade_id: unidadeAtual,
  });

  // Carregar unidades
  useEffect(() => {
    async function loadUnidades() {
      const { data } = await supabase.from('unidades').select('id, nome').eq('ativo', true);
      if (data) {
        setUnidades(data.map(u => ({ value: u.id, label: u.nome })));
      }
    }
    loadUnidades();
  }, []);

  // Buscar disponibilidade do professor quando selecionado
  useEffect(() => {
    async function loadDisponibilidade() {
      if (!formData.professor_id || !formData.unidade_id) {
        setDisponibilidadeProfessor(null);
        return;
      }
      const { data } = await supabase
        .from('professores_unidades')
        .select('disponibilidade')
        .eq('professor_id', formData.professor_id)
        .eq('unidade_id', formData.unidade_id)
        .single();
      
      setDisponibilidadeProfessor(data?.disponibilidade || null);
    }
    loadDisponibilidade();
    // Limpar dia/horário ao trocar professor
    setFormData(prev => ({ ...prev, dia_semana: '', horario: '' }));
  }, [formData.professor_id, formData.unidade_id]);

  // Dias disponíveis do professor (filtrados pela disponibilidade)
  const diasDisponiveis = useMemo(() => {
    if (!disponibilidadeProfessor) return DIAS_SEMANA;
    return DIAS_SEMANA.filter(d => disponibilidadeProfessor[d.valor]);
  }, [disponibilidadeProfessor]);

  // Horários disponíveis baseados no dia selecionado e disponibilidade do professor
  const horariosDisponiveis = useMemo(() => {
    if (!formData.dia_semana) return [];
    
    if (disponibilidadeProfessor && disponibilidadeProfessor[formData.dia_semana]) {
      const disp = disponibilidadeProfessor[formData.dia_semana];
      return gerarHorariosDisponiveis(disp.inicio, disp.fim, 60);
    }
    
    // Fallback: horários padrão de 08:00 a 21:00
    return gerarHorariosDisponiveis('08:00', '21:00', 60);
  }, [formData.dia_semana, disponibilidadeProfessor]);

  // Capacidade da sala selecionada
  const capacidadeSala = useMemo(() => {
    if (!formData.sala_id) return null;
    const sala = salas.find(s => s.id === formData.sala_id);
    return sala?.capacidade_maxima || null;
  }, [formData.sala_id, salas]);

  // Capacidade do curso selecionado
  const capacidadeCurso = useMemo(() => {
    if (!formData.curso_id) return null;
    const curso = cursos.find(c => c.id === formData.curso_id);
    return (curso as any)?.capacidade_maxima || null;
  }, [formData.curso_id, cursos]);

  // Capacidade efetiva (menor entre sala e curso)
  const capacidadeEfetiva = useMemo(() => {
    const caps = [capacidadeSala, capacidadeCurso].filter(c => c !== null) as number[];
    return caps.length > 0 ? Math.min(...caps) : null;
  }, [capacidadeSala, capacidadeCurso]);

  // Converter turmas para o formato esperado pelas funções de conflito
  const turmasFormatadas = useMemo((): TurmaHorarios[] => {
    return turmasExistentes.map(t => ({
      id: t.id || 0,
      unidade_id: t.unidade_id,
      professor_id: t.professor_id,
      professor_nome: t.professor_nome,
      sala_id: t.sala_id || null,
      sala_nome: t.sala_nome,
      curso_id: t.curso_id || null,
      curso_nome: t.curso_nome,
      dia_semana: t.dia_semana,
      horario_inicio: t.horario_inicio,
      horario_fim: calcularHorarioFim(t.horario_inicio, 60),
      duracao_minutos: 60,
      capacidade_maxima: t.capacidade_maxima,
      alunos: t.ids_alunos,
      ativo: true
    }));
  }, [turmasExistentes]);

  // Detectar conflitos em tempo real
  useEffect(() => {
    if (!formData.professor_id || !formData.dia_semana || !formData.horario) {
      setConflitos([]);
      return;
    }

    const horarioFim = calcularHorarioFim(formData.horario, 60);
    const salasFormatadas: Sala[] = salas.map(s => ({
      id: s.id,
      nome: s.nome,
      capacidade_maxima: s.capacidade_maxima,
      unidade_id: s.unidade_id || formData.unidade_id
    }));

    const conflitosDetectados = detectarConflitos(
      {
        unidade_id: formData.unidade_id,
        professor_id: formData.professor_id,
        sala_id: formData.sala_id,
        curso_id: formData.curso_id,
        dia_semana: formData.dia_semana,
        horario_inicio: formData.horario,
        horario_fim: horarioFim,
        duracao_minutos: 60,
        alunos: alunosSelecionados.map(a => a.id)
      },
      {
        turmasExistentes: turmasFormatadas,
        salas: salasFormatadas
      }
    );

    setConflitos(conflitosDetectados);
  }, [formData.professor_id, formData.sala_id, formData.dia_semana, formData.horario, formData.curso_id, formData.unidade_id, alunosSelecionados, turmasFormatadas, salas]);

  // Gerar sugestões de horários
  const handleGerarSugestoes = useCallback(async () => {
    if (!formData.professor_id) {
      alert('Selecione um professor para gerar sugestões');
      return;
    }

    setCarregandoSugestoes(true);
    setMostrarSugestoes(true);

    try {
      const salasFormatadas: Sala[] = salas.map(s => ({
        id: s.id,
        nome: s.nome,
        capacidade_maxima: s.capacidade_maxima,
        unidade_id: s.unidade_id || formData.unidade_id
      }));

      const sugestoesGeradas = gerarSugestoes({
        professorId: formData.professor_id,
        cursoId: formData.curso_id || undefined,
        duracaoMinutos: 60,
        unidadeId: formData.unidade_id,
        turmasExistentes: turmasFormatadas,
        salas: salasFormatadas,
        horarioFuncionamento: {
          segunda_sexta: { inicio: '08:00', fim: '21:00' },
          sabado: { inicio: '08:00', fim: '16:00' },
          domingo: { fechado: true }
        }
      }, 5);

      setSugestoes(sugestoesGeradas);
    } catch (error) {
      console.error('Erro ao gerar sugestões:', error);
    } finally {
      setCarregandoSugestoes(false);
    }
  }, [formData.professor_id, formData.curso_id, formData.unidade_id, turmasFormatadas, salas]);

  // Aplicar sugestão selecionada
  const handleUsarSugestao = useCallback((sugestao: Sugestao) => {
    setFormData(prev => ({
      ...prev,
      dia_semana: sugestao.diaSemana,
      horario: sugestao.horarioInicio,
      sala_id: sugestao.salaId
    }));
    setMostrarSugestoes(false);
  }, []);

  // Verificar se há erros bloqueantes
  const temErrosBloqueantes = useMemo(() => {
    return conflitos.some(c => c.severidade === 'erro');
  }, [conflitos]);

  // Verificar se excede capacidade efetiva
  const excedeCapacidade = useMemo(() => {
    if (!capacidadeEfetiva) return false;
    return alunosSelecionados.length > capacidadeEfetiva;
  }, [capacidadeEfetiva, alunosSelecionados.length]);

  // Filtrar alunos para busca (apenas ativos, pagantes ou bolsistas)
  const alunosFiltrados = useMemo(() => {
    if (!buscaAluno || buscaAluno.length < 2) return [];
    
    const termo = buscaAluno.toLowerCase();
    return alunosDisponiveis
      .filter(a => 
        a.status === 'ativo' &&
        a.nome.toLowerCase().includes(termo) &&
        !alunosSelecionados.some(sel => sel.id === a.id)
      )
      .slice(0, 10); // Limitar a 10 resultados
  }, [buscaAluno, alunosDisponiveis, alunosSelecionados]);

  // Verificar conflito de horário para um aluno
  function temConflitoHorario(aluno: Aluno): boolean {
    if (!formData.dia_semana || !formData.horario) return false;
    return aluno.dia_aula === formData.dia_semana && 
           aluno.horario_aula?.startsWith(formData.horario.substring(0, 5));
  }

  // Adicionar aluno à lista
  function adicionarAluno(aluno: Aluno) {
    if (temConflitoHorario(aluno)) {
      alert(`${aluno.nome} já tem aula no mesmo horário (${aluno.dia_aula} às ${aluno.horario_aula}). Não é possível adicionar.`);
      return;
    }
    setAlunosSelecionados(prev => [...prev, aluno]);
    setBuscaAluno('');
  }

  // Remover aluno da lista
  function removerAluno(alunoId: number) {
    setAlunosSelecionados(prev => prev.filter(a => a.id !== alunoId));
  }

  // Salvar turma/banda
  async function handleSave() {
    // Validações
    if (!formData.professor_id) {
      alert('Selecione um professor responsável');
      return;
    }
    if (formData.tipo === 'turma' && !formData.curso_id) {
      alert('Selecione um curso/instrumento');
      return;
    }
    if (formData.tipo === 'banda' && !formData.nome) {
      alert('Informe o nome da banda');
      return;
    }
    if (!formData.dia_semana || !formData.horario) {
      alert('Selecione o dia e horário');
      return;
    }
    if (!formData.sala_id) {
      alert('Selecione uma sala');
      return;
    }

    // Validar capacidade efetiva
    if (excedeCapacidade) {
      const cursoNome = cursos.find(c => c.id === formData.curso_id)?.nome || 'curso';
      const salaNome = salas.find(s => s.id === formData.sala_id)?.nome || 'sala';
      alert(
        `Capacidade excedida!\n\n` +
        `Alunos selecionados: ${alunosSelecionados.length}\n` +
        `Capacidade efetiva: ${capacidadeEfetiva}\n\n` +
        `Detalhes:\n` +
        `- Sala ${salaNome}: ${capacidadeSala || 'sem limite'} alunos\n` +
        `- Curso ${cursoNome}: ${capacidadeCurso || 'sem limite'} alunos\n\n` +
        `A capacidade efetiva é o menor valor entre sala e curso.\n` +
        `Remova ${alunosSelecionados.length - capacidadeEfetiva!} aluno(s) para continuar.`
      );
      return;
    }

    setSaving(true);

    try {
      // Inserir na tabela turmas_explicitas
      const turmaData = {
        tipo: formData.tipo,
        nome: formData.tipo === 'banda' ? formData.nome : null,
        professor_id: formData.professor_id,
        curso_id: formData.tipo === 'turma' ? formData.curso_id : null,
        dia_semana: formData.dia_semana,
        horario_inicio: formData.horario,
        sala_id: formData.sala_id,
        unidade_id: formData.unidade_id,
        capacidade_maxima: formData.tipo === 'turma' ? capacidadeSala : null,
        ativo: true,
      };

      const { data: novaTurma, error: turmaError } = await supabase
        .from('turmas_explicitas')
        .insert(turmaData)
        .select()
        .single();

      if (turmaError) {
        console.error('Erro ao criar turma:', turmaError);
        alert('Erro ao criar turma: ' + turmaError.message);
        setSaving(false);
        return;
      }

      // Se houver alunos selecionados, criar os relacionamentos
      if (alunosSelecionados.length > 0 && novaTurma) {
        const relacionamentos = alunosSelecionados.map(aluno => ({
          turma_id: novaTurma.id,
          aluno_id: aluno.id,
        }));

        const { error: relError } = await supabase
          .from('turmas_alunos')
          .insert(relacionamentos);

        if (relError) {
          console.error('Erro ao adicionar alunos:', relError);
          // Não bloquear, turma já foi criada
        }

        // Para banda, não atualizar dia/horário do aluno (é um benefício extra)
        // Para turma regular, atualizar os dados do aluno
        if (formData.tipo === 'turma') {
          for (const aluno of alunosSelecionados) {
            await supabase
              .from('alunos')
              .update({
                professor_atual_id: formData.professor_id,
                curso_id: formData.curso_id,
                dia_aula: formData.dia_semana,
                horario_aula: formData.horario + ':00',
              })
              .eq('id', aluno.id);
          }
        }
      }

      onSalvar();
      onClose();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Music className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Nova Turma / Banda</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          <div className="space-y-6">
            
            {/* Tipo: Turma ou Banda */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, tipo: 'turma' })}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  formData.tipo === 'turma'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    formData.tipo === 'turma' ? 'border-purple-500' : 'border-slate-500'
                  }`}>
                    {formData.tipo === 'turma' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className="font-medium text-white">Turma Regular</span>
                </div>
                <p className="text-xs text-slate-400 ml-7">Aulas individuais ou em grupo</p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tipo: 'banda' })}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  formData.tipo === 'banda'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    formData.tipo === 'banda' ? 'border-emerald-500' : 'border-slate-500'
                  }`}>
                    {formData.tipo === 'banda' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                  </div>
                  <span className="font-medium text-white">Banda</span>
                </div>
                <p className="text-xs text-slate-400 ml-7">Ensaios coletivos, sem custo para aluno</p>
              </button>
            </div>

            {/* Informações Básicas */}
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Informações Básicas</h4>
              
              {/* Nome da Banda (apenas para banda) */}
              {formData.tipo === 'banda' && (
                <div>
                  <Label className="mb-2 block">Nome da Banda *</Label>
                  <Input
                    type="text"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Banda Rock Kids, Jazz Ensemble..."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Professor Responsável *</Label>
                  <Select
                    value={formData.professor_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, professor_id: parseInt(value) || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professores.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo === 'turma' && (
                  <div>
                    <Label className="mb-2 block">Curso/Instrumento *</Label>
                    <Select
                      value={formData.curso_id?.toString() || ''}
                      onValueChange={(value) => setFormData({ ...formData, curso_id: parseInt(value) || null })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cursos.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Horário e Local */}
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Horário e Local</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Dia da Semana *</Label>
                  <Select
                    value={formData.dia_semana}
                    onValueChange={(value) => setFormData({ ...formData, dia_semana: value, horario: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.professor_id ? "Selecione..." : "Selecione o professor primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {diasDisponiveis.map((d) => (
                        <SelectItem key={d.valor} value={d.valor}>{d.nome}</SelectItem>
                      ))}
                      {diasDisponiveis.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400">Nenhum dia cadastrado para este professor</div>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.professor_id && disponibilidadeProfessor && diasDisponiveis.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">Este professor não tem disponibilidade cadastrada nesta unidade</p>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Horário *</Label>
                  <Select
                    value={formData.horario}
                    onValueChange={(value) => setFormData({ ...formData, horario: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.dia_semana ? "Selecione..." : "Selecione o dia primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {horariosDisponiveis.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Sala *</Label>
                  <Select
                    value={formData.sala_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, sala_id: parseInt(value) || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salas.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.nome} (cap. {s.capacidade_maxima})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo === 'turma' && (capacidadeSala || capacidadeCurso) && (
                  <div>
                    <Label className="mb-2 block">Capacidade</Label>
                    <div className="space-y-1">
                      <div className="h-10 px-3 flex items-center justify-between bg-slate-700/50 rounded-lg">
                        <span className="text-slate-300 text-sm">
                          Capacidade efetiva: <span className="font-bold text-white">{capacidadeEfetiva || 'Sem limite'}</span>
                          {capacidadeEfetiva && ` aluno${capacidadeEfetiva > 1 ? 's' : ''}`}
                        </span>
                        {alunosSelecionados.length > 0 && capacidadeEfetiva && (
                          <span className={`text-xs font-medium ${
                            excedeCapacidade ? 'text-rose-400' : 
                            alunosSelecionados.length >= capacidadeEfetiva * 0.8 ? 'text-amber-400' : 
                            'text-emerald-400'
                          }`}>
                            {alunosSelecionados.length}/{capacidadeEfetiva}
                          </span>
                        )}
                      </div>
                      {(capacidadeSala || capacidadeCurso) && (
                        <p className="text-xs text-slate-500 px-1">
                          {capacidadeSala && `Sala: ${capacidadeSala}`}
                          {capacidadeSala && capacidadeCurso && ' • '}
                          {capacidadeCurso && `Curso: ${capacidadeCurso}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div>
                  <Label className="mb-2 block">Unidade *</Label>
                  <Select
                    value={formData.unidade_id || ''}
                    onValueChange={(value) => setFormData({ ...formData, unidade_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.value} value={u.value.toString()}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Botão de Sugestões */}
              {formData.professor_id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGerarSugestoes}
                  disabled={carregandoSugestoes}
                  className="w-full border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
                >
                  {carregandoSugestoes ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lightbulb className="w-4 h-4 mr-2" />
                  )}
                  Sugerir Horários Disponíveis
                </Button>
              )}
            </div>

            {/* Seção de Conflitos */}
            {conflitos.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <ListaConflitos 
                  conflitos={conflitos}
                  mostrarVazio={false}
                />
              </div>
            )}

            {/* Seção de Sugestões */}
            {mostrarSugestoes && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                {carregandoSugestoes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    <span className="ml-2 text-slate-400">Buscando horários...</span>
                  </div>
                ) : (
                  <ListaSugestoes 
                    sugestoes={sugestoes}
                    onUsarSugestao={handleUsarSugestao}
                    limiteInicial={5}
                  />
                )}
              </div>
            )}

            {/* Alunos */}
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                  Alunos {formData.tipo === 'turma' ? '(Opcional)' : ''}
                </h4>
                {formData.tipo === 'turma' && capacidadeSala && (
                  <span className="text-xs text-slate-400">
                    {alunosSelecionados.length}/{capacidadeSala} vagas
                  </span>
                )}
              </div>
              
              {/* Busca de alunos */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  value={buscaAluno}
                  onChange={(e) => setBuscaAluno(e.target.value)}
                  placeholder="Buscar aluno para adicionar..."
                  className="pl-10"
                />
                
                {/* Dropdown de resultados */}
                {alunosFiltrados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                    {alunosFiltrados.map(aluno => {
                      const conflito = temConflitoHorario(aluno);
                      return (
                        <button
                          key={aluno.id}
                          type="button"
                          onClick={() => adicionarAluno(aluno)}
                          disabled={conflito}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between ${
                            conflito 
                              ? 'text-slate-500 cursor-not-allowed bg-slate-800/50' 
                              : 'text-white hover:bg-slate-700'
                          }`}
                        >
                          <div>
                            <span>{aluno.nome}</span>
                            <span className="text-xs text-slate-400 ml-2">
                              {aluno.curso_nome} • {aluno.dia_aula} {aluno.horario_aula?.substring(0, 5)}
                            </span>
                          </div>
                          {conflito && (
                            <span className="text-xs text-red-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Conflito
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lista de alunos selecionados */}
              <div className="min-h-[80px] border border-slate-700 rounded-lg p-3">
                {alunosSelecionados.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    <Users className="w-4 h-4 mr-2" />
                    Nenhum aluno adicionado ainda
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {alunosSelecionados.map(aluno => (
                      <div
                        key={aluno.id}
                        className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-lg text-sm"
                      >
                        <span className="text-white">{aluno.nome.split(' ')[0]}</span>
                        <button
                          type="button"
                          onClick={() => removerAluno(aluno.id)}
                          className="text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Aviso para Banda */}
            {formData.tipo === 'banda' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-300 font-medium">Atenção</p>
                  <p className="text-amber-200/80 mt-1">
                    Esta turma não gera cobrança. Os alunos participam como benefício.
                    A sala ficará reservada no horário selecionado.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`${
              formData.tipo === 'banda'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : 'bg-gradient-to-r from-purple-500 to-violet-500'
            }`}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            Criar {formData.tipo === 'banda' ? 'Banda' : 'Turma'}
          </Button>
        </div>
      </div>
    </div>
  );
}
