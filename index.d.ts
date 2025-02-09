import { Goal } from "./src/goal";
import { Vec3 } from "vec3";
import { Cell } from "./src/pathfinder";

declare module "mineflayer" {
  interface Bot {
    ashfinder: {
      config: {
        /**
         * Blocks to avoid breaking
         */
        blocksToAvoid: string[];

        /**
         * Blocks to not get near of
         */
        blocksToStayAway: string[];
        placeBlocks: boolean;
        breakBlocks: boolean;
        parkour: boolean;
        proParkour: boolean;
        fly: boolean;
        /**
         * How many blocks the bot can go down
         */
        maxFallDist: number;
        /**
         * How far the bot can jump down into a water source
         */
        maxWaterDist: number;
        /**
         * Blocks that can be used for placing
         */
        disposableBlocks: string[];
        /**
         * Block the bot can interact with
         */
        interactableBlocks: string[];
        /**
         * The time the bot uses to think of a path
         */
        thinkTimeout: number;
      };
      debug: boolean;
      stopped: boolean;

      goto: (goal: Goal, excludedPositions: Vec3[]) => Promise<void>;

      stop: () => void;

      generatePath: (position: Vec3) => { path: Cell[]; cost: number };
    };
  }
}
