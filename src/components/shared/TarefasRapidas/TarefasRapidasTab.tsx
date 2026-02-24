import { useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useColaboradorAtual } from '@/components/App/Administrativo/PainelFarmer/hooks/useColaboradorAtual';
import { useTarefasRapidas } from './useTarefasRapidas';
import type { TarefaRapida, TarefaContexto } from './types';

interface TarefasRapidasTabProps {
  contexto: TarefaContexto;
  unidadeId: string;
  isAdmin?: boolean;
  accentGradient?: string;
}

export function TarefasRapidasTab({
  contexto,
  unidadeId,
  isAdmin = false,
  accentGradient = 'from-violet-600 to-purple-600',
}: TarefasRapidasTabProps) {
  const { colaborador } = useColaboradorAtual(unidadeId);
  const {
    tarefas,
    tarefasPendentes,
    tarefasConcluidas,
    loading,
    criarTarefa,
    marcarConcluida,
    excluirTarefa,
  } = useTarefasRapidas({
    contexto,
    colaboradorId: colaborador?.id || null,
    unidadeId,
    isAdmin,
  });

  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'concluidas'>('pendentes');

  // Input inline tarefa rápida
  const [tarefaRapidaTexto, setTarefaRapidaTexto] = useState('');

  // Form state
  const [descricao, setDescricao] = useState('');
  const [dataPrazo, setDataPrazo] = useState<Date | undefined>(undefined);
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media');
  const [observacoes, setObservacoes] = useState('');

  const abrirModal = () => {
    setDescricao('');
    setDataPrazo(undefined);
    setPrioridade('media');
    setObservacoes('');
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
  };

  const salvar = async () => {
    if (!descricao.trim()) return;

    setSalvando(true);
    try {
      await criarTarefa({
        descricao: descricao.trim(),
        prioridade,
        observacoes: observacoes.trim() || undefined,
        data_prazo: dataPrazo ? dataPrazo.toISOString().split('T')[0] : undefined,
      });
      fecharModal();
    } catch (err) {
      console.error('Erro ao salvar tarefa:', err);
    } finally {
      setSalvando(false);
    }
  };

  const handleToggle = async (id: string, concluida: boolean) => {
    try {
      await marcarConcluida(id, !concluida);
    } catch (err) {
      console.error('Erro ao marcar tarefa:', err);
    }
  };

  const handleExcluir = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;

    try {
      await excluirTarefa(id);
    } catch (err) {
      console.error('Erro ao excluir tarefa:', err);
    }
  };

  // Filtrar tarefas
  const tarefasFiltradas =
    filtro === 'pendentes'
      ? tarefasPendentes
      : filtro === 'concluidas'
        ? tarefasConcluidas
        : tarefas;

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/4 mb-6"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-slate-700/50 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Tarefas Rápidas</h3>
          <p className="text-sm text-slate-400">Gerencie suas tarefas e to-dos</p>
        </div>
        <Button
          onClick={abrirModal}
          className={cn('bg-gradient-to-r hover:opacity-90', accentGradient)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Tarefa
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        <Button
          variant={filtro === 'pendentes' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFiltro('pendentes')}
          className={filtro === 'pendentes' ? 'bg-slate-700/50' : ''}
        >
          Pendentes ({tarefasPendentes.length})
        </Button>
        <Button
          variant={filtro === 'concluidas' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFiltro('concluidas')}
          className={filtro === 'concluidas' ? 'bg-slate-700/50' : ''}
        >
          Concluídas ({tarefasConcluidas.length})
        </Button>
        <Button
          variant={filtro === 'todas' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFiltro('todas')}
          className={filtro === 'todas' ? 'bg-slate-700/50' : ''}
        >
          Todas ({tarefas.length})
        </Button>
      </div>

      {/* Lista de Tarefas */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {tarefasFiltradas.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h4 className="text-lg font-medium text-white mb-2">
              {filtro === 'pendentes'
                ? 'Nenhuma tarefa pendente'
                : filtro === 'concluidas'
                  ? 'Nenhuma tarefa concluída'
                  : 'Nenhuma tarefa cadastrada'}
            </h4>
            <p className="text-slate-400 mb-4">
              {filtro === 'pendentes'
                ? 'Todas as tarefas foram concluídas!'
                : 'Crie suas primeiras tarefas'}
            </p>
            {filtro !== 'concluidas' && (
              <Button onClick={abrirModal}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Tarefa
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {tarefasFiltradas.map(tarefa => (
              <TarefaRow
                key={tarefa.id}
                tarefa={tarefa}
                onToggle={() => handleToggle(tarefa.id, tarefa.concluida)}
                onDelete={() => handleExcluir(tarefa.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input inline — Adicionar tarefa rápida */}
      <div className="flex items-center gap-3 border border-dashed border-slate-700/40 rounded-lg px-3 py-2.5 hover:border-slate-500/30 transition-colors">
        <Plus className="w-4 h-4 text-slate-600 flex-shrink-0" />
        <input
          type="text"
          placeholder="Adicionar tarefa rápida..."
          className="flex-1 bg-transparent border-none text-sm text-slate-300 placeholder-slate-600 outline-none"
          value={tarefaRapidaTexto}
          onChange={e => setTarefaRapidaTexto(e.target.value)}
          onKeyDown={async e => {
            if (e.key === 'Enter' && tarefaRapidaTexto.trim()) {
              await criarTarefa({ descricao: tarefaRapidaTexto.trim(), prioridade: 'media' });
              setTarefaRapidaTexto('');
            }
          }}
        />
        <span className="text-xs text-slate-600 flex-shrink-0">Enter para salvar</span>
      </div>

      {/* Modal de Nova Tarefa */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Tarefa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Descrição */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Descrição
              </label>
              <Input
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Ex: Retornar ligação do cliente"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Data Prazo */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Prazo (opcional)
              </label>
              <DatePicker date={dataPrazo} onDateChange={setDataPrazo} />
            </div>

            {/* Prioridade */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Prioridade
              </label>
              <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Observações (opcional)
              </label>
              <Textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Detalhes adicionais..."
                className="bg-slate-800 border-slate-700 min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={!descricao.trim() || salvando}
              className={cn('bg-gradient-to-r', accentGradient)}
            >
              {salvando ? 'Salvando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Componente: Linha de Tarefa
// =============================================================================

interface TarefaRowProps {
  tarefa: TarefaRapida;
  onToggle: () => void;
  onDelete: () => void;
}

function TarefaRow({ tarefa, onToggle, onDelete }: TarefaRowProps) {
  const hoje = new Date().toISOString().split('T')[0];
  const isAtrasada = tarefa.data_prazo && tarefa.data_prazo < hoje && !tarefa.concluida;
  const isHoje = tarefa.data_prazo === hoje;

  const prioridadeStyles: Record<string, string> = {
    alta: 'bg-rose-500/20 text-rose-400',
    media: 'bg-amber-500/20 text-amber-400',
    baixa: 'bg-blue-500/20 text-blue-400',
  };

  const prioridadeLabels: Record<string, string> = {
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  };

  const formatarData = (data: string) => {
    const d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div
      className={cn(
        'px-4 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors group',
        tarefa.concluida && 'opacity-60'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
          tarefa.concluida
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-slate-500 hover:border-violet-500'
        )}
      >
        {tarefa.concluida && <CheckCircle2 className="w-4 h-4 text-white" />}
      </button>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium truncate',
            tarefa.concluida ? 'text-slate-400 line-through' : 'text-white'
          )}
        >
          {tarefa.descricao}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={cn('text-xs px-2 py-0.5 rounded-full', prioridadeStyles[tarefa.prioridade])}>
            {prioridadeLabels[tarefa.prioridade]}
          </span>
          {tarefa.data_prazo && (
            <span
              className={cn(
                'text-xs flex items-center gap-1',
                isAtrasada ? 'text-rose-400' : isHoje ? 'text-amber-400' : 'text-slate-400'
              )}
            >
              <Calendar className="w-3 h-3" />
              {isAtrasada ? 'Atrasada' : isHoje ? 'Hoje' : formatarData(tarefa.data_prazo)}
            </span>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-rose-400" />
        </Button>
      </div>
    </div>
  );
}

export default TarefasRapidasTab;
