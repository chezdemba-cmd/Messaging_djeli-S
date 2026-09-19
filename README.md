# 📱 Djeli’S Messaging API — Passerelle SMS Centrale & Multi-Fournisseurs

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15%20App%20Router-black.svg)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20RLS-emerald.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-32%20Tests%20Passing-brightgreen.svg)](https://vitest.dev/)
[![Infobip](https://img.shields.io/badge/Provider-Infobip%20REST-orange.svg)](https://www.infobip.com/)

**Djeli’S Messaging API** est le cœur d'envoi SMS de l'écosystème Djeli'S. Elle centralise et unifie l'expédition de messages pour toutes les applications clientes actuelles et futures :
* **TAKO**
* **Sigi**
* **Siraba**
* **Comy_stock**
* Futurs services et plateformes

---

## 🎯 Objectif & Philosophie

Toutes les applications de l'écosystème s'adressent à une **seule et unique API**.  
Le moteur intelligent de Djeli'S se charge de :
1. Normaliser les numéros au format international **E.164** (avec prise en compte native de l'indicatif Mali `+223` et des opérateurs Orange Mali, Moov Africa et Telecel).
2. Détecter l'encodage (**GSM-7** vs **Unicode**) et calculer avec exactitude le nombre de segments.
3. Vérifier les listes d'opposition (**opt-out**) et le consentement préalable obligatoire pour le marketing.
4. Sélectionner le fournisseur optimal selon le pays, le réseau, le type de message (**OTP**, **transactionnel**, **marketing**), la priorité et le coût par segment en **FCFA**.
5. **Basculement sécurisé (Safe Failover)** : Garantir l'absence formelle de double-envoi. En cas de statut ambigu ou de timeout après transmission, le statut est marqué `unknown` et aucun second fournisseur n'est sollicité automatiquement.

---

## 🏗️ Architecture Multi-Fournisseurs

```
┌─────────────────────────────────────────────────────────────┐
│ Applications Clientes : TAKO, Sigi, Siraba, Comy_stock     │
└──────────────────────────────┬──────────────────────────────┘
                               │ POST /api/v1/sms/send
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Djeli’S Messaging Gateway (Next.js 15 App Router)           │
│ ├─ Authentification Clé API (Hachage SHA-256)               │
│ ├─ Contrôle d'Idempotence (Application + Idempotency-Key)   │
│ ├─ Validation E.164 (+223) & Détection Réseau Mali          │
│ ├─ Calcul Segments GSM-7 / Unicode & Estimation Coût FCFA   │
│ ├─ Conformité : Refus Marketing sans consentement & Opt-Out │
│ └─ Moteur de Routage & Safe Failover Engine                 │
└──────────────┬───────────────┬──────────────────────────────┘
               │               │
      ┌────────▼────────┐ ┌────▼──────────────┐ ┌─────────────▼─────────┐
      │ InfobipProvider │ │ MockProvider      │ │ OrangeMaliProvider     │
      │ (Connecteur     │ │ (Développement &  │ │ (Squelette inactif     │
      │  Réel HTTP)     │ │  Tests Vitest)    │ │  attente identifiants) │
      └─────────────────┘ └───────────────────┘ └────────────────────────┘
```

---

## 🚀 Installation & Lancement Local

### Prérequis
* **Node.js** >= 18 (testé sous Node v24)
* **npm** >= 9 (testé sous npm v11)

### 1. Cloner et installer les dépendances
```bash
git clone <url-du-repo>
cd "Messaging Djeli'S"
npm install
```

### 2. Configurer les variables d'environnement
Copiez le modèle et ajustez vos paramètres :
```bash
cp .env.example .env.local
```

### 3. Lancer le serveur de développement
```bash
npm run dev
```
Accédez au tableau de bord administrateur sur : **http://localhost:3000**

---

## 🧪 Tests Automatisés (Vitest)

La suite de tests vérifie l'intégralité des règles critiques définies dans le cahier des charges :
* Authentification par clé API et vérification à temps constant
* Idempotence stricte combinant `application_id` et `idempotency_key`
* Normalisation E.164, indicatif `+223` et détection heuristique opérateur Mali
* Comptage de caractères GSM-7 vs Unicode et calcul des segments (160/153 vs 70/67)
* Rendu des gabarits (templates) avec rejet des variables manquantes ou non autorisées
* Blocage formel des SMS marketing sans consentement préalable
* Respect absolu des listes d'opposition (opt-outs)
* Protection contre les attaques par SMS Pumping sur les codes OTP
* Sélection de route optimale (spécificité pays > réseau > priorité > coût)
* **RÈGLE CRITIQUE : Basculement sécurisé** (autorisé uniquement avant transmission ; **strictement interdit sur statut incertain/unknown**)
* Normalisation des statuts Infobip et rapports de livraison DLR
* Masquage des numéros et absence de fuite de métadonnées sensibles

Lancer la suite :
```bash
npm test
```

Vérifier la conformité stricte TypeScript :
```bash
npm run typecheck
```

Compiler pour la production :
```bash
npm run build
```

---

## 🗄️ Base de Données Supabase

### Schéma & Tables
Le fichier de migration complet se trouve dans [`supabase/migrations/20260919000001_init_djelis_schema.sql`](supabase/migrations/20260919000001_init_djelis_schema.sql) :
1. `applications` : Enregistrement de TAKO, Sigi, Siraba, Comy_stock et quotas.
2. `api_keys` : Clés hashées en SHA-256 avec préfixe reconnaissable `dj_live_...`.
3. `providers` : Fournisseurs (Infobip, Mock, squelette Orange Mali).
4. `routing_rules` : Grille de sélection par pays, réseau, type de SMS et coût FCFA.
5. `messages` : Journal d'envoi avec contrainte unique `(application_id, idempotency_key)` et masquage du destinataire.
6. `message_attempts` : Suivi pas-à-pas des tentatives de distribution.
7. `delivery_events` : Webhooks et accusés de réception opérateur.
8. `templates` : Modèles de SMS avec variables dynamiques autorisées.
9. `contacts` : Consentements transactionnels et marketing.
10. `opt_outs` : Registre centralisé des oppositions.
11. `usage_quotas` : Agrégats journaliers et mensuels.
12. `provider_costs` : Historique des coûts par segment.
13. `audit_logs` : Traçabilité des actions administratives.

### Procédure d'Application sur Supabase
1. Rendez-vous sur votre projet Supabase : [https://database.new](https://database.new)
2. Ouvrez le **SQL Editor**.
3. Copiez l'intégralité du script `supabase/migrations/20260919000001_init_djelis_schema.sql`.
4. Exécutez le script.
5. Récupérez vos clés d'API dans **Project Settings > API** :
   * `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   * `anon public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `service_role secret` -> `SUPABASE_SERVICE_ROLE_KEY`

---

## 📡 Documentation des Endpoints API

### 1. Envoi d'un SMS direct
```bash
curl -X POST https://messaging.djelis.com/api/v1/sms/send \
  -H "Authorization: Bearer dj_live_votre_cle_secrete" \
  -H "Idempotency-Key: commande-258-confirmation" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+22370123456",
    "message": "Votre commande CMD-258 est confirmee.",
    "type": "transactional",
    "senderId": "DJELIS"
  }'
```

**Réponse normalisée (201 Created) :**
```json
{
  "success": true,
  "messageId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "accepted",
  "provider": "infobip",
  "segments": 1,
  "estimatedCostFcfa": 22.5
}
```

### 2. Envoi d'un SMS via un Gabarit (Template)
```bash
curl -X POST https://messaging.djelis.com/api/v1/sms/send \
  -H "Authorization: Bearer dj_live_votre_cle_secrete" \
  -H "Idempotency-Key: cmd-456-notif" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+22370123456",
    "template": "commande_confirmee",
    "variables": {
      "client": "Mamadou",
      "numero": "CMD-456"
    },
    "type": "transactional"
  }'
```

### 3. Consultation du statut d'un message
```bash
curl -X GET https://messaging.djelis.com/api/v1/sms/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d \
  -H "Authorization: Bearer dj_live_votre_cle_secrete"
```

### 4. Consultation des quotas et consommation
```bash
curl -X GET https://messaging.djelis.com/api/v1/usage \
  -H "Authorization: Bearer dj_live_votre_cle_secrete"
```

### 5. Health Check
```bash
curl -X GET https://messaging.djelis.com/api/v1/health
```

---

## 💻 Exemple d'Intégration Client TypeScript (SDK)

Le SDK TypeScript prêt à l'emploi se trouve dans [`src/sdk/client.ts`](src/sdk/client.ts).

```typescript
import { DjelisMessagingClient } from "@/sdk/client";

// Initialisation du client Djeli'S
const djelisMessaging = new DjelisMessagingClient({
  apiKey: process.env.DJELIS_API_KEY!,
  baseUrl: process.env.DJELIS_BASE_URL || "https://messaging.djelis.com",
});

// Envoi d'un SMS avec modèle
async function notifierClient() {
  const result = await djelisMessaging.sendSms({
    to: "+22370000000",
    template: "commande_confirmee",
    variables: {
      client: "Mamadou",
      numero: "CMD-258",
    },
    type: "transactional",
    idempotencyKey: "commande-258-confirmation",
  });

  console.log(`SMS envoyé via ${result.provider} (ID: ${result.messageId})`);
  console.log(`Coût: ${result.estimatedCostFcfa} FCFA, Segments: ${result.segments}`);
}
```

---

## 🔑 Procédure d'Obtention des Identifiants Infobip

1. Créez un compte entreprise sur [https://portal.infobip.com](https://portal.infobip.com).
2. Rendez-vous dans le menu **Developer tools > API Keys**.
3. Cliquez sur **Create API Key**, nommez-la `djelis-production-gateway` et copiez le secret.
4. Repérez votre URL d'API dédiée (ex: `https://xxxx.api.infobip.com`).
5. Enregistrez un Sender ID alphanumérique (ex: `DJELIS`) auprès de votre chargé de compte Infobip selon les régulations du Mali (ARTP).
6. Configurez l'URL de Webhook DLR dans votre espace Infobip :  
   `https://messaging.djelis.com/api/v1/webhooks/infobip`
7. Renseignez `INFOBIP_BASE_URL` et `INFOBIP_API_KEY` dans votre environnement.

---

## 🌐 Déploiement sur Vercel

1. Installez la CLI Vercel ou connectez votre dépôt GitHub sur [https://vercel.com](https://vercel.com).
2. Liez le projet :
   ```bash
   npx vercel
   ```
3. Configurez les variables d'environnement de production sur Vercel :
   * `NEXT_PUBLIC_APP_URL` : `https://messaging.djelis.com`
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY`
   * `INFOBIP_BASE_URL`
   * `INFOBIP_API_KEY`
   * `INFOBIP_DEFAULT_SENDER`
   * `QSTASH_TOKEN` (créé sur [https://console.upstash.com](https://console.upstash.com))
   * `INTERNAL_WORKER_SECRET`
4. Déployez en production :
   ```bash
   npx vercel --prod
   ```

---

## 🛡️ Checklist avant Mise en Production

- [x] RLS Supabase activé avec politiques sécurisées
- [x] Aucune clé secrète stockée en clair dans les tables
- [x] Aucun secret exposé dans le frontend ou les réponses d'erreurs
- [x] Hachage cryptographique SHA-256 de toutes les clés API
- [x] Masquage strict des numéros de téléphone dans les journaux
- [x] Interdiction absolue du double-envoi sur statut ambigu
- [x] Protection anti-pumping sur les flux OTP
- [x] 32 tests unitaires et d'intégration validés
- [x] Déploiement Vercel validé sans erreur de build
