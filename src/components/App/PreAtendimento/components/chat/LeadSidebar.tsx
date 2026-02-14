import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarDays, ArrowRightLeft, FileText, Archive,
  Loader2, ChevronLeft, ChevronRight, Check, X, Plus, Tag,
  Bot, UserCheck, ArrowRight, GraduationCap, Eye, Music, ChevronDown,
  MessageSquare, Clock, Mail, Phone, AtSign, StickyNote,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Tooltip } from '@/components/ui/Tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConversaCRM, LeadCRM, LeadHistorico, EtiquetaCRM } from '../../types';

interface LeadSidebarProps {
  lead: LeadCRM;
  conversa: ConversaCRM;
  mensagensCount: number;
  colapsada: boolean;
  onToggle: () => void;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onMatricular?: (lead: LeadCRM) => void;
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
  colapsada,
  onToggle,
  onAgendar,
  onMoverEtapa,
  onMatricular,
  onArquivar,
}: LeadSidebarProps) {
  const [historico, setHistorico] = useState<LeadHistorico[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [timelineExpandida, setTimelineExpandida] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeTemp, setNomeTemp] = useState('');
  const nomeInputRef = useRef<HTMLInputElement>(null);

  // Estado local para refletir edições inline imediatamente
  const [overrides, setOverrides] = useState<Record<string, any>>({});

  // Resetar overrides quando muda de lead
  useEffect(() => {
    setOverrides({});
  }, [lead.id]);

  // Valores efetivos (prop + overrides locais)
  const cursoNome = overrides.cursoNome ?? lead.cursos?.nome ?? null;
  const cursoId = overrides.curso_interesse_id ?? lead.curso_interesse_id;
  const canalNome = overrides.canalNome ?? lead.canais_origem?.nome ?? null;
  const canalId = overrides.canal_origem_id ?? lead.canal_origem_id;
  const faixaEtaria = overrides.faixa_etaria ?? lead.faixa_etaria;
  const sabiaPreco = overrides.sabia_preco ?? lead.sabia_preco;

  const fetchHistorico = useCallback(async () => {
    if (!lead?.id) return;
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
      console.error('[LeadSidebar] Erro ao buscar histórico:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    fetchHistorico();
  }, [fetchHistorico]);

  // Buscar cursos e canais para os selects inline
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [canais, setCanais] = useState<{ id: number; nome: string }[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
    ]).then(([cursosRes, canaisRes]) => {
      setCursos((cursosRes.data || []) as { id: number; nome: string }[]);
      setCanais((canaisRes.data || []) as { id: number; nome: string }[]);
    });
  }, []);

  // Etiquetas do lead
  const [etiquetasCatalogo, setEtiquetasCatalogo] = useState<EtiquetaCRM[]>([]);
  const [etiquetasLead, setEtiquetasLead] = useState<number[]>([]);
  const [loadingEtiquetas, setLoadingEtiquetas] = useState(false);
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);

  // Buscar catálogo de etiquetas (uma vez)
  useEffect(() => {
    supabase.from('crm_etiquetas').select('*').eq('ativo', true).order('ordem')
      .then(({ data }) => setEtiquetasCatalogo((data || []) as EtiquetaCRM[]));
  }, []);

  // Buscar etiquetas do lead
  const fetchEtiquetasLead = useCallback(async () => {
    if (!lead?.id) return;
    const { data } = await supabase
      .from('crm_lead_etiquetas')
      .select('etiqueta_id')
      .eq('lead_id', lead.id);
    setEtiquetasLead((data || []).map((d: any) => d.etiqueta_id));
  }, [lead?.id]);

  useEffect(() => { fetchEtiquetasLead(); }, [fetchEtiquetasLead]);

  // Adicionar/remover etiqueta
  const toggleEtiqueta = useCallback(async (etiquetaId: number) => {
    const jaTemEtiqueta = etiquetasLead.includes(etiquetaId);
    // Otimista
    setEtiquetasLead(prev =>
      jaTemEtiqueta ? prev.filter(id => id !== etiquetaId) : [...prev, etiquetaId]
    );
    try {
      if (jaTemEtiqueta) {
        await supabase.from('crm_lead_etiquetas')
          .delete()
          .eq('lead_id', lead.id)
          .eq('etiqueta_id', etiquetaId);
      } else {
        await supabase.from('crm_lead_etiquetas')
          .insert({ lead_id: lead.id, etiqueta_id: etiquetaId, adicionada_por: 'operador' });
      }
    } catch (err) {
      console.error('[LeadSidebar] Erro ao toggle etiqueta:', err);
      // Reverter
      setEtiquetasLead(prev =>
        jaTemEtiqueta ? [...prev, etiquetaId] : prev.filter(id => id !== etiquetaId)
      );
    }
  }, [lead.id, etiquetasLead]);

  // Salvar campo inline no banco + atualizar estado local
  const salvarCampo = useCallback(async (campo: string, valor: any, labelExtra?: Record<string, any>) => {
    setSalvando(campo);
    // Atualização otimista
    setOverrides(prev => ({ ...prev, [campo]: valor, ...labelExtra }));
    try {
      const { error } = await supabase
        .from('leads')
        .update({ [campo]: valor })
        .eq('id', lead.id);
      if (error) throw error;
    } catch (err) {
      console.error(`[LeadSidebar] Erro ao salvar ${campo}:`, err);
      // Reverter override em caso de erro
      setOverrides(prev => {
        const novo = { ...prev };
        delete novo[campo];
        if (labelExtra) Object.keys(labelExtra).forEach(k => delete novo[k]);
        return novo;
      });
    } finally {
      setSalvando(null);
    }
  }, [lead.id]);

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
      className={`flex-shrink-0 border-l border-slate-700 flex flex-col transition-all duration-300 ease-in-out ${
        colapsada ? 'w-12' : 'w-[320px]'
      }`}
      style={{ background: '#0d1424' }}
    >
      {/* Modo colapsado: barra vertical com ícones */}
      {colapsada ? (
        <div className="flex flex-col items-center py-3 gap-3 h-full">
          <Tooltip content="Expandir ficha do lead" side="left">
            <button
              onClick={onToggle}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </Tooltip>

          {/* Avatar mini */}
          <Tooltip content={lead.nome || 'Lead'} side="left">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-[10px]">
            {getIniciais(lead.nome)}
          </div>
          </Tooltip>

          <div className="w-6 border-t border-slate-700/50" />

          {/* Ações rápidas como ícones */}
          <Tooltip content="Agendar Experimental" side="left">
            <button
              onClick={() => { onToggle(); setTimeout(() => onAgendar?.(lead), 100); }}
              className="p-2 rounded-lg text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Mover Etapa" side="left">
            <button
              onClick={() => { onToggle(); setTimeout(() => onMoverEtapa?.(lead), 100); }}
              className="p-2 rounded-lg text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Matricular" side="left">
            <button
              onClick={() => { onToggle(); setTimeout(() => onMatricular?.(lead), 100); }}
              className="p-2 rounded-lg text-violet-400/60 hover:text-violet-400 hover:bg-violet-500/10 transition"
            >
              <FileText className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Arquivar" side="left">
            <button
              onClick={() => { onToggle(); setTimeout(() => onArquivar?.(lead), 100); }}
              className="p-2 rounded-lg text-slate-400/60 hover:text-slate-400 hover:bg-slate-500/10 transition"
            >
              <Archive className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      ) : (
      /* Modo expandido: conteúdo completo */
      <div className="flex flex-col overflow-y-auto h-full">

      {/* Header da ficha */}
      <div className="p-4 border-b border-slate-700/50 text-center relative">
        <Tooltip content="Recolher ficha" side="left">
          <button
            onClick={onToggle}
            className="absolute top-3 left-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </Tooltip>
        {conversa.foto_perfil_url ? (
          <img
            src={conversa.foto_perfil_url}
            alt={lead.nome || 'Lead'}
            className="w-16 h-16 rounded-full object-cover mx-auto mb-3 ring-2 ring-violet-500/30"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
          />
        ) : null}
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 ${conversa.foto_perfil_url ? 'hidden' : ''}`}>
          {getIniciais(lead.nome)}
        </div>
        {editandoNome ? (
          <input
            ref={nomeInputRef}
            type="text"
            value={nomeTemp}
            onChange={(e) => setNomeTemp(e.target.value)}
            onBlur={() => {
              if (nomeTemp.trim() && nomeTemp.trim() !== lead.nome) {
                salvarCampo('nome', nomeTemp.trim(), { nomeOverride: nomeTemp.trim() });
              }
              setEditandoNome(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Escape') {
                setEditandoNome(false);
              }
            }}
            autoFocus
            className="font-bold text-white text-base bg-transparent border-b border-violet-500 outline-none text-center w-full px-2"
          />
        ) : (
          <h3
            className="font-bold text-white text-base cursor-pointer hover:text-violet-300 transition-colors"
            onClick={() => { setNomeTemp(overrides.nomeOverride ?? (lead.nome || '')); setEditandoNome(true); }}
          >
            {overrides.nomeOverride ?? (lead.nome || 'Lead')}
          </h3>
        )}
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

      {/* Cards semânticos */}
      <div className="p-3 space-y-3">

        {/* Card 1: DETALHES DO CONTATO */}
        <SidebarCard icon={Phone} title="DETALHES DO CONTATO">
          <div className="space-y-2.5">
            {lead.email && (
              <DetailRow icon={Mail} label="Email" value={lead.email} />
            )}
            <DetailRow icon={Phone} label="Telefone" value={lead.telefone || lead.whatsapp || '-'} />
            <DetailRow icon={CalendarDays} label="Contato" value={formatarData(lead.data_contato)} />
            <div className="flex items-center gap-2.5">
              <AtSign className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <EditableSelect
                  label="Canal"
                  valor={canalNome || '-'}
                  opcoes={canais.map(c => ({ value: String(c.id), label: c.nome }))}
                  valorAtual={canalId ? String(canalId) : ''}
                  salvando={salvando === 'canal_origem_id'}
                  onSalvar={(val) => {
                    const nome = canais.find(c => String(c.id) === val)?.nome || null;
                    salvarCampo('canal_origem_id', val ? Number(val) : null, { canalNome: nome });
                  }}
                />
              </div>
            </div>
          </div>
        </SidebarCard>

        {/* Card 2: INFORMAÇÕES (editáveis) */}
        <SidebarCard icon={FileText} title="INFORMAÇÕES">
          <div className="space-y-2">
            <EditableSelect
              label="Curso"
              valor={cursoNome || '-'}
              opcoes={cursos.map(c => ({ value: String(c.id), label: c.nome }))}
              valorAtual={cursoId ? String(cursoId) : ''}
              salvando={salvando === 'curso_interesse_id'}
              onSalvar={(val) => {
                const nome = cursos.find(c => String(c.id) === val)?.nome || null;
                salvarCampo('curso_interesse_id', val ? Number(val) : null, { cursoNome: nome });
              }}
            />
            <InfoRow label="Unidade" value={lead.unidades?.nome || '-'} />
            <EditableSelect
              label="Faixa Etária"
              valor={faixaEtaria || '-'}
              opcoes={[
                { value: 'LAMK', label: 'LAMK (Kids)' },
                { value: 'EMLA', label: 'EMLA (Adulto)' },
              ]}
              valorAtual={faixaEtaria || ''}
              salvando={salvando === 'faixa_etaria'}
              onSalvar={(val) => salvarCampo('faixa_etaria', val || null)}
            />
            <EditableSelect
              label="Sabe o preço?"
              valor={sabiaPreco === true ? 'Sim' : sabiaPreco === false ? 'Não' : '-'}
              opcoes={[
                { value: 'true', label: 'Sim' },
                { value: 'false', label: 'Não' },
              ]}
              valorAtual={sabiaPreco === true ? 'true' : sabiaPreco === false ? 'false' : ''}
              salvando={salvando === 'sabia_preco'}
              onSalvar={(val) => salvarCampo('sabia_preco', val === 'true' ? true : val === 'false' ? false : null)}
            />
          </div>
        </SidebarCard>

        {/* Card 3: ETIQUETAS */}
        <SidebarCard
          icon={Tag}
          title="ETIQUETAS"
          action={
            <button
              onClick={() => setMostrarEtiquetas(!mostrarEtiquetas)}
              className="p-1 rounded-md text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition"
              title="Gerenciar etiquetas"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          }
        >
          {/* Pills das etiquetas ativas */}
          <div className="flex flex-wrap gap-1.5">
            {etiquetasLead.length === 0 && !mostrarEtiquetas && (
              <span className="text-[10px] text-slate-500 italic">Nenhuma etiqueta</span>
            )}
            {etiquetasCatalogo
              .filter(e => etiquetasLead.includes(e.id))
              .map(e => (
                <button
                  key={e.id}
                  onClick={() => toggleEtiqueta(e.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all hover:opacity-80 hover:scale-105"
                  style={{ backgroundColor: e.cor + '25', color: e.cor, border: `1px solid ${e.cor}40` }}
                  title={`Remover "${e.nome}"`}
                >
                  {e.icone && <span>{e.icone}</span>}
                  {e.nome}
                  <X className="w-2.5 h-2.5 opacity-60" />
                </button>
              ))}
          </div>

          {/* Painel para adicionar etiquetas */}
          {mostrarEtiquetas && (
            <div className="mt-2 p-2 rounded-xl bg-slate-900/60 border border-slate-700/40 space-y-1">
              {etiquetasCatalogo.map(e => {
                const ativa = etiquetasLead.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggleEtiqueta(e.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                      ativa
                        ? 'bg-slate-700/50 text-white'
                        : 'text-slate-400 hover:bg-slate-700/30 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0"
                      style={{ backgroundColor: e.cor + '30', color: e.cor }}
                    >
                      {ativa ? <Check className="w-3 h-3" /> : (e.icone || '·')}
                    </span>
                    <span className="flex-1 text-left">{e.nome}</span>
                    {e.descricao && (
                      <span className="text-[9px] text-slate-500 truncate max-w-[80px]">{e.descricao}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </SidebarCard>

        {/* Card 4: KPIs DA CONVERSA */}
        <SidebarCard icon={MessageSquare} title="KPIs DA CONVERSA">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard valor={tempoResposta} label="Tempo resposta" />
            <KpiCard valor={String(mensagensCount)} label="Msgs trocadas" />
            <KpiCard valor={String(diasPipeline)} label="Dias no pipeline" />
            <KpiCard valor={String(lead.qtd_mensagens_mila || 0)} label="Msgs Mila" destaque />
          </div>
        </SidebarCard>

        {/* Card 5: AÇÕES */}
        <SidebarCard icon={ArrowRightLeft} title="AÇÕES">
          <div className="space-y-1.5">
            <AcaoButton
              icon={CalendarDays}
              label="Agendar Experimental / Visita"
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
              onClick={() => onMatricular?.(lead)}
            />
            <AcaoButton
              icon={Archive}
              label="Arquivar"
              cor="slate"
              onClick={() => onArquivar?.(lead)}
            />
          </div>
        </SidebarCard>

        {/* Card 6: TIMELINE */}
        <SidebarCard
          icon={Clock}
          title="ATIVIDADES RECENTES"
          action={
            historico.length > 0 ? (
              <span className="text-[10px] text-slate-500">{historico.length}</span>
            ) : null
          }
        >
          {loadingHistorico ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum evento registrado</p>
          ) : (
            <div className="relative">
              {/* Linha vertical */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-700/60" />

              <div className="space-y-0">
                {(timelineExpandida ? historico : historico.slice(0, 5)).map((h) => {
                  const { icon: IconComp, cor, bgCor } = getTimelineIconConfig(h.tipo);
                  return (
                    <div key={h.id} className="flex gap-2.5 py-1.5 group relative">
                      {/* Ícone circular */}
                      <div className={`relative z-10 w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ${bgCor}`}>
                        <IconComp className={`w-2.5 h-2.5 ${cor}`} />
                      </div>
                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-200 leading-tight">{h.descricao || h.tipo}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {formatarDataRelativa(h.created_at)}
                          {h.colaborador && (
                            <span className="text-slate-600"> · {(h.colaborador as any).apelido || (h.colaborador as any).nome}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão ver mais/menos */}
              {historico.length > 5 && (
                <button
                  onClick={() => setTimelineExpandida(!timelineExpandida)}
                  className="flex items-center gap-1 mt-2 mx-auto text-[10px] text-violet-400 hover:text-violet-300 transition-colors font-medium"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${timelineExpandida ? 'rotate-180' : ''}`} />
                  {timelineExpandida ? 'Ver menos' : `VER TUDO (+${historico.length - 5})`}
                </button>
              )}
            </div>
          )}
        </SidebarCard>

        {/* Card 7: NOTAS RÁPIDAS */}
        <SidebarCard icon={StickyNote} title="NOTAS RÁPIDAS">
          {lead.observacoes ? (
            <p className="text-xs text-slate-300 whitespace-pre-wrap">{lead.observacoes}</p>
          ) : (
            <p className="text-[11px] text-slate-500 italic">Nenhuma nota registrada para este contato.</p>
          )}
          <button
            onClick={() => {
              // Focar no textarea ao clicar
              const el = document.getElementById(`nota-lead-${lead.id}`);
              if (el) el.focus();
            }}
            className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400 hover:text-violet-400 transition-colors font-medium border border-slate-700/50 rounded-lg px-3 py-1.5 w-full justify-center hover:border-violet-500/30"
          >
            <Plus className="w-3 h-3" />
            ADICIONAR NOTA
          </button>
          <textarea
            id={`nota-lead-${lead.id}`}
            rows={2}
            defaultValue={lead.observacoes || ''}
            placeholder="Escreva uma nota..."
            className="w-full mt-2 bg-slate-900/60 border border-slate-700/40 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
          />
        </SidebarCard>

      </div>

      </div>
      )}
    </div>
  );
}

