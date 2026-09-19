import { describe, it, expect, beforeEach } from "vitest";
import { RoutingEngine } from "@/lib/routing";
import { ProviderFactory } from "@/providers/provider.factory";
import { MockProvider } from "@/providers/mock.provider";
import { OrangeMaliProvider } from "@/providers/orange-mali.provider";
import { RoutingRule, PhoneDetails, SmsRequest } from "@/types/sms";

describe("Moteur de Routage & Basculement Sécurisé (Safe Failover)", () => {
  let factory: ProviderFactory;
  let engine: RoutingEngine;

  const samplePhoneMaliOrange: PhoneDetails = {
    e164: "+22370123456",
    countryCode: "223",
    nationalNumber: "70123456",
    network: "ORANGE",
    masked: "+223 70 •• •• 56",
    isValid: true,
  };

  const sampleRequest: SmsRequest = {
    to: "+22370123456",
    message: "Test message",
    type: "otp",
    applicationId: "app-1",
    idempotencyKey: "idem-key-1",
  };

  beforeEach(() => {
    factory = ProviderFactory.getInstance();
    factory.resetToDefaults();
    engine = new RoutingEngine(factory);
  });

  it("sélectionne la règle la plus spécifique (pays + réseau avant règle générique)", () => {
    const rules: RoutingRule[] = [
      {
        id: "1",
        countryCode: "*",
        networkCode: "*",
        smsType: "otp",
        providerId: "p1",
        providerCode: "mock",
        priority: 1,
        enabled: true,
        costPerSegmentFcfa: 30,
      },
      {
        id: "2",
        countryCode: "223",
        networkCode: "*",
        smsType: "otp",
        providerId: "p2",
        providerCode: "mock",
        priority: 10,
        enabled: true,
        costPerSegmentFcfa: 25,
      },
      {
        id: "3",
        countryCode: "223",
        networkCode: "ORANGE",
        smsType: "otp",
        providerId: "p3",
        providerCode: "mock",
        priority: 5,
        enabled: true,
        costPerSegmentFcfa: 20,
      },
    ];

    const sorted = engine.selectBestRules(rules, samplePhoneMaliOrange, "otp");
    // La règle 3 est la plus spécifique (223 + ORANGE)
    expect(sorted[0].id).toBe("3");
    // La règle 2 est spécifique pays (223)
    expect(sorted[1].id).toBe("2");
    // La règle 1 est générique (*)
    expect(sorted[2].id).toBe("1");
  });

  it("bascule avec succès vers le fournisseur suivant si le premier n'est pas configuré (ex: OrangeMaliProvider)", async () => {
    const primaryOrange = new OrangeMaliProvider();
    const backupMock = new MockProvider({ name: "mock_backup", forceSuccess: true, forceStatus: "accepted" });

    factory.registerProvider(primaryOrange);
    factory.registerProvider(backupMock);

    const rules: RoutingRule[] = [
      {
        id: "r1",
        countryCode: "223",
        networkCode: "ORANGE",
        smsType: "otp",
        providerId: "p_orange",
        providerCode: "orange_mali",
        priority: 1, // Prioritaire mais non configuré
        enabled: true,
        costPerSegmentFcfa: 15,
      },
      {
        id: "r2",
        countryCode: "223",
        networkCode: "*",
        smsType: "otp",
        providerId: "p_backup",
        providerCode: "mock_backup",
        priority: 2, // Secondaire opérationnel
        enabled: true,
        costPerSegmentFcfa: 25,
      },
    ];

    const outcome = await engine.executeSafeRouting(sampleRequest, samplePhoneMaliOrange, rules, 1);

    expect(outcome.finalResult.success).toBe(true);
    expect(outcome.selectedProvider).toBe("mock_backup");
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0].providerName).toBe("orange_mali");
    expect(outcome.attempts[0].result.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
    expect(outcome.attempts[1].providerName).toBe("mock_backup");
    expect(outcome.attempts[1].result.success).toBe(true);
  });

  it("INTERDIT FORMELLEMENT LE BASCULEMENT si le premier fournisseur renvoie un résultat ambigu ou un statut unknown", async () => {
    // Fournisseur 1 : Erreur réseau / timeout après transmission -> canFailover: false, status: 'unknown'
    const ambiguousProvider = new MockProvider({
      name: "provider_timeout",
      forceSuccess: false,
      forceStatus: "unknown",
      errorCode: "NETWORK_TIMEOUT",
      errorMessage: "Requête envoyée mais pas de confirmation",
      canFailover: false, // INTERDICTION DE BASCULER
    });

    const secondProvider = new MockProvider({
      name: "provider_secondary",
      forceSuccess: true,
    });

    factory.registerProvider(ambiguousProvider);
    factory.registerProvider(secondProvider);

    const rules: RoutingRule[] = [
      {
        id: "r1",
        countryCode: "223",
        networkCode: "*",
        smsType: "otp",
        providerId: "p1",
        providerCode: "provider_timeout",
        priority: 1,
        enabled: true,
        costPerSegmentFcfa: 20,
      },
      {
        id: "r2",
        countryCode: "223",
        networkCode: "*",
        smsType: "otp",
        providerId: "p2",
        providerCode: "provider_secondary",
        priority: 2,
        enabled: true,
        costPerSegmentFcfa: 25,
      },
    ];

    const outcome = await engine.executeSafeRouting(sampleRequest, samplePhoneMaliOrange, rules, 1);

    // RÈGLE ANTI-DOUBLON STRICTE :
    // Le statut DOIT être 'unknown' et le second fournisseur NE DOIT PAS être sollicité
    expect(outcome.finalResult.status).toBe("unknown");
    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.attempts[0].providerName).toBe("provider_timeout");
    expect(outcome.selectedProvider).toBe("provider_timeout");
  });
});
