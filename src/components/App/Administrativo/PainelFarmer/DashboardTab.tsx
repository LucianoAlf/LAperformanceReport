'use client';

import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useColaboradorAtual, useRotinas, useAlertas, useTarefas, useFarmersUnidade } from './hooks';
import type { AlertaRenovacao, AlertaInadimplente, AlertaAniversariante, AlertaNovoMatriculado } from './types';

interface DashboardTabProps {
  unidadeId: string;
  onOpenRotinaModal?: () => void;
}

export function DashboardTab({ unidadeId, onOpenRotinaModal }: DashboardTabProps) {
  // Passar unidadeId para o hook respeitar o filtro global
  const { colaborador, loading: loadingColaborador } = useColaboradorAtual(unidadeId);
  // Buscar todos os farmers da unidade (ou todas as unidades no consolidado)
  const { farmers, loading: loadingFarmers } = useFarmersUnidade(unidadeId);
  const { rotinasDoDia, progresso, loading: loadingRotinas, marcarConcluida } = useRotinas(
    colaborador?.id || null, 
    unidadeId
  );
  const { 
    aniversariantes, 
    inadimplentes, 
    novosMatriculados, 
    renovacoes, 
    resumo,
    loading: loadingAlertas 
  } = useAlertas(unidadeId);
  const { tarefasHoje, tarefasAtrasadas, loading: loadingTarefas } = useTarefas(
    colaborador?.id || null,
    unidadeId
  );
  
  // Verificar se está no consolidado
  const isConsolidado = unidadeId === 'todos';

  // Estados de expansão dos alertas
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());

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

  const loading = loadingColaborador || loadingFarmers || loadingRotinas || loadingAlertas || loadingTarefas;

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
        {(tarefasHoje.length > 0 || tarefasAtrasadas.length > 0) && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                📝 Tarefas Urgentes
                <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {tarefasHoje.length + tarefasAtrasadas.length}
                </span>
              </h3>
              <Button variant="ghost" size="sm" className="text-violet-400 hover:text-violet-300">
                + Nova
              </Button>
            </div>
            
            <div className="p-4 space-y-2">
              {tarefasAtrasadas.map(tarefa => (
                <TarefaItem 
                  key={tarefa.id} 
                  tarefa={tarefa} 
                  variant="atrasada"
                />
              ))}
              {tarefasHoje.map(tarefa => (
                <TarefaItem 
                  key={tarefa.id} 
                  tarefa={tarefa} 
                  variant="hoje"
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

// Componente: Item da Lista de Alerta
interface AlertaListItemProps {
  nome: string;
  detalhe: string;
  whatsapp?: string | null;
  actionLabel?: string;
}

function AlertaListItem({ nome, detalhe, whatsapp, actionLabel = 'Contato' }: AlertaListItemProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-white/5">
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
        {whatsapp && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`https://wa.me/55${whatsapp.replace(/\D/g, '')}`, '_blank');
            }}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        )}
      </div>
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
}

function RotinaItem({ rotina, onToggle }: RotinaItemProps) {
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

  return (
    <div 
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer',
        rotina.concluida 
          ? 'border-emerald-500/30 bg-emerald-500/5' 
          : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/30'
      )}
      onClick={onToggle}
    >
      <div className={cn(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
        rotina.concluida 
          ? 'border-emerald-500 bg-emerald-500' 
          : 'border-slate-500'
      )}>
        {rotina.concluida && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      
      <div className="flex-1">
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
        <AlertTriangle className="w-4 h-4 text-amber-400" />
      )}
    </div>
  );
}

// Componente: Item de Tarefa
interface TarefaItemProps {
  tarefa: {
    id: string;
    descricao: string;
    prioridade: string;
    data_prazo?: string;
    alunos?: { nome: string };
    colaboradores?: { nome: string; apelido: string | null };
  };
  variant: 'hoje' | 'atrasada';
}

function TarefaItem({ tarefa, variant }: TarefaItemProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border',
      variant === 'atrasada' 
        ? 'border-rose-500/30 bg-rose-500/5' 
        : 'border-amber-500/30 bg-amber-500/5'
    )}>
      <div className="w-5 h-5 rounded-full border-2 border-slate-500" />
      
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{tarefa.descricao}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            variant === 'atrasada' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
          )}>
            {variant === 'atrasada' ? '🔴 Atrasada' : '🟡 Hoje'}
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
