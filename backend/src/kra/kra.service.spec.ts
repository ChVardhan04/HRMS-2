import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { KraService } from "./kra.service";
import { KraAiService } from "./kra-ai.service";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";

/**
 * Covers the configuration -> scoring -> strike-eligibility chain:
 *   1. metric weights must total exactly 100
 *   2. the final score is normalised so it is comparable to the threshold
 *   3. a score is only strike-eligible when the template is valid AND the AI ran
 */
describe("KraService — metric weights and score calculation", () => {
  let service: KraService;
  let prisma: any;
  let ai: any;

  const template = (items: any[]) => ({
    id: "tpl-1",
    name: "Digital Analyst KRA",
    roleName: "Digital Analyst",
    items,
  });

  const item = (id: string, weight: number, name = id) => ({
    id,
    name,
    weightPercent: weight,
    evidenceSource: "HRMS_ACTIVITY",
    evaluationMethod: "AI_EVIDENCE",
    targetValue: null,
    targetText: "100%",
    measurementType: "PERCENTAGE",
  });

  beforeEach(async () => {
    prisma = {
      kRATemplate: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      kRAItem: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      kRAScore: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      kRADailyScore: { upsert: jest.fn(), findMany: jest.fn() },
      employee: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    ai = { evaluate: jest.fn(), generateMetrics: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KraService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarService, useValue: { getOrganization: jest.fn(), countWorkingDaysForEmployee: jest.fn() } },
        { provide: KraAiService, useValue: ai },
      ],
    }).compile();

    service = moduleRef.get(KraService);
  });

  describe("weight validation", () => {
    it("rejects adding a metric that leaves the template short of 100%", async () => {
      prisma.kRATemplate.findUnique.mockResolvedValue(
        template([item("a", 40), item("b", 20)]),
      );
      // 40 + 20 + 10 = 70
      await expect(
        service.addItem("tpl-1", { name: "c", weightPercent: 10 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.kRAItem.create).not.toHaveBeenCalled();
    });

    it("accepts a metric that brings the template to exactly 100%", async () => {
      prisma.kRATemplate.findUnique.mockResolvedValue(
        template([item("a", 40), item("b", 20)]),
      );
      prisma.kRAItem.create.mockResolvedValue({ id: "c" });
      await service.addItem("tpl-1", { name: "c", weightPercent: 40 } as any);
      expect(prisma.kRAItem.create).toHaveBeenCalled();
    });

    it("refuses to delete a metric without rebalancing the remainder", async () => {
      prisma.kRAItem.findUnique.mockResolvedValue({
        id: "b",
        templateId: "tpl-1",
        template: template([item("a", 60), item("b", 40)]),
      });
      await expect(service.deleteItem("b")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.kRAItem.delete).not.toHaveBeenCalled();
    });

    it("allows deletion when the freed weight is redistributed to 100%", async () => {
      prisma.kRAItem.findUnique.mockResolvedValue({
        id: "b",
        templateId: "tpl-1",
        template: template([item("a", 60), item("b", 40)]),
      });
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          kRAItem: { delete: jest.fn(), update: jest.fn() },
          kRATemplate: { findUniqueOrThrow: jest.fn().mockResolvedValue(template([item("a", 100)])) },
        }),
      );
      await expect(
        service.deleteItem("b", [{ itemId: "a", weightPercent: 100 }]),
      ).resolves.toBeDefined();
    });
  });

  describe("score normalisation and strike eligibility", () => {
    const evidence = { attendance: {}, tasks: {}, dpr: {}, comments: { count: 0 }, dprEntries: [], atsActivity: { total: 0 } };

    it("produces a weighted 0-100 score when the AI evaluates every metric", async () => {
      ai.evaluate.mockResolvedValue({
        provider: "openai",
        model: "gpt-4.1-mini",
        results: [
          { itemId: "a", achievementPercent: 90, confidence: 80, evidence: "", gaps: "" },
          { itemId: "b", achievementPercent: 50, confidence: 70, evidence: "", gaps: "" },
        ],
      });

      const scored = await (service as any).scoreMetrics(
        template([item("a", 60), item("b", 40)]),
        evidence,
        "monthly",
      );

      // 0.6*90 + 0.4*50 = 74
      expect(scored.finalScore).toBeCloseTo(74, 2);
      expect(scored.weightsBalanced).toBe(true);
      expect(scored.aiEvaluated).toBe(true);
    });

    it("normalises an unbalanced legacy template instead of capping the score", async () => {
      ai.evaluate.mockResolvedValue({
        provider: "openai",
        model: "gpt-4.1-mini",
        results: [
          { itemId: "a", achievementPercent: 100, confidence: 90, evidence: "", gaps: "" },
          { itemId: "b", achievementPercent: 100, confidence: 90, evidence: "", gaps: "" },
        ],
      });

      // Weights total only 60. Without normalisation a perfect performer scored
      // 60% and was struck against the 80% threshold.
      const scored = await (service as any).scoreMetrics(
        template([item("a", 40), item("b", 20)]),
        evidence,
        "monthly",
      );

      expect(scored.finalScore).toBeCloseTo(100, 2);
      expect(scored.weightsBalanced).toBe(false);
    });

    it("marks a score as NOT strike-eligible when the AI did not run", async () => {
      ai.evaluate.mockResolvedValue(null); // no API key / provider failure

      const scored = await (service as any).scoreMetrics(
        template([item("a", 60), item("b", 40)]),
        evidence,
        "monthly",
      );

      expect(scored.aiEvaluated).toBe(false);
      const meta = (service as any).scoreMeta(scored).__meta;
      expect(meta.eligibleForStrike).toBe(false);
    });

    it("marks a score as NOT strike-eligible when weights are unbalanced", async () => {
      ai.evaluate.mockResolvedValue({
        provider: "openai",
        model: "gpt-4.1-mini",
        results: [{ itemId: "a", achievementPercent: 10, confidence: 90, evidence: "", gaps: "" }],
      });

      const scored = await (service as any).scoreMetrics(
        template([item("a", 55)]),
        evidence,
        "monthly",
      );

      const meta = (service as any).scoreMeta(scored).__meta;
      expect(meta.eligibleForStrike).toBe(false);
    });

    it("marks a fully-configured, AI-evaluated score as strike-eligible", async () => {
      ai.evaluate.mockResolvedValue({
        provider: "openai",
        model: "gpt-4.1-mini",
        results: [{ itemId: "a", achievementPercent: 42, confidence: 88, evidence: "", gaps: "" }],
      });

      const scored = await (service as any).scoreMetrics(
        template([item("a", 100)]),
        evidence,
        "monthly",
      );

      const meta = (service as any).scoreMeta(scored).__meta;
      expect(scored.finalScore).toBeCloseTo(42, 2);
      expect(meta.eligibleForStrike).toBe(true);
    });
  });
});
