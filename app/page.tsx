import {
  CalendarCheck,
  FileUp,
  Link,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { createCalendarAction, createChildAction, toggleCalendarAction } from "./actions";

export const dynamic = "force-dynamic";
import { calendarTypeOptions, getFamilyDashboard } from "@/lib/family/dashboard";

const importOptions = [
  { label: "PDF", detail: "Academic calendar files", icon: FileUp },
  { label: "URL", detail: "Registrar and school pages", icon: Link },
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

const timelineRows = [
  {
    child: "College student",
    source: "UCLA academic calendar",
    blocks: [
      { label: "Finals", start: 10, width: 10, kind: "busy" },
      { label: "Winter break", start: 27, width: 18, kind: "free" },
      { label: "Instruction", start: 55, width: 22, kind: "busy" }
    ]
  },
  {
    child: "High schooler",
    source: "Saratoga High calendar",
    blocks: [
      { label: "School", start: 4, width: 18, kind: "busy" },
      { label: "Winter break", start: 30, width: 18, kind: "free" },
      { label: "School", start: 62, width: 20, kind: "busy" }
    ]
  }
];

export default async function Home() {
  const dashboard = await getFamilyDashboard();
  const children = dashboard.family.children;
  const calendars = dashboard.family.calendars;
  const pendingReviewCount = dashboard.dbAvailable
    ? calendars.reduce((total, calendar) => total + calendar.candidates.length, 0)
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
          <a href="#windows">Free windows</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Family free-time planner</p>
            <h1>Find the days everyone is actually free.</h1>
          </div>
          <button className="primaryButton" type="button">
            <Search size={18} aria-hidden="true" />
            Add source
          </button>
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
            <span>Calendar sources</span>
            <strong>{calendars.length}</strong>
          </div>
          <div className="metric">
            <span>Pending review</span>
            <strong>{pendingReviewCount}</strong>
          </div>
          <div className="metric">
            <span>Free window target</span>
            <strong>5 days</strong>
          </div>
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
              <h2>Bring calendars in from the places parents already use.</h2>
            </div>
          </div>
          <div className="importGrid">
            {importOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button className="importTile" key={option.label} type="button">
                  <Icon size={20} aria-hidden="true" />
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              );
            })}
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
                      {calendar.child?.nickname || "Family"} · {calendar.type.toLowerCase()}
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
        </section>

        <section id="windows" className="section timelineSection">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Free-window match</p>
              <h2>Shared availability appears only after review.</h2>
            </div>
            <div className="windowBadge">Best match: Dec 23-Dec 29</div>
          </div>

          <div className="timeline" aria-label="Example free-time timeline">
            {timelineRows.map((row) => (
              <div className="timelineRow" key={row.child}>
                <div className="rowLabel">
                  <strong>{row.child}</strong>
                  <span>{row.source}</span>
                </div>
                <div className="track">
                  {row.blocks.map((block, blockIndex) => (
                    <div
                      className={`block ${block.kind}`}
                      key={[row.child, block.label, block.start, blockIndex].join("-")}
                      style={{ left: `${block.start}%`, width: `${block.width}%` }}
                    >
                      {block.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
