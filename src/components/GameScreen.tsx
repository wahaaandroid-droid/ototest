import { useEffect, useMemo, useRef, useState } from "react";
import { AutoAccompanimentScheduler } from "../audio/scheduler";
import type { ActiveVoice, WebAudioFontEngine } from "../audio/webAudioFontPlayer";
import { judgeTiming, MISS_GRACE_MS } from "../game/judge";
import { applyJudgement, buildResult, createInitialScore } from "../game/score";
import type { GameChart, GameNote, GameResult, Judgement, MidiTrackInfo, ParsedMidiFile, ScoreStats, TimingSettings } from "../game/types";
import { formatDuration } from "../utils/format";
import { ChordButtons } from "./ChordButtons";
import { NoteLane } from "./NoteLane";

type GameScreenProps = {
  midi: ParsedMidiFile;
  chart: GameChart;
  playerTrack: MidiTrackInfo;
  audio: WebAudioFontEngine;
  timing: TimingSettings;
  onFinish: (result: GameResult) => void;
  onBack: () => void;
};

type RunState = "ready" | "loading" | "playing" | "paused" | "finished";

type NoteState = "pending" | "hit" | "miss";
const KEYBOARD_LABELS = ["A", "S", "D", "F", "J", "K"];

export function GameScreen({ midi, chart, playerTrack, audio, timing, onFinish, onBack }: GameScreenProps) {
  const [runState, setRunState] = useState<RunState>("ready");
  const [currentTime, setCurrentTime] = useState(0);
  const [stats, setStats] = useState<ScoreStats>(() => createInitialScore());
  const [noteStates, setNoteStates] = useState<Record<string, NoteState>>(() => buildInitialNoteStates(chart.notes));
  const [lastJudge, setLastJudge] = useState<Judgement | "Ready">("Ready");
  const [audioError, setAudioError] = useState<string | null>(null);

  const schedulerRef = useRef<AutoAccompanimentScheduler | null>(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const currentTimeRef = useRef(0);
  const statsRef = useRef<ScoreStats>(createInitialScore());
  const noteStatesRef = useRef<Record<string, NoteState>>(buildInitialNoteStates(chart.notes));
  const animationRef = useRef<number | null>(null);
  const activeHoldsRef = useRef<Map<number, ActiveVoice[]>>(new Map());
  const finishedRef = useRef(false);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const runStateRef = useRef<RunState>("ready");

  const remaining = Math.max(0, midi.duration - currentTime);
  const playableNotes = chart.notes.length;
  const trackRoles = useMemo(
    () =>
      midi.tracks.map((track) => ({
        ...track,
        role: track.id === playerTrack.id ? "player" : track.role,
      })),
    [midi.tracks, playerTrack.id],
  );

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const lane = keyToLane(event.key, chart.laneLabels.length);
      if (lane === null || pressedKeysRef.current.has(event.key.toLowerCase())) return;
      event.preventDefault();
      pressedKeysRef.current.add(event.key.toLowerCase());
      handleLanePress(lane);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const lane = keyToLane(event.key, chart.laneLabels.length);
      if (lane === null) return;
      event.preventDefault();
      pressedKeysRef.current.delete(event.key.toLowerCase());
      handleLaneRelease(lane);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      schedulerRef.current?.stop();
      activeHoldsRef.current.forEach((voices) => voices.forEach((voice) => voice.stop()));
      activeHoldsRef.current.clear();
    };
  }, []);

  async function startGame(offset = 0) {
    setAudioError(null);
    setRunState("loading");

    try {
      await audio.preloadTrack(playerTrack);
      schedulerRef.current = new AutoAccompanimentScheduler({ audio, tracks: trackRoles, timing });
      await schedulerRef.current.start(offset);
      startedAtRef.current = performance.now() - offset * 1000;
      pausedAtRef.current = 0;
      finishedRef.current = false;
      setRunState("playing");
      animate();
    } catch (error) {
      setRunState(offset > 0 ? "paused" : "ready");
      setAudioError(error instanceof Error ? error.message : "音源の初期化に失敗しました。");
    }
  }

  function pauseGame() {
    if (runState !== "playing") return;
    pausedAtRef.current = currentTimeRef.current;
    schedulerRef.current?.stop();
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    setRunState("paused");
  }

  function resumeGame() {
    void startGame(pausedAtRef.current);
  }

  function animate() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);

    const frame = () => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      currentTimeRef.current = elapsed;
      setCurrentTime(elapsed);
      markLateMisses(elapsed);

      if (!finishedRef.current && elapsed >= midi.duration + 1.1) {
        finishGame();
        return;
      }

      animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);
  }

  function handleLanePress(lane: number) {
    if (runStateRef.current !== "playing") return;

    const inputTime = currentTimeRef.current + timing.inputJudgeOffsetMs / 1000;
    const candidate = findCandidateNote(chart.notes, noteStatesRef.current, lane, inputTime);
    if (!candidate) {
      setLastJudge("Miss");
      return;
    }

    const judgement = judgeTiming((inputTime - candidate.time) * 1000);
    if (judgement === "Miss") {
      markNote(candidate, "miss", "Miss");
      return;
    }

    markNote(candidate, "hit", judgement);
    handleLaneRelease(lane);
    void audio.playGameNote(candidate, playerTrack).then((voices) => {
      if (candidate.type === "hold") activeHoldsRef.current.set(lane, voices);
    });
  }

  function handleLaneRelease(lane: number) {
    const voices = activeHoldsRef.current.get(lane);
    if (!voices) return;
    voices.forEach((voice) => voice.stop());
    activeHoldsRef.current.delete(lane);
  }

  function markNote(note: GameNote, state: NoteState, judgement: Judgement) {
    if (noteStatesRef.current[note.id] !== "pending") return;
    noteStatesRef.current = {
      ...noteStatesRef.current,
      [note.id]: state,
    };
    statsRef.current = applyJudgement(statsRef.current, judgement);
    setNoteStates(noteStatesRef.current);
    setStats(statsRef.current);
    setLastJudge(judgement);
  }

  function markLateMisses(elapsed: number) {
    let changed = false;
    let nextStates = noteStatesRef.current;
    let nextStats = statsRef.current;

    for (const note of chart.notes) {
      if (nextStates[note.id] !== "pending") continue;
      if ((elapsed - note.time) * 1000 > MISS_GRACE_MS) {
        nextStates = {
          ...nextStates,
          [note.id]: "miss",
        };
        nextStats = applyJudgement(nextStats, "Miss");
        changed = true;
      }
    }

    if (changed) {
      noteStatesRef.current = nextStates;
      statsRef.current = nextStats;
      setNoteStates(nextStates);
      setStats(nextStats);
      setLastJudge("Miss");
    }
  }

  function finishGame() {
    finishedRef.current = true;
    schedulerRef.current?.stop();
    audio.stopAll();
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    setRunState("finished");
    onFinish(buildResult(statsRef.current, playableNotes));
  }

  return (
    <main className="game-screen">
      <header className="game-hud">
        <button className="ghost-button" type="button" onClick={onBack}>
          終了
        </button>
        <HudMetric label="Score" value={String(stats.score)} />
        <HudMetric label="Combo" value={String(stats.combo)} />
        <HudMetric label="Time" value={formatDuration(remaining)} />
        <button className="ghost-button" type="button" onClick={runState === "playing" ? pauseGame : resumeGame} disabled={runState === "loading"}>
          {runState === "playing" ? "Pause" : "Play"}
        </button>
      </header>

      <section className="judge-strip">
        <span className={`judge-text ${lastJudge.toLowerCase()}`}>{lastJudge}</span>
        <span>{playerTrack.name}</span>
      </section>

      <NoteLane
        notes={chart.notes}
        laneLabels={chart.laneLabels}
        currentTime={currentTime}
        noteStates={noteStates}
        visualOffsetMs={timing.noteVisualOffsetMs}
      />

      {runState === "ready" || runState === "loading" ? (
        <div className="ready-overlay">
          <button className="primary-button" type="button" onClick={() => void startGame()} disabled={runState === "loading"}>
            {runState === "loading" ? "音源準備中..." : "Start"}
          </button>
          {audioError && <p className="error-text">{audioError}</p>}
        </div>
      ) : null}

      {runState === "paused" ? (
        <div className="ready-overlay">
          <button className="primary-button" type="button" onClick={resumeGame}>
            Resume
          </button>
        </div>
      ) : null}

      <ChordButtons
        labels={chart.laneLabels}
        keyboardLabels={KEYBOARD_LABELS}
        disabled={runState !== "playing"}
        onPress={handleLanePress}
        onRelease={handleLaneRelease}
      />
    </main>
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildInitialNoteStates(notes: GameNote[]): Record<string, NoteState> {
  return Object.fromEntries(notes.map((note) => [note.id, "pending" as NoteState]));
}

function findCandidateNote(notes: GameNote[], states: Record<string, NoteState>, lane: number, inputTime: number): GameNote | null {
  let best: GameNote | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const note of notes) {
    if (states[note.id] !== "pending" || note.lane !== lane) continue;
    const diff = Math.abs(note.time - inputTime);
    if (diff < bestDiff) {
      best = note;
      bestDiff = diff;
    }
  }

  return bestDiff <= 0.28 ? best : null;
}

function keyToLane(key: string, laneCount: number): number | null {
  const normalized = key.toLowerCase();
  const lane = KEYBOARD_LABELS.findIndex((label) => label.toLowerCase() === normalized);
  return lane >= 0 && lane < laneCount ? lane : null;
}
