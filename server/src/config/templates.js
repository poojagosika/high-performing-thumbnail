const CANVAS_W = 1280;
const CANVAS_H = 720;

const TEMPLATES = [
  {
    id: "two-subject",
    name: "Two subjects over a scene",
    description: "A background scene with a cut-out subject on each side and a headline across the top.",
    slots: [
      {
        key: "background",
        label: "Background scene",
        type: "image",
        cutout: false,
        treat: "background",
        z: 0,
        rect: { x: 0, y: 0, w: 1, h: 1 },
      },
      {
        key: "subjectLeft",
        label: "Left subject",
        type: "image",
        cutout: true,
        anchor: "left",
        z: 1,
        rect: { x: 0, y: 0.06, w: 0.44, h: 0.94 },
      },
      {
        key: "subjectRight",
        label: "Right subject (your host)",
        type: "image",
        cutout: true,
        anchor: "right",
        z: 2,
        rect: { x: 0.56, y: 0.04, w: 0.44, h: 0.96 },
      },
      {
        key: "headline",
        label: "Headline",
        type: "text",
        style: "headline",
        z: 3,
        rect: { x: 0.26, y: 0.2, w: 0.5, h: 0.44 },
        defaults: { text: "", font: "poppins", color: "#FFFFFF", accentColor: "#FF2A1A", strokeColor: "#000000", depthColor: "#1A0605", rotate: -4, depth: 10, scale: 0.36 },
      },
    ],
  },
  {
    id: "split-screen",
    name: "Split screen, before and after",
    description: "Two panels side by side under a banner headline.",
    slots: [
      {
        key: "banner",
        label: "Banner headline",
        type: "text",
        z: 3,
        rect: { x: 0.02, y: 0.02, w: 0.96, h: 0.22 },
        defaults: { text: "", font: "archivo", color: "#FFFFFF", strokeColor: "#000000", scale: 0.1 },
      },
      {
        key: "before",
        label: "Before",
        type: "image",
        cutout: false,
        z: 0,
        rect: { x: 0, y: 0.26, w: 0.495, h: 0.74 },
      },
      {
        key: "after",
        label: "After",
        type: "image",
        cutout: false,
        z: 0,
        rect: { x: 0.505, y: 0.26, w: 0.495, h: 0.74 },
      },
    ],
  },
  {
    id: "side-panel",
    name: "Full bleed with stacked headline",
    description: "One strong image with a headline block stacked over the right side.",
    slots: [
      {
        key: "background",
        label: "Main image",
        type: "image",
        cutout: false,
        z: 0,
        rect: { x: 0, y: 0, w: 1, h: 1 },
      },
      {
        key: "headline",
        label: "Headline",
        type: "text",
        z: 2,
        rect: { x: 0.34, y: 0.58, w: 0.62, h: 0.36 },
        defaults: { text: "", font: "bebas", color: "#FFFFFF", strokeColor: "#000000", scale: 0.14 },
      },
    ],
  },
];

const byId = (id) => TEMPLATES.find((t) => t.id === id) || null;

const DEFAULT_TEMPLATE = TEMPLATES[0].id;

const imageSlots = (template) => template.slots.filter((s) => s.type === "image");
const textSlots = (template) => template.slots.filter((s) => s.type === "text");

const pixelRect = (rect) => ({
  left: Math.round(rect.x * CANVAS_W),
  top: Math.round(rect.y * CANVAS_H),
  width: Math.max(1, Math.round(rect.w * CANVAS_W)),
  height: Math.max(1, Math.round(rect.h * CANVAS_H)),
});

const summarize = (template) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  slots: template.slots.map((s) => ({
    key: s.key,
    label: s.label,
    type: s.type,
    cutout: Boolean(s.cutout),
    anchor: s.anchor || "center",
    defaults: s.defaults || null,
  })),
});

module.exports = {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  CANVAS_W,
  CANVAS_H,
  byId,
  imageSlots,
  textSlots,
  pixelRect,
  summarize,
};
