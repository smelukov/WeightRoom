import type { IconType } from "react-icons";
import { SiGoogle, SiMeta, SiMistralai, SiAlibabadotcom } from "react-icons/si";
import type { ModelBrand } from "@/lib/types";

interface BrandIconProps {
  brand: ModelBrand;
  /** Size in pixels (default 14). */
  size?: number;
}

// Brand color palette mirrored from simple-icons (https://simpleicons.org).
// These hex values change very rarely (only on a corporate rebrand);
// keeping them inline lets us drop the entire `simple-icons` dependency
// and source every glyph from `react-icons/si` instead.
const BRAND_COLORS: Partial<Record<ModelBrand, string>> = {
  Google: "#4285F4",
  Meta: "#0467DF",
  Mistral: "#FA520F",
  Alibaba: "#FF6A00",
};

const BRAND_ICONS: Partial<Record<ModelBrand, IconType>> = {
  Google: SiGoogle,
  Meta: SiMeta,
  Mistral: SiMistralai,
  Alibaba: SiAlibabadotcom,
};

// Microsoft Windows 4-square logo. Excluded from simple-icons due to
// trademark restrictions, so we ship a tiny inline replica.
function MicrosoftIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Microsoft">
      <rect x="0"  y="0"  width="11" height="11" fill="#F25022" rx="1" />
      <rect x="13" y="0"  width="11" height="11" fill="#7FBA00" rx="1" />
      <rect x="0"  y="13" width="11" height="11" fill="#00A4EF" rx="1" />
      <rect x="13" y="13" width="11" height="11" fill="#FFB900" rx="1" />
    </svg>
  );
}

// DeepSeek custom glyph. Also excluded from simple-icons (trademark);
// rendered as a coloured rounded square with a "D" so the brand row
// still has a visual cue alongside the others.
function DeepSeekIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-label="DeepSeek">
      <rect width="14" height="14" rx="3" fill="#4D6BFE" />
      <text
        x="7"
        y="10.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="white"
        fontFamily="sans-serif"
      >
        D
      </text>
    </svg>
  );
}

export function BrandIcon({ brand, size = 14 }: BrandIconProps) {
  if (brand === "Microsoft") return <MicrosoftIcon size={size} />;
  if (brand === "DeepSeek") return <DeepSeekIcon size={size} />;

  const Icon = BRAND_ICONS[brand];
  if (!Icon) return null;

  // Brand color is optional — fall back to currentColor (icon inherits text color)
  // when a brand is not registered in BRAND_COLORS.
  const color = BRAND_COLORS[brand];
  const colorProp = color !== undefined ? { color } : {};
  return <Icon width={size} height={size} {...colorProp} aria-label={brand} role="img" />;
}
