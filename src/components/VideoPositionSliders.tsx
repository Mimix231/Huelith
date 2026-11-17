import type { CSSProperties } from 'react';
import type { VideoClip } from '../editor/video/timeline';
import type { KeyClock } from './VideoKeyedValue';
import { VideoKeyButtons } from './VideoKeyedValue';

/** X/Y use the same normalized [-2, 2] coordinates as the canvas transform.
 * Dragging previews continuously; releasing commits a single undo transaction. */
export default function VideoPositionSliders({ clip, values, clock, disabled, keys, onEdit, onToggle, onCommit }: {
  clip: VideoClip;
  values: { x: number; y: number };
  clock: KeyClock;
  disabled: boolean;
  keys: NonNullable<VideoClip['keyframes']>;
  onEdit: (axis: 'x' | 'y', value: number) => void;
  onToggle: () => void;
  onCommit: () => void;
}) {
  return <div className="hv-position-sliders" role="group" aria-label="Position">
    {(['x', 'y'] as const).map(axis => {
      const percent = Math.max(-200, Math.min(200, values[axis] * 100));
      return <label className="hv-position-slider" key={axis}>
        <span className="hv-position-axis">{axis.toUpperCase()}</span>
        <input type="range" className="hv-studio-range" aria-label={`Position ${axis.toUpperCase()} slider`}
          min={-200} max={200} step={0.1} value={percent} disabled={disabled}
          style={{ '--hv-range-fill': `${(percent + 200) / 4}%` } as CSSProperties}
          onChange={event => onEdit(axis, event.currentTarget.valueAsNumber / 100)}
          onPointerUp={onCommit} onPointerCancel={onCommit} onBlur={onCommit} onKeyUp={onCommit} />
        <output aria-label={`Position ${axis.toUpperCase()} value`}>{Number(percent.toFixed(1))}%</output>
      </label>;
    })}
    <div className="hv-position-key">
      <span>Position keyframes</span>
      <VideoKeyButtons label="Position" clock={clock} keys={keys.filter(key => key.parameter === 'x' || key.parameter === 'y')}
        disabled={disabled} onToggle={onToggle} />
    </div>
    {clip.keyframes?.some(key => key.parameter === 'x' || key.parameter === 'y') &&
      <small className="hv-position-hint">Position follows clip keyframes</small>}
  </div>;
}
