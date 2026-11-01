import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/tailwind.css";
import "./styles/design-system.css";
import "./styles.css";
import { initializeTheme } from "./app/theme.svelte.js";

initializeTheme();
const target = document.getElementById("root");
if (!target) throw new Error("Application mount point is missing");
mount(App, { target });
