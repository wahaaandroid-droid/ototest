import { useMemo, useRef, useState } from "react";
import { WebAudioFontEngine } from "./audio/webAudioFontPlayer";
import { GameScreen } from "./components/GameScreen";
import { ResultScreen } from "./components/ResultScreen";
import { StartScreen } from "./components/StartScreen";
import { TrackSelectScreen } from "./components/TrackSelectScreen";
import { buildGameChart } from "./game/GameEngine";
import type { Difficulty, GameChart, GameResult, MidiTrackInfo, ParsedMidiFile, PlayMode, TimingSettings, TrackRole } from "./game/types";
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
  const [mode, setMode] = useState<PlayMode>("single");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [timing, setTiming] = useState<TimingSettings>(DEFAULT_TIMING);
  const [chart, setChart] = useState<GameChart | null>(null);
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

  const playerTrack = midi?.tracks.find((track) => track.role === "player" && track.noteCount > 0) ?? null;

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      const parsed = await loadMidiFile(file);
      setMidi(parsed);
      setChart(null);
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
      setChart(null);
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

    setMidi({ ...midi, tracks: repairedTracks });
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
    if (!midi || !playerTrack) return;
    const nextChart = buildGameChart(playerTrack, mode, difficulty);
    setChart(nextChart);
    setResult(null);
    setScreen("game");
  }

  function finishGame(nextResult: GameResult) {
    setResult(nextResult);
    setScreen("result");
  }

  if (screen === "tracks" && midi) {
    return (
      <TrackSelectScreen
        midi={midi}
        mode={mode}
        difficulty={difficulty}
        timing={timing}
        busyTrackId={busyTrackId}
        audioError={audioError}
        onModeChange={setMode}
        onDifficultyChange={setDifficulty}
        onRoleChange={updateTrackRole}
        onPreview={previewTrack}
        onTimingChange={setTiming}
        onStart={startGame}
        onBack={() => setScreen("start")}
      />
    );
  }

  if (screen === "game" && midi && chart && playerTrack) {
    return (
      <GameScreen
        midi={midi}
        chart={chart}
        playerTrack={playerTrack}
        audio={audio}
        timing={timing}
        onFinish={finishGame}
        onBack={() => setScreen("tracks")}
      />
    );
  }

  if (screen === "result" && midi && result) {
    return (
      <ResultScreen
        midi={midi}
        result={result}
        onRetry={startGame}
        onTrackSelect={() => setScreen("tracks")}
        onNewMidi={() => {
          setMidi(null);
          setChart(null);
          setResult(null);
          setScreen("start");
        }}
      />
    );
  }

  return (
    <StartScreen
      loading={loading}
      error={error}
      sampleSongs={SAMPLE_SONGS}
      onFileSelect={handleFile}
      onLoadSample={handleSampleLoad}
    />
  );
}

export default App;
