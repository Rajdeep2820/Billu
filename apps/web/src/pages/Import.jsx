import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import api from '../api/client';

const BILLU_FIELDS = [
  { key: 'sku', label: 'SKU / Barcode', required: true },
  { key: 'name', label: 'Product Name', required: true },
  { key: 'basePrice', label: 'Price (Rs.)', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'quantity', label: 'Stock Quantity', required: false },
];

export default function Import() {
  const { user } = useAuth();
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [sampleRows, setSampleRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Unsupported file type. Please upload CSV or Excel (.xlsx, .xls)');
      return;
    }
    setFile(selectedFile);
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHeaders(res.data.headers);
      setMapping(res.data.detectedMapping);
      setSampleRows(res.data.sampleRows);
      setTotalRows(res.data.totalRows);
      setStep('mapping');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleCommit = async () => {
    setLoading(true);
    setStep('importing');
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('outletId', user?.outletId || '');
    formData.append('defaultQuantity', mapping.quantity ? '' : '100');

    try {
      const res = await api.post('/import/commit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setStep('result');
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
      setStep('mapping');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setMapping({});
    setSampleRows([]);
    setTotalRows(0);
    setResult(null);
    setError(null);
  };

  const stepLabel = {
    upload: 'Step 1 of 4 — Select File',
    mapping: 'Step 2 of 4 — Map Columns',
    importing: 'Step 3 of 4 — Importing...',
    result: 'Step 4 of 4 — Complete',
  };

  return (
    <Win95Shell activeWindow="Import CSV">
      <Win95Window
        icon="📁"
        title="Import Products — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          stepLabel[step],
          file ? `📎 ${file.name}` : 'No file selected',
          `User: ${user?.name || user?.email || 'admin'}`,
        ]}
      >
        {/* Error Banner */}
        {error && (
          <div style={{background:'#ffffcc',border:'2px solid #000',padding:'6px 10px',marginBottom:10,fontSize:16}}>
            ⚠️ {error}
          </div>
        )}

        {/* ── STEP 1: Upload ── */}
        {step === 'upload' && (
          <>
            <div className="win95-section-header">► Select File to Import</div>
            <div
              className="win95-sunken"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '50px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? '#e0e0e0' : '#ffffff',
              }}
            >
              <div style={{fontSize:40,marginBottom:8}}>📁</div>
              <div style={{fontSize:20,fontWeight:'bold',marginBottom:4}}>
                {loading ? 'Analyzing file...' : 'Drag & Drop your file here'}
              </div>
              <div style={{fontSize:16,color:'#808080',marginBottom:16}}>
                Supports CSV, Excel (.xlsx, .xls)
              </div>
              <button className="win95-btn win95-btn-primary" type="button">
                Browse Files
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{display:'none'}}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </>
        )}

        {/* ── STEP 2: Column Mapping ── */}
        {step === 'mapping' && (
          <>
            {/* File info bar */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div>
                <span style={{fontWeight:'bold'}}>📎 {file?.name}</span>
                <span style={{color:'#808080',marginLeft:8}}>({totalRows} rows detected)</span>
              </div>
              <button className="win95-btn" onClick={resetAll}>Change File</button>
            </div>

            {/* Mapping Section */}
            <div className="win95-section-header">► Column Mapping</div>
            <div className="win95-raised" style={{padding:12,marginBottom:10}}>
              <div style={{fontSize:16,color:'#808080',marginBottom:10}}>
                Map your file columns to Billu POS fields. Auto-detected mappings shown below.
              </div>
              <div style={{display:'grid',gap:8}}>
                {BILLU_FIELDS.map(field => (
                  <div key={field.key} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:160,fontSize:18,fontWeight:'bold'}}>
                      {field.label} {field.required && <span style={{color:'#cc0000'}}>*</span>}
                    </div>
                    <div style={{fontSize:20,color:'#808080'}}>→</div>
                    <div className="win95-input-wrap" style={{flex:1}}>
                      <select
                        value={mapping[field.key] || ''}
                        onChange={(e) => setMapping(prev => ({...prev, [field.key]: e.target.value || undefined}))}
                      >
                        <option value="">— Select column —</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview Table — collapsible */}
            <div
              className="win95-section-header"
              style={{cursor:'pointer',userSelect:'none'}}
              onClick={() => setShowPreview(v => !v)}
            >
              {showPreview ? '▼' : '►'} Preview (first 5 rows)
            </div>
            <div style={{
              maxHeight: showPreview ? '220px' : '0px',
              overflow: 'hidden',
              transition: 'max-height 0.35s ease',
              marginBottom: 10,
            }}>
              <div className="win95-sunken" style={{padding:0,maxHeight:200,overflow:'auto'}}>
                <table>
                  <thead>
                    <tr>
                      {headers.map(h => (
                        <th key={h} style={{
                          background: Object.values(mapping).includes(h) ? '#000080' : '#808080',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, i) => (
                      <tr key={i}>
                        {headers.map(h => (
                          <td key={h} style={{
                            fontWeight: Object.values(mapping).includes(h) ? 'bold' : 'normal',
                          }}>{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="win95-btn" onClick={resetAll}>Cancel</button>
              <button
                className="win95-btn win95-btn-primary"
                disabled={!mapping.sku || !mapping.name || !mapping.basePrice}
                onClick={handleCommit}
              >
                Import {totalRows} Products
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Importing ── */}
        {step === 'importing' && (
          <>
            <div className="win95-section-header">► Importing Products</div>
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <div style={{fontSize:40,marginBottom:8}}>⏳</div>
              <div style={{fontSize:20,fontWeight:'bold',marginBottom:8}}>
                Importing {totalRows} products...
              </div>
              <div style={{fontSize:16,color:'#808080',marginBottom:16}}>
                Please wait, this may take a moment.
              </div>
              {/* Win95 Progress Bar */}
              <div className="win95-sunken" style={{height:24,width:'60%',margin:'0 auto'}}>
                <div style={{
                  height:'100%', background:'#000080', width:'70%',
                  animation: 'none',
                }} />
              </div>
            </div>
          </>
        )}

        {/* ── STEP 4: Result ── */}
        {step === 'result' && result && (
          <>
            <div className="win95-section-header">
              ► Import {result.errors.length === 0 ? 'Successful' : 'Complete with Errors'}
            </div>

            {/* Stat Cards */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,margin:'12px 0'}}>
              <div className="win95-stat">
                <div className="win95-stat-value" style={{color:'#008000'}}>{result.imported}</div>
                <div className="win95-stat-label">Imported</div>
              </div>
              <div className="win95-stat">
                <div className="win95-stat-value" style={{color:'#cc0000'}}>{result.errors.length}</div>
                <div className="win95-stat-label">Errors</div>
              </div>
              <div className="win95-stat">
                <div className="win95-stat-value">{result.total}</div>
                <div className="win95-stat-label">Total Rows</div>
              </div>
            </div>

            {/* Error List */}
            {result.errors.length > 0 && (
              <>
                <div className="win95-section-header">► Error Details</div>
                <div className="win95-sunken" style={{padding:0,maxHeight:160,overflow:'auto',marginBottom:10}}>
                  <table>
                    <thead>
                      <tr><th style={{width:80}}>Row</th><th>Error</th></tr>
                    </thead>
                    <tbody>
                      {result.errors.slice(0, 20).map((e, i) => (
                        <tr key={i}>
                          <td style={{color:'#cc0000',fontWeight:'bold'}}>{e.row}</td>
                          <td>{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="win95-btn win95-btn-primary" onClick={resetAll}>
                Import Another File
              </button>
            </div>
          </>
        )}
      </Win95Window>
    </Win95Shell>
  );
}
