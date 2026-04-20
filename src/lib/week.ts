export function getWeekOfLabel(opts: { includeYear?: boolean } = {}): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offset);

  const fmt: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (opts.includeYear) fmt.year = 'numeric';
  return monday.toLocaleDateString('en-US', fmt);
}
