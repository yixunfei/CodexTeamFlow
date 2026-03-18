import OpenAI from "openai";
import type { RuntimeStageContext, RuntimeBackend, StageName } from "../types.js";

export interface StageNarrator {
  readonly backend: RuntimeBackend;
  generate(stage: StageName, context: RuntimeStageContext): Promise<string | undefined>;
}

export class NoopNarrator implements StageNarrator {
  public readonly backend: RuntimeBackend = "local";

  async generate(): Promise<string | undefined> {
    return undefined;
  }
}

export class OpenAiResponsesNarrator implements StageNarrator {
  public readonly backend: RuntimeBackend = "openai-assisted";
  private readonly client: OpenAI;

  constructor(private readonly model: string) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generate(stage: StageName, context: RuntimeStageContext): Promise<string | undefined> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          `You are the ${stage} specialist inside a Codex + MCP Agent Team.`,
          "Return a concise engineering note with at most 6 bullets.",
          `Goal: ${context.goal}`,
          context.constraints.length
            ? `Constraints: ${context.constraints.join("; ")}`
            : "Constraints: none provided",
          context.plan ? `Known plan: ${context.plan.steps.join(" | ")}` : "Known plan: not started",
          context.implementation
            ? `Implementation summary: ${context.implementation.summary}`
            : "Implementation summary: not started",
          context.review
            ? `Review recommendations: ${context.review.recommendations.join(" | ")}`
            : "Review recommendations: not started",
        ].join("\n\n"),
      });

      return extractResponseText(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[agent-team] OpenAI narration failed during ${stage}: ${message}`);
      return undefined;
    }
  }
}

function extractResponseText(response: unknown): string | undefined {
  if (
    typeof response === "object" &&
    response !== null &&
    "output_text" in response &&
    typeof response.output_text === "string" &&
    response.output_text.trim()
  ) {
    return response.output_text.trim();
  }

  if (typeof response === "object" && response !== null && "output" in response) {
    const output = (response as { output?: unknown[] }).output;

    if (Array.isArray(output)) {
      const texts = output
        .flatMap((item) => {
          if (
            typeof item === "object" &&
            item !== null &&
            "content" in item &&
            Array.isArray((item as { content?: unknown[] }).content)
          ) {
            return (item as { content: unknown[] }).content;
          }

          return [];
        })
        .flatMap((part) => {
          if (
            typeof part === "object" &&
            part !== null &&
            "text" in part &&
            typeof part.text === "string"
          ) {
            return [part.text];
          }

          return [];
        });

      if (texts.length) {
        return texts.join("\n").trim();
      }
    }
  }

  return undefined;
}
