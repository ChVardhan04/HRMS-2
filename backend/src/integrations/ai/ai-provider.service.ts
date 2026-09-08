import { Injectable, Logger } from "@nestjs/common";

export type AiProviderName =
  | "openai"
  | "gemini"
  | "anthropic"
  | "openai-compatible"
  | "nvidia";

export interface AiJsonRequest {
  system: string;
  user: unknown;
  temperature?: number;
  timeoutMs?: number;
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  /**
   * ---------------------------------------------------------
   * PROVIDER
   * ---------------------------------------------------------
   */
  private provider(): AiProviderName {
    const value = String(
      process.env.AI_PROVIDER || "openai"
    ).toLowerCase();

    const allowedProviders: AiProviderName[] = [
      "openai",
      "gemini",
      "anthropic",
      "openai-compatible",
      "nvidia",
    ];

    if (
      allowedProviders.includes(
        value as AiProviderName
      )
    ) {
      return value as AiProviderName;
    }

    this.logger.warn(
      `Unsupported AI_PROVIDER="${value}". Falling back to openai.`
    );

    return "openai";
  }

  /**
   * ---------------------------------------------------------
   * MODEL
   * ---------------------------------------------------------
   */
  private model(): string {
    const provider = this.provider();

    if (process.env.AI_MODEL) {
      return process.env.AI_MODEL;
    }

    switch (provider) {
      case "gemini":
        return "gemini-2.0-flash";

      case "anthropic":
        return "claude-3-5-haiku-latest";

      case "nvidia":
        return "openai/gpt-oss-20b";

      case "openai-compatible":
        return "gpt-4.1-mini";

      case "openai":
      default:
        return "gpt-4.1-mini";
    }
  }

  /**
   * ---------------------------------------------------------
   * API KEY
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * Do NOT automatically fall back between providers.
   *
   * NVIDIA       -> AI_API_KEY
   * OpenAI       -> OPENAI_API_KEY
   * Gemini       -> GEMINI_API_KEY
   * Anthropic    -> ANTHROPIC_API_KEY
   */
  private apiKey(): string | undefined {
    const provider = this.provider();

    switch (provider) {
      case "nvidia":
      case "openai-compatible":
        return process.env.AI_API_KEY;

      case "gemini":
        return process.env.GEMINI_API_KEY;

      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;

      case "openai":
      default:
        return process.env.OPENAI_API_KEY;
    }
  }

  /**
   * ---------------------------------------------------------
   * CONFIG
   * ---------------------------------------------------------
   */
  get config() {
    return {
      provider: this.provider(),
      model: this.model(),
    };
  }

  /**
   * ---------------------------------------------------------
   * CONFIGURED CHECK
   * ---------------------------------------------------------
   */
  isConfigured() {
    return Boolean(this.apiKey());
  }

