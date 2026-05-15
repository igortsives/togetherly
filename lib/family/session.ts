import type { Family } from "@prisma/client";
import { auth } from "@/auth";
import {
  UnauthenticatedError,
  resolveFamilyForUser
} from "@/lib/family/dashboard";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function requireUserFamily(): Promise<Family> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthenticatedError();
  }
  return resolveFamilyForUser(userId);
}
