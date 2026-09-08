import {
  Injectable,
  Logger,
} from "@nestjs/common";

import {
  AiProviderService,
} from "../integrations/ai/ai-provider.service";

export interface KraAiMetricResult {
  itemId: string;
  achievementPercent: number;
  confidence: number;
  evidence: string;
  gaps: string;
}

@Injectable()
export class KraAiService {
  private readonly logger =
    new Logger(KraAiService.name);

  private lastFailure:
    string | null = null;

  constructor(
    private readonly provider: AiProviderService
  ) {}

  get lastFailureReason() {
    return this.lastFailure;
  }

  isConfigured() {
    return this.provider.isConfigured();
  }

  /**
   * ========================================================
   * EVALUATE KRA
   * ========================================================
   */
  async evaluate(
    metrics: any[],
    evidence: any,
    period: "daily" | "monthly"
  ) {
    this.lastFailure = null;

    if (!this.isConfigured()) {
      this.lastFailure =
        `${this.provider.config.provider.toUpperCase()} AI provider is not configured`;

      return null;
    }

    if (!metrics.length) {
      this.lastFailure =
        "No KRA metrics were supplied for evaluation";

      return null;
    }

    try {
      this.logger.log(
        `Starting KRA evaluation | metrics=${metrics.length} | period=${period}`
      );

      const parsed: any =
        await this.provider.generateJson({
          temperature: 0.1,

          timeoutMs: 180000,

          system: [
            "You are the HRMS KRA evaluation engine.",

            `Evaluate the employee's KRA metrics for this ${period} period.`,

            "Use ONLY the supplied company/designation metrics, their targets, employee commitments, and recorded HRMS activity evidence.",

            "Do not invent work, numbers, meetings, leads, revenue, quality results, or external platform activity.",

            "Employee commitments are planned results, not automatically completed work.",

            "Compare employee commitment results against the company metric target.",

            "Cross-check commitments with actual HRMS evidence such as attendance, To-Dos, DPRs, DPR quality, manager comments, and other supplied HRMS activity.",

            "If evidence is insufficient, score conservatively and reduce confidence.",

            "AchievementPercent must be between 0 and 100.",

            "100 means the company target was met or exceeded.",

            "For percentage metrics, calculate the supported percentage.",

            "For count metrics, compare the recorded result against the target.",

            "For qualitative metrics, use only supplied evidenceSource and evaluationMethod.",

            "Do not double-count the same evidence.",

            "Return one result for EVERY supplied metric.",

            "Echo each metric itemId exactly.",

            "Return JSON only.",

            "Required JSON format: {\"metrics\":[{\"itemId\":\"...\",\"achievementPercent\":0,\"confidence\":0,\"evidence\":\"...\",\"gaps\":\"...\"}]}",
          ].join(" "),

          user: {
            metrics,
            evidence,
          },
        });

      if (
        !Array.isArray(
          parsed?.metrics
        )
      ) {
        throw new Error(
          "AI response did not contain metrics[]"
        );
      }

      const missing: string[] = [];

      const results: KraAiMetricResult[] =
        metrics.map(
          (metric) => {
            const found =
              parsed.metrics.find(
                (x: any) =>
                  x.itemId ===
                    metric.itemId ||
                  x.itemId ===
                    metric.name
              );

            if (
              !found ||
              found.achievementPercent ==
                null
            ) {
              missing.push(
                metric.name ??
                  metric.itemId
              );
            }

            return {
              itemId:
                metric.itemId,

              achievementPercent:
                Math.max(
                  0,
                  Math.min(
                    100,
                    Number(
                      found?.achievementPercent
                    ) || 0
                  )
                ),

              confidence:
                Math.max(
                  0,
                  Math.min(
                    100,
                    Number(
                      found?.confidence
                    ) || 0
                  )
                ),

              evidence:
                String(
                  found?.evidence ||
                    "No supporting evidence supplied."
                ),

              gaps:
                String(
                  found?.gaps || ""
                ),
            };
          }
        );

      if (missing.length) {
        throw new Error(
          `AI did not score ${missing.length} metric(s): ${missing.join(
            ", "
          )}`
        );
      }

      this.logger.log(
        `KRA evaluation completed successfully | metrics=${results.length}`
      );

      return {
        results,

        provider:
          this.provider.config
            .provider,

        model:
          this.provider.config
            .model,
      };
    } catch (error) {
      const reason =
        (error as Error)
          ?.message ||
        String(error);

      this.lastFailure =
        reason;

      this.logger.error(
        `KRA AI evaluation failed; deterministic fallback will be used and the score will not be strike-eligible: ${reason}`
      );

      return null;
    }
  }