// Sub-componentes

function SidebarCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <span className="text-[11px] text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-200 ml-auto text-right truncate">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-white font-medium">{value}</span>
    </div>
  );
}

function EditableSelect({
  label,
  valor,
  opcoes,
  valorAtual,
  salvando,
  onSalvar,
}: {
  label: string;
  valor: string;
  opcoes: { value: string; label: string }[];
  valorAtual: string;
  salvando: boolean;
  onSalvar: (valor: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const selecionouRef = useRef(false);

  if (editando) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
        <Select
          defaultValue={valorAtual || 'nenhum'}
          onValueChange={(v) => {
            selecionouRef.current = true;
            onSalvar(v === 'nenhum' ? '' : v);
            setEditando(false);
          }}
          open
          onOpenChange={(open) => {
            if (!open) {
              // Delay para garantir que onValueChange dispare primeiro
              setTimeout(() => {
                if (!selecionouRef.current) {
                  setEditando(false);
                }
                selecionouRef.current = false;
              }, 100);
            }
          }}
        >
          <SelectTrigger className="h-7 text-[11px] bg-slate-800 border-violet-500 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Nenhum</SelectItem>
            {opcoes.map(op => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between group">
      <span className="text-xs text-slate-500">{label}</span>
      <button
        onClick={() => { selecionouRef.current = false; setEditando(true); }}
        disabled={salvando}
        className="flex items-center gap-1 text-xs text-white font-medium hover:text-violet-400 transition"
      >
        {salvando ? (
          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
        ) : (
          <span>{valor}</span>
        )}
      </button>
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

function getTimelineIconConfig(tipo: string): { icon: any; cor: string; bgCor: string } {
  if (tipo.includes('mila_pausada') || tipo.includes('assumiu'))
    return { icon: UserCheck, cor: 'text-amber-400', bgCor: 'bg-amber-500/20' };
  if (tipo.includes('mila_retomada'))
    return { icon: Bot, cor: 'text-cyan-400', bgCor: 'bg-cyan-500/20' };
  if (tipo.includes('etapa'))
    return { icon: ArrowRight, cor: 'text-blue-400', bgCor: 'bg-blue-500/20' };
  if (tipo.includes('agend'))
    return { icon: CalendarDays, cor: 'text-emerald-400', bgCor: 'bg-emerald-500/20' };
  if (tipo.includes('matricula'))
    return { icon: GraduationCap, cor: 'text-green-400', bgCor: 'bg-green-500/20' };
  if (tipo.includes('visita'))
    return { icon: Eye, cor: 'text-teal-400', bgCor: 'bg-teal-500/20' };
  if (tipo.includes('mensagem') || tipo.includes('conversa'))
    return { icon: MessageSquare, cor: 'text-violet-400', bgCor: 'bg-violet-500/20' };
  if (tipo.includes('arquiv'))
    return { icon: Archive, cor: 'text-red-400', bgCor: 'bg-red-500/20' };
  if (tipo.includes('tag') || tipo.includes('etiqueta'))
    return { icon: Tag, cor: 'text-pink-400', bgCor: 'bg-pink-500/20' };
  return { icon: Clock, cor: 'text-slate-400', bgCor: 'bg-slate-500/20' };
}

function formatarDataRelativa(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHoras < 24) return `há ${diffHoras}h`;
  if (diffDias === 1) return 'ontem';
  if (diffDias < 7) return `há ${diffDias} dias`;

  return data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function calcularTempoResposta(dataContato: string, dataCriacao: string): string {
  const diff = new Date(dataCriacao).getTime() - new Date(dataContato).getTime();
  const minutos = Math.floor(diff / (1000 * 60));
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}
