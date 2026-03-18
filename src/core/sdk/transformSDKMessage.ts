import type { SDKMessage, SDKResultError } from '@anthropic-ai/claude-agent-sdk';

import type { SDKToolUseResult, UsageInfo } from '../types';
import { getContextWindowSize } from '../types';
import { isBlockedMessage } from '../types/sdk';
import { extractToolResultContent } from './toolResultContent';
import type { TransformEvent } from './types';

export interface TransformOptions {
  /** The intended model from settings/query (used for context window size). */
  intendedModel?: string;
  /** Custom context limits from settings (model ID → tokens). */
  customContextLimits?: Record<string, number>;
}

interface MessageUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ContextWindowEntry {
  model: string;
  contextWindow: number;
}

function isResultError(message: { type: 'result'; subtype: string }): message is SDKResultError {
  return !!message.subtype && message.subtype !== 'success';
}

function getBuiltInModelSignature(model: string): { family: 'haiku' | 'sonnet' | 'opus'; is1M: boolean } | null {
  const normalized = model.trim().toLowerCase();
  if (normalized === 'haiku') {
    return { family: 'haiku', is1M: false };
  }
  if (normalized === 'sonnet' || normalized === 'sonnet[1m]') {
    return { family: 'sonnet', is1M: normalized.endsWith('[1m]') };
  }
  if (normalized === 'opus' || normalized === 'opus[1m]') {
    return { family: 'opus', is1M: normalized.endsWith('[1m]') };
  }
  return null;
}

function getModelUsageSignature(model: string): { family: 'haiku' | 'sonnet' | 'opus'; is1M: boolean } | null {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes('haiku')) {
    return { family: 'haiku', is1M: false };
  }
  if (normalized.includes('sonnet')) {
    return { family: 'sonnet', is1M: normalized.endsWith('[1m]') };
  }
  if (normalized.includes('opus')) {
    return { family: 'opus', is1M: normalized.endsWith('[1m]') };
  }
  return null;
}

function selectContextWindowEntry(
  modelUsage: Record<string, { contextWindow?: number }>,
  intendedModel?: string
): ContextWindowEntry | null {
  const entries: ContextWindowEntry[] = Object.entries(modelUsage)
    .flatMap(([model, usage]) =>
      typeof usage?.contextWindow === 'number' && usage.contextWindow > 0
        ? [{ model, contextWindow: usage.contextWindow }]
        : []
    );

  if (entries.length === 0) {
    return null;
  }

  if (entries.length === 1) {
    return entries[0];
  }

  if (!intendedModel) {
    return null;
  }

  const exactMatches = entries.filter((entry) => entry.model === intendedModel);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const intendedSignature = getBuiltInModelSignature(intendedModel);
  if (!intendedSignature) {
    return null;
  }

  const signatureMatches = entries.filter((entry) => {
    const entrySignature = getModelUsageSignature(entry.model);
    return entrySignature?.family === intendedSignature.family && entrySignature.is1M === intendedSignature.is1M;
  });

  return signatureMatches.length === 1 ? signatureMatches[0] : null;
}

/**
 * Transform SDK message to StreamChunk format.
 * One SDK message can yield multiple chunks (e.g., text + tool_use blocks).
 */
