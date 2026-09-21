-- Structured price alongside the free-text one.
--
-- `price` stays the source of truth for display — it can be "від 2 000 грн"
-- just as easily as "12 999 ₴", and nothing here should force a shape onto it.
-- `priceAmount`/`priceCurrency` are set only when src/lib/price.ts could read
-- a clean number out of it, so a future screen can sort or filter by price
-- without re-parsing the display string on every read.

-- AlterTable
ALTER TABLE "WishlistItem"
  ADD COLUMN "priceAmount" DOUBLE PRECISION,
  ADD COLUMN "priceCurrency" TEXT;

-- AlterTable
ALTER TABLE "Draft"
  ADD COLUMN "priceAmount" DOUBLE PRECISION,
  ADD COLUMN "priceCurrency" TEXT;
