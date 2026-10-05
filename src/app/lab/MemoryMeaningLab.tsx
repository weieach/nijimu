import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useArtifactGeometry } from "../hooks/useArtifactGeometry";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { requestTranscription } from "../lib/transcribe";
import { requestMemoryAssessment } from "../lib/assessMemory";
import { FAMILY_LABELS, FAMILY_PATTERNS, MEMORY_FAMILIES, assignMemoryShape, familyForm, type MemoryAssessment, type MemoryShapeFamily } from "../lib/memoryShape";
import { MAX_TRANSCRIPT_LENGTH, SCORE_KEYS } from "../../../shared/memory-assessment.mjs";
import { type ArtifactForm, type SuperParams } from "../lib/superformula";
import { PillButton } from "../components/PillButton";
import { SANS, SERIF } from "../lib/theme";

const INK = "#626d69";
const small: CSSProperties = { fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: INK };
const button: CSSProperties = { ...small, border: "1px solid #a9b4ad66", padding: "6px 12px", borderRadius: 20, background: "transparent", cursor: "pointer" };
const SAMPLES = [
  { label: "quiet recollection", text: "I spent the afternoon going through my grandmother’s old letters alone. Outside it was raining. I wasn't looking for answers; I just wanted to sit with her handwriting for a while. I felt held by that small room and wanted to keep the moment close." },
  { label: "opening gently", text: "We spread our sketchbooks out in the autumn sunshine. I watched the trees and listened to my friends talking. I felt comfortable enough to show them something unfinished. That afternoon I wanted to let the world in." },
  { label: "turning inward", text: "After the rejection, I stopped answering messages for a few days. The result hurt more than I expected. I kept replaying what I had done and sat alone trying to understand it. What I remember is how tightly everything seemed to fold back into me." },
  { label: "joyful intensity", text: "When the last song started, the whole crowd jumped together. I was laughing and shouting with strangers, completely overwhelmed by how alive it felt. I wanted to reach everyone around me. It was joyful and almost unbearably intense." },
] as const;
export function FamilyMesh({ form }: { form: ArtifactForm }) {
  const { geometry } = useArtifactGeometry(form);
  return <mesh geometry={geometry}><meshStandardMaterial color="#91b3a5" metalness={0.23} roughness={0.33} /></mesh>;
}
function FormView({ form, large = false }: { form: ArtifactForm; large?: boolean }) {
  return <div style={{ height: large ? 290 : 175 }}>
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3.1, 2.8, 4.8], fov: large ? 32 : 34 }} gl={{ alpha: true }}>
      <ambientLight intensity={1.1} /><directionalLight position={[3, 5, 4]} intensity={2.5} /><directionalLight position={[-3, 0, -2]} intensity={0.8} color="#b7d3d7" />
      <FamilyMesh form={form} /><OrbitControls enablePan={false} enableZoom={false} />
    </Canvas>
  </div>;
}
const params = (s: SuperParams) => `${s.m}, ${s.n1}, ${s.n2}, ${s.n3}`;
const blankScores: MemoryAssessment = { orientation: 0, comfort: 0, intensity: 0, discomfort: 0, disruption: 0, mixedness: 0, insufficientEvidence: false, summary: "manual parameter study", beats: [{ quote: "manual", reading: "manually positioned on the map", orientation: 0, intensity: 0 }] };

