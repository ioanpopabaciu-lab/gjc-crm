import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Building2, Phone, Edit, Trash2, RefreshCw, X, Download, Users, FileText, Award, MapPin, ExternalLink, ChevronRight, Briefcase } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { CAEN_CODES } from '../data/caenCodes';

// ─── CAEN Selector ────────────────────────────────────────────────────────────
const CAENSelector = ({ value, valueName, onChange }) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search.trim().length >= 2
    ? CAEN_CODES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search) ||
        c.section.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 40)
    : [];

  const handleSelect = (caen) => { onChange(caen.code, caen.name, caen.section); setSearch(""); setOpen(false); };
  const handleClear = () => { onChange("", "", ""); setSearch(""); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: "1px solid #10b981", borderRadius: "8px", background: "#ecfdf5" }}>
          <span style={{ fontWeight: "700", color: "#065f46", fontSize: "0.875rem" }}>{value}</span>
          <span style={{ color: "#374151", fontSize: "0.875rem", flex: 1 }} title={valueName}>{valueName?.length > 50 ? valueName.substring(0,50)+"…" : valueName}</span>
          <button onClick={handleClear} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}><X size={14}/></button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}/>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Caută cod CAEN sau domeniu de activitate..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box", fontSize: "0.875rem" }}
          />
        </div>
      )}
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: "260px", overflowY: "auto", marginTop: "4px" }}>
          {filtered.map(caen => (
            <div key={caen.code}
              onMouseDown={e => { e.preventDefault(); handleSelect(caen); }}
              style={{ padding: "8px 14px", cursor: "pointer", display: "flex", gap: "10px", alignItems: "center", borderBottom: "1px solid #f3f4f6", fontSize: "0.85rem" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span style={{ fontWeight: "700", color: "#10b981", fontSize: "0.82rem", minWidth: "38px" }}>{caen.code}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "500", color: "#1f2937" }}>{caen.name.length > 70 ? caen.name.substring(0,70)+"…" : caen.name}</div>
                <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{caen.section}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && search.trim().length >= 2 && filtered.length === 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px 14px", color: "#9ca3af", fontSize: "0.875rem", marginTop: "4px" }}>
          Niciun rezultat pentru "{search}"
        </div>
      )}
    </div>
  );
};

