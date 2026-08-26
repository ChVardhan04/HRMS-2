import { Global, Module } from "@nestjs/common";
import { EMAIL_ADAPTER } from "./email/email-adapter.interface";
import { SmtpEmailAdapter } from "./email/smtp-email.adapter";
import { STORAGE_ADAPTER } from "./storage/storage-adapter.interface";
import { S3StorageAdapter } from "./storage/s3-storage.adapter";
import { LocalStorageAdapter } from "./storage/local-storage.adapter";
import { JobBoardRegistry } from "./job-boards/job-board-registry";
import { NaukriAdapter } from "./job-boards/naukri.adapter";
import { IndeedAdapter } from "./job-boards/indeed.adapter";
import { LinkedInAdapter } from "./job-boards/linkedin.adapter";
import { CsvImportAdapter } from "./job-boards/csv-import.adapter";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    { provide: EMAIL_ADAPTER, useClass: SmtpEmailAdapter },
    {
      provide: STORAGE_ADAPTER,
      useFactory: () =>
        process.env.STORAGE_ACCESS_KEY_ID
          ? new S3StorageAdapter()
          : new LocalStorageAdapter(),
    },
    NaukriAdapter,
    IndeedAdapter,
    LinkedInAdapter,
    CsvImportAdapter,
    JobBoardRegistry,
    IntegrationsService,
  ],
  exports: [
    EMAIL_ADAPTER,
    STORAGE_ADAPTER,
    JobBoardRegistry,
    IntegrationsService,
    CsvImportAdapter,
  ],
})
export class IntegrationsModule {}
