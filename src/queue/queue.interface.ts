export interface MessageQueue {
  enqueue(messageId: string, delaySeconds?: number): Promise<void>;
}

export interface QueueJobPayload {
  messageId: string;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
}
