
import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";

const INSTANCES = [
  {
    name: "Survival Fabric",
    loader: "Fabric",
    version: "1.20.1",
    status: "Installed",
  },
  {
    name: "Vanilla 1.21",
    loader: "Vanilla",
    version: "1.21",
    status: "Ready",
  },
  {
    name: "Forge RPG",
    loader: "Forge",
    version: "1.19.2",
    status: "Synced",
  },
  {
    name: "Quilt Testing",
    loader: "Quilt",
    version: "1.20.4",
    status: "Needs assets",
  },
];

function LibraryApp() {
  return (
    <main className="min-h-screen bg-[#060807] px-6 py-10 text-stone-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.42em] text-stone-500">
              CouchCraft
            </p>
            <h1 className="mt-2 font-display text-5xl tracking-[-0.06em] text-white">
              Library
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-stone-400">
              Standalone library page for installed instances.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-stone-200 transition hover:border-lime-300/40 hover:text-lime-200"
          >
            Back Home
          </a>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {INSTANCES.map((instance) => (
            <article
              key={instance.name}
              className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl tracking-[-0.04em] text-white">
                    {instance.name}
                  </h2>
                  <p className="mt-2 text-sm uppercase tracking-[0.3em] text-stone-500">
                    {instance.loader} / Minecraft {instance.version}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-stone-300">
                  {instance.status}
                </span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LibraryApp />
  </React.StrictMode>,
);
