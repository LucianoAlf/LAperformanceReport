import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Calendar, Loader2, AlertTriangle, CheckCircle2, Info,
  Users, Clock, Music, MapPin, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LeadCRM } from '../types';

// ── Tipos internos ──────────────────────────────────────────────────────────
interface Professor {
  id: number;
  nome: string;
}

interface TurmaImplicita {
  professor_id: number;
  professor_nome: string;
  curso_id: number;
  curso_nome: string;
  dia_semana: string;
  horario_inicio: string;
  total_alunos: number;
  nomes_alunos: string[];
  ids_alunos: number[];
}

interface Disponibilidade {
  [dia: string]: { inicio: string; fim: string };
}

interface Alerta {
  tipo: 'erro' | 'aviso' | 'info' | 'ok';
  mensagem: string;
}

// ── Constantes ──────────────────────────────────────────────────────────────
const DIAS_MAP: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
  4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
};

const UNIDADES_MAP: Record<string, string> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
};

// ── Props ───────────────────────────────────────────────────────────────────
interface ModalAgendarProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export function ModalAgendar({ aberto, onClose, onSalvo, lead }: ModalAgendarProps) {
  // ── Estado do formulário ────────────────────────────────────────────────
  const [tipo, setTipo] = useState<'experimental' | 'visita'>('experimental');
  const [cursoId, setCursoId] = useState<string>('');
  const [professorId, setProfessorId] = useState<string>('');
  const [data, setData] = useState<Date | undefined>(undefined);
  const [horarioSelecionado, setHorarioSelecionado] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  // ── Dados carregados ────────────────────────────────────────────────────
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [professoresUnidade, setProfessoresUnidade] = useState<Professor[]>([]);
  const [professoresCursos, setProfessoresCursos] = useState<{ professor_id: number; curso_id: number }[]>([]);
  const [disponibilidade, setDisponibilidade] = useState<Disponibilidade | null>(null);
  const [turmas, setTurmas] = useState<TurmaImplicita[]>([]);
  const [visitasAgendadas, setVisitasAgendadas] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [feriadosSet, setFeriadosSet] = useState<Set<string>>(new Set());

  // ── Limpar ao fechar ────────────────────────────────────────────────────
  const limpar = useCallback(() => {
    setTipo('experimental');
    setCursoId('');
    setProfessorId('');
    setData(undefined);
    setHorarioSelecionado('');
    setObservacoes('');
    setDisponibilidade(null);
    setTurmas([]);
    setVisitasAgendadas(0);
  }, []);

  const handleClose = () => { limpar(); onClose(); };

  // ── Carregar dados base ao abrir ────────────────────────────────────────
  useEffect(() => {
    if (!aberto || !lead) return;
    setLoading(true);

    // Pré-preencher curso do lead
    if (lead.curso_interesse_id) {
      setCursoId(String(lead.curso_interesse_id));
    }

    // Carregar feriados ativos do ano atual e próximo
    const anoAtual = new Date().getFullYear();
    supabase
      .from('feriados')
      .select('data')
      .eq('ativo', true)
      .gte('data', `${anoAtual}-01-01`)
      .lte('data', `${anoAtual + 1}-12-31`)
      .then(({ data: feriadosData }) => {
        setFeriadosSet(new Set((feriadosData || []).map((f: any) => f.data)));
      });

    Promise.all([
      supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('professores_cursos').select('professor_id, curso_id'),
      supabase.from('professores_unidades')
        .select('professor_id')
        .eq('unidade_id', lead.unidade_id)
        .eq('emusys_ativo', true)
        .neq('validacao_status', 'ignorado'),
      supabase.from('vw_turmas_implicitas')
        .select('professor_id, professor_nome, curso_id, curso_nome, dia_semana, horario_inicio, total_alunos, nomes_alunos, ids_alunos')
        .eq('unidade_id', lead.unidade_id),
    ]).then(([cursosRes, profsRes, pcRes, puRes, turmasRes]) => {
      setCursos((cursosRes.data || []) as { id: number; nome: string }[]);

      // Filtrar professores que atuam nesta unidade
      const profIdsUnidade = new Set((puRes.data || []).map((p: any) => p.professor_id));
      const profsUnidade = ((profsRes.data || []) as Professor[])
        .filter(p => profIdsUnidade.has(p.id));
      setProfessoresUnidade(profsUnidade);

      setProfessoresCursos((pcRes.data || []) as { professor_id: number; curso_id: number }[]);
      setTurmas((turmasRes.data || []) as TurmaImplicita[]);
      setLoading(false);
    });
  }, [aberto, lead]);

