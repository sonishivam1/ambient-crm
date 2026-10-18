/**
 * The Ambient wordmark: a coral signal mark and the product name. Text uses
 * currentColor, so it reads on the navy sidebar and on light surfaces alike.
 */
export function AmbientLogo({ height = 34 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 176 40" role="img" aria-label="Ambient" style={{ width: "auto", display: "block" }}>
      <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="var(--accent)" strokeOpacity=".7" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="5" fill="var(--accent)" />
      <text
        x="48"
        y="28"
        fill="currentColor"
        style={{ font: "800 25px var(--font)", letterSpacing: "-0.03em" }}
      >
        ambient
      </text>
    </svg>
  );
}
