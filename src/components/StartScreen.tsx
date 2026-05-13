import type { ChangeEvent } from "react";
import type { SampleSong } from "../data/sampleSongs";

type StartScreenProps = {
  loading: boolean;
  error: string | null;
  sampleSongs: SampleSong[];
  onFileSelect: (file: File) => void;
  onMp3OnlySelect: (file: File) => void;
  onLoadSample: (song: SampleSong) => void;
};

export function StartScreen({ loading, error, sampleSongs, onFileSelect, onMp3OnlySelect, onLoadSample }: StartScreenProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
    event.target.value = "";
  };
  const handleMp3Change = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onMp3OnlySelect(file);
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
        <div className="upload-grid">
          <label className="file-drop">
            <input type="file" accept=".mid,.midi,audio/midi" onChange={handleFileChange} disabled={loading} />
            <strong>{loading ? "読み込み/解析中..." : "MIDIファイルを選択"}</strong>
            <span>.mid / .midi</span>
          </label>
          <label className="file-drop mp3-only-drop">
            <input type="file" accept=".mp3,audio/mpeg" onChange={handleMp3Change} disabled={loading} />
            <strong>{loading ? "読み込み/解析中..." : "MP3だけで遊ぶ"}</strong>
            <span>.mp3</span>
          </label>
        </div>
        <div className="sample-list">
          {sampleSongs.map((song) => (
            <button className="secondary-button" type="button" key={song.url} onClick={() => onLoadSample(song)} disabled={loading}>
              {song.title}
            </button>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}
