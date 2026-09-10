/**
 * Recharts lives here on its own so it can be code-split. Only the admin
 * console pulls it in, which keeps roughly 300 KB out of the bundle every
 * student downloads on their phone.
 */
import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from "recharts";

export const PIE_COLORS = ["#2563EB", "#38BDF8", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#64748B"];

export default function Charts({ kind, data, dark }) {
  const axis = { stroke: dark ? "#475569" : "#94A3B8", fontSize: 12 };
  const grid = dark ? "#1E293B" : "#F1F5F9";
  const tip = {
    background: dark ? "#0F172A" : "#fff",
    border: `1px solid ${dark ? "#1E293B" : "#E2E8F0"}`,
    borderRadius: 14, fontSize: 12, color: dark ? "#fff" : "#0F172A",
  };

  if (kind === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="cf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={tip} />
          <Area type="monotone" dataKey="reports" stroke="#2563EB" strokeWidth={2.5} fill="url(#cf-area)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (kind === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tip} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axis} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={92} />
        <Tooltip contentStyle={tip} cursor={{ fill: dark ? "#1E293B" : "#F8FAFC" }} />
        <Bar dataKey="value" fill="#38BDF8" radius={[0, 8, 8, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
