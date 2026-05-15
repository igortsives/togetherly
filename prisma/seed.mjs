import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "togetherly-dev";

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: "beta-parent@togetherly.local" },
    update: { passwordHash },
    create: {
      email: "beta-parent@togetherly.local",
      name: "Beta Parent",
      passwordHash
    }
  });

  const family = await prisma.family.upsert({
    where: { id: "demo-family" },
    update: {},
    create: {
      id: "demo-family",
      ownerId: user.id,
      name: "Demo Family",
      timezone: "America/Los_Angeles"
    }
  });

  const collegeStudent = await prisma.child.upsert({
    where: { id: "demo-child-college" },
    update: {},
    create: {
      id: "demo-child-college",
      familyId: family.id,
      nickname: "College student",
      color: "#345f92"
    }
  });

  const highSchooler = await prisma.child.upsert({
    where: { id: "demo-child-high-school" },
    update: {},
    create: {
      id: "demo-child-high-school",
      familyId: family.id,
      nickname: "High schooler",
      color: "#167c6c"
    }
  });

  await prisma.calendar.upsert({
    where: { id: "demo-calendar-ucla" },
    update: {},
    create: {
      id: "demo-calendar-ucla",
      familyId: family.id,
      childId: collegeStudent.id,
      name: "UCLA academic calendar",
      type: "UNIVERSITY",
      timezone: "America/Los_Angeles"
    }
  });

  await prisma.calendar.upsert({
    where: { id: "demo-calendar-saratoga" },
    update: {},
    create: {
      id: "demo-calendar-saratoga",
      familyId: family.id,
      childId: highSchooler.id,
      name: "Saratoga High calendar",
      type: "SCHOOL",
      timezone: "America/Los_Angeles"
    }
  });

  await prisma.calendar.upsert({
    where: { id: "demo-calendar-family" },
    update: {},
    create: {
      id: "demo-calendar-family",
      familyId: family.id,
      name: "Family Google Calendar",
      type: "PARENT",
      timezone: "America/Los_Angeles"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
