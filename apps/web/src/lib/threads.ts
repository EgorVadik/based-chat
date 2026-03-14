import type { Id } from "@based-chat/backend/convex/_generated/dataModel";

export type ThreadSummary = {
  _id: Id<"threads">;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export function getThreadsByTimeGroup(threads: ThreadSummary[]) {
  const groups: { label: string; threads: ThreadSummary[] }[] = [];
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000;
  const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;

  const today = threads.filter((thread) => thread.updatedAt >= todayStartMs);
  const yesterday = threads.filter(
    (thread) =>
      thread.updatedAt >= yesterdayStartMs && thread.updatedAt < todayStartMs,
  );
  const thisWeek = threads.filter(
    (thread) =>
      thread.updatedAt >= weekAgoMs && thread.updatedAt < yesterdayStartMs,
  );
  const older = threads.filter((thread) => thread.updatedAt < weekAgoMs);

  if (today.length > 0) {
    groups.push({ label: "Today", threads: today });
  }
  if (yesterday.length > 0) {
    groups.push({ label: "Yesterday", threads: yesterday });
  }
  if (thisWeek.length > 0) {
    groups.push({ label: "Previous 7 days", threads: thisWeek });
  }
  if (older.length > 0) {
    groups.push({ label: "Older", threads: older });
  }

  return groups;
}
