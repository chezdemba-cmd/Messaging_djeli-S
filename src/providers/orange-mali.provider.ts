import { SmsProvider, SmsRequest, SmsResult } from "@/types/sms";

/**
 * Squelette pour le futur connecteur direct Orange Mali SMS API.
 * Ce connecteur reste explicitement inactif et non configuré tant que
 * les identifiants officiels et la documentation contractuelle Orange Business Mali
 * ne sont pas intégrés.
 */
export class OrangeMaliProvider implements SmsProvider {
  public readonly name: string = "orange_mali";

  public isConfigured(): boolean {
    // Toujours faux tant que les identifiants officiels ne sont pas validés
    return false;
  }

  public async send(request: SmsRequest): Promise<SmsResult> {
    return {
      success: false,
      provider: this.name,
      status: "failed",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage:
        "Le fournisseur Orange Mali n'est pas configuré. Documentation officielle et identifiants contractuels requis.",
      canFailover: true, // Échec avant transmission : basculement sécurisé autorisé
    };
  }

  public async getStatus(providerMessageId: string): Promise<SmsResult> {
    return {
      success: false,
      provider: this.name,
      providerMessageId,
      status: "failed",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Le fournisseur Orange Mali n'est pas configuré.",
    };
  }

  public async verifyWebhook(): Promise<boolean> {
    return false;
  }
}
