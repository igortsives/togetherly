import Link from "next/link";
import { submitBetaFeedbackAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const scoreOptions = [
  { value: "1", label: "1 – Confusing" },
  { value: "2", label: "2 – Needs work" },
  { value: "3", label: "3 – Mixed" },
  { value: "4", label: "4 – Useful" },
  { value: "5", label: "5 – Excellent" }
];

type SearchParams = Promise<{ from?: string }>;

export default async function FeedbackPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawFrom = params.from?.trim() ?? "";
  const fromRoute = rawFrom.startsWith("/") ? rawFrom : "/";

  return (
    <main className="authShell">
      <section className="authCard feedbackCard">
        <header>
          <p className="eyebrow">Togetherly · Private beta</p>
          <h1>Send beta feedback</h1>
          <p>
            Tell us what worked, what was confusing, and which imports or
            recommendations you trusted. Your notes go straight to the team.
          </p>
        </header>

        <form action={submitBetaFeedbackAction} className="authForm feedbackForm">
          <input name="route" type="hidden" value={fromRoute} />

          <fieldset className="feedbackScore">
            <legend>How is the beta working for you? (optional)</legend>
            <div className="feedbackScoreOptions">
              {scoreOptions.map((option) => (
                <label key={option.value}>
                  <input name="score" type="radio" value={option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            What would you like us to know?
            <textarea
              name="body"
              required
              maxLength={4000}
              rows={8}
              placeholder="Which imports worked or failed? Did confidence and review states make sense? Did the recommended windows feel trustworthy?"
            />
            <small>Up to 4000 characters.</small>
          </label>

          <label className="checkboxField">
            <input name="allowFollowUp" type="checkbox" value="on" />
            <span>It’s okay to follow up with me about this feedback.</span>
          </label>

          <button className="primaryButton" type="submit">
            Send feedback
          </button>
        </form>

        <p className="authFooter">
          <Link href={fromRoute}>Back to {fromRoute === "/" ? "dashboard" : fromRoute}</Link>
        </p>
      </section>
    </main>
  );
}
