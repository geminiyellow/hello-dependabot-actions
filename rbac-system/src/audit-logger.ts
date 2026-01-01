/**
 * 审计日志记录器
 */

import { AuditLog } from './types';

export class AuditLogger {
  private enabled: boolean;
  private logs: AuditLog[] = [];
  private maxLogs: number = 10000;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * 记录审计日志
   */
  async log(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    if (!this.enabled) return;

    const log: AuditLog = {
      id: this.generateId(),
      ...entry,
      createdAt: new Date(),
    };

    // 在实际应用中，这里应该将日志写入数据库或日志服务
    this.logs.push(log);

    // 限制内存中的日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 控制台输出（开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUDIT]', {
        action: log.action,
        userId: log.userId,
        resourceId: log.resourceId,
        result: log.result,
        reason: log.reason,
      });
    }
  }

  /**
   * 查询审计日志
   */
  async query(filters?: {
    userId?: string;
    resourceId?: string;
    action?: string;
    result?: 'success' | 'denied' | 'error';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLog[]> {
    let results = [...this.logs];

    if (filters) {
      if (filters.userId) {
        results = results.filter(log => log.userId === filters.userId);
      }
      if (filters.resourceId) {
        results = results.filter(log => log.resourceId === filters.resourceId);
      }
      if (filters.action) {
        results = results.filter(log => log.action === filters.action);
      }
      if (filters.result) {
        results = results.filter(log => log.result === filters.result);
      }
      if (filters.startDate) {
        results = results.filter(log => log.createdAt >= filters.startDate!);
      }
      if (filters.endDate) {
        results = results.filter(log => log.createdAt <= filters.endDate!);
      }

      if (filters.limit) {
        results = results.slice(0, filters.limit);
      }
    }

    return results;
  }

  /**
   * 生成统计报告
   */
  async generateReport(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    byAction: Record<string, number>;
    byResult: Record<string, number>;
    byUser: Record<string, number>;
  }> {
    const logs = await this.query(filters);

    const byAction: Record<string, number> = {};
    const byResult: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byResult[log.result] = (byResult[log.result] || 0) + 1;
      byUser[log.userId] = (byUser[log.userId] || 0) + 1;
    }

    return {
      total: logs.length,
      byAction,
      byResult,
      byUser,
    };
  }

  /**
   * 清除日志
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
