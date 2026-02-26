import Link from "next/link";

type OnboardingCardProps = {
  title?: string;
  description?: string;
};

export default function OnboardingCard({
  title = "No workspace membership yet",
  description = "Join with an invite code or create a new workspace to get started.",
}: OnboardingCardProps) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/join"
          className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Join workspace
        </Link>
        <Link
          href="/create-workspace"
          className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Create workspace
        </Link>
      </div>
    </section>
  );
}
