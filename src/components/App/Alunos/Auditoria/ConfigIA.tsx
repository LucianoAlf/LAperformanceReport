import { useState, useEffect } from 'react';
import { Settings, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
    const [model, setModel] = useState('gpt-4o-mini');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        supabase.from('bi_agent_config_lamusic').select('model').eq('is_active', true).limit(1).single()
            .then(({ data }) => { if (data?.model) setModel(data.model); });
    }, []);

    const handleModelChange = async (newModel: string) => {
        setModel(newModel);
        setSaving(true);
        setSaved(false);
        await supabase.from('bi_agent_config_lamusic').update({ model: newModel }).eq('is_active', true);
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
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

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        A API key é gerenciada no servidor. O modelo selecionado será usado pelo agente BI.
                    </p>
                </div>
            )}
        </div>
    );
}
