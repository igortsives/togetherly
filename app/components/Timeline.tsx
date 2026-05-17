import {
  AlertTriangle,
  CalendarRange,
  HelpCircle,
  Sparkles
} from "lucide-react";
import {
  blockKindLabel,
  inclusiveEnd,
  type TimelineBlock,
  type TimelineBlockKind,
  type TimelineData,
  type TimelineRow
} from "@/lib/family/timeline";

const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

const compactRangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});

function formatRange(start: Date, end: Date) {
  return `${rangeFormatter.format(start)} – ${rangeFormatter.format(end)}`;
}

function formatBlockTitle(block: TimelineBlock) {
  const days = Math.max(
    1,
    Math.round((block.end.getTime() - block.start.getTime()) / 86_400_000)
  );
  const dayLabel = days === 1 ? "1 day" : `${days} days`;
  const visibleEnd = inclusiveEnd(block.end, block.allDay);
  const startLabel = compactRangeFormatter.format(block.start);
  const endLabel = compactRangeFormatter.format(visibleEnd);
  const rangeLabel =
    startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  return `${block.title} · ${rangeLabel} (${dayLabel}) · ${block.calendarName} (${block.sourceLabel})`;
}

function blockSymbol(kind: TimelineBlockKind) {
  switch (kind) {
    case "free":
      return "○";
    case "busy":
      return "■";
    case "exam":
      return "▲";
    case "optional":
      return "◆";
    case "unknown":
      return "?";
  }
}

function TimelineLegend() {
  const items: { kind: TimelineBlockKind; label: string }[] = [
    { kind: "busy", label: "Busy" },
    { kind: "free", label: "Free" },
    { kind: "exam", label: "Exam period" },
    { kind: "optional", label: "Optional" },
    { kind: "unknown", label: "Unreviewed status" }
  ];
  return (
    <ul className="timelineLegend" aria-label="Timeline legend">
      {items.map((item) => (
        <li key={item.kind}>
          <span
            className={`legendSwatch block ${item.kind}`}
            aria-hidden="true"
          >
            {blockSymbol(item.kind)}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
      <li>
        <span className="legendSwatch lowConfidence" aria-hidden="true">
          !
        </span>
        <span>Low confidence (diagonal stripes)</span>
      </li>
      <li>
        <span className="legendSwatch windowOverlay" aria-hidden="true" />
        <span>Recommended window</span>
      </li>
    </ul>
  );
}

function TimelineRowView({ row }: { row: TimelineRow }) {
  const enabledCount = row.calendarSummaries.filter((c) => c.enabled).length;
  const sourceLine =
    row.calendarSummaries.length === 0
      ? "No calendars yet"
      : `${enabledCount} of ${row.calendarSummaries.length} calendars enabled`;

  return (
    <div className="timelineRow">
      <div className="rowLabel">
        <strong>
          {row.color ? (
            <span
              className="colorDot"
              style={{ background: row.color }}
              aria-hidden="true"
            />
          ) : null}
          {row.label}
        </strong>
        <span>{sourceLine}</span>
        {row.pendingCount > 0 ? (
          <span
            className="pill pill-warn rowBadge"
            title={`${row.pendingCount} pending event${row.pendingCount === 1 ? "" : "s"} awaiting review`}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {row.pendingCount} pending
          </span>
        ) : null}
        {row.lowConfidenceCount > 0 ? (
          <span
            className="pill pill-unknown rowBadge"
            title={`${row.lowConfidenceCount} low-confidence candidate${row.lowConfidenceCount === 1 ? "" : "s"}`}
          >
            <HelpCircle size={12} aria-hidden="true" />
            {row.lowConfidenceCount} low confidence
          </span>
        ) : null}
      </div>
      <div
        className="track"
        role="list"
        aria-label={`${row.label} schedule`}
      >
        {row.blocks.length === 0 ? (
          <p className="trackEmpty" aria-live="polite">
            No confirmed events in this window.
          </p>
        ) : (
          row.blocks.map((block) => (
            <div
              role="listitem"
              className={`block ${block.kind}${block.lowConfidence ? " low-confidence" : ""}`}
              key={block.id}
              style={{
                left: `${block.leftPercent}%`,
                width: `${block.widthPercent}%`
              }}
              title={formatBlockTitle(block)}
              aria-label={`${blockKindLabel(block.kind)}${block.lowConfidence ? " (low confidence)" : ""}: ${formatBlockTitle(block)}`}
            >
              <span className="blockGlyph" aria-hidden="true">
                {blockSymbol(block.kind)}
              </span>
              <span className="blockLabel">{block.title}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function Timeline({ data }: { data: TimelineData }) {
  const { range, rows, windows } = data;
  return (
    <div className="timelineWrapper">
      <div
        className="timelineHeader"
        aria-label={`Timeline range ${formatRange(range.start, range.end)}`}
      >
        <span>
          <CalendarRange size={14} aria-hidden="true" /> {formatRange(range.start, range.end)}
        </span>
        <span>{range.totalDays} days</span>
      </div>

      <div className="timelineScale" aria-hidden="true">
        {range.monthTicks.map((tick, index) => (
          <span
            className="monthTick"
            key={`${tick.label}-${index}`}
            style={{ left: `${tick.leftPercent}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div
        className="timeline"
        aria-label="Per-child free and busy timeline"
      >
        {windows.length > 0 ? (
          <div className="timelineRow timelineOverlayRow" aria-hidden="false">
            <div className="rowLabel">
              <strong>
                <Sparkles size={14} aria-hidden="true" />
                Recommended
              </strong>
              <span>Latest search results</span>
            </div>
            <div className="track">
              {windows.map((window) => (
                <div
                  className="windowOverlay"
                  key={window.id}
                  style={{
                    left: `${window.leftPercent}%`,
                    width: `${window.widthPercent}%`
                  }}
                  title={`Free window: ${formatRange(window.start, inclusiveEnd(window.end, true))} (${window.durationDays} days)`}
                  aria-label={`Recommended free window ${formatRange(window.start, inclusiveEnd(window.end, true))}, ${window.durationDays} days`}
                >
                  <span>{window.durationDays}d</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {rows.map((row) => (
          <TimelineRowView row={row} key={row.id} />
        ))}
      </div>

      <TimelineLegend />
    </div>
  );
}
