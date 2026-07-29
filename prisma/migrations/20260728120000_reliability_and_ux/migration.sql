-- AlterTable
ALTER TABLE "Wishlist" ADD COLUMN     "notifyOwner" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "editorInviteToken" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "WishlistVisit" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedUpdate" (
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_editorInviteToken_key" ON "Wishlist"("editorInviteToken");

-- CreateIndex
CREATE INDEX "Wishlist_eventDate_idx" ON "Wishlist"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistVisit_wishlistId_userId_key" ON "WishlistVisit"("wishlistId", "userId");

-- CreateIndex
CREATE INDEX "WishlistVisit_userId_lastSeenAt_idx" ON "WishlistVisit"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ProcessedUpdate_createdAt_idx" ON "ProcessedUpdate"("createdAt");

-- DropIndex
DROP INDEX "WishlistItem_wishlistId_idx";

-- CreateIndex
CREATE INDEX "WishlistItem_wishlistId_status_idx" ON "WishlistItem"("wishlistId", "status");

-- AddForeignKey
ALTER TABLE "WishlistVisit" ADD CONSTRAINT "WishlistVisit_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistVisit" ADD CONSTRAINT "WishlistVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
