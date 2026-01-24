"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, CaptionProps } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const CustomCaption = (captionProps: CaptionProps) => {
    const { displayMonth } = captionProps;
    const currentYear = displayMonth.getFullYear();
    const currentMonth = displayMonth.getMonth();

    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Gerar anos de 2000 até o ano atual + 1
    const startYear = 2000;
    const endYear = new Date().getFullYear() + 1;
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

    const handleMonthChange = (month: string) => {
      const newDate = new Date(currentYear, parseInt(month), 1);
      props.onMonthChange?.(newDate);
    };

    const handleYearChange = (year: string) => {
      const newDate = new Date(parseInt(year), currentMonth, 1);
      props.onMonthChange?.(newDate);
    };

    return (
      <div className="flex justify-between items-center mb-4 gap-2">
        <Select value={currentMonth.toString()} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((month, index) => (
              <SelectItem key={index} value={index.toString()}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentYear.toString()} onValueChange={handleYearChange}>
          <SelectTrigger className="w-[90px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {years.reverse().map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

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
        Caption: CustomCaption,
      }}
      captionLayout="dropdown"
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
