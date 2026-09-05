import { Test } from "@nestjs/testing";
import { DprService } from "./dpr.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskCompletionAiService } from "../todos/task-completion-ai.service";

/**
 * Focused unit test for the sync-engine conflict detection described in plan section 6.4.
 * Uses a mocked PrismaService so it runs without a database — see test/ for e2e coverage
 * once `prisma generate`/`migrate` have been run against a real Postgres instance.
 */
describe("DprService", () => {
  let service: DprService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      dPR: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      dPREntry: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      workDay: { update: jest.fn() },
      dPRAuditEntry: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DprService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        // DprService gained this dependency; without it the whole suite failed
        // to compile with "Nest can't resolve dependencies of the DprService".
        {
          provide: TaskCompletionAiService,
          useValue: { analyzeTask: jest.fn(), analyzeWorkDay: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(DprService);
  });

  it("flags a completed task missing from the DPR", async () => {
    const dprId = "dpr-1";
    prisma.dPR.findUniqueOrThrow.mockResolvedValue({
      id: dprId,
      workDayId: "wd-1",
      entries: [],
      workDay: {
        todos: [
          {
            id: "t-1",
            title: "Ship feature X",
            status: "COMPLETED",
            actualHours: 3,
          },
        ],
      },
    });

    const result = await (service as any).recalcHoursAndFlags(dprId);

    expect(result.missing).toHaveLength(1);
    expect(prisma.dPR.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dprId },
        data: expect.objectContaining({ hasMismatchFlag: true }),
      }),
    );
  });

  it("flags a task-hours vs DPR-hours mismatch", async () => {
    const dprId = "dpr-2";
    prisma.dPR.findUniqueOrThrow.mockResolvedValue({
      id: dprId,
      workDayId: "wd-2",
      entries: [{ todoId: "t-2", hours: 7 }],
      workDay: {
        todos: [
          {
            id: "t-2",
            title: "Fix bug Y",
            status: "COMPLETED",
            actualHours: 4,
          },
        ],
      },
    });

    const result = await (service as any).recalcHoursAndFlags(dprId);

    expect(result.mismatch).toBe(true);
  });
});
