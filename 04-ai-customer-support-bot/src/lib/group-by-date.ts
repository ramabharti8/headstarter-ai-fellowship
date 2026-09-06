export interface DatedItem {
  id: string;
  updatedAt: string | Date;
}

/** Group items into "Today / Yesterday / Previous 7 days / Previous 30 days / Older". */
export function groupByDate<T extends DatedItem>(items: T[]): Array<{ label: string; items: T[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;

  const buckets: Record<string, T[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };

  for (const item of items) {
    const t = new Date(item.updatedAt).getTime();
    if (t >= startOfToday) buckets["Today"].push(item);
    else if (t >= startOfToday - day) buckets["Yesterday"].push(item);
    else if (t >= startOfToday - 7 * day) buckets["Previous 7 days"].push(item);
    else if (t >= startOfToday - 30 * day) buckets["Previous 30 days"].push(item);
    else buckets["Older"].push(item);
  }

  return Object.entries(buckets)
    .filter(([, v]) => v.length > 0)
    .map(([label, items]) => ({ label, items }));
}
