import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, ArrowRightLeft, FileText, Archive,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConversaCRM, LeadCRM, LeadHistorico } from '../../types';

interface LeadSidebarProps {
  lead: LeadCRM;
  conversa: ConversaCRM;
  mensagensCount: number;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onArquivar?: (lead: LeadCRM) => void;
}

function formatarData(data: string | null): string {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

export function LeadSidebar({
  lead,
  conversa,
  mensagensCount,
  onAgendar,
  onMoverEtapa,
  onArquivar,
}: LeadSidebarProps) {
  const [historico, setHistorico] = useState<LeadHistorico[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);

  const fetchHistorico = useCallback(async () => {
    if (!lead?.id) return;
    setLoadingHistorico(true);
    try {
      const { data } = await supabase
        .from('crm_lead_historico')
        .select('*, colaborador:created_by(nome, apelido)')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setHistorico((data || []) as LeadHistorico[]);
    } catch (err) {
      console.error('[LeadSidebar] Erro ao buscar histórico:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    fetchHistorico();
  }, [fetchHistorico]);

  const etapaNome = lead.crm_pipeline_etapas?.nome || lead.status || '-';
  const etapaCor = lead.crm_pipeline_etapas?.cor || '#8b5cf6';

  // Calcular tempo de resposta (simplificado)
  const tempoResposta = conversa.ultima_mensagem_at
    ? calcularTempoResposta(lead.data_contato, conversa.created_at)
    : '-';

  // Dias no pipeline
  const diasPipeline = Math.floor(
    (Date.now() - new Date(lead.data_contato).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      className="w-[320px] flex-shrink-0 border-l border-slate-700 flex flex-col overflow-y-auto animate-in slide-in-from-right-4 duration-300"
      style={{ background: '#0d1424' }}
    >
      {/* Header da ficha */}
      <div className="p-4 border-b border-slate-700/50 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
          {getIniciais(lead.nome)}
        </div>
        <h3 className="font-bold text-white text-base">{lead.nome || 'Lead'}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{lead.telefone || ''}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          {lead.temperatura && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getTemperaturaClasses(lead.temperatura)}`}>
              {getTemperaturaEmoji(lead.temperatura)} {lead.temperatura.charAt(0).toUpperCase() + lead.temperatura.slice(1)}
            </span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: etapaCor + '33', color: etapaCor }}
          >
            {etapaNome}
          </span>
        </div>
      </div>

      {/* Dados do lead */}
      <div className="p-4 space-y-4">
        {/* Informações básicas */}
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Informações</h4>
          <div className="space-y-2">
            <InfoRow label="Curso" value={lead.cursos?.nome || '-'} />
            <InfoRow label="Unidade" value={lead.unidades?.nome || '-'} />
            <InfoRow label="Faixa Etária" value={lead.faixa_etaria || '-'} />
            <InfoRow label="Canal" value={lead.canais_origem?.nome || '-'} />
            <InfoRow
              label="Sabe o preço?"
              value={lead.sabia_preco === true ? 'Sim' : lead.sabia_preco === false ? 'Não' : '-'}
            />
            <InfoRow label="Primeiro contato" value={formatarData(lead.data_contato)} />
          </div>
        </div>

        {/* KPIs da conversa */}
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">KPIs da Conversa</h4>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard valor={tempoResposta} label="Tempo resposta" />
            <KpiCard valor={String(mensagensCount)} label="Msgs trocadas" />
            <KpiCard valor={String(diasPipeline)} label="Dias no pipeline" />
            <KpiCard valor={String(lead.qtd_mensagens_mila || 0)} label="Msgs Mila" destaque />
          </div>
        </div>

        {/* Ações rápidas */}
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Ações</h4>
          <div className="space-y-1.5">
            <AcaoButton
              icon={CalendarDays}
              label="Agendar Experimental"
              cor="emerald"
              onClick={() => onAgendar?.(lead)}
            />
            <AcaoButton
              icon={ArrowRightLeft}
              label="Mover Etapa"
              cor="blue"
              onClick={() => onMoverEtapa?.(lead)}
            />
            <AcaoButton
              icon={FileText}
              label="Matricular"
              cor="violet"
              onClick={() => {}}
            />
            <AcaoButton
              icon={Archive}
              label="Arquivar"
              cor="slate"
              onClick={() => onArquivar?.(lead)}
            />
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</h4>
          {loadingHistorico ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum evento registrado</p>
          ) : (
            <div className="space-y-3">
              {historico.map(h => (
                <div key={h.id} className="flex gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${getCorTimeline(h.tipo)}`} />
                  <div>
                    <p className="text-xs text-white">{h.descricao || h.tipo}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(h.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Observações */}
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Observações</h4>
          <textarea
            rows={3}
            defaultValue={lead.observacoes || ''}
            placeholder="Adicionar observação..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// Sub-componentes

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-white font-medium">{value}</span>
    </div>
  );
}

function KpiCard({ valor, label, destaque }: { valor: string; label: string; destaque?: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
      <p className={`text-lg font-bold ${destaque ? 'text-cyan-400' : 'text-white'}`}>{valor}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function AcaoButton({
  icon: Icon,
  label,
  cor,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  cor: string;
  onClick: () => void;
}) {
  const cores: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20',
    slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20',
  };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition ${cores[cor] || cores.slate}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// Helpers

function getIniciais(nome: string | null): string {
  if (!nome) return '??';
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function getTemperaturaClasses(temp: string): string {
  const map: Record<string, string> = {
    quente: 'bg-red-500/20 text-red-400',
    morno: 'bg-orange-500/20 text-orange-400',
    frio: 'bg-blue-500/20 text-blue-400',
  };
  return map[temp] || '';
}

function getTemperaturaEmoji(temp: string): string {
  const map: Record<string, string> = { quente: '🔥', morno: '🟡', frio: '❄️' };
  return map[temp] || '';
}

function getCorTimeline(tipo: string): string {
  if (tipo.includes('mila')) return 'bg-cyan-400';
  if (tipo.includes('conversa')) return 'bg-violet-400';
  if (tipo.includes('etapa')) return 'bg-blue-400';
  if (tipo.includes('agend')) return 'bg-emerald-400';
  if (tipo.includes('bastao') || tipo.includes('passagem')) return 'bg-amber-400';
  return 'bg-slate-400';
}

function calcularTempoResposta(dataContato: string, dataCriacao: string): string {
  const diff = new Date(dataCriacao).getTime() - new Date(dataContato).getTime();
  const minutos = Math.floor(diff / (1000 * 60));
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}
