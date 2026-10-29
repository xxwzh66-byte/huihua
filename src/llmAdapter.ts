import { llmChat, looseJson } from "./llm";
import type { PromptProposal, PromptOptimizer } from "./promptOptimizer";
import type { Prompts } from "./promptLibrary";
import { templateById, renderTemplate, skillPrompt } from "./promptTemplates";

/**
 * Turns free-form French/English prose into Danbooru style tag blocks through an
 * OpenAI compatible endpoint. Every block is re-checked by `validateProposals`
 * before it can reach the prompt, so a badly behaved model cannot inject markup.
 */
const SYSTEM = [
  "You convert a scene description into Danbooru style image prompt tags.",
  "Answer with JSON only, shape: {\"blocks\":[{\"title\":\"...\",\"text\":\"...\",\"side\":\"positive\"|\"negative\"}]}",
  "Rules: lowercase english tags, comma separated, no sentences, no numbering.",
  "First block: the subject and what they look like. Then setting, lighting, camera, style.",
  "Add exactly one negative block when the request implies things to avoid.",
  "At most 8 blocks, each under 400 tags-worth of text (<= 1200 characters).",
].join("\n");

export function createAdapter(options: {
  templateId?: string;
  modelName?: string;
} = {}): PromptOptimizer {
  return {
    name: options.modelName || "API",
    async optimize({ description, language, side }, signal) {
      const template = options.templateId ? templateById(options.templateId) : null;
      const system = [SYSTEM, template ? skillPrompt(template, description) : ""]
        .filter(Boolean)
        .join("\n\n");
      const user = [
        `Description (${language}): ${description}`,
        `Target prompt side: ${side}`,
        template
          ? `Use the template structure:\n${renderTemplate(template, {})}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const reply = await Promise.race([
        llmChat(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          true,
        ),
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
      ]);
      if (signal.aborted) throw new Error("aborted");
      const parsed = looseJson(reply.content) as { blocks?: PromptProposal[] };
      if (!Array.isArray(parsed.blocks)) throw new Error("no blocks");
      // Keep only the fields the contract allows; unknown keys are dropped.
      return {
        blocks: parsed.blocks.map((b) => ({
          title: String(b?.title ?? ""),
          text: String(b?.text ?? ""),
          side: (b?.side === "negative" ? "negative" : "positive") as keyof Prompts,
        })),
      };
    },
  };
}
