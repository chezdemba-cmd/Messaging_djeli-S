export interface TemplateRenderResult {
  success: boolean;
  renderedText?: string;
  error?: string;
  missingVariables?: string[];
  unexpectedVariables?: string[];
}

/**
 * Extrait toutes les variables requises d'un contenu de modèle au format {{nom_variable}}.
 */
export function extractTemplateVariables(content: string): string[] {
  const matches = content.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  const variables = matches.map((m) => m.replace(/[\{\}]/g, "").trim());
  return Array.from(new Set(variables));
}

/**
 * Effectue le rendu sécurisé d'un modèle SMS avec validation stricte :
 * 1. Toutes les variables requises par le modèle DOIVENT être fournies.
 * 2. Aucune variable non autorisée ne doit être injectée.
 * 3. Les valeurs de remplacement sont nettoyées.
 */
export function renderTemplate(
  content: string,
  allowedVariables: string[],
  providedVariables: Record<string, string | number> = {}
): TemplateRenderResult {
  const requiredVariables = extractTemplateVariables(content);

  // Vérification que les variables du modèle font bien partie des variables autorisées
  const undeclaredInTemplate = requiredVariables.filter(
    (v) => !allowedVariables.includes(v)
  );
  if (undeclaredInTemplate.length > 0) {
    return {
      success: false,
      error: `Le modèle contient des variables non déclarées dans sa configuration : ${undeclaredInTemplate.join(", ")}`,
    };
  }

  // Vérification des variables manquantes
  const missingVariables = requiredVariables.filter(
    (v) => providedVariables[v] === undefined || providedVariables[v] === null || String(providedVariables[v]).trim() === ""
  );

  if (missingVariables.length > 0) {
    return {
      success: false,
      error: `Variables requises manquantes : ${missingVariables.join(", ")}`,
      missingVariables,
    };
  }

  // Vérification des variables superflues inattendues
  const providedKeys = Object.keys(providedVariables);
  const unexpectedVariables = providedKeys.filter((k) => !allowedVariables.includes(k));

  if (unexpectedVariables.length > 0) {
    return {
      success: false,
      error: `Variables inattendues ou non autorisées fournies : ${unexpectedVariables.join(", ")}`,
      unexpectedVariables,
    };
  }

  // Remplacement des variables
  let rendered = content;
  for (const [key, value] of Object.entries(providedVariables)) {
    const stringVal = String(value);
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    rendered = rendered.replace(regex, stringVal);
  }

  return {
    success: true,
    renderedText: rendered,
  };
}
