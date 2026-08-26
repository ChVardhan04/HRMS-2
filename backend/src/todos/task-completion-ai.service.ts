import { Injectable, Logger } from "@nestjs/common";
import { TodoEodStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TaskCompletionAiService {
  private readonly logger = new Logger(TaskCompletionAiService.name);

  constructor(private prisma: PrismaService) {}

  async analyzeAndPersistForWorkDay(workDayId: string, dprText: string) {
    const tasks = await this.prisma.todo.findMany({
      where: { workDayId, eodStatus: { in: [TodoEodStatus.COMPLETED, TodoEodStatus.INCOMPLETE] } },
      orderBy: { createdAt: "asc" },
    });

    for (const task of tasks) {
      const result = await this.analyze(task, dprText);
      await this.prisma.todo.update({
        where: { id: task.id },
        data: {
          aiCompletionPercent: result.percent,
          aiCompletionAnalysis: result.analysis as any,
          aiAnalyzedAt: new Date(),
        },
      });
    }

    return tasks.length;
  }

  private async analyze(task: any, dprText: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || "gpt-4.1-mini",
            input: [
              {
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: "You are an HRMS task-completion analyst. Compare the assigned task with the employee's DPR text. Return JSON only with percent (0-100), confidence (0-100), summary, evidence, and gaps. Do not reward vague statements. If the task was marked incomplete, treat the reason as a blocker and estimate actual progress from the evidence.",
                  },
                ],
              },
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: JSON.stringify({
                      task: {
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        eodStatus: task.eodStatus,
                        outputSummary: task.completionOutputSummary,
                        incompleteReason: task.incompleteReason,
                        proofProvided: Boolean(task.completionProofStorageKey),
                      },
                      dpr: dprText,
                    }),
                  },
                ],
              },
            ],
            temperature: 0.1,
          }),
        });
        if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
        const payload: any = await response.json();
        const text = payload.output_text || payload.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join(" ") || "";
        const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
        const percent = Math.max(0, Math.min(100, Number(parsed.percent) || 0));
        return {
          percent,
          analysis: { ...parsed, provider: "openai", model: process.env.AI_MODEL || "gpt-4.1-mini" },
        };
      } catch (error) {
        this.logger.warn(`AI task analysis failed; using deterministic fallback: ${(error as Error).message}`);
      }
    }

    return this.fallback(task, dprText);
  }

  private fallback(task: any, dprText: string) {
    const taskWords = this.words(`${task.title} ${task.description || ""}`);
    const dprWords = new Set(this.words(dprText));
    const overlap = taskWords.filter((word) => dprWords.has(word)).length;
    const lexical = taskWords.length ? Math.min(100, (overlap / taskWords.length) * 100) : 50;
    const base = task.eodStatus === "INCOMPLETE" ? Math.min(75, lexical) : Math.max(60, lexical);
    const percent = Math.round(base);
    return {
      percent,
      analysis: {
        provider: "heuristic-fallback",
        confidence: 45,
        summary: task.eodStatus === "INCOMPLETE" ? "Task was marked incomplete; progress estimated from the available DPR evidence." : "Completion estimated from overlap between the assigned task and DPR evidence.",
        evidence: dprText ? "DPR text was available for comparison." : "No DPR text was available.",
        gaps: task.eodStatus === "INCOMPLETE" ? task.incompleteReason || "No incomplete reason supplied." : "Configure OPENAI_API_KEY for richer AI analysis.",
      },
    };
  }

  private words(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  }
}
