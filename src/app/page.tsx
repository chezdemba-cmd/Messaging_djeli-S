"use client";

import React, { useState, useEffect } from "react";
import {
  Send,
  ShieldCheck,
  Server,
  Key,
  FileText,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  Plus,
  Layers,
  Phone,
  BarChart3,
  ExternalLink,
} from "lucide-react";

interface MetricsData {
  totalMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  deliveryRate: string;
  failureRate: string;
  totalCostFcfa: number;
  appBreakdown: { name: string; count: number; costFcfa: number }[];
  currency: string;
  timezone: string;
}

interface MessageItem {
  id: string;
  recipientMasked?: string;
  recipient_masked?: string;
  status: string;
  smsType?: string;
  sms_type?: string;
  segmentCount?: number;
  segment_count?: number;
  estimatedCostFcfa?: number;
  estimated_cost_fcfa?: number;
  actualCostFcfa?: number;
  actual_cost_fcfa?: number;
  providerCode?: string;
  createdAt?: string;
  created_at?: string;
  applications?: { name: string; slug: string };
  errorCode?: string;
  error_code?: string;
}

interface AppItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  dailyLimit: number;
  daily_limit?: number;
  monthlyLimit: number;
  monthly_limit?: number;
  api_keys?: { id: string; key_prefix: string; created_at: string; revoked_at: string | null }[];
}

interface ProviderItem {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  priority: number;
  health_status: string;
  configuration_metadata?: { configured?: boolean; description?: string };
}

interface RuleItem {
  id: string;
  countryCode?: string;
  country_code?: string;
  networkCode?: string;
  network_code?: string;
  smsType?: string;
  sms_type?: string;
  priority: number;
  enabled: boolean;
  costPerSegmentFcfa?: number;
  cost_per_segment_fcfa?: number;
  providerCode?: string;
  providers?: { name: string; code: string };
}

