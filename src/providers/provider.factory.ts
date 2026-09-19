import { SmsProvider } from "@/types/sms";
import { InfobipProvider } from "./infobip.provider";
import { MockProvider } from "./mock.provider";
import { OrangeMaliProvider } from "./orange-mali.provider";

export class ProviderFactory {
  private static instance: ProviderFactory;
  private providers: Map<string, SmsProvider> = new Map();

  private constructor() {
    this.registerDefaultProviders();
  }

  public static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  private registerDefaultProviders(): void {
    this.registerProvider(new InfobipProvider());
    this.registerProvider(new MockProvider());
    this.registerProvider(new OrangeMaliProvider());
  }

  public registerProvider(provider: SmsProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public getProvider(name: string): SmsProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  public getAllProviders(): SmsProvider[] {
    return Array.from(this.providers.values());
  }

  public resetToDefaults(): void {
    this.providers.clear();
    this.registerDefaultProviders();
  }
}
