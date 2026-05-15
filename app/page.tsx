import {
  CalendarCheck,
  FileUp,
  Link,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";

const importOptions = [
  { label: "PDF", detail: "Academic calendar files", icon: FileUp },
  { label: "URL", detail: "Registrar and school pages", icon: Link },
  { label: "ICS", detail: "Sports and activity feeds", icon: CalendarCheck },
  { label: "Google", detail: "Family calendars", icon: Sparkles },
  { label: "Outlook", detail: "Work and household calendars", icon: ShieldCheck }
];

const sourceTargets = [
  {
    name: "UCLA",
    format: "HTML + PDF",
    status: "Corpus target"
  },
  {
    name: "Vanderbilt",
    format: "HTML + PDF",
    status: "Corpus target"
  },
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

export default function Home() {
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
          <a href="#sources">Sources</a>
          <a href="#review">Review</a>
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

        <section className="summaryGrid" aria-label="Setup summary">
          <div className="metric">
            <span>Children</span>
            <strong>2</strong>
          </div>
          <div className="metric">
            <span>Calendar sources</span>
            <strong>5</strong>
          </div>
          <div className="metric">
            <span>Pending review</span>
            <strong>12</strong>
          </div>
          <div className="metric">
            <span>Free window target</span>
            <strong>5 days</strong>
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
          <div id="review" className="panel">
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
                <p className="eyebrow">Review queue</p>
                <h2>Trust before automation</h2>
              </div>
            </div>
            <div className="reviewItem">
              <span className="confidence high">94%</span>
              <div>
                <strong>Winter break</strong>
                <p>Dec 21-Jan 4 from UCLA annual academic calendar</p>
              </div>
            </div>
            <div className="reviewItem">
              <span className="confidence medium">72%</span>
              <div>
                <strong>Exam period</strong>
                <p>Needs parent confirmation before matching</p>
              </div>
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
