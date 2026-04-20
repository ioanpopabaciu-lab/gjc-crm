import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, CheckSquare, Square, AlertCircle, Clock, Phone, Mail, MessageCircle, Calendar, Users } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PRIORITIES = [
  { value: "urgent", label: "Urgent",  color: "#ef4444" },
  { value: "high",   label: "Ridicat", color: "#f97316" },
  { value: "normal", label: "Normal",  color: "#3b82f6" },
  { value: "low",    label: "Scăzut",  color: "#6b7280" },
];

const STATUSES = [
  { value: "pending",     label: "De făcut",  color: "#6b7280" },
  { value: "in_progress", label: "În lucru",  color: "#3b82f6" },
  { value: "done",        label: "Finalizat", color: "#10b981" },
];

const ACTION_TYPES = [
  { value: "general",   label: "General",       icon: "📋", color: "#6b7280", bg: "#f3f4f6" },
  { value: "sunat",     label: "De sunat",      icon: "📞", color: "#10b981", bg: "#d1fae5" },
  { value: "email",     label: "De trimis mail", icon: "✉️", color: "#3b82f6", bg: "#dbeafe" },
  { value: "whatsapp",  label: "WhatsApp",      icon: "💬", color: "#16a34a", bg: "#dcfce7" },
  { value: "intalnire", label: "Întâlnire",     icon: "🤝", color: "#8b5cf6", bg: "#ede9fe" },
];

const ENTITY_TYPES = ["general", "lead", "candidate", "company", "case", "contract", "payment"];

const emptyForm = {
  title: "", description: "",
  action_type: "general",
  entity_type: "general", entity_id: "", entity_name: "",
  due_date: "", due_time: "09:00", priority: "normal", status: "pending",
  assigned_to: "", assigned_email: "",
  collaborator: "",
  notify_24h: true, notify_3h: true,
  contact_name: "", contact_phone: "", contact_email: "",
  lead_company: "", lead_contact_person: "",
  meeting_scheduled: false, meeting_with: "", meeting_contact: "",
  meeting_datetime: "", meeting_materials: "",
};

