import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FileText, Plus } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const DocumentsPage = ({ showNotification }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/documents`);
      setDocuments(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea documentelor", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="module-container" data-testid="documents-module">
      <div className="module-toolbar">
        <h3>Gestionare Documente</h3>
        <button className="btn btn-primary" data-testid="upload-doc-btn">
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="documents-grid">
          {documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>Nu există documente încărcate.</p>
              <small>Modulul de upload va fi disponibil în versiunea completă.</small>
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="document-card">
                <FileText size={32} />
                <h4>{doc.file_name}</h4>
                <span className="doc-type">{doc.doc_type}</span>
                <span className="doc-expiry">{doc.expiry_date || "N/A"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
