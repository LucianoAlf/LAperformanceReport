import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Tag,
  User,
  GraduationCap,
  Flame,
  Snowflake,
  Thermometer,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import type { LeadCRM, LeadHistorico, PipelineEtapa } from '../types';

interface LeadDrawerProps {
  lead: LeadCRM | null;
  etapas: PipelineEtapa[];
  open: boolean;
  onClose: () => void;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onArquivar?: (lead: LeadCRM) => void;
}

export function LeadDrawer({ lead, etapas, open, onClose, onAgendar, onMoverEtapa, onArquivar }: LeadDrawerProps) {
  const [historico, setHistorico] = useState<LeadHistorico[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Buscar histórico do lead
  const fetchHistorico = useCallback(async () => {
    if (!lead) return;
    setLoadingHistorico(true);
    try {
      const { data } = await supabase
        .from('crm_lead_historico')
        .select('*, colaborador:created_by(nome, apelido)')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setHistorico((data || []) as LeadHistorico[]);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, [lead]);

  useEffect(() => {
    if (open && lead) {
      fetchHistorico();
    }
  }, [open, lead, fetchHistorico]);

  // Copiar texto
  const copiar = async (texto: string, campo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(campo);
      setTimeout(() => setCopiado(null), 1500);
    } catch { /* fallback silencioso */ }
  };

  if (!lead) return null;

  const etapa = etapas.find(e => e.id === lead.etapa_pipeline_id);
  const unidadeCodigo = getUnidadeCodigo(lead.unidade_id);
  const unidadeNome = (lead.unidades as any)?.nome || unidadeCodigo;
  const cursoNome = (lead.cursos as any)?.nome || '';
  const canalNome = (lead.canais_origem as any)?.nome || '';
  const professorNome = (lead.professores as any)?.nome || '';

  // Tags status
  const tags = [
    { label: 'Canal', ok: lead.canal_origem_id !== null, valor: canalNome || '—' },
    { label: 'Curso', ok: lead.curso_interesse_id !== null, valor: cursoNome || '—' },
    { label: 'Faixa', ok: lead.faixa_etaria !== null, valor: lead.faixa_etaria || '—' },
    { label: 'Preço', ok: lead.sabia_preco !== null, valor: lead.sabia_preco === true ? 'Sim' : lead.sabia_preco === false ? 'Não' : '—' },
  ];
  const tagsCompletas = tags.filter(t => t.ok).length;

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed right-0 top-0 h-screen w-[420px] max-w-[90vw] bg-slate-900 border-l border-slate-700 z-50",
          "transform transition-transform duration-300 ease-out overflow-y-auto",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-4 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{lead.nome || 'Sem nome'}</h2>
              <div className="flex items-center gap-2 mt-1">
                {etapa && (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${etapa.cor}20`, color: etapa.cor }}
                  >
                    {etapa.icone} {etapa.nome}
                  </span>
                )}
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                  {unidadeCodigo}
                </span>
                <TemperaturaTag temperatura={lead.temperatura} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Contato */}
          <Secao titulo="Contato">
            <div className="space-y-2">
              {lead.telefone && (
                <LinhaInfo
                  icone={<Phone className="w-3.5 h-3.5" />}
                  label="Telefone"
                  valor={lead.telefone}
                  onCopy={() => copiar(lead.telefone!, 'tel')}
                  copiado={copiado === 'tel'}
                />
              )}
              {lead.whatsapp && lead.whatsapp !== lead.telefone && (
                <LinhaInfo
                  icone={<MessageSquare className="w-3.5 h-3.5" />}
                  label="WhatsApp"
                  valor={lead.whatsapp}
                  onCopy={() => copiar(lead.whatsapp!, 'wpp')}
                  copiado={copiado === 'wpp'}
                />
              )}
              {lead.email && (
                <LinhaInfo
                  icone={<Mail className="w-3.5 h-3.5" />}
                  label="Email"
                  valor={lead.email}
                  onCopy={() => copiar(lead.email!, 'email')}
                  copiado={copiado === 'email'}
                />
              )}
              <LinhaInfo
                icone={<MapPin className="w-3.5 h-3.5" />}
                label="Unidade"
                valor={unidadeNome}
              />
              {lead.idade && (
                <LinhaInfo
                  icone={<User className="w-3.5 h-3.5" />}
                  label="Idade"
                  valor={`${lead.idade} anos`}
                />
              )}
            </div>
          </Secao>

          {/* KPIs Tagueados */}
          <Secao titulo={`KPIs Tagueados (${tagsCompletas}/4)`}>
            <div className="grid grid-cols-2 gap-2">
              {tags.map(tag => (
                <div
                  key={tag.label}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border text-xs",
                    tag.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  )}
                >
                  <span>{tag.ok ? '✅' : '❌'}</span>
                  <div>
                    <div className="font-medium">{tag.label}</div>
                    <div className="text-[10px] opacity-70">{tag.valor}</div>
                  </div>
                </div>
              ))}
            </div>
          </Secao>

          {/* Experimental */}
          <Secao titulo="Experimental / Visita">
            <div className="space-y-2">
              <LinhaInfo
                icone={<Calendar className="w-3.5 h-3.5" />}
                label="Data"
                valor={lead.data_experimental
                  ? new Date(lead.data_experimental + 'T12:00:00').toLocaleDateString('pt-BR')
                  : 'Não agendada'}
              />
              {lead.horario_experimental && (
                <LinhaInfo
                  icone={<Clock className="w-3.5 h-3.5" />}
                  label="Horário"
                  valor={lead.horario_experimental}
                />
              )}
              {professorNome && (
                <LinhaInfo
                  icone={<GraduationCap className="w-3.5 h-3.5" />}
                  label="Professor"
                  valor={professorNome}
                />
              )}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {lead.experimental_agendada && (
                  <Badge cor="violet">📅 Agendada</Badge>
                )}
                {lead.experimental_realizada && (
                  <Badge cor="emerald">✅ Realizada</Badge>
                )}
                {lead.faltou_experimental && (
                  <Badge cor="rose">❌ Faltou</Badge>
                )}
                {lead.converteu && (
                  <Badge cor="emerald">🎓 Matriculado</Badge>
                )}
                {lead.arquivado && (
                  <Badge cor="slate">📦 Arquivado</Badge>
                )}
              </div>
            </div>
          </Secao>

          {/* Contadores */}
          {(lead.qtd_tentativas_sem_resposta > 0 || lead.qtd_desmarcacoes > 0) && (
            <Secao titulo="Contadores">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-amber-400">{lead.qtd_tentativas_sem_resposta}</div>
                  <div className="text-[10px] text-slate-500">Tentativas s/ resposta</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-rose-400">{lead.qtd_desmarcacoes}</div>
                  <div className="text-[10px] text-slate-500">Desmarcações</div>
                </div>
              </div>
              {lead.qtd_desmarcacoes >= 2 && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-[10px] text-amber-300">
                    Taxa de compromisso aplicável: R${lead.unidade_id === '2ec861f6-023f-4d7b-9927-3960ad8c2a92' ? '70' : '100'}
                  </span>
                </div>
              )}
            </Secao>
          )}

          {/* Observações */}
          {lead.observacoes && (
            <Secao titulo="Observações">
              <p className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-800/50 rounded-lg p-3">
                {lead.observacoes}
              </p>
            </Secao>
          )}

          {/* Timeline */}
          <Secao titulo="Timeline">
            {loadingHistorico ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500" />
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Nenhum registro na timeline
              </div>
            ) : (
              <div className="space-y-0 relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-700/50" />
                {historico.map(h => (
                  <TimelineItem key={h.id} item={h} />
                ))}
              </div>
            )}
          </Secao>

          {/* Ações rápidas */}
          <div className="space-y-2 pb-4">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9">
              <MessageSquare className="w-3.5 h-3.5 mr-2" />
              Enviar WhatsApp
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline" size="sm"
                className="border-slate-700 text-slate-400 text-xs h-8"
                onClick={() => { onClose(); onAgendar?.(lead); }}
              >
                <Calendar className="w-3 h-3 mr-1" /> Agendar
              </Button>
              <Button
                variant="outline" size="sm"
                className="border-slate-700 text-slate-400 text-xs h-8"
                onClick={() => { onClose(); onMoverEtapa?.(lead); }}
              >
                <Tag className="w-3 h-3 mr-1" /> Mover Etapa
              </Button>
            </div>
            {!lead.arquivado && (
              <Button
                variant="outline" size="sm"
                className="w-full border-rose-700/50 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs h-8"
                onClick={() => { onClose(); onArquivar?.(lead); }}
              >
                📦 Arquivar Lead
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{titulo}</h3>
      {children}
    </div>
  );
}

function LinhaInfo({ icone, label, valor, onCopy, copiado }: {
  icone: React.ReactNode;
  label: string;
  valor: string;
  onCopy?: () => void;
  copiado?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs group">
      <span className="text-slate-500">{icone}</span>
      <span className="text-slate-400 w-16 flex-shrink-0">{label}</span>
      <span className="text-white flex-1 truncate">{valor}</span>
      {onCopy && (
        <button
          onClick={onCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-800"
        >
          {copiado ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-500" />
          )}
        </button>
      )}
    </div>
  );
}

function Badge({ cor, children }: { cor: string; children: React.ReactNode }) {
  const cores: Record<string, string> = {
    violet: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    slate: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", cores[cor] || cores.slate)}>
      {children}
    </span>
  );
}

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

function TimelineItem({ item }: { item: LeadHistorico }) {
  const iconeMap: Record<string, string> = {
    criacao: '🆕',
    etapa_alterada: '➡️',
    contato: '📞',
    agendamento: '📅',
    experimental: '🏫',
    matricula: '🎓',
    arquivamento: '📦',
    observacao: '📝',
    mila_passagem: '🤖',
  };

  return (
    <div className="flex gap-3 pl-0 py-2 relative">
      <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-[8px] z-10 flex-shrink-0 mt-0.5">
        {iconeMap[item.tipo] || '•'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white">{item.descricao || item.tipo}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {new Date(item.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
          })}
          {item.colaborador && (
            <span className="ml-2">por {(item.colaborador as any)?.apelido || (item.colaborador as any)?.nome}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'CG',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'REC',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'BAR',
  };
  return map[unidadeId] || '?';
}

export default LeadDrawer;
