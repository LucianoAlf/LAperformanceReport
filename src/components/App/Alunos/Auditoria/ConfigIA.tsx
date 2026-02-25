import { useState } from 'react';
import { Settings, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
    getOpenAIConfig, saveOpenAIConfig, validarApiKey,
    MODELOS_DISPONIVEIS, type OpenAIConfig
} from './useOpenAIAnalysis';

interface ConfigIAProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

export function ConfigIA({ collapsed = true, onToggle }: ConfigIAProps) {
    const [config, setConfig] = useState<OpenAIConfig>(getOpenAIConfig);
    const [showKey, setShowKey] = useState(false);
    const [validando, setValidando] = useState(false);
    const [keyValida, setKeyValida] = useState<boolean | null>(null);

    const handleSave = (newConfig: OpenAIConfig) => {
        setConfig(newConfig);
        saveOpenAIConfig(newConfig);
        setKeyValida(null);
    };

    const handleValidar = async () => {
        if (!config.apiKey) return;
        setValidando(true);
        const ok = await validarApiKey(config.apiKey);
        setKeyValida(ok);
        setValidando(false);
    };

    return (
        <div className="border border-slate-700/60 rounded-lg overflow-hidden">
            {/* Header colapsável */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 transition-colors text-left"
            >
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-300 flex-1">Configuração IA</span>
                {config.apiKey && keyValida === true && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {config.apiKey && keyValida === false && (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                <svg
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Conteúdo */}
            {!collapsed && (
                <div className="p-3 space-y-3 bg-slate-900/40">
                    {/* API Key */}
                    <div>
                        <label className="text-xs text-slate-400 mb-1 block">OpenAI API Key</label>
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={config.apiKey}
                                    onChange={(e) => handleSave({ ...config, apiKey: e.target.value })}
                                    placeholder="sk-..."
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 pr-8"
                                />
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            <button
                                onClick={handleValidar}
                                disabled={!config.apiKey || validando}
                                className="px-2.5 py-1.5 bg-purple-600/80 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded text-xs font-medium transition-colors flex items-center gap-1"
                            >
                                {validando ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Testar'}
                            </button>
                        </div>
                        {keyValida === true && (
                            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> API Key válida
                            </p>
                        )}
                        {keyValida === false && (
                            <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> API Key inválida
                            </p>
                        )}
                    </div>

                    {/* Modelo */}
                    <div>
                        <label className="text-xs text-slate-400 mb-1 block">Modelo</label>
                        <select
                            value={config.model}
                            onChange={(e) => handleSave({ ...config, model: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                            {MODELOS_DISPONIVEIS.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        A chave fica salva apenas no seu navegador (localStorage). Não é enviada para nenhum servidor além da OpenAI.
                    </p>
                </div>
            )}
        </div>
    );
}
