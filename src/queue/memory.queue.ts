import { MessageQueue } from "./queue.interface";

export type QueueHandler = (messageId: string) => Promise<void>;

/**
 * File d'attente en mémoire pour le développement local et les tests.
 * Permet un traitement différé non bloquant avec temporisation.
 */
export class MemoryQueue implements MessageQueue {
  private queue: string[] = [];
  private handler?: QueueHandler;

  constructor(handler?: QueueHandler) {
    this.handler = handler;
  }

  public setHandler(handler: QueueHandler): void {
    this.handler = handler;
  }

  public async enqueue(messageId: string, delaySeconds: number = 0): Promise<void> {
    this.queue.push(messageId);

    if (this.handler) {
      if (delaySeconds > 0) {
        setTimeout(async () => {
          try {
            await this.handler!(messageId);
          } catch (err) {
            console.error(`[MemoryQueue] Erreur de traitement pour le message ${messageId}:`, err);
          }
        }, delaySeconds * 1000);
      } else {
        // Exécution asynchrone non-bloquante via process.nextTick / setImmediate
        queueMicrotask(async () => {
          try {
            await this.handler!(messageId);
          } catch (err) {
            console.error(`[MemoryQueue] Erreur de traitement pour le message ${messageId}:`, err);
          }
        });
      }
    }
  }

  public getPendingCount(): number {
    return this.queue.length;
  }
}
