import { ReviewStatus, SourceType } from "@prisma/client";
import {
  CalendarCheck,
  FileUp,
  Link as LinkIcon,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import {
  createCalendarAction,
  createChildAction,
  createPdfSourceAction,
  createUrlSourceAction,
  toggleCalendarAction
} from "./actions";
import { Timeline } from "./components/Timeline";
import { calendarTypeOptions, getFamilyDashboard } from "@/lib/family/dashboard";
import { getTimelineData } from "@/lib/family/timeline";
import { labelSourceType } from "@/lib/sources/source-metadata";

export const dynamic = "force-dynamic";

const importOptions = [
  { label: "PDF", detail: "Academic calendar files", icon: FileUp },
  { label: "URL", detail: "Registrar and school pages", icon: LinkIcon },
  { label: "ICS", detail: "Sports and activity feeds", icon: CalendarCheck },
  { label: "Google", detail: "Family calendars", icon: Sparkles },
  { label: "Outlook", detail: "Work and household calendars", icon: ShieldCheck }
];

const sourceTargets = [
  { name: "UCLA", format: "HTML + PDF", status: "Corpus target" },
  { name: "Vanderbilt", format: "HTML + PDF", status: "Corpus target" },
  {
    name: "Saratoga High / LGSUHSD",
    format: "HTML + linked calendars",
    status: "Corpus target"
  }
];

export default async function Home() {
  const dashboard = await getFamilyDashboard();
  const timelineData = await getTimelineData();
  const children = dashboard.family.children;
  const calendars = dashboard.family.calendars;
  const sourceCount = dashboard.dbAvailable
    ? calendars.reduce((total, calendar) => total + calendar.sources.length, 0)
    : 0;
  const pendingReviewCount = dashboard.dbAvailable
    ? calendars.reduce(
        (total, calendar) =>
          total +
          calendar.candidates.filter(
            (candidate) => candidate.reviewStatus === ReviewStatus.PENDING
          ).length,
        0
      )
    : 0;

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
          <a href="#setup">Setup</a>
          <a href="#sources">Sources</a>
          <Link href="/review">Review queue</Link>
          <Link href="/windows">Free windows</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Family free-time planner</p>
            <h1>Find the days everyone is actually free.</h1>
          </div>
          <a className="primaryButton" href="#sources">
            <Search size={18} aria-hidden="true" />
            Add source
          </a>
        </header>

        {!dashboard.dbAvailable ? (
          <section className="statusBanner" role="status">
            <strong>Database setup needed</strong>
            <span>{dashboard.setupError}</span>
          </section>
        ) : null}

        <section className="summaryGrid" aria-label="Setup summary">
          <div className="metric">
            <span>Children</span>
            <strong>{children.length}</strong>
          </div>
          <div className="metric">
            <span>Calendars</span>
            <strong>{calendars.length}</strong>
          </div>
          <div className="metric">
            <span>Imported sources</span>
            <strong>{sourceCount}</strong>
          </div>
          <Link className="metric metricLink" href="/review">
            <span>Pending review</span>
            <strong>{pendingReviewCount}</strong>
            <small>Open review queue →</small>
          </Link>
        </section>

        <section id="setup" className="twoColumn">
          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Family setup</p>
                <h2>Children</h2>
              </div>
            </div>
            <form action={createChildAction} className="inlineForm">
              <label>
                Nickname
                <input name="nickname" placeholder="College student" required />
              </label>
              <label>
                Color
                <input name="color" placeholder="#167c6c" />
              </label>
              <button type="submit">Add child</button>
            </form>
            <div className="entityList">
              {children.map((child) => (
                <div className="entityItem" key={child.id}>
                  <span
                    className="colorDot"
                    style={{ background: child.color || "var(--accent)" }}
                  />
                  <div>
                    <strong>{child.nickname}</strong>
                    <span>{child.calendars.length} calendars</span>
                  </div>
                </div>
              ))}
              {children.length === 0 ? <p className="emptyState">No children yet.</p> : null}
            </div>
          </div>

          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Calendar setup</p>
                <h2>Calendars</h2>
              </div>
            </div>
            <form action={createCalendarAction} className="calendarForm">
              <label>
                Calendar name
                <input name="name" placeholder="UCLA academic calendar" required />
              </label>
              <label>
                Child
                <select name="childId" defaultValue="">
                  <option value="">Family / parent calendar</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="type" defaultValue="SCHOOL">
                  {calendarTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Timezone
                <input name="timezone" placeholder={dashboard.family.timezone} />
              </label>
              <button type="submit">Add calendar</button>
            </form>
          </div>
        </section>

        <section id="sources" className="section">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Import sources</p>
              <h2>Attach source files and feeds to a calendar.</h2>
            </div>
          </div>
          <div className="importGrid">
            {importOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div className="importTile static" key={option.label}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </div>
              );
            })}
          </div>

          <div className="sourceImportGrid">
            <form action={createUrlSourceAction} className="sourceForm">
              <div>
                <p className="eyebrow">URL / ICS</p>
                <h3>Import a public page or feed</h3>
              </div>
              <label>
                Calendar
                <select name="calendarId" required defaultValue="">
                  <option disabled value="">
                    Choose calendar
                  </option>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source type
                <select name="sourceType" defaultValue={SourceType.URL}>
                  <option value={SourceType.URL}>Web page URL</option>
                  <option value={SourceType.ICS}>ICS feed URL</option>
                </select>
              </label>
              <label className="wideField">
                Source URL
                <input
                  name="sourceUrl"
                  placeholder="https://registrar.ucla.edu/calendars/annual-academic-calendar"
                  required
                  type="url"
                />
              </label>
              <button type="submit">Import source</button>
            </form>

            <form action={createPdfSourceAction} className="sourceForm">
              <div>
                <p className="eyebrow">PDF</p>
                <h3>Upload an academic calendar</h3>
              </div>
              <label>
                Calendar
                <select name="calendarId" required defaultValue="">
                  <option disabled value="">
                    Choose calendar
                  </option>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wideField">
                PDF file
                <input accept="application/pdf,.pdf" name="pdfFile" required type="file" />
              </label>
              <button type="submit">Upload PDF</button>
            </form>
          </div>
        </section>

        <section className="twoColumn">
          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Active calendars</p>
                <h2>Family schedule inputs</h2>
              </div>
            </div>
            <div className="sourceList">
              {calendars.map((calendar) => (
                <div className="sourceItem" key={calendar.id}>
                  <div>
                    <strong>{calendar.name}</strong>
                    <span>
                      {calendar.child?.nickname || "Family"} · {calendar.type.toLowerCase()} · {calendar.sources.length} sources
                    </span>
                  </div>
                  <form action={toggleCalendarAction}>
                    <input name="calendarId" type="hidden" value={calendar.id} />
                    <input name="enabled" type="hidden" value={String(calendar.enabled)} />
                    <button className="subtleButton" type="submit">
                      {calendar.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </form>
                </div>
              ))}
              {calendars.length === 0 ? <p className="emptyState">No calendars yet.</p> : null}
            </div>
          </div>

          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Imported sources</p>
                <h2>Ready for extraction</h2>
              </div>
            </div>
            <div className="sourceList">
              {calendars.flatMap((calendar) =>
                calendar.sources.map((source) => (
                  <div className="sourceItem" key={source.id}>
                    <div>
                      <strong>{labelSourceType(source.sourceType)}</strong>
                      <span>{source.sourceUrl || source.uploadedFileKey || source.providerCalendarId}</span>
                      <small>{calendar.name} · {source.parserType.toLowerCase()} · {source.refreshStatus.toLowerCase()}</small>
                    </div>
                    <em>{source.contentHash ? source.contentHash.slice(0, 8) : "pending"}</em>
                  </div>
                ))
              )}
              {sourceCount === 0 ? <p className="emptyState">No imported sources yet.</p> : null}
            </div>
          </div>
        </section>

        <section className="twoColumn">
          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Source corpus</p>
                <h2>Initial parser targets</h2>
              </div>
            </div>
            <div className="sourceList">
              {sourceTargets.map((source) => (
                <div className="sourceItem" key={source.name}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.format}</span>
                  </div>
                  <em>{source.status}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Next parser path</p>
                <h2>Extraction starts after sources exist.</h2>
              </div>
            </div>
            <div className="reviewItem">
              <span className="confidence high">P0</span>
              <div>
                <strong>ICS first</strong>
                <p>Feeds are the highest-confidence import path for sports and activities.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="windows" className="section timelineSection">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Shared free-time view</p>
              <h2>Per-child timeline of confirmed busy and free intervals.</h2>
            </div>
            <Link className="primaryButton" href="/windows">
              <Search size={16} aria-hidden="true" />
              Search free windows
            </Link>
          </div>

          {!timelineData.dbAvailable ? (
            <div className="timelineEmpty" role="status">
              <strong>Database setup needed</strong>
              <span>{timelineData.setupError}</span>
            </div>
          ) : !timelineData.hasChildren ? (
            <div className="timelineEmpty" role="status">
              <strong>No children added yet.</strong>
              <span>
                Add a child in <a href="#setup">family setup</a> to start
                building a per-child timeline.
              </span>
            </div>
          ) : !timelineData.hasEvents ? (
            <div className="timelineEmpty" role="status">
              <strong>No confirmed events in the next 120 days.</strong>
              <span>
                Import a calendar source and{" "}
                <Link href="/review">confirm pending events</Link> to populate
                the timeline.
              </span>
              {timelineData.totalPending > 0 ? (
                <span>
                  {timelineData.totalPending} candidate
                  {timelineData.totalPending === 1 ? "" : "s"} waiting in the
                  review queue.
                </span>
              ) : null}
            </div>
          ) : (
            <Timeline data={timelineData} />
          )}
        </section>
      </section>
    </main>
  );
}
