import type { PrismaService } from '../../src/prisma/prisma.service';

/** Clears action-item tables so e2e suites do not pollute each other on the shared dev DB. */
export async function resetActionItemE2eState(
  prisma: PrismaService,
): Promise<void> {
  await prisma.actionItem.deleteMany();
  await prisma.processedCampaignActivationEvent.deleteMany();
}
