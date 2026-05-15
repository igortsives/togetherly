import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { registerCredentialsAction } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <header>
          <p className="eyebrow">Togetherly · Private beta</p>
          <h1>Create an account</h1>
          <p>One account per parent. Children are nicknamed inside the app.</p>
        </header>

        {params.error ? (
          <p className="authError" role="alert">
            {decodeURIComponent(params.error)}
          </p>
        ) : null}

        <form action={registerCredentialsAction} className="authForm">
          <label>
            Name (optional)
            <input name="name" type="text" autoComplete="name" maxLength={120} />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <small>At least 8 characters.</small>
          </label>
          <button className="primaryButton" type="submit">
            Create account
          </button>
        </form>

        <p className="authFooter">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
