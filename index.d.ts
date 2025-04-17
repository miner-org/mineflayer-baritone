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
         * Blocks to not get near
         */
        blocksToStayAway: string[];

        /**
         * Radius to avoid blocks in `blocksToStayAway`
         */
        avoidDistance: number;

        placeBlocks: boolean;
        breakBlocks: boolean;
        parkour: boolean;
        proParkour: boolean;

        /**
         * Try to break blocks above target if needed
         */
        checkBreakUpNodes: boolean;

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
         * Blocks the bot can interact with
         */
        interactableBlocks: string[];

        /**
         * The time the bot uses to think of a path
         */
        thinkTimeout: number;
      };

      debug: boolean;
      stopped: boolean;
      path: Cell[]; // Add type or import as needed

      goto(goal: Goal, excludedPositions?: Vec3[]): Promise<void>;

      stop(): void;

      follow(
        entity: Entity,
        options?: { minDistance?: number; maxDistance?: number }
      ): Promise<void>;

      generatePath(position: Vec3): { path: Cell[]; cost: number };
    };
  }
}
