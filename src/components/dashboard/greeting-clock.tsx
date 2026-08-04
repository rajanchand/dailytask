"use client";

import { useEffect, useState } from "react";
import { greetingForHour, formatDisplayDate, todayISO } from "@/lib/utils";

export function GreetingClock({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Good morning, {name} 👋</h1>
        <p className="text-muted-foreground">{formatDisplayDate(todayISO())}</p>
      </div>
    );
  }

  const greeting = greetingForHour(now.getHours());
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        {greeting}, {name} 👋
      </h1>
      <p className="text-muted-foreground">
        {formatDisplayDate(todayISO())} · <span className="font-mono tabular-nums">{time}</span>
      </p>
    </div>
  );
}
