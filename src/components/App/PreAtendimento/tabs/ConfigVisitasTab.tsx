import { useState, useEffect } from 'react';
import { Settings, Clock, Users, Save, Power } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

export function ConfigVisitasTab({ unidadeId }: ConfigVisitasTabProps) {
  const [configs, setConfigs] = useState<Record<string, VisitaConfig>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Carregar configs de todas as unidades
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('visitas_config')
        .select('*');

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
        const { error } = await supabase
          .from('visitas_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('visitas_config')
          .upsert(payload, { onConflict: 'unidade_id' })
          .select('id')
          .single();
        if (error) throw error;
        if (data) {
          setConfigs(prev => ({
            ...prev,
            [uid]: { ...getConfig(uid), id: data.id },
          }));
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/20">
          <Settings className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Configuração de Visitas</h2>
          <p className="text-sm text-slate-400">Horários de funcionamento e limite de visitas por unidade</p>
        </div>
      </div>

      {/* Cards por unidade */}
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
              {/* Cabeçalho da unidade */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    config.ativo ? 'bg-emerald-400' : 'bg-slate-500'
                  )} />
                  <h3 className="text-base font-semibold text-white">{nome}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Power className={cn('w-4 h-4', config.ativo ? 'text-emerald-400' : 'text-slate-500')} />
                    <Label className="text-xs text-slate-400">
                      {config.ativo ? 'Ativo' : 'Inativo'}
                    </Label>
                    <Switch
                      checked={config.ativo}
                      onCheckedChange={(v) => updateLocal(uid, 'ativo', v)}
                    />
                  </div>
                </div>
              </div>

              {/* Configurações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Seg-Sex */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Clock className="w-4 h-4 text-sky-400" />
                    Segunda a Sexta
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Início</Label>
                      <Input
                        type="time"
                        value={config.horario_inicio_seg_sex}
                        onChange={(e) => updateLocal(uid, 'horario_inicio_seg_sex', e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Fim</Label>
                      <Input
                        type="time"
                        value={config.horario_fim_seg_sex}
                        onChange={(e) => updateLocal(uid, 'horario_fim_seg_sex', e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Sábado */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Sábado
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Início</Label>
                      <Input
                        type="time"
                        value={config.horario_inicio_sab}
                        onChange={(e) => updateLocal(uid, 'horario_inicio_sab', e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Fim</Label>
                      <Input
                        type="time"
                        value={config.horario_fim_sab}
                        onChange={(e) => updateLocal(uid, 'horario_fim_sab', e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Limite + Botão salvar */}
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-400" />
                    <Label className="text-xs text-slate-400">Máx. visitas por horário</Label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={config.max_visitas_por_horario}
                    onChange={(e) => updateLocal(uid, 'max_visitas_por_horario', Number(e.target.value))}
                    className="w-20 bg-slate-800/50 border-slate-700 text-white text-sm"
                  />
                </div>
                <Button
                  onClick={() => salvar(uid)}
                  disabled={salvando === uid}
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {salvando === uid ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
