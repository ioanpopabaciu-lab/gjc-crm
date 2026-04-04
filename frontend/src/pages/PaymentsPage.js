import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, TrendingUp, CheckCircle, Clock, AlertCircle, RefreshCw, Upload, FileSpreadsheet } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PAYMENT_TYPES = [
  { value: "candidat", label: "De la Candidat" },
  { value: "firma", label: "De la Firmă" },
];

const STATUS_OPTIONS = ["platit", "partial", "neplatit"];

const STATUS_COLORS = {
  platit: "#10b981",
  partial: "#f59e0b",
  neplatit: "#ef4444",
};

const STATUS_ICONS = {
  platit: CheckCircle,
  partial: Clock,
  neplatit: AlertCircle,
};

const METHODS = ["transfer", "cash", "card", "cec", "bilet_ordin"];

const CURRENCIES = ["EUR", "RON", "USD"];

const emptyForm = {
  type: "candidat",
  entity_id: "",
  entity_name: "",
  amount: "",
  currency: "EUR",
  date_received: "",
  invoice_number: "",
  status: "platit",
  method: "transfer",
  contract_id: "",
  notes: "",
};

const PaymentsPage = ({ showNotification }) => {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({ platit: 0, partial: 0, neplatit: 0, total: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [sbSyncing, setSbSyncing] = useState(false);
  const [sbConfigured, setSbConfigured] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef();

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      const [payRes, statsRes] = await Promise.all([
        axios.get(`${API}/payments`, { params }),
        axios.get(`${API}/payments/stats`).catch(() => ({ data: {} })),
      ]);
      setPayments(payRes.data);
      setStats(statsRes.data || {});
    } catch {
      showNotification("Eroare la încărcarea plăților", "error");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, showNotification]);

  useEffect(() => {
    fetchPayments();
    axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(() => {});
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/contracts`).then(r => setContracts(r.data)).catch(() => {});
    axios.get(`${API}/integrations/smartbill`).then(r => setSbConfigured(r.data?.configured || false)).catch(() => {});
  }, [fetchPayments]);

  const handleSmartBillSync = async () => {
    setSbSyncing(true);
    try {
      const r = await axios.post(`${API}/integrations/smartbill/sync`);
      showNotification(r.data.message || `Importat ${r.data.added} facturi din SmartBill!`);
      fetchPayments();
    } catch (e) {
      const msg = e.response?.data?.detail || "Eroare sincronizare SmartBill";
      if (msg.includes("configurat")) {
        showNotification("SmartBill nu e configurat. Mergi la Setări → Integrare SmartBill.", "error");
      } else {
        showNotification(msg, "error");
      }
    } finally {
      setSbSyncing(false);
    }
  };

  const handleImportSmartBill = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await axios.post(`${API}/payments/import-smartbill`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportResult({ ok: true, ...r.data });
      showNotification(r.data.message || `Importat ${r.data.added} facturi!`);
      fetchPayments();
    } catch (err) {
      const msg = err.response?.data?.detail || "Eroare la import";
      setImportResult({ ok: false, message: msg });
      showNotification(msg, "error");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const openCreate = () => {
    setEditingPayment(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (payment) => {
    setEditingPayment(payment);
    setForm({
      type: payment.type || "candidat",
      entity_id: payment.entity_id || "",
      entity_name: payment.entity_name || "",
      amount: payment.amount || "",
      currency: payment.currency || "EUR",
      date_received: payment.date_received || "",
      invoice_number: payment.invoice_number || "",
      status: payment.status || "platit",
      method: payment.method || "transfer",
      contract_id: payment.contract_id || "",
      notes: payment.notes || "",
    });
    setShowModal(true);
  };

  const handleEntityChange = (id) => {
    const entities = form.type === "candidat" ? candidates : companies;
    const entity = entities.find(e => e.id === id);
    let name = "";
    if (entity) {
      name = form.type === "candidat" ? `${entity.first_name} ${entity.last_name}` : entity.name;
    }
    setForm(f => ({ ...f, entity_id: id, entity_name: name }));
  };

  const handleSave = async () => {
    if (!form.amount) return showNotification("Introdu suma plătii", "error");
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
      };
      if (editingPayment) {
        await axios.put(`${API}/payments/${editingPayment.id}`, payload);
        showNotification("Plată actualizată!");
      } else {
        await axios.post(`${API}/payments`, payload);
        showNotification("Plată înregistrată!");
      }
      setShowModal(false);
      fetchPayments();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi această plată?")) return;
    try {
      await axios.delete(`${API}/payments/${id}`);
      showNotification("Plată ștearsă!");
      fetchPayments();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  // Calculare totaluri per valută din datele locale (corect indiferent de valuta)
  const statsByCurrency = payments.reduce((acc, p) => {
    const cur = p.currency || "EUR";
    const st = p.status || "neplatit";
    if (!acc[cur]) acc[cur] = { platit: 0, partial: 0, neplatit: 0 };
    acc[cur][st] = (acc[cur][st] || 0) + (Number(p.amount) || 0);
    return acc;
  }, {});
  const formatStat = (field) =>
    Object.entries(statsByCurrency)
      .map(([cur, s]) => s[field] > 0 ? `${s[field].toLocaleString("ro-RO")} ${cur}` : null)
      .filter(Boolean).join(" · ") || "0";
  const totalIncasat = formatStat("platit");
  const totalPartial = formatStat("partial");
  const totalNeincasat = formatStat("neplatit");

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Total Încasat</div>
          <div style={{ fontSize: "1.3rem", fontWeight: "700", color: "#10b981", lineHeight: 1.4 }}>
            {totalIncasat}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Parțial</div>
          <div style={{ fontSize: "1.3rem", fontWeight: "700", color: "#f59e0b", lineHeight: 1.4 }}>
            {totalPartial}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Neîncasat</div>
          <div style={{ fontSize: "1.3rem", fontWeight: "700", color: "#ef4444", lineHeight: 1.4 }}>
            {totalNeincasat}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Nr. Tranzacții</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#3b82f6" }}>{payments.length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate tipurile</option>
          {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate statusurile</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Import SmartBill Excel */}
          <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportSmartBill} />
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            title="Importă facturi din fișierul Excel exportat din SmartBill"
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: importing ? "wait" : "pointer", fontWeight: "600", opacity: importing ? 0.7 : 1 }}>
            {importing ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> : <FileSpreadsheet size={15} />}
            {importing ? "Se importă..." : "Import SmartBill Excel"}
          </button>
          {sbConfigured && (
            <button onClick={handleSmartBillSync} disabled={sbSyncing}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", opacity: sbSyncing ? 0.7 : 1 }}>
              <RefreshCw size={15} style={sbSyncing ? { animation: "spin 1s linear infinite" } : {}} />
              {sbSyncing ? "Se sincronizează..." : "SmartBill API Sync"}
            </button>
          )}
          <button onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
            <Plus size={16} /> Plată Nouă
          </button>
        </div>
        {importResult && (
          <div style={{
            width: "100%", marginTop: "8px", padding: "10px 14px", borderRadius: "8px",
            background: importResult.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${importResult.ok ? "#86efac" : "#fca5a5"}`,
            fontSize: "13px", color: importResult.ok ? "#166534" : "#991b1b",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span>
              {importResult.ok
                ? `✓ ${importResult.message} (${importResult.added} adăugate, ${importResult.skipped} deja existente)`
                : `✗ ${importResult.message}`}
            </span>
            <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "inherit" }}>×</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tip</th>
              <th>Entitate (Candidat / Firmă)</th>
              <th>Sumă</th>
              <th>Metodă Plată</th>
              <th>Nr. Factură</th>
              <th>Data Primirii</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Nicio plată înregistrată.</td></tr>
            ) : payments.map(payment => {
              const StatusIcon = STATUS_ICONS[payment.status] || CheckCircle;
              return (
                <tr key={payment.id}>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", background: payment.type === "candidat" ? "#dbeafe" : "#d1fae5", color: payment.type === "candidat" ? "#1d4ed8" : "#065f46" }}>
                      {PAYMENT_TYPES.find(t => t.value === payment.type)?.label || payment.type}
                    </span>
                  </td>
                  <td>{payment.entity_name || "—"}</td>
                  <td style={{ fontWeight: "700", color: "#10b981" }}>
                    {payment.amount ? `${Number(payment.amount).toLocaleString("ro-RO")} ${payment.currency}` : "—"}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{payment.method || "—"}</td>
                  <td>{payment.invoice_number || "—"}</td>
                  <td>{payment.date_received || "—"}</td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: STATUS_COLORS[payment.status] || "#6b7280", fontWeight: "600", fontSize: "0.875rem" }}>
                      <StatusIcon size={14} />
                      {payment.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEdit(payment)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }} title="Editează"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(payment.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }} title="Șterge"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "540px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", margin: 0 }}>
                {editingPayment ? "Editează Plată" : "Plată Nouă"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Tip Plată *</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, entity_id: "", entity_name: "" }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>
                  {form.type === "candidat" ? "Candidat" : "Firmă"}
                </label>
                <select value={form.entity_id} onChange={e => handleEntityChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <option value="">— Selectează —</option>
                  {(form.type === "candidat" ? candidates : companies).map(e => (
                    <option key={e.id} value={e.id}>
                      {form.type === "candidat" ? `${e.first_name} ${e.last_name}` : e.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Sumă *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="ex: 500" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Monedă</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Data Primirii</label>
                  <input type="date" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Nr. Factură</label>
                  <input type="text" value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="ex: FACT-001" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Metodă Plată</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {METHODS.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              {contracts.length > 0 && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Contract asociat</label>
                  <select value={form.contract_id} onChange={e => setForm(f => ({ ...f, contract_id: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Fără contract —</option>
                    {contracts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.type === "contract_mediere" ? "Mediere" : "Prestări"} — {c.candidate_name || c.company_name || c.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Note</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editingPayment ? "Salvează" : "Înregistrează Plata"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsPage;
