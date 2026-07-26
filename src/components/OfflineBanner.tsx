import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const OfflineBanner = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="relative z-[60] flex w-full shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-md"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">⚠️</span>
      <span>Working Offline — Orders will sync automatically when reconnected.</span>
    </div>
  );
};

export default OfflineBanner;