// ABOUTME: Unit tests for model cost calculation from token usage.
// ABOUTME: Verifies per-model rates, unknown-model handling, and missing token fields.

import { describe, it, expect } from "vitest";
import { calculateCost } from "./pricing.js";
import type { UsageMetrics } from "./types.js";

const oneMillionEach: UsageMetrics = {
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  cache_read_input_tokens: 1_000_000,
  cache_creation: {
    ephemeral_5m_input_tokens: 1_000_000,
    ephemeral_1h_input_tokens: 1_000_000,
  },
};

describe("calculateCost", () => {
  it("computes the full breakdown for claude-opus-4-7", () => {
    const cost = calculateCost("claude-opus-4-7", oneMillionEach);

    expect(cost).toEqual({
      inputCost: 5.0,
      outputCost: 25.0,
      cacheWrite5mCost: 6.25,
      cacheWrite1hCost: 10.0,
      cacheReadCost: 0.5,
      totalCost: 46.75,
    });
  });

  it("computes the full breakdown for claude-sonnet-4-6", () => {
    const cost = calculateCost("claude-sonnet-4-6", oneMillionEach);

    expect(cost).toEqual({
      inputCost: 3.0,
      outputCost: 15.0,
      cacheWrite5mCost: 3.75,
      cacheWrite1hCost: 6.0,
      cacheReadCost: 0.3,
      totalCost: 28.05,
    });
  });

  it("returns null for an unknown model", () => {
    expect(calculateCost("gpt-5", oneMillionEach)).toBeNull();
  });

  it("treats null and missing token fields as zero", () => {
    const usage: UsageMetrics = {
      input_tokens: null,
      output_tokens: 500_000,
    };

    const cost = calculateCost("claude-opus-4-7", usage);

    expect(cost).toEqual({
      inputCost: 0,
      outputCost: 12.5,
      cacheWrite5mCost: 0,
      cacheWrite1hCost: 0,
      cacheReadCost: 0,
      totalCost: 12.5,
    });
  });
});
