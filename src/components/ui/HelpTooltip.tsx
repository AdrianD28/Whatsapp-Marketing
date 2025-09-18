import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Modal } from './Modal';

interface HelpTooltipProps {
  title: string;
  tooltip: string;
  children: React.ReactNode; // Modal content
}

export function HelpTooltip({ title, tooltip, children }: HelpTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  return (
    <span className="inline-flex items-center relative">
      <button
        type="button"
        aria-label={title}
        className="ml-2 text-gray-400 hover:text-gray-200"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {hover && (
        <span className="absolute z-20 -top-2 left-6 bg-gray-800 text-gray-100 text-xs px-2 py-1 rounded shadow">
          {tooltip}
        </span>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title}>
        <div className="text-sm text-gray-200 space-y-2">{children}</div>
      </Modal>
    </span>
  );
}
