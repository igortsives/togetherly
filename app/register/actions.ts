"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { isUniqueConstraintError } from "@/lib/auth/register";
import { credentialsRegisterSchema } from "@/lib/auth/schemas";

const BCRYPT_ROUNDS = 12;

export async function registerCredentialsAction(formData: FormData) {
  const parsed = credentialsRegisterSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: (formData.get("name") || undefined) as string | undefined
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first?.message ?? "Invalid input";
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  const email = parsed.data.email.toLowerCase();

  // Account-enumeration defense (#62): always hash the password and
  // attempt the INSERT, regardless of whether the email is registered.
  // A P2002 unique-constraint failure is swallowed so the response is
  // byte-identical (and similarly timed) to a fresh signup. Both new
  // and existing emails land on `/login?registered=1`, which renders a
  // generic "account created — please sign in" message so an attacker
  // cannot distinguish the two cases.
  const passwordHash = await hash(parsed.data.password, BCRYPT_ROUNDS);
  try {
    await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash
      }
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      throw err;
    }
  }

  redirect("/login?registered=1");
}
