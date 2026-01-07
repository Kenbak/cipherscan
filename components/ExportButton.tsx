'use client';

import { useState } from 'react';

interface ExportButtonProps {
  data: any;
  csvData?: any[]; // Optional: separate data source for CSV (e.g., transactions array)
  filename: string;
  type: 'json' | 'csv' | 'both';
  csvHeaders?: string[];
  csvMapper?: (item: any) => string[];
  label?: string;
}

export function ExportButton({
  data,
  csvData,
  filename,
  type,
  csvHeaders,
  csvMapper,
  label = 'Export'
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  const downloadFile = (content: string, ext: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExported(ext.toUpperCase());
    setTimeout(() => setExported(null), 2000);
  };

  const exportAsJson = () => {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'json', 'application/json');
    setIsOpen(false);
  };

  const exportAsCsv = () => {
    if (!csvHeaders || !csvMapper) {
      console.error('CSV export requires headers and mapper');
      return;
    }

    // Use csvData if provided, otherwise fall back to data
    const sourceData = csvData !== undefined ? csvData : data;
    const items = Array.isArray(sourceData) ? sourceData : [sourceData];
    const rows = items.map(csvMapper);
    const csvContent = [
      csvHeaders.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    downloadFile(csvContent, 'csv', 'text/csv');
    setIsOpen(false);
  };

  // For single format, just show a button
  if (type === 'json') {
    return (
      <button
        onClick={exportAsJson}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary hover:text-cipher-cyan border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all"
        title="Export as JSON"
      >
        {exported === 'JSON' ? (
          <>
            <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Exported!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {label} JSON
          </>
        )}
      </button>
    );
  }

  if (type === 'csv') {
    return (
      <button
        onClick={exportAsCsv}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary hover:text-cipher-cyan border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all"
        title="Export as CSV"
      >
        {exported === 'CSV' ? (
          <>
            <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Exported!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {label} CSV
          </>
        )}
      </button>
    );
  }

  // For 'both', show a dropdown
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary hover:text-cipher-cyan border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all"
      >
        {exported ? (
          <>
            <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {exported} Exported!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {label}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="dropdown-menu absolute right-0 mt-2 w-40 border rounded-lg shadow-xl z-20 overflow-hidden">
            <button
              onClick={exportAsJson}
              className="dropdown-item w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              JSON
            </button>
            {csvHeaders && csvMapper && (
              <button
                onClick={exportAsCsv}
                className="dropdown-item w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 border-t navbar-border"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
