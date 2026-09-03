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

  async evaluate(metrics: any[], evidence: any, period: "daily" | "monthly") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: "system", content: [{ type: "input_text", text: [
              "You are the HRMS KRA evaluation engine.",
              `Evaluate the employee's KRA metrics for this ${period} period using ONLY the supplied metrics, targets and recorded activity evidence.`,
              "Never invent work, numbers, meetings, leads, revenue, quality results or external platform activity that is not present in the evidence.",
              "If evidence is insufficient, score conservatively and explain the gap.",
              "Achievement is 0-100 where 100 means the target/expectation was met or exceeded.",
              "For qualitative metrics, use only recorded DPR, task, attendance and review evidence.",
              "Return JSON only: {\"metrics\":[{\"itemId\":\"...\",\"achievementPercent\":0,\"confidence\":0,\"evidence\":\"...\",\"gaps\":\"...\"}]}"
            ].join(" ") }] },
            { role: "user", content: [{ type: "input_text", text: JSON.stringify({ metrics, evidence }) }] },
          ],
          temperature: 0.1,
        }),
      });
      if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
      const payload: any = await response.json();
      const text = payload.output_text || payload.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join(" ") || "";
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
      if (!Array.isArray(parsed.metrics)) throw new Error("AI response did not contain metrics[]");
      const results: KraAiMetricResult[] = metrics.map((metric) => {
        const found = parsed.metrics.find((x: any) => x.itemId === metric.itemId || x.itemId === metric.name);
        return {
          itemId: metric.itemId,
          achievementPercent: Math.max(0, Math.min(100, Number(found?.achievementPercent) || 0)),
          confidence: Math.max(0, Math.min(100, Number(found?.confidence) || 0)),
          evidence: String(found?.evidence || "No supporting evidence supplied."),
          gaps: String(found?.gaps || ""),
        };
      });
      return { results, provider: "openai", model: this.model };
    } catch (error) {
      this.logger.warn(`KRA AI evaluation failed; deterministic evidence scoring will be used: ${(error as Error).message}`);
      return null;
    }
  }

  async generateMetrics(roleName: string, roleProfile: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: "system", content: [{ type: "input_text", text: "Create an HRMS KRA template. Return JSON only as {\"metrics\":[{\"name\":\"...\",\"description\":\"...\",\"weightPercent\":0,\"measurementType\":\"PERCENTAGE\",\"targetText\":\"...\",\"isAutomated\":true}]}]. Use measurable metrics, total weights exactly 100, and mark a metric automated only when HRMS activity evidence can realistically support it. Never invent external integrations." }] },
            { role: "user", content: [{ type: "input_text", text: JSON.stringify({ roleName, roleProfile }) }] },
          ],
          temperature: 0.2,
        }),
      });
      if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
      const payload: any = await response.json();
      const text = payload.output_text || payload.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join(" ") || "";
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
      if (!Array.isArray(parsed.metrics) || !parsed.metrics.length) throw new Error("AI did not return metrics");
      const allowedMeasurementTypes = new Set(["NUMBER","PERCENTAGE","BOOLEAN","RATING","REVENUE","MANUAL","AUTOMATED"]);
      const metrics = parsed.metrics.map((m: any, i: number) => ({
        name: String(m.name || `KRA Metric ${i + 1}`).trim(),
        description: m.description ? String(m.description) : undefined,
        weightPercent: Math.max(0, Number(m.weightPercent) || 0),
        measurementType: allowedMeasurementTypes.has(String(m.measurementType)) ? String(m.measurementType) : "PERCENTAGE",
        targetText: m.targetText ? String(m.targetText) : undefined,
        isAutomated: Boolean(m.isAutomated),
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
      this.logger.warn(`KRA template generation failed: ${(error as Error).message}`);
      return null;
    }
  }
}
