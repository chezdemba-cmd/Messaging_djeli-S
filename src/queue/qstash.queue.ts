import { MessageQueue } from "./queue.interface";

/**
 * File d'attente Serverless de production utilisant Upstash QStash.
 * Idéal pour Vercel (permet des retries fiables et des webhooks différés sans bloquer les lambdas).
 */
export class QStashQueue implements MessageQueue {
  private token: string;
  private targetUrl: string;

  constructor(token?: string, targetUrl?: string) {
    this.token = token || process.env.QSTASH_TOKEN || "";
    this.targetUrl =
      targetUrl ||
      process.env.QSTASH_TARGET_URL ||
      `${process.env.NEXT_PUBLIC_APP_URL || "https://messaging.djelis.com"}/api/v1/internal/queue/process`;
  }

  public async enqueue(messageId: string, delaySeconds: number = 0): Promise<void> {
    if (!this.token) {
      console.warn("[QStashQueue] QSTASH_TOKEN absent, message ignoré par la file de production.");
      return;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Upstash-Retries": "3",
    };

    if (delaySeconds > 0) {
      headers["Upstash-Delay"] = `${delaySeconds}s`;
    }

    // Ajout d'une signature interne si configurée
    if (process.env.INTERNAL_WORKER_SECRET) {
      headers["x-worker-secret"] = process.env.INTERNAL_WORKER_SECRET;
    }

    const res = await fetch(`https://qstash.upstash.io/v2/publish/${this.targetUrl}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messageId }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`[QStashQueue] Échec de publication dans QStash (HTTP ${res.status}): ${errorText}`);
    }
  }
}
