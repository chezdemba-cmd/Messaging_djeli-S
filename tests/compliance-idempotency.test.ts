import { describe, it, expect, beforeEach } from "vitest";
import { SmsService } from "@/lib/sms-service";
import { inMemoryDb, AppEntity } from "@/lib/db";
import { hashPhoneNumber } from "@/lib/phone";
import { ProviderFactory } from "@/providers/provider.factory";
import { MockProvider } from "@/providers/mock.provider";

describe("Conformité, Idempotence, Consentement et Opt-out", () => {
  let smsService: SmsService;

  const sampleApp: AppEntity = {
    id: "app-tako-test",
    name: "TAKO Test App",
    slug: "tako_test",
    status: "active",
    dailyLimit: 10000,
    monthlyLimit: 100000,
  };

  beforeEach(() => {
    inMemoryDb.reset();
    const factory = ProviderFactory.getInstance();
    factory.registerProvider(new MockProvider({ name: "infobip", forceSuccess: true, forceStatus: "accepted" }));
    smsService = new SmsService();
  });

  it("garantit l'idempotence : une seconde requête avec la même clé renvoie l'original sans renvoi", async () => {
    const idempotencyKey = "idem-test-123456";

    // Premier envoi
    const res1 = await smsService.processSms(
      sampleApp,
      {
        to: "+22370123456",
        message: "Message initial",
        type: "transactional",
      },
      idempotencyKey
    );

    expect(res1.success).toBe(true);
    expect(res1.duplicate).toBeUndefined();

    // Deuxième envoi avec la même clé d'idempotence
    const res2 = await smsService.processSms(
      sampleApp,
      {
        to: "+22370123456",
        message: "Message différent mais même clé",
        type: "transactional",
      },
      idempotencyKey
    );

    expect(res2.success).toBe(true);
    expect(res2.duplicate).toBe(true);
    expect(res2.messageId).toBe(res1.messageId);
  });

  it("bloque strictement les SMS marketing sans consentement explicite", async () => {
    const res = await smsService.processSms(
      sampleApp,
      {
        to: "+22370998877",
        message: "Promotion exceptionnelle sur TAKO !",
        type: "marketing",
      },
      "marketing-no-consent"
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("MARKETING_CONSENT_REQUIRED");
  });

  it("autorise le SMS marketing si le contact a donné son consentement", async () => {
    const phone = "+22370998877";
    const phoneHash = hashPhoneNumber(phone);
    inMemoryDb.contacts.set(`${sampleApp.id}:${phoneHash}`, {
      consentTransactional: true,
      consentMarketing: true,
    });

    const res = await smsService.processSms(
      sampleApp,
      {
        to: phone,
        message: "Offre VIP validée !",
        type: "marketing",
      },
      "marketing-with-consent"
    );

    expect(res.success).toBe(true);
  });

  it("bloque l'envoi si le numéro est inscrit sur la liste d'opposition (opt-out)", async () => {
    const phone = "+22370889900";
    const phoneHash = hashPhoneNumber(phone);
    inMemoryDb.optOuts.add(phoneHash);

    const res = await smsService.processSms(
      sampleApp,
      {
        to: phone,
        message: "Message vers un contact désabonné",
        type: "transactional",
      },
      "opt-out-test"
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("RECIPIENT_OPTED_OUT");
  });
});
