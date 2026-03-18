/**
 * Coding Plan 额度查询类型定义
 * 适配智谱 AI 和 Kimi 的额度 API
 */

/** 额度限制类型 */
export type QuotaLimitType = 'TOKENS_LIMIT' | 'TIME_LIMIT' | 'REQUEST_LIMIT';

/** 时间窗口单位 */
export type TimeWindowUnit = 'day' | 'hour' | 'minute';

/**
 * 额度限制项
 */
export interface QuotaLimit {
  /** 限制类型 */
  type: QuotaLimitType;

  /** 时间窗口配置 */
  window: {
    /** 单位：day | hour | minute */
    unit: TimeWindowUnit;
    /** 时间周期数 */
    duration: number;
  };

  /** 限制总量（可选） */
  total?: number;

  /** 已使用量（可选） */
  used?: number;

  /** 剩余量（优先使用） */
  remaining?: number;

  /** 使用百分比 0-100 */
  percentage: number;

  /** 下次重置时间 ISO 字符串 */
  resetTime?: string;
}

/**
 * 提供商额度数据
 */
export interface ProviderQuota {
  /** 提供商标识 */
  provider: 'zhipu' | 'kimi' | string;

  /** 提供商显示名称 */
  name: string;

  /** 额度限制列表（支持多窗口） */
  limits: QuotaLimit[];

  /** 数据更新时间 */
  updatedAt: number;
}

/**
 * 额度服务配置
 */
export interface QuotaServiceConfig {
  /** 提供商标识 */
  provider: string;
  /** 查询地址 */
  endpoint: string;
  /** 获取 API Key */
  getApiKey: () => Promise<string | null>;
  /** 响应解析器 */
  parser: (response: unknown) => ProviderQuota;
  /** 缓存时间（毫秒），默认 5 分钟 */
  cacheDuration?: number;
}

// ============================================================================
// 智谱 AI 响应类型
// ============================================================================

export interface ZhipuQuotaResponse {
  code: number;
  msg: string;
  data: {
    limits: Array<{
      type: 'TOKENS_LIMIT' | 'TIME_LIMIT';
      unit: number; // 1=天, 3=小时, 5=分钟
      number: number; // 周期数
      usage?: number; // 总配额
      currentValue?: number; // 已使用
      remaining?: number; // 剩余
      percentage: number; // 已使用百分比
      nextResetTime?: number; // 时间戳（毫秒）
      usageDetails?: Array<{
        modelCode: string;
        usage: number;
      }>;
    }>;
  };
  success: boolean;
}

// ============================================================================
// Kimi 响应类型
// ============================================================================

export interface KimiQuotaResponse {
  usage?: {
    limit: number | string;
    used?: number | string;
    remaining?: number | string;
    resetTime: string; // ISO 格式
  };
  limits?: Array<{
    window: {
      duration: number;
      timeUnit: 'TIME_UNIT_HOUR' | 'TIME_UNIT_DAY' | string;
    };
    detail: {
      limit: number | string;
      used?: number | string;
      remaining?: number | string;
      resetTime?: string;
    };
  }>;
  code?: string;
}
