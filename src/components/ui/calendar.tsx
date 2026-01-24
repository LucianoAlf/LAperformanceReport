"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(props.defaultMonth || props.month || new Date());

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePrevMonth = () => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(newDate);
    props.onMonthChange?.(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(newDate);
    props.onMonthChange?.(newDate);
  };

  return (
    <div className="p-4 bg-slate-900 rounded-xl border border-slate-700">
      {/* Header customizado com Selects do Design System */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
          onClick={handlePrevMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-white">
            {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
          onClick={handleNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* DayPicker sem caption (usamos o nosso acima) */}
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("rdp-dark", className)}
        locale={ptBR}
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        hideNavigation
        classNames={{
          months: "flex flex-col",
          month: "space-y-2",
          month_caption: "hidden",
          caption_label: "hidden",
          nav: "hidden",
          weekdays: "flex",
          weekday: "text-slate-500 w-9 font-medium text-xs text-center",
          week: "flex w-full mt-1",
          day: "h-9 w-9 text-center text-sm p-0 relative",
          day_button: "h-9 w-9 rounded-md font-normal text-slate-300 hover:bg-slate-700 hover:text-white transition-colors inline-flex items-center justify-center",
          selected: "!bg-emerald-500 !text-white font-semibold rounded-md",
          today: "bg-slate-800 text-emerald-400 font-semibold rounded-md",
          outside: "text-slate-600 opacity-50",
          disabled: "text-slate-700 opacity-30",
          hidden: "invisible",
          ...classNames,
        }}
        components={{
          Chevron: ({ orientation }) => 
            orientation === "left" 
              ? <ChevronLeft className="h-4 w-4" /> 
              : <ChevronRight className="h-4 w-4" />,
        }}
        {...props}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