export function* transformSDKMessage(
  message: SDKMessage,
  options?: TransformOptions
): Generator<TransformEvent> {
  switch (message.type) {
    case 'system':
      if (message.subtype === 'init' && message.session_id) {
        yield {
          type: 'session_init',
          sessionId: message.session_id,
          agents: message.agents,
          permissionMode: message.permissionMode,
        };
      } else if (message.subtype === 'compact_boundary') {
        yield { type: 'compact_boundary' };
      }
      break;

    case 'assistant': {
      const parentToolUseId = message.parent_tool_use_id ?? null;

      // Errors on assistant messages (e.g. rate_limit, billing_error)
      if (message.error) {
        yield { type: 'error', content: message.error };
      }

      if (message.message?.content && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === 'thinking' && block.thinking) {
            yield { type: 'thinking', content: block.thinking, parentToolUseId };
          } else if (block.type === 'text' && block.text && block.text.trim() !== '(no content)') {
            yield { type: 'text', content: block.text, parentToolUseId };
          } else if (block.type === 'tool_use') {
            yield {
              type: 'tool_use',
              id: block.id || `tool-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              name: block.name || 'unknown',
              input: block.input || {},
              parentToolUseId,
            };
          }
        }
      }

      // Extract usage from main agent assistant messages only (not subagent)
      // This gives accurate per-turn context usage without subagent token pollution
      const usage = (message.message as { usage?: MessageUsage } | undefined)?.usage;
      const topLevelUsage = (message as { usage?: MessageUsage }).usage;
      if (parentToolUseId === null && (usage || topLevelUsage)) {
        const activeUsage = topLevelUsage ?? usage!;
        const inputTokens = activeUsage.input_tokens ?? 0;
        const cacheCreationInputTokens = activeUsage.cache_creation_input_tokens ?? 0;
        const cacheReadInputTokens = activeUsage.cache_read_input_tokens ?? 0;

        // 智谱 GLM: 顶层 usage 存在，input_tokens 不含缓存
        // 原生 Anthropic: 只有 message.usage，input_tokens 已含缓存
        const isZhipu = topLevelUsage != null;
        const contextTokens = isZhipu
          ? inputTokens + cacheReadInputTokens
          : inputTokens + cacheCreationInputTokens + cacheReadInputTokens;

        const model = options?.intendedModel ?? 'sonnet';
        const contextWindow = getContextWindowSize(model, options?.customContextLimits);
        const percentage = Math.min(100, Math.max(0, Math.round((contextTokens / contextWindow) * 100)));

        const usageInfo: UsageInfo = {
          model,
          inputTokens,
          cacheCreationInputTokens,
          cacheReadInputTokens,
          contextWindow,
          contextTokens,
          percentage,
        };
        yield { type: 'usage', usage: usageInfo };
      }
      break;
    }

    case 'user': {
      const parentToolUseId = message.parent_tool_use_id ?? null;

      // Check for blocked tool calls (from hook denials)
      if (isBlockedMessage(message)) {
        yield {
          type: 'blocked',
          content: message._blockReason,
        };
        break;
      }
      // User messages can contain tool results
      if (message.tool_use_result !== undefined && message.parent_tool_use_id) {
        yield {
          type: 'tool_result',
          id: message.parent_tool_use_id,
          content: extractToolResultContent(message.tool_use_result, { fallbackIndent: 2 }),
          isError: false,
          parentToolUseId,
          toolUseResult: (message.tool_use_result ?? undefined) as SDKToolUseResult | undefined,
        };
      }
      // Also check message.message.content for tool_result blocks
      if (message.message?.content && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') {
            yield {
              type: 'tool_result',
              id: block.tool_use_id || message.parent_tool_use_id || '',
              content: extractToolResultContent(block.content, { fallbackIndent: 2 }),
              isError: block.is_error || false,
              parentToolUseId,
              toolUseResult: (message.tool_use_result ?? undefined) as SDKToolUseResult | undefined,
            };
          }
        }
      }
      break;
    }

    case 'stream_event': {
      const parentToolUseId = message.parent_tool_use_id ?? null;
      const event = message.event;

      // Handle message_delta usage (智谱 GLM returns real usage here)
      if (event?.type === 'message_delta' && (event as { usage?: MessageUsage }).usage) {
        const eventUsage = (event as { usage?: MessageUsage }).usage!;
        const inputTokens = eventUsage.input_tokens ?? 0;
        const cacheCreationInputTokens = eventUsage.cache_creation_input_tokens ?? 0;
        const cacheReadInputTokens = eventUsage.cache_read_input_tokens ?? 0;
        // 智谱 GLM: input_tokens 不含缓存，需要加上 cache_read_input_tokens
        const contextTokens = inputTokens + cacheReadInputTokens;

        const model = options?.intendedModel ?? 'sonnet';
        const contextWindow = getContextWindowSize(model, options?.customContextLimits);
        const percentage = Math.min(100, Math.max(0, Math.round((contextTokens / contextWindow) * 100)));

        const usageInfo: UsageInfo = {
          model,
          inputTokens,
          outputTokens: 0,
          cacheCreationInputTokens,
          cacheReadInputTokens,
          contextWindow,
          contextTokens,
          percentage,
        };
        yield { type: 'usage', usage: usageInfo };
      }

      if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        yield {
          type: 'tool_use',
          id: event.content_block.id || `tool-${Date.now()}`,
          name: event.content_block.name || 'unknown',
          input: event.content_block.input || {},
          parentToolUseId,
        };
      } else if (event?.type === 'content_block_start' && event.content_block?.type === 'thinking') {
        if (event.content_block.thinking) {
          yield { type: 'thinking', content: event.content_block.thinking, parentToolUseId };
        }
      } else if (event?.type === 'content_block_start' && event.content_block?.type === 'text') {
        if (event.content_block.text) {
          yield { type: 'text', content: event.content_block.text, parentToolUseId };
        }
      } else if (event?.type === 'content_block_delta') {
        if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
          yield { type: 'thinking', content: event.delta.thinking, parentToolUseId };
        } else if (event.delta?.type === 'text_delta' && event.delta.text) {
          yield { type: 'text', content: event.delta.text, parentToolUseId };
        }
      }
      break;
    }

    case 'result': {
      if (isResultError(message)) {
        const content = message.errors.filter((e) => e.trim().length > 0).join('\n');
        yield {
          type: 'error',
          content: content || `Result error: ${message.subtype}`,
        };
      }

      // Extract usage from result message only for 智谱 GLM (returns final usage here)
      // For native Anthropic, usage is already extracted from assistant messages
      const resultMessage = message as { usage?: MessageUsage & { output_tokens?: number }; modelUsage?: Record<string, unknown> };
      
      // Detect 智谱 format: modelUsage keys don't start with "claude"
      const modelUsageKeys = resultMessage.modelUsage ? Object.keys(resultMessage.modelUsage) : [];
      const isZhipuFormat = modelUsageKeys.length > 0 && modelUsageKeys.some((k) => !k.startsWith('claude'));
      
      // Only extract usage if:
      // 1. It's 智谱 format (non-claude models in modelUsage)
      // 2. result.usage exists and has actual token values (not all zeros)
      if (isZhipuFormat && resultMessage.usage) {
        const resultUsage = resultMessage.usage;
        const inputTokens = resultUsage.input_tokens ?? 0;
        const outputTokens = resultUsage.output_tokens ?? 0;
        const cacheCreationInputTokens = resultUsage.cache_creation_input_tokens ?? 0;
        const cacheReadInputTokens = resultUsage.cache_read_input_tokens ?? 0;

        // Only yield usage if there are actual token values
        if (inputTokens > 0 || outputTokens > 0 || cacheCreationInputTokens > 0 || cacheReadInputTokens > 0) {
          const model = options?.intendedModel;
          const contextWindow = model ? getContextWindowSize(model, options?.customContextLimits) : 200000;

          // 智谱 GLM: input_tokens 不含缓存，需要加上 cache_read_input_tokens
          const contextTokens = inputTokens + cacheReadInputTokens;

          const percentage = Math.min(100, Math.max(0, Math.round((contextTokens / contextWindow) * 100)));

          const usageInfo: UsageInfo = {
            model: model ?? 'sonnet',
            inputTokens,
            outputTokens,
            cacheCreationInputTokens,
            cacheReadInputTokens,
            contextWindow,
            contextTokens,
            percentage,
          };
          yield { type: 'usage', usage: usageInfo };
        }
      }

      if ('modelUsage' in message && message.modelUsage) {
        const modelUsage = message.modelUsage as Record<string, { contextWindow?: number }>;
        const selectedEntry = selectContextWindowEntry(modelUsage, options?.intendedModel);
        if (selectedEntry) {
          yield { type: 'context_window_update', contextWindow: selectedEntry.contextWindow };
        }
      }
      break;
    }

    default:
      break;
  }
}
