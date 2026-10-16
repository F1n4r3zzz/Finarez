interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** A few mutually exclusive choices shown side by side (radio buttons underneath). */
export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium text-sm">{legend}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-paper p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-10 cursor-pointer items-center rounded-md px-3 text-muted text-sm transition-colors duration-150 hover:text-ink has-checked:bg-surface has-checked:font-medium has-checked:text-ink has-checked:ring-1 has-checked:ring-line has-focus-visible:outline-2 has-focus-visible:outline-brand"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {/* Disabled radios are left out of the form data; keep the choice in it. */}
      {disabled && <input type="hidden" name={name} value={value} />}
    </fieldset>
  );
}
