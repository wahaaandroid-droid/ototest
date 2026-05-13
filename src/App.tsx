import { useMemo, useRef, useState } from "react";
import { analyzeMp3ToSparkChart } from "./audio/analyzeMp3ToChart";
import { WebAudioFontEngine } from "./audio/webAudioFontPlayer";
import { GameScreen } from "./components/GameScreen";
import { ResultScreen } from "./components/ResultScreen";
import { StartScreen } from "./components/StartScreen";
import { TrackSelectScreen } from "./components/TrackSelectScreen";
import { buildGameChart } from "./game/GameEngine";
import type {
  BackingAudioFile,
  Difficulty,
  GameChart,
  GameResult,
  MidiTrackInfo,
  ParsedMidiFile,
  PlayablePart,
  PlayMode,
  TimingSettings,
  TrackRole,
} from "./game/types";
import { loadMidiFile, loadMidiFromUrl } from "./midi/loadMidi";
import { SAMPLE_SONGS, type SampleSong } from "./data/sampleSongs";

type Screen = "start" | "tracks" | "game" | "result";

const DEFAULT_TIMING: TimingSettings = {
  noteVisualOffsetMs: 0,
  inputJudgeOffsetMs: 0,
  audioScheduleLookAheadMs: 180,
};

function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [midi, setMidi] = useState<ParsedMidiFile | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [mode, setMode] = useState<PlayMode>("single");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [timing, setTiming] = useState<TimingSettings>(DEFAULT_TIMING);
  const [chart, setChart] = useState<GameChart | null>(null);
  const [gamePlayerTrack, setGamePlayerTrack] = useState<MidiTrackInfo | null>(null);
  const [backingAudio, setBackingAudio] = useState<BackingAudioFile | null>(null);
  const [isMp3OnlySession, setIsMp3OnlySession] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<WebAudioFontEngine | null>(null);

  const audio = useMemo(() => {
    if (!audioRef.current) audioRef.current = new WebAudioFontEngine();
    return audioRef.current;
  }, []);

  const selectedPart = useMemo(
    () => midi?.playableParts.find((part) => part.id === selectedPartId) ?? null,
    [midi, selectedPartId],
  );
  const playerTracks = useMemo(() => {
    if (!midi) return [];
    if (selectedPart) {
      const selectedIds = new Set(selectedPart.trackIds);
      return midi.tracks.filter((track) => selectedIds.has(track.id) && track.noteCount > 0);
    }
    return midi.tracks.filter((track) => track.role === "player" && track.noteCount > 0);
  }, [midi, selectedPart]);
  const playerTrack =
    (selectedPart && midi?.tracks.find((track) => track.id === selectedPart.primaryTrackId && track.noteCount > 0)) ??
    playerTracks[0] ??
    null;

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      const parsed = await loadMidiFile(file);
      setMidi(parsed);
      setSelectedPartId(parsed.playableParts[0]?.id ?? null);
      setChart(null);
      setGamePlayerTrack(null);
      setIsMp3OnlySession(false);
      setResult(null);
      setScreen("tracks");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "MIDIを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function handleSampleLoad(song: SampleSong) {
    setLoading(true);
    setError(null);

    try {
      const parsed = await loadMidiFromUrl(song.url, song.title);
      setMidi(parsed);
      setSelectedPartId(parsed.playableParts[0]?.id ?? null);
      setChart(null);
      setGamePlayerTrack(null);
      setIsMp3OnlySession(false);
      setResult(null);
      setScreen("tracks");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "サンプルMIDIを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  function updateTrackRole(trackId: string, role: TrackRole) {
    if (!midi) return;

    const nextSelectedPartId =
      role === "player" || midi.playableParts.some((part) => part.id === selectedPartId && part.trackIds.includes(trackId)) ? null : selectedPartId;
    const nextTracks = midi.tracks.map((track) => {
      if (role === "player" && track.id !== trackId && track.role === "player") {
        return { ...track, role: "auto" as TrackRole };
      }
      if (track.id === trackId) return { ...track, role };
      return track;
    });

    const hasPlayer = nextTracks.some((track) => track.role === "player");
    const fallbackPlayer = nextTracks.find((track) => track.noteCount > 0 && !track.isDrum) ?? nextTracks.find((track) => track.noteCount > 0);
    const repairedTracks =
      hasPlayer || !fallbackPlayer
        ? nextTracks
        : nextTracks.map((track) => (track.id === fallbackPlayer.id ? { ...track, role: "player" as TrackRole } : track));

    setSelectedPartId(nextSelectedPartId);
    setMidi({ ...midi, tracks: repairedTracks });
  }

  function selectPlayablePart(partId: string) {
    if (!midi) return;
    const part = midi.playableParts.find((candidate) => candidate.id === partId);
    if (!part) return;

    const partTrackIds = new Set(part.trackIds);
    const nextTracks = midi.tracks.map((track) => {
      if (partTrackIds.has(track.id)) return { ...track, role: "player" as TrackRole };
      if (track.role === "player") return { ...track, role: "auto" as TrackRole };
      return track;
    });

    setSelectedPartId(part.id);
    setMidi({ ...midi, tracks: nextTracks });
  }

  function handleBackingAudioSelect(file: File) {
    setBackingAudio((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return {
        name: file.name,
        url: URL.createObjectURL(file),
      };
    });
  }

  function clearBackingAudio() {
    setBackingAudio((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function handleMp3OnlyFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      const analysis = await analyzeMp3ToSparkChart(file);
      const nextChart = analysis.chart;
      const duration = Math.max(1, analysis.duration);
      const url = URL.createObjectURL(file);
      const nextBackingAudio = { name: file.name, url };
      const title = file.name.replace(/\.(mp3|mpeg)$/i, "") || "MP3 Auto Chart";
      const nextMidi = buildMp3OnlyMidi(title, duration);
      const nextPlayerTrack = buildMp3OnlyPlayerTrack(nextChart.notes.length);

      setBackingAudio((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return nextBackingAudio;
      });
      setMidi(nextMidi);
      setSelectedPartId(null);
      setMode("spark");
      setChart(nextChart);
      setGamePlayerTrack(nextPlayerTrack);
      setIsMp3OnlySession(true);
      setResult(null);
      setScreen("game");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "MP3を解析できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function previewTrack(track: MidiTrackInfo) {
    setBusyTrackId(track.id);
    setAudioError(null);

    try {
      await audio.previewTrack(track);
    } catch (previewError) {
      setAudioError(previewError instanceof Error ? previewError.message : "試聴に失敗しました。");
    } finally {
      window.setTimeout(() => setBusyTrackId(null), 450);
    }
  }

  function startGame() {
    if (!midi || !playerTrack || playerTracks.length === 0) return;
    const chartTrack = buildMergedPlayerTrack(playerTracks, playerTrack, selectedPart);
    const nextChart = buildGameChart(chartTrack, mode, difficulty);
    setChart(nextChart);
    setGamePlayerTrack(chartTrack);
    setResult(null);
    setScreen("game");
  }

  function retryGame() {
    if (isMp3OnlySession && midi && chart && gamePlayerTrack) {
      setResult(null);
      setScreen("game");
      return;
    }

    startGame();
  }

  function resetToStart() {
    setMidi(null);
    setSelectedPartId(null);
    setChart(null);
    setGamePlayerTrack(null);
    setIsMp3OnlySession(false);
    clearBackingAudio();
    setResult(null);
    setScreen("start");
  }

  function finishGame(nextResult: GameResult) {
    setResult(nextResult);
    setScreen("result");
  }

  if (screen === "tracks" && midi) {
    return (
      <TrackSelectScreen
        midi={midi}
        selectedPartId={selectedPartId}
        mode={mode}
        difficulty={difficulty}
        timing={timing}
        backingAudio={backingAudio}
        busyTrackId={busyTrackId}
        audioError={audioError}
        onModeChange={setMode}
        onDifficultyChange={setDifficulty}
        onPartSelect={selectPlayablePart}
        onRoleChange={updateTrackRole}
        onPreview={previewTrack}
        onBackingAudioSelect={handleBackingAudioSelect}
        onBackingAudioClear={clearBackingAudio}
        onTimingChange={setTiming}
        onStart={startGame}
        onBack={() => setScreen("start")}
      />
    );
  }

  if (screen === "game" && midi && chart && gamePlayerTrack) {
    return (
      <GameScreen
        midi={midi}
        chart={chart}
        playerTrack={gamePlayerTrack}
        audio={audio}
        backingAudio={mode === "spark" ? backingAudio : null}
        timing={timing}
        onFinish={finishGame}
        onBack={() => {
          if (isMp3OnlySession) {
            resetToStart();
          } else {
            setScreen("tracks");
          }
        }}
      />
    );
  }

  if (screen === "result" && midi && result) {
    return (
      <ResultScreen
        midi={midi}
        result={result}
        trackSelectLabel={isMp3OnlySession ? "曲選択" : "トラック選択"}
        newMidiLabel={isMp3OnlySession ? "新しい曲" : "新しいMIDI"}
        onRetry={retryGame}
        onTrackSelect={() => (isMp3OnlySession ? resetToStart() : setScreen("tracks"))}
        onNewMidi={resetToStart}
      />
    );
  }

  return (
    <StartScreen
      loading={loading}
      error={error}
      sampleSongs={SAMPLE_SONGS}
      onFileSelect={handleFile}
      onMp3OnlySelect={handleMp3OnlyFile}
      onLoadSample={handleSampleLoad}
    />
  );
}

function buildMp3OnlyMidi(name: string, duration: number): ParsedMidiFile {
  return {
    name,
    bpm: 0,
    duration,
    trackCount: 0,
    tracks: [],
    playableParts: [],
  };
}

function buildMp3OnlyPlayerTrack(noteCount: number): MidiTrackInfo {
  return {
    id: "mp3-auto-notes",
    index: 0,
    name: "MP3 Auto Notes",
    instrumentName: "Spark SFX",
    instrumentNumber: null,
    channel: null,
    isDrum: false,
    notes: [],
    noteCount,
    rangeText: "-",
    role: "player",
  };
}

function buildMergedPlayerTrack(tracks: MidiTrackInfo[], primaryTrack: MidiTrackInfo, part: PlayablePart | null): MidiTrackInfo {
  if (tracks.length === 1 && !part) {
    return primaryTrack;
  }

  const mergedNotes = tracks
    .flatMap((track) =>
      track.notes.map((note) => ({
        ...note,
        id: `${track.id}-${note.id}`,
      })),
    )
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  return {
    ...primaryTrack,
    id: part ? `part-${part.id}` : `manual-${tracks.map((track) => track.id).join("-")}`,
    name: part?.title ?? tracks.map((track) => track.name).join(" + "),
    notes: mergedNotes,
    noteCount: mergedNotes.length,
    rangeText: buildRangeText(mergedNotes),
    role: "player",
  };
}

function buildRangeText(notes: MidiTrackInfo["notes"]): string {
  if (notes.length === 0) return "-";
  const min = Math.min(...notes.map((note) => note.midi));
  const max = Math.max(...notes.map((note) => note.midi));
  return `${midiToNoteName(min)} - ${midiToNoteName(max)}`;
}

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

export default App;
