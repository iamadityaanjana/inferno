import { Sidebar } from "@/components/app/Sidebar";

/**
 * Signed-in shell. Warm-gray canvas with the rail sitting directly on it; every
 * page's content lives inside one white rounded panel.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f1f1ef]">
      <Sidebar />
      <div className="min-w-0 md:pl-[212px]">
        <main className="p-2 md:py-3 md:pr-3 md:pl-0">
          <div className="flex min-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-[#e4e4e0] bg-white shadow-[0_1px_3px_rgba(28,28,26,0.04)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
