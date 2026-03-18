/**
 * Coding Plan 额度状态栏组件
 * 显示在 Obsidian 底部状态栏
 */

import type { Plugin } from 'obsidian';

import type { ProviderQuota, QuotaLimit } from '../../core/quota';
import { KimiQuotaService, ZhipuQuotaService } from '../../core/quota';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟自动刷新

export interface QuotaStatusBarConfig {
  /** 获取智谱 API Key */
  getZhipuApiKey: () => Promise<string | null>;
  /** 获取 Kimi API Key */
  getKimiApiKey: () => Promise<string | null>;
  /** 是否启用智谱 */
  isZhipuEnabled: () => boolean;
  /** 是否启用 Kimi */
  isKimiEnabled: () => boolean;
}

/**
 * 提供商状态栏项
 */
interface ProviderStatusItem {
  provider: 'zhipu' | 'kimi';
  quota: ProviderQuota;
  element: HTMLElement;
}

export class QuotaStatusBar {
  private containerEl: HTMLElement | null = null;
  private plugin: Plugin;
  private config: QuotaStatusBarConfig;
  private zhipuService: ZhipuQuotaService;
  private kimiService: KimiQuotaService;
  private intervalId: number | null = null;
  private providerItems: Map<string, ProviderStatusItem> = new Map();

  constructor(plugin: Plugin, config: QuotaStatusBarConfig) {
    this.plugin = plugin;
    this.config = config;

    // 创建 StatusBar 容器
    this.containerEl = plugin.addStatusBarItem();
    this.containerEl.addClass('claudian-quota-status-bar');

    // 初始化服务
    this.zhipuService = new ZhipuQuotaService(config.getZhipuApiKey);
    this.kimiService = new KimiQuotaService(config.getKimiApiKey);

    // 初始刷新
    void this.refreshAll();
  }

