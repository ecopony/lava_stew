// ABOUTME: Per-model token pricing and cost calculation for usage reporting.
// ABOUTME: Source: https://docs.anthropic.com/en/docs/about-claude/pricing

import type { UsageMetrics } from "./types.js";

export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

// Per million tokens, in USD
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cacheRead: 0.5,
  },
  "claude-opus-4-5": {
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cacheRead: 0.5,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
  "claude-sonnet-4-5": {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
};

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheWrite5mCost: number;
  cacheWrite1hCost: number;
  cacheReadCost: number;
  totalCost: number;
}

export function calculateCost(
  model: string,
  usage: UsageMetrics
): CostBreakdown | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return null;
  }

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cache5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens || 0;
  const cache1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens || 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheWrite5mCost = (cache5mTokens / 1_000_000) * pricing.cacheWrite5m;
  const cacheWrite1hCost = (cache1hTokens / 1_000_000) * pricing.cacheWrite1h;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead;

  return {
    inputCost,
    outputCost,
    cacheWrite5mCost,
    cacheWrite1hCost,
    cacheReadCost,
    totalCost:
      inputCost +
      outputCost +
      cacheWrite5mCost +
      cacheWrite1hCost +
      cacheReadCost,
  };
}
