import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Clock, Smile, Heart, Coffee, Plane, Flag, Hash, Cat } from 'lucide-react';

interface EmojiPickerProps {
  onSelecionar: (emoji: string) => void;
  onFechar: () => void;
}

// Categorias de emojis
const categorias = [
  {
    id: 'frequentes',
    icone: Clock,
    label: 'Frequentes',
    emojis: ['👍', '❤️', '😂', '😊', '🙏', '👏', '🎵', '🎶', '✅', '🔥', '💜', '😍', '🥰', '😘', '🤗', '💪', '🎉', '🎸', '🎹', '🎤', '📞', '📱', '💬', '⭐'],
  },
  {
    id: 'rostos',
    icone: Smile,
    label: 'Rostos',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬'],
  },
  {
    id: 'gestos',
    icone: Hash,
    label: 'Gestos',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿'],
  },
  {
    id: 'coracoes',
    icone: Heart,
    label: 'Corações',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '🫀'],
  },
  {
    id: 'musica',
    icone: Cat,
    label: 'Música & Arte',
    emojis: ['🎵', '🎶', '🎼', '🎹', '🎸', '🎷', '🎺', '🎻', '🪕', '🥁', '🪘', '🎤', '🎧', '🎙️', '📻', '🎬', '🎭', '🎨', '🎪', '🎫', '🎟️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️'],
  },
  {
    id: 'objetos',
    icone: Coffee,
    label: 'Objetos',
    emojis: ['📱', '💻', '📞', '☎️', '📧', '💬', '💭', '🗯️', '📝', '📋', '📌', '📎', '🔗', '📐', '📏', '✂️', '🗑️', '📁', '📂', '📅', '📆', '🗓️', '📊', '📈', '📉', '✅', '❌', '⭕', '❗', '❓', '⚠️', '🔔', '🔕', '💡', '🔍', '🔎'],
  },
  {
    id: 'natureza',
    icone: Plane,
    label: 'Natureza',
    emojis: ['☀️', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '🌈', '☁️', '🌧️', '❄️', '💧', '🌊', '🌸', '🌺', '🌻', '🌹', '🌷', '🌱', '🌿', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏'],
  },
  {
    id: 'bandeiras',
    icone: Flag,
    label: 'Bandeiras',
    emojis: ['🇧🇷', '🇺🇸', '🇦🇷', '🇵🇹', '🇪🇸', '🇫🇷', '🇮🇹', '🇩🇪', '🇬🇧', '🇯🇵', '🇰🇷', '🇨🇳', '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈'],
  },
];

export function EmojiPicker({ onSelecionar, onFechar }: EmojiPickerProps) {
  const [categoriaAtiva, setCategoriaAtiva] = useState('frequentes');
  const [busca, setBusca] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onFechar();
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [onFechar]);

  // Focus na busca ao abrir
  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  const categoriaFiltrada = busca.trim()
    ? [{
        id: 'busca',
        icone: Search,
        label: 'Resultados',
        emojis: categorias.flatMap(c => c.emojis).filter((e, i, arr) => arr.indexOf(e) === i),
      }]
    : categorias;

  const categoriaExibida = busca.trim()
    ? categoriaFiltrada[0]
    : categorias.find(c => c.id === categoriaAtiva) || categorias[0];

  const handleSelecionar = useCallback((emoji: string) => {
    onSelecionar(emoji);
  }, [onSelecionar]);

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 w-[320px] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-150 overflow-hidden"
    >
      {/* Header com busca */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            ref={buscaRef}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar emoji..."
            className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg pl-9 pr-8 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-violet-500 focus:border-transparent outline-none"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Abas de categorias */}
      {!busca.trim() && (
        <div className="flex items-center gap-0.5 px-2 pb-1 border-b border-slate-700/50 overflow-x-auto scrollbar-none">
          {categorias.map((cat) => {
            const Icon = cat.icone;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoriaAtiva(cat.id)}
                className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                  categoriaAtiva === cat.id
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                }`}
                title={cat.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Grid de emojis */}
      <div className="px-2 py-2 h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider px-1 mb-1.5">
          {categoriaExibida.label}
        </p>
        <div className="grid grid-cols-8 gap-0.5">
          {categoriaExibida.emojis.map((emoji, idx) => (
            <button
              key={`${emoji}-${idx}`}
              onClick={() => handleSelecionar(emoji)}
              className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-slate-700/60 hover:scale-110 transition-all duration-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
