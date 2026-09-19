import { MessageQueue } from "./queue.interface";
import { MemoryQueue } from "./memory.queue";
import { QStashQueue } from "./qstash.queue";

let globalQueue: MessageQueue | null = null;

export function getMessageQueue(): MessageQueue {
  if (globalQueue) {
    return globalQueue;
  }

  if (process.env.QSTASH_TOKEN) {
    globalQueue = new QStashQueue();
  } else {
    globalQueue = new MemoryQueue();
  }

  return globalQueue;
}

export function setMessageQueue(queue: MessageQueue): void {
  globalQueue = queue;
}
