import { useState } from 'react';
import { Search, Loader2, Inbox, Plus, GraduationCap, Phone, Building2, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminConversa, AlunoInbox, FiltroAdminInbox } from './types';

interface AdminInboxListProps {
  conversas: AdminConversa[];
  loading: boolean;
  conversaSelecionada: AdminConversa | null;
  filtro: FiltroAdminInbox;
  busca: string;
  totalNaoLidas: number;
  /** Inbox unificada (todas as unidades): exibe badge da unidade em cada conversa */
  mostrarUnidade?: boolean;
  /** Últimos 11 dígitos do número -> alunos que o compartilham (irmãos, mesmo responsável) */
  irmaosPorNumero?: Record<string, { id: number; nome: string }[]>;
  onSelecionarConversa: (conversa: AdminConversa) => void;
  onFiltroChange: (filtro: FiltroAdminInbox) => void;
  onBuscaChange: (busca: string) => void;
  onNovaConversa: () => void;
}

const filtros: { id: FiltroAdminInbox; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nao_lidas', label: 'Não lidas' },
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

function getStatusPagamentoTag(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; classes: string }> = {
    em_dia: { label: 'Em dia', classes: 'bg-emerald-500/20 text-emerald-400' },
    atrasado: { label: 'Atrasado', classes: 'bg-red-500/20 text-red-400' },
    inadimplente: { label: 'Inadimplente', classes: 'bg-red-500/20 text-red-400' },
  };
  return map[status] || null;
}

function getStatusAlunoTag(status: string | null | undefined) {
  if (!status || status === 'ativo') return null;
  const map: Record<string, { label: string; classes: string }> = {
    aviso_previo: { label: 'Aviso Previo', classes: 'bg-orange-500/20 text-orange-400' },
    trancado: { label: 'Trancado', classes: 'bg-yellow-500/20 text-yellow-400' },
    inativo: { label: 'Inativo', classes: 'bg-slate-500/20 text-slate-400' },
  };
  return map[status] || null;
}

