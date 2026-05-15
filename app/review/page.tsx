import { BusyStatus, EventCategory } from "@prisma/client";
import { ArrowLeft, CheckCircle2, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  confirmCandidateAction,
  editAndConfirmCandidateAction,
  rejectCandidateAction
} from "./actions";
import type { SerializedCandidate } from "@/lib/review/candidates";
import { getReviewQueue } from "@/lib/review/queue";

export const dynamic = "force-dynamic";

const categoryOptions = Object.values(EventCategory);
const busyStatusOptions = Object.values(BusyStatus);

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function formatCandidateRange(candidate: SerializedCandidate) {
  if (candidate.allDay) {
    const inclusiveEnd = new Date(candidate.endAt.getTime() - 1);
    const start = dateOnlyFormatter.format(candidate.startAt);
    const end = dateOnlyFormatter.format(inclusiveEnd);
    return start === end ? start : `${start} – ${end}`;
  }
  return `${dateTimeFormatter.format(candidate.startAt)} – ${dateTimeFormatter.format(
    candidate.endAt
  )}`;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isoDateTimeLocal(value: Date) {
  return value.toISOString().slice(0, 16);
}

function labelEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function confidencePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function ReviewPage() {
  const queue = await getReviewQueue();

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
          <Link href="/review" aria-current="page">
            Review queue
          </Link>
          <Link href="/#windows">Free windows</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Parent review</p>
            <h1>Confirm extracted events before they affect recommendations.</h1>
          </div>
          <Link className="primaryButton" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to dashboard
          </Link>
        </header>

        {!queue.dbAvailable ? (
          <section className="statusBanner" role="status">
            <strong>Database setup needed</strong>
            <span>{queue.setupError}</span>
          </section>
        ) : null}

        <section className="summaryGrid" aria-label="Review summary">
          <div className="metric">
            <span>Pending candidates</span>
            <strong>{queue.totalPending}</strong>
          </div>
          <div className="metric">
            <span>Calendars with pending events</span>
            <strong>{queue.groups.length}</strong>
          </div>
          <div className="metric">
            <span>Needs attention</span>
            <strong>
              {queue.groups.reduce(
                (total, group) =>
                  total + group.candidates.filter((candidate) => candidate.needsReview).length,
                0
              )}
            </strong>
          </div>
          <div className="metric">
            <span>Status</span>
            <strong>{queue.totalPending === 0 ? "Clear" : "Open"}</strong>
          </div>
        </section>

        {queue.groups.length === 0 ? (
          <section className="panel reviewEmpty" aria-label="No pending candidates">
            <ShieldAlert size={28} aria-hidden="true" />
            <div>
              <h2>No pending candidates</h2>
              <p>Import an ICS feed to populate the queue.</p>
            </div>
            <Link className="primaryButton" href="/#sources">
              Add a source
            </Link>
          </section>
        ) : (
          queue.groups.map((group) => (
            <section className="panel reviewGroup" key={group.calendarId}>
              <div className="sectionHeader compact">
                <div>
                  <p className="eyebrow">{labelEnum(group.calendarType)}</p>
                  <h2>{group.calendarName}</h2>
                  <span className="reviewGroupMeta">
                    {group.childNickname || "Family / parent"} · {group.candidates.length} pending
                  </span>
                </div>
              </div>
              <ul className="reviewList">
                {group.candidates.map((candidate) => (
                  <li className="reviewRow" key={candidate.id}>
                    <div className="reviewRowHeader">
                      <div className="reviewRowTitle">
                        <strong>{candidate.rawTitle}</strong>
                        <span>{formatCandidateRange(candidate)}</span>
                      </div>
                      <div className="reviewBadges">
                        <span className={`pill pill-${candidate.category.toLowerCase()}`}>
                          {labelEnum(candidate.category)}
                        </span>
                        <span className={`pill pill-busy-${candidate.suggestedBusyStatus.toLowerCase()}`}>
                          {labelEnum(candidate.suggestedBusyStatus)}
                        </span>
                        <span
                          className={`pill ${
                            candidate.needsReview ? "pill-warn" : "pill-confidence"
                          }`}
                          title={
                            candidate.needsReview
                              ? "Low confidence or unknown category"
                              : "Above review threshold"
                          }
                        >
                          {candidate.needsReview ? "Needs review" : "High confidence"} ·
                          {" "}
                          {confidencePercent(candidate.confidence)}
                        </span>
                      </div>
                    </div>

                    {candidate.evidenceText || candidate.evidenceLocator ? (
                      <div className="evidenceBlock">
                        {candidate.evidenceText ? <p>{candidate.evidenceText}</p> : null}
                        {candidate.evidenceLocator ? (
                          <small>Source: {candidate.evidenceLocator}</small>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="reviewActions">
                      <form action={confirmCandidateAction}>
                        <input name="candidateId" type="hidden" value={candidate.id} />
                        <button className="primaryButton" type="submit">
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Confirm as-is
                        </button>
                      </form>
                      <form action={rejectCandidateAction}>
                        <input name="candidateId" type="hidden" value={candidate.id} />
                        <button className="subtleButton" type="submit">
                          <Trash2 size={16} aria-hidden="true" />
                          Reject
                        </button>
                      </form>
                    </div>

                    <details className="reviewEdit">
                      <summary>
                        <Pencil size={14} aria-hidden="true" />
                        Edit and confirm
                      </summary>
                      <form
                        action={editAndConfirmCandidateAction}
                        className="reviewEditForm"
                      >
                        <input name="candidateId" type="hidden" value={candidate.id} />
                        <input name="timezone" type="hidden" value={candidate.timezone} />
                        <input
                          name="allDay"
                          type="hidden"
                          value={candidate.allDay ? "true" : "false"}
                        />
                        <label className="wideField">
                          Title
                          <input
                            defaultValue={candidate.rawTitle}
                            maxLength={250}
                            name="title"
                            required
                          />
                        </label>
                        <label>
                          Category
                          <select defaultValue={candidate.category} name="category">
                            {categoryOptions.map((option) => (
                              <option key={option} value={option}>
                                {labelEnum(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Busy status
                          <select
                            defaultValue={candidate.suggestedBusyStatus}
                            name="busyStatus"
                          >
                            {busyStatusOptions.map((option) => (
                              <option key={option} value={option}>
                                {labelEnum(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {candidate.allDay ? (
                          <>
                            <label>
                              Start date
                              <input
                                defaultValue={isoDate(candidate.startAt)}
                                name="startAt"
                                type="date"
                              />
                            </label>
                            <label>
                              End date (exclusive)
                              <input
                                defaultValue={isoDate(candidate.endAt)}
                                name="endAt"
                                type="date"
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <label>
                              Start
                              <input
                                defaultValue={isoDateTimeLocal(candidate.startAt)}
                                name="startAt"
                                type="datetime-local"
                              />
                            </label>
                            <label>
                              End
                              <input
                                defaultValue={isoDateTimeLocal(candidate.endAt)}
                                name="endAt"
                                type="datetime-local"
                              />
                            </label>
                          </>
                        )}
                        <button className="primaryButton wideField" type="submit">
                          Save changes and confirm
                        </button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
    </main>
  );
}
