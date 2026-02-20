'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Calendar, 
  DollarSign, 
  Cake, 
  UserPlus, 
  ChevronDown, 
  ChevronUp,
  Phone,
  MessageSquare,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Sparkles,
  ClipboardList,
  Trophy,
  ListTodo,
  TrendingUp,
  Pencil,
  Trash2,
  X,
  Save,
  Heart,
  Plus,
  GripVertical,
  ChevronRight,
  Rocket,
  Users,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/services/whatsapp';
import { gerarMensagemAniversario, gerarMensagemBoasVindas } from '@/services/mensagemGenerativa';
import { useColaboradorAtual, useRotinas, useAlertas, useTarefas, useFarmersUnidade, useDashboardStats, useSucessoAlunoAlertas, useFeedbackPendente } from './hooks';
import type { AlertaRenovacao, AlertaInadimplente, AlertaAniversariante, AlertaNovoMatriculado } from './types';
import { supabase } from '@/lib/supabase';

interface DashboardTabProps {
  unidadeId: string;
  onOpenRotinaModal?: () => void;
}

export function DashboardTab({ unidadeId, onOpenRotinaModal }: DashboardTabProps) {
  // Passar unidadeId para o hook respeitar o filtro global
  const { colaborador, loading: loadingColaborador } = useColaboradorAtual(unidadeId);
  // Buscar todos os farmers da unidade (ou todas as unidades no consolidado)
  const { farmers, loading: loadingFarmers } = useFarmersUnidade(unidadeId);
  const { rotinasDoDia, progresso, loading: loadingRotinas, marcarConcluida, excluirRotina, atualizarRotina } = useRotinas(
    colaborador?.id || null, 
    unidadeId
  );

  // Estado para edição inline de rotina
  const [editandoRotinaId, setEditandoRotinaId] = useState<string | null>(null);
  const [editandoRotinaTexto, setEditandoRotinaTexto] = useState('');
  const { 
    aniversariantes, 
    inadimplentes, 
    novosMatriculados, 
    renovacoes, 
    resumo,
    loading: loadingAlertas 
  } = useAlertas(unidadeId);
  const { 
    tarefas, 
    tarefasPendentes, 
    tarefasConcluidas,
    tarefasHoje,
    tarefasAtrasadas,
    tarefasSemPrazo,
    loading: loadingTarefas, 
    criarTarefa, 
    marcarConcluida: marcarTarefaConcluida, 
    excluirTarefa 
  } = useTarefas({
    colaboradorId: colaborador?.id || null,
    unidadeId,
    colaborador
  });
  const { checklistAlertas, stats, loading: loadingStats } = useDashboardStats(unidadeId);
  
  // Hooks do Sucesso do Aluno (FASE 6)
  const { alunosCriticos, totalCriticos, loading: loadingCriticos } = useSucessoAlunoAlertas(unidadeId);
  const { professoresPendentes, totalPendentes, loading: loadingFeedbackPendente } = useFeedbackPendente(unidadeId);
  
  // Verificar se está no consolidado
  const isConsolidado = unidadeId === 'todos';

  // Estados de expansão dos alertas
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());

  // Estado do modal de NOVA TAREFA (completo, igual ao TarefasTab)
  const [modalNovaTarefaAberto, setModalNovaTarefaAberto] = useState(false);
  const [descricaoTarefa, setDescricaoTarefa] = useState('');
  const [dataPrazoTarefa, setDataPrazoTarefa] = useState<Date | undefined>(undefined);
  const [prioridadeTarefa, setPrioridadeTarefa] = useState<'alta' | 'media' | 'baixa'>('media');
  const [observacoesTarefa, setObservacoesTarefa] = useState('');
  const [colaboradorAtribuidoId, setColaboradorAtribuidoId] = useState<string>('');
  const [colaboradoresUnidade, setColaboradoresUnidade] = useState<{ id: number; nome: string; apelido: string | null }[]>([]);
  const [salvandoTarefa, setSalvandoTarefa] = useState(false);

  // Buscar colaboradores da unidade para atribuição
  useEffect(() => {
    async function fetchColaboradores() {
      const unidadeParaBuscar = unidadeId && unidadeId !== 'todos' ? unidadeId : colaborador?.unidade_id;
      if (!unidadeParaBuscar || !colaborador) return;

      const isAdmin = colaborador?.tipo === 'admin';
      let query = supabase
        .from('colaboradores')
        .select('id, nome, apelido')
        .eq('ativo', true);

      if (isAdmin) {
        query = query.order('nome');
      } else {
        query = query
          .or(`unidade_id.eq.${unidadeParaBuscar},tipo.eq.admin`)
          .order('nome');
      }

      const { data: colabs } = await query;
      if (colabs) {
        setColaboradoresUnidade(colabs);
        // Definir o colaborador logado como padrão
        setColaboradorAtribuidoId(colaborador.id.toString());
      }
    }
    fetchColaboradores();
  }, [unidadeId, colaborador]);

  // Handler para criar tarefa completa
  const handleCriarTarefa = async () => {
    if (!descricaoTarefa.trim()) {
      toast.error('Digite uma descrição para a tarefa');
      return;
    }
    
    setSalvandoTarefa(true);
    try {
      const input: any = {
        descricao: descricaoTarefa.trim(),
        prioridade: prioridadeTarefa,
        observacoes: observacoesTarefa.trim() || undefined,
      };
      
      if (dataPrazoTarefa) {
        input.data_prazo = dataPrazoTarefa.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('farmer_tarefas')
        .insert({
          ...input,
          colaborador_id: colaboradorAtribuidoId ? parseInt(colaboradorAtribuidoId) : colaborador?.id,
          unidade_id: unidadeId !== 'todos' ? unidadeId : colaborador?.unidade_id,
        });
      
      if (error) throw error;
      
      toast.success('Tarefa criada com sucesso!');
      setModalNovaTarefaAberto(false);
      // Resetar campos
      setDescricaoTarefa('');
      setDataPrazoTarefa(undefined);
      setPrioridadeTarefa('media');
      setObservacoesTarefa('');
      setColaboradorAtribuidoId(colaborador?.id?.toString() || '');
      // Recarregar tarefas
      window.location.reload();
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
      toast.error('Erro ao criar tarefa');
    } finally {
      setSalvandoTarefa(false);
    }
  };

  const toggleAlert = (alertId: string) => {
    setExpandedAlerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const loading = loadingColaborador || loadingFarmers || loadingRotinas || loadingAlertas || loadingTarefas || loadingStats || loadingCriticos || loadingFeedbackPendente;

  // Formatar data atual
  const hoje = new Date();
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const dataFormatada = `${diasSemana[hoje.getDay()]}, ${String(hoje.getDate()).padStart(2, '0')} ${meses[hoje.getMonth()]}`;

  // Contadores para badges
  const totalAlertas = (resumo?.renovacoes_vencidas || 0) + 
                       (resumo?.renovacoes_urgentes || 0) + 
                       (resumo?.inadimplentes || 0) + 
                       (resumo?.aniversariantes_hoje || 0) + 
                       (resumo?.novos_matriculados || 0);

  // Separar renovações por urgência
  const renovacoesVencidas = renovacoes.filter(r => r.urgencia === 'vencido');
  const renovacoesUrgentes = renovacoes.filter(r => r.urgencia === 'urgente');
  const renovacoesAtencao = renovacoes.filter(r => r.urgencia === 'atencao');

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skeleton Alertas */}
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-slate-700/50 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
        {/* Skeleton Rotinas */}
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-slate-700/50 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* === SEÇÃO FULL-WIDTH: Alertas de Checklist === */}
      {checklistAlertas.length > 0 && (
        <div className="space-y-3">
          {checklistAlertas.map((alerta) => {
            const isVencido = alerta.urgencia === 'vencido';
            const itensPendentes = alerta.total_items - alerta.items_concluidos;
            return (
              <div
                key={alerta.checklist_id}
                className={cn(
                  'rounded-xl p-4 border',
                  isVencido
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-amber-500/10 border-amber-500/20'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    isVencido ? 'bg-red-500/20' : 'bg-amber-500/20'
                  )}>
                    <AlertTriangle className={cn('w-4 h-4', isVencido ? 'text-red-400' : 'text-amber-400')} />
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-semibold', isVencido ? 'text-red-300' : 'text-amber-300')}>
                      Checklist &quot;{alerta.titulo}&quot; com {itensPendentes} {itensPendentes === 1 ? 'item pendente' : 'itens pendentes'}!
                    </p>
                    <p className={cn('text-xs mt-1', isVencido ? 'text-red-400/70' : 'text-amber-400/70')}>
                      Prazo: {alerta.data_prazo ? new Date(alerta.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
                      {' · '}{alerta.percentual_progresso}% concluído
                      {isVencido && ` · Vencido há ${Math.abs(alerta.dias_restantes)} dias`}
                      {!isVencido && alerta.dias_restantes > 0 && ` · ${alerta.dias_restantes} dias restantes`}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className={cn(
                          'text-xs h-7 px-3 rounded-lg font-medium',
                          isVencido
                            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                        )}
                        variant="ghost"
                      >
                        Abrir Checklist
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-3 text-slate-400 hover:text-slate-300">
                        Dispensar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === SEÇÃO FULL-WIDTH: KPIs em Grid 4 colunas === */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-violet-400">{stats.checklistsAtivos}</div>
          <div className="text-xs text-slate-500 mt-1">Checklists Ativos</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{stats.checklistsConcluidos}</div>
          <div className="text-xs text-slate-500 mt-1">Concluídos este mês</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{stats.tarefasPendentes}</div>
          <div className="text-xs text-slate-500 mt-1">Tarefas Rápidas</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-cyan-400">{stats.taxaSucessoContatos}%</div>
          <div className="text-xs text-slate-500 mt-1">Taxa Sucesso Contatos</div>
        </div>
      </div>

      {/* === SEÇÃO FULL-WIDTH: Alertas Sucesso do Aluno (FASE 6) === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card: Alunos Críticos */}
        <div 
          className={cn(
            "bg-slate-800/50 border rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]",
            totalCriticos > 0 ? "border-rose-500/30 bg-rose-500/5" : "border-slate-700/30"
          )}
          onClick={() => window.location.href = '/app/alunos?tab=sucesso&filtro=critico'}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              totalCriticos > 0 ? "bg-rose-500/20" : "bg-slate-700/50"
            )}>
              <Heart className={cn("w-5 h-5", totalCriticos > 0 ? "text-rose-400" : "text-slate-400")} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xl font-bold",
                  totalCriticos > 0 ? "text-rose-400" : "text-slate-400"
                )}>
                  {totalCriticos}
                </span>
                {totalCriticos > 0 && (
                  <span className="text-xs text-rose-400/70">⚠️ Críticos</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {totalCriticos === 1 ? 'aluno com saúde crítica' : 'alunos com saúde crítica'}
              </p>
            </div>
          </div>
        </div>

        {/* Card: Feedback Pendente */}
        <div 
          className={cn(
            "bg-slate-800/50 border rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]",
            totalPendentes > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-700/30"
          )}
          onClick={() => window.location.href = '/app/alunos?tab=sucesso&modal=enviar-feedback'}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              totalPendentes > 0 ? "bg-amber-500/20" : "bg-slate-700/50"
            )}>
              <ClipboardList className={cn("w-5 h-5", totalPendentes > 0 ? "text-amber-400" : "text-slate-400")} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xl font-bold",
                  totalPendentes > 0 ? "text-amber-400" : "text-slate-400"
                )}>
                  {totalPendentes}
                </span>
                {totalPendentes > 0 && (
                  <span className="text-xs text-amber-400/70">📋 Pendente</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {totalPendentes === 1 ? 'professor sem feedback este mês' : 'professores sem feedback este mês'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* === SEÇÃO 2 COLUNAS: Alertas + Rotinas === */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Coluna Esquerda - Alertas e Tarefas */}
      <div className="space-y-6">
        {/* Card: Alertas do Dia */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              🚨 Alertas do Dia
              {totalAlertas > 0 && (
                <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {totalAlertas}
                </span>
              )}
            </h3>
            <span className="text-sm text-slate-400">{dataFormatada}</span>
          </div>
          
          <div className="p-4 space-y-3">
            {/* Alerta: Renovações Vencidas */}
            {renovacoesVencidas.length > 0 && (
              <AlertaItem
                icon="📅"
                count={renovacoesVencidas.length}
                title="Renovações vencidas"
                subtitle="Contratos já venceram!"
                variant="urgent"
                expanded={expandedAlerts.has('renovacoes-vencidas')}
                onToggle={() => toggleAlert('renovacoes-vencidas')}
                items={renovacoesVencidas}
                renderItem={(item: AlertaRenovacao) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`${item.instrumento || 'Curso'} • Venceu há ${Math.abs(item.dias_para_vencer)} dias`}
                    whatsapp={item.whatsapp}
                  />
                )}
              />
            )}

            {/* Alerta: Renovações Urgentes (7 dias) */}
            {renovacoesUrgentes.length > 0 && (
              <AlertaItem
                icon="📅"
                count={renovacoesUrgentes.length}
                title="Renovações em 7 dias"
                subtitle="Urgente: contato imediato"
                variant="warning"
                expanded={expandedAlerts.has('renovacoes-urgentes')}
                onToggle={() => toggleAlert('renovacoes-urgentes')}
                items={renovacoesUrgentes}
                renderItem={(item: AlertaRenovacao) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`${item.instrumento || 'Curso'} • Vence em ${item.dias_para_vencer} dias`}
                    whatsapp={item.whatsapp}
                  />
                )}
              />
            )}

            {/* Alerta: Renovações Atenção (15 dias) */}
            {renovacoesAtencao.length > 0 && (
              <AlertaItem
                icon="📅"
                count={renovacoesAtencao.length}
                title="Renovações em 15 dias"
                subtitle="Planejar contato"
                variant="info"
                expanded={expandedAlerts.has('renovacoes-atencao')}
                onToggle={() => toggleAlert('renovacoes-atencao')}
                items={renovacoesAtencao}
                renderItem={(item: AlertaRenovacao) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`${item.instrumento || 'Curso'} • Vence em ${item.dias_para_vencer} dias`}
                    whatsapp={item.whatsapp}
                  />
                )}
              />
            )}

            {/* Alerta: Inadimplentes */}
            {inadimplentes.length > 0 && (
              <AlertaItem
                icon="💰"
                count={inadimplentes.length}
                title="Inadimplentes"
                subtitle="Precisam de cobrança"
                variant="warning"
                expanded={expandedAlerts.has('inadimplentes')}
                onToggle={() => toggleAlert('inadimplentes')}
                items={inadimplentes}
                renderItem={(item: AlertaInadimplente) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`R$ ${item.valor_parcela?.toFixed(2)} • ${item.dias_atraso > 0 ? `${item.dias_atraso} dias atraso` : 'Pendente'}`}
                    whatsapp={item.whatsapp}
                    actionLabel="Cobrar"
                    mensagemTemplate={`Olá ${item.aluno_nome.split(' ')[0]}! Identificamos que sua mensalidade (R$ ${item.valor_parcela?.toFixed(2)}) está pendente. Podemos ajudar com alguma condição especial? Responda essa mensagem!`}
                  />
                )}
              />
            )}

            {/* Alerta: Aniversariantes */}
            {aniversariantes.length > 0 && (
              <AlertaItem
                icon="🎂"
                count={aniversariantes.length}
                title="Aniversariantes hoje"
                subtitle={aniversariantes.map(a => a.aluno_nome.split(' ')[0]).join(', ')}
                variant="success"
                expanded={expandedAlerts.has('aniversariantes')}
                onToggle={() => toggleAlert('aniversariantes')}
                items={aniversariantes}
                renderItem={(item: AlertaAniversariante) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`${item.instrumento || 'Aluno'} • ${item.idade} anos`}
                    whatsapp={item.whatsapp}
                    actionLabel="Parabéns"
                    mensagemTemplate={`🎂 Parabéns, ${item.aluno_nome.split(' ')[0]}! A família LA Music deseja um dia incrível cheio de música! 🎶 Que esse novo ciclo traga ainda mais conquistas e muitas músicas novas!`}
                    gerarMensagem={() => gerarMensagemAniversario({
                      aluno_nome: item.aluno_nome,
                      instrumento: item.instrumento,
                      professor_nome: item.professor_nome,
                      idade: item.idade,
                      classificacao: item.classificacao,
                    })}
                  />
                )}
              />
            )}

            {/* Alerta: Novos Matriculados */}
            {novosMatriculados.length > 0 && (
              <AlertaItem
                icon="✨"
                count={novosMatriculados.length}
                title="Novos matriculados"
                subtitle="Enviar boas-vindas"
                variant="success"
                expanded={expandedAlerts.has('novos')}
                onToggle={() => toggleAlert('novos')}
                items={novosMatriculados}
                renderItem={(item: AlertaNovoMatriculado) => (
                  <AlertaListItem
                    key={item.aluno_id}
                    nome={item.aluno_nome}
                    detalhe={`${item.instrumento || 'Curso'} • ${item.dia_aula || ''} ${item.horario_aula || ''}`}
                    whatsapp={item.whatsapp}
                    actionLabel="Boas-vindas"
                    mensagemTemplate={`🎸 Bem-vindo(a) à LA Music, ${item.aluno_nome.split(' ')[0]}! Sua primeira aula de ${item.instrumento || 'música'} está marcada para ${item.dia_aula || 'breve'} às ${item.horario_aula || ''}. Estamos muito felizes em te receber! Qualquer dúvida, é só chamar. 🎵`}
                    gerarMensagem={() => gerarMensagemBoasVindas({
                      aluno_nome: item.aluno_nome,
                      instrumento: item.instrumento,
                      professor_nome: item.professor_nome,
                      idade: item.idade,
                      classificacao: item.classificacao,
                      dia_aula: item.dia_aula,
                      horario_aula: item.horario_aula,
                    })}
                  />
                )}
              />
            )}

            {/* Sem alertas */}
            {totalAlertas === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Tudo em dia! 🎉</p>
                <p className="text-sm">Nenhum alerta pendente</p>
              </div>
            )}
          </div>
        </div>

        {/* Card: Tarefas Urgentes */}
        {(tarefasHoje.length > 0 || tarefasAtrasadas.length > 0 || tarefasSemPrazo.length > 0) && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                📝 Tarefas Urgentes
                <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {tarefasHoje.length + tarefasAtrasadas.length + tarefasSemPrazo.length}
                </span>
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-violet-400 hover:text-violet-300"
                onClick={() => setModalNovaTarefaAberto(true)}
              >
                + Nova
              </Button>
            </div>
            
            <div className="p-4 space-y-2">
              {tarefasAtrasadas.map(tarefa => (
                <TarefaItem 
                  key={tarefa.id} 
                  tarefa={tarefa} 
                  variant="atrasada"
                  onToggle={() => marcarTarefaConcluida(tarefa.id, !tarefa.concluida)}
                />
              ))}
              {tarefasHoje.map(tarefa => (
                <TarefaItem 
                  key={tarefa.id} 
                  tarefa={tarefa} 
                  variant="hoje"
                  onToggle={() => marcarTarefaConcluida(tarefa.id, !tarefa.concluida)}
                />
              ))}
              {tarefasSemPrazo.map(tarefa => (
                <TarefaItem 
                  key={tarefa.id} 
                  tarefa={tarefa} 
                  variant="sem_prazo"
                  onToggle={() => marcarTarefaConcluida(tarefa.id, !tarefa.concluida)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Coluna Direita - Rotinas do Dia */}
      <div className="space-y-6">
        {/* Card: Rotinas de Hoje */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="font-semibold text-white">✅ Rotinas de Hoje</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-violet-400 hover:text-violet-300"
              onClick={onOpenRotinaModal}
            >
              + Rotina
            </Button>
          </div>
          
          <div className="p-4">
            {/* Barra de Progresso */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-slate-400">Progresso:</span>
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    progresso.percentual >= 100 ? "bg-emerald-500" :
                    progresso.percentual >= 50 ? "bg-violet-500" : "bg-amber-500"
                  )}
                  style={{ width: `${progresso.percentual}%` }}
                />
              </div>
              <span className="text-sm font-medium text-white">
                {progresso.concluidas}/{progresso.total}
              </span>
            </div>

            {/* Lista de Rotinas */}
            <div className="space-y-2">
              {rotinasDoDia.map(rotina => (
                <RotinaItem
                  key={rotina.rotina_id}
                  rotina={rotina}
                  onToggle={() => marcarConcluida(rotina.rotina_id, !rotina.concluida)}
                  editando={editandoRotinaId === rotina.rotina_id}
                  editandoTexto={editandoRotinaTexto}
                  onEditStart={() => {
                    setEditandoRotinaId(rotina.rotina_id);
                    setEditandoRotinaTexto(rotina.descricao);
                  }}
                  onEditChange={setEditandoRotinaTexto}
                  onEditSave={async () => {
                    if (editandoRotinaTexto.trim()) {
                      await atualizarRotina(rotina.rotina_id, { descricao: editandoRotinaTexto.trim() });
                    }
                    setEditandoRotinaId(null);
                  }}
                  onEditCancel={() => setEditandoRotinaId(null)}
                  onDelete={async () => {
                    await excluirRotina(rotina.rotina_id);
                  }}
                />
              ))}

              {rotinasDoDia.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">Nenhuma rotina cadastrada</p>
                  <p className="text-sm">Crie suas rotinas na aba "Minhas Rotinas"</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card: Info do(s) Farmer(s) */}
        {farmers.length > 0 && (
          <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/20 p-4">
            {isConsolidado ? (
              // No consolidado, mostrar todos os farmers em grid
              <div className="space-y-3">
                <p className="text-xs text-violet-400 uppercase tracking-wider mb-2">Equipe Farmer</p>
                <div className="grid grid-cols-2 gap-2">
                  {farmers.map((farmer) => (
                    <div key={farmer.id} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {farmer.apelido?.[0] || farmer.nome[0]}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{farmer.apelido || farmer.nome}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Em unidade específica, mostrar apenas os farmers da unidade
              <div className="space-y-3">
                <p className="text-xs text-violet-400 uppercase tracking-wider mb-2">
                  {farmers.length > 1 ? 'Farmers da Unidade' : 'Farmer'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {farmers.map((farmer) => (
                    <div key={farmer.id} className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-base">
                        {farmer.apelido?.[0] || farmer.nome[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{farmer.apelido || farmer.nome}</p>
                        <p className="text-xs text-violet-300">Farmer</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Modal: Nova Tarefa Rápida (completo) */}
    <Dialog open={modalNovaTarefaAberto} onOpenChange={setModalNovaTarefaAberto}>
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
              value={descricaoTarefa}
              onChange={(e) => setDescricaoTarefa(e.target.value)}
              placeholder="Ex: Ligar para João sobre renovação"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          {/* Data Prazo */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Prazo (opcional)
            </label>
            <DatePicker
              date={dataPrazoTarefa}
              onDateChange={setDataPrazoTarefa}
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Prioridade
            </label>
            <Select value={prioridadeTarefa} onValueChange={(v: any) => setPrioridadeTarefa(v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="baixa">🔵 Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Atribuir para */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Atribuir para
            </label>
            <Select value={colaboradorAtribuidoId} onValueChange={setColaboradorAtribuidoId}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {colaboradoresUnidade.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.apelido || c.nome} {c.id === colaborador?.id ? '(Eu)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">
              Observações (opcional)
            </label>
            <Textarea
              value={observacoesTarefa}
              onChange={(e) => setObservacoesTarefa(e.target.value)}
              placeholder="Detalhes adicionais..."
              className="bg-slate-800 border-slate-700 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setModalNovaTarefaAberto(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCriarTarefa} 
            disabled={!descricaoTarefa.trim() || salvandoTarefa}
            className="bg-gradient-to-r from-violet-600 to-purple-600"
          >
            {salvandoTarefa ? 'Salvando...' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Remover o NovoChecklistModal do Dashboard */}
    {/* O modal de checklist completo fica apenas na aba Checklists */}
    </div>
  );
}

// Componente: Item de Alerta
interface AlertaItemProps {
  icon: string;
  count: number;
  title: string;
  subtitle: string;
  variant: 'urgent' | 'warning' | 'success' | 'info';
  expanded: boolean;
  onToggle: () => void;
  items: any[];
  renderItem: (item: any) => React.ReactNode;
}

function AlertaItem({ icon, count, title, subtitle, variant, expanded, onToggle, items, renderItem }: AlertaItemProps) {
  const variantStyles = {
    urgent: 'border-rose-500/30 bg-rose-500/10',
    warning: 'border-amber-500/30 bg-amber-500/10',
    success: 'border-emerald-500/30 bg-emerald-500/10',
    info: 'border-blue-500/30 bg-blue-500/10',
  };

  const countStyles = {
    urgent: 'bg-rose-500 text-white',
    warning: 'bg-amber-500 text-white',
    success: 'bg-emerald-500 text-white',
    info: 'bg-blue-500 text-white',
  };

  return (
    <div className={cn('rounded-lg border overflow-hidden', variantStyles[variant])}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
      >
        <span className="text-xl">{icon}</span>
        <span className={cn('text-lg font-bold px-2 py-0.5 rounded', countStyles[variant])}>
          {count}
        </span>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {expanded && items.length > 0 && (
        <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
          {items.slice(0, 5).map(renderItem)}
          {items.length > 5 && (
            <div className="px-4 py-2 text-center">
              <Button variant="ghost" size="sm" className="text-violet-400">
                Ver todos ({items.length})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente: Item da Lista de Alerta com WhatsApp e preview de mensagem
interface AlertaListItemProps {
  nome: string;
  detalhe: string;
  whatsapp?: string | null;
  actionLabel?: string;
  mensagemTemplate?: string;
  gerarMensagem?: () => Promise<string>;
}

function AlertaListItem({ nome, detalhe, whatsapp, actionLabel = 'Contato', mensagemTemplate, gerarMensagem }: AlertaListItemProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [mensagemEditavel, setMensagemEditavel] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const abrirPreview = async () => {
    setShowPreview(true);
    // Se tem função generativa, usa ela; senão, usa template fixo
    if (gerarMensagem) {
      setGerando(true);
      setMensagemEditavel('✨ Gerando mensagem personalizada...');
      try {
        const mensagem = await gerarMensagem();
        setMensagemEditavel(mensagem);
      } catch (err) {
        console.error('[MensagemGenerativa] Erro:', err);
        // Fallback para template fixo
        setMensagemEditavel(mensagemTemplate || '');
      } finally {
        setGerando(false);
      }
    } else {
      setMensagemEditavel(mensagemTemplate || '');
    }
  };

  const enviarWhatsApp = async () => {
    if (!whatsapp) return;
    setEnviando(true);
    try {
      const numeroFormatado = formatPhoneNumber(whatsapp);
      const resultado = await sendWhatsAppMessage({
        to: numeroFormatado,
        text: mensagemEditavel,
      });

      if (resultado.success) {
        toast.success(`✅ Mensagem enviada para ${nome.split(' ')[0]} via WhatsApp!`);
        setShowPreview(false);
      } else {
        console.error('[WhatsApp Farmer] Erro UAZAPI:', resultado.error);
        toast.error(`Erro ao enviar: ${resultado.error || 'Falha na conexão com UAZAPI'}. Tente novamente.`);
      }
    } catch (err) {
      console.error('[WhatsApp Farmer] Erro inesperado:', err);
      toast.error('Erro de conexão com UAZAPI. Verifique sua internet e tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="hover:bg-white/5">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm">
            👤
          </div>
          <div>
            <p className="text-sm font-medium text-white">{nome}</p>
            <p className="text-xs text-slate-400">{detalhe}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {whatsapp && (mensagemTemplate || gerarMensagem) && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                abrirPreview();
              }}
            >
              {gerarMensagem && <Sparkles className="w-3 h-3" />}
              <MessageSquare className="w-3.5 h-3.5" />
              {actionLabel}
            </Button>
          )}
          {whatsapp && !mensagemTemplate && !gerarMensagem && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onClick={(e) => {
                e.stopPropagation();
                const numeroFormatado = formatPhoneNumber(whatsapp);
                window.open(`https://wa.me/${numeroFormatado}`, '_blank');
              }}
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          )}
          {!whatsapp && (
            <span className="text-xs text-slate-500 italic">Sem WhatsApp</span>
          )}
        </div>
      </div>

      {/* Preview da mensagem */}
      {showPreview && (
        <div className="px-4 pb-3">
          <div className="bg-slate-900/80 border border-slate-600/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Preview da mensagem</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-slate-400 hover:text-slate-300" onClick={() => setShowPreview(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <textarea
              value={mensagemEditavel}
              onChange={(e) => setMensagemEditavel(e.target.value)}
              disabled={gerando}
              className={cn(
                "w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-xs text-white resize-none focus:outline-none focus:border-violet-500",
                gerando && "opacity-60 animate-pulse"
              )}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 text-slate-400" onClick={() => setShowPreview(false)}>
                Cancelar
              </Button>
              <Button 
                size="sm" 
                className="text-xs h-7 bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                onClick={enviarWhatsApp}
                disabled={enviando || gerando}
              >
                {enviando ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-3 h-3" />
                    Enviar WhatsApp
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente: Item de Rotina
interface RotinaItemProps {
  rotina: {
    rotina_id: string;
    descricao: string;
    frequencia: string;
    prioridade: string;
    concluida: boolean;
    responsavel_nome?: string;
    responsavel_apelido?: string;
  };
  onToggle: () => void;
  editando?: boolean;
  editandoTexto?: string;
  onEditStart?: () => void;
  onEditChange?: (texto: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onDelete?: () => void;
}

function RotinaItem({ rotina, onToggle, editando, editandoTexto, onEditStart, onEditChange, onEditSave, onEditCancel, onDelete }: RotinaItemProps) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const frequenciaLabels: Record<string, string> = {
    diario: 'Diário',
    semanal: 'Semanal',
    mensal: 'Mensal',
  };

  const frequenciaStyles: Record<string, string> = {
    diario: 'bg-blue-500/20 text-blue-400',
    semanal: 'bg-violet-500/20 text-violet-400',
    mensal: 'bg-amber-500/20 text-amber-400',
  };

  const handleExcluir = async () => {
    setExcluindo(true);
    try {
      await onDelete?.();
      toast.success(`Rotina "${rotina.descricao}" excluída`);
    } catch (err) {
      console.error('Erro ao excluir rotina:', err);
      toast.error('Erro ao excluir rotina');
    } finally {
      setExcluindo(false);
      setConfirmandoExclusao(false);
    }
  };

  // Modo edição inline
  if (editando) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5">
        <input
          type="text"
          value={editandoTexto || ''}
          onChange={(e) => onEditChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave?.();
            if (e.key === 'Escape') onEditCancel?.();
          }}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
          autoFocus
        />
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300" onClick={onEditSave}>
          <Save className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-300" onClick={onEditCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div 
        className={cn(
          'group flex items-center gap-3 p-3 rounded-lg border transition-all',
          rotina.concluida 
            ? 'border-emerald-500/30 bg-emerald-500/5' 
            : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/30'
        )}
      >
        <div 
          className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0',
            rotina.concluida 
              ? 'border-emerald-500 bg-emerald-500' 
              : 'border-slate-500'
          )}
          onClick={onToggle}
        >
          {rotina.concluida && <CheckCircle2 className="w-3 h-3 text-white" />}
        </div>
        
        <div className="flex-1 cursor-pointer" onClick={onToggle}>
          <p className={cn(
            'text-sm font-medium transition-all',
            rotina.concluida ? 'text-slate-400 line-through' : 'text-white'
          )}>
            {rotina.descricao}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              frequenciaStyles[rotina.frequencia] || frequenciaStyles.diario
            )}>
              {frequenciaLabels[rotina.frequencia] || rotina.frequencia}
            </span>
            {rotina.responsavel_nome && (
              <span className="text-xs text-slate-400">
                • {rotina.responsavel_apelido || rotina.responsavel_nome}
              </span>
            )}
          </div>
        </div>

        {rotina.prioridade === 'alta' && (
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        )}

        {/* Botões editar/excluir - aparecem no hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-slate-400 hover:text-violet-400"
            onClick={(e) => { e.stopPropagation(); onEditStart?.(); }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
            onClick={(e) => { e.stopPropagation(); setConfirmandoExclusao(true); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rotina?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a rotina <strong>"{rotina.descricao}"</strong>? 
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              disabled={excluindo}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {excluindo ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Componente: Item de Tarefa
interface TarefaItemProps {
  tarefa: {
    id: string;
    descricao: string;
    prioridade: string;
    data_prazo?: string;
    concluida: boolean;
    alunos?: { nome: string };
    colaboradores?: { nome: string; apelido: string | null };
  };
  variant: 'hoje' | 'atrasada' | 'sem_prazo';
  onToggle: () => void;
}

function TarefaItem({ tarefa, variant, onToggle }: TarefaItemProps) {
  const variantStyles = {
    atrasada: 'border-rose-500/30 bg-rose-500/5',
    hoje: 'border-amber-500/30 bg-amber-500/5',
    sem_prazo: 'border-slate-500/30 bg-slate-500/5'
  };

  const badgeStyles = {
    atrasada: 'bg-rose-500/20 text-rose-400',
    hoje: 'bg-amber-500/20 text-amber-400',
    sem_prazo: 'bg-slate-500/20 text-slate-400'
  };

  const badgeLabels = {
    atrasada: '🔴 Atrasada',
    hoje: '🟡 Hoje',
    sem_prazo: '⚪ Sem prazo'
  };

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border',
      variantStyles[variant]
    )}>
      <div 
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0',
          tarefa.concluida 
            ? 'border-emerald-500 bg-emerald-500' 
            : 'border-slate-500 hover:border-slate-400'
        )}
        onClick={onToggle}
      >
        {tarefa.concluida && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      
      <div className="flex-1 cursor-pointer" onClick={onToggle}>
        <p className={cn(
          'text-sm font-medium transition-all',
          tarefa.concluida ? 'text-slate-400 line-through' : 'text-white'
        )}>{tarefa.descricao}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            badgeStyles[variant]
          )}>
            {badgeLabels[variant]}
          </span>
          {tarefa.colaboradores && (
            <span className="text-xs text-slate-400">
              • {tarefa.colaboradores.apelido || tarefa.colaboradores.nome}
            </span>
          )}
          {tarefa.alunos?.nome && (
            <span className="text-xs text-slate-400">• {tarefa.alunos.nome}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardTab;
