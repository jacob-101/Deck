import packageInfo from "../../package.json";

export const APP_VERSION = packageInfo.version;
export function BrandIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      className="product-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Deck"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#1560E8" />
      <path
        d="M11 6.5h7l4 4V24H11z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 20c1.5-3 2.6 1 3.8-1.4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
