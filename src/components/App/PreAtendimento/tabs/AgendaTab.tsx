import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  MapPin,
  User,
  GraduationCap,
  Phone as PhoneIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM } from '../types';

interface AgendaTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
  onLeadClick?: (lead: LeadCRM) => void;
}

type VisaoAgenda = 'mes' | 'semana' | 'dia' | 'lista';

export function AgendaTab({ unidadeId, ano, mes, onLeadClick }: AgendaTabProps) {
  const { leads, loading } = useLeadsCRM({ unidadeId, ano, mes });
  const [visao, setVisao] = useState<VisaoAgenda>('semana');
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  // Calcular semana atual + offset
  const hoje = new Date();
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay() + 1 + (semanaOffset * 7)); // Segunda
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6); // Domingo

  // Dias da semana
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    return dia;
  });

  // Filtrar leads com experimental agendada ou follow-ups
  const eventosAgenda = useMemo(() => {
    const eventos: EventoAgenda[] = [];

    leads.forEach(lead => {
      // Experimentais agendadas
      if (lead.data_experimental && lead.experimental_agendada) {
        eventos.push({
          id: `exp-${lead.id}`,
          lead,
          tipo: 'experimental',
          data: lead.data_experimental,
          horario: lead.horario_experimental || null,
          status: lead.experimental_realizada ? 'realizada' :
            lead.faltou_experimental ? 'faltou' : 'agendada',
          descricao: `Experimental — ${lead.nome || 'Sem nome'}`,
        });
      }

      // Leads com tipo_agendamento = 'visita' e data_experimental
      if (lead.data_experimental && lead.tipo_agendamento === 'visita') {
        eventos.push({
          id: `vis-${lead.id}`,
          lead,
          tipo: 'visita',
          data: lead.data_experimental,
          horario: lead.horario_experimental || null,
          status: lead.experimental_realizada ? 'realizada' :
            lead.faltou_experimental ? 'faltou' : 'agendada',
          descricao: `Visita — ${lead.nome || 'Sem nome'}`,
        });
      }
    });

    // Filtro por tipo
    if (filtroTipo !== 'todos') {
      return eventos.filter(e => e.tipo === filtroTipo);
    }

    return eventos;
  }, [leads, filtroTipo]);

  // Agrupar eventos por data
  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    eventosAgenda.forEach(e => {
      const lista = mapa.get(e.data) || [];
      lista.push(e);
      mapa.set(e.data, lista);
    });
    return mapa;
  }, [eventosAgenda]);

  // Contadores
  const totalAgendadas = eventosAgenda.filter(e => e.status === 'agendada').length;
  const totalRealizadas = eventosAgenda.filter(e => e.status === 'realizada').length;
  const totalFaltou = eventosAgenda.filter(e => e.status === 'faltou').length;

  // Label da semana
  const labelSemana = `${formatarDataCurta(inicioSemana)} — ${formatarDataCurta(fimSemana)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: Navegação + Filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-400 h-8 w-8 p-0"
            onClick={() => setSemanaOffset(s => s - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-white min-w-[200px] text-center">
            {labelSemana}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-400 h-8 w-8 p-0"
            onClick={() => setSemanaOffset(s => s + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {semanaOffset !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-violet-400 text-xs"
              onClick={() => setSemanaOffset(0)}
            >
              Hoje
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[160px] bg-slate-800/50 border-slate-700 h-8 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="experimental">Experimentais</SelectItem>
              <SelectItem value="visita">Visitas</SelectItem>
            </SelectContent>
          </Select>

          {/* Visão */}
          <div className="flex items-center bg-slate-800/50 rounded-lg border border-slate-700 p-0.5">
            {(['mes', 'semana', 'dia', 'lista'] as VisaoAgenda[]).map(v => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                  visao === v
                    ? "bg-violet-600 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs resumo */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKPI icone="📅" label="Agendadas" valor={totalAgendadas} cor="text-violet-400" />
        <MiniKPI icone="✅" label="Realizadas" valor={totalRealizadas} cor="text-emerald-400" />
        <MiniKPI icone="❌" label="Faltaram" valor={totalFaltou} cor="text-rose-400" />
      </div>

      {/* Calendário Mensal */}
      {visao === 'mes' && (
        <VisaoMes
          ano={ano}
          mes={mes}
          eventosPorDia={eventosPorDia}
          onLeadClick={onLeadClick}
        />
      )}

      {/* Calendário Semanal */}
      {visao === 'semana' && (
        <div className="grid grid-cols-7 gap-2">
          {diasSemana.map(dia => {
            const diaStr = formatarDataISO(dia);
            const eventos = eventosPorDia.get(diaStr) || [];
            const isHoje = diaStr === formatarDataISO(hoje);

            return (
              <div
                key={diaStr}
                className={cn(
                  "bg-slate-800/30 border rounded-xl p-2 min-h-[200px]",
                  isHoje ? "border-violet-500/50 bg-violet-500/5" : "border-slate-700/50"
                )}
              >
                {/* Header do dia */}
                <div className="text-center mb-2 pb-2 border-b border-slate-700/30">
                  <div className="text-[10px] text-slate-500 uppercase">
                    {dia.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </div>
                  <div className={cn(
                    "text-lg font-bold",
                    isHoje ? "text-violet-400" : "text-white"
                  )}>
                    {dia.getDate()}
                  </div>
                </div>

                {/* Eventos do dia */}
                <div className="space-y-1.5">
                  {eventos.length === 0 ? (
                    <div className="text-[10px] text-slate-600 text-center py-4">—</div>
                  ) : (
                    eventos.map(evento => (
                      <CardEvento
                        key={evento.id}
                        evento={evento}
                        onClick={() => onLeadClick?.(evento.lead)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Visão Lista */}
      {visao === 'lista' && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
          {eventosAgenda.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Nenhum evento neste período
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {eventosAgenda
                .sort((a, b) => a.data.localeCompare(b.data))
                .map(evento => (
                  <LinhaEvento
                    key={evento.id}
                    evento={evento}
                    onClick={() => onLeadClick?.(evento.lead)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* Visão Dia */}
      {visao === 'dia' && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <div className="text-center mb-4">
            <div className="text-lg font-bold text-white">
              {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          {(() => {
            const hojeStr = formatarDataISO(hoje);
            const eventosHoje = eventosPorDia.get(hojeStr) || [];
            if (eventosHoje.length === 0) {
              return <div className="text-center py-12 text-slate-500 text-sm">Nenhum evento hoje</div>;
            }
            return (
              <div className="space-y-2">
                {eventosHoje.map(evento => (
                  <LinhaEvento
                    key={evento.id}
                    evento={evento}
                    onClick={() => onLeadClick?.(evento.lead)}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TIPOS E COMPONENTES AUXILIARES
// =============================================================================

interface EventoAgenda {
  id: string;
  lead: LeadCRM;
  tipo: 'experimental' | 'visita' | 'followup';
  data: string;
  horario: string | null;
  status: 'agendada' | 'realizada' | 'faltou';
  descricao: string;
}

function VisaoMes(props: {
  ano: number;
  mes: number;
  eventosPorDia: Map<string, EventoAgenda[]>;
  onLeadClick?: (lead: LeadCRM) => void;
}) {
  const { ano, mes, eventosPorDia, onLeadClick } = props;
  const hoje = new Date();
  const hojeStr = formatarDataISO(hoje);

  // Primeiro dia do mês e quantos dias tem
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  // Dia da semana do primeiro dia (0=dom, 1=seg...)
  const diaSemanaInicio = primeiroDia.getDay();
  // Ajustar para começar na segunda (0=seg)
  const offsetInicio = diaSemanaInicio === 0 ? 6 : diaSemanaInicio - 1;

  // Gerar array de células (null = dia vazio, number = dia do mês)
  const celulas: (number | null)[] = [];
  for (let i = 0; i < offsetInicio; i++) celulas.push(null);
  for (let d = 1; d <= ultimoDia; d++) celulas.push(d);
  // Completar até múltiplo de 7
  while (celulas.length % 7 !== 0) celulas.push(null);

  const diasSemanaLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Header dias da semana */}
      <div className="grid grid-cols-7 border-b border-slate-700/50">
        {diasSemanaLabels.map(d => (
          <div key={d} className="text-center py-2 text-[10px] text-slate-500 font-medium uppercase">
            {d}
          </div>
        ))}
      </div>
      {/* Grid de dias */}
      <div className="grid grid-cols-7">
        {celulas.map((dia, idx) => {
          if (dia === null) {
            return <div key={`empty-${idx}`} className="min-h-[80px] border-b border-r border-slate-700/20 bg-slate-900/20" />;
          }
          const diaStr = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const eventos = eventosPorDia.get(diaStr) || [];
          const isHoje = diaStr === hojeStr;

          return (
            <div
              key={diaStr}
              className={cn(
                "min-h-[80px] border-b border-r border-slate-700/20 p-1",
                isHoje && "bg-violet-500/5"
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-1 text-right pr-1",
                isHoje ? "text-violet-400" : "text-slate-400"
              )}>
                {dia}
              </div>
              <div className="space-y-0.5">
                {eventos.slice(0, 3).map(evento => (
                  <div
                    key={evento.id}
                    className={cn(
                      "text-[9px] px-1 py-0.5 rounded cursor-pointer truncate",
                      evento.status === 'agendada' && "bg-violet-500/20 text-violet-300",
                      evento.status === 'realizada' && "bg-emerald-500/20 text-emerald-300",
                      evento.status === 'faltou' && "bg-rose-500/20 text-rose-300",
                    )}
                    onClick={() => onLeadClick?.(evento.lead)}
                    title={evento.descricao}
                  >
                    {evento.horario ? `${evento.horario} ` : ''}{evento.lead.nome || '?'}
                  </div>
                ))}
                {eventos.length > 3 && (
                  <div className="text-[8px] text-slate-500 text-center">
                    +{eventos.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniKPI(props: { icone: string; label: string; valor: number; cor: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-center">
      <span className="text-lg">{props.icone}</span>
      <div className={cn("text-2xl font-bold", props.cor)}>{props.valor}</div>
      <div className="text-[10px] text-slate-500">{props.label}</div>
    </div>
  );
}

function CardEvento(props: { key?: React.Key; evento: EventoAgenda; onClick?: () => void }) {
  const { evento, onClick } = props;
  const statusConfig = {
    agendada: { cor: 'bg-violet-500/20 border-violet-500/30', icone: <CalendarDays className="w-3 h-3 text-violet-400" /> },
    realizada: { cor: 'bg-emerald-500/20 border-emerald-500/30', icone: <CheckCircle2 className="w-3 h-3 text-emerald-400" /> },
    faltou: { cor: 'bg-rose-500/20 border-rose-500/30', icone: <XCircle className="w-3 h-3 text-rose-400" /> },
  };

  const config = statusConfig[evento.status];

  return (
    <div
      className={cn(
        "border rounded-lg p-1.5 cursor-pointer hover:brightness-110 transition-all",
        config.cor
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {config.icone}
        <span className="text-[10px] font-medium text-white truncate">
          {evento.lead.nome || 'Sem nome'}
        </span>
      </div>
      {evento.horario && (
        <div className="text-[9px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" /> {evento.horario}
        </div>
      )}
      <div className="text-[9px] text-slate-500 capitalize">{evento.tipo}</div>
    </div>
  );
}

function LinhaEvento(props: { key?: React.Key; evento: EventoAgenda; onClick?: () => void }) {
  const { evento, onClick } = props;
  const statusConfig = {
    agendada: { badge: 'bg-violet-500/20 text-violet-400', label: 'Agendada' },
    realizada: { badge: 'bg-emerald-500/20 text-emerald-400', label: 'Realizada' },
    faltou: { badge: 'bg-rose-500/20 text-rose-400', label: 'Faltou' },
  };
  const config = statusConfig[evento.status];
  const unidadeCodigo = getUnidadeCodigo(evento.lead.unidade_id);

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="text-xs text-slate-400 w-20 flex-shrink-0">
        {formatarDataBR(evento.data)}
      </div>
      <div className="text-xs text-slate-400 w-14 flex-shrink-0">
        {evento.horario || '—'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-white">{evento.lead.nome || 'Sem nome'}</span>
      </div>
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 flex-shrink-0">
        {unidadeCodigo}
      </span>
      <span className="text-[10px] capitalize text-slate-400 w-20 flex-shrink-0">{evento.tipo}</span>
      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", config.badge)}>
        {config.label}
      </span>
    </div>
  );
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function formatarDataISO(data: Date): string {
  return data.toISOString().split('T')[0];
}

function formatarDataCurta(data: Date): string {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatarDataBR(dataStr: string): string {
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}`;
}

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'CG',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'REC',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'BAR',
  };
  return map[unidadeId] || '?';
}

export default AgendaTab;
