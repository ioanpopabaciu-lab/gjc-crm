import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, TrendingUp, CheckCircle, Clock, AlertCircle, RefreshCw, Upload, FileSpreadsheet, ChevronRight, ChevronDown } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PAYMENT_TYPES = [
  { value: "candidat", label: "De la Candidat" },
  { value: "firma",    label: "De la Firmă" },
];

const STATUS_OPTIONS = ["platit", "partial", "neplatit"];

const STATUS_COLORS = {
  platit:   "#10b981",
  partial:  "#f59e0b",
  neplatit: "#ef4444",
};

const STATUS_ICONS = {
  platit:   CheckCircle,
  partial:  Clock,
  neplatit: AlertCircle,
};

const STATUS_BADGE = {
  platit:   { bg: '#d1fae5', color: '#065f46', label: '🟢 Achitat' },
  partial:  { bg: '#fef9c3', color: '#854d0e', label: '🟡 Parțial' },
  neplatit: { bg: '#fee2e2', color: '#991b1b', label: '🔴 Datorii' },
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
  const [payments,       setPayments]       = useState([]);
  const [stats,          setStats]          = useState({ platit: 0, partial: 0, neplatit: 0, total: 0, count: 0 });
  const [loading,        setLoading]        = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form,           setForm]           = useState(emptyForm);
  const [filterType,     setFilterType]     = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [candidates,     setCandidates]     = useState([]);
  const [companies,      setCompanies]      = useState([]);
  const [contracts,      setContracts]      = useState([]);
  const [sbSyncing,      setSbSyncing]      = useState(false);
  const [sbConfigured,   setSbConfigured]   = useState(false);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const importFileRef = useRef();

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType)   params.type   = filterType;
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
    axios.get(`${API}/companies`).then(r  => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/contracts`).then(r  => setContracts(r.data)).catch(() => {});
    axios.get(`${API}/integrations/smartbill`).then(r => setSbConfigured(r.data?.configured || false)).catch(() => {});
  }, [fetchPayments]);

  // ── SmartBill ─────────────────────────────────────────────────────
  const handleSmartBillSync = async () => {
    setSbSyncing(true);
    try {
      const r = await axios.post(`${API}/integrations/smartbill/sync`);
      showNotification(r.data.message || `Importat ${r.data.added} facturi din SmartBill!`);
      fetchPayments();
    } catch (e) {
      const msg = e.response?.data?.detail || "Eroare sincronizare SmartBill";
      showNotification(msg.includes("configurat") ? "SmartBill nu e configurat. Mergi la Setări." : msg, "error");
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

  // ── Modal helpers ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditingPayment(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openCreateForEntity = (group) => {
    setEditingPayment(null);
    setForm({ ...emptyForm, type: group.type || 'firma', entity_id: group.entity_id || '', entity_name: group.entity_name || '' });
    setShowModal(true);
  };

  const openEdit = (payment) => {
    setEditingPayment(payment);
    setForm({
      type:           payment.type           || "candidat",
      entity_id:      payment.entity_id      || "",
      entity_name:    payment.entity_name    || "",
      amount:         payment.amount         || "",
      currency:       payment.currency       || "EUR",
      date_received:  payment.date_received  || "",
      invoice_number: payment.invoice_number || "",
      status:         payment.status         || "platit",
      method:         payment.method         || "transfer",
      contract_id:    payment.contract_id    || "",
      notes:          payment.notes          || "",
    });
    setShowModal(true);
  };

  const handleEntityChange = (id) => {
    const entities = form.type === "candidat" ? candidates : companies;
    const entity = entities.find(e => e.id === id);
    const name = entity ? (form.type === "candidat" ? `${entity.first_name} ${entity.last_name}` : entity.name) : "";
    setForm(f => ({ ...f, entity_id: id, entity_name: name }));
  };

  const handleSave = async () => {
    if (!form.amount) return showNotification("Introdu suma plătii", "error");
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0 };
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

  // ── Grupare plăți per entitate ────────────────────────────────────
  const groups = useMemo(() => {
    const map = {};
    payments.forEach(p => {
      const key = (p.entity_id || p.entity_name || '__none__') + '|' + (p.type || '');
      if (!map[key]) map[key] = { key, entity_id: p.entity_id, entity_name: p.entity_name || '—', type: p.type, payments: [] };
      map[key].payments.push(p);
    });
    return Object.values(map).sort((a, b) => (a.entity_name || '').localeCompare(b.entity_name || '', 'ro'));
  }, [payments]);

  // Calcul sumar per grup (suportă valute mixte)
  const getGroupSummary = (group) => {
    const byCur = {};
    group.payments.forEach(p => {
      const cur = p.currency || 'EUR';
      const amt = Number(p.amount) || 0;
      if (!byCur[cur]) byCur[cur] = { total: 0, paid: 0, restant: 0 };
      byCur[cur].total += amt;
      if (p.status === 'platit' || p.status === 'partial') byCur[cur].paid += amt;
      else byCur[cur].restant += amt;
    });
    const hasUnpaid  = group.payments.some(p => p.status === 'neplatit');
    const hasPaid    = group.payments.some(p => p.status === 'platit' || p.status === 'partial');
    const overallStatus = !hasUnpaid ? 'platit' : !hasPaid ? 'neplatit' : 'partial';
    const fmt = (field) => Object.entries(byCur)
      .map(([cur, v]) => v[field] > 0 ? `${v[field].toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}` : null)
      .filter(Boolean).join(' · ') || '—';
    return { status: overallStatus, total: fmt('total'), paid: fmt('paid'), restant: fmt('restant'), count: group.payments.length };
  };

  // Toggle expand
  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedGroups.size >= groups.length) setExpandedGroups(new Set());
    else setExpandedGroups(new Set(groups.map(g => g.key)));
  };

  // ── Totaluri globale per valută ────────────────────────────────────
  const statsByCurrency = payments.reduce((acc, p) => {
    const cur = p.currency || "EUR";
    const st  = p.status   || "neplatit";
    if (!acc[cur]) acc[cur] = { platit: 0, partial: 0, neplatit: 0 };
    acc[cur][st] = (acc[cur][st] || 0) + (Number(p.amount) || 0);
    return acc;
  }, {});
  const formatStat = (field) =>
    Object.entries(statsByCurrency)
      .map(([cur, s]) => s[field] > 0 ? `${s[field].toLocaleString("ro-RO")} ${cur}` : null)
      .filter(Boolean).join(" · ") || "0";

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Încasat",   value: formatStat("platit"),   color: "#10b981" },
          { label: "Parțial",         value: formatStat("partial"),  color: "#f59e0b" },
          { label: "Neîncasat",       value: formatStat("neplatit"), color: "#ef4444" },
          { label: "Nr. Tranzacții",  value: payments.length,        color: "#3b82f6" },
          { label: "Nr. Clienți",     value: groups.length,          color: "#8b5cf6" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "140px" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: "700", color: s.color, lineHeight: 1.3 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate tipurile</option>
          {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate statusurile</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {/* Expand / Collapse all */}
        <button onClick={toggleAll} style={{ padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "0.85rem", color: "#374151", display: "flex", alignItems: "center", gap: "6px" }}>
          {expandedGroups.size >= groups.length ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
          {expandedGroups.size >= groups.length ? "Restrânge tot" : "Extinde tot"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportSmartBill} />
          <button onClick={() => importFileRef.current?.click()} disabled={importing}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: importing ? "wait" : "pointer", fontWeight: "600", opacity: importing ? 0.7 : 1 }}>
            {importing ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }}/> : <FileSpreadsheet size={15}/>}
            {importing ? "Se importă..." : "Import SmartBill Excel"}
          </button>
          {sbConfigured && (
            <button onClick={handleSmartBillSync} disabled={sbSyncing}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", opacity: sbSyncing ? 0.7 : 1 }}>
              <RefreshCw size={15} style={sbSyncing ? { animation: "spin 1s linear infinite" } : {}}/>
              {sbSyncing ? "Se sincronizează..." : "SmartBill API Sync"}
            </button>
          )}
          <button onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
            <Plus size={16}/> Plată Nouă
          </button>
        </div>

        {importResult && (
          <div style={{ width: "100%", marginTop: "8px", padding: "10px 14px", borderRadius: "8px", background: importResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${importResult.ok ? "#86efac" : "#fca5a5"}`, fontSize: "13px", color: importResult.ok ? "#166534" : "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{importResult.ok ? `✓ ${importResult.message} (${importResult.added} adăugate, ${importResult.skipped} deja existente)` : `✗ ${importResult.message}`}</span>
            <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "inherit" }}>×</button>
          </div>
        )}
      </div>

      {/* ── Tabel grupat ── */}
      <div className="data-table-container">
        {groups.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 20px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>💳</div>
            <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "6px" }}>Nicio plată înregistrată</div>
            <div style={{ fontSize: "0.875rem" }}>Apasă „Plată Nouă" pentru a adăuga prima înregistrare.</div>
          </div>
        ) : (
          <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "36px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Client / Entitate</th>
                <th style={{ textAlign: "center" }}>Facturi</th>
                <th>Total Facturat</th>
                <th>Încasat</th>
                <th>Restant</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const summary  = getGroupSummary(group);
                const expanded = expandedGroups.has(group.key);
                const badge    = STATUS_BADGE[summary.status] || STATUS_BADGE.neplatit;
                const typeBg   = group.type === 'candidat' ? '#dbeafe' : '#d1fae5';
                const typeCl   = group.type === 'candidat' ? '#1d4ed8' : '#065f46';
                const typeLabel = PAYMENT_TYPES.find(t => t.value === group.type)?.label || group.type;

                return (
                  <React.Fragment key={group.key}>
                    {/* ── Rând header grup ── */}
                    <tr
                      onClick={() => toggleGroup(group.key)}
                      style={{ background: expanded ? '#f0f9ff' : '#fafafa', cursor: 'pointer', borderBottom: '1px solid #e5e7eb', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                      onMouseLeave={e => e.currentTarget.style.background = expanded ? '#f0f9ff' : '#fafafa'}
                    >
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        {expanded
                          ? <ChevronDown  size={16} color="#6366f1" />
                          : <ChevronRight size={16} color="#9ca3af" />}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: "600", background: typeBg, color: typeCl, whiteSpace: "nowrap" }}>
                            {typeLabel}
                          </span>
                          <span style={{ fontWeight: "700", fontSize: "0.9rem", color: "#111827" }}>{group.entity_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontSize: "0.82rem", color: "#6b7280", fontWeight: "600" }}>
                        {summary.count} {summary.count === 1 ? 'factură' : 'facturi'}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>{summary.total}</td>
                      <td style={{ padding: "10px 12px", fontSize: "0.875rem", fontWeight: "700", color: "#10b981" }}>{summary.paid}</td>
                      <td style={{ padding: "10px 12px", fontSize: "0.875rem", fontWeight: "700", color: summary.restant === '—' || summary.restant === '0' ? '#9ca3af' : '#ef4444' }}>
                        {summary.restant}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700", background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <button
                          onClick={e => { e.stopPropagation(); openCreateForEntity(group); }}
                          title="Adaugă plată pentru acest client"
                          style={{ padding: "4px 8px", background: "#d1fae5", color: "#065f46", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", fontWeight: "700", fontSize: "1rem", lineHeight: 1 }}
                        >
                          +
                        </button>
                      </td>
                    </tr>

                    {/* ── Sub-rânduri facturi (vizibile doar dacă expanded) ── */}
                    {expanded && group.payments
                      .slice()
                      .sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
                      .map((payment, idx) => {
                        const StatusIcon = STATUS_ICONS[payment.status] || CheckCircle;
                        const isLast = idx === group.payments.length - 1;
                        return (
                          <tr key={payment.id} style={{ background: '#fff', borderBottom: isLast ? '2px solid #e5e7eb' : '1px solid #f3f4f6' }}>
                            <td style={{ padding: "8px 8px" }}>
                              {/* linie verticală indent */}
                              <div style={{ width: "2px", height: "100%", background: "#e5e7eb", margin: "0 auto" }} />
                            </td>
                            <td style={{ padding: "8px 12px", paddingLeft: "28px" }}>
                              <span style={{ fontWeight: "600", color: "#374151", fontSize: "0.85rem" }}>
                                {payment.invoice_number || <span style={{ color: "#9ca3af", fontWeight: 400 }}>Fără nr. factură</span>}
                              </span>
                              {payment.notes && (
                                <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "2px" }}>{payment.notes}</div>
                              )}
                            </td>
                            <td style={{ padding: "8px 8px", fontSize: "0.82rem", color: "#6b7280", textAlign: "center" }}>
                              {payment.date_received || '—'}
                            </td>
                            <td style={{ padding: "8px 12px", fontWeight: "700", color: "#10b981", fontSize: "0.875rem" }}>
                              {payment.amount ? `${Number(payment.amount).toLocaleString("ro-RO")} ${payment.currency}` : "—"}
                            </td>
                            <td style={{ padding: "8px 12px", fontSize: "0.82rem", color: "#6b7280", textTransform: "capitalize" }}>
                              {payment.method || '—'}
                            </td>
                            <td style={{ padding: "8px 12px" }} />
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "4px", color: STATUS_COLORS[payment.status] || "#6b7280", fontWeight: "600", fontSize: "0.82rem" }}>
                                <StatusIcon size={13} />
                                {payment.status === 'platit' ? 'Plătit' : payment.status === 'partial' ? 'Parțial' : 'Restant'}
                              </span>
                            </td>
                            <td style={{ padding: "8px 8px" }}>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                <button onClick={() => openEdit(payment)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }} title="Editează">
                                  <Edit2 size={15}/>
                                </button>
                                <button onClick={() => handleDelete(payment.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }} title="Șterge">
                                  <Trash2 size={15}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal adaugă / editează plată ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "540px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", margin: 0 }}>
                {editingPayment ? "Editează Plată" : "Plată Nouă"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20}/></button>
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default PaymentsPage;
