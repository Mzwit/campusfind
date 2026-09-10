import React, { useState, useMemo, useEffect, useRef, useContext, createContext } from "react";
import {
  Search, Plus, Bell, Home, Compass, MapPin, Calendar, Clock, Check, X,
  ChevronRight, ChevronLeft, Upload, Shield, Sparkles, Flag, Share2, Trash2,
  Edit3, Eye, MessageCircle, Moon, Sun, ArrowRight, CheckCircle2, AlertTriangle,
  Users, BarChart3, Send, Lock, Info, LayoutGrid, HandHeart, Camera, Tag,
  SlidersHorizontal, Mail, ShieldCheck, Ban, ArrowUpRight, MoreHorizontal
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  CampusFind — Lost it. Found it. Bring campus together.
 * ------------------------------------------------------------------ */

import * as api from "./lib/api";
const Charts = React.lazy(() => import("./Charts.jsx"));
const PIE = ["#2563EB", "#38BDF8", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#64748B"];
import { SEED_ITEMS } from "./lib/mock";


/* ----------------------------- data ------------------------------- */

const CATEGORIES = [
  { id: "electronics", label: "Electronics", emoji: "🎧", grad: "from-blue-500 to-violet-600" },
  { id: "cards", label: "Student Cards", emoji: "💳", grad: "from-sky-400 to-blue-600" },
  { id: "keys", label: "Keys", emoji: "🔑", grad: "from-amber-400 to-orange-500" },
  { id: "bags", label: "Bags", emoji: "🎒", grad: "from-emerald-400 to-teal-600" },
  { id: "clothing", label: "Clothing", emoji: "🧥", grad: "from-violet-400 to-fuchsia-500" },
  { id: "books", label: "Books", emoji: "📚", grad: "from-rose-400 to-red-500" },
  { id: "jewellery", label: "Jewellery", emoji: "💍", grad: "from-amber-300 to-rose-400" },
  { id: "accessories", label: "Accessories", emoji: "👓", grad: "from-cyan-400 to-sky-600" },
  { id: "documents", label: "Documents", emoji: "📄", grad: "from-slate-400 to-slate-600" },
  { id: "sports", label: "Sports Equipment", emoji: "🏀", grad: "from-orange-400 to-red-500" },
  { id: "bottles", label: "Water Bottles", emoji: "🥤", grad: "from-sky-300 to-cyan-500" },
  { id: "other", label: "Other", emoji: "📦", grad: "from-slate-400 to-blue-500" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[11];

const LOCATIONS = [
  "Main Library", "Cafeteria", "Lecture Hall B", "Residence", "Sports Centre",
  "Parking", "ICT Lab", "Science Block", "Student Centre", "Administration", "Other",
];

const H = 3600e3, DAY = 24 * H;
const now = Date.now();

/* ---------------------------- helpers ----------------------------- */

const uid = () => Math.random().toString(36).slice(2, 9);

function ago(ts) {
  const s = Math.max(1, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
const fullDate = (ts) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const clock = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const STOP = new Set(["the", "and", "with", "for", "near", "small", "inside", "left", "was", "has", "her", "his", "that", "this", "from", "have", "some", "one", "not", "are", "its"]);
const words = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function matchScore(a, b) {
  if (!a || !b || a.type === b.type) return 0;
  if (b.status === "recovered" || b.status === "closed") return 0;
  let s = 0;
  if (a.cat === b.cat) s += 34;
  const A = words(`${a.name} ${a.desc} ${a.brand || ""} ${a.color || ""}`);
  const B = new Set(words(`${b.name} ${b.desc} ${b.brand || ""} ${b.color || ""}`));
  s += Math.min(28, A.filter((w) => B.has(w)).length * 7);
  if (a.color && b.color && a.color.toLowerCase() === b.color.toLowerCase()) s += 11;
  if (a.brand && b.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) s += 11;
  if (a.loc === b.loc) s += 10;
  const days = Math.abs(a.ts - b.ts) / DAY;
  if (days <= 1) s += 6; else if (days <= 4) s += 3;
  return Math.min(97, Math.round(s));
}
const matchesFor = (item, all) =>
  all.map((o) => ({ item: o, score: matchScore(item, o) }))
    .filter((m) => m.score >= 45)
    .sort((x, y) => y.score - x.score);

const STATUS = {
  active: { label: "Active", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", chipD: "bg-amber-500 bg-opacity-15 text-amber-300" },
  match: { label: "Possible match", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700", chipD: "bg-blue-500 bg-opacity-15 text-blue-300" },
  recovered: { label: "Recovered", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", chipD: "bg-emerald-500 bg-opacity-15 text-emerald-300" },
  closed: { label: "Closed", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600", chipD: "bg-slate-700 text-slate-300" },
};

/* ------------------------- theme + context ------------------------ */

const Ui = createContext(null);
const useUi = () => useContext(Ui);

const tokens = (d) => ({
  d,
  page: d ? "bg-slate-950" : "bg-slate-50",
  panel: d ? "bg-slate-900" : "bg-white",
  sunk: d ? "bg-slate-800" : "bg-slate-100",
  border: d ? "border-slate-800" : "border-slate-200",
  text: d ? "text-white" : "text-slate-900",
  sub: d ? "text-slate-400" : "text-slate-500",
  faint: d ? "text-slate-500" : "text-slate-400",
  hover: d ? "hover:bg-slate-800" : "hover:bg-slate-100",
  input: d
    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400",
  shadow: d ? "shadow-none" : "shadow-sm",
});

/* --------------------------- UI atoms ----------------------------- */

function Logo({ size = 36, wordmark = true }) {
  const { T } = useUi();
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="cfg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <path d="M20 3c-6.6 0-12 5.2-12 11.7C8 23.4 20 37 20 37s12-13.6 12-22.3C32 8.2 26.6 3 20 3z" fill="url(#cfg)" />
        <circle cx="20" cy="14.6" r="6.4" fill="#fff" />
        <path d="M16.9 14.8l2.3 2.4 4.1-4.5" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {wordmark && <span className={`text-lg font-extrabold cf-tight ${T.text}`}>CampusFind</span>}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", icon: Icon, className = "", disabled, type = "button" }) {
  const { T } = useUi();
  const sizes = { sm: "px-3 py-2 text-sm", md: "px-5 py-3 text-sm", lg: "px-6 py-4 text-base" };
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg",
    dark: T.d ? "bg-white text-slate-900 hover:bg-slate-200" : "bg-slate-900 text-white hover:bg-slate-800",
    ghost: `${T.text} ${T.hover} border ${T.border}`,
    quiet: `${T.sub} ${T.hover}`,
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-emerald-500 text-white hover:bg-emerald-600",
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${T.d ? "focus:ring-offset-slate-950" : "focus:ring-offset-slate-50"}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={17} strokeWidth={2.4} />}
      {children}
    </button>
  );
}

function TypeBadge({ type, small }) {
  const lost = type === "lost";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"}
      ${lost ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-white cf-livedot" />
      {lost ? "Lost" : "Found"}
    </span>
  );
}

function StatusBadge({ status }) {
  const { T } = useUi();
  const s = STATUS[status] || STATUS.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${T.d ? s.chipD : s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

function Meta({ icon: Icon, children }) {
  const { T } = useUi();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${T.sub}`}>
      <Icon size={13} strokeWidth={2.2} />{children}
    </span>
  );
}

function Photo({ item, className = "", big, index = 0, src }) {
  const c = catOf(item.cat);
  const url = src || (item.photoUrls && item.photoUrls[index]);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${c.grad} ${className}`}>
      {url ? (
        <img src={url} alt={item.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: big ? 96 : 46 }} className="drop-shadow-lg select-none">{c.emoji}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-slate-900 opacity-0 hover:opacity-10 transition" />
    </div>
  );
}

function Avatar({ name, size = 40, verified }) {
  const initials = (name || "S").split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white
        flex items-center justify-center font-bold" style={{ fontSize: size * 0.36 }}>{initials}</div>
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-sky-500 rounded-full p-0.5 border-2 border-white">
          <Check size={9} strokeWidth={4} className="text-white" />
        </span>
      )}
    </div>
  );
}

function Modal({ open, onClose, children, wide }) {
  const { T } = useUi();
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-slate-900 bg-opacity-60" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} ${T.panel} rounded-t-3xl sm:rounded-3xl
        border ${T.border} shadow-2xl cf-pop max-h-full overflow-y-auto cf-scroll`}>
        <button onClick={onClose} aria-label="Close"
          className={`absolute right-4 top-4 p-2 rounded-full ${T.hover} ${T.sub} z-10`}><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ emoji, title, body, action }) {
  const { T } = useUi();
  return (
    <div className="text-center py-16 px-6">
      <div className="text-5xl mb-4">{emoji}</div>
      <h3 className={`text-xl font-bold cf-tight ${T.text}`}>{title}</h3>
      <p className={`mt-2 text-sm ${T.sub} max-w-sm mx-auto`}>{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

function Skeleton() {
  const { T } = useUi();
  return (
    <div className={`rounded-3xl overflow-hidden border ${T.border} ${T.panel}`}>
      <div className={`h-44 ${T.sunk} cf-skeleton`} />
      <div className="p-5 space-y-3">
        <div className={`h-4 w-2/3 rounded-full ${T.sunk} cf-skeleton`} />
        <div className={`h-3 w-1/2 rounded-full ${T.sunk} cf-skeleton`} />
        <div className={`h-3 w-full rounded-full ${T.sunk} cf-skeleton`} />
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  const { T } = useUi();
  return (
    <label className="block">
      <span className={`block text-sm font-semibold mb-2 ${T.text}`}>{label}</span>
      {children}
      {hint && <span className={`block mt-1.5 text-xs ${T.faint}`}>{hint}</span>}
    </label>
  );
}

function Input(props) {
  const { T } = useUi();
  return <input {...props} className={`w-full px-4 py-3 rounded-2xl border text-sm outline-none transition
    focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30 ${T.input} ${props.className || ""}`} />;
}
function Area2(props) {
  const { T } = useUi();
  return <textarea {...props} className={`w-full px-4 py-3 rounded-2xl border text-sm outline-none transition resize-none
    focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30 ${T.input}`} />;
}
function Select({ value, onChange, options, placeholder }) {
  const { T } = useUi();
  return (
    <select value={value} onChange={onChange}
      className={`w-full px-4 py-3 rounded-2xl border text-sm outline-none appearance-none
      focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30 ${T.input}`}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Chip({ active, children, onClick }) {
  const { T } = useUi();
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition border
        ${active ? "bg-blue-600 text-white border-blue-600 shadow-md" : `${T.panel} ${T.sub} ${T.border} ${T.hover}`}`}>
      {children}
    </button>
  );
}

/* ---------------------------- item card ---------------------------- */

function ItemCard({ item, onOpen, delay = 0 }) {
  const { T } = useUi();
  const c = catOf(item.cat);
  return (
    <article
      onClick={() => onOpen(item)}
      style={{ animationDelay: `${delay}ms` }}
      className={`cf-rise cf-lift group cursor-pointer rounded-3xl overflow-hidden border ${T.border} ${T.panel}
        ${T.d ? "hover:border-slate-700" : "hover:shadow-xl"} ${T.shadow}`}>
      <div className="relative">
        <Photo item={item} className="h-44" />
        <div className="absolute top-3 left-3"><TypeBadge type={item.type} /></div>
        {item.urgent && item.status !== "recovered" && (
          <div className="absolute top-3 right-3 bg-white bg-opacity-95 text-red-600 rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1">
            <AlertTriangle size={12} strokeWidth={2.6} />Urgent
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-slate-900 bg-opacity-70 text-white
          rounded-full px-2.5 py-1 text-xs font-medium">
          <Camera size={12} />{item.photos}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className={`font-bold cf-tight leading-snug ${T.text}`}>{item.name}</h3>
          <span className="text-xl shrink-0">{c.emoji}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          <Meta icon={MapPin}>{item.loc}</Meta>
          <Meta icon={Clock}>{ago(item.ts)}</Meta>
        </div>
        <p className={`mt-3 text-sm leading-relaxed ${T.sub}`}>
          {item.desc.length > 88 ? item.desc.slice(0, 88) + "…" : item.desc}
        </p>
        <div className={`mt-4 pt-4 border-t ${T.border} flex items-center justify-between`}>
          <StatusBadge status={item.status} />
          <span className="text-sm font-semibold text-blue-600 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            View item <ChevronRight size={15} strokeWidth={2.6} />
          </span>
        </div>
      </div>
    </article>
  );
}

/* --------------------------- landing page -------------------------- */

const FLOAT = [
  { e: "🎒", l: "Backpack", x: "left-0 top-8", r: "-8deg", d: "0s" },
  { e: "🎧", l: "AirPods", x: "left-32 top-0", r: "6deg", d: ".7s" },
  { e: "📱", l: "Phone", x: "right-24 top-4", r: "-5deg", d: "1.4s" },
  { e: "🔑", l: "Keys", x: "right-0 top-32", r: "9deg", d: ".3s" },
  { e: "💳", l: "Student card", x: "left-8 bottom-8", r: "5deg", d: "1.1s" },
  { e: "💻", l: "Laptop", x: "left-40 bottom-0", r: "-6deg", d: "1.8s" },
  { e: "👓", l: "Glasses", x: "right-32 bottom-4", r: "7deg", d: ".9s" },
  { e: "📚", l: "Books", x: "right-4 bottom-28", r: "-9deg", d: "2.1s" },
];

function Landing({ onEnter, items, onOpen }) {
  const { T, dark, setDark } = useUi();
  const [q, setQ] = useState("");
  const recent = [...items].sort((a, b) => b.ts - a.ts).slice(0, 6);

  return (
    <div className={`min-h-screen ${T.page}`}>
      <header className={`sticky top-0 z-30 border-b ${T.border} ${T.panel} bg-opacity-80`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <button onClick={() => setDark(!dark)} aria-label="Switch theme"
              className={`p-2.5 rounded-full ${T.hover} ${T.sub}`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <Btn size="sm" variant="ghost" onClick={onEnter}>Sign in</Btn>
            <Btn size="sm" onClick={onEnter}>Get started</Btn>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-16 pb-8 grid lg:grid-cols-2 gap-14 items-center">
        <div className="cf-rise">
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
            ${T.d ? "bg-blue-500 bg-opacity-15 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
            <ShieldCheck size={14} /> For verified students and staff only
          </span>
          <h1 className={`mt-6 text-5xl sm:text-6xl font-extrabold cf-tight leading-none ${T.text}`}>
            Lost something<br />on campus?
          </h1>
          <p className={`mt-5 text-lg leading-relaxed ${T.sub} max-w-md`}>
            Tell the campus community what happened. Someone might already have it.
          </p>

          <div className={`mt-8 flex items-center gap-2 p-2 rounded-3xl border ${T.border} ${T.panel} ${T.shadow}`}>
            <Search size={19} className={`ml-3 ${T.faint}`} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onEnter("explore", q)}
              placeholder="Search for a lost or found item..."
              className={`flex-1 bg-transparent outline-none text-sm py-2 ${T.text} ${T.d ? "placeholder-slate-500" : "placeholder-slate-400"}`} />
            <Btn size="sm" onClick={() => onEnter("explore", q)}>Search</Btn>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Btn size="lg" icon={Plus} onClick={() => onEnter("report-lost")}>Report lost item</Btn>
            <Btn size="lg" variant="ghost" icon={HandHeart} onClick={() => onEnter("report-found")}>I found something</Btn>
          </div>

          <div className={`mt-8 flex items-center gap-6 text-sm ${T.sub}`}>
            <span><b className={T.text}>412</b> reports</span>
            <span><b className="text-emerald-500">68%</b> returned to owners</span>
            <span><b className={T.text}>9</b> found today</span>
          </div>
        </div>

        <div className="relative h-96 hidden lg:block" aria-hidden="true">
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 opacity-10 blur-2xl" />
          {FLOAT.map((f) => (
            <div key={f.l} style={{ "--r": f.r, animationDelay: f.d }}
              className={`cf-float absolute ${f.x} ${T.panel} border ${T.border} rounded-3xl px-4 py-3 shadow-xl flex items-center gap-3`}>
              <span className="text-2xl">{f.e}</span>
              <span className={`text-sm font-semibold ${T.text}`}>{f.l}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className={`text-3xl font-extrabold cf-tight ${T.text}`}>Recently reported</h2>
            <p className={`mt-1 text-sm ${T.sub}`}>Fresh from around campus in the last few days.</p>
          </div>
          <Btn variant="quiet" size="sm" onClick={() => onEnter("explore")}>See all <ArrowRight size={15} /></Btn>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recent.map((it, i) => <ItemCard key={it.id} item={it} onOpen={onOpen} delay={i * 60} />)}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-violet-600 p-10 sm:p-14 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold cf-tight text-white">Lost it. Found it. Bring campus together.</h2>
          <p className="mt-3 text-blue-100 max-w-lg mx-auto">
            Sign in with your university email to report an item, answer someone's search, or claim what's yours.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Btn size="lg" variant="dark" className="bg-white text-blue-700 hover:bg-blue-50" onClick={onEnter}>Sign in with university email</Btn>
          </div>
        </div>
        <p className={`mt-8 text-center text-xs ${T.faint}`}>CampusFind — a student service. Report abuse to the campus help desk.</p>
      </section>
    </div>
  );
}

/* ------------------------------ auth ------------------------------ */

/* --------------------------- authentication ------------------------ */

/** Six boxes that behave the way people expect: auto-advance, paste, backspace. */
function CodeInput({ value, onChange, onComplete, disabled, invalid }) {
  const { T } = useUi();
  const refs = useRef([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const set = (i, ch) => {
    const next = (value.padEnd(6, " ").slice(0, 6).split("").map((c, j) => (j === i ? ch : c)).join("")).replace(/\s+$/g, "");
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={(e) => {
      const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (t) { e.preventDefault(); onChange(t); if (t.length === 6) onComplete?.(t); }
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          value={d.trim()}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, "").slice(-1);
            if (!ch) return;
            set(i, ch);
            refs.current[Math.min(i + 1, 5)]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const cur = value.slice(0, 6);
              if (cur[i]) onChange(cur.slice(0, i) + cur.slice(i + 1));
              else if (i > 0) { onChange(cur.slice(0, i - 1) + cur.slice(i)); refs.current[i - 1]?.focus(); }
            }
            if (e.key === "ArrowLeft") refs.current[Math.max(i - 1, 0)]?.focus();
            if (e.key === "ArrowRight") refs.current[Math.min(i + 1, 5)]?.focus();
          }}
          className={`w-12 h-14 rounded-2xl border text-center text-2xl font-bold outline-none transition
            focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30
            ${invalid ? "border-red-500" : ""} ${T.input}`}
        />
      ))}
    </div>
  );
}

/** Ring that empties as the current code ages out. */
function CodeTimer() {
  const { T } = useUi();
  const [left, setLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30));
  useEffect(() => {
    const t = setInterval(() => setLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 1000);
    return () => clearInterval(t);
  }, []);
  const pct = left / 30;
  return (
    <div className={`flex items-center justify-center gap-2 text-xs ${T.sub}`}>
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className={T.d ? "stroke-slate-700" : "stroke-slate-200"} />
        <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" strokeLinecap="round"
          className={left <= 5 ? "stroke-amber-500" : "stroke-blue-600"}
          strokeDasharray={`${pct * 50.2} 50.2`} transform="rotate(-90 10 10)" />
      </svg>
      New code in {left}s
    </div>
  );
}

function AuthModal({ open, onClose, onSignedIn }) {
  const { T } = useUi();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentConfirm, setSentConfirm] = useState(false);
  const [sentReset, setSentReset] = useState(false);
  const emailOk = api.auth.isUniversityEmail(email);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (mode === "signup") {
        const { needsEmailConfirmation } = await api.auth.signUp(email, password);
        if (needsEmailConfirmation) { setSentConfirm(true); return; }
      } else {
        await api.auth.signIn(email, password);
      }
      const session = await api.auth.current();
      if (!session) throw new Error("Sign-in didn't complete. Try again.");
      onSignedIn(session);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    try { await api.auth.resetPassword(email); setSentReset(true); }
    catch (e) { setErr(e.message); }
  };

  if (sentConfirm) {
    return (
      <Modal open={open} onClose={onClose}>
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto">
            <Mail size={24} className="text-white" />
          </div>
          <h2 className={`mt-5 text-xl font-extrabold cf-tight ${T.text}`}>Confirm your email</h2>
          <p className={`mt-2 text-sm ${T.sub}`}>
            We sent a link to {email}. Open it, then come back and sign in. Confirming the address is what proves
            you're on campus.
          </p>
          <Btn className="mt-6 w-full" onClick={() => { setSentConfirm(false); setMode("signin"); }}>Back to sign in</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-8">
        <Logo size={40} />
        <h2 className={`mt-6 text-2xl font-extrabold cf-tight ${T.text}`}>
          {mode === "signup" ? "Create your account" : "Sign in to CampusFind"}
        </h2>
        <p className={`mt-2 text-sm ${T.sub}`}>
          {mode === "signup"
            ? "University email only. You'll set up an authenticator app next."
            : "Your password, then the six-digit code from your authenticator."}
        </p>

        <div className="mt-6 space-y-4">
          <Field label="University email">
            <Input value={email} type="email" autoComplete="username"
              onChange={(e) => { setEmail(e.target.value); setErr(""); }}
              placeholder="you@uniswa.ac.sz" />
          </Field>
          {email && !emailOk && (
            <p className="text-xs text-red-500">That isn't a university domain. Use your .ac or .edu address.</p>
          )}
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <Input value={password} type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => { setPassword(e.target.value); setErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && emailOk && password && submit()}
              placeholder="••••••••" />
          </Field>

          {err && <p className="text-xs text-red-500">{err}</p>}
          {sentReset && <p className="text-xs text-emerald-500">Reset link sent. Check your inbox.</p>}

          <Btn className="w-full" size="lg" disabled={!emailOk || password.length < 1 || busy} onClick={submit}>
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Continue"}
          </Btn>

          <div className="flex items-center justify-between">
            <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); }}
              className="text-sm font-semibold text-blue-600">
              {mode === "signup" ? "I already have an account" : "Create an account"}
            </button>
            {mode === "signin" && emailOk && (
              <button onClick={reset} className={`text-sm ${T.sub}`}>Forgot password</button>
            )}
          </div>
        </div>

        <div className={`mt-6 pt-5 border-t ${T.border} flex items-start gap-2.5 text-xs ${T.faint}`}>
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          Two steps are required before you can post or claim anything: your password, and a code from an
          authenticator app on your phone.
        </div>
      </div>
    </Modal>
  );
}

/**
 * Stands between a signed-in session and the app. Either sets up an
 * authenticator or asks for a code from one. There is no way past it, because
 * the database refuses to accept writes from a session that hasn't cleared it.
 */
function MfaGate({ session, onDone, onSignOut }) {
  const { T, dark, setDark } = useUi();
  const enrolling = session.stage === "enroll";
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!enrolling) return;
    let alive = true;
    api.auth.enroll(session.user)
      .then((f) => alive && setFactor(f))
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [enrolling]);

  const verify = async (value) => {
    setBusy(true); setErr("");
    try {
      await api.auth.verify(factor?.factorId, value ?? code);
      const fresh = await api.auth.current();
      onDone(fresh);
    } catch (e) {
      setErr(e.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`cf min-h-screen ${T.page} flex flex-col`}>
      <header className="px-5 h-16 flex items-center justify-between">
        <Logo size={30} />
        <div className="flex items-center gap-1">
          <button onClick={() => setDark(!dark)} className={`p-2.5 rounded-full ${T.hover} ${T.sub}`} aria-label="Theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Btn size="sm" variant="quiet" onClick={onSignOut}>Sign out</Btn>
        </div>
      </header>

      <div className="flex-1 flex items-start sm:items-center justify-center px-5 pb-16">
        <div className={`w-full max-w-md rounded-3xl border ${T.border} ${T.panel} p-8 ${T.shadow} cf-pop`}>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center">
            {enrolling ? <ShieldCheck size={22} className="text-white" /> : <Lock size={22} className="text-white" />}
          </div>

          {enrolling ? (
            <>
              <h1 className={`mt-5 text-2xl font-extrabold cf-tight ${T.text}`}>Set up your authenticator</h1>
              <p className={`mt-2 text-sm ${T.sub}`}>
                Scan this with Google Authenticator, or any authenticator app. From then on it shows a fresh six-digit
                code for CampusFind every 30 seconds.
              </p>

              {!factor && !err && (
                <div className={`mt-6 h-56 rounded-2xl ${T.sunk} cf-skeleton`} />
              )}

              {factor && (
                <>
                  <div className="mt-6 flex justify-center">
                    <div className="bg-white p-4 rounded-2xl">
                      {factor.qrDataUri ? (
                        <img src={factor.qrDataUri} alt="Authenticator QR code" width={200} height={200} />
                      ) : (
                        <div style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: factor.qrSvg || "" }} />
                      )}
                    </div>
                  </div>

                  <button onClick={() => setManual(!manual)} className={`mt-4 w-full text-center text-sm font-semibold text-blue-600`}>
                    {manual ? "Hide the setup key" : "Can't scan? Enter a key instead"}
                  </button>

                  {manual && (
                    <div className={`mt-3 rounded-2xl p-4 ${T.sunk}`}>
                      <p className={`text-xs ${T.sub}`}>Type this into your authenticator app.</p>
                      <p className={`mt-2 font-mono text-sm font-bold break-all ${T.text}`}>
                        {factor.secret.replace(/(.{4})/g, "$1 ").trim()}
                      </p>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(factor.secret); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                        className="mt-2 text-xs font-semibold text-blue-600">
                        {copied ? "Copied" : "Copy key"}
                      </button>
                    </div>
                  )}

                  <div className="mt-6">
                    <p className={`text-sm font-semibold mb-3 text-center ${T.text}`}>Enter the code it shows</p>
                    <CodeInput value={code} onChange={(v) => { setCode(v); setErr(""); }} onComplete={verify}
                      disabled={busy} invalid={!!err} />
                    <div className="mt-3"><CodeTimer /></div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className={`mt-5 text-2xl font-extrabold cf-tight ${T.text}`}>Enter your code</h1>
              <p className={`mt-2 text-sm ${T.sub}`}>
                Open your authenticator app and type the six digits shown next to CampusFind.
              </p>
              <div className="mt-7">
                <CodeInput value={code} onChange={(v) => { setCode(v); setErr(""); }} onComplete={verify}
                  disabled={busy} invalid={!!err} />
                <div className="mt-3"><CodeTimer /></div>
              </div>
            </>
          )}

          {err && <p className="mt-4 text-sm text-red-500 text-center">{err}</p>}

          <Btn className="mt-6 w-full" size="lg" disabled={code.length < 6 || busy} onClick={() => verify()}>
            {busy ? "Checking…" : enrolling ? "Turn on two-step sign-in" : "Verify"}
          </Btn>

          <p className={`mt-4 text-xs text-center ${T.faint}`}>
            {enrolling
              ? "Lost your phone later? Campus IT can reset this from the admin console."
              : "No access to your authenticator? Ask campus IT to reset it."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- dashboard --------------------------- */

function Dashboard({ items, go, onOpen, user, notifs }) {
  const { T } = useUi();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const mine = items.filter((i) => i.mine);
  const myMatches = mine.flatMap((m) => matchesFor(m, items).map((x) => ({ ...x, source: m })))
    .sort((a, b) => b.score - a.score).slice(0, 2);
  const recent = [...items].sort((a, b) => b.ts - a.ts).slice(0, 6);
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="max-w-6xl mx-auto px-5 py-8 space-y-10">
      <div className="cf-rise">
        <h1 className={`text-3xl sm:text-4xl font-extrabold cf-tight ${T.text}`}>{greet}, {user.name.split(" ")[0]} 👋</h1>
        <p className={`mt-2 ${T.sub}`}>Let's help you find what you're looking for.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-7 ${T.shadow}`}>
          <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center text-white text-xl">🔴</div>
          <h2 className={`mt-5 text-xl font-bold cf-tight ${T.text}`}>I lost something</h2>
          <p className={`mt-2 text-sm ${T.sub}`}>Report an item and ask the campus community for help finding it.</p>
          <Btn className="mt-5" icon={Plus} onClick={() => go("report-lost")}>Report lost item</Btn>
        </div>
        <div className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-7 ${T.shadow}`} style={{ animationDelay: "80ms" }}>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white text-xl">🟢</div>
          <h2 className={`mt-5 text-xl font-bold cf-tight ${T.text}`}>I found something</h2>
          <p className={`mt-2 text-sm ${T.sub}`}>Help return an item to whoever has been looking for it.</p>
          <Btn className="mt-5" variant="success" icon={HandHeart} onClick={() => go("report-found")}>Report found item</Btn>
        </div>
      </div>

      {myMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={19} className="text-violet-500" />
            <h2 className={`text-2xl font-extrabold cf-tight ${T.text}`}>Possible matches</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {myMatches.map((m) => <MatchCard key={m.item.id} match={m} onOpen={onOpen} />)}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { k: "Your reports", v: mine.length, s: `${mine.filter((m) => m.status === "recovered").length} recovered` },
          { k: "Unread alerts", v: unread, s: unread ? "Needs your attention" : "You're all caught up" },
          { k: "Found on campus today", v: items.filter((i) => i.type === "found" && Date.now() - i.ts < DAY).length, s: "Reported by students" },
        ].map((s, i) => (
          <div key={s.k} className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-6`} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`text-sm font-medium ${T.sub}`}>{s.k}</div>
            <div className={`mt-2 text-4xl font-extrabold cf-tight ${T.text}`}>{s.v}</div>
            <div className={`mt-1 text-xs ${T.faint}`}>{s.s}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-end justify-between mb-5">
          <h2 className={`text-2xl font-extrabold cf-tight ${T.text}`}>Recently reported</h2>
          <Btn variant="quiet" size="sm" onClick={() => go("explore")}>Explore all <ArrowRight size={15} /></Btn>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recent.map((it, i) => <ItemCard key={it.id} item={it} onOpen={onOpen} delay={i * 50} />)}
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match, onOpen, source }) {
  const { T } = useUi();
  const it = match.item;
  return (
    <div className={`rounded-3xl border ${T.border} ${T.panel} p-4 flex gap-4 items-center cf-lift`}>
      <Photo item={it} className="w-20 h-20 rounded-2xl shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-violet-500 text-white text-xs font-bold">{match.score}% match</span>
          <TypeBadge type={it.type} small />
        </div>
        <h4 className={`mt-2 font-bold cf-tight truncate ${T.text}`}>{it.name}</h4>
        <p className={`text-xs ${T.sub} truncate`}>{it.loc} · {ago(it.ts)}</p>
      </div>
      <Btn size="sm" variant="ghost" onClick={() => onOpen(it)}>Check</Btn>
    </div>
  );
}

/* ------------------------------ explore ---------------------------- */

const SUGGESTIONS = ["black backpack", "iPhone", "student card", "keys near library", "airpods", "calculator"];

function Explore({ items, onOpen, initialQuery }) {
  const { T } = useUi();
  const [q, setQ] = useState(initialQuery || "");
  const [focus, setFocus] = useState(false);
  const [type, setType] = useState("all");
  const [cat, setCat] = useState("all");
  const [loc, setLoc] = useState("");
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");
  const [sort, setSort] = useState("recent");
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 420); return () => clearTimeout(t); },
    [q, type, cat, loc, status, since, sort]);

  const results = useMemo(() => {
    const qw = words(q);
    let r = items.filter((i) => {
      if (type !== "all" && i.type !== type) return false;
      if (cat !== "all" && i.cat !== cat) return false;
      if (loc && i.loc !== loc) return false;
      if (status && i.status !== status) return false;
      if (since && Date.now() - i.ts > Number(since)) return false;
      if (qw.length) {
        const hay = new Set(words(`${i.name} ${i.desc} ${i.brand || ""} ${i.color || ""} ${i.loc} ${catOf(i.cat).label}`));
        return qw.some((w) => [...hay].some((h) => h.startsWith(w) || w.startsWith(h)));
      }
      return true;
    });
    if (sort === "recent") r.sort((a, b) => b.ts - a.ts);
    if (sort === "updated") r.sort((a, b) => (b.replies || 0) - (a.replies || 0));
    if (sort === "relevant") {
      const qw2 = words(q);
      r.sort((a, b) => {
        const sc = (i) => words(`${i.name} ${i.desc}`).filter((w) => qw2.includes(w)).length * 10 + (i.urgent ? 4 : 0) + i.views / 100;
        return sc(b) - sc(a);
      });
    }
    if (sort === "urgent") r.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.ts - a.ts);
    return r;
  }, [items, q, type, cat, loc, status, since, sort]);

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <h1 className={`text-3xl sm:text-4xl font-extrabold cf-tight ${T.text}`}>Explore lost &amp; found</h1>
      <p className={`mt-2 ${T.sub}`}>Every report from across campus, newest first.</p>

      <div className="relative mt-6">
        <div className={`flex items-center gap-2 p-2 rounded-3xl border ${T.border} ${T.panel} ${T.shadow}`}>
          <Search size={19} className={`ml-3 ${T.faint}`} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            placeholder="Search laptops, phones, bags, student cards..."
            className={`flex-1 bg-transparent outline-none text-sm py-2.5 ${T.text} ${T.d ? "placeholder-slate-500" : "placeholder-slate-400"}`} />
          {q && <button onClick={() => setQ("")} className={`p-2 rounded-full ${T.hover} ${T.faint}`}><X size={16} /></button>}
          <button onClick={() => setMore(!more)}
            className={`p-2.5 rounded-2xl ${more ? "bg-blue-600 text-white" : `${T.hover} ${T.sub}`}`} aria-label="More filters">
            <SlidersHorizontal size={17} />
          </button>
        </div>
        {focus && !q && (
          <div className={`absolute z-20 mt-2 w-full rounded-2xl border ${T.border} ${T.panel} shadow-xl p-2 cf-pop`}>
            <p className={`px-3 py-2 text-xs font-semibold ${T.faint}`}>Students often search for</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onMouseDown={() => setQ(s)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm ${T.text} ${T.hover} flex items-center gap-2.5`}>
                <Search size={14} className={T.faint} />{s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto cf-scroll pb-1">
        <Chip active={type === "all" && cat === "all"} onClick={() => { setType("all"); setCat("all"); }}>All</Chip>
        <Chip active={type === "lost"} onClick={() => setType(type === "lost" ? "all" : "lost")}>🔴 Lost</Chip>
        <Chip active={type === "found"} onClick={() => setType(type === "found" ? "all" : "found")}>🟢 Found</Chip>
        <span className={`w-px my-1 ${T.d ? "bg-slate-800" : "bg-slate-200"}`} />
        {CATEGORIES.slice(0, 8).map((c) => (
          <Chip key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? "all" : c.id)}>{c.emoji} {c.label}</Chip>
        ))}
      </div>

      {more && (
        <div className={`mt-4 grid sm:grid-cols-4 gap-3 p-4 rounded-3xl border ${T.border} ${T.panel} cf-pop`}>
          <Field label="Location">
            <Select value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Anywhere on campus"
              options={LOCATIONS.map((l) => ({ value: l, label: l }))} />
          </Field>
          <Field label="Reported">
            <Select value={since} onChange={(e) => setSince(e.target.value)} placeholder="Any time"
              options={[{ value: String(DAY), label: "Last 24 hours" }, { value: String(3 * DAY), label: "Last 3 days" }, { value: String(7 * DAY), label: "Last week" }]} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status"
              options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Field>
          <Field label="Sort by">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} placeholder="Most recent"
              options={[{ value: "recent", label: "Most recent" }, { value: "relevant", label: "Most relevant" },
                { value: "updated", label: "Most responses" }, { value: "urgent", label: "Urgent first" }]} />
          </Field>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className={`text-sm ${T.sub}`}>{loading ? "Searching…" : `${results.length} ${results.length === 1 ? "item" : "items"}`}</p>
        {(loc || status || since || cat !== "all" || type !== "all") && (
          <button onClick={() => { setLoc(""); setStatus(""); setSince(""); setCat("all"); setType("all"); }}
            className="text-sm font-semibold text-blue-600">Clear filters</button>
        )}
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
          : results.map((it, i) => <ItemCard key={it.id} item={it} onOpen={onOpen} delay={i * 40} />)}
      </div>

      {!loading && results.length === 0 && (
        <EmptyState emoji="🔍" title="Nothing matches that search yet"
          body="Try a broader word, drop a filter, or ask the campus community directly."
          action={<Btn variant="ghost" onClick={() => { setQ(""); setCat("all"); setType("all"); setLoc(""); }}>Reset search</Btn>} />
      )}
    </div>
  );
}

/* ---------------------------- item detail -------------------------- */

function ItemDetail({ item, items, onBack, onOpen, onRecover, onDelete, toast, user }) {
  const { T } = useUi();
  const [claim, setClaim] = useState(false);
  const [shot, setShot] = useState(0);
  const [info, setInfo] = useState(false);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [comments, setComments] = useState([]);
  useEffect(() => {
    let alive = true;
    api.listComments(item.id).then((c) => alive && setComments(c)).catch(() => {});
    return () => { alive = false; };
  }, [item.id]);
  const [draft, setDraft] = useState("");
  const c = catOf(item.cat);
  const matches = matchesFor(item, items);
  const lost = item.type === "lost";

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <button onClick={onBack} className={`inline-flex items-center gap-1.5 text-sm font-semibold ${T.sub} ${T.hover} rounded-xl px-3 py-2 -ml-3`}>
        <ChevronLeft size={17} /> Back
      </button>

      <div className="mt-4 grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <div className={`rounded-3xl overflow-hidden border ${T.border}`}>
            <Photo item={item} index={shot} className="h-72 sm:h-96" big />
          </div>
          <div className="mt-3 flex gap-3">
            {Array.from({ length: item.photos }).map((_, i) => (
              <button key={i} onClick={() => setShot(i)}
                className={`rounded-2xl overflow-hidden border-2 ${i === shot ? "border-blue-600" : T.border}`}>
                <Photo item={item} index={i} className="w-20 h-20" />
              </button>
            ))}
          </div>

          <div className="mt-8">
            <h3 className={`text-lg font-bold cf-tight ${T.text}`}>Campus responses</h3>
            <p className={`mt-1 text-sm ${T.sub}`}>Anything helps — where you saw it, or where you handed it in.</p>
            <div className="mt-4 space-y-3">
              {comments.map((cm, i) => (
                <div key={i} className={`flex gap-3 p-4 rounded-2xl border ${T.border} ${T.panel}`}>
                  <Avatar name={cm.who} size={36} verified />
                  <div>
                    <p className={`text-sm font-semibold ${T.text}`}>{cm.who} <span className={`font-normal text-xs ${T.faint}`}>· {ago(cm.ts)}</span></p>
                    <p className={`mt-1 text-sm ${T.sub}`}>{cm.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Share where you saw it…" />
              <Btn icon={Send} disabled={!draft.trim()}
                onClick={async () => {
                  await api.addComment(item.id, draft, user).catch(() => toast("Couldn't post that"));
                  setComments([...comments, { who: user.name, text: draft, ts: Date.now() }]);
                  setDraft(""); toast("Response posted");
                }}>
                Post
              </Btn>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <TypeBadge type={item.type} />
            <StatusBadge status={item.status} />
          </div>
          <h1 className={`mt-4 text-3xl font-extrabold cf-tight ${T.text}`}>{item.name}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <Meta icon={MapPin}>{item.loc}</Meta>
            <Meta icon={Calendar}>{fullDate(item.ts)}</Meta>
            <Meta icon={Clock}>{clock(item.ts)}</Meta>
            <Meta icon={Eye}>{item.views} views</Meta>
          </div>

          <div className={`mt-6 rounded-3xl border ${T.border} ${T.panel} p-6 space-y-5`}>
            <div>
              <h3 className={`text-sm font-bold ${T.text}`}>Description</h3>
              <p className={`mt-2 text-sm leading-relaxed ${T.sub}`}>{item.desc}</p>
            </div>
            <div className={`grid grid-cols-2 gap-4 pt-4 border-t ${T.border}`}>
              <div><p className={`text-xs ${T.faint}`}>Category</p><p className={`text-sm font-semibold ${T.text}`}>{c.emoji} {c.label}</p></div>
              <div><p className={`text-xs ${T.faint}`}>Colour</p><p className={`text-sm font-semibold ${T.text}`}>{item.color || "Not given"}</p></div>
              {item.brand && <div><p className={`text-xs ${T.faint}`}>Brand</p><p className={`text-sm font-semibold ${T.text}`}>{item.brand}</p></div>}
              <div><p className={`text-xs ${T.faint}`}>{lost ? "Last seen" : "Collect from"}</p><p className={`text-sm font-semibold ${T.text}`}>{item.spot}</p></div>
            </div>
            <div className={`pt-4 border-t ${T.border} flex items-center gap-3`}>
              <Avatar name={item.owner} verified />
              <div>
                <p className={`text-sm font-semibold ${T.text}`}>{item.owner}</p>
                <p className="text-xs text-sky-500 font-medium flex items-center gap-1"><ShieldCheck size={12} /> Verified student</p>
              </div>
            </div>
          </div>

          {!lost && (
            <div className={`mt-4 rounded-2xl p-4 flex gap-3 ${T.d ? "bg-amber-500 bg-opacity-10" : "bg-amber-50"}`}>
              <Info size={17} className="text-amber-600 shrink-0 mt-0.5" />
              <p className={`text-xs leading-relaxed ${T.d ? "text-amber-200" : "text-amber-800"}`}>
                Some details are held back on purpose so the real owner can prove the item is theirs.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3">
            {item.mine ? (
              <>
                {item.status !== "recovered" && (
                  <Btn className="w-full" size="lg" variant="success" icon={CheckCircle2} onClick={() => onRecover(item)}>Mark as recovered</Btn>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Btn variant="ghost" icon={Edit3} onClick={() => toast("Editing opens the report form")}>Edit</Btn>
                  <Btn variant="ghost" icon={Trash2} onClick={() => onDelete(item)}>Delete</Btn>
                </div>
              </>
            ) : (
              <>
                <Btn className="w-full" size="lg" icon={lost ? HandHeart : Check} onClick={() => setClaim(true)}>
                  {lost ? "I found this" : "I think this is mine"}
                </Btn>
                <Btn className="w-full" variant="ghost" icon={MessageCircle} onClick={() => setInfo(true)}>I have information</Btn>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="quiet" size="sm" icon={Share2} onClick={() => toast("Link copied")}>Share</Btn>
              <Btn variant="quiet" size="sm" icon={Flag}
                onClick={() => { api.flagItem(item.id, "Flagged from the item page", user).catch(() => {}); toast("Sent to moderators"); }}>Report</Btn>
            </div>
          </div>

          {matches.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-violet-500" />
                <h3 className={`text-lg font-bold cf-tight ${T.text}`}>Possible matches</h3>
              </div>
              <p className={`text-sm ${T.sub} mb-4`}>
                These {lost ? "found" : "lost"} reports look close to this one.
              </p>
              <div className="space-y-3">
                {matches.slice(0, 3).map((m) => <MatchCard key={m.item.id} match={m} onOpen={onOpen} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={claim} onClose={() => { setClaim(false); setSent(false); setAnswer(""); }}>
        <div className="p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto">
                <Check size={28} className="text-white" strokeWidth={3} />
              </div>
              <h2 className={`mt-5 text-xl font-bold cf-tight ${T.text}`}>Answer sent</h2>
              <p className={`mt-2 text-sm ${T.sub}`}>
                {item.owner.split(" ")[0]} will review it. If it checks out, CampusFind opens a private chat so you two can arrange the handover. Nobody's contact details are shared before that.
              </p>
              <Btn className="mt-6 w-full" onClick={() => { setClaim(false); setSent(false); }}>Done</Btn>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center"><Shield size={22} className="text-white" /></div>
              <h2 className={`mt-5 text-xl font-extrabold cf-tight ${T.text}`}>Prove it's yours</h2>
              <p className={`mt-2 text-sm ${T.sub}`}>
                One question stands between an item and the wrong hands. Answer it and the reporter decides.
              </p>
              <div className={`mt-5 p-4 rounded-2xl ${T.sunk}`}>
                <p className={`text-sm font-semibold ${T.text}`}>Describe one identifying feature that isn't visible in the public listing.</p>
              </div>
              <div className="mt-4">
                <Area2 rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)}
                  placeholder="For example: a mark, an engraving, what's inside, a sticker on the back…" />
              </div>
              <Btn className="mt-4 w-full" size="lg" disabled={answer.trim().length < 8}
                onClick={async () => {
                  await api.submitClaim(item.id, answer, user).catch(() => {});
                  setSent(true);
                }}>Send answer</Btn>
              <p className={`mt-3 text-xs text-center ${T.faint}`}>Your answer is visible only to the person who filed this report.</p>
            </>
          )}
        </div>
      </Modal>

      <Modal open={info} onClose={() => setInfo(false)}>
        <div className="p-8">
          <h2 className={`text-xl font-extrabold cf-tight ${T.text}`}>What do you know?</h2>
          <p className={`mt-2 text-sm ${T.sub}`}>Where you saw it, who you handed it to, roughly when — all of it helps.</p>
          <div className="mt-5">
            <Area2 rows={4} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="I saw something like this near…" />
          </div>
          <Btn className="mt-4 w-full" size="lg" disabled={!note.trim()}
            onClick={async () => {
              await api.addComment(item.id, note, user).catch(() => {});
              setComments([...comments, { who: user.name, text: note, ts: Date.now() }]);
              setNote(""); setInfo(false); toast("Thanks — your tip was posted");
            }}>
            Send information
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

/* --------------------------- report flow --------------------------- */

const STEPS_LOST = ["What you lost", "Where you lost it", "Photos", "Identifying details", "Review"];
const STEPS_FOUND = ["What you found", "Where you found it", "Photos", "Handover", "Review"];

function ReportFlow({ mode, onCancel, onPublish, items, onOpen, user }) {
  const { T } = useUi();
  const lost = mode === "lost";
  const steps = lost ? STEPS_LOST : STEPS_FOUND;
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: "", cat: "", desc: "", brand: "", color: "", loc: "", spot: "", room: "",
    date: new Date().toISOString().slice(0, 10), time: "14:30", photos: [],
    unique: "", serial: "", stickers: "", initials: "", marks: "", holding: "", collect: "", urgent: false,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const drop = useRef(null);
  const picker = useRef(null);
  const [over, setOver] = useState(false);

  const draft = {
    id: "draft", type: mode, name: f.name || (lost ? "Your lost item" : "Your found item"),
    cat: f.cat || "other", brand: f.brand, color: f.color, loc: f.loc || "Campus", spot: f.spot || f.collect || "—",
    ts: Date.now(), status: "active", views: 0, replies: 0, desc: f.desc || "Add a description so people know what to look for.",
    owner: user.name, photos: Math.max(1, f.photos.length), urgent: f.urgent,
    photoUrls: f.photos.map((p) => p.url),
  };
  const live = useMemo(() => (f.name && f.cat ? matchesFor(draft, items).slice(0, 2) : []), [f.name, f.cat, f.color, f.loc, items]);

  const canNext = () => {
    if (step === 0) return f.name.trim().length > 2 && f.cat;
    if (step === 1) return !!f.loc;
    return true;
  };

  const addFiles = (fileList) => {
    const picked = Array.from(fileList || []).filter((x) => x.type.startsWith("image/")).slice(0, 6);
    if (!picked.length) return;
    setF((p) => ({
      ...p,
      photos: [...p.photos, ...picked.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))].slice(0, 6),
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-extrabold cf-tight ${T.text}`}>
            {lost ? "Report a lost item" : "You found something? You're a legend. 🙌"}
          </h1>
          <p className={`mt-1.5 text-sm ${T.sub}`}>
            {lost ? "Five short steps. The campus sees it the moment you publish." : "Tell us enough to find the owner, and keep the private details private."}
          </p>
        </div>
        <button onClick={onCancel} className={`p-2.5 rounded-full ${T.hover} ${T.sub}`} aria-label="Cancel"><X size={20} /></button>
      </div>

      <div className="mt-7 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-blue-600" : T.d ? "bg-slate-800" : "bg-slate-200"}`} />
            <p className={`mt-2 text-xs font-medium hidden sm:block ${i === step ? "text-blue-600" : T.faint}`}>{s}</p>
          </div>
        ))}
      </div>
      <p className={`mt-3 text-xs font-semibold sm:hidden ${T.sub}`}>Step {step + 1} of 5 · {steps[step]}</p>

      <div className={`mt-6 rounded-3xl border ${T.border} ${T.panel} p-6 sm:p-8 ${T.shadow}`}>
        {step === 0 && (
          <div className="space-y-5 cf-rise">
            <h2 className={`text-xl font-bold cf-tight ${T.text}`}>{lost ? "What did you lose?" : "What did you find?"}</h2>
            <Field label="Item name"><Input value={f.name} onChange={set("name")} placeholder="Black Lenovo laptop" /></Field>
            <Field label="Category">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setF({ ...f, cat: c.id })}
                    className={`px-3 py-3 rounded-2xl text-sm font-semibold border text-left transition
                      ${f.cat === c.id ? "border-blue-600 bg-blue-600 text-white" : `${T.border} ${T.text} ${T.hover}`}`}>
                    <span className="mr-1.5">{c.emoji}</span>{c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description" hint={lost ? "The more specific, the better someone can recognise it." : "Describe it publicly without giving away what only the owner would know."}>
              <Area2 rows={4} value={f.desc} onChange={set("desc")} placeholder="Black laptop in a grey sleeve, small scratch near the trackpad…" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Brand"><Input value={f.brand} onChange={set("brand")} placeholder="Lenovo" /></Field>
              <Field label="Colour"><Input value={f.color} onChange={set("color")} placeholder="Black" /></Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 cf-rise">
            <h2 className={`text-xl font-bold cf-tight ${T.text}`}>{lost ? "Where did you lose it?" : "Where did you find it?"}</h2>
            <Field label="Campus location">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LOCATIONS.map((l) => (
                  <button key={l} onClick={() => setF({ ...f, loc: l })}
                    className={`px-3 py-3 rounded-2xl text-sm font-semibold border text-left flex items-center gap-2 transition
                      ${f.loc === l ? "border-blue-600 bg-blue-600 text-white" : `${T.border} ${T.text} ${T.hover}`}`}>
                    <MapPin size={14} className="shrink-0" />{l}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Building or room" hint="Optional"><Input value={f.room} onChange={set("room")} placeholder="Lab 3" /></Field>
              <Field label="Exact spot" hint="Optional"><Input value={f.spot} onChange={set("spot")} placeholder="2nd floor, quiet study zone" /></Field>
              <Field label={lost ? "Date lost" : "Date found"}><Input type="date" value={f.date} onChange={set("date")} /></Field>
              <Field label="Approximate time"><Input type="time" value={f.time} onChange={set("time")} /></Field>
            </div>
            {lost && (
              <button onClick={() => setF({ ...f, urgent: !f.urgent })}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition
                  ${f.urgent ? "border-red-500 bg-red-500 bg-opacity-10" : `${T.border} ${T.hover}`}`}>
                <AlertTriangle size={19} className={f.urgent ? "text-red-500" : T.faint} />
                <div>
                  <p className={`text-sm font-semibold ${T.text}`}>Mark as urgent</p>
                  <p className={`text-xs ${T.sub}`}>For exam cards, medication, keys — anything you need back today.</p>
                </div>
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 cf-rise">
            <h2 className={`text-xl font-bold cf-tight ${T.text}`}>Add photos</h2>
            <p className={`text-sm ${T.sub}`}>Photos more than double the chance of a match. Add up to six.</p>
            <div ref={drop}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => picker.current?.click()}
              className={`rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition
                ${over ? "border-blue-600 bg-blue-600 bg-opacity-5" : `${T.border} ${T.hover}`}`}>
              <Upload size={30} className={`mx-auto ${over ? "text-blue-600" : T.faint}`} />
              <p className={`mt-3 font-semibold ${T.text}`}>Drop photos here</p>
              <p className={`mt-1 text-sm ${T.sub}`}>or tap to choose from your phone</p>
              <input ref={picker} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {f.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {f.photos.map((p, i) => (
                  <div key={p.id} className="relative cf-pop">
                    <Photo item={draft} src={p.url} className="aspect-square rounded-2xl" />
                    <button onClick={() => setF({ ...f, photos: f.photos.filter((x) => x.id !== p.id) })}
                      className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-1.5 shadow-lg"><X size={13} /></button>
                    {i === 0 && <span className="absolute bottom-2 left-2 bg-white text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full">Cover</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && lost && (
          <div className="space-y-5 cf-rise">
            <h2 className={`text-xl font-bold cf-tight ${T.text}`}>Help us identify it</h2>
            <p className={`text-sm ${T.sub}`}>These stay private. They're what you'll use to prove the item is yours.</p>
            <Field label="What makes this item unique?"><Area2 rows={3} value={f.unique} onChange={set("unique")} placeholder="A blue satellite sticker on the lid" /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Serial number" hint="Optional"><Input value={f.serial} onChange={set("serial")} /></Field>
              <Field label="Stickers" hint="Optional"><Input value={f.stickers} onChange={set("stickers")} /></Field>
              <Field label="Initials" hint="Optional"><Input value={f.initials} onChange={set("initials")} /></Field>
              <Field label="Distinguishing marks" hint="Optional"><Input value={f.marks} onChange={set("marks")} /></Field>
            </div>
            <div className={`flex gap-3 p-4 rounded-2xl ${T.d ? "bg-blue-500 bg-opacity-10" : "bg-blue-50"}`}>
              <Lock size={17} className="text-blue-600 shrink-0 mt-0.5" />
              <p className={`text-xs leading-relaxed ${T.d ? "text-blue-200" : "text-blue-800"}`}>
                Private to you. CampusFind uses them to check claims, and never shows them on the public listing.
              </p>
            </div>
          </div>
        )}

        {step === 3 && !lost && (
          <div className="space-y-5 cf-rise">
            <h2 className={`text-xl font-bold cf-tight ${T.text}`}>Where can the owner collect it?</h2>
            <Field label="Where the item is right now">
              <Select value={f.holding} onChange={set("holding")} placeholder="Choose a safe place"
                options={[
                  { value: "security", label: "Campus security office" },
                  { value: "desk", label: "Front desk of the building" },
                  { value: "me", label: "With me" },
                  { value: "admin", label: "Faculty administration" },
                ]} />
            </Field>
            <Field label="Collection details" hint="A place and a time window is enough — no phone numbers.">
              <Area2 rows={3} value={f.collect} onChange={set("collect")} placeholder="Library front desk, weekdays between 09:00 and 16:00" />
            </Field>
            <div className={`flex gap-3 p-4 rounded-2xl ${T.d ? "bg-amber-500 bg-opacity-10" : "bg-amber-50"}`}>
              <Shield size={17} className="text-amber-600 shrink-0 mt-0.5" />
              <p className={`text-xs leading-relaxed ${T.d ? "text-amber-200" : "text-amber-800"}`}>
                Keep identifying details private so the real owner can prove ownership. If you found a wallet or a card, describe the outside only — never the contents, numbers or names.
              </p>
            </div>
            <Field label="What should the owner be able to tell you?" hint="Your verification question for anyone who claims it.">
              <Input value={f.unique} onChange={set("unique")} placeholder="What's on the keyring?" />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 cf-rise">
            <div>
              <h2 className={`text-xl font-bold cf-tight ${T.text}`}>Review and publish</h2>
              <p className={`mt-1 text-sm ${T.sub}`}>This is exactly what other students will see.</p>
            </div>
            <div className="max-w-sm"><ItemCard item={draft} onOpen={() => {}} /></div>
            {live.length > 0 && (
              <div className={`rounded-3xl border ${T.border} p-5 ${T.d ? "bg-violet-500 bg-opacity-10" : "bg-violet-50"}`}>
                <div className="flex items-center gap-2">
                  <Sparkles size={17} className="text-violet-600" />
                  <h3 className={`font-bold cf-tight ${T.text}`}>Possible matches already</h3>
                </div>
                <p className={`mt-1 text-sm ${T.sub}`}>These existing reports look close to yours. Worth a look before you publish.</p>
                <div className="mt-4 space-y-3">
                  {live.map((m) => <MatchCard key={m.item.id} match={m} onOpen={onOpen} />)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`mt-8 pt-6 border-t ${T.border} flex items-center justify-between gap-3`}>
          <Btn variant="quiet" icon={ChevronLeft} onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
            {step === 0 ? "Cancel" : "Back"}
          </Btn>
          {step < 4 ? (
            <Btn disabled={!canNext()} onClick={() => setStep(step + 1)}>Continue <ChevronRight size={16} /></Btn>
          ) : (
            <Btn size="lg" variant={lost ? "primary" : "success"} icon={Check}
              onClick={() => onPublish(
                { ...draft, id: uid(), mine: true, room: f.room,
                  spot: f.spot || f.collect || f.room || "—",
                  unique: f.unique, holding: f.holding, verifyQuestion: !lost ? f.unique : null },
                f.photos.map((p) => p.file)
              )}>
              {lost ? "Publish lost item" : "Publish found item"}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- my reports --------------------------- */

function MyReports({ items, archive = [], onOpen, onRecover, onDelete, go }) {
  const { T } = useUi();
  const [tab, setTab] = useState("all");
  const mine = items.filter((i) => i.mine);
  const marks = archive.filter((a) => a.mine);
  const shown = mine.filter((i) =>
    tab === "all" ? true : tab === "recovered" ? i.status === "recovered" : i.type === tab);
  const shownMarks = marks.filter((m) =>
    tab === "all" || tab === "recovered" ? true : m.type === tab);

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={`text-3xl font-extrabold cf-tight ${T.text}`}>My reports</h1>
          <p className={`mt-1.5 ${T.sub}`}>Everything you've posted, and how it's going.</p>
        </div>
        <Btn icon={Plus} onClick={() => go("report-lost")} className="hidden sm:inline-flex">New report</Btn>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto cf-scroll pb-1">
        {[["all", "All"], ["lost", "Lost"], ["found", "Found"], ["recovered", "Recovered"]].map(([k, l]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {l} <span className="opacity-60">{
            k === "all" ? mine.length + marks.length
            : k === "recovered" ? mine.filter((m) => m.status === "recovered").length + marks.filter((m) => m.outcome === "recovered").length
            : mine.filter((m) => m.type === k).length + marks.filter((m) => m.type === k).length
          }</span>
          </Chip>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {shown.map((it, i) => {
          const m = matchesFor(it, items);
          return (
            <div key={it.id} style={{ animationDelay: `${i * 50}ms` }}
              className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-4 sm:p-5 flex flex-col sm:flex-row gap-5`}>
              <Photo item={it} className="w-full sm:w-28 h-28 rounded-2xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <TypeBadge type={it.type} small /><StatusBadge status={it.status} />
                </div>
                <h3 className={`mt-2 text-lg font-bold cf-tight ${T.text}`}>{it.name}</h3>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <Meta icon={MapPin}>{it.loc}</Meta><Meta icon={Calendar}>{fullDate(it.ts)}</Meta>
                  <Meta icon={Eye}>{it.views} views</Meta><Meta icon={MessageCircle}>{it.replies} responses</Meta>
                </div>
                {m.length > 0 && it.status !== "recovered" && (
                  <button onClick={() => onOpen(m[0].item)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600">
                    <Sparkles size={14} />{m.length} possible {m.length === 1 ? "match" : "matches"} <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
              <div className="flex sm:flex-col gap-2 shrink-0">
                <Btn size="sm" variant="ghost" onClick={() => onOpen(it)}>View</Btn>
                {it.status !== "recovered" && (
                  <Btn size="sm" variant="success" onClick={() => onRecover(it)}>Recovered</Btn>
                )}
                <Btn size="sm" variant="quiet" onClick={() => onDelete(it)} icon={Trash2}>{""}</Btn>
              </div>
            </div>
          );
        })}
      </div>

      {shownMarks.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2">
            <h2 className={`text-sm font-bold ${T.text}`}>Cleared reports</h2>
            <span className={`text-xs ${T.faint}`}>details removed, record kept</span>
          </div>
          <div className="mt-3 space-y-3">
            {shownMarks.map((m, i) => <ArchiveCard key={m.id} mark={m} delay={i * 40} />)}
          </div>
        </div>
      )}

      {shown.length === 0 && shownMarks.length === 0 && (
        <EmptyState emoji="🗂️" title="Your reports will appear here"
          body="Report something you lost, or something you found on campus, and it shows up in this list."
          action={<Btn icon={Plus} onClick={() => go("report-lost")}>Report an item</Btn>} />
      )}
    </div>
  );
}

/* -------------------------- help me find it ------------------------ */

function HelpBoard({ posts, setPosts, user, toast }) {
  const { T } = useUi();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", item: "", loc: "", time: "", detail: "" });
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState("");

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={`text-3xl font-extrabold cf-tight ${T.text}`}>Ask campus</h1>
          <p className={`mt-1.5 ${T.sub}`}>Sometimes a person remembers what a search box can't.</p>
        </div>
        <Btn icon={Plus} onClick={() => setOpen(true)}>Ask campus</Btn>
      </div>

      <div className="mt-7 space-y-4">
        {posts.map((p, i) => (
          <div key={p.id} style={{ animationDelay: `${i * 60}ms` }}
            className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-6`}>
            <div className="flex items-center gap-3">
              <Avatar name={p.author} verified />
              <div>
                <p className={`text-sm font-semibold ${T.text}`}>{p.author}</p>
                <p className={`text-xs ${T.faint}`}>{ago(p.ts)}</p>
              </div>
            </div>
            <h3 className={`mt-4 text-xl font-bold cf-tight ${T.text}`}>{p.title}</h3>
            <p className={`mt-2 text-sm ${T.sub}`}>{p.detail}</p>
            <div className={`mt-4 rounded-2xl p-4 ${T.sunk} space-y-1.5`}>
              <p className={`text-sm font-semibold ${T.text}`}>🎒 {p.item}</p>
              <Meta icon={MapPin}>Last seen: {p.loc}</Meta>
              <div><Meta icon={Clock}>{p.time}</Meta></div>
            </div>

            {p.replies.length > 0 && (
              <div className={`mt-5 pl-4 border-l-2 ${T.border} space-y-4`}>
                {p.replies.map((r, j) => (
                  <div key={j} className="flex gap-3">
                    <Avatar name={r.who} size={30} />
                    <div>
                      <p className={`text-sm font-semibold ${T.text}`}>{r.who} <span className={`font-normal text-xs ${T.faint}`}>· {ago(r.ts)}</span></p>
                      <p className={`text-sm ${T.sub}`}>{r.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {replyTo === p.id ? (
              <div className="mt-4 flex gap-2">
                <Input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="I think I saw it near…" />
                <Btn icon={Send} disabled={!reply.trim()} onClick={async () => {
                  await api.addHelpReply(p.id, reply, user).catch(() => toast("Couldn't post that"));
                  setPosts(posts.map((x) => x.id === p.id ? { ...x, replies: [...x.replies, { who: user.name, text: reply, ts: Date.now() }] } : x));
                  setReply(""); setReplyTo(null); toast("Reply posted");
                }}>Send</Btn>
              </div>
            ) : (
              <button onClick={() => setReplyTo(p.id)}
                className={`mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600`}>
                <MessageCircle size={15} />Reply {p.replies.length > 0 && `(${p.replies.length})`}
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} wide>
        <div className="p-8 space-y-4">
          <h2 className={`text-2xl font-extrabold cf-tight ${T.text}`}>Ask campus for help</h2>
          <Field label="Your question"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Has anyone seen my backpack?" /></Field>
          <Field label="The item"><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="Black Nike backpack" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Last seen"><Select value={form.loc} onChange={(e) => setForm({ ...form, loc: e.target.value })} placeholder="Pick a place" options={LOCATIONS.map((l) => ({ value: l, label: l }))} /></Field>
            <Field label="Roughly when"><Input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="Around 14:30" /></Field>
          </div>
          <Field label="Anything that helps people recognise it">
            <Area2 rows={3} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Black with a white logo and a green keyring on the zip." />
          </Field>
          <Btn className="w-full" size="lg" disabled={!form.title || !form.item}
            onClick={async () => {
              await api.createHelpPost(form, user).catch(() => toast("Couldn't post that"));
              setPosts([{ id: uid(), author: user.name, ...form, ts: Date.now(), replies: [] }, ...posts]);
              setOpen(false); setForm({ title: "", item: "", loc: "", time: "", detail: "" }); toast("Posted to campus");
            }}>Post to campus</Btn>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------- notifications -------------------------- */

const NOTIF_ICON = {
  match: { i: Sparkles, c: "bg-violet-500" },
  reply: { i: MessageCircle, c: "bg-blue-600" },
  recovered: { i: CheckCircle2, c: "bg-emerald-500" },
  claim: { i: Shield, c: "bg-amber-500" },
};

function Notifications({ notifs, setNotifs, items, onOpen }) {
  const { T } = useUi();
  const [prefs, setPrefs] = useState({ match: true, reply: true, weekly: false });
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={`text-3xl font-extrabold cf-tight ${T.text}`}>Alerts</h1>
          <p className={`mt-1.5 ${T.sub}`}>{unread ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        {unread > 0 && (
          <button onClick={() => {
              api.markRead(notifs.filter((n) => !n.read).map((n) => n.id)).catch(() => {});
              setNotifs(notifs.map((n) => ({ ...n, read: true })));
            }}
            className="text-sm font-semibold text-blue-600">Mark all as read</button>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {notifs.map((n, i) => {
          const N = NOTIF_ICON[n.kind];
          const target = items.find((x) => x.id === n.link);
          return (
            <button key={n.id} style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => {
                if (!n.read) api.markRead([n.id]).catch(() => {});
                setNotifs(notifs.map((x) => x.id === n.id ? { ...x, read: true } : x));
                if (target) onOpen(target);
              }}
              className={`cf-rise w-full text-left rounded-3xl border p-5 flex gap-4 transition
                ${n.read ? `${T.border} ${T.panel}` : `border-blue-500 ${T.panel}`} ${T.hover}`}>
              <div className={`w-11 h-11 rounded-2xl ${N.c} flex items-center justify-center shrink-0`}>
                <N.i size={19} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`font-bold cf-tight ${T.text}`}>{n.title}</p>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <p className={`mt-1 text-sm ${T.sub}`}>{n.body}</p>
                <p className={`mt-2 text-xs ${T.faint}`}>{ago(n.ts)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {notifs.length === 0 && <EmptyState emoji="✨" title="You're all caught up" body="Matches, replies and claims land here as they happen." />}

      <div className={`mt-8 rounded-3xl border ${T.border} ${T.panel} p-6`}>
        <h3 className={`font-bold cf-tight ${T.text}`}>What you get alerted about</h3>
        <div className="mt-4 space-y-1">
          {[["match", "A found item looks like something you lost"], ["reply", "Someone responds to your report"], ["weekly", "A weekly digest of items found near you"]].map(([k, label]) => (
            <button key={k} onClick={() => setPrefs({ ...prefs, [k]: !prefs[k] })}
              className={`w-full flex items-center justify-between gap-4 py-3 text-left`}>
              <span className={`text-sm ${T.sub}`}>{label}</span>
              <span className={`w-11 h-6 rounded-full p-0.5 transition shrink-0 ${prefs[k] ? "bg-blue-600" : T.d ? "bg-slate-700" : "bg-slate-300"}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${prefs[k] ? "translate-x-5" : ""}`} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- profile ----------------------------- */

function SecurityCard() {
  const { T } = useUi();
  const [factors, setFactors] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.auth.factorInfo().then(setFactors).catch(() => setFactors([]));
  useEffect(() => { refresh(); }, []);

  const on = factors && factors.length > 0;

  return (
    <div className={`mt-5 rounded-3xl border ${T.border} ${T.panel} p-6`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${on ? "bg-emerald-500" : "bg-amber-500"}`}>
          <ShieldCheck size={19} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold cf-tight ${T.text}`}>Two-step sign-in</h3>
          <p className={`mt-1 text-sm ${T.sub}`}>
            {factors === null ? "Checking…"
              : on ? `On — ${factors[0].name}. A code from your authenticator is required every time you sign in.`
                   : "Off. You won't be able to post or claim anything until it's on."}
          </p>
          {on && factors[0].addedAt && (
            <p className={`mt-1 text-xs ${T.faint}`}>Added {fullDate(new Date(factors[0].addedAt).getTime())}</p>
          )}
        </div>
      </div>

      {on && (
        confirming ? (
          <div className={`mt-5 rounded-2xl p-4 ${T.d ? "bg-red-500 bg-opacity-10" : "bg-red-50"}`}>
            <p className={`text-sm font-semibold ${T.text}`}>Remove your authenticator?</p>
            <p className={`mt-1 text-xs ${T.sub}`}>
              You'll be signed out and asked to set up a new one before you can post again.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Btn size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Btn>
              <Btn size="sm" variant="danger" disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await api.auth.unenroll().catch(() => {});
                  await api.auth.signOut();
                  window.location.reload();
                }}>Remove</Btn>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className={`mt-4 text-sm font-semibold text-red-500`}>
            Remove this authenticator
          </button>
        )
      )}
    </div>
  );
}

function Profile({ user, items, archive = [], dark, setDark, onSignOut, go }) {
  const { T } = useUi();
  const mine = items.filter((i) => i.mine);
  const marks = archive.filter((a) => a.mine);
  const stats = [
    { v: mine.length + marks.length, k: "Reports" },
    { v: mine.filter((m) => m.status === "recovered").length + marks.filter((m) => m.outcome === "recovered").length, k: "Items returned" },
    { v: mine.filter((i) => i.type === "found").length + marks.filter((m) => m.type === "found").length, k: "Items found" },
  ];
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <div className={`rounded-3xl border ${T.border} ${T.panel} p-8 text-center ${T.shadow}`}>
        <div className="flex justify-center"><Avatar name={user.name} size={84} verified /></div>
        <h1 className={`mt-5 text-2xl font-extrabold cf-tight ${T.text}`}>{user.name}</h1>
        <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500 text-white text-xs font-bold">
          <ShieldCheck size={13} /> Verified university student
        </span>
        <p className={`mt-3 text-sm ${T.faint}`}>{user.email}</p>
        <div className={`mt-7 grid grid-cols-3 divide-x ${T.d ? "divide-slate-800" : "divide-slate-200"}`}>
          {stats.map((s) => (
            <div key={s.k}>
              <div className={`text-3xl font-extrabold cf-tight ${T.text}`}>{s.v}</div>
              <div className={`mt-1 text-xs ${T.sub}`}>{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      <SecurityCard />

      <div className={`mt-5 rounded-3xl border ${T.border} ${T.panel} overflow-hidden`}>
        {[
          { i: LayoutGrid, l: "My reports", a: () => go("myreports") },
          { i: Bell, l: "Alert preferences", a: () => go("notifications") },
          { i: Shield, l: "Privacy and safety", a: () => go("safety") },
          { i: BarChart3, l: "Admin console", a: () => go("admin"), note: "Staff" },
        ].map((r, i) => (
          <button key={r.l} onClick={r.a}
            className={`w-full flex items-center gap-4 px-6 py-4 text-left ${T.hover} ${i > 0 ? `border-t ${T.border}` : ""}`}>
            <r.i size={19} className={T.sub} />
            <span className={`flex-1 text-sm font-semibold ${T.text}`}>{r.l}</span>
            {r.note && <span className={`text-xs px-2 py-0.5 rounded-full ${T.sunk} ${T.sub}`}>{r.note}</span>}
            <ChevronRight size={17} className={T.faint} />
          </button>
        ))}
      </div>

      <div className={`mt-5 rounded-3xl border ${T.border} ${T.panel} p-5 flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          {dark ? <Moon size={19} className={T.sub} /> : <Sun size={19} className={T.sub} />}
          <span className={`text-sm font-semibold ${T.text}`}>Dark mode</span>
        </div>
        <button onClick={() => setDark(!dark)} aria-label="Toggle dark mode"
          className={`w-11 h-6 rounded-full p-0.5 transition ${dark ? "bg-blue-600" : "bg-slate-300"}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${dark ? "translate-x-5" : ""}`} />
        </button>
      </div>

      <Btn className="mt-5 w-full" variant="ghost" onClick={onSignOut}>Sign out</Btn>
    </div>
  );
}

function Safety({ T }) {
  return null;
}

/* ------------------------------ admin ------------------------------ */

function ChartBox({ kind, data, dark }) {
  const { T } = useUi();
  return (
    <React.Suspense fallback={<div className={`w-full h-full rounded-2xl ${T.sunk} cf-skeleton`} />}>
      <Charts kind={kind} data={data} dark={dark} />
    </React.Suspense>
  );
}

function Admin({ items, archive = [], toast }) {
  const { T } = useUi();
  const [tab, setTab] = useState("overview");
  // Live rows plus archived marks, so purging never dents the statistics.
  const all = [
    ...items.map((i) => ({ type: i.type, cat: i.cat, loc: i.loc, ts: i.ts, state: i.status })),
    ...archive.map((a) => ({ type: a.type, cat: a.cat, loc: a.loc, ts: a.reportedAt, state: a.outcome })),
  ];
  const total = all.length;
  const lost = all.filter((i) => i.type === "lost").length;
  const found = total - lost;
  const rec = all.filter((i) => i.state === "recovered" || i.state === "returned").length;
  const active = items.filter((i) => i.status === "active").length;
  const matchCount = items.reduce((n, i) => n + (matchesFor(i, items).length > 0 ? 1 : 0), 0);

  const byCat = CATEGORIES.map((c) => ({ name: c.label, value: all.filter((i) => i.cat === c.id).length }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const byLoc = LOCATIONS.map((l) => ({ name: l.replace("Main ", ""), value: all.filter((i) => i.loc === l).length }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const overTime = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * DAY);
    return {
      name: d.toLocaleDateString("en-GB", { weekday: "short" }),
      reports: items.filter((x) => Math.abs(x.ts - d.getTime()) < DAY / 2).length + (i % 3) + 2,
    };
  });

  const flagged = [
    { id: "f1", item: "Blue Samsung Phone", why: "Reported as a duplicate of an existing listing", who: "Melusi Z.", ts: now - 5 * H },
    { id: "f2", item: "Student card — Faculty of Commerce", why: "Listing may show a student number", who: "Sana K.", ts: now - 11 * H },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center"><BarChart3 size={20} className="text-white" /></div>
        <div>
          <h1 className={`text-2xl font-extrabold cf-tight ${T.text}`}>Admin console</h1>
          <p className={`text-sm ${T.sub}`}>Moderation and campus-wide insight.</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto cf-scroll pb-1">
        {[["overview", "Overview"], ["moderation", "Moderation"], ["insights", "Campus insights"]].map(([k, l]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{l}</Chip>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { k: "Total reports", v: total }, { k: "Lost", v: lost }, { k: "Found", v: found },
              { k: "Recovered", v: rec, accent: "text-emerald-500" }, { k: "Active", v: active },
              { k: "With matches", v: matchCount, accent: "text-violet-500" },
              { k: "Cleared to marks", v: archive.length, accent: "text-sky-500" },
            ].map((s) => (
              <div key={s.k} className={`rounded-3xl border ${T.border} ${T.panel} p-5`}>
                <div className={`text-xs font-medium ${T.sub}`}>{s.k}</div>
                <div className={`mt-2 text-3xl font-extrabold cf-tight ${s.accent || T.text}`}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid lg:grid-cols-3 gap-5">
            <div className={`lg:col-span-2 rounded-3xl border ${T.border} ${T.panel} p-6`}>
              <h3 className={`font-bold cf-tight ${T.text}`}>Reports this week</h3>
              <div className="mt-5 h-56">
                <ChartBox kind="area" data={overTime} dark={T.d} />
              </div>
            </div>
            <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
              <h3 className={`font-bold cf-tight ${T.text}`}>Lost items by category</h3>
              <div className="mt-2 h-56">
                <ChartBox kind="pie" data={byCat.slice(0, 6)} dark={T.d} />
              </div>
              <div className="space-y-1.5">
                {byCat.slice(0, 4).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                    <span className={`flex-1 ${T.sub}`}>{c.name}</span>
                    <span className={`font-semibold ${T.text}`}>{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "moderation" && (
        <div className="mt-6 space-y-5">
          <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
            <h3 className={`font-bold cf-tight ${T.text}`}>Flagged for review</h3>
            <div className="mt-4 space-y-3">
              {flagged.map((f) => (
                <div key={f.id} className={`rounded-2xl border ${T.border} p-4 flex flex-col sm:flex-row sm:items-center gap-4`}>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${T.text}`}>{f.item}</p>
                    <p className={`text-xs ${T.sub} mt-0.5`}>{f.why}</p>
                    <p className={`text-xs ${T.faint} mt-1`}>Flagged by {f.who} · {ago(f.ts)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn size="sm" variant="ghost" onClick={() => toast("Listing kept")}>Keep</Btn>
                    <Btn size="sm" variant="ghost" icon={Edit3} onClick={() => toast("Sent back for edits")}>Request edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => toast("Listing removed")}>Remove</Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
            <h3 className={`font-bold cf-tight ${T.text}`}>Recent reports</h3>
            <div className="mt-4 space-y-2">
              {items.slice(0, 7).map((i) => (
                <div key={i.id} className={`flex items-center gap-4 p-3 rounded-2xl ${T.hover}`}>
                  <Photo item={i} className="w-11 h-11 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${T.text}`}>{i.name}</p>
                    <p className={`text-xs ${T.faint}`}>{i.owner} · {i.loc} · {ago(i.ts)}</p>
                  </div>
                  <TypeBadge type={i.type} small />
                  <button className={`p-2 rounded-full ${T.hover} ${T.faint}`} onClick={() => toast("Options")}><MoreHorizontal size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
            <h3 className={`font-bold cf-tight ${T.text}`}>Accounts needing attention</h3>
            <div className="mt-4 space-y-3">
              {[{ n: "Unverified account", e: "guest****@gmail.com", why: "Not a university domain — cannot post" },
                { n: "Sipho M.", e: "sm****@uniswa.ac.sz", why: "Three claims rejected this week" }].map((u) => (
                <div key={u.e} className={`flex items-center gap-4 p-4 rounded-2xl border ${T.border}`}>
                  <Avatar name={u.n} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${T.text}`}>{u.n}</p>
                    <p className={`text-xs ${T.faint}`}>{u.e} · {u.why}</p>
                  </div>
                  <Btn size="sm" variant="ghost" icon={Ban} onClick={() => toast("Account suspended")}>Suspend</Btn>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "insights" && (
        <div className="mt-6 space-y-5">
          <div className="grid sm:grid-cols-4 gap-4">
            {[{ k: "Most lost category", v: "🎧 Electronics", s: "32% of reports" },
              { k: "Most common location", v: "📚 Library", s: "1 in 4 reports" },
              { k: "Peak reporting time", v: "14:00–17:00", s: "After afternoon lectures" },
              { k: "Recovery rate", v: `${Math.round((rec / Math.max(total, 1)) * 100)}%`, s: "Returned to owners", accent: true }].map((s) => (
              <div key={s.k} className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
                <p className={`text-xs font-medium ${T.sub}`}>{s.k}</p>
                <p className={`mt-2 text-2xl font-extrabold cf-tight ${s.accent ? "text-emerald-500" : T.text}`}>{s.v}</p>
                <p className={`mt-1 text-xs ${T.faint}`}>{s.s}</p>
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
              <h3 className={`font-bold cf-tight ${T.text}`}>Reports by location</h3>
              <div className="mt-5 h-64">
                <ChartBox kind="bar" data={byLoc} dark={T.d} />
              </div>
            </div>
            <div className={`rounded-3xl border ${T.border} ${T.panel} p-6`}>
              <h3 className={`font-bold cf-tight ${T.text}`}>Most frequently lost</h3>
              <ol className="mt-5 space-y-3">
                {["Student cards", "Earphones", "Keys", "Water bottles", "Bags"].map((x, i) => (
                  <li key={x} className={`flex items-center gap-4 p-3 rounded-2xl ${T.sunk}`}>
                    <span className={`w-7 h-7 rounded-full ${T.panel} flex items-center justify-center text-xs font-bold ${T.text}`}>{i + 1}</span>
                    <span className={`flex-1 text-sm font-semibold ${T.text}`}>{x}</span>
                    <span className={`text-xs ${T.sub}`}>{[64, 51, 43, 38, 29][i]} reports</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- safety page ----------------------------- */

function SafetyPage() {
  const { T } = useUi();
  const rules = [
    { i: Mail, t: "University email only", b: "Accounts are verified against university domains. Nobody outside campus can post a report or claim an item." },
    { i: Lock, t: "Your contact details stay hidden", b: "Students message each other through CampusFind. Phone numbers, addresses and student numbers are never published." },
    { i: Shield, t: "Claims are checked, not granted", b: "Anyone claiming an item answers a question only the owner could answer. The person who filed the report decides." },
    { i: Flag, t: "Report anything that looks off", b: "Every listing has a report button. Moderators review flagged content and can remove it within the hour." },
    { i: Ban, t: "Suspicious accounts get blocked", b: "Repeated false claims, duplicate reports or harassment lead to suspension." },
  ];
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className={`text-3xl font-extrabold cf-tight ${T.text}`}>Privacy and safety</h1>
      <p className={`mt-2 ${T.sub}`}>How CampusFind keeps an honest campus service from being misused.</p>
      <div className="mt-7 space-y-4">
        {rules.map((r, i) => (
          <div key={r.t} style={{ animationDelay: `${i * 60}ms` }} className={`cf-rise rounded-3xl border ${T.border} ${T.panel} p-6 flex gap-4`}>
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0"><r.i size={19} className="text-white" /></div>
            <div>
              <h3 className={`font-bold cf-tight ${T.text}`}>{r.t}</h3>
              <p className={`mt-1.5 text-sm leading-relaxed ${T.sub}`}>{r.b}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ chrome ----------------------------- */

const NAV = [
  { k: "home", l: "Home", i: Home },
  { k: "explore", l: "Explore", i: Compass },
  { k: "help", l: "Ask campus", i: HandHeart },
  { k: "myreports", l: "My reports", i: LayoutGrid },
  { k: "notifications", l: "Alerts", i: Bell },
  { k: "profile", l: "Profile", i: Users },
];

function Sidebar({ page, go, unread }) {
  const { T } = useUi();
  return (
    <aside className={`hidden lg:flex flex-col w-60 shrink-0 border-r ${T.border} ${T.panel} h-screen sticky top-0 p-5`}>
      <div className="px-2 py-2"><Logo /></div>
      <nav className="mt-6 space-y-1">
        {NAV.map((n) => (
          <button key={n.k} onClick={() => go(n.k)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition
              ${page === n.k ? "bg-blue-600 text-white" : `${T.sub} ${T.hover}`}`}>
            <n.i size={18} />{n.l}
            {n.k === "notifications" && unread > 0 && (
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-bold ${page === n.k ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}>{unread}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-6">
        <Btn className="w-full" icon={Plus} onClick={() => go("report-lost")}>Report an item</Btn>
      </div>
      <div className={`mt-auto rounded-3xl p-5 ${T.sunk}`}>
        <p className={`text-sm font-bold cf-tight ${T.text}`}>68% get returned</p>
        <p className={`mt-1 text-xs ${T.sub}`}>Most items come back when they're reported within a day.</p>
      </div>
    </aside>
  );
}

function TopBar({ go, unread, dark, setDark, user }) {
  const { T } = useUi();
  return (
    <header className={`lg:hidden sticky top-0 z-30 border-b ${T.border} ${T.panel}`}>
      <div className="px-5 h-16 flex items-center justify-between">
        <button onClick={() => go("home")}><Logo size={30} /></button>
        <div className="flex items-center gap-1">
          <button onClick={() => setDark(!dark)} className={`p-2.5 rounded-full ${T.hover} ${T.sub}`} aria-label="Theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => go("notifications")} className={`relative p-2.5 rounded-full ${T.hover} ${T.sub}`} aria-label="Alerts">
            <Bell size={18} />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
          </button>
          <button onClick={() => go("profile")} className="ml-1"><Avatar name={user.name} size={32} verified /></button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ page, go }) {
  const { T } = useUi();
  const tabs = [
    { k: "home", l: "Home", i: Home }, { k: "explore", l: "Explore", i: Search },
    { k: "report", l: "Report", i: Plus }, { k: "notifications", l: "Alerts", i: Bell },
    { k: "profile", l: "Profile", i: Users },
  ];
  return (
    <nav className={`lg:hidden fixed bottom-0 inset-x-0 z-30 border-t ${T.border} ${T.panel}`}>
      <div className="grid grid-cols-5 px-2 py-2">
        {tabs.map((t) => t.k === "report" ? (
          <button key={t.k} onClick={() => go("report-lost")} className="flex flex-col items-center gap-1 py-1">
            <span className="w-11 h-11 -mt-5 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
              <Plus size={22} className="text-white" strokeWidth={2.6} />
            </span>
            <span className={`text-xs font-semibold ${T.faint}`}>Report</span>
          </button>
        ) : (
          <button key={t.k} onClick={() => go(t.k)} className="flex flex-col items-center gap-1 py-1.5">
            <t.i size={20} className={page === t.k ? "text-blue-600" : T.faint} strokeWidth={page === t.k ? 2.6 : 2} />
            <span className={`text-xs font-semibold ${page === t.k ? "text-blue-600" : T.faint}`}>{t.l}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
/* ---------------------------- archive card ------------------------- */

/**
 * What's left of a report after its details are purged. Deliberately thin:
 * a category, a place, and how long it took to come back.
 */
function ArchiveCard({ mark, delay = 0 }) {
  const { T } = useUi();
  const c = catOf(mark.cat);
  const returned = mark.outcome === "recovered" || mark.outcome === "returned";
  return (
    <div style={{ animationDelay: `${delay}ms` }}
      className={`cf-rise rounded-3xl border border-dashed ${T.border} p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-2xl ${T.sunk} flex items-center justify-center text-xl shrink-0`}>{c.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${returned
            ? T.d ? "bg-emerald-500 bg-opacity-15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
            : T.d ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
            {returned ? "Recovered" : mark.outcome === "expired" ? "Expired" : "Removed"}
          </span>
          <span className={`text-xs ${T.faint}`}>{mark.type === "lost" ? "Lost report" : "Found report"}</span>
        </div>
        <p className={`mt-1.5 text-sm font-semibold ${T.text}`}>{c.label} · {mark.loc}</p>
        <p className={`text-xs ${T.sub}`}>
          {returned ? `Back with its owner in ${mark.days} ${mark.days === 1 ? "day" : "days"}` : `Closed after ${mark.days} days`}
          {" · "}details removed {ago(mark.resolvedAt)}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- app ------------------------------- */

export default function App() {
  const [dark, setDark] = useState(false);
  const T = useMemo(() => tokens(dark), [dark]);

  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const user = session?.stage === "ready" ? session.user : null;

  const [page, setPage] = useState("home");
  const [item, setItem] = useState(null);
  const [query, setQuery] = useState("");

  const [items, setItems] = useState([]);
  const [archive, setArchive] = useState([]);
  const [posts, setPosts] = useState([]);
  const [notifs, setNotifs] = useState([]);

  const [toasts, setToasts] = useState([]);
  const [confetti, setConfetti] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [justRecovered, setJustRecovered] = useState(null);

  const unread = notifs.filter((n) => !n.read).length;

  const toast = (msg, kind = "ok") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const load = async (u) => {
    try {
      const [i, a, p, n] = await Promise.all([
        api.listItems(u?.id), api.listArchive(u?.id), api.listHelpPosts(), api.listNotifications(u),
      ]);
      setItems(i); setArchive(a); setPosts(p); setNotifs(n);
    } catch (e) {
      // A backend that is down should never mean a blank screen.
      setItems(SEED_ITEMS);
      toast("Couldn't reach the database — showing sample data");
    }
  };

  useEffect(() => {
    (async () => {
      const s = await api.auth.current().catch(() => null);
      setSession(s);
      // Only a session that cleared both factors may read campus data.
      if (s?.stage === "ready") await load(s.user);
      else if (!s) await load(null);
      setBooting(false);
    })();
  }, []);

  const go = (p, q) => {
    if (!user) { setPending(p); setAuthOpen(true); return; }
    if (q !== undefined) setQuery(q);
    setItem(null);
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  const openItem = (it) => { setItem(it); setPage("item"); api.bumpViews(it.id); window.scrollTo({ top: 0 }); };

  const onSignedIn = async (s) => {
    setSession(s);
    setAuthOpen(false);
    if (s.stage !== "ready") return;   // MfaGate takes over from here
    await load(s.user);
    setPage(pending && pending !== "item" ? pending : item ? "item" : "home");
    toast(`Welcome, ${s.user.name.split(" ")[0]}`);
  };

  const onFactorCleared = async (s) => {
    setSession(s);
    await load(s.user);
    setPage(pending && pending !== "item" ? pending : item ? "item" : "home");
    toast(`Welcome, ${s.user.name.split(" ")[0]}`);
  };

  const signOut = async () => {
    await api.auth.signOut();
    setSession(null);
    setPage("home");
    setItem(null);
  };

  const publish = async (draft, files) => {
    try {
      const created = await api.createItem(draft, user, files);
      const fresh = [created, ...items];
      setItems(fresh);
      setPage("myreports");
      toast(draft.type === "lost" ? "Lost item published" : "Found item published");

      const m = matchesFor(created, items);
      if (m.length) {
        api.saveMatch(
          created.type === "lost" ? created.id : m[0].item.id,
          created.type === "lost" ? m[0].item.id : created.id,
          m[0].score
        );
        setTimeout(async () => {
          await api.pushNotification({
            kind: "match", title: "Possible match found",
            body: `Your ${created.name} report may match "${m[0].item.name}" at ${m[0].item.loc}.`,
            link: m[0].item.id,
          }, user);
          setNotifs(await api.listNotifications(user));
          toast(`${m.length} possible ${m.length === 1 ? "match" : "matches"} found`, "match");
        }, 1400);
      }
    } catch (e) {
      toast("Publishing failed — check your connection");
    }
  };

  const recover = async (it) => {
    try {
      await api.setStatus(it.id, "recovered");
      setItems((all) => all.map((x) => (x.id === it.id ? { ...x, status: "recovered" } : x)));
      if (item && item.id === it.id) setItem({ ...it, status: "recovered" });
      setConfetti(true);
      setTimeout(() => setConfetti(false), 2600);
      setJustRecovered({ ...it, status: "recovered" });
    } catch {
      toast("Couldn't update that report");
    }
  };

  /** Purge the report, keep the mark. */
  const archiveNow = async (it, outcome = "recovered") => {
    try {
      const mark = await api.archiveItem(it, outcome, user);
      setItems((all) => all.filter((x) => x.id !== it.id));
      setArchive((a) => [mark, ...a]);
      setJustRecovered(null);
      setConfirm(null);
      if (page === "item") setPage("myreports");
      toast("Details removed, record kept");
    } catch {
      toast("Couldn't remove that report");
    }
  };

  const eraseNow = async (it) => {
    try {
      await api.deleteItem(it.id);
      setItems((all) => all.filter((x) => x.id !== it.id));
      setConfirm(null);
      if (page === "item") setPage("myreports");
      toast("Report erased");
    } catch {
      toast("Couldn't erase that report");
    }
  };

  const ctx = { T, dark, setDark };

  if (booting) {
    return (
      <Ui.Provider value={ctx}>
        <div className={`cf min-h-screen ${T.page} flex items-center justify-center`}>
          <div className="text-center">
            <Logo size={44} wordmark={false} />
            <p className={`mt-4 text-sm ${T.sub}`}>Loading campus reports…</p>
          </div>
        </div>
      </Ui.Provider>
    );
  }

  // Signed in, but the second factor is still outstanding.
  if (session && session.stage !== "ready") {
    return (
      <Ui.Provider value={ctx}>
        <MfaGate session={session} onDone={onFactorCleared} onSignOut={signOut} />
      </Ui.Provider>
    );
  }

  if (!user) {
    return (
      <Ui.Provider value={ctx}>
        <div className="cf">
          <Landing
            items={items}
            onOpen={(it) => { setPending("item"); setItem(it); setAuthOpen(true); }}
            onEnter={(p, q) => { setPending(typeof p === "string" ? p : "home"); if (q) setQuery(q); setAuthOpen(true); }} />
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSignedIn={onSignedIn} />
          <Toasts toasts={toasts} />
        </div>
      </Ui.Provider>
    );
  }

  const isReport = page === "report-lost" || page === "report-found";

  return (
    <Ui.Provider value={ctx}>
      <div className={`cf min-h-screen ${T.page}`}>
        <div className="flex">
          <Sidebar page={page} go={go} unread={unread} />
          <div className="flex-1 min-w-0">
            <TopBar go={go} unread={unread} dark={dark} setDark={setDark} user={user} />
            <main className="pb-28 lg:pb-10">
              {page === "home" && <Dashboard items={items} go={go} onOpen={openItem} user={user} notifs={notifs} />}
              {page === "explore" && <Explore items={items} onOpen={openItem} initialQuery={query} />}
              {page === "help" && <HelpBoard posts={posts} setPosts={setPosts} user={user} toast={toast} />}
              {page === "myreports" && (
                <MyReports items={items} archive={archive} onOpen={openItem} onRecover={recover}
                  onDelete={(it) => setConfirm(it)} go={go} />
              )}
              {page === "notifications" && (
                <Notifications notifs={notifs} setNotifs={setNotifs} items={items} onOpen={openItem} />
              )}
              {page === "profile" && (
                <Profile user={user} items={items} archive={archive} dark={dark} setDark={setDark} go={go}
                  onSignOut={signOut} />
              )}
              {page === "safety" && <SafetyPage />}
              {page === "admin" && <Admin items={items} archive={archive} toast={toast} />}
              {page === "item" && item && (
                <ItemDetail item={items.find((x) => x.id === item.id) || item} items={items} user={user}
                  onBack={() => go("explore")} onOpen={openItem} onRecover={recover}
                  onDelete={(it) => setConfirm(it)} toast={toast} />
              )}
              {isReport && (
                <ReportFlow mode={page === "report-lost" ? "lost" : "found"} items={items} user={user}
                  onCancel={() => go("home")} onPublish={publish} onOpen={openItem} />
              )}
            </main>
          </div>
        </div>

        <BottomNav page={page} go={go} />
        <Toasts toasts={toasts} />
        {confetti && <Confetti />}

        {/* After a recovery: offer to purge the details straight away. */}
        <Modal open={!!justRecovered} onClose={() => setJustRecovered(null)}>
          <div className="p-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={26} className="text-white" />
            </div>
            <h2 className={`mt-5 text-xl font-extrabold cf-tight ${T.text}`}>Back where it belongs 🎉</h2>
            <p className={`mt-2 text-sm ${T.sub}`}>
              The listing has done its job. You can clear the photos and description now, or leave it up — either way
              CampusFind keeps a small record that a {justRecovered?.cat === "cards" ? "student card" : "item"} in this
              category came back, so the campus recovery figures stay accurate.
            </p>
            <div className={`mt-5 rounded-2xl p-4 ${T.sunk} space-y-2`}>
              <p className={`text-xs font-semibold ${T.text}`}>What gets kept</p>
              <p className={`text-xs ${T.sub}`}>Category, location, dates, and how long it took. No photos, no description, no comments.</p>
            </div>
            <div className="mt-6 space-y-3">
              <Btn className="w-full" size="lg" icon={Trash2} onClick={() => archiveNow(justRecovered, "recovered")}>
                Remove the details now
              </Btn>
              <Btn className="w-full" variant="ghost" onClick={() => setJustRecovered(null)}>
                Leave it up for now
              </Btn>
            </div>
            <p className={`mt-3 text-xs text-center ${T.faint}`}>
              Anything left up is cleared automatically 30 days after recovery.
            </p>
          </div>
        </Modal>

        {/* Delete: two outcomes, and the difference is spelled out. */}
        <Modal open={!!confirm} onClose={() => setConfirm(null)}>
          <div className="p-8">
            <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center">
              <Trash2 size={20} className="text-white" />
            </div>
            <h2 className={`mt-5 text-xl font-extrabold cf-tight ${T.text}`}>Remove this report?</h2>
            <p className={`mt-2 text-sm ${T.sub}`}>
              {confirm?.name} disappears from Explore and anyone following it stops getting updates.
            </p>
            <div className="mt-6 space-y-3">
              <button onClick={() => archiveNow(confirm, confirm?.status === "recovered" ? "recovered" : "removed")}
                className={`w-full text-left p-4 rounded-2xl border ${T.border} ${T.hover}`}>
                <p className={`text-sm font-bold ${T.text}`}>Remove the details, keep the record</p>
                <p className={`mt-1 text-xs ${T.sub}`}>
                  Photos, description and comments are deleted. A one-line mark stays behind so the item still counts
                  towards campus recovery statistics.
                </p>
              </button>
              <button onClick={() => eraseNow(confirm)}
                className={`w-full text-left p-4 rounded-2xl border ${T.border} ${T.hover}`}>
                <p className={`text-sm font-bold text-red-500`}>Erase completely</p>
                <p className={`mt-1 text-xs ${T.sub}`}>
                  Nothing is kept. Use this if the report was a mistake or shouldn't have been posted.
                </p>
              </button>
              <Btn className="w-full" variant="quiet" onClick={() => setConfirm(null)}>Keep it</Btn>
            </div>
          </div>
        </Modal>
      </div>
    </Ui.Provider>
  );
}

function Toasts({ toasts }) {
  const style = { ok: "bg-slate-900 text-white", match: "bg-violet-600 text-white", win: "bg-emerald-500 text-white" };
  const Icon = { ok: Check, match: Sparkles, win: CheckCircle2 };
  return (
    <div className="fixed bottom-24 lg:bottom-6 inset-x-0 z-50 flex flex-col items-center gap-2 px-5 pointer-events-none">
      {toasts.map((t) => {
        const I = Icon[t.kind] || Check;
        return (
          <div key={t.id} className={`cf-pop flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold ${style[t.kind] || style.ok}`}>
            <I size={16} strokeWidth={2.6} />{t.msg}
          </div>
        );
      })}
    </div>
  );
}

function Confetti() {
  const colors = ["#2563EB", "#38BDF8", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444"];
  const bits = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.5,
    dur: 1.6 + Math.random() * 1.1, color: colors[i % colors.length],
  })), []);
  return (
    <div className="pointer-events-none" aria-hidden="true">
      {bits.map((b) => (
        <span key={b.id} className="cf-confetti"
          style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />
      ))}
    </div>
  );
}

/* Exported for tests and for anyone splitting this file up later. Unused
   exports are tree-shaken out of the production bundle. */
export { Ui, AuthModal, MfaGate, CodeInput, Dashboard, Explore, MyReports, Notifications, Profile, Admin, ItemDetail, ReportFlow, HelpBoard, SafetyPage, ArchiveCard };
