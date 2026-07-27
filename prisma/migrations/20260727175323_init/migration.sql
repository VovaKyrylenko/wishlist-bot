-- CreateEnum
CREATE TYPE "PrivacyMode" AS ENUM ('SURPRISE', 'OPEN');

-- CreateEnum
CREATE TYPE "WishlistStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PURCHASED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3),
    "privacyMode" "PrivacyMode" NOT NULL DEFAULT 'SURPRISE',
    "status" "WishlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistEditor" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistEditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "imageUrl" TEXT,
    "price" TEXT,
    "store" TEXT,
    "comment" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "contactSnapshot" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_slug_key" ON "Wishlist"("slug");

-- CreateIndex
CREATE INDEX "Wishlist_ownerId_idx" ON "Wishlist"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistEditor_wishlistId_userId_key" ON "WishlistEditor"("wishlistId", "userId");

-- CreateIndex
CREATE INDEX "WishlistItem_wishlistId_idx" ON "WishlistItem"("wishlistId");

-- CreateIndex
CREATE INDEX "Reservation_itemId_idx" ON "Reservation"("itemId");

-- CreateIndex
CREATE INDEX "Reservation_guestId_idx" ON "Reservation"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_wishlistId_userId_key" ON "Subscription"("wishlistId", "userId");

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistEditor" ADD CONSTRAINT "WishlistEditor_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistEditor" ADD CONSTRAINT "WishlistEditor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