const inp = { width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box", fontSize: "0.875rem" };
const lbl = { display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "4px", color: "#374151" };
const sec = { fontSize: "0.72rem", fontWeight: "700", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.05em", margin: "14px 0 8px", borderBottom: "1px solid #f3f4f6", paddingBottom: "4px" };

const TasksPage = ({ showNotification }) => {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAction, setFilterAction]     = useState("");
  const [operators, setOperators] = useState([]);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus)   params.status   = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      const res = await axios.get(`${API}/tasks`, { params });
      setTasks(res.data);
    } catch { showNotification("Eroare la încărcare", "error"); }
    finally { setLoading(false); }
  }, [filterStatus, filterPriority, showNotification]);

  useEffect(() => {
    fetchTasks();
    axios.get(`${API}/operators`).then(r => setOperators(r.data)).catch(() => {});
  }, [fetchTasks]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm, ...item }); setShowModal(true); };

  const toggleDone = async (task) => {
    const newStatus = task.status === "done" ? "pending" : "done";
    try {
      await axios.put(`${API}/tasks/${task.id}`, { ...task, status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch { showNotification("Eroare", "error"); }
  };

  const handleSave = async () => {
    if (!form.title) return showNotification("Introdu titlul sarcinii", "error");
    try {
      if (editing) {
        await axios.put(`${API}/tasks/${editing.id}`, form);
        showNotification("Sarcină actualizată!");
      } else {
        await axios.post(`${API}/tasks`, form);
        showNotification("Sarcină creată!");
      }
      setShowModal(false);
      fetchTasks();
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi sarcina?")) return;
    try { await axios.delete(`${API}/tasks/${id}`); showNotification("Șters!"); fetchTasks(); }
    catch { showNotification("Eroare", "error"); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== "done").length;
  const pending = tasks.filter(t => t.status === "pending").length;
  const done    = tasks.filter(t => t.status === "done").length;

  const filteredTasks = tasks.filter(t => {
    if (filterAction && t.action_type !== filterAction) return false;
    return true;
  });

  const needsContact  = ["sunat", "email", "whatsapp"].includes(form.action_type);
  const needsLead     = form.entity_type === "lead";
  const needsMeeting  = form.action_type === "intalnire" || form.meeting_scheduled;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "De Făcut",  value: pending,       color: "#6b7280" },
          { label: "Depășite",  value: overdue,       color: "#ef4444" },
          { label: "Finalizate",value: done,           color: "#10b981" },
          { label: "Total",     value: tasks.length,  color: "#3b82f6" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "130px" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: "700", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate statusurile</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate prioritățile</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate tipurile</option>
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}
        </select>
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Sarcină Nouă
        </button>
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {filteredTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af", background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb" }}>Nicio sarcină.</div>
        ) : filteredTasks.map(task => {
          const priority   = PRIORITIES.find(p => p.value === task.priority);
          const status     = STATUSES.find(s => s.value === task.status);
          const actionType = ACTION_TYPES.find(a => a.value === (task.action_type || "general"));
          const isOverdue  = task.due_date && task.due_date < today && task.status !== "done";
          const isDone     = task.status === "done";
          return (
            <div key={task.id} style={{ background: "#fff", border: `1px solid ${isOverdue ? "#fca5a5" : "#e5e7eb"}`, borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: "12px", opacity: isDone ? 0.65 : 1, borderLeft: `4px solid ${priority?.color || "#6b7280"}` }}>
              <button onClick={() => toggleDone(task)} style={{ background: "none", border: "none", cursor: "pointer", color: isDone ? "#10b981" : "#9ca3af", flexShrink: 0, marginTop: "2px" }}>
                {isDone ? <CheckSquare size={22} /> : <Square size={22} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {/* Tip acțiune badge */}
                  <span style={{ fontSize: "0.8rem", background: actionType?.bg, color: actionType?.color, borderRadius: "8px", padding: "2px 8px", fontWeight: 600 }}>
                    {actionType?.icon} {actionType?.label}
                  </span>
                  <span style={{ fontWeight: "600", fontSize: "0.95rem", textDecoration: isDone ? "line-through" : "none", color: isDone ? "#9ca3af" : "#1f2937" }}>{task.title}</span>
                  <span style={{ padding: "1px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: "600", background: priority?.color, color: "#fff" }}>{priority?.label}</span>
                  {isOverdue && <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "#ef4444", fontSize: "0.75rem", fontWeight: "600" }}><AlertCircle size={12} /> Depășit</span>}
                </div>
                {task.description && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "3px" }}>{task.description}</div>}

                {/* Persoana de contactat */}
                {(task.contact_name || task.contact_phone || task.contact_email) && (
                  <div style={{ display: "flex", gap: "12px", marginTop: "5px", flexWrap: "wrap" }}>
                    {task.contact_name  && <span style={{ fontSize: "0.78rem", color: "#374151", fontWeight: 500 }}>👤 {task.contact_name}</span>}
                    {task.contact_phone && <span style={{ fontSize: "0.78rem", color: "#10b981" }}>📞 {task.contact_phone}</span>}
                    {task.contact_email && <span style={{ fontSize: "0.78rem", color: "#3b82f6" }}>✉️ {task.contact_email}</span>}
                  </div>
                )}

                {/* Lead info */}
                {(task.lead_company || task.lead_contact_person) && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                    {task.lead_company       && <span style={{ fontSize: "0.78rem", background: "#fef3c7", color: "#92400e", borderRadius: "6px", padding: "1px 8px", fontWeight: 600 }}>🏢 {task.lead_company}</span>}
                    {task.lead_contact_person && <span style={{ fontSize: "0.78rem", color: "#374151" }}>👤 {task.lead_contact_person}</span>}
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px", marginTop: "5px", fontSize: "0.75rem", color: "#9ca3af", flexWrap: "wrap", alignItems: "center" }}>
                  {task.due_date    && <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={11} /> {task.due_date}{task.due_time ? ` ${task.due_time}` : ""}</span>}
                  {task.assigned_to && <span>→ {task.assigned_to}</span>}
                  {task.collaborator && <span style={{ color: "#8b5cf6" }}>🤝 {task.collaborator}</span>}
                  {task.entity_name  && <span>📎 {task.entity_name}</span>}
                  {(task.meeting_scheduled || task.action_type === "intalnire") && task.meeting_with && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#ede9fe", color: "#6d28d9", borderRadius: "10px", padding: "1px 8px", fontWeight: 600 }}>
                      🤝 {task.meeting_with}{task.meeting_datetime ? ` · ${task.meeting_datetime.replace("T", " ").slice(0, 16)}` : ""}
                    </span>
                  )}
                  <span style={{ color: status?.color, fontWeight: 600 }}>{status?.label}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button onClick={() => openEdit(task)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }}><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px 28px", width: "100%", maxWidth: "600px", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "700" }}>{editing ? "Editează Sarcină" : "Sarcină Nouă"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {/* 1. Tip acțiune */}
            <div style={sec}>Tip Acțiune</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              {ACTION_TYPES.map(a => (
                <button key={a.value} onClick={() => setForm(f => ({ ...f, action_type: a.value, meeting_scheduled: a.value === "intalnire" ? true : f.meeting_scheduled }))}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "20px", border: `2px solid ${form.action_type === a.value ? a.color : "#e5e7eb"}`, background: form.action_type === a.value ? a.bg : "#fff", color: form.action_type === a.value ? a.color : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", transition: "all 0.15s" }}>
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>

            {/* 2. Titlu + Descriere */}
            <div style={sec}>Detalii Sarcină</div>
            <div style={{ display: "grid", gap: "10px" }}>
              <div>
                <label style={lbl}>Titlu *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ce trebuie făcut?" style={inp} />
              </div>
              <div>
                <label style={lbl}>Descriere</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={lbl}>Prioritate</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Termen</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Ora</label>
                  <input type="time" value={form.due_time || "09:00"} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inp, maxWidth: "200px" }}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* 3. Persoana de contactat — apare la sunat/email/whatsapp */}
            {needsContact && (
              <>
                <div style={sec}>
                  {form.action_type === "sunat" ? "📞 Persoana de sunat" : form.action_type === "email" ? "✉️ Destinatar Email" : "💬 Contact WhatsApp"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={lbl}>Nume persoană</label>
                    <input type="text" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="ex: Ion Popescu" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>
                      {form.action_type === "email" ? "Adresă Email" : "Telefon / WhatsApp"}
                    </label>
                    <input
                      type={form.action_type === "email" ? "email" : "tel"}
                      value={form.action_type === "email" ? form.contact_email : form.contact_phone}
                      onChange={e => setForm(f => form.action_type === "email"
                        ? { ...f, contact_email: e.target.value }
                        : { ...f, contact_phone: e.target.value }
                      )}
                      placeholder={form.action_type === "email" ? "ex: ion@firma.ro" : "ex: +40712345678"}
                      style={inp}
                    />
                  </div>
                  {form.action_type !== "email" && (
                    <div>
                      <label style={lbl}>Email (opțional)</label>
                      <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="ex: ion@firma.ro" style={inp} />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 4. Lead info — apare când entity_type = lead */}
            <div style={sec}>Legătură cu</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={lbl}>Tip entitate</label>
                <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))} style={inp}>
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t === "lead" ? "🎯 Lead" : t === "candidate" ? "👤 Candidat" : t === "company" ? "🏢 Companie" : t === "case" ? "📁 Dosar" : t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Nume entitate</label>
                <input type="text" value={form.entity_name} onChange={e => setForm(f => ({ ...f, entity_name: e.target.value }))} placeholder="ex: Ion Popescu / SC Construct SRL" style={inp} />
              </div>
            </div>

            {needsLead && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px", padding: "12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px" }}>
                <div>
                  <label style={{ ...lbl, color: "#92400e" }}>🏢 Denumire Companie Lead</label>
                  <input type="text" value={form.lead_company} onChange={e => setForm(f => ({ ...f, lead_company: e.target.value }))} placeholder="ex: SC Construcții SRL" style={inp} />
                </div>
                <div>
                  <label style={{ ...lbl, color: "#92400e" }}>👤 Persoana de Contact</label>
                  <input type="text" value={form.lead_contact_person} onChange={e => setForm(f => ({ ...f, lead_contact_person: e.target.value }))} placeholder="ex: Director General" style={inp} />
                </div>
                {!needsContact && (
                  <>
                    <div>
                      <label style={{ ...lbl, color: "#92400e" }}>📞 Telefon</label>
                      <input type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+40712345678" style={inp} />
                    </div>
                    <div>
                      <label style={{ ...lbl, color: "#92400e" }}>✉️ Email</label>
                      <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@firma.ro" style={inp} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 5. Întâlnire */}
            {needsMeeting && (
              <>
                <div style={sec}>🤝 Detalii Întâlnire</div>
                <div style={{ display: "grid", gap: "10px", padding: "12px", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: "8px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={lbl}>Cu cine</label>
                      <input type="text" value={form.meeting_with} onChange={e => setForm(f => ({ ...f, meeting_with: e.target.value }))} placeholder="Nume persoană / firmă" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Date contact</label>
                      <input type="text" value={form.meeting_contact} onChange={e => setForm(f => ({ ...f, meeting_contact: e.target.value }))} placeholder="Telefon / email" style={inp} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Data și ora întâlnirii</label>
                    <input type="datetime-local" value={form.meeting_datetime} onChange={e => setForm(f => ({ ...f, meeting_datetime: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Materiale necesare / Agenda</label>
                    <textarea value={form.meeting_materials} onChange={e => setForm(f => ({ ...f, meeting_materials: e.target.value }))} rows={2} placeholder="Ce trebuie pregătit, agenda întâlnirii..." style={{ ...inp, resize: "vertical" }} />
                  </div>
                </div>
              </>
            )}
            {form.action_type !== "intalnire" && (
              <div style={{ marginTop: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.875rem", color: "#6b7280" }}>
                  <input type="checkbox" checked={form.meeting_scheduled} onChange={e => setForm(f => ({ ...f, meeting_scheduled: e.target.checked }))} style={{ width: 15, height: 15 }} />
                  Adaugă și o programare întâlnire pentru această sarcină
                </label>
              </div>
            )}

            {/* 6. Echipă */}
            <div style={sec}>👥 Echipă</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={lbl}>Atribuit</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp}>
                  <option value="">— Selectează —</option>
                  <option value="Ioan Baciu">Ioan Baciu</option>
                  {operators.filter(op => op.active !== false).map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Email persoană atribuită</label>
                <input type="email" value={form.assigned_email} onChange={e => setForm(f => ({ ...f, assigned_email: e.target.value }))} placeholder="ex: coleg@firma.ro" style={inp} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>🤝 Coleg colaborator</label>
                <select value={form.collaborator} onChange={e => setForm(f => ({ ...f, collaborator: e.target.value }))} style={inp}>
                  <option value="">— Fără colaborator —</option>
                  <option value="Ioan Baciu">Ioan Baciu</option>
                  {operators.filter(op => op.active !== false).map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                </select>
              </div>
            </div>

            {/* 7. Notificări */}
            <div style={sec}>🔔 Notificări Email</div>
            <div style={{ display: "flex", gap: "20px", padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "0.875rem", cursor: "pointer" }}>
                <input type="checkbox" checked={form.notify_24h} onChange={e => setForm(f => ({ ...f, notify_24h: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                Email 24h înainte
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "0.875rem", cursor: "pointer" }}>
                <input type="checkbox" checked={form.notify_3h} onChange={e => setForm(f => ({ ...f, notify_3h: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                Email 3h înainte
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "9px 22px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "9px 22px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editing ? "Salvează" : "Adaugă"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
