export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7f9ff] px-6 text-slate-600">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" aria-hidden />
      <p className="text-sm font-medium text-slate-700">Loading OpenDoor…</p>
    </div>
  );
}
