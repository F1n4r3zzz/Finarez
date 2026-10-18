/** The logo's two arrows, faint in the band, sized to its height so they're always whole. */
export function BandArt() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="pointer-events-none absolute top-2 right-[-2%] h-[calc(100%-1rem)] max-h-[25rem] w-auto opacity-[0.08] dark:opacity-[0.07]"
    >
      <path d="M7 10h26V4l17 15-17 15v-6H7z" className="fill-logo" />
      <path d="M57 54H31v6L14 45l17-15v6h26z" className="fill-logo-accent" />
    </svg>
  );
}