function AvatarContato({ foto, nome, isExterno, semConversa }: { foto: string | null; nome: string; isExterno: boolean; semConversa: boolean }) {
  const [imgError, setImgError] = useState(false);

  // Renderiza OU a foto OU o fallback — nunca os dois, garantindo 44px e alinhamento consistente.
  if (foto && !imgError) {
    return (
      <img
        src={foto}
        alt={nome}
        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={cn(
      'w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0',
      semConversa
        ? 'bg-slate-700'
        : isExterno
          ? 'bg-gradient-to-br from-slate-400 to-slate-500'
          : cn('bg-gradient-to-br', getCorAvatar(nome))
    )}>
      {isExterno ? <Phone className="w-4 h-4" /> : getIniciais(nome)}
    </div>
  );
}

function getResponsavelDivergente(nome: string, responsavelNome: string | null | undefined): string | null {
  if (!responsavelNome) return null;
  const normalizar = (s: string) => s.trim().toLowerCase();
  return normalizar(responsavelNome) !== normalizar(nome) ? responsavelNome : null;
}

// "Hugo" | "Hugo e Vitor" | "Hugo, Vitor e Priscila"
function formatarListaComE(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] || '';
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function formatTelefoneBR(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function AdminInboxItem({ conversa, ativa, mostrarUnidade, irmaosPorNumero, onClick }: { conversa: AdminConversa; ativa: boolean; mostrarUnidade?: boolean; irmaosPorNumero?: Record<string, { id: number; nome: string }[]>; onClick: () => void }) {
  const aluno = conversa.aluno as AlunoInbox | undefined;
  const isExterno = conversa.aluno_id === null;
  const unidadeCodigo = (conversa as any).unidade?.codigo || aluno?.unidades?.codigo || null;
  const nome = isExterno
    ? (conversa.nome_externo || conversa.telefone_externo || 'Contato desconhecido')
    : (aluno?.nome || 'Aluno sem nome');
  const curso = aluno?.cursos?.nome || '';
  const professor = aluno?.professores?.nome || '';
  const statusPag = getStatusPagamentoTag(aluno?.status_pagamento || null);
  const statusAluno = getStatusAlunoTag(aluno?.status);
  const semConversa = !conversa.ultima_mensagem_at;
  const responsavel = !isExterno && aluno ? getResponsavelDivergente(nome, aluno.responsavel_nome) : null;
  const jidDigits = (conversa.whatsapp_jid || '').replace(/\D/g, '').slice(-11);
  const outrosAlunosMesmoNumero = (irmaosPorNumero?.[jidDigits] || []).filter(a => a.id !== conversa.aluno_id);
  const nomesCompletosMesmoNumero = outrosAlunosMesmoNumero.length > 0
    ? [nome, ...outrosAlunosMesmoNumero.map(a => a.nome)]
    : [];

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
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <AvatarContato
          foto={conversa.foto_perfil_url}
          nome={nome}
          isExterno={isExterno}
          semConversa={semConversa}
        />

        <div className="flex-1 min-w-0">
          {/* Linha 1: nome + hora (estilo WhatsApp) */}
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'font-semibold text-sm truncate',
              ativa ? 'text-white' : conversa.nao_lidas > 0 ? 'text-white' : 'text-slate-300'
            )}>
              {nome}
            </span>
            <span className={cn(
              'text-[10px] flex-shrink-0',
              conversa.nao_lidas > 0 ? 'text-violet-400 font-medium' : 'text-slate-500'
            )}>
              {formatarHora(conversa.ultima_mensagem_at)}
            </span>
          </div>

          {/* Linha 2: preview + badge nao lidas */}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={cn(
              'text-xs truncate',
              semConversa ? 'text-slate-600 italic' : conversa.nao_lidas > 0 ? 'text-slate-400' : 'text-slate-500'
            )}>
              {semConversa
                ? 'Nenhuma mensagem ainda'
                : conversa.ultima_mensagem_preview || '...'}
            </p>
            {conversa.nao_lidas > 0 && (
              <span className="bg-violet-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                {conversa.nao_lidas}
              </span>
            )}
          </div>

          {/* Linha 3: tags de contexto */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {mostrarUnidade && unidadeCodigo && (
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase bg-violet-500/20 text-violet-300 flex items-center gap-0.5">
                <Building2 className="w-2.5 h-2.5" />
                {unidadeCodigo}
              </span>
            )}
            {mostrarUnidade && isExterno && !unidadeCodigo && (
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-500/20 text-amber-300">
                Sem unidade
              </span>
            )}
            {isExterno && (
              <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-600/30 text-slate-400">
                Externo
              </span>
            )}
            {statusAluno && (
              <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold uppercase', statusAluno.classes)}>
                {statusAluno.label}
              </span>
            )}
            {statusPag && (
              <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold uppercase', statusPag.classes)}>
                {statusPag.label}
              </span>
            )}
            {isExterno && conversa.telefone_externo && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" />
                {formatTelefoneBR(conversa.telefone_externo)}
              </span>
            )}
            {!isExterno && conversa.whatsapp_jid && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" />
                {formatTelefoneBR(conversa.whatsapp_jid)}
              </span>
            )}
            {curso && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium flex items-center gap-0.5">
                <GraduationCap className="w-2.5 h-2.5" />
                {curso}
              </span>
            )}
            {professor && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium">
                {professor}
              </span>
            )}
            {responsavel && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium flex items-center gap-0.5 max-w-[168px] truncate"
                title={`Responsável: ${responsavel}`}
              >
                <User className="w-2.5 h-2.5 flex-shrink-0" />
                {responsavel}
              </span>
            )}
            {nomesCompletosMesmoNumero.length > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium flex items-center gap-0.5 max-w-[200px] truncate"
                title={`Número compartilhado — alunos: ${nomesCompletosMesmoNumero.join(', ')}`}
              >
                <Users className="w-2.5 h-2.5 flex-shrink-0" />
                Alunos: {formatarListaComE(nomesCompletosMesmoNumero.map(n => n.split(' ')[0]))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminInboxList({
  conversas,
  loading,
  conversaSelecionada,
  filtro,
  busca,
  totalNaoLidas,
  mostrarUnidade,
  irmaosPorNumero,
  onSelecionarConversa,
  onFiltroChange,
  onBuscaChange,
  onNovaConversa,
}: AdminInboxListProps) {
  return (
    <div className="w-[300px] flex-shrink-0 border-r border-slate-700 flex flex-col" style={{ background: '#0d1424' }}>
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Conversas</h3>
          <button
            onClick={onNovaConversa}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition"
          >
            <Plus className="w-3 h-3" />
            Nova
          </button>
        </div>
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
        {/* Filtros */}
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
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
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
                  <p className="text-xs text-slate-500 mt-1">Tente buscar por outro nome</p>
                </div>
              </>
            ) : (
              <>
                <Inbox className="w-10 h-10 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-400">Nenhuma conversa</p>
                  <p className="text-xs text-slate-500 mt-1">Clique em "Nova" para iniciar uma conversa com um aluno</p>
                </div>
              </>
            )}
          </div>
        ) : (
          conversas.map(conversa => (
            <AdminInboxItem
              key={conversa.id}
              conversa={conversa}
              ativa={conversaSelecionada?.id === conversa.id}
              mostrarUnidade={mostrarUnidade}
              irmaosPorNumero={irmaosPorNumero}
              onClick={() => onSelecionarConversa(conversa)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">
          {conversas.length} conversa{conversas.length !== 1 ? 's' : ''}
          {totalNaoLidas > 0 && ` · ${totalNaoLidas} não lida${totalNaoLidas !== 1 ? 's' : ''}`}
        </span>
      </div>
    </div>
  );
}
