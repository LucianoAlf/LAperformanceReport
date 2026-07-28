"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DatePickerAdmissaoProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Gerar anos de 1990 até o ano atual + 1 (permite admissão futura agendada)
const anoAtual = new Date().getFullYear()
const ANOS = Array.from({ length: anoAtual - 1990 + 2 }, (_, i) => anoAtual + 1 - i)

/** Aplica máscara DD/MM/AAAA ao digitar */
function aplicarMascara(valor: string): string {
  // Remove tudo que não é número
  const nums = valor.replace(/\D/g, '')
  if (nums.length <= 2) return nums
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`
}

/** Tenta parsear DD/MM/AAAA para Date */
function parsearData(texto: string): Date | null {
  const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const dia = parseInt(match[1])
  const mes = parseInt(match[2])
  const ano = parseInt(match[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1990 || ano > anoAtual + 1) return null
  const data = new Date(ano, mes - 1, dia)
  // Validar que a data é real (ex: 31/02 não existe)
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) return null
  // Admissão pode ser futura (contratação agendada) — não bloquear
  return data
}

export function DatePickerAdmissao({
  date,
  onDateChange,
  placeholder = "DD/MM/AAAA",
  className
}: DatePickerAdmissaoProps) {
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(date || new Date(2020, 0, 1))
  const [textoInput, setTextoInput] = React.useState(date ? format(date, 'dd/MM/yyyy') : '')
  const [inputFocado, setInputFocado] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sincronizar texto quando date muda externamente
  React.useEffect(() => {
    if (date && !inputFocado) {
      setTextoInput(format(date, 'dd/MM/yyyy'))
      setViewDate(date)
    }
  }, [date, inputFocado])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mascarado = aplicarMascara(e.target.value)
    setTextoInput(mascarado)

    // Tentar parsear quando tiver 10 chars (DD/MM/AAAA)
    if (mascarado.length === 10) {
      const dataParseada = parsearData(mascarado)
      if (dataParseada) {
        onDateChange(dataParseada)
        setViewDate(dataParseada)
      }
    }
  }

  const handleInputBlur = () => {
    setInputFocado(false)
    // Se o texto não é uma data válida completa, restaurar
    if (textoInput.length === 10) {
      const dataParseada = parsearData(textoInput)
      if (!dataParseada) {
        setTextoInput(date ? format(date, 'dd/MM/yyyy') : '')
      }
    } else if (textoInput.length > 0 && textoInput.length < 10) {
      setTextoInput(date ? format(date, 'dd/MM/yyyy') : '')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir: backspace, delete, tab, escape, enter, setas
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      return
    }
    // Permitir Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
      return
    }
    // Bloquear tudo que não é número
    if (!/^\d$/.test(e.key)) {
      e.preventDefault()
    }
  }

  const handleYearChange = (year: string) => {
    const newDate = new Date(viewDate)
    newDate.setFullYear(parseInt(year))
    setViewDate(newDate)
  }

  const handleMonthChange = (month: string) => {
    const newDate = new Date(viewDate)
    newDate.setMonth(parseInt(month))
    setViewDate(newDate)
  }

  const handleDayClick = (day: number) => {
    const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
    onDateChange(selectedDate)
    setTextoInput(format(selectedDate, 'dd/MM/yyyy'))
    setOpen(false)
  }

  // Calcular dias do mês
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay()
  }

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth())
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth())

  // Gerar grid de dias
  const days = []
  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const isSelected = (day: number) => {
    if (!date || !day) return false
    return date.getDate() === day &&
           date.getMonth() === viewDate.getMonth() &&
           date.getFullYear() === viewDate.getFullYear()
  }

  const isToday = (day: number) => {
    if (!day) return false
    const today = new Date()
    return today.getDate() === day &&
           today.getMonth() === viewDate.getMonth() &&
           today.getFullYear() === viewDate.getFullYear()
  }

  return (
    <div className="space-y-1.5">
      {/* Input com máscara + botão calendário */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={textoInput}
            onChange={handleInputChange}
            onFocus={() => setInputFocado(true)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={10}
            className={cn(
              "flex h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors",
              className
            )}
          />
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 z-[9999]" align="end">
            {/* Seletores de Ano e Mês */}
            <div className="flex gap-2 mb-3">
              <Select value={viewDate.getMonth().toString()} onValueChange={handleMonthChange}>
                <SelectTrigger className="flex-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((mes, index) => (
                    <SelectItem key={index} value={index.toString()}>{mes}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={viewDate.getFullYear().toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {ANOS.map((ano) => (
                    <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dia, i) => (
                <div key={i} className="w-8 h-8 flex items-center justify-center text-xs text-slate-500 font-medium">
                  {dia}
                </div>
              ))}
            </div>

            {/* Grid de dias */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => (
                <button
                  key={index}
                  type="button"
                  disabled={!day}
                  onClick={() => day && handleDayClick(day)}
                  className={cn(
                    "w-8 h-8 rounded-md text-sm transition-colors",
                    !day && "invisible",
                    day && "hover:bg-slate-700",
                    isSelected(day!) && "bg-violet-500 text-white hover:bg-violet-600",
                    isToday(day!) && !isSelected(day!) && "border border-slate-500",
                    !isSelected(day!) && "text-slate-300"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>

          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
