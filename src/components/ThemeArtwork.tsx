// Artwork copied from the user-supplied Sealdesk HTML reference.
export type ThemeArtworkName =
  | "document"
  | "scan"
  | "plane"
  | "star"
  | "signature"
  | "people"
  | "edit"
  | "ocr"
  | "compress"
  | "recent";
export function ThemeArtwork({ name }: { name: ThemeArtworkName }) {
  switch (name) {
    case "document":
      return (
        <svg width="170" height="200" viewBox="0 0 170 200" aria-hidden="true">
          <g
            fill="#F6C445"
            stroke="#14327F"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="m30 22 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          </g>
          <path d="m58 30 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#1560E8" />
          <rect
            x="22"
            y="58"
            width="104"
            height="128"
            rx="12"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="3"
            transform="rotate(-6 74 122)"
          />
          <g
            stroke="#BFD0EE"
            strokeWidth="3"
            strokeLinecap="round"
            transform="rotate(-6 74 122)"
          >
            <path d="M38 82h50M38 96h64M38 110h40" />
          </g>
          <path
            d="M36 156c8-18 15 2 22-8s10 6 18-1"
            fill="none"
            stroke="#1560E8"
            strokeWidth="3.2"
            strokeLinecap="round"
            transform="rotate(-6 74 122)"
          />
          <g transform="translate(112 52) rotate(24)">
            <rect
              width="20"
              height="92"
              rx="7"
              fill="#1560E8"
              stroke="#14327F"
              strokeWidth="3"
            />
            <path
              d="M0 92l10 22 10-22z"
              fill="#fff"
              stroke="#14327F"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M5 12v50"
              stroke="#fff"
              strokeOpacity=".45"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M62 14c12-14 36-12 46 2"
            fill="none"
            stroke="#1560E8"
            strokeWidth="2"
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "scan":
      return (
        <svg width="170" height="200" viewBox="0 0 170 200" aria-hidden="true">
          <path
            d="M30 40c14-18 34-22 50-10"
            fill="none"
            stroke="#1560E8"
            strokeWidth="2"
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
          <g transform="rotate(8 70 66)">
            <rect
              x="34"
              y="40"
              width="92"
              height="64"
              rx="14"
              fill="#1560E8"
              stroke="#14327F"
              strokeWidth="3"
            />
            <rect
              x="52"
              y="32"
              width="24"
              height="12"
              rx="4"
              fill="#1560E8"
              stroke="#14327F"
              strokeWidth="3"
            />
            <circle
              cx="80"
              cy="72"
              r="22"
              fill="#fff"
              stroke="#14327F"
              strokeWidth="3"
            />
            <circle
              cx="80"
              cy="72"
              r="12"
              fill="#B3CDF6"
              stroke="#14327F"
              strokeWidth="3"
            />
            <circle cx="112" cy="54" r="4" fill="#fff" />
          </g>
          <g stroke="#14327F" strokeWidth="2.5" strokeLinecap="round">
            <path d="M138 30l8-8M144 46h10M132 20l2-9" />
          </g>
          <path
            d="M16 150 78 118 142 150 80 184z"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M32 150 78 128 124 150 80 172z"
            fill="#BFF0D8"
            stroke="#14327F"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M52 148 98 168"
            stroke="#2BA56A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeOpacity=".8"
          />
          <path
            d="M16 150v10l64 34v-10M142 150v10l-62 34"
            fill="none"
            stroke="#14327F"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "plane":
      return (
        <svg
          width="90"
          height="60"
          viewBox="0 0 90 60"
          style={{ position: "absolute", right: "8px", top: "30px" }}
          aria-hidden="true"
        >
          <path
            d="M6 30 84 6 62 54 44 36z"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M44 36 84 6 50 42z"
            fill="#B3CDF6"
            stroke="#14327F"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M4 50c8 2 14-4 20-2"
            fill="none"
            stroke="#14327F"
            strokeWidth="2"
            strokeDasharray="3 4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "star":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          style={{ position: "absolute", left: "150px", top: "8px" }}
          aria-hidden="true"
        >
          <path
            d="m12 2 2.9 6.3 6.6.7-5 4.5 1.5 6.7L12 16.7 6 20.2l1.5-6.7-5-4.5 6.6-.7z"
            fill="#F6C445"
            stroke="#14327F"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "signature":
      return (
        <svg width="96" height="80" viewBox="0 0 96 80" aria-hidden="true">
          <text
            x="2"
            y="62"
            fontFamily="Caveat,cursive"
            fontWeight="600"
            fontSize="38"
            fill="#14327F"
          >
            Maya
          </text>
          <path
            d="M6 68c20-6 44-8 62-4"
            fill="none"
            stroke="#1560E8"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <g transform="translate(62 4) rotate(30)">
            <rect
              width="9"
              height="38"
              rx="3"
              fill="#1560E8"
              stroke="#14327F"
              strokeWidth="2"
            />
            <path
              d="M0 38l4.5 10 4.5-10z"
              fill="#fff"
              stroke="#14327F"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      );
    case "people":
      return (
        <svg width="92" height="80" viewBox="0 0 92 80" aria-hidden="true">
          <circle
            cx="30"
            cy="30"
            r="17"
            fill="#FFD27A"
            stroke="#14327F"
            strokeWidth="2.5"
          />
          <circle
            cx="56"
            cy="38"
            r="17"
            fill="#B3CDF6"
            stroke="#14327F"
            strokeWidth="2.5"
          />
          <path
            d="M14 66c2-12 12-16 18-16s14 4 16 16"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M42 70c2-12 8-17 15-17s14 5 16 17"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M70 8h14M77 2v12"
            stroke="#F6C445"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "edit":
      return (
        <svg width="92" height="80" viewBox="0 0 92 80" aria-hidden="true">
          <rect
            x="18"
            y="6"
            width="56"
            height="68"
            rx="8"
            fill="#F3F7FE"
            stroke="#14327F"
            strokeWidth="2.5"
          />
          <path
            d="M28 24h30M28 34h36M28 44h20"
            stroke="#9DBAE9"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="26"
            y="52"
            width="26"
            height="12"
            rx="3"
            fill="none"
            stroke="#1560E8"
            strokeWidth="2.4"
            strokeDasharray="4 3"
          />
          <path
            d="M62 52l8-8 6 6-8 8-8 2z"
            fill="#F6C445"
            stroke="#14327F"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "ocr":
      return (
        <svg width="92" height="80" viewBox="0 0 92 80" aria-hidden="true">
          <path
            d="M10 24V12a4 4 0 0 1 4-4h12M66 8h12a4 4 0 0 1 4 4v12M82 56v12a4 4 0 0 1-4 4H66M26 72H14a4 4 0 0 1-4-4V56"
            fill="none"
            stroke="#14327F"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="28"
            y="16"
            width="36"
            height="48"
            rx="5"
            fill="#fff"
            stroke="#14327F"
            strokeWidth="2.5"
          />
          <path
            d="M35 28h22M35 36h22M35 52h14"
            stroke="#BFD0EE"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M14 44h64"
            stroke="#2BA56A"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "compress":
      return (
        <svg width="92" height="80" viewBox="0 0 92 80" aria-hidden="true">
          <rect
            x="22"
            y="14"
            width="48"
            height="52"
            rx="7"
            fill="#F3F7FE"
            stroke="#14327F"
            strokeWidth="2.5"
          />
          <path
            d="M46 30v14m0 0-6-6m6 6 6-6M36 56h20"
            fill="none"
            stroke="#1560E8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 40h8M76 40h8"
            stroke="#F6C445"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "recent":
      return (
        <svg width="40" height="50" viewBox="0 0 40 50" aria-hidden="true">
          <path
            d="M3 4a3 3 0 0 1 3-3h20l11 11v34a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"
            fill="#F3F7FE"
            stroke="#9DBAE9"
            strokeWidth="1.8"
          />
          <path
            d="M26 1v11h11"
            fill="#D4E2FA"
            stroke="#9DBAE9"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9 22h20M9 28h22M9 34h14"
            stroke="#BFD0EE"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M12 43l10-1"
            stroke="#1560E8"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
