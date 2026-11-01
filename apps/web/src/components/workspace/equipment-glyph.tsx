import type { EquipmentDefinition } from "@vectrix/core";

/**
 * Generic electrical symbols.
 *
 * These are VECTRIX-authored schematic marks for the generic catalogue. They
 * are deliberately not manufacturer symbols or official standard sheets. The
 * same mark is used in the plan, the library and the printed legend so a symbol
 * never changes meaning between views.
 */
export function EquipmentGlyph({
  symbol,
  size,
  tone = "var(--sheet-wall)",
  muted = false,
}: {
  symbol: EquipmentDefinition["symbol"];
  /** Outer size in plan millimetres. */
  size: number;
  tone?: string;
  muted?: boolean;
}) {
  const scale = size / 32;
  return (
    <g
      transform={`scale(${scale}) translate(-16 -16)`}
      fill="var(--sheet)"
      stroke={tone}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={muted ? 0.35 : 1}
    >
      {symbol === "socket" && (
        <>
          <rect x={5} y={5} width={22} height={22} rx={3} />
          <circle cx={12.5} cy={13.5} r={1.6} fill={tone} stroke="none" />
          <circle cx={19.5} cy={13.5} r={1.6} fill={tone} stroke="none" />
          <path d="M12.5 21h7" />
          <path d="M16 18.5v5" />
        </>
      )}
      {symbol === "socket-ip44" && (
        <>
          <rect x={5} y={5} width={22} height={22} rx={3} />
          <circle cx={12.5} cy={13.5} r={1.6} fill={tone} stroke="none" />
          <circle cx={19.5} cy={13.5} r={1.6} fill={tone} stroke="none" />
          <path d="M12.5 21h7" />
          <path d="M16 18.5v5" />
          <path d="M8 27c2.2-1 4.4-1 6.6 0" opacity={0.75} />
        </>
      )}
      {symbol === "socket-double" && (
        <>
          <rect x={2} y={6} width={28} height={20} rx={3} />
          <circle cx={10} cy={14} r={1.4} fill={tone} stroke="none" />
          <circle cx={15} cy={14} r={1.4} fill={tone} stroke="none" />
          <circle cx={22} cy={14} r={1.4} fill={tone} stroke="none" />
          <path d="M9.5 20h6M22.5 20h3.5" />
          <path d="M16 6v20" opacity={0.55} />
        </>
      )}
      {symbol === "switch" && (
        <>
          <circle cx={16} cy={16} r={8.5} />
          <path d="M16 16 24 7" />
          <circle cx={16} cy={16} r={1.6} fill={tone} stroke="none" />
        </>
      )}
      {symbol === "switch-2g" && (
        <>
          <circle cx={10.5} cy={16} r={6.5} />
          <path d="M10.5 16 15 9.5" />
          <circle cx={22} cy={16} r={6.5} />
          <path d="M22 16 26.5 9.5" />
        </>
      )}
      {symbol === "light" && (
        <>
          <circle cx={16} cy={16} r={8.5} />
          <path d="M10 10l12 12M22 10 10 22" />
        </>
      )}
      {symbol === "junction" && (
        <>
          <circle cx={16} cy={16} r={7} />
          <path d="M16 3v6M16 23v6M3 16h6M23 16h6" />
          <circle cx={16} cy={16} r={1.4} fill={tone} stroke="none" />
        </>
      )}
      {symbol === "board" && (
        <>
          <rect x={3} y={7} width={26} height={20} rx={2} />
          <path d="M7 12h18M7 17h18M7 22h18" />
          <path d="M9 7v20" opacity={0.5} />
          <circle cx={23.5} cy={21.5} r={1.2} fill={tone} stroke="none" />
        </>
      )}
      {symbol === "mcb" && (
        <>
          <rect x={9} y={4} width={14} height={24} rx={2} />
          <path d="M12 10h8M12 22h8" />
          <path d="M13 13h6l-1.5 6h-3z" />
        </>
      )}
      {symbol === "rcd" && (
        <>
          <rect x={5} y={5} width={22} height={22} rx={2} />
          <path d="M10 10h12M10 22h12" />
          <circle cx={16} cy={16} r={4.6} />
          <path d="M13 16h6" />
        </>
      )}
      {symbol === "data" && (
        <>
          <rect x={5} y={8} width={22} height={17} rx={2} />
          <path d="M10 8V5h8v3" />
          <path d="M9.5 14h4v4h-4zM18.5 14h4v4h-4z" />
          <path d="M10 23h4M18 23h4" opacity={0.6} />
        </>
      )}
      {symbol === "sensor" && (
        <>
          <path d="M6 22a10 10 0 0 1 20 0z" />
          <path d="M16 12v-5" />
          <path d="M11 20c0-2.8 2.2-5 5-5s5 2.2 5 5" opacity={0.6} />
        </>
      )}
      {symbol === "water-heater" && (
        <>
          <rect x={8} y={4} width={16} height={24} rx={7} />
          <path d="M8 10h16M8 22h16" />
          <circle cx={16} cy={16} r={3} />
        </>
      )}
      {symbol === "cooker" && (
        <>
          <rect x={4} y={7} width={24} height={19} rx={2} />
          <circle cx={11} cy={13} r={2.6} />
          <circle cx={21} cy={13} r={2.6} />
          <circle cx={11} cy={21} r={2.6} />
          <circle cx={21} cy={21} r={2.6} />
        </>
      )}
      {symbol === "hvac" && (
        <>
          <rect x={2} y={9} width={28} height={13} rx={2} />
          <path d="M7 15.5h5M22 12.5c2 1.5 2 4.5 0 6" />
          <path d="M6 22v4M26 22v4" />
        </>
      )}
      {symbol === "ev" && (
        <>
          <rect x={8} y={3} width={16} height={21} rx={3} />
          <circle cx={13} cy={11} r={1.3} fill={tone} stroke="none" />
          <circle cx={19} cy={11} r={1.3} fill={tone} stroke="none" />
          <path d="M12 17h8" />
          <path d="M16 24v5" />
        </>
      )}
      {symbol === "camera" && (
        <>
          <path d="M5 23h22" />
          <path d="M8 23a8 8 0 0 1 16 0" />
          <circle cx={16} cy={17} r={4.2} />
          <circle cx={16} cy={17} r={1.5} fill={tone} stroke="none" />
          <path d="M16 9V5" />
        </>
      )}
      {![
        "socket",
        "socket-ip44",
        "socket-double",
        "switch",
        "switch-2g",
        "light",
        "junction",
        "board",
        "mcb",
        "rcd",
        "data",
        "sensor",
        "water-heater",
        "cooker",
        "hvac",
        "ev",
        "camera",
      ].includes(symbol) && (
        <>
          <rect x={7} y={7} width={18} height={18} rx={2} />
          <path d="M12 16h8" />
        </>
      )}
    </g>
  );
}

/** 30 px library preview. */
export function GlyphPreview({ symbol, tone }: { symbol: EquipmentDefinition["symbol"]; tone?: string }) {
  return (
    <svg width={22} height={22} viewBox="0 0 32 32" aria-hidden="true" style={{ color: tone ?? "var(--ink-secondary)" }}>
      <EquipmentGlyph symbol={symbol} size={32} tone={tone ?? "currentColor"} />
    </svg>
  );
}
