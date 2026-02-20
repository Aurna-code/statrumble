export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">StatRumble MVP</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Prompt 00 scaffolding page. Functional logic will be implemented in later prompts.
      </p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">CSV 업로드</h2>
        <p className="mt-1 text-sm text-zinc-600">업로드 UI 자리표시</p>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">차트</h2>
        <p className="mt-1 text-sm text-zinc-600">Recharts 차트 영역 자리표시</p>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">스레드 목록</h2>
        <p className="mt-1 text-sm text-zinc-600">Arena 스레드 목록 자리표시</p>
      </section>
    </main>
  );
}