  // ── Professores filtrados por curso ─────────────────────────────────────
  const professoresFiltrados = useMemo(() => {
    if (!cursoId) return professoresUnidade;
    const profIds = new Set(
      professoresCursos
        .filter(pc => pc.curso_id === Number(cursoId))
        .map(pc => pc.professor_id)
    );
    return professoresUnidade.filter(p => profIds.has(p.id));
  }, [cursoId, professoresUnidade, professoresCursos]);

  // ── Buscar disponibilidade ao selecionar professor ──────────────────────
  useEffect(() => {
    if (!professorId || !lead) {
      setDisponibilidade(null);
      return;
    }
    supabase.from('professores_unidades')
      .select('disponibilidade')
      .eq('professor_id', Number(professorId))
      .eq('unidade_id', lead.unidade_id)
      .eq('emusys_ativo', true)
      .neq('validacao_status', 'ignorado')
      .single()
      .then(({ data: d }) => {
        setDisponibilidade(d?.disponibilidade || null);
      });
  }, [professorId, lead]);

  // ── Dia da semana selecionado ───────────────────────────────────────────
  const diaSemana = data ? DIAS_MAP[data.getDay()] : null;

  // ── Disponibilidade do professor no dia selecionado ─────────────────────
  const dispDia = useMemo(() => {
    if (!diaSemana || !disponibilidade) return null;
    return disponibilidade[diaSemana] || null;
  }, [diaSemana, disponibilidade]);

  // ── Gerar slots de horário ──────────────────────────────────────────────
  const slots = useMemo(() => {
    if (!dispDia || !professorId || !diaSemana) return [];

    const inicio = parseInt(dispDia.inicio.split(':')[0]);
    const fim = parseInt(dispDia.fim.split(':')[0]);
    const result: { hora: string; status: 'livre' | 'turma' | 'ocupado'; turma?: TurmaImplicita }[] = [];

    for (let h = inicio; h < fim; h++) {
      const hora = `${String(h).padStart(2, '0')}:00`;
      // Buscar turma do professor neste dia/horário
      const turmaNoSlot = turmas.find(t =>
        t.professor_id === Number(professorId) &&
        t.dia_semana === diaSemana &&
        t.horario_inicio.startsWith(hora.substring(0, 5))
      );

      if (turmaNoSlot) {
        result.push({ hora, status: 'turma', turma: turmaNoSlot });
      } else {
        result.push({ hora, status: 'livre' });
      }
    }
    return result;
  }, [dispDia, professorId, diaSemana, turmas]);

  // ── Turma no horário selecionado ────────────────────────────────────────
  const turmaNoHorario = useMemo(() => {
    if (!horarioSelecionado || !professorId || !diaSemana) return null;
    return turmas.find(t =>
      t.professor_id === Number(professorId) &&
      t.dia_semana === diaSemana &&
      t.horario_inicio.startsWith(horarioSelecionado.substring(0, 5))
    ) || null;
  }, [horarioSelecionado, professorId, diaSemana, turmas]);

