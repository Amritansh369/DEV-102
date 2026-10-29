export type TimeTheme = 'morning' | 'day' | 'night'
/** Organisation look until a join link says the role, then the role's own look. */
export type Look = 'org' | 'student' | 'proctor'

export function getTimeTheme(date: Date): TimeTheme {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'day'
  return 'night'
}

export const backgroundFor = (look: Look, time: TimeTheme): string => `/images/bg/${look}-${time}.webp`
