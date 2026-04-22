import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Search, Plus, User, Edit, Trash2, X, Users,
  ChevronRight, FileText, Clock, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import COUNTRIES from '../data/countries';

// ─── Catalog servicii IGI (complet) ────────────────────────────────────────

export const B2C_SERVICES = [
  {
    group: "permise_sedere",
    label: "🪪 Permise de Ședere",
    color: "#1e40af",
    bg: "#dbeafe",
    services: [
      { value: "ps_munca",               label: "Permis ședere — Muncă (D/AM)" },
      { value: "ps_detasare",            label: "Permis ședere — Detașare (D/DT)" },
      { value: "ps_activitate_economica",label: "Permis ședere — Activitate economică / Antreprenor (D/AE)" },
      { value: "ps_activitate_prof",     label: "Permis ședere — Activitate profesională reglementată (D/AP)" },
      { value: "ps_activitate_comerc",   label: "Permis ședere — Activitate comercială / Asociat (D/AC)" },
      { value: "ps_studii",              label: "Permis ședere — Studii (D/SD)" },
      { value: "ps_cercetare",           label: "Permis ședere — Cercetare științifică (D/CS)" },
      { value: "ps_religios",            label: "Permis ședere — Activitate religioasă (D/AR)" },
      { value: "ps_tratament",           label: "Permis ședere — Tratament medical de lungă durată" },
      { value: "ps_sportiv",             label: "Permis ședere — Activitate sportivă" },
      { value: "ps_nomad_digital",       label: "Permis ședere — Nomad digital" },
      { value: "ps_voluntariat",         label: "Permis ședere — Voluntariat" },
      { value: "ps_formare_prof",        label: "Permis ședere — Formare profesională (neprofitabil)" },
      { value: "ps_termen_lung",         label: "Permis ședere pe termen lung (min. 5 ani ședere → valabil 10 ani)" },
      { value: "ps_independent",         label: "Permis ședere independent (post divorț / deces sponsor)" },
      { value: "ps_prelungire",          label: "Prelungire permis de ședere existent" },
      { value: "ps_schimbare_scop",      label: "Schimbare scop ședere" },
    ]
  },
  {
    group: "reintregire_familie",
    label: "👨‍👩‍👧 Reîntregire Familie",
    color: "#6d28d9",
    bg: "#ede9fe",
    services: [
      { value: "rf_sot_cetatean_ro",     label: "Reîntregire familie — Soț / Soție cetățean român" },
      { value: "rf_partener_copil_ro",   label: "Reîntregire familie — Partener necăsătorit cu copil comun (cetățean RO)" },
      { value: "rf_copii_cetatean_ro",   label: "Reîntregire familie — Copii cetățeni români (sub 21 ani / dependenți)" },
      { value: "rf_parinti_cetatean_ro", label: "Reîntregire familie — Părinți / Bunici cetățeni români" },
      { value: "rf_sot_non_ue",          label: "Reîntregire familie — Soț / Soție cetățean non-UE cu ședere în RO" },
      { value: "rf_familie_non_ue",      label: "Reîntregire familie — Familie cetățean non-UE cu ședere în RO" },
    ]
  },
  {
    group: "cetatenie",
    label: "🇷🇴 Cetățenie Română",
    color: "#065f46",
    bg: "#d1fae5",
    services: [
      { value: "cet_dobandire",          label: "Dobândire cetățenie română prin naturalizare (ANC)" },
      { value: "cet_redobandire",        label: "Redobândire cetățenie română" },
      { value: "cet_renuntare",          label: "Renunțare la cetățenie română" },
      { value: "cet_transcriere_acte",   label: "Transcriere acte stare civilă (naștere, căsătorie)" },
    ]
  },
  {
    group: "vize",
    label: "✈️ Vize Tip D (Lungă Ședere)",
    color: "#92400e",
    bg: "#fef3c7",
    services: [
      { value: "viza_munca",             label: "Viză D/AM — Muncă" },
      { value: "viza_detasare",          label: "Viză D/DT — Detașare" },
      { value: "viza_activitate_ec",     label: "Viză D/AE — Activitate economică" },
      { value: "viza_activitate_prof",   label: "Viză D/AP — Activitate profesională" },
      { value: "viza_activitate_com",    label: "Viză D/AC — Activitate comercială" },
      { value: "viza_studii",            label: "Viză D/SD — Studii" },
      { value: "viza_cercetare",         label: "Viză D/CS — Cercetare științifică" },
      { value: "viza_reintregire",       label: "Viză D/VF — Reîntregire familie" },
      { value: "viza_religios",          label: "Viză D/AR — Activitate religioasă" },
      { value: "viza_alte_scopuri",      label: "Viză D/AS — Alte scopuri (nomad digital, sportiv, medical)" },
    ]
  },
  {
    group: "asistenta_juridica",
    label: "⚖️ Asistență Juridică Imigrare",
    color: "#7f1d1d",
    bg: "#fee2e2",
    services: [
      { value: "aj_consultanta",         label: "Consultanță juridică imigrare (ședință)" },
      { value: "aj_reprezentare_igi",    label: "Reprezentare la proceduri IGI" },
      { value: "aj_contestatie",         label: "Contestație / Recurs decizie IGI sau consulat" },
      { value: "aj_regularizare",        label: "Regularizare situație ședere ilegală" },
      { value: "aj_acte_notariale",      label: "Procuri + Apostilare + Legalizare documente" },
      { value: "aj_traducere",           label: "Traducere autorizată + legalizare" },
      { value: "aj_inregistrare_casatorie", label: "Înregistrare căsătorie / naștere la autoritățile române" },
    ]
  },
  {
    group: "alte_servicii",
    label: "➕ Alte Servicii",
    color: "#374151",
    bg: "#f3f4f6",
    services: [
      { value: "alt_cnp_straiini",       label: "Obținere CNP pentru cetățeni străini" },
      { value: "alt_inregistrare_intrare", label: "Înregistrare intrare / ieșire (Birou Imigrări)" },
      { value: "alt_invitatie",          label: "Procedura invitației (pentru viză de scurtă ședere)" },
      { value: "alt_alta",               label: "Alt serviciu (specificat în note)" },
    ]
  }
];

