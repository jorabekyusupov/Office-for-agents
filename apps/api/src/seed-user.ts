import 'dotenv/config';
import { auth } from './auth.js';
import { prisma } from './db.js';
import { randomUUID } from 'node:crypto';

async function main() {
  const email = 'admin@ai-office.local';
  const password = 'Admin123456!';
  const name = 'Admin User';

  console.log('Ensuring demo admin account exists...');
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log('Registering user...');
    try {
      await auth.api.signUpEmail({
        body: { email, password, name }
      });
      console.log('Registered via Better Auth.');
    } catch (err) {
      console.error('Sign up error:', err);
    }
    user = await prisma.user.findUnique({ where: { email } });
  }

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true }
    });

    let ws = await prisma.workspace.findFirst({
      where: { members: { some: { userId: user.id } } }
    });

    if (!ws) {
      const workspaceId = randomUUID();
      const projectId = randomUUID();

      ws = await prisma.workspace.create({
        data: {
          id: workspaceId,
          name: 'AI Engineering HQ',
          members: {
            create: { userId: user.id, role: 'OWNER' }
          },
          projects: {
            create: {
              id: projectId,
              name: 'Autonomous Agent Office',
              status: 'ACTIVE',
              room: { create: { layoutVersion: 1 } },
              chats: {
                create: {
                  workspaceId: workspaceId,
                  messages: {
                    create: {
                      content: 'Welcome to AI Office! All agent systems are operational.'
                    }
                  }
                }
              }
            }
          },
          agents: {
            createMany: {
              data: [
                { name: 'Codex', provider: 'OPENAI' },
                { name: 'Claude', provider: 'ANTHROPIC' },
                { name: 'Gemini', provider: 'GOOGLE' }
              ]
            }
          }
        }
      });
      console.log('Created workspace:', ws.name);
    }
  }

  console.log('\n=======================================');
  console.log('🎉 TAYYOR! KIRISH MA\'LUMOTLARI:');
  console.log('Email:    admin@ai-office.local');
  console.log('Parol:    Admin123456!');
  console.log('=======================================\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
