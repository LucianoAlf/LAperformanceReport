import { useState, useEffect, useCallback } from 'react';
import { Search, X, Loader2, User, GraduationCap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { AlunoInbox } from './types';

interface NovaConversaModalProps {
  aberto: boolean;
  onClose: () => void;
  onIniciarConversa: (aluno: AlunoInbox) => void;
  unidadeId: string;
}

export function NovaConversaModal({ aberto, onClose, onIniciarConversa, unidadeId }: NovaConversaModalProps) {
  const [busca, setBusca] = useState('');
  const [alunos, setAlunos] = useState<AlunoInbox[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);

  const fetchAlunos = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') return;

    setLoading(true);
    try {
      let query = supabase
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
        .eq('status', 'ativo')
        .order('nome');

      const { data, error } = await query;
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
    }
  }, [aberto, fetchAlunos]);

  const alunosFiltrados = busca.trim()
    ? alunos.filter(a => {
        const termo = busca.toLowerCase();
        return (a.nome || '').toLowerCase().includes(termo) ||
               (a.telefone || '').includes(termo) ||
               (a.whatsapp || '').includes(termo);
      })
    : alunos;

  const handleSelecionar = useCallback(async (aluno: AlunoInbox) => {
    if (criando) return;

    // Verificar se tem telefone/whatsapp
    if (!aluno.telefone && !aluno.whatsapp) {
      alert('Este aluno não tem telefone cadastrado.');
      return;
    }

    setCriando(true);
    try {
      // Verificar se conversa já existe
      const { data: existente } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('aluno_id', aluno.id)
        .eq('unidade_id', unidadeId)
        .single();

      if (existente) {
        // Conversa já existe, reabrir se encerrada
        await supabase
          .from('admin_conversas')
          .update({ status: 'aberta' })
          .eq('id', existente.id);
      } else {
        // Buscar caixa administrativa da unidade
        const { data: caixa } = await supabase
          .from('whatsapp_caixas')
          .select('id')
          .eq('unidade_id', unidadeId)
          .eq('funcao', 'administrativo')
          .eq('ativo', true)
          .single();

        // Criar nova conversa
        await supabase
          .from('admin_conversas')
          .insert({
            aluno_id: aluno.id,
            unidade_id: unidadeId,
            caixa_id: caixa?.id || null,
            status: 'aberta',
          });
      }

      onIniciarConversa(aluno);
      onClose();
    } catch (err) {
      console.error('[NovaConversaModal] Erro ao criar conversa:', err);
    } finally {
      setCriando(false);
    }
  }, [unidadeId, criando, onIniciarConversa, onClose]);

  if (!aberto) return null;

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
                {busca ? 'Nenhum aluno encontrado' : 'Nenhum aluno ativo nesta unidade'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {alunosFiltrados.map(aluno => (
                <button
                  key={aluno.id}
                  onClick={() => handleSelecionar(aluno)}
                  disabled={criando}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800/60 transition text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {(aluno.nome || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{aluno.nome}</p>
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
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700/50">
          <p className="text-[11px] text-slate-500">
            {alunosFiltrados.length} aluno{alunosFiltrados.length !== 1 ? 's' : ''} ativo{alunosFiltrados.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
