"use client"

import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  maxDate?: Date
  minDate?: Date
  disabled?: (date: Date) => boolean
}

export function DatePicker({ 
  date, 
  onDateChange, 
  placeholder = "Selecione uma data", 
  className,
  maxDate,
  minDate,
  disabled
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (selectedDate: Date | undefined) => {
    onDateChange(selectedDate)
    setOpen(false) // Fecha o popover ao selecionar
  }

  // Função para desabilitar datas fora do range permitido
  const isDateDisabled = (dateToCheck: Date) => {
    if (disabled && disabled(dateToCheck)) return true
    if (maxDate && dateToCheck > maxDate) return true
    if (minDate && dateToCheck < minDate) return true
    return false
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
      <PopoverContent className="w-auto p-0 z-[999999]" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={isDateDisabled}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
