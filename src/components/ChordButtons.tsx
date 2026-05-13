import type { CSSProperties } from "react";

type ChordButtonsProps = {
  labels: string[];
  disabled: boolean;
  onPress: (lane: number) => void;
  onRelease: (lane: number) => void;
};

export function ChordButtons({ labels, disabled, onPress, onRelease }: ChordButtonsProps) {
  return (
    <div className="input-buttons" style={{ "--button-count": labels.length } as CSSProperties}>
      {labels.map((label, lane) => (
        <button
          className="lane-button"
          type="button"
          key={`${label}-${lane}`}
          disabled={disabled}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onPress(lane);
          }}
          onPointerUp={() => onRelease(lane)}
          onPointerCancel={() => onRelease(lane)}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") onRelease(lane);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
