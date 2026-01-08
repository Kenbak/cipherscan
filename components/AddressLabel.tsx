'use client';

import { useState, useEffect } from 'react';
import { getAddressLabel, setCustomLabel, removeCustomLabel } from '@/lib/address-labels';

interface AddressLabelProps {
  address: string;
  showEditButton?: boolean;
  className?: string;
}

export function AddressLabel({ address, showEditButton = true, className = '' }: AddressLabelProps) {
  const [labelInfo, setLabelInfo] = useState<{ label: string; isOfficial: boolean; description?: string; category?: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  // Load label on mount and when address changes
  useEffect(() => {
    const info = getAddressLabel(address);
    setLabelInfo(info);
    setEditValue(info?.label || '');
  }, [address]);

  const handleSave = () => {
    setCustomLabel(address, editValue);
    setLabelInfo(getAddressLabel(address));
    setIsEditing(false);
  };

  const handleRemove = () => {
    removeCustomLabel(address);
    setLabelInfo(getAddressLabel(address));
    setEditValue('');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditValue(labelInfo?.label || '');
      setIsEditing(false);
    }
  };

  // Editing mode
  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a label..."
          className="px-2 py-1 text-xs font-mono bg-cipher-surface border border-cipher-border rounded focus:border-cipher-cyan focus:outline-none"
          autoFocus
        />
        <button
          onClick={handleSave}
          className="text-cipher-green hover:text-green-400 transition-colors"
          title="Save"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onClick={() => {
            setEditValue(labelInfo?.label || '');
            setIsEditing(false);
          }}
          className="text-gray-400 hover:text-gray-300 transition-colors"
          title="Cancel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Display mode with label
  if (labelInfo) {
    const bgColor = labelInfo.isOfficial
      ? labelInfo.category === 'foundation'
        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
        : labelInfo.category === 'exchange'
        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
        : labelInfo.category === 'mining'
        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
        : 'bg-cipher-cyan/20 border-cipher-cyan/50 text-cipher-cyan'
      : 'bg-gray-500/20 border-gray-500/50 text-gray-300';

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border ${bgColor}`}
          title={labelInfo.description}
        >
          {labelInfo.isOfficial && (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {labelInfo.label}
        </span>
        {showEditButton && !labelInfo.isOfficial && (
          <button
            onClick={handleRemove}
            className="text-gray-500 hover:text-red-400 transition-colors"
            title="Remove label"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // No label - show add button
  if (showEditButton) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={`text-gray-500 hover:text-cipher-cyan transition-colors text-xs font-mono flex items-center gap-1 ${className}`}
        title="Add a label for this address"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span>Add label</span>
      </button>
    );
  }

  return null;
}
