import React, { useState, useEffect } from 'react';
import {
  GripVertical,
  Save,
  Loader2,
  Plus,
  Trash2,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { PipelineEtapa } from '../types';

interface ModalConfigurarEtapasProps {
  aberto: boolean;
  onFechar: () => void;
  etapas: PipelineEtapa[];
  onSalvar: () => void;
}

interface EtapaEditavel extends PipelineEtapa {
  alterada?: boolean;
  nova?: boolean;
}

const CORES_DISPONIVEIS = [
  '#3B82F6', '#8B5CF6', '#A855F7', '#06B6D4', '#0EA5E9',
  '#14B8A6', '#22C55E', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6B7280', '#059669', '#F97316', '#84CC16',
];

const ICONES_DISPONIVEIS = [
  '🆕', '🤖', '👩', '💬', '📅', '🏫', '✅', '❌',
  '🎓', '📦', '🔥', '⭐', '📞', '📧', '🎯', '🏆',
  '💰', '🎵', '📋', '🔔',
];

export function ModalConfigurarEtapas({ aberto, onFechar, etapas, onSalvar }: ModalConfigurarEtapasProps) {
  const [etapasEditaveis, setEtapasEditaveis] = useState<EtapaEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [seletorCorAberto, setSeletorCorAberto] = useState<number | null>(null);
  const [seletorIconeAberto, setSeletorIconeAberto] = useState<number | null>(null);

  // Inicializar etapas editáveis quando abrir
  useEffect(() => {
    if (aberto && etapas.length > 0) {
      setEtapasEditaveis(etapas.map(e => ({ ...e })));
    }
  }, [aberto, etapas]);

  // Atualizar campo de uma etapa
  const atualizarEtapa = (idx: number, campo: keyof EtapaEditavel, valor: any) => {
    setEtapasEditaveis(prev => prev.map((e, i) =>
      i === idx ? { ...e, [campo]: valor, alterada: true } : e
    ));
  };

  // Drag & drop para reordenar
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    setEtapasEditaveis(prev => {
      const novas = [...prev];
      const [removida] = novas.splice(dragIdx, 1);
      novas.splice(idx, 0, removida);
      return novas.map((e, i) => ({ ...e, ordem: i + 1, alterada: true }));
    });
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  // Adicionar nova etapa
  const adicionarEtapa = () => {
    const novaOrdem = etapasEditaveis.length + 1;
    setEtapasEditaveis(prev => [...prev, {
      id: Date.now(), // ID temporário
      nome: 'Nova Etapa',
      slug: `nova_etapa_${novaOrdem}`,
      cor: '#8B5CF6',
      icone: '⭐',
      ordem: novaOrdem,
      ativo: true,
      created_at: new Date().toISOString(),
      nova: true,
      alterada: true,
    }]);
  };

  // Salvar todas as alterações
  const salvar = async () => {
    setSalvando(true);
    try {
      for (const etapa of etapasEditaveis) {
        if (etapa.nova) {
          // Inserir nova etapa
          const { error } = await supabase
            .from('crm_pipeline_etapas')
            .insert({
              nome: etapa.nome,
              slug: etapa.slug,
              cor: etapa.cor,
              icone: etapa.icone,
              ordem: etapa.ordem,
              ativo: etapa.ativo,
            });
          if (error) throw error;
        } else if (etapa.alterada) {
          // Atualizar etapa existente
          const { error } = await supabase
            .from('crm_pipeline_etapas')
            .update({
              nome: etapa.nome,
              cor: etapa.cor,
              icone: etapa.icone,
              ordem: etapa.ordem,
              ativo: etapa.ativo,
            })
            .eq('id', etapa.id);
          if (error) throw error;
        }
      }

      onSalvar();
      onFechar();
    } catch (err) {
      console.error('Erro ao salvar etapas:', err);
    } finally {
      setSalvando(false);
    }
  };

  const temAlteracoes = etapasEditaveis.some(e => e.alterada);

  return (
    <Dialog open={aberto} onOpenChange={open => { if (!open) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-violet-400" />
            Configurar Etapas do Pipeline
          </DialogTitle>
          <DialogDescription>
            Reordene arrastando, renomeie, altere cores e ícones das etapas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {etapasEditaveis.map((etapa, idx) => (
            <div
              key={etapa.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-2 p-2 rounded-lg border transition-all",
                dragIdx === idx
                  ? "border-violet-500 bg-violet-500/10 opacity-50"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600",
                !etapa.ativo && "opacity-40"
              )}
            >
              {/* Grip para arrastar */}
              <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-white">
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Ordem */}
              <span className="text-[10px] text-slate-500 w-5 text-center font-mono">
                {idx + 1}
              </span>

              {/* Ícone (clicável) */}
              <div className="relative">
                <button
                  className="text-lg hover:scale-110 transition-transform w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700/50"
                  onClick={() => setSeletorIconeAberto(seletorIconeAberto === idx ? null : idx)}
                >
                  {etapa.icone}
                </button>
                {seletorIconeAberto === idx && (
                  <div className="absolute top-full left-0 z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg p-2 grid grid-cols-5 gap-1 shadow-xl">
                    {ICONES_DISPONIVEIS.map(ic => (
                      <button
                        key={ic}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center rounded hover:bg-slate-700 text-lg",
                          etapa.icone === ic && "bg-violet-500/30 ring-1 ring-violet-500"
                        )}
                        onClick={() => {
                          atualizarEtapa(idx, 'icone', ic);
                          setSeletorIconeAberto(null);
                        }}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nome */}
              <Input
                value={etapa.nome}
                onChange={e => atualizarEtapa(idx, 'nome', e.target.value)}
                className="flex-1 h-8 text-xs bg-slate-900/50 border-slate-700"
              />

              {/* Cor (clicável) */}
              <div className="relative">
                <button
                  className="w-8 h-8 rounded-lg border-2 border-slate-600 hover:border-white transition-colors"
                  style={{ backgroundColor: etapa.cor || '#8B5CF6' }}
                  onClick={() => setSeletorCorAberto(seletorCorAberto === idx ? null : idx)}
                />
                {seletorCorAberto === idx && (
                  <div className="absolute top-full right-0 z-50 mt-1 bg-slate-800 border border-slate-700 rounded-lg p-2 grid grid-cols-5 gap-1 shadow-xl">
                    {CORES_DISPONIVEIS.map(cor => (
                      <button
                        key={cor}
                        className={cn(
                          "w-7 h-7 rounded-md border-2 transition-all hover:scale-110",
                          etapa.cor === cor ? "border-white" : "border-transparent"
                        )}
                        style={{ backgroundColor: cor }}
                        onClick={() => {
                          atualizarEtapa(idx, 'cor', cor);
                          setSeletorCorAberto(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Toggle ativo */}
              <button
                className={cn(
                  "text-[10px] px-2 py-1 rounded-full font-medium transition-colors",
                  etapa.ativo
                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    : "bg-slate-700/50 text-slate-500 hover:bg-slate-700"
                )}
                onClick={() => atualizarEtapa(idx, 'ativo', !etapa.ativo)}
              >
                {etapa.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>

        {/* Botão adicionar */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white mt-2"
          onClick={adicionarEtapa}
        >
          <Plus className="w-4 h-4 mr-1" /> Adicionar Etapa
        </Button>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
          <span className="text-[10px] text-slate-500">
            {temAlteracoes ? '⚠️ Alterações não salvas' : '✅ Tudo salvo'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onFechar} className="border-slate-700 text-slate-400">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={salvar}
              disabled={salvando || !temAlteracoes}
            >
              {salvando ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="w-4 h-4 mr-1" /> Salvar Alterações</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ModalConfigurarEtapas;
