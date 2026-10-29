import { native } from "./api";

export type LlmView = {
  base_url: string;
  model: string;
  temperature: number;
  has_key: boolean;
};

export type LlmReply = { content: string; model: string };

export const llmGet = () => native<LlmView>("llm_get");

export const llmSave = (input: {
  base_url: string;
  model: string;
  api_key?: string;
  temperature?: number;
}) =>
  native<LlmView>("llm_save", {
    baseUrl: input.base_url,
    model: input.model,
    apiKey: input.api_key ?? null,
    temperature: input.temperature ?? 0.7,
  });

export const llmModels = (baseUrl?: string, apiKey?: string) =>
  native<string[]>("llm_models", {
    baseUrl: baseUrl ?? null,
    apiKey: apiKey ?? null,
  });

export const llmChat = (messages: { role: string; content: string }[], json = false) =>
  native<LlmReply>("llm_chat", { messages, jsonMode: json });

/** Strip a ```json fence the model may wrap around its answer. */
export function looseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}

export function llmReady(view: LlmView | null) {
  return Boolean(view && view.base_url && view.model);
}
