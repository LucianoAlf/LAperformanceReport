import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { X, Package, Upload, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import type { ItemInventario, Sala, Unidade } from './types';
import { CATEGORIAS_EQUIPAMENTO, STATUS_EQUIPAMENTO, CONDICAO_EQUIPAMENTO } from './types';

interface ModalNovoEquipamentoProps {
  item: ItemInventario | null;
  salas: Sala[];
  unidades: Unidade[];
  onClose: () => void;
  onSalvar: () => void;
}

export function ModalNovoEquipamento({ 
  item, 
  salas, 
  unidades, 
  onClose, 
  onSalvar 
}: ModalNovoEquipamentoProps) {
  const { isAdmin, user } = useAuth();
  const isEdicao = !!item;

  // Estados do formulário
  const [nome, setNome] = useState(item?.nome || '');
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [marca, setMarca] = useState(item?.marca || '');
  const [modelo, setModelo] = useState(item?.modelo || '');
  const [numeroSerie, setNumeroSerie] = useState(item?.numero_serie || '');
  const [quantidade, setQuantidade] = useState(item?.quantidade || 1);
  const [unidadeId, setUnidadeId] = useState(item?.unidade_id || user?.unidade_id || '');
  const [salaId, setSalaId] = useState(item?.sala_id?.toString() || '');
  const [valorCompra, setValorCompra] = useState(item?.valor_compra?.toString() || '');
  const [dataCompra, setDataCompra] = useState<Date | null>(
    item?.data_compra ? new Date(item.data_compra) : null
  );
  const [notaFiscal, setNotaFiscal] = useState(item?.nota_fiscal || '');
  const [fornecedor, setFornecedor] = useState(item?.fornecedor || '');
  const [vidaUtilMeses, setVidaUtilMeses] = useState(item?.vida_util_meses || 60);
  const [status, setStatus] = useState(item?.status || 'ativo');
  const [condicao, setCondicao] = useState(item?.condicao || 'bom');
  const [observacoes, setObservacoes] = useState(item?.observacoes || '');
  const [proximaRevisao, setProximaRevisao] = useState<Date | null>(
    item?.proxima_revisao ? new Date(item.proxima_revisao) : null
  );
  const [alertaRevisaoDias, setAlertaRevisaoDias] = useState(item?.alerta_revisao_dias || 30);
  const [fotoUrl, setFotoUrl] = useState(item?.foto_url || '');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Salas filtradas pela unidade selecionada
  const salasFiltradas = useMemo(() => {
    if (!unidadeId) return salas;
    return salas.filter(s => s.unidade_id === unidadeId);
  }, [salas, unidadeId]);

  // Gerar código de patrimônio
  async function gerarCodigoPatrimonio(): Promise<string> {
    const unidade = unidades.find(u => u.id === unidadeId);
    const codigoUnidade = unidade?.codigo || 'XX';
    
    // Buscar último código da unidade
    const { data } = await supabase
      .from('inventario')
      .select('codigo_patrimonio')
      .like('codigo_patrimonio', `LA-${codigoUnidade}-%`)
      .order('codigo_patrimonio', { ascending: false })
      .limit(1);

    let sequencial = 1;
    if (data && data.length > 0 && data[0].codigo_patrimonio) {
      const match = data[0].codigo_patrimonio.match(/LA-\w+-(\d+)/);
      if (match) {
        sequencial = parseInt(match[1]) + 1;
      }
    }

    return `LA-${codigoUnidade}-${String(sequencial).padStart(4, '0')}`;
  }

  // Upload de foto
  async function handleUploadFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `equipamentos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('inventario-fotos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('inventario-fotos')
        .getPublicUrl(filePath);

      setFotoUrl(publicUrl);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da foto. Tente novamente.');
    } finally {
      setUploadingFoto(false);
    }
  }

  // Salvar equipamento
  async function handleSalvar() {
    if (!nome.trim()) {
      alert('Informe o nome do equipamento.');
      return;
    }
    if (!unidadeId) {
      alert('Selecione a unidade.');
      return;
    }
    if (!categoria) {
      alert('Selecione a categoria.');
      return;
    }

    setSalvando(true);
    try {
      const dados: any = {
        nome: nome.trim(),
        categoria,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        quantidade,
        unidade_id: unidadeId,
        sala_id: salaId && salaId !== 'sem_sala' ? parseInt(salaId) : null,
        valor_compra: valorCompra ? parseFloat(valorCompra.replace(',', '.')) : null,
        data_compra: dataCompra ? dataCompra.toISOString().split('T')[0] : null,
        nota_fiscal: notaFiscal.trim() || null,
        fornecedor: fornecedor.trim() || null,
        vida_util_meses: vidaUtilMeses,
        status,
        condicao,
        observacoes: observacoes.trim() || null,
        proxima_revisao: proximaRevisao ? proximaRevisao.toISOString().split('T')[0] : null,
        alerta_revisao_dias: alertaRevisaoDias,
        foto_url: fotoUrl || null,
        updated_at: new Date().toISOString(),
      };

      if (isEdicao) {
        // Atualizar
        const { error } = await supabase
          .from('inventario')
          .update(dados)
          .eq('id', item.id);

        if (error) throw error;

        // Registrar movimentação se mudou de sala
        if (item.sala_id !== (salaId ? parseInt(salaId) : null)) {
          await supabase.from('inventario_movimentacoes').insert({
            item_id: item.id,
            tipo: 'transferencia',
            sala_origem_id: item.sala_id,
            sala_destino_id: salaId ? parseInt(salaId) : null,
            motivo: 'Transferência via edição',
            usuario_id: user?.id,
          });
        }
      } else {
        // Criar novo
        dados.codigo_patrimonio = await gerarCodigoPatrimonio();
        dados.created_by = user?.id;

        const { data: novoItem, error } = await supabase
          .from('inventario')
          .insert(dados)
          .select()
          .single();

        if (error) throw error;

        // Registrar entrada
        await supabase.from('inventario_movimentacoes').insert({
          item_id: novoItem.id,
          tipo: 'entrada',
          sala_destino_id: salaId ? parseInt(salaId) : null,
          motivo: 'Cadastro inicial',
          usuario_id: user?.id,
        });
      }

      onSalvar();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar equipamento: ' + error.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {isEdicao ? 'Editar Equipamento' : 'Novo Equipamento'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6">
          
          {/* Seção: Identificação */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Identificação
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Nome do Equipamento *
                </label>
                <input 
                  type="text" 
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Bateria D-One 20"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Categoria *
                </label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_EQUIPAMENTO.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.emoji} {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Marca
                </label>
                <input 
                  type="text" 
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Yamaha, Fender..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Modelo
                </label>
                <input 
                  type="text" 
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: D-One 20"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Número de Série
                </label>
                <input 
                  type="text" 
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value)}
                  placeholder="Ex: SN123456789"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Quantidade
                </label>
                <input 
                  type="number" 
                  min="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>
            </div>
          </div>

          {/* Seção: Localização */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Localização
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Unidade *
                  </label>
                  <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setSalaId(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className={isAdmin ? '' : 'col-span-2'}>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sala
                </label>
                <Select value={salaId} onValueChange={setSalaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a sala (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_sala">Sem sala definida</SelectItem>
                    {salasFiltradas.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Seção: Financeiro */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Financeiro
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Valor de Compra (R$)
                </label>
                <input 
                  type="text" 
                  value={valorCompra}
                  onChange={(e) => setValorCompra(e.target.value)}
                  placeholder="Ex: 2500,00"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Data de Compra
                </label>
                <DatePicker
                  date={dataCompra}
                  onDateChange={setDataCompra}
                  placeholder="Selecione a data"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Nota Fiscal
                </label>
                <input 
                  type="text" 
                  value={notaFiscal}
                  onChange={(e) => setNotaFiscal(e.target.value)}
                  placeholder="Ex: NF-12345"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Fornecedor
                </label>
                <input 
                  type="text" 
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  placeholder="Ex: Loja Musical XYZ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Vida Útil (meses)
                </label>
                <input 
                  type="number" 
                  min="1"
                  value={vidaUtilMeses}
                  onChange={(e) => setVidaUtilMeses(parseInt(e.target.value) || 60)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>
            </div>
          </div>

          {/* Seção: Status e Condição */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Status e Condição
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Status
                </label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_EQUIPAMENTO.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Condição
                </label>
                <Select value={condicao} onValueChange={setCondicao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDICAO_EQUIPAMENTO.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Próxima Revisão
                </label>
                <DatePicker
                  date={proximaRevisao}
                  onDateChange={setProximaRevisao}
                  placeholder="Data da próxima revisão"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Alertar (dias antes)
                </label>
                <input 
                  type="number" 
                  min="1"
                  value={alertaRevisaoDias}
                  onChange={(e) => setAlertaRevisaoDias(parseInt(e.target.value) || 30)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>
            </div>
          </div>

          {/* Seção: Foto */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Foto do Equipamento
            </h4>

            <div className="flex items-start gap-4">
              {fotoUrl ? (
                <div className="relative">
                  <img 
                    src={fotoUrl} 
                    alt="Foto do equipamento"
                    className="w-32 h-32 rounded-xl object-cover"
                  />
                  <button
                    onClick={() => setFotoUrl('')}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <label className="w-32 h-32 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition">
                  {uploadingFoto ? (
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-400 mb-2" />
                      <span className="text-xs text-slate-400">Upload</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleUploadFoto}
                    className="hidden"
                    disabled={uploadingFoto}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Seção: Observações */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Observações
            </h4>

            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações adicionais sobre o equipamento..."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdicao ? 'Salvar Alterações' : 'Cadastrar Equipamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
