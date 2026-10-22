"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { fetcher } from "@/lib/fetcher";
import { formatCurrency, formatCurrencyShort, formatDate, currentMonth } from "@/lib/format";
import { MonthPicker } from "@/components/MonthPicker";

const FALLBACK = ["#6366f1", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#8b5cf6", "#14b8a6"];

function StatCard({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "green" | "red";
}) {
  const color =
    tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-ink";
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: summary, isLoading } = useSWR(`/api/summary?month=${month}`, fetcher);
  const { data: txData } = useSWR(`/api/transactions?month=${month}`, fetcher);

  const income = summary?.income ?? 0;
  const spending = summary?.spending ?? 0;
  const net = summary?.net ?? 0;
  const byParent = summary?.byParent ?? [];
  const trend = summary?.trend ?? [];
  const recent = (txData?.transactions ?? []).slice(0, 8);

  const trendData = trend.map((t: any) => ({
    name: t.label.split(" ")[0].slice(0, 3),
    Income: Math.round(t.income),
    Spending: Math.round(t.spending),
  }));

  const dailyData = (summary?.daily ?? []).map((d: any) => ({
    day: d.day,
    Daily: d.spent,
    "Month to date": d.cumulative,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-ink-muted">{summary?.label ?? ""}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : summary?.accountCount === 0 ? (
        <div className="card text-center">
          <p className="text-sm text-ink-muted">
            No data yet. Head to{" "}
            <Link href="/accounts" className="text-brand-600 underline">
              Accounts
            </Link>{" "}
            to connect a bank and sync transactions.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Income" value={formatCurrency(income)} tone="green" />
            <StatCard label="Spending" value={formatCurrency(spending)} tone="red" />
            <StatCard
              label="Net cash flow"
              value={formatCurrency(net)}
              tone={net >= 0 ? "green" : "red"}
            />
            <StatCard
              label="Total balances"
              value={formatCurrency(summary?.accountsBalance ?? 0)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-4 font-semibold">Spending by category</h2>
              {byParent.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">
                  No spending this month.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-52 w-52 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={byParent}
                          dataKey="amount"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          {byParent.map((p: any, i: number) => (
                            <Cell key={i} fill={p.color || FALLBACK[i % FALLBACK.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any) => formatCurrency(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {byParent.slice(0, 7).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.color || FALLBACK[i % FALLBACK.length] }}
                          />
                          {p.icon} {p.name}
                        </span>
                        <span className="tabular-nums text-ink-soft">
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 font-semibold">Income vs spending (6 months)</h2>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ left: -12, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: any) => formatCurrencyShort(Number(v))}
                    />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend />
                    <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Spending" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 font-semibold">Spending by day</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="daily"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: any) => formatCurrencyShort(Number(v))}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: any) => formatCurrencyShort(Number(v))}
                  />
                  <Tooltip
                    labelFormatter={(d: any) => `Day ${d}`}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Legend />
                  <Line
                    yAxisId="daily"
                    type="monotone"
                    dataKey="Daily"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="Month to date"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent transactions</h2>
              <Link href="/transactions" className="text-sm text-brand-600 hover:underline">
                View all →
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">
                No transactions this month.
              </p>
            ) : (
              <div className="divide-y divide-surface-border">
                {recent.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{tx.merchantName || tx.name}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(tx.date)} ·{" "}
                        {tx.category?.name ?? "Uncategorized"}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        tx.amount > 0 ? "text-ink" : "text-green-600"
                      }`}
                    >
                      {tx.amount > 0 ? "" : "+"}
                      {formatCurrency(Math.abs(tx.amount), tx.currencyCode || "USD")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
