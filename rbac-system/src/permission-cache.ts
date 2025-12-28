/**
 * 权限缓存
 */

import { PermissionBits, CacheEntry } from './types';

export class PermissionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number;

  constructor(ttl: number = 300000) { // 默认5分钟
    this.ttl = ttl;

    // 定期清理过期缓存
    setInterval(() => this.cleanup(), this.ttl);
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(userId: string, resourceId: string): string {
    return `${userId}:${resourceId}`;
  }

  /**
   * 获取缓存
   */
  get(userId: string, resourceId: string): PermissionBits | null {
    const key = this.getCacheKey(userId, resourceId);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.permission;
  }

  /**
   * 设置缓存
   */
  set(userId: string, resourceId: string, permission: PermissionBits): void {
    const key = this.getCacheKey(userId, resourceId);
    this.cache.set(key, {
      permission,
      expiresAt: Date.now() + this.ttl,
    });
  }

  /**
   * 清除缓存
   */
  invalidate(userId?: string, resourceId?: string): void {
    if (userId && resourceId) {
      // 清除特定缓存
      this.cache.delete(this.getCacheKey(userId, resourceId));
    } else if (userId) {
      // 清除用户的所有缓存
      const prefix = userId + ':';
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else if (resourceId) {
      // 清除资源的所有缓存
      const suffix = ':' + resourceId;
      for (const key of this.cache.keys()) {
        if (key.endsWith(suffix)) {
          this.cache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.cache.clear();
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      ttl: this.ttl,
    };
  }
}
