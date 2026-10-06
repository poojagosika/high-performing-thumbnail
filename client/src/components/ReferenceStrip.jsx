import { Loader2 } from "lucide-react";

const STYLE_NAMES = {
  colour: "Coloured word",
  box: "Boxed word",
  ring: "Circled word",
  gradient: "Gradient word",
};

const Swatch = ({ colour, title }) => (
  <span
    title={title || colour}
    className="inline-block w-3 h-3 rounded-sm border border-white/20 shrink-0"
    style={{ background: colour }}
  />
);

const highlightValue = (h) => (
  <span className="flex items-center gap-1.5 min-w-0">
    {h.colours ? (
      <span
        className="inline-block w-3 h-3 rounded-sm border border-white/20 shrink-0"
        style={{ background: `linear-gradient(${h.colours.join(", ")})` }}
      />
    ) : (
      h.colour && <Swatch colour={h.colour} />
    )}
    <span className="truncate">{STYLE_NAMES[h.style] || h.style}</span>
    {h.line && <span className="text-[#61616b] shrink-0">· {h.line} line</span>}
  </span>
);

function Item({ label, children, item, off, busy, onToggle }) {
  const on = !off.includes(item);
  const switchable = Boolean(item);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-opacity ${
        on ? "border-white/8 bg-white/3" : "border-white/4 bg-transparent opacity-50"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[10px] text-[#61616b]">{label}</p>
        <div className="text-[12px] text-white mt-0.5">{children}</div>
      </div>
      {switchable && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${on ? "Stop copying" : "Copy"} ${label.toLowerCase()}`}
          disabled={Boolean(busy)}
          onClick={() => onToggle(item, !on)}
          className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors disabled:cursor-wait ${
            on ? "bg-emerald-500/80" : "bg-white/12"
          }`}
        >
          {busy === item ? (
            <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />
          ) : (
            <span
              className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all ${on ? "left-[17px]" : "left-[3px]"}`}
            />
          )}
        </button>
      )}
    </div>
  );
}

export default function ReferenceStrip({ reading, off = [], busy, onToggle }) {
  if (!reading) return null;

  const { template, font, ink, emphasis, also } = reading;
  const found = [font, ink, emphasis, also].some(Boolean);

  return (
    <div className="mt-4">
      <p className="text-[11px] text-[#61616b] mb-1.5">Copied from reference</p>
      {!found && !template ? (
        <p className="text-[11px] text-[#61616b]">Nothing distinctive was read from this reference.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {template && (
            <Item label="Layout" off={off}>
              <span className="truncate block">{template.name}</span>
            </Item>
          )}
          {font && (
            <Item label="Font" item="font" off={off} busy={busy} onToggle={onToggle}>
              {font.label}
              {font.family && <span className="text-[#61616b]"> style</span>}
            </Item>
          )}
          {ink && (
            <Item label="Text colour" item="ink" off={off} busy={busy} onToggle={onToggle}>
              <span className="flex items-center gap-1.5">
                <Swatch colour={ink.colour} title="Text" />
                {ink.outline ? (
                  <>
                    <span className="text-[#61616b]">outline</span>
                    <Swatch colour={ink.outline} title="Outline" />
                  </>
                ) : (
                  <span className="text-[#61616b]">no outline</span>
                )}
              </span>
            </Item>
          )}
          {emphasis && (
            <Item label="Highlight" item="emphasis" off={off} busy={busy} onToggle={onToggle}>
              {highlightValue(emphasis)}
            </Item>
          )}
          {also && (
            <Item label="Second highlight" item="also" off={off} busy={busy} onToggle={onToggle}>
              {highlightValue(also)}
            </Item>
          )}
        </div>
      )}
    </div>
  );
}
