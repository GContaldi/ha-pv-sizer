import "../src/pv-sizer-panel";
import type { HomeAssistant } from "../src/api/client";
import { DemoBackend } from "./demo-backend";

const backend = new DemoBackend();
const root = document.documentElement;
root.dataset.theme = localStorage.getItem("pv-sizer-dev-theme") ?? "dark";

const fakeHass = (): HomeAssistant => ({
  locale: { language: "it" },
  language: "it",
  themes: { darkMode: root.dataset.theme === "dark" },
  callWS: async <T,>(msg: { type: string; [key: string]: unknown }) => {
    await new Promise((r) => setTimeout(r, 120));
    return structuredClone(backend.handle(msg)) as T;
  },
});

const panel = document.createElement("pv-sizer-panel") as HTMLElement & { hass?: HomeAssistant; narrow?: boolean };
panel.hass = fakeHass();
panel.narrow = false;
document.body.appendChild(panel);

document.getElementById("theme")!.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("pv-sizer-dev-theme", root.dataset.theme);
  panel.hass = fakeHass();
});
document.getElementById("narrow")!.addEventListener("click", () => {
  panel.narrow = !panel.narrow;
  panel.style.maxWidth = panel.narrow ? "420px" : "";
  panel.style.display = "block";
});
document.getElementById("reset")!.addEventListener("click", () => {
  backend.reset();
  location.reload();
});
