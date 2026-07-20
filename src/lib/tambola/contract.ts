import type { AbiEntry, CdmJson, Contract, ContractDef } from "@use-truapi/react";
import { truapi } from "@/lib/truapi";
import { TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI } from "./abi";

export const TAMBOLA_LIBRARY = "@tambola/tambola";

// Manifest synthesized from env + the ABI mirror — no `cdm deploy` artifact is
// checked in, and the address must stay overridable per deploy via .env.local.
export const TAMBOLA_CDM: CdmJson = {
  name: "tambola",
  dependencies: {},
  contracts: {
    [TAMBOLA_LIBRARY]: {
      version: 1,
      address: TAMBOLA_ADDRESS,
      abi: TAMBOLA_ABI as unknown as AbiEntry[],
    },
  },
} as CdmJson;

export type TambolaContract = Contract<ContractDef>;

export const getTambolaContract = (): Promise<TambolaContract> =>
  truapi.contracts.getContract(TAMBOLA_CDM, TAMBOLA_LIBRARY);
