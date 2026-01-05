import React, { useState } from 'react';
import { analyzePhotos } from './geminiService';
import { AIResponse, AuditContext, ActionRegisterItem, LanguageMode, FindingStatus, VerificationResult } from './types';
import { calculateRisk, getRiskColor, getStatusColor, validateStatusTransition, updateOverdueStatus, generateHTMLReport, generateMarkdownReport } from './utils';

// --- Components ---

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default function App() {
  // HOOKS MOVED TO TOP LEVEL TO FIX ERROR #310
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'md'|'json'|'pdf'>('pdf'); // Export tab state

  // Screen 1 State
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [context, setContext] = useState<AuditContext>({
    site: 'Factory A',
    area: '',
    auditType: 'Daily Walk',
    date: new Date().toISOString().split('T')[0],
    languageMode: 'bilingual'
  });

  // Screen 2 Data
  const [items, setItems] = useState<ActionRegisterItem[]>([]); 

  // --- Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files) as File[];
      setFiles(prev => [...prev, ...newFiles]);
      
      // Generate previews
      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleAnalyze = async () => {
    if (files.length === 0) {
      setError("Please upload at least one photo. / Vui lòng tải lên ít nhất 1 ảnh.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await analyzePhotos(files, context);
      // Process items (add overdue flags based on runtime date)
      const processedItems = result.action_register_json.map(item => updateOverdueStatus(item));
      setItems(processedItems);
      setScreen(2);
    } catch (err) {
      setError("Analysis failed. Check API Key. / Phân tích thất bại.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (id: string, updates: Partial<ActionRegisterItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const updatedItem = { ...item, ...updates };

      // Re-calculate Risk if L or S changed
      if (updates.likelihood || updates.severity) {
        const { score, level } = calculateRisk(updatedItem.likelihood, updatedItem.severity);
        updatedItem.risk_score = score;
        updatedItem.risk_level = level;
      }
      
      // Update overdue status if due date changed
      return updateOverdueStatus(updatedItem);
    }));
  };

  const handleStatusChange = (id: string, newStatus: FindingStatus) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const validation = validateStatusTransition(item, newStatus);
    if (!validation.valid) {
      alert(validation.message);
      // We do not proceed with update if validation fails
      return;
    }
    
    // Status Logic
    let updates: Partial<ActionRegisterItem> = { status: newStatus };
    if (newStatus === 'Closed' && !item.completion_date) {
        updates.completion_date = new Date().toISOString().split('T')[0];
    }
    if (newStatus === 'In-progress' && item.status === 'Open') {
        // Automatically confirm owner if moving to in-progress
        updates.owner_confirmed = true;
    }

    updateItem(id, updates);
  };

  // --- Renderers ---

  const renderLanguageLabel = (text: { vi: string, en: string }) => {
    const mode = context.languageMode;
    return (
      <div className="text-sm">
        {(mode === 'bilingual' || mode === 'vi') && <div className="text-slate-900 mb-1">{text.vi}</div>}
        {(mode === 'bilingual' || mode === 'en') && <div className="text-slate-500 italic text-xs">{text.en}</div>}
      </div>
    );
  };

  // Screen 1: Upload
  const renderScreen1 = () => (
    <div className="max-w-md mx-auto p-4 bg-white rounded-xl shadow-lg mt-4 mb-10">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-slate-800">EHS Photo Audit Assistant</h1>
        <p className="text-xs text-gray-500">Mobile-first • Bilingual • AI Powered</p>
      </div>
      
      <div className="space-y-4">
        {/* Context Inputs */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Site / Nhà máy</label>
          <select 
            className="block w-full rounded-md border-gray-300 shadow-sm p-2 border text-sm"
            value={context.site}
            onChange={(e) => setContext({...context, site: e.target.value})}
          >
            <option>Factory A</option>
            <option>Factory B</option>
            <option>Factory C</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Area / Khu vực</label>
          <input 
            type="text" 
            placeholder="e.g. Sewing Line 1"
            className="block w-full rounded-md border-gray-300 shadow-sm p-2 border text-sm"
            value={context.area}
            onChange={(e) => setContext({...context, area: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Type / Loại</label>
            <select 
                className="block w-full rounded-md border-gray-300 shadow-sm p-2 border text-sm"
                value={context.auditType}
                onChange={(e) => setContext({...context, auditType: e.target.value})}
            >
                <option>Daily Walk</option>
                <option>Weekly EHS</option>
                <option>External Audit</option>
            </select>
           </div>
           <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date / Ngày</label>
            <input 
                type="date"
                className="block w-full rounded-md border-gray-300 shadow-sm p-2 border text-sm"
                value={context.date}
                onChange={(e) => setContext({...context, date: e.target.value})}
            />
           </div>
        </div>

        {/* Language Mode */}
        <div className="bg-gray-50 p-3 rounded-lg">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Language Mode / Ngôn ngữ</label>
            <div className="flex flex-col space-y-2">
                {['bilingual', 'vi', 'en'].map((mode) => (
                    <label key={mode} className="inline-flex items-center">
                        <input 
                            type="radio" 
                            className="form-radio text-blue-600 h-4 w-4" 
                            name="langMode" 
                            checked={context.languageMode === mode}
                            onChange={() => setContext({...context, languageMode: mode as LanguageMode})}
                        />
                        <span className="ml-2 text-sm text-gray-700">
                            {mode === 'vi' ? 'Tiếng Việt only' : mode === 'en' ? 'English only' : 'Bilingual (Song ngữ)'}
                        </span>
                    </label>
                ))}
            </div>
        </div>

        {/* Upload */}
        <div className="mt-4">
            <label className="block w-full cursor-pointer bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:bg-blue-100 transition relative">
                <span className="text-blue-600 font-semibold block text-sm">Tap to Upload Photo(s)</span>
                <span className="text-blue-400 text-xs block">Chạm để tải ảnh</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
        </div>

        {/* Previews */}
        {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4">
                {previews.map((src, idx) => (
                    <img key={idx} src={src} alt="preview" className="h-20 w-full object-cover rounded-md border bg-gray-100" />
                ))}
            </div>
        )}

        {error && <div className="text-red-500 text-sm mt-2 font-medium bg-red-50 p-2 rounded">{error}</div>}

        <button 
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold shadow-md hover:bg-blue-700 transition flex justify-center items-center mt-6 disabled:opacity-50 text-sm uppercase tracking-wide"
        >
            {loading ? <><Spinner /><span className="ml-2">Analyzing... / Đang xử lý...</span></> : "Analyze Photos / Phân tích ngay"}
        </button>
      </div>
    </div>
  );

  // Screen 2: Findings List
  const renderScreen2 = () => (
    <div className="max-w-3xl mx-auto p-4 pb-32">
       <div className="flex justify-between items-center mb-4 sticky top-0 bg-gray-50 py-2 z-10 border-b">
            <h2 className="text-lg font-bold text-slate-800">Findings Review</h2>
            <div className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-700">{items.length} items</div>
       </div>

       <div className="space-y-6">
            {items.sort((a,b) => b.risk_score - a.risk_score).map((item) => (
                <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gray-50 p-3 border-b flex justify-between items-start">
                        <div className="flex-1 pr-2">
                            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">ID: {item.id}</span>
                            <h3 className="font-bold text-sm text-slate-800 leading-tight mb-1">{item.finding_title.vi}</h3>
                            <p className="text-xs text-slate-500 italic leading-tight">{item.finding_title.en}</p>
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap ${getRiskColor(item.risk_level)}`}>
                            {item.risk_level.toUpperCase()} ({item.risk_score})
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-4">
                        {/* Image Context */}
                        {previews[item.photo_index] && (
                            <div className="flex gap-3">
                                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                                    <img src={previews[item.photo_index]} className="w-full h-full object-cover" alt="Evidence" />
                                </div>
                                <div className="flex-1 text-xs">
                                     <div className="mb-2">
                                        <strong className="text-slate-700 block">Visible Evidence / Bằng chứng:</strong>
                                        {renderLanguageLabel(item.evidence)}
                                     </div>
                                </div>
                            </div>
                        )}

                        {/* Editable Controls Grid */}
                        <div className="bg-blue-50 p-3 rounded-lg text-xs space-y-3 border border-blue-100">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-blue-800 mb-1">Status / Trạng thái</label>
                                    <select 
                                        value={item.status}
                                        onChange={(e) => handleStatusChange(item.id, e.target.value as FindingStatus)}
                                        className={`block w-full rounded border-gray-300 p-1.5 text-xs border ${getStatusColor(item.status)}`}
                                    >
                                        <option value="Open">Open</option>
                                        <option value="In-progress">In-progress</option>
                                        <option value="Closed">Closed</option>
                                        <option value="Rejected">Rejected</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-bold text-blue-800 mb-1">Owner / Chủ trì</label>
                                    <input 
                                        type="text" 
                                        value={item.owner}
                                        onChange={(e) => updateItem(item.id, { owner: e.target.value })}
                                        className="block w-full rounded border-gray-300 p-1.5 border"
                                    />
                                    <label className="inline-flex items-center mt-1">
                                      <input 
                                        type="checkbox" 
                                        checked={item.owner_confirmed}
                                        onChange={(e) => updateItem(item.id, { owner_confirmed: e.target.checked })}
                                        className="form-checkbox h-3 w-3 text-blue-600"
                                      />
                                      <span className="ml-1 text-[10px] text-gray-600">Confirmed / Đã xác nhận</span>
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-blue-800 mb-1">Due Date / Hạn</label>
                                    <input 
                                        type="date" 
                                        value={item.due_date}
                                        onChange={(e) => updateItem(item.id, { due_date: e.target.value })}
                                        className={`block w-full rounded border-gray-300 p-1.5 border ${item.overdue_flag ? 'border-red-500 text-red-600 bg-red-50' : ''}`}
                                    />
                                    {item.overdue_flag && <span className="text-[10px] text-red-600 font-bold block mt-1">⚠️ OVERDUE</span>}
                                </div>
                                <div>
                                    <label className="block font-bold text-blue-800 mb-1">Risk (L x S)</label>
                                    <div className="flex gap-1">
                                        <input 
                                          type="number" min="1" max="5" 
                                          value={item.likelihood}
                                          onChange={(e) => updateItem(item.id, { likelihood: parseInt(e.target.value) || 1 })}
                                          className="w-full p-1.5 rounded border text-center"
                                          title="Likelihood"
                                        />
                                        <span className="self-center">x</span>
                                        <input 
                                          type="number" min="1" max="5" 
                                          value={item.severity}
                                          onChange={(e) => updateItem(item.id, { severity: parseInt(e.target.value) || 1 })}
                                          className="w-full p-1.5 rounded border text-center"
                                          title="Severity"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status Reason & Evidence Links (Added to satisfy validation workflow) */}
                            <div>
                                <label className="block font-bold text-blue-800 mb-1">Status Reason / Lý do (Required)</label>
                                <input 
                                    type="text" 
                                    placeholder="Lý do (VI) / Reason (EN)"
                                    value={item.status_reason?.vi || ''}
                                    onChange={(e) => updateItem(item.id, { status_reason: { ...item.status_reason, vi: e.target.value, en: item.status_reason.en || e.target.value } })}
                                    className="block w-full rounded border-gray-300 p-1.5 border text-xs"
                                />
                            </div>
                             <div>
                                <label className="block font-bold text-blue-800 mb-1">Evidence Links</label>
                                <textarea 
                                    placeholder="Paste URLs here..."
                                    value={item.evidence_links ? item.evidence_links.join('\n') : ''}
                                    onChange={(e) => updateItem(item.id, { evidence_links: e.target.value.split('\n').filter(s => s.trim() !== '') })}
                                    className="block w-full rounded border-gray-300 p-1.5 border text-xs h-16"
                                />
                            </div>
                            
                            {/* Verification Details */}
                            <div className="pt-2 border-t border-blue-200">
                                <label className="block font-bold text-blue-800 mb-1">Verification / Xác minh</label>
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                     <select
                                        value={item.verification_result}
                                        onChange={(e) => updateItem(item.id, { verification_result: e.target.value as VerificationResult })}
                                        className="block w-full rounded border-gray-300 p-1.5 border"
                                    >
                                        <option value="Pending">Pending</option>
                                        <option value="Pass">Pass</option>
                                        <option value="Fail">Fail</option>
                                    </select>
                                    <input 
                                        type="text" 
                                        placeholder="Verifier Name"
                                        value={item.verifier || ''}
                                        onChange={(e) => updateItem(item.id, { verifier: e.target.value })}
                                        className="block w-full rounded border-gray-300 p-1.5 border"
                                    />
                                </div>
                                <input 
                                    type="date"
                                    value={item.verification_date || ''}
                                    onChange={(e) => updateItem(item.id, { verification_date: e.target.value })}
                                    className="block w-full rounded border-gray-300 p-1.5 border"
                                />
                            </div>
                        </div>

                        {/* CAP Preview Collapsible-ish */}
                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                            <strong className="block text-gray-800 mb-1">Corrective / Khắc phục:</strong>
                            <p>{item.corrective_action.vi}</p>
                            <p className="italic text-gray-500 mt-1">{item.corrective_action.en}</p>
                        </div>
                    </div>
                </div>
            ))}
       </div>

       {/* Floating Action Bar */}
       <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
           <button onClick={() => setScreen(1)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold text-sm border border-gray-300">
              ← Upload
           </button>
           <button onClick={() => setScreen(3)} className="flex-[2] bg-green-600 text-white py-3 rounded-lg font-bold text-sm shadow-md hover:bg-green-700">
              Export Report / Xuất Báo Cáo →
           </button>
       </div>
    </div>
  );

  // Screen 3: Export
  const renderScreen3 = () => {
    // Generate dynamic content based on edited items
    const contextString = `${context.site} | ${context.area} | ${context.date}`;
    const dynamicHTML = generateHTMLReport(items, contextString);
    const dynamicMD = generateMarkdownReport(items, contextString, context.languageMode);
    const dynamicJSON = JSON.stringify(items, null, 2);

    const handlePrintPDF = () => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(dynamicHTML);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <div className="bg-slate-800 text-white p-4 shadow-md flex justify-between items-center z-20">
                <h2 className="font-bold text-lg">Export Report</h2>
                <button onClick={() => setScreen(2)} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition">
                    Edit / Sửa
                </button>
            </div>

            <div className="flex border-b bg-white shadow-sm z-10">
                <button 
                    onClick={() => setTab('pdf')} 
                    className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'pdf' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    PDF (Print)
                </button>
                <button 
                    onClick={() => setTab('md')} 
                    className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'md' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    Markdown
                </button>
                <button 
                    onClick={() => setTab('json')} 
                    className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'json' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    JSON
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-8">
                {tab === 'pdf' && (
                    <div className="max-w-[210mm] mx-auto bg-white shadow-xl min-h-[297mm] rounded-sm overflow-hidden flex flex-col">
                         <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <span className="text-xs text-gray-500">Preview Mode</span>
                            <button onClick={handlePrintPDF} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 text-sm font-bold flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                Print / Save PDF
                            </button>
                         </div>
                         <div className="flex-1 overflow-auto bg-white">
                            {/* Render raw HTML for preview */}
                            <div className="origin-top scale-75 md:scale-100 p-8" dangerouslySetInnerHTML={{ __html: dynamicHTML }} />
                         </div>
                    </div>
                )}
                {tab === 'md' && (
                    <textarea 
                        readOnly 
                        className="w-full h-full p-4 font-mono text-sm bg-white rounded-lg shadow border resize-none"
                        value={dynamicMD}
                    />
                )}
                {tab === 'json' && (
                    <textarea 
                        readOnly 
                        className="w-full h-full p-4 font-mono text-xs bg-slate-900 text-green-400 rounded-lg shadow border resize-none"
                        value={dynamicJSON}
                    />
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      {screen === 1 && renderScreen1()}
      {screen === 2 && renderScreen2()}
      {screen === 3 && renderScreen3()}
    </div>
  );
}