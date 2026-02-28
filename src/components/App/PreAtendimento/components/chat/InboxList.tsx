import { Search, Monitor, User, Loader2, MessageSquare, Inbox, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversaCRM, FiltroInbox, LeadCRM } from '../../types';

interface InboxListProps {
  conversas: ConversaCRM[];
  loading: boolean;
  conversaSelecionada: ConversaCRM | null;
  filtro: FiltroInbox;
  busca: string;
  totalNaoLidas: number;
  onSelecionarConversa: (conversa: ConversaCRM) => void;
  onFiltroChange: (filtro: FiltroInbox) => void;
  onBuscaChange: (busca: string) => void;
}

const filtros: { id: FiltroInbox; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nao_lidas', label: 'Não lidas' },
  { id: 'mila', label: 'Mila' },
  { id: 'minhas', label: 'Minhas' },
];

function getIniciais(nome: string | null): string {
  if (!nome) return '??';
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
}

function getCorAvatar(nome: string | null): string {
  const cores = [
    'from-pink-400 to-rose-500',
    'from-blue-400 to-cyan-500',
    'from-amber-400 to-orange-500',
    'from-emerald-400 to-teal-500',
    'from-purple-400 to-indigo-500',
    'from-rose-400 to-pink-500',
    'from-sky-400 to-blue-500',
    'from-lime-400 to-green-500',
  ];
  const hash = (nome || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return cores[hash % cores.length];
}

function getTemperaturaTag(temperatura: string | null) {
  if (!temperatura) return null;
  const map: Record<string, { emoji: string; label: string; classes: string }> = {
    quente: { emoji: '🔥', label: 'Quente', classes: 'bg-red-500/20 text-red-400' },
    morno: { emoji: '🟡', label: 'Morno', classes: 'bg-orange-500/20 text-orange-400' },
    frio: { emoji: '❄️', label: 'Frio', classes: 'bg-blue-500/20 text-blue-400' },
  };
  return map[temperatura] || null;
}

function formatarHora(data: string | null): string {
  if (!data) return '';
  const d = new Date(data);
  const agora = new Date();
  const diff = agora.getTime() - d.getTime();
  const horas = diff / (1000 * 60 * 60);

  if (horas < 24) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (horas < 48) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function InboxItem({ conversa, ativa, onClick }: { conversa: ConversaCRM; ativa: boolean; onClick: () => void }) {
  const lead = conversa.lead as LeadCRM | undefined;
  const nome = lead?.nome || 'Lead sem nome';
  const temp = getTemperaturaTag(lead?.temperatura || null);
  const curso = lead?.cursos?.nome || '';
  const unidade = lead?.unidades?.codigo || lead?.unidades?.nome || '';
  const caixaNome = conversa.caixa?.nome || null;
  const isMila = conversa.atribuido_a === 'mila';
  const isAndreza = conversa.atribuido_a === 'andreza';
  const semConversa = !conversa.ultima_mensagem_at;
  const isAluno = !!(lead?.aluno_id || lead?.converteu);

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer px-3 py-3 rounded-xl transition-all duration-200 border',
        ativa
          ? 'bg-violet-500/10 border-violet-500/40'
          : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/60 hover:border-slate-600/40',
        semConversa && 'opacity-60'
      )}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {conversa.foto_perfil_url ? (
            <img
              src={conversa.foto_perfil_url}
              alt={nome}
              className="w-11 h-11 rounded-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <div className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br',
            semConversa ? 'bg-slate-700' : getCorAvatar(nome),
            conversa.foto_perfil_url && 'hidden'
          )}>
            {getIniciais(nome)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Nome + badge tipo + temperatura + hora */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                'font-semibold text-sm truncate',
                ativa ? 'text-white' : conversa.nao_lidas > 0 ? 'text-white' : 'text-slate-300'
              )}>
                {nome}
              </span>
              <span className={cn(
                'text-[8px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                isAluno
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              )}>
                {isAluno ? 'Aluno' : 'Lead'}
              </span>
              {temp && (
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0', temp.classes)}>
                  {temp.emoji} {temp.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
              <span className={cn(
                'text-[10px]',
                conversa.nao_lidas > 0 ? 'text-violet-400 font-medium' : 'text-slate-500'
              )}>
                {formatarHora(conversa.ultima_mensagem_at)}
              </span>
              {conversa.nao_lidas > 0 && (
                <span className="bg-violet-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {conversa.nao_lidas}
                </span>
              )}
            </div>
          </div>

          {/* Preview da mensagem */}
          <div className="flex items-center gap-1 mt-0.5">
            {isMila && (
              <Monitor className="w-3 h-3 text-cyan-400 flex-shrink-0" />
            )}
            <p className={cn(
              'text-xs truncate',
              semConversa ? 'text-slate-600 italic' : conversa.nao_lidas > 0 ? 'text-slate-400' : 'text-slate-500'
            )}>
              {semConversa
                ? 'Nenhuma conversa iniciada'
                : conversa.ultima_mensagem_preview || '...'}
            </p>
          </div>

          {/* Tags como pills coloridas (estilo Musicless) */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {unidade && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium">
                {unidade}
              </span>
            )}
            {curso && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium">
                {curso}
              </span>
            )}
            {isMila && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium">
                Mila
              </span>
            )}
            {isAndreza && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium">
                Andreza
              </span>
            )}
            {caixaNome && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-medium flex items-center gap-0.5">
                <Smartphone className="w-2.5 h-2.5" />
                {caixaNome}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxList({
  conversas,
  loading,
  conversaSelecionada,
  filtro,
  busca,
  totalNaoLidas,
  onSelecionarConversa,
  onFiltroChange,
  onBuscaChange,
}: InboxListProps) {
  return (
    <div className="w-[300px] flex-shrink-0 border-r border-slate-700 flex flex-col" style={{ background: '#0d1424' }}>
      {/* Header: Busca + Filtros */}
      <div className="p-3 border-b border-slate-700/50 space-y-2">
        {/* Busca */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
          />
        </div>
        {/* Filtros rápidos */}
        <div className="flex gap-1">
          {filtros.map(f => (
            <button
              key={f.id}
              onClick={() => onFiltroChange(f.id)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-lg transition',
                filtro === f.id
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-700/50'
              )}
            >
              {f.id === 'mila' && <Monitor className="w-3 h-3 inline mr-1" />}
              {f.id === 'minhas' && <User className="w-3 h-3 inline mr-1" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de conversas */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-3 py-3 border-b border-slate-800/30 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-700/60 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3.5 bg-slate-700/60 rounded w-28" />
                      <div className="h-3 bg-slate-700/40 rounded w-10" />
                    </div>
                    <div className="h-3 bg-slate-700/40 rounded w-40" />
                    <div className="flex gap-2">
                      <div className="h-2.5 bg-slate-700/30 rounded w-16" />
                      <div className="h-2.5 bg-slate-700/30 rounded w-12" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : conversas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-6 gap-3">
            {busca ? (
              <>
                <Search className="w-10 h-10 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-400">Nenhum resultado</p>
                  <p className="text-xs text-slate-500 mt-1">Tente buscar por outro nome ou número</p>
                </div>
              </>
            ) : (
              <>
                <Inbox className="w-10 h-10 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-400">Nenhuma conversa</p>
                  <p className="text-xs text-slate-500 mt-1">As conversas aparecerão aqui quando leads enviarem mensagens</p>
                </div>
              </>
            )}
          </div>
        ) : (
          conversas.map(conversa => (
            <InboxItem
              key={conversa.id}
              conversa={conversa}
              ativa={conversaSelecionada?.id === conversa.id}
              onClick={() => onSelecionarConversa(conversa)}
            />
          ))
        )}
      </div>

      {/* Footer: contagem */}
      <div className="p-3 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">
          {conversas.length} conversa{conversas.length !== 1 ? 's' : ''}
          {totalNaoLidas > 0 && ` · ${totalNaoLidas} não lida${totalNaoLidas !== 1 ? 's' : ''}`}
        </span>
      </div>
    </div>
  );
}
