type MetaChipTone = "default" | "success" | "warning";

export type MetaChip = {
  label: string;
  tone?: MetaChipTone;
};

type MetaChipsRowProps = {
  chips: MetaChip[];
};

const CHIP_TONE_CLASS_MAP: Record<MetaChipTone, string> = {
  default: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

export default function MetaChipsRow({ chips }: MetaChipsRowProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const tone = chip.tone ?? "default";

        return (
          <span
            key={chip.label}
            className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${CHIP_TONE_CLASS_MAP[tone]}`}
          >
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}
