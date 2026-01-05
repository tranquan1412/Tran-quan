import { ActionRegisterItem, RiskLevel, FindingStatus, VerificationResult } from './types';

export const calculateRisk = (l: number, s: number): { score: number; level: RiskLevel } => {
  const score = l * s;
  let level: RiskLevel = 'Low';
  if (score >= 17) level = 'Critical';
  else if (score >= 10) level = 'High';
  else if (score >= 5) level = 'Medium';
  return { score, level };
};

export const getRiskColor = (level: RiskLevel) => {
  switch (level) {
    case 'Critical': return 'bg-red-600 text-white';
    case 'High': return 'bg-orange-500 text-white';
    case 'Medium': return 'bg-yellow-400 text-black';
    case 'Low': return 'bg-green-500 text-white';
    default: return 'bg-gray-200 text-black';
  }
};

export const getStatusColor = (status: FindingStatus) => {
  switch (status) {
    case 'Open': return 'bg-red-100 text-red-800 border-red-200';
    case 'In-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Closed': return 'bg-green-100 text-green-800 border-green-200';
    case 'Rejected': return 'bg-gray-100 text-gray-800 border-gray-200';
    default: return 'bg-white';
  }
};

export const validateStatusTransition = (
  item: ActionRegisterItem,
  newStatus: FindingStatus
): { valid: boolean; message?: string } => {
  // 1) Open -> In-progress
  if (item.status === 'Open' && newStatus === 'In-progress') {
    const hasOwnerConfirmed = item.owner_confirmed;
    const hasEvidence = item.evidence_links && item.evidence_links.length > 0;
    const hasReason = (item.status_reason.vi && item.status_reason.vi.trim() !== "") || 
                      (item.status_reason.en && item.status_reason.en.trim() !== "");
    
    // Requirement: owner_confirmed=true OR evidence_links has items OR status_reason indicates work
    if (!hasOwnerConfirmed && !hasEvidence && !hasReason) {
       return { valid: false, message: "To move to In-progress, please Confirm Owner, add Evidence Links, or provide a Status Reason (VI/EN)." };
    }
  }

  // 2) In-progress -> Closed
  if (newStatus === 'Closed') {
    if (item.verification_result !== 'Pass') {
      return { valid: false, message: 'Verification Result must be "Pass" to Close.' };
    }
    if (!item.verifier || !item.verification_date) {
      return { valid: false, message: 'Verifier and Verification Date are required.' };
    }
    // Check minimum evidence implies corrective/preventive exists, which is handled by the model generation usually.
  }

  // 3) Closed -> In-progress (Reopen)
  if (item.status === 'Closed' && newStatus === 'In-progress') {
     const hasReason = (item.status_reason.vi && item.status_reason.vi.trim() !== "") || 
                       (item.status_reason.en && item.status_reason.en.trim() !== "");
     if (!hasReason) {
         return { valid: false, message: "Provide a Status Reason (recurrence evidence) to Reopen." };
     }
  }

  return { valid: true };
};

export const updateOverdueStatus = (item: ActionRegisterItem): ActionRegisterItem => {
  if (!item.due_date) return item;
  
  const today = new Date();
  const dueDate = new Date(item.due_date);
  const diffTime = dueDate.getTime() - today.getTime();
  const daysToDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return {
    ...item,
    days_to_due: daysToDue,
    overdue_flag: daysToDue < 0 && item.status !== 'Closed'
  };
};