// Flatten all services for lookup
const ALL_SERVICES_FLAT = B2C_SERVICES.flatMap(g =>
  g.services.map(s => ({ ...s, group: g.group, group_label: g.label, color: g.color, bg: g.bg }))
);

const getServiceInfo = (serviceType) =>
  ALL_SERVICES_FLAT.find(s => s.value === serviceType) || null;

const getGroupInfo = (groupKey) =>
  B2C_SERVICES.find(g => g.group === groupKey) || null;

// ─── Etapele dosarului B2C ──────────────────────────────────────────────────

const CASE_STAGES = [
  { value: "intake",          label: "📋 Consultanță inițială",    color: "#6b7280", bg: "#f3f4f6" },
  { value: "documente",       label: "📂 Colectare documente",      color: "#1d4ed8", bg: "#dbeafe" },
  { value: "pregatire_dosar", label: "📝 Pregătire dosar",          color: "#7c3aed", bg: "#ede9fe" },
  { value: "depus",           label: "📬 Depus IGI / Consulat",     color: "#92400e", bg: "#fef3c7" },
  { value: "in_procesare",    label: "⏳ În procesare",              color: "#b45309", bg: "#fef9c3" },
  { value: "aprobat",         label: "✅ Aprobat",                   color: "#065f46", bg: "#d1fae5" },
  { value: "respins",         label: "❌ Respins",                   color: "#991b1b", bg: "#fee2e2" },
  { value: "finalizat",       label: "🏁 Finalizat",                 color: "#1f2937", bg: "#e5e7eb" },
];

const getStageInfo = (val) => CASE_STAGES.find(s => s.value === val) || CASE_STAGES[0];

// ─── Component principal ────────────────────────────────────────────────────