  /**
   * ========================================================
   * GENERATE KRA METRICS
   * ========================================================
   */
  async generateMetrics(
    roleName: string,
    roleProfile: string
  ) {
    this.lastFailure = null;

    if (!this.isConfigured()) {
      this.lastFailure =
        `${this.provider.config.provider.toUpperCase()} AI provider is not configured`;

      return null;
    }

    try {
      this.logger.log(
        `Starting KRA metric generation | role=${roleName}`
      );

      const parsed: any =
        await this.provider.generateJson({
          temperature: 0.1,

          timeoutMs: 180000,

          system: [
            "You are an HRMS KRA template generation engine.",

            "Create a professional KRA template from the supplied role context.",

            "Generate 8 to 15 measurable role-specific metrics.",

            "Focus on responsibilities, measurable outcomes, productivity, quality, compliance, and business impact.",

            "Do not create generic metrics that do not apply to the role.",

            "Every metric must be measurable from HRMS-recorded evidence whenever possible.",

            "If a metric normally requires an external platform that is not integrated, use HRMS_ACTIVITY and clearly state that missing external evidence should reduce confidence.",

            "Do not invent external integrations.",

            "Do not invent leads, calls, meetings, revenue, documents, traffic, rankings, or other results.",

            "Assign reasonable weight percentages to all metrics.",

            "The final weights will be normalized by the HRMS backend to exactly 100%.",

            "Use only these measurement types: NUMBER, PERCENTAGE, BOOLEAN, RATING, REVENUE, MANUAL, AUTOMATED.",

            "Use only these evidence sources: ATTENDANCE, TASKS, DPR, DPR_QUALITY, TASK_AI, COMMENTS, ATS_ACTIVITY, LEAVE, HRMS_ACTIVITY.",

            "Set isAutomated to true for every metric.",

            "Return JSON only.",

            "Required JSON format: {\"metrics\":[{\"name\":\"...\",\"description\":\"...\",\"weightPercent\":0,\"measurementType\":\"PERCENTAGE\",\"targetText\":\"...\",\"isAutomated\":true,\"evidenceSource\":\"HRMS_ACTIVITY\",\"evaluationMethod\":\"...\"}]}",
          ].join(" "),

          user: {
            roleName,
            roleProfile,
          },
        });

      if (
        !Array.isArray(
          parsed?.metrics
        ) ||
        !parsed.metrics.length
      ) {
        throw new Error(
          "AI did not return metrics"
        );
      }

      const allowedMeasurementTypes =
        new Set([
          "NUMBER",
          "PERCENTAGE",
          "BOOLEAN",
          "RATING",
          "REVENUE",
          "MANUAL",
          "AUTOMATED",
        ]);

      const allowedEvidenceSources =
        new Set([
          "ATTENDANCE",
          "TASKS",
          "DPR",
          "DPR_QUALITY",
          "TASK_AI",
          "COMMENTS",
          "ATS_ACTIVITY",
          "LEAVE",
          "HRMS_ACTIVITY",
        ]);

      /**
       * ----------------------------------------------------
       * First clean the AI output
       * ----------------------------------------------------
       */
      const metrics =
        parsed.metrics.map(
          (m: any, i: number) => ({
            name:
              String(
                m.name ||
                  `KRA Metric ${i + 1}`
              ).trim(),

            description:
              m.description
                ? String(
                    m.description
                  )
                : undefined,

            weightPercent:
              Math.max(
                0,
                Number(
                  m.weightPercent
                ) || 0
              ),

            measurementType:
              allowedMeasurementTypes.has(
                String(
                  m.measurementType
                )
              )
                ? String(
                    m.measurementType
                  )
                : "PERCENTAGE",

            targetText:
              m.targetText
                ? String(
                    m.targetText
                  )
                : undefined,

            isAutomated:
              true,

            evidenceSource:
              allowedEvidenceSources.has(
                String(
                  m.evidenceSource
                )
              )
                ? String(
                    m.evidenceSource
                  )
                : "HRMS_ACTIVITY",

            evaluationMethod:
              String(
                m.evaluationMethod ||
                  "Evaluate only from recorded HRMS evidence; reduce confidence when evidence is missing."
              ).trim(),

            sortOrder: i,
          })
        );

      /**
       * ----------------------------------------------------
       * Calculate AI weight total
       * ----------------------------------------------------
       */
      const originalTotal =
        metrics.reduce(
          (
            sum: number,
            metric: any
          ) =>
            sum +
            metric.weightPercent,
          0
        );

      this.logger.log(
        `AI generated ${metrics.length} metrics with total weight ${originalTotal.toFixed(
          2
        )}%`
      );

      /**
       * ----------------------------------------------------
       * Validate that there are usable weights
       * ----------------------------------------------------
       */
      if (
        originalTotal <= 0
      ) {
        throw new Error(
          "AI generated metrics but all weightPercent values are zero"
        );
      }

      /**
       * ----------------------------------------------------
       * NORMALIZE WEIGHTS TO EXACTLY 100%
       * ----------------------------------------------------
       *
       * Example:
       *
       * AI generated:
       *
       * 20
       * 15
       * 10
       * ...
       *
       * Total = 104
       *
       * We convert every weight:
       *
       * normalized =
       * original / total * 100
       *
       * ----------------------------------------------------
       */
      const normalizedMetrics =
        metrics.map(
          (metric: any) => ({
            ...metric,

            weightPercent:
              Number(
                (
                  (metric.weightPercent /
                    originalTotal) *
                  100
                ).toFixed(2)
              ),
          })
        );

      /**
       * ----------------------------------------------------
       * Fix rounding difference
       * ----------------------------------------------------
       *
       * Example:
       *
       * 33.33
       * 33.33
       * 33.33
       *
       * Total = 99.99
       *
       * We add the difference to the
       * largest metric so the final total
       * is exactly 100.
       * ----------------------------------------------------
       */
      let normalizedTotal =
        normalizedMetrics.reduce(
          (
            sum: number,
            metric: any
          ) =>
            sum +
            metric.weightPercent,
          0
        );

      normalizedTotal =
        Number(
          normalizedTotal.toFixed(
            2
          )
        );

      const difference =
        Number(
          (
            100 -
            normalizedTotal
          ).toFixed(2)
        );

      if (
        difference !== 0
      ) {
        let largestIndex = 0;

        for (
          let i = 1;
          i <
          normalizedMetrics.length;
          i++
        ) {
          if (
            normalizedMetrics[i]
              .weightPercent >
            normalizedMetrics[
              largestIndex
            ].weightPercent
          ) {
            largestIndex = i;
          }
        }

        normalizedMetrics[
          largestIndex
        ].weightPercent =
          Number(
            (
              normalizedMetrics[
                largestIndex
              ].weightPercent +
              difference
            ).toFixed(2)
          );
      }

      /**
       * ----------------------------------------------------
       * Final validation
       * ----------------------------------------------------
       */
      const finalTotal =
        normalizedMetrics.reduce(
          (
            sum: number,
            metric: any
          ) =>
            sum +
            metric.weightPercent,
          0
        );

      const finalTotalRounded =
        Number(
          finalTotal.toFixed(2)
        );

      if (
        finalTotalRounded !==
        100
      ) {
        throw new Error(
          `Unable to normalize KRA weights to 100%. Final total: ${finalTotalRounded}%`
        );
      }

      /**
       * ----------------------------------------------------
       * Log final weights
       * ----------------------------------------------------
       */
      this.logger.log(
        `KRA weights normalized successfully: ${finalTotalRounded}%`
      );

      normalizedMetrics.forEach(
        (
          metric: any,
          index: number
        ) => {
          this.logger.log(
            `KRA metric ${index + 1}: ${metric.name} | weight=${metric.weightPercent}%`
          );
        }
      );

      /**
       * ----------------------------------------------------
       * Return result
       * ----------------------------------------------------
       */
      return {
        metrics:
          normalizedMetrics,

        provider:
          this.provider.config
            .provider,

        model:
          this.provider.config
            .model,
      };
    } catch (error) {
      this.lastFailure =
        (error as Error)
          ?.message ||
        String(error);

      this.logger.error(
        `KRA metric generation failed: ${this.lastFailure}`
      );

      return null;
    }
  }
}
