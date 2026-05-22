import React, { useState, useMemo, useEffect } from 'react';
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
  Loader2,
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
import { supabase } from '@/lib/supabase';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import { useVisitas } from '../hooks/useVisitas';
import type { LeadCRM, Visita } from '../types';
import { toast } from 'sonner';

interface AgendaTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
  onLeadClick?: (lead: LeadCRM) => void;
}

type VisaoAgenda = 'mes' | 'semana' | 'dia' | 'lista';

export function AgendaTab({ unidadeId, ano, mes, onLeadClick }: AgendaTabProps) {
  const { leads, loading: loadingLeads, refetchSilencioso } = useLeadsCRM({ unidadeId, ano, mes });
  const { visitas, loading: loadingVisitas, refetch: refetchVisitas } = useVisitas({ unidadeId, ano, mes });
  const loading = loadingLeads || loadingVisitas;
  const [visao, setVisao] = useState<VisaoAgenda>('semana');
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [marcandoId, setMarcandoId] = useState<string | null>(null);

  // Marcar presença manual.
  //   - Experimental: atualiza `leads` (flags+status+etapa) + UPSERT em `lead_experimentais` (canônico).
  //                   Preserva leads convertidos/matriculados (não regride).
  //   - Visita: atualiza só `visitas.status` (mapeando 'faltou' → 'nao_compareceu' do CHECK constraint).
  const handleMarcarPresenca = async (evento: EventoAgenda, novoStatus: 'realizada' | 'faltou') => {
    setMarcandoId(evento.id);
    try {
      if (evento.tipo === 'experimental') {
        const lead = evento.lead;
        if (!lead?.id) return;
        const presente = novoStatus === 'realizada';
        const statusLead = presente ? 'experimental_realizada' : 'experimental_faltou';
        const etapa = presente ? 7 : 9;

        const { error: leadError } = await supabase
          .from('leads')
          .update({
            experimental_realizada: presente,
            faltou_experimental: !presente,
            status: statusLead,
            etapa_pipeline_id: etapa,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)
          .not('status', 'in', '("convertido","matriculado")');
        if (leadError) throw leadError;

        if (lead.data_experimental) {
          const { error: expError } = await supabase
            .from('lead_experimentais')
            .upsert({
              lead_id: lead.id,
              nome_aluno: lead.nome || '(sem nome)',
              unidade_id: lead.unidade_id,
              status: statusLead,
              etapa_pipeline_id: etapa,
              data_experimental: lead.data_experimental,
              horario_experimental: lead.horario_experimental || null,
              professor_experimental_id: (lead as any).professor_experimental_id ?? null,
              curso_interesse_id: (lead as any).curso_interesse_id ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'lead_id,data_experimental,nome_aluno' });
          if (expError) throw expError;
        }

        toast.success(presente ? 'Experimental marcada como realizada' : 'Experimental marcada como faltou');
        refetchSilencioso();
      } else if (evento.tipo === 'visita') {
        if (!evento.visitaId) return;
        // 'faltou' no UI vira 'nao_compareceu' no banco (CHECK constraint)
        const statusBanco = novoStatus === 'realizada' ? 'realizada' : 'nao_compareceu';
        const { error } = await supabase
          .from('visitas')
          .update({ status: statusBanco, updated_at: new Date().toISOString() })
          .eq('id', evento.visitaId);
        if (error) throw error;

        toast.success(novoStatus === 'realizada' ? 'Visita marcada como realizada' : 'Visita marcada como não compareceu');
        refetchVisitas();
      }
    } catch (err) {
      console.error('Erro ao marcar presença:', err);
      toast.error('Erro ao marcar presença');
    } finally {
      setMarcandoId(null);
    }
  };

  // Feriados do ano
  const [feriadosMap, setFeriadosMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase
      .from('feriados')
      .select('data, nome')
      .eq('ativo', true)
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach((f: any) => map.set(f.data, f.nome));
        setFeriadosMap(map);
      });
  }, [ano]);

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

  // Monta eventos da agenda a partir de duas fontes:
  // - Experimentais: leads.data_experimental + experimental_agendada (experimentais NAO viram pra tabela visitas)
  // - Visitas: tabela visitas (fonte de verdade do sistema de visitas via Mila)
  //
  // TODO: hoje temos duplicacao de dados entre leads (tipo_agendamento='visita', data_experimental)
  //       e a tabela visitas, mantida por compatibilidade com o Pipeline/Dashboard/Follow-ups.
  //       Proxima fase do refactor: migrar Pipeline/Dashboard pra tambem lerem de visitas e
  //       entao remover os campos data_experimental/tipo_agendamento de leads quando for visita.
  //       Ver PLANO_VISITAS.md no projeto "fiscal mila".
  const eventosAgenda = useMemo(() => {
    const eventos: EventoAgenda[] = [];

    // Experimentais (continuam vindo de leads)
    leads.forEach(lead => {
      if (lead.data_experimental && lead.experimental_agendada && lead.tipo_agendamento !== 'visita') {
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
    });

    // Visitas (fonte: tabela visitas, com join opcional em leads)
    visitas.forEach(visita => {
      const leadVinculado = (visita.lead as LeadCRM | null) || null;
      // Constroi um "lead" minimo se nao houver lead vinculado (pra compat. com callback onLeadClick)
      const leadParaCard: LeadCRM = leadVinculado || {
        id: visita.lead_id || 0,
        nome: visita.nome,
        telefone: visita.telefone,
        unidade_id: visita.unidade_id,
      } as LeadCRM;

      eventos.push({
        id: `vis-${visita.id}`,
        lead: leadParaCard,
        tipo: 'visita',
        data: visita.data,
        horario: visita.horario ? visita.horario.substring(0, 5) : null,
        status: mapVisitaStatus(visita.status),
        descricao: `Visita — ${visita.nome}`,
        visitaId: visita.id,
      });
    });

    // Filtro por tipo
    if (filtroTipo !== 'todos') {
      return eventos.filter(e => e.tipo === filtroTipo);
    }

    return eventos;
  }, [leads, visitas, filtroTipo]);

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
          feriadosMap={feriadosMap}
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
            const feriadoNome = feriadosMap.get(diaStr);

            return (
              <div
                key={diaStr}
                className={cn(
                  "bg-slate-800/30 border rounded-xl p-2 min-h-[200px]",
                  feriadoNome ? "border-rose-500/30 bg-rose-500/5" :
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
                    feriadoNome ? "text-rose-400" :
                    isHoje ? "text-violet-400" : "text-white"
                  )}>
                    {dia.getDate()}
                  </div>
                  {feriadoNome && (
                    <div className="text-[9px] text-rose-400/80 truncate px-1" title={feriadoNome}>
                      {feriadoNome}
                    </div>
                  )}
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
                        onMarcarPresenca={handleMarcarPresenca}
                        marcando={marcandoId === evento.id}
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
                    onMarcarPresenca={handleMarcarPresenca}
                    marcando={marcandoId === evento.id}
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
                    onMarcarPresenca={handleMarcarPresenca}
                    marcando={marcandoId === evento.id}
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
  // ID da visita quando evento.tipo === 'visita' (necessário pra marcar presença na tabela `visitas`)
  visitaId?: string;
}

// Cor BASE por TIPO de evento (consistente com quickInputCards do ComercialPage)
const TIPO_CONFIG: Record<EventoAgenda['tipo'], { cor: string; iconeCor: string; corFraca: string }> = {
  experimental: { cor: 'bg-violet-500/20 border-violet-500/30', iconeCor: 'text-violet-400', corFraca: 'bg-violet-500/15 text-violet-300' },
  visita:       { cor: 'bg-amber-500/20 border-amber-500/30',  iconeCor: 'text-amber-400',  corFraca: 'bg-amber-500/15 text-amber-300' },
  followup:     { cor: 'bg-cyan-500/20 border-cyan-500/30',   iconeCor: 'text-cyan-400',   corFraca: 'bg-cyan-500/15 text-cyan-300' },
};

// Badge de STATUS (sobre o card colorido por tipo)
const STATUS_BADGE: Record<EventoAgenda['status'], { cor: string; label: string }> = {
  agendada:  { cor: 'bg-slate-700 text-slate-300',         label: 'Agendada' },
  realizada: { cor: 'bg-emerald-500/30 text-emerald-300',  label: 'Realizada' },
  faltou:    { cor: 'bg-rose-500/30 text-rose-300',        label: 'Faltou' },
};

function VisaoMes(props: {
  ano: number;
  mes: number;
  eventosPorDia: Map<string, EventoAgenda[]>;
  feriadosMap: Map<string, string>;
  onLeadClick?: (lead: LeadCRM) => void;
}) {
  const { ano, mes, eventosPorDia, feriadosMap, onLeadClick } = props;
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
          const feriadoNome = feriadosMap.get(diaStr);

          return (
            <div
              key={diaStr}
              className={cn(
                "min-h-[80px] border-b border-r border-slate-700/20 p-1",
                feriadoNome ? "bg-rose-500/5" :
                isHoje && "bg-violet-500/5"
              )}
            >
              <div className="flex items-center justify-between mb-1 px-1">
                {feriadoNome ? (
                  <span className="text-[8px] text-rose-400/80 truncate" title={feriadoNome}>{feriadoNome}</span>
                ) : <span />}
                <span className={cn(
                  "text-xs font-medium",
                  feriadoNome ? "text-rose-400" :
                  isHoje ? "text-violet-400" : "text-slate-400"
                )}>
                  {dia}
                </span>
              </div>
              <div className="space-y-0.5">
                {eventos.slice(0, 3).map(evento => {
                  const tipo = TIPO_CONFIG[evento.tipo];
                  const prefix = evento.status === 'realizada' ? '✅ ' : evento.status === 'faltou' ? '❌ ' : '';
                  return (
                    <div
                      key={evento.id}
                      className={cn(
                        "text-[9px] px-1 py-0.5 rounded cursor-pointer truncate",
                        tipo.corFraca
                      )}
                      onClick={() => onLeadClick?.(evento.lead)}
                      title={`${evento.descricao} — ${STATUS_BADGE[evento.status].label}`}
                    >
                      {prefix}{evento.horario ? `${evento.horario} ` : ''}{evento.lead.nome || '?'}
                    </div>
                  );
                })}
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

function CardEvento(props: {
  key?: React.Key;
  evento: EventoAgenda;
  onClick?: () => void;
  onMarcarPresenca?: (evento: EventoAgenda, status: 'realizada' | 'faltou') => void;
  marcando?: boolean;
}) {
  const { evento, onClick, onMarcarPresenca, marcando } = props;
  const tipoConfig = TIPO_CONFIG[evento.tipo];
  const statusBadge = STATUS_BADGE[evento.status];
  const StatusIcon = evento.status === 'realizada' ? CheckCircle2 : evento.status === 'faltou' ? XCircle : CalendarDays;
  const podeMArcar = (evento.tipo === 'experimental' || evento.tipo === 'visita') && evento.status === 'agendada' && !!onMarcarPresenca;

  return (
    <div
      className={cn(
        "border rounded-lg p-1.5 cursor-pointer hover:brightness-110 transition-all",
        tipoConfig.cor
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <StatusIcon className={cn("w-3 h-3 shrink-0", tipoConfig.iconeCor)} />
          <span className="text-[10px] font-medium text-white truncate">
            {evento.lead.nome || 'Sem nome'}
          </span>
        </div>
        <span className={cn("text-[8px] font-medium px-1 py-0.5 rounded shrink-0 leading-none", statusBadge.cor)}>
          {statusBadge.label}
        </span>
      </div>
      {evento.horario && (
        <div className="text-[9px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" /> {evento.horario}
        </div>
      )}
      <div className={cn("text-[9px] capitalize font-medium", tipoConfig.iconeCor)}>{evento.tipo}</div>
      {podeMArcar && (
        <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-white/10">
          <button
            type="button"
            disabled={marcando}
            onClick={(e) => { e.stopPropagation(); onMarcarPresenca!(evento, 'realizada'); }}
            className="flex-1 text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 disabled:opacity-50 flex items-center justify-center gap-0.5"
            title="Marcar como realizada"
          >
            {marcando ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
            Realizada
          </button>
          <button
            type="button"
            disabled={marcando}
            onClick={(e) => { e.stopPropagation(); onMarcarPresenca!(evento, 'faltou'); }}
            className="flex-1 text-[9px] px-1 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 disabled:opacity-50 flex items-center justify-center gap-0.5"
            title="Marcar como faltou"
          >
            {marcando ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <XCircle className="w-2.5 h-2.5" />}
            Faltou
          </button>
        </div>
      )}
    </div>
  );
}

function LinhaEvento(props: {
  key?: React.Key;
  evento: EventoAgenda;
  onClick?: () => void;
  onMarcarPresenca?: (evento: EventoAgenda, status: 'realizada' | 'faltou') => void;
  marcando?: boolean;
}) {
  const { evento, onClick, onMarcarPresenca, marcando } = props;
  const tipoConfig = TIPO_CONFIG[evento.tipo];
  const statusBadge = STATUS_BADGE[evento.status];
  const unidadeCodigo = getUnidadeCodigo(evento.lead.unidade_id);
  const podeMArcar = (evento.tipo === 'experimental' || evento.tipo === 'visita') && evento.status === 'agendada' && !!onMarcarPresenca;

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 hover:brightness-110 cursor-pointer transition-all border-l-4",
        tipoConfig.cor
      )}
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
      <span className={cn("text-[10px] capitalize font-medium w-20 flex-shrink-0", tipoConfig.iconeCor)}>{evento.tipo}</span>
      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", statusBadge.cor)}>
        {statusBadge.label}
      </span>
      {podeMArcar && (
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            disabled={marcando}
            onClick={(e) => { e.stopPropagation(); onMarcarPresenca!(evento, 'realizada'); }}
            className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 disabled:opacity-50 flex items-center gap-1"
            title="Marcar como realizada"
          >
            {marcando ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Realizada
          </button>
          <button
            type="button"
            disabled={marcando}
            onClick={(e) => { e.stopPropagation(); onMarcarPresenca!(evento, 'faltou'); }}
            className="text-[10px] px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 disabled:opacity-50 flex items-center gap-1"
            title="Marcar como faltou"
          >
            {marcando ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
            Faltou
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function formatarDataISO(data: Date): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

// Mapeia o status da tabela `visitas` pros 3 status usados na UI da agenda.
function mapVisitaStatus(status: Visita['status']): 'agendada' | 'realizada' | 'faltou' {
  if (status === 'realizada') return 'realizada';
  if (status === 'nao_compareceu') return 'faltou';
  // 'agendada' e 'cancelada' (que nem deve chegar aqui porque o hook filtra) caem em agendada
  return 'agendada';
}

export default AgendaTab;
