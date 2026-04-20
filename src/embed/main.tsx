import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { EmbedCard, EmbedFallback } from "./EmbedCard";
import { decodeStateForEmbed } from "@/lib/state";
import type { CardData } from "@/lib/types";

/**
 * Read the encoded card from `?s=` on the embed URL. Returns null when the
 * parameter is missing or malformed; the caller renders an empty-state.
 */
function loadCardFromUrl(): CardData | null {
  const params = new URLSearchParams(window.location.search);
  const s = params.get("s");
  return s ? decodeStateForEmbed(s) : null;
}

const card = loadCardFromUrl();

const container = document.getElementById("embed-root");
if (container) {
  createRoot(container).render(
    <StrictMode>{card ? <EmbedCard card={card} /> : <EmbedFallback />}</StrictMode>,
  );
}
