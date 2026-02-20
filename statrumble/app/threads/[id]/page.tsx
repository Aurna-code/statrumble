interface ThreadPageProps {
  params: Promise<{ id: string }>;
}

export default async function ThreadDetailPage({ params }: ThreadPageProps) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Thread #{id}</h1>
      <p className="mt-2 text-sm text-zinc-600">스레드 상세 페이지 자리표시</p>
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-sm text-zinc-600">
          구간 선택, Arena 댓글, Referee 결과 연결은 이후 프롬프트에서 구현합니다.
        </p>
      </div>
    </main>
  );
}
