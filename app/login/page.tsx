import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

type Props = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const appleEnabled = Boolean(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
);

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";

  if (session?.user) {
    redirect(callbackUrl);
  }

  async function credentialsLogin(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl
    });
  }

  async function googleLogin() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  async function appleLogin() {
    "use server";
    await signIn("apple", { redirectTo: callbackUrl });
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <header>
          <p className="eyebrow">Togetherly · Private beta</p>
          <h1>Sign in</h1>
          <p>Use the email and password you registered with, or continue with a provider.</p>
        </header>

        {params.error ? (
          <p className="authError" role="alert">
            Sign-in failed. Check your email and password and try again.
          </p>
        ) : null}

        <form action={credentialsLogin} className="authForm">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          <button className="primaryButton" type="submit">
            Sign in
          </button>
        </form>

        {googleEnabled || appleEnabled ? (
          <div className="authProviders">
            <span className="authDivider">or</span>
            {googleEnabled ? (
              <form action={googleLogin}>
                <button className="providerButton" type="submit">
                  Continue with Google
                </button>
              </form>
            ) : null}
            {appleEnabled ? (
              <form action={appleLogin}>
                <button className="providerButton" type="submit">
                  Continue with Apple
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <p className="authFooter">
          New to Togetherly? <Link href="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