  // ── Contar visitas agendadas no mesmo horário (para tipo visita) ────────
  useEffect(() => {
    if (tipo !== 'visita' || !data || !horarioSelecionado || !lead) {
      setVisitasAgendadas(0);
      return;
    }
    const dataISO = data.toISOString().split('T')[0];
    supabase.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('unidade_id', lead.unidade_id)
      .eq('data_experimental', dataISO)
      .eq('horario_experimental', horarioSelecionado)
      .eq('tipo_agendamento', 'visita')
      .then(({ count }) => setVisitasAgendadas(count || 0));
  }, [tipo, data, horarioSelecionado, lead]);

  // ── Alertas inteligentes ────────────────────────────────────────────────
  const alertas = useMemo(() => {
    const result: Alerta[] = [];
    if (!horarioSelecionado || !professorId) return result;

    // Alerta de turma existente
    if (turmaNoHorario) {
      result.push({
        tipo: 'info',
        mensagem: `Turma existente: ${turmaNoHorario.curso_nome} com ${turmaNoHorario.total_alunos} aluno(s)`,
      });

      // Divergência de faixa etária
      if (lead?.faixa_etaria && turmaNoHorario.nomes_alunos?.length > 0) {
        // Verificar se o curso é kids vs adulto
        const cursoNome = turmaNoHorario.curso_nome?.toLowerCase() || '';
        const turmaPareceLAMK = cursoNome.includes('kids') || cursoNome.includes('infantil') || cursoNome.includes('musicalização');
        if (lead.faixa_etaria === 'EMLA' && turmaPareceLAMK) {
          result.push({
            tipo: 'aviso',
            mensagem: `Lead é adulto (EMLA) mas turma parece ser infantil`,
          });
        } else if (lead.faixa_etaria === 'LAMK' && !turmaPareceLAMK) {
          result.push({
            tipo: 'aviso',
            mensagem: `Lead é criança (LAMK) mas turma parece ser adulta`,
          });
        }
      }
    }

    // Verificar se professor leciona o curso selecionado
    if (cursoId && professorId) {
      const lecionaCurso = professoresCursos.some(
        pc => pc.professor_id === Number(professorId) && pc.curso_id === Number(cursoId)
      );
      if (lecionaCurso) {
        result.push({ tipo: 'ok', mensagem: 'Professor leciona este curso' });
      } else {
        result.push({ tipo: 'aviso', mensagem: 'Professor NÃO leciona este curso' });
      }
    }

    // Visitas no mesmo horário
    if (tipo === 'visita' && visitasAgendadas > 0) {
      result.push({
        tipo: visitasAgendadas >= 3 ? 'erro' : 'aviso',
        mensagem: `Já ${visitasAgendadas === 1 ? 'há 1 visita' : `há ${visitasAgendadas} visitas`} agendada(s) neste horário`,
      });
    }

    // Horário livre
    if (!turmaNoHorario && tipo === 'experimental') {
      result.push({ tipo: 'ok', mensagem: 'Horário livre — experimental individual' });
    }

    return result;
  }, [horarioSelecionado, professorId, turmaNoHorario, cursoId, professoresCursos, lead, tipo, visitasAgendadas]);

  // ── Info do professor selecionado ───────────────────────────────────────
  const infoProfessor = useMemo(() => {
    if (!professorId) return null;
    const pid = Number(professorId);
    const turmasProf = turmas.filter(t => t.professor_id === pid);
    const totalAlunos = turmasProf.reduce((s, t) => s + (t.total_alunos || 0), 0);
    const cursosProf = [...new Set(turmasProf.map(t => t.curso_nome))];
    const diasDisp = disponibilidade ? Object.entries(disponibilidade).map(
      ([dia, h]) => `${dia.substring(0, 3)} ${h.inicio}-${h.fim}`
    ) : [];
    return { turmasCount: turmasProf.length, totalAlunos, cursosProf, diasDisp };
  }, [professorId, turmas, disponibilidade]);

