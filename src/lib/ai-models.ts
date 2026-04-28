// Model metadata + cost estimation helpers.
// Costs sourced from OpenRouter pricing (https://openrouter.ai/models) as of 2026-04.
// OpenRouter returns response.usage.cost when available; this table is the fallback.

export interface ModelMetadata {
  id: string
  inputCostPer1k: number
  outputCostPer1k: number
  contextWindow: number
  capabilities: ('reasoning' | 'coding' | 'fast' | 'cheap' | 'verification' | 'vision')[]
}

export const MODEL_COSTS: Record<string, ModelMetadata> = {
  'anthropic/claude-opus-4-7': {
    id: 'anthropic/claude-opus-4-7',
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    contextWindow: 200_000,
    capabilities: ['reasoning', 'coding', 'verification'],
  },
  'anthropic/claude-sonnet-4.6': {
    id: 'anthropic/claude-sonnet-4.6',
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    contextWindow: 200_000,
    capabilities: ['reasoning', 'coding', 'fast'],
  },
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
    contextWindow: 200_000,
    capabilities: ['fast', 'cheap'],
  },
  'meta-llama/llama-3.3-70b-instruct': {
    id: 'meta-llama/llama-3.3-70b-instruct',
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0001,
    contextWindow: 128_000,
    capabilities: ['cheap', 'fast'],
  },
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    contextWindow: 128_000,
    capabilities: ['reasoning', 'fast', 'vision'],
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    contextWindow: 128_000,
    capabilities: ['cheap', 'fast', 'vision'],
  },
}

const FALLBACK: Omit<ModelMetadata, 'id'> = {
  inputCostPer1k: 0.001,
  outputCostPer1k: 0.005,
  contextWindow: 32_000,
  capabilities: [],
}

export function getModelMeta(modelId: string): ModelMetadata {
  return MODEL_COSTS[modelId] ?? { id: modelId, ...FALLBACK }
}

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const meta = getModelMeta(modelId)
  const cost = (inputTokens / 1000) * meta.inputCostPer1k + (outputTokens / 1000) * meta.outputCostPer1k
  return Number(cost.toFixed(6))
}
