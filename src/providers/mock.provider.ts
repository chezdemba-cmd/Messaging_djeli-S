import { SmsProvider, SmsRequest, SmsResult, SmsStatus } from "@/types/sms";

export interface MockProviderOptions {
  name?: string;
  forceStatus?: SmsStatus;
  forceSuccess?: boolean;
  errorCode?: string;
  errorMessage?: string;
  canFailover?: boolean;
  latencyMs?: number;
}

/**
 * MockProvider pour le développement local et la suite de tests Vitest.
 * Permet de simuler tous les scénarios réseau, pannes et rejets sans consommer de crédit.
 */
export class MockProvider implements SmsProvider {
  public readonly name: string;
  private options: MockProviderOptions;

  constructor(options: MockProviderOptions = {}) {
    this.name = options.name || "mock";
    this.options = {
      forceSuccess: true,
      forceStatus: "accepted",
      latencyMs: 0,
      ...options,
    };
  }

  public setOptions(options: Partial<MockProviderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public isConfigured(): boolean {
    return true;
  }

  public async send(request: SmsRequest): Promise<SmsResult> {
    if (this.options.latencyMs && this.options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }

    if (this.options.forceSuccess === false) {
      return {
        success: false,
        provider: this.name,
        status: this.options.forceStatus || "failed",
        errorCode: this.options.errorCode || "MOCK_FAILURE",
        errorMessage: this.options.errorMessage || "Simulated failure from MockProvider",
        canFailover: this.options.canFailover ?? true,
      };
    }

    const mockId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return {
      success: true,
      provider: this.name,
      providerMessageId: mockId,
      status: this.options.forceStatus || "accepted",
      estimatedCost: 0,
    };
  }

  public async getStatus(providerMessageId: string): Promise<SmsResult> {
    return {
      success: true,
      provider: this.name,
      providerMessageId,
      status: "delivered",
    };
  }

  public async verifyWebhook(payload: unknown, headers: Headers): Promise<boolean> {
    return true;
  }
}
