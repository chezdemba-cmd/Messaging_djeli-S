import {
  SmsRequest,
  SmsResult,
  SmsProvider,
  RoutingRule,
  PhoneDetails,
  SmsType,
} from "@/types/sms";
import { ProviderFactory } from "@/providers/provider.factory";

export interface AttemptLog {
  providerName: string;
  attemptNumber: number;
  result: SmsResult;
  timestamp: string;
}

export interface RoutingExecutionResult {
  finalResult: SmsResult;
  attempts: AttemptLog[];
  selectedProvider: string;
  estimatedCostFcfa: number;
}

/**
 * Moteur de routage intelligent Djeli'S.
 * Trie les fournisseurs par pertinence et priorité pour le pays, réseau et type donnés.
 */
export class RoutingEngine {
  private factory: ProviderFactory;

  constructor(factory?: ProviderFactory) {
    this.factory = factory || ProviderFactory.getInstance();
  }

  /**
   * Filtre et ordonne les règles de routage selon la spécificité (du plus précis au plus générique)
   * et la priorité (valeur numérique croissante : 1 avant 10).
   */
  public selectBestRules(
    rules: RoutingRule[],
    phone: PhoneDetails,
    smsType: SmsType
  ): RoutingRule[] {
    const candidateRules = rules.filter((r) => {
      if (!r.enabled) return false;
      if (r.smsType !== smsType) return false;

      // Correspondance pays : indicatif direct '223' ou joker '*'
      const matchCountry = r.countryCode === phone.countryCode || r.countryCode === "*";
      if (!matchCountry) return false;

      // Correspondance réseau : 'ORANGE', 'MOOV', 'TELECEL' ou joker '*'
      const matchNetwork = r.networkCode === phone.network || r.networkCode === "*";
      if (!matchNetwork) return false;

      return true;
    });

    // Tri par score de spécificité puis par priorité
    return candidateRules.sort((a, b) => {
      // Priorité 1 : Spécificité pays (ex: '223' > '*')
      const countryScoreA = a.countryCode !== "*" ? 10 : 0;
      const countryScoreB = b.countryCode !== "*" ? 10 : 0;
      if (countryScoreA !== countryScoreB) return countryScoreB - countryScoreA;

      // Priorité 2 : Spécificité réseau (ex: 'ORANGE' > '*')
      const networkScoreA = a.networkCode !== "*" ? 5 : 0;
      const networkScoreB = b.networkCode !== "*" ? 5 : 0;
      if (networkScoreA !== networkScoreB) return networkScoreB - networkScoreA;

      // Priorité 3 : Priorité configurée (1 = plus prioritaire que 2)
      if (a.priority !== b.priority) return a.priority - b.priority;

      // Priorité 4 : Coût le plus faible en FCFA
      return a.costPerSegmentFcfa - b.costPerSegmentFcfa;
    });
  }

  /**
   * RÈGLE CRITIQUE DE BASCULEMENT SÉCURISÉ (Anti-Doublon / Anti-Double-Envoi)
   * 
   * Ne bascule sur le fournisseur suivant QUE si et seulement si :
   * 1. Le fournisseur initial a échoué AVANT toute transmission (ex: non configuré, credentials manquants).
   * 2. Ou la connexion a été explicitement refusée avant l'envoi.
   * 
   * En cas de délai d'attente (timeout), statut inconnu ou réponse ambiguë :
   * -> Statut 'unknown', AUCUN basculement automatique !
   */
  public async executeSafeRouting(
    request: SmsRequest,
    phone: PhoneDetails,
    rules: RoutingRule[],
    segmentCount: number = 1
  ): Promise<RoutingExecutionResult> {
    const sortedRules = this.selectBestRules(rules, phone, request.type);
    const attempts: AttemptLog[] = [];

    if (sortedRules.length === 0) {
      // Aucune règle configurée, tentative directe avec Infobip par défaut ou Mock
      const defaultProvider = this.factory.getProvider("infobip") || this.factory.getProvider("mock");
      if (!defaultProvider) {
        return {
          finalResult: {
            success: false,
            provider: "none",
            status: "failed",
            errorCode: "NO_PROVIDER_AVAILABLE",
            errorMessage: "Aucun fournisseur SMS configuré ou disponible.",
          },
          attempts,
          selectedProvider: "none",
          estimatedCostFcfa: 0,
        };
      }

      const result = await defaultProvider.send(request);
      attempts.push({
        providerName: defaultProvider.name,
        attemptNumber: 1,
        result,
        timestamp: new Date().toISOString(),
      });

      return {
        finalResult: result,
        attempts,
        selectedProvider: defaultProvider.name,
        estimatedCostFcfa: 25.0 * segmentCount,
      };
    }

    let lastResult: SmsResult | null = null;
    let selectedRule: RoutingRule | null = null;

    for (let i = 0; i < sortedRules.length; i++) {
      const rule = sortedRules[i];
      const provider = this.factory.getProvider(rule.providerCode);

      if (!provider) {
        attempts.push({
          providerName: rule.providerCode,
          attemptNumber: i + 1,
          result: {
            success: false,
            provider: rule.providerCode,
            status: "failed",
            errorCode: "PROVIDER_NOT_FOUND",
            errorMessage: `Le fournisseur ${rule.providerCode} n'est pas enregistré.`,
            canFailover: true,
          },
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      selectedRule = rule;

      // Tentative d'envoi auprès du fournisseur sélectionné
      const result = await provider.send(request);
      lastResult = result;

      attempts.push({
        providerName: provider.name,
        attemptNumber: i + 1,
        result,
        timestamp: new Date().toISOString(),
      });

      // 1. Succès : on s'arrête immédiatement
      if (result.success) {
        return {
          finalResult: result,
          attempts,
          selectedProvider: provider.name,
          estimatedCostFcfa: rule.costPerSegmentFcfa * segmentCount,
        };
      }

      // 2. Échec avec statut ambigu ou délai d'attente :
      // RÈGLE IMPÉRATIVE : On NE BASCULE PAS pour éviter d'envoyer deux fois le SMS
      if (result.status === "unknown" || result.canFailover === false) {
        return {
          finalResult: {
            ...result,
            status: "unknown",
            errorMessage: result.errorMessage || "Statut incertain. Basculement interdit pour prévenir les doublons.",
          },
          attempts,
          selectedProvider: provider.name,
          estimatedCostFcfa: rule.costPerSegmentFcfa * segmentCount,
        };
      }

      // 3. Échec formel avant envoi (ex: PROVIDER_NOT_CONFIGURED) :
      // Le basculement est autorisé vers le fournisseur suivant
      // La boucle continue vers i + 1
    }

    // Si tous les fournisseurs ont échoué
    const failureResult: SmsResult = lastResult || {
      success: false,
      provider: "none",
      status: "failed",
      errorCode: "ALL_PROVIDERS_FAILED",
      errorMessage: "Toutes les tentatives auprès des fournisseurs ont échoué.",
    };

    return {
      finalResult: failureResult,
      attempts,
      selectedProvider: selectedRule?.providerCode || "none",
      estimatedCostFcfa: (selectedRule?.costPerSegmentFcfa || 25.0) * segmentCount,
    };
  }
}
