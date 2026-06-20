function HeroBackground() {
  return (
    <div className="absolute inset-0" style={{ zIndex: 0 }}>
      {/* Base with subtle blue undertone — NOT pure black */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(120, 119, 198, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(78, 78, 160, 0.08) 0%, transparent 40%),
            #0a0a0f
          `,
        }}
      />

      {/* Dot grid with mask — like Dub.co / Linear */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse 50% 35% at 50% 25%, rgba(0,0,0,0.6) 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 50% 35% at 50% 25%, rgba(0,0,0,0.6) 0%, transparent 70%)",
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
        style={{ background: "linear-gradient(to top, #0a0a0f, transparent)" }}
      />
    </div>
  );
}

export default HeroBackground;
