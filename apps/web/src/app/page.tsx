import { MovementStudy } from "@/components/movement-study";

export default function Home() {
  return (
    <main className="exhibition">
      <header className="exhibition__heading">
        <p className="eyebrow">A study in motion</p>
        <h1>Beautiful Chaos</h1>
      </header>
      <section className="exhibition__work" aria-label="Artwork">
        <MovementStudy />
      </section>
      <footer className="exhibition__caption">
        <span>Movement, not the moment.</span>
        <span className="exhibition__edition">An ongoing experiment</span>
      </footer>
    </main>
  );
}
