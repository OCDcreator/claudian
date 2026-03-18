/**
 * Coding Plan 额度查询服务
 * 通用额度查询逻辑，支持多提供商
 */

import { requestUrl } from 'obsidian';

import type { ProviderQuota, QuotaServiceConfig } from './types';

const DEFAULT_CACHE_DURATION = 5 * 60 * 1000; // 5分钟

export class QuotaService {
  private cache: Map<string, ProviderQuota> = new Map();
  private config: QuotaServiceConfig;

  constructor(config: QuotaServiceConfig) {
    this.config = {
      cacheDuration: DEFAULT_CACHE_DURATION,
      ...config,
    };
  }

  /**
   * 获取额度（优先读缓存）
   */
  async getQuota(forceRefresh = false): Promise<ProviderQuota | null> {
    const cacheKey = this.config.provider;

    // 1. 检查缓存
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }
    }

    // 2. 调用 API
    return await this.fetchQuota();
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(quota: ProviderQuota): boolean {
    const now = Date.now();
    const cacheAge = now - quota.updatedAt;

    // 检查是否超过固定缓存时间
    if (cacheAge < (this.config.cacheDuration ?? DEFAULT_CACHE_DURATION)) {
      return true;
    }

    // 检查是否接近重置时间（提前刷新）
    for (const limit of quota.limits) {
      if (limit.resetTime) {
        const resetTime = new Date(limit.resetTime).getTime();
        // 如果已经过了重置时间，缓存无效
        if (resetTime <= now) {
          return false;
        }
      }
    }

    return false;
  }

  /**
   * 调用 API 获取额度
   */
  private async fetchQuota(): Promise<ProviderQuota | null> {
    try {
      const apiKey = await this.config.getApiKey();
      if (!apiKey) {
        // API Key 未配置，静默返回 null，不打扰用户
        return null;
      }

      const response = await requestUrl({
        url: this.config.endpoint,
        method: 'GET',
        headers: {
          'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = response.json;
      const quota = this.config.parser(data);

      // 更新缓存
      this.cache.set(this.config.provider, quota);

      return quota;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.config.provider}] 额度查询失败:`, errorMessage);
      // 开发调试：输出更多错误详情
      if (error instanceof Error && error.stack) {
        console.error(`[${this.config.provider}] 错误堆栈:`, error.stack);
      }
      // 静默失败，只在控制台记录，不弹出 Notice 避免打扰
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.delete(this.config.provider);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
