"use client"

import * as React from "react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { td } from "@/lib/i18n"
import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// 트리거 버튼 — outline buttonVariants 위에 폭/정렬/폰트만 오버라이드한다.
const triggerClass = cn(
  buttonVariants({ variant: "outline" }),
  "w-full justify-start text-left font-normal"
)

// 표시 포맷: date-fns의 ko 로케일로 "2026년 7월 5일" 형태.
const DISPLAY_FORMAT = "PPP"

interface DatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/** 단일 날짜 선택기 — Popover + Calendar 조합. */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            triggerClass,
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 opacity-70" />
          {value
            ? format(value, DISPLAY_FORMAT, { locale: ko })
            : (placeholder ?? td("dashboard.datePicker.placeholder"))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} autoFocus />
      </PopoverContent>
    </Popover>
  )
}

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/** 기간(범위) 선택기 — Popover + Calendar(range) 조합. */
export function DateRangePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            triggerClass,
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 opacity-70" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, DISPLAY_FORMAT, { locale: ko })} –{" "}
                {format(value.to, DISPLAY_FORMAT, { locale: ko })}
              </>
            ) : (
              format(value.from, DISPLAY_FORMAT, { locale: ko })
            )
          ) : (
            (placeholder ?? td("dashboard.datePicker.rangePlaceholder"))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
