"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TimePicker24hProps {
  value: string // formato "HH:mm" (ex: "08:00", "21:30")
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function TimePicker24h({ 
  value, 
  onChange, 
  placeholder = "Selecione o horário", 
  className 
}: TimePicker24hProps) {
  const [open, setOpen] = React.useState(false)
  
  // Extrair hora e minuto do valor
  const [hora, minuto] = value ? value.split(':') : ['08', '00']
  
  const handleHoraChange = (novaHora: string) => {
    onChange(`${novaHora}:${minuto}`)
  }
  
  const handleMinutoChange = (novoMinuto: string) => {
    onChange(`${hora}:${novoMinuto}`)
  }
  
  // Gerar arrays de horas (00-23) e minutos (00, 15, 30, 45)
  const horas = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
  const minutos = ['00', '15', '30', '45']
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal text-white",
            !value && "text-slate-400",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 text-white" />
          {value || <span className="text-slate-400">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 z-[9999]" align="start">
        <div className="flex gap-2">
          {/* Seletor de Hora */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400 text-center">Hora</span>
            <Select value={hora} onValueChange={handleHoraChange}>
              <SelectTrigger className="w-20 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {horas.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-center pt-5">
            <span className="text-slate-400 font-bold">:</span>
          </div>
          
          {/* Seletor de Minuto */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400 text-center">Minuto</span>
            <Select value={minuto} onValueChange={handleMinutoChange}>
              <SelectTrigger className="w-20 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Atalhos rápidos */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              onChange('08:00')
              setOpen(false)
            }}
          >
            08:00
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              onChange('12:00')
              setOpen(false)
            }}
          >
            12:00
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => {
              onChange('18:00')
              setOpen(false)
            }}
          >
            18:00
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
