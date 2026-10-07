"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-start justify-center gap-4 px-4">
      <h1 className="text-3xl font-black tracking-tight text-taxi">Something went wrong.</h1>
      <p className="text-sm text-white/70">Try again to reload this screen.</p>
      <button
        type="button"
        onClick={reset}
        className="bg-taxi px-4 py-3 text-sm font-black uppercase tracking-wider text-ink"
      >
        Try again
      </button>
    </main>
  );
}
