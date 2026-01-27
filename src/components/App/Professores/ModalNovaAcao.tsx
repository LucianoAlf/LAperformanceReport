import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Calendar, Loader2, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

interface Acao {
  id: string;
  professor_id: number | null;
  professor_nome?: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  data_agendada: string;
  duracao_minutos: number;
  local: string | null;
  status: string;
  responsavel: string | null;
}

interface Professor {
  id: number;
  nome: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  onSave: () => void;
  onDelete?: () => void;
  dataInicial?: Date;
  responsavelInicial?: string;
  acaoParaEditar?: Acao | null;
  professores?: Professor[];
}

const RESPONSAVEIS = [
  { value: 'juliana', label: 'Juliana', cor: 'bg-purple-500' },
  { value: 'quintela', label: 'Quintela', cor: 'bg-emerald-500' },
  { value: 'ambos', label: 'Ambos', cor: 'bg-gradient-to-r from-purple-500 to-emerald-500' }
];

const TIPOS_ACAO = [
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'remanejamento', label: 'Remanejamento' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'mentoria', label: 'Mentoria' },
  { value: 'outro', label: 'Outro' }
];

const DURACOES = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' }
];

export function ModalNovaAcao({ open, onClose, professorId, onSave, onDelete, dataInicial, responsavelInicial, acaoParaEditar, professores = [] }: Props) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tipo, setTipo] = useState('reuniao');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState<Date | undefined>(new Date());
  const [horario, setHorario] = useState('10:00');
  const [duracao, setDuracao] = useState('60');
  const [local, setLocal] = useState('');
  const [responsavel, setResponsavel] = useState<string>('');
  const [professorSelecionado, setProfessorSelecionado] = useState<number | null>(null);
  const [buscaProfessor, setBuscaProfessor] = useState('');
  const [showProfessorDropdown, setShowProfessorDropdown] = useState(false);

  const isEditando = !!acaoParaEditar;

  // Filtrar professores pelo termo de busca
  const professoresFiltrados = professores.filter(p => 
    p.nome.toLowerCase().includes(buscaProfessor.toLowerCase())
  ).slice(0, 5);

  useEffect(() => {
    if (open) {
      if (acaoParaEditar) {
        // Modo edição - preencher com dados da ação
        setTipo(acaoParaEditar.tipo);
        setTitulo(acaoParaEditar.titulo);
        setDescricao(acaoParaEditar.descricao || '');
        setData(new Date(acaoParaEditar.data_agendada));
        setHorario(format(new Date(acaoParaEditar.data_agendada), 'HH:mm'));
        setDuracao(acaoParaEditar.duracao_minutos.toString());
        setLocal(acaoParaEditar.local || '');
        setResponsavel(acaoParaEditar.responsavel || '');
        setProfessorSelecionado(acaoParaEditar.professor_id);
        setBuscaProfessor(acaoParaEditar.professor_nome || '');
      } else {
        // Modo criação - reset form
        setTipo('reuniao');
        setTitulo('');
        setDescricao('');
        setData(dataInicial || new Date());
        setHorario('10:00');
        setDuracao('60');
        setLocal('');
        setResponsavel(responsavelInicial || '');
        setProfessorSelecionado(professorId);
        setBuscaProfessor('');
      }
      setShowProfessorDropdown(false);
    }
  }, [open, dataInicial, responsavelInicial, acaoParaEditar, professorId]);

  const handleSave = async () => {
    if (!titulo || !data) return;

    setLoading(true);
    try {
      const dataFormatada = format(data, 'yyyy-MM-dd');
      const dataAgendada = new Date(`${dataFormatada}T${horario}:00`);

      const dadosAcao = {
        professor_id: professorSelecionado || null,
        tipo,
        titulo,
        descricao: descricao || null,
        data_agendada: dataAgendada.toISOString(),
        duracao_minutos: parseInt(duracao),
        local: local || null,
        responsavel: responsavel || null
      };

      if (isEditando) {
        // Atualizar ação existente
        const { error } = await supabase
          .from('professor_acoes')
          .update(dadosAcao)
          .eq('id', acaoParaEditar.id);

        if (error) throw error;
      } else {
        // Criar nova ação
        const { error } = await supabase
          .from('professor_acoes')
          .insert({
            ...dadosAcao,
            status: 'pendente'
          });

        if (error) throw error;
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar ação:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!acaoParaEditar || !confirm('Tem certeza que deseja excluir esta ação?')) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('professor_acoes')
        .delete()
        .eq('id', acaoParaEditar.id);

      if (error) throw error;

      onDelete?.();
      onClose();
    } catch (error) {
      console.error('Erro ao excluir ação:', error);
    } finally {
      setDeleting(false);
    }
  };

  const selecionarProfessor = (professor: Professor) => {
    setProfessorSelecionado(professor.id);
    setBuscaProfessor(professor.nome);
    setShowProfessorDropdown(false);
  };

  const limparProfessor = () => {
    setProfessorSelecionado(null);
    setBuscaProfessor('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              {isEditando ? 'Editar Ação' : 'Nova Ação'}
            </div>
            {isEditando && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Responsável - Coordenador */}
          <div>
            <Label className="text-slate-400">Responsável *</Label>
            <div className="flex gap-2 mt-2">
              {RESPONSAVEIS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setResponsavel(r.value)}
                  className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    responsavel === r.value
                      ? r.value === 'juliana'
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                        : r.value === 'quintela'
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                        : 'border-cyan-500 bg-gradient-to-r from-purple-500/20 to-emerald-500/20 text-cyan-300'
                      : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${r.cor}`} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-slate-400">Tipo de Ação</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ACAO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-400">Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Treinamento de engajamento"
              className="mt-1"
              required
            />
          </div>

          {/* Professor com Autocomplete */}
          <div className="relative">
            <Label className="text-slate-400">Professor (opcional)</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={buscaProfessor}
                onChange={(e) => {
                  setBuscaProfessor(e.target.value);
                  setShowProfessorDropdown(true);
                  if (!e.target.value) setProfessorSelecionado(null);
                }}
                onFocus={() => setShowProfessorDropdown(true)}
                placeholder="Buscar professor..."
                className="pl-9"
              />
              {professorSelecionado && (
                <button
                  type="button"
                  onClick={limparProfessor}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
            {showProfessorDropdown && buscaProfessor && professoresFiltrados.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-40 overflow-auto">
                {professoresFiltrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selecionarProfessor(p)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition ${
                      professorSelecionado === p.id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300'
                    }`}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Data *</Label>
              <div className="mt-1">
                <DatePicker
                  date={data}
                  onDateChange={setData}
                  placeholder="Selecione a data"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-400">Horário</Label>
              <div className="mt-1">
                <TimePicker24h
                  value={horario}
                  onChange={setHorario}
                  placeholder="Selecione o horário"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Duração</Label>
              <Select value={duracao} onValueChange={setDuracao}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACOES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-400">Local</Label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: Sala de Reuniões"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-400">Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes da ação..."
              className="mt-1 h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !titulo || !data || !responsavel}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              isEditando ? 'Salvar Alterações' : 'Agendar Ação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
