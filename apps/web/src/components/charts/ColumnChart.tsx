import { type CurrencyCode, minorUnits, money } from '@finanz/kernel';
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';

export interface ColumnSeries {
  key: string;
  label: string;
  /** Classes for the columns (`fill-…`) and the legend and tooltip keys (`bg-…`). */
  fill: string;
  swatch: string;
  values: readonly bigint[];
}

export interface ColumnChartProps {
  /** Accessible name of the chart and caption of its table. */
  title: string;
  /** Under each group of columns; `sub` (a year) goes on a second line. */
  ticks: readonly { label: string; sub?: string }[];
  /** The full name of each group, for the tooltip and the table ("octubre de 2025"). */
  longLabels: readonly string[];
  series: readonly ColumnSeries[];
  currency: CurrencyCode;
  /** A reference line across the plot, labeled at its end. */
  average?: { label: string; value: bigint };
  /** One more line for a group's tooltip and table row, e.g. what was saved that month. */
  extra?: { label: string; values: readonly bigint[] };
}

const PLOT_HEIGHT = 200;
const TOP = 20;
const BOTTOM = 40;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

/** Width of the element, kept up to date as the layout changes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width || 640] as const;
}

/** 1, 2, 2.5 or 5 times a power of ten: steps that make round axis labels. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10;
  return step * power;
}

/** A column with a rounded data end and a square foot on the baseline. */
function columnPath(x: number, width: number, top: number, base: number): string {
  const height = Math.abs(base - top);
  const r = Math.min(RADIUS, width / 2, height);
  if (top <= base) {
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
  }
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top - r}V${base}Z`;
}

/**
 * Columns per period, one per series, on a single axis. Geometry uses floating point (it is
 * only pixels); every amount shown as text is formatted exactly from minor units.
 */
export function ColumnChart({
  title,
  ticks,
  longLabels,
  series,
  currency,
  average,
  extra,
}: ColumnChartProps) {
  const { t } = useTranslation();
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const locale = formattingLocale();
  const count = ticks.length;
  const scale = 10 ** minorUnits(currency);
  const major = (v: bigint) => Number(v) / scale;
  const show = (v: bigint) => formatMoney(money(v, currency));

  const all = series.flatMap((s) => s.values.map(major));
  if (average) all.push(major(average.value));
  const step = niceStep((Math.max(0, ...all) - Math.min(0, ...all)) / 4);
  const top = Math.max(step, Math.ceil(Math.max(0, ...all) / step) * step);
  const bottom = Math.floor(Math.min(0, ...all) / step) * step;
  const axisValues: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) axisValues.push(v);
  const compact = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const axisLabels = axisValues.map((v) => compact.format(v));
  const left = Math.max(40, Math.max(...axisLabels.map((l) => l.length)) * 7 + 12);
  const plotWidth = Math.max(80, width - left - 4);
  const y = (v: number) => TOP + ((top - v) / (top - bottom)) * PLOT_HEIGHT;
  const band = plotWidth / Math.max(1, count);
  const k = series.length;
  const barWidth = Math.max(2, Math.min(BAR_MAX, (band * 0.72 - GAP * (k - 1)) / k));
  const groupWidth = barWidth * k + GAP * (k - 1);
  const groupX = (i: number) => left + i * band + (band - groupWidth) / 2;
  const tickEvery = Math.max(1, Math.ceil(44 / band));
  const height = TOP + PLOT_HEIGHT + BOTTOM;

  const describe = (i: number) =>
    [
      longLabels[i],
      ...series.map((s) => `${s.label}: ${show(s.values[i] ?? 0n)}`),
      ...(extra ? [`${extra.label}: ${show(extra.values[i] ?? 0n)}`] : []),
    ].join('. ');

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    setActive((i) => Math.min(count - 1, Math.max(0, (i ?? (delta > 0 ? -1 : count)) + delta)));
  };

  const tooltipLeft =
    active === null
      ? 0
      : Math.min(Math.max(groupX(active) + groupWidth / 2 - 104, 0), Math.max(0, width - 208));

  return (
    <figure aria-labelledby={titleId} className="grid min-w-0 gap-3">
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      {(k > 1 || average) && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-muted text-sm">
          {k > 1 &&
            series.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={`size-2.5 rounded-sm ${s.swatch}`} />
                {s.label}
              </li>
            ))}
          {average && (
            // Keyed above the plot, where columns can't cover it.
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-px w-4 bg-muted" />
              {average.label}
              <span className="amount text-ink">{show(average.value)}</span>
            </li>
          )}
        </ul>
      )}
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-line border-b text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('charts.period')}
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-2 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                {extra && (
                  <th scope="col" className="py-2 text-right font-medium">
                    {extra.label}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {longLabels.map((label, i) => (
                <tr key={label}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {label}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="amount py-2 pr-3 text-right">
                      {show(s.values[i] ?? 0n)}
                    </td>
                  ))}
                  {extra && (
                    <td className="amount py-2 text-right">{show(extra.values[i] ?? 0n)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a chart, not a form; a fieldset would announce form controls
        <div
          ref={ref}
          role="group"
          aria-label={`${title}. ${t('charts.keyboardHint')}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys move between columns
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((i) => i ?? count - 1)}
          onBlur={() => setActive(null)}
          className="relative min-w-0 rounded-md focus-visible:outline-offset-4"
        >
          <svg
            width={width}
            height={height}
            role="presentation"
            className="block overflow-visible"
            onPointerLeave={() => setActive(null)}
          >
            {axisValues.map((v, i) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={left + plotWidth}
                  y1={y(v)}
                  y2={y(v)}
                  className={v === 0 ? 'stroke-subtle/60' : 'stroke-line'}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={left - 8}
                  y={y(v)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-subtle text-[11px] tabular-nums"
                >
                  {axisLabels[i]}
                </text>
              </g>
            ))}
            {ticks.map((tick, i) =>
              i % tickEvery === 0 ? (
                <text
                  key={longLabels[i]}
                  x={left + i * band + band / 2}
                  y={TOP + PLOT_HEIGHT + 16}
                  textAnchor="middle"
                  className="fill-subtle text-[11px]"
                >
                  {tick.label}
                  {tick.sub && (
                    <tspan x={left + i * band + band / 2} dy="1.3em">
                      {tick.sub}
                    </tspan>
                  )}
                </text>
              ) : null,
            )}
            {ticks.map((_, i) => (
              <g
                key={longLabels[i]}
                className="transition-opacity duration-150"
                opacity={active === null || active === i ? 1 : 0.4}
              >
                {series.map((s, j) => {
                  const value = major(s.values[i] ?? 0n);
                  if (value === 0) return null;
                  const x = groupX(i) + j * (barWidth + GAP);
                  return (
                    <path
                      key={s.key}
                      d={columnPath(x, barWidth, y(value), y(0))}
                      className={s.fill}
                    />
                  );
                })}
              </g>
            ))}
            {average && (
              <g>
                <line
                  x1={left}
                  x2={left + plotWidth}
                  y1={y(major(average.value))}
                  y2={y(major(average.value))}
                  className="stroke-muted"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              </g>
            )}
            {ticks.map((_, i) => (
              <rect
                key={longLabels[i]}
                x={left + i * band}
                y={TOP}
                width={band}
                height={PLOT_HEIGHT}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
              />
            ))}
          </svg>
          {active !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-10 w-52 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
              style={{ left: tooltipLeft }}
            >
              <p className="text-muted text-xs">{longLabels[active]}</p>
              <ul className="mt-1 grid gap-0.5">
                {series.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-0.5 w-3 rounded-full ${s.swatch}`} />
                    <span className="amount">{show(s.values[active] ?? 0n)}</span>
                    <span className="text-muted">{s.label}</span>
                  </li>
                ))}
                {extra && (
                  <li className="flex items-center gap-2 border-line border-t pt-1">
                    <span className="amount pl-5">{show(extra.values[active] ?? 0n)}</span>
                    <span className="text-muted">{extra.label}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
          <p aria-live="polite" className="sr-only">
            {active === null ? '' : describe(active)}
          </p>
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-brand text-sm transition-colors duration-150 hover:bg-brand-soft"
        >
          {t(asTable ? 'charts.showChart' : 'charts.showTable')}
        </button>
      </div>
    </figure>
  );
}
