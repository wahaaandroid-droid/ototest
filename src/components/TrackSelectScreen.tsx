import type { ChangeEvent } from "react";
import type { BackingAudioFile, Difficulty, MidiTrackInfo, ParsedMidiFile, PlayablePart, PlayMode, TimingSettings, TrackRole } from "../game/types";
import { formatDuration } from "../utils/format";

type TrackSelectScreenProps = {
  midi: ParsedMidiFile;
  selectedPartId: string | null;
  mode: PlayMode;
  difficulty: Difficulty;
  timing: TimingSettings;
  backingAudio: BackingAudioFile | null;
  busyTrackId: string | null;
  audioError: string | null;
  onModeChange: (mode: PlayMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPartSelect: (partId: string) => void;
  onRoleChange: (trackId: string, role: TrackRole) => void;
  onPreview: (track: MidiTrackInfo) => void;
  onBackingAudioSelect: (file: File) => void;
  onBackingAudioClear: () => void;
  onTimingChange: (timing: TimingSettings) => void;
  onStart: () => void;
  onBack: () => void;
};

export function TrackSelectScreen({
  midi,
  selectedPartId,
  mode,
  difficulty,
  timing,
  backingAudio,
  busyTrackId,
  audioError,
  onModeChange,
  onDifficultyChange,
  onPartSelect,
  onRoleChange,
  onPreview,
  onBackingAudioSelect,
  onBackingAudioClear,
  onTimingChange,
  onStart,
  onBack,
}: TrackSelectScreenProps) {
  const hasPlayer = midi.tracks.some((track) => track.role === "player" && track.noteCount > 0);

  return (
    <main className="track-screen">
      <header className="top-bar">
        <button className="ghost-button" type="button" onClick={onBack}>
          戻る
        </button>
        <div>
          <p className="kicker">Track Setup</p>
          <h1>{midi.name}</h1>
        </div>
      </header>

      <section className="midi-summary" aria-label="MIDI summary">
        <Metric label="BPM" value={String(midi.bpm)} />
        <Metric label="Length" value={formatDuration(midi.duration)} />
        <Metric label="Tracks" value={String(midi.trackCount)} />
      </section>

      <section className="setup-controls">
        <div>
          <p className="section-label">Mode</p>
          <div className="segmented three">
            <button className={mode === "single" ? "active" : ""} type="button" onClick={() => onModeChange("single")}>
              単音
            </button>
            <button className={mode === "chord" ? "active" : ""} type="button" onClick={() => onModeChange("chord")}>
              コード
            </button>
            <button className={mode === "spark" ? "active" : ""} type="button" onClick={() => onModeChange("spark")}>
              シャン
            </button>
          </div>
        </div>

        <div>
          <p className="section-label">Difficulty</p>
          <div className="segmented three">
            <button className={difficulty === "easy" ? "active" : ""} type="button" onClick={() => onDifficultyChange("easy")}>
              やさしい
            </button>
            <button className={difficulty === "normal" ? "active" : ""} type="button" onClick={() => onDifficultyChange("normal")}>
              ふつう
            </button>
            <button className={difficulty === "hard" ? "active" : ""} type="button" onClick={() => onDifficultyChange("hard")}>
              むずかしい
            </button>
          </div>
        </div>

        <div className="timing-panel">
          <p className="section-label">Offset</p>
          <TimingInput
            label="Visual"
            value={timing.noteVisualOffsetMs}
            onChange={(value) => onTimingChange({ ...timing, noteVisualOffsetMs: value })}
          />
          <TimingInput
            label="Judge"
            value={timing.inputJudgeOffsetMs}
            onChange={(value) => onTimingChange({ ...timing, inputJudgeOffsetMs: value })}
          />
          <TimingInput
            label="Audio"
            value={timing.audioScheduleLookAheadMs}
            onChange={(value) => onTimingChange({ ...timing, audioScheduleLookAheadMs: value })}
          />
        </div>
      </section>

      {audioError && <p className="error-text">{audioError}</p>}

      {mode === "spark" && (
        <section className="mp3-panel" aria-label="MP3 backing audio">
          <div>
            <p className="section-label">MP3 BGM</p>
            <strong>{backingAudio ? backingAudio.name : "未選択"}</strong>
          </div>
          <label className="small-button file-button">
            MP3選択
            <input type="file" accept=".mp3,audio/mpeg" onChange={(event) => handleBackingAudioChange(event, onBackingAudioSelect)} />
          </label>
          {backingAudio ? (
            <button className="small-button" type="button" onClick={onBackingAudioClear}>
              解除
            </button>
          ) : null}
        </section>
      )}

      {midi.playableParts.length > 0 && (
        <section className="part-panel" aria-label="Playable part suggestions">
          <div className="section-heading">
            <div>
              <p className="section-label">Playable Parts</p>
              <h2>おすすめパート</h2>
            </div>
            <span>{midi.playableParts.length} candidates</span>
          </div>
          <div className="part-grid">
            {midi.playableParts.map((part) => (
              <PlayablePartCard
                key={part.id}
                part={part}
                active={part.id === selectedPartId}
                onSelect={() => onPartSelect(part.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="track-list" aria-label="MIDI tracks">
        <div className="section-heading raw-heading">
          <div>
            <p className="section-label">Raw Tracks</p>
            <h2>詳細トラック調整</h2>
          </div>
          <span>自動演奏 / プレイヤー / ミュート</span>
        </div>
        <div className="track-row track-head">
          <span>No</span>
          <span>Name</span>
          <span>Instrument</span>
          <span>Notes</span>
          <span>Range</span>
          <span>Role</span>
          <span>Listen</span>
        </div>
        {midi.tracks.map((track) => (
          <article className={`track-row ${track.role === "player" ? "player-track" : ""}`} key={track.id}>
            <span className="track-no">{track.index + 1}</span>
            <strong>{track.name}</strong>
            <span>{track.instrumentName}{track.isDrum ? " / Drums" : ""}</span>
            <span>{track.noteCount}</span>
            <span>{track.rangeText}</span>
            <select value={track.role} onChange={(event) => onRoleChange(track.id, event.target.value as TrackRole)}>
              <option value="auto">自動演奏</option>
              <option value="player" disabled={track.noteCount === 0}>
                プレイヤー
              </option>
              <option value="mute">ミュート</option>
            </select>
            <button className="small-button" type="button" onClick={() => onPreview(track)} disabled={track.noteCount === 0 || busyTrackId === track.id}>
              {busyTrackId === track.id ? "..." : "試聴"}
            </button>
          </article>
        ))}
      </section>

      <div className="sticky-action">
        <button className="primary-button" type="button" onClick={onStart} disabled={!hasPlayer}>
          ゲーム開始
        </button>
      </div>
    </main>
  );
}

function handleBackingAudioChange(event: ChangeEvent<HTMLInputElement>, onSelect: (file: File) => void) {
  const file = event.target.files?.[0];
  if (file) onSelect(file);
  event.target.value = "";
}

function PlayablePartCard({ part, active, onSelect }: { part: PlayablePart; active: boolean; onSelect: () => void }) {
  return (
    <button className={`part-card ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      <span className="part-kind">{formatPartKind(part.kind)}</span>
      <strong>{part.title}</strong>
      <span className="part-range">{part.rangeText}</span>
      <span className="part-meta">
        {part.trackIds.length} tracks / {part.noteCount.toLocaleString()} notes / {part.density.toFixed(1)} n/s
      </span>
    </button>
  );
}

function formatPartKind(kind: PlayablePart["kind"]) {
  switch (kind) {
    case "recommended":
      return "推奨";
    case "lead":
      return "メロディ";
    case "piano":
      return "鍵盤";
    case "guitar":
      return "ギター";
    case "strings":
      return "ストリングス";
    case "bass":
      return "ベース";
    case "single":
      return "単体";
    default:
      return kind;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="timing-input">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <em>ms</em>
    </label>
  );
}
