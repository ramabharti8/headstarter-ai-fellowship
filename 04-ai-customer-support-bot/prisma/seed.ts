import bcrypt from "bcryptjs";
import { PrismaClient, Role, Channel, MessageRole } from "@prisma/client";
import { DEFAULT_SYSTEM_PROMPT } from "../src/lib/ai/prompt";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  const passwordHash = await bcrypt.hash("demo12345", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo User", passwordHash, emailVerified: new Date() },
  });

  let org = await prisma.organization.findUnique({ where: { slug: "acme-support" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Acme Support",
        slug: "acme-support",
        systemPrompt:
          DEFAULT_SYSTEM_PROMPT +
          "\nYou represent Acme Inc, an online store for outdoor gear. Standard shipping is 3-5 business days. Returns are accepted within 30 days.",
        memberships: { create: { userId: user.id, role: Role.OWNER } },
      },
    });
  }

  const convoCount = await prisma.conversation.count({ where: { orgId: org.id } });
  if (convoCount === 0) {
    await prisma.conversation.create({
      data: {
        orgId: org.id,
        title: "Where is my order?",
        channel: Channel.WEB,
        createdByUser: user.id,
        messages: {
          create: [
            {
              role: MessageRole.user,
              content: "Hi, my order hasn't arrived yet. It's been a week.",
            },
            {
              role: MessageRole.assistant,
              content:
                "I'm sorry for the delay. Standard shipping usually takes 3-5 business days. Could you share your order number so I can check its status? If it's stuck, I can escalate this to our fulfilment team.",
              responseMs: 1200,
            },
          ],
        },
      },
    });
  }

  console.log(`Seeded: user=${email} (password: demo12345), org=${org.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
