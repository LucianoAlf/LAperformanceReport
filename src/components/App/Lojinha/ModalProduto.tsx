'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LojaProduto, LojaCategoria, LojaVariacao } from '@/types/lojinha';

interface ModalProdutoProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  produto: LojaProduto | null;
  categorias: LojaCategoria[];
  unidadeId: string;
}

interface VariacaoForm {
  id?: number;
  nome: string;
  preco: string;
  sku: string;
  estoque_barra: string;
  estoque_cg: string;
  estoque_recreio: string;
}

export function ModalProduto({ open, onClose, onSuccess, produto, categorias, unidadeId }: ModalProdutoProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    categoria_id: '',
    sku: '',
    preco: '',
    custo: '',
    estoque_minimo: '5',
    comissao_especial: '',
    descricao: '',
    disponivel_whatsapp: false,
    ativo: true,
  });
  const [variacoes, setVariacoes] = useState<VariacaoForm[]>([]);

  // Função para upload de foto
  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 2MB.');
      return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      toast.error('Arquivo deve ser uma imagem.');
      return;
    }

    setUploadingFoto(true);
    
    try {
      // Gerar nome único
      const ext = file.name.split('.').pop();
      const fileName = `produto_${Date.now()}.${ext}`;
      const filePath = `produtos/${fileName}`;

      // Upload para Supabase Storage
      const { data, error } = await supabase.storage
        .from('lojinha-produtos')
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('lojinha-produtos')
        .getPublicUrl(filePath);

      setFotoUrl(urlData.publicUrl);
      setFotoPreview(urlData.publicUrl);
      toast.success('Foto enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao enviar foto');
    } finally {
      setUploadingFoto(false);
    }
  }

  // Carregar dados do produto ao editar
  useEffect(() => {
    if (produto) {
      setForm({
        nome: produto.nome,
        categoria_id: produto.categoria_id?.toString() || '',
        sku: produto.sku || '',
        preco: produto.preco.toFixed(2).replace('.', ','),
        custo: produto.custo?.toFixed(2).replace('.', ',') || '',
        estoque_minimo: produto.estoque_minimo.toString(),
        comissao_especial: produto.comissao_especial?.toString() || '',
        descricao: produto.descricao || '',
        disponivel_whatsapp: produto.disponivel_whatsapp,
        ativo: produto.ativo,
      });
      // Carregar variações
      if (produto.loja_variacoes) {
        setVariacoes(produto.loja_variacoes.map(v => ({
          id: v.id,
          nome: v.nome,
          preco: v.preco?.toFixed(2).replace('.', ',') || '',
          sku: v.sku || '',
          estoque_barra: '',
          estoque_cg: '',
          estoque_recreio: '',
        })));
      }
      // Carregar foto existente
      if ((produto as any).foto_url) {
        setFotoUrl((produto as any).foto_url);
        setFotoPreview((produto as any).foto_url);
      } else {
        setFotoUrl(null);
        setFotoPreview(null);
      }
    } else {
      // Reset form
      setForm({
        nome: '',
        categoria_id: '',
        sku: '',
        preco: '',
        custo: '',
        estoque_minimo: '5',
        comissao_especial: '',
        descricao: '',
        disponivel_whatsapp: false,
        ativo: true,
      });
      setVariacoes([]);
      setFotoUrl(null);
      setFotoPreview(null);
    }
  }, [produto, open]);

  function addVariacao() {
    setVariacoes([...variacoes, {
      nome: '',
      preco: '',
      sku: '',
      estoque_barra: '',
      estoque_cg: '',
      estoque_recreio: '',
    }]);
  }

  function removeVariacao(index: number) {
    setVariacoes(variacoes.filter((_, i) => i !== index));
  }

  function updateVariacao(index: number, field: keyof VariacaoForm, value: string) {
    const updated = [...variacoes];
    updated[index] = { ...updated[index], [field]: value };
    setVariacoes(updated);
  }

  async function handleSubmit() {
    if (!form.nome || !form.preco) {
      alert('Preencha os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const precoNum = parseFloat(form.preco.replace(',', '.'));
      const custoNum = form.custo ? parseFloat(form.custo.replace(',', '.')) : null;
      const comissaoNum = form.comissao_especial ? parseFloat(form.comissao_especial) : null;

      const produtoData = {
        nome: form.nome,
        categoria_id: form.categoria_id ? parseInt(form.categoria_id) : null,
        sku: form.sku || null,
        preco: precoNum,
        custo: custoNum,
        estoque_minimo: parseInt(form.estoque_minimo) || 5,
        comissao_especial: comissaoNum,
        descricao: form.descricao || null,
        disponivel_whatsapp: form.disponivel_whatsapp,
        ativo: form.ativo,
        foto_url: fotoUrl,
      };

      let produtoId: number;

      if (produto) {
        // Atualizar
        const { error } = await supabase
          .from('loja_produtos')
          .update(produtoData)
          .eq('id', produto.id);
        
        if (error) throw error;
        produtoId = produto.id;
      } else {
        // Inserir
        const { data, error } = await supabase
          .from('loja_produtos')
          .insert(produtoData)
          .select('id')
          .single();
        
        if (error) throw error;
        produtoId = data.id;
      }

      // Salvar variações
      for (const variacao of variacoes) {
        if (!variacao.nome) continue;
        
        const variacaoData = {
          produto_id: produtoId,
          nome: variacao.nome,
          preco: variacao.preco ? parseFloat(variacao.preco.replace(',', '.')) : null,
          sku: variacao.sku || null,
        };

        if (variacao.id) {
          await supabase
            .from('loja_variacoes')
            .update(variacaoData)
            .eq('id', variacao.id);
        } else {
          await supabase
            .from('loja_variacoes')
            .insert(variacaoData);
        }
      }

      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar produto');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📦 {produto ? 'Editar Produto' : 'Cadastro de Produto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Campos principais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Nome do Produto *
              </label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Corda de Violão"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Categoria *
              </label>
              <Select
                value={form.categoria_id}
                onValueChange={(v) => setForm({ ...form, categoria_id: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.icone} {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                SKU
              </label>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Auto-gerado"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Preço Base (R$) *
              </label>
              <Input
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
                placeholder="0,00"
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Custo (R$)
              </label>
              <Input
                value={form.custo}
                onChange={(e) => setForm({ ...form, custo: e.target.value })}
                placeholder="0,00"
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Estoque Mínimo
              </label>
              <Input
                type="number"
                value={form.estoque_minimo}
                onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Comissão Especial (%)
              </label>
              <Input
                value={form.comissao_especial}
                onChange={(e) => setForm({ ...form, comissao_especial: e.target.value })}
                placeholder="Deixe vazio para padrão"
                className="mt-1"
              />
            </div>

            {/* Upload de Foto */}
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Foto do Produto
              </label>
              <div className="mt-1 flex items-center gap-3">
                <div className="w-20 h-20 bg-slate-700 border-2 border-dashed border-slate-600 rounded-xl flex items-center justify-center text-2xl overflow-hidden">
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="Foto do produto" className="w-full h-full object-cover" />
                  ) : (
                    categorias.find(c => c.id.toString() === form.categoria_id)?.icone || '📦'
                  )}
                </div>
                <div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoUpload}
                      className="hidden"
                      disabled={uploadingFoto}
                    />
                    <Button variant="outline" size="sm" asChild disabled={uploadingFoto}>
                      <span>
                        <Upload className="w-4 h-4 mr-1" />
                        {uploadingFoto ? 'Enviando...' : fotoPreview ? 'Trocar Foto' : 'Escolher Foto'}
                      </span>
                    </Button>
                  </label>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG até 2MB. Opcional.</p>
                  {fotoPreview && (
                    <button
                      type="button"
                      onClick={() => { setFotoUrl(null); setFotoPreview(null); }}
                      className="text-xs text-rose-400 hover:text-rose-300 mt-1"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Descrição
              </label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Descrição do produto..."
                className="mt-1 w-full h-20 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="disponivel_whatsapp"
                checked={form.disponivel_whatsapp}
                onChange={(e) => setForm({ ...form, disponivel_whatsapp: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="disponivel_whatsapp" className="text-sm text-slate-300 cursor-pointer">
                Disponível para divulgação WhatsApp
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="ativo" className="text-sm text-slate-300 cursor-pointer">
                Produto Ativo
              </label>
            </div>
          </div>

          {/* Variações */}
          <div className="border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">🔀 Variações</h3>
              <Button variant="outline" size="sm" onClick={addVariacao}>
                <Plus className="w-4 h-4 mr-1" />
                Variação
              </Button>
            </div>

            {variacoes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-2 text-xs text-slate-400">Variação</th>
                      <th className="text-left p-2 text-xs text-slate-400">Preço (R$)</th>
                      <th className="text-left p-2 text-xs text-slate-400">SKU</th>
                      <th className="text-left p-2 text-xs text-slate-400">Est. Barra</th>
                      <th className="text-left p-2 text-xs text-slate-400">Est. CG</th>
                      <th className="text-left p-2 text-xs text-slate-400">Est. Recreio</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variacoes.map((v, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="p-2">
                          <Input
                            value={v.nome}
                            onChange={(e) => updateVariacao(i, 'nome', e.target.value)}
                            placeholder="Nome"
                            className="w-32 h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={v.preco}
                            onChange={(e) => updateVariacao(i, 'preco', e.target.value)}
                            placeholder="0,00"
                            className="w-20 h-8 text-xs font-mono"
                          />
                        </td>
                        <td className="p-2 text-xs text-slate-400 font-mono">
                          {v.sku || '—'}
                        </td>
                        <td className="p-2">
                          <Input
                            value={v.estoque_barra}
                            onChange={(e) => updateVariacao(i, 'estoque_barra', e.target.value)}
                            placeholder="0"
                            className="w-14 h-8 text-xs text-center"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={v.estoque_cg}
                            onChange={(e) => updateVariacao(i, 'estoque_cg', e.target.value)}
                            placeholder="0"
                            className="w-14 h-8 text-xs text-center"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={v.estoque_recreio}
                            onChange={(e) => updateVariacao(i, 'estoque_recreio', e.target.value)}
                            placeholder="0"
                            className="w-14 h-8 text-xs text-center"
                          />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariacao(i)}
                            className="text-rose-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Produto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
