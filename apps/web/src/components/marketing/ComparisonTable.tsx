import { Check, Minus, X } from "lucide-react";

type Support = "yes" | "partial" | "no";

interface Row {
  feature: string;
  detail: string;
  ours: Support;
  typical: Support;
  typicalNote?: string;
}

const ROWS: Row[] = [
  { feature: "Dedicated secure desktop app", detail: "Monitored exam browser instead of a browser tab", ours: "yes", typical: "partial", typicalNote: "Browser extension only" },
  { feature: "Face verification + OTP at entry", detail: "Matches the registered candidate before the exam starts", ours: "yes", typical: "partial", typicalNote: "OTP only" },
  { feature: "Multiple-face and gaze detection", detail: "Continuous webcam analysis with severity levels", ours: "yes", typical: "partial", typicalNote: "Snapshots every few minutes" },
  { feature: "Entire-screen sharing enforced", detail: "Exam pauses if sharing stops", ours: "yes", typical: "partial", typicalNote: "Tab sharing allowed" },
  { feature: "Blacklisted apps closed before start", detail: "Remote desktop, screen recorders, chat tools", ours: "yes", typical: "no" },
  { feature: "VM and remote desktop detection", detail: "Checked at system check and during the exam", ours: "yes", typical: "no" },
  { feature: "Every URL and search query logged", detail: "AI sites and AI-style prompts are flagged", ours: "yes", typical: "no" },
  { feature: "Marks deducted by policy", detail: "Configurable per exam, confirmed by a proctor", ours: "yes", typical: "partial", typicalNote: "Manual action only" },
  { feature: "Proctor live grid and termination", detail: "Screens, webcam, risk score and violation feed", ours: "yes", typical: "partial", typicalNote: "Recordings reviewed later" },
  { feature: "Human review of every penalty", detail: "Proctors confirm or overrule with evidence", ours: "yes", typical: "no" },
  { feature: "Autosave through network drops", detail: "Answers queue locally and sync on reconnect", ours: "yes", typical: "partial" },
];

const META: Record<Support, { icon: typeof Check; label: string; cls: string }> = {
  yes: { icon: Check, label: "Supported", cls: "bg-green-50 text-success" },
  partial: { icon: Minus, label: "Partially supported", cls: "bg-amber-50 text-warning" },
  no: { icon: X, label: "Not supported", cls: "bg-red-50 text-danger" },
};

function Mark({ value, note }: { value: Support; note?: string }) {
  const { icon: Icon, label, cls } = META[value];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cls}`}>
        <Icon className="h-4 w-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
      {note && <span className="text-xs text-slate-500">{note}</span>}
    </div>
  );
}

export function ComparisonTable() {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-12px_rgba(10,77,166,0.18)]">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Comparison of DEV102 Smart Proctoring with typical online test tools</caption>
        <thead>
          <tr className="bg-soft">
            <th scope="col" className="px-5 py-4 font-heading text-sm font-semibold text-slate-900">
              Capability
            </th>
            <th scope="col" className="px-5 py-4 text-center font-heading text-sm font-semibold text-primary">
              DEV102 Proctoring
            </th>
            <th scope="col" className="px-5 py-4 text-center font-heading text-sm font-semibold text-slate-500">
              Typical online test tools
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.feature} className="border-t border-border transition-colors hover:bg-soft/60">
              <th scope="row" className="px-5 py-4 align-top font-normal">
                <span className="block text-sm font-semibold text-slate-900">{r.feature}</span>
                <span className="block text-sm text-slate-500">{r.detail}</span>
              </th>
              <td className="px-5 py-4 align-middle">
                <Mark value={r.ours} />
              </td>
              <td className="px-5 py-4 align-middle">
                <Mark value={r.typical} note={r.typicalNote} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
