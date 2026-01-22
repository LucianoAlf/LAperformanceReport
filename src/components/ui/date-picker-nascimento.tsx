"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DatePickerNascimentoProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Gerar anos de 1920 até o ano atual
const anoAtual = new Date().getFullYear()
const ANOS = Array.from({ length: anoAtual - 1920 + 1 }, (_, i) => anoAtual - i)

export function DatePickerNascimento({ 
  date, 
  onDateChange, 
  placeholder = "Selecione a data de nascimento", 
  className 
}: DatePickerNascimentoProps) {
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(date || new Date(2000, 0, 1))

  // Sincronizar viewDate quando date muda
  React.useEffect(() => {
    if (date) {
      setViewDate(date)
    }
  }, [date])

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal text-white",
            !date && "text-slate-400",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-white" />
          {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : <span className="text-slate-400">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
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
                isSelected(day!) && "bg-emerald-500 text-white hover:bg-emerald-600",
                isToday(day!) && !isSelected(day!) && "border border-slate-500",
                !isSelected(day!) && "text-slate-300"
              )}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Atalhos rápidos */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              const d = new Date()
              d.setFullYear(d.getFullYear() - 10)
              setViewDate(d)
            }}
          >
            10 anos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              const d = new Date()
              d.setFullYear(d.getFullYear() - 20)
              setViewDate(d)
            }}
          >
            20 anos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              const d = new Date()
              d.setFullYear(d.getFullYear() - 40)
              setViewDate(d)
            }}
          >
            40 anos
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
