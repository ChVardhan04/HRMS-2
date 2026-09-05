import { Injectable, Logger } from "@nestjs/common";

export interface KraAiMetricResult {
  itemId: string;
  achievementPercent: number;
  confidence: number;
  evidence: string;
  gaps: string;
}

@Injectable()
export class KraAiService {
  private readonly logger = new Logger(KraAiService.name);
  private get model() { return process.env.AI_MODEL || "gpt-4.1-mini"; }
  private get timeoutMs() { return Number(process.env.AI_TIMEOUT_MS ?? 60000); }

  /** Last failure reason, so callers/HR can see WHY the AI evaluation did not run. */
  private lastFailure: string | null = null;
  get lastFailureReason() { return this.lastFailure; }

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  /**
   * Calls the provider with a hard timeout. Without this an unresponsive
   * provider would hang the whole nightly KRA batch indefinitely.
   */
  private async postJson(body: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`AI provider returned ${response.status} ${detail.slice(0, 300)}`);
      }
      return (await response.json()) as any;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractText(payload: any) {
    return (
      payload.output_text ||
      payload.output
        ?.flatMap((x: any) => x.content || [])
        .map((x: any) => x.text || "")
        .join(" ") ||
      ""
    );
  }

  private parseJson(text: string) {
    const cleaned = text.replace(/^```(?:json)?\s*|```$/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Some models wrap the object in prose despite json_object mode.
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end <= start) throw new Error("AI response was not valid JSON");
      return JSON.parse(cleaned.slice(start, end + 1));
    }
  }

  async evaluate(metrics: any[], evidence: any, period: "daily" | "monthly") {
    this.lastFailure = null;
    if (!this.isConfigured()) {
      this.lastFailure = "OPENAI_API_KEY is not configured";
      return null;
    }
    if (!metrics.length) {
      this.lastFailure = "No KRA metrics were supplied for evaluation";
      return null;
    }
    try {
      const payload = await this.postJson({
        model: this.model,
        input: [
          { role: "system", content: [{ type: "input_text", text: [
            "You are the HRMS KRA evaluation engine.",
            `Evaluate the employee's KRA metrics for this ${period} period using ONLY the supplied metrics, targets and recorded activity evidence.`,
            "Never invent work, numbers, meetings, leads, revenue, quality results or external platform activity that is not present in the evidence.",
            "If evidence is insufficient, score conservatively and explain the gap.",
            "Achievement is 0-100 where 100 means the target/expectation was met or exceeded.",
            "For qualitative metrics, use only the evidenceSource and evaluationMethod supplied with each metric.",
            "Use the metric target as the denominator or expectation. For count targets, compare recorded counts with the target for the period. For percentage targets, calculate the supported rate. For qualitative metrics, use documented evidence signals and lower confidence when evidence is weak.",
            "A missing external platform integration is not proof of failure, but it is also not proof of completion: score only what HRMS can substantiate and explain the gap.",
            "Return one entry for EVERY supplied metric, echoing its itemId exactly.",
            "Return JSON only: {\"metrics\":[{\"itemId\":\"...\",\"achievementPercent\":0,\"confidence\":0,\"evidence\":\"...\",\"gaps\":\"...\"}]}"
          ].join(" ") }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ metrics, evidence }) }] },
        ],
        temperature: 0.1,
        // Enforce structured output rather than hoping for bare JSON.
        text: { format: { type: "json_object" } },
      });

      const parsed = this.parseJson(this.extractText(payload));
      if (!Array.isArray(parsed.metrics)) throw new Error("AI response did not contain metrics[]");

      // Every configured metric must come back scored. A partial response would
      // otherwise silently fall through to the keyword heuristic for the missing
      // ones while still being reported as a genuine AI evaluation.
      const missing: string[] = [];
      const results: KraAiMetricResult[] = metrics.map((metric) => {
        const found = parsed.metrics.find((x: any) => x.itemId === metric.itemId || x.itemId === metric.name);
        if (!found || found.achievementPercent == null) missing.push(metric.name ?? metric.itemId);
        return {
          itemId: metric.itemId,
          achievementPercent: Math.max(0, Math.min(100, Number(found?.achievementPercent) || 0)),
          confidence: Math.max(0, Math.min(100, Number(found?.confidence) || 0)),
          evidence: String(found?.evidence || "No supporting evidence supplied."),
          gaps: String(found?.gaps || ""),
        };
      });

      if (missing.length) {
        throw new Error(`AI did not score ${missing.length} metric(s): ${missing.join(", ")}`);
      }

      return { results, provider: "openai", model: this.model };
    } catch (error) {
      const reason = (error as Error).name === "AbortError"
        ? `AI evaluation timed out after ${this.timeoutMs}ms`
        : (error as Error).message;
      this.lastFailure = reason;
      this.logger.error(
        `KRA AI evaluation failed; the deterministic fallback will be used and the score will NOT be eligible for a strike: ${reason}`,
      );
      return null;
    }
  }

  async generateMetrics(roleName: string, roleProfile: string) {
    this.lastFailure = null;
    if (!this.isConfigured()) {
      this.lastFailure = "OPENAI_API_KEY is not configured";
      return null;
    }
    try {
      const payload = await this.postJson({
        model: this.model,
        input: [
          { role: "system", content: [{ type: "input_text", text: [
            "Create an HRMS KRA template from the supplied role context.",
            "Return JSON only as {\"metrics\":[{\"name\":\"...\",\"description\":\"...\",\"weightPercent\":0,\"measurementType\":\"PERCENTAGE\",\"targetText\":\"...\",\"isAutomated\":true,\"evidenceSource\":\"ATTENDANCE|TASKS|DPR|DPR_QUALITY|TASK_AI|COMMENTS|ATS_ACTIVITY|LEAVE|HRMS_ACTIVITY\",\"evaluationMethod\":\"...\"}]}",
            "Use measurable role-specific metrics and make the weights total exactly 100.",
            "Every metric should be evaluated automatically by AI from HRMS-recorded evidence; set isAutomated true.",
            "Choose evidenceSource only from the supplied HRMS evidence categories. If a metric normally depends on an external platform that is not integrated, use HRMS_ACTIVITY and state that missing external evidence must reduce confidence rather than being invented.",
            "The evaluationMethod must explain exactly how the metric should be judged from the evidence.",
            "Never invent external integrations, activity, leads, calls, revenue, meetings, documents or results."
          ].join(" ") }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ roleName, roleProfile }) }] },
        ],
        temperature: 0.2,
        text: { format: { type: "json_object" } },
      });

      const parsed = this.parseJson(this.extractText(payload));
      if (!Array.isArray(parsed.metrics) || !parsed.metrics.length) throw new Error("AI did not return metrics");
      const allowedMeasurementTypes = new Set(["NUMBER","PERCENTAGE","BOOLEAN","RATING","REVENUE","MANUAL","AUTOMATED"]);
      const metrics = parsed.metrics.map((m: any, i: number) => ({
        name: String(m.name || `KRA Metric ${i + 1}`).trim(),
        description: m.description ? String(m.description) : undefined,
        weightPercent: Math.max(0, Number(m.weightPercent) || 0),
        measurementType: allowedMeasurementTypes.has(String(m.measurementType)) ? String(m.measurementType) : "PERCENTAGE",
        targetText: m.targetText ? String(m.targetText) : undefined,
        isAutomated: true,
        evidenceSource: String(m.evidenceSource || "HRMS_ACTIVITY").trim(),
        evaluationMethod: String(m.evaluationMethod || "Evaluate only from recorded HRMS evidence; reduce confidence when evidence is missing.").trim(),
        sortOrder: i,
      }));
      const total = metrics.reduce((sum: number, m: any) => sum + m.weightPercent, 0);
      if (total <= 0) throw new Error("AI generated zero total weight");
      let running = 0;
      metrics.forEach((m: any, i: number) => {
        if (i === metrics.length - 1) m.weightPercent = Number((100 - running).toFixed(2));
        else { m.weightPercent = Number(((m.weightPercent / total) * 100).toFixed(2)); running += m.weightPercent; }
      });
      return { metrics, provider: "openai", model: this.model };
    } catch (error) {
      const reason = (error as Error).name === "AbortError"
        ? `AI template generation timed out after ${this.timeoutMs}ms`
        : (error as Error).message;
      this.lastFailure = reason;
      this.logger.error(`KRA template generation failed: ${reason}`);
      return null;
    }
  }
}
