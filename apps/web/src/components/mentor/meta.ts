import type { Severity, Violation, ViolationCode } from "@/lib/types";
import type { FinalOutcome } from "@/lib/api";

export type Verdict = "CONFIRMED" | "OVERRULED";
export type VerdictOf = (v: Violation) => Verdict | undefined;
export type RiskBand = "HIGH" | "MEDIUM" | "LOW";

export const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
/** How many risk points a confirmed or pending event contributes; overruled events are subtracted again. */
export const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 3, MEDIUM: 8, HIGH: 15, CRITICAL: 30 };

export const SEVERITY_STYLE: Record<Severity, { label: string; dot: string; chip: string; border: string }> = {
  LOW: { label: "Low", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700", border: "border-slate-300" },
  MEDIUM: { label: "Medium", dot: "bg-warning", chip: "bg-amber-50 text-amber-700", border: "border-warning" },
  HIGH: { label: "High", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700", border: "border-orange-500" },
  CRITICAL: { label: "Critical", dot: "bg-danger", chip: "bg-red-50 text-danger", border: "border-danger" },
};

export const VIOLATION_LABEL: Record<ViolationCode, string> = {
  MULTIPLE_FACES: "Multiple faces",
  NO_FACE: "No face",
  GAZE_AWAY: "Gaze away",
  FACE_MISMATCH: "Face mismatch",
  AI_SITE_OPENED: "AI site opened",
  AI_QUERY_DETECTED: "AI query detected",
  BLACKLISTED_APP: "Blacklisted app",
  SCREEN_MIRRORING: "Screen mirroring",
  MULTI_MONITOR: "Extra monitor",
  VM_DETECTED: "Virtual machine",
  REMOTE_DESKTOP: "Remote desktop",
  EXTERNAL_DEVICE: "External device",
  CLIPBOARD_USE: "Clipboard use",
  SHORTCUT_BLOCKED: "Shortcut blocked",
  SCREEN_SHARE_STOPPED: "Screen share stopped",
  CAMERA_BLOCKED: "Camera blocked",
  MULTI_LOGIN: "Multiple logins",
  NETWORK_LOST: "Network lost",
  WINDOW_BLUR: "Window focus lost",
  VOICE_DETECTED: "Voice detected",
  MIC_BLOCKED: "Microphone blocked",
  PHONE_DETECTED: "Phone detected",
  NOTES_DETECTED: "Notes detected",
};

export function riskBand(score: number): RiskBand {
  return score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
}

const RISK_TONES: Record<RiskBand, { label: string; bar: string; text: string; stroke: string }> = {
  HIGH: { label: "High", bar: "bg-danger", text: "text-danger", stroke: "#DC2626" },
  MEDIUM: { label: "Medium", bar: "bg-warning", text: "text-amber-700", stroke: "#F59E0B" },
  LOW: { label: "Low", bar: "bg-success", text: "text-success", stroke: "#16A34A" },
};
export const riskTone = (score: number) => RISK_TONES[riskBand(score)];

export function adjustRisk(risk: number, violations: Violation[], verdictOf: VerdictOf): number {
  const removed = violations.reduce((sum, v) => (verdictOf(v) === "OVERRULED" ? sum + SEVERITY_WEIGHT[v.severity] : sum), 0);
  return Math.max(0, risk - removed);
}

/** Mirrors the default policy: any confirmed CRITICAL or a third confirmed HIGH disqualifies. */
export function suggestOutcome(violations: Violation[], verdictOf: VerdictOf): FinalOutcome {
  const confirmed = violations.filter((v) => verdictOf(v) === "CONFIRMED");
  if (confirmed.some((v) => v.severity === "CRITICAL")) return "DISQUALIFY";
  if (confirmed.filter((v) => v.severity === "HIGH").length >= 3) return "DISQUALIFY";
  if (confirmed.some((v) => SEVERITY_RANK[v.severity] >= SEVERITY_RANK.MEDIUM)) return "WARN";
  return "CLEAR";
}

const clock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
export const formatClock = (iso: string) => clock.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

export function offsetFrom(startIso: string, atIso: string): string {
  const s = Math.max(0, Math.round((Date.parse(atIso) - Date.parse(startIso)) / 1000));
  return `+${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function formatRelative(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

const AVATAR_TONES = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700"];
export const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
export const avatarTone = (name: string) => AVATAR_TONES[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];

export function downloadCsv(filename: string, rows: string[][]): void {
  const body = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
