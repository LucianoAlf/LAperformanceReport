import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, TestTube, Save, Loader2, CheckCircle2, XCircle,
  Wifi, WifiOff, Phone, Globe, Key, Tag, Building2, Copy, RefreshCw, Zap, QrCode,
  Smartphone, Pencil, ArrowLeft,
} from 'lucide-react';

const UAZAPI_URL_PADRAO = 'https://lamusic.uazapi.com';

// Paleta de cores para o avatar fallback (iniciais).
// Index escolhido por hash determinístico do nome — mesma instância sempre tem a mesma cor.
const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-indigo-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
];

function hashIndex(texto: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(hash) % modulo;
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { WhatsAppCaixa, FuncaoCaixa } from '../../types';
import { ModalReconectarWhatsApp } from './ModalReconectarWhatsApp';

interface UnidadeOption {
  id: string;
  nome: string;
  codigo: string;
}

interface CaixaForm {
  id?: number;
  nome: string;
  numero: string;
  uazapi_url: string;
  uazapi_token: string;
  unidade_id: string;
  webhook_url: string;
  ativo: boolean;
  funcao: FuncaoCaixa;
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  phone?: string;
  instanceName?: string;
}

interface InstanciaUazapi {
  id: string;
  token: string;
  status: string;
  nome: string;
  numero: string | null;
  profile_pic_url: string | null;
  is_business: boolean;
}

const emptyCaixa: CaixaForm = {
  nome: '',
  numero: '',
  uazapi_url: '',
  uazapi_token: '',
  unidade_id: '',
  webhook_url: '',
  ativo: true,
  funcao: 'agente',
};

export function CaixasManager() {
  const [caixas, setCaixas] = useState<WhatsAppCaixa[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<CaixaForm | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [newTestResult, setNewTestResult] = useState<TestResult>({ status: 'idle' });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [caixaReconectar, setCaixaReconectar] = useState<WhatsAppCaixa | null>(null);
  const [instancias, setInstancias] = useState<InstanciaUazapi[]>([]);
  const [loadingInstancias, setLoadingInstancias] = useState(false);
  const [instanciaSelecionada, setInstanciaSelecionada] = useState<string>('');
  const [erroInstancias, setErroInstancias] = useState<string | null>(null);
  const [instanciaFotoQuebrada, setInstanciaFotoQuebrada] = useState<Record<string, boolean>>({});

  const fetchCaixas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_caixas')
      .select('*')
      .order('id');
    if (!error && data) setCaixas(data);
    setLoading(false);
  }, []);

  const fetchUnidades = useCallback(async () => {
    const { data } = await supabase
      .from('unidades')
      .select('id, nome, codigo')
      .eq('ativo', true)
      .order('nome');
    if (data) setUnidades(data);
  }, []);

  useEffect(() => {
    fetchCaixas();
    fetchUnidades();
  }, [fetchCaixas, fetchUnidades]);

  useEffect(() => {
    if (sucesso || erro) {
      const timer = setTimeout(() => { setSucesso(null); setErro(null); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [sucesso, erro]);

  const resetSeletorInstancias = () => {
    setInstancias([]);
    setInstanciaSelecionada('');
    setErroInstancias(null);
    setInstanciaFotoQuebrada({});
  };

  const handleBuscarInstancias = async () => {
    setLoadingInstancias(true);
    setErroInstancias(null);
    try {
      const { data, error } = await supabase.functions.invoke('listar-instancias-uazapi');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInstancias(data?.instancias || []);
      if (data?.uazapi_url && editando && !editando.uazapi_url) {
        setEditando(prev => prev ? { ...prev, uazapi_url: data.uazapi_url } : prev);
      }
      if (!data?.instancias?.length) {
        setErroInstancias('Nenhuma instância retornada pelo servidor');
      }
    } catch (e: any) {
      setErroInstancias(e?.message || 'Erro ao buscar instâncias');
    } finally {
      setLoadingInstancias(false);
    }
  };

  const handleSelecionarInstancia = (instanciaId: string) => {
    setInstanciaSelecionada(instanciaId);
    if (!editando) return;
    const inst = instancias.find(i => i.id === instanciaId);
    if (!inst) return;
    setEditando({
      ...editando,
      uazapi_token: inst.token,
      uazapi_url: editando.uazapi_url || UAZAPI_URL_PADRAO,
      numero: inst.numero || editando.numero,
      nome: editando.nome || inst.nome,
    });
  };

  const handleTestarConexao = async (caixaId?: number, url?: string, token?: string) => {
    const uazapiUrl = url || '';
    const uazapiToken = token || '';

    if (!uazapiUrl || !uazapiToken) {
      if (caixaId) {
        setTestResults(prev => ({ ...prev, [caixaId]: { status: 'error', message: 'URL e Token são obrigatórios' } }));
      } else {
        setNewTestResult({ status: 'error', message: 'URL e Token são obrigatórios' });
      }
      return;
    }

    if (caixaId) {
      setTestResults(prev => ({ ...prev, [caixaId]: { status: 'testing' } }));
    } else {
      setNewTestResult({ status: 'testing' });
    }

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-status', {
        body: { action: 'status', ...(caixaId ? { caixa_id: caixaId } : {}) },
      });

      if (error) throw error;

      // Se não tem caixa_id, testar diretamente via fetch
      let result = data;
      if (!caixaId) {
        let baseUrl = uazapiUrl;
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = 'https://' + baseUrl;
        }
        const resp = await fetch(`${baseUrl}/status`, {
          method: 'GET',
          headers: { 'token': uazapiToken },
        });
        result = await resp.json();
      }

      const connected = result?.connected === true;

      const phone = result?.phone || result?.number;

      const instanceName = result?.instanceName;

      const testResult: TestResult = connected
        ? { status: 'success', message: phone ? `Conectado (${phone})` : 'Conectado', phone, instanceName }
        : { status: 'error', message: 'Sem número conectado' };

      if (caixaId) {
        setTestResults(prev => ({ ...prev, [caixaId]: testResult }));
      } else {
        setNewTestResult(testResult);
      }
    } catch (err: any) {
      const testResult: TestResult = { status: 'error', message: err.message || 'Erro ao testar' };
      if (caixaId) {
        setTestResults(prev => ({ ...prev, [caixaId]: testResult }));
      } else {
        setNewTestResult(testResult);
      }
    }
  };

  const handleSalvar = async () => {
    if (!editando) return;
    if (!editando.nome || !editando.uazapi_url || !editando.uazapi_token) {
      setErro('Nome, URL e Token são obrigatórios');
      return;
    }

    if ((editando.funcao === 'agente' || editando.funcao === 'administrativo') && !editando.unidade_id) {
      setErro(`Caixas com função ${editando.funcao === 'agente' ? 'Agente' : 'Administrativo'} devem ter uma unidade vinculada`);
      return;
    }

    setSaving(true);
    setErro(null);

    try {
      const payload = {
        nome: editando.nome,
        numero: editando.numero,
        uazapi_url: editando.uazapi_url,
        uazapi_token: editando.uazapi_token,
        unidade_id: editando.unidade_id || null,
        webhook_url: editando.webhook_url,
        ativo: editando.ativo,
        funcao: editando.funcao,
      };

      if (editando.id) {
        const { error } = await supabase
          .from('whatsapp_caixas')
          .update(payload)
          .eq('id', editando.id);
        if (error) throw error;
        setSucesso('Caixa atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('whatsapp_caixas')
          .insert(payload);
        if (error) throw error;
        setSucesso('Caixa criada com sucesso!');
      }

      setEditando(null);
      setNewTestResult({ status: 'idle' });
      resetSeletorInstancias();
      await fetchCaixas();
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (id: number) => {
    const caixa = caixas.find(c => c.id === id);
    if (!confirm(`Tem certeza que deseja excluir a caixa "${caixa?.nome || id}"? Conversas existentes não serão apagadas.`)) return;
    const { error } = await supabase.from('whatsapp_caixas').delete().eq('id', id);
    if (error) {
      setErro('Erro ao excluir caixa. Tente novamente.');
      console.error('[CaixasManager] Erro ao excluir:', error);
    } else {
      setSucesso('Caixa excluída!');
      await fetchCaixas();
    }
  };

  const gerarWebhookUrl = (caixaId?: number) => {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const id = caixaId || 'NOVO';
    return `${supabaseUrl}/functions/v1/webhook-whatsapp-inbox?caixa_id=${id}`;
  };

  const copiarWebhook = (url: string) => {
    navigator.clipboard.writeText(url);
    setSucesso('URL do webhook copiada!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Phone className="w-5 h-5 text-emerald-400" />
            Caixas WhatsApp
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie os números WhatsApp conectados via UAZAPI
          </p>
        </div>
        <button
          onClick={() => {
            setEditando({ ...emptyCaixa, uazapi_url: UAZAPI_URL_PADRAO });
            setNewTestResult({ status: 'idle' });
            resetSeletorInstancias();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Caixa
        </button>
      </div>

      {/* Alertas */}
      {erro && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{erro}</span>
        </div>
      )}
      {sucesso && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-300">{sucesso}</span>
        </div>
      )}

      {/* Formulário de edição/criação */}
      {editando && (
        <div className="bg-slate-800/80 border border-violet-500/30 rounded-2xl p-6 space-y-4">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            {editando.id ? (
              <>
                <Pencil className="w-4 h-4 text-amber-400" />
                Editar Caixa
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 text-violet-400" />
                Nova Caixa
              </>
            )}
          </h4>

          {/* Seletor de instância UAZAPI: puxa lista do servidor e preenche token + número */}
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-cyan-300 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-cyan-200">Vincular a um número conectado na UAZAPI</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Lista as instâncias do servidor e preenche token e número automaticamente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleBuscarInstancias}
                disabled={loadingInstancias}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {loadingInstancias ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {instancias.length ? 'Atualizar lista' : 'Buscar instâncias'}
              </button>
            </div>

            {erroInstancias && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                <XCircle className="w-3 h-3 flex-shrink-0" />
                <span>{erroInstancias}</span>
              </div>
            )}

            {instancias.length > 0 && (() => {
              // Quando há instância selecionada, mostra apenas ela + botão "Trocar".
              // Caso contrário, lista todas como cards selecionáveis.
              const lista = instanciaSelecionada
                ? instancias.filter(i => i.id === instanciaSelecionada)
                : instancias;

              return (
                <div className="space-y-2">
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {lista.map(inst => {
                      const isSelected = instanciaSelecionada === inst.id;
                      const statusConfig = inst.status === 'connected'
                        ? { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Conectado', pulse: true }
                        : inst.status === 'connecting'
                        ? { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Conectando', pulse: true }
                        : { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Desconectado', pulse: false };

                      const gradiente = AVATAR_GRADIENTS[hashIndex(inst.nome || inst.id, AVATAR_GRADIENTS.length)];
                      const isDisconnected = inst.status === 'disconnected';
                      // Desconectado: ignora foto (vem cacheada antiga e baixa qualidade) e usa iniciais.
                      const usarFoto = inst.profile_pic_url && !isDisconnected && !instanciaFotoQuebrada[inst.id];

                      return (
                        <button
                          key={inst.id}
                          type="button"
                          onClick={() => handleSelecionarInstancia(inst.id)}
                          disabled={isSelected}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left',
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-400/50 ring-1 ring-cyan-400/30 cursor-default'
                              : 'bg-slate-900/40 border-slate-700/30 hover:bg-slate-800/60 hover:border-slate-600/50',
                            isDisconnected && !isSelected && 'opacity-70',
                          )}
                        >
                          <div className={cn(
                            'w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 overflow-hidden',
                            usarFoto ? 'border-white/10' : `bg-gradient-to-br ${gradiente} border-white/10`,
                            isDisconnected && 'grayscale',
                          )}>
                            {usarFoto ? (
                              <img
                                src={inst.profile_pic_url!}
                                alt={inst.nome}
                                className="w-full h-full object-cover"
                                onError={() => setInstanciaFotoQuebrada(prev => ({ ...prev, [inst.id]: true }))}
                              />
                            ) : (
                              <span className="text-xs font-semibold text-white drop-shadow-sm">
                                {iniciaisDe(inst.nome)}
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-sm font-medium truncate', isDisconnected ? 'text-slate-300' : 'text-white')}>
                                {inst.nome}
                              </span>
                              {inst.is_business && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded uppercase tracking-wide">
                                  Business
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-mono truncate">
                              {inst.numero || 'sem número'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot, statusConfig.pulse && 'animate-pulse')} />
                            <span className={cn('text-[10px] font-medium', statusConfig.text)}>
                              {statusConfig.label}
                            </span>
                          </div>

                          {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-300 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {instanciaSelecionada && (
                    <button
                      type="button"
                      onClick={() => setInstanciaSelecionada('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Trocar instância
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome */}
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Nome da Caixa *
              </label>
              <input
                type="text"
                value={editando.nome}
                onChange={e => setEditando({ ...editando, nome: e.target.value })}
                placeholder="Ex: CG Principal, Recreio, Barra..."
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-violet-500/50 focus:outline-none"
              />
            </div>

            {/* Número */}
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Número WhatsApp
              </label>
              <input
                type="text"
                value={editando.numero}
                onChange={e => setEditando({ ...editando, numero: e.target.value })}
                placeholder="5521998250178"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-violet-500/50 focus:outline-none"
              />
            </div>

            {/* UAZAPI URL */}
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3" /> UAZAPI URL *
              </label>
              <input
                type="text"
                value={editando.uazapi_url}
                onChange={e => setEditando({ ...editando, uazapi_url: e.target.value })}
                placeholder="https://seuservidor.uazapi.com"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-violet-500/50 focus:outline-none"
              />
            </div>

            {/* UAZAPI Token */}
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Key className="w-3 h-3" /> UAZAPI Token *
              </label>
              <input
                type="text"
                value={editando.uazapi_token}
                onChange={e => setEditando({ ...editando, uazapi_token: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-violet-500/50 focus:outline-none font-mono text-xs"
              />
            </div>

            {/* Função */}
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Função da Caixa *
              </label>
              <select
                value={editando.funcao}
                onChange={e => {
                  const novaFuncao = e.target.value as FuncaoCaixa;
                  setEditando({
                    ...editando,
                    funcao: novaFuncao,
                    unidade_id: novaFuncao === 'sistema' ? '' : editando.unidade_id,
                  });
                  // Nota: 'administrativo' também requer unidade, análogo ao 'agente'
                }}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white focus:border-violet-500/50 focus:outline-none"
              >
                <option value="agente">Agente (CRM — Mila + Andreza)</option>
                <option value="sistema">Sistema (Relatórios e Alertas)</option>
                <option value="ambos">Ambos (Caixa única)</option>
                <option value="administrativo">Administrativo (Caixa de Entrada por Unidade)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                {editando.funcao === 'administrativo'
                  ? 'Administrativo: comunicação direta com alunos da unidade (cobranças, recados).'
                  : 'Agente: mensagens de leads. Sistema: relatórios, notificações, alertas.'}
              </p>
            </div>

            {/* Unidade (obrigatória para agente e administrativo, oculta para sistema) */}
            {editando.funcao !== 'sistema' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Unidade {(editando.funcao === 'agente' || editando.funcao === 'administrativo') && <span className="text-red-400">*</span>}
                </label>
                <select
                  value={editando.unidade_id}
                  onChange={e => setEditando({ ...editando, unidade_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white focus:border-violet-500/50 focus:outline-none"
                >
                  <option value="">{(editando.funcao === 'agente' || editando.funcao === 'administrativo') ? 'Selecione a unidade...' : 'Nenhuma (todas)'}</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} ({u.codigo})</option>
                  ))}
                </select>
                {editando.funcao === 'agente' && (
                  <p className="text-[10px] text-amber-400/70 mt-1">
                    Leads criados automaticamente serão vinculados a esta unidade.
                  </p>
                )}
                {editando.funcao === 'administrativo' && (
                  <p className="text-[10px] text-amber-400/70 mt-1">
                    Mensagens recebidas nesta caixa serão roteadas para a caixa de entrada administrativa da unidade.
                  </p>
                )}
              </div>
            )}

            {/* Ativo */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editando.ativo}
                  onChange={e => setEditando({ ...editando, ativo: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                />
                <span className="text-sm text-slate-300">Caixa ativa</span>
              </label>
            </div>
          </div>

          {/* Webhook URL (auto-gerado) */}
          <div>
            <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
              <Globe className="w-3 h-3" /> URL do Webhook (cole na UAZAPI)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editando.id ? gerarWebhookUrl(editando.id) : gerarWebhookUrl()}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-900/80 border border-slate-700/50 rounded-lg text-xs text-slate-400 font-mono"
              />
              <button
                onClick={() => copiarWebhook(editando.id ? gerarWebhookUrl(editando.id) : gerarWebhookUrl())}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                title="Copiar"
              >
                <Copy className="w-4 h-4 text-slate-300" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Configure esta URL como webhook na UAZAPI. Eventos: messages, messages_update. Excluir: wasSentByApi
            </p>
          </div>

          {/* Teste de conexão */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-700/50">
            <button
              onClick={() => handleTestarConexao(editando.id, editando.uazapi_url, editando.uazapi_token)}
              disabled={newTestResult.status === 'testing' || !editando.uazapi_url || !editando.uazapi_token}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {newTestResult.status === 'testing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              Testar Conexão
            </button>

            {newTestResult.status === 'success' && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <Wifi className="w-4 h-4" />
                <span>{newTestResult.message}</span>
                {newTestResult.instanceName && (
                  <span className="text-xs text-slate-400">({newTestResult.instanceName})</span>
                )}
              </div>
            )}
            {newTestResult.status === 'error' && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <WifiOff className="w-4 h-4" />
                <span>{newTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSalvar}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editando.id ? 'Atualizar' : 'Criar Caixa'}
            </button>
            <button
              onClick={() => { setEditando(null); setNewTestResult({ status: 'idle' }); resetSeletorInstancias(); }}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de caixas */}
      {caixas.length === 0 && !editando ? (
        <div className="text-center py-12 text-slate-500">
          <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma caixa WhatsApp configurada</p>
          <p className="text-xs mt-1">Clique em "Nova Caixa" para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {caixas.map(caixa => {
            const test = testResults[caixa.id] || { status: 'idle' };
            const unidade = unidades.find(u => u.id === caixa.unidade_id);

            return (
              <div
                key={caixa.id}
                className={cn(
                  'bg-slate-800/50 border rounded-xl p-4 transition-colors',
                  caixa.ativo ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{caixa.nome}</h4>
                      {!caixa.ativo && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Inativa</span>
                      )}
                      {unidade && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium">
                          {unidade.codigo}
                        </span>
                      )}
                      {caixa.funcao && (
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-medium',
                          caixa.funcao === 'agente' && 'bg-emerald-500/15 text-emerald-400',
                          caixa.funcao === 'sistema' && 'bg-blue-500/15 text-blue-400',
                          caixa.funcao === 'ambos' && 'bg-amber-500/15 text-amber-400',
                          caixa.funcao === 'administrativo' && 'bg-teal-500/15 text-teal-400',
                        )}>
                          {caixa.funcao === 'agente' ? 'Agente' : caixa.funcao === 'sistema' ? 'Sistema' : caixa.funcao === 'administrativo' ? 'Admin' : 'Ambos'}
                        </span>
                      )}
                      {test.status === 'success' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                          <Wifi className="w-3 h-3" /> Conectado
                        </span>
                      )}
                      {test.status === 'error' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 flex items-center gap-1">
                          <WifiOff className="w-3 h-3" /> {test.message}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {caixa.numero || 'Sem número'}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Globe className="w-3 h-3" /> {caixa.uazapi_url}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Key className="w-3 h-3" /> {caixa.uazapi_token.substring(0, 8)}...
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTestarConexao(caixa.id, caixa.uazapi_url, caixa.uazapi_token)}
                      disabled={test.status === 'testing'}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                      title="Testar conexão"
                    >
                      {test.status === 'testing' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-cyan-400" />
                      )}
                    </button>
                    <button
                      onClick={() => setCaixaReconectar(caixa)}
                      className="p-2 hover:bg-emerald-500/10 rounded-lg transition-colors"
                      title="Reconectar WhatsApp (QR Code)"
                    >
                      <QrCode className="w-4 h-4 text-emerald-400" />
                    </button>
                    <button
                      onClick={() => copiarWebhook(gerarWebhookUrl(caixa.id))}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                      title="Copiar URL do webhook"
                    >
                      <Copy className="w-4 h-4 text-slate-400" />
                    </button>
                    <button
                      onClick={() => {
                        setEditando({
                          id: caixa.id,
                          nome: caixa.nome,
                          numero: caixa.numero || '',
                          uazapi_url: caixa.uazapi_url,
                          uazapi_token: caixa.uazapi_token,
                          unidade_id: caixa.unidade_id || '',
                          webhook_url: caixa.webhook_url || '',
                          ativo: caixa.ativo,
                          funcao: caixa.funcao || 'agente',
                        });
                        setNewTestResult({ status: 'idle' });
                        resetSeletorInstancias();
                      }}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Tag className="w-4 h-4 text-amber-400" />
                    </button>
                    <button
                      onClick={() => handleExcluir(caixa.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalReconectarWhatsApp
        open={!!caixaReconectar}
        onOpenChange={(open) => { if (!open) setCaixaReconectar(null); }}
        caixa={caixaReconectar}
        onReconectado={() => {
          if (caixaReconectar) {
            handleTestarConexao(caixaReconectar.id, caixaReconectar.uazapi_url, caixaReconectar.uazapi_token);
          }
        }}
      />
    </div>
  );
}

export default CaixasManager;
