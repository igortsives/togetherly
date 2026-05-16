import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteAccountAction } from "../actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user) {
    redirect("/login?callbackUrl=/account");
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <header>
          <p className="eyebrow">Togetherly · Account</p>
          <h1>Manage your account</h1>
        </header>

        <p>
          Signed in as <strong>{session.user.email}</strong>.{" "}
          <Link href="/">Back to dashboard</Link>
        </p>

        <details className="dangerZone" open>
          <summary>Delete my account</summary>
          <p>
            This permanently removes your Togetherly account and every
            family, child, calendar, source, and free-window search tied
            to it. Linked Google and Microsoft accounts are revoked
            best-effort; uploaded PDF calendars are deleted from disk.
          </p>
          <p>This cannot be undone.</p>

          {params.error === "confirm" ? (
            <p className="authError" role="alert">
              The email you typed does not match the account email. Try
              again.
            </p>
          ) : null}

          <form action={deleteAccountAction} className="authForm">
            <label>
              Type your account email to confirm
              <input
                name="confirmEmail"
                type="email"
                autoComplete="off"
                required
              />
            </label>
            <button className="subtleButton danger" type="submit">
              Permanently delete my account
            </button>
          </form>
        </details>
      </section>
    </main>
  );
}
