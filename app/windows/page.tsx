import Link from "next/link";
import { Calendar, Search } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { searchFreeWindowsAction } from "../actions";

export const dynamic = "force-dynamic";

type WindowsPageProps = {
  searchParams: Promise<{ searchId?: string }>;
};

type ExplanationShape = {
  blockedBefore?: BlockingShape;
  blockedAfter?: BlockingShape;
};

type BlockingShape = {
  eventId: string;
  title: string;
  calendarId: string;
  calendarName: string;
  start: string;
  end: string;
};

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const inputDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC"
});

function toInputDate(date: Date) {
  return inputDateFormatter.format(date);
}

function formatDate(date: Date | string) {
  return dayFormatter.format(typeof date === "string" ? new Date(date) : date);
}

export default async function WindowsPage({ searchParams }: WindowsPageProps) {
  const params = await searchParams;
  const family = await requireUserFamily().catch(() => null);

  const calendars = family
    ? await prisma.calendar.findMany({
        where: { familyId: family.id },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const enabledCount = calendars.filter((calendar) => calendar.enabled).length;

  const search =
    family && params.searchId
      ? await prisma.freeWindowSearch.findFirst({
          where: { id: params.searchId, familyId: family.id },
          include: {
            results: {
              orderBy: { startDate: "asc" }
            }
          }
        })
      : null;

  const today = new Date();
  const defaultStart = toInputDate(today);
  const defaultEnd = toInputDate(
    new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)
  );

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Togetherly navigation">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            T
          </div>
          <div>
            <p>Togetherly</p>
            <span>Private beta</span>
          </div>
        </div>
        <nav className="nav">
          <Link href="/#setup">Setup</Link>
          <Link href="/#sources">Sources</Link>
          <Link href="/windows">Free windows</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Free window search</p>
            <h1>Find shared free time across the family.</h1>
          </div>
          <Link className="primaryButton" href="/">
            <Calendar size={18} aria-hidden="true" />
            Back to dashboard
          </Link>
        </header>

        <section className="summaryGrid" aria-label="Search context">
          <div className="metric">
            <span>Enabled calendars</span>
            <strong>{enabledCount}</strong>
          </div>
          <div className="metric">
            <span>Last search</span>
            <strong>{search ? formatDate(search.createdAt) : "None"}</strong>
          </div>
          <div className="metric">
            <span>Matches</span>
            <strong>{search ? search.results.length : 0}</strong>
          </div>
          <div className="metric">
            <span>Minimum days</span>
            <strong>{search ? search.minimumDays : "—"}</strong>
          </div>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">New search</p>
              <h2>Pick a date range and minimum trip length.</h2>
            </div>
          </div>
          <form action={searchFreeWindowsAction} className="searchForm">
            <label>
              Start date
              <input
                name="startDate"
                type="date"
                required
                defaultValue={search ? toInputDate(search.startDate) : defaultStart}
              />
            </label>
            <label>
              End date
              <input
                name="endDate"
                type="date"
                required
                defaultValue={search ? toInputDate(search.endDate) : defaultEnd}
              />
            </label>
            <label>
              Minimum days
              <input
                name="minimumDays"
                type="number"
                min={1}
                max={365}
                required
                defaultValue={search ? search.minimumDays : 5}
              />
            </label>
            <label className="checkboxField">
              <input
                name="includeUnknownAsBusy"
                type="checkbox"
                defaultChecked={search ? search.includeUnknownAsBusy : true}
              />
              <span>Treat unknown events as busy</span>
            </label>
            <label className="checkboxField">
              <input
                name="includeExamAsBusy"
                type="checkbox"
                defaultChecked={search ? search.includeExamAsBusy : true}
              />
              <span>Treat exam periods as busy</span>
            </label>
            <button type="submit">
              <Search size={16} aria-hidden="true" /> Run search
            </button>
          </form>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Results</p>
              <h2>
                {search
                  ? `${search.results.length} window${search.results.length === 1 ? "" : "s"} between ${formatDate(search.startDate)} and ${formatDate(search.endDate)}`
                  : "Run a search to see overlapping free windows."}
              </h2>
            </div>
          </div>

          {search?.stale ? (
            <p className="authNotice" role="status">
              A source has changed since this search ran. Re-run to refresh
              these results.
            </p>
          ) : null}

          {!search ? (
            <p className="emptyState">No search results yet.</p>
          ) : search.results.length === 0 ? (
            <p className="emptyState">
              No windows of at least {search.minimumDays} days found in that range. Try a
              shorter trip or a wider date range.
            </p>
          ) : (
            <div className="windowResults">
              {search.results.map((result) => {
                const explanation = (result.explanation || {}) as ExplanationShape;
                return (
                  <article className="windowResult" key={result.id}>
                    <header>
                      <div>
                        <strong>
                          {formatDate(result.startDate)} – {formatDate(result.endDate)}
                        </strong>
                        <span>{result.durationDays} days</span>
                      </div>
                      <em className="windowBadge">{result.durationDays}d</em>
                    </header>
                    <dl className="explanation">
                      <div>
                        <dt>Blocked before</dt>
                        <dd>
                          {explanation.blockedBefore
                            ? `${explanation.blockedBefore.title} · ${explanation.blockedBefore.calendarName} (ends ${formatDate(explanation.blockedBefore.end)})`
                            : "Search range start"}
                        </dd>
                      </div>
                      <div>
                        <dt>Blocked after</dt>
                        <dd>
                          {explanation.blockedAfter
                            ? `${explanation.blockedAfter.title} · ${explanation.blockedAfter.calendarName} (starts ${formatDate(explanation.blockedAfter.start)})`
                            : "Search range end"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
