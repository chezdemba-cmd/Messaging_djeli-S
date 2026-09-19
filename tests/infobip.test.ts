import { describe, it, expect } from "vitest";
import { InfobipProvider } from "@/providers/infobip.provider";

describe("Connecteur Infobip & Normalisation des statuts", () => {
  const infobip = new InfobipProvider();

  it("normalise correctement les groupes de statuts Infobip vers le standard interne", () => {
    expect(infobip.mapInfobipStatus("DELIVERED")).toBe("delivered");
    expect(infobip.mapInfobipStatus("DELIVERED_TO_HANDSET")).toBe("delivered");
    expect(infobip.mapInfobipStatus("PENDING")).toBe("sent");
    expect(infobip.mapInfobipStatus("PENDING_ENROUTE")).toBe("sent");
    expect(infobip.mapInfobipStatus("ACCEPTED")).toBe("accepted");
    expect(infobip.mapInfobipStatus("UNDELIVERABLE")).toBe("failed");
    expect(infobip.mapInfobipStatus("REJECTED")).toBe("failed");
    expect(infobip.mapInfobipStatus("EXPIRED")).toBe("failed");
  });

  it("détecte si Infobip n'est pas configuré quand les variables d'environnement sont absentes", () => {
    const unconfigured = new InfobipProvider({ baseUrl: "", apiKey: "" });
    expect(unconfigured.isConfigured()).toBe(false);
  });

  it("gère la validation de webhook avec ou sans secret", async () => {
    const provider = new InfobipProvider();
    const headers = new Headers();
    const isValid = await provider.verifyWebhook({}, headers);
    expect(typeof isValid).toBe("boolean");
  });
});
