import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaNeon({ connectionString });

// One shared client for business data, session storage, and conversation
// storage — the bot only ever needs a single pooled Neon connection.
export const prisma = new PrismaClient({ adapter });
