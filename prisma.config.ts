import { defineConfig } from "prisma/config";
import type { PrismaConfig } from "prisma";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    seed: "node prisma/seed.mjs",
  },
} satisfies PrismaConfig);
