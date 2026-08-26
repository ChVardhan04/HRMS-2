import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    console.log("[Prisma] Starting database connection...");

    if (!process.env.DATABASE_URL) {
      console.error("[Prisma] DATABASE_URL is not configured.");
      throw new Error("DATABASE_URL is required");
    }

    console.log("[Prisma] DATABASE_URL is configured.");

    try {
      await this.$connect();

      console.log("[Prisma] Database connected successfully.");
    } catch (error) {
      console.error("[Prisma] Database connection failed.");
      console.error(error);

      throw error;
    }
  }

  async onModuleDestroy() {
    console.log("[Prisma] Disconnecting database...");

    await this.$disconnect();

    console.log("[Prisma] Database disconnected.");
  }
}
