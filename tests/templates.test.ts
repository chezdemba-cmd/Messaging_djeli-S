import { describe, it, expect } from "vitest";
import { renderTemplate, extractTemplateVariables } from "@/lib/templates";

describe("Moteur de Modèles SMS (Templates)", () => {
  it("extrait correctement les variables du gabarit", () => {
    const tpl = "Bonjour {{client}}, votre commande {{numero}} est prête.";
    const vars = extractTemplateVariables(tpl);
    expect(vars).toEqual(["client", "numero"]);
  });

  it("effectue un rendu correct quand toutes les variables autorisées sont fournies", () => {
    const content = "Votre code OTP est {{code}}. Valable {{duree}} minutes.";
    const allowed = ["code", "duree"];
    const provided = { code: "987654", duree: 5 };

    const res = renderTemplate(content, allowed, provided);
    expect(res.success).toBe(true);
    expect(res.renderedText).toBe("Votre code OTP est 987654. Valable 5 minutes.");
  });

  it("échoue strictement si une variable requise est manquante", () => {
    const content = "Bonjour {{client}}, votre solde est de {{montant}} FCFA.";
    const allowed = ["client", "montant"];
    const provided = { client: "Fatoumata" }; // 'montant' manquant

    const res = renderTemplate(content, allowed, provided);
    expect(res.success).toBe(false);
    expect(res.missingVariables).toContain("montant");
    expect(res.error).toContain("Variables requises manquantes");
  });

  it("échoue si une variable inattendue non autorisée est injectée", () => {
    const content = "Code: {{code}}";
    const allowed = ["code"];
    const provided = { code: "1234", role: "admin" }; // 'role' non autorisé

    const res = renderTemplate(content, allowed, provided);
    expect(res.success).toBe(false);
    expect(res.unexpectedVariables).toContain("role");
  });
});
