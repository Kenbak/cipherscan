'use client';

import { InputsSection } from './InputsSection';
import { OutputsSection } from './OutputsSection';
import type { TransactionData, TxClassification } from './types';

interface InputsOutputsSectionProps {
  data: TransactionData;
  classification: TxClassification;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function InputsOutputsSection({
  data,
  classification,
  copiedText,
  onCopy,
}: InputsOutputsSectionProps) {
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <InputsSection data={data} copiedText={copiedText} onCopy={onCopy} />
        <OutputsSection
          data={data}
          classification={classification}
          copiedText={copiedText}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}
