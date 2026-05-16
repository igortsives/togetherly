import { NextResponse } from "next/server";
import { refreshAllStaleSources } from "@/lib/sources/scheduler";

/**
 * Internal scheduler endpoint for issue #40. Designed to be hit by
 * Vercel Cron (or an equivalent external scheduler) on a daily
 * cadence. Authenticated by a shared secret in `SCHEDULER_SECRET`.
 *
 * The endpoint dispatches a refresh to every `CalendarSource` whose
 * `lastFetchedAt` is older than the cadence (or null). Per-source
 * advisory locking inside `refreshSource` prevents two overlapping
 * cron firings (or a manual-refresh racing the cron) from doing the
 * same work twice.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Accept either `CRON_SECRET` (auto-set by Vercel Cron) or
  // `SCHEDULER_SECRET` (the original name for local dev / other
  // cron services). Vercel sets `CRON_SECRET` when cron is enabled
  // on the project, so deployments don't need to maintain a
  // separate variable.
  const secret = process.env.CRON_SECRET ?? process.env.SCHEDULER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET / SCHEDULER_SECRET is not configured" },
      { status: 503 }
    );
  }

  const provided = extractBearer(request.headers.get("authorization"));
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await refreshAllStaleSources();
  return NextResponse.json(summary);
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time comparison without pulling in `node:crypto` here —
  // length difference still leaks but the same difference leaks via
  // the auth-header path anyway, and Node's `timingSafeEqual`
  // requires equal-length Buffers.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
