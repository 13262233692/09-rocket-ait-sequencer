import { Logger } from '@nestjs/common';

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];
  private readonly logger: Logger;
  private readonly name: string;
  private currentHolder?: string;
  private lockedAt?: number;

  constructor(name: string) {
    this.name = name;
    this.logger = new Logger(`Mutex-${name}`);
  }

  async lock(timeoutMs = 30000, holderId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.locked) {
        this.acquire(holderId);
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        const idx = this.queue.indexOf(resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          const holderInfo = this.currentHolder
            ? `当前持有者: ${this.currentHolder}, 持有时间: ${Date.now() - (this.lockedAt || 0)}ms`
            : '未知';
          this.logger.error(
            `[${this.name}] 获取互斥锁超时 (${timeoutMs}ms)。${holderInfo}`,
          );
          reject(
            new Error(
              `获取互斥锁超时 (${timeoutMs}ms)。${holderInfo}`,
            ),
          );
        }
      }, timeoutMs);

      const originalResolve = () => {
        clearTimeout(timeout);
        this.acquire(holderId);
        resolve();
      };
      this.queue.push(originalResolve);

      this.logger.debug(
        `[${this.name}] 锁被占用，已入队等待。队列深度: ${this.queue.length}, 持有者: ${this.currentHolder || 'unknown'}`,
      );
    });
  }

  unlock(): void {
    if (!this.locked) {
      this.logger.warn(`[${this.name}] 尝试释放未持有的锁`);
      return;
    }

    this.release();

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }

  private acquire(holderId?: string): void {
    this.locked = true;
    this.currentHolder = holderId;
    this.lockedAt = Date.now();
    this.logger.debug(
      `[${this.name}] 锁已获取${holderId ? `，持有者: ${holderId}` : ''}`,
    );
  }

  private release(): void {
    const heldFor = this.lockedAt ? Date.now() - this.lockedAt : 0;
    this.locked = false;
    this.currentHolder = undefined;
    this.lockedAt = undefined;
    this.logger.debug(`[${this.name}] 锁已释放，持有时间: ${heldFor}ms`);
  }

  tryLock(): boolean {
    if (this.locked) return false;
    this.acquire();
    return true;
  }

  isLocked(): boolean {
    return this.locked;
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  async runExclusive<T>(
    fn: () => Promise<T>,
    timeoutMs?: number,
    holderId?: string,
  ): Promise<T> {
    await this.lock(timeoutMs, holderId);
    try {
      return await fn();
    } finally {
      this.unlock();
    }
  }
}

export class MutexPool {
  private static mutexes = new Map<string, Mutex>();

  static get(key: string): Mutex {
    if (!this.mutexes.has(key)) {
      this.mutexes.set(key, new Mutex(key));
    }
    return this.mutexes.get(key)!;
  }

  static remove(key: string): void {
    const mutex = this.mutexes.get(key);
    if (mutex && mutex.isLocked()) {
      console.warn(`[MutexPool] 移除仍被锁定的互斥锁: ${key}`);
    }
    this.mutexes.delete(key);
  }
}
