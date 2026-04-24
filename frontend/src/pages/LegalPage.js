import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Scale, Upload, FileText, Search, Download, CheckCircle, AlertTriangle,
  Plus, Trash2, RefreshCw, ChevronRight, X, Eye, Edit3, Users,
  BookOpen, Zap, Globe, Info, FileSearch, Tag
} from 'lucide-react';
import { API } from '../config';

// Icoane și culori pe categorie
const CATEGORY_META = {
  'Raporturi de muncă':           { icon: '⚒️', color: '#2563eb', bg: '#eff6ff' },
  'Sesizări instituții control':  { icon: '🏛️', color: '#d97706', bg: '#fffbeb' },
  'Proceduri IGI / Imigrare':     { icon: '🛂', color: '#7c3aed', bg: '#f5f3ff' },
  'Instanțe judecătorești':       { icon: '⚖️', color: '#dc2626', bg: '#fef2f2' },
  'Contestații și memorii':       { icon: '📋', color: '#059669', bg: '#f0fdf4' },
  'Documente GJC / Corespondență':{ icon: '🏢', color: '#0891b2', bg: '#f0f9ff' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => (n || 0).toLocaleString('ro-RO');

const ACT_TYPES = [
  { value: 'cod',    label: 'Cod (Muncii, Civil etc.)' },
  { value: 'lege',   label: 'Lege' },
  { value: 'oug',    label: 'OUG / OG' },
  { value: 'hg',     label: 'HG / HCL' },
  { value: 'ordin',  label: 'Ordin minister' },
  { value: 'altul',  label: 'Alt act' },
];

// Acte normative recomandate (pentru scraping din surse oficiale)
const RECOMMENDED_ACTS = [
  { title: 'Codul Muncii (Legea 53/2003, republicat)', url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/266893', type: 'cod',  priority: 'CRITIC' },
  { title: 'OUG 56/2007 — Încadrarea în muncă a străinilor',  url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/81993',  type: 'oug',  priority: 'CRITIC' },
  { title: 'Legea 108/1999 — Inspecția Muncii',                url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/16354',  type: 'lege', priority: 'CRITIC' },
  { title: 'OUG 194/2002 — Regimul Străinilor în România',     url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/55826',  type: 'oug',  priority: 'RIDICAT' },
  { title: 'Legea 156/2000 — Protecția cetățenilor români în străinătate', url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/22814', type: 'lege', priority: 'RIDICAT' },
  { title: 'Legea 319/2006 — Securitate și Sănătate în Muncă', url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/74762',  type: 'lege', priority: 'MEDIU' },
  { title: 'HG 905/2017 — Registrul salariaților (REVISAL)',   url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/185534', type: 'hg',   priority: 'MEDIU' },
  { title: 'Legea 62/2011 — Dialogul Social',                  url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/135836', type: 'lege', priority: 'MEDIU' },
  { title: 'OG 137/2000 — Prevenirea discriminării',           url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/16835',  type: 'og',   priority: 'MEDIU' },
  { title: 'Legea 122/2006 — Azilul în România',               url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/75406',  type: 'lege', priority: 'SCAZUT' },
];

const PRIORITY_COLORS = {
  CRITIC:  { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  RIDICAT: { bg: '#fff7ed', color: '#9a3412', border: '#fdba74' },
  MEDIU:   { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  SCAZUT:  { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
};

// ── Componenta principală ─────────────────────────────────────────────────────
const LegalPage = ({ showNotification }) => {
  const [tab, setTab]               = useState('generate');  // generate | corpus | documents | search
  const [stats, setStats]           = useState({});
  const [templates, setTemplates]   = useState([]);
  const [acts, setActs]             = useState([]);
  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(false);

  // Generate
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables]               = useState({});
  const [generating, setGenerating]             = useState(false);
  const [generatedDoc, setGeneratedDoc]         = useState(null);
  const [bulkMode, setBulkMode]                 = useState(false);
  const [bulkCandidates, setBulkCandidates]     = useState([{}]);

  // Companies/Candidates autocomplete
  const [companies, setCompanies]   = useState([]);
  const [candidates, setCandidates] = useState([]);

  // Corpus upload
  const [uploadingAct, setUploadingAct] = useState(false);
  const [actForm, setActForm]           = useState({ title: '', act_type: 'lege', act_number: '', act_year: new Date().getFullYear().toString(), source_url: '' });
  const uploadRef                       = useRef();

  // Search
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]       = useState(false);

  // Scrape job
  const [scrapeJobs, setScrapeJobs] = useState([]);

  // Preview document generat
  const [previewDoc, setPreviewDoc]     = useState(null);
  const [editingText, setEditingText]   = useState('');
  const [savingEdit, setSavingEdit]     = useState(false);

  // Preview MODEL (șablon)
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // ── Fetch date ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [statsR, tmplR, actsR, docsR] = await Promise.allSettled([
        axios.get(`${API}/legal/stats`),
        axios.get(`${API}/legal/templates`),
        axios.get(`${API}/legal/acts`),
        axios.get(`${API}/legal/documents`),
      ]);
      if (statsR.status === 'fulfilled') setStats(statsR.value.data);
      if (tmplR.status  === 'fulfilled') setTemplates(tmplR.value.data);
      if (actsR.status  === 'fulfilled') setActs(actsR.value.data);
      if (docsR.status  === 'fulfilled') setDocuments(docsR.value.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(() => {});
    axios.get(`${API}/legal/scrape-jobs?status=pending`).then(r => setScrapeJobs(r.data)).catch(() => {});
  }, [fetchAll]);

  // ── Selectare template ────────────────────────────────────────────────────
  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    const initVars = {};
    (tmpl.variables || []).forEach(v => { initVars[v.key] = ''; });
    setVariables(initVars);
    setGeneratedDoc(null);
    setBulkCandidates([{}]);
    setBulkMode(false);
  };

  // Auto-fill din CRM când se selectează companie/candidat
  const handleCompanySelect = (company) => {
    setVariables(prev => ({
      ...prev,
      angajator_name:    company.name || '',
      angajat_name:      company.name || '',
      angajator_cui:     company.cui  || '',
      angajat_cui:       company.cui  || '',
      angajator_adresa:  company.address || `${company.city || ''} ${company.county || ''}`.trim(),
      angajat_adresa:    company.address || `${company.city || ''} ${company.county || ''}`.trim(),
    }));
  };

  const handleCandidateSelect = (cand) => {
    const fullName = `${cand.first_name || ''} ${cand.last_name || ''}`.trim();
    setVariables(prev => ({
      ...prev,
      candidat_name:          fullName,
      mandant_name:           fullName,
      sesizant_name:          fullName,
      candidat_cnp:           cand.cnp || cand.passport_number || '',
      mandant_pasaport:       cand.passport_number || '',
      candidat_nationalitate: cand.nationality || '',
      mandant_nationalitate:  cand.nationality || '',
      mandant_nascut:         cand.birth_date   || '',
    }));
  };

  // ── Generare document ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setGeneratedDoc(null);
    try {
      const payload = {
        template_id: selectedTemplate.id,
        variables,
        extra_context: '',
        ...(bulkMode && selectedTemplate.bulk_mode ? { bulk_candidates: bulkCandidates } : {}),
      };
      const r = await axios.post(`${API}/legal/generate`, payload);
      if (r.data.bulk) {
        setGeneratedDoc({ bulk: true, documents: r.data.documents });
        showNotification(`✓ ${r.data.count} documente generate cu succes!`);
      } else {
        setGeneratedDoc(r.data);
        showNotification('✓ Document generat! Verificați citările și validați.');
      }
      fetchAll();
    } catch (e) {
      showNotification(e.response?.data?.detail || 'Eroare la generare', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Upload act legislativ ─────────────────────────────────────────────────
  const handleUploadAct = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!actForm.title.trim()) {
      showNotification('Introduceți titlul actului normativ', 'error');
      return;
    }
    setUploadingAct(true);
    try {
      const fd = new FormData();
      fd.append('file',       file);
      fd.append('title',      actForm.title);
      fd.append('act_type',   actForm.act_type);
      fd.append('act_number', actForm.act_number);
      fd.append('act_year',   actForm.act_year);
      fd.append('source_url', actForm.source_url);
      const r = await axios.post(`${API}/legal/acts/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (r.data.status === 'skipped') {
        showNotification('Actul este deja în corpus (hash identic)', 'error');
      } else {
        showNotification(`✓ ${r.data.message} | ${r.data.chunks} fragmente indexate`);
        setActForm({ title: '', act_type: 'lege', act_number: '', act_year: new Date().getFullYear().toString(), source_url: '' });
        fetchAll();
      }
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Eroare la upload', 'error');
    } finally {
      setUploadingAct(false);
      e.target.value = '';
    }
  };

  // ── Submit job scraping ───────────────────────────────────────────────────
  const handleAddScrapeJob = async (act) => {
    try {
      await axios.post(`${API}/legal/scrape-jobs`, {
        url: act.url, act_type: act.type, title: act.title,
      });
      showNotification(`Job adăugat: ${act.title}`);
      const r = await axios.get(`${API}/legal/scrape-jobs?status=pending`);
      setScrapeJobs(r.data);
    } catch (e) {
      showNotification(e.response?.data?.detail || 'Eroare', 'error');
    }
  };

  const handleApproveJob = async (jobId) => {
    try {
      setLoading(true);
      const r = await axios.post(`${API}/legal/scrape-jobs/${jobId}/approve`);
      showNotification(`✓ ${r.data.title} — ${r.data.chunks} fragmente indexate`);
      const r2 = await axios.get(`${API}/legal/scrape-jobs?status=pending`);
      setScrapeJobs(r2.data);
      fetchAll();
    } catch (e) {
      showNotification(e.response?.data?.detail || 'Eroare scraping', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Căutare ───────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await axios.get(`${API}/legal/search?q=${encodeURIComponent(searchQuery)}&top_k=15`);
      setSearchResults(r.data);
    } catch {
      showNotification('Eroare la căutare', 'error');
    } finally {
      setSearching(false);
    }
  };

  // ── Descarcă document ─────────────────────────────────────────────────────
  const handleDownload = (docId, filename) => {
    window.open(`${API}/legal/documents/${docId}/download`, '_blank');
  };

  // ── Validare document ─────────────────────────────────────────────────────
  const handleValidate = async (docId) => {
    try {
      await axios.put(`${API}/legal/documents/${docId}/validate`, { notes: '' });
      showNotification('✓ Document marcat ca validat');
      fetchAll();
      if (previewDoc?.id === docId) setPreviewDoc(prev => ({ ...prev, status: 'validated' }));
    } catch { showNotification('Eroare la validare', 'error'); }
  };

  // ── Preview model (șablon) ───────────────────────────────────────────────
  const handlePreviewTemplate = async (tmplId) => {
    setLoadingTemplate(true);
    try {
      const r = await axios.get(`${API}/legal/templates/${tmplId}`);
      setPreviewTemplate(r.data);
    } catch { showNotification('Eroare la încărcarea modelului', 'error'); }
    finally { setLoadingTemplate(false); }
  };

  // ── Salvare editare text ──────────────────────────────────────────────────
  const handleSaveEdit = async (docId) => {
    setSavingEdit(true);
    try {
      await axios.put(`${API}/legal/documents/${docId}/text`, { text: editingText });
      showNotification('✓ Text actualizat și .docx regenerat');
      setPreviewDoc(prev => ({ ...prev, generated_text: editingText }));
    } catch { showNotification('Eroare la salvare', 'error'); }
    finally { setSavingEdit(false); }
  };

  // ── Șterge act ────────────────────────────────────────────────────────────
  const handleDeleteAct = async (actId, title) => {
    if (!window.confirm(`Ștergi actul "${title}" și toate fragmentele lui?`)) return;
    try {
      await axios.delete(`${API}/legal/acts/${actId}`);
      showNotification(`✓ Act șters`);
      fetchAll();
    } catch { showNotification('Eroare la ștergere', 'error'); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 0 40px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* ── Header cu stats ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Scale size={28} color="#7c3aed" />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#1f2937' }}>Legal AI Assistant</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
            Generare documente juridice cu bază legală verificată
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <StatChip icon="📚" label="Acte" value={stats.acts || 0} color="#7c3aed" />
          <StatChip icon="🧩" label="Fragmente" value={fmt(stats.chunks || 0)} color="#2563eb" />
          <StatChip icon="📄" label="Documente" value={stats.documents || 0} color="#059669" />
          <StatChip icon="✅" label="Validate" value={stats.validated || 0} color="#d97706" />
        </div>
      </div>

      {/* Avertisment corpus gol */}
      {(stats.acts === 0) && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ color: '#92400e' }}>Corpusul legislativ este gol!</strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#78350f' }}>
              Documentele vor fi generate fără bază legală verificată. Mergi la tab-ul <strong>Corpus Legislativ</strong> și încarcă actele normative sau folosește butonul de descărcare automată.
            </p>
          </div>
        </div>
      )}

      {/* Avertisment embeddings */}
      {stats.acts > 0 && !stats.has_embeddings && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Info size={16} color="#0284c7" />
          <span style={{ fontSize: '0.85rem', color: '#0c4a6e' }}>
            Căutarea folosește <strong>BM25 (cuvinte cheie)</strong>. Pentru căutare semantică mai precisă, adaugă <code>VOYAGE_API_KEY</code> sau <code>COHERE_API_KEY</code> în Render Environment.
          </span>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '24px', gap: '4px' }}>
        {[
          { id: 'generate',  label: '⚡ Generează Document' },
          { id: 'corpus',    label: '📚 Corpus Legislativ' },
          { id: 'documents', label: `📄 Documente Generate (${documents.length})` },
          { id: 'search',    label: '🔍 Caută în Lege' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.9rem',
              borderBottom: tab === t.id ? '3px solid #7c3aed' : '3px solid transparent',
              color: tab === t.id ? '#7c3aed' : '#6b7280',
              marginBottom: '-2px',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: GENERARE DOCUMENT
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'generate' && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Panoul stânga: selectare template + variabile */}
          <div style={{ flex: '1 1 380px', minWidth: '320px' }}>

            {/* Template selectie — grupate pe categorii */}
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>1. Alege tipul documentului</h3>
            <div style={{ marginBottom: '20px' }}>
              {/* Grupare pe categorii */}
              {Object.entries(
                templates.reduce((acc, t) => {
                  const cat = t.category || 'Alte documente';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(t);
                  return acc;
                }, {})
              ).map(([category, tmplList]) => {
                const meta = CATEGORY_META[category] || { icon: '📄', color: '#6b7280', bg: '#f9fafb' };
                return (
                  <div key={category} style={{ marginBottom: '12px' }}>
                    {/* Header categorie */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: meta.bg, borderRadius: '6px', marginBottom: '6px' }}>
                      <span>{meta.icon}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: meta.color }}>{category}</span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>{tmplList.length} doc.</span>
                    </div>
                    {/* Template-urile din categorie */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                      {tmplList.map(tmpl => (
                        <div key={tmpl.id} style={{
                          borderRadius: '8px', border: `2px solid ${selectedTemplate?.id === tmpl.id ? meta.color : '#e5e7eb'}`,
                          background: selectedTemplate?.id === tmpl.id ? meta.bg : '#fff',
                          overflow: 'hidden',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* Buton selectare */}
                            <button onClick={() => handleSelectTemplate(tmpl)}
                              style={{ flex: 1, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong style={{ color: selectedTemplate?.id === tmpl.id ? meta.color : '#1f2937', fontSize: '0.87rem' }}>
                                  {tmpl.name}
                                </strong>
                                {tmpl.bulk_mode && (
                                  <span style={{ fontSize: '0.65rem', background: '#ddd6fe', color: '#6d28d9', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>BULK</span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{tmpl.description}</div>
                            </button>
                            {/* Buton preview model */}
                            <button
                              onClick={() => handlePreviewTemplate(tmpl.id)}
                              disabled={loadingTemplate}
                              title="Vizualizează modelul documentului"
                              style={{ padding: '8px 10px', background: 'none', border: 'none', borderLeft: '1px solid #f3f4f6', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', flexShrink: 0 }}>
                              <FileSearch size={14} />
                              <span style={{ display: window.innerWidth < 600 ? 'none' : 'inline' }}>Model</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Formular variabile */}
            {selectedTemplate && (
              <>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>2. Completează datele</h3>

                {/* Auto-fill din CRM */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <select onChange={e => {
                    const c = companies.find(x => x.id === e.target.value);
                    if (c) handleCompanySelect(c);
                  }} style={{ flex: '1', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', color: '#374151' }}>
                    <option value="">🏢 Auto-fill companie din CRM...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select onChange={e => {
                    const c = candidates.find(x => x.id === e.target.value);
                    if (c) handleCandidateSelect(c);
                  }} style={{ flex: '1', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', color: '#374151' }}>
                    <option value="">👤 Auto-fill candidat din CRM...</option>
                    {candidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.nationality})</option>)}
                  </select>
                </div>

                {/* Câmpuri variabile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {selectedTemplate.variables.map(v => (
                    <div key={v.key}>
                      <label style={{ fontSize: '0.8rem', color: '#374151', display: 'block', marginBottom: '3px' }}>
                        {v.label} {v.required && <span style={{ color: '#ef4444' }}>*</span>}
                        <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({v.source})</span>
                      </label>
                      {v.type === 'textarea' ? (
                        <textarea rows={3}
                          value={variables[v.key] || ''}
                          onChange={e => setVariables(p => ({ ...p, [v.key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <input type="text"
                          value={variables[v.key] || ''}
                          onChange={e => setVariables(p => ({ ...p, [v.key]: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', boxSizing: 'border-box' }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Bulk mode */}
                {selectedTemplate.bulk_mode && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', color: '#374151' }}>
                      <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} />
                      <Users size={15} /> Generare BULK (candidați multipli)
                    </label>
                    {bulkMode && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#6d28d9', fontWeight: 600 }}>
                          Adaugă câte un candidat per rând (Prenume Nume):
                        </p>
                        {bulkCandidates.map((bc, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <select onChange={e => {
                              const c = candidates.find(x => x.id === e.target.value);
                              if (c) {
                                const updated = [...bulkCandidates];
                                updated[idx] = { candidat_name: `${c.first_name} ${c.last_name}`.trim(), candidat_nationalitate: c.nationality || '' };
                                setBulkCandidates(updated);
                              }
                            }} style={{ flex: '1', padding: '5px 8px', borderRadius: '6px', border: '1px solid #c4b5fd', fontSize: '0.82rem' }}>
                              <option value="">{bc.candidat_name || `Candidat ${idx + 1}...`}</option>
                              {candidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                            </select>
                            <button onClick={() => setBulkCandidates(prev => prev.filter((_, i) => i !== idx))}
                              style={{ padding: '5px 8px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setBulkCandidates(prev => [...prev, {}])}
                          style={{ padding: '5px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                          + Adaugă candidat
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleGenerate} disabled={generating}
                  style={{
                    width: '100%', padding: '12px', background: generating ? '#9ca3af' : '#7c3aed',
                    color: '#fff', border: 'none', borderRadius: '10px', cursor: generating ? 'wait' : 'pointer',
                    fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}>
                  {generating
                    ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Se generează cu AI...</>
                    : <><Zap size={18} /> Generează {bulkMode && selectedTemplate.bulk_mode ? `${bulkCandidates.length} documente` : 'Document'}</>
                  }
                </button>
              </>
            )}
          </div>

          {/* Panoul dreapta: rezultat generat */}
          <div style={{ flex: '2 1 480px', minWidth: '320px' }}>
            {!generatedDoc && !generating && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: '12px' }}>
                <Scale size={48} color="#e5e7eb" style={{ marginBottom: '12px' }} />
                <p style={{ margin: 0, fontSize: '0.95rem' }}>Selectează un template și completează datele pentru a genera documentul</p>
              </div>
            )}

            {generatedDoc && !generatedDoc.bulk && (
              <DocResult
                doc={generatedDoc}
                onValidate={() => handleValidate(generatedDoc.id)}
                onDownload={() => handleDownload(generatedDoc.id, generatedDoc.docx_filename)}
                onEdit={() => {
                  setPreviewDoc(generatedDoc);
                  setEditingText(generatedDoc.generated_text);
                }}
              />
            )}

            {generatedDoc?.bulk && (
              <div>
                <h3 style={{ margin: '0 0 12px', color: '#374151' }}>📦 {generatedDoc.count} documente generate</h3>
                {generatedDoc.documents.map((d, idx) => (
                  <div key={idx} style={{ marginBottom: '12px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#374151' }}>{d.variables?.candidat_name || `Document ${idx + 1}`}</strong>
                      <ConfidenceBadge score={d.confidence_score} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {d.docx_filename && (
                        <button onClick={() => handleDownload(d.id, d.docx_filename)}
                          style={btnStyle('#059669')}>
                          <Download size={13} /> .docx
                        </button>
                      )}
                      <button onClick={() => handleValidate(d.id)} style={btnStyle('#2563eb')}>
                        <CheckCircle size={13} /> Validează
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: CORPUS LEGISLATIV
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'corpus' && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Upload manual */}
          <div style={{ flex: '1 1 340px', minWidth: '300px' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={16} color="#7c3aed" /> Încarcă act normativ
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="text" placeholder="Titlu act (ex: Codul Muncii — Legea 53/2003)" value={actForm.title}
                  onChange={e => setActForm(p => ({ ...p, title: e.target.value }))}
                  style={inputStyle} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={actForm.act_type} onChange={e => setActForm(p => ({ ...p, act_type: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}>
                    {ACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="text" placeholder="Nr. (53)" value={actForm.act_number}
                    onChange={e => setActForm(p => ({ ...p, act_number: e.target.value }))}
                    style={{ ...inputStyle, width: '80px' }} />
                  <input type="text" placeholder="An" value={actForm.act_year}
                    onChange={e => setActForm(p => ({ ...p, act_year: e.target.value }))}
                    style={{ ...inputStyle, width: '70px' }} />
                </div>
                <input type="text" placeholder="URL sursă (opțional)" value={actForm.source_url}
                  onChange={e => setActForm(p => ({ ...p, source_url: e.target.value }))}
                  style={inputStyle} />
                <input ref={uploadRef} type="file" accept=".docx,.pdf,.txt"
                  style={{ display: 'none' }} onChange={handleUploadAct} />
                <button onClick={() => uploadRef.current?.click()} disabled={uploadingAct}
                  style={{ ...btnStyle('#7c3aed'), padding: '10px', fontSize: '0.9rem', width: '100%', justifyContent: 'center' }}>
                  {uploadingAct
                    ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Se procesează...</>
                    : <><Upload size={15} /> Alege fișier (.docx / .pdf / .txt)</>
                  }
                </button>
              </div>
            </div>

            {/* Job-uri scraping în așteptare */}
            {scrapeJobs.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#92400e' }}>
                  🕐 {scrapeJobs.length} job-uri scraping în așteptare
                </h4>
                {scrapeJobs.map(j => (
                  <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#374151', flex: 1, marginRight: '8px' }}>{j.title || j.url.slice(0, 50)}</span>
                    <button onClick={() => handleApproveJob(j.id)} disabled={loading}
                      style={btnStyle('#059669')}>
                      {loading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />} Aprobă
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: '2 1 480px', minWidth: '300px' }}>

            {/* Descărcare automată acte recomandate */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={16} color="#2563eb" /> Acte normative recomandate
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#6b7280' }}>
                Adaugă la coada de scraping — vei aproba manual descărcarea
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {RECOMMENDED_ACTS.map((act, idx) => {
                  const pc = PRIORITY_COLORS[act.priority] || PRIORITY_COLORS.SCAZUT;
                  const alreadyInCorpus = acts.some(a => a.title?.includes(act.title.split('—')[0].trim()));
                  const alreadyQueued  = scrapeJobs.some(j => j.url === act.url);
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: alreadyInCorpus ? '#f0fdf4' : pc.bg, borderRadius: '8px', border: `1px solid ${alreadyInCorpus ? '#86efac' : pc.border}` }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: alreadyInCorpus ? '#166534' : pc.color, minWidth: '50px' }}>
                        {alreadyInCorpus ? '✅ OK' : act.priority}
                      </span>
                      <span style={{ flex: 1, fontSize: '0.82rem', color: '#374151' }}>{act.title}</span>
                      {!alreadyInCorpus && !alreadyQueued && (
                        <button onClick={() => handleAddScrapeJob(act)}
                          style={{ ...btnStyle('#2563eb'), padding: '4px 10px', fontSize: '0.75rem' }}>
                          <Plus size={11} /> Adaugă
                        </button>
                      )}
                      {alreadyQueued && (
                        <span style={{ fontSize: '0.72rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>În coadă</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lista acte existente în corpus */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={16} color="#7c3aed" /> Corpus curent ({acts.length} acte)
              </h3>
              {acts.length === 0 && (
                <p style={{ color: '#9ca3af', fontSize: '0.88rem', textAlign: 'center', padding: '20px' }}>
                  Niciun act normativ în corpus.<br />Încarcă un fișier sau adaugă din lista de mai sus.
                </p>
              )}
              {acts.map(act => (
                <div key={act.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', color: '#1f2937', fontWeight: 500 }}>{act.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {act.act_type?.toUpperCase()} {act.act_number && `nr. ${act.act_number}`} {act.act_year && `/ ${act.act_year}`} — {act.total_chunks} fragmente
                    </div>
                  </div>
                  <button onClick={() => handleDeleteAct(act.id, act.title)}
                    style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: DOCUMENTE GENERATE
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'documents' && (
        <div>
          {documents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
              <FileText size={48} color="#e5e7eb" style={{ marginBottom: '12px' }} />
              <p>Nu ai generat niciun document încă.</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {documents.map(doc => (
              <div key={doc.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#1f2937' }}>{doc.title}</strong>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                      {new Date(doc.created_at).toLocaleString('ro-RO')} · {doc.created_by}
                      {doc.confidence_score !== undefined && (
                        <> · <ConfidenceBadge score={doc.confidence_score} inline /></>
                      )}
                    </div>
                    {doc.warning && (
                      <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '4px' }}>⚠️ {doc.warning}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={async () => {
                      const r = await axios.get(`${API}/legal/documents/${doc.id}`);
                      setPreviewDoc(r.data);
                      setEditingText(r.data.generated_text || '');
                    }} style={btnStyle('#6b7280')}>
                      <Eye size={13} /> Preview
                    </button>
                    {doc.docx_filename && (
                      <button onClick={() => handleDownload(doc.id, doc.docx_filename)}
                        style={btnStyle('#059669')}>
                        <Download size={13} /> .docx
                      </button>
                    )}
                    {doc.status !== 'validated' && (
                      <button onClick={() => handleValidate(doc.id)} style={btnStyle('#2563eb')}>
                        <CheckCircle size={13} /> Validează
                      </button>
                    )}
                    <button onClick={async () => {
                      if (window.confirm('Ștergi documentul?')) {
                        await axios.delete(`${API}/legal/documents/${doc.id}`);
                        fetchAll();
                        showNotification('Document șters');
                      }
                    }} style={btnStyle('#ef4444')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: CĂUTARE ÎN CORPUS
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input type="text" placeholder="Caută în legislație... (ex: neplata salariului, demisie preaviz, permis ședere)"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ ...inputStyle, flex: 1, fontSize: '0.95rem', padding: '10px 14px' }} />
            <button onClick={handleSearch} disabled={searching}
              style={{ ...btnStyle('#7c3aed'), padding: '10px 20px', fontSize: '0.95rem' }}>
              {searching ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
              {searching ? ' Caută...' : ' Caută'}
            </button>
          </div>

          {searchResults && (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px' }}>
                {searchResults.count} rezultate pentru „{searchResults.query}"
                {searchResults.has_semantic ? ' (căutare semantică)' : ' (căutare cuvinte cheie)'}
              </p>
              {searchResults.results.length === 0 && (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px' }}>Niciun rezultat. Încearcă alte cuvinte cheie.</p>
              )}
              {searchResults.results.map((chunk, idx) => (
                <div key={idx} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, marginBottom: '6px' }}>
                    📖 {chunk.act_title} › {chunk.section_path}
                    {chunk.article_number && <span style={{ background: '#f5f3ff', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Art. {chunk.article_number}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {chunk.text.slice(0, 400)}{chunk.text.length > 400 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Preview MODEL (șablon) ─────────────────────────────────── */}
      {previewTemplate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewTemplate(null); }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '820px', width: '100%', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Header modal */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 14px', borderBottom: '1px solid #e5e7eb', gap: '12px', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <FileSearch size={18} color="#7c3aed" />
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#1f2937' }}>Model document: {previewTemplate.name}</h3>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', background: (CATEGORY_META[previewTemplate.category] || {}).bg || '#f3f4f6', color: (CATEGORY_META[previewTemplate.category] || {}).color || '#6b7280', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                    {(CATEGORY_META[previewTemplate.category] || {}).icon} {previewTemplate.category}
                  </span>
                  <span style={{ fontSize: '0.75rem', background: previewTemplate.emitent === 'GJC' ? '#f0f9ff' : '#fdf4ff', color: previewTemplate.emitent === 'GJC' ? '#0891b2' : '#7c3aed', padding: '2px 8px', borderRadius: '4px' }}>
                    Emis de: {previewTemplate.emitent === 'GJC' ? '🏢 GJC' : '👤 Candidat'}
                  </span>
                  {previewTemplate.bulk_mode && (
                    <span style={{ fontSize: '0.75rem', background: '#f5f3ff', color: '#6d28d9', padding: '2px 8px', borderRadius: '4px' }}>🔁 Bulk disponibil</span>
                  )}
                  <span style={{ fontSize: '0.75rem', background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: '4px' }}>
                    Min. {previewTemplate.min_citations} citări legale
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => { handleSelectTemplate(previewTemplate); setPreviewTemplate(null); }}
                  style={{ ...btnStyle('#7c3aed'), padding: '7px 14px' }}>
                  <Zap size={13} /> Folosește
                </button>
                <button onClick={() => setPreviewTemplate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={20} color="#6b7280" />
                </button>
              </div>
            </div>

            <div style={{ padding: '0 24px 24px' }}>
              {/* Descriere */}
              <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 14px', margin: '16px 0 12px', fontSize: '0.85rem', color: '#374151' }}>
                ℹ️ {previewTemplate.description}
              </div>

              {/* Variabile necesare */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={14} color="#7c3aed" /> Variabile necesare ({previewTemplate.variables?.length || 0}):
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(previewTemplate.variables || []).map(v => (
                    <span key={v.key} style={{
                      fontSize: '0.75rem', padding: '3px 8px', borderRadius: '5px',
                      background: v.required ? '#fef3c7' : '#f3f4f6',
                      color: v.required ? '#92400e' : '#6b7280',
                      border: `1px solid ${v.required ? '#fcd34d' : '#e5e7eb'}`,
                    }}>
                      {v.required ? '* ' : ''}{v.label}
                      <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({v.source})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Bază legală folosită */}
              {previewTemplate.rag_queries?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={14} color="#2563eb" /> Bază legală căutată automat:
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {previewTemplate.rag_queries.map((q, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: '5px' }}>
                        🔍 {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODEL DOCUMENT */}
              <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} color="#374151" /> Modelul documentului
                <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>— variabilele apar între {'{}'}, Claude va completa cu datele reale</span>
              </h4>
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', fontFamily: 'Georgia, serif' }}>
                {/* Render cu variabile colorate */}
                <TemplatePreviewRenderer text={previewTemplate.preview_text || ''} variables={previewTemplate.variables || []} />
              </div>

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <button onClick={() => { handleSelectTemplate(previewTemplate); setPreviewTemplate(null); }}
                  style={{ ...btnStyle('#7c3aed'), padding: '10px 24px', fontSize: '0.95rem' }}>
                  <Zap size={16} /> Generează acest document acum
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Preview / Editare document ─────────────────────────────── */}
      {previewDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewDoc(null); }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '800px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '24px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#1f2937' }}>{previewDoc.title}</h3>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <StatusBadge status={previewDoc.status} />
                <ConfidenceBadge score={previewDoc.confidence_score} />
                {previewDoc.docx_filename && (
                  <button onClick={() => handleDownload(previewDoc.id, previewDoc.docx_filename)}
                    style={btnStyle('#059669')}>
                    <Download size={13} /> .docx
                  </button>
                )}
                {previewDoc.status !== 'validated' && (
                  <button onClick={() => handleValidate(previewDoc.id)} style={btnStyle('#2563eb')}>
                    <CheckCircle size={13} /> Validează
                  </button>
                )}
                <button onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={18} color="#6b7280" />
                </button>
              </div>
            </div>

            {/* Citări validate */}
            {(previewDoc.citations?.length > 0 || previewDoc.invalid_citations?.length > 0) && (
              <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.8rem' }}>
                {previewDoc.citations?.length > 0 && (
                  <div style={{ color: '#059669', marginBottom: '4px' }}>
                    ✅ Citări verificate: {previewDoc.citations.join(' · ')}
                  </div>
                )}
                {previewDoc.invalid_citations?.length > 0 && (
                  <div style={{ color: '#ef4444' }}>
                    ⚠️ Citări neverificate (necesită verificare manuală): {previewDoc.invalid_citations.join(' · ')}
                  </div>
                )}
              </div>
            )}

            {/* Avertismente */}
            {previewDoc.warning && (
              <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.82rem', color: '#92400e' }}>
                ⚠️ {previewDoc.warning}
              </div>
            )}

            {/* Editor text */}
            <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Text document (editabil):</span>
              <button onClick={() => handleSaveEdit(previewDoc.id)} disabled={savingEdit}
                style={btnStyle('#7c3aed')}>
                {savingEdit ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Edit3 size={12} />}
                {savingEdit ? ' Salvează...' : ' Salvează editarea'}
              </button>
            </div>
            <textarea
              value={editingText}
              onChange={e => setEditingText(e.target.value)}
              style={{ width: '100%', minHeight: '400px', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.88rem', fontFamily: 'Georgia, serif', lineHeight: 1.7, boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-componente ──────────────────────────────────────────────────────────

const StatChip = ({ icon, label, value, color }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#374151' }}>
    <span>{icon}</span>
    <span style={{ color: '#9ca3af' }}>{label}</span>
    <strong style={{ color }}>{value}</strong>
  </div>
);

const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { bg: '#fef3c7', color: '#92400e', label: '📝 Draft' },
    validated: { bg: '#d1fae5', color: '#065f46', label: '✅ Validat' },
  }[status] || { bg: '#f3f4f6', color: '#6b7280', label: status };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
};

const ConfidenceBadge = ({ score, inline }) => {
  if (score === undefined || score === null) return null;
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#ef4444';
  return (
    <span style={{ color, fontSize: '0.75rem', fontWeight: 600, ...(inline ? {} : { background: '#f9fafb', padding: '2px 8px', borderRadius: '6px' }) }}>
      {pct}% bază legală
    </span>
  );
};

const DocResult = ({ doc, onValidate, onDownload, onEdit }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ color: '#1f2937', fontSize: '0.95rem' }}>{doc.template_name}</strong>
        <StatusBadge status={doc.status} />
      </div>
      <ConfidenceBadge score={doc.confidence_score} />
    </div>

    {doc.warning && (
      <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.82rem', color: '#92400e' }}>
        ⚠️ {doc.warning}
      </div>
    )}

    {doc.citations?.length > 0 && (
      <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.8rem', color: '#166534' }}>
        ✅ Citări verificate: {doc.citations.join(' · ')}
      </div>
    )}
    {doc.invalid_citations?.length > 0 && (
      <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.8rem', color: '#991b1b' }}>
        ⚠️ Verificați manual: {doc.invalid_citations.join(' · ')}
      </div>
    )}

    <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', marginBottom: '12px', maxHeight: '300px', overflow: 'auto' }}>
      <pre style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#1f2937' }}>
        {doc.generated_text}
      </pre>
    </div>

    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button onClick={onEdit} style={btnStyle('#6b7280')}><Edit3 size={13} /> Editează</button>
      {doc.docx_filename && (
        <button onClick={onDownload} style={btnStyle('#059669')}><Download size={13} /> Descarcă .docx</button>
      )}
      {doc.status !== 'validated' && (
        <button onClick={onValidate} style={btnStyle('#2563eb')}><CheckCircle size={13} /> Validează</button>
      )}
    </div>

    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '10px' }}>
      Model: {doc.model} · {doc.tokens_used} tokens · {doc.corpus_size || 0} fragmente în corpus
      {doc.docx_error && <span style={{ color: '#ef4444' }}> · ⚠️ {doc.docx_error}</span>}
    </div>
  </div>
);

// Render model cu variabilele evidențiate colorat
const TemplatePreviewRenderer = ({ text, variables }) => {
  if (!text) return <em style={{ color: '#9ca3af' }}>Model nedisponibil</em>;

  const requiredKeys = new Set((variables || []).filter(v => v.required).map(v => v.key));

  // Împarte textul în segmente: text normal și {variabile}
  const parts = text.split(/(\{[^}]+\})/g);

  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.87rem', lineHeight: 1.75, color: '#1f2937', fontFamily: 'Georgia, serif' }}>
      {parts.map((part, i) => {
        const match = part.match(/^\{([^}]+)\}$/);
        if (match) {
          const key = match[1];
          const isRequired = requiredKeys.has(key);
          const varDef = (variables || []).find(v => v.key === key);
          return (
            <span key={i} title={varDef ? `${varDef.label} (${varDef.source})` : key}
              style={{
                background: isRequired ? '#fef9c3' : '#f0fdf4',
                color: isRequired ? '#92400e' : '#166534',
                border: `1px solid ${isRequired ? '#fcd34d' : '#86efac'}`,
                borderRadius: '4px',
                padding: '1px 5px',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                cursor: 'help',
              }}>
              {`{${key}}`}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </pre>
  );
};

const inputStyle = {
  padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db',
  fontSize: '0.85rem', width: '100%', boxSizing: 'border-box',
};

const btnStyle = (bg) => ({
  display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
  background: bg, color: '#fff', border: 'none', borderRadius: '6px',
  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
});

export default LegalPage;
