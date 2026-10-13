import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Santa Swap</h1>
        <p>This round hasn&apos;t started yet. Check back soon.</p>
      </main>
    </div>
  );
}
