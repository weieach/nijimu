import React, { useEffect, useRef, useState } from "react";
import { RotateCcw, Layers, Info } from "lucide-react";
import SceneViewer from "./components/3D/screenViewer";

export default function App() {
  const [isIdle, setIsIdle] = useState(false);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [canvasBlurPx, setCanvasBlurPx] = useState(7);
  const [matOpacity, setMatOpacity] = useState(0.05 + (2 / 9) * 0.35); // Thickness display 3
  const [evolve, setEvolve] = useState(0);
  const [fluidity, setFluidity] = useState(0);
  const [bumpAmount, setBumpAmount] = useState(0);
  const [bumpSpike, setBumpSpike] = useState(0);
  const [density, setDensity] = useState(200);
  const idleTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Idle detection — fade UI chrome after 3 s of no mouse movement
  useEffect(() => {
    const resetIdle = () => {
      setIsIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(
        () => setIsIdle(true),
        3000,
      );
    };

    resetIdle(); // start timer on mount
    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keydown", resetIdle);
    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const chromeStyle: React.CSSProperties = {
    opacity: isIdle ? 0.3 : 1,
    transition: "opacity 200ms ease",
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Space Grotesk', sans-serif",
        background:
          "radial-gradient(ellipse 120% 100% at 50% 35%,rgb(238, 238, 238) 0%, #d0d0d0 35%,rgb(191, 191, 191) 70%,rgb(73, 73, 73) 100%)",
        zIndex: 0,
      }}
    >
      {/* ── Noise overlay (film grain) ───────────────────────────── */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      {/* ── Frosted glass overlay (full page) ───────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 10,
          backdropFilter: "blur(24px) saturate(160%) brightness(1.04)",
          WebkitBackdropFilter:
            "blur(24px) saturate(160%) brightness(1.04)",
          background: "rgba(255, 255, 255, 0.06)",
          maskImage: `radial-gradient(
    ellipse 55% 52% at 50% 50%,
    transparent 0%,
    transparent 38%,
    rgba(0,0,0,0.15) 52%,
    rgba(0,0,0,0.55) 68%,
    rgba(0,0,0,0.92) 84%,
    black 100%
  )`,
          WebkitMaskImage: `radial-gradient(
    ellipse 55% 52% at 50% 50%,
    transparent 0%,
    transparent 38%,
    rgba(0,0,0,0.15) 52%,
    rgba(0,0,0,0.55) 68%,
    rgba(0,0,0,0.92) 84%,
    black 100%
  )`,
        }}
      />

      {/* ── Header Bar ─────────────────────────────────────────── */}
      <header
        style={{
          ...chromeStyle,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "transparent",
          zIndex: 100,
        }}
      >
        {/* Title */}
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
            color: "#252019",
          }}
        >
          Atomic Viewer
        </span>

        {/* Icon Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {[
            { Icon: RotateCcw, label: "Rotate" },
            { Icon: Layers, label: "Explode view" },
            { Icon: Info, label: "Info" },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              title={label}
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "1px solid rgba(37, 33, 28, 0.5)",
                borderRadius: 4,
                cursor: "pointer",
                color: "#252019",
                padding: 0,
                transition:
                  "border-color 200ms ease, color 200ms ease",
              }}
              onMouseEnter={(e) => {
                (
                  e.currentTarget as HTMLButtonElement
                ).style.borderColor = "rgba(37, 33, 28, 0.65)";
                (
                  e.currentTarget as HTMLButtonElement
                ).style.color = "#1c1915";
              }}
              onMouseLeave={(e) => {
                (
                  e.currentTarget as HTMLButtonElement
                ).style.borderColor = "rgba(37, 33, 28, 0.5)";
                (
                  e.currentTarget as HTMLButtonElement
                ).style.color = "#252019";
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </header>

      {/* ── 3D Scene Container + Sliders (sliders outside box) ───── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
          gap: 24,
        }}
      >
        <div
          id="scene-container"
          onMouseDown={() => setIsGrabbing(true)}
          onMouseUp={() => setIsGrabbing(false)}
          onMouseEnter={(e) => {
            (
              e.currentTarget as HTMLDivElement
            ).style.borderColor = "rgba(37, 33, 28, 0.6)";
          }}
          onMouseLeave={(e) => {
            setIsGrabbing(false);
            (
              e.currentTarget as HTMLDivElement
            ).style.borderColor = "rgba(37, 33, 28, 0.5)";
          }}
          style={{
            width: "60vw",
            height: "60vh",
            minWidth: 400,
            minHeight: 400,
            background: "transparent",
            border: "1px solid rgba(37, 33, 28, 0.5)",
            borderRadius: 4,
            cursor: isGrabbing ? "grabbing" : "grab",
            transition: "border-color 200ms ease",
          }}
        >
          <SceneViewer
            autoRotate={autoRotate}
            onAutoRotateChange={setAutoRotate}
            canvasBlurPx={canvasBlurPx}
            matOpacity={matOpacity}
            fluidity={fluidity}
            setFluidity={setFluidity}
            evolve={evolve}
            setEvolve={setEvolve}
            bumpAmount={bumpAmount}
            setBumpAmount={setBumpAmount}
            bumpSpike={bumpSpike}
            setBumpSpike={setBumpSpike}
            density={density}
            setDensity={setDensity}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        </div>
        {/* Sliders panel — outside 3D box */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 20,
            padding: "12px 0",
          }}
        >
          {[
            {
              label: "EVOLVE",
              value: evolve,
              onChange: (v: number) => setEvolve(v),
              min: 0,
              max: 1,
              step: 0.01,
              display: `${Math.round(evolve * 100)}%`,
            },
            {
              label: "WEIGHT",
              value: fluidity,
              onChange: (v: number) => setFluidity(v),
              min: 0,
              max: 1,
              step: 0.01,
              display: `${Math.round(fluidity * 100)}%`,
            },
            {
              label: "BUMP",
              value: bumpAmount,
              onChange: (v: number) => setBumpAmount(v),
              min: 0,
              max: 0.15,
              step: 0.01,
              display: bumpAmount.toFixed(2),
            },
            {
              label: "DENSITY",
              value: density,
              onChange: (v: number) => setDensity(v),
              min: 100,
              max: 600,
              step: 1,
              display: String(density),
            },
            {
              label: "SPIKE",
              value: bumpSpike,
              onChange: (v: number) => setBumpSpike(v),
              min: 0,
              max: 1,
              step: 0.01,
              display: `${Math.round(bumpSpike * 100)}%`,
            },
          ].map(({ label, value, onChange, min, max, step, display }) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <label
                style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: "rgba(37, 33, 28, 0.9)",
                  textTransform: "uppercase",
                }}
              >
                {label} {display}
              </label>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{
                  width: 120,
                  accentColor: "rgba(37, 33, 28, 0.82)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: Blur slider + ROTATE button ───────────────── */}
      <div
        style={{
          position: "fixed",
          top: 56,
          right: 24,
          bottom: 52,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <label
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "rgba(37, 33, 28, 0.9)",
              textTransform: "uppercase",
            }}
          >
            Blur {canvasBlurPx}
          </label>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={canvasBlurPx}
            onChange={(e) => setCanvasBlurPx(Number(e.target.value))}
            style={{
              width: 100,
              accentColor: "rgba(37, 33, 28, 0.82)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <label
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "rgba(37, 33, 28, 0.9)",
              textTransform: "uppercase",
            }}
          >
            Thickness{" "}
            {Math.max(
              1,
              Math.min(10, Math.round(1 + ((matOpacity - 0.05) / 0.35) * 9)),
            )}
          </label>
          <input
            type="range"
            min={0.05}
            max={0.4}
            step={0.01}
            value={matOpacity}
            onChange={(e) => setMatOpacity(Number(e.target.value))}
            style={{
              width: 100,
              accentColor: "rgba(37, 33, 28, 0.82)",
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(37, 33, 28, 0.5)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "#252019",
            cursor: "pointer",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.3)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.15)";
          }}
        >
          {autoRotate ? "⏸ PAUSE" : "▶ ROTATE"}
        </button>
      </div>

      {/* ── Bottom-left hint (on top of all content) ─────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 52,
          left: 24,
          zIndex: 100,
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "rgba(37, 33, 28, 0.82)",
          userSelect: "none",
        }}
      >
        DRAG TO ROTATE · SCROLL TO ZOOM
      </div>

      {/* ── Bottom Status Bar ───────────────────────────────────── */}
      <footer
        style={{
          ...chromeStyle,
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "transparent",
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "rgba(37, 33, 28, 0.82)",
            fontWeight: 400,
            letterSpacing: "0.04em",
          }}
        >
          Form_01–03.glb
        </span>

        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "rgba(37, 33, 28, 0.82)",
            fontWeight: 400,
            letterSpacing: "0.04em",
          }}
        >
          drag to rotate · scroll to zoom
        </span>

        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "rgba(37, 33, 28, 0.82)",
            fontWeight: 400,
            letterSpacing: "0.04em",
          }}
        >
          sample mesh
        </span>
      </footer>

      {/* ── Responsive style override ───────────────────────────── */}
      <style>{`
        @media (max-width: 640px) {
          #scene-container {
            width: 90vw !important;
            height: 50vh !important;
            min-width: unset !important;
            min-height: unset !important;
          }
        }
      `}</style>
    </div>
  );
}