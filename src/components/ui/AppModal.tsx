import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type AppModalProps = {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: string;
  showHeader?: boolean;
  closeOnBackdrop?: boolean;
};

/**
 * Shared application modal shell.
 *
 * Keep popup overlays and dialog chrome here so every modal has the same
 * viewport coverage, backdrop, stacking behavior, card treatment, and close
 * interaction. Content-specific layout belongs inside children.
 */
const AppModal = ({
  title,
  onClose,
  children,
  size = 'max-w-md',
  showHeader = true,
  closeOnBackdrop = false,
}: AppModalProps) => createPortal(
  <div
    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    onClick={closeOnBackdrop ? onClose : undefined}
  >
    <div
      className={`w-full ${size} p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-5`}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {showHeader && (
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white tracking-tight">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {children}
    </div>
  </div>,
  document.body,
);

export default AppModal;