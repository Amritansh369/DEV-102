/** Accepts the full link from the email (…/join/<token>) or the bare token; null when neither is present. */
export function parseInviteToken(text: string): string | null {
  return /(?:^|\/join\/|\s)([a-f0-9]{48})(?=$|[/?#\s])/i.exec(text.trim())?.[1]?.toLowerCase() ?? null;
}
