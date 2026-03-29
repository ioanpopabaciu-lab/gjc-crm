import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
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

  const getStageTotal = (stageId) => {
    return opportunities
      .filter(o => o.stage === stageId)
      .reduce((sum, o) => sum + (o.value * (o.probability / 100)), 0);
  };

  return (
    <div className="module-container pipeline-module" data-testid="pipeline-module">
      {loading ? <LoadingSpinner /> : (
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
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PipelinePage;
