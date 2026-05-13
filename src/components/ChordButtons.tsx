import type { CSSProperties } from "react";

type ChordButtonsProps = {
  labels: string[];
  keyboardLabels: string[];
  disabled: boolean;
  onPress: (lane: number) => void;
  onRelease: (lane: number) => void;
};

export function ChordButtons({ labels, keyboardLabels, disabled, onPress, onRelease }: ChordButtonsProps) {
  return (
    <div className="input-buttons" style={{ "--button-count": labels.length } as CSSProperties}>
      {labels.map((label, lane) => {
        const handClass = lane < 4 ? "left-hand" : "right-hand";
        return (
          <button
            className={`lane-button ${handClass}`}
            type="button"
            key={`${label}-${lane}`}
            disabled={disabled}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onPress(lane);
            }}
            onPointerUp={() => onRelease(lane)}
            onPointerCancel={() => onRelease(lane)}
            onContextMenu={(event) => event.preventDefault()}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") onRelease(lane);
            }}
          >
            <span>{label}</span>
            <kbd>{keyboardLabels[lane]}</kbd>
          </button>
        );
      })}
    </div>
  );
}
