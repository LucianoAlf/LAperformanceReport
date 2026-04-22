import { useState, useEffect } from 'react';
import { Settings, Clock, Users, Save, Power, CalendarOff, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface ConfigVisitasTabProps {
  unidadeId: string;
}

interface VisitaConfig {
  id?: string;
  unidade_id: string;
  max_visitas_por_horario: number;
  horario_inicio_seg_sex: string;
  horario_fim_seg_sex: string;
  horario_inicio_sab: string;
  horario_fim_sab: string;
  ativo: boolean;
}

interface Feriado {
  id: string;
  data: string;
  nome: string;
  tipo: 'national' | 'municipal' | 'recesso';
  ativo: boolean;
}

const UNIDADES: Record<string, string> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
};

const CONFIG_PADRAO: Omit<VisitaConfig, 'unidade_id'> = {
  max_visitas_por_horario: 2,
  horario_inicio_seg_sex: '11:00',
  horario_fim_seg_sex: '20:00',
  horario_inicio_sab: '08:00',
  horario_fim_sab: '14:00',
  ativo: false,
};

const TIPO_LABELS: Record<string, string> = {
  national: 'Nacional',
  municipal: 'Municipal',
  recesso: 'Recesso',
};

export function ConfigVisitasTab({ unidadeId }: ConfigVisitasTabProps) {
  const [configs, setConfigs] = useState<Record<string, VisitaConfig>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Feriados
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loadingFeriados, setLoadingFeriados] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [anoFeriados, setAnoFeriados] = useState(new Date().getFullYear());
  const [novoFeriado, setNovoFeriado] = useState({ data: '', nome: '', tipo: 'municipal' as Feriado['tipo'] });
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadFeriados();
  }, []);

  useEffect(() => {
    loadFeriados();
  }, [anoFeriados]);

  // ── Config de visitas ──────────────────────────────────────────────────

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('visitas_config').select('*');
      const map: Record<string, VisitaConfig> = {};
      (data || []).forEach((c: any) => {
        map[c.unidade_id] = {
          id: c.id,
          unidade_id: c.unidade_id,
          max_visitas_por_horario: c.max_visitas_por_horario,
          horario_inicio_seg_sex: c.horario_inicio_seg_sex?.substring(0, 5) || '11:00',
          horario_fim_seg_sex: c.horario_fim_seg_sex?.substring(0, 5) || '20:00',
          horario_inicio_sab: c.horario_inicio_sab?.substring(0, 5) || '08:00',
          horario_fim_sab: c.horario_fim_sab?.substring(0, 5) || '14:00',
          ativo: c.ativo,
        };
      });
      setConfigs(map);
    } finally {
      setLoading(false);
    }
  };

  const getConfig = (uid: string): VisitaConfig => {
    return configs[uid] || { ...CONFIG_PADRAO, unidade_id: uid };
  };

  const updateLocal = (uid: string, field: keyof VisitaConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [uid]: { ...getConfig(uid), [field]: value },
    }));
  };

  const salvar = async (uid: string) => {
    setSalvando(uid);
    try {
      const config = getConfig(uid);
      const payload = {
        unidade_id: uid,
        max_visitas_por_horario: config.max_visitas_por_horario,
        horario_inicio_seg_sex: config.horario_inicio_seg_sex,
        horario_fim_seg_sex: config.horario_fim_seg_sex,
        horario_inicio_sab: config.horario_inicio_sab,
        horario_fim_sab: config.horario_fim_sab,
        ativo: config.ativo,
      };

      if (config.id) {
        const { error } = await supabase.from('visitas_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('visitas_config')
          .upsert(payload, { onConflict: 'unidade_id' })
          .select('id')
          .single();
        if (error) throw error;
        if (data) {
          setConfigs(prev => ({ ...prev, [uid]: { ...getConfig(uid), id: data.id } }));
        }
      }
      toast.success(`Configuração de ${UNIDADES[uid] || 'unidade'} salva`);
    } catch (err) {
      console.error('Erro ao salvar config:', err);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSalvando(null);
    }
  };

  // ── Feriados ───────────────────────────────────────────────────────────

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
      const res = await supabase.functions.invoke('sync-feriados', {
        body: { ano: anoFeriados },
      });
      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`${result.inseridos} feriados sincronizados para ${anoFeriados}`);
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
    const { error } = await supabase
      .from('feriados')
      .update({ ativo: novoAtivo })
      .eq('id', feriado.id);
    if (error) {
      toast.error('Erro ao atualizar feriado');
      return;
    }
    setFeriados(prev => prev.map(f => f.id === feriado.id ? { ...f, ativo: novoAtivo } : f));
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

  // Filtrar unidades a exibir
  const unidadesExibir = unidadeId === 'todos'
    ? Object.keys(UNIDADES)
    : [unidadeId].filter(u => UNIDADES[u]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm">Carregando configurações...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ═══ SEÇÃO 1: CONFIG VISITAS ═══ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Settings className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Configuração de Visitas</h2>
            <p className="text-sm text-slate-400">Horários de funcionamento e limite de visitas por unidade</p>
          </div>
        </div>

        <div className="grid gap-4">
          {unidadesExibir.map(uid => {
            const config = getConfig(uid);
            const nome = UNIDADES[uid] || uid;

            return (
              <div
                key={uid}
                className={cn(
                  'rounded-xl border p-6 space-y-5',
                  config.ativo
                    ? 'border-violet-500/30 bg-slate-900/50'
                    : 'border-slate-700/50 bg-slate-900/30 opacity-75'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full', config.ativo ? 'bg-emerald-400' : 'bg-slate-500')} />
                    <h3 className="text-base font-semibold text-white">{nome}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Power className={cn('w-4 h-4', config.ativo ? 'text-emerald-400' : 'text-slate-500')} />
                    <Label className="text-xs text-slate-400">{config.ativo ? 'Ativo' : 'Inativo'}</Label>
                    <Switch checked={config.ativo} onCheckedChange={(v) => updateLocal(uid, 'ativo', v)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Clock className="w-4 h-4 text-sky-400" />
                      Segunda a Sexta
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">Início</Label>
                        <Input type="time" value={config.horario_inicio_seg_sex} onChange={(e) => updateLocal(uid, 'horario_inicio_seg_sex', e.target.value)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">Fim</Label>
                        <Input type="time" value={config.horario_fim_seg_sex} onChange={(e) => updateLocal(uid, 'horario_fim_seg_sex', e.target.value)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Sábado
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">Início</Label>
                        <Input type="time" value={config.horario_inicio_sab} onChange={(e) => updateLocal(uid, 'horario_inicio_sab', e.target.value)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400">Fim</Label>
                        <Input type="time" value={config.horario_fim_sab} onChange={(e) => updateLocal(uid, 'horario_fim_sab', e.target.value)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-violet-400" />
                      <Label className="text-xs text-slate-400">Máx. visitas por horário</Label>
                    </div>
                    <Input type="number" min={1} max={20} value={config.max_visitas_por_horario} onChange={(e) => updateLocal(uid, 'max_visitas_por_horario', Number(e.target.value))} className="w-20 bg-slate-800/50 border-slate-700 text-white text-sm" />
                  </div>
                  <Button onClick={() => salvar(uid)} disabled={salvando === uid} className="bg-violet-600 hover:bg-violet-500 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {salvando === uid ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SEÇÃO 2: FERIADOS ═══ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
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
              <Select value={novoFeriado.tipo} onValueChange={(v) => setNovoFeriado(prev => ({ ...prev, tipo: v as Feriado['tipo'] }))}>
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
            <Button
              onClick={adicionarFeriado}
              disabled={adicionando}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
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
              <p className="text-slate-600 text-xs">Use o botão "Sincronizar BrasilAPI" para importar feriados nacionais</p>
            </div>
          ) : (
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
                        <Switch
                          checked={f.ativo}
                          onCheckedChange={() => toggleFeriado(f)}
                        />
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
          )}
        </div>
      </div>
    </div>
  );
}
