export type Matrix2SessionVisualTone =
  | "keynote"
  | "breakout"
  | "networking"
  | "meal"
  | "registration"
  | "expo"
  | "vip"
  | "default";

function normalizedSessionType(sessionType: string): string {
  return sessionType.trim().toLowerCase();
}

/** The shared Run of Show session-type presentation mapping. */
export function matrix2SessionVisualTone(sessionType: string): Matrix2SessionVisualTone {
  const normalized = normalizedSessionType(sessionType);

  if (/\b(vip|executive|leadership)\b/.test(normalized)) return "vip";
  if (/\b(registration|attendee services?|guest services?)\b/.test(normalized)) return "registration";
  if (/\b(expo|exhibit|trade show)\b/.test(normalized)) return "expo";
  if (/\b(lunch|dinner|breakfast|meal|coffee|break)\b/.test(normalized)) return "meal";
  if (/\b(networking|reception|social)\b/.test(normalized)) return "networking";
  if (/\b(keynote|general session|plenary)\b/.test(normalized)) return "keynote";
  if (/\b(breakout|panel|workshop)\b/.test(normalized)) return "breakout";

  return "default";
}

export function matrix2SessionCardTypeClasses(sessionType: string): string {
  switch (matrix2SessionVisualTone(sessionType)) {
    case "keynote":
      return "border-l-4 border-l-violet-500 bg-violet-50/75 text-violet-950";
    case "breakout":
      return "border-l-4 border-l-sky-500 bg-sky-50/75 text-sky-950";
    case "networking":
      return "border-l-4 border-l-fuchsia-500 bg-fuchsia-50/75 text-fuchsia-950";
    case "meal":
      return "border-l-4 border-l-amber-500 bg-amber-50/75 text-amber-950";
    case "registration":
      return "border-l-4 border-l-teal-500 bg-teal-50/75 text-teal-950";
    case "expo":
      return "border-l-4 border-l-cyan-500 bg-cyan-50/75 text-cyan-950";
    case "vip":
      return "border-l-4 border-l-indigo-500 bg-indigo-50/75 text-indigo-950";
    default:
      return "border-l-4 border-l-slate-400 bg-slate-50/75 text-slate-900";
  }
}

export function matrix2SessionTypeBadgeClasses(sessionType: string): string {
  switch (matrix2SessionVisualTone(sessionType)) {
    case "keynote": return "bg-violet-100 text-violet-800";
    case "breakout": return "bg-sky-100 text-sky-800";
    case "networking": return "bg-fuchsia-100 text-fuchsia-800";
    case "meal": return "bg-amber-100 text-amber-800";
    case "registration": return "bg-teal-100 text-teal-800";
    case "expo": return "bg-cyan-100 text-cyan-800";
    case "vip": return "bg-indigo-100 text-indigo-800";
    default: return "bg-slate-100 text-slate-700";
  }
}
