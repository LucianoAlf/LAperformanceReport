"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rdp-dark", className)}
      locale={ptBR}
      classNames={{
        root: "p-4 bg-slate-900 rounded-xl border border-slate-700",
        months: "flex flex-col",
        month: "space-y-3",
        month_caption: "flex justify-between items-center mb-4",
        caption_label: "text-sm font-semibold text-white",
        nav: "flex items-center gap-1",
        button_previous: "h-7 w-7 bg-slate-800 border border-slate-600 rounded-md flex items-center justify-center text-white hover:bg-slate-700 transition-colors",
        button_next: "h-7 w-7 bg-slate-800 border border-slate-600 rounded-md flex items-center justify-center text-white hover:bg-slate-700 transition-colors",
        weekdays: "flex",
        weekday: "text-slate-500 w-9 font-medium text-xs",
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
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
