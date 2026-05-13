import type { ChangeEvent } from "react";

type StartScreenProps = {
  loading: boolean;
  error: string | null;
  onFileSelect: (file: File) => void;
  onLoadSample: () => void;
};

export function StartScreen({ loading, error, onFileSelect, onLoadSample }: StartScreenProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
    event.target.value = "";
  };

  return (
    <main className="start-screen">
      <section className="start-hero">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="kicker">WebAudioFont MIDI Performance Game</p>
        <h1>MIDI Chord Rider</h1>
        <p className="hero-copy">MIDIの中から担当パートを選び、成功した入力だけが曲へ混ざります。</p>
      </section>

      <section className="upload-panel" aria-label="MIDI upload">
        <label className="file-drop">
          <input type="file" accept=".mid,.midi,audio/midi" onChange={handleFileChange} disabled={loading} />
          <strong>{loading ? "読み込み中..." : "MIDIファイルを選択"}</strong>
          <span>.mid / .midi</span>
        </label>
        <button className="secondary-button" type="button" onClick={onLoadSample} disabled={loading}>
          サンプルMIDI
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}
