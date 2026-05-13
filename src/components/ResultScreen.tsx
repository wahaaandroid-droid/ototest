import type { GameResult, ParsedMidiFile } from "../game/types";

type ResultScreenProps = {
  midi: ParsedMidiFile;
  result: GameResult;
  onRetry: () => void;
  onTrackSelect: () => void;
  onNewMidi: () => void;
};

export function ResultScreen({ midi, result, onRetry, onTrackSelect, onNewMidi }: ResultScreenProps) {
  return (
    <main className="result-screen">
      <section className="result-hero">
        <p className="kicker">{midi.name}</p>
        <h1>Rank {result.rank}</h1>
        <strong className="final-score">{result.score}</strong>
      </section>

      <section className="result-grid">
        <ResultMetric label="Max Combo" value={result.maxCombo} />
        <ResultMetric label="Perfect" value={result.Perfect} />
        <ResultMetric label="Great" value={result.Great} />
        <ResultMetric label="Good" value={result.Good} />
        <ResultMetric label="Miss" value={result.Miss} />
        <ResultMetric label="Notes" value={result.totalNotes} />
      </section>

      <div className="result-actions">
        <button className="primary-button" type="button" onClick={onRetry}>
          もう一度
        </button>
        <button className="secondary-button" type="button" onClick={onTrackSelect}>
          トラック選択
        </button>
        <button className="ghost-button" type="button" onClick={onNewMidi}>
          新しいMIDI
        </button>
      </div>
    </main>
  );
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="result-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
