import { useEffect, useState } from 'react';
import { Bot, Save, Power, Plus, Eye, EyeOff, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { UNIDADES } from './unidades';

interface MilaSectionProps {
  /** Unidade escolhida no topo da aba Configurações. */
  unidadeId: string;
  /** Leva o usuário para a subaba Conhecimento (dona da base hoje). */
  onIrParaConhecimento: () => void;
}

interface MilaConfig {
  id?: number;
  unidade_id: string;
  ativo: boolean;
  prompt_sistema: string;
  modelo_openai: string;
  temperatura_modelo: number;
  max_tokens: number;
  base_conhecimento: string | null;
  nome_atendente: string | null;
  endereco_unidade: string | null;
  horario_funcionamento: string | null;
  debounce_segundos: number;
  max_mensagens_contexto: number;
  whatsapp_consultor: string | null;
  token_quepasa: string | null;
}

const MILA_CONFIG_PADRAO: Omit<MilaConfig, 'unidade_id' | 'id'> = {
  ativo: false,
  prompt_sistema: '',
  modelo_openai: 'gpt-4o-mini',
  temperatura_modelo: 0.7,
  max_tokens: 1024,
  base_conhecimento: null,
  nome_atendente: 'Mila',
  endereco_unidade: null,
  horario_funcionamento: null,
  debounce_segundos: 10,
  max_mensagens_contexto: 20,
  whatsapp_consultor: null,
  token_quepasa: null,
};

export function MilaSection({ unidadeId, onIrParaConhecimento }: MilaSectionProps) {
  const { usuario } = useAuth();

  const [milaConfig, setMilaConfig] = useState<MilaConfig | null>(null);
  const [loadingMila, setLoadingMila] = useState(true);
  const [salvandoMila, setSalvandoMila] = useState(false);
  const [criandoMila, setCriandoMila] = useState(false);
  const [mostrarToken, setMostrarToken] = useState(false);

  useEffect(() => {
    loadMilaConfig();
  }, [unidadeId]);

  const loadMilaConfig = async () => {
    setLoadingMila(true);
    setMilaConfig(null);
    try {
      const { data, error } = await supabase
        .from('mila_config')
        .select('*')
        .eq('unidade_id', unidadeId)
        .maybeSingle();
      if (error) {
        console.error('Erro ao carregar config Mila:', error);
        toast.error('Erro ao carregar configuração da Mila');
        return;
      }
      setMilaConfig(data as MilaConfig | null);
    } finally {
      setLoadingMila(false);
    }
  };

  const criarMilaConfig = async () => {
    setCriandoMila(true);
    try {
      const { data, error } = await supabase
        .from('mila_config')
        .insert({ ...MILA_CONFIG_PADRAO, unidade_id: unidadeId })
        .select('*')
        .single();
      if (error) throw error;
      setMilaConfig(data as MilaConfig);
      toast.success(`Configuração da Mila criada para ${UNIDADES[unidadeId]}`);
    } catch (err) {
      console.error('Erro ao criar config Mila:', err);
      toast.error('Erro ao criar configuração da Mila');
    } finally {
      setCriandoMila(false);
    }
  };

  const updateMilaLocal = (field: keyof MilaConfig, value: any) => {
    setMilaConfig(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const salvarMila = async () => {
    if (!milaConfig?.id) return;
    setSalvandoMila(true);
    try {
      const { id, unidade_id, ...payload } = milaConfig;
      const { error } = await supabase.from('mila_config').update(payload).eq('id', id);
      if (error) throw error;
      toast.success(`Configuração da Mila salva para ${UNIDADES[unidadeId]}`);
    } catch (err) {
      console.error('Erro ao salvar config Mila:', err);
      toast.error('Erro ao salvar configuração da Mila');
    } finally {
      setSalvandoMila(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <Bot className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Mila - Atendente IA</h2>
          <p className="text-sm text-slate-400">Configuração técnica da assistente virtual</p>
        </div>
      </div>

      {loadingMila ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400 text-sm">Carregando configuração da Mila...</div>
        </div>
      ) : !milaConfig ? (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-8">
          <div className="flex flex-col items-center justify-center gap-4">
            <Bot className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400 text-sm">Mila não configurada para esta unidade</p>
            <Button onClick={criarMilaConfig} disabled={criandoMila} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Plus className="w-4 h-4 mr-2" />
              {criandoMila ? 'Criando...' : 'Criar configuração padrão'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-slate-900/50 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-2 h-2 rounded-full', milaConfig.ativo ? 'bg-emerald-400' : 'bg-slate-500')} />
              <h3 className="text-base font-semibold text-white">{UNIDADES[unidadeId]}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Power className={cn('w-4 h-4', milaConfig.ativo ? 'text-emerald-400' : 'text-slate-500')} />
              <Label className="text-xs text-slate-400">{milaConfig.ativo ? 'Mila ativa' : 'Mila inativa'}</Label>
              <Switch checked={milaConfig.ativo} onCheckedChange={(v) => updateMilaLocal('ativo', v)} />
            </div>
          </div>

          {/* Token QuePasa - apenas para hugo@lamusic.com.br */}
          {usuario?.email === 'hugo@lamusic.com.br' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Token QuePasa</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={mostrarToken ? 'text' : 'password'}
                  value={milaConfig.token_quepasa || ''}
                  onChange={(e) => updateMilaLocal('token_quepasa', e.target.value || null)}
                  className="bg-slate-800/50 border-slate-700 text-white text-sm font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMostrarToken(!mostrarToken)}
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  {mostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Configurações do modelo */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Configurações do modelo</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Modelo OpenAI</Label>
                <Select value={milaConfig.modelo_openai} onValueChange={(v) => updateMilaLocal('modelo_openai', v)}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Temperatura</Label>
                <Input type="number" min={0} max={2} step={0.1} value={milaConfig.temperatura_modelo} onChange={(e) => updateMilaLocal('temperatura_modelo', Number(e.target.value))} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Max tokens</Label>
                <Input type="number" value={milaConfig.max_tokens} onChange={(e) => updateMilaLocal('max_tokens', Number(e.target.value))} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Debounce (segundos)</Label>
                <Input type="number" value={milaConfig.debounce_segundos} onChange={(e) => updateMilaLocal('debounce_segundos', Number(e.target.value))} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Máx mensagens de contexto</Label>
                <Input type="number" value={milaConfig.max_mensagens_contexto} onChange={(e) => updateMilaLocal('max_mensagens_contexto', Number(e.target.value))} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
            </div>
          </div>

          {/* Informações da atendente */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Informações da atendente</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Nome da atendente</Label>
                <Input type="text" value={milaConfig.nome_atendente || ''} onChange={(e) => updateMilaLocal('nome_atendente', e.target.value || null)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">WhatsApp do consultor</Label>
                <Input type="text" value={milaConfig.whatsapp_consultor || ''} onChange={(e) => updateMilaLocal('whatsapp_consultor', e.target.value || null)} className="bg-slate-800/50 border-slate-700 text-white text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Endereço da unidade</Label>
                <Textarea value={milaConfig.endereco_unidade || ''} onChange={(e) => updateMilaLocal('endereco_unidade', e.target.value || null)} className="bg-slate-800/50 border-slate-700 text-white text-sm" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Horário de funcionamento</Label>
                <Textarea value={milaConfig.horario_funcionamento || ''} onChange={(e) => updateMilaLocal('horario_funcionamento', e.target.value || null)} className="bg-slate-800/50 border-slate-700 text-white text-sm" rows={2} />
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Prompt do sistema</h4>
            <Textarea
              value={milaConfig.prompt_sistema}
              onChange={(e) => updateMilaLocal('prompt_sistema', e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white text-sm font-mono"
              rows={8}
            />
          </div>

          {/*
            Base de conhecimento — PRESERVADA em modo leitura.
            O conteúdo foi copiado para `base_conhecimento_blocos` (subaba
            Conhecimento), que é o que a Mila lê hoje. Este campo continua no
            banco, intacto: nada foi apagado. Fica desabilitado para não existirem
            duas telas gravando a mesma informação.
          */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-medium text-slate-300">Base de conhecimento (arquivo)</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={onIrParaConhecimento}
                className="border-cyan-700/50 text-cyan-300 hover:text-white"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Editar na subaba Conhecimento
              </Button>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
              Este texto virou blocos na subaba <strong>Conhecimento</strong>, que é de onde a Mila lê
              hoje. O campo continua aqui só como registro do que existia — editar aqui não muda o que
              ela responde.
            </div>
            <Textarea
              value={milaConfig.base_conhecimento || ''}
              readOnly
              disabled
              className="bg-slate-900/60 border-slate-800 text-slate-500 text-sm cursor-not-allowed"
              rows={6}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvarMila} disabled={salvandoMila} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Save className="w-4 h-4 mr-2" />
              {salvandoMila ? 'Salvando...' : 'Salvar configuração da Mila'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
