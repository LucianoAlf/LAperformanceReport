'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface SugestaoLead {
  id: number;
  nome: string;
  telefone?: string;
  tipo: 'lead' | 'experimental_realizada' | 'experimental_agendada' | 'experimental_faltou';
  canal_origem_id: number | null;
  curso_id: number | null;
  professor_id: number | null;
  data: string;
}

interface ComboboxNomeProps {
  value: string;
  onChange: (value: string) => void;
  onSelectSugestao?: (sugestao: SugestaoLead) => void;
  sugestoes: SugestaoLead[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  mostrarTipo?: boolean;
}

export function ComboboxNome({
  value,
  onChange,
  onSelectSugestao,
  sugestoes,
  placeholder = 'Digite o nome...',
  disabled = false,
  className,
  mostrarTipo = true,
}: ComboboxNomeProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleSelect = (sugestao: SugestaoLead) => {
    setInputValue(sugestao.nome);
    // Se tem onSelectSugestao, ele é responsável por atualizar o estado completo
    // Não chamar onChange para evitar sobrescrever os campos preenchidos
    if (onSelectSugestao) {
      onSelectSugestao(sugestao);
    } else {
      onChange(sugestao.nome);
    }
    setOpen(false);
  };

  const handleCreateNew = () => {
    onChange(inputValue);
    setOpen(false);
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'lead':
        return { label: 'Lead', color: 'text-blue-400', icon: '🔵' };
      case 'experimental_realizada':
        return { label: 'Exp. Realizada', color: 'text-purple-400', icon: '🟣' };
      case 'experimental_agendada':
        return { label: 'Exp. Agendada', color: 'text-amber-400', icon: '🟡' };
      case 'experimental_faltou':
        return { label: 'Exp. Faltou', color: 'text-red-400', icon: '🔴' };
      default:
        return { label: tipo, color: 'text-slate-400', icon: '⚪' };
    }
  };

  const formatData = (dataStr: string) => {
    const data = new Date(dataStr);
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const sugestoesFiltradas = sugestoes.filter((s) =>
    s.nome.toLowerCase().includes(inputValue.toLowerCase())
  );

  const temSugestaoExata = sugestoesFiltradas.some(
    (s) => s.nome.toLowerCase() === inputValue.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-8 text-xs font-normal',
            'bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700/50',
            !value && 'text-slate-500',
            className
          )}
        >
          <span className="truncate">
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[300px] p-0 bg-slate-900 border-slate-700" 
        align="start"
        style={{ zIndex: 999999 }}
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Buscar ou digitar nome..."
            value={inputValue}
            onValueChange={handleInputChange}
            className="h-9 text-white"
          />
          <CommandList>
            <CommandEmpty className="py-2 px-3 text-sm text-slate-400">
              Nenhuma sugestão encontrada
            </CommandEmpty>
            
            {sugestoesFiltradas.length > 0 && (
              <CommandGroup heading="Sugestões do funil">
                {sugestoesFiltradas.slice(0, 8).map((sugestao) => {
                  const tipoInfo = getTipoLabel(sugestao.tipo);
                  return (
                    <CommandItem
                      key={sugestao.id}
                      value={sugestao.nome}
                      onSelect={() => handleSelect(sugestao)}
                      className="cursor-pointer hover:bg-slate-800"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === sugestao.nome ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-white truncate">{sugestao.nome}</span>
                        {mostrarTipo && (
                          <span className={cn('text-xs', tipoInfo.color)}>
                            {tipoInfo.icon} {tipoInfo.label} • {formatData(sugestao.data)}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {inputValue && !temSugestaoExata && (
              <CommandGroup heading="Criar novo">
                <CommandItem
                  value={`criar-${inputValue}`}
                  onSelect={handleCreateNew}
                  className="cursor-pointer hover:bg-slate-800"
                >
                  <Plus className="mr-2 h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">
                    Criar "{inputValue}" como novo
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default ComboboxNome;
