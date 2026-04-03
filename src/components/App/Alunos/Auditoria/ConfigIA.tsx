import { useState, useEffect, useRef } from 'react';
import { Settings, CheckCircle, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const MODELOS_DISPONIVEIS = [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Recomendado)' },
    { id: 'gpt-4o', label: 'GPT-4o (Mais capaz)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

interface ConfigIAProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

export function ConfigIA({ collapsed = true, onToggle }: ConfigIAProps) {
    const { isAdmin } = useAuth();
    const [model, setModel] = useState('gpt-4o-mini');
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [savedKey, setSavedKey] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        supabase.from('bi_agent_config_lamusic').select('model').eq('is_active', true).limit(1).single()
            .then(({ data }) => { if (data?.model) setModel(data.model); });

        if (isAdmin) {
            supabase.from('assistente_ia_config').select('openai_api_key').limit(1).single()
                .then(({ data }) => { if (data?.openai_api_key) setApiKey(data.openai_api_key); });
        }
    }, [isAdmin]);

    const handleModelChange = async (newModel: string) => {
        setModel(newModel);
        setSaving(true);
        setSaved(false);
        await supabase.from('bi_agent_config_lamusic').update({ model: newModel }).eq('is_active', true);
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleApiKeyChange = (value: string) => {
        setApiKey(value);
        setSavedKey(false);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSavingKey(true);
            await supabase.from('assistente_ia_config').update({
                openai_api_key: value,
                updated_at: new Date().toISOString(),
            }).eq('id', 1);
            setSavingKey(false);
            setSavedKey(true);
            setTimeout(() => setSavedKey(false), 2000);
        }, 800);
    };

    return (
        <div className="border border-slate-700/60 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 transition-colors text-left"
            >
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-300 flex-1">Configuração IA</span>
                <svg
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {!collapsed && (
                <div className="p-3 space-y-3 bg-slate-900/40">
                    {/* Modelo */}
                    <div>
                        <label className="text-xs text-slate-400 mb-1 block">Modelo</label>
                        <div className="flex items-center gap-2">
                            <select
                                value={model}
                                onChange={(e) => handleModelChange(e.target.value)}
                                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                            >
                                {MODELOS_DISPONIVEIS.map(m => (
                                    <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                            </select>
                            {saving && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />}
                            {saved && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                    </div>

                    {/* API Key — só admin */}
                    {isAdmin && (
                        <div>
                            <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                <KeyRound className="w-3 h-3" />
                                OpenAI API Key
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => handleApiKeyChange(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 pr-8 font-mono"
                                    />
                                    <button
                                        onClick={() => setShowKey(!showKey)}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                {savingKey && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />}
                                {savedKey && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                            </div>
                        </div>
                    )}

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        {isAdmin ? 'A API key é salva no banco e usada pelo agente BI server-side.' : 'A API key é gerenciada pelo administrador.'}
                    </p>
                </div>
            )}
        </div>
    );
}