const B2CPage = ({ showNotification }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNationality, setFilterNationality] = useState("");

  // Modal client
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  // Detaliu client selectat + dosare
  const [selectedClient, setSelectedClient] = useState(null);
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dosare");

  // Contracte B2C per client
  const [clientContracts, setClientContracts] = useState([]);
  const [clientContractsLoading, setClientContractsLoading] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);

  // Plăți B2C per client
  const [clientPayments, setClientPayments] = useState([]);
  const [clientPaymentsLoading, setClientPaymentsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  // Modal dosar
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState("");

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      let params = [];
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (filterStatus) params.push(`status=${encodeURIComponent(filterStatus)}`);
      if (filterNationality) params.push(`nationality=${encodeURIComponent(filterNationality)}`);
      const qs = params.length ? `?${params.join("&")}` : "";
      const res = await axios.get(`${API}/b2c/clients${qs}`);
      setClients(res.data);
    } catch {
      showNotification("Eroare la încărcarea clienților B2C", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterNationality, showNotification]);

  const fetchCases = useCallback(async (clientId) => {
    try {
      setCasesLoading(true);
      const res = await axios.get(`${API}/b2c/cases?client_id=${clientId}`);
      setCases(res.data);
    } catch {
      showNotification("Eroare la încărcarea dosarelor", "error");
    } finally {
      setCasesLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    const t = setTimeout(fetchClients, 300);
    return () => clearTimeout(t);
  }, [fetchClients]);

  useEffect(() => {
    if (selectedClient) fetchCases(selectedClient.id);
  }, [selectedClient, fetchCases]);

  // Fetch contracte pentru clientul B2C selectat
  const fetchClientContracts = useCallback(async (clientId) => {
    setClientContractsLoading(true);
    try {
      const res = await axios.get(`${API}/contracts?b2c_client_id=${clientId}`);
      setClientContracts(res.data);
    } catch { showNotification("Eroare la contracte", "error"); }
    finally { setClientContractsLoading(false); }
  }, [showNotification]);

  const fetchClientPayments = useCallback(async (clientId) => {
    setClientPaymentsLoading(true);
    try {
      const res = await axios.get(`${API}/payments?entity_id=${clientId}`);
      setClientPayments(res.data);
    } catch { showNotification("Eroare la plăți", "error"); }
    finally { setClientPaymentsLoading(false); }
  }, [showNotification]);

  useEffect(() => {
    if (selectedClient && activeTab === "contracte") fetchClientContracts(selectedClient.id);
    if (selectedClient && activeTab === "plati") fetchClientPayments(selectedClient.id);
  }, [selectedClient, activeTab, fetchClientContracts, fetchClientPayments]);

  const handleSaveClientContract = async () => {
    try {
      const payload = { ...editingContract, type: editingContract?.type || "contract_prestari", b2c_client_id: selectedClient.id, candidate_name: `${selectedClient.first_name} ${selectedClient.last_name}` };
      if (editingContract?.id) {
        await axios.put(`${API}/contracts/${editingContract.id}`, payload);
        showNotification("Contract actualizat!");
      } else {
        await axios.post(`${API}/contracts`, payload);
        showNotification("Contract adăugat!");
      }
      setShowContractModal(false);
      setEditingContract(null);
      fetchClientContracts(selectedClient.id);
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDeleteClientContract = async (id) => {
    if (!window.confirm("Ștergi contractul?")) return;
    try {
      await axios.delete(`${API}/contracts/${id}`);
      showNotification("Contract șters!");
      fetchClientContracts(selectedClient.id);
    } catch { showNotification("Eroare", "error"); }
  };

  const handleSaveClientPayment = async () => {
    try {
      const payload = { ...editingPayment, type: "candidat", entity_id: selectedClient.id, entity_name: `${selectedClient.first_name} ${selectedClient.last_name}`, b2c_client_id: selectedClient.id };
      if (editingPayment?.id) {
        await axios.put(`${API}/payments/${editingPayment.id}`, payload);
        showNotification("Plată actualizată!");
      } else {
        await axios.post(`${API}/payments`, payload);
        showNotification("Plată adăugată!");
      }
      setShowPaymentModal(false);
      setEditingPayment(null);
      fetchClientPayments(selectedClient.id);
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDeleteClientPayment = async (id) => {
    if (!window.confirm("Ștergi plata?")) return;
    try {
      await axios.delete(`${API}/payments/${id}`);
      showNotification("Plată ștearsă!");
      fetchClientPayments(selectedClient.id);
    } catch { showNotification("Eroare", "error"); }
  };

  const handleSaveClient = async () => {
    if (!editingClient?.first_name || !editingClient?.last_name) {
      showNotification("Prenumele și Numele sunt obligatorii", "error"); return;
    }
    try {
      if (editingClient.id) {
        await axios.put(`${API}/b2c/clients/${editingClient.id}`, editingClient);
        showNotification("Client actualizat!");
        if (selectedClient?.id === editingClient.id) setSelectedClient(editingClient);
      } else {
        const res = await axios.post(`${API}/b2c/clients`, editingClient);
        showNotification("Client adăugat!");
        setSelectedClient(res.data);
      }
      setShowClientModal(false);
      setEditingClient(null);
      fetchClients();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm("Ștergi clientul și toate dosarele sale?")) return;
    try {
      await axios.delete(`${API}/b2c/clients/${id}`);
      showNotification("Client șters!");
      if (selectedClient?.id === id) setSelectedClient(null);
      fetchClients();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const handleSaveCase = async () => {
    if (!editingCase?.service_type) {
      showNotification("Selectează tipul serviciului", "error"); return;
    }
    const sInfo = getServiceInfo(editingCase.service_type);
    const payload = {
      ...editingCase,
      client_id: selectedClient.id,
      client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
      service_group: sInfo?.group || editingCase.service_group,
      service_label: sInfo?.label || editingCase.service_label,
    };
    try {
      if (editingCase.id) {
        await axios.put(`${API}/b2c/cases/${editingCase.id}`, payload);
        showNotification("Dosar actualizat!");
      } else {
        await axios.post(`${API}/b2c/cases`, payload);
        showNotification("Dosar creat!");
      }
      setShowCaseModal(false);
      setEditingCase(null);
      fetchCases(selectedClient.id);
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDeleteCase = async (caseId) => {
    if (!window.confirm("Ștergi dosarul?")) return;
    try {
      await axios.delete(`${API}/b2c/cases/${caseId}`);
      showNotification("Dosar șters!");
      fetchCases(selectedClient.id);
    } catch {
      showNotification("Eroare", "error");
    }
  };

  const openNewCaseModal = () => {
    setEditingCase({ status: "intake", assigned_to: "Ioan Baciu" });
    setSelectedGroup("");
    setShowCaseModal(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>

      {/* ── Coloana stânga: lista clienți ── */}
      <div style={{
        width: selectedClient ? 320 : "100%",
        minWidth: 280,
        borderRight: "1px solid var(--border-color)",
        display: "flex", flexDirection: "column",
        background: "#fff",
        transition: "width 0.2s"
      }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
              👤 Clienți B2C
              <span style={{ marginLeft: 8, fontSize: "0.8rem", fontWeight: 400, color: "#6b7280" }}>
                {clients.length}
              </span>
            </h2>
            <button
              className="btn btn-primary"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
              onClick={() => { setEditingClient({}); setShowClientModal(true); }}
            >
              <Plus size={14} /> Adaugă
            </button>
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              type="text" placeholder="Caută client..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: 28, padding: "7px 8px 7px 28px", border: "1px solid var(--border-color)", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }}
            />
          </div>
          {/* Filtre */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <select
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ flex: 1, padding: "5px 8px", border: "1px solid var(--border-color)", borderRadius: 6, fontSize: "0.8rem" }}
            >
              <option value="">Toate statusurile</option>
              <option value="activ">Activ</option>
              <option value="finalizat">Finalizat</option>
              <option value="inactiv">Inactiv</option>
            </select>
            <select
              value={filterNationality} onChange={e => setFilterNationality(e.target.value)}
              style={{ flex: 1, padding: "5px 8px", border: "1px solid var(--border-color)", borderRadius: 6, fontSize: "0.8rem" }}
            >
              <option value="">Toate naționalitățile</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? <div style={{ padding: 24 }}><LoadingSpinner /></div> : (
            clients.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
                <Users size={40} style={{ marginBottom: 8, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>Niciun client B2C{search ? " pentru această căutare" : ""}.</p>
              </div>
            ) : clients.map(client => {
              const isSelected = selectedClient?.id === client.id;
              return (
                <div
                  key={client.id}
                  onClick={() => { setSelectedClient(client); setActiveTab("dosare"); }}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f3f4f6",
                    background: isSelected ? "#eff6ff" : "#fff",
                    borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                    transition: "all 0.1s"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1f2937" }}>
                        {client.first_name} {client.last_name}
                      </div>
                      <div style={{ fontSize: "0.77rem", color: "#6b7280", marginTop: 2 }}>
                        {client.nationality && <span style={{ marginRight: 6 }}>🌍 {client.nationality}</span>}
                        {client.phone && <span>{client.phone}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: "0.7rem", fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                        background: client.status === "activ" ? "#dcfce7" : client.status === "finalizat" ? "#e0e7ff" : "#f3f4f6",
                        color: client.status === "activ" ? "#166534" : client.status === "finalizat" ? "#3730a3" : "#6b7280"
                      }}>
                        {client.status}
                      </span>
                      <ChevronRight size={14} color="#9ca3af" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Coloana dreapta: detalii client ── */}
      {selectedClient && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f9fafb" }}>
          {/* Header client */}
          <div style={{
            padding: "16px 20px", background: "#fff",
            borderBottom: "1px solid var(--border-color)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: "1rem"
              }}>
                {selectedClient.first_name?.[0]}{selectedClient.last_name?.[0]}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                  {selectedClient.first_name} {selectedClient.last_name}
                </h2>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  {selectedClient.nationality && <span style={{ marginRight: 8 }}>🌍 {selectedClient.nationality}</span>}
                  {selectedClient.phone && <span style={{ marginRight: 8 }}>📞 {selectedClient.phone}</span>}
                  {selectedClient.email && <span>✉️ {selectedClient.email}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedClient.candidate_id && (
                <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "#fef3c7", color: "#92400e", borderRadius: 6, fontWeight: 600 }}>
                  👤 Fost candidat GJC
                </span>
              )}
              <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                onClick={() => { setEditingClient({ ...selectedClient }); setShowClientModal(true); }}>
                <Edit size={14} /> Editează
              </button>
              <button className="btn" style={{ padding: "6px 12px", fontSize: "0.82rem", background: "#fee2e2", color: "#991b1b", border: "none" }}
                onClick={() => handleDeleteClient(selectedClient.id)}>
                <Trash2 size={14} />
              </button>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
                onClick={() => setSelectedClient(null)}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Tab-uri */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", background: "#fff", padding: "0 20px", overflowX: "auto" }}>
            {[
              { key: "dosare",    label: `📁 Dosare (${cases.length})` },
              { key: "contracte", label: `📑 Contracte (${clientContracts.length})` },
              { key: "plati",     label: `💰 Plăți (${clientPayments.length})` },
              { key: "detalii",   label: "📋 Detalii" },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
                fontWeight: activeTab === t.key ? 700 : 400,
                color: activeTab === t.key ? "#3b82f6" : "#6b7280",
                borderBottom: activeTab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
                fontSize: "0.82rem", whiteSpace: "nowrap"
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Conținut tab */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

            {activeTab === "dosare" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Dosare active</h3>
                  <button className="btn btn-primary" style={{ padding: "7px 14px", fontSize: "0.82rem" }}
                    onClick={openNewCaseModal}>
                    <Plus size={14} /> Dosar nou
                  </button>
                </div>

                {casesLoading ? <LoadingSpinner /> : cases.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                    <FileText size={40} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Niciun dosar pentru acest client.</p>
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>Creează primul dosar de servicii.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {cases.map(c => {
                      const sInfo = getServiceInfo(c.service_type);
                      const gInfo = getGroupInfo(c.service_group);
                      const stageInfo = getStageInfo(c.status);
                      return (
                        <div key={c.id} style={{
                          background: "#fff", borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          padding: "14px 16px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              {/* Grup */}
                              <div style={{
                                fontSize: "0.72rem", fontWeight: 600, marginBottom: 4,
                                color: gInfo?.color || "#374151",
                                background: gInfo?.bg || "#f3f4f6",
                                display: "inline-block", padding: "2px 8px", borderRadius: 4
                              }}>
                                {gInfo?.label || c.service_group}
                              </div>
                              {/* Serviciu */}
                              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1f2937", marginBottom: 6 }}>
                                {sInfo?.label || c.service_label || c.service_type}
                              </div>
                              {/* Status + detalii */}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                <span style={{
                                  fontSize: "0.75rem", fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                                  background: stageInfo.bg, color: stageInfo.color
                                }}>
                                  {stageInfo.label}
                                </span>
                                {c.deadline && (
                                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                    <Clock size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
                                    Termen: {c.deadline}
                                  </span>
                                )}
                                {c.assigned_to && (
                                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                    👤 {c.assigned_to}
                                  </span>
                                )}
                              </div>
                              {c.notes && (
                                <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 6, fontStyle: "italic" }}>
                                  {c.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                              <button className="icon-btn" title="Editează"
                                onClick={() => { setEditingCase({ ...c }); setSelectedGroup(c.service_group); setShowCaseModal(true); }}>
                                <Edit size={14} />
                              </button>
                              <button className="icon-btn danger" title="Șterge"
                                onClick={() => handleDeleteCase(c.id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB CONTRACTE B2C ── */}
            {activeTab === "contracte" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Contracte</h3>
                  <button className="btn btn-primary" style={{ padding: "7px 14px", fontSize: "0.82rem" }}
                    onClick={() => { setEditingContract({ type: "contract_prestari", currency: "EUR", status: "activ" }); setShowContractModal(true); }}>
                    <Plus size={14} /> Contract nou
                  </button>
                </div>
                {clientContractsLoading ? <LoadingSpinner /> : clientContracts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>
                    <FileText size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Niciun contract pentru acest client.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {clientContracts.map(c => (
                      <div key={c.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4,
                              background: c.type === "contract_prestari" ? "#dbeafe" : "#f0fdf4",
                              color:      c.type === "contract_prestari" ? "#1d4ed8" : "#166534", marginRight: 6 }}>
                              {c.type === "contract_prestari" ? "📑 Prestări" : "🤝 Mediere"}
                            </span>
                            {c.value ? `${c.value} ${c.currency}` : "Fără valoare"}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 4 }}>
                            {c.date_signed && `Semnat: ${c.date_signed}`}
                            {c.validity_months && ` · Valabil ${c.validity_months} luni`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4,
                            background: c.status === "activ" ? "#d1fae5" : c.status === "expirat" ? "#fef3c7" : "#fee2e2",
                            color:      c.status === "activ" ? "#065f46" : c.status === "expirat" ? "#92400e" : "#991b1b" }}>
                            {c.status}
                          </span>
                          <button className="icon-btn" onClick={() => { setEditingContract(c); setShowContractModal(true); }}><Edit size={14}/></button>
                          <button className="icon-btn danger" onClick={() => handleDeleteClientContract(c.id)}><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB PLĂȚI B2C ── */}
            {activeTab === "plati" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Plăți</h3>
                  <button className="btn btn-primary" style={{ padding: "7px 14px", fontSize: "0.82rem" }}
                    onClick={() => { setEditingPayment({ currency: "EUR", status: "platit" }); setShowPaymentModal(true); }}>
                    <Plus size={14} /> Plată nouă
                  </button>
                </div>
                {clientPaymentsLoading ? <LoadingSpinner /> : clientPayments.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>
                    <FileText size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Nicio plată înregistrată pentru acest client.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {clientPayments.map(p => (
                      <div key={p.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#059669" }}>{p.amount} {p.currency}</div>
                          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 3 }}>
                            {p.date_received && `Data: ${p.date_received}`}
                            {p.invoice_number && ` · Fact: ${p.invoice_number}`}
                            {p.method && ` · ${p.method}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: 4,
                            background: p.status === "platit" ? "#d1fae5" : p.status === "partial" ? "#fef3c7" : "#fee2e2",
                            color:      p.status === "platit" ? "#065f46" : p.status === "partial" ? "#92400e" : "#991b1b" }}>
                            {p.status}
                          </span>
                          <button className="icon-btn" onClick={() => { setEditingPayment(p); setShowPaymentModal(true); }}><Edit size={14}/></button>
                          <button className="icon-btn danger" onClick={() => handleDeleteClientPayment(p.id)}><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "detalii" && (
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "0.95rem", fontWeight: 700 }}>Informații personale</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  {[
                    ["Prenume", selectedClient.first_name],
                    ["Nume", selectedClient.last_name],
                    ["Telefon", selectedClient.phone],
                    ["Email", selectedClient.email],
                    ["Naționalitate", selectedClient.nationality],
                    [selectedClient.id_document_type === "cnp" ? "CNP" : "Nr. Pașaport", selectedClient.id_document],
                    ["Adresă", selectedClient.address],
                    ["Localitate", selectedClient.city],
                    ["Județ", selectedClient.county],
                    ["Status", selectedClient.status],
                  ].map(([label, val]) => val ? (
                    <div key={label}>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: "0.9rem", color: "#1f2937", marginTop: 2 }}>{val}</div>
                    </div>
                  ) : null)}
                </div>
                {selectedClient.notes && (
                  <div style={{ marginTop: 16, padding: "10px 12px", background: "#f9fafb", borderRadius: 6, fontSize: "0.875rem", color: "#4b5563" }}>
                    <strong>Note:</strong> {selectedClient.notes}
                  </div>
                )}
                {selectedClient.candidate_id && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#fef3c7", borderRadius: 6, fontSize: "0.8rem", color: "#92400e" }}>
                    👤 <strong>Fostul candidat GJC</strong> — datele au fost preluate din dosarul de candidat.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Client ── */}
      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingClient?.id ? "Editare Client B2C" : "Client B2C Nou"}</h2>
              <button className="close-btn" onClick={() => setShowClientModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Prenume *</label>
                  <input type="text" value={editingClient?.first_name || ""}
                    onChange={e => setEditingClient({ ...editingClient, first_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Nume *</label>
                  <input type="text" value={editingClient?.last_name || ""}
                    onChange={e => setEditingClient({ ...editingClient, last_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input type="text" value={editingClient?.phone || ""}
                    onChange={e => setEditingClient({ ...editingClient, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={editingClient?.email || ""}
                    onChange={e => setEditingClient({ ...editingClient, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Naționalitate</label>
                  <input list="b2c-countries-list" value={editingClient?.nationality || ""}
                    onChange={e => setEditingClient({ ...editingClient, nationality: e.target.value })}
                    placeholder="Caută țara..." className="form-input" />
                  <datalist id="b2c-countries-list">
                    {COUNTRIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label>Tip act identitate</label>
                  <select value={editingClient?.id_document_type || "pasaport"}
                    onChange={e => setEditingClient({ ...editingClient, id_document_type: e.target.value })}>
                    <option value="pasaport">Pașaport</option>
                    <option value="cnp">CNP</option>
                    <option value="ci">Carte de identitate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Nr. Act identitate</label>
                  <input type="text" value={editingClient?.id_document || ""}
                    onChange={e => setEditingClient({ ...editingClient, id_document: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editingClient?.status || "activ"}
                    onChange={e => setEditingClient({ ...editingClient, status: e.target.value })}>
                    <option value="activ">Activ</option>
                    <option value="finalizat">Finalizat</option>
                    <option value="inactiv">Inactiv</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Localitate</label>
                  <input type="text" value={editingClient?.city || ""}
                    onChange={e => setEditingClient({ ...editingClient, city: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Județ</label>
                  <input type="text" value={editingClient?.county || ""}
                    onChange={e => setEditingClient({ ...editingClient, county: e.target.value })} />
                </div>
              </div>
              <div className="form-group full-width">
                <label>Adresă</label>
                <input type="text" value={editingClient?.address || ""}
                  onChange={e => setEditingClient({ ...editingClient, address: e.target.value })} />
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea value={editingClient?.notes || ""}
                  onChange={e => setEditingClient({ ...editingClient, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClientModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSaveClient}>Salvează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dosar ── */}
      {showCaseModal && (
        <div className="modal-overlay" onClick={() => setShowCaseModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCase?.id ? "Editare Dosar" : "Dosar Nou"}</h2>
              <button className="close-btn" onClick={() => setShowCaseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* Selectare grup serviciu */}
              <div className="form-group full-width">
                <label>Categorie serviciu *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {B2C_SERVICES.map(g => (
                    <button key={g.group} type="button"
                      onClick={() => {
                        setSelectedGroup(g.group);
                        setEditingCase({ ...editingCase, service_group: g.group, service_type: "" });
                      }}
                      style={{
                        padding: "6px 12px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                        cursor: "pointer", border: "1.5px solid",
                        background: selectedGroup === g.group ? g.bg : "#fff",
                        borderColor: selectedGroup === g.group ? g.color : "#e5e7eb",
                        color: selectedGroup === g.group ? g.color : "#6b7280",
                      }}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selectare serviciu specific */}
              {selectedGroup && (
                <div className="form-group full-width">
                  <label>Tip serviciu specific *</label>
                  <select value={editingCase?.service_type || ""}
                    onChange={e => setEditingCase({ ...editingCase, service_type: e.target.value })}
                    style={{ fontSize: "0.875rem" }}>
                    <option value="">— Selectează serviciul —</option>
                    {B2C_SERVICES.find(g => g.group === selectedGroup)?.services.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label>Status dosar</label>
                  <select value={editingCase?.status || "intake"}
                    onChange={e => setEditingCase({ ...editingCase, status: e.target.value })}>
                    {CASE_STAGES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Atribuit</label>
                  <input type="text" value={editingCase?.assigned_to || "Ioan Baciu"}
                    onChange={e => setEditingCase({ ...editingCase, assigned_to: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Data depunere</label>
                  <input type="date" value={editingCase?.submitted_date || ""}
                    onChange={e => setEditingCase({ ...editingCase, submitted_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Termen (deadline)</label>
                  <input type="date" value={editingCase?.deadline || ""}
                    onChange={e => setEditingCase({ ...editingCase, deadline: e.target.value })} />
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note dosar</label>
                <textarea value={editingCase?.notes || ""}
                  onChange={e => setEditingCase({ ...editingCase, notes: e.target.value })} rows={3} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCaseModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSaveCase}>Salvează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Contract B2C ── */}
      {showContractModal && (
        <div className="modal-overlay" onClick={() => setShowContractModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingContract?.id ? "Editează Contract" : "Contract Nou"}</h2>
              <button className="close-btn" onClick={() => setShowContractModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Tip Contract</label>
                  <select value={editingContract?.type || "contract_prestari"} onChange={e => setEditingContract({...editingContract, type: e.target.value})}>
                    <option value="contract_prestari">📑 Prestări Servicii (B2C)</option>
                    <option value="contract_mediere">🤝 Contract Mediere</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Valoare</label>
                  <input type="number" value={editingContract?.value || ""} onChange={e => setEditingContract({...editingContract, value: parseFloat(e.target.value) || null})} />
                </div>
                <div className="form-group">
                  <label>Monedă</label>
                  <select value={editingContract?.currency || "EUR"} onChange={e => setEditingContract({...editingContract, currency: e.target.value})}>
                    <option>EUR</option><option>RON</option><option>USD</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Data Semnării</label>
                  <input type="date" value={editingContract?.date_signed || ""} onChange={e => setEditingContract({...editingContract, date_signed: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Validitate (luni)</label>
                  <input type="number" value={editingContract?.validity_months || ""} onChange={e => setEditingContract({...editingContract, validity_months: parseInt(e.target.value) || null})} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editingContract?.status || "activ"} onChange={e => setEditingContract({...editingContract, status: e.target.value})}>
                    <option value="activ">Activ</option>
                    <option value="expirat">Expirat</option>
                    <option value="reziliat">Reziliat</option>
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label>Note</label>
                  <textarea value={editingContract?.notes || ""} onChange={e => setEditingContract({...editingContract, notes: e.target.value})} rows={2}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowContractModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSaveClientContract}>Salvează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Plată B2C ── */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPayment?.id ? "Editează Plată" : "Plată Nouă"}</h2>
              <button className="close-btn" onClick={() => setShowPaymentModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Sumă</label>
                  <input type="number" value={editingPayment?.amount || ""} onChange={e => setEditingPayment({...editingPayment, amount: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Monedă</label>
                  <select value={editingPayment?.currency || "EUR"} onChange={e => setEditingPayment({...editingPayment, currency: e.target.value})}>
                    <option>EUR</option><option>RON</option><option>USD</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Data Primirii</label>
                  <input type="date" value={editingPayment?.date_received || ""} onChange={e => setEditingPayment({...editingPayment, date_received: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Nr. Factură</label>
                  <input type="text" value={editingPayment?.invoice_number || ""} onChange={e => setEditingPayment({...editingPayment, invoice_number: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Metodă Plată</label>
                  <select value={editingPayment?.method || ""} onChange={e => setEditingPayment({...editingPayment, method: e.target.value})}>
                    <option value="">—</option>
                    <option value="transfer">Transfer bancar</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editingPayment?.status || "platit"} onChange={e => setEditingPayment({...editingPayment, status: e.target.value})}>
                    <option value="platit">Plătit</option>
                    <option value="partial">Parțial</option>
                    <option value="neplatit">Neplătit</option>
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label>Note</label>
                  <textarea value={editingPayment?.notes || ""} onChange={e => setEditingPayment({...editingPayment, notes: e.target.value})} rows={2}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSaveClientPayment}>Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2CPage;
