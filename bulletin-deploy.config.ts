/**
 * bulletin-deploy / playground-cli config.
 *
 * Two executables get bundled:
 *   - app    : the static Vite SPA build at `./out`
 *   - worker : the Vite-built worker script at `./out/worker` (chat + draw poker)
 *
 * `playground deploy --signer dev --env paseo-next-v2` reads this file and
 * uploads everything to the Bulletin Chain + registers the DotNS domain.
 */
export default {
  domain:      process.env.MANIFEST_DOMAIN ?? "tambola-game.dot",
  displayName: "Tambola",
  icon: { path: "./public/icon.png", format: "png" as const },
  executables: [
    {
      kind: "app" as const,
      path: "./out",
      appVersion: [0, 1, 0] as [number, number, number],
    },
    {
      kind: "worker" as const,
      path: "./out/worker",
      appVersion: [0, 1, 0] as [number, number, number],
      entrypoint: "index.js",
      includes: { chat: true, pocket: false },
    },
  ],
};
