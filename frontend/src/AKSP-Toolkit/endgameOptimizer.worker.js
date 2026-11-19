import { ENDGAME_LINEUP_SIZES, findBestLineups } from "./endgameOptimizer.js";

self.onmessage = ({ data }) => {
  for (const size of ENDGAME_LINEUP_SIZES) {
    self.postMessage({ size, result: findBestLineups(data, size, 1)[0] ?? null });
  }
};
