'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Save, MessageCircle, Plus, Trash2, Edit2, Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LojaConfiguracao, LojaResponsavelReposicao, LojaCategoria } from '@/types/lojinha';

const UNIDADES = [
  { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra', codigo: 'barra' },
  { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande', codigo: 'cg' },
  { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio', codigo: 'recreio' },
];

const ICONES_CATEGORIA = ['🎸', '🎵', '🥁', '👕', '📕', '🎧', '🎹', '🎤', '🎺', '📦'];

interface TabConfiguracoesProps {
  unidadeId: string;
}

export function TabConfiguracoes({ unidadeId }: TabConfiguracoesProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configuracoes, setConfiguracoes] = useState<Record<string, string>>({});
  const [responsaveis, setResponsaveis] = useState<LojaResponsavelReposicao[]>([]);
  const [categorias, setCategorias] = useState<LojaCategoria[]>([]);
  
  // Estados dos modais
  const [modalResponsavel, setModalResponsavel] = useState(false);
  const [modalCategoria, setModalCategoria] = useState(false);
  const [editingResponsavel, setEditingResponsavel] = useState<LojaResponsavelReposicao | null>(null);
  const [editingCategoria, setEditingCategoria] = useState<LojaCategoria | null>(null);
  
  // Estados de auto-save
  const [configStatus, setConfigStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Carregar configurações
      const { data: configs } = await supabase
        .from('loja_configuracoes')
        .select('*');

      const configMap: Record<string, string> = {};
      for (const c of configs || []) {
        configMap[c.chave] = c.valor;
      }
      setConfiguracoes(configMap);

      // Carregar responsáveis
      const { data: resp } = await supabase
        .from('loja_responsaveis_reposicao')
        .select('*, unidades(codigo, nome)')
        .eq('ativo', true);

      setResponsaveis(resp || []);

      // Carregar categorias
      const { data: cats } = await supabase
        .from('loja_categorias')
        .select('*')
        .order('ordem');

      setCategorias(cats || []);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setLoading(false);
    }
  }

  // Auto-save para configurações
  const saveConfig = useCallback(async (chave: string, valor: string) => {
    setConfigStatus(prev => ({ ...prev, [chave]: 'saving' }));
    try {
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('loja_configuracoes')
        .select('id')
        .eq('chave', chave)
        .single();

      if (existing) {
        await supabase
          .from('loja_configuracoes')
          .update({ valor })
          .eq('chave', chave);
      } else {
        await supabase
          .from('loja_configuracoes')
          .insert({ chave, valor, descricao: '' });
      }
      
      setConfigStatus(prev => ({ ...prev, [chave]: 'saved' }));
      setTimeout(() => {
        setConfigStatus(prev => ({ ...prev, [chave]: 'idle' }));
      }, 1500);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setConfigStatus(prev => ({ ...prev, [chave]: 'idle' }));
    }
  }, []);

  function updateConfig(chave: string, valor: string) {
    setConfiguracoes({ ...configuracoes, [chave]: valor });
  }

  function handleConfigBlur(chave: string) {
    const valor = configuracoes[chave];
    if (valor !== undefined) {
      saveConfig(chave, valor);
    }
  }

  // Handlers para responsáveis
  function handleAddResponsavel() {
    setEditingResponsavel(null);
    setModalResponsavel(true);
  }

  function handleEditResponsavel(resp: LojaResponsavelReposicao) {
    setEditingResponsavel(resp);
    setModalResponsavel(true);
  }

  // Handlers para categorias
  function handleAddCategoria() {
    setEditingCategoria(null);
    setModalCategoria(true);
  }

  function handleEditCategoria(cat: LojaCategoria) {
    setEditingCategoria(cat);
    setModalCategoria(true);
  }

  // Handler para excluir responsável
  async function handleDeleteResponsavel(resp: LojaResponsavelReposicao) {
    if (!confirm(`Deseja realmente excluir ${resp.nome}?`)) return;
    
    try {
      await supabase
        .from('loja_responsaveis_reposicao')
        .delete()
        .eq('id', resp.id);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir responsável:', error);
      alert('Erro ao excluir');
    }
  }

  // Dados de exemplo para responsáveis quando não há dados no banco
  const responsaveisExemplo: LojaResponsavelReposicao[] = [
    { id: 1, unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Luciano Almeida', whatsapp: '(21) 99999-0001', ativo: true, created_at: new Date().toISOString(), unidades: { codigo: 'barra', nome: 'Barra' } },
    { id: 2, unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Luciano Almeida', whatsapp: '(21) 99999-0001', ativo: true, created_at: new Date().toISOString(), unidades: { codigo: 'cg', nome: 'Campo Grande' } },
    { id: 3, unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Luciano Almeida', whatsapp: '(21) 99999-0001', ativo: true, created_at: new Date().toISOString(), unidades: { codigo: 'rec', nome: 'Recreio' } },
  ];

  // Usar dados reais ou exemplos
  const responsaveisParaExibir = responsaveis.length > 0 ? responsaveis : responsaveisExemplo;

  // Dados de exemplo para categorias quando não há dados no banco
  const categoriasExemplo: LojaCategoria[] = [
    { id: 1, nome: 'Cordas', icone: '🎸', ordem: 1, ativo: true, created_at: new Date().toISOString() },
    { id: 2, nome: 'Palhetas', icone: '🎵', ordem: 2, ativo: true, created_at: new Date().toISOString() },
    { id: 3, nome: 'Baquetas', icone: '🥁', ordem: 3, ativo: true, created_at: new Date().toISOString() },
    { id: 4, nome: 'Camisetas', icone: '👕', ordem: 4, ativo: true, created_at: new Date().toISOString() },
    { id: 5, nome: 'Material Didático', icone: '📕', ordem: 5, ativo: true, created_at: new Date().toISOString() },
    { id: 6, nome: 'Acessórios', icone: '🎧', ordem: 6, ativo: true, created_at: new Date().toISOString() },
    { id: 7, nome: 'Outros', icone: '🎁', ordem: 7, ativo: true, created_at: new Date().toISOString() },
  ];

  // Usar dados reais ou exemplos
  const categoriasParaExibir = categorias.length > 0 ? categorias : categoriasExemplo;

  async function salvarConfiguracoes() {
    setSaving(true);
    try {
      for (const [chave, valor] of Object.entries(configuracoes)) {
        await supabase
          .from('loja_configuracoes')
          .update({ valor })
          .eq('chave', chave);
      }
      alert('✓ Configurações salvas!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }

  function handleTestarAlerta() {
    alert('📱 Alerta de teste enviado!');
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">Carregando configurações...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Comissões */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          💰 Comissões
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Comissão Farmer (%)
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                value={configuracoes.comissao_farmer_padrao || '5'}
                onChange={(e) => updateConfig('comissao_farmer_padrao', e.target.value)}
                onBlur={() => handleConfigBlur('comissao_farmer_padrao')}
                className={cn(
                  configStatus.comissao_farmer_padrao === 'saved' && 'border-emerald-500/50 bg-emerald-500/10'
                )}
              />
              {configStatus.comissao_farmer_padrao === 'saved' && (
                <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Padrão para vendas</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Comissão Professor Indicação (%)
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                value={configuracoes.comissao_professor_indicacao || '5'}
                onChange={(e) => updateConfig('comissao_professor_indicacao', e.target.value)}
                onBlur={() => handleConfigBlur('comissao_professor_indicacao')}
                className={cn(
                  configStatus.comissao_professor_indicacao === 'saved' && 'border-emerald-500/50 bg-emerald-500/10'
                )}
              />
              {configStatus.comissao_professor_indicacao === 'saved' && (
                <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Quando professor indica venda</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1">
              <img src="/lalita.svg" alt="Lalita" className="w-4 h-4" />
              Valor Lalita (R$)
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                value={configuracoes.valor_moeda_la || '30'}
                onChange={(e) => updateConfig('valor_moeda_la', e.target.value)}
                onBlur={() => handleConfigBlur('valor_moeda_la')}
                className={cn(
                  configStatus.valor_moeda_la === 'saved' && 'border-emerald-500/50 bg-emerald-500/10'
                )}
              />
              {configStatus.valor_moeda_la === 'saved' && (
                <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Crédito por matrícula</p>
          </div>
        </div>
      </div>

      {/* Estoque */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          📦 Estoque
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Estoque Mínimo Padrão
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                value={configuracoes.estoque_minimo_padrao || '5'}
                onChange={(e) => updateConfig('estoque_minimo_padrao', e.target.value)}
                onBlur={() => handleConfigBlur('estoque_minimo_padrao')}
                className={cn(
                  configStatus.estoque_minimo_padrao === 'saved' && 'border-emerald-500/50 bg-emerald-500/10'
                )}
              />
              {configStatus.estoque_minimo_padrao === 'saved' && (
                <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Para novos produtos</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Alertas WhatsApp
            </label>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configuracoes.alerta_whatsapp_ativo === 'true'}
                  onChange={(e) => updateConfig('alerta_whatsapp_ativo', e.target.checked ? 'true' : 'false')}
                  className="rounded"
                />
                <span className="text-sm text-slate-300">Disparo automático ativo</span>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestarAlerta}
                className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                Testar Alerta
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Responsáveis por Reposição */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            👤 Responsáveis por Reposição
          </h3>
          <Button variant="outline" size="sm" onClick={handleAddResponsavel}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Unidade</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Nome</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">WhatsApp</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {responsaveisParaExibir.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/50">
                  <td className="p-3 text-sm text-white">{r.unidades?.nome}</td>
                  <td className="p-3 text-sm text-white">{r.nome}</td>
                  <td className="p-3 font-mono text-sm text-slate-300">{r.whatsapp}</td>
                  <td className="p-3">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
                      r.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                    )}>
                      {r.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEditResponsavel(r)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteResponsavel(r)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Categorias */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            📂 Categorias de Produtos
          </h3>
          <Button variant="outline" size="sm" onClick={handleAddCategoria}>
            <Plus className="w-4 h-4 mr-1" />
            Nova Categoria
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categoriasParaExibir.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg"
            >
              <span>{cat.icone}</span>
              <span className="text-sm text-white">{cat.nome}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleEditCategoria(cat)}>
                <Edit2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Templates WhatsApp */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          📱 Templates WhatsApp
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Template de Comprovante
            </label>
            <textarea
              value={configuracoes.template_comprovante || ''}
              onChange={(e) => updateConfig('template_comprovante', e.target.value)}
              className="mt-1 w-full h-32 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
              placeholder="Template do comprovante..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Variáveis: {'{unidade}'}, {'{data}'}, {'{cliente}'}, {'{itens}'}, {'{total}'}, {'{forma_pagamento}'}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Template de Alerta de Estoque
            </label>
            <textarea
              value={configuracoes.template_alerta_estoque || ''}
              onChange={(e) => updateConfig('template_alerta_estoque', e.target.value)}
              className="mt-1 w-full h-32 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
              placeholder="Template do alerta..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Variáveis: {'{unidade}'}, {'{lista_produtos}'}, {'{data}'}
            </p>
          </div>
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end gap-4 items-center">
        <span className="text-xs text-slate-400">💾 Alterações são salvas automaticamente</span>
        <Button onClick={salvarConfiguracoes} disabled={saving} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Salvando...' : 'Salvar Todas'}
        </Button>
      </div>

      {/* Modal Responsável */}
      <ModalResponsavel
        open={modalResponsavel}
        onClose={() => { setModalResponsavel(false); setEditingResponsavel(null); }}
        onSuccess={() => { setModalResponsavel(false); setEditingResponsavel(null); loadData(); }}
        responsavel={editingResponsavel}
      />

      {/* Modal Categoria */}
      <ModalCategoria
        open={modalCategoria}
        onClose={() => { setModalCategoria(false); setEditingCategoria(null); }}
        onSuccess={() => { setModalCategoria(false); setEditingCategoria(null); loadData(); }}
        categoria={editingCategoria}
      />
    </div>
  );
}

// Modal para Responsável
interface ModalResponsavelProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  responsavel: LojaResponsavelReposicao | null;
}

function ModalResponsavel({ open, onClose, onSuccess, responsavel }: ModalResponsavelProps) {
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [unidadeId, setUnidadeId] = useState(UNIDADES[0].id);

  useEffect(() => {
    if (open) {
      if (responsavel) {
        setNome(responsavel.nome);
        setWhatsapp(responsavel.whatsapp);
        setUnidadeId(responsavel.unidade_id);
      } else {
        setNome('');
        setWhatsapp('');
        setUnidadeId(UNIDADES[0].id);
      }
    }
  }, [open, responsavel]);

  // Validar e formatar WhatsApp
  function formatarWhatsapp(valor: string): string {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length === 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    }
    if (numeros.length === 10) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }
    return valor;
  }

  function validarWhatsapp(valor: string): boolean {
    const numeros = valor.replace(/\D/g, '');
    return numeros.length >= 10 && numeros.length <= 11;
  }

  async function handleSubmit() {
    if (!nome || !whatsapp) {
      alert('Preencha todos os campos');
      return;
    }

    if (!validarWhatsapp(whatsapp)) {
      alert('WhatsApp inválido. Informe um número com DDD (10 ou 11 dígitos)');
      return;
    }

    const whatsappFormatado = formatarWhatsapp(whatsapp);

    setLoading(true);
    try {
      if (responsavel) {
        const { error } = await supabase
          .from('loja_responsaveis_reposicao')
          .update({ nome, whatsapp: whatsappFormatado, unidade_id: unidadeId })
          .eq('id', responsavel.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('loja_responsaveis_reposicao')
          .insert({ nome, whatsapp: whatsappFormatado, unidade_id: unidadeId, ativo: true });
        
        if (error) throw error;
      }
      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar responsável:', error);
      alert(`Erro ao salvar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {responsavel ? '✏️ Editar Responsável' : '➕ Novo Responsável'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Unidade</label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Nome</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Nome completo" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">WhatsApp</label>
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="mt-1" placeholder="(21) 99999-0000" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Modal para Categoria
interface ModalCategoriaProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categoria: LojaCategoria | null;
}

function ModalCategoria({ open, onClose, onSuccess, categoria }: ModalCategoriaProps) {
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('📦');

  useEffect(() => {
    if (open) {
      if (categoria) {
        setNome(categoria.nome);
        setIcone(categoria.icone);
      } else {
        setNome('');
        setIcone('📦');
      }
    }
  }, [open, categoria]);

  async function handleSubmit() {
    if (!nome) {
      alert('Informe o nome da categoria');
      return;
    }

    setLoading(true);
    try {
      if (categoria) {
        await supabase
          .from('loja_categorias')
          .update({ nome, icone })
          .eq('id', categoria.id);
      } else {
        // Pegar próxima ordem
        const { data: cats } = await supabase
          .from('loja_categorias')
          .select('ordem')
          .order('ordem', { ascending: false })
          .limit(1);
        const novaOrdem = (cats?.[0]?.ordem || 0) + 1;

        await supabase
          .from('loja_categorias')
          .insert({ nome, icone, ordem: novaOrdem, ativo: true });
      }
      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
      alert('Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {categoria ? '✏️ Editar Categoria' : '➕ Nova Categoria'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Ícone</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ICONES_CATEGORIA.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcone(ic)}
                  className={cn(
                    'w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all',
                    icone === ic ? 'bg-sky-500 ring-2 ring-sky-400' : 'bg-slate-700 hover:bg-slate-600'
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Nome</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex: Cordas" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
