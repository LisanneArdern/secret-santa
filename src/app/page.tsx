import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1>Santa Swap</h1>
      <p>Run a Secret Santa round with friends and family.</p>
      <p>
        <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