  /**
   * 启动自动刷新
   */
  startAutoRefresh(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.intervalId = window.setInterval(() => {
      void this.refreshAll();
    }, REFRESH_INTERVAL);
    this.plugin.registerInterval(this.intervalId);
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 刷新所有额度数据
   */
  async refreshAll(forceRefresh = false): Promise<void> {
    const promises: Promise<ProviderQuota | null>[] = [];

    if (this.config.isZhipuEnabled()) {
      promises.push(this.zhipuService.getQuota(forceRefresh));
    } else {
      promises.push(Promise.resolve(null));
    }

    if (this.config.isKimiEnabled()) {
      promises.push(this.kimiService.getQuota(forceRefresh));
    } else {
      promises.push(Promise.resolve(null));
    }

    const [zhipuQuota, kimiQuota] = await Promise.all(promises);

    this.updateDisplay(zhipuQuota, kimiQuota);
  }

  /**
   * 获取每5小时限制的百分比（用于状态栏显示）
   */
  private getDisplayPercentage(quota: ProviderQuota): number | null {
    // 找到每5小时的限制
    const hourly5Limit = quota.limits.find(
      (l) => l.window.unit === 'hour' && l.window.duration === 5
    );
    if (hourly5Limit) {
      return 100 - hourly5Limit.percentage;
    }
    // 如果没找到5小时的，找第一个非每月的限制
    const nonMonthlyLimit = quota.limits.find(
      (l) => !(l.window.unit === 'day' && l.window.duration >= 28)
    );
    if (nonMonthlyLimit) {
      return 100 - nonMonthlyLimit.percentage;
    }
    // fallback: 使用第一个限制
    if (quota.limits.length > 0) {
      return 100 - quota.limits[0].percentage;
    }
    return null;
  }

  /**
   * 更新显示 - 分开显示智谱和 Kimi
   */
  private updateDisplay(zhipuQuota: ProviderQuota | null, kimiQuota: ProviderQuota | null): void {
    if (!this.containerEl) return;

    // 如果没有数据，清空并隐藏
    if (!zhipuQuota && !kimiQuota) {
      this.containerEl.empty();
      this.providerItems.clear();
      this.containerEl.style.display = 'none';
      return;
    }

    this.containerEl.style.display = 'flex';

    // 更新或创建智谱项
    if (zhipuQuota) {
      this.updateProviderItem('zhipu', zhipuQuota, '🟢');
    } else {
      this.removeProviderItem('zhipu');
    }

    // 更新或创建 Kimi 项
    if (kimiQuota) {
      this.updateProviderItem('kimi', kimiQuota, '🌙');
    } else {
      this.removeProviderItem('kimi');
    }

    // 更新分隔符
    this.updateSeparators();
  }

  /**
   * 更新单个提供商的状态栏项
   */
  private updateProviderItem(
    provider: 'zhipu' | 'kimi',
    quota: ProviderQuota,
    icon: string
  ): void {
    let item = this.providerItems.get(provider);
    const percentage = this.getDisplayPercentage(quota);

    if (percentage === null) {
      this.removeProviderItem(provider);
      return;
    }

    if (!item) {
      // 创建新元素
      const element = this.containerEl!.createDiv({ cls: 'claudian-quota-provider' });

      // 点击刷新
      element.addEventListener('click', () => {
        void this.refreshAll(true);
      });

      item = { provider, quota, element };
      this.providerItems.set(provider, item);
    } else {
      // 更新配额数据
      item.quota = quota;
    }

    // 更新元素内容
    const element = item.element;
    element.empty();

    // 图标
    const iconEl = element.createSpan({ cls: 'claudian-quota-icon' });
    iconEl.textContent = icon;

    // 百分比
    const percentEl = element.createSpan({ cls: 'claudian-quota-percent' });
    percentEl.textContent = `${percentage}%`;

    // 更新样式
    element.removeClass('claudian-quota-warning', 'claudian-quota-danger');
    if (percentage <= 10) {
      element.addClass('claudian-quota-danger');
    } else if (percentage <= 20) {
      element.addClass('claudian-quota-warning');
    }

    // 设置独立的 tooltip
    element.title = this.buildTooltip(quota, provider === 'zhipu' ? '智谱AI' : 'Kimi');
  }

  /**
   * 移除提供商项
   */
  private removeProviderItem(provider: 'zhipu' | 'kimi'): void {
    const item = this.providerItems.get(provider);
    if (item) {
      item.element.remove();
      this.providerItems.delete(provider);
    }
  }

  /**
   * 更新分隔符
   */
  private updateSeparators(): void {
    if (!this.containerEl) return;

    // 移除所有现有分隔符
    const existingSeparators = this.containerEl.querySelectorAll('.claudian-quota-separator');
    existingSeparators.forEach((el) => el.remove());

    // 获取所有可见的提供商元素
    const providerElements = Array.from(this.providerItems.values())
      .map((item) => item.element)
      .filter((el) => el.parentNode !== null);

    // 在元素之间添加分隔符
    for (let i = 0; i < providerElements.length - 1; i++) {
      const separator = this.containerEl.createSpan({ cls: 'claudian-quota-separator' });
      separator.textContent = '|';
      // 插入到当前元素之后
      providerElements[i].after(separator);
    }
  }

  /**
   * 构建 Tooltip 文本 - 简洁表格格式
   */
  private buildTooltip(quota: ProviderQuota, title: string): string {
    const lines: string[] = [`${title} 额度使用情况`, ''];

    // 表头
    lines.push('限频类型      剩余量      重置时间');
    lines.push('─────────────────────────────────────');

    // 数据行
    quota.limits.forEach((limit) => {
      const typeName = this.formatLimitTypeName(limit, quota.provider);
      const remaining = this.formatRemaining(limit);
      const resetTime = this.formatResetTime(limit.resetTime);

      // 对齐：类型12字符，剩余12字符
      const typePadded = typeName.padEnd(12, ' ');
      const remainingPadded = remaining.padEnd(12, ' ');

      lines.push(`${typePadded} ${remainingPadded} ${resetTime}`);
    });

    lines.push('');
    lines.push('点击可手动刷新');

    return lines.join('\n');
  }

  /**
   * 格式化限频类型名称 - 根据提供商显示不同名称
   */
  private formatLimitTypeName(limit: QuotaLimit, provider: string): string {
    const { unit, duration } = limit.window;

    // 智谱 AI 的特殊命名
    if (provider === 'zhipu') {
      // MCP每月（按天的长期限制）
      if (unit === 'day' && duration >= 28) {
        return 'MCP每月';
      }
      // 每5小时
      if (unit === 'hour' && duration === 5) {
        return '每5小时';
      }
      // 其他短期限制
      if (unit === 'hour') {
        return `每${duration}小时`;
      }
      if (unit === 'minute') {
        return `每${duration}分钟`;
      }
      return '限额';
    }

    // Kimi 的特殊命名
    if (provider === 'kimi') {
      // 每周额度
      if (unit === 'day' && duration === 7) {
        return '每周额度';
      }
      // 每5小时
      if (unit === 'hour' && duration === 5) {
        return '每5小时';
      }
      // 其他
      if (unit === 'hour') {
        return `每${duration}小时`;
      }
      if (unit === 'minute') {
        return `每${duration}分钟`;
      }
      if (unit === 'day') {
        return `每${duration}天`;
      }
    }

    // 默认格式
    const unitMap: Record<string, string> = {
      day: '天',
      hour: '小时',
      minute: '分钟',
    };
    const unitText = unitMap[unit] || unit;
    return `每${duration}${unitText}`;
  }

  /**
   * 格式化剩余量
   */
  private formatRemaining(limit: QuotaLimit): string {
    const remainingPercent = 100 - limit.percentage;

    if (limit.remaining !== undefined && limit.total !== undefined) {
      return `${limit.remaining} (${remainingPercent}%)`;
    }

    return `${remainingPercent}%`;
  }

  /**
   * 格式化重置时间
   */
  private formatResetTime(resetTime: string | undefined): string {
    if (!resetTime) return '-';

    try {
      const date = new Date(resetTime);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${month}-${day} ${hours}:${minutes}`;
    } catch {
      return '-';
    }
  }

  /**
   * 销毁组件
   */
  destroy(): void {
    this.stopAutoRefresh();
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.providerItems.clear();
  }
}
