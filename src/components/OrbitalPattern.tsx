export function OrbitalPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="400" cy="300" rx="320" ry="180" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="400" cy="300" rx="250" ry="140" stroke="currentColor" strokeWidth="0.6" transform="rotate(15 400 300)" />
      <ellipse cx="400" cy="300" rx="380" ry="200" stroke="currentColor" strokeWidth="0.5" transform="rotate(-10 400 300)" />
      <ellipse cx="400" cy="300" rx="160" ry="90" stroke="currentColor" strokeWidth="0.7" transform="rotate(30 400 300)" />
      <circle cx="400" cy="300" r="6" fill="currentColor" opacity="0.3" />
      <circle cx="580" cy="240" r="3" fill="currentColor" opacity="0.2" />
      <circle cx="250" cy="380" r="2.5" fill="currentColor" opacity="0.2" />
    </svg>
  );
}
