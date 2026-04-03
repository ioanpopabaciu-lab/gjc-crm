import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { TrendingUp, Plus, X } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PIPELINE_STAGES = [
  { id: "lead",       name: "Lead Nou",            color: "#6b7280", prob: 5   },
  { id: "contactat",  name: "Contactat",            color: "#3b82f6", prob: 15  },
  { id: "intalnire",  name: "Întâlnire",            color: "#8b5cf6", prob: 30  },
  { id: "oferta",     name: "Ofertă Trimisă",       color: "#f59e0b", prob: 50  },
  { id: "negociere",  name: "Negociere",            color: "#f97316", prob: 65  },
  { id: "contract",   name: "Contract Semnat",      color: "#10b981", prob: 80  },
  { id: "recrutare",  name: "Recrutare Activă",     color: "#06b6d4", prob: 85  },
  { id: "interviuri", name: "Interviuri",           color: "#6366f1", prob: 90  },
  { id: "selectat",   name: "Candidați Selectați",  color: "#84cc16", prob: 95  },
  { id: "castigat",   name: "Câștigat / Plasat",    color: "#22c55e", prob: 100 },
];

const PipelinePage = ({ showNotification }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOpp, setEditingOpp] = useState(null);
  const [newOpp, setNewOpp] = useState({ stage: "lead", probability: 5, positions: 1, filled: 0, value: 0 });
  const [companies, setCompanies] = useState([]);
  const dragItem = useRef(null);
  const dragOverStage = useRef(null);

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/pipeline`);
      setOpportunities(response.data);
    } catch {
      showNotification("Eroare la încărcarea pipeline-ului", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchPipeline();
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
  }, [fetchPipeline]);

  const moveOpportunity = async (oppId, newStage) => {
    const stage = PIPELINE_STAGES.find(s => s.id === newStage);
    try {
      await axios.put(`${API}/pipeline/${oppId}`, { stage: newStage, probability: stage?.prob || 20 });
      setOpportunities(prev => prev.map(o => o.id === oppId ? { ...o, stage: newStage, probability: stage?.prob || 20 } : o));
    } catch {
      showNotification("Eroare la actualizare", "error");
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e, oppId) => {
    dragItem.current = oppId;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverStage.current = stageId;
  };

  const handleDrop = (e, stageId) => {
    e.preventDefault();
    if (dragItem.current && stageId) {
      const opp = opportunities.find(o => o.id === dragItem.current);
      if (opp && opp.stage !== stageId) {
        moveOpportunity(dragItem.current, stageId);
      }
    }
    dragItem.current = null;
    dragOverStage.current = null;
  };

  const openCreate = (stageId = "lead") => {
    setEditingOpp(null);
    const stage = PIPELINE_STAGES.find(s => s.id === stageId);
    setNewOpp({ stage: stageId, probability: stage?.prob || 5, positions: 1, filled: 0, value: 0 });
    setShowModal(true);
  };

  const openEdit = (opp) => {
    setEditingOpp(opp);
    setNewOpp({
      title: opp.title,
      company_id: opp.company_id || "",
      company_name: opp.company_name || "",
      stage: opp.stage,
      value: opp.value || 0,
      probability: opp.probability || 5,
      positions: opp.positions || 1,
      filled: opp.filled || 0,
      notes: opp.notes || "",
    });
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!newOpp.title) return showNotification("Introdu titlul oportunității", "error");
    try {
      if (editingOpp) {
        await axios.put(`${API}/pipeline/${editingOpp.id}`, newOpp);
        showNotification("Oportunitate actualizată!");
      } else {
        await axios.post(`${API}/pipeline`, newOpp);
        showNotification("Oportunitate creată!");
      }
      setShowModal(false);
      setNewOpp({ stage: "lead", probability: 5, positions: 1, filled: 0, value: 0 });
      fetchPipeline();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi această oportunitate?")) return;
    try {
      await axios.delete(`${API}/pipeline/${id}`);
      showNotification("Șters!");
      fetchPipeline();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const totalPipelineValue = opportunities.reduce((s, o) => s + ((o.value || 0) * ((o.probability || 0) / 100)), 0);

  return (
    <div className="module-container pipeline-module" data-testid="pipeline-module">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            <TrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Valoare ponderată: <strong style={{ color: 'var(--primary)' }}>€{Math.round(totalPipelineValue).toLocaleString()}</strong>
          </span>
          <span className="records-count">{opportunities.length} oportunități</span>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} /> Oportunitate Nouă
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={{ overflowX: "auto", paddingBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", minWidth: `${PIPELINE_STAGES.length * 220}px`, alignItems: "flex-start" }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageOpps = opportunities.filter(o => o.stage === stage.id);
              const stageValue = stageOpps.reduce((s, o) => s + ((o.value || 0) * ((o.probability || 0) / 100)), 0);
              return (
                <div
                  key={stage.id}
                  style={{ flex: "0 0 210px", width: "210px" }}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDrop={e => handleDrop(e, stage.id)}
                >
                  {/* Column header */}
                  <div style={{ borderTop: `3px solid ${stage.color}`, background: "#fff", borderRadius: "8px 8px 0 0", padding: "10px 12px", borderLeft: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", fontSize: "0.8rem", color: "#1f2937" }}>{stage.name}</span>
                      <span style={{ background: stage.color, color: "#fff", borderRadius: "12px", padding: "1px 7px", fontSize: "0.7rem", fontWeight: "700" }}>{stageOpps.length}</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "2px" }}>€{Math.round(stageValue).toLocaleString()}</div>
                  </div>

                  {/* Cards */}
                  <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", minHeight: "120px", padding: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {stageOpps.map(opp => (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={e => handleDragStart(e, opp.id)}
                        style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px 12px", cursor: "grab", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "box-shadow 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"}
                      >
                        <div style={{ fontWeight: "600", fontSize: "0.8rem", color: "#1f2937", marginBottom: "3px", lineHeight: "1.3" }}>{opp.title}</div>
                        {opp.company_name && <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "6px" }}>{opp.company_name}</div>}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontWeight: "700", color: "#10b981", fontSize: "0.8rem" }}>€{(opp.value || 0).toLocaleString()}</span>
                          <span style={{ background: "#f3f4f6", color: "#374151", padding: "1px 6px", borderRadius: "6px", fontSize: "0.7rem" }}>{opp.probability}%</span>
                        </div>
                        {opp.positions > 0 && (
                          <div style={{ marginBottom: "6px" }}>
                            <div style={{ background: "#e5e7eb", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
                              <div style={{ background: stage.color, height: "100%", width: `${Math.min(100, ((opp.filled || 0) / (opp.positions || 1)) * 100)}%`, transition: "width 0.3s" }} />
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginTop: "2px" }}>{opp.filled || 0}/{opp.positions} poziții</div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                          <button onClick={() => openEdit(opp)} style={{ background: "#eff6ff", border: "none", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "0.65rem", color: "#3b82f6" }}>Edit</button>
                          <button onClick={() => handleDelete(opp.id)} style={{ background: "#fef2f2", border: "none", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "0.65rem", color: "#ef4444" }}>×</button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => openCreate(stage.id)}
                      style={{ background: "none", border: "1px dashed #d1d5db", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "#9ca3af", fontSize: "0.75rem", marginTop: "auto" }}
                    >
                      + Adaugă
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingOpp ? "Editează Oportunitate" : "Oportunitate Nouă"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Titlu *</label>
                  <input type="text" value={newOpp.title || ""} onChange={e => setNewOpp({...newOpp, title: e.target.value})} placeholder="Ex: Recrutare 10 sudori pentru..." />
                </div>
                <div className="form-group">
                  <label>Companie</label>
                  <select value={newOpp.company_id || ""} onChange={e => {
                    const c = companies.find(c => c.id === e.target.value);
                    setNewOpp({...newOpp, company_id: e.target.value, company_name: c?.name || ""});
                  }}>
                    <option value="">Selectează...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Etapă</label>
                  <select value={newOpp.stage} onChange={e => {
                    const s = PIPELINE_STAGES.find(ps => ps.id === e.target.value);
                    setNewOpp({...newOpp, stage: e.target.value, probability: s?.prob || 5});
                  }}>
                    {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Valoare (€)</label>
                  <input type="number" value={newOpp.value} onChange={e => setNewOpp({...newOpp, value: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Probabilitate (%)</label>
                  <input type="number" min="0" max="100" value={newOpp.probability} onChange={e => setNewOpp({...newOpp, probability: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label>Poziții cerute</label>
                  <input type="number" min="1" value={newOpp.positions} onChange={e => setNewOpp({...newOpp, positions: parseInt(e.target.value) || 1})} />
                </div>
                <div className="form-group">
                  <label>Poziții ocupate</label>
                  <input type="number" min="0" value={newOpp.filled} onChange={e => setNewOpp({...newOpp, filled: parseInt(e.target.value) || 0})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleCreate}>{editingOpp ? "Salvează" : "Creează"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelinePage;
