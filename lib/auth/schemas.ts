import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254)
  .email("Enter a valid email");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const credentialsLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const credentialsRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(120).optional()
});

export type CredentialsLoginInput = z.infer<typeof credentialsLoginSchema>;
export type CredentialsRegisterInput = z.infer<typeof credentialsRegisterSchema>;
