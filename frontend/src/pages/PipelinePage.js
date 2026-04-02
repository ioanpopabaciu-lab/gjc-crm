import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Plus, X } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const PipelinePage = ({ showNotification }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);

  const pipelineStages = [
    { id: "lead", name: "Lead", color: "#6b7280" },
    { id: "contact", name: "Contact", color: "#3b82f6" },
    { id: "negociere", name: "Negociere", color: "#f59e0b" },
    { id: "contract", name: "Contract", color: "#8b5cf6" },
    { id: "câștigat", name: "Câștigat", color: "#10b981" }
  ];

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/pipeline`);
      setOpportunities(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea pipeline-ului", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const moveOpportunity = async (oppId, newStage) => {
    try {
      await axios.put(`${API}/pipeline/${oppId}`, { stage: newStage });
      showNotification("Oportunitate actualizată!");
      fetchPipeline();
    } catch (error) {
      showNotification("Eroare la actualizare", "error");
    }
  };

  const [showModal, setShowModal] = useState(false);
  const [newOpp, setNewOpp] = useState({ stage: "lead", probability: 20, positions: 1, filled: 0, value: 0 });
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      await axios.post(`${API}/pipeline`, newOpp);
      showNotification("Oportunitate creată!");
      setShowModal(false);
      setNewOpp({ stage: "lead", probability: 20, positions: 1, filled: 0, value: 0 });
      fetchPipeline();
    } catch { showNotification("Eroare la creare", "error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi această oportunitate?")) return;
    try {
      await axios.delete(`${API}/pipeline/${id}`);
      showNotification("Șters!");
      fetchPipeline();
    } catch { showNotification("Eroare la ștergere", "error"); }
  };

  const getStageTotal = (stageId) => {
    return opportunities
      .filter(o => o.stage === stageId)
      .reduce((sum, o) => sum + (o.value * (o.probability / 100)), 0);
  };

  const totalPipelineValue = opportunities.reduce((s, o) => s + (o.value * (o.probability / 100)), 0);

  return (
    <div className="module-container pipeline-module" data-testid="pipeline-module">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            <TrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Valoare ponderată totală: <strong style={{ color: 'var(--primary)' }}>€{Math.round(totalPipelineValue).toLocaleString()}</strong>
          </span>
          <span className="records-count">{opportunities.length} oportunități</span>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Oportunitate Nouă
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
        <div className="pipeline-board">
          {pipelineStages.map((stage) => (
            <div key={stage.id} className="pipeline-column" data-testid={`stage-${stage.id}`}>
              <div className="column-header" style={{ borderColor: stage.color }}>
                <h3>{stage.name}</h3>
                <span className="column-total">€{getStageTotal(stage.id).toLocaleString()}</span>
              </div>
              <div className="column-body">
                {opportunities
                  .filter(o => o.stage === stage.id)
                  .map((opp) => (
                    <div key={opp.id} className="opportunity-card">
                      <h4>{opp.title}</h4>
                      <p className="company">{opp.company_name}</p>
                      <div className="opp-details">
                        <span className="value">€{opp.value.toLocaleString()}</span>
                        <span className="probability">{opp.probability}%</span>
                      </div>
                      <div className="positions-bar">
                        <div className="filled" style={{ width: `${(opp.filled / opp.positions) * 100}%` }} />
                        <span>{opp.filled}/{opp.positions} poziții</span>
                      </div>
                      <div className="opp-actions">
                        {pipelineStages.map((s, idx) => (
                          s.id !== stage.id && (
                            <button
                              key={s.id}
                              className="move-btn"
                              onClick={() => moveOpportunity(opp.id, s.id)}
                              title={`Mută la ${s.name}`}
                            >
                              {idx > pipelineStages.findIndex(ps => ps.id === stage.id) ? (
                                <ArrowUpRight size={14} />
                              ) : (
                                <ArrowDownRight size={14} />
                              )}
                            </button>
                          )
                        ))}
                        <button className="move-btn danger" onClick={() => handleDelete(opp.id)} title="Șterge">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Oportunitate Nouă */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Oportunitate Nouă</h2>
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
                    <select value={newOpp.stage} onChange={e => setNewOpp({...newOpp, stage: e.target.value})}>
                      {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                    <label>Poziții</label>
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
                <button className="btn btn-primary" onClick={handleCreate}>Creează</button>
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default PipelinePage;
