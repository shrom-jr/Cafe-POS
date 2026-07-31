import AppLayout from '@/components/ui/AppLayout';
import { GlassWater } from 'lucide-react';

const BarPortal = () => {
  return (
    <AppLayout title="Bar Portal">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div
          className="flex items-center justify-center w-20 h-20 rounded-2xl"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
        >
          <GlassWater size={36} style={{ color: '#818cf8' }} />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white/90 mb-1">Bar Portal</h2>
          <p className="text-sm text-white/40">Coming soon — bar order management will appear here.</p>
        </div>
      </div>
    </AppLayout>
  );
};

export default BarPortal;
