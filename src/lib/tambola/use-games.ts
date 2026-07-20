import { useQuery } from "@tanstack/react-query";
import { useContract, useContractQuery } from "@use-truapi/react";
import { READ_ONLY_ORIGIN } from "@/lib/chain/constants";
import { TAMBOLA_CDM, TAMBOLA_LIBRARY, type TambolaContract } from "./contract";
import { gameFromChain, queryTambola } from "./read";
import { effectiveState } from "./state";
import type { GameView } from "./abi";

export interface GameListing {
  id: bigint;
  game: GameView;
  state: number;
}

export interface GamesResult {
  data: GameListing[] | undefined;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

const NO_HOST = "0x0000000000000000000000000000000000000000";

// The lobby only shows the latest games — each one is a separate dry-run, so
// an unbounded loop would grow with contract history forever.
const HOME_LISTING_LIMIT = 100;

async function fetchListings(contract: TambolaContract, nextGameId: bigint): Promise<GameListing[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const out: GameListing[] = [];
  // nextGameId is the last allocated id (1-based), so newest-first is a walk
  // down from it until the page is full.
  for (let id = nextGameId; id >= 1n && out.length < HOME_LISTING_LIMIT; id--) {
    const game = gameFromChain(await queryTambola<GameView>(contract, "getGame", [id]));
    if (game.host !== NO_HOST) {
      out.push({ id, game, state: effectiveState(game, nowSec) });
    }
  }
  return out;
}

/**
 * Every game on the contract, newest first: `useContract` resolves the
 * handle, `useContractQuery` reads `nextGameId`, and a dependent query pages
 * through `getGame` — so the list re-fetches whenever `nextGameId` moves.
 */
export function useGames(): GamesResult {
  const contract = useContract(TAMBOLA_CDM, TAMBOLA_LIBRARY);
  // Trailing options object routes through to the dry-run (same convention as
  // `send([...args, { value }])`) — reads must not run as an unmapped signer.
  const nextGameId = useContractQuery<bigint>(contract.data, "nextGameId", [
    { origin: READ_ONLY_ORIGIN },
  ]);

  const games = useQuery({
    queryKey: ["tambola", "games", nextGameId.data?.toString() ?? null],
    enabled: contract.data !== undefined && nextGameId.data !== undefined,
    queryFn: () => fetchListings(contract.data!, nextGameId.data!),
  });

  const error = contract.error ?? nextGameId.error ?? games.error ?? null;
  return {
    data: games.data,
    isPending: !error && games.isPending,
    error,
    refetch: () => {
      void nextGameId.refetch();
      void games.refetch();
    },
  };
}