// Re-generate the HTML report dynamically based on current edited state
export const generateHTMLReport = (items: ActionRegisterItem[], contextStr: string): string => {
  const rows = items.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>
        <div class="vi font-bold">${item.finding_title.vi}</div>
        <div class="en text-sm italic text-gray-600">${item.finding_title.en}</div>
      </td>
      <td>
        <span class="badge ${item.risk_level}">${item.risk_level} (${item.risk_score})</span>
      </td>
      <td>${item.owner}</td>
      <td>${item.due_date}</td>
      <td>${item.status}</td>
      <td>${item.verification_result}</td>
    </tr>
  `).join('');

  const detailSections = items.map(item => `
    <div class="finding-block">
      <h3>Finding #${item.id}: ${item.finding_title.vi} <br/><span style="font-size:0.8em;color:#666;font-weight:normal;">${item.finding_title.en}</span></h3>
      <div class="meta-row">
        <span><strong>Area:</strong> ${item.area}</span> | 
        <span><strong>Category:</strong> ${item.category}</span>
      </div>
      <div class="grid-2">
        <div>
          <strong>Observation / Quan sát:</strong>
          <p class="vi">${item.observation.vi}</p>
          <p class="en">${item.observation.en}</p>
        </div>
        <div>
          <strong>Evidence / Bằng chứng:</strong>
          <p class="vi">${item.evidence.vi}</p>
          <p class="en">${item.evidence.en}</p>
        </div>
      </div>
      
      <div class="cap-box">
        <h4>Corrective Action Plan (CAP)</h4>
        <div class="row">
           <strong>Containment (0-24h):</strong> <br/> VI: ${item.containment_0_24h.vi} <br/> EN: ${item.containment_0_24h.en}
        </div>
        <div class="row">
           <strong>Corrective:</strong> <br/> VI: ${item.corrective_action.vi} <br/> EN: ${item.corrective_action.en}
        </div>
        <div class="row">
           <strong>Root Cause:</strong> <br/> VI: ${item.root_cause.vi} <br/> EN: ${item.root_cause.en}
        </div>
      </div>

      <div class="status-box">
        <strong>Status:</strong> ${item.status} 
        ${item.verifier ? ` | <strong>Verifier:</strong> ${item.verifier} (${item.verification_date})` : ''}
        ${item.status_reason?.vi ? `<br/><strong>Reason:</strong> ${item.status_reason.vi} / ${item.status_reason.en}` : ''}
      </div>
    </div>
    <hr/>
  `).join('');

  // Generate Closure Evidence Summary for Closed findings
  const closedItems = items.filter(i => i.status === 'Closed');
  const closureRows = closedItems.length > 0 ? closedItems.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.finding_title.en}</td>
      <td>
        ${item.evidence_links.length > 0 ? item.evidence_links.map(link => `<a href="${link}" target="_blank">Link</a>`).join(', ') : 'No link'}
      </td>
      <td>${item.evidence_types ? item.evidence_types.join(', ') : ''}</td>
      <td>${item.completion_date || 'N/A'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" style="text-align:center">No closed items found.</td></tr>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.4; }
        h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
        h2 { margin-top: 30px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
        .info-block { background: #f8fafc; padding: 15px; margin-bottom: 20px; border-radius: 8px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        th { background-color: #f1f5f9; font-weight: bold; }
        .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; color: white; display: inline-block; font-size: 11px; }
        .Critical { background-color: #dc2626; }
        .High { background-color: #f97316; }
        .Medium { background-color: #facc15; color: black; }
        .Low { background-color: #22c55e; }
        .finding-block { margin-bottom: 30px; page-break-inside: avoid; }
        .meta-row { font-size: 12px; color: #64748b; margin-bottom: 10px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 10px; }
        .vi { color: #000; margin-bottom: 4px; }
        .en { color: #666; font-style: italic; font-size: 0.9em; margin-top: 0; }
        .cap-box { background: #f0fdf4; padding: 10px; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; }
        .status-box { margin-top: 10px; padding: 5px; background: #eff6ff; border-radius: 4px; font-size: 12px; }
        .row { margin-bottom: 8px; }
        .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
        a { color: #2563eb; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>EHS Photo Audit Report / Báo cáo kiểm tra EHS từ ảnh</h1>
      <div class="info-block">
        <strong>Context:</strong> ${contextStr}
      </div>

      <h2>1. Action Register Summary</h2>
      <table>
        <thead>
          <tr>
            <th width="50">ID</th>
            <th>Finding / Phát hiện</th>
            <th width="80">Risk</th>
            <th width="80">Owner</th>
            <th width="80">Due Date</th>
            <th width="70">Status</th>
            <th width="60">Verif.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>2. Findings Details / Chi tiết phát hiện</h2>
      ${detailSections}

      <h2>3. Closure Evidence Summary / Tổng hợp bằng chứng đóng lỗi</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Finding</th>
            <th>Evidence Links</th>
            <th>Type</th>
            <th>Date Closed</th>
          </tr>
        </thead>
        <tbody>${closureRows}</tbody>
      </table>

      <div class="footer">
        Generated by EHS Photo Audit Assistant
      </div>
    </body>
    </html>
  `;
};

// Re-generate Markdown Report
export const generateMarkdownReport = (items: ActionRegisterItem[], contextStr: string, mode: 'bilingual' | 'vi' | 'en'): string => {
  const showVi = mode === 'bilingual' || mode === 'vi';
  const showEn = mode === 'bilingual' || mode === 'en';

  let report = `# EHS Photo Audit Report\n\n${contextStr}\n\n`;

  items.forEach((item, index) => {
    report += `## Finding #${item.id} - ${showVi ? item.finding_title.vi : ''} ${showEn ? '/' + item.finding_title.en : ''}\n\n`;
    
    report += `**Area/Khu vực**: ${item.area}\n`;
    report += `**Category**: ${item.category}\n`;
    report += `**Risk**: ${item.risk_level} (Score: ${item.risk_score})\n\n`;

    if (showVi) report += `**Quan sát**: ${item.observation.vi}\n`;
    if (showEn) report += `**Observation**: ${item.observation.en}\n`;
    report += '\n';

    if (showVi) report += `**Bằng chứng từ ảnh**: ${item.evidence.vi}\n`;
    if (showEn) report += `**Evidence from photo**: ${item.evidence.en}\n`;
    report += '\n';

    report += `### CAP\n`;
    if (showVi) report += `- **Khắc phục**: ${item.corrective_action.vi}\n`;
    if (showEn) report += `- **Corrective**: ${item.corrective_action.en}\n`;
    if (showVi) report += `- **Nguyên nhân**: ${item.root_cause.vi}\n`;
    if (showEn) report += `- **Root Cause**: ${item.root_cause.en}\n`;

    report += `\n**Owner**: ${item.owner} | **Due**: ${item.due_date} | **Status**: ${item.status}\n`;
    if (item.status === 'Closed') {
        report += `**Verification**: ${item.verification_result} by ${item.verifier} on ${item.verification_date}\n`;
    }
    report += `--------------------------------------------------\n\n`;
  });

  return report;
};