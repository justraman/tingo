import { paseo_asset_hub } from "@polkadot-api/descriptors";
import { createRuntime, defineConfig } from "@use-truapi/react";
import { CHAIN } from "@/lib/chain/constants";
import { CHAT_APP_NAME, CHAT_TTL_SECONDS } from "@/lib/chat/protocol";

export const truapiConfig = defineConfig({
  chains: {
    assetHub: {
      descriptor: paseo_asset_hub,
      genesisHash: CHAIN.genesis,
      wsUrls: [CHAIN.rpc],
    },
  },
  dappName: "tambola",
  productAccount: { dotNsIdentifier: "tambola-game.dot", requestName: false },
  statements: { appName: CHAT_APP_NAME, defaultTtlSeconds: CHAT_TTL_SECONDS },
  autoConnect: true,
});

declare module "@use-truapi/react" {
  interface Register {
    config: typeof truapiConfig;
  }
}

// Module singleton rather than provider-owned: the event feed, reaction
// transport and vibe store run outside React and need the same controllers
// the hooks use (and StrictMode must not tear the signer manager down).
export const truapi = createRuntime(truapiConfig);
