/**
 * Coding Plan 提供商特定实现
 * 智谱 AI 和 Kimi 的额度查询服务
 */

import { QuotaService } from './QuotaService';
import type { KimiQuotaResponse, ProviderQuota, QuotaLimit, TimeWindowUnit,ZhipuQuotaResponse } from './types';

// ============================================================================
// 智谱 AI 服务
// ============================================================================

export class ZhipuQuotaService {
  private service: QuotaService;

  constructor(getApiKey: () => Promise<string | null>) {
    this.service = new QuotaService({
      provider: 'zhipu',
      endpoint: 'https://bigmodel.cn/api/monitor/usage/quota/limit',
      getApiKey,
      parser: this.parseResponse.bind(this),
      cacheDuration: 5 * 60 * 1000,
    });
  }

  async getQuota(forceRefresh?: boolean): Promise<ProviderQuota | null> {
    return this.service.getQuota(forceRefresh);
  }

  clearCache(): void {
    this.service.clearCache();
  }

  private parseResponse(response: unknown): ProviderQuota {
    const zhipuResponse = response as ZhipuQuotaResponse;

    const limits: QuotaLimit[] = zhipuResponse.data.limits.map((item) => ({
      type: item.type,
      window: this.parseWindow(item.unit, item.number),
      total: item.usage,
      used: item.currentValue,
      remaining: item.remaining,
      percentage: item.percentage,
      resetTime: item.nextResetTime ? new Date(item.nextResetTime).toISOString() : undefined,
    }));

    return {
      provider: 'zhipu',
      name: '智谱AI',
      limits,
      updatedAt: Date.now(),
    };
  }

  private parseWindow(unit: number, number: number): { unit: TimeWindowUnit; duration: number } {
    // unit: 1=天, 3=小时, 5=分钟
    const unitMap: Record<number, TimeWindowUnit> = {
      1: 'day',
      3: 'hour',
      5: 'minute',
    };
    return { unit: unitMap[unit] ?? 'hour', duration: number };
  }
}

// ============================================================================
// Kimi 服务
// ============================================================================

export class KimiQuotaService {
  private service: QuotaService;

  constructor(getApiKey: () => Promise<string | null>) {
    this.service = new QuotaService({
      provider: 'kimi',
      endpoint: 'https://api.kimi.com/coding/v1/usages',
      getApiKey,
      parser: this.parseResponse.bind(this),
      cacheDuration: 5 * 60 * 1000,
    });
  }

  async getQuota(forceRefresh?: boolean): Promise<ProviderQuota | null> {
    return this.service.getQuota(forceRefresh);
  }

  clearCache(): void {
    this.service.clearCache();
  }

  private parseResponse(response: unknown): ProviderQuota {
    const kimiResponse = response as KimiQuotaResponse;
    const limits: QuotaLimit[] = [];

    // 主额度
    if (kimiResponse.usage) {
      limits.push({
        type: 'TOKENS_LIMIT',
        window: { unit: 'day', duration: 7 }, // 默认每周
        total: this.parseNumber(kimiResponse.usage.limit),
        used: this.parseNumber(kimiResponse.usage.used),
        remaining: this.parseNumber(kimiResponse.usage.remaining),
        percentage: this.calcPercentage(kimiResponse.usage.used, kimiResponse.usage.limit),
        resetTime: kimiResponse.usage.resetTime,
      });
    }

    // 窗口限制
    if (kimiResponse.limits) {
      for (const item of kimiResponse.limits) {
        limits.push({
          type: 'TOKENS_LIMIT',
          window: {
            unit: this.translateTimeUnit(item.window.timeUnit),
            duration: item.window.duration,
          },
          total: this.parseNumber(item.detail.limit),
          used: this.parseNumber(item.detail.used),
          remaining: this.parseNumber(item.detail.remaining),
          percentage: this.calcPercentage(item.detail.used, item.detail.limit),
          resetTime: item.detail.resetTime,
        });
      }
    }

    return {
      provider: 'kimi',
      name: 'Kimi',
      limits,
      updatedAt: Date.now(),
    };
  }

  private parseNumber(value: string | number | undefined): number | undefined {
    if (value === undefined) return undefined;
    return typeof value === 'string' ? parseInt(value, 10) : value;
  }

  private calcPercentage(used: string | number | undefined, total: string | number | undefined): number {
    const u = this.parseNumber(used) ?? 0;
    const t = this.parseNumber(total) ?? 100;
    if (t <= 0) return 0;
    return Math.min(100, Math.round((u / t) * 100));
  }

  private translateTimeUnit(timeUnit: string): TimeWindowUnit {
    const map: Record<string, TimeWindowUnit> = {
      'TIME_UNIT_DAY': 'day',
      'TIME_UNIT_HOUR': 'hour',
      'TIME_UNIT_MINUTE': 'minute',
    };
    return map[timeUnit] ?? 'hour';
  }
}
