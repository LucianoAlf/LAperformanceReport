import { useState, useEffect, useCallback } from 'react';
import { Search, X, Loader2, User, GraduationCap, Phone, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { AlunoInbox } from './types';

// Tipo do contato selecionado (aluno cadastrado ou numero externo)
export interface ContatoInbox {
  tipo: 'aluno' | 'externo';
  aluno?: AlunoInbox;
  telefone_externo?: string;
  nome_externo?: string;
}

interface NovaConversaModalProps {
  aberto: boolean;
  onClose: () => void;
  onIniciarConversa: (contato: ContatoInbox) => void;
  unidadeId: string;
}

type ModoModal = 'aluno' | 'numero';

function getStatusAlunoTag(status: string | null | undefined) {
  if (!status) return null;
  const map: Record<string, { label: string; classes: string }> = {
    ativo: { label: 'Ativo', classes: 'bg-emerald-500/20 text-emerald-400' },
    aviso_previo: { label: 'Aviso Previo', classes: 'bg-orange-500/20 text-orange-400' },
    trancado: { label: 'Trancado', classes: 'bg-yellow-500/20 text-yellow-400' },
    inativo: { label: 'Inativo', classes: 'bg-slate-500/20 text-slate-400' },
  };
  return map[status] || null;
}

function formatPhoneForStorage(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function NovaConversaModal({ aberto, onClose, onIniciarConversa, unidadeId }: NovaConversaModalProps) {
  const [modo, setModo] = useState<ModoModal>('aluno');
  const [busca, setBusca] = useState('');
  const [alunos, setAlunos] = useState<AlunoInbox[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);

  // Modo numero
  const [telefone, setTelefone] = useState('');
  const [nomeExterno, setNomeExterno] = useState('');
  const [alunoEncontrado, setAlunoEncontrado] = useState<AlunoInbox | null>(null);
  const [buscandoTelefone, setBuscandoTelefone] = useState(false);

  const fetchAlunos = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select(`
          id, nome, telefone, whatsapp, email,
          curso_id, professor_atual_id, unidade_id,
          status, classificacao, status_pagamento,
          cursos:curso_id(nome),
          professores:professor_atual_id(nome),
          unidades:unidade_id(nome, codigo)
        `)
        .eq('unidade_id', unidadeId)
        .order('nome');

      if (error) throw error;
      setAlunos((data || []) as AlunoInbox[]);
    } catch (err) {
      console.error('[NovaConversaModal] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    if (aberto) {
      fetchAlunos();
      setBusca('');
      setTelefone('');
      setNomeExterno('');
      setAlunoEncontrado(null);
      setModo('aluno');
    }
  }, [aberto, fetchAlunos]);

  // Auto-buscar aluno pelo telefone digitado (debounced)
  useEffect(() => {
    if (modo !== 'numero') return;
    const digits = telefone.replace(/\D/g, '');
    if (digits.length < 10) {
      setAlunoEncontrado(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setBuscandoTelefone(true);
      try {
        const suffix = digits.slice(-11);
        const { data } = await supabase
          .from('alunos')
          .select(`
            id, nome, telefone, whatsapp, email,
            curso_id, professor_atual_id, unidade_id,
            status, classificacao, status_pagamento,
            cursos:curso_id(nome),
            professores:professor_atual_id(nome),
            unidades:unidade_id(nome, codigo)
          `)
          .eq('unidade_id', unidadeId)
          .or(`telefone.like.%${suffix},whatsapp.like.%${suffix}`)
          .limit(1)
          .maybeSingle();

        setAlunoEncontrado(data as AlunoInbox | null);
      } catch {
        setAlunoEncontrado(null);
      } finally {
        setBuscandoTelefone(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [telefone, modo, unidadeId]);

  const alunosFiltrados = busca.trim()
    ? alunos.filter(a => {
        const termo = busca.toLowerCase();
        return (a.nome || '').toLowerCase().includes(termo) ||
               (a.telefone || '').includes(termo) ||
               (a.whatsapp || '').includes(termo);
      })
    : alunos;

  const handleSelecionarAluno = useCallback(async (aluno: AlunoInbox) => {
    if (criando) return;

    if (!aluno.telefone && !aluno.whatsapp) {
      alert('Este aluno nao tem telefone cadastrado.');
      return;
    }

    setCriando(true);
    try {
      const { data: existente } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('aluno_id', aluno.id)
        .eq('unidade_id', unidadeId)
        .maybeSingle();

      if (existente) {
        await supabase
          .from('admin_conversas')
          .update({ status: 'aberta' })
          .eq('id', existente.id);
      } else {
        const { data: caixa } = await supabase
          .from('whatsapp_caixas')
          .select('id')
          .eq('unidade_id', unidadeId)
          .eq('funcao', 'administrativo')
          .eq('ativo', true)
          .maybeSingle();

        await supabase
          .from('admin_conversas')
          .insert({
            aluno_id: aluno.id,
            unidade_id: unidadeId,
            caixa_id: caixa?.id || null,
            status: 'aberta',
          });
      }

      onIniciarConversa({ tipo: 'aluno', aluno });
      onClose();
    } catch (err) {
      console.error('[NovaConversaModal] Erro ao criar conversa:', err);
    } finally {
      setCriando(false);
    }
  }, [unidadeId, criando, onIniciarConversa, onClose]);

  const handleSelecionarExterno = useCallback(async () => {
    const digits = telefone.replace(/\D/g, '');
    if (digits.length < 10 || criando) return;

    // Se encontrou aluno, redirecionar para selecao de aluno
    if (alunoEncontrado) {
      await handleSelecionarAluno(alunoEncontrado);
      return;
    }

    setCriando(true);
    try {
      const phoneFormatted = formatPhoneForStorage(telefone);

      // Verificar se conversa externa ja existe
      const { data: existente } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('telefone_externo', phoneFormatted)
        .eq('unidade_id', unidadeId)
        .is('aluno_id', null)
        .maybeSingle();

      if (existente) {
        await supabase
          .from('admin_conversas')
          .update({ status: 'aberta', nome_externo: nomeExterno || null })
          .eq('id', existente.id);
      } else {
        const { data: caixa } = await supabase
          .from('whatsapp_caixas')
          .select('id')
          .eq('unidade_id', unidadeId)
          .eq('funcao', 'administrativo')
          .eq('ativo', true)
          .maybeSingle();

        await supabase
          .from('admin_conversas')
          .insert({
            aluno_id: null,
            telefone_externo: phoneFormatted,
            nome_externo: nomeExterno || null,
            unidade_id: unidadeId,
            caixa_id: caixa?.id || null,
            status: 'aberta',
          });
      }

      onIniciarConversa({
        tipo: 'externo',
        telefone_externo: phoneFormatted,
        nome_externo: nomeExterno || undefined,
      });
      onClose();
    } catch (err) {
      console.error('[NovaConversaModal] Erro ao criar conversa externa:', err);
    } finally {
      setCriando(false);
    }
  }, [telefone, nomeExterno, alunoEncontrado, criando, unidadeId, onIniciarConversa, onClose, handleSelecionarAluno]);

  if (!aberto) return null;

  const digitsCount = telefone.replace(/\D/g, '').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Nova Conversa</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1">
          <button
            onClick={() => setModo('aluno')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition',
              modo === 'aluno'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:bg-slate-700/50'
            )}
          >
            <User className="w-3.5 h-3.5" />
            Buscar Aluno
          </button>
          <button
            onClick={() => setModo('numero')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition',
              modo === 'numero'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:bg-slate-700/50'
            )}
          >
            <Hash className="w-3.5 h-3.5" />
            Digitar Numero
          </button>
        </div>

        {modo === 'aluno' ? (
          <>
            {/* Busca */}
            <div className="px-5 py-3 border-b border-slate-700/30">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar aluno por nome ou telefone..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Lista de alunos */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                </div>
              ) : alunosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <User className="w-10 h-10 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">
                    {busca ? 'Nenhum aluno encontrado' : 'Nenhum aluno nesta unidade'}
                  </p>
                  {busca && (
                    <button
                      onClick={() => { setModo('numero'); setTelefone(busca); }}
                      className="mt-3 text-xs text-violet-400 hover:text-violet-300 transition"
                    >
                      Digitar como numero externo
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {alunosFiltrados.map(aluno => {
                    const statusTag = getStatusAlunoTag(aluno.status);
                    return (
                      <button
                        key={aluno.id}
                        onClick={() => handleSelecionarAluno(aluno)}
                        disabled={criando}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800/60 transition text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {(aluno.nome || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '??'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-200 truncate">{aluno.nome}</p>
                            {statusTag && (
                              <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0', statusTag.classes)}>
                                {statusTag.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">{aluno.telefone || aluno.whatsapp || 'Sem telefone'}</span>
                            {aluno.cursos?.nome && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-medium flex items-center gap-0.5">
                                <GraduationCap className="w-2.5 h-2.5" />
                                {aluno.cursos.nome}
                              </span>
                            )}
                          </div>
                        </div>
                        {(!aluno.telefone && !aluno.whatsapp) && (
                          <span className="text-[9px] text-red-400">Sem telefone</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-700/50">
              <p className="text-[11px] text-slate-500">
                {alunosFiltrados.length} aluno{alunosFiltrados.length !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Modo: Digitar Numero */}
            <div className="px-5 py-3 space-y-3 border-b border-slate-700/30">
              <div>
                <label className="text-[11px] font-medium text-slate-400 mb-1 block">Telefone *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    placeholder="(21) 99999-9999"
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-400 mb-1 block">Nome (opcional)</label>
                <input
                  type="text"
                  placeholder="Nome do contato"
                  value={nomeExterno}
                  onChange={e => setNomeExterno(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Resultado da busca por telefone */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {buscandoTelefone ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-slate-500 animate-spin mr-2" />
                  <span className="text-xs text-slate-500">Verificando...</span>
                </div>
              ) : alunoEncontrado ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <User className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <p className="text-xs text-emerald-300">
                      Este numero pertence a um aluno cadastrado:
                    </p>
                  </div>
                  <button
                    onClick={() => handleSelecionarAluno(alunoEncontrado)}
                    disabled={criando}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {(alunoEncontrado.nome || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-200">{alunoEncontrado.nome}</p>
                        {(() => {
                          const tag = getStatusAlunoTag(alunoEncontrado.status);
                          return tag ? (
                            <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold uppercase', tag.classes)}>
                              {tag.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {alunoEncontrado.telefone || alunoEncontrado.whatsapp}
                        {alunoEncontrado.cursos?.nome && ` · ${alunoEncontrado.cursos.nome}`}
                      </p>
                    </div>
                  </button>
                </div>
              ) : digitsCount >= 10 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <p className="text-xs text-slate-400">
                      Numero nao cadastrado no sistema. A conversa sera criada como contato externo.
                    </p>
                  </div>
                  <div className="text-center py-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white mx-auto mb-3">
                      <Phone className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">
                      {nomeExterno || formatPhoneDisplay(telefone)}
                    </p>
                    {nomeExterno && (
                      <p className="text-xs text-slate-500 mt-0.5">{formatPhoneDisplay(telefone)}</p>
                    )}
                    <span className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-600/30 text-slate-400">
                      Contato externo
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Phone className="w-10 h-10 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">Digite um numero de telefone</p>
                  <p className="text-xs text-slate-600 mt-1">O sistema verificara se o numero esta cadastrado</p>
                </div>
              )}
            </div>

            {/* Botao de criar conversa externa */}
            <div className="px-5 py-3 border-t border-slate-700/50">
              <button
                onClick={handleSelecionarExterno}
                disabled={digitsCount < 10 || criando}
                className={cn(
                  'w-full py-2.5 rounded-lg text-sm font-medium transition',
                  digitsCount >= 10 && !criando
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
              >
                {criando ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : alunoEncontrado ? (
                  'Abrir conversa com aluno'
                ) : (
                  'Iniciar conversa'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