/** Assessment and parameter study, deliberately separate from the production journey. */
export function MemoryMeaningLab() {
  const navigate = useNavigate();
  const location = useLocation();
  const [transcript, setTranscript] = useState<string>(() => typeof location.state?.transcript === "string" ? location.state.transcript.slice(0, MAX_TRANSCRIPT_LENGTH) : "");
  const [memoryId] = useState(() => crypto.randomUUID());
  const [variation, setVariation] = useState(0);
  const seed = `${memoryId}|${variation}`;
  const [reading, setReading] = useState<MemoryAssessment | null>(null);
  const [model, setModel] = useState<string>();
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const audioRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; request.current?.abort(); }; }, []);
  const changeTranscript = (text: string) => {
    revision.current++; audioRevision.current++; request.current?.abort(); setPending(false); setReading(null); setModel(undefined); setError(null); setManual(false); setTranscript(text);
  };
  const recorder = useVoiceRecorder({ onStop: async audio => {
    if (!audio) { setError("No audio was captured. You can write the memory instead."); return; }
    const generation = ++audioRevision.current;
    setTranscribing(true); setError(null);
    const result = await requestTranscription(audio);
    if (!mounted.current || generation !== audioRevision.current) return;
    setTranscribing(false);
    if (result.transcript) changeTranscript(result.transcript.slice(0, MAX_TRANSCRIPT_LENGTH));
    else setError(result.error);
  } });
  const assignment = assignMemoryShape(reading, seed, manual ? "manual" : "api", model, transcript);
  const analyze = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const generation = ++revision.current;
    setPending(true); setManual(false); setReading(null); setError(null); setModel(undefined);
    const result = await requestMemoryAssessment(transcript, controller.signal);
    if (!mounted.current || generation !== revision.current || controller.signal.aborted) return;
    setPending(false); setReading(result.assessment); setModel(result.model); setError(result.error);
  };
  const setScores = (next: MemoryAssessment) => {
    request.current?.abort(); revision.current++; setPending(false); setManual(true); setReading({ ...next, beats: next.beats.length ? next.beats : blankScores.beats }); setModel(undefined); setError(null);
  };
  const chooseFamily = (family: MemoryShapeFamily) => setScores({ ...blankScores,
    orientation: family === "shell" || family === "tower" ? -1 : 1,
    intensity: family === "tower" || family === "floral" ? 1 : 0,
    comfort: family === "shell" || family === "bowl" ? 1 : 0,
  });
  const go = () => navigate(`/lab/descent${location.search}`, { state: {
    transcript, memoryId, highlightedWords: [],
    // An unassessed account starts reading while the photo is chosen. An explicit
    // fallback or a completed/manual reading is carried without another API call.
    ...((reading || error || pending) ? { memoryAssignment: assignment } : {}),
  } });
  return <main style={{ minHeight: "100dvh", background: "#edf0eb", color: INK, padding: "26px clamp(18px, 4vw, 64px) 56px", boxSizing: "border-box" }}>
    <header style={{ display: "flex", gap: 24, justifyContent: "space-between", ...small }}><span>lab — memory & form</span><Link to="/" style={{ color: "inherit" }}>back to nijimu</Link></header>
    <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(28px, 4vw, 46px)", margin: "32px 0 8px" }}>what shape does a memory hold?</h1>
    <p style={{ ...small, maxWidth: 690 }}>inward or outward. soft or sharp. intensity can be joyful, too. these four families are starting forms for your hands.</p>
    <section aria-label="four parameter families" className="meaning-families" style={{ display: "grid", gap: 16, margin: "26px 0 38px" }}>
      {MEMORY_FAMILIES.map(family => <article key={family} style={{ border: "1px solid #a9b4ad55", borderRadius: 8, padding: "8px 14px 16px" }}>
        <FormView form={familyForm(family, seed)} />
        <button style={{ ...button, border: 0, padding: 0, fontFamily: SERIF, fontSize: 21 }} onClick={() => chooseFamily(family)}>{FAMILY_LABELS[family]}</button>
        <p style={{ ...small, minHeight: 38 }}>{FAMILY_PATTERNS[family].note}</p>
        <p style={{ ...small, fontSize: 10, margin: 0 }}>top ({params(FAMILY_PATTERNS[family].top)})<br />side ({params(FAMILY_PATTERNS[family].side)})</p>
      </article>)}
    </section>
    <div className="meaning-workspace" style={{ display: "grid", gap: 40, alignItems: "start" }}>
      <section>
        <label htmlFor="memory-transcript" style={{ fontFamily: SERIF, fontSize: 24 }}>the whole memory</label>
        <p style={small}>record or paste the full account. choosing an example does not assign its shape.</p>
        <textarea id="memory-transcript" value={transcript} maxLength={MAX_TRANSCRIPT_LENGTH} disabled={transcribing || recorder.isRecording}
          onChange={e => changeTranscript(e.target.value)} placeholder="i remember…" rows={8}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 18, fontFamily: SERIF, fontSize: 18, lineHeight: 1.6, color: INK, background: "#ffffff44", border: "1px solid #a9b4ad88", borderRadius: 8 }} />
        <div style={{ ...small, display: "flex", justifyContent: "space-between", margin: "8px 0 16px" }}>
          <span>{transcript.length} / {MAX_TRANSCRIPT_LENGTH}</span>
          <button style={button} disabled={transcribing || pending} onClick={() => {
            if (recorder.isRecording) recorder.stop(); else { changeTranscript(transcript); void recorder.start(); }
          }}>{recorder.isRecording ? `stop recording · ${recorder.duration}s` : transcribing ? "transcribing…" : "record a memory"}</button>
        </div>
        {recorder.error && <p role="alert" style={small}>the microphone is unavailable. you can write the memory instead.</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {SAMPLES.map(sample => <button key={sample.label} disabled={recorder.isRecording || transcribing} style={button} onClick={() => changeTranscript(sample.text)}>{sample.label}</button>)}
        </div>
        <PillButton label={pending ? "reading the memory…" : "find its form"} onClick={() => void analyze()} disabled={!transcript.trim() || pending || recorder.isRecording || transcribing} />
        <p style={{ ...small, fontSize: 11 }}>this sends the transcript to the server’s language model. the photo stays in your browser.</p>
        <div aria-live="polite">
          {error && <p role="status" style={small}>{error}</p>}
          {reading && !manual && <>
            <p style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.5 }}>{reading.summary}</p>
            {reading.insufficientEvidence && <p style={small}>there is not enough evidence for a family. a neutral form will accompany it.</p>}
            {reading.beats.map((beat, i) => <blockquote key={i} style={{ borderLeft: "1px solid #a9b4ad", paddingLeft: 14, margin: "18px 0", ...small }}><span style={{ fontFamily: SERIF, fontSize: 17 }}>“{beat.quote}”</span><br />{beat.reading}</blockquote>)}
          </>}
        </div>
      </section>
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", gap: 8 }}>
          <div role="img" aria-label={`memory map: outward ${assignment.coordinates.outward.toFixed(2)}, sharpness ${assignment.coordinates.sharpness.toFixed(2)}`} style={{ position: "relative", aspectRatio: "1", border: "1px solid #a9b4ad66", background: "#f4f5f166", borderRadius: 8 }}>
            <div style={{ position: "absolute", left: "50%", top: 24, bottom: 24, borderLeft: "1px solid #a9b4ad77" }} /><div style={{ position: "absolute", top: "50%", left: 24, right: 24, borderTop: "1px solid #a9b4ad77" }} />
            <span style={{ ...small, position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)" }}>rounded</span>
            <span style={{ ...small, position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)" }}>sharp</span>
            <span style={{ ...small, position: "absolute", left: 6, top: "50%", transform: "translateY(-120%)" }}>inward</span><span style={{ ...small, position: "absolute", right: 6, top: "50%", transform: "translateY(-120%)" }}>outward</span>
            <span style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: "#657f73", left: `calc(24px + (100% - 48px) * ${assignment.coordinates.outward})`, top: `calc(24px + (100% - 48px) * ${assignment.coordinates.sharpness})`, transform: "translate(-50%, -50%)", transition: "left .4s, top .4s" }} />
          </div>
          <FormView form={assignment.form} large />
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 25, margin: "4px 0 8px" }}>{assignment.family ? FAMILY_LABELS[assignment.family] : "a quiet, unassigned form"}</p>
        <p style={small}>{manual ? "manual study — this form was not inferred from the transcript" : assignment.family ? "a starting form; your hands can still change how it grows" : "a neutral starting point until the memory has been read"}</p>
        <div style={{ ...small, display: "flex", flexWrap: "wrap", gap: 14 }}>{MEMORY_FAMILIES.map(family => <span key={family}>{family} {Math.round(assignment.weights[family]*100)}%</span>)}</div>
        <p style={{ ...small, fontSize: 10 }}>family weights express position, not certainty. drag the form to turn it.<br />top ({params(assignment.form.top)}) · side ({params(assignment.form.side)})</p>
        <button style={button} onClick={() => setVariation(v => v+1)}>another variation</button>
        <details style={{ margin: "22px 0", ...small }}>
          <summary style={{ cursor: "pointer" }}>study the interpretation</summary>
          {SCORE_KEYS.map(key => <label key={key} style={{ display: "grid", gridTemplateColumns: "95px 1fr 35px", gap: 10, alignItems: "center", margin: "12px 0" }}>
            <span>{key}</span><input type="range" min={key === "orientation" ? -1 : 0} max={1} step={0.01} aria-label={key} value={reading?.[key] ?? 0}
              onChange={e => setScores({ ...(reading ?? blankScores), insufficientEvidence: false, [key]: Number(e.target.value) })} /><span>{(reading?.[key] ?? 0).toFixed(2)}</span>
          </label>)}
          <p>moving a slider switches to a manual study. mixedness is retained in the reading; it does not add random spikes.</p>
        </details>
        <PillButton label={pending ? "continue with a neutral form" : "take it to the water"} onClick={go} disabled={!transcript.trim() || transcribing || recorder.isRecording} trailing="›" />
      </section>
    </div>
    <style>{`.meaning-families { grid-template-columns: repeat(4, minmax(0,1fr)); } .meaning-workspace { grid-template-columns: 1fr 1fr; } @media (max-width: 850px) { .meaning-families { grid-template-columns: repeat(2,minmax(0,1fr)); } .meaning-workspace { grid-template-columns: 1fr; } }`}</style>
  </main>;
}
