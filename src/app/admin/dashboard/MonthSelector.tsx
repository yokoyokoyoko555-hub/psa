"use client";

import { useRouter } from "next/navigation";

export default function MonthSelector({ year, month }: { year: number; month: number }) {
  const router = useRouter();

  function go(nextYear: number, nextMonth: number) {
    router.push(`/admin/dashboard?year=${nextYear}&month=${nextMonth}`);
  }

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    go(Number(e.target.value), month);
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    go(year, Number(e.target.value));
  }

  const years = Array.from({ length: 5 }, (_, i) => year - 2 + i);

  return (
    <div className="flex gap-2">
      <select
        value={year}
        onChange={handleYearChange}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={handleMonthChange}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}月
          </option>
        ))}
      </select>
    </div>
  );
}
