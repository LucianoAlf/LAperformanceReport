import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Megaphone, LayoutDashboard, MessageSquare, Bot, FileText, BarChart2, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardTab } from './tabs/DashboardTab'
import { CampanhasTab } from './tabs/CampanhasTab'
import { ConversasTab } from './tabs/ConversasTab'
import { AgentesTab } from './tabs/AgentesTab'
import { TemplatesTab } from './tabs/TemplatesTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { ConfigTab } from './tabs/ConfigTab'
import { useCampanhasConfig } from './hooks/useCampanhasConfig'

type Aba = 'dashboard' | 'campanhas' | 'conversas' | 'agentes' | 'templates' | 'analytics' | 'config'

const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'conversas', label: 'Conversas', icon: MessageSquare },
  { id: 'agentes', label: 'Agentes IA', icon: Bot },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'config', label: 'Config', icon: Settings },
]

export function CampanhasPage() {
  const { unidadeSelecionada } = useOutletContext<{ unidadeSelecionada: string | null }>()
  const { unidadeId: authUnidadeId, isAdmin } = useAuth()
  // Admin usa seletor global, user normal usa auth
  const unidadeId = isAdmin ? unidadeSelecionada : authUnidadeId

  const [abaAtiva, setAbaAtiva] = useState<Aba>('dashboard')
  const { config: campanhasConfig } = useCampanhasConfig()

  // Notificação de novas mensagens inbound (respeitando toggle)
  useEffect(() => {
    const channel = supabase
      .channel('campanhas_toast_notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens_campanha',
        filter: 'direcao=eq.inbound',
      }, (payload) => {
        if (campanhasConfig?.notificacoes_ativas === false) return
        const msg = payload.new as any
        if (msg.privada) return
        toast.info(`Nova mensagem de ${msg.telefone?.slice(-4) ?? '???'}`, {
          description: msg.texto?.slice(0, 60) || `[${msg.tipo}]`,
          action: { label: 'Ver', onClick: () => setAbaAtiva('conversas') },
          duration: 5000,
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [campanhasConfig?.notificacoes_ativas])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <Megaphone className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas WhatsApp</h1>
          <p className="text-sm text-gray-400">Gerencie campanhas, agentes IA e conversas via Meta Cloud API</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 overflow-x-auto">
        {abas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAbaAtiva(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              abaAtiva === id
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-gray-400 hover:text-white hover:bg-slate-700/50',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {abaAtiva === 'dashboard' && <DashboardTab unidadeId={unidadeId} />}
        {abaAtiva === 'campanhas' && <CampanhasTab unidadeId={unidadeId} />}
        {abaAtiva === 'conversas' && <ConversasTab unidadeId={unidadeId} />}
        {abaAtiva === 'agentes' && <AgentesTab unidadeId={unidadeId} />}
        {abaAtiva === 'templates' && <TemplatesTab unidadeId={unidadeId} />}
        {abaAtiva === 'analytics' && <AnalyticsTab unidadeId={unidadeId} />}
        {abaAtiva === 'config' && <ConfigTab unidadeId={unidadeId} />}
      </div>
    </div>
  )
}
