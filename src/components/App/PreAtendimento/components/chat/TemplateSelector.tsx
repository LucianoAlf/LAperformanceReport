import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TemplateWhatsApp } from '../../types';

interface TemplateSelectorProps {
  onSelecionar: (conteudo: string) => void;
  onFechar: () => void;
  /** 'bar' = botões horizontais (padrão), 'dropdown' = lista vertical com busca (atalho /) */
  modo?: 'bar' | 'dropdown';
  /** Filtro inicial (texto após /) */
  filtroInicial?: string;
}

const CORES_TEMPLATE: Record<string, string> = {
  confirmacao: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
  confirmacao_experimental: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
  lembrete: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
  lembrete_24h: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
  reagendamento: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
  reagendar: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
  pos_experimental: 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20',
  follow_up_frio: 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20',
  boas_vindas: 'bg-pink-500/10 text-pink-400 border-pink-500/20 hover:bg-pink-500/20',
  sem_resposta: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
  tentativa_sem_resposta: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20',
};

const EMOJIS_TEMPLATE: Record<string, string> = {
  confirmacao: '✅',
  confirmacao_experimental: '✅',
  lembrete: '⏰',
  lembrete_24h: '⏰',
  reagendamento: '📅',
  reagendar: '📅',
  pos_experimental: '🎵',
  follow_up_frio: '❄️',
  boas_vindas: '👋',
  sem_resposta: '📵',
  tentativa_sem_resposta: '📵',
};

// Cache global de templates para evitar fetch repetido
let templatesCache: TemplateWhatsApp[] | null = null;

export function TemplateSelector({ onSelecionar, onFechar, modo = 'bar', filtroInicial = '' }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateWhatsApp[]>(templatesCache || []);
  const [loading, setLoading] = useState(!templatesCache);
  const [filtro, setFiltro] = useState(filtroInicial);
  const [indiceSelecionado, setIndiceSelecionado] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (templatesCache) {
      setTemplates(templatesCache);
      setLoading(false);
      return;
    }
    async function fetchTemplates() {
      try {
        const { data } = await supabase
          .from('crm_templates_whatsapp')
          .select('*')
          .eq('ativo', true)
          .order('nome');
        const result = (data || []) as TemplateWhatsApp[];
        templatesCache = result;
        setTemplates(result);
      } catch (err) {
        console.error('[TemplateSelector] Erro:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  // Focar input no modo dropdown
  useEffect(() => {
    if (modo === 'dropdown') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modo]);

  // Filtrar templates
  const templatesFiltrados = filtro.trim()
    ? templates.filter(t =>
        t.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        t.slug.toLowerCase().includes(filtro.toLowerCase()) ||
        t.conteudo.toLowerCase().includes(filtro.toLowerCase())
      )
    : templates;

  // Resetar índice quando filtro muda
  useEffect(() => {
    setIndiceSelecionado(0);
  }, [filtro]);

  // Scroll para item selecionado
  useEffect(() => {
    if (modo !== 'dropdown') return;
    const el = listaRef.current?.children[indiceSelecionado] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [indiceSelecionado, modo]);

  // Navegação por teclado no dropdown
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (modo !== 'dropdown') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSelecionado(prev => Math.min(prev + 1, templatesFiltrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSelecionado(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = templatesFiltrados[indiceSelecionado];
      if (t) onSelecionar(t.conteudo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onFechar();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const t = templatesFiltrados[indiceSelecionado];
      if (t) onSelecionar(t.conteudo);
    }
  }, [modo, templatesFiltrados, indiceSelecionado, onSelecionar, onFechar]);

  // Modo dropdown (ativado por /)
  if (modo === 'dropdown') {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 flex flex-col">
        {/* Header com busca */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar template..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          <span className="text-[10px] text-slate-500 flex-shrink-0">↑↓ navegar · Enter selecionar · Esc fechar</span>
          <button onClick={onFechar} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lista de templates */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
          </div>
        ) : templatesFiltrados.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-500">
            Nenhum template encontrado
          </div>
        ) : (
          <div ref={listaRef} className="overflow-y-auto">
            {templatesFiltrados.map((t, idx) => {
              const emoji = EMOJIS_TEMPLATE[t.slug] || '📝';
              const isSelected = idx === indiceSelecionado;
              // Preview curto do conteúdo (primeira linha, max 80 chars)
              const preview = t.conteudo.split('\n')[0].slice(0, 80) + (t.conteudo.length > 80 ? '...' : '');

              return (
                <button
                  key={t.id}
                  onClick={() => onSelecionar(t.conteudo)}
                  onMouseEnter={() => setIndiceSelecionado(idx)}
                  className={`w-full text-left px-3 py-2.5 transition flex items-start gap-3 ${
                    isSelected
                      ? 'bg-violet-500/20 text-white'
                      : 'text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{t.nome}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">/{t.slug}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{preview}</p>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-violet-400 flex-shrink-0 mt-1">Enter ↵</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Modo bar (botões horizontais — padrão)
  return (
    <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-800/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-slate-400 font-medium">Templates rápidos:</span>
        <span className="text-[10px] text-slate-500">ou digite / no campo de texto</span>
        <button onClick={onFechar} className="text-[11px] text-slate-500 hover:text-slate-300 ml-auto">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {templates.map(t => {
            const cor = CORES_TEMPLATE[t.slug] || 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20';
            const emoji = EMOJIS_TEMPLATE[t.slug] || '📝';
            return (
              <button
                key={t.id}
                onClick={() => onSelecionar(t.conteudo)}
                className={`px-3 py-1.5 text-[11px] border rounded-lg transition font-medium ${cor}`}
              >
                {emoji} {t.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Invalidar cache de templates (chamar após CRUD) */
export function invalidarCacheTemplates() {
  templatesCache = null;
}
