export type Activity = {
  id: string;
  at: string;
  text: string;
  hash?: `0x${string}`;
  mon?: number;
};

export function pushActivity(list: Activity[], text: string, extra?: Partial<Activity>): Activity[] {
  return [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      text,
      ...extra,
    },
    ...list,
  ].slice(0, 40);
}
