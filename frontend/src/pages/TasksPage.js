import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, CheckSquare, Square, AlertCircle, Clock } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PRIORITIES = [
  { value: "urgent", label: "Urgent",  color: "#ef4444" },
  { value: "high",   label: "Ridicat", color: "#f97316" },
  { value: "normal", label: "Normal",  color: "#3b82f6" },
  { value: "low",    label: "Scăzut",  color: "#6b7280" },
];

const STATUSES = [
  { value: "pending",     label: "De făcut",    color: "#6b7280" },
  { value: "in_progress", label: "În lucru",    color: "#3b82f6" },
  { value: "done",        label: "Finalizat",   color: "#10b981" },
];

const ENTITY_TYPES = ["general", "candidate", "company", "case", "contract", "payment"];

const emptyForm = {
  title: "", description: "",
  entity_type: "general", entity_id: "", entity_name: "",
  due_date: "", priority: "normal", status: "pending", assigned_to: "",
};

const TasksPage = ({ showNotification }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [operators, setOperators] = useState([]);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
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
  const done = tasks.filter(t => t.status === "done").length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "De Făcut", value: pending, color: "#6b7280" },
          { label: "Depășite", value: overdue, color: "#ef4444" },
          { label: "Finalizate", value: done, color: "#10b981" },
          { label: "Total", value: tasks.length, color: "#3b82f6" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "130px" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: "700", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate statusurile</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate prioritățile</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Sarcină Nouă
        </button>
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af", background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb" }}>Nicio sarcină. Adaugă prima sarcină.</div>
        ) : tasks.map(task => {
          const priority = PRIORITIES.find(p => p.value === task.priority);
          const status = STATUSES.find(s => s.value === task.status);
          const isOverdue = task.due_date && task.due_date < today && task.status !== "done";
          const isDone = task.status === "done";
          return (
            <div key={task.id} style={{ background: "#fff", border: `1px solid ${isOverdue ? "#fca5a5" : "#e5e7eb"}`, borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px", opacity: isDone ? 0.65 : 1, borderLeft: `4px solid ${priority?.color || "#6b7280"}` }}>
              <button onClick={() => toggleDone(task)} style={{ background: "none", border: "none", cursor: "pointer", color: isDone ? "#10b981" : "#9ca3af", flexShrink: 0 }}>
                {isDone ? <CheckSquare size={22} /> : <Square size={22} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: "600", fontSize: "0.95rem", textDecoration: isDone ? "line-through" : "none", color: isDone ? "#9ca3af" : "#1f2937" }}>{task.title}</span>
                  <span style={{ padding: "1px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: "600", background: priority?.color, color: "#fff" }}>{priority?.label}</span>
                  {isOverdue && <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "#ef4444", fontSize: "0.75rem", fontWeight: "600" }}><AlertCircle size={12} /> Depășit</span>}
                </div>
                {task.description && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "2px" }}>{task.description}</div>}
                <div style={{ display: "flex", gap: "14px", marginTop: "4px", fontSize: "0.75rem", color: "#9ca3af", flexWrap: "wrap" }}>
                  {task.due_date && <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={11} /> {task.due_date}</span>}
                  {task.assigned_to && <span>→ {task.assigned_to}</span>}
                  {task.entity_name && <span>📎 {task.entity_name}</span>}
                  <span style={{ color: status?.color }}>{status?.label}</span>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700" }}>{editing ? "Editează Sarcină" : "Sarcină Nouă"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Titlu *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ce trebuie făcut?" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Descriere</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Prioritate</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Termen Limită</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Atribuit</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Selectează —</option>
                    <option value="Ioan Baciu">Ioan Baciu</option>
                    {operators.filter(op => op.active !== false).map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Tip Entitate</label>
                  <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Entitate (nume)</label>
                  <input type="text" value={form.entity_name} onChange={e => setForm(f => ({ ...f, entity_name: e.target.value }))} placeholder="Ex: Ion Popescu" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
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
