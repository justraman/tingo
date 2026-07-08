/**
 * bulletin-deploy / playground-cli config.
 *
 * One executable gets bundled: the static Vite SPA build at `./out`.
 * Draw poking, chat announcements, and indexing run in the Cloudflare worker
 * (`cloudflare/`), deployed separately via `bun run cf:deploy`.
 *
 * `playground deploy --signer dev` reads this file and uploads everything to
 * the Bulletin Chain + registers the DotNS domain.
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
  ],
};