  // ── Salvar ──────────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!lead || !data) return;
    setSalvando(true);
    try {
      const dataISO = data.toISOString().split('T')[0];
      const profNome = professoresUnidade.find(p => p.id === Number(professorId))?.nome;

      const updates: Record<string, any> = {
        data_experimental: dataISO,
        horario_experimental: horarioSelecionado || null,
        experimental_agendada: true,
        tipo_agendamento: tipo,
        professor_experimental_id: professorId ? Number(professorId) : null,
        etapa_pipeline_id: 5, // Experimental Agendada
        data_ultimo_contato: new Date().toISOString(),
      };

      if (observacoes.trim()) {
        updates.observacoes = [lead.observacoes, observacoes.trim()].filter(Boolean).join('\n---\n');
      }

      const { error } = await supabase.from('leads').update(updates).eq('id', lead.id);
      if (error) throw error;

      // Se for visita, criar registro na tabela visitas
      if (tipo === 'visita') {
        await supabase.from('visitas').insert({
          unidade_id: lead.unidade_id,
          lead_id: lead.id,
          nome: lead.nome || '',
          telefone: lead.telefone || '',
          data: dataISO,
          horario: horarioSelecionado ? `${horarioSelecionado}:00` : '00:00:00',
          status: 'agendada',
          observacoes: observacoes.trim() || null,
          criado_por: 'manual',
        });
      }

      // Registrar no histórico
      const tipoLabel = tipo === 'experimental' ? 'Experimental' : 'Visita';
      await supabase.from('crm_lead_historico').insert({
        lead_id: lead.id,
        tipo: 'agendamento',
        descricao: `${tipoLabel} agendada para ${dataISO}${horarioSelecionado ? ` às ${horarioSelecionado}` : ''}${profNome ? ` com ${profNome}` : ''}`,
      });

      limpar();
      onClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao agendar:', err);
    } finally {
      setSalvando(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/20">
              {tipo === 'experimental' ? (
                <Music className="w-4 h-4 text-violet-400" />
              ) : (
                <Eye className="w-4 h-4 text-violet-400" />
              )}
            </div>
            Agendar {tipo === 'experimental' ? 'Experimental' : 'Visita'}
          </DialogTitle>
          <DialogDescription>
            {lead?.nome || 'Lead'} — {UNIDADES_MAP[lead?.unidade_id || ''] || ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* ── Tipo ───────────────────────────────────────────── */}
            <div className="flex gap-2">
              <button
                onClick={() => setTipo('experimental')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                  tipo === 'experimental'
                    ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                🎸 Experimental
              </button>
              <button
                onClick={() => setTipo('visita')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                  tipo === 'visita'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                👁 Visita
              </button>
            </div>

            {/* ── Curso + Professor ───────────────────────────────── */}
            {tipo === 'experimental' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Curso</label>
                <Select value={cursoId} onValueChange={v => { setCursoId(v); setProfessorId(''); }}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700">
                    <SelectValue placeholder="Selecione o curso" />
                  </SelectTrigger>
                  <SelectContent>
                    {cursos.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                {tipo === 'experimental' ? 'Professor' : 'Professor (opcional)'}
              </label>
              <Select value={professorId} onValueChange={setProfessorId}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione o professor" />
                </SelectTrigger>
                <SelectContent>
                  {professoresFiltrados.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Info do professor ───────────────────────────────── */}
            {infoProfessor && (
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1">
                <div className="flex items-center gap-4 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Music className="w-3 h-3" /> {infoProfessor.cursosProf.length} curso(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {infoProfessor.turmasCount} turmas · {infoProfessor.totalAlunos} alunos
                  </span>
                </div>
                {infoProfessor.diasDisp.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{infoProfessor.diasDisp.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Data ───────────────────────────────────────────── */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Data *</label>
              <DatePicker
                date={data}
                onDateChange={d => { setData(d); setHorarioSelecionado(''); }}
                placeholder="Selecione a data"
                minDate={new Date()}
                disabled={(d) => {
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  return feriadosSet.has(iso);
                }}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>

            {/* ── Aviso: professor sem disponibilidade neste dia ── */}
            {data && professorId && !dispDia && diaSemana && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Professor não tem disponibilidade cadastrada para {diaSemana}
              </div>
            )}

            {/* ── Grid de horários ────────────────────────────────── */}
            {data && professorId && slots.length > 0 && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">
                  Horários de {diaSemana} — {professorId && professoresUnidade.find(p => p.id === Number(professorId))?.nome}
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {slots.map(slot => {
                    const selecionado = horarioSelecionado === slot.hora;
                    return (
                      <button
                        key={slot.hora}
                        onClick={() => setHorarioSelecionado(slot.hora)}
                        className={`relative py-2 px-1 rounded-lg text-xs font-medium transition-all border text-center ${
                          selecionado
                            ? 'bg-violet-500/30 border-violet-500 text-white ring-1 ring-violet-500'
                            : slot.status === 'livre'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                        }`}
                      >
                        {slot.hora}
                        {slot.status === 'turma' && (
                          <span className="block text-[9px] opacity-70 mt-0.5">
                            👥 {slot.turma?.total_alunos}
                          </span>
                        )}
                        {slot.status === 'livre' && (
                          <span className="block text-[9px] opacity-60 mt-0.5">✅ livre</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-1.5 text-[9px] text-slate-500">
                  <span>✅ livre</span>
                  <span>👥 turma com alunos</span>
                </div>
              </div>
            )}

            {/* ── Horário manual (se não tem professor/disponibilidade) */}
            {data && (!professorId || slots.length === 0) && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Horário</label>
                <Select value={horarioSelecionado} onValueChange={setHorarioSelecionado}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700">
                    <SelectValue placeholder="Selecione o horário" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 14 }, (_, i) => i + 8).map(h => {
                      const hora = `${String(h).padStart(2, '0')}:00`;
                      return <SelectItem key={hora} value={hora}>{hora}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── Card da turma existente ─────────────────────────── */}
            {turmaNoHorario && (
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/50 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20">
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {turmaNoHorario.curso_nome} · {turmaNoHorario.professor_nome}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {turmaNoHorario.dia_semana} {turmaNoHorario.horario_inicio.substring(0, 5)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <Users className="w-3 h-3 text-slate-400" />
                  <span className="font-medium">{turmaNoHorario.total_alunos} aluno(s):</span>
                </div>
                <div className="pl-4 space-y-0.5">
                  {(turmaNoHorario.nomes_alunos || []).slice(0, 5).map((nome, i) => (
                    <p key={i} className="text-[10px] text-slate-400">• {nome}</p>
                  ))}
                  {(turmaNoHorario.nomes_alunos || []).length > 5 && (
                    <p className="text-[10px] text-slate-500 italic">
                      +{turmaNoHorario.nomes_alunos.length - 5} mais
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Alertas inteligentes ────────────────────────────── */}
            {alertas.length > 0 && (
              <div className="space-y-1.5">
                {alertas.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                      a.tipo === 'erro' ? 'bg-red-500/10 border border-red-500/30 text-red-300' :
                      a.tipo === 'aviso' ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' :
                      a.tipo === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' :
                      'bg-blue-500/10 border border-blue-500/30 text-blue-300'
                    }`}
                  >
                    {a.tipo === 'erro' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {a.tipo === 'aviso' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {a.tipo === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    {a.tipo === 'info' && <Info className="w-3.5 h-3.5 flex-shrink-0" />}
                    {a.mensagem}
                  </div>
                ))}
              </div>
            )}

            {/* ── Observações ─────────────────────────────────────── */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Observações</label>
              <textarea
                placeholder="Notas sobre o agendamento..."
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={2}
                className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!data || salvando}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              <><Calendar className="w-4 h-4 mr-2" /> Agendar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalAgendar;