interface TemplateItem {
  id: string;
  name: string;
  slug: string;
  content: string;
  smsType?: string;
  sms_type?: string;
  variables: string[];
  active: boolean;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "messages" | "apps" | "providers" | "templates" | "test">("overview");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);

  // Filtres messages
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Modal clé API
  const [generatedKey, setGeneratedKey] = useState<{ rawKey: string; prefix: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Formulaire test SMS
  const [testTo, setTestTo] = useState("+22370123456");
  const [testMode, setTestMode] = useState<"direct" | "template">("direct");
  const [testMessage, setTestMessage] = useState("Votre code de vérification Djeli'S est 849201. Valable 5 minutes.");
  const [testTemplate, setTestTemplate] = useState("otp_standard");
  const [testVariables, setTestVariables] = useState('{"code": "849201"}');
  const [testType, setTestType] = useState<"otp" | "transactional" | "marketing">("otp");
  const [testSenderId, setTestSenderId] = useState("DJELIS");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Formulaire création App
  const [newAppName, setNewAppName] = useState("");
  const [newAppSlug, setNewAppSlug] = useState("");

  // Formulaire création Template
  const [newTplName, setNewTplName] = useState("");
  const [newTplSlug, setNewTplSlug] = useState("");
  const [newTplContent, setNewTplContent] = useState("");
  const [newTplType, setNewTplType] = useState<"otp" | "transactional" | "marketing">("transactional");

  // Rafraîchissement des données
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resMetrics, resMsgs, resApps, resProv, resRules, resTpls] = await Promise.all([
        fetch("/api/admin/metrics").then((r) => r.json()),
        fetch(`/api/admin/messages?status=${statusFilter}&type=${typeFilter}`).then((r) => r.json()),
        fetch("/api/admin/applications").then((r) => r.json()),
        fetch("/api/admin/providers").then((r) => r.json()),
        fetch("/api/admin/routing").then((r) => r.json()),
        fetch("/api/admin/templates").then((r) => r.json()),
      ]);

      setMetrics(resMetrics);
      setMessages(resMsgs.messages || []);
      setApps(resApps.applications || []);
      setProviders(resProv.providers || []);
      setRules(resRules.rules || []);
      setTemplates(resTpls.templates || []);
    } catch (err) {
      console.error("Erreur chargement données admin", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [statusFilter, typeFilter]);

  // Générer une clé API pour une application
  const handleGenerateKey = async (appId: string) => {
    const res = await fetch("/api/admin/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_key", applicationId: appId }),
    });
    const data = await res.json();
    if (data.success && data.rawKey) {
      setGeneratedKey({ rawKey: data.rawKey, prefix: data.prefix });
      fetchAllData();
    }
  };

  // Créer une application
  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName || !newAppSlug) return;

    await fetch("/api/admin/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAppName, slug: newAppSlug }),
    });

    setNewAppName("");
    setNewAppSlug("");
    fetchAllData();
  };

  // Créer un gabarit
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName || !newTplSlug || !newTplContent) return;

    await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTplName,
        slug: newTplSlug,
        content: newTplContent,
        smsType: newTplType,
      }),
    });

    setNewTplName("");
    setNewTplSlug("");
    setNewTplContent("");
    fetchAllData();
  };

  // Tester la connexion Infobip
  const handleTestInfobip = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection", providerCode: "infobip" }),
      });
      const data = await res.json();
      alert(data.message + (data.balance !== undefined ? ` (Solde: ${data.balance} ${data.currency})` : ""));
    } finally {
      setLoading(false);
    }
  };

  // Exécuter un envoi SMS de test
  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setTestResult(null);

    try {
      let parsedVars: Record<string, string> = {};
      if (testMode === "template" && testVariables) {
        try {
          parsedVars = JSON.parse(testVariables);
        } catch {
          alert("Les variables doivent être un objet JSON valide, ex: {\"client\": \"Mamadou\"}");
          setTestLoading(false);
          return;
        }
      }

      // Utilisation d'une clé API active pour l'envoi de test
      const apiKeyToUse = "dj_live_tako_test_key_1234567890";
      const idempotencyKey = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const bodyPayload = testMode === "direct"
        ? {
            to: testTo,
            message: testMessage,
            type: testType,
            senderId: testSenderId,
          }
        : {
            to: testTo,
            template: testTemplate,
            variables: parsedVars,
            type: testType,
            senderId: testSenderId,
          };

      const res = await fetch("/api/v1/sms/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKeyToUse}`,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      setTestResult(data);
      fetchAllData();
    } catch (err: unknown) {
      setTestResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Barre supérieure / En-tête Djeli'S */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-500 text-white p-2 rounded-lg font-black text-xl tracking-wider shadow-md">
              Dj’S
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">
                Djeli’S <span className="text-orange-400 font-medium">Messaging API</span>
              </span>
              <span className="hidden sm:inline-block ml-3 px-2 py-0.5 text-xs font-semibold bg-slate-800 text-slate-300 rounded border border-slate-700">
                Passerelle SMS Multi-Fournisseurs
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-sm text-slate-300">
            <div className="hidden md:flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span>Fuseau : <strong>Africa/Bamako</strong></span>
              <span className="text-slate-500">|</span>
              <span>Devise : <strong>FCFA</strong></span>
            </div>
            <button
              onClick={fetchAllData}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer text-xs"
              title="Rafraîchir les données"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-orange-400" : ""}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>

        {/* Navigation des Onglets */}
        <nav className="bg-slate-950 px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto border-t border-slate-800">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "overview"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Vue Globale</span>
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "messages"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Journal des SMS</span>
          </button>
          <button
            onClick={() => setActiveTab("apps")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "apps"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Applications & Clés API</span>
          </button>
          <button
            onClick={() => setActiveTab("providers")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "providers"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Fournisseurs & Routage</span>
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "templates"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Modèles de Messages</span>
          </button>
          <button
            onClick={() => setActiveTab("test")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === "test"
                ? "border-orange-500 text-orange-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Banc d’Essai (Test SMS)</span>
          </button>
        </nav>
      </header>

      {/* Contenu Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* ========================================================================= */}
        {/* ONGLET 1 : VUE GLOBALE                                                    */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Tableau de Bord Opérationnel
              </h1>
              <p className="text-sm text-slate-500">
                Surveillance centralisée des flux SMS pour TAKO, Sigi, Siraba et Comy_stock.
              </p>
            </div>

            {/* Cartes KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Messages Soumis
                  </span>
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-slate-900">
                  {metrics?.totalMessages || 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">Totalité des requêtes traitées</div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Taux de Livraison
                  </span>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-emerald-600">
                  {metrics?.deliveryRate || "100"}%
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {metrics?.deliveredMessages || 0} messages reçus avec succès
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                    Taux d’Échec
                  </span>
                  <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-rose-600">
                  {metrics?.failureRate || "0.0"}%
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {metrics?.failedMessages || 0} rejets ou erreurs définitives
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                    Dépenses Estimées
                  </span>
                  <div className="p-2 bg-orange-50 rounded-lg text-orange-600 font-bold text-sm">
                    FCFA
                  </div>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-slate-900">
                  {(metrics?.totalCostFcfa || 0).toLocaleString("fr-FR")}{" "}
                  <span className="text-sm font-semibold text-orange-600">FCFA</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">Coût basé sur la tarification par segment</div>
              </div>
            </div>

            {/* Consommation par Application & État des passerelles */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-orange-500" />
                  <span>Consommation par Application Cliente</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase text-slate-400 font-semibold">
                        <th className="pb-3">Application</th>
                        <th className="pb-3">Messages</th>
                        <th className="pb-3">Coût Total (FCFA)</th>
                        <th className="pb-3 text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {apps.map((app) => {
                        const breakdown = metrics?.appBreakdown?.find((b) => b.name === app.name);
                        return (
                          <tr key={app.id} className="hover:bg-slate-50">
                            <td className="py-3 font-semibold text-slate-800">{app.name}</td>
                            <td className="py-3 text-slate-600">{breakdown?.count || 0}</td>
                            <td className="py-3 font-medium text-slate-900">
                              {(breakdown?.costFcfa || 0).toLocaleString("fr-FR")} FCFA
                            </td>
                            <td className="py-3 text-right">
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                                {app.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* État des passerelles */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center space-x-2">
                  <Server className="w-4 h-4 text-orange-500" />
                  <span>Connecteurs & Santé</span>
                </h3>
                <div className="space-y-4">
                  {providers.map((p) => (
                    <div key={p.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 text-sm">{p.name}</span>
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded ${
                            p.health_status === "healthy"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.health_status === "maintenance"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {p.health_status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {p.configuration_metadata?.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 2 : JOURNAL DES SMS                                               */}
        {/* ========================================================================= */}
        {activeTab === "messages" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Journal des Messages SMS
                </h1>
                <p className="text-sm text-slate-500">
                  Historique détaillé des requêtes d’envoi avec masquage strict des numéros.
                </p>
              </div>

              {/* Filtres */}
              <div className="flex items-center space-x-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="delivered">Délivré (delivered)</option>
                  <option value="accepted">Accepté (accepted)</option>
                  <option value="sent">Envoyé (sent)</option>
                  <option value="failed">Échec (failed)</option>
                  <option value="unknown">Incertain (unknown)</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">Tous les types</option>
                  <option value="otp">OTP (Vérification)</option>
                  <option value="transactional">Transactionnel</option>
                  <option value="marketing">Marketing</option>
                </select>
              </div>
            </div>

            {/* Table des messages */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="py-3.5 px-4">Destinataire (Masqué)</th>
                      <th className="py-3.5 px-4">Application</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Statut</th>
                      <th className="py-3.5 px-4">Segments</th>
                      <th className="py-3.5 px-4">Coût</th>
                      <th className="py-3.5 px-4">Horodatage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {messages.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                          Aucun message correspondant aux filtres.
                        </td>
                      </tr>
                    ) : (
                      messages.map((m) => {
                        const masked = m.recipientMasked || m.recipient_masked || "****";
                        const st = m.status;
                        const cost = m.actualCostFcfa || m.actual_cost_fcfa || m.estimatedCostFcfa || m.estimated_cost_fcfa || 0;
                        const segs = m.segmentCount || m.segment_count || 1;
                        const date = m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--";

                        return (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-medium text-slate-900">
                              {masked}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {m.applications?.name || "TAKO"}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-medium">
                                {m.smsType || m.sms_type}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                                  st === "delivered"
                                    ? "badge-delivered"
                                    : st === "accepted"
                                    ? "badge-accepted"
                                    : st === "sent"
                                    ? "badge-sent"
                                    : st === "failed"
                                    ? "badge-failed"
                                    : "badge-unknown"
                                }`}
                              >
                                {st}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{segs} seg.</td>
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {cost} FCFA
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500">{date}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 3 : APPLICATIONS & CLÉS API                                       */}
        {/* ========================================================================= */}
        {activeTab === "apps" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Gestion des Applications & Clés API
              </h1>
              <p className="text-sm text-slate-500">
                Générez des clés sécurisées avec hachage SHA-256 et configurez les quotas.
              </p>
            </div>

            {/* Modal / Alerte de clé nouvellement générée */}
            {generatedKey && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-amber-900 shadow-sm">
                <div className="flex items-start space-x-3">
                  <ShieldCheck className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-base text-amber-900">
                      Nouvelle Clé API Générée avec Succès
                    </h4>
                    <p className="text-xs text-amber-800 mt-1">
                      ⚠️ <strong>ATTENTION :</strong> Cette clé complète ne sera affichée qu’une seule et unique fois. Copiez-la et enregistrez-la immédiatement dans le fichier <code>.env</code> de votre application cliente.
                    </p>
                    <div className="mt-3 flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedKey.rawKey}
                        className="bg-white border border-amber-300 font-mono text-xs px-3 py-2 rounded-lg w-full max-w-md text-slate-900 font-semibold select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(generatedKey.rawKey)}
                        className="flex items-center space-x-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copySuccess ? "Copié !" : "Copier"}</span>
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setGeneratedKey(null)}
                    className="text-amber-600 hover:text-amber-800 text-sm font-bold cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {/* Liste des applications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {apps.map((app) => (
                <div key={app.id} className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg text-slate-900">{app.name}</h3>
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                        {app.status}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-1">slug: {app.slug}</p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-500">Limite Journalière :</span>
                        <div className="font-bold text-slate-800 mt-0.5">
                          {(app.dailyLimit || app.daily_limit || 10000).toLocaleString()} SMS
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Limite Mensuelle :</span>
                        <div className="font-bold text-slate-800 mt-0.5">
                          {(app.monthlyLimit || app.monthly_limit || 250000).toLocaleString()} SMS
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span className="text-xs font-semibold text-slate-600">Clés API associées :</span>
                      <div className="mt-2 space-y-1.5">
                        {app.api_keys && app.api_keys.length > 0 ? (
                          app.api_keys.map((k) => (
                            <div key={k.id} className="flex items-center justify-between text-xs bg-slate-100 px-3 py-1.5 rounded font-mono">
                              <span>{k.key_prefix}••••••••</span>
                              <span className="text-slate-400 text-[10px]">Actif</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-slate-400 italic">Aucune clé active</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => handleGenerateKey(app.id)}
                      className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5 text-orange-400" />
                      <span>Générer une clé API</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Formulaire ajout nouvelle app */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
              <h3 className="font-bold text-base text-slate-900 mb-3 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-orange-500" />
                <span>Enregistrer une Nouvelle Application</span>
              </h3>
              <form onSubmit={handleCreateApp} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Nom (ex: Siraba Logistics)"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Slug (ex: siraba_logistics)"
                  value={newAppSlug}
                  onChange={(e) => setNewAppSlug(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  required
                />
                <button
                  type="submit"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition cursor-pointer"
                >
                  Ajouter l’Application
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 4 : FOURNISSEURS & ROUTAGE                                        */}
        {/* ========================================================================= */}
        {activeTab === "providers" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Connecteurs Fournisseurs & Règles de Routage
              </h1>
              <p className="text-sm text-slate-500">
                Orchestration du basculement sécurisé selon le pays, le réseau et le type de message.
              </p>
            </div>

            {/* Grille Fournisseurs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {providers.map((p) => (
                <div key={p.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-slate-900">{p.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        p.health_status === "healthy"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.health_status === "maintenance"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.health_status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {p.configuration_metadata?.description}
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Priorité: <strong>{p.priority}</strong>
                    </span>
                    {p.code === "infobip" && (
                      <button
                        onClick={handleTestInfobip}
                        className="text-orange-600 hover:text-orange-700 font-bold cursor-pointer"
                      >
                        Tester connexion
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Règles de routage */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900">
                  Règles de Sélection Actives
                </h3>
                <span className="text-xs text-slate-500">
                  Priorité numérique la plus basse = évalué en premier
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Pays (Indicatif)</th>
                      <th className="py-3 px-4">Réseau Opérateur</th>
                      <th className="py-3 px-4">Type de SMS</th>
                      <th className="py-3 px-4">Fournisseur Attribué</th>
                      <th className="py-3 px-4">Priorité</th>
                      <th className="py-3 px-4">Coût / Segment (FCFA)</th>
                      <th className="py-3 px-4 text-right">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((r) => {
                      const cCode = r.countryCode || r.country_code || "*";
                      const nCode = r.networkCode || r.network_code || "*";
                      const type = r.smsType || r.sms_type || "transactional";
                      const pCode = r.providerCode || r.providers?.code || "infobip";
                      const cost = r.costPerSegmentFcfa || r.cost_per_segment_fcfa || 25;

                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {cCode === "223" ? "Mali (+223)" : cCode === "*" ? "Tous (*)" : cCode}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">{nCode}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-medium">
                              {type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800 uppercase text-xs">
                            {pCode}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{r.priority}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{cost} FCFA</td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
                              Actif
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 5 : MODÈLES (TEMPLATES)                                           */}
        {/* ========================================================================= */}
        {activeTab === "templates" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Modèles de Messages SMS
              </h1>
              <p className="text-sm text-slate-500">
                Gabarits pré-approuvés avec substitution sécurisée de variables <code>{"{{variable}}"}</code>.
              </p>
            </div>

            {/* Liste des modèles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {templates.map((t) => (
                <div key={t.id} className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-slate-900">{t.name}</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700">
                      {t.smsType || t.sms_type}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5">slug: {t.slug}</div>

                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800 text-sm font-sans">
                    {t.content}
                  </div>

                  <div className="mt-3 flex items-center space-x-2 text-xs text-slate-500">
                    <span>Variables requises :</span>
                    {t.variables && t.variables.length > 0 ? (
                      t.variables.map((v) => (
                        <span key={v} className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-mono font-bold">
                          {`{{${v}}}`}
                        </span>
                      ))
                    ) : (
                      <span className="italic">Aucune</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Formulaire ajout modèle */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
              <h3 className="font-bold text-base text-slate-900 mb-4 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-orange-500" />
                <span>Créer un Nouveau Modèle</span>
              </h3>
              <form onSubmit={handleCreateTemplate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Nom (ex: Alerte Solde)"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Slug unique (ex: alerte_solde)"
                    value={newTplSlug}
                    onChange={(e) => setNewTplSlug(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    required
                  />
                  <select
                    value={newTplType}
                    onChange={(e) => setNewTplType(e.target.value as "otp" | "transactional" | "marketing")}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="transactional">Transactionnel</option>
                    <option value="otp">OTP (Code de validation)</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>

                <div>
                  <textarea
                    rows={3}
                    placeholder="Contenu du modèle avec balises {{variable}}. Exemple: Bonjour {{client}}, votre solde est de {{montant}} FCFA."
                    value={newTplContent}
                    onChange={(e) => setNewTplContent(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-5 rounded-lg text-sm transition cursor-pointer"
                  >
                    Enregistrer le Modèle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 6 : BANC D’ESSAI (TEST SMS)                                       */}
        {/* ========================================================================= */}
        {activeTab === "test" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Banc d’Essai & Simulateur SMS
              </h1>
              <p className="text-sm text-slate-500">
                Effectuez des envois contrôlés pour vérifier la délivrabilité, le calcul des segments et la réponse de l'API.
              </p>
            </div>

            {/* AVERTISSEMENT OBLIGATOIRE */}
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Avertissement avant tout envoi réel
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    Si le fournisseur <strong>Infobip</strong> est sélectionné par les règles de routage, ce test consommera du crédit réel et enverra un véritable SMS sur le réseau de l'opérateur. En mode développement, vous pouvez modifier temporairement la priorité pour cibler le <strong>Mock Provider</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Formulaire de test */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
                <form onSubmit={handleSendTestSms} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Numéro Destinataire (E.164 ou numéro Mali direct)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder="+22370123456"
                        className="pl-9 w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:outline-none focus:border-orange-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Type de SMS
                      </label>
                      <select
                        value={testType}
                        onChange={(e) => setTestType(e.target.value as "otp" | "transactional" | "marketing")}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-orange-500"
                      >
                        <option value="otp">OTP (Vérification)</option>
                        <option value="transactional">Transactionnel</option>
                        <option value="marketing">Marketing</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Sender ID
                      </label>
                      <input
                        type="text"
                        value={testSenderId}
                        onChange={(e) => setTestSenderId(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Format du Contenu
                    </label>
                    <div className="flex space-x-4 text-sm">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="testMode"
                          checked={testMode === "direct"}
                          onChange={() => setTestMode("direct")}
                          className="text-orange-500 focus:ring-orange-500"
                        />
                        <span>Texte direct</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="testMode"
                          checked={testMode === "template"}
                          onChange={() => setTestMode("template")}
                          className="text-orange-500 focus:ring-orange-500"
                        />
                        <span>Utiliser un modèle</span>
                      </label>
                    </div>
                  </div>

                  {testMode === "direct" ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Message SMS
                      </label>
                      <textarea
                        rows={4}
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500 font-sans"
                        required
                      />
                      <div className="text-right text-xs text-slate-400 mt-1">
                        {testMessage.length} caractères
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                          Modèle sélectionné
                        </label>
                        <select
                          value={testTemplate}
                          onChange={(e) => setTestTemplate(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-orange-500"
                        >
                          <option value="otp_standard">Code OTP Standard (otp_standard)</option>
                          <option value="commande_confirmee">Confirmation Commande (commande_confirmee)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                          Variables JSON
                        </label>
                        <textarea
                          rows={2}
                          value={testVariables}
                          onChange={(e) => setTestVariables(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={testLoading}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg text-sm transition cursor-pointer shadow-sm flex items-center justify-center space-x-2"
                  >
                    <Send className={`w-4 h-4 ${testLoading ? "animate-pulse" : ""}`} />
                    <span>{testLoading ? "Envoi en cours..." : "Lancer le Test SMS"}</span>
                  </button>
                </form>
              </div>

              {/* Résultat JSON en direct */}
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 text-white flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <span className="font-bold text-sm text-slate-300">
                      Réponse API Normalisée
                    </span>
                    <span className="text-xs text-orange-400 font-mono">
                      POST /api/v1/sms/send
                    </span>
                  </div>

                  {testResult ? (
                    <pre className="text-xs font-mono bg-slate-950 p-4 rounded-lg overflow-x-auto text-emerald-400 border border-slate-800 max-h-96">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-center py-16 text-slate-500 text-sm">
                      Lancez un test pour visualiser la réponse normalisée de Djeli’S API.
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                  <span>Conforme au standard E.164</span>
                  <span className="font-semibold text-slate-300">Idempotence garantie</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Pied de page sobre */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} Djeli’S Messaging API — Tous droits réservés.</span>
          <span>Domaine de production : <strong>messaging.djelis.com</strong></span>
        </div>
      </footer>
    </div>
  );
}
