-- Redesign: one live screen, smart input, drafts, undo.
--
-- Conversations are gone: what the bot is waiting for now lives on the user as
-- `pendingAction`, so a plain message answers the open question while every
-- button keeps working. Half-finished gifts live in "Draft" instead of in
-- serverless session state, which is what makes "Продовжити?" possible.

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('GIFT', 'LIST');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "screenMessageId" INTEGER,
  ADD COLUMN "pendingAction" TEXT,
  ADD COLUMN "pendingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "autoCancelledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL DEFAULT 'GIFT',
    "wishlistId" TEXT,
    "title" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "price" TEXT,
    "store" TEXT,
    "comment" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Draft_userId_key" ON "Draft"("userId");

-- CreateIndex
CREATE INDEX "Draft_updatedAt_idx" ON "Draft"("updatedAt");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
DROP TABLE IF EXISTS "BotSession";
