"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

const HALF_W = 200;
const HALF_H = 90;
const THICK = 40;
const STEP = 122;
const PAD_TOP = 40;
const CX = 260;
const CANVAS_W = 520;

interface Layer {
  id: string;
  name: string;
  role: string;
  body: string;
  color: string;
}

const LAYERS: Layer[] = [
  {
    id: "aegis",
    name: "AEGIS",
    role: "Policy & orchestration",
    body: "You set the policy — destinations, limits, deadlines. AEGIS holds it and checks every proposed action against it before anything moves.",
    color: "#2E7DE0",
  },
  {
    id: "og",
    name: "0G · TeeML",
    role: "Decision verification",
    body: "The proposed action is verified inside a trusted execution environment. A signed verdict comes back — not a backend's opinion.",
    color: "#4A94ED",
  },
  {
    id: "safe",
    name: "Safe",
    role: "2-of-3 custody",
    body: "The agent signs, AEGIS co-signs. One key alone — stolen, leaked or rogue — can't move anything on its own.",
    color: "#62AFFC",
  },
  {
    id: "hedera",
    name: "Hedera",
    role: "Settlement",
    body: "Approved actions settle here in one batch — the provider gets paid and AEGIS's fee lands in the same transaction.",
    color: "#8CC4FB",
  },
  {
    id: "graph",
    name: "The Graph",
    role: "Indexed history",
    body: "Every decision — approved or denied — is indexed and queryable. Your audit trail, not a spreadsheet someone maintains.",
    color: "#B7DBFC",
  },
];

const CANVAS_H = PAD_TOP + 2 * HALF_H + (LAYERS.length - 1) * STEP + THICK + 24;

function layerCy(i: number) {
  return PAD_TOP + HALF_H + i * STEP;
}

function facePaths(cy: number) {
  return {
    top: `M ${CX} ${cy - HALF_H} L ${CX + HALF_W} ${cy} L ${CX} ${cy + HALF_H} L ${CX - HALF_W} ${cy} Z`,
    left: `M ${CX - HALF_W} ${cy} L ${CX} ${cy + HALF_H} L ${CX} ${cy + HALF_H + THICK} L ${CX - HALF_W} ${cy + THICK} Z`,
    right: `M ${CX} ${cy + HALF_H} L ${CX + HALF_W} ${cy} L ${CX + HALF_W} ${cy + THICK} L ${CX} ${cy + HALF_H + THICK} Z`,
  };
}

function StackVisual({ active }: { active: number }) {
  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      aria-hidden="true"
      className="block w-full max-w-[420px] overflow-visible lg:max-w-[480px]"
    >
      {[...LAYERS].map((_, idx) => {
        const i = LAYERS.length - 1 - idx;
        const layer = LAYERS[i];
        const { top, left, right } = facePaths(layerCy(i));
        const isActive = active === i;
        const base = isActive ? "var(--color-foreground)" : layer.color;
        return (
          <g
            key={layer.id}
            className="transition-all duration-[320ms] ease-out motion-reduce:transition-none"
            style={{
              opacity: isActive ? 1 : 0.45,
              transform: isActive ? "translateY(-10px)" : "translateY(0)",
            }}
          >
            <path
              d={left}
              style={{
                fill: `color-mix(in srgb, ${base}, black 42%)`,
              }}
            />
            <path
              d={right}
              style={{
                fill: `color-mix(in srgb, ${base}, black 22%)`,
              }}
            />
            <path d={top} style={{ fill: base }} />
          </g>
        );
      })}
    </svg>
  );
}

export function StackSection() {
  const [active, setActive] = useState(0);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    blockRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="flow" className="relative">
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <header className="mx-auto max-w-[60ch] pb-8 pt-8 text-center lg:pt-12">
          <p className="font-mono text-overline uppercase text-brand-strong">The stack</p>
          <h2 className="mt-4 text-h2">The stack behind every transaction</h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-body-lg text-muted">
            Each layer has one job. Scroll to see what happens where.
          </p>
        </header>

        <div className="lg:hidden">
          {LAYERS.map((layer, i) => (
            <div
              key={layer.id}
              data-index={i}
              ref={el => {
                blockRefs.current[i] = el;
              }}
              className="flex flex-col justify-center py-10"
            >
              <TextBlock layer={layer} index={i} active={active === i} align="left" />
              <div className="mt-8 flex justify-center">
                <StackVisual active={i} />
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:grid lg:gap-x-10" style={{ gridTemplateColumns: "1fr 480px 1fr" }}>
          <div
            className="col-start-2 row-start-1 flex justify-center self-start"
            style={{ gridRow: `1 / span ${LAYERS.length}`, top: "7rem", position: "sticky" }}
          >
            <StackVisual active={active} />
          </div>

          {LAYERS.map((layer, i) => {
            const onLeft = i % 2 === 0;
            return (
              <div
                key={layer.id}
                data-index={i}
                ref={el => {
                  blockRefs.current[i] = el;
                }}
                style={{ gridRow: i + 1, gridColumn: onLeft ? 1 : 3 }}
                className="flex min-h-[42vh] items-center"
              >
                <TextBlock layer={layer} index={i} active={active === i} align={onLeft ? "right" : "left"} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TextBlock({
  layer,
  index,
  active,
  align,
}: {
  layer: Layer;
  index: number;
  active: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "border-l-2 pl-6 transition-all duration-700 ease-in-out lg:opacity-0",
        align === "right" && "lg:border-l-0 lg:border-r-2 lg:pl-0 lg:pr-6 lg:text-right",
        active ? "border-brand lg:opacity-100" : "border-border lg:pointer-events-none",
      )}
    >
      <p className="font-mono text-overline uppercase text-brand-strong">
        Layer {String(index + 1).padStart(2, "0")} / 05 · {layer.role}
      </p>
      <h3 className="mt-3 text-h3 text-foreground">{layer.name}</h3>
      <p className={cn("mt-3 max-w-[42ch] text-body text-muted", align === "right" && "lg:ml-auto")}>{layer.body}</p>
    </div>
  );
}
