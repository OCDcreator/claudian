/**
 * 现代化玻璃质感 Tooltip 组件
 */

interface TooltipData {
  title: string;
  limits: Array<{
    type: string;
    remaining: string;
    resetTime: string;
    note?: string;
  }>;
}

export class QuotaTooltip {
  private tooltipEl: HTMLElement | null = null;
  private targetEl: HTMLElement | null = null;
  private hideTimeout: number | null = null;

  constructor() {
    this.createTooltipElement();
  }

  /**
   * 创建 Tooltip DOM 元素
   */
  private createTooltipElement(): void {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.addClass('claudian-quota-tooltip');
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);
  }

  /**
   * 绑定到目标元素
   */
  bind(targetEl: HTMLElement, data: TooltipData): void {
    this.targetEl = targetEl;

    targetEl.addEventListener('mouseenter', () => {
      this.show(data);
    });

    targetEl.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    targetEl.addEventListener('click', () => {
      this.hide();
    });

    // Tooltip 本身也要防止消失
    this.tooltipEl?.addEventListener('mouseenter', () => {
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    });

    this.tooltipEl?.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });
  }

  /**
   * 显示 Tooltip
   */
  private show(data: TooltipData): void {
    if (!this.tooltipEl || !this.targetEl) return;

    // 取消隐藏计划
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // 构建内容
    this.tooltipEl.innerHTML = this.buildContent(data);
    this.tooltipEl.style.display = 'block';

    // 计算位置
    this.positionTooltip();
  }

  /**
   * 隐藏 Tooltip
   */
  private hide(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  }

  /**
   * 计划隐藏（延迟，允许鼠标移入 Tooltip）
   */
  private scheduleHide(): void {
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 100);
  }

  /**
   * 计算并设置 Tooltip 位置
   */
  private positionTooltip(): void {
    if (!this.tooltipEl || !this.targetEl) return;

    const targetRect = this.targetEl.getBoundingClientRect();
    const tooltipRect = this.tooltipEl.getBoundingClientRect();

    // 默认显示在目标元素上方
    let top = targetRect.top - tooltipRect.height - 12;
    let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;

    // 边界检查：上方空间不足则显示在下方
    if (top < 10) {
      top = targetRect.bottom + 12;
    }

    // 边界检查：左侧超出
    if (left < 10) {
      left = 10;
    }

    // 边界检查：右侧超出
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }

    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.style.left = `${left}px`;
  }

  /**
   * 构建 Tooltip 内容 HTML
   */
  private buildContent(data: TooltipData): string {
    const rows = data.limits
      .map(
        (limit) => `
        <tr>
          <td class="claudian-quota-tooltip-type">${limit.type}</td>
          <td class="claudian-quota-tooltip-remaining">${limit.remaining}</td>
          <td class="claudian-quota-tooltip-reset">${limit.resetTime}</td>
        </tr>
        ${limit.note ? `<tr class="claudian-quota-tooltip-note-row"><td colspan="3" class="claudian-quota-tooltip-note">${limit.note}</td></tr>` : ''}
      `
      )
      .join('');

    return `
      <div class="claudian-quota-tooltip-header">
        <span class="claudian-quota-tooltip-title">${data.title}</span>
        <span class="claudian-quota-tooltip-badge">Coding Plan</span>
      </div>
      <div class="claudian-quota-tooltip-body">
        <table class="claudian-quota-tooltip-table">
          <thead>
            <tr>
              <th>限频类型</th>
              <th>剩余量</th>
              <th>重置时间</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div class="claudian-quota-tooltip-footer">
        <span class="claudian-quota-tooltip-hint">点击状态栏可手动刷新</span>
      </div>
    `;
  }

  /**
   * 销毁 Tooltip
   */
  destroy(): void {
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
