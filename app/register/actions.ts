"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { prisma } from "@/lib/db/prisma";
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect(
      `/register?error=${encodeURIComponent("An account with this email already exists.")}`
    );
  }

  const passwordHash = await hash(parsed.data.password, BCRYPT_ROUNDS);
  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash
    }
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/"
  });
}
