export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#7A1F2B" />
      <rect x="14" y="38" width="8" height="12" rx="2" fill="#FFFFFF" />
      <rect x="28" y="28" width="8" height="22" rx="2" fill="#FFFFFF" />
      <rect x="42" y="16" width="8" height="34" rx="2" fill="#E2CBA4" />
    </svg>
  );
}
