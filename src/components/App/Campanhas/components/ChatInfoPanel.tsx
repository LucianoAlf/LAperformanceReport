/**
 * Painel lateral de informações da conversa — segue o padrão do LeadSidebar do Pré-Atendimento.
 */
import { useState, useEffect } from 'react'
import {
  Phone, Bot, MessageSquare, Tag, Clock, Wrench, ChevronRight, ChevronDown,
  User, ArrowRightLeft, RefreshCw, Power, PowerOff, Send, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface Props {
  conversaId: string
  telefone: string
  onClose: () => void
}

interface ChatInfo {
  nome_contato: string | null
  primeira_msg: string | null
  ultima_msg: string | null
  total_msgs: number
  msgs_inbound: number
  msgs_outbound: number
  agente_nome: string | null
  agente_modelo: string | null
  agente_provider: string | null
  bot_ativo: boolean
  agente_status: string | null
  session_data: Record<string, any> | null
  tools_usadas: string[]
}

export function ChatInfoPanel({ conversaId, telefone, onClose }: Props) {
  const [info, setInfo] = useState<ChatInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchInfo() }, [conversaId, telefone])

  async function fetchInfo() {
    setLoading(true)
    try {
      const { data: conversa } = await supabase
        .from('conversas_campanha')
        .select('nome_contato, created_at, ultima_mensagem_em')
        .eq('id', conversaId).single()

      const { data: allConvs } = await supabase
        .from('conversas_campanha').select('id').eq('telefone', telefone)
      const convIds = (allConvs ?? []).map(c => c.id)

      let totalMsgs = 0, msgsIn = 0, msgsOut = 0
      const toolsSet = new Set<string>()

      if (convIds.length > 0) {
        const { data: msgs } = await supabase
          .from('mensagens_campanha')
          .select('direcao, texto, enviado_por_agente')
          .in('conversa_id', convIds)
        for (const m of (msgs ?? [])) {
          totalMsgs++
          if (m.direcao === 'inbound') msgsIn++; else msgsOut++
          if (m.texto?.includes('[Botões:')) toolsSet.add('send_buttons')
          if (m.texto?.includes('[Lista:')) toolsSet.add('send_list')
        }
      }

      const { data: agenteConv } = await supabase
        .from('agente_conversas')
        .select('agente_id, bot_ativo, status, session_data, total_mensagens')
        .eq('telefone', telefone)
        .order('ultima_mensagem_em', { ascending: false })
        .limit(1).maybeSingle()

      let agenteNome: string | null = null, agenteModelo: string | null = null, agenteProvider: string | null = null
      if (agenteConv?.agente_id) {
        const { data: agente } = await supabase.from('agentes').select('nome, modelo, provider').eq('id', agenteConv.agente_id).single()
        agenteNome = agente?.nome ?? null
        agenteModelo = agente?.modelo ?? null
        agenteProvider = agente?.provider ?? null
      }

      if (agenteConv?.status === 'transferred') toolsSet.add('transfer')

      setInfo({
        nome_contato: conversa?.nome_contato ?? null,
        primeira_msg: conversa?.created_at ?? null,
        ultima_msg: conversa?.ultima_mensagem_em ?? null,
        total_msgs: totalMsgs, msgs_inbound: msgsIn, msgs_outbound: msgsOut,
        agente_nome: agenteNome, agente_modelo: agenteModelo, agente_provider: agenteProvider,
        bot_ativo: agenteConv?.bot_ativo ?? false,
        agente_status: agenteConv?.status ?? null,
        session_data: agenteConv?.session_data ?? null,
        tools_usadas: Array.from(toolsSet),
      })
    } finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="w-[320px] flex-shrink-0 flex items-center justify-center" style={{ background: '#0d1424' }}>
        <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
      </div>
    )
  }

  if (!info) return null

  const sd = info.session_data ?? {}
  const nome = info.nome_contato || sd.lead_name || 'Desconhecido'
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  // Tags extraídas da session_data
  const tags: { label: string; cls: string }[] = []
  if (sd.classificacao) {
    const clsMap: Record<string, string> = { quente: 'bg-red-500/20 text-red-400', morno: 'bg-orange-500/20 text-orange-400', frio: 'bg-blue-500/20 text-blue-400' }
    const emoji: Record<string, string> = { quente: '🔥', morno: '🟡', frio: '❄️' }
    tags.push({ label: `${emoji[sd.classificacao] ?? ''} ${sd.classificacao}`.trim(), cls: clsMap[sd.classificacao] ?? 'bg-slate-700/50 text-slate-300' })
  }
  if (sd.transfer_unit) tags.push({ label: sd.transfer_unit, cls: 'bg-blue-500/20 text-blue-400' })
  if (sd.instrumento) tags.push({ label: sd.instrumento, cls: 'bg-purple-500/20 text-purple-400' })

  const TOOL_CFG: Record<string, { label: string; cls: string }> = {
    transfer: { label: 'Transfer', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    send_buttons: { label: 'Botões', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    send_list: { label: 'Lista', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    think: { label: 'Think', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  }

  return (
    <div className="w-[320px] flex-shrink-0 flex flex-col overflow-hidden rounded-xl border border-slate-700/50" style={{ background: '#0d1424' }}>

      {/* Header — Avatar + Nome + Tags */}
      <div className="p-4 border-b border-slate-700/50 text-center relative">
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition">
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
          {iniciais}
        </div>

        <p className="text-white font-semibold text-sm">{nome}</p>
        <p className="text-xs text-slate-500 mt-0.5">{formatPhone(telefone)}</p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mt-2.5">
            {tags.map((t, i) => (
              <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', t.cls)}>{t.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* DETALHES DO CONTATO */}
        <SidebarCard icon={Phone} title="DETALHES DO CONTATO">
          <div className="space-y-2">
            <DetailRow icon={Phone} label="Telefone" value={formatPhone(telefone)} />
            {info.primeira_msg && <DetailRow icon={Clock} label="Contato" value={formatDate(info.primeira_msg)} />}
            {info.ultima_msg && <DetailRow icon={Send} label="Última msg" value={formatDate(info.ultima_msg)} />}
          </div>
        </SidebarCard>

        {/* AGENTE IA */}
        <SidebarCard icon={Bot} title="AGENTE IA">
          {info.agente_nome ? (
            <div className="space-y-2">
              <InfoRow label="Agente" value={info.agente_nome} />
              <InfoRow label="Modelo" value={`${info.agente_modelo ?? '?'} · ${info.agente_provider ?? '?'}`} />
              <div className="flex items-center gap-2 pt-1">
                <div className={cn('w-2 h-2 rounded-full', info.bot_ativo ? 'bg-emerald-400' : info.agente_status === 'transferred' ? 'bg-red-400' : 'bg-yellow-400')} />
                <span className={cn('text-xs', info.bot_ativo ? 'text-emerald-400' : info.agente_status === 'transferred' ? 'text-red-400' : 'text-yellow-400')}>
                  {info.bot_ativo ? 'Bot ativo' : info.agente_status === 'transferred' ? 'Transferido' : 'Bot pausado'}
                </span>
              </div>
              {info.agente_status === 'transferred' && sd.transfer_unit && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-1">
                  <p className="text-[11px] text-red-300">Transferido para <span className="font-semibold">{sd.transfer_unit}</span></p>
                  {sd.summary && <p className="text-[10px] text-red-300/60 mt-1">{sd.summary}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sem agente vinculado a esta conversa</p>
          )}
        </SidebarCard>

        {/* INFORMAÇÕES (dados coletados pelo agente) */}
        {sd && (sd.instrumento || sd.classificacao || sd.transfer_unit || sd.lead_name) && (
          <SidebarCard icon={Tag} title="INFORMAÇÕES">
            <div className="space-y-1.5">
              {sd.lead_name && <InfoRow label="Nome" value={sd.lead_name} />}
              {sd.instrumento && <InfoRow label="Instrumento" value={sd.instrumento} />}
              {sd.transfer_unit && <InfoRow label="Unidade" value={sd.transfer_unit} />}
              {sd.classificacao && <InfoRow label="Classificação" value={sd.classificacao} />}
            </div>
          </SidebarCard>
        )}

        {/* KPIS DA CONVERSA */}
        <SidebarCard icon={MessageSquare} title="KPIS DA CONVERSA">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard valor={String(info.msgs_inbound)} label="Recebidas" />
            <KpiCard valor={String(info.msgs_outbound)} label="Enviadas" />
            <KpiCard valor={String(info.total_msgs)} label="Total msgs" destaque />
            <KpiCard valor={String(info.tools_usadas.length)} label="Tools usadas" />
          </div>
        </SidebarCard>

        {/* TOOLS USADAS */}
        {info.tools_usadas.length > 0 && (
          <SidebarCard icon={Wrench} title="TOOLS USADAS">
            <div className="flex flex-wrap gap-1.5">
              {info.tools_usadas.map(t => {
                const cfg = TOOL_CFG[t] ?? { label: t, cls: 'bg-slate-700/50 text-slate-300 border-slate-600' }
                return <span key={t} className={cn('text-[10px] px-2.5 py-1 rounded-full border font-medium', cfg.cls)}>{cfg.label}</span>
              })}
            </div>
          </SidebarCard>
        )}

        {/* DADOS DA SESSÃO (colapsável) */}
        {sd && Object.keys(sd).length > 0 && (
          <CollapsibleCard title="DADOS DA SESSÃO">
            <div className="space-y-1.5">
              {Object.entries(sd).filter(([k]) => !['last_ai_response_at'].includes(k)).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[10px] text-slate-500">{k}</span>
                  <span className="text-[10px] text-slate-300 truncate max-w-[140px]">{String(v)}</span>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components (mesmo padrão do LeadSidebar) ────────────────────────────

function SidebarCard({ icon: Icon, title, action, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; action?: React.ReactNode; children: React.ReactNode
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
  )
}

function DetailRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <span className="text-[11px] text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-200 ml-auto text-right truncate">{value}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-white font-medium">{value}</span>
    </div>
  )
}

function KpiCard({ valor, label, destaque }: { valor: string; label: string; destaque?: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
      <p className={`text-lg font-bold ${destaque ? 'text-cyan-400' : 'text-white'}`}>{valor}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}

function CollapsibleCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-3.5">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-full">
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        {title}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(tel: string): string {
  if (tel.length === 13) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 9)}-${tel.slice(9)}`
  if (tel.length === 12) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 8)}-${tel.slice(8)}`
  return tel
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}