  /**
   * ---------------------------------------------------------
   * MAIN JSON GENERATION
   * ---------------------------------------------------------
   */
  async generateJson(request: AiJsonRequest) {
    const provider = this.provider();
    const apiKey = this.apiKey();

    if (!apiKey) {
      throw new Error(
        `${provider.toUpperCase()} API key is not configured`
      );
    }

    /**
     * Use 180 seconds by default.
     *
     * You can change this using:
     *
     * AI_TIMEOUT_MS=180000
     */
    const timeoutMs =
      request.timeoutMs ??
      Number(
        process.env.AI_TIMEOUT_MS ?? 180000
      );

    const controller = new AbortController();

    const startedAt = Date.now();

    const timer = setTimeout(() => {
      this.logger.error(
        `AI request timeout after ${timeoutMs}ms`
      );

      controller.abort();
    }, timeoutMs);

    try {
      this.logger.log(
        `AI request started | provider=${provider} | model=${this.model()}`
      );

      switch (provider) {
        case "nvidia":
          return await this.openAiCompatible(
            request,
            apiKey,
            controller.signal
          );

        case "openai-compatible":
          return await this.openAiCompatible(
            request,
            apiKey,
            controller.signal
          );

        case "gemini":
          return await this.gemini(
            request,
            apiKey,
            controller.signal
          );

        case "anthropic":
          return await this.anthropic(
            request,
            apiKey,
            controller.signal
          );

        case "openai":
        default:
          return await this.openai(
            request,
            apiKey,
            controller.signal
          );
      }
    } catch (error) {
      const err = error as any;

      const elapsed =
        Date.now() - startedAt;

      if (
        err?.name === "AbortError" ||
        err?.code === "ABORT_ERR"
      ) {
        this.logger.error(
          `AI request aborted after ${elapsed}ms`
        );

        throw new Error(
          `AI request timed out after ${timeoutMs}ms`
        );
      }

      this.logger.error(
        `AI request failed after ${elapsed}ms | name=${err?.name} | message=${err?.message}`
      );

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ---------------------------------------------------------
   * OPENAI
   * ---------------------------------------------------------
   */
  private async openai(
    request: AiJsonRequest,
    apiKey: string,
    signal: AbortSignal
  ) {
    const startedAt = Date.now();

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: this.model(),

          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: request.system,
                },
              ],
            },

            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify(
                    request.user
                  ),
                },
              ],
            },
          ],

          temperature:
            request.temperature ?? 0.1,

          text: {
            format: {
              type: "json_object",
            },
          },
        }),

        signal,
      }
    );

    this.logger.log(
      `OpenAI response received in ${
        Date.now() - startedAt
      }ms | status=${response.status}`
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `AI provider returned ${
          response.status
        } ${errorText.slice(0, 1000)}`
      );
    }

    const payload: any =
      await response.json();

    const text =
      this.extractOpenAiText(payload);

    return this.parseJson(text);
  }

  /**
   * ---------------------------------------------------------
   * NVIDIA / OPENAI-COMPATIBLE
   * ---------------------------------------------------------
   */
  private async openAiCompatible(
    request: AiJsonRequest,
    apiKey: string,
    signal: AbortSignal
  ) {
    const base = (
      process.env.AI_BASE_URL ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");

    const url =
      `${base}/chat/completions`;

    const provider =
      this.provider();

    const model =
      this.model();

    const startedAt = Date.now();

    this.logger.log(
      `AI compatible request START | provider=${provider} | url=${url} | model=${model}`
    );

    /**
     * NVIDIA GPT-OSS supports:
     *
     * reasoning_effort:
     * low | medium | high
     *
     * For KRA generation we use LOW
     * because we need structured business
     * output rather than deep mathematical
     * reasoning.
     */
    const body: any = {
      model,

      messages: [
        {
          role: "system",
          content: request.system,
        },

        {
          role: "user",
          content: JSON.stringify(
            request.user
          ),
        },
      ],

      temperature:
        request.temperature ?? 0.1,

      /**
       * NVIDIA currently documents
       * max_tokens between 1 and 4096
       * for this endpoint.
       */
      max_tokens: 2048,

      stream: false,

      /**
       * Request JSON output.
       */
      response_format: {
        type: "json_object",
      },
    };

    /**
     * GPT-OSS specific reasoning control.
     *
     * Low = faster response.
     */
    if (provider === "nvidia") {
      body.reasoning_effort = "low";
    }

    this.logger.log(
      `Sending AI request | bodySize=${JSON.stringify(
        body
      ).length} bytes`
    );

    const response = await fetch(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,

          Accept:
            "application/json",
        },

        body: JSON.stringify(body),

        signal,
      }
    );

    const responseTime =
      Date.now() - startedAt;

    this.logger.log(
      `AI HTTP response received | time=${responseTime}ms | status=${response.status}`
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      this.logger.error(
        `AI provider error | status=${response.status} | body=${errorText.slice(
          0,
          1000
        )}`
      );

      throw new Error(
        `AI provider returned ${
          response.status
        } ${errorText.slice(0, 1000)}`
      );
    }

    const payload: any =
      await response.json();

    this.logger.log(
      `AI response JSON received | totalTime=${
        Date.now() - startedAt
      }ms`
    );

    /**
     * NVIDIA/OpenAI-compatible response:
     *
     * choices[0].message.content
     */
    const content =
      payload?.choices?.[0]?.message
        ?.content || "";

    if (!content) {
      this.logger.error(
        `AI returned empty content. Payload keys=${Object.keys(
          payload || {}
        ).join(",")}`
      );

      throw new Error(
        "AI provider returned empty content"
      );
    }

    this.logger.log(
      `AI content length=${content.length}`
    );

    return this.parseJson(content);
  }

  /**
   * ---------------------------------------------------------
   * GEMINI
   * ---------------------------------------------------------
   */
  private async gemini(
    request: AiJsonRequest,
    apiKey: string,
    signal: AbortSignal
  ) {
    const model =
      encodeURIComponent(
        this.model()
      );

    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: request.system,
                },
              ],
            },

            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify(
                      request.user
                    ),
                  },
                ],
              },
            ],

            generationConfig: {
              temperature:
                request.temperature ??
                0.1,

              responseMimeType:
                "application/json",
            },
          }),

          signal,
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `AI provider returned ${
          response.status
        } ${errorText.slice(0, 1000)}`
      );
    }

    const payload: any =
      await response.json();

    const text =
      payload.candidates?.[0]
        ?.content?.parts
        ?.map(
          (p: any) => p.text || ""
        )
        .join("") || "";

    return this.parseJson(text);
  }

  /**
   * ---------------------------------------------------------
   * ANTHROPIC
   * ---------------------------------------------------------
   */
  private async anthropic(
    request: AiJsonRequest,
    apiKey: string,
    signal: AbortSignal
  ) {
    const response =
      await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-api-key": apiKey,

            "anthropic-version":
              "2023-06-01",
          },

          body: JSON.stringify({
            model: this.model(),

            max_tokens: 4096,

            system:
              request.system,

            messages: [
              {
                role: "user",
                content:
                  JSON.stringify(
                    request.user
                  ),
              },
            ],

            temperature:
              request.temperature ??
              0.1,
          }),

          signal,
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `AI provider returned ${
          response.status
        } ${errorText.slice(0, 1000)}`
      );
    }

    const payload: any =
      await response.json();

    const text =
      payload.content
        ?.map(
          (p: any) =>
            p.text || ""
        )
        .join("") || "";

    return this.parseJson(text);
  }

  /**
   * ---------------------------------------------------------
   * OPENAI RESPONSE EXTRACTION
   * ---------------------------------------------------------
   */
  private extractOpenAiText(
    payload: any
  ) {
    return (
      payload.output_text ||
      payload.output
        ?.flatMap(
          (x: any) =>
            x.content || []
        )
        .map(
          (x: any) =>
            x.text || ""
        )
        .join(" ") ||
      ""
    );
  }

  /**
   * ---------------------------------------------------------
   * JSON PARSER
   * ---------------------------------------------------------
   */
  private parseJson(
    text: string
  ) {
    const cleaned =
      String(text)
        .replace(
          /^```(?:json)?\s*/i,
          ""
        )
        .replace(
          /```$/i,
          ""
        )
        .trim();

    if (!cleaned) {
      throw new Error(
        "AI response was empty"
      );
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      /**
       * Sometimes models return a small
       * amount of text around JSON.
       *
       * Try extracting the outer object.
       */
      const start =
        cleaned.indexOf("{");

      const end =
        cleaned.lastIndexOf("}");

      if (
        start === -1 ||
        end <= start
      ) {
        throw new Error(
          "AI response was not valid JSON"
        );
      }

      try {
        return JSON.parse(
          cleaned.slice(
            start,
            end + 1
          )
        );
      } catch {
        throw new Error(
          `AI response contained invalid JSON: ${cleaned.slice(
            0,
            1000
          )}`
        );
      }
    }
  }
}
