import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Settings2,
  Phone as PhoneIcon,
  MessageSquare,
  Clock,
  Flame,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM, PipelineEtapa } from '../types';

interface PipelineTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
  onLeadClick?: (lead: LeadCRM) => void;
  onConfigurarEtapas?: () => void;
}

export function PipelineTab({ unidadeId, ano, mes, onLeadClick, onConfigurarEtapas }: PipelineTabProps) {
  const { leads, setLeads, etapas, loading, refetchSilencioso } = useLeadsCRM({ unidadeId, ano, mes });
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todos');
  const [dragLeadId, setDragLeadId] = useState<number | null>(null);
  const [dropTargetEtapa, setDropTargetEtapa] = useState<number | null>(null);

  // Agrupar leads por etapa
  const leadsPorEtapa = useMemo(() => {
    const mapa = new Map<number, LeadCRM[]>();
    etapas.forEach(e => mapa.set(e.id, []));

    const leadsFiltrados = leads.filter(l => {
      if (busca) {
        const termo = busca.toLowerCase();
        const nome = (l.nome || '').toLowerCase();
        const tel = (l.telefone || '').toLowerCase();
        if (!nome.includes(termo) && !tel.includes(termo)) return false;
      }
      if (filtroUnidade !== 'todos' && l.unidade_id !== filtroUnidade) return false;
      return true;
    });

    leadsFiltrados.forEach(l => {
      const etapaId = l.etapa_pipeline_id || 1;
      const lista = mapa.get(etapaId);
      if (lista) {
        lista.push(l);
      } else {
        const novoLead = mapa.get(1);
        if (novoLead) novoLead.push(l);
      }
    });

    return mapa;
  }, [leads, etapas, busca, filtroUnidade]);

  // Drag & Drop handlers
  const handleDragStart = useCallback((leadId: number) => {
    setDragLeadId(leadId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragLeadId(null);
    setDropTargetEtapa(null);
  }, []);

  const handleDragOverEtapa = useCallback((etapaId: number) => {
    setDropTargetEtapa(etapaId);
  }, []);

  const handleDropOnEtapa = useCallback(async (etapaId: number) => {
    if (!dragLeadId) return;

    // Encontrar o lead
    const lead = leads.find(l => l.id === dragLeadId);
    if (!lead || lead.etapa_pipeline_id === etapaId) {
      setDragLeadId(null);
      setDropTargetEtapa(null);
      return;
    }

    const etapaAnterior = lead.etapa_pipeline_id;
    const leadIdMovido = dragLeadId;

    // Update otimista — mover localmente ANTES de salvar no banco
    setLeads(prev => prev.map(l =>
      l.id === leadIdMovido
        ? { ...l, etapa_pipeline_id: etapaId, data_ultimo_contato: new Date().toISOString() }
        : l
    ));
    setDragLeadId(null);
    setDropTargetEtapa(null);

    // Salvar no Supabase em background
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          etapa_pipeline_id: etapaId,
          data_ultimo_contato: new Date().toISOString(),
        })
        .eq('id', leadIdMovido);

      if (error) {
        console.error('Erro ao mover lead:', error);
        // Reverter em caso de erro
        setLeads(prev => prev.map(l =>
          l.id === leadIdMovido ? { ...l, etapa_pipeline_id: etapaAnterior } : l
        ));
        return;
      }

      // Registrar no histórico
      const etapaOrigem = etapas.find(e => e.id === etapaAnterior);
      const etapaDestino = etapas.find(e => e.id === etapaId);
      await supabase.from('crm_lead_historico').insert({
        lead_id: leadIdMovido,
        tipo: 'etapa_alterada',
        descricao: `Movido de "${etapaOrigem?.nome || '?'}" para "${etapaDestino?.nome || '?'}"`,
      });

      // Sincronizar em background sem loading
      refetchSilencioso();
    } catch (err) {
      console.error('Erro ao mover lead:', err);
      // Reverter em caso de erro
      setLeads(prev => prev.map(l =>
        l.id === leadIdMovido ? { ...l, etapa_pipeline_id: etapaAnterior } : l
      ));
    }
  }, [dragLeadId, leads, etapas, setLeads, refetchSilencioso]);

  // Botão direito abre drawer
  const handleContextMenu = useCallback((e: React.MouseEvent, lead: LeadCRM) => {
    e.preventDefault();
    onLeadClick?.(lead);
  }, [onLeadClick]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros do Pipeline */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 bg-slate-800/50 border-slate-700"
          />
        </div>
        <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
          <SelectTrigger className="w-[160px] bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="2ec861f6-023f-4d7b-9927-3960ad8c2a92">Campo Grande</SelectItem>
            <SelectItem value="95553e96-971b-4590-a6eb-0201d013c14d">Recreio</SelectItem>
            <SelectItem value="368d47f5-2d88-4475-bc14-ba084a9a348e">Barra</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="border-slate-700 text-slate-400 hover:text-white" onClick={onConfigurarEtapas}>
          <Settings2 className="w-4 h-4 mr-2" />
          Configurar Etapas
        </Button>
      </div>

      {/* Dica de drag & drop */}
      {dragLeadId && (
        <div className="text-center text-[10px] text-violet-400 animate-pulse">
          Arraste para a coluna desejada e solte
        </div>
      )}

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4 -mx-2">
        <div className="flex gap-3 min-w-max px-2">
          {etapas.map(etapa => {
            const leadsEtapa = leadsPorEtapa.get(etapa.id) || [];
            return (
              <ColunaKanban
                key={etapa.id}
                etapa={etapa}
                leads={leadsEtapa}
                isDragOver={dropTargetEtapa === etapa.id}
                hasDragActive={dragLeadId !== null}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOverEtapa}
                onDrop={handleDropOnEtapa}
                onContextMenu={handleContextMenu}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COLUNA DO KANBAN
// =============================================================================

interface ColunaKanbanProps {
  etapa: PipelineEtapa;
  leads: LeadCRM[];
  isDragOver: boolean;
  hasDragActive: boolean;
  onDragStart: (leadId: number) => void;
  onDragEnd: () => void;
  onDragOver: (etapaId: number) => void;
  onDrop: (etapaId: number) => void;
  onContextMenu: (e: React.MouseEvent, lead: LeadCRM) => void;
}

function ColunaKanban({
  etapa, leads, isDragOver, hasDragActive,
  onDragStart, onDragEnd, onDragOver, onDrop, onContextMenu,
}: ColunaKanbanProps) {
  return (
    <div className="w-[220px] flex-shrink-0 flex flex-col max-h-[calc(100vh-320px)]">
      {/* Header da coluna */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl border border-b-0 border-slate-700/50"
        style={{ backgroundColor: `${etapa.cor}15` }}
      >
        <span className="text-base">{etapa.icone}</span>
        <span className="text-xs font-semibold text-white truncate flex-1">
          {etapa.nome}
        </span>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${etapa.cor}30`, color: etapa.cor }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards — drop zone */}
      <div
        className={cn(
          "flex-1 overflow-y-auto space-y-2 p-2 border border-t-0 border-slate-700/50 rounded-b-xl scrollbar-thin scrollbar-thumb-slate-700 transition-all duration-200",
          isDragOver
            ? "bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/30"
            : "bg-slate-900/30",
          hasDragActive && !isDragOver && "opacity-70"
        )}
        onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(etapa.id);
        }}
        onDragLeave={() => onDragOver(-1)}
        onDrop={e => {
          e.preventDefault();
          onDrop(etapa.id);
        }}
      >
        {leads.length === 0 ? (
          <div className={cn(
            "text-center py-6 text-[10px]",
            isDragOver ? "text-violet-400" : "text-slate-600"
          )}>
            {isDragOver ? 'Soltar aqui' : 'Nenhum lead'}
          </div>
        ) : (
          leads.map(lead => (
            <CardLead
              key={lead.id}
              lead={lead}
              corEtapa={etapa.cor}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onContextMenu={e => onContextMenu(e, lead)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CARD DO LEAD
// =============================================================================

interface CardLeadProps {
  lead: LeadCRM;
  corEtapa: string;
  onDragStart: (leadId: number) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function CardLead({ lead, corEtapa, onDragStart, onDragEnd, onContextMenu }: CardLeadProps) {
  const unidadeCodigo = getUnidadeCodigo(lead.unidade_id);
  const cursoNome = (lead.cursos as any)?.nome || '';
  const cursoEmoji = getCursoEmoji(cursoNome);
  const tempoDesde = getTempoDesde(lead.data_ultimo_contato || lead.created_at);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      className={cn(
        "bg-slate-800/70 border border-slate-700/50 rounded-lg p-2.5",
        "cursor-grab active:cursor-grabbing",
        "hover:border-slate-600 hover:bg-slate-800 transition-all group",
        isDragging && "opacity-40 scale-95 ring-2 ring-violet-500/50"
      )}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(lead.id));
        setIsDragging(true);
        onDragStart(lead.id);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      onContextMenu={onContextMenu}
    >
      {/* Nome */}
      <div className="text-xs font-semibold text-white truncate mb-1.5 group-hover:text-violet-300 transition-colors">
        {lead.nome || 'Sem nome'}
      </div>

      {/* Curso + Unidade */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {cursoEmoji && <span className="text-xs">{cursoEmoji}</span>}
        {cursoNome && (
          <span className="text-[10px] text-slate-400 truncate">{cursoNome}</span>
        )}
        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-slate-700/50 text-slate-300 ml-auto flex-shrink-0">
          {unidadeCodigo}
        </span>
      </div>

      {/* Tempo + Temperatura */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {tempoDesde}
        </span>
        <TemperaturaTag temperatura={lead.temperatura} />
      </div>

      {/* Contadores de tentativas */}
      {(lead.qtd_tentativas_sem_resposta > 0 || lead.qtd_desmarcacoes > 0) && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-700/30">
          {lead.qtd_tentativas_sem_resposta > 0 && (
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5" title="Tentativas sem resposta">
              <MessageSquare className="w-3 h-3" />
              {lead.qtd_tentativas_sem_resposta}
            </span>
          )}
          {lead.qtd_desmarcacoes > 0 && (
            <span className="text-[10px] text-amber-500 flex items-center gap-0.5" title="Desmarcações">
              <PhoneIcon className="w-3 h-3" />
              {lead.qtd_desmarcacoes}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

function TemperaturaTag({ temperatura }: { temperatura: string | null }) {
  if (!temperatura || temperatura === 'quente') {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex items-center gap-0.5">
        <Flame className="w-2.5 h-2.5" /> Quente
      </span>
    );
  }
  if (temperatura === 'morno') {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-0.5">
        <Thermometer className="w-2.5 h-2.5" /> Morno
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center gap-0.5">
      <Snowflake className="w-2.5 h-2.5" /> Frio
    </span>
  );
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'CG',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'REC',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'BAR',
  };
  return map[unidadeId] || '?';
}

function getCursoEmoji(cursoNome: string): string {
  const lower = cursoNome.toLowerCase();
  if (lower.includes('violão') || lower.includes('guitarra')) return '🎸';
  if (lower.includes('piano') || lower.includes('teclado')) return '🎹';
  if (lower.includes('bateria')) return '🥁';
  if (lower.includes('canto') || lower.includes('vocal')) return '🎤';
  if (lower.includes('baixo')) return '🎸';
  if (lower.includes('ukulele')) return '🎸';
  if (lower.includes('saxofone') || lower.includes('flauta')) return '🎷';
  if (lower.includes('musicalização') || lower.includes('music')) return '🎵';
  return '🎵';
}

function getTempoDesde(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD === 1) return '1d';
  return `${diffD}d`;
}

export default PipelineTab;
