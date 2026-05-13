import type { Difficulty, MidiTrackInfo, ParsedMidiFile, PlayMode, TimingSettings, TrackRole } from "../game/types";
import { formatDuration } from "../utils/format";

type TrackSelectScreenProps = {
  midi: ParsedMidiFile;
  mode: PlayMode;
  difficulty: Difficulty;
  timing: TimingSettings;
  busyTrackId: string | null;
  audioError: string | null;
  onModeChange: (mode: PlayMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onRoleChange: (trackId: string, role: TrackRole) => void;
  onPreview: (track: MidiTrackInfo) => void;
  onTimingChange: (timing: TimingSettings) => void;
  onStart: () => void;
  onBack: () => void;
};

export function TrackSelectScreen({
  midi,
  mode,
  difficulty,
  timing,
  busyTrackId,
  audioError,
  onModeChange,
  onDifficultyChange,
  onRoleChange,
  onPreview,
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
          <div className="segmented">
            <button className={mode === "single" ? "active" : ""} type="button" onClick={() => onModeChange("single")}>
              単音
            </button>
            <button className={mode === "chord" ? "active" : ""} type="button" onClick={() => onModeChange("chord")}>
              コード
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

      <section className="track-list" aria-label="MIDI tracks">
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
