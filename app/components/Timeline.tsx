import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  HelpCircle,
  Sparkles,
  X
} from "lucide-react";
import {
  blockKindLabel,
  inclusiveEnd,
  type TimelineBlock,
  type TimelineBlockKind,
  type TimelineData,
  type TimelineRow,
  type TimelineSource
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

function TimelineRowView({
  row,
  hiddenSourceIds
}: {
  row: TimelineRow;
  hiddenSourceIds: Set<string>;
}) {
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
            <Link
              role="listitem"
              className={`block ${block.kind}${block.lowConfidence ? " low-confidence" : ""}`}
              key={block.id}
              href={focusHref(block.id, hiddenSourceIds)}
              scroll={false}
              style={{
                left: `${block.leftPercent}%`,
                width: `${block.widthPercent}%`,
                borderLeft: `3px solid ${block.sourceColor}`
              }}
              title={formatBlockTitle(block)}
              aria-label={`${blockKindLabel(block.kind)}${block.lowConfidence ? " (low confidence)" : ""}: ${formatBlockTitle(block)}`}
            >
              <span className="blockGlyph" aria-hidden="true">
                {blockSymbol(block.kind)}
              </span>
              <span className="blockLabel">{block.title}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/** Build a `?hide=...` query string toggling the given sourceId. */
function toggleHideHref(
  sourceId: string,
  hiddenSourceIds: Set<string>,
  focus: string | null
): string {
  const next = new Set(hiddenSourceIds);
  if (next.has(sourceId)) next.delete(sourceId);
  else next.add(sourceId);
  const params = new URLSearchParams();
  if (next.size > 0) params.set("hide", Array.from(next).join(","));
  if (focus) params.set("focus", focus);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/** Build a `?focus=...` query string preserving the current hide filter. */
function focusHref(
  eventId: string,
  hiddenSourceIds: Set<string>
): string {
  const params = new URLSearchParams();
  if (hiddenSourceIds.size > 0)
    params.set("hide", Array.from(hiddenSourceIds).join(","));
  params.set("focus", eventId);
  return `/?${params.toString()}`;
}

/** Build a `?` query string clearing focus, preserving hide. */
function clearFocusHref(hiddenSourceIds: Set<string>): string {
  if (hiddenSourceIds.size === 0) return "/";
  return `/?hide=${Array.from(hiddenSourceIds).join(",")}`;
}

function SourceLegend({
  sources,
  hiddenSourceIds,
  focus
}: {
  sources: TimelineSource[];
  hiddenSourceIds: Set<string>;
  focus: string | null;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="sourceLegend" aria-label="Sources contributing events">
      <span className="sourceLegendTitle">Sources</span>
      {sources.map((source) => {
        const hidden = hiddenSourceIds.has(source.sourceId);
        return (
          <Link
            key={source.sourceId}
            href={toggleHideHref(source.sourceId, hiddenSourceIds, focus)}
            className={`sourceChip${hidden ? " sourceChipHidden" : ""}`}
            aria-pressed={!hidden}
            title={
              hidden
                ? `Show ${source.calendarName}`
                : `Hide ${source.calendarName}`
            }
          >
            <span
              className="sourceSwatch"
              style={{ background: source.color }}
              aria-hidden="true"
            />
            <span className="sourceName">{source.calendarName}</span>
            <span className="sourceProvider">{source.sourceLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}

function FocusPanel({
  focusedBlock,
  siblings,
  hiddenSourceIds
}: {
  focusedBlock: TimelineBlock;
  siblings: TimelineBlock[];
  hiddenSourceIds: Set<string>;
}) {
  const compactRangeFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
  const visibleEnd = inclusiveEnd(focusedBlock.end, focusedBlock.allDay);
  return (
    <aside className="focusPanel" aria-label="Event details">
      <header>
        <div>
          <p className="eyebrow">{focusedBlock.calendarName}</p>
          <h3>{focusedBlock.title}</h3>
        </div>
        <Link
          className="subtleButton"
          href={clearFocusHref(hiddenSourceIds)}
          aria-label="Close event details"
        >
          <X size={14} aria-hidden="true" /> Close
        </Link>
      </header>
      <dl>
        <div>
          <dt>When</dt>
          <dd>
            {compactRangeFormatter.format(focusedBlock.start)}
            {focusedBlock.start.getTime() === visibleEnd.getTime() ||
            compactRangeFormatter.format(focusedBlock.start) ===
              compactRangeFormatter.format(visibleEnd)
              ? null
              : ` – ${compactRangeFormatter.format(visibleEnd)}`}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {focusedBlock.sourceLabel}
            {focusedBlock.sourceId ? (
              <>
                {" · "}
                <Link
                  href={toggleHideHref(
                    focusedBlock.sourceId,
                    hiddenSourceIds,
                    null
                  )}
                >
                  Hide this source
                </Link>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{blockKindLabel(focusedBlock.kind)}</dd>
        </div>
      </dl>
      {siblings.length > 0 ? (
        <details className="focusSiblings">
          <summary>
            Other events from {focusedBlock.calendarName} this week
            ({siblings.length})
          </summary>
          <ul>
            {siblings.map((sibling) => (
              <li key={sibling.id}>
                <strong>{sibling.title}</strong>{" "}
                <span>
                  {compactRangeFormatter.format(sibling.start)}
                  {" · "}
                  {blockKindLabel(sibling.kind)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}

const SIBLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function Timeline({
  data,
  hiddenSourceIds = new Set<string>(),
  focusedEventId = null
}: {
  data: TimelineData;
  hiddenSourceIds?: Set<string>;
  focusedEventId?: string | null;
}) {
  const { range, rows, windows, sources } = data;

  const allBlocks = rows.flatMap((row) => row.blocks);
  const focusedBlock = focusedEventId
    ? allBlocks.find((block) => block.id === focusedEventId) ?? null
    : null;
  const siblings = focusedBlock?.sourceId
    ? allBlocks.filter(
        (block) =>
          block.id !== focusedBlock.id &&
          block.sourceId === focusedBlock.sourceId &&
          Math.abs(block.start.getTime() - focusedBlock.start.getTime()) <=
            SIBLING_WINDOW_MS
      )
    : [];
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

      <SourceLegend
        sources={sources}
        hiddenSourceIds={hiddenSourceIds}
        focus={focusedEventId}
      />

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
          <TimelineRowView
            row={row}
            hiddenSourceIds={hiddenSourceIds}
            key={row.id}
          />
        ))}
      </div>

      {focusedBlock ? (
        <FocusPanel
          focusedBlock={focusedBlock}
          siblings={siblings}
          hiddenSourceIds={hiddenSourceIds}
        />
      ) : null}

      <TimelineLegend />
    </div>
  );
}