const CompaniesPage = ({ showNotification }) => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [cuiLookup, setCuiLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  // Modal avize
  const [avizeModal, setAvizeModal] = useState({ open: false, company: null, cases: [], loading: false });
  // Modal programări
  const [progModal, setProgModal] = useState({ open: false, company: null, candidates: [], loading: false });
  // Modal posturi vacante companie
  const [jobsModal, setJobsModal] = useState({ open: false, company: null, jobs: [], loading: false });
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({});
  const [editingJobId, setEditingJobId] = useState(null); // ID-ul jobului care se editează inline
  const [selectedCompanyId, setSelectedCompanyId] = useState(null); // Rând activ colorat
  // Posturi in modalul companiei
  const [pendingJobs, setPendingJobs] = useState([]);
  const [newJobRow, setNewJobRow] = useState({ title: '', location: '', headcount_needed: 1, salary_min: '', salary_max: '', currency: 'EUR', description: '', accommodation: false, meals: false, transport: false });

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      // Pasul 1: Încarcă companiile instant (fără statistici)
      const response = await axios.get(`${API}/companies?${params.toString()}`, { timeout: 15000 });
      setCompanies(response.data);
      setLoading(false);

      // Pasul 2: Încarcă statisticile în fundal
      setStatsLoading(true);
      try {
        params.set("with_stats", "true");
        const statsResp = await axios.get(`${API}/companies?${params.toString()}`, { timeout: 30000 });
        setCompanies(statsResp.data);
      } catch (statsError) {
        // Statisticile nu s-au putut încărca, afișăm companiile fără ele
      } finally {
        setStatsLoading(false);
      }
    } catch (error) {
      setLoadError(true);
      showNotification("Eroare la încărcarea companiilor. Încearcă din nou.", "error");
      setLoading(false);
    }
  }, [search, showNotification]);

  useEffect(() => {
    const timer = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(timer);
  }, [fetchCompanies]);

  const applyAnafData = (d, cleanCui, prev) => {
    const caenEntry = d.caen_code ? CAEN_CODES.find(c => c.code === d.caen_code) : null;
    setEditingCompany({
      ...prev,
      name:             d.name         || prev?.name        || "",
      cui:              d.cui          || `RO${cleanCui}`,
      county:           d.county       || prev?.county      || "",
      city:             d.city         || d.county          || prev?.city || "",
      address:          d.address      || prev?.address     || "",
      reg_commerce:     d.reg_commerce || prev?.reg_commerce|| "",
      phone:            d.phone        || prev?.phone       || "",
      status:           d.status       || prev?.status      || "activ",
      caen_code:        d.caen_code    || prev?.caen_code   || "",
      caen_name:        caenEntry?.name  || prev?.caen_name || "",
      industry:         caenEntry?.section || prev?.industry || "",
      industry_category:caenEntry?.section || prev?.industry_category || "",
    });
    showNotification(`✓ Date preluate: ${d.name}`);
  };

  const lookupCUI = async () => {
    const rawCui = cuiLookup || editingCompany?.cui || "";
    if (!rawCui) return showNotification("Introdu CUI-ul mai sus", "error");
    const cleanCui = rawCui.toUpperCase().replace(/RO/g, "").replace(/\s/g, "").trim();
    if (!cleanCui || !/^\d+$/.test(cleanCui)) return showNotification("CUI invalid — doar cifre", "error");

    setLookupLoading(true);
    try {
      // ── Pasul 1: încearcă backend-ul propriu ──────────────────────────
      try {
        const resp = await axios.get(`${API}/anaf/${cleanCui}`, { timeout: 28000 });
        if (resp.data?.success) {
          applyAnafData(resp.data.data, cleanCui, editingCompany);
          return;
        }
        // Dacă backend spune "negăsit" (nu eroare de rețea), ne oprim
        if (resp.data?.error?.includes("negăsit")) {
          showNotification("CUI negăsit în ANAF — completați manual datele.", "error");
          return;
        }
        // altfel continuăm cu fallback browser
      } catch (backendErr) {
        // backend timeout sau eroare rețea → continuăm cu fallback
      }

      // ── Pasul 2: fallback direct din browser prin proxy CORS ───────────
      const anafUrl = "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva";
      const body = JSON.stringify([{ cui: parseInt(cleanCui, 10), data: new Date().toISOString().slice(0,10) }]);

      const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(anafUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(anafUrl)}`,
      ];

      for (const proxyUrl of proxies) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const r = await fetch(proxyUrl, { method:"POST", headers:{"Content-Type":"application/json"}, body, signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok) continue;
          const json = await r.json();
          const found = json?.found?.[0];
          if (found) {
            const dg = found.date_generale || {};
            const caen = dg.cod_CAEN || "";
            // extrage judet din adresa
            let county = "", city = "";
            const adresa = dg.adresa || "";
            (adresa.split(",")).forEach(p => {
              p = p.trim();
              if (/^JUD\./i.test(p)) county = p.replace(/^JUD\./i,"").trim();
              else if (/^MUN\./i.test(p)) city = p.replace(/^MUN\./i,"").trim();
            });
            if (!city) city = county;
            applyAnafData({ name: dg.denumire, cui:`RO${cleanCui}`, address: adresa, county, city, phone: dg.telefon, reg_commerce: dg.nrRegCom, caen_code: caen, status: dg.stare_inregistrare?.toUpperCase().includes("INREGISTRAT") ? "activ" : "inactiv" }, cleanCui, editingCompany);
            return;
          }
          if (json?.notfound?.length) {
            showNotification("CUI negăsit în ANAF — completați manual.", "error");
            return;
          }
        } catch {}
      }

      showNotification("ANAF indisponibil momentan. Completați manual câmpurile.", "error");
    } finally {
      setLookupLoading(false);
    }
  };


  const handleSave = async () => {
    try {
      let companyId = editingCompany?.id;
      let companyName = editingCompany?.name;
      if (editingCompany?.id) {
        await axios.put(`${API}/companies/${editingCompany.id}`, editingCompany);
        showNotification("Companie actualizată!");
      } else {
        const resp = await axios.post(`${API}/companies`, editingCompany);
        companyId = resp.data.id;
        companyName = resp.data.name;
        showNotification("Companie adăugată!");
      }
      // Crează posturile vacante adăugate în modal
      if (pendingJobs.length > 0) {
        for (const job of pendingJobs) {
          await axios.post(`${API}/jobs`, {
            ...job,
            company_id: companyId,
            company_name: companyName,
            status: 'activ',
            required_nationality: [],
            required_skills: [],
            required_experience_years: 0,
            cor_code: '', cor_name: '',
            salary_min: job.salary_min !== '' ? parseFloat(job.salary_min) : null,
            salary_max: job.salary_max !== '' ? parseFloat(job.salary_max) : null,
            headcount_needed: parseInt(job.headcount_needed, 10) || 1,
          });
        }
        showNotification(`Companie salvată cu ${pendingJobs.length} post(uri) vacante!`);
      }
      setPendingJobs([]);
      setNewJobRow({ title: '', location: '', headcount_needed: 1, salary_min: '', salary_max: '', currency: 'EUR', description: '', accommodation: false, meals: false, transport: false });
      setShowModal(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți această companie?")) return;
    try {
      await axios.delete(`${API}/companies/${id}`);
      showNotification("Companie ștearsă!");
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const exportCSV = () => {
    const headers = ["Companie", "CUI", "Județ", "Nr.Reg.Com.", "Contact", "Telefon", "Status", "Candidați", "Plasați", "Avize", "Dosare Active"];
    const rows = companies.map(c => [
      c.name || "", c.cui || "", c.county || c.city || "", c.reg_commerce || "",
      c.contact_person || "", c.phone || "", c.status || "",
      c.candidates_count || 0, c.placed_count || 0, c.avize_count || 0, c.active_cases || 0
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `companii_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Navigare la candidații companiei
  const goToCandidates = (company) => {
    navigate(`/candidates?company_id=${encodeURIComponent(company.id)}&company_name=${encodeURIComponent(company.name)}`);
  };

  // Navigare la candidații plasați ai companiei
  const goToPlaced = (company) => {
    navigate(`/candidates?company_id=${encodeURIComponent(company.id)}&company_name=${encodeURIComponent(company.name)}&status=plasat`);
  };

  // Navigare la dosarele de imigrare ale companiei
  const goToCases = (company) => {
    navigate(`/immigration?company_id=${encodeURIComponent(company.id)}&company_name=${encodeURIComponent(company.name)}`);
  };

  // Adaugă candidat nou pre-legat la companie
  const addCandidateForCompany = (company) => {
    navigate(`/candidates?company_id=${encodeURIComponent(company.id)}&company_name=${encodeURIComponent(company.name)}&add=1`);
  };

  // Deschide modal programări pentru companie
  const openProgModal = async (company) => {
    setProgModal({ open: true, company, candidates: [], loading: true });
    try {
      const resp = await axios.get(`${API}/companies/${company.id}/programari`);
      setProgModal({ open: true, company, candidates: resp.data || [], loading: false });
    } catch {
      setProgModal(prev => ({ ...prev, loading: false }));
    }
  };

  const refreshJobsModal = async (companyId) => {
    try {
      const [jobsResp, candidatesResp] = await Promise.all([
        axios.get(`${API}/jobs`, { params: { company_id: companyId } }),
        axios.get(`${API}/candidates`, { params: { company_id: companyId } }),
      ]);
      const jobs = jobsResp.data || [];
      const candidates = candidatesResp.data || [];
      // Numără candidații per tip de post (job_type al candidatului = title-ul jobului)
      const countByTitle = {};
      candidates.forEach(c => {
        const k = (c.job_type || "").trim().toLowerCase();
        if (k) countByTitle[k] = (countByTitle[k] || 0) + 1;
      });
      const enriched = jobs.map(j => ({
        ...j,
        candidates_count: countByTitle[(j.title || "").trim().toLowerCase()] || 0,
      }));
      setJobsModal(prev => ({ ...prev, jobs: enriched, loading: false }));
    } catch {
      setJobsModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Deschide modal posturi vacante pentru companie
  const openJobsModal = async (company) => {
    setJobsModal({ open: true, company, jobs: [], loading: true });
    setShowJobForm(false);
    setEditingJobId(null);
    setJobForm({
      company_id: company.id, company_name: company.name,
      title: "", location: company.city || "", cor_code: "", cor_name: "",
      contract_type: "full_time", salary_min: "", salary_max: "", currency: "EUR",
      headcount_needed: 1, accommodation: false, meals: false, transport: false,
      description: "", requirements: "", contact_person: company.contact_person || "",
      contact_phone: company.phone || "", status: "activ",
    });
    await refreshJobsModal(company.id);
  };

  const saveJobFromCompany = async () => {
    if (!jobForm.title) return showNotification("Completează titlul postului", "error");
    try {
      const payload = {
        ...jobForm,
        salary_min: jobForm.salary_min !== "" ? parseFloat(jobForm.salary_min) : null,
        salary_max: jobForm.salary_max !== "" ? parseFloat(jobForm.salary_max) : null,
        headcount_needed: parseInt(jobForm.headcount_needed, 10) || 1,
        required_nationality: [],
        required_skills: [],
        required_experience_years: 0,
      };
      if (editingJobId) {
        await axios.put(`${API}/jobs/${editingJobId}`, payload);
        showNotification("Post actualizat!");
        setEditingJobId(null);
      } else {
        await axios.post(`${API}/jobs`, payload);
        showNotification("Post vacant adăugat!");
      }
      setShowJobForm(false);
      await refreshJobsModal(jobsModal.company.id);
      fetchCompanies();
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const startEditJob = (job) => {
    setEditingJobId(job.id);
    setJobForm({
      company_id: job.company_id, company_name: job.company_name,
      title: job.title || "", location: job.location || "",
      cor_code: job.cor_code || "", cor_name: job.cor_name || "",
      contract_type: job.contract_type || "full_time",
      salary_min: job.salary_min || "", salary_max: job.salary_max || "",
      currency: job.currency || "EUR",
      headcount_needed: job.headcount_needed || 1,
      accommodation: !!job.accommodation, meals: !!job.meals, transport: !!job.transport,
      description: job.description || "", requirements: job.requirements || "",
      status: job.status || "activ",
    });
    setShowJobForm(true);
  };

  const deleteJobFromCompany = async (jobId) => {
    if (!window.confirm("Ștergi acest post vacant?")) return;
    try {
      await axios.delete(`${API}/jobs/${jobId}`);
      showNotification("Post șters!");
      await refreshJobsModal(jobsModal.company.id);
      fetchCompanies();
    } catch { showNotification("Eroare", "error"); }
  };

  // Deschide modal avize pentru companie
  const openAvizeModal = async (company) => {
    setAvizeModal({ open: true, company, cases: [], loading: true });
    try {
      const resp = await axios.get(`${API}/immigration?company_id=${company.id}`);
      const withAviz = (resp.data || []).filter(c => c.aviz_number);
      setAvizeModal({ open: true, company, cases: withAviz, loading: false });
    } catch {
      setAvizeModal(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="module-container" data-testid="companies-module">
      <div className="module-toolbar">
        <div className="toolbar-left" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Caută companie, CUI, oraș..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="company-search"
            />
            {search && <button className="clear-search" onClick={() => setSearch("")}><X size={14}/></button>}
          </div>
          <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: "8px", fontSize: "0.875rem", background: "var(--bg-card)", color: "var(--text-primary)" }}>
            <option value="">Toate industriile</option>
            {[...new Set(CAEN_CODES.map(c => c.section))].sort().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: "8px", fontSize: "0.875rem", background: "var(--bg-card)", color: "var(--text-primary)" }}>
            <option value="">Toate statusurile</option>
            <option value="activ">Activ</option>
            <option value="inactiv">Inactiv</option>
            <option value="suspendat">Suspendat</option>
          </select>
        </div>
        <div className="toolbar-right">
          <span className="records-count">
            {companies.length} companii
            {statsLoading && <span style={{marginLeft:8, fontSize:'11px', color:'#6366f1', fontWeight:400}}>⟳ statistici...</span>}
          </span>
          {loadError && (
            <button className="btn btn-secondary" onClick={fetchCompanies}>
              <RefreshCw size={14}/> Reîncarcă
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setEditingCompany({}); setPendingJobs([]); setNewJobRow({ title: '', location: '', headcount_needed: 1, salary_min: '', salary_max: '', currency: 'EUR', description: '', accommodation: false, meals: false, transport: false }); setShowModal(true); }}
            data-testid="add-company-btn"
          >
            <Plus size={16} /> Adaugă Companie
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : loadError ? (
        <div style={{textAlign:'center', padding:'60px', color:'#ef4444'}}>
          <div style={{fontSize:'48px', marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'16px', fontWeight:600, marginBottom:'8px'}}>Nu s-au putut încărca companiile</div>
          <div style={{fontSize:'13px', color:'#9ca3af', marginBottom:'20px'}}>Verifică conexiunea la internet și încearcă din nou</div>
          <button className="btn btn-primary" onClick={fetchCompanies}><RefreshCw size={14}/> Reîncarcă</button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table companies-compact-table" data-testid="companies-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ background: 'var(--bg-table-header)' }}>Companie</th>
                <th style={{ background: 'var(--bg-table-header)' }}>CUI</th>
                <th style={{ background: 'var(--bg-table-header)' }}>Județ</th>
                <th style={{ background: 'var(--bg-table-header)' }}>Contact</th>
                <th title="Candidați alocați — click pentru a vedea" style={{ cursor:'pointer', color:'#3b82f6', background:'var(--bg-table-header)' }}>👤 Candidați</th>
                <th title="Candidați cu status Plasat — click pentru a vedea" style={{ cursor:'pointer', color:'#10b981', background:'var(--bg-table-header)' }}>✓ Plasați</th>
                <th title="Programări IGI viitoare — click pentru detalii" style={{ cursor:'pointer', color:'#7c3aed', background:'var(--bg-table-header)' }}>📅 Programări</th>
                <th title="Avize IGI — click pentru detalii" style={{ cursor:'pointer', color:'#f59e0b', background:'var(--bg-table-header)' }}>📋 Avize</th>
                <th title="Dosare imigrare active" style={{ cursor:'pointer', color:'#6b7280', background:'var(--bg-table-header)' }}>📁 Dosare</th>
                <th title="Posturi vacante — click pentru a gestiona" style={{ cursor:'pointer', color:'#6366f1', background:'var(--bg-table-header)' }}>💼 Posturi</th>
                <th style={{ background: 'var(--bg-table-header)' }}>Status</th>
                <th style={{ background: 'var(--bg-table-header)' }}>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {companies.filter(c => {
              if (filterIndustry && c.industry !== filterIndustry) return false;
              if (filterStatus && c.status !== filterStatus) return false;
              return true;
            }).map((company) => {
              const isSelected = selectedCompanyId === company.id;
              return (
                <tr
                  key={company.id}
                  onClick={() => setSelectedCompanyId(isSelected ? null : company.id)}
                  style={{
                    background: isSelected ? '#eff6ff' : '',
                    outline: isSelected ? '2px solid #3b82f6' : 'none',
                    outlineOffset: '-2px',
                    cursor: 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Companie — reg_commerce ca subtitle */}
                  <td className="company-name-cell">
                    <Building2 size={16} />
                    <div>
                      <div style={{fontWeight:600}}>{company.name}</div>
                      {company.reg_commerce
                        ? <small style={{ color: 'var(--text-muted)' }}>{company.reg_commerce}</small>
                        : company.industry && <small style={{ color: 'var(--text-muted)' }}>{company.industry}</small>
                      }
                    </div>
                  </td>

                  <td>{company.cui || "-"}</td>

                  <td>
                    {company.county ? (
                      <span className="county-badge"><MapPin size={12}/> {company.county}</span>
                    ) : (company.city || "-")}
                  </td>

                  {/* Contact — persoana + telefon */}
                  <td>
                    <div className="contact-info">
                      <span>{company.contact_person || "-"}</span>
                      {company.phone && <small><Phone size={11} /> {company.phone}</small>}
                    </div>
                  </td>

                  {/* Candidați — click → pagina Candidați filtrată (DOAR VIZUALIZARE) */}
                  <td onClick={e => { e.stopPropagation(); goToCandidates(company); }}>
                    <span
                      title="Click → vezi candidații acestei companii"
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background:'#dbeafe', color:'#1d4ed8', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      <Users size={12}/> {company.candidates_count || 0}
                    </span>
                  </td>

                  {/* Plasați — click → candidați cu status plasat */}
                  <td onClick={e => { e.stopPropagation(); goToPlaced(company); }}>
                    <span
                      title="Click → vezi candidații plasați la această companie"
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background: (company.placed_count||0) > 0 ? '#d1fae5' : '#f3f4f6', color: (company.placed_count||0) > 0 ? '#065f46' : '#9ca3af', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      ✓ {company.placed_count || 0}
                    </span>
                  </td>

                  {/* Programări — click → modal detalii */}
                  <td onClick={e => { e.stopPropagation(); openProgModal(company); }}>
                    <span
                      title="Click → programări IGI viitoare"
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background: (company.programari_count||0) > 0 ? '#ede9fe' : '#f3f4f6', color: (company.programari_count||0) > 0 ? '#7c3aed' : '#9ca3af', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      📅 {company.programari_count || 0}
                    </span>
                  </td>

                  {/* Avize — click → modal avize */}
                  <td onClick={e => { e.stopPropagation(); openAvizeModal(company); }}>
                    <span
                      title="Click → avize IGI ale companiei"
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background: (company.avize_count||0) > 0 ? '#fef3c7' : '#f3f4f6', color: (company.avize_count||0) > 0 ? '#92400e' : '#9ca3af', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      <Award size={12}/> {company.avize_count || 0}
                    </span>
                  </td>

                  {/* Dosare imigrare — click → pagina Imigrare filtrată */}
                  <td onClick={e => { e.stopPropagation(); goToCases(company); }}>
                    <span
                      title="Click → dosare imigrare în secțiunea Imigrare"
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background: ((company.active_cases||0)+(company.approved_cases||0)) > 0 ? '#f3f4f6' : '#f9fafb', color: ((company.active_cases||0)+(company.approved_cases||0)) > 0 ? '#374151' : '#9ca3af', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      <FileText size={12}/> {(company.active_cases||0)+(company.approved_cases||0)}
                    </span>
                  </td>

                  {/* Posturi Vacante — click → modal posturi */}
                  <td onClick={e => { e.stopPropagation(); openJobsModal(company); }}>
                    <span
                      title={`Click → gestionează posturile vacante`}
                      style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'4px', background:'#eef2ff', color:'#4f46e5', borderRadius:'12px', padding:'3px 10px', fontSize:'0.8rem', fontWeight:600 }}
                    >
                      <Briefcase size={12}/> {company.jobs_count != null ? company.jobs_count : 0}
                    </span>
                  </td>

                  <td>
                    <span className={`status-badge ${company.status}`}>{company.status}</span>
                  </td>

                  <td className="actions-cell" onClick={e => e.stopPropagation()}>
                    <button
                      title="Adaugă Candidat nou pentru această companie"
                      onClick={() => addCandidateForCompany(company)}
                      style={{ display:'inline-flex', alignItems:'center', gap:'3px', padding:'4px 8px', background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', borderRadius:'7px', cursor:'pointer', fontSize:'0.72rem', fontWeight:700 }}
                    >
                      <Plus size={12}/> Candidat
                    </button>
                    <button className="icon-btn" onClick={() => { setEditingCompany(company); setShowModal(true); }} data-testid={`edit-company-${company.id}`}>
                      <Edit size={14} />
                    </button>
                    <button className="icon-btn danger" onClick={() => handleDelete(company.id)} data-testid={`delete-company-${company.id}`}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
          {companies.length === 0 && (
            <div className="empty-state">
              <Building2 size={48} />
              <p>Nu există companii. Adăugați prima companie!</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Programări */}
      {progModal.open && (
        <div className="modal-overlay" onClick={() => setProgModal({ open: false, company: null, candidates: [], loading: false })}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:'860px', width:'95vw'}}>
            <div className="modal-header">
              <div>
                <h2 style={{margin:0}}>📅 Programări IGI Viitoare</h2>
                <div style={{fontSize:'13px', color:'var(--text-muted)', marginTop:'2px'}}>
                  {progModal.company?.name} — {progModal.candidates.length} programări
                </div>
              </div>
              <button className="close-btn" onClick={() => setProgModal({ open: false, company: null, candidates: [], loading: false })}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{padding:0, maxHeight:'65vh', overflowY:'auto'}}>
              {progModal.loading ? (
                <div style={{padding:'40px', textAlign:'center'}}><LoadingSpinner /></div>
              ) : progModal.candidates.length === 0 ? (
                <div style={{padding:'40px', textAlign:'center', color:'var(--text-muted)'}}>Nu există programări viitoare</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem'}}>
                  <thead style={{background:'var(--bg-secondary)'}}>
                    <tr>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Candidat</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Naționalitate</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Data Programare</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Ora</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Locație</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progModal.candidates.map((c, idx) => (
                      <tr key={c.id} style={{borderBottom:'1px solid var(--border-color)', background: idx%2===0?'transparent':'var(--bg-secondary)'}}>
                        <td style={{padding:'9px 14px', fontWeight:500}}>{c.first_name} {c.last_name}</td>
                        <td style={{padding:'9px 14px', color:'var(--text-muted)'}}>{c.nationality || 'Nepal'}</td>
                        <td style={{padding:'9px 14px'}}><strong style={{color:'#7c3aed'}}>{c.appointment_date || '—'}</strong></td>
                        <td style={{padding:'9px 14px'}}>{c.appointment_time || '—'}</td>
                        <td style={{padding:'9px 14px'}}>{c.appointment_location || '—'}</td>
                        <td style={{padding:'9px 14px'}}><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer" style={{padding:'12px 20px', borderTop:'1px solid var(--border-color)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:'12px', color:'var(--text-muted)'}}>{progModal.candidates.length} programări • {progModal.company?.name}</span>
              <button className="btn btn-secondary" onClick={() => setProgModal({ open: false, company: null, candidates: [], loading: false })}>Închide</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Avize */}
      {avizeModal.open && (
        <div className="modal-overlay" onClick={() => setAvizeModal({ open: false, company: null, cases: [], loading: false })}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:'820px', width:'95vw'}}>
            <div className="modal-header">
              <div>
                <h2 style={{margin:0}}>Avize de Muncă</h2>
                <div style={{fontSize:'13px', color:'var(--text-muted)', marginTop:'2px'}}>
                  {avizeModal.company?.name} — {avizeModal.cases.length} avize emise
                </div>
              </div>
              <button className="close-btn" onClick={() => setAvizeModal({ open: false, company: null, cases: [], loading: false })}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{padding:'0', maxHeight:'65vh', overflowY:'auto'}}>
              {avizeModal.loading ? (
                <div style={{padding:'40px', textAlign:'center'}}><LoadingSpinner /></div>
              ) : avizeModal.cases.length === 0 ? (
                <div style={{padding:'40px', textAlign:'center', color:'var(--text-muted)'}}>
                  Nu există avize pentru această companie
                </div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
                  <thead>
                    <tr style={{background:'var(--bg-secondary)', borderBottom:'2px solid var(--border)'}}>
                      <th style={{padding:'10px 12px', textAlign:'left', fontWeight:600}}>Candidat</th>
                      <th style={{padding:'10px 12px', textAlign:'left', fontWeight:600}}>Nr. Aviz</th>
                      <th style={{padding:'10px 12px', textAlign:'left', fontWeight:600}}>Data Aviz</th>
                      <th style={{padding:'10px 12px', textAlign:'left', fontWeight:600}}>Funcție / COR</th>
                      <th style={{padding:'10px 12px', textAlign:'left', fontWeight:600}}>Nr. IGI</th>
                      <th style={{padding:'10px 12px', textAlign:'center', fontWeight:600}}>Dosar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avizeModal.cases.map((c, idx) => (
                      <tr key={c.id} style={{borderBottom:'1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'}}>
                        <td style={{padding:'9px 12px', fontWeight:500}}>{c.candidate_name || "-"}</td>
                        <td style={{padding:'9px 12px'}}>
                          <span style={{background:'#f0f4ff', color:'#4f46e5', padding:'2px 8px', borderRadius:'12px', fontWeight:600, fontSize:'0.8rem'}}>
                            {c.aviz_number}
                          </span>
                        </td>
                        <td style={{padding:'9px 12px', color:'var(--text-muted)'}}>{c.aviz_date || "-"}</td>
                        <td style={{padding:'9px 12px', fontSize:'0.78rem'}}>
                          {c.job_function ? (
                            <span title={c.job_function}>{c.job_function.length > 35 ? c.job_function.substring(0,35)+'…' : c.job_function}</span>
                          ) : "-"}
                          {c.cor_code && <span style={{marginLeft:6, color:'#6366f1', fontSize:'0.72rem', fontWeight:600}}>COR {c.cor_code}</span>}
                        </td>
                        <td style={{padding:'9px 12px', color:'var(--text-muted)', fontSize:'0.78rem'}}>{c.igi_number || "-"}</td>
                        <td style={{padding:'9px 12px', textAlign:'center'}}>
                          <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                            <button
                              className="btn btn-secondary"
                              style={{fontSize:'0.7rem', padding:'3px 8px'}}
                              onClick={() => { navigate(`/immigration?search=${encodeURIComponent(c.candidate_name || '')}`); setAvizeModal({ open: false, company: null, cases: [], loading: false }); }}
                              title="Deschide dosarul de imigrare"
                            >
                              <ChevronRight size={11}/> Dosar
                            </button>
                            {c.igi_email_id && (
                              <a
                                href={`${API}/immigration/${c.id}/aviz-pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{fontSize:'0.7rem', padding:'3px 8px', textDecoration:'none'}}
                                title="Descarcă PDF aviz"
                              >
                                📄 PDF
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer" style={{padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:'12px', color:'var(--text-muted)'}}>
                {avizeModal.cases.length} avize • {avizeModal.company?.name}
              </span>
              <button className="btn btn-primary" style={{fontSize:'0.8rem'}}
                onClick={() => { navigate(`/immigration?company_id=${avizeModal.company?.id}`); setAvizeModal({ open: false, company: null, cases: [], loading: false }); }}
              >
                <ExternalLink size={13}/> Toate dosarele companiei
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Posturi Vacante Companie */}
      {jobsModal.open && (
        <div className="modal-overlay" onClick={() => setJobsModal({ open: false, company: null, jobs: [], loading: false })}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:'900px', width:'95vw', maxHeight:'92vh', overflowY:'auto'}}>
            <div className="modal-header">
              <div>
                <h2 style={{margin:0}}>💼 Posturi Vacante</h2>
                <div style={{fontSize:'13px', color:'var(--text-muted)', marginTop:'2px'}}>
                  {jobsModal.company?.name} — {jobsModal.jobs.length} posturi înregistrate
                </div>
              </div>
              <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                <button className="btn btn-primary" style={{fontSize:'0.8rem'}} onClick={() => setShowJobForm(!showJobForm)}>
                  <Plus size={14}/> {showJobForm ? "Anulează" : "Post Nou"}
                </button>
                <button className="close-btn" onClick={() => setJobsModal({ open: false, company: null, jobs: [], loading: false })}><X size={20}/></button>
              </div>
            </div>

            {/* Formular adăugare post rapid */}
            {showJobForm && (
              <div style={{padding:'16px 20px', background:'#f8fafc', borderBottom:'1px solid var(--border-color)'}}>
                <div style={{fontWeight:700, fontSize:'0.9rem', marginBottom:'12px', color:'#4f46e5'}}>{editingJobId ? '✏️ Editează Post' : 'Adaugă Post Vacant Nou'}</div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'10px'}}>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Titlu Post *</label>
                    <input type="text" value={jobForm.title || ""} onChange={e => setJobForm(f => ({...f, title: e.target.value}))}
                      placeholder="ex: Ospătar, Electrician" style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Locație</label>
                    <input type="text" value={jobForm.location || ""} onChange={e => setJobForm(f => ({...f, location: e.target.value}))}
                      placeholder="Oraș, țară" style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Nr. Locuri</label>
                    <input type="number" min="1" value={jobForm.headcount_needed || 1} onChange={e => setJobForm(f => ({...f, headcount_needed: e.target.value}))}
                      style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Salariu Min</label>
                    <input type="number" min="0" value={jobForm.salary_min || ""} onChange={e => setJobForm(f => ({...f, salary_min: e.target.value}))}
                      style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Salariu Max</label>
                    <input type="number" min="0" value={jobForm.salary_max || ""} onChange={e => setJobForm(f => ({...f, salary_max: e.target.value}))}
                      style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Valută</label>
                    <select value={jobForm.currency || "EUR"} onChange={e => setJobForm(f => ({...f, currency: e.target.value}))}
                      style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box'}}>
                      <option>EUR</option><option>RON</option><option>USD</option>
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:'10px'}}>
                  <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Cod COR</label>
                  <div style={{maxWidth:'500px'}}>
                    {/* Import inline COR selector using same CAEN pattern */}
                    <input type="text" value={jobForm.cor_code ? `${jobForm.cor_code} — ${jobForm.cor_name}` : ""}
                      readOnly placeholder="Completează din secțiunea Poziții Vacante pentru COR detaliat"
                      style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box', background:'#f9fafb', cursor:'not-allowed'}} />
                  </div>
                </div>
                <div style={{marginBottom:'10px'}}>
                  <label style={{fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:3}}>Descriere Post</label>
                  <textarea value={jobForm.description || ""} onChange={e => setJobForm(f => ({...f, description: e.target.value}))}
                    rows={2} placeholder="Detalii despre post, responsabilități..."
                    style={{width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.85rem', boxSizing:'border-box', resize:'vertical'}} />
                </div>
                <div style={{display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap'}}>
                  {[{key:'accommodation', label:'🏠 Cazare'},{key:'meals', label:'🍽️ Masă'},{key:'transport', label:'🚌 Transport'}].map(b => (
                    <label key={b.key} style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'0.85rem'}}>
                      <input type="checkbox" checked={!!jobForm[b.key]} onChange={e => setJobForm(f => ({...f, [b.key]: e.target.checked}))} /> {b.label}
                    </label>
                  ))}
                  {editingJobId && (
                    <button onClick={() => { setEditingJobId(null); setJobForm({ title:'', location:'', headcount_needed:1, salary_min:'', salary_max:'', currency:'EUR', cor_code:'', cor_name:'', description:'', accommodation:false, meals:false, transport:false, status:'activ' }); }}
                      style={{padding:'7px 14px', background:'#f3f4f6', color:'#374151', border:'1px solid #e5e7eb', borderRadius:'7px', cursor:'pointer', fontWeight:600, fontSize:'0.85rem'}}>
                      Anulează editarea
                    </button>
                  )}
                  <button onClick={saveJobFromCompany} style={{marginLeft:'auto', padding:'7px 18px', background: editingJobId ? '#f59e0b' : '#6366f1', color:'#fff', border:'none', borderRadius:'7px', cursor:'pointer', fontWeight:600, fontSize:'0.85rem'}}>
                    {editingJobId ? '💾 Actualizează Post' : 'Salvează Post'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista posturi existente */}
            <div className="modal-body" style={{padding:0, maxHeight:'50vh', overflowY:'auto'}}>
              {jobsModal.loading ? (
                <div style={{padding:'40px', textAlign:'center'}}><LoadingSpinner /></div>
              ) : jobsModal.jobs.length === 0 ? (
                <div style={{padding:'40px', textAlign:'center', color:'var(--text-muted)'}}>
                  Nu există posturi vacante pentru această companie.<br/>
                  <span style={{fontSize:'0.85rem'}}>Apasă "Post Nou" pentru a adăuga.</span>
                </div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem'}}>
                  <thead style={{background:'var(--bg-secondary)'}}>
                    <tr>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Titlu Post</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Locație</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Cod COR</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Salariu</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Locuri</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Beneficii</th>
                      <th style={{padding:'10px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Status</th>
                      <th style={{padding:'10px 14px', textAlign:'center', borderBottom:'1px solid var(--border-color)'}}>Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsModal.jobs.map((job, idx) => (
                      <tr key={job.id} style={{borderBottom:'1px solid var(--border-color)', background: idx%2===0?'transparent':'var(--bg-secondary)'}}>
                        <td style={{padding:'9px 14px', fontWeight:600}}>{job.title}</td>
                        <td style={{padding:'9px 14px', color:'var(--text-muted)'}}>{job.location || '—'}</td>
                        <td style={{padding:'9px 14px'}}>
                          {job.cor_code ? <span style={{background:'#eef2ff', color:'#4f46e5', padding:'2px 7px', borderRadius:'6px', fontWeight:700, fontSize:'0.78rem'}}>{job.cor_code}</span> : '—'}
                        </td>
                        <td style={{padding:'9px 14px', fontSize:'0.82rem'}}>
                          {job.salary_min || job.salary_max ? `${job.salary_min||'—'} - ${job.salary_max||'—'} ${job.currency||'EUR'}` : '—'}
                        </td>
                        <td style={{padding:'9px 14px'}}>
                          <span style={{fontWeight:600, color: (job.candidates_count||0) >= (job.headcount_needed||1) ? '#065f46' : '#374151'}}>
                            {job.candidates_count||0}/{job.headcount_needed||1}
                          </span>
                        </td>
                        <td style={{padding:'9px 14px'}}>
                          {job.accommodation && '🏠'}{job.meals && '🍽️'}{job.transport && '🚌'}
                          {!job.accommodation && !job.meals && !job.transport && '—'}
                        </td>
                        <td style={{padding:'9px 14px'}}>
                          <span style={{padding:'2px 8px', borderRadius:'10px', fontSize:'0.75rem', fontWeight:600, background: job.status==='activ'?'#d1fae5':job.status==='pauza'?'#fef3c7':'#f3f4f6', color: job.status==='activ'?'#065f46':job.status==='pauza'?'#92400e':'#374151'}}>
                            {job.status}
                          </span>
                        </td>
                        <td style={{padding:'9px 14px', textAlign:'center', display:'flex', gap:'6px', justifyContent:'center', alignItems:'center'}}>
                          <button onClick={() => { startEditJob(job); setShowJobForm(true); }}
                            style={{background:'none', border:'none', cursor:'pointer', color:'#f59e0b'}} title="Editează">
                            ✏️
                          </button>
                          <button onClick={() => deleteJobFromCompany(job.id)}
                            style={{background:'none', border:'none', cursor:'pointer', color:'#ef4444'}} title="Șterge">
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer" style={{padding:'12px 20px', borderTop:'1px solid var(--border-color)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:'12px', color:'var(--text-muted)'}}>{jobsModal.jobs.length} posturi • {jobsModal.company?.name}</span>
              <button className="btn btn-secondary" onClick={() => setJobsModal({ open: false, company: null, jobs: [], loading: false })}>Închide</button>
            </div>
          </div>
        </div>
      )}

      {/* Company Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} data-testid="company-modal">
            <div className="modal-header">
              <h2>{editingCompany?.id ? "Editare Companie" : "Companie Nouă"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* CUI + ANAF pe același rând */}
              <div style={{marginBottom:'14px'}}>
                <label style={{display:'block', fontSize:'0.82rem', fontWeight:'600', marginBottom:'5px', color:'#374151'}}>
                  Cod Fiscal (CUI) — introdu și apasă „Caută ANAF" pentru completare automată
                </label>
                <div style={{display:'flex', gap:'8px', alignItems:'stretch'}}>
                  <input
                    type="text"
                    value={editingCompany?.cui || ""}
                    onChange={(e) => { setEditingCompany({ ...editingCompany, cui: e.target.value }); setCuiLookup(e.target.value); }}
                    onKeyDown={(e) => e.key === "Enter" && lookupCUI()}
                    placeholder="ex: 1070683 sau RO1070683"
                    style={{flex:1, padding:'9px 12px', border:'2px solid #6366f1', borderRadius:'8px', fontSize:'0.95rem', fontWeight:'500'}}
                    data-testid="company-cui-input"
                    autoFocus
                  />
                  <button
                    onClick={lookupCUI}
                    disabled={lookupLoading}
                    style={{padding:'9px 18px', background: lookupLoading ? '#9ca3af' : '#6366f1', color:'#fff', border:'none', borderRadius:'8px', cursor: lookupLoading ? 'not-allowed' : 'pointer', fontWeight:'600', fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'7px', whiteSpace:'nowrap'}}
                    data-testid="cui-lookup-btn"
                  >
                    {lookupLoading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
                    {lookupLoading ? "Se caută..." : "Caută ANAF"}
                  </button>
                </div>
                {lookupLoading && (
                  <div style={{marginTop:'6px', padding:'7px 11px', background:'#eff6ff', borderRadius:'6px', fontSize:'0.8rem', color:'#1d4ed8', display:'flex', alignItems:'center', gap:'6px'}}>
                    <RefreshCw size={12} className="spin" /> Se interoghează ANAF... poate dura 5-10 secunde
                  </div>
                )}
                {!lookupLoading && !editingCompany?.name && (
                  <div style={{marginTop:'5px', fontSize:'0.75rem', color:'#9ca3af'}}>
                    💡 Completarea automată preia: Denumire, Județ, Adresă, Nr.Reg.Com., Telefon, Cod CAEN
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label>Nume Companie *</label>
                  <input
                    type="text"
                    value={editingCompany?.name || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                    placeholder="Se completează automat după Caută ANAF"
                    data-testid="company-name-input"
                  />
                </div>
                <div className="form-group">
                  <label>Județ</label>
                  <input
                    type="text"
                    value={editingCompany?.county || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, county: e.target.value })}
                    placeholder="ex: Cluj"
                  />
                </div>
                <div className="form-group">
                  <label>Localitate</label>
                  <input
                    type="text"
                    value={editingCompany?.city || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })}
                    placeholder="ex: Cluj-Napoca"
                  />
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label>Adresă completă</label>
                  <input
                    type="text"
                    value={editingCompany?.address || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                    placeholder="Completat automat din ANAF"
                  />
                </div>
                <div className="form-group">
                  <label>Nr. Reg. Comerțului</label>
                  <input
                    type="text"
                    value={editingCompany?.reg_commerce || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, reg_commerce: e.target.value })}
                    placeholder="ex: J12/123/2020"
                  />
                </div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label>Cod CAEN — Domeniu de Activitate</label>
                  <CAENSelector
                    value={editingCompany?.caen_code || ""}
                    valueName={editingCompany?.caen_name || ""}
                    onChange={(code, name, section) => setEditingCompany({ ...editingCompany, caen_code: code, caen_name: name, industry: section })}
                  />
                  {editingCompany?.industry && (
                    <small style={{color:'#6b7280', marginTop:'4px', display:'block'}}>Sector: {editingCompany.industry}</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Nr. Posturi Cerute</label>
                  <input
                    type="number"
                    min="0"
                    value={editingCompany?.positions_needed || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, positions_needed: parseInt(e.target.value) || null })}
                    placeholder="Total posturi solicitate"
                  />
                </div>
                <div className="form-group">
                  <label>Persoană Contact</label>
                  <input
                    type="text"
                    value={editingCompany?.contact_person || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editingCompany?.phone || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingCompany?.email || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingCompany?.status || "activ"}
                    onChange={(e) => setEditingCompany({ ...editingCompany, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="inactiv">Inactiv</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editingCompany?.notes || ""}
                  onChange={(e) => setEditingCompany({ ...editingCompany, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            {/* ── Secțiunea Posturi Vacante ── */}
            <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '12px', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Briefcase size={16} style={{ color: '#6366f1' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1f2937' }}>Posturi Vacante</span>
                  {pendingJobs.length > 0 && (
                    <span style={{ background: '#6366f1', color: '#fff', borderRadius: '12px', padding: '1px 8px', fontSize: '0.75rem', fontWeight: 700 }}>{pendingJobs.length}</span>
                  )}
                </div>
                <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Se salvează odată cu compania</span>
              </div>

              {/* Lista posturi adăugate */}
              {pendingJobs.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pendingJobs.map((job, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <Briefcase size={13} style={{ color: '#10b981' }} />
                      <span style={{ fontWeight: 600, flex: 1 }}>{job.title}</span>
                      {job.location && <span style={{ color: '#6b7280' }}>📍 {job.location}</span>}
                      <span style={{ color: '#6b7280' }}>× {job.headcount_needed} locuri</span>
                      {job.salary_min && <span style={{ color: '#6b7280' }}>{job.salary_min}-{job.salary_max||'?'} {job.currency}</span>}
                      <button onClick={() => setPendingJobs(p => p.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 4px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Formular de adăugare post rapid */}
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Titlu Post</label>
                    <input type="text" value={newJobRow.title} onChange={e => setNewJobRow(r => ({ ...r, title: e.target.value }))}
                      placeholder="ex: Ospătar, Electrician, Stivuitorist"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Locație</label>
                    <input type="text" value={newJobRow.location} onChange={e => setNewJobRow(r => ({ ...r, location: e.target.value }))}
                      placeholder="Oraș, țară"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Nr. Locuri</label>
                    <input type="number" min="1" value={newJobRow.headcount_needed} onChange={e => setNewJobRow(r => ({ ...r, headcount_needed: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Salariu Min</label>
                    <input type="number" min="0" value={newJobRow.salary_min} onChange={e => setNewJobRow(r => ({ ...r, salary_min: e.target.value }))}
                      placeholder="ex: 1200"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Salariu Max</label>
                    <input type="number" min="0" value={newJobRow.salary_max} onChange={e => setNewJobRow(r => ({ ...r, salary_max: e.target.value }))}
                      placeholder="ex: 1800"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '3px', color: '#374151' }}>Valută</label>
                    <select value={newJobRow.currency} onChange={e => setNewJobRow(r => ({ ...r, currency: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.85rem', boxSizing: 'border-box' }}>
                      <option>EUR</option><option>RON</option><option>USD</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {[{ key: 'accommodation', label: '🏠 Cazare' }, { key: 'meals', label: '🍽️ Masă' }, { key: 'transport', label: '🚌 Transport' }].map(b => (
                    <label key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.82rem' }}>
                      <input type="checkbox" checked={!!newJobRow[b.key]} onChange={e => setNewJobRow(r => ({ ...r, [b.key]: e.target.checked }))} />
                      {b.label}
                    </label>
                  ))}
                  <button
                    onClick={() => {
                      if (!newJobRow.title) return showNotification("Completează titlul postului", "error");
                      setPendingJobs(p => [...p, { ...newJobRow }]);
                      setNewJobRow({ title: '', location: '', headcount_needed: 1, salary_min: '', salary_max: '', currency: 'EUR', description: '', accommodation: false, meals: false, transport: false });
                    }}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Plus size={14} /> Adaugă Post
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave} data-testid="save-company-btn">Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompaniesPage;
