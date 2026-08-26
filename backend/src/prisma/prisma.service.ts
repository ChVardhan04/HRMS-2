import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
async onModuleInit() {
  console.log('[Prisma] Starting database connection...');

  try {
    await this.$connect();
    console.log('[Prisma] Database connected successfully.');
  } catch (error) {
    console.error('[Prisma] Database connection failed.');
    console.error(error);
    throw error;
  }
}

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
