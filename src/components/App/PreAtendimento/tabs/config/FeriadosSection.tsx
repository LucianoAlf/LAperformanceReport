import { useEffect, useState } from 'react';
import { CalendarOff, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Feriado {
  id: string;
  data: string;
  nome: string;
  tipo: 'national' | 'municipal' | 'recesso';
  ativo: boolean;
}

const TIPO_LABELS: Record<string, string> = {
  national: 'Nacional',
  municipal: 'Municipal',
  recesso: 'Recesso',
};

export function FeriadosSection() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loadingFeriados, setLoadingFeriados] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [anoFeriados, setAnoFeriados] = useState(new Date().getFullYear());
  const [novoFeriado, setNovoFeriado] = useState({
    data: '',
    nome: '',
    tipo: 'municipal' as Feriado['tipo'],
  });
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    loadFeriados();
  }, [anoFeriados]);

  const loadFeriados = async () => {
    setLoadingFeriados(true);
    try {
      const inicioAno = `${anoFeriados}-01-01`;
      const fimAno = `${anoFeriados}-12-31`;
      const { data } = await supabase
        .from('feriados')
        .select('*')
        .gte('data', inicioAno)
        .lte('data', fimAno)
        .order('data');
      setFeriados((data || []) as Feriado[]);
    } finally {
      setLoadingFeriados(false);
    }
  };

  const sincronizarFeriados = async () => {
    setSincronizando(true);
    try {
      const res = await supabase.functions.invoke('sync-feriados', { body: { ano: anoFeriados } });
      if (res.error) throw res.error;
      toast.success(`${res.data.inseridos} feriados sincronizados para ${anoFeriados}`);
      loadFeriados();
    } catch (err) {
      console.error('Erro ao sincronizar:', err);
      toast.error('Erro ao sincronizar feriados. Verifique se a edge function está deployada.');
    } finally {
      setSincronizando(false);
    }
  };

  const toggleFeriado = async (feriado: Feriado) => {
    const novoAtivo = !feriado.ativo;
    const { error } = await supabase.from('feriados').update({ ativo: novoAtivo }).eq('id', feriado.id);
    if (error) {
      toast.error('Erro ao atualizar feriado');
      return;
    }
    setFeriados(prev => prev.map(f => (f.id === feriado.id ? { ...f, ativo: novoAtivo } : f)));
    toast.success(`${feriado.nome} ${novoAtivo ? 'ativado' : 'desativado'}`);
  };

  const adicionarFeriado = async () => {
    if (!novoFeriado.data || !novoFeriado.nome) {
      toast.error('Preencha data e nome');
      return;
    }
    setAdicionando(true);
    try {
      const { error } = await supabase.from('feriados').insert({
        data: novoFeriado.data,
        nome: novoFeriado.nome,
        tipo: novoFeriado.tipo,
        ativo: true,
      });
      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe um feriado nessa data');
        } else {
          throw error;
        }
        return;
      }
      toast.success(`${novoFeriado.nome} adicionado`);
      setNovoFeriado({ data: '', nome: '', tipo: 'municipal' });
      loadFeriados();
    } catch (err) {
      console.error('Erro ao adicionar feriado:', err);
      toast.error('Erro ao adicionar feriado');
    } finally {
      setAdicionando(false);
    }
  };

  const removerFeriado = async (feriado: Feriado) => {
    const { error } = await supabase.from('feriados').delete().eq('id', feriado.id);
    if (error) {
      toast.error('Erro ao remover feriado');
      return;
    }
    setFeriados(prev => prev.filter(f => f.id !== feriado.id));
    toast.success(`${feriado.nome} removido`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20">
            <CalendarOff className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Feriados</h2>
            <p className="text-sm text-slate-400">Datas em que a escola não atende visitas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(anoFeriados)} onValueChange={(v) => setAnoFeriados(Number(v))}>
            <SelectTrigger className="w-24 bg-slate-800/50 border-slate-700 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2025, 2026, 2027].map(a => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={sincronizarFeriados}
            disabled={sincronizando}
            className="border-slate-700 text-slate-300 hover:text-white"
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', sincronizando && 'animate-spin')} />
            {sincronizando ? 'Sincronizando...' : 'Sincronizar BrasilAPI'}
          </Button>
        </div>
      </div>

      {/* Adicionar feriado manual */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-slate-400">Data</Label>
            <Input
              type="date"
              value={novoFeriado.data}
              onChange={(e) => setNovoFeriado(prev => ({ ...prev, data: e.target.value }))}
              className="bg-slate-800/50 border-slate-700 text-white text-sm"
            />
          </div>
          <div className="space-y-1.5 flex-[2]">
            <Label className="text-xs text-slate-400">Nome</Label>
            <Input
              value={novoFeriado.nome}
              onChange={(e) => setNovoFeriado(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: São Sebastião, Recesso escolar..."
              className="bg-slate-800/50 border-slate-700 text-white text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Tipo</Label>
            <Select
              value={novoFeriado.tipo}
              onValueChange={(v) => setNovoFeriado(prev => ({ ...prev, tipo: v as Feriado['tipo'] }))}
            >
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="municipal">Municipal</SelectItem>
                <SelectItem value="recesso">Recesso</SelectItem>
                <SelectItem value="national">Nacional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={adicionarFeriado} disabled={adicionando} className="bg-rose-600 hover:bg-rose-500 text-white">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Lista de feriados */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 overflow-hidden">
        {loadingFeriados ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-slate-400 text-sm">Carregando feriados...</div>
          </div>
        ) : feriados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <CalendarOff className="w-8 h-8 text-slate-600" />
            <p className="text-slate-500 text-sm">Nenhum feriado cadastrado para {anoFeriados}</p>
            <p className="text-slate-600 text-xs">
              Use o botão "Sincronizar BrasilAPI" para importar feriados nacionais
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs text-slate-400">
                  <th className="text-left px-4 py-2.5 font-medium">Data</th>
                  <th className="text-left px-4 py-2.5 font-medium">Feriado</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                  <th className="text-center px-4 py-2.5 font-medium">Ativo</th>
                  <th className="text-center px-4 py-2.5 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {feriados.map(f => {
                  const dataFormatada = new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'short', day: '2-digit', month: 'short',
                  });
                  const passado = new Date(f.data) < new Date(new Date().toISOString().split('T')[0]);

                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        'border-b border-slate-800/50 text-sm',
                        !f.ativo && 'opacity-50',
                        passado && 'text-slate-500',
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{dataFormatada}</td>
                      <td className="px-4 py-2.5 text-white">{f.nome}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          f.tipo === 'national' && 'bg-sky-500/20 text-sky-400',
                          f.tipo === 'municipal' && 'bg-amber-500/20 text-amber-400',
                          f.tipo === 'recesso' && 'bg-violet-500/20 text-violet-400',
                        )}>
                          {TIPO_LABELS[f.tipo] || f.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Switch checked={f.ativo} onCheckedChange={() => toggleFeriado(f)} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {f.tipo !== 'national' && (
                          <button
                            onClick={() => removerFeriado(f)}
                            className="text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remover feriado"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
