'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Save, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { TemplateWhatsApp } from '../../types';
import { invalidarCacheTemplates } from './TemplateSelector';

interface ModalGerenciarTemplatesProps {
  aberto: boolean;
  onFechar: () => void;
}

const EMOJIS_TIPO: Record<string, string> = {
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
  personalizado: '📝',
};

const CORES_TIPO: Record<string, string> = {
  confirmacao: 'text-emerald-400',
  confirmacao_experimental: 'text-emerald-400',
  lembrete: 'text-amber-400',
  lembrete_24h: 'text-amber-400',
  reagendamento: 'text-blue-400',
  reagendar: 'text-blue-400',
  pos_experimental: 'text-violet-400',
  follow_up_frio: 'text-sky-400',
  boas_vindas: 'text-pink-400',
  sem_resposta: 'text-red-400',
  tentativa_sem_resposta: 'text-red-400',
  personalizado: 'text-slate-400',
};

type Tela = 'lista' | 'form';

interface FormData {
  nome: string;
  slug: string;
  conteudo: string;
  tipo: string;
}

const formVazio: FormData = { nome: '', slug: '', conteudo: '', tipo: 'personalizado' };

export function ModalGerenciarTemplates({ aberto, onFechar }: ModalGerenciarTemplatesProps) {
  const [templates, setTemplates] = useState<TemplateWhatsApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [tela, setTela] = useState<Tela>('lista');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(formVazio);
  const [excluirId, setExcluirId] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  // Buscar templates
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('crm_templates_whatsapp')
        .select('*')
        .order('nome');
      setTemplates((data || []) as TemplateWhatsApp[]);
    } catch (err) {
      console.error('[ModalTemplates] Erro ao buscar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (aberto) fetchTemplates();
  }, [aberto, fetchTemplates]);

  // Gerar slug a partir do nome
  const gerarSlug = (nome: string) =>
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  // Abrir formulário para novo template
  const handleNovo = () => {
    setForm(formVazio);
    setEditandoId(null);
    setErro('');
    setTela('form');
  };

  // Abrir formulário para editar
  const handleEditar = (t: TemplateWhatsApp) => {
    setForm({
      nome: t.nome,
      slug: t.slug,
      conteudo: t.conteudo,
      tipo: t.tipo,
    });
    setEditandoId(t.id);
    setErro('');
    setTela('form');
  };

  // Salvar (criar ou atualizar)
  const handleSalvar = async () => {
    if (!form.nome.trim()) { setErro('Nome é obrigatório'); return; }
    if (!form.conteudo.trim()) { setErro('Conteúdo é obrigatório'); return; }

    const slug = form.slug.trim() || gerarSlug(form.nome);

    setSalvando(true);
    setErro('');

    try {
      if (editandoId) {
        // Atualizar
        const { error } = await supabase
          .from('crm_templates_whatsapp')
          .update({
            nome: form.nome.trim(),
            slug,
            conteudo: form.conteudo.trim(),
            tipo: form.tipo,
          })
          .eq('id', editandoId);

        if (error) throw error;
      } else {
        // Criar
        const { error } = await supabase
          .from('crm_templates_whatsapp')
          .insert({
            nome: form.nome.trim(),
            slug,
            conteudo: form.conteudo.trim(),
            tipo: form.tipo,
            ativo: true,
          });

        if (error) throw error;
      }

      invalidarCacheTemplates();
      await fetchTemplates();
      setTela('lista');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      setErro(msg);
      console.error('[ModalTemplates] Erro ao salvar:', err);
    } finally {
      setSalvando(false);
    }
  };

  // Excluir template (soft delete via ativo=false)
  const handleExcluir = async () => {
    if (!excluirId) return;

    try {
      const { error } = await supabase
        .from('crm_templates_whatsapp')
        .update({ ativo: false })
        .eq('id', excluirId);

      if (error) throw error;

      invalidarCacheTemplates();
      await fetchTemplates();
    } catch (err) {
      console.error('[ModalTemplates] Erro ao excluir:', err);
    } finally {
      setExcluirId(null);
    }
  };

  // Reativar template
  const handleReativar = async (id: number) => {
    try {
      const { error } = await supabase
        .from('crm_templates_whatsapp')
        .update({ ativo: true })
        .eq('id', id);

      if (error) throw error;

      invalidarCacheTemplates();
      await fetchTemplates();
    } catch (err) {
      console.error('[ModalTemplates] Erro ao reativar:', err);
    }
  };

  // Placeholders disponíveis
  const placeholders = ['{nome}', '{curso}', '{unidade}', '{data}', '{horario}'];

  const templateExcluindo = templates.find(t => t.id === excluirId);

  return (
    <>
      <Dialog open={aberto} onOpenChange={(open) => { if (!open) { onFechar(); setTela('lista'); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {tela === 'form' && (
                <button
                  onClick={() => setTela('lista')}
                  className="p-1 rounded hover:bg-slate-700 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              {tela === 'lista' ? 'Gerenciar Templates' : editandoId ? 'Editar Template' : 'Novo Template'}
            </DialogTitle>
            <DialogDescription>
              {tela === 'lista'
                ? 'Crie, edite ou desative templates de mensagem rápida. Use placeholders como {nome}, {curso}, {unidade}.'
                : 'Preencha os campos abaixo. Placeholders serão substituídos automaticamente ao usar o template.'
              }
            </DialogDescription>
          </DialogHeader>

          {/* Tela: Lista */}
          {tela === 'lista' && (
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  Nenhum template cadastrado
                </div>
              ) : (
                templates.map(t => {
                  const emoji = EMOJIS_TIPO[t.slug] || EMOJIS_TIPO[t.tipo] || '📝';
                  const cor = CORES_TIPO[t.slug] || CORES_TIPO[t.tipo] || 'text-slate-400';
                  const preview = t.conteudo.split('\n')[0].slice(0, 60) + (t.conteudo.length > 60 ? '...' : '');

                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                        t.ativo
                          ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                          : 'border-slate-700/30 bg-slate-800/20 opacity-50'
                      }`}
                    >
                      <span className="text-lg mt-0.5">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${cor}`}>{t.nome}</span>
                          <span className="text-[10px] text-slate-500">/{t.slug}</span>
                          {!t.ativo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                              Desativado
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{preview}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!t.ativo ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReativar(t.id)}
                            className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          >
                            Reativar
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(t)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExcluirId(t.id)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Botão Novo Template */}
              <Button
                onClick={handleNovo}
                className="w-full mt-2 bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Template
              </Button>
            </div>
          )}

          {/* Tela: Formulário */}
          {tela === 'form' && (
            <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
              {/* Nome */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">Nome do template</label>
                <Input
                  value={form.nome}
                  onChange={(e) => {
                    setForm(prev => ({
                      ...prev,
                      nome: e.target.value,
                      slug: editandoId ? prev.slug : gerarSlug(e.target.value),
                    }));
                  }}
                  placeholder="Ex: Confirmação de Experimental"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">
                  Slug (atalho /)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">/</span>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value.replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="confirmacao_experimental"
                    className="bg-slate-800 border-slate-700 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Tipo */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">Tipo</label>
                <Input
                  value={form.tipo}
                  onChange={(e) => setForm(prev => ({ ...prev, tipo: e.target.value }))}
                  placeholder="Ex: confirmacao, lembrete, personalizado"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              {/* Conteúdo */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">
                  Conteúdo da mensagem
                </label>
                <textarea
                  value={form.conteudo}
                  onChange={(e) => setForm(prev => ({ ...prev, conteudo: e.target.value }))}
                  placeholder="Olá, {nome}! 😊 Tudo bem? Aqui é a Andreza, da LA Music..."
                  rows={6}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
                />
                {/* Placeholders */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500">Placeholders:</span>
                  {placeholders.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, conteudo: prev.conteudo + p }))}
                      className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Erro */}
              {erro && (
                <p className="text-sm text-red-400">{erro}</p>
              )}

              {/* Botões */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setTela('lista')}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {salvando ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {editandoId ? 'Salvar alterações' : 'Criar template'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog open={!!excluirId} onOpenChange={(open) => { if (!open) setExcluirId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template &quot;{templateExcluindo?.nome}&quot; será desativado e não aparecerá mais na lista de templates rápidos.
              Você poderá reativá-lo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
